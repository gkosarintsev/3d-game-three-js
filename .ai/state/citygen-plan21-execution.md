# Plan 21 execution state (citygen procedural rules)

Date: 2026-11-19  
Base plan: `.ai/plans/21-citygen-procedural-rules.md`  
Progress/history: `.ai/state/citygen-procedural-rules.md`, `.ai/state/citygen-run-log.md`, `.ai/state/citygen-seed-series/`, `.ai/state/citygen-etalons/`, `.ai/state/citygen-baselines/`  
Protocol: `.ai/plans/22-parallel-agents-github-ci.md`, `.ai/prompts/agent-ci-protocol.md`

## Current position (summary)

- **Generator:** `DEFAULT_GENERATOR_VERSION = 0.57.0` in this R4.3 increment branch (`tools/citygen/config.mjs`; main/docs wave tracked 0.56.0 before merge of R4.3 work). Staged v4 pipeline (`tools/citygen/index.mjs`, `pipeline/stage-1..6-*`), profiles/policies/validation/metrics/etalons/seed-series tooling developed incrementally.
- **Gates/artifacts:** `tools/citygen.test.mjs`, `tools/citygen-etalon-check.mjs`, `tools/citygen-seed-series.mjs`, `tools/check-levels.mjs`, `tools/build-level.mjs --check`, browser suites by scope/CI; committed derived outputs and etalon/baseline snapshots are part of determinism/regression.
- **Constraint:** any IR/report/derived level output changes require deterministic rebuild of committed artifacts and baseline/etalon updates per version policy, verified in GitHub CI.

## Remaining plan 21 areas (focus)

| Area | Status (indicative) | Note / risk |
| --- | --- | --- |
| R0 (validator/metrics/etalons/procedures) | mostly implemented, DoD/formalization in places | Expanding rules/metrics changes reports → etalons/baselines/reports. |
| R1 (relief/water) | mostly implemented | Further changes output-affecting. |
| R2 (network/intersections/bridges/tunnels/interchanges/repair) | partial | High coupling, perf/navigation risks. |
| R3 (settlement/districts/D,B(D)) | mostly implemented | Metrics/series sensitive. |
| R4.1,R4.2,R4.5,R4.6 | done (per plan/history) | Possible follow-ups within R4.3/R4.4. |
| **R4.3** (placement, foundation, building relief) | **partial/increment in progress** | Stage-4/placement; output-affecting, requires rebuild+CI. |
| **R4.4** (appearance/palettes/windows/roofs) | **open** | Visual/data, output-affecting. |
| **R5.1** (controlled chaos) | open | Behavior/layout change; versioning per policy. |
| **R5.2** (readability/landmarks) | open | Metrics/heuristics + possible placement changes. |
| **R5.3** (gameplay spawn/exit/cars/enemies) | open | Gameplay/connectivity/rules. |
| **R5.4** (`locked`, `instance.generation`) | open | Plumbing without regressions. |
| **R5.5** (`homeChunk`/`coverageChunks`, streaming) | open | Chunk/build pipeline, catalog rebuilds. |
| **R6** (profiles, pilots, >=100 seed, etalons, docs/CI) | open/partial | Series runs and regression in CI. |

## Wave 1

### [TASK-P21-W1-001] Docs/state + CI & Parallelization for plan 21
- **Branch/worktree:** `agent/plan21-wave1-docs` / `C:\Temp\wt-plan21-docs`
- **Scope:** `.ai/plans/21-citygen-procedural-rules.md` (added `### CI & Parallelization`), execution tracking state
- **CI:** fast CI [44404617272](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44404617272) **success** (head `ae456a3`); PR CI [44411232612](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44411232612) **success**
- **PR:** [#1](https://github.com/gkosarintsev/3d-game-three-js/pull/1) (`agent/plan21-wave1-docs` → `main`) — **merged** (Wave 1 docs integrated)
- **Status:** [x] done (merged)

### [TASK-P21-W1-002] R4.3 increment — building placement / foundation / relief (stage-4)
- **Branch/worktree:** `agent/plan21-wave1-r43` / `C:\Temp\wt-plan21-r43` (base `origin/main`)
- **Scope:** focused R4.3 increment in `tools/citygen/pipeline/stage-4-buildings.mjs` (+ minimal related/tooling), deterministic rebuild of affected committed derived outputs/etalons/baselines
- **Parallel-safe with:** W1-001 (docs). **Not merge-safe in parallel** with other output-changing branches.
- **CI profile:** fast for iterations; scoped/full by scope before merge. Scoped evidence (no full 100×3 series): [44412813693](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44412813693) **success** on `b9cd8f1`.
- **Rebuild/check:** rebuild committed derived artifacts deterministically when generation changes; update baselines/etalons per policy; verify `build-level --check`, `check-levels`, citygen tests/etalon/browser gates in CI.
- **Merge target:** PR → `main` (sequential, after docs; resolve output-changing conflicts deterministically)
- **Status:** [~] in progress (scoped CI green for increment; integration/rebase+PR pending)

#### What was implemented
- **Setback / line-of-building consistency (§9.5):** replaced center-offset setback heuristic with explicit parcel-edge alignment in `finalizeByAccess`.
  - Building footprint (after deterministic 90° street-aligned rotation) is aligned so the facade/edge facing `parcel.access.edge` sits at the configured per-type setback inside the parcel (`SETBACK_BY_TYPE`), clamped by available parcel depth/width.
  - After alignment, footprint is clamped to remain fully inside parcel AABB with margin (`clampFootprintToParcel`), improving placement consistency and reducing parcel-boundary overflow risk.
  - Fallback to legacy center-shift behavior retained when parcel bounds are unavailable.
- **Containment / intersection robustness:** added deterministic footprint translation/clamping helpers and ensured access-aligned placement respects parcel interior bounds (defense-in-depth alongside existing road/water/reservation conflict checks).
- **Build pipeline robustness (related):** `tools/build-level.mjs` repair loop now also drops conflicting buildings reported as out-of-world (`выходит за землю`) during catalog generation retry, matching existing deterministic drop/repair behavior for water/road conflicts.
- **Versioning / deterministic artifacts:** bumped `DEFAULT_GENERATOR_VERSION` to `0.57.0` (`tools/citygen/config.mjs`) and updated level 16–22 source `generator.generatorVersion` to `0.57.0` for this layout/IR/report-affecting change.
- **Rebuilds (deterministic prep, committed):** rebuilt `src/levels/level-16..22/` catalogs and `generation-report.json` via `node tools/build-level.mjs src/levels/level-16.json` … `level-22.json`.
- **Regression snapshots updated (committed):**
  - Synthetic etalons `.ai/state/citygen-etalons/*` refreshed with `node tools/citygen-etalon-check.mjs --update --generatorVersion 0.57.0` (gv=0.57.0).
  - Pilot baselines `.ai/state/citygen-baselines/level-16..22.citygen-baseline.json` refreshed to current deterministic runCitygen outputs.

#### Validation evidence (local prep hints; CI source of truth)
- `node --check` passed for modified code/tools: `tools/citygen/pipeline/stage-4-buildings.mjs`, `tools/citygen/config.mjs`, `tools/build-level.mjs`.
- `node tools/citygen-etalon-check.mjs --update --generatorVersion 0.57.0` reported `16/16 passed, 0 failed` after updates (local recompute/update step).

<<<<<<< HEAD
#### CI runs (evidence)
- **Fast CI iteration 1 (failure/retry):** [44406566909](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44406566909), SHA `7ff20d1`, failure in `node / fast checks` (`tools/level-parser.test.mjs` expand deterministic/idempotent) due to out-of-world buildings in expanded level-17 source after R4.3 placement change.
- **Fast CI iteration 2 (failure/retry):** [44407906458](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44407906458), SHA `7fd2407`, same class of failure (bounds clamping insufficient for rotated validation bounds).
- **Fast CI iteration 3 (success):** [44410203971](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44410203971), SHA `c6da16e`, **success** (push, fast profile).
- **Scoped CI iteration 1 (failure/retry):** [44411130067](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44411130067), SHA `da9bacb`, **failure**. Failed: `node / citygen unit tests` (`pilot level-16 v4: generateOutput deterministic` expectations stale vs rebuilt output). Passed: `node / fast checks`, `node / etalon regression`, all `rebuild / build-level --check` shards, browser (`open-world`, `level-contract-lifecycle`, `stream-vehicle-rotated-solid`, `alien`, `misc`). Skipped: `series`. Evidence: `.ai/state/ci-results/agent_plan21-wave1-r43.{json,md,-failed.log}` and downloaded artifacts.
- **Scoped CI iteration 2 (cancelled/failed during self-heal):** [44412251395](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44412251395), SHA `170c8fd` (dispatch on prior head context impacted by concurrency/self-heal sequence) — `node / citygen unit tests` failed with incorrect pilot-fixture expectation fix; other completed jobs mostly green but run validity affected by `cancel-in-progress`. Evidence: `.ai/state/ci-results/agent_plan21-wave1-r43/artifacts/44412251395-manual/citygen.junit.xml`.
- **Fix for scoped iteration 3:** corrected pilot fixture finalize expectations in `tools/citygen.test.mjs` to fixture-actual deterministic values (`roadComponents=1, roadSegments=175, roadNodes=145, buildings=411, props=360, lights=8`, summary errors 0). Commit `b9cd8f1`.
- **Scoped CI iteration 3 (success, merge-evidence for increment):** [44412813693](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44412813693), SHA `b9cd8f15219cdb1d112462b632e5e14eded473f6` (`b9cd8f1`), `workflow_dispatch`, **success** (2026-11-18T22:34:11Z→22:38:29Z), `ci_profile=scoped`, `run_node_extended=true`, `run_browser=true`, `run_full_series=false`. Jobs green: `node / citygen unit tests`, `node / fast checks`, `node / etalon regression`, all `rebuild / build-level --check` shards (07-22), browser `open-world`, `level-contract-lifecycle`, `stream-vehicle-rotated-solid`, `alien`, `misc`, `aggregate / report`; `series` skipped. Evidence: `gh run watch` log `.ai/state/gh-watch-r43-scoped-44412813693.out` (local).
- **Post-evidence state update:** `aceee9f` records scoped success in execution state on `agent/plan21-wave1-r43`.
=======
### CI runs

- **Iteration 1 (fast, failure/retry):** run [44406566909](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44406566909), SHA `7ff20d1`, conclusion `failure`. Failed: `node / fast checks` (`Сюита парсера глав из брифа` / `tools/level-parser.test.mjs`, test "expand детерминирован, идемпотентен и не мутирует исходный бриф") with out-of-world buildings in expanded level-17 source (`buildings[251] b_district_0_3_0_252`, `buildings[395] b_district_0_3_0_397`, x < -640 on 1280m world). `ci-watch`: `nextAction=retry`, `errorClass=determinism`. Local result files: `.ai/state/ci-results/agent_plan21-wave1-r43.{json,md,-failed.log}`.
- **Fix for iteration 2 (insufficient):** added deterministic world-bounds clamping of raw footprint points in stage-4 `finalizeByAccess` and rebuilt artifacts; did not account for validator rotation of building bounds.
- **Iteration 2 (fast, failure/retry):** run [44407906458](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44407906458), SHA `7fd2407`, conclusion `failure`. Same fast-check failure: `tools/level-parser.test.mjs` "expand детерминирован, идемпотентен и не мутирует исходный бриф" with expanded level-17 buildings `b_district_0_3_0_252` / `b_district_0_3_0_397` out of world. `ci-watch` (`--iteration 2`): `nextAction=retry`, `errorClass=determinism`.
- **Fix for iteration 3 (root cause):** stage-4 stores a world-oriented footprint together with `rotation=yaw`, while `validateLevel` (v4/open) computes the effective outline as `rotatedBounds(polyBounds(footprint), frameOf(bounds, rotation))`. Clamping raw footprint points left the rotated outline exceeding world bounds near the -X edge. Updated `tools/citygen/pipeline/stage-4-buildings.mjs` to clamp against the **rotated outline** (`clampFootprintToWorld(fp, worldHalf, rotation, margin)` via `src/geo2d.js` `polyBounds/frameOf/rotatedBounds`).
- **Deterministic rebuild/update (iteration 3 prep):** rebuilt `src/levels/level-16..22/` catalogs and `generation-report.json` (`node tools/build-level.mjs ...`, 0 warnings). Refreshed pilot baselines (`node tools/citygen-baseline.mjs --out .ai/state/citygen-baselines src/levels/level-16..22.json`) and synthetic etalons (`node tools/citygen-etalon-check.mjs --update --generatorVersion 0.57.0`: 16/16 passed, 2 updated incl. `railway_industrial-seed303` and summary; report hashes for pilot levels unchanged, geometry/catalog chunks updated where placement changed). Local checks: `node --check tools/citygen/pipeline/stage-4-buildings.mjs`; `expandCityforgeSource` + `validateLevel(..., LEVEL_SPEC_V4)` for `src/levels/level-17.json` reports 0 out-of-world errors; reverted unintended diagnostic edit in `tools/level-parser.test.mjs`.
- **Iteration 3 (fast, success):** run [44410203971](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44410203971), SHA `c6da16e`, conclusion `success` (fast profile). Passed: `node / fast checks` (incl. `Сюита парсера глав из брифа` / `tools/level-parser.test.mjs`, determinism/warnings/bytes checks, chunking, level-model, codec/baked ground) and `aggregate / report`. Skipped by fast profile: `node / citygen unit tests`, `node / etalon regression`, `rebuild / build-level --check` shards, `browser` matrix, `series`. `ci-watch` (`--iteration 3`): `nextAction=success`, `errorClass=none`. Local result files: `.ai/state/ci-results/agent_plan21-wave1-r43.{json,md,-failed.log}`.
- **Scoped/full checks still required before merge:** run/confirm required scoped/full CI gates for impacted scope (`node / citygen unit tests`, `node / etalon regression`, `rebuild / build-level --check` shards, `browser` suites, series as applicable). Fast CI green for this increment does not replace those gates.

### Remaining R4.3 gaps (not addressed in this increment)
>>>>>>> c6da16e (fix(citygen): clamp R4.3 building outlines to world bounds and rebuild artifacts)

#### Remaining R4.3 gaps (not addressed in this increment)
- Full §9.5 coverage: corner-house specific handling, explicit building-line frontage continuity across adjacent parcels, and coverage-ratio (`maxFootprintRatio`) enforcement refinements.
- Full §9.6 coverage: terrain-aware `baseY`/foundation selection per footprint relief delta (median + plinth, stepped plinth / podium / `buildable:false` thresholds), orientation along contours where appropriate, and explicit entrance placement/orientation to sidewalk beyond access-edge alignment/count cues.
<<<<<<< HEAD
- Broader validation: ensure no regressions in chunk/build budgets, navigation/streaming behavior, and all scoped/full gates impacted by rebuilt v4 outputs as scope expands.
=======
- Broader validation: ensure no regressions in chunk/build budgets, navigation/streaming behavior, and all scoped/full gates impacted by rebuilt v4 outputs (fast CI green on `c6da16e`; scoped/full matrix still pending).

### Notes
>>>>>>> da9bacb (docs(state): record successful fast CI iteration 3 for plan21 R4.3)

#### Notes
- `DEFAULT_GENERATOR_VERSION` bumped `0.56.0 -> 0.57.0` due to layout/placement-affecting building generation changes and regenerated derived artifacts.
- Heavy/browser/node gate execution deferred to CI per protocol.

## Next waves (draft)
- **W2:** R4.4, R5.4, R5.5 (separate branches, sequential merge for output-changing work)
- **W3:** R5.1–R5.3, R2.x remaining (stage-6/stage-2 heavy increments, seed-series/perf evidence)
- **W4:** R6 profiles/pilots/series >=100 seed/etalons/docs, DoD finalization

## Risks and notes
- Output-changing generator work requires strict coordination of derived artifacts and versioning (`generatorVersion` bump policy in `.ai/state/citygen-procedural-rules.md`).
- Fast CI does not cover all heavy gates; use scoped/full confirmation by scope before merge of output-changing branches.
- ~20 concurrent runner limit: avoid excessive parallel full/series runs.
