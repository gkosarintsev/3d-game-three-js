# APPLY: Castle authoring sample

This bundle contains a worked example for external LLM level authoring:

- `level-castle.json` — `kind:"open"` level brief (source of truth for gameplay/collision/nav).
- `level-open.schema.json` — JSON Schema export for `kind:"open"` (copy of `src/levels/level-open.schema.json`).
- `castle-detail.js` — optional detailed visual builders for non-enterable wall/tower shells.
- `../external-level-authoring.md` — copy-paste prompt/contract for an external LLM.

## 1) Validate the brief (before integration)

From repo root, with the file placed anywhere:

```bash
node tools/build-level.mjs .ai/prompts/castle-authoring/level-castle.json --out .ai/prompts/castle-authoring/level-castle
```

Expected: catalog written to `.ai/prompts/castle-authoring/level-castle/`, no parser warnings.
Do not commit this generated catalog unless you intentionally want a tracked sample; normal samples outside `src/levels/` are not discovered by `tools/check-levels.mjs`.

## 2) Drop-in as a playable chapter

### 2.1 Copy source brief

```bash
Copy-Item .ai/prompts/castle-authoring/level-castle.json src/levels/level-castle.json
```

### 2.2 Generate committed catalog

```bash
node tools/build-level.mjs src/levels/level-castle.json
```

This writes `src/levels/level-castle/` (`index.js`, `skeleton.l14b`, `chunk-*.l14b`). The catalog is a derived artifact and must be byte-identical to what the build produces.

### 2.3 Register the chapter

Edit `src/levels/index.js`:

```js
import { LEVEL_CASTLE } from './level-castle/index.js';
```

Add to `LEVELS` in the desired order:

```js
LEVEL_CASTLE,
```

Add a chapter number to `LEVEL_NUMBERS` at the same position. Pick the next unused number; do not derive it from array index.

### 2.4 Install detailed visual (optional but used by this sample)

Copy the builder:

```bash
Copy-Item .ai/prompts/castle-authoring/castle-detail.js src/castle-detail.js
```

Edit `src/json-map.js`:

1. Add import near other detail imports:

```js
import { buildDetailedCastleWall, buildDetailedCastleTower, makeCastleMaterials } from './castle-detail.js';
```

2. Register builders in `DETAILED_VISUAL_BUILDERS` (after the object literal or as properties inside it). Example inside the object:

```js
  'castle-wall': (b, bw, bd) => {
    const wallH = (b.floorsCount || 1) * (b.floorHeight || 4);
    return {
      yOffset: b.baseY,
      meshes: buildDetailedCastleWall({ width: bw, depth: bd, height: wallH }, makeCastleMaterials(b.wallColor || '#8a857b')),
    };
  },
  'castle-tower': (b, bw, bd) => {
    const towerH = (b.floorsCount || 1) * (b.floorHeight || 4);
    return {
      yOffset: b.baseY,
      meshes: buildDetailedCastleTower({ width: bw, depth: bd, height: towerH }, makeCastleMaterials(b.wallColor || '#8a857b')),
    };
  },
```

Notes:
- `detailedVisual` replaces only the picture. Collision/nav remain data-driven (`isEnterable:false`, empty rooms).
- Keep the builder inside the building footprint. Do not add `solids`/blockers.
- The keep in this sample intentionally uses generic data visuals because it is enterable.

## 3) Checks

Local fast hints (not CI gates):

```bash
node --check src/json-map.js
node --check src/castle-detail.js
node tools/level-parser.test.mjs
```

Required/authoritative checks run in GitHub CI (see `.github/workflows/ci.yml` and `docs/architecture-testing.md`):

- `node tools/check-levels.mjs`
- `node tools/level-parser.test.mjs`
- browser suites, including `level-contract` and `level-lifecycle`

If you changed a committed brief/catalog, `check-levels` will fail unless the catalog is byte-identical to the build output.

## 4) What not to commit

- `.ai/state/ci-results/**`
- Temporary generated catalogs outside `src/levels/`
- Local debug artifacts

## 5) Expected gameplay route

Spawn at south road outside gate `(0,44)` → pass gate gap → courtyard road →
keep door `(0,4)` → `st_hall_to_great` → `st_great_to_solar` →
`st_solar_to_roof` (ladder) → exit beacon `(0,-4)` on walkable roof at `y≈12`.
