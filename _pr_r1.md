## Plan 21 — R1 relief wave (tests, stated scope)

- Docs/tests-only increment: no gv bump, no rebuild, no snapshot updates.
- `tools/citygen.test.mjs` — six new tests:
  - `R1.2` slope grid classification (step 8-16 m, 5 classes, counts/sumShares/determinism);
  - `R1.3` flat-site reservations and core candidates (bounds/determinism);
  - `R1.1` ordered procedural terrain (modifiers>0, deterministic order);
  - `R1.4` procedural river (deterministic, carveTerrain: true);
  - `R1.4` floodplain/buffer reservations deterministic;
  - `R1.5/R1.1` crossings and landmarks deterministic.
- Result: `node --test tools/citygen.test.mjs` **63/63 pass** (was 57).
- `.ai/plans/21-citygen-procedural-rules.md`: R1.1-R1.6 marked [x] stated scope; residual: `relief.maxSlope`/`hillMaxSlope` in `src/config.js#relief` not cross-wired as a separate generator policy (documented follow-up).
- One PR per zone; CI is source of truth; sequential merge on green required checks.

CI (GitHub Actions) is the source of truth; sequential merge only on green required checks.
