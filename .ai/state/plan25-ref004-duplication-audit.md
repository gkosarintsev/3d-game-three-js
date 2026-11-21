# Plan 25 — REF-004 Duplication Audit (JsonMap / WorldMap)

Date: 2026-11-21
Branch: `agent/plan25-ref004-duplication-audit`

## Scope

Audit duplicated logic between `src/json-map.js` and `src/world-map.js` for detailed buildings/quads/props and chunk lifecycle hooks (Plan 25 REF-004).

## Findings

### 1) Picture-details orchestration duplicated inside WorldMap (high confidence)

`WorldMap._buildSlices()` and `WorldMap._rebuildPicture()` both build the same picture-details tail:

1. water (`_buildWater`)
2. clutter items + `buildProps`
3. detailed buildings (`_buildDetailedBuildings`, owner/fallback filtered)
4. panelka decor (`buildPanelkaDecor`)
5. windows/signage/lights (`_buildWindows/_buildSignage/_buildLights`)
6. pic/counts assignment

Evidence:
- `src/world-map.js` `_buildSlices`: ~L645-L689
- `src/world-map.js` `_rebuildPicture`: ~L869-L894

Difference is intentional: `_buildSlices` splits work into budgeted slices for stream pump; `_rebuildPicture` runs synchronously for fallback handover. Shared extraction is possible only if slicing boundaries are preserved (e.g. helper returning step callbacks or accepting a slice emitter). Premature merge would risk frame-budget regression (BUG-003 already hit 420s timeout class).

### 2) JsonMap build vs WorldMap chunk build is similar but not identical (medium confidence)

`JsonMap._build()` performs a whole-level build in one pass (ground, roads, buildings, water, props, detailed/panelka, quads/lights, counters). WorldMap reuses many JsonMap primitives (`_buildWater`, `_buildWindows`, `_buildSignage`, `_buildLights`, `_buildDetailedBuildings`, etc.) through inheritance, but orchestration differs because WorldMap has chunk ownership, fallback draw, slice labels/cost accounting, and loaded-data stores.

Conclusion: do not force a shared "build everything" function; primitives are already shared. Duplication risk is mainly in WorldMap's two orchestral paths.

### 3) Chunk lifecycle hooks are intentionally WorldMap-specific (low duplication risk)

`loadChunk/applyChunk/unloadChunk`, pump slices, reachability, fallback dirty queue are WorldMap-only. JsonMap has no chunk lifecycle. No extraction needed.

### 4) Props/quads/detailed primitives already centralized

- Props: both use `buildProps` from `src/props.js`.
- Panelka decor: `buildPanelkaDecor` from `src/panelka-decor.js`.
- Detailed dispatch: `DETAILED_VISUAL_BUILDERS` / `_buildDetailedBuildings` in JsonMap, reused by WorldMap.
- Quads: `_buildQuads/_buildWindows/_buildSignage` in JsonMap, reused by WorldMap.

## Recommended next safe slice

- Extract a small WorldMap-internal helper for the duplicated picture-details tail, but keep slicing control in `_buildSlices` (helper should produce ordered step functions or be called per-step). Add/keep browser regression coverage around stream/open-world frame budget and BUG-003 handover.
- Avoid changing JsonMap build path in same PR unless required.

## Status

REF-004 first pass audit complete; no runtime code changed in this PR to avoid behavior/perf regressions.