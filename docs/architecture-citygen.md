# Citygen v4: процедурный генератор города (районы)

Дополнение к [architecture-level-pipeline.md](architecture-level-pipeline.md),
[ADR-001-v4-citygen-districts.md](architecture/adr/ADR-001-v4-citygen-districts.md) и
[.ai/plans/01-city-generator-districts.md](../.ai/plans/01-city-generator-districts.md).
Описывает **текущее состояние реализации** (MVP-инкременты, scope v3/v4), не заменяет план.

## Формат и пайплайн

- Источник v4: `src/levels/level-NN.json` с `$schema: ./level-v4.schema.json`,
  `kind: "cityforge"`, `schemaVersion: 4`, манифест `generator` + `cityforge` (и опц. общие поля
  `metadata/ground/gameplay/stream/buildings/properties`) — см. `tools/level-schema.mjs` (`LEVEL_SPEC_V4`),
  экспорт `src/levels/level-v4.schema.json`.
- Сборка: `node tools/build-level.mjs <level-v4.json> [--check] [--out <dir>]`.
  Для v4 (`kind: "cityforge"` + `schemaVersion: 4`) `build-level`:
  1. валидирует спецификацию v4;
  2. запускает `runCitygen(raw)` (`tools/citygen/index.mjs`) — детерминированные стадии 0–6;
  3. записывает детерминированный `generation-report.json` в каталог вывода (участвует в `--check`);
  4. компилирует `engine`-результат через `compileCityforge(...)` → `generateCatalog(...)` в
     open-каталог (скелет/чанки/`index.js`) общим пайплайном без дублирования арифметики движка.
- v4 поддерживает passthrough `windows` (в т.ч. явный `null`/объект настроек, напр. `spacing`) для perf-тюнинга стоимости `picture/atom` в open-world; значение сохраняется через компиляцию/каталог согласно спецификации.
- При ошибках генерации (в т.ч. `road_crosses_river_without_bridge` и др., отражённых в отчёте)
  сборка v4 прерывается. Производный каталог/отчёт — побайтово стабильны при одинаковом входе и
  `generatorVersion` (`--check`).
- Пилот: `src/levels/level-16.json` → `src/levels/level-16/` (+ `generation-report.json`), scope
  и метрики — `.ai/state/city-generator-districts.md`, `.ai/state/pilot-metrics-2026-11-11.md`.

## Оркестратор и контракт стадий

- `tools/citygen/index.mjs`: создаёт контекст, выполняет стадии по порядку, фиксирует
  `ctx.engine = ctx.input` при отсутствии явного engine, финализирует отчёт.
- Стадии (`tools/citygen/pipeline/stage.mjs`): контракт `prepare(ctx) → generate(ctx) → validate(ctx) → repair(ctx) → emit(ctx)` (каждый шаг опционален, вызывается если функция есть). Ошибка шага даёт диагностику `stage_error` (error) со стеком; итог стадии — `ok`/`error`/`skipped` в `report.stages`.
- Текущий набор: `0_input_space` (skeleton), `1_landscape_hydrology`, `2_transport`,
  `3_districts_parcels`, `4_buildings_structures`, `5_infrastructure_props`, `6_finalize_emit`.

## IR / WorldState (`tools/citygen/context.mjs`)

Минимальный контейнер (расширяется стадиями):
- `input`, `engine` (результат для компиляции), `meta` (`seed`, `generatorVersion`, `deterministic`, `worldBounds`, `stream`), `rng`, `report`.
- Данные слоёв: `masks` (в т.ч. `easement.rivers/roads`), `terrain`, `networks`, `districts`, `parcels`, `buildings`, `props`, `infrastructure`.
- `spatial` — опциональные индексы для запросов (строятся стадиями); `hooks { behavior, glb }` — зарезервировано (MVP: без логики/загрузки).

## Детерминизм, id, RNG (`tools/citygen/rng.mjs`, `tools/citygen/ids.mjs`)

- RNG: `mulberry32`/`makeRng`, смешивание seed — `mix(...)`/`hashString` (без `Math.random`).
- Стабильные id/подсиды: `stableId(...)`, `stageSubseed(seed, stage, districtId, chunkY, chunkX, slotId, attempt)`, сортировка `byId`.
- Стадии используют производные seed/subseed и детерминированный порядок обхода; локальные repair не должны менять несвязанные результаты (инвариант развития).

## Диагностика и отчёт (`tools/citygen/diagnostics.mjs`, `tools/citygen/repair.mjs`)

- `Diagnostic`: `{ severity: info|warn|error, code, stage, message, ... }`.
- `generation-report.json` (v1, детерминированный, без временных меток): `generator`, `stages`, `districts`, `diagnostics`, `repairs`, `drops`, `summary { errors, warnings, repairs, drops }`.
- `finalizeReport` сортирует стадии/диагностики/repairs/drops и пересчитывает summary; `reportToJson` отдаёт стабильный JSON.
- Политики repair (`tools/citygen/repair.mjs`): retry/degrade/drop (каркас; применяются стадиями по месту).

## Пространственные индексы (`tools/citygen/spatial.mjs`)

- `createSpatialIndex(bounds, cellSize)` — uniform-grid по AABB (`insert`, `query`, `clear`), детерминирован при детерминированных входах; запрос возвращает пересекающиеся кандидаты.
- Текущая интеграция (эквивалентна линейным проверкам, артефакты сохранены):
  - stage 1: `ctx.spatial.riverSegments` (сегменты русел, bbox с консервативным pad);
  - stage 2: `ctx.spatial.roadEasements` (AABB коридоров дорог);
  - stage 3: river-index при проверке клиренса русел в парцелляции (при эквивалентном наборе гидрологии);
  - stage 4: `ctx.spatial.buildings` (AABB footprint), использование river/road-индексов при проверке конфликтов зданий;
  - stage 5: building-index и river-index (при эквивалентном наборе гидрологии) для клиренса, индекс min-sep размещённых props.
- Расширение на другие запросы/стадии — по мере реализации (без изменения семантики и детерминизма).

## Стадии (кратко, текущее)

- **0 `0_input_space`**: skeleton (заготовка разбиения/якорей).
- **1 `1_landscape_hydrology`**: санитизация/нормализация terrain modifiers и hydrology, clamp/repair/drop (напр. `clamp_*`, `duplicate_id_renamed`, `repair_steep_modifier_*`, `river_self_intersection`), предупреждения конфликтов, опц. процедурная генерация из `generator.landscape`, easement рек и `riverSegments`-индекс, emit в `cityforge`.
- **2 `2_transport`**: валидация/repair сети дорог (ссылки, вырожденные/крутые сегменты, уклон, out-of-bounds точки пути `clamp_road_path_bounds`, `road_crosses_river_without_bridge`, консервативный river-clearance для terrain-path), связность/якоря (`connect_spawn_exit_components`, подключение оставшихся компонент `connect_road_component`), easement/индекс дорог, опц. процедурная генерация/профилирование; генерация обычных terrain-following веток по умолчанию допускает диагональные направления (для совместимости и надёжности предпочтительны осевые; `generator.transport.diagonal: false` оставляет прежний осевой режим); export helper’ов terrain-path; emit `networks.roads`.
- **3 `3_districts_parcels`**: профили/типы районов, объявленные или авто-сетка, совместимость/adjacency warnings, fallback профиля, парцелляция с метаданными доступа/резервами; emit/сводка районов в отчёт.
- **4 `4_buildings_structures`**: детерминированная генерация/валидация зданий (конфликты, dedupe id, бюджет/типы) или passthrough объявленных; для pilot-scale контекстов выполняет адресную аугментацию подъездов к дальним road-needy parcel (axis-aligned/L, строгая валидация/river-clearance, обновление сети/easement/`parcel.access.roadDist`, детерминированный rollback); emit в `input.buildings`, индекс зданий.
- **5 `5_infrastructure_props`**: огни вдоль дорог (лимиты), district/roadside props с клиренсом (дороги/реки/здания/якоря/высота), детерминированный порядок/бюджеты; emit lights/landscape props.
- **6 `6_finalize_emit`**: кросс-стадийная сводка и проверки (`finalize_counts` с ground/stream/chunks, счётчиками дорог/районов/участков/зданий/огней/props, `roadComponents/roadGraphNodes`, `reservedParcels`, `parcelAccess`, `roadAccessByType` по road-needy типам; предупреждения, в т.ч. удалённость якорей, `road_graph_disconnected_final`, `district_type_poor_road_access`), без мутации геометрии; чанки/скелет/каталог — общий build-пайплайн.

Детали кодов диагностик/repair и покрытие тестами — `tools/citygen.test.mjs`, `tools/citygen/pipeline/*.mjs`.

## Генераторные профили и политики (`generator.profiles` / `generator.policies`)

- Источник истины конфига — `tools/citygen/config.mjs`: `DEFAULT_GENERATOR_VERSION`, `DEFAULT_CITY_POLICIES`, `DEFAULT_CITY_PROFILES`.
- `generator.policies` трактуется относительно документированных значений по умолчанию (§11/§13.2): `roadDensity.bMin/bMax` (пределы плотности дорожной сети, `gamma`), `slopeLimitPct` (6/8/10/12 по классам highway/arterial/collector/local, **проценты**; `J.maxSlope` остаётся абсолютным пределом в м/м), `enterableShare` (целевая доля доступных зданий), `chaos.global` (0..1) и `chaos.seamsMax` (число швов), `interchanges.min/max`, `parkShare.min/max`.
- Нормализация — `normalizePolicies`/`normalizeCityProfiles` (детерминированные defaults + `mergeDeep` + clamp известных числовых диапазонов); `resolveGeneratorConfig(input)` возвращает `{ policies, cityProfiles, activeProfileId, activeProfile }`.
- Стадии читают конфиг через `ctx.meta.policies` / `ctx.meta.cityProfiles` / `ctx.meta.activeCityProfile*` (см. `tools/citygen/context.mjs`), без догадок про отсутствующие поля. Явный выбор профиля — `generator.profile`/`profileId`/`cityProfile`; отсутствие выбирает дефолтные значения по `DEFAULT_CITY_PROFILES`.
- Три профиля-прототипа (§11):
  - `river_trade` — «Речной торговый»: relief `plain`, 1 река + 1 приток, interchanges 2–3, `parkShare` 0.08–0.15, `chaos` 0.4;
  - `hill_town` — «Город на холме»: relief `hills`, без рек, interchanges 0–1, `parkShare` 0.10–0.18, `chaos` 0.55;
  - `railway_industrial` — «Железнодорожный индустриальный»: relief `plain`, 1 река (0–1 приток), interchanges 3–4, `parkShare` 0.05–0.08, `chaos` 0.4.
- `level-17` (`river_trade`), `level-20` (`hill_town`), `level-21` (`railway_industrial`) — воспроизводимые profile-driven source pilots (seed/`generator.generatorVersion`/хэши в `generation-report.json`); `level-20/21` вне `src/levels/index.js` до подтверждения browser/perf.

## report.metrics (v2) и мягкие метрики §12.2

- Прикрепляет `tools/citygen/rules.mjs` (`evaluateRules`/`attachRulesToReport`); `report.metrics.version = 2` (детерминированно, partial/scaffold где нужно).
- Поля: `counts` (дороги/узлы/районы/участки/здания/огни/реки/озёра), `graph` (компоненты, тупики/dead-end ratio, γ, avg degree), `roads` (доли классов по длине, slope share/policy по классам), `gameplay` (spawn/exit-to-road, `enterableShare`/target), `districts` (площади/доли по типам, `parkShare`), `terrain` (уклон по 8-классовой сетке 16 м), `parcels` (reservedShare по причинам: water/road_corridor/anchor/reservation/crossing/steep_slope/remote_access), `landmarkVisibility` (stub/count proxy), `blockDensityCorrelation` (Spearman D vs 1/area при наличии D/площади), `chunkBuild` (scaffold, `buildTimeMs: null`), `stream` (метаданные стриминга).
- Повторная запись метрик — только через детерминированный прогон (`runCitygen`), руками snapshots не правят.

## Эталоны и регрессия (R0.4/R6.4)

- Synthetic etalons (3 профиля × seeds 101/202/303): `.ai/state/citygen-etalons/{river_trade,hill_town,railway_industrial}-seed{101,202,303}.json` + `summary.json` (hash/summary/rules/metrics, `generatorVersion` из `tools/citygen/config.mjs`).
- Pilot baselines: `.ai/state/citygen-baselines/level-16..22.citygen-baseline.json`.
- Проверка: `node tools/citygen-etalon-check.mjs` (CI job `node / etalon regression` в `.github/workflows/ci.yml`); при зелёном статусе — 16/16.
- Контролируемое обновление после осознанного изменения поведения:
  1. Внести изменение стадии/правила.
  2. Пересобрать затронутые derived: `node tools/build-level.mjs src/levels/level-NN.json` (и `--check` для паритета, 0 warnings).
  3. Обновить baselines: `node tools/citygen-baseline.mjs --out .ai/state/citygen-baselines src/levels/level-16.json ...` (нужный scope).
  4. Обновить synthetic etalons: `node tools/citygen-etalon-check.mjs --update` (при намеренном bump версии: `--generatorVersion <v>`).
  5. Зафиксировать `git add` derived-артефактов **вместе** с источниками/инструментами/снапшотами.
  6. Гейты: `node tools/check-levels.mjs <scope>`, `node --test tools/citygen.test.mjs`, browser/seed-series по scope.

## Серийная валидация (R6.3)

- `node tools/citygen-seed-series.mjs --profiles <p> --count 100 [--transport] [--out <dir>]` — детерминизм (двойной прогон на seed), hard failures (errors/non-determinism → exit 1), агрегированные мягкие метрики; `--single-run`/`--fail-fast`/`--concurrency` по необходимости.
- CI (`.github/workflows/ci.yml`, job `seed-series`): матрица plain/transport × 3 профиля × 100 seeds исполняется на PR merge-gate и на push/dispatch профиля (fast push в `agent/**` пропускает серии); агрегация — artifact `aggregate / report`.
- Регрессионный отчёт из CI хранится как artifact (retention 14 дней); в репозиторий коммитятся только etalons/baselines (см. выше).

## Процедура bump `DEFAULT_GENERATOR_VERSION`

- Повышать при намеренном изменении раскладки/IR/отчёта/derived, влияющем на воспроизводимый результат (геометрия, распределения, ID/порядок, диагностики/метрики, влияющие на report hash) для версий seed+generatorVersion.
- Не повышать при чисто нефункциональных правках, не меняющих детерминированный вывод.
- При bump: обновить `generator.generatorVersion` в затронутых source-уровнях/эталонных сценариях, пересобрать derived (0 warnings), обновить baselines/etalons (`--update` / `--generatorVersion <v>`), обновить ожидания тестов при необходимости, закоммитить source+tools+derived+snapshots **одним изменением**, зафиксировать причину в `.ai/state/citygen-plan21-execution.md` (или эквиваленте) и проверить GitHub CI как источник истины.

## Тесты и артефакты

- Node: `node --test tools/citygen.test.mjs` (детерминизм, repair/валидация стадий, отчёт, RNG/ids/spatial, e2e compile, пилот гл.16 и его baseline-инварианты), `node tools/check-levels.mjs`, `node tools/build-level.mjs src/levels/level-16.json --check`, `node tools/citygen-etalon-check.mjs` (эталоны/baselines, 16/16), `node tools/citygen-seed-series.mjs` (100×3 determinism/hard-failure gate в CI).
- Browser (engine/open-world): `tests/open-world.test.js` (`testEngineChapter`, `--level`, `--details`) сообщает worst-frame/picture/wall-clock и (инструментировано) `renderer.info.memory`, `scene.children` и дельту start→rest для TASK-001/008; запуск через `tools/ci-browser.mjs`.
- Для пилота коммитятся источник, каталог и детерминированный `generation-report.json` (см. ADR-001).
- Ограничения MVP и открытые задачи (IR/маски/spatial глубже, семантика стадий 2–6, бюджеты/emit, новые примитивы/GLB/поведение, формальный p95/CI-метод метрик) — в плане и `.ai/state/city-generator-districts.md`.
