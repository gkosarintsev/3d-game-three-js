# PLAN 24 — Port houses2 models (excluding already added)

## Goal
Add visual building/structure models from `docs/houses2` into the game (except those already present), following `docs/house-porting.md`, and specify suitable districts for each added model.

## Already added (exclude)
- Dedicated detail modules/styles: `soviet-panel` (`src/soviet-panel-detail.js`), `megabuilding`, `office-building`, `skyscraper`, `slum-shack`.
- Generic detailed styles via `src/generic-house-detail.js`: `classic-cottage`, `nordic-barn`, `modern-pavilion`, `a-frame`, `alpine-chalet`, `mansard-house`.

## Models to add (from docs/houses2 builders/styles) and suitable districts
1. `early-20c-house` (`early_20c_house`) — Дом нач. XX века (кирпич, руст, балконы). Suitable districts: `old_town`, `residential`, `suburb`.
2. `academic-building` (`academic_building`) — Учебный корпус (портик, крылья). Suitable districts: `campus` (primary), `park` (rare civic/landmark).
3. `market-pavilion` (`market_pavilion`) — Рыночный павильон (аркада, навесы). Suitable districts: `market`, `commercial`.
4. `market-row` (`market_row`) — Лавки/ряд магазинов. Suitable districts: `market`, `commercial`, `old_town`.
5. `shopping-mall` (`shopping_mall`) — Торговый молл (атриум, витрины). Suitable districts: `commercial`, `office`.
6. `warehouse` (`warehouse`) — Складской хаб (рампа, ворота, секции). Suitable districts: `industrial`, `parking` (logistics edge).
7. `factory` (`factory`) — Фабрика/завод (цеха, трубы). Suitable districts: `industrial`.
8. `blast-furnace` (`blast_furnace`) — Доменная печь (тяжёлая промзона). Suitable districts: `industrial`.
9. `park-pavilion` (`park_pavilion`) — Парк-павильон (ротонда/беседка). Suitable districts: `park`, `campus`, `sports`, `forest` (rare).
10. `villa` (`villa`) — Вилла (террасы). Suitable districts: `luxury`, `suburb`, `residential`.
11. `stadium` (`stadium`) — Стадион (чаша, трибуны). Suitable districts: `sports`.
12. `parking-booth` (`parking_booth`) — КПП парковки (будка, шлагбаум). Suitable districts: `parking`, `commercial`, `office`, `sports`, `industrial`.
13. `sports-ground` (`sports_ground`) — Спортплощадка (корт, кольца, турники). Suitable districts: `sports`, `park`, `campus`.

## Implementation tasks
- [ ] [TASK-001] Port each builder from `docs/houses2/src/engine/builders/*Builder.ts` to `src/<style>-detail.js` (ES module, local coords, batched meshes, visual-only). Adapt to game conventions (`buildDetailed*`, `make*Materials`).
- [ ] [TASK-002] Integrate render dispatch in `src/json-map.js` and `src/world-map.js` for new `detailedVisual` values; exclude conflicting standard windows/decor rows as needed.
- [ ] [TASK-003] Keep collisions/nav/plates/terrain foundation behavior correct in `src/surfaces.js` for detailed visuals (mute overbuilt geo only).
- [ ] [TASK-004] Extend data/pipeline: `tools/level-schema.mjs` if required, `tools/normalize-level.mjs` passthrough, `tools/citygen/pipeline/stage-4-buildings.mjs` (ARCHETYPES, `DETAILED_VISUAL_BY_KIND`, kind/material/window/roof handling, both main and fallback paths), `tools/citygen/pipeline/stage-3-districts.mjs` district profile `buildings.kinds` for suitable districts.
- [ ] [TASK-005] Add/adjust archetypes and placement params so footprints/scales fit models and remain road/water-safe.
- [ ] [TASK-006] Rebuild/check affected derived artifacts if any source-of-truth data changes; run required checks.
- [ ] [TASK-007] Commit source+derived together, push, run CI (`scripts/agent/ci-watch.mjs`), fix/retry until green, prepare PR.

## CI & Parallelization
- **Worktree/branch:** `C:\Temp\wt-houses2-port`, branch `agent/houses2-port` (from `origin/main`).
- **Parallel-safe/blocked:** isolated from other agents; no concurrent edits to same files expected.
- **CI profile:** `fast` on push for feedback; required checks on PR before merge as per repo policy.
- **Required checks:** `check-levels`/schema/parity checks for any rebuilt level artifacts; browser gates relevant to map/collision/nav/render contract if impacted.
- **Rebuild/check:** `node tools/build-level.mjs` for touched levels (if any), `node tools/check-levels.mjs`, schema export checks if schema changed.
- **Merge target:** PR `agent/houses2-port` -> `main` after green required checks.

## Notes
- Detailed models are visual-only; solids/nav/opora come from building data.
- Respect deterministic generation/order and lifecycle/dispose rules.
- Both `JsonMap` and `WorldMap` render paths must support new models.
