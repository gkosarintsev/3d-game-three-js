# Prompt: External LLM level authoring (kind: open)

Use this prompt when asking an external LLM (no repo access) to produce a level
for this Three.js game project.

---

## System/Task prompt (copy-paste)

You are authoring a drop-in level for a Three.js ES-module game. You cannot see
the repository. Produce files that follow the attached contract exactly.

### Output format

Return a file bundle with:

1. `level-<name>.json` — required. A single JSON level brief.
2. `manifest.md` — required. List files, assumptions, coordinate origin, route,
   and any optional assets/licenses.
3. `<detail>.js` — optional, only if a non-enterable building needs a custom
   silhouette. Must export builder functions; no runtime game logic.
4. `APPLY.md` — required. Exact integration steps for the repo.

Do **not** return generated catalog chunks, node_modules, binaries, or screenshots.

### Hard constraints

- Use `kind: "open"`. Do not use `json`, `json2`, or `cityforge`.
- Include `"$schema": "./level-open.schema.json"` and follow the attached schema.
- Units: meters. Axes: X/Z plane, Y up. Angles: degrees. Rotations only 0/90/180/270.
- All ids unique. Keep JSON deterministic (no random values in output).
- Data is the source of truth for collision and navigation. Visual-only code must
  never add collision or change walkability.

### Data semantics

- `ground.size` is the square world plate. `stream.chunk` must divide it.
- `gameplay.goal:"exit"` needs `spawn`, `exit`, `exitRadius`.
- Buildings:
  - `footprint` generates walls/collision on edges.
  - `isEnterable:false` + `rooms:[]` = solid closed shell (good for wall segments/towers).
  - `isEnterable:true` + `rooms` + `stairs` + `connections` = real interior.
- Gate/opening in a fortress wall: **real gap between two building footprints**.
  Do not fake a gate by a door in a closed shell.
- Door/portal: `rooms[].connections[].portalPosition` must be on the room edge.
  Exterior door targets a road id; that road must exist outside the footprint.
- Stairs: `straight` needs `position`, `rotation`, `dimensions {width,length}`.
  `ladder` needs only `position`. `connectsFloors:[k,k+1]`; to roof use
  `k1 == floorsCount` and set `roof.walkable:true`.
- `roof.walkable:true` allows walking on roof; add `parapet` for edge safety.
- `landscapeObjects` and `lights` are decorative/supporting data; do not create
  gameplay-critical invisible collisions.

### Optional detailed visual contract

Only for buildings where generic data visuals are insufficient. Example: wall
merlons, tower battlements.

- Building data: `"detailedVisual":"<id>"`.
- JS module exports:
  - `make<Name>Materials(wallColorHex)` or equivalent material factory.
  - `buildDetailed<Name>({width, depth, height/floorHeight/floors, ...}, mats)`
    returning an array of THREE.Mesh.
- Local mesh coords: XZ center at (0,0), base at y=0. Stay inside footprint.
- Register in `src/json-map.js` as:
  `DETAILED_VISUAL_BUILDERS['<id>'] = (b,bw,bd)=>({meshes,yOffset});`
- For enterable interiors, prefer data-only visuals; custom visual suppresses
  generic wall/floor/roof picture while keeping data collision/nav.

### Acceptance checks (repo)

```bash
node tools/build-level.mjs src/levels/level-<name>.json
node tools/check-levels.mjs
node tools/level-parser.test.mjs
```

CI is authoritative. Generated catalog must be deterministic and parser warnings
must be zero.

### Worked example requirement

If asked for a medieval castle, include: curtain walls, at least one gate gap,
inner courtyard, corner/gate towers, an enterable keep, stairs/ladders to upper
levels, and a walkable roof route to an exit. Use the attached
`castle-authoring/level-castle.json` as the reference shape.

---

## What to attach

- `level-open.schema.json`
- `castle-authoring/level-castle.json`
- `castle-authoring/castle-detail.js`
- `castle-authoring/APPLY.md`
- This prompt file
