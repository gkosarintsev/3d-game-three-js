# Plan 21 execution state (citygen procedural rules)

Date: 2026-11-19  
Base plan: `.ai/plans/21-citygen-procedural-rules.md`  
Progress/history: `.ai/state/citygen-procedural-rules.md`, `.ai/state/citygen-run-log.md`, `.ai/state/citygen-seed-series/`, `.ai/state/citygen-etalons/`, `.ai/state/citygen-baselines/`  
Protocol: `.ai/plans/22-parallel-agents-github-ci.md`, `.ai/prompts/agent-ci-protocol.md`

## Current position (summary)

- **Generator:** `DEFAULT_GENERATOR_VERSION = 0.64.0` on `origin/main` after merge of PR #9 (`cedfdb9`, 2026-11-19, 0.64.0 partial R4.3 explicit lobby main_entrance portal/connection to adjacent road id). Active continuation: `agent/plan21-r44a-windows-roof` @ `C:\Temp\wt-plan21-r44a` from `origin/main` `cedfdb9` (0.65.0 partial R4.4 typological windows and roof material/color/parapet metadata prepared; CI pending). Staged v4 pipeline (`tools/citygen/index.mjs`, `pipeline/stage-1..6-*`), profiles/policies/validation/metrics/etalons/seed-series tooling developed incrementally.
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
| **R4.3** (placement, foundation, building relief) | **partial** (W1-002 increment merged; §9.5/§9.6 gaps remain) | Stage-4/placement; output-affecting, requires rebuild+CI. |
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
- **PR:** [#1](https://github.com/gkosarintsev/3d-game-three-js/pull/1) (`agent/plan21-wave1-docs` → `main`) — **merged** into `main` at `c239607`
- **Status:** [x] done (merged)

### [TASK-P21-W1-002] R4.3 increment — building placement / foundation / relief (stage-4)
- **Branch/worktree:** `agent/plan21-wave1-r43` / `C:\Temp\wt-plan21-r43` (implementation), continuation for remaining R4.3 gaps: `agent/plan21-wave1-r43b` / `C:\Temp\wt-plan21-r43b` (rebased on `origin/main` `1d50f8a`)
- **Scope:** focused R4.3 increment in `tools/citygen/pipeline/stage-4-buildings.mjs` (+ minimal related/tooling), deterministic rebuild of affected committed derived outputs/etalons/baselines
- **Parallel-safe with:** W1-001 (docs). **Not merge-safe in parallel** with other output-changing branches.
- **Rebuild/check:** rebuild committed derived artifacts deterministically when generation changes; update baselines/etalons per policy; verify `build-level --check`, `check-levels`, citygen tests/etalon/browser gates in CI.
- **PR:** [#2](https://github.com/gkosarintsev/3d-game-three-js/pull/2) (`agent/plan21-wave1-r43` → `main`) — **merged** (merge commit **`1d50f8aec6940c823766c93482d8f8772e6c04ff`**, 2026-11-18T22:56:15Z)
- **Status:** [~] in progress (Wave 1 increment merged; R4.3 §9.5/§9.6 gaps remain, to be continued in `r43b`)

#### What was implemented (merged in PR #2)
- **Setback / line-of-building consistency (§9.5, partial):** replaced center-offset setback heuristic with explicit parcel-edge alignment in `finalizeByAccess`.
  - Building footprint (after deterministic 90° street-aligned rotation) is aligned so the facade/edge facing `parcel.access.edge` sits at the configured per-type setback inside the parcel (`SETBACK_BY_TYPE`), clamped by available parcel depth/width.
  - After alignment, footprint is clamped to remain fully inside parcel AABB with margin (`clampFootprintToParcel`), improving placement consistency and reducing parcel-boundary overflow risk.
  - Fallback to legacy center-shift behavior retained when parcel bounds are unavailable.
- **Containment / intersection robustness:** added deterministic footprint translation/clamping helpers and ensured access-aligned placement respects parcel interior bounds (defense-in-depth alongside existing road/water/reservation conflict checks).
- **Build pipeline robustness (related):** `tools/build-level.mjs` repair loop now also drops conflicting buildings reported as out-of-world (`выходит за землю`) during catalog generation retry, matching existing deterministic drop/repair behavior for water/road conflicts.
- **Versioning / deterministic artifacts:** bumped `DEFAULT_GENERATOR_VERSION` to `0.57.0` (`tools/citygen/config.mjs`) and updated level 16–22 source `generator.generatorVersion` to `0.57.0` for this layout/IR/report-affecting change.
- **Rebuilds (deterministic, committed):** rebuilt `src/levels/level-16..22/` catalogs and `generation-report.json` via `node tools/build-level.mjs src/levels/level-16.json` … `level-22.json`.
- **Regression snapshots updated (committed):**
  - Synthetic etalons `.ai/state/citygen-etalons/*` refreshed with `node tools/citygen-etalon-check.mjs --update --generatorVersion 0.57.0` (gv=0.57.0).
  - Pilot baselines `.ai/state/citygen-baselines/level-16..22.citygen-baseline.json` refreshed to current deterministic runCitygen outputs.
- **Test alignment:** updated pilot level-16 finalize expectations in `tools/citygen.test.mjs` to deterministic fixture output under 0.57.0+R4.3.

#### Validation evidence (local prep hints; CI source of truth)
- `node --check` passed for modified code/tools during increment work: `tools/citygen/pipeline/stage-4-buildings.mjs`, `tools/citygen/config.mjs`, `tools/build-level.mjs`.
- `node tools/citygen-etalon-check.mjs --update --generatorVersion 0.57.0` reported `16/16 passed, 0 failed` after updates (local recompute/update step).

#### CI runs (evidence)
- **Fast CI iteration 1 (failure/retry):** [44406566909](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44406566909), SHA `7ff20d1`, failure in `node / fast checks` (`tools/level-parser.test.mjs` expand deterministic/idempotent) due to out-of-world buildings in expanded level-17 source after R4.3 placement change.
- **Fast CI iteration 2 (failure/retry):** [44407906458](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44407906458), SHA `7fd2407`, same class of failure (bounds clamping insufficient for rotated validation bounds).
- **Fast CI iteration 3 (success):** [44410203971](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44410203971), SHA `c6da16e`, **success** (push, fast profile).
- **Scoped CI iteration 1 (failure/retry):** [44411130067](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44411130067), SHA `da9bacb`, **failure**. Failed: `node / citygen unit tests` (`pilot level-16 v4: generateOutput deterministic` expectations stale vs rebuilt output). Passed: `node / fast checks`, `node / etalon regression`, all `rebuild / build-level --check` shards, browser (`open-world`, `level-contract-lifecycle`, `stream-vehicle-rotated-solid`, `alien`, `misc`). Skipped: `series`. Evidence: `.ai/state/ci-results/agent_plan21-wave1-r43.{json,md,-failed.log}` and downloaded artifacts.
- **Scoped CI iteration 2 (cancelled/invalidated during self-heal):** [44412251395](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44412251395), SHA `170c8fd` (dispatch/head context impacted by concurrency/self-heal sequence) — `node / citygen unit tests` failed with incorrect pilot-fixture expectation fix; other completed jobs mostly green but run validity affected by `cancel-in-progress`. Evidence: `.ai/state/ci-results/agent_plan21-wave1-r43/artifacts/44412251395-manual/citygen.junit.xml`.
- **Fix for scoped iteration 3:** corrected pilot fixture finalize expectations in `tools/citygen.test.mjs` to fixture-actual deterministic values (`roadComponents=1, roadSegments=175, roadNodes=145, buildings=411, props=360, lights=8`, summary errors 0). Commit `b9cd8f1`.
- **Scoped CI iteration 3 (success, pre-rebase evidence):** [44412813693](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44412813693), SHA `b9cd8f15219cdb1d112462b632e5e14eded473f6` (`b9cd8f1`), `workflow_dispatch`, **success** (2026-11-18T22:34:11Z→22:38:29Z), `ci_profile=scoped`, `run_node_extended=true`, `run_browser=true`, `run_full_series=false`. Jobs green: `node / citygen unit tests`, `node / fast checks`, `node / etalon regression`, all `rebuild / build-level --check` shards (07-22), browser `open-world`, `level-contract-lifecycle`, `stream-vehicle-rotated-solid`, `alien`, `misc`, `aggregate / report`; `series` skipped. Evidence: `gh run watch` log `.ai/state/gh-watch-r43-scoped-44412813693.out` (local).
- **Post-evidence state update:** `aceee9f` recorded scoped success in execution state on `agent/plan21-wave1-r43`; branch rebased onto `main` (`c239607`) as `ad131bf` for PR.
- **PR #2 CI (merge gate, rebased head, success):** [44415715903](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44415715903), head SHA `ad131bfcc38d9262fa68ac8ca9901578e7bd7e0e` (`ad131bf`), event `pull_request`, conclusion **success** (2026-11-18T22:52:49Z→22:55:58Z). All jobs green including `node / fast checks`, `node / citygen unit tests`, `node / etalon regression`, all `rebuild / build-level --check` shards, browser `open-world`, `level-contract-lifecycle`, `stream-vehicle-rotated-solid`, `alien`, `misc`, all `series` shards (100×3: plain/transport × hill_town/railway_industrial/river_trade), and `aggregate / report`. Push CI [44415710663](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44415710663) (same head, push event) **success** (2026-11-18T22:52:47Z→22:56:07Z). PR [#2](https://github.com/gkosarintsev/3d-game-three-js/pull/2) merged at 2026-11-18T22:56:15Z, merge commit `1d50f8aec6940c823766c93482d8f8772e6c04ff`.

#### Remaining R4.3 gaps (next work)
- **§9.5 (full coverage):** corner-house specific handling, explicit building-line frontage continuity across adjacent parcels, and coverage-ratio (`maxFootprintRatio`) enforcement refinements.
- **§9.6 (full coverage):** terrain-aware `baseY`/foundation selection per footprint relief delta (median + plinth, stepped plinth / podium / `buildable:false` thresholds), orientation along contours where appropriate, and explicit entrance placement/orientation to sidewalk beyond access-edge alignment/count cues.
- **Cross-cutting validation:** ensure no regressions in chunk/build budgets, navigation/streaming behavior, and all scoped/full gates impacted by rebuilt v4 outputs (per scope, in CI).

#### Notes
- `DEFAULT_GENERATOR_VERSION` bumped `0.56.0 -> 0.57.0` for the merged layout/placement-affecting increment and regenerated derived artifacts.
- Heavy/browser/node/series gate execution is CI-only per protocol.

## Next waves (draft)
- **W1 continuation:** R4.3 remaining (§9.5/§9.6) in `agent/plan21-wave1-r43b` (sequential output-changing increments, rebuild+CI evidence per increment)
- **W2:** R4.4, R5.4, R5.5 (separate branches, sequential merge for output-changing work)
- **W3:** R5.1–R5.3, R2.x remaining (stage-6/stage-2 heavy increments, seed-series/perf evidence)
- **W4:** R6 profiles/pilots/series >=100 seed/etalons/docs, DoD finalization

## Risks and notes
- Output-changing generator work requires strict coordination of derived artifacts and versioning (`generatorVersion` bump policy in `.ai/state/citygen-procedural-rules.md`).
- Fast CI does not cover all heavy gates; use scoped/full confirmation by scope before merge of output-changing branches.
- ~20 concurrent runner limit: avoid excessive parallel full/series runs.
- `.ai/state/ci-results/*` and local watch logs are gitignored/local evidence; do not commit them.

#### Continuation increment (0.58.0, `agent/plan21-wave1-r43b`, scoped CI verified; PR/merge pending)
- **Scope (partial R4.3 §9.5/§9.6):** `tools/citygen/pipeline/stage-4-buildings.mjs`
  - **§9.5 coverage ratio:** enforce parcel build coverage cap from `profile.parcels.coverage`/`maxFootprintRatio` by scaling footprints to `parcelArea * ratio` (deterministic, applied in placement attempts before finalize/conflict checks).
  - **§9.6 terrain/foundation feasibility (partial):** sample 9-point relief stats per candidate footprint (`makeTerrainSampler`), compute median/delta; set `baseY` hint as median + plinth offset; reject footprints where relief delta requires podium/stepped solution not representable by current normalizer/pipeline (`delta > 3.0`, or `1.5 < delta <= 3.0` and `floors > 4`) as deterministic buildable-false equivalent for that footprint attempt.
- **Versioning/artifacts (deterministic, committed):** bump `DEFAULT_GENERATOR_VERSION` `0.57.0 -> 0.58.0` (`tools/citygen/config.mjs`), update `generator.generatorVersion` in `src/levels/level-16..22.json`, rebuild committed derived catalogs/reports for level-16..22, refresh `.ai/state/citygen-baselines/level-16..22*` and `.ai/state/citygen-etalons/*` (`--update --generatorVersion 0.58.0`, 16/16 passed), update pilot fixture finalize expectations in `tools/citygen.test.mjs` (fixture `tools/fixtures/level-16-pilot.json`: `roadComponents=1, roadSegments=176, roadNodes=146, buildings=415, props=360, lights=8`, errors 0).
- **Commits:** implementation `8bc49ffae47d0770336673bfadcdfcaf38a64c6f`; determinism repair `5b3d182a5f2a25bf96ddcacd3c11df0b705311ae` (rebuilt `src/levels/level-16/generation-report.json` after source gv bump; baseline hash unchanged).
- **Local prep checks (hints):** `node --check tools/citygen/pipeline/stage-4-buildings.mjs` OK; `node tools/build-level.mjs src/levels/level-16..22.json` completed with 0 warnings for each level; pilot fixture deterministic counts recomputed via `generateOutput(..., 'src/levels/level-16.json')`.
- **CI evidence:**
  - **Fast (push, head `8bc49ff`):** [44417915324](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44417915324) **success** (2026-11-18T23:07:16Z→23:10:02Z), jobs green: `node / fast checks`, `aggregate / report`; extended/browser/series jobs skipped by fast profile.
  - **Scoped dispatch (head `8bc49ff`, `ci_profile=scoped`, `run_node_extended=true`, `run_browser=true`, `run_full_series=false`):** [44418591416](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44418591416) **failed/cancelled during self-heal**. Completed before cancellation: `rebuild / build-level --check (levels-10-15-16)` **failure** — `generation-report.json` mismatch for `src/levels/level-16.json` (report embedded `generatorVersion` 0.57.0 vs 0.58.0 due to rebuild order). Other completed jobs green: rebuild shards 07-08-09/17-18-19/20-21-22, `node / citygen unit tests`, `node / etalon regression`, browser `open-world`, `stream-vehicle-rotated-solid`, `alien`, `misc`.
  - **Scoped dispatch (head `5b3d182`, `ci_profile=scoped`, `run_node_extended=true`, `run_browser=true`, `run_full_series=false`):** [44419295633](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44419295633) **success** (2026-11-18T23:16:27Z→~23:20Z). Jobs green: `node / fast checks`, `node / citygen unit tests`, `node / etalon regression`, all `rebuild / build-level --check` shards (07-08-09, 10-15-16, 17-18-19, 20-21-22), browser `open-world`, `level-contract-lifecycle`, `stream-vehicle-rotated-solid`, `alien`, `misc`, `aggregate / report`; `series` skipped. Push fast run [44419275429](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44419275429) for same head cancelled by per-ref concurrency after scoped dispatch (not a code failure).
- **Integration (completed):** PR [#3](https://github.com/gkosarintsev/3d-game-three-js/pull/3) merged to `main` at 2026-11-18T23:27:24Z (merge commit `b5d60bd29d0ecb4e99ad7b746783fc9d553b96db`). PR CI (head `1c20bb5`, `pull_request`): [44420204314](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44420204314) **success** (2026-11-18T23:22:35Z→~23:27Z), all jobs green including fast/node/citygen/etalon/rebuild shards, browser suites, and 100×3 seed-series shards (plain/transport × hill_town/railway_industrial/river_trade), `aggregate / report` success. Push CI [44420195718](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44420195718) (same head) **success**.
- **Still remaining in R4.3 (after 0.58.0):** corner-house specific placement semantics, explicit building-line frontage continuity across adjacent parcels, contour-aligned orientation where appropriate, explicit entrance placement/orientation to sidewalk (beyond count/alignment cues), and full stepped-plinth/podium representation if/when supported by normalizer/runtime/schema; broader chunk/build/navigation/streaming validation in CI for rebuilt outputs.

#### Continuation increment (0.59.0, `agent/plan21-r43c-corner-entrance`, prepared; CI pending)
- **Scope (partial R4.3 §9.5/§9.6):** `tools/citygen/pipeline/stage-3-districts.mjs`, `tools/citygen/pipeline/stage-4-buildings.mjs`
  - **§9.5 parcel/access (partial):** mark grid-corner parcels (`access.corner`, `cornerEdges`) to support corner-house/frontage cues.
  - **§9.5 corner placement (partial):** propagate `_accessEdge`/`_cornerAccess` during placement (including fallback fill), bias `finalizeByAccess` toward secondary corner edge with bounded shift while preserving primary setback/frontage alignment.
  - **§9.6 entrance/stair placement (partial):** place enterable building stair core near the street-access facade/corner (inside inner bounds) instead of geometric center, as an entrance-to-sidewalk/access cue (no schema/normalizer changes).
  - **Emit hygiene:** strip transient `_accessEdge`/`_cornerAccess` before emitting source buildings.
- **Versioning/artifacts (deterministic, prepared):** bump `DEFAULT_GENERATOR_VERSION` `0.58.0 -> 0.59.0` (`tools/citygen/config.mjs`), update `generator.generatorVersion` in `src/levels/level-16..22.json`, rebuild committed derived catalogs/reports for level-16..22 (0 warnings), refresh `.ai/state/citygen-baselines/level-16..22*` and `.ai/state/citygen-etalons/*` (`--update --generatorVersion 0.59.0`, 9/9 etalons + summary updated). Pilot fixture finalize expectations (`tools/citygen.test.mjs`, `tools/fixtures/level-16-pilot.json`) unchanged (`roadComponents=1, roadSegments=176, roadNodes=146, buildings=415, props=360, lights=8`).
- **Local prep checks (hints only):** `node --check` for modified pipeline files OK; `node tools/build-level.mjs src/levels/level-16..22.json` completed with 0 warnings.
- **Commit:** `8291339568c20384e9062ad23faac54996dc4115` (`8291339`, pushed to `origin/agent/plan21-r43c-corner-entrance`).
- **CI evidence:**
  - **Fast (push, head `8291339`):** [44421621490](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44421621490) **success** (2026-11-18T23:32:31Z→~23:35Z), jobs green: `node / fast checks`, `aggregate / report`; extended/browser/series jobs skipped by fast profile.
  - **Scoped dispatch (head `18afe0f`, docs-only over `8291339`, `ci_profile=scoped`, `run_node_extended=true`, `run_browser=true`, `run_full_series=false`):** [44422063331](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44422063331) **success** (2026-11-18T23:35:35Z→~23:40Z). Jobs green: `node / fast checks`, `node / citygen unit tests`, `node / etalon regression`, all `rebuild / build-level --check` shards (07-08-09, 10-15-16, 17-18-19, 20-21-22), browser `open-world`, `level-contract-lifecycle`, `stream-vehicle-rotated-solid`, `alien`, `misc`, `aggregate / report`; `series` skipped.
  - **Integration:** PR [#4](https://github.com/gkosarintsev/3d-game-three-js/pull/4) (`agent/plan21-r43c-corner-entrance` → `main`, head `501e2bd`) opened for sequential merge of 0.59.0. PR CI [44422779378](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44422779378) (`pull_request`) **in progress/queued** at time of recording (includes full checks incl. 100×3 series shards per workflow); merge only on green required checks. Push fast CI [44422726687](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44422726687) in progress for docs head.
- **Still remaining in R4.3:** stronger explicit building-line frontage continuity across adjacent parcels, contour-aligned orientation where appropriate, explicit entrance/door orientation semantics to sidewalk beyond stair/access cues, and full stepped-plinth/podium representation if/when supported by normalizer/runtime/schema; cross-cutting chunk/build/navigation/streaming validation in CI for rebuilt outputs.

#### Continuation increment (0.60.0, `agent/plan21-r43d-frontage`, in progress)
- **Scope (partial R4.3 §9.5, frontage continuity):** `tools/citygen/pipeline/stage-4-buildings.mjs`
  - **§9.5 building-line/frontage continuity (partial):** align access-facing facades to an explicit continuous frontage target from parcel street boundary (`street edge ± desired setback` per type) for adjacent parcels on the same frontage band; best-effort frontage-preserving parcel clamp (avoid shifting the street-facing facade to fix opposite overflow when the building can remain valid) to reduce facade-line drift.
  - **Emit hygiene:** unchanged (transient access fields stripped as in 0.59.0).
- **Versioning/artifacts (deterministic, prepared):** bump `DEFAULT_GENERATOR_VERSION` `0.59.0 -> 0.60.0` (`tools/citygen/config.mjs`), update `generator.generatorVersion` in `src/levels/level-16..22.json`, deterministically rebuild committed derived catalogs/reports for level-16..22 (0 warnings), refresh `.ai/state/citygen-baselines/level-16..22*` and `.ai/state/citygen-etalons/*` (`--update --generatorVersion 0.60.0 --skip-baselines`, 9/9 etalons + summary updated). Pilot fixture `tools/fixtures/level-16-pilot.json` finalize expectations unchanged (`roadComponents=1, roadSegments=176, roadNodes=146, buildings=415, props=360, lights=8`, errors 0).
- **Local prep checks (hints only):** `node --check` for modified files OK; `node tools/build-level.mjs src/levels/level-16..22.json` completed with 0 warnings; baselines/etalons updated locally.
- **Commit:** `8669fff05306d6b9122e530a9c064f4378a9f9de` (`8669fff`, pushed to `origin/agent/plan21-r43d-frontage`).
- **CI evidence (head `8669fff`):**
  - **Fast (push):** [44425130697](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44425130697) **success** (2026-11-18T23:58:01Z→~00:00Z), jobs green: `node / fast checks`, `aggregate / report`; extended/browser/rebuild/citygen/etalon/series jobs skipped by fast profile.
  - **Scoped dispatch (`ci_profile=scoped`, `run_node_extended=true`, `run_browser=true`, `run_full_series=false`):** [44425763413](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44425763413) **success** (2026-11-18T~00:02Z→~00:07Z). Jobs green: `node / fast checks`, `node / citygen unit tests`, `node / etalon regression`, all `rebuild / build-level --check` shards (07-08-09, 10-15-16, 17-18-19, 20-21-22), browser `open-world`, `level-contract-lifecycle`, `stream-vehicle-rotated-solid`, `alien`, `misc`, `aggregate / report`; `series` skipped.
- **Integration (completed):** PR [#5](https://github.com/gkosarintsev/3d-game-three-js/pull/5) merged to `main` at 2026-11-19T00:12:59Z (merge commit `8baa125db164433f0ce7b2fae2dcacc05d6ed9be`). PR CI [44426619238](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44426619238) (head `2fbd336`, `pull_request`) **success** (all jobs green incl. node fast/citygen/etalon/rebuild shards, browser suites, full 100×3 seed-series plain+transport, `aggregate / report`). Push CI [44426568779](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44426568779) (head `2fbd336`) **success**.
- **Still remaining in R4.3:** stronger adjacency-aware frontage continuity across parcel groups/blocks, contour-aligned orientation where appropriate, explicit entrance/door orientation semantics to sidewalk beyond stair/access cues, and full stepped-plinth/podium representation if/when supported by normalizer/runtime/schema; cross-cutting chunk/build/navigation/streaming validation in CI for rebuilt outputs.

#### Continuation increment (0.61.0, `agent/plan21-r43e-frontage-block`, integrated)
- **Scope (partial R4.3 §9.5, corner secondary-frontage building line):** `tools/citygen/pipeline/stage-4-buildings.mjs` — for corner parcels, align the building to the secondary street frontage building line as well (`street edge ± desired setback` per type on secondary access edge) while shifting toward the corner, preserving the primary facade line (bounded shift + existing clamp safeguards).
- **Versioning/artifacts:** `DEFAULT_GENERATOR_VERSION` `0.60.0 -> 0.61.0`, `src/levels/level-16..22.json` bumped, `src/levels/level-16..22/*` rebuilt (0 warnings), `.ai/state/citygen-baselines/level-16..22*` and `.ai/state/citygen-etalons/*` refreshed (`--update --generatorVersion 0.61.0 --skip-baselines`, 9/9). Pilot fixture expectations unchanged.
- **Integration (completed):** PR [#6](https://github.com/gkosarintsev/3d-game-three-js/pull/6) merged to `main` at 2026-11-19T00:30:49Z (merge commit `45897047facc977589c77ab802eab65f5b12686a`, head `23e305e`). PR CI [44429043979](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44429043979) **success** (full merge-gate incl. node fast/citygen/etalon/rebuild shards, browser suites, 100×3 seed-series plain+transport, `aggregate / report`). Scoped evidence for code head `7ca37e2`: [44428212372](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44428212372) **success**; fast push [44428171312](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44428171312) cancelled by per-ref concurrency (no code failure).

#### Continuation increment (0.62.0, `agent/plan21-r43f-frontage-block-adj`, integrated)
- **Scope (partial R4.3 §9.5, adjacency-aware frontage continuity across parcel groups/blocks):** stage-4 computes deterministic frontage groups (same access edge, compatible street-edge datum with block/inset tolerance, touching/overlapping frontage projections) and aligns buildings to a shared canonical (street-most) group building-line datum for continuous facade lines across adjacent parcel groups/blocks.
- **Versioning/artifacts:** `DEFAULT_GENERATOR_VERSION` `0.61.0 -> 0.62.0`, `src/levels/level-16..22.json` bumped, `src/levels/level-16..22/*` rebuilt (0 warnings), baselines/etalons refreshed (`--update --generatorVersion 0.62.0 --skip-baselines`, 9/9). Pilot fixture expectations unchanged.
- **Integration (completed):** PR [#7](https://github.com/gkosarintsev/3d-game-three-js/pull/7) merged to `main` at 2026-11-19T00:42:57Z (merge commit `3fa1ceb7fbe551da0694b7a50a01fe23b6602bae`, head `f64433e`). PR CI [44430722418](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44430722418) **success** (full merge-gate incl. node fast/citygen/etalon/rebuild shards, browser suites, 100×3 seed-series plain+transport, `aggregate / report`).

#### Continuation increment (0.63.0, `agent/plan21-r43g-entrance-orient`, integrated)
- **Scope (partial R4.3 §9.6, explicit entrance/stair orientation to sidewalk/access facade):** stage-4 orients straight stair runs for enterable buildings so the bottom/entry faces the street-access (sidewalk) facade edge and the run ascends inward (rotation derived from `accessEdge`), instead of generic building rotation. Complements 0.59.0 stair placement near access facade/corner.
- **Versioning/artifacts:** `DEFAULT_GENERATOR_VERSION` `0.62.0 -> 0.63.0`, `src/levels/level-16..22.json` bumped, `src/levels/level-16..22/*` rebuilt (0 warnings), baselines/etalons refreshed (`--update --generatorVersion 0.63.0 --skip-baselines`, 9/9). Pilot fixture expectations unchanged.
- **Integration (completed):** PR [#8](https://github.com/gkosarintsev/3d-game-three-js/pull/8) merged to `main` at 2026-11-19T00:53:08Z (merge commit `3386cfd2cb95ab2ff216290968038876873e9462`, head `326e836`). PR CI [44431955346](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44431955346) **success** (full merge-gate incl. node fast/citygen/etalon/rebuild shards, browser suites, 100×3 seed-series plain+transport, `aggregate / report`); push CI [44431909857](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44431909857) **success**.

#### Continuation increment (0.64.0, `agent/plan21-r43h-contour-orient`, integrated)
- **Scope (partial R4.3 §9.6, explicit lobby entrance/door portal semantics to sidewalk, schema-valid):** for enterable buildings with street access, add lobby (floor 0) `main_entrance` connection on the street-access facade edge with `portalPosition` and `target` resolved to the nearest adjacent road segment id (≤40 m, schema-valid road target), so normalize-level emits an outward-facing entrance door linked to a real street segment. Complements 0.59.0 stair placement and 0.63.0 stair-entry orientation.
- **Versioning/artifacts:** `DEFAULT_GENERATOR_VERSION` `0.63.0 -> 0.64.0`, `src/levels/level-16..22.json` bumped, `src/levels/level-16..22/*` rebuilt (0 warnings), baselines/etalons refreshed (`--update --generatorVersion 0.64.0 --skip-baselines`, 9/9). Pilot fixture finalize expectations unchanged.
- **Integration (completed):** PR [#9](https://github.com/gkosarintsev/3d-game-three-js/pull/9) merged to `main` at 2026-11-19T01:08:24Z (merge commit `cedfdb9a252f30e73420616ee1307379fecb9c96`, head `6fdb73e`). PR CI [44434009491](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44434009491) **success** (full merge-gate incl. node fast/citygen/etalon/rebuild shards, browser suites, 100×3 seed-series plain+transport, `aggregate / report`); push CI [44433958412](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44433958412) **success**.

#### Continuation increment (0.65.0, `agent/plan21-r44a-windows-roof`, in progress)
- **Scope (partial R4.4 §9.7, typological windows and roof material/color/parapet metadata):** `tools/citygen/pipeline/stage-4-buildings.mjs`
  - **§9.7 windows/roof appearance data (partial, schema/runtime-supported):** assign deterministic, typology-aware `windowDensity`/`windowScale` by building kind/district/floors and deterministic `roofMaterial`/`roofColor` palettes plus explicit `roof: { walkable: false, parapet: 0 }` metadata per building (applied to main and fallback placement paths). Uses schema-supported fields (`windowDensity`, `windowScale`, `roofMaterial`, `roofColor`, `roof`) and normalizer-supported mapping; walkable/parapet kept nav-safe.
- **Versioning/artifacts (deterministic, prepared):** bump `DEFAULT_GENERATOR_VERSION` `0.64.0 -> 0.65.0` (`tools/citygen/config.mjs`), update `generator.generatorVersion` in `src/levels/level-16..22.json`, deterministically rebuild committed derived catalogs/reports for level-16..22 (0 warnings), refresh `.ai/state/citygen-baselines/level-16..22*` and `.ai/state/citygen-etalons/*` (`--update --generatorVersion 0.65.0 --skip-baselines`, 9/9 etalons + summary updated). Pilot fixture `tools/fixtures/level-16-pilot.json` finalize expectations unchanged (`roadComponents=1, roadSegments=176, roadNodes=146, buildings=415, props=360, lights=8`, errors 0).
- **Local prep checks (hints only):** `node --check` for modified files OK; `node tools/build-level.mjs src/levels/level-16..22.json` completed with 0 warnings; baselines/etalons updated locally.
- **CI:** pending (commit/push fast + scoped/full by scope per protocol; CI source of truth). Sequential merge only on green required checks.
- **Still remaining in R4.4:** district palette/variation policies beyond current material/color logic, explicit night/window-lit appearance semantics as supported, richer roof/parapet/equipment variation and any additional façade rhythm rules within supported data/runtime. R4.3 residuals (contour-aligned orientation where feasible, stepped-plinth/podium if supported) and R5.x/R0/R2/R3 gaps/R6 remain open.


