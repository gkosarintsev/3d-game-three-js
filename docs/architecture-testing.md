# Тестирование и CI: правила и детали

Дополнение к [AGENTS.md](../AGENTS.md) (разделы «Тесты», «Параллельные агенты, worktree и CI-only»). Здесь — полные формулировки гейтов, запуска и CI; записанное здесь действует так же обязательно.

Связанные документы: [`.ai/plans/22-parallel-agents-github-ci.md`](../.ai/plans/22-parallel-agents-github-ci.md), [`.ai/prompts/agent-ci-protocol.md`](../.ai/prompts/agent-ci-protocol.md).

## 0. Принцип: CI — источник истины

- Обязательные/тяжёлые тесты и гейты **не запускаются локально** — выполняются в GitHub Actions. Локально допустимы только вспомогательные действия (чтение/правки, `git`, планирование, быстрые `node --check` как подсказка, не гейт).
- Статус «проверено» фиксируется по успешному GitHub Actions run для конкретного `HEAD` SHA ветки. Для агентских циклов использовать `node scripts/agent/ci-watch.mjs` и результат в `.ai/state/ci-results/<branch>.{json,md,-failed.log}` (gitignored).

## 1. Общие правила тестирования

- Изменения физики, коллизий, навигации или контракта карты проверяются браузерными автотестами `tests/*.test.js` (через `tools/ci-browser.mjs` в CI). Работа не считается завершённой без зелёного прогона.
- Новая механика — новый автотест в том же заходе.
- **Новая глава — нового тестового файла не требует**: её бриф проверяется автоматически (`node tools/check-levels.mjs`: детерминизм двух прогонов, ноль предупреждений, побайтовость закоммиченного модуля, спавн/точка B в плите и габарите, атрибуция каждого `map.asset`), а собранная карта попадает в общие браузерные сюиты `tests/level-contract.test.js` и `tests/level-lifecycle.test.js` через реестр `src/levels/index.js`. Специализированная сюита «про свою главу» остаётся при необходимости (контракт vs замысел уровня).
- Пределы бюджета уровня **не выдумываются**: `check-levels.mjs` печатает фактические числа; порог назначается замером.
- Пересборка производных (`tools/build-level.mjs`, схемы) — детерминированна, источник и производное коммитятся вместе; подтверждение — CI `--check`/`check-levels`.

## 2. CI (`.github/workflows/ci.yml`)

### 2.1 Профили
- **`fast`** — быстрый feedback (default для `push` в ветки `agent/**`, либо `workflow_dispatch` с `ci_profile=fast`/`auto` на `agent/**`): выполняется `node-fast`; тяжёлые job’ы (citygen unit, etalon, build-rebuild shards, browser matrix, seed-series) по умолчанию пропускаются.
- **`scoped`** — настраиваемый прогон (через `workflow_dispatch`, расширяется по мере внедрения параметров scope).
- **`full`** — полный набор (текущее поведение для `push`/`pull_request` вне `agent/**` fast-path, и для pre-merge/регрессии): `node-fast`, `node-citygen`, `node-etalon`, `build-rebuild` (4 шарда), `browser` (5 групп), `seed-series` (6 шардов plain/transport×3 при включении), `aggregate`.

> Примечание: текущая реализация fast-профиля ориентирована на ускорение agent-loop; состав scoped/full проверок уточняется в плане 22 (R3) и branch protection.

### 2.2 Джобы и гейты (full)
- **node / fast checks** (`node-fast`): `check-levels`, `level-parser`, `relief`, `track`, `chunk`, `visualizer/model`, `ground-bake`.
- **node / citygen unit tests** (`node-citygen`): `node --test tools/citygen.test.mjs` + JUnit/тайминги.
- **node / etalon regression** (`node-etalon`): `tools/citygen-etalon-check.mjs`.
- **rebuild / build-level --check** (`build-rebuild`): детерминизм/паритет L07–L22 по шардам.
- **browser / <group>** (`browser`): `node tools/ci-browser.mjs` в `mcr.microsoft.com/playwright:v1.49.0-noble` (Playwright в репозиторий не ставится; `npm install --global playwright@1.49.0` в джобе, `NODE_PATH="$(npm root --global)"`). Каждая сюита — в свежей странице.
- **series / <mode> / <profile>** (`seed-series`): `tools/citygen-seed-series.mjs` (100×3 по профилям/режимам) при включении.
- **aggregate / report**: сбор артефактов, сводка, fail при падении обязательных (не-skipped) джобов.

### 2.3 Браузерный раннер (`tools/ci-browser.mjs`)
- `--suites a,b` — подмножество сюит; без аргумента — все `tests/*.test.js`.
- `--level N` — фильтр глав для сюит реестра (ручной/targeted прогон).
- `--fast` — пропуск perf-проверок (имена с «бюджет»/`мкс`/`budget`).
- `--flake "file.test.js::проверка"` — точечная пометка известной нестабильной проверки (не блокирует прогон, печатает `FLAKE`); использовать осознанно с follow-up, не для скрытия регрессий.
- `--json-report path` — машиночитаемый отчёт (сьюты/проверки, статусы, длительности, console errors).

### 2.4 Артефакты CI (для анализа/ci-watch)
- `browser-<group>`: отчёт/лог/тайминги браузерного шарда.
- `build-check-<group>`: тайминги/результаты rebuild-check.
- `node-citygen-report`: JUnit/тайминги.
- `series-<mode>-<profile>`: сводки/тайминги/логи seed-series.
- `ci-aggregate-report`: агрегированная сводка.

## 3. Параллельные агенты и self-healing цикл

- Работа в изолированном worktree/ветке (`agent/*`/`feat/*`), preflight: `node scripts/agent/check-env.mjs`.
- Цикл: `commit → push → node scripts/agent/ci-watch.mjs → чтение .ai/state/ci-results/<branch>.{json,md,-failed.log} → fix/retry` (≤4 итерации, затем эскалация).
- Параллельные ветки дают независимые GitHub Actions run’ы; учитывать лимит ~20 одновременных runner’ов и предпочитать fast-профиль в итерациях.
- Пилоты/валидация механизма (parallel, self-healing, rebuild/детерминизм, merge) фиксируются в `.ai/state/` со ссылками на CI run.

## 4. Ручные/targeted прогоны (когда допустимо)

Сюиты реестра (`level-contract`, `level-lifecycle`) при ручной диагностике — **только с фильтром главы**; полный реестр дорог и выполняется в CI. Локальный браузерный прогон не заменяет обязательный CI-гейт.

Способы фильтра:
- `await runLevelContractTests(12)`, `await runLevelLifecycleTests([12, 13])`;
- `TEST_LEVEL=12` в консоли до вызова;
- `node tools/ci-browser.mjs --level 12 level-contract` (номера — `LEVEL_NUMBERS`).
