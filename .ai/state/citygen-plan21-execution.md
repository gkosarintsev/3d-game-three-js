# Состояние выполнения: plan 21 (citygen procedural rules) — параллельные агенты + GitHub CI

Дата: 2026-11-19  
Базовый план: `.ai/plans/21-citygen-procedural-rules.md`  
Существующий прогресс/история: `.ai/state/citygen-procedural-rules.md`, `.ai/state/citygen-run-log.md`, `.ai/state/citygen-seed-series/`, `.ai/state/citygen-etalons/`, `.ai/state/citygen-baselines/`  
Протокол выполнения: `.ai/plans/22-parallel-agents-github-ci.md`, `.ai/prompts/agent-ci-protocol.md`

## Текущее положение (сводка, по состоянию репозитория/истории)

- **Generator:** `DEFAULT_GENERATOR_VERSION = 0.56.0` (`tools/citygen/config.mjs`), стадийный pipeline v4 (`tools/citygen/index.mjs`, `pipeline/stage-1..6-*`), профили/политики/валидация/метрики/эталоны/seed-series tooling развиты инкрементально (R0–R3 в значительной степени реализованы, R4 частично, R5/R6 частично/открыто по DoD плана).
- **Гейты/артефакты:** `tools/citygen.test.mjs`, `tools/citygen-etalon-check.mjs`, `tools/citygen-seed-series.mjs`, `tools/check-levels.mjs`, `tools/build-level.mjs --check`, browser suites по scope/CI; committed derived outputs и etalon/baseline snapshots являются частью детерминизма/регрессии.
- **Ограничение:** любые изменения, влияющие на IR/отчёты/derived level outputs, требуют согласованного rebuild committed артефактов и обновления baselines/etalons по политике версии, с верификацией в GitHub CI (fast для итераций, scoped/full для rebuild/etalon/browser/seed-series по scope).

## Оставшиеся области плана 21 (фокус дальнейшей реализации)

| Область | Статус (ориентир) | Примечание / риск |
| --- | --- | --- |
| R0 (валидатор/метрики/эталоны/процедуры) | в основном реализовано, DoD/формализация по месту | Расширение правил/метрик меняет отчёты → etalons/baselines/reports. |
| R1 (рельеф/вода) | в основном реализовано | Дальнейшие правки output-affecting. |
| R2 (сеть/перекрёстки/мосты/тоннели/развязки/repair) | частично (есть прототипы/валидаторы, не все подпункты закрыты) | Высокая связность, perf/навигация риски. |
| R3 (settlement/районы/D,B(D)) | в основном реализовано, часть scope/DoD уточняется | Метрики/серии чувствительны к изменениям. |
| R4.1,R4.2,R4.5,R4.6 | выполнены (по плану/истории) | Возможны доработки в рамках R4.3/R4.4. |
| **R4.3** (расстановка, фундамент, рельеф зданий) | **open** | Stage-4/placement; output-affecting, требует rebuild+CI. |
| **R4.4** (внешний вид/палитры/окна/крыши) | **open** | Визуальные/данные, output-affecting. |
| **R5.1** (контролируемый хаос) | open | Поведенческое изменение раскладки; bump/versioning по политике. |
| **R5.2** (читаемость/ориентиры) | open | Метрики/эвристики + возможные placement changes. |
| **R5.3** (gameplay spawn/exit/cars/enemies) | open | Затрагивает gameplay/связность/правила. |
| **R5.4** (`locked`, `instance.generation`) | open | Требует аккуратной plumbing без регрессий существующих выходов. |
| **R5.5** (`homeChunk`/`coverageChunks`, стриминг) | open | Chunk/build pipeline, catalog rebuilds. |
| **R6** (профили, пилоты, >=100 seed, эталоны, доки/CI) | open/частично | Серийные прогоны и регрессия в CI (scoped/dispatch/full). |

## Wave 1 (запущено, 2026-11-19)

### [TASK-P21-W1-001] Docs/state + CI & Parallelization для plan 21
- **Branch/worktree:** `agent/plan21-wave1-docs` / `C:\Temp\wt-plan21-docs`
- **Scope:** `.ai/plans/21-citygen-procedural-rules.md` (добавлена секция `### CI & Parallelization`), `.ai/state/citygen-plan21-execution.md` (этот файл)
- **Parallel-safe with:** любыми code-ветками (docs-only), но merge после output-changing веток может требовать rebase
- **CI profile:** fast (ожидаемо `node-fast`)
- **Required checks:** `node / fast checks`, `aggregate / report`
- **Rebuild/check:** N/A
- **Merge target:** PR → `main`
- **Status:** [~] in progress (commit+CI pending)

### [TASK-P21-W1-002] R4.3 increment — расстановка/фундамент/рельеф зданий (stage-4)
- **Branch/worktree:** `agent/plan21-wave1-r43` / `C:\Temp\wt-plan21-r43`
- **Scope (target):** `tools/citygen/pipeline/stage-4-buildings.mjs` (+ при необходимости связанные helpers/tests/config), детерминированный rebuild затронутых committed derived outputs/etalons/baselines при изменении поведения
- **Parallel-safe with:** W1-001 (docs). **Not merge-safe in parallel** с другими output-changing ветками (конфликты/дрейф в `src/levels/level-*/`, `.ai/state/citygen-*`, generation reports)
- **CI profile:** fast для итераций; перед merge — scoped/full по необходимости (`run_node_extended`/build-rebuild/etalon, browser по затронутым главам)
- **Required checks (minimum):** `node / fast checks` (включая `check-levels`), далее по scope: `build-level --check`, `citygen-etalon-check`, citygen unit, browser level-contract/lifecycle/open-world
- **Rebuild/check:** при изменении генерации — `node tools/build-level.mjs <affected levels>`, обновление `.ai/state/citygen-baselines/*` и `.ai/state/citygen-etalons/*` согласно процедуре; `node tools/build-level.mjs --check ...`, `node tools/check-levels.mjs ...`, `node --test tools/citygen.test.mjs`, `node tools/citygen-etalon-check.mjs` подтверждаются в CI
- **Merge target:** PR → `main` (после W1-001 или независимо, с учётом конфликтов)
- **Status:** [ ] not started (agent worktree prepared)

## Следующие волны (черновик)

- **W2:** R4.4, R5.4, R5.5 (отдельные ветки, последовательный merge output-changing изменений)
- **W3:** R5.1–R5.3, R2.x остатки (stage-6/stage-2 heavy increments, seed-series/perf evidence)
- **W4:** R6 профили/пилоты/серии >=100 seed/эталоны/доки, финализация DoD

## CI runs / evidence
(заполняется по мере выполнения)

## Риски и заметки
- Output-changing generator work требует строгой координации derived artifacts и версии (`generatorVersion` bump policy в `.ai/state/citygen-procedural-rules.md`).
- Fast CI не покрывает все тяжёлые гейты; перед merge output-changing веток использовать scoped/full подтверждение по scope.
- Ограничение ~20 concurrent runners: не запускать избыточные параллельные full/series прогоны.
