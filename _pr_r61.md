## Plan 21 — R6.1 (stated scope): profile mutation/features, GV `0.76.0 -> 0.77.0`

- Bumps `DEFAULT_GENERATOR_VERSION` `0.76.0 -> 0.77.0`.
- `tools/citygen/config.mjs`:
  - `mutateProfile` — deterministic ±20% mutation (numeric leaf scaling, structure preserved; identity kept; works on profile-driven scenarios). Active when `landscape.profileDriven === true`; opt-out via `generator.profileMutation.enabled === false`.
  - `selectProfileFeatures` — deterministic pick of 1 (or 2 if `profileMutation.features: 2`) feature(s) from §11.2 catalog. Outputs "features" identifiers.
  - `resolveGeneratorConfig` now returns `profileMutation = { enabled, delta, features }` for profile-driven generators; `ctx.meta.profileMutation` exposes to downstream stages.
- `tools/citygen/context.mjs`: `ctx.meta.profileMutation` added; `profile_mutation` info diagnostic in `report.diagnostics`.
- 3 profiles already present (`river_trade`/`hill_town`/`railway_industrial` with §11 parameters); now they vary deterministically by generator seed. Feature examples (seed101/202/303, hill_town): `river_island_park`, `river_island_park`, `stadium_dominant`; chaos values 0.575 / 0.508 / 0.615.
- `src/levels/level-16..22.json` bumped; derived catalogs rebuilt (0 warnings); baselines L16-L22 + synthetic etalons 3x3 refreshed (summary gv 0.77.0).

## Local prep (hints, not CI gate)
- `node --test tools/citygen.test.mjs`: **65/65 pass**
- `node tools/citygen-etalon-check.mjs`: **16/16 pass**
- `node tools/build-level.mjs src/levels/level-16..22.json`: **0 warnings** each

CI (GitHub Actions) is the source of truth; sequential merge only on green required checks.
