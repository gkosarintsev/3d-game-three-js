/**
 * WorldState / IR container for citygen pipeline (TASK-002 skeleton).
 */
import { createReport } from './diagnostics.mjs';
import { makeRng } from './rng.mjs';
import { resolveGeneratorConfig, DEFAULT_GENERATOR_VERSION } from './config.mjs';

export function createContext(input) {
  const gen = input?.generator ?? {};
  const seed = Number.isInteger(gen.seed) ? gen.seed : 0;
  const worldBounds = input?.ground ? { size: input.ground.size, y: input.ground.y ?? 0 } : null;
  const cfg = resolveGeneratorConfig(input);
  return {
    input,
    meta: {
      seed,
      generatorVersion: gen.generatorVersion ?? DEFAULT_GENERATOR_VERSION,
      deterministic: gen.deterministic !== false,
      worldBounds,
      stream: input?.stream ?? null,
      // R0.5: normalized generator config (profiles/policies) with defaults.
      policies: cfg.policies,
      cityProfiles: cfg.cityProfiles,
      activeCityProfileId: cfg.activeProfileId,
      activeCityProfile: cfg.activeProfile,
    },
    // IR masks/layers (TASK-002): stages may extend; easement pre-initialized for common use.
    masks: { easement: { rivers: [], roads: [] } },
    terrain: null,
    networks: null,
    districts: [],
    parcels: [],
    buildings: [],
    props: [],
    infrastructure: null,
    spatial: null, // optional spatial index; created by stages/tools when needed
    rng: makeRng(seed),
    report: createReport(gen),
    hooks: { behavior: {}, glb: {} }, // future: gameplay/properties, asset refs (MVP: static/no-op)
  };
}
