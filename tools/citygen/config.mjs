import { makeRng, mix } from './rng.mjs';

/**
 * R0.5: generator profiles/policies config with defaults (docs/level_generation_rules_claude.md §11, §13.2).
 * Open schema fields (`generator.profiles`, `generator.policies`) are normalized here with fallbacks;
 * stages may read `ctx.meta.cityProfile` / `ctx.meta.policies` without guessing missing structure.
 */

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const clampParam = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || lo));

// R0.4: canonical generator version for deterministic behavior/regression snapshots.
// Bump on intentional layout/IR/report-affecting changes (see .ai/state/citygen-procedural-rules.md).
export const DEFAULT_GENERATOR_VERSION = '0.77.0';

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

// R6.1: каталог особенностей (§11.2) — детерминированная выборка; 1–2 на город.
const FEATURE_CATALOG = Object.freeze([
  'old_market_square',
  'citadel_hill',
  'river_island_park',
  'ravine_bridge',
  'industrial_waterfront',
  'maze_block',
  'stadium_dominant',
  'cemetery_park',
  'burnt_quarter',
]);

function scaleNumericNode(node, rng) {
  if (Array.isArray(node)) return node.map(v => scaleNumericNode(v, rng));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = scaleNumericNode(v, rng);
    return out;
  }
  if (typeof node === 'number' && Number.isFinite(node) && node !== 0) {
    const span = 0.2; // ±20%
    const factor = 1 + (rng() * 2 - 1) * span;
    const val = node * factor;
    return Number.isInteger(node) ? Math.max(0, Math.round(val)) : Math.round(val * 1e6) / 1e6;
  }
  return node;
}

/** Детерминированная ±20% мутация параметров профиля (§11): идентичность и структура сохраняются. */
export function mutateProfile(profile, seed = 0, delta = 0.2) {
  if (!profile) return profile;
  const clampDelta = Math.max(0, Math.min(0.25, Number(delta) || 0.2));
  const src = JSON.parse(JSON.stringify(profile));
  const rng = makeRng(mix(seed >>> 0, 'profile_mutation', profile.id ?? 'profile', Math.floor(clampDelta * 1e3)));
  return scaleNumericNode(src, rng);
}

/** Детерминированная выборка 1–2 особенностей из каталога §11.2 (для отчёта и будущих стадий). */
export function selectProfileFeatures(seed = 0, count = 1) {
  const n = Math.max(1, Math.min(2, Number(count) || 1));
  const rng = makeRng(mix(seed >>> 0, 'profile_features'));
  const picked = new Set();
  const pool = [...FEATURE_CATALOG];
  while (picked.size < n) {
    const idx = Math.floor(rng() * pool.length) % pool.length;
    picked.add(pool.splice(idx, 1)[0]);
  }
  return [...picked];
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
  const activeProfileRaw = activeProfileId && cityProfiles[activeProfileId] ? cityProfiles[activeProfileId] : null;
  // R6.1: транспорт-маршрутизация чувствительна к изменению геометрии реки/перекрёстка;
  // мутация применяется для profile-driven не-транспортных сценариев (pilots/§11).
  // Для transport-scenes профиль остаётся эталонным (см. R2.2 follow-ups).
  const transportGenerate = isObj(gen.transport) ? gen.transport.generate === true : false;
  const mutationIn = isObj(gen.profileMutation) ? gen.profileMutation : null;
  const mutationEnabled = !!activeProfileRaw && mutationIn?.enabled !== false && !transportGenerate;
  const mutationDelta = clampParam(Number(mutationIn?.delta) || 0.2, 0, 0.25);
  const mutationSeed = Number.isFinite(Number(gen.seed)) ? Number(gen.seed) : 0;
  const activeProfile = mutationEnabled ? mutateProfile(activeProfileRaw, mutationSeed, mutationDelta) : activeProfileRaw;
  const features = selectProfileFeatures(mutationSeed, Number(mutationIn?.features ?? 1));
  return {
    policies,
    cityProfiles,
    activeProfileId,
    activeProfile,
    profileMutation: { enabled: mutationEnabled, delta: mutationDelta, features },
  };
}

