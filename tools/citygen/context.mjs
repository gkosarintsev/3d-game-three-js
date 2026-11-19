/**
 * WorldState / IR container for citygen pipeline (TASK-002 skeleton).
 */
import { createReport, info } from './diagnostics.mjs';
import { makeRng } from './rng.mjs';
import { resolveGeneratorConfig, DEFAULT_GENERATOR_VERSION } from './config.mjs';

export function createContext(input) {
  const gen = input?.generator ?? {};
  const seed = Number.isInteger(gen.seed) ? gen.seed : 0;
  const worldBounds = input?.ground ? { size: input.ground.size, y: input.ground.y ?? 0 } : null;
  const cfg = resolveGeneratorConfig(input);
  const ctx = {
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
      // R6.1: deterministic profile mutation metadata for diagnostics/policies hook.
      profileMutation: cfg.profileMutation,
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
  // R6.1: diagnostics for deterministic mutation/features (report consumer, not IR).
  if (cfg.profileMutation) {
    const m = cfg.profileMutation;
    ctx.report.diagnostics.push(info('profile_mutation', '0_input_space', 'profile mutation applied (+-20%, deterministic)', {
      delta: m.delta, enabled: m.enabled, features: m.features,
    }));
  }
  return ctx;
}
