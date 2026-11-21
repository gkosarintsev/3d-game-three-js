# Plan 25 — Bug Triage Log (TEST-006)

Формат: symptom / root cause / fix / regression test / affected files/levels / evidence.
Обновлять при каждом BUG-* изменении в Plan 25 (PR body и/или этот файл).

## BUG-001 — Rotation/AABB/local-space audit (first pass)

- **Symptom:** У повёрнутых (90/270°) detailed-buildings фасад/глубина могли инвертироваться, если локальные размеры брались из world AABB bounds (кейс `b_d_commercial_49` / market-row).
- **Root cause:** Локальные размеры детального дома выводились из world bounds без учёта нормализации поворота 90/270; world AABB уже «перепутан» по осям.
- **Fix:** Вынесен `detailedLocalDims(bounds, rotation)` в `src/json-map.js`, переиспользован в `_buildDetailedBuildings`; централизована swap-логика для 90/270.
- **Regression test:** `tests/detailed-rotation.test.js` (`runDetailedRotationTests`): проверка `detailedLocalDims` для 0/90/180/270/360 и bbox построенного mesh для rotated `market-row` и `academic-building`. Зарегистрирован в CI browser `misc`.
- **Affected files/levels:** `src/json-map.js`, `tests/detailed-rotation.test.js`, `.github/workflows/ci.yml`, `.ai/plans/25-code-quality-refactor.md`; потенциал проявления — уровни с rotated detailed buildings (например city/market-row cases).
- **Evidence:** PR [#81](https://github.com/gkosarintsev/3d-game-three-js/pull/81) merged (`de567bdee10f0525c78db59ddeed35b801cdf881`, 2026-11-21T09:35:49Z), CI green before merge.

## BUG-002 — Lifecycle/dispose audit (first pass)

- **Symptom:** Риск утечки CPU/GPU буферов при пересборке/перезагрузке уровней и чанков из-за неосвобождённых source geometries после `mergeGeometries`.
- **Root cause:** После успешного/ошибочного `mergeGeometries` временные source geometry массивы не диспоузились во многих build-путях.
- **Fix:** Явный dispose source arrays после merge в `src/json-map.js`, `src/world-map.js`, `src/panelka-decor.js`, `src/decor.js`, `src/map.js`, `src/city-map.js`, `src/terrain-map.js`, `src/building.js`, `src/props.js`, `src/vehicle.js`. Аудит `JsonMap.dispose/_release`, `WorldMap` unload/release, `night-lights`, `weapon` — новых очевидных утечек в этом проходе не найдено.
- **Regression test:** Существующий browser gate `level-lifecycle` / `reload-scene-budget` покрывает рост `renderer.info` на reload; TEST-003 остаётся partial (нужен явный detailed-visual-heavy/chunk rebuild assertion при допустимом бюджете).
- **Affected files/levels:** перечисленные src build/dispose пути; проявление — reload/chunk rebuild на любых уровнях, особенно с тяжёлой геометрией.
- **Evidence:** PR [#82](https://github.com/gkosarintsev/3d-game-three-js/pull/82) merged (`cc3af13466d7564e458cf058253f4149d562d93d`, 2026-11-21T09:50:04Z), CI green before merge.

## BUG-003 — Streaming/chunk boundary invariants

- **Symptom:** На границе чанков при выгруженном owner-чанке и загруженном participant-чанке boundary-запись могла отсутствовать визуально, хотя collision/data ownership существовали; после owner load/unload требовался корректный handover fallback.
- **Root cause:** Рисование boundary-records зависело от owner presence; наивный sync rebuild картинок соседей при handover был слишком дорогим и вызывал timeout `level-contract` 420s.
- **Fix:** First pass (#87) — build-time fallback draw: если owner не загружен при сборке participant, WorldMap рисует non-owner записи в первом загруженном `coverageChunks` participant. Handover (#89) — affected participant chunks помечаются `pump.fallbackDirty`; budgeted `picture-fallback-rebuild` slices выполняются в `streamStep` (без sync commit-swap rebuild).
- **Regression test:** `tests/open-world.test.js` — `BUG-003: fallback handover на границе чанков` (build-time fallback, owner load handover, owner unload handover/revisit через pumped rebuild). Зарегистрирован в open-world browser suite.
- **Affected files/levels:** `src/world-map.js`, `tests/open-world.test.js`, `.ai/plans/25-code-quality-refactor.md`; open/streaming chunked levels (`WorldMap`, CityForge/open catalog chunks).
- **Evidence:** PR [#87](https://github.com/gkosarintsev/3d-game-three-js/pull/87) merged (`5279bba9d91d7bb1d286f55093e106029e615759`, 2026-11-21T13:17:24Z), CI run [44907572266](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44907572266) success. PR [#89](https://github.com/gkosarintsev/3d-game-three-js/pull/89) merged (`da55e5b910afabf3b219ccc99608e54c05de6763`, 2026-11-21T13:57:42Z), PR CI run [44910989486](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44910989486) success, push run [44910984375](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44910984375) success.

## BUG-004 — Determinism and ordering audit (first pass)

- **Symptom:** Потенциальная locale-зависимая недетерминированность сортировки в citygen/tooling путях.
- **Root cause:** Использование `localeCompare` в детерминированных sort-путях citygen.
- **Fix:** Закреплён locale `'en'` для `localeCompare` в `tools/citygen/ids.mjs`, `tools/citygen/diagnostics.mjs`, `tools/citygen/features.mjs`, `tools/citygen/rules.mjs`. Попытка codepoint-сортировки откачена, т.к. меняла generation artifacts.
- **Regression test:** `tools/citygen.test.mjs` — `citygen BUG-004/TEST-004: deterministic ordering is locale-independent for ASCII ids`.
- **Affected files/levels:** `tools/citygen/*`, `tools/citygen.test.mjs`; влияет на детерминизм генерации/артефактов CityGen, не на runtime map contract.
- **Evidence:** PR [#84](https://github.com/gkosarintsev/3d-game-three-js/pull/84) merged (`77eb57084fd95bc8f7c45449f06281b606fba97e`, 2026-11-21T10:18:28Z), CI green before merge. Локальный hint: `node --test tools/citygen.test.mjs` — 66 pass/0 fail (CI source of truth).

## BUG-005 — Defensive guards and error reporting (first pass)

- **Symptom:** Риск silent `undefined`/`NaN` propagation в hot map/nav путях при неожиданных нечисловых входах.
- **Root cause:** Отсутствие явных finite-input guards в отдельных hot-path запросах карты/навигации.
- **Fix:** Добавлены дешёвые guards + одноразовые warnings: `WorldMap.isBuiltAt/streamStep` (NaN/Infinity coords/speed → `false`/early return/`speed=0`), `SurfaceField.groundHeightAt` (NaN/Infinity coords/fromY → `groundY|0` fallback), `JsonMap.randomNavPoint/findPath` (missing nav/invalid args → `null`).
- **Regression test:** Явного отдельного regression test нет; поведение покрывается существующими контрактными/браузерными гейтами косвенно. Remaining: добавить targeted test при найденном конкретном corruption case.
- **Affected files/levels:** `src/world-map.js`, `src/surfaces.js`, `src/json-map.js`; все карты, использующие эти hot paths (open/json/town/terrain runtime queries).
- **Evidence:** PR [#88](https://github.com/gkosarintsev/3d-game-three-js/pull/88) merged (`15cbd6695f318d54367341771a0adad1a075c997`, 2026-11-21T13:28:57Z), CI run [44908546092](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44908546092) success.
