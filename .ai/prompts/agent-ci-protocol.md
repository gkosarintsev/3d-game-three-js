# Протокол: параллельные агенты + GitHub CI-only + self-healing

Источник: `.ai/plans/22-parallel-agents-github-ci.md`, `AGENTS.md`, `docs/architecture-testing.md`.

## Когда применять
- Любая разработка в режиме параллельных агентов / worktree.
- Любая задача, где верификация должна выполняться в GitHub CI (не локально).
- При составлении новых планов: добавить секцию `### CI & Parallelization`.

## Роли и изоляция
- Один агент/задача = один git worktree + одна ветка (`agent/<task-id>-<slug>` или `feat/<task-id>-<slug>`).
- **Запрещено:** прямой push в `main`, работа на ветке `main` без явного maintainer-override.
- Перед началом: `node scripts/agent/check-env.mjs` (в worktree). При ошибке — остановиться.

## Политика верификации (CI — источник истины)
- **Не запускать локально** обязательные/тяжёлые гейты: browser-сюиты (`tests/*.test.js`), полные/долгие node-наборы (напр. seed-series, тяжёлые прогоны), если они являются гейтами задачи — выполнять в GitHub CI.
- **Локально допустимо (L0, не гейт):** редактирование, `git status/diff/log`, чтение, формирование плана/отчёта, быстрые синтаксические проверки (`node --check <file>`).
- **Rebuild/производные:** при изменениях брифов/схем/генератора детерминированно пересобрать артефакты и включить в коммит; обязательное подтверждение — CI (`node tools/build-level.mjs --check`, `node tools/check-levels.mjs`, проверка схем по scope).

## Профили CI
- **fast** (default для push в `agent/**`): быстрый feedback (минимум `node-fast`; тяжёлые browser/seed-series и, по умолчанию, тяжёлые node/rebuild-шарды пропускаются, если не запрошены явно).
- **scoped**: fast + выбранные проверки по scope (через `workflow_dispatch` inputs).
- **full**: полный набор (PR/pre-merge/релизная регрессия).

## Цикл self-healing
1. Preflight: `node scripts/agent/check-env.mjs`
2. Реализация в scope + при необходимости rebuild.
3. `git add <scoped files>` && `git commit -m "feat|fix|ci|docs: ..."`
4. `node scripts/agent/ci-watch.mjs [--download-artifacts] [--iteration N --max-iterations 4]`
5. Прочитать `.ai/state/ci-results/<sanitized-branch>.json|.md|-failed.log`:
   - `nextAction=success` → обновить план/стейт, подготовить PR/отчёт.
   - `nextAction=retry` → исправить по логам/артефактам, вернуться к шагу 2.
   - `nextAction=escalate` → зафиксировать диагноз в `.ai/state/`, запросить владельца.
6. Не более 4 итераций на одну задачу/гипотезу без эскалации (если не согласовано иначе).

## Результат-файлы (локально, не коммитить)
- `.ai/state/ci-results/<branch>.json` — машиночитаемый статус (run, jobs, failing, nextAction, errorClass, iteration).
- `.ai/state/ci-results/<branch>.md` — краткая сводка.
- `.ai/state/ci-results/<branch>-failed.log` — хвост логов упавших шагов.
- Папка gitignored; не добавлять в коммиты.

## Постепенный merge
- `agent/*` → PR (опционально через `integration/*`) → `main`.
- Merge только при зелёных required checks (минимум релевантный scoped/fast, full по политике для pre-merge).
- Конфликты/дрейф производных решать в ветке задачи + повтор CI-loop.
- После merge: удалить worktree/ветки, очистить локальные CI-result при необходимости.

## Шаблон задания агенту
```md
Контекст: работай по схеме parallel-agents + GitHub CI only (план `.ai/plans/22-parallel-agents-github-ci.md`, протокол `.ai/prompts/agent-ci-protocol.md`).
1) Preflight: `node scripts/agent/check-env.mjs` (только свой worktree/ветка, не main).
2) Прочитай `.ai/plans/<plan>.md` и `.ai/state/<state>.md`, работай в scope.
3) Реализуй инкремент (и rebuild производных при необходимости), закоммить.
4) Не запускай обязательные/тяжёлые тесты локально. Выполни `node scripts/agent/ci-watch.mjs --download-artifacts --iteration <n> --max-iterations 4`.
5) Разбери `.ai/state/ci-results/<branch>.json|.md|-failed.log`: SUCCESS → обновить план/стейт и подготовить PR; FAILED → исправить и повторить (≤4), иначе эскалировать.
6) Отчёт: ветка, SHA, CI run URL, статус, изменения, что проверено в CI.
```

## Шаблон секции для плана задачи
```md
### CI & Parallelization
- Worktree/branch: `agent/<id>-<slug>`
- Parallel-safe with: <tasks|none> / blocked by: <tasks|none>
- CI profile: fast | scoped | full
- Required checks: <jobs/suites/levels/commands>
- Rebuild/check: <commands or N/A>
- Merge target: integration/<wave> | main (PR)
```
