# PLAN 25 — Code Quality, Refactoring, Bug Hunt, and Test Coverage

## Goal
Improve maintainability and reliability of the codebase through targeted refactoring, systematic bug hunting, and stronger automated test coverage, without changing gameplay/content contracts unless explicitly required and verified.

## Current baseline (2026-11-21)
- Large/hotspot modules by size: `src/json-map.js` (~194 KB), `tools/normalize-level.mjs` (~167 KB), `tools/city.js` (~151 KB), `src/surfaces.js` (~131 KB), `tools/level-schema.mjs` (~126 KB), `src/world-map.js` (~96 KB), `src/alien.js` (~60 KB).
- Browser/node test surface exists (`tests/*.test.js`, `tools/*.test.mjs`, CI fast/browser/series/rebuild gates), but some recently touched rendering paths have limited regression coverage (e.g. rotated detailed-building visual dimensions).
- Recent bug class found and fixed: world AABB bounds passed as local detailed-building dimensions without 90/270 swap (`src/json-map.js`, PR #80). Similar AABB/rotation/local-space assumptions should be audited.

## Scope / constraints
- Follow `AGENTS.md`: ES modules, no bundler/framework/new npm deps unless explicitly requested; deterministic generation/order; no local heavy/browser gates as source of truth (CI is source of truth).
- Map contract in `src/map.js` and runtime invariants in `docs/architecture-*` are mandatory. Any contract/signature change must update all consumers and tests.
- Refactors must be behavior-preserving unless a bug fix is intentional and documented by tests.
- One task/agent = one worktree + one branch + PR; merge only after required CI checks are green.

## Workstreams

### A. Bug hunt (high-value/risk-first)
- [x] [BUG-001] **Rotation/AABB/local-space audit** (first pass, 2026-11-21, `agent/plan25-bug001-rotation-audit`)
  - Audited `src/json-map.js`, `src/world-map.js`, `src/surfaces.js`, `tools/normalize-level.mjs`, `tools/citygen/*`, `src/panelka-decor.js`.
  - Confirmed PR #80 fix in `JsonMap._buildDetailedBuildings`; extracted `detailedLocalDims(bounds, rotation)` and reused it to centralize 90/270 swap.
  - `WorldMap` delegates detailed visuals to `JsonMap` — covered by same path. `panelka-decor.js` uses world-AABB bounds for axis-aligned world-space decor (correct for already-baked world footprints). `normalize-level.mjs` bounds sampling is world-space terrain sampling (correct). No new AABB/local-space bug found in this pass.
  - Regression coverage added as TEST-001; CI verification pending.

- [ ] [BUG-002] **Lifecycle/dispose audit**
  - Verify all objects created per level/chunk/visual pass dispose geometries/materials/textures/listeners as required.
  - Focus: `json-map` detailed meshes/quads, `world-map` chunk attach/detach, `night-lights`, debug overlays, weapon/enemy/vehicle disposable resources.
  - Add/extend tests or diagnostics counters where existing gates can observe leaks (`renderer.info.memory` style checks where already used).

- [ ] [BUG-003] **Streaming/chunk boundary invariants**
  - Audit edge cases around chunk ownership, AABB vs footprint, rotated solids, detailed visuals, rivers/roads crossing chunk boundaries.
  - Verify no visual/collision mismatch after chunk load/unload/revisit; confirm deterministic rebuild/check output unchanged for data-only refactors.

- [ ] [BUG-004] **Determinism and ordering audit**
  - Check for hidden non-determinism in generation/render-order-sensitive outputs: object iteration over unordered maps where order matters, random without seed, locale-dependent sort, floating-point serialization edge cases.
  - Prioritize `tools/citygen`, `tools/normalize-level.mjs`, `tools/build-level.mjs`, chunk/skeleton emission.

- [ ] [BUG-005] **Defensive guards and error reporting**
  - Identify silent `undefined`/`NaN` propagation in hot paths (map queries, nav, entity spawn, detail builders).
  - Replace silent bad states with existing project pattern: explicit validation/warning/error with actionable context; do not hide contract violations.

### B. Refactoring (behavior-preserving)
- [ ] [REF-001] **Split `src/json-map.js` by responsibility**
  - Candidate modules: building/wall mesh builders, detailed-visual dispatch, quad/window/signage batching, road/water/decor assembly, debug/id helpers.
  - Keep public behavior and map contract unchanged; preserve performance-sensitive paths (avoid per-frame allocations, keep batching).
  - Add characterization tests before moving logic.

- [ ] [REF-002] **Detailed visual dispatch table**
  - Replace long `if/else if (b.detailedVisual === ...)` chain with a data-driven registry/table (builder, materials, default params, foundation/yOffset rules).
  - Centralize rotation/local-dimension normalization once (BUG-001) so new detailed visuals cannot repeat the bug.
  - Keep deterministic ordering and existing visual names/IDs.

- [ ] [REF-003] **Normalize/build pipeline boundaries**
  - Document and tighten boundaries between `tools/level-schema.mjs`, `tools/normalize-level.mjs`, `tools/city.js`, `tools/build-level.mjs`, and `tools/citygen/pipeline/*`.
  - Extract small pure helpers where duplication/risk is high (bounds/rotation math, ID/path normalization, warning formatting), but avoid churny mega-refactors.

- [ ] [REF-004] **World/chunk rendering duplication pass**
  - Audit duplicated logic between `JsonMap` and `WorldMap` for detailed buildings/quads/props and chunk lifecycle hooks.
  - Prefer shared helper/module only when it preserves current contracts and reduces bug surface; avoid abstracting stable but different code paths prematurely.

- [ ] [REF-005] **Config/constants hygiene**
  - Move repeated tunables/magic numbers into `config.js` or level schema defaults as appropriate (not gameplay/content numbers hidden in unrelated modules).
  - Add comments only where non-obvious (reason/invariant), per style guide.

### C. Test coverage
- [x] [TEST-001] **Regression: rotated detailed building proportions** (2026-11-21, `agent/plan25-bug001-rotation-audit`)
  - Added `tests/detailed-rotation.test.js` (`runDetailedRotationTests`): checks `detailedLocalDims` for 0/90/180/270/360, and verifies built mesh local bbox for rotated `market-row` (reported `b_d_commercial_49` case) and `academic-building`.
  - Registered in CI browser `misc` suite in `.github/workflows/ci.yml`. CI verification pending.

- [ ] [TEST-002] **AABB/rotation utility tests**
  - If BUG-001 introduces shared helper(s), add unit tests for 0/90/180/270 and negative/normalized rotations.

- [ ] [TEST-003] **Lifecycle regression tests**
  - Extend existing lifecycle/streaming tests to assert no growth/leak after repeated load/unload or chunk rebuild for detailed-visual-heavy levels.

- [ ] [TEST-004] **Generation determinism/property checks**
  - Add/extend deterministic checks for touched generators: same input+seed => byte-identical output/artifacts; report warnings stable.
  - Where useful, add small invariant/property tests (bounds inside plate, no NaN/Infinity, IDs unique, rotation normalized).

- [ ] [TEST-005] **Contract smoke for new/changed visuals**
  - Ensure level-contract/level-lifecycle/browser gates cover levels with new detailed visuals; add targeted cases only when an invariant is not already covered.

- [ ] [TEST-006] **Bug-triage log**
  - For every bug found in BUG-* tasks, record: symptom, root cause, fix, regression test, affected levels/files in PR description and/or `.ai/state/` note.

## Prioritized execution order
1. **BUG-001 + TEST-001** — close the known rotation/dimension bug class with regression coverage.
2. **BUG-002 + TEST-003** — lifecycle/leak safety on hot rendering paths.
3. **REF-002** — reduce detailed-visual dispatch risk before more house ports.
4. **REF-001 (incremental slices)** — split `json-map.js` carefully, one slice per PR.
5. **BUG-003/BUG-004** — streaming/determinism audits with targeted tests.
6. **REF-003/REF-004/REF-005** — pipeline cleanup after risk-first fixes.

## Deliverables per task/PR
- Small scoped PR with clear problem/cause/fix.
- Tests added/updated for behavior or bug fix.
- Deterministic artifacts rebuilt and committed when source-of-truth data changes.
- CI green before merge.
- Short note in PR body: what was checked, what was not run locally (and why CI covers it).

## Risks / watchlist
- **Behavior drift during refactor:** mitigate with characterization tests and small PRs.
- **Performance regressions:** avoid per-frame allocations/object churn in hot paths; watch CI/browser perf-sensitive gates.
- **Determinism breaks:** keep stable ordering, seeded RNG, stable serialization.
- **Hidden contract coupling:** map/level schema/normalizer/runtime consumers must move together.

### CI & Parallelization
- **Worktree/branch:** one task = one worktree + one branch (`agent/<task-id>-<slug>` or `feat/<task-id>-<slug>`), created from fresh `origin/main`; never push directly to `main`.
- **Parallel-safe/blocked:** BUG-001/REF-002 touch `src/json-map.js`/detailed visual dispatch — serialize or split by non-overlapping files. Schema/normalizer/citygen refactors should be isolated from render-path refactors where possible. Docs/state-only tasks can run in parallel.
- **CI profile:** `fast` for push feedback; required PR checks before merge; `full`/targeted browser suites when touching rendering, map contract, streaming, lifecycle, or generation.
- **Required checks:** `node tools/check-levels.mjs`, schema/export checks when schema touched, rebuild/check for touched levels, browser gates for touched runtime areas (`level-contract`, `level-lifecycle`, `open-world`, `streaming-build`/relevant suites as applicable), citygen unit/etalon/series when citygen/pipeline touched.
- **Rebuild/check:** regenerate deterministic derived artifacts together with source changes; verify in CI. Do not run heavy/browser gates locally as final gate.
- **Merge target:** task PR → `main` (or integration branch only if explicitly needed) after green required checks; keep PRs small and rebase/merge main as needed.