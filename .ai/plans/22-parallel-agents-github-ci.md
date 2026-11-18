# План: параллельные AI-агенты, Git worktree и выполнение тестов/пересборки в GitHub CI

Дата: 2026-11-19. Статус: **реализация в процессе (R1–R4 MVP внедрены, R5 валидация выполняется в GitHub CI)**.  
Основание: запрос на механизм ускорения разработки через параллельных агентов с проверками только в облачном CI, самовосстановлением по результатам CI и постепенным слиянием веток.  
Связанный контекст: `AGENTS.md`, `docs/architecture-testing.md`, `.github/workflows/ci.yml`, `tools/ci-browser.mjs`, `tools/citygen-seed-series.mjs`, `tools/build-level.mjs`, `tools/check-levels.mjs`, `tools/citygen-etalon-check.mjs`, `.ai/plans/21-citygen-procedural-rules.md`, `.ai/state/`.

> Примечание по терминологии: в исходном запросе упомянут «gitlab ci», но целевая платформа и текущая инфраструктура репозитория — **GitHub Actions** (`.github/workflows/ci.yml`, `gh` CLI). План ориентирован на GitHub CI; адаптация под GitLab потребует отдельного решения.

## 0. Цель и границы

### 0.1 Цели
- [ ] **P0-1** Обеспечить параллельную разработку несколькими агентами в изолированных git worktree/ветках без взаимных блокировок и без прямых изменений в `main`.
- [ ] **P0-2** Перенести верификацию (тесты) и, где это технически оправдано, пересборку/проверку детерминизма производных артефактов в GitHub CI вместо локального запуска.
- [ ] **P0-3** Реализовать замкнутый цикл обратной связи: `commit → push → ожидание CI → получение результата в локальный файл → анализ/исправление → повтор` до успеха (с ограничением попыток/эскалацией).
- [ ] **P0-4** Сохранить и использовать текущую параллелизацию CI (матрицы/шарды) и учитывать лимиты GitHub (free tier: до ~20 одновременных runner’ов на аккаунт/орг, минутные и concurrency-лимиты зависят от плана/очереди).
- [ ] **P0-5** Определить безопасный процесс постепенного слияния веток агентов в интеграционную ветку/`main` с обязательным зелёным CI.
- [ ] **P0-6** Дать воспроизводимые инструкции для AI-агентов (протокол работы, промпт/шаблон задания, правила декомпозиции задач и планирования с учётом CI-only схемы).

### 0.2 Не входит (без отдельного согласования)
- Полный запрет локальных действий, необходимых для редактирования кода (форматирование/быстрые синтаксические проверки интерпретатором допустимы как вспомогательные, но **не заменяют** обязательные гейты CI); см. D-3.
- Замена/удаление существующих тяжёлых CI-джоб (seed-series, browser matrix, rebuild-check) — только добавление режимов/профилей и оркестрации.
- Автоматический merge без прохождения required checks / без review-политики владельца.
- Изменение игровых контрактов, форматов уровней или архитектуры движка (кроме явно необходимых CI/tooling/док-правок в рамках этого плана).
- Новые npm-зависимости/сборщики; `package.json` проекта не создаётся. Dev-зависимости для CI (Playwright в контейнере) — по текущей схеме.

### 0.3 Неподвижные ограничения (учесть в реализации)
- Репозиторий: ES-модули без сборщика, Three.js 0.160 importmap; браузерные тесты — `tests/*.test.js` через `tools/ci-browser.mjs` в Playwright-контейнере.
- Текущий CI (`.github/workflows/ci.yml`): `push`/`pull_request`/`workflow_dispatch`, параллельные джобы `node-fast`, `node-citygen`, `node-etalon`, `build-rebuild` (4), `browser` (5), `seed-series` (6, plain+transport×3), `aggregate`. Полный прогон тяжёлый по времени/ресурсам — не подходит как единственный сигнал для частых итераций self-healing.
- Детерминизм артефактов уровней: `node tools/build-level.mjs`/`--check` и `node tools/check-levels.mjs` — обязательные гейты при изменениях брифов/генератора/схем.
- `gh` CLI доступен в среде агентов; для операций с GitHub требуется аутентификация (`gh auth status`) и права `contents:write`/`actions:read` на push веток (push из worktree — обычный `git push`).

## 1. Текущее состояние (база)

- **CI:** единый workflow `ci.yml` со смешанным профилем (быстрые node-проверки + тяжёлые browser/seed-series). Артефакты: JSON/логи браузера (`--json-report`), тайминги build/series/citygen, aggregate summary. Есть ручные флаги `--flake`, `--fast`, `--suites`, `--level` у `tools/ci-browser.mjs`.
- **Локальные/CLI инструменты:** `node tools/check-levels.mjs`, `node tools/build-level.mjs [--check] <file>`, `node --test tools/*.test.mjs`, `node tools/citygen-etalon-check.mjs`, `node tools/citygen-seed-series.mjs ...`, `node tools/ci-browser.mjs ...` (требует Playwright/браузер; в CI — контейнер).
- **Автоматизации агентов для CI-loop:** отсутствуют (`scripts/` нет, нет `.ci_result*`, нет протокола worktree/env-check в `AGENTS.md`).
- **Ветки/изоляция:** работа идёт в `main` (по истории), worktree-процесс не формализован.
- **Ограничение параллелизма:** теоретически до 20 runner’ов одновременно (free tier), фактически ограничено матрицей workflow, количеством активных веток/PR и очередью; один полный push может занять значительную долю бюджета.

## 2. Целевая архитектура

### 2.1 Принципы
- **D-1 CI — источник истины.** Статус «проверено» фиксируется только по успешному GitHub Actions run для конкретного `HEAD` SHA ветки. Локально агент не объявляет тесты пройденными.
- **D-2 Изоляция по worktree/ветке.** Один агент/задача = один worktree + одна ветка (`agent/<id>-<slug>` или `feat/<id>-<slug>`). Общий `.git` общий, рабочие деревья раздельные; параллельные правки разных областей допустимы, пересечения координируются через план/lock-файлы задач.
- **D-3 Уровни верификации (чтобы цикл был быстрым и экономным).**
  - **L0 (локально, допустимо):** чтение/редактирование, `git status/diff`, генерация плана/отчёта; опционально быстрые синтаксические проверки (`node --check <file>`) только как подсказка — не гейт.
  - **L1 (CI fast, по умолчанию для self-healing):** `node-fast` + целевые unit/build-check по затронутым файлам/главам (без полного browser/seed-series), запускается на каждый push агентской ветки.
  - **L2 (CI scoped):** выбранные browser-шарды/сьюты (`--suites`, `--level`) и/или выбранные rebuild/etalon/citygen проверки по scope.
  - **L3 (CI full / pre-merge):** полный текущий набор (как сейчас) для PR в `main`/интеграционную ветку или по явному dispatch.
  - **Rebuild (пересборка производных):** при изменениях брифов/схем/генератора агент детерминированно генерирует/обновляет производные артефакты (например, `node tools/build-level.mjs <level>`, `node tools/export-schema.mjs`) и включает их в коммит; **обязательная верификация** — в GitHub CI (`node tools/build-level.mjs --check ...`, `node tools/check-levels.mjs`, `--check` схем и т.п.). CI не должен принимать несобранные/рассинхронизированные производные. Где возможно, проверки пересборки выносятся в отдельные CI jobs/shards.
- **D-4 Машиночитаемая обратная связь.** Каждый цикл записывает структурированный результат в файл в worktree (не коммитится), достаточный для решения агента: статус, SHA, run id/url, список упавших job/step/тестов, выдержки логов, пути скачанных артефактов.
- **D-5 Ограничение попыток и эскалация.** Self-healing цикл конечен (рекомендуемо 3–5 итераций на одну гипотезу/класс ошибки), затем фиксация блокера в `.ai/state/`/issue и запрос владельцу.
- **D-6 Постепенная интеграция.** Ветки агентов вливаются маленькими PR через интеграционный слой (trunk/integration branch или короткоживущие feature PR), `main` защищён required checks.

### 2.2 Компоненты (целевое состояние)

| Компонент | Назначение | Артефакты (предложение) |
| --- | --- | --- |
| Протокол агентов | Роли, запреты, цикл, лимиты | `AGENTS.md` (или выделенный include/skill), `.ai/prompts/agent-ci-protocol.md` |
| Проверка окружения/изоляции | Блокировка работы в root `main` без worktree, проверка `gh`/git/remote | `scripts/agent/check-env.mjs` (или `.ps1/.py`) |
| Пуск и ожидание CI | push, resolve run id, watch, сбор логов/артефактов, запись результата | `scripts/agent/ci-watch.mjs` |
| Локальные файлы результата | Вход для анализа агентом | `.ai/state/ci-results/<branch>.json`, `.ai/state/ci-results/<branch>.md`, `.ai/state/ci-results/<branch>.log` (gitignored) |
| CI профили | fast/scoped/full, триггеры по веткам/dispatch | `.github/workflows/ci.yml` (inputs/conditions) и/или `.github/workflows/ci-agent.yml` |
| Планирование/трекер | Декомпозиция под параллельные ветки и CI-петли | `.ai/plans/*.md`, `.ai/state/task_tracker.json` или state-*.md |

### 2.3 Модель веток и worktree

- **`main`** — стабильная, защищённая ветка; прямой push агентами запрещён.
- **`integration/<wave>` (опционально)** — сборка нескольких агентских веток перед merge в `main` при высокой параллельности.
- **`agent/<task-id>-<slug>`** — рабочая ветка одного агента/задачи в отдельном worktree.
- **Расположение worktree:** вне или рядом с основным рабочим каталогом, но **не** внутри активного worktree как вложенный git checkout; имя директории отражает задачу (например, `../wt-agent-<task-id>`). После создания агент переключает контекст (`tools.opencode.session_move` при необходимости, в рамках правил сессии).
- **Жизненный цикл:** create → work/loop → PR → merge → remove worktree → delete remote branch.

### 2.4 Поток self-healing (на одну задачу)

1. **Preflight:** `check-env` (worktree, не `main`, чистая база от актуального `origin/main`/integration, `gh auth status`, наличие remote).
2. **Реализация:** правки в scope задачи; при необходимости детерминированный rebuild артефактов, подпадающих под изменение (фиксируется в коммите).
3. **Commit:** атомарный коммит с причиной (`feat:`/`fix:`/`ci:`/`docs:`); без коммита мусорных/временных файлов.
4. **Push:** `git push -u origin <branch>` → триггер CI (fast profile по умолчанию для `agent/*`).
5. **Wait:** определить run для текущего `HEAD` SHA (например, `gh run list --branch <branch> --commit <sha> --limit 1` с poll до появления) → `gh run watch <id> --exit-status`.
6. **Collect:** статус, jobs/steps, `gh run view <id> --log-failed`, при необходимости `gh run download <id> -n <artifact>` (JSON отчёты браузера/тайминги) → запись в `.ai/state/ci-results/<branch>.{json,md,log}`.
7. **Decide:**
   - `SUCCESS` → обновить план/стейт, подготовить PR/отчёт.
   - `FAILURE/CANCELLED/TIMED_OUT` → классифицировать (код/тест/флейк/инфра/таймаут/конфликт артефактов), внести исправление, вернуться к (2). Для известных CI-flake использовать существующий механизм `--flake` **только** осознанно и с фиксацией follow-up, не для скрытия регрессий.
8. **Escalate:** после N неудачных итераций или при системной проблеме — остановка, запись диагноза, запрос человеку.

## 3. CI: профили, триггеры и использование ~20 runner’ов

### 3.1 Профили выполнения
- **`fast` (agent loop):** `node-fast` всегда; дополнительно точечные проверки по diff/scope (напр. `build-level --check` только для изменённых `level-*.json`, `node --test tools/citygen.test.mjs` при изменениях `tools/citygen/**`, etalon-check при изменениях генератора/эталонов). Browser/seed-series — выключены по умолчанию.
- **`scoped`:** fast + выбранные browser suites/levels (`--suites`, `--level`) и/или выбранные rebuild-shards. Включается через `workflow_dispatch` inputs или commit/tag-маркер, согласованный в реализации.
- **`full`:** текущая матрица целиком (pre-merge/регрессия). Для `pull_request` в `main` и/или по расписанию/ручному запуску.

### 3.2 Механизмы выбора профиля (варианты, выбрать при реализации)
- **V-A:** условия в `ci.yml` по `github.ref`/`startsWith(github.head_ref,'agent/')` + inputs `mode`/`suites`/`levels`.
- **V-B:** отдельный workflow `ci-agent-fast.yml` для `agent/**` и сохранение `ci.yml` как full/PR workflow (проще reasoning, чуть больше дублирования — минимизировать reuse/composite).
- **V-C:** единый workflow + `workflow_dispatch` как основной триггер для агентов (push делает минимальный no-op/fast), где `ci-watch` умеет запускать dispatch с параметрами. Требует аккуратности с правами и привязкой run к SHA.

Рекомендация для плана: начать с **V-A** (минимальные структурные изменения, явные inputs), при росте сложности выделить **V-B**.

### 3.3 Параллелизм и лимиты
- Внутри одного run: использовать существующие matrix/shards (до ~19 job’ов в full) — эффективно утилизирует доступные runner’ы.
- Между агентами: каждый push = отдельный run; N параллельных веток × M job’ов могут превысить одновременную квоту (очередь). Управление:
  - `concurrency` group на ветку/PR (`ci-${workflow}-${ref}`) с `cancel-in-progress: true` для быстрых итераций одной ветки (уже есть в `ci.yml`, сохранить/уточнить).
  - Документировать правило: не держать >K активных self-healing циклов одновременно без необходимости; приоритизировать критический путь.
  - Предпочитать `fast` во время итераций, `full` — один раз перед merge.

## 4. Результаты CI и «специальные файлы»

### 4.1 Формат результата (предложение, machine-readable)

Путь: `.ai/state/ci-results/<sanitized-branch>.json` (и краткий `.md` для человека), логи: `.ai/state/ci-results/<sanitized-branch>-failed.log`. Директория/файлы — в `.gitignore`.

Минимальные поля JSON:
- `schemaVersion`, `generatedAt`, `branch`, `headSha`, `remote`
- `run`: `{ id, url, workflow, event, status, conclusion, attempt, createdAt, updatedAt }`
- `jobs`: `[ { id, name, conclusion, url } ]`
- `failing`: `[ { job, step, testOrSuite?, messageExcerpt, artifactRefs? } ]`
- `artifactsDownloaded`: `[ { name, path } ]`
- `nextAction`: `success | retry | escalate`
- `iteration`: `{ current, max }`, `errorClass`: `code|test|determinism|rebuild|flake|infra|timeout|unknown`

### 4.2 Источники данных
- `gh run list/view/watch` — статус, jobs, URL (корреляция run ↔ `HEAD` SHA обязательна).
- `gh run view <id> --log-failed` — логи упавших шагов (с обрезкой до разумного лимита в файле).
- `gh run download <id> -n <name>` — артефакты (по текущему `ci.yml`, имена могут расширяться профилями):
  - `browser-<group>`: JSON-отчёт/лог/тайминги браузерного шарда (напр. `ci-artifacts/browser-*-report.json`, `browser-*.log`)
  - `build-check-<group>`: тайминги/результаты `build-level --check`
  - `node-citygen-report`: JUnit/тайминги citygen
  - `series-<mode>-<profile>`: сводки/тайминги/логи/по-seed результаты
  - `ci-aggregate-report` / `ci-aggregate-summary`: агрегированная сводка
- Парсинг JSON отчётов `ci-browser` и aggregate для извлечения конкретных упавших проверок/сьют.

## 5. Скрипты и протокол (адаптация референса под репозиторий)

> Референс пользователя (`check_env.py`, `push_and_wait_ci.py`, `.ci_result.txt`) принимается как концепция; реализация должна быть согласована со стеком и политиками этого репозитория.

### 5.1 `check-env` (guardrails)
Проверки (минимум):
- внутри git-репозитория и в worktree, не в корневом checkout на `main` без явного override для maintainer-сценариев;
- текущая ветка не `main` (и не защищённая интеграционная без явного разрешения);
- `origin` настроен, `gh auth status` успешен (или явное предупреждение с остановкой перед push);
- рабочее дерево не содержит конфликтов/незавершённого rebase/merge.
Выход: ненулевой код + понятное сообщение при нарушении.

### 5.2 `ci-watch` (push + wait + collect)
Функции:
- определить ветку/SHA, выполнить `git push -u origin <branch>` (с контролем ошибок);
- дождаться появления workflow run именно для этого SHA (poll с таймаутом, фильтр по branch+commit/workflow), затем `gh run watch --exit-status`;
- собрать логи/артефакты, сформировать result-файлы (4.1);
- поддержать режимы: `--no-push` (только наблюдение), `--timeout`, `--workflow`, `--download-artifacts`, `--max-log-bytes`, `--profile/--dispatch-inputs` (при реализации scoped dispatch).
- идемпотентность: повторный запуск обновляет `latest` результат для той же ветки/SHA.

### 5.3 Расположение и язык
- Предпочтение: Node ESM (`scripts/agent/check-env.mjs`, `scripts/agent/ci-watch.mjs`) без npm-зависимостей — консистентно с репозиторием. Альтернатива: PowerShell (`.ps1`) для Windows-first окружения или Python при наличии — зафиксировать единый вариант в реализации.
- Не добавлять в runtime игры; скрипты — dev/agent tooling.

## 6. Постепенное слияние веток

- **PR-поток:** `agent/*` → (опционально `integration/*`) → `main` через Pull Request.
- **Required checks:** минимум `node-fast` + релевантные scoped/build/browser проверки для затронутой области; `full` для крупных/кросс-срезовых изменений или перед релизным merge (политика уточняется при внедрении branch protection).
- **Стратегия merge:** предпочтительно squash или rebase-merge для линейной истории; избегать merge-коммитов из `main` в длинноживущие agent-ветки без необходимости (rebase на актуальную базу перед финальным PR).
- **Конфликты:** решаются в worktree агентской ветки, затем повтор CI-loop. При пересечении по генерируемым артефактам — пересборка/`--check` в CI обязательна.
- **Чистка:** после merge — `git worktree remove`, удаление локальной/remote ветки, архивирование/удаление CI-result файлов.

## 7. Инструкции для AI-агентов (как работать по схеме)

Ниже — целевой протокол, который должен быть формализован в `AGENTS.md`/`.ai/prompts/` и выдан агенту вместе с задачей.

### 7.1 Обязательные правила агента
- Перед работой: выполнить `check-env`; убедиться, что работа идёт в выделенном worktree/ветке, не в `main`.
- Не запускать локально тяжёлые/обязательные гейты (browser-сюиты, полный `citygen.test`/seed-series, долгие прогоны) — выполнять их в GitHub CI. Локально допустимы только быстрые вспомогательные проверки (L0/D-3).
- Пересборка производных (`build-level`, схемы, каталоги уровней) — делать осознанно: результат должен быть детерминирован и подтверждён CI (`--check`/соответствующие jobs); не оставлять «забытые» несобранные артефакты.
- После каждого логического инкремента: `commit → push → ci-watch → чтение result-файла`.
- При `FAIL`: исправить причину по логам/артефактам и повторить цикл; не более N итераций без эскалации (рекомендуемо 4).
- Не пушить в `main`, не отключать проверки, не помечать реальные регрессии как flake.
- Не коммитить временные/локальные CI-result файлы и мусор (`tmp*`, `.tmp-ci-artifacts`, debug-скрипты вне задачи).

### 7.2 Шаблон промпта/задания агенту (копируемый)

```md
Контекст: работай по схеме parallel-agents + GitHub CI only (план `.ai/plans/22-parallel-agents-github-ci.md`).
1) Preflight: запусти проверку окружения/worktree (`scripts/agent/check-env.*`). Работай только в своей ветке/worktree.
2) Прочитай план задачи: `.ai/plans/<plan>.md` и стейт `.ai/state/<state>.md`; держи scope узким.
3) Реализуй инкремент, закоммить (`feat|fix|ci|docs: ...`).
4) Не запускай обязательные/тяжёлые тесты локально. Запусти CI-цикл: `scripts/agent/ci-watch.*` и дождись результата.
5) Проанализируй `.ai/state/ci-results/<branch>.json|.md|.log`:
   - SUCCESS: обнови прогресс в плане/стейте, подготовь PR.
   - FAILED: исправь по логам/артефактам и повтори с шага 3 (макс. 4 итерации), иначе задокументируй блокер и эскалируй.
6) В отчёте укажи: ветку, SHA, CI run URL, статус, что изменено, что проверено в CI.
```

### 7.3 Как ставить задачи и составлять планы под эту схему

При создании плана (`.ai/plans/XX-*.md`) автор/агент обязан явно фиксировать:
- **Scope и изоляция:** какие файлы/подсистемы затрагиваются, можно ли распараллелить на независимые ветки/worktree (и по каким границам).
- **CI-профиль проверки:** fast/scoped/full; конкретные команды/jobs/suites/levels, достаточные для приёмки (напр. `node-fast` + `build-rebuild levels-07-08-09` + `browser --suites level-contract,level-lifecycle --level 16`).
- **Артефакты пересборки:** нужно ли запускать `build-level`/export-schema и какие `--check` в CI подтверждают паритет.
- **Критерии успеха:** зелёные конкретные CI jobs/run для SHA; отсутствие недетерминизма.
- **Риски конфликтов/merge:** зависимые задачи, порядок интеграции, необходимость integration-ветки.
- **ID задач:** `[TASK-XXX-###]` с пометкой предполагаемого профиля CI и допуска к параллельному исполнению (`parallel-safe` / `serial`).

> После внедрения схемы из данного плана каждый новый план разработки должен включать секцию `### CI & Parallelization` (см. шаблон ниже), чтобы задачи были исполнимы в CI-only/self-healing цикле.

Шаблон секции для плана задачи:
```md
### CI & Parallelization
- Worktree/branch: `agent/<id>-<slug>`
- Parallel-safe with: <tasks> / blocked by: <tasks>
- CI profile: fast | scoped | full
- Required checks: <jobs/suites/levels>
- Rebuild/check: <commands or N/A>
- Merge target: integration/<wave> | main (PR)
```

## 8. Задачи реализации (roadmap)

### R1 — Спецификация и безопасность процесса
- [x] `[TASK-PAR-001]` Утвердить профили CI (fast/scoped/full), матрицу триггеров (push/PR/dispatch) и правила использования `--flake`/карантина в agent-loop. *(MVP: V-A в `ci.yml`, fast для `agent/**` push + dispatch inputs; правила задокументированы.)*
- [x] `[TASK-PAR-002]` Определить и задокументировать формат result-файлов, пути, `.gitignore`, политику хранения логов/артефактов. *( `.ai/state/ci-results/` gitignored, формат JSON/MD/failed.log реализован в `ci-watch`.)*
- [x] `[TASK-PAR-003]` Зафиксировать политику веток/merge/branch protection (required checks для `main`, naming, cleanup). *(Задокументировано в плане/протоколе/AGENTS; фактическая настройка GitHub branch protection — админ-действие в репозитории.)*

### R2 — Tooling для агентов
- [x] `[TASK-PAR-004]` Реализовать `scripts/agent/check-env` (изоляция worktree, запрет `main`, проверки `git/gh/remote`). *(`scripts/agent/check-env.mjs`)*
- [x] `[TASK-PAR-005]` Реализовать `scripts/agent/ci-watch` (push/watch/collect/download/запись JSON+MD+log, таймауты, exit codes). *(`scripts/agent/ci-watch.mjs`)*
- [x] `[TASK-PAR-006]` Добавить утилиту/док для создания worktree (`git worktree add ...`) и, при необходимости, интеграцию с `tools.opencode.session_move`. *(`scripts/agent/worktree-new.mjs` + инструкции в протоколе/плане)*

### R3 — CI-профили и масштабирование
- [x] `[TASK-PAR-007]` Внести изменения в `.github/workflows/ci.yml` (и/или добавить `ci-agent.yml`) для fast/scoped режимов, параметров scope (suites/levels/rebuild shards), экономии минут. *(MVP: fast-path для `agent/**`, dispatch inputs; углублённый scoped-targeting — follow-up.)*
- [~] `[TASK-PAR-008]` Обеспечить машинно-удобные артефакты для всех профилей (в т.ч. fast): единый summary JSON, список упавших проверок. *(Частично: aggregate summary, JSON/логи браузера и тайминги сохранены; унифицированный machine-summary для fast — follow-up.)*
- [x] `[TASK-PAR-009]` Проверить/настроить `concurrency`, отмену устаревших run’ов и балансировку при параллельных agent-ветках (≤~20 runner’ов). *(Сохранён `concurrency` per-ref с `cancel-in-progress`; профили снижают нагрузку agent-loop.)*

### R4 — Документация и онбординг агентов
- [x] `[TASK-PAR-010]` Обновить `AGENTS.md` разделом протокола CI-only/worktree/self-healing (или сослаться на выделенный документ) без нарушения существующих архитектурных правил.
- [x] `[TASK-PAR-011]` Добавить переиспользуемый промпт/шаблон в `.ai/prompts/agent-ci-protocol.md` и шаблон планирования CI-секции.
- [x] `[TASK-PAR-012]` Обновить `docs/architecture-testing.md` (режимы запуска, CI как источник истины, работа с артефактами/flake-политикой).

### R5 — Валидация механизма (обязательно в GitHub CI)
- [ ] `[TASK-PAR-013]` Провести пилот: 2–3 параллельных worktree/ветки `agent/*` с независимыми малыми задачами, прогнать fast CI-loop до зелёного статуса.
- [ ] `[TASK-PAR-014]` Провести пилот self-healing: намеренно внести контролируемую ошибку, убедиться, что `ci-watch` фиксирует failure в result-файлы, агент исправляет и доводит до SUCCESS в пределах лимита итераций.
- [ ] `[TASK-PAR-015]` Провести пилот пересборки/детерминизма (изменение брифа/схемы в scope) с проверкой `build-level --check`/`check-levels` в CI.
- [ ] `[TASK-PAR-016]` Выполнить постепенный merge пилотных веток через PR с зелёными required checks; зафиксировать метрики (время цикла, число итераций, нагрузка на runner’ы) в `.ai/state/`.

## 9. Тестирование и критерии приёмки плана (DoD инициативы)

- [ ] Протокол и tooling позволяют агенту пройти цикл `push → CI fail → fix → CI pass` без локального запуска обязательных тестов.
- [ ] Параллельные worktree/ветки получают независимые CI run’ы и независимые локальные result-файлы.
- [ ] Fast-профиль даёт существенно более быстрый feedback, чем full, при сохранении full-проверки перед merge.
- [ ] Все пилоты (R5) подтверждены ссылками на успешные GitHub Actions runs и записаны в `.ai/state/`.
- [ ] Документация (AGENTS/prompts/testing docs) достаточна, чтобы новый агент воспроизвёл схему по инструкции.
- [ ] Политика merge обеспечивает, что в `main` попадают только изменения с зелёным CI.

## 10. Риски и меры

| Риск | Мера |
| --- | --- |
| Долгий/дорогой feedback при тяжёлых job’ах | Fast/scoped профили, `cancel-in-progress`, таргетирование suites/levels/shards |
| Очереди и лимит ~20 runner’ов при многих агентах | Ограничение числа активных веток, приоритизация, full только pre-merge |
| Ложные/флейковые падения блокируют цикл | Классификация ошибок в result-файлах, ограниченное использование `--flake` с follow-up, сбор артефактов |
| Коммит/утечка CI-result или временных файлов | `.gitignore`, guardrails в `check-env`, review в PR |
| Дрейф/конфликты производных артефактов уровней | `--check` в CI, пересборка в том же инкременте, правило «источник + производное вместе» |
| Самовосстановление «лечит симптом» неверно | Лимит итераций, эскалация, фиксация диагноза/гипотез в state |
| Права `gh`/push/dispatch | Preflight-проверки auth, минимально необходимые scopes/permissions, документация настройки |

## 11. Рекомендуемый порядок внедрения

1. **R1–R2**: согласовать правила, result-формат, реализовать `check-env` и `ci-watch` (можно валидировать на существующем `ci.yml`).
2. **R3**: добавить fast/scoped профили CI и улучшить агрегированные артефакты.
3. **R4**: обновить `AGENTS.md`, prompts, testing docs.
4. **R5**: пилоты параллельной работы, self-healing и merge — только с подтверждением в GitHub CI; по итогам скорректировать лимиты/профили.

## 12. Артефакты плана (ожидаемые точки изменений при реализации)

- `.ai/plans/22-parallel-agents-github-ci.md` — данный план (поддерживать статусы задач).
- `.ai/state/parallel-agents-github-ci.md` и/или `.ai/state/task_tracker.json` — прогресс, метрики пилотов, решения.
- `.ai/prompts/agent-ci-protocol.md` — переиспользуемый протокол/шаблон задания.
- `scripts/agent/check-env.*`, `scripts/agent/ci-watch.*` — tooling цикла.
- `.github/workflows/ci.yml` и/или `.github/workflows/ci-agent.yml` — CI-профили.
- `.gitignore` — исключения для CI-result/временных артефактов.
- `AGENTS.md`, `docs/architecture-testing.md` — правила и инструкции.
- `docs/architecture/adr/*` — при существенных trade-off (например, выбор модели профилей CI, политика auto-merge/квартала флейков), если потребуется.
