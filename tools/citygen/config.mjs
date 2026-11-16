/**
 * R0.5: generator profiles/policies config with defaults (docs/level_generation_rules_claude.md §11, §13.2).
 * Open schema fields (`generator.profiles`, `generator.policies`) are normalized here with fallbacks;
 * stages may read `ctx.meta.cityProfile` / `ctx.meta.policies` without guessing missing structure.
 */

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// R0.4: canonical generator version for deterministic behavior/regression snapshots.
// Bump on intentional layout/IR/report-affecting changes (see .ai/state/citygen-procedural-rules.md).
export const DEFAULT_GENERATOR_VERSION = '0.7.0';

export const DEFAULT_CITY_POLICIES = Object.freeze({
  roadDensity: { bMin: 60, bMax: 260, gamma: 0.8 },
  // проценты (док §7.4); J.maxSlope остаётся абсолютным пределом в м/м
  slopeLimitPct: { highway: 6, arterial: 8, collector: 10, local: 12 },
  enterableShare: 0.2,
  chaos: { global: 0.35, seamsMax: 2 },
  interchanges: { min: 0, max: 0 },
  parkShare: { min: 0.08, max: 0.15 },
});

export const DEFAULT_CITY_PROFILES = Object.freeze({
  river_trade: {
    id: 'river_trade',
    terrain: {
      relief: 'plain', rivers: 1, lakes: 0, tributaries: 1,
      hydrology: {
        river: { enabled: true, axis: 'z', points: 7, width: 22, depth: 4 },
        floodplainMultiplier: 3, riverBufferMargin: 12, lakeBufferMargin: 8, lakeFloodplainMargin: 16,
      },
    },
    landValueWeights: [0.4, 0.25, 0.15, 0.15, 0.05],
    interchanges: [2, 3],
    parkShare: [0.08, 0.15],
    chaos: 0.4,
  },
  hill_town: {
    id: 'hill_town',
    terrain: {
      relief: 'hills', rivers: 0, lakes: 0, tributaries: 0,
      hydrology: {
        floodplainMultiplier: 3, riverBufferMargin: 12, lakeBufferMargin: 8, lakeFloodplainMargin: 16,
      },
    },
    landValueWeights: [0.35, 0.2, 0.1, 0.3, 0.05],
    interchanges: [0, 1],
    parkShare: [0.1, 0.18],
    chaos: 0.55,
  },
  railway_industrial: {
    id: 'railway_industrial',
    terrain: {
      relief: 'plain', rivers: 1, lakes: 0, tributaries: { min: 0, max: 1 },
      hydrology: {
        river: { enabled: true, axis: 'z', points: 7, width: 22, depth: 4 },
        floodplainMultiplier: 3, riverBufferMargin: 12, lakeBufferMargin: 8, lakeFloodplainMargin: 16,
      },
    },
    landValueWeights: [0.35, 0.3, 0.1, 0.15, 0.1],
    interchanges: [3, 4],
    parkShare: [0.05, 0.08],
    chaos: 0.4,
  },
});

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

function mergeDeep(base, over) {
  if (!isObj(base)) return over ?? base;
  const out = { ...base };
  if (!isObj(over)) return out;
  for (const [k, v] of Object.entries(over)) {
    if (isObj(v) && isObj(out[k])) out[k] = mergeDeep(out[k], v);
    else out[k] = v;
  }
  return out;
}

export function normalizePolicies(rawPolicies) {
  const p = mergeDeep(DEFAULT_CITY_POLICIES, isObj(rawPolicies) ? rawPolicies : {});
  // clamp/sanitize a few known numeric ranges deterministically
  if (isObj(p.roadDensity)) {
    const bMin = Number(p.roadDensity.bMin);
    const bMax = Number(p.roadDensity.bMax);
    const gamma = Number(p.roadDensity.gamma);
    if (Number.isFinite(bMin)) p.roadDensity.bMin = Math.max(10, bMin);
    if (Number.isFinite(bMax)) p.roadDensity.bMax = Math.max(p.roadDensity.bMin ?? 60, bMax);
    if (Number.isFinite(gamma)) p.roadDensity.gamma = Math.max(0.1, Math.min(3, gamma));
  }
  if (isObj(p.chaos)) {
    if (Number.isFinite(Number(p.chaos.global))) p.chaos.global = clamp01(Number(p.chaos.global));
    if (Number.isFinite(Number(p.chaos.seamsMax))) p.chaos.seamsMax = Math.max(0, Math.floor(Number(p.chaos.seamsMax)));
  }
  if (Number.isFinite(Number(p.enterableShare))) p.enterableShare = clamp01(Number(p.enterableShare));
  if (isObj(p.slopeLimitPct)) {
    for (const k of ['highway', 'arterial', 'collector', 'local']) {
      const n = Number(p.slopeLimitPct[k]);
      if (Number.isFinite(n)) p.slopeLimitPct[k] = Math.max(0, Math.min(30, n));
    }
  }
  return p;
}

export function normalizeCityProfiles(rawProfiles) {
  const out = { ...DEFAULT_CITY_PROFILES };
  if (!isObj(rawProfiles)) return out;
  for (const [k, v] of Object.entries(rawProfiles)) {
    if (!isObj(v)) continue;
    const base = isObj(out[k]) ? out[k] : { id: k };
    out[k] = mergeDeep(base, { ...v, id: v.id || k });
  }
  return out;
}

export function resolveGeneratorConfig(input) {
  const gen = isObj(input?.generator) ? input.generator : {};
  const policies = normalizePolicies(gen.policies);
  const cityProfiles = normalizeCityProfiles(gen.profiles);
  // Active profile hint: explicit generator.profile/profileId/cityProfile, else null (stages may infer later).
  const activeProfileId = typeof gen.profile === 'string' ? gen.profile
    : typeof gen.profileId === 'string' ? gen.profileId
    : typeof gen.cityProfile === 'string' ? gen.cityProfile
    : null;
  const activeProfile = activeProfileId && cityProfiles[activeProfileId] ? cityProfiles[activeProfileId] : null;
  return { policies, cityProfiles, activeProfileId, activeProfile };
}
