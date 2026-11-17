/**
 * Stage 3: districts and parcels (TASK-005, incremental MVP).
 * Ingests/validates district declarations and profiles, assigns districts over a
 * planning grid when needed, and generates deterministic parcels. Emits to IR/report.
 */
import { warn, info } from '../diagnostics.mjs';
import { makeRng, mix } from '../rng.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const EPS = 1e-9;

function pointSegDistXZ(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az, apx = px - ax, apz = pz - az;
  const ab2 = abx * abx + abz * abz || 1e-12;
  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / ab2));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

function minRoadDist(x, z, segments = []) {
  let best = Infinity;
  for (const s of segments) {
    const pts = Array.isArray(s?.path) ? s.path : [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      best = Math.min(best, pointSegDistXZ(x, z, a[0], a[2], b[0], b[2]));
    }
  }
  return best;
}

// R1.2/R4.1 helpers: approximate terrain slope at parcel center (aligned with stage-1 modifier sampling).
function hillContribution(mod, x, z) {
  const type = mod?.type;
  if (type !== 'mountain' && type !== 'valley') return 0;
  const h = Number(mod.height) || 0;
  const r = Number(mod.radius) || 0;
  if (!(r > EPS) || !Number.isFinite(h)) return 0;
  const c = Array.isArray(mod.center) ? mod.center : [Number(mod.center?.x) || 0, Number(mod.center?.z) || 0];
  const dx = x - (Number(c[0]) || 0);
  const dz = z - (Number(c[1]) || 0);
  const d = Math.hypot(dx, dz);
  if (d >= r) return 0;
  const t = 1 - d / r;
  const e = t * t * (3 - 2 * t);
  const signed = (mod.operation === 'subtract') ? -h : h;
  return signed * e;
}
function terrainHeightAt(x, z, baseY, modifiers = []) {
  let y = Number.isFinite(baseY) ? baseY : 0;
  for (const m of modifiers) y += hillContribution(m, x, z);
  return y;
}
function sampleTerrainSlope(x, z, baseY, modifiers = []) {
  const d = 8;
  const y = terrainHeightAt(x, z, baseY, modifiers);
  const sx = Math.max(
    Math.abs(terrainHeightAt(x + d, z, baseY, modifiers) - y),
    Math.abs(terrainHeightAt(x - d, z, baseY, modifiers) - y),
  ) / d;
  const sz = Math.max(
    Math.abs(terrainHeightAt(x, z + d, baseY, modifiers) - y),
    Math.abs(terrainHeightAt(x, z - d, baseY, modifiers) - y),
  ) / d;
  return Math.max(sx, sz);
}

// R3.2 §6.2/§6.3: поле стоимости доступа от ядер (дороги дёшевы, вода и склон дороги),
// изоляции которого и есть границы эпох («город растёт не по кругу, а по стоимости доступа»).
// Мультиисточниковый Дейкстра по анализирующей сетке (шаг = slope analysis step).
const ERA_MED_MAX = 0.15;    // Средневековое ядро 0–0.15
const ERA_XIX_MAX = 0.35;    // XIX век 0.15–0.35
const ERA_INDUSTRIAL_MAX = 0.5; // Индустриальная полоса 0.2–0.5 вдоль реки/жд
const ERA_MODERN_MAX = 0.7;  // Модерн и микрорайоны 0.35–0.7
// Пригород 0.7–1.0
const ERA_INDUSTRIAL_BAND_MIN = 0.15; // индустриальный коридор начинается не раньше XIX-кольца
const ERA_WATER_PENALTY = 6;   // вода дорогая, но не запретная (город может перешагнуть реку)
const ERA_ROAD_DISCOUNT = 0.5; // вдоль дорог дешевле (множитель стоимости ребра)
const ERA_SLOPE_WEIGHT = 4;    // склон дорогой
const ERA_ROAD_DIST = 24;      // расстояние «вдоль магистрали», м
const ERA_INDUSTRIAL_CORRIDOR = 90; // полоса вдоль реки/жд, м

function gridHeights(baseY, size, mods) {
  const step = 16;
  const half = size / 2;
  const n = Math.max(2, Math.ceil(size / step));
  const actual = size / n;
  const h = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -half + (i + 0.5) * actual;
      const z = -half + (j + 0.5) * actual;
      h[j * n + i] = terrainHeightAt(x, z, baseY, mods);
    }
  }
  return { heights: h, n, actual };
}

function inWaterCell(cx, cz, rivers = [], lakes = []) {
  for (const rv of rivers) {
    const path = Array.isArray(rv?.path) ? rv.path : [];
    const w = Number(rv?.width) || 0;
    let best = Infinity;
    for (let i = 0; i + 1 < path.length; i++) {
      best = Math.min(best, pointSegDistXZ(cx, cz, path[i][0], path[i][2], path[i + 1][0], path[i + 1][2]));
    }
    if (best < w / 2 + 4) return true;
  }
  for (const lake of lakes) {
    const area = lake?.area;
    if (area && typeof area === 'object' && String(area.type) === 'circle' && Array.isArray(area.center)) {
      const d = Math.hypot(cx - Number(area.center[0]), cz - Number(area.center[1]));
      if (d < (Number(area.radius) || 0) + 4) return true;
      continue;
    }
    const pts = Array.isArray(area?.points) ? area.points : (Array.isArray(area) ? area : []);
    if (!pts.length) continue;
    let sx = 0, sz = 0;
    for (const p of pts) {
      const px = Number(Array.isArray(p) ? p[0] : p?.x);
      const pz = Number(Array.isArray(p) ? p[2] : p?.z);
      if (!Number.isFinite(px) || !Number.isFinite(pz)) continue;
      sx += px; sz += pz;
    }
    const cent = [sx / pts.length, sz / pts.length];
    let r = 0;
    for (const p of pts) {
      const px = Number(Array.isArray(p) ? p[0] : p?.x);
      const pz = Number(Array.isArray(p) ? p[2] : p?.z);
      if (!Number.isFinite(px) || !Number.isFinite(pz)) continue;
      r = Math.max(r, Math.hypot(px - cent[0], pz - cent[1]));
    }
    if (Math.hypot(cx - cent[0], cz - cent[1]) < r + 4) return true;
  }
  return false;
}

function binaryHeap() {
  const keys = [];
  const vals = [];
  const less = (a, b) => keys[a] < keys[b] || (keys[a] === keys[b] && vals[a] < vals[b]);
  return {
    size: () => keys.length,
    push(v, k) {
      keys.push(k); vals.push(v);
      let i = keys.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!less(i, p)) break;
        [keys[i], keys[p]] = [keys[p], keys[i]];
        [vals[i], vals[p]] = [vals[p], vals[i]];
        i = p;
      }
    },
    pop() {
      const top = vals[0];
      const lk = keys[keys.length - 1], lv = vals[vals.length - 1];
      keys.pop(); vals.pop();
      if (keys.length) {
        keys[0] = lk; vals[0] = lv;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < keys.length && less(l, m)) m = l;
          if (r < keys.length && less(r, m)) m = r;
          if (m === i) break;
          [keys[i], keys[m]] = [keys[m], keys[i]];
          [vals[i], vals[m]] = [vals[m], vals[i]];
          i = m;
        }
      }
      return top;
    },
  };
}

export function computeAccessCostField(ctx, size) {
  // R3.2 §6.3: мультиисточниковый Дейкстра от ядер; ребро = step·(1 + 4|наклон| + 6·вода)·(дорога ? 0.5 : 1).
  // Возвращает { costs: Float64Array(n*n), n, actual, maxCost } или null (ядер нет).
  const baseY = Number(ctx?.input?.ground?.y ?? 0) || 0;
  const half = size / 2;
  const cores = Array.isArray(ctx?.terrain?.analysis?.coreCandidates) ? ctx.terrain.analysis.coreCandidates
    : (Array.isArray(ctx?.masks?.terrain?.coreCandidates) ? ctx.masks.terrain.coreCandidates : []);
  if (!cores.length) return null;
  const rivers = ctx?.hydrology?.rivers ?? [];
  const lakes = ctx?.hydrology?.lakes ?? [];
  const roadSegments = ctx?.networks?.roads?.segments ?? [];
  const mods = ctx?.terrain?.modifiers ?? [];
  const { heights, n, actual } = gridHeights(baseY, size, mods);
  const cellCenter = (i) => -half + (i + 0.5) * actual;
  const water = new Uint8Array(n * n);
  const roadNear = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const cx = cellCenter(i), cz = cellCenter(j);
      if (inWaterCell(cx, cz, rivers, lakes)) water[j * n + i] = 1;
      if (roadSegments.length && minRoadDist(cx, cz, roadSegments) <= ERA_ROAD_DIST) roadNear[j * n + i] = 1;
    }
  }
  const costs = new Float64Array(n * n).fill(Infinity);
  const heap = binaryHeap();
  for (const core of cores) {
    const x = Number(core?.x), z = Number(core?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const i = clamp(Math.floor((x + half) / actual), 0, n - 1);
    const j = clamp(Math.floor((z + half) / actual), 0, n - 1);
    const idx = j * n + i;
    if (costs[idx] !== 0) { costs[idx] = 0; heap.push(idx, 0); }
  }
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (heap.size() > 0) {
    const u = heap.pop();
    const uj = Math.floor(u / n), ui = u - uj * n;
    const cu = costs[u];
    if (cu === Infinity) continue;
    const hu = heights[u];
    for (const [di, dj] of dirs) {
      const vi = ui + di, vj = uj + dj;
      if (vi < 0 || vj < 0 || vi >= n || vj >= n) continue;
      const v = vj * n + vi;
      const slope = Math.abs(heights[v] - hu) / actual;
      const waterEdge = water[u] || water[v] ? ERA_WATER_PENALTY : 0;
      const roadEdge = roadNear[u] && roadNear[v] ? ERA_ROAD_DISCOUNT : 1;
      const w = actual * (1 + ERA_SLOPE_WEIGHT * slope + waterEdge) * roadEdge;
      const alt = cu + w;
      if (alt < costs[v]) { costs[v] = alt; heap.push(v, alt); }
    }
  }
  let maxCost = 0;
  for (let k = 0; k < costs.length; k++) if (Number.isFinite(costs[k]) && costs[k] > maxCost) maxCost = costs[k];
  return { costs, n, actual, maxCost: maxCost || 1 };
}

export function assignErasToDistricts(ctx, size) {
  // R3.2 §6.2: кольца роста от ядер по изоляциям поля стоимости (не евклид).
  const field = computeAccessCostField(ctx, size);
  if (!field) {
    ctx?.report?.diagnostics?.push(info('era_rings_skipped_no_core', '3_districts_parcels', 'era assignment skipped: no core candidates', {}));
    return null;
  }
  const { costs, n, actual, maxCost } = field;
  const half = size / 2;
  const rivers = ctx?.hydrology?.rivers ?? [];
  const railways = ctx?.networks?.railways?.segments ?? ctx?.input?.cityforge?.networks?.railways?.segments ?? [];
  const eraCounts = { medieval: 0, xix: 0, industrial: 0, modern: 0, suburb: 0 };
  const cores = Array.isArray(ctx?.terrain?.analysis?.coreCandidates) ? ctx.terrain.analysis.coreCandidates : [];
  for (const d of (ctx?.districts ?? [])) {
    const rect = d?.geometry?.rect;
    const cx = rect ? (Number(rect.minX) + Number(rect.maxX)) / 2 : 0;
    const cz = rect ? (Number(rect.minZ) + Number(rect.maxZ)) / 2 : 0;
    const i = clamp(Math.floor((cx + half) / actual), 0, n - 1);
    const j = clamp(Math.floor((cz + half) / actual), 0, n - 1);
    const c = costs[j * n + i];
    const cNorm = Number.isFinite(c) ? c / maxCost : 1;
    const nearIndustrial = (function nearRiverOrRail(x, z) {
      for (const rv of rivers) {
        const path = Array.isArray(rv?.path) ? rv.path : [];
        for (let k = 0; k + 1 < path.length; k++) {
          if (pointSegDistXZ(x, z, path[k][0], path[k][2], path[k + 1][0], path[k + 1][2]) <= ERA_INDUSTRIAL_CORRIDOR) return true;
        }
      }
      for (const s of railways) {
        const path = Array.isArray(s?.path) ? s.path : [];
        for (let k = 0; k + 1 < path.length; k++) {
          if (pointSegDistXZ(x, z, path[k][0], path[k][2], path[k + 1][0], path[k + 1][2]) <= ERA_INDUSTRIAL_CORRIDOR) return true;
        }
      }
      return false;
    })(cx, cz);
    let era;
    if (cNorm <= ERA_MED_MAX) era = 'medieval';
    else if (cNorm <= ERA_XIX_MAX) era = 'xix';
    else if (cNorm <= ERA_INDUSTRIAL_MAX && cNorm >= ERA_INDUSTRIAL_BAND_MIN && (d?.type === 'industrial' || nearIndustrial)) era = 'industrial';
    else if (cNorm <= ERA_MODERN_MAX) era = 'modern';
    else era = 'suburb';
    d.era = era;
    if (!d.style) d.style = `era_${era}`;
    eraCounts[era] += 1;
  }
  ctx?.report?.diagnostics?.push(info('era_rings_assigned', '3_districts_parcels', `assigned eras to districts by access-cost isolines from ${cores.length} core(s)`, { counts: eraCounts, maxCost: +maxCost.toFixed(2) }));
  return eraCounts;
}

// R3.3 §6.4/§6.5: поле стоимости земли L(x) и производная полоса типов.
// L = w1·(1 − d(ядро)/R) + w2·близость к артерии + w3·вид на воду + w4·плоскость − w5·(ж/д шум/дым).
// Веса задаёт профиль (`generator.profile.landValueWeights: [w1..w5]`; в config.mjs — river_trade/hill_town/railway_industrial).
const LAND_VALUE_DEFAULT_WEIGHTS = [0.35, 0.25, 0.15, 0.2, 0.05];
const TYPE_DENSITY = { // §6.5: buildingDensity (нижняя граница 0,7–0,9 и т.д.)
  office: [0.7, 0.9], old_town: [0.7, 0.9], commercial: [0.5, 0.8], market: [0.5, 0.75],
  residential: [0.3, 0.6], luxury: [0.4, 0.6], suburb: [0.25, 0.45], slums: [0.5, 0.6],
  industrial: [0.2, 0.4], park: [0.0, 0.05], forest: [0.0, 0.05], parking: [0.05, 0.1],
  sports: [0.15, 0.25], campus: [0.2, 0.35],
};
export const TYPE_FLOORS_MID = { office: 7.5, old_town: 3.5, commercial: 11.5, market: 2, residential: 5.5, luxury: 5.5, suburb: 2, slums: 2.5, industrial: 2.5, park: 0.5, forest: 0.5, parking: 1.5, sports: 2, campus: 4 };
const TYPE_FLOORS = { // §6.5: этажность (этажи; «акценты до 40/60» — к этапу зданий R4)
  office: [3, 12], old_town: [2, 5], commercial: [3, 20], market: [1, 3],
  residential: [2, 9], luxury: [2, 9], suburb: [1, 3], slums: [1, 4],
  industrial: [1, 4], park: [0, 1], forest: [0, 1], parking: [1, 2],
  sports: [1, 3], campus: [2, 6],
};

function landValueWeights(ctx) {
  const w = ctx?.meta?.activeCityProfile?.landValueWeights ?? ctx?.input?.generator?.landValueWeights;
  if (Array.isArray(w) && w.length === 5 && w.every(n => Number.isFinite(Number(n)))) return w.map(Number);
  return LAND_VALUE_DEFAULT_WEIGHTS.slice();
}

function minSegmentDist(x, z, segments = [], classes = null) {
  let best = Infinity;
  for (const s of segments) {
    if (classes && !classes.has(String(s?.type || ''))) continue;
    const pts = Array.isArray(s?.path) ? s.path : [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const d = pointSegDistXZ(x, z, pts[i][0], pts[i][2], pts[i + 1][0], pts[i + 1][2]);
      if (d < best) best = d;
    }
  }
  return best;
}

function inFloodplainAt(x, z, floodplains = []) {
  for (const fpl of floodplains) {
    if (!fpl) continue;
    if (fpl.type === 'lake' && Array.isArray(fpl.center) && Number.isFinite(Number(fpl.radius))) {
      const margin = Number.isFinite(Number(fpl.floodplain)) ? Number(fpl.floodplain) : 0;
      if (Math.hypot(x - Number(fpl.center[0]), z - Number(fpl.center[1])) < Number(fpl.radius) + Math.max(margin, 8)) return true;
      continue;
    }
    if (fpl.type === 'river' && Array.isArray(fpl.path) && fpl.path.length >= 2) {
      const margin = Number.isFinite(Number(fpl.floodplain)) ? Number(fpl.floodplain)
        : Math.max((Number(fpl.width) || 0) * 0.5 + 12, (Number(fpl.width) || 0) * 3);
      let best = Infinity;
      for (let i = 0; i + 1 < fpl.path.length; i++) best = Math.min(best, pointSegDistXZ(x, z, fpl.path[i][0], fpl.path[i][2], fpl.path[i + 1][0], fpl.path[i + 1][2]));
      if (best < margin) return true;
    }
  }
  return false;
}

export function computeLandValue(ctx, x, z, size) {
  // Возвращает { landValue (0..1), components } — детерминированно, без ГПСЧ.
  const baseY = Number(ctx?.input?.ground?.y ?? 0) || 0;
  const mods = ctx?.terrain?.modifiers ?? [];
  const w = landValueWeights(ctx);
  const cores = Array.isArray(ctx?.terrain?.analysis?.coreCandidates) ? ctx.terrain.analysis.coreCandidates
    : (Array.isArray(ctx?.masks?.terrain?.coreCandidates) ? ctx.masks.terrain.coreCandidates : []);
  let dCore = Infinity;
  for (const c of cores) {
    const cx = Number(c?.x), cz = Number(c?.z);
    if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue;
    dCore = Math.min(dCore, Math.hypot(cx - x, cz - z));
  }
  if (!Number.isFinite(dCore)) dCore = 0; // ядер нет — считаем точку ядром (наследие пилотов без cores)
  const roadSegments = ctx?.networks?.roads?.segments ?? [];
  const arterials = minSegmentDist(x, z, roadSegments, new Set(['arterial', 'highway']));
  const rivers = ctx?.hydrology?.rivers ?? [];
  const lakes = ctx?.hydrology?.lakes ?? [];
  const dRiver = minSegmentDist(x, z, rivers, null);
  let dLake = Infinity;
  for (const lake of lakes) {
    const area = lake?.area;
    if (area && typeof area === 'object' && String(area.type) === 'circle' && Array.isArray(area.center)) {
      dLake = Math.min(dLake, Math.max(0, Math.hypot(x - Number(area.center[0]), z - Number(area.center[1])) - (Number(area.radius) || 0)));
      continue;
    }
    const pts = Array.isArray(area?.points) ? area.points : (Array.isArray(area) ? area : []);
    if (!pts.length) continue;
    let sx = 0, sz = 0;
    for (const p of pts) {
      const px = Number(Array.isArray(p) ? p[0] : p?.x), pz = Number(Array.isArray(p) ? p[2] : p?.z);
      if (!Number.isFinite(px) || !Number.isFinite(pz)) continue;
      sx += px; sz += pz;
    }
    const cxd = sx / pts.length, czd = sz / pts.length;
    let r = 0;
    for (const p of pts) {
      const px = Number(Array.isArray(p) ? p[0] : p?.x), pz = Number(Array.isArray(p) ? p[2] : p?.z);
      if (!Number.isFinite(px) || !Number.isFinite(pz)) continue;
      r = Math.max(r, Math.hypot(px - cxd, pz - czd));
    }
    dLake = Math.min(dLake, Math.max(0, Math.hypot(x - cxd, z - czd) - r));
  }
  const dWater = Math.min(dRiver, dLake);
  const railSegments = ctx?.networks?.railways?.segments ?? ctx?.input?.cityforge?.networks?.railways?.segments ?? [];
  const dRail = minSegmentDist(x, z, railSegments, null);
  const slopeHere = sampleTerrainSlope(x, z, baseY, mods);
  const R = size / 2;
  const coreProx = Math.max(0, 1 - dCore / R);
  const arterialProx = Number.isFinite(arterials) ? Math.max(0, 1 - arterials / (size * 0.25)) : 0;
  const waterProx = Number.isFinite(dWater) ? Math.max(0, 1 - dWater / (size * 0.25)) : 0;
  const flatness = Math.max(0, 1 - Math.min(0.25, Math.max(0, slopeHere)) / 0.25);
  const railProx = Number.isFinite(dRail) ? Math.max(0, 1 - dRail / 150) : 0;
  const raw = w[0] * coreProx + w[1] * arterialProx + w[2] * waterProx + w[3] * flatness - w[4] * railProx;
  const landValue = clamp((raw + w[4]) / (w[0] + w[1] + w[2] + w[3] + w[4]), 0, 1);
  return { landValue, components: { coreProx, arterialProx, waterProx, flatness, railProx, slopeHere } };
}

function landValueAffinity(typeId, lv, inFloodplain) {
  // §6.5: где тип; мультипликаторы — размещение по полю L/артериям/реке/рельсу/пойме/склонам.
  switch (typeId) {
    case 'office':
    case 'old_town':
      return 1 + 2.0 * (lv?.landValue ?? 0);
    case 'commercial':
    case 'market':
      return 1 + 1.5 * (lv?.components?.arterialProx ?? 0);
    case 'residential':
    case 'luxury':
      return 1 + 0.5 * (lv?.landValue ?? 0);
    case 'slums':
      return 1 + 1.0 * (1 - (lv?.landValue ?? 0));
    case 'industrial': {
      const flat = lv?.components?.flatness ?? 1;
      if (flat < 0.88) return 0.4; // уклон < 3% (§6.5)
      const corridor = Math.max(lv?.components?.railProx ?? 0, (lv?.components?.waterProx ?? 0) > 0.55 ? (lv?.components?.waterProx ?? 0) : 0);
      return corridor > 0 ? 1 + 1.5 * corridor : 0.6;
    }
    case 'park':
    case 'forest':
      return 1 + 2.0 * Math.max(inFloodplain ? 1 : 0, 1 - (lv?.components?.flatness ?? 1));
    default:
      return 1;
  }
}

// R3.5 §7.3: давление застройки D и целевое расстояние B(D)=B_max−(B_max−B_min)·D^0.8.
// Приор D₀ — по записям районов: buildingDensity × средняя высота из heightRange + бонус около якорей (ядра).
// Веса/пределы берём из policies.roadDensity (bMin/bMax/gamma), не хардкодим.
const ANCHOR_BONUS_150 = 0.35; // ядро в радиусе 150 м
const ANCHOR_BONUS_300 = 0.15; // ядро в радиусе 300 м
const ARTERIAL_BONUS = 0.1;      // район в 10 м от артерии/highway
const PRESSURE_FLOOR_NORM = 16;  // этажи-эталон нормализации (meanFloors / 16)

export function targetBDistance(D, { bMin = 60, bMax = 260, gamma = 0.8 } = {}) {
  const d = Math.max(0, Math.min(1, Number.isFinite(D) ? D : 0));
  return +(bMax - (bMax - bMin) * Math.pow(d, gamma)).toFixed(1);
}

export function districtPressure(d, ctx, size) {
  // D₀ (приор): density × meanFloors/16 + ядро (150/300 м) + артерия (10 м); clamp 0..1
  const density = Number.isFinite(Number(d?.buildingDensity)) ? Number(d.buildingDensity) : 0.45;
  const hr = Array.isArray(d?.heightRange) ? d.heightRange : [2, 9];
  const meanFloors = (Number(hr[0]) + Number(hr[1])) / 2 || 0;
  let pressure = density * (meanFloors / PRESSURE_FLOOR_NORM);
  const rect = d?.geometry?.rect;
  const cx = rect ? (Number(rect.minX) + Number(rect.maxX)) / 2 : 0;
  const cz = rect ? (Number(rect.minZ) + Number(rect.maxZ)) / 2 : 0;
  const cores = Array.isArray(ctx?.terrain?.analysis?.coreCandidates) ? ctx.terrain.analysis.coreCandidates
    : (Array.isArray(ctx?.masks?.terrain?.coreCandidates) ? ctx.masks.terrain.coreCandidates : []);
  let anchor = 0;
  for (const c of cores) {
    const ax = Number(c?.x), az = Number(c?.z);
    if (!Number.isFinite(ax) || !Number.isFinite(az)) continue;
    const dd = Math.hypot(ax - cx, az - cz);
    anchor = Math.max(anchor, dd <= 150 ? ANCHOR_BONUS_150 : dd <= 300 ? ANCHOR_BONUS_300 : 0);
  }
  pressure += anchor;
  const roadSegments = ctx?.networks?.roads?.segments ?? [];
  const dArt = minSegmentDist(cx, cz, roadSegments, new Set(['arterial', 'highway']));
  if (Number.isFinite(dArt) && dArt <= 10) pressure += ARTERIAL_BONUS;
  return +Math.max(0, Math.min(1, pressure)).toFixed(4);
}

// R3.4 §6.6/§6.7/§6.8: соседство (industrial↔residential буфер, контраст этажности ≤ 2.5×),
// зелёный каркас (доля park/forest 8–15%), districtFrame (ось района: склон/река/артерия).
const ADJACENCY_BUFFER = new Set(['park', 'commercial', 'industrial', 'market', 'sports']);
const PARK_TYPES = new Set(['park', 'forest']);
const RES_LIKE = new Set(['residential', 'luxury', 'suburb']);
const FLOORS_EXEMPT = new Set(['park', 'forest']); // §6.6: парки/лес — явные швы, контраст не считаем
const FLOOR_DOWNCHAIN = ['old_town', 'market', 'residential', 'industrial', 'commercial', 'suburb', 'campus', 'slums'];
const PARK_SHARE_DEFAULT = [0.08, 0.15]; // §6.8; профиль может переопределить parkShare

function floorUp(type) {
  const f = TYPE_FLOORS[type];
  return f ? f[1] : 9;
}

function rectTouchInfo(a, b, eps = 0.5) {
  if (!a || !b) return null;
  const ixMin = Math.max(a.minX, b.minX), ixMax = Math.min(a.maxX, b.maxX);
  const izMin = Math.max(a.minZ, b.minZ), izMax = Math.min(a.maxZ, b.maxZ);
  const ox = ixMax - ixMin, oz = izMax - izMin;
  // shared vertical edge (along Z)
  if (Math.abs(a.maxX - b.minX) <= eps && oz > eps) return { axis: 'x', along: oz, at: a.maxX, aSide: +1, bSide: -1, z0: izMin, z1: izMax };
  if (Math.abs(b.maxX - a.minX) <= eps && oz > eps) return { axis: 'x', along: oz, at: b.maxX, aSide: -1, bSide: +1, z0: izMin, z1: izMax };
  // shared horizontal edge (along X)
  if (Math.abs(a.maxZ - b.minZ) <= eps && ox > eps) return { axis: 'z', along: ox, at: a.maxZ, aSide: +1, bSide: -1, x0: ixMin, x1: ixMax };
  if (Math.abs(b.maxZ - a.minZ) <= eps && ox > eps) return { axis: 'z', along: ox, at: b.maxZ, aSide: -1, bSide: +1, x0: ixMin, x1: ixMax };
  return null;
}

function geomDistrictAdjacency(districts, eps = 0.5) {
  const n = districts.length;
  const adj = Array.from({ length: n }, () => new Set());
  const touch = new Map();
  for (let i = 0; i < n; i++) {
    const ra = districts[i]?.geometry?.rect;
    if (!ra) continue;
    for (let j = i + 1; j < n; j++) {
      const rb = districts[j]?.geometry?.rect;
      if (!rb) continue;
      const info = rectTouchInfo(ra, rb, eps);
      if (!info) continue;
      adj[i].add(j); adj[j].add(i);
      touch.set(`${i},${j}`, { i, j, info });
    }
  }
  return { adj, touch };
}

function cloneDistrictAs(d, patch) {
  return {
    ...d,
    ...patch,
    geometry: patch.geometry ?? (d.geometry ? structuredClone(d.geometry) : d.geometry),
    cells: [],
    landValue: null,
    pressure: null,
  };
}

function carveBufferStrip(DS, i, j, touchInfo, bufferType, desiredWidth = 56, minRemain = 40) {
  const di = DS[i], dj = DS[j];
  const ri = di?.geometry?.rect, rj = dj?.geometry?.rect;
  if (!ri || !rj) return null;
  const info = touchInfo;
  if (!info) return null;
  // try to carve from side i (aSide points outward from i toward j along axis)
  const trySide = (idx, rect, towardSign) => {
    if (info.axis === 'x') {
      const span = rect.maxX - rect.minX;
      const w = Math.min(desiredWidth, Math.max(40, span - minRemain));
      if (w < 40 || span - w < minRemain) return null;
      const strip = towardSign > 0
        ? { minX: rect.maxX - w, maxX: rect.maxX, minZ: rect.minZ, maxZ: rect.maxZ }
        : { minX: rect.minX, maxX: rect.minX + w, minZ: rect.minZ, maxZ: rect.maxZ };
      const remain = towardSign > 0
        ? { minX: rect.minX, maxX: rect.maxX - w, minZ: rect.minZ, maxZ: rect.maxZ }
        : { minX: rect.minX + w, maxX: rect.maxX, minZ: rect.minZ, maxZ: rect.maxZ };
      return { strip, remain };
    } else {
      const span = rect.maxZ - rect.minZ;
      const w = Math.min(desiredWidth, Math.max(40, span - minRemain));
      if (w < 40 || span - w < minRemain) return null;
      const strip = towardSign > 0
        ? { minX: rect.minX, maxX: rect.maxX, minZ: rect.maxZ - w, maxZ: rect.maxZ }
        : { minX: rect.minX, maxX: rect.maxX, minZ: rect.minZ, maxZ: rect.minZ + w };
      const remain = towardSign > 0
        ? { minX: rect.minX, maxX: rect.maxX, minZ: rect.minZ, maxZ: rect.maxZ - w }
        : { minX: rect.minX, maxX: rect.maxX, minZ: rect.minZ + w, maxZ: rect.maxZ };
      return { strip, remain };
    }
  };
  // Prefer carving from the district whose type is less "protected"/more flexible; try both sides.
  const candidates = [
    { idx: i, toward: info.aSide, other: j },
    { idx: j, toward: info.bSide, other: i },
  ];
  for (const c of candidates) {
    const d = DS[c.idx], o = DS[c.other];
    if (!d || !o) continue;
    const res = trySide(c.idx, d.geometry.rect, c.toward);
    if (!res) continue;
    // buffer must be compatible with both adjacent sides it will touch
    if (!canSwapToTypeSimple(bufferType, [d.type, o.type])) continue;
    return { donorIdx: c.idx, otherIdx: c.other, ...res, bufferType };
  }
  return null;
}

function canSwapToTypeSimple(toType, neighborTypes) {
  const compat = COMPAT[toType];
  if (!compat) return false;
  return neighborTypes.every(nt => (compat.has(nt) ?? true) && (COMPAT[nt]?.has(toType) ?? true));
}


function districtAdjacency(districts) {
  const byCell = new Map();
  districts.forEach((d, idx) => { for (const c of (d.cells ?? [])) if (c) byCell.set(`${c.cx},${c.cy}`, idx); });
  const adj = districts.map(() => new Set());
  for (const [key, idx] of byCell) {
    const [cx, cy] = key.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = byCell.get(`${cx + dx},${cy + dy}`);
      if (n !== undefined && n !== idx) { adj[idx].add(n); adj[n].add(idx); }
    }
  }
  return adj;
}

function rectAreaOf(d) {
  const r = d?.geometry?.rect;
  if (!r) return 0;
  return Math.max(0, (Number(r.maxX) - Number(r.minX)) * (Number(r.maxZ) - Number(r.minZ)));
}

function canSwapToType(districts, adj, idx, toType) {
  const neighbors = [...(adj[idx] ?? [])].map(k => districts[k]?.type).filter(Boolean);
  const compat = COMPAT[toType];
  return neighbors.every(nt => (compat?.has(nt) ?? true) && (COMPAT[nt]?.has(toType) ?? true));
}

function swapDistrictType(districts, adj, idx, toType) {
  if (!toType) return false;
  if (!canSwapToType(districts, adj, idx, toType)) return false;
  const d = districts[idx];
  if (!d || d.type === toType) return false;
  d.type = toType;
  d.profileId = toType;
  return true;
}

// R3.5 §7.3: рекурсивное деление блоков по давлению (D≥0.75 → 4 под-блока, D≥0.5 → 2);
// и по целевому размеру B(D): плотный блок делится, пока характерный размер > B(D).
// Под-блоки наследуют тип/плотность/этажность; давление пересчитывается по центру.
// R3.4 (partial): привязка линий деления к рубежам (река/магистраль) при близком пересечении.
export function splitDistrictsByPressure(districts, opts = {}) {
  const ctx = opts?.ctx ?? null;
  const size = Number.isFinite(opts?.size) ? opts.size : (Number.isFinite(opts) ? opts : 1280);
  const policies = opts?.policies ?? ctx?.meta?.policies ?? {};
  const rd = policies?.roadDensity ?? {};
  const bMin = Number.isFinite(Number(rd.bMin)) ? Number(rd.bMin) : 60;
  const bMax = Number.isFinite(Number(rd.bMax)) ? Number(rd.bMax) : 260;
  const gamma = Number.isFinite(Number(rd.gamma)) ? Number(rd.gamma) : 0.8;
  const minSpan = Number.isFinite(Number(opts?.minSpan)) ? Number(opts.minSpan) : Math.max(40, bMin * 0.75);
  const maxDepth = Number.isFinite(Number(opts?.maxDepth)) ? Number(opts.maxDepth) : 5;

  const pressureFor = (d) => (ctx ? districtPressure(d, ctx, size) : (Number(d?.pressure) || 0));
  const targetBFor = (p) => targetBDistance(p, { bMin, bMax, gamma });

  // Barrier segments for optional split-line snapping (R3.4): rivers and major roads.
  const barrierSegs = [];
  if (ctx) {
    const rivers = ctx?.hydrology?.rivers ?? ctx?.masks?.easement?.rivers ?? ctx?.input?.cityforge?.hydrology?.rivers ?? [];
    for (const rv of rivers) {
      const path = Array.isArray(rv?.path) ? rv.path : [];
      for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i], b = path[i + 1];
        if (a && b) barrierSegs.push({ ax: a[0], az: a[2], bx: b[0], bz: b[2], w: 2.0 });
      }
    }
    const roads = ctx?.networks?.roads?.segments ?? ctx?.input?.cityforge?.networks?.roads?.segments ?? [];
    for (const s of roads) {
      const t = String(s?.type ?? s?.class ?? '');
      if (t !== 'highway' && t !== 'arterial') continue;
      const path = Array.isArray(s?.path) ? s.path : [];
      for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i], b = path[i + 1];
        if (a && b) barrierSegs.push({ ax: a[0], az: a[2], bx: b[0], bz: b[2], w: 1.0 });
      }
    }
  }
  const segIntersectionsX = (x, z0, z1) => {
    // vertical split line x = const crossing barrier segments: return candidate x (clamped) with weight
    const out = [];
    const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
    for (const s of barrierSegs) {
      const x1 = s.ax, z1s = s.az, x2 = s.bx, z2s = s.bz;
      const dz = z2s - z1s;
      if (Math.abs(dz) < 1e-9) continue;
      const t = ( ((z0 + z1) * 0.5) - z1s ) / dz; // rough: prefer crossing near middle band
      // exact intersection with horizontal scan across [z0,z1] not needed; check if segment spans line vertically
      // better: intersection of segment with vertical line x = ? solve for x at z within [lo,hi]
      // param along segment by z
      const t2 = (Math.max(lo, Math.min(hi, (lo + hi) / 2)) - z1s) / dz;
      if (t2 < 0 || t2 > 1) continue;
      const ix = x1 + (x2 - x1) * t2;
      if (Number.isFinite(ix)) out.push({ v: ix, w: s.w });
    }
    return out;
  };
  const segIntersectionsZ = (z, x0, x1) => {
    const out = [];
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    for (const s of barrierSegs) {
      const x1s = s.ax, z1s = s.az, x2s = s.bx, z2s = s.bz;
      const dx = x2s - x1s;
      if (Math.abs(dx) < 1e-9) continue;
      const t2 = (Math.max(lo, Math.min(hi, (lo + hi) / 2)) - x1s) / dx;
      if (t2 < 0 || t2 > 1) continue;
      const iz = z1s + (z2s - z1s) * t2;
      if (Number.isFinite(iz)) out.push({ v: iz, w: s.w });
    }
    return out;
  };
  const snapSplit = (mid, minV, maxV, axis /* 'x'|'z' */, rect) => {
    const span = maxV - minV;
    if (!(span > 1e-6)) return mid;
    // Conservative snap: keep split close to center and balanced to avoid harming ρ(D,1/area).
    const tol = Math.min(span * 0.12, 20);
    const cands = axis === 'x'
      ? segIntersectionsX(mid, rect.minZ, rect.maxZ)
      : segIntersectionsZ(mid, rect.minX, rect.maxX);
    let best = null;
    for (const c of cands) {
      const v = Math.max(minV + span * 0.4, Math.min(maxV - span * 0.4, c.v));
      const d = Math.abs(v - mid);
      if (d > tol) continue;
      const score = c.w * 10 - d;
      if (!best || score > best.score) best = { v, score };
    }
    return best ? best.v : mid;
  };


  const splitOne = (d, depth) => {
    const rect = d?.geometry?.rect;
    if (!rect) return [d];
    const p = pressureFor(d);
    const spanX = Number(rect.maxX) - Number(rect.minX);
    const spanZ = Number(rect.maxZ) - Number(rect.minZ);
    const charSpan = Math.min(spanX, spanZ);
    const targetB = targetBFor(p);
    const area = spanX * spanZ;
    const targetArea = targetB * targetB;
    const shouldQuad = p >= 0.55 && area > targetArea * 3.2;
    const shouldBi = area > targetArea * 1.6 || (p >= 0.4 && area > targetArea * 1.1);
    if (depth >= maxDepth || (!shouldQuad && !shouldBi)) {
      if (d.pressure !== p) d.pressure = p;
      return [d];
    }
    let cx = (Number(rect.minX) + Number(rect.maxX)) / 2;
    let cz = (Number(rect.minZ) + Number(rect.maxZ)) / 2;
    if (barrierSegs.length) {
      cx = snapSplit(cx, Number(rect.minX), Number(rect.maxX), 'x', rect);
      cz = snapSplit(cz, Number(rect.minZ), Number(rect.maxZ), 'z', rect);
    }
    const parts = [];
    if (shouldQuad && spanX >= minSpan * 2 && spanZ >= minSpan * 2) {
      parts.push(
        { minX: rect.minX, minZ: rect.minZ, maxX: cx, maxZ: cz },
        { minX: cx, minZ: rect.minZ, maxX: rect.maxX, maxZ: cz },
        { minX: rect.minX, minZ: cz, maxX: cx, maxZ: rect.maxZ },
        { minX: cx, minZ: cz, maxX: rect.maxX, maxZ: rect.maxZ },
      );
    } else if (spanX >= spanZ && spanX >= minSpan * 2) {
      parts.push(
        { minX: rect.minX, minZ: rect.minZ, maxX: cx, maxZ: rect.maxZ },
        { minX: cx, minZ: rect.minZ, maxX: rect.maxX, maxZ: rect.maxZ },
      );
    } else if (spanZ >= minSpan * 2) {
      parts.push(
        { minX: rect.minX, minZ: rect.minZ, maxX: rect.maxX, maxZ: cz },
        { minX: rect.minX, minZ: cz, maxX: rect.maxX, maxZ: rect.maxZ },
      );
    } else {
      if (d.pressure !== p) d.pressure = p;
      return [d];
    }
    const children = parts.map((rectPart, k) => ({
      ...d,
      id: depth === 0 ? `${d.id}_${k}` : `${d.id}${k}`,
      parentId: d.id,
      geometry: { rect: rectPart },
      cells: [],
      landValue: null,
      pressure: null,
    }));
    return children.flatMap(child => splitOne(child, depth + 1));
  };

  return (districts ?? []).flatMap(d => splitOne(d, 0));
}

function spearmanRank(xs, ys) {
  // ранговая корреляция Спирмена (с усреднением рангов при равенствах); null при n<3 или нулевой дисперсии
  const n = xs.length;
  if (n < 3) return null;
  const rankOf = (arr) => {
    const order = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const ranks = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && order[j + 1][0] === order[i][0]) j++;
      const r = (i + j + 2) / 2; // средний 1-based ранг
      for (let k = i; k <= j; k++) ranks[order[k][1]] = r;
      i = j + 1;
    }
    return ranks;
  };
  const rx = rankOf(xs), ry = rankOf(ys);
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += rx[i]; my += ry[i]; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - mx, dy = ry[i] - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return +(sxy / Math.sqrt(sxx * syy)).toFixed(4);
}

export const DEFAULT_PROFILES = {
  office: { id: 'office', label: 'Офисный', weight: 1.1, parcels: { min: 18, max: 42, coverage: 0.55 }, buildings: { kinds: ['office_tower', 'office_mid', 'office_block', 'skyscraper', 'megablock'], maxFloors: 40, materials: ['glass_and_concrete', 'concrete'] } },
  park: { id: 'park', label: 'Парк', weight: 0.9, parcels: { min: 24, max: 64, coverage: 0.12 }, buildings: { kinds: ['pavilion', 'modern_pavilion', 'aframe'], maxFloors: 2, materials: ['painted_brick', 'concrete'] } },
  industrial: { id: 'industrial', label: 'Промышленный', weight: 1.0, parcels: { min: 24, max: 56, coverage: 0.45 }, buildings: { kinds: ['warehouse', 'factory', 'workshop'], maxFloors: 5, materials: ['concrete', 'rusted_metal'] } },
  luxury: { id: 'luxury', label: 'Лакшери', weight: 0.8, parcels: { min: 18, max: 38, coverage: 0.38 }, buildings: { kinds: ['residential_mid', 'villa', 'chalet', 'modern_pavilion'], maxFloors: 14, materials: ['stone_base', 'glass_and_concrete'] } },
  residential: { id: 'residential', label: 'Жилой', weight: 1.0, parcels: { min: 14, max: 30, coverage: 0.42 }, buildings: { kinds: ['residential_low', 'residential_mid', 'apartment_block', 'panelka'], maxFloors: 16, materials: ['painted_brick', 'concrete'] } },
  slums: { id: 'slums', label: 'Трущобы', weight: 0.7, parcels: { min: 10, max: 22, coverage: 0.5 }, buildings: { kinds: ['shack', 'residential_low', 'slum_shack'], maxFloors: 4, materials: ['rusted_metal', 'painted_brick'] } },
  forest: { id: 'forest', label: 'Лес/поле', weight: 0.8, parcels: { min: 30, max: 80, coverage: 0.04 }, buildings: { kinds: ['aframe'], maxFloors: 2, materials: ['painted_brick'] } },
  parking: { id: 'parking', label: 'Парковки', weight: 0.8, parcels: { min: 22, max: 56, coverage: 0.08 }, buildings: { kinds: ['booth'], maxFloors: 2, materials: ['concrete'] } },
  sports: { id: 'sports', label: 'Спорт', weight: 0.6, parcels: { min: 26, max: 60, coverage: 0.2 }, buildings: { kinds: ['sports_hall', 'pavilion', 'modern_pavilion'], maxFloors: 3, materials: ['concrete', 'glass_and_concrete'] } },
  commercial: { id: 'commercial', label: 'Коммерческий', weight: 0.9, parcels: { min: 16, max: 36, coverage: 0.48 }, buildings: { kinds: ['mall', 'shop_row', 'office_mid', 'office_block', 'modern_pavilion'], maxFloors: 12, materials: ['glass_and_concrete', 'painted_brick', 'concrete'] } },
  suburb: { id: 'suburb', label: 'Пригород', weight: 0.9, parcels: { min: 18, max: 40, coverage: 0.28 }, buildings: { kinds: ['cottage', 'townhouse', 'residential_low', 'classic_cottage', 'barn_house', 'chalet'], maxFloors: 3, materials: ['painted_brick', 'stone_base'] } },
  old_town: { id: 'old_town', label: 'Старый город', weight: 0.7, parcels: { min: 12, max: 26, coverage: 0.5 }, buildings: { kinds: ['townhouse', 'historic_block', 'shop_row', 'mansard_house', 'classic_cottage'], maxFloors: 5, materials: ['stone_base', 'painted_brick'] } },
  campus: { id: 'campus', label: 'Кампус', weight: 0.6, parcels: { min: 28, max: 64, coverage: 0.22 }, buildings: { kinds: ['campus_hall', 'pavilion', 'office_mid', 'modern_pavilion'], maxFloors: 6, materials: ['concrete', 'glass_and_concrete', 'painted_brick'] } },
  market: { id: 'market', label: 'Рынок', weight: 0.7, parcels: { min: 14, max: 32, coverage: 0.42 }, buildings: { kinds: ['market_hall', 'shop_row', 'shack'], maxFloors: 3, materials: ['painted_brick', 'rusted_metal', 'concrete'] } },
};

const COMPAT = {
  office: new Set(['office', 'parking', 'luxury', 'residential', 'park', 'industrial', 'sports', 'commercial', 'campus', 'suburb']),
  park: new Set(['park', 'luxury', 'residential', 'office', 'forest', 'sports', 'parking', 'suburb', 'campus', 'old_town', 'market']),
  industrial: new Set(['industrial', 'parking', 'office', 'slums', 'forest', 'commercial', 'market']),
  luxury: new Set(['luxury', 'park', 'office', 'residential', 'parking', 'sports', 'commercial', 'campus', 'market']),
  residential: new Set(['residential', 'luxury', 'park', 'office', 'parking', 'sports', 'slums', 'forest', 'suburb', 'old_town', 'commercial', 'campus', 'market']),
  slums: new Set(['slums', 'industrial', 'residential', 'parking', 'forest', 'market', 'old_town']),
  forest: new Set(['forest', 'park', 'residential', 'industrial', 'slums', 'parking', 'sports', 'office', 'luxury', 'suburb', 'campus', 'market']),
  parking: new Set(['parking', 'office', 'industrial', 'luxury', 'park', 'residential', 'slums', 'sports', 'forest', 'commercial', 'campus', 'market']),
  sports: new Set(['sports', 'park', 'residential', 'office', 'luxury', 'parking', 'forest', 'campus', 'suburb']),
  commercial: new Set(['commercial', 'office', 'residential', 'parking', 'luxury', 'industrial', 'market', 'old_town', 'campus']),
  suburb: new Set(['suburb', 'residential', 'park', 'forest', 'sports', 'campus', 'old_town', 'office', 'commercial', 'parking']),
  old_town: new Set(['old_town', 'residential', 'commercial', 'market', 'park', 'suburb', 'slums', 'campus']),
  campus: new Set(['campus', 'park', 'residential', 'office', 'sports', 'parking', 'suburb', 'commercial', 'luxury', 'forest', 'old_town']),
  market: new Set(['market', 'commercial', 'residential', 'slums', 'industrial', 'parking', 'old_town', 'forest', 'luxury', 'park', 'campus']),
};

const FALLBACK_CHAINS = {
  office: ['office', 'commercial', 'residential', 'luxury', 'parking', 'industrial', 'park'],
  residential: ['residential', 'suburb', 'park', 'luxury', 'office', 'old_town', 'slums', 'parking', 'forest'],
  park: ['park', 'forest', 'residential', 'sports', 'suburb', 'luxury', 'office', 'campus', 'parking'],
  industrial: ['industrial', 'parking', 'office', 'commercial', 'slums', 'forest'],
  luxury: ['luxury', 'residential', 'park', 'office', 'commercial', 'parking', 'sports'],
  slums: ['slums', 'market', 'residential', 'old_town', 'industrial', 'parking', 'forest'],
  forest: ['forest', 'park', 'suburb', 'residential', 'sports', 'parking', 'industrial', 'slums', 'luxury', 'office'],
  parking: ['parking', 'industrial', 'office', 'commercial', 'residential', 'sports', 'park', 'slums', 'forest'],
  sports: ['sports', 'park', 'campus', 'residential', 'office', 'luxury', 'parking', 'suburb', 'forest'],
  commercial: ['commercial', 'office', 'market', 'residential', 'old_town', 'parking', 'industrial', 'luxury'],
  suburb: ['suburb', 'residential', 'park', 'forest', 'old_town', 'sports', 'campus'],
  old_town: ['old_town', 'residential', 'commercial', 'market', 'suburb', 'park', 'slums'],
  campus: ['campus', 'park', 'office', 'residential', 'sports', 'commercial', 'suburb', 'luxury'],
  market: ['market', 'commercial', 'old_town', 'slums', 'residential', 'industrial', 'parking'],
};

function pickWithFallback(desired, candidates, profiles) {
  const chain = FALLBACK_CHAINS[desired] || [desired];
  for (const t of chain) {
    if (candidates.includes(t) && profiles[t]) return t;
  }
  return candidates[0] || desired;
}

function mergeProfiles(genProfiles) {
  const out = { ...DEFAULT_PROFILES };
  if (genProfiles && typeof genProfiles === 'object') {
    for (const [k, v] of Object.entries(genProfiles)) {
      if (v && typeof v === 'object') out[k] = { ...(out[k] || { id: k }), ...v, id: v.id || k };
    }
  }
  return out;
}

function weightedPick(rng, ids, profiles) {
  let total = 0;
  for (const id of ids) total += Math.max(0, Number(profiles[id]?.weight ?? 1));
  if (total <= 0) return ids[0];
  let r = rng() * total;
  for (const id of ids) {
    r -= Math.max(0, Number(profiles[id]?.weight ?? 1));
    if (r <= 0) return id;
  }
  return ids[ids.length - 1];
}

function compatibleTypes(neighborTypes, profiles) {
  const ids = Object.keys(profiles);
  return ids.filter(id => neighborTypes.every(nt => (COMPAT[id]?.has(nt) ?? true) && (COMPAT[nt]?.has(id) ?? true)));
}

export function makeStage3() {
  return {
    id: '3_districts_parcels',
    prepare(ctx) {
      const gen = ctx.input?.generator ?? {};
      ctx.districts = Array.isArray(gen.districts) ? structuredClone(gen.districts) : [];
      ctx.parcels = [];
      ctx.meta.profiles = mergeProfiles(gen.profiles);
    },
    generate(ctx) {
      const stageId = '3_districts_parcels';
      const profiles = ctx.meta.profiles || mergeProfiles(null);
      const size = ctx.meta.worldBounds?.size ?? ctx.input?.ground?.size ?? 256;
      const half = size / 2;
      const seed = mix(ctx.meta.seed ?? 0, stageId);
      const rng = makeRng(seed);

      // If no districts declared, auto-generate a deterministic grid assignment (MVP).
      let autoDistricts = false;
      if (!ctx.districts.length) {
        autoDistricts = true;
        const grid = size >= 1024 ? 4 : 3; // coarse planning grid
        const cell = size / grid;
        const allTypeIds = Object.keys(profiles);
        const assigned = new Map(); // key "i,j" -> type
        const districts = [];

        // Ensure a diverse baseline mix (core + expansion types) when possible.
        const core = ['office', 'residential', 'park', 'industrial', 'slums', 'forest', 'parking', 'sports', 'luxury', 'commercial', 'suburb', 'old_town', 'campus', 'market'];
        const preferred = core.filter(t => profiles[t]);
        // Guarantee a broad baseline set first, then fill remaining slots from preferred.
        const requiredSet = new Set();
        for (const t of ['office', 'residential', 'park', 'industrial', 'slums', 'forest', 'commercial', 'suburb']) if (profiles[t]) requiredSet.add(t);
        for (const t of preferred) { if (requiredSet.size >= Math.min(preferred.length, grid * grid)) break; requiredSet.add(t); }
        const required = [...requiredSet];
        const targetCounts = {
          office: 1, residential: 2, park: 1, industrial: 1, slums: 1, forest: 1, parking: 1, sports: 1, luxury: 1,
          commercial: 1, suburb: 2, old_town: 1, campus: 1, market: 1,
        };
        const coords = [];
        for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) coords.push({ i, j });
        // Deterministic spread for required types: stride through scan order to distribute across grid.
        const stride = Math.max(1, Math.floor(coords.length / Math.max(1, required.length)));
        const preassigned = new Map();
        let cursor = 0;
        for (let k = 0; k < required.length && preassigned.size < coords.length; k++) {
          let idx = (cursor + k * stride) % coords.length;
          let tries = 0;
          while (preassigned.has(`${coords[idx].i},${coords[idx].j}`) && tries < coords.length) {
            idx = (idx + 1) % coords.length;
            tries++;
          }
          preassigned.set(`${coords[idx].i},${coords[idx].j}`, required[k]);
        }

        // R3.4 §6.8 (initial bias): belts along rivers/lakes + 2–3 wedges from edge to center.
        const riversForGreen = ctx?.hydrology?.rivers ?? ctx?.input?.cityforge?.hydrology?.rivers ?? [];
        const lakesForGreen = ctx?.hydrology?.lakes ?? ctx?.input?.cityforge?.hydrology?.lakes ?? [];
        const distToWaterInit = (x, z) => {
          let best = Infinity;
          for (const rv of riversForGreen) {
            const path = Array.isArray(rv?.path) ? rv.path : [];
            for (let pi = 0; pi + 1 < path.length; pi++) {
              const a = path[pi], b = path[pi + 1];
              if (!a || !b) continue;
              best = Math.min(best, pointSegDistXZ(x, z, a[0], a[2], b[0], b[2]));
            }
          }
          for (const lake of lakesForGreen) {
            const area = lake?.area;
            if (area && typeof area === 'object' && String(area.type) === 'circle' && Array.isArray(area.center)) {
              const d = Math.abs(Math.hypot(x - Number(area.center[0]), z - Number(area.center[1])) - (Number(area.radius) || 0));
              if (Number.isFinite(d)) best = Math.min(best, d);
              continue;
            }
            const pts = Array.isArray(area?.points) ? area.points : (Array.isArray(area) ? area : []);
            for (let pi = 0; pi < pts.length; pi++) {
              const a = pts[pi], b = pts[(pi + 1) % pts.length];
              const ax = Number(Array.isArray(a) ? a[0] : a?.x), az = Number(Array.isArray(a) ? a[2] : a?.z);
              const bx = Number(Array.isArray(b) ? b[0] : b?.x), bz = Number(Array.isArray(b) ? b[2] : b?.z);
              if (Number.isFinite(ax) && Number.isFinite(az) && Number.isFinite(bx) && Number.isFinite(bz)) {
                best = Math.min(best, pointSegDistXZ(x, z, ax, az, bx, bz));
              }
            }
          }
          return best;
        };
        const wedgeSeedInit = mix(ctx.meta.seed ?? 0, 'park_wedges', stageId);
        const wedgeRngInit = makeRng(wedgeSeedInit);
        const wedgeCountInit = 3;
        const wedgeAnglesInit = [];
        const baseAInit = wedgeRngInit() * Math.PI * 2;
        for (let wi = 0; wi < wedgeCountInit; wi++) wedgeAnglesInit.push(baseAInit + (wi * Math.PI * 2) / wedgeCountInit + (wedgeRngInit() - 0.5) * 0.25);
        const wedgeAlignInit = (x, z) => {
          const r = Math.hypot(x, z);
          if (!(r > 1e-6)) return 0;
          const a = Math.atan2(z, x);
          let best = 0;
          for (const wa of wedgeAnglesInit) {
            let d = Math.abs(a - wa);
            d = Math.min(d, Math.PI * 2 - d);
            if (d < Math.PI / 7) best = Math.max(best, 1 - d / (Math.PI / 7));
          }
          const radial = clamp(r / Math.max(1, half), 0, 1);
          return best * (0.35 + 0.65 * radial);
        };
        const greenFrameScore = (x, z) => {
          const dw = distToWaterInit(x, z);
          const belt = Number.isFinite(dw) ? clamp(1 - dw / Math.max(80, size * 0.12), 0, 1) : 0;
          const wedge = wedgeAlignInit(x, z);
          return { belt, wedge, score: belt * 1.6 + wedge * 1.1 };
        };

        const typeCounts = Object.fromEntries(allTypeIds.map(t => [t, 0]));
        const roadSegments = ctx.networks?.roads?.segments ?? [];
        const roadNeedy = new Set(['office', 'residential', 'luxury', 'industrial', 'slums', 'parking', 'sports', 'commercial', 'old_town', 'campus', 'market']);
        const roadAverse = new Set(['forest', 'park', 'suburb']);
        for (let j = 0; j < grid; j++) {
          for (let i = 0; i < grid; i++) {
            const key = `${i},${j}`;
            const neighbors = [];
            if (i > 0) neighbors.push(assigned.get(`${i-1},${j}`));
            if (j > 0) neighbors.push(assigned.get(`${i},${j-1}`));
            const nTypes = neighbors.filter(Boolean);
            let candidates = compatibleTypes(nTypes, profiles);
            if (!candidates.length) candidates = allTypeIds.slice();
            const cx = -half + (i + 0.5) * cell;
            const cz = -half + (j + 0.5) * cell;
            const rd = minRoadDist(cx, cz, roadSegments);
            const lv = computeLandValue(ctx, cx, cz, size);
            const inFpl = inFloodplainAt(cx, cz, ctx?.masks?.terrain?.floodplains);
            const landMult = (id) => landValueAffinity(id, lv, inFpl);
            const gf = greenFrameScore(cx, cz);

            let type = preassigned.get(key);
            if (type && (!profiles[type] || !candidates.includes(type))) {
              type = pickWithFallback(type, candidates, profiles);
            }
            if (!type) {
              // weighted pick with balancing toward target shares and road-access bias
              let total = 0;
              const weights = candidates.map(id => {
                const base = Math.max(0, Number(profiles[id]?.weight ?? 1));
                const count = typeCounts[id] || 0;
                const target = targetCounts[id] ?? 1;
                const deficit = Math.max(0, target - count);
                const targetBoost = 1 + deficit * 0.35;
                const over = Math.max(0, count - target);
                const balance = 1 / (1 + count * 0.45 + over * 0.5);
                let access = 1;
                if (Number.isFinite(rd) && rd !== Infinity) {
                  if (roadNeedy.has(id)) {
                    if (rd < cell * 0.7) access = 1.3;
                    else if (rd < cell * 1.4) access = 1.05;
                    else access = 0.78;
                  } else if (roadAverse.has(id)) {
                    if (rd < cell * 0.7) access = 0.88;
                    else if (rd > cell * 1.2) access = 1.12;
                  }
                }
                // R3.4 §6.8: bias initial layout toward belts along water and 2–3 green wedges edge→center,
                // and favor continuity of green corridors (belts/wedges) from already-assigned neighbors.
                let greenBias = 1;
                if (PARK_TYPES.has(id)) {
                  let greenAdj = 0;
                  for (const nt of nTypes) if (PARK_TYPES.has(nt)) greenAdj += 1;
                  const cont = greenAdj > 0 ? 0.18 * Math.min(2, greenAdj) : 0;
                  greenBias = 1 + gf.score * 0.9 + (gf.belt > 0.45 ? 0.35 : 0) + (gf.wedge > 0.55 ? 0.25 : 0) + cont;
                } else if (gf.score > 0.75) {
                  greenBias = 0.82;
                }
                const w = base * balance * targetBoost * access * landMult(id) * greenBias;
                total += w;
                return { id, w };
              });
              let r = rng() * (total || 1), picked = candidates[0];
              for (const it of weights) { r -= it.w; if (r <= 0) { picked = it.id; break; } }
              type = picked;
            }
            if (!candidates.includes(type)) type = pickWithFallback(type, candidates, profiles) || weightedPick(rng, candidates, profiles);

            assigned.set(key, type);
            typeCounts[type] = (typeCounts[type] || 0) + 1;
            const minX = -half + i * cell, maxX = minX + cell;
            const minZ = -half + j * cell, maxZ = minZ + cell;
            districts.push({
              id: `district_${i}_${j}`,
              type,
              profileId: type,
              geometry: { rect: { minX, maxX, minZ, maxZ } },
              cells: [{ cx: i, cy: j }],
              priority: 0,
              landValue: lv ? +lv.landValue.toFixed(4) : null,
            });
          }
        }

        // Balance district types toward targets with compatibility-aware swaps (deterministic).
        const needTypes = preferred.filter(t => profiles[t]);
        const getCounts = () => { const m = Object.create(null); for (const d of districts) m[d.type] = (m[d.type]||0)+1; return m; };
        const canSwapTo = (d, toType) => {
          const c = d.cells?.[0]; if (!c) return false;
          const neigh = [];
          for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const n = districts.find(x => x.cells?.some(cc => cc.cx===c.cx+dx && cc.cy===c.cy+dy));
            if (n && n !== d) neigh.push(n.type);
          }
          return neigh.every(nt => (COMPAT[toType]?.has(nt) ?? true) && (COMPAT[nt]?.has(toType) ?? true));
        };
        for (let pass = 0; pass < 3; pass++) {
          const counts = getCounts();
          for (const need of needTypes) {
            const target = targetCounts[need] ?? 1;
            while ((counts[need] || 0) < target) {
              let swapped = false;
              // replace an over-target, compatible cell
              for (const d of districts) {
                const from = d.type;
                const fromTarget = targetCounts[from] ?? 1;
                if ((counts[from] || 0) <= Math.max(1, fromTarget) && (counts[from] || 0) <= 1) continue;
                if (from === need) continue;
                if (!canSwapTo(d, need)) continue;
                counts[from] = Math.max(0, (counts[from] || 1) - 1);
                d.type = need; d.profileId = need;
                counts[need] = (counts[need] || 0) + 1;
                typeCounts[from] = Math.max(0, (typeCounts[from] || 1) - 1);
                typeCounts[need] = (typeCounts[need] || 0) + 1;
                swapped = true;
                break;
              }
              if (swapped) continue;
              // fallback: allow swap from any type with surplus count
              for (const d of districts) {
                const from = d.type;
                if (from === need) continue;
                if ((counts[from] || 0) <= 1) continue;
                if (!canSwapTo(d, need)) continue;
                counts[from] = Math.max(0, (counts[from] || 1) - 1);
                d.type = need; d.profileId = need;
                counts[need] = (counts[need] || 0) + 1;
                typeCounts[from] = Math.max(0, (typeCounts[from] || 1) - 1);
                typeCounts[need] = (typeCounts[need] || 0) + 1;
                swapped = true;
                break;
              }
              if (!swapped) break;
            }
          }
        }

        // Guarantee representation of key district types (incl. newly added) when grid capacity allows.
        const mustHave = allTypeIds.filter(t => profiles[t] && t !== 'forest' || ['commercial','suburb','old_town','campus','market','slums','office','residential','industrial','park','luxury','parking','sports','forest'].includes(t));
        const mustSet = [...new Set(mustHave)];
        if (districts.length >= mustSet.length) {
          const counts = getCounts();
          for (const need of mustSet) {
            if ((counts[need] || 0) > 0) continue;
            let swapped = false;
            for (const d of districts) {
              const from = d.type;
              if ((counts[from] || 0) <= 1) continue;
              if (!canSwapTo(d, need)) continue;
              counts[from] = Math.max(0, (counts[from] || 1) - 1);
              d.type = need; d.profileId = need;
              counts[need] = 1;
              typeCounts[from] = Math.max(0, (typeCounts[from] || 1) - 1);
              typeCounts[need] = (typeCounts[need] || 0) + 1;
              swapped = true;
              break;
            }
            if (!swapped) {
              // Last resort: force into a cell even if adjacency suboptimal (keeps variety; downstream repair may adjust).
              const victim = districts.find(d => (counts[d.type] || 0) > 1) || districts.find(d => d.type !== need);
              if (victim) {
                const from = victim.type;
                counts[from] = Math.max(0, (counts[from] || 1) - 1);
                victim.type = need; victim.profileId = need;
                counts[need] = 1;
                typeCounts[from] = Math.max(0, (typeCounts[from] || 1) - 1);
                typeCounts[need] = (typeCounts[need] || 0) + 1;
                ctx.report.diagnostics.push(warn('district_forced_representation', stageId, `forced district type '${need}' into cell (compatibility relaxed)`, { cell: victim.cells?.[0], from }));
              }
            }
          }
        }
        ctx.districts = districts;
        ctx.report.diagnostics.push(info('districts_generated', stageId, 'auto-generated district grid', { count: districts.length, grid, types: [...new Set(districts.map(d=>d.type))].sort(), counts: typeCounts }));
      } else {
        // Normalize declared districts minimally
        ctx.districts = ctx.districts.map((d, idx) => ({ id: d.id ?? `district_${idx}`, type: d.type ?? d.profileId ?? 'office', profileId: d.profileId ?? d.type ?? 'office', priority: d.priority ?? 0, ...d }));
        ctx.report.diagnostics.push(info('districts_passthrough', stageId, 'using declared districts', { count: ctx.districts.length }));
      }

      // R3.4 §6.6/§6.7/§6.8: соседство, districtFrame, зелёный каркас (до R3.3 density attach).
      // Мутации типов — только для auto-generated районов (авторские declared районы не перестраиваем).
      {
        const DS = ctx.districts ?? [];
        const stageId = '3_districts_parcels';
        const baseY_ = Number(ctx?.input?.ground?.y ?? 0) || 0;
        const mods_ = ctx?.terrain?.modifiers ?? [];
        const repairs = [];
        const adj = districtAdjacency(DS);
        // текущие счётчики типов — чтобы мутации не выбивали редких типов из раскладки (все целевые ≥ 1)
        const curCounts = {};
        for (const d of DS) curCounts[d.type] = (curCounts[d.type] || 0) + 1;
        const TYPE_PROTECT = { office: 1, residential: 2, park: 1, industrial: 1, slums: 1, forest: 1, parking: 1, sports: 1, luxury: 1, commercial: 1, suburb: 2, old_town: 1, campus: 1, market: 1 };
        const isSurplus = (t) => (curCounts[t] || 0) > Math.max(1, TYPE_PROTECT[t] ?? 1);
        const trackSwap = (from, to) => { curCounts[from] = (curCounts[from] || 1) - 1; curCounts[to] = (curCounts[to] || 0) + 1; };
        if (autoDistricts) {
          // --- §6.6: industrial ↔ residential только через буфер (парк/склады/commercial/parking) ---
          for (let i = 0; i < DS.length; i++) {
            if (DS[i].type !== 'industrial') continue;
            for (const j of [...adj[i]]) {
              if (!RES_LIKE.has(DS[j]?.type)) continue;
              const fromType = DS[j].type;
              const fromI = DS[i].type;
              let buffered = false;
              // prefer converting RES_LIKE side to a buffer type compatible with both sides
              for (const cand of ['commercial', 'parking']) {
                if (isSurplus(fromType) && swapDistrictType(DS, adj, j, cand)) {
                  trackSwap(fromType, cand);
                  repairs.push({ kind: 'industrial_buffer', id: DS[j].id, to: cand, side: 'res' });
                  buffered = true;
                  break;
                }
              }
              if (buffered) continue;
              // fallback: convert industrial side to a compatible buffer/transition type
              for (const cand of ['market', 'parking']) {
                if (isSurplus(fromI) && swapDistrictType(DS, adj, i, cand)) {
                  trackSwap(fromI, cand);
                  repairs.push({ kind: 'industrial_buffer', id: DS[i].id, to: cand, side: 'ind' });
                  buffered = true;
                  break;
                }
              }
              if (buffered) continue;
              ctx.report.diagnostics.push(warn('industrial_residential_adjacency', stageId, `industrial '${DS[i].id}' прилегает к '${DS[j]?.type}' '${DS[j].id}' без вставляемого буфера`, { industrial: DS[i].id, other: DS[j].id }));
            }
          }
          // --- §6.6: контраст этажности соседей ≤ 2.5× (кроме швов: парки/лес) ---
          let floorsUnresolved = 0;
          for (let pass = 0; pass < 2; pass++) {
            let changed = false;
            for (let i = 0; i < DS.length; i++) {
              if (FLOORS_EXEMPT.has(DS[i].type)) continue;
              for (const j of [...adj[i]]) {
                if (FLOORS_EXEMPT.has(DS[j]?.type)) continue;
                const a = Math.max(1, floorUp(DS[i].type));
                const b = Math.max(1, floorUp(DS[j]?.type));
                if (Math.max(a, b) / Math.min(a, b) <= 2.5) continue;
                const taller = a >= b ? i : j;
                const shorter = taller === i ? j : i;
                const minUp = Math.max(1, floorUp(DS[shorter]?.type));
                if (!isSurplus(DS[taller].type)) { floorsUnresolved += 1; continue; }
                for (const cand of FLOOR_DOWNCHAIN) {
                  if (floorUp(cand) > 2.5 * minUp) continue;
                  const from = DS[taller].type;
                  if (swapDistrictType(DS, adj, taller, cand)) { trackSwap(from, cand); repairs.push({ kind: 'floors_contrast', id: DS[taller].id, to: cand }); changed = true; break; }
                }
              }
            }
            if (!changed) break;
          }
          if (floorsUnresolved > 0) {
            // остаточные контрасты в грубой сетке блоков (3,2 га) — задокументированное ограничение, не сбой
            ctx.report.diagnostics.push(info('floors_contrast_unresolved', stageId, 'floors contrast above 2.5x kept to preserve type diversity (coarse grid; seams allowed)', { count: floorsUnresolved }));
          }
          // --- §6.6: общая совместимость соседства (матрица соседства/буферы) ---
          const isCompatPair = (a, b) => !!(COMPAT[a]?.has(b) && COMPAT[b]?.has(a));
          const tryRepairIncompat = (idx, otherIdx) => {
            if (!isSurplus(DS[idx].type)) return false;
            const neighTypes = [...(adj[idx] ?? [])].map(k => DS[k]?.type).filter(Boolean);
            const chain = (FALLBACK_CHAINS[DS[idx].type] || ['park', 'commercial', 'parking', 'residential', 'office']);
            for (const cand of chain) {
              if (cand === DS[idx].type) continue;
              if (!profiles[cand]) continue;
              const okNeighbors = neighTypes.every(nt => COMPAT[cand]?.has(nt) && COMPAT[nt]?.has(cand));
              if (!okNeighbors) continue;
              const from = DS[idx].type;
              if (swapDistrictType(DS, adj, idx, cand)) {
                trackSwap(from, cand);
                repairs.push({ kind: 'adjacency_compat', id: DS[idx].id, to: cand, other: DS[otherIdx]?.id ?? null, from });
                return true;
              }
            }
            return false;
          };
          let incompatUnresolved = 0;
          for (let pass = 0; pass < 2; pass++) {
            let changed = false;
            for (let i = 0; i < DS.length; i++) {
              for (const j of [...adj[i]]) {
                if (j <= i) continue;
                const ta = DS[i]?.type, tb = DS[j]?.type;
                if (!ta || !tb || isCompatPair(ta, tb)) continue;
                if (tryRepairIncompat(i, j) || tryRepairIncompat(j, i)) { changed = true; continue; }
                incompatUnresolved += 1;
              }
            }
            if (!changed) break;
          }
          if (incompatUnresolved > 0) {
            ctx.report.diagnostics.push(warn('adjacency_incompatible_unresolved', stageId, 'incompatible district adjacency could not be resolved by buffer swap (diversity/constraints)', { count: incompatUnresolved }));
          }
        } else {
          ctx.report.diagnostics.push(info('adjacency_repairs_skipped_declared', stageId, 'adjacency/park mutations skipped for declared districts (author intent preserved)', {}));
        }
        // --- §6.8: зелёный каркас — доля park/forest в пределах профиля (дефолт 8–15%) ---
        const parkShareRaw = Array.isArray(ctx?.meta?.activeCityProfile?.parkShare) ? ctx.meta.activeCityProfile.parkShare
          : (Array.isArray(ctx?.input?.generator?.parkShare) ? ctx.input.generator.parkShare : null);
        const parkRange = parkShareRaw && parkShareRaw.length >= 2
          ? [Number(parkShareRaw[0]) || PARK_SHARE_DEFAULT[0], Number(parkShareRaw[1]) || PARK_SHARE_DEFAULT[1]]
          : PARK_SHARE_DEFAULT;
        const plate = size * size;
        const parkAreaNow = () => DS.reduce((s, d) => s + (PARK_TYPES.has(d.type) ? rectAreaOf(d) : 0), 0);
        const shareBefore = plate > 0 ? parkAreaNow() / plate : 0;
        let promoted = 0, demoted = 0;
        // мутации — только для auto; редкие типы (campus/office/industrial/...) защищаем от вымывания
        const parkNeighborCount = (idx) => {
          let n = 0;
          for (const j of (adj[idx] ?? [])) if (PARK_TYPES.has(DS[j]?.type)) n += 1;
          return n;
        };
        // R3.4 §6.8 helpers: belts along rivers/lakes + 2–3 green wedges from edge to center.
        const riversForPark = ctx?.hydrology?.rivers ?? ctx?.input?.cityforge?.hydrology?.rivers ?? [];
        const lakesForPark = ctx?.hydrology?.lakes ?? ctx?.input?.cityforge?.hydrology?.lakes ?? [];
        const distToWaterCenter = (x, z) => {
          let best = Infinity;
          for (const rv of riversForPark) {
            const path = Array.isArray(rv?.path) ? rv.path : [];
            for (let i = 0; i + 1 < path.length; i++) {
              const a = path[i], b = path[i + 1];
              if (!a || !b) continue;
              best = Math.min(best, pointSegDistXZ(x, z, a[0], a[2], b[0], b[2]));
            }
          }
          for (const lake of lakesForPark) {
            const area = lake?.area;
            if (area && typeof area === 'object' && String(area.type) === 'circle' && Array.isArray(area.center)) {
              const d = Math.abs(Math.hypot(x - Number(area.center[0]), z - Number(area.center[1])) - (Number(area.radius) || 0));
              if (Number.isFinite(d)) best = Math.min(best, d);
              continue;
            }
            const pts = Array.isArray(area?.points) ? area.points : (Array.isArray(area) ? area : []);
            for (let i = 0; i < pts.length; i++) {
              const a = pts[i], b = pts[(i + 1) % pts.length];
              const ax = Number(Array.isArray(a) ? a[0] : a?.x), az = Number(Array.isArray(a) ? a[2] : a?.z);
              const bx = Number(Array.isArray(b) ? b[0] : b?.x), bz = Number(Array.isArray(b) ? b[2] : b?.z);
              if (Number.isFinite(ax) && Number.isFinite(az) && Number.isFinite(bx) && Number.isFinite(bz)) {
                best = Math.min(best, pointSegDistXZ(x, z, ax, az, bx, bz));
              }
            }
          }
          return best;
        };
        const wedgeSeed = mix(ctx.meta.seed ?? 0, 'park_wedges', stageId);
        const wedgeRng = makeRng(wedgeSeed);
        const wedgeCount = 3;
        const wedgeAngles = [];
        const baseA = wedgeRng() * Math.PI * 2;
        for (let i = 0; i < wedgeCount; i++) wedgeAngles.push(baseA + (i * Math.PI * 2) / wedgeCount + (wedgeRng() - 0.5) * 0.25);
        const wedgeAlignScore = (x, z) => {
          const r = Math.hypot(x, z);
          if (!(r > 1e-6)) return 0;
          const a = Math.atan2(z, x);
          let best = 0;
          for (const wa of wedgeAngles) {
            let d = Math.abs(a - wa);
            d = Math.min(d, Math.PI * 2 - d);
            if (d < Math.PI / 7) best = Math.max(best, 1 - d / (Math.PI / 7));
          }
          const radial = clamp(r / Math.max(1, half), 0, 1); // prefer reaching from edge inward
          return best * (0.4 + 0.6 * radial);
        };
        const beltWedgeBonus = (x, z) => {
          const dw = distToWaterCenter(x, z);
          const belt = Number.isFinite(dw) ? clamp(1 - dw / Math.max(80, size * 0.12), 0, 1) : 0; // belts along rivers/lakes
          const wedge = wedgeAlignScore(x, z); // 2–3 wedges edge→center
          return belt * 220 + wedge * 140;
        };

        if (autoDistricts && plate > 0 && shareBefore < parkRange[0]) {
          const scoreCand = (idx) => {
            const d = DS[idx];
            if (!d || PARK_TYPES.has(d.type) || rectAreaOf(d) <= 0 || !isSurplus(d.type)) return -Infinity;
            const r = d.geometry.rect;
            const cx = (Number(r.minX) + Number(r.maxX)) / 2, cz = (Number(r.minZ) + Number(r.maxZ)) / 2;
            const slope = sampleTerrainSlope(cx, cz, baseY_, mods_);
            const fpl = inFloodplainAt(cx, cz, ctx?.masks?.terrain?.floodplains) ? 1 : 0;
            const adjPark = parkNeighborCount(idx);
            const bw = beltWedgeBonus(cx, cz);
            // R3.4 §6.8: prefer connected green framework (adjacent to existing parks/corridors),
            // belts along rivers/lakes and 2–3 wedges from edge to center, plus barrier-aligned sites.
            return fpl * 1000 + bw + slope * 100 + adjPark * 80 + (1 - (d.landValue ?? 0.5));
          };
          for (let guard = 0; guard < DS.length + 4; guard++) {
            if (plate > 0 && parkAreaNow() / plate >= parkRange[0]) break;
            const hasPark = DS.some(d => PARK_TYPES.has(d.type));
            let bestIdx = -1, bestS = -Infinity;
            if (hasPark) {
              // grow connected component: prefer candidates adjacent to existing parks
              for (let i = 0; i < DS.length; i++) {
                if (PARK_TYPES.has(DS[i]?.type) || rectAreaOf(DS[i]) <= 0 || !isSurplus(DS[i]?.type)) continue;
                if (parkNeighborCount(i) <= 0) continue;
                const s = scoreCand(i);
                if (s > bestS) { bestS = s; bestIdx = i; }
              }
            }
            if (bestIdx < 0) {
              // seed or fallback: pick best overall candidate
              for (let i = 0; i < DS.length; i++) {
                if (PARK_TYPES.has(DS[i]?.type) || rectAreaOf(DS[i]) <= 0 || !isSurplus(DS[i]?.type)) continue;
                const s = scoreCand(i);
                if (s > bestS) { bestS = s; bestIdx = i; }
              }
            }
            if (bestIdx < 0) break;
            const fromT = DS[bestIdx].type;
            if (swapDistrictType(DS, adj, bestIdx, 'park') || swapDistrictType(DS, adj, bestIdx, 'forest')) { trackSwap(fromT, DS[bestIdx].type); promoted += 1; }
            else break; // cannot promote this candidate, avoid infinite loop
          }
        }
        if (autoDistricts && plate > 0 && parkAreaNow() / plate > parkRange[1]) {
          const parkCount = () => DS.reduce((s, d) => s + (PARK_TYPES.has(d.type) ? 1 : 0), 0);
          const demote = DS.map((d, idx) => ({ d, idx, adjPark: parkNeighborCount(idx) }))
            .filter(x => PARK_TYPES.has(x.d.type))
            // Prefer demoting isolated/high-land-value parks to preserve connected green core.
            .sort((a, b) => (a.adjPark - b.adjPark) || ((b.d.landValue ?? 0) - (a.d.landValue ?? 0)));
          for (const { idx } of demote) {
            if (parkAreaNow() <= parkRange[1] * plate) break;
            if (parkCount() <= 1) break; // не вымываем последний парк (§6.8 целостность каркаса)
            const fromT = DS[idx].type;
            if (swapDistrictType(DS, adj, idx, 'residential')) { trackSwap(fromT, 'residential'); demoted += 1; }
          }
          if (parkAreaNow() / plate > parkRange[1]) {
            ctx.report.diagnostics.push(warn('park_share_over_max_kept_diversity', stageId, 'park share above profile max kept to preserve type diversity', { after: +(parkAreaNow() / plate).toFixed(4), max: parkRange[1] }));
          }
        }
        // Optional connectivity nudge: if multiple park districts exist, prefer connecting
        // isolated parks to a larger green cluster by promoting a compatible bridge neighbor
        // (without exceeding park share max). This strengthens §6.8 "связная система парков".
        let parkBridged = 0;
        if (autoDistricts && plate > 0) {
          const parkIdxs = () => DS.map((d, i) => ({ d, i })).filter(x => PARK_TYPES.has(x.d.type));
          const buildParkComps = () => {
            const pset = new Set(parkIdxs().map(x => x.i));
            const compId = new Map();
            let cid = 0;
            for (const i of pset) {
              if (compId.has(i)) continue;
              const q = [i]; compId.set(i, cid);
              while (q.length) {
                const cur = q.shift();
                for (const j of (adj[cur] ?? [])) if (pset.has(j) && !compId.has(j)) { compId.set(j, cid); q.push(j); }
              }
              cid += 1;
            }
            return { pset, compId, count: cid };
          };
          const maxShare = parkRange[1];
          for (let iter = 0; iter < 12; iter++) {
            const { pset, compId, count: compCount } = buildParkComps();
            if (pset.size < 2 || compCount <= 1) break;
            const shareNow = plate > 0 ? parkAreaNow() / plate : 0;
            // R3.4 §6.8: prefer direct bridges (a non-park cell adjacent to parks from >=2 components)
            let bridged = false;
            const candidates = [];
            for (let j = 0; j < DS.length; j++) {
              if (PARK_TYPES.has(DS[j]?.type)) continue;
              if (rectAreaOf(DS[j]) <= 0) continue;
              const touched = new Set();
              for (const n of (adj[j] ?? [])) if (pset.has(n)) touched.add(compId.get(n));
              if (touched.size < 2) continue; // must connect different green components
              const r = DS[j]?.geometry?.rect;
              const cx = r ? (Number(r.minX) + Number(r.maxX)) / 2 : 0;
              const cz = r ? (Number(r.minZ) + Number(r.maxZ)) / 2 : 0;
              candidates.push({ j, touched: touched.size, bw: beltWedgeBonus(cx, cz) });
            }
            candidates.sort((a, b) => (b.touched - a.touched) || (b.bw - a.bw));
            for (const bc of candidates) {
              const fromT = DS[bc.j].type;
              // if not surplus, try to relocate its type to a compatible surplus cell
              let relocated = null;
              let allowNonSurplusBridge = false;
              if (!isSurplus(fromT)) {
                for (let rj = 0; rj < DS.length; rj++) {
                  if (rj === bc.j || PARK_TYPES.has(DS[rj]?.type)) continue;
                  if (!isSurplus(DS[rj].type)) continue;
                  if (!canSwapToType(DS, adj, rj, fromT)) continue;
                  const rFrom = DS[rj].type;
                  if (swapDistrictType(DS, adj, rj, fromT)) {
                    trackSwap(rFrom, fromT);
                    relocated = { rj, from: rFrom, to: fromT };
                    break;
                  }
                }
                // §6.8 connectivity: allow non-surplus bridge if we can compensate share by demoting a park to fromT
                if (!relocated) allowNonSurplusBridge = true;
              }
              if (!isSurplus(fromT) && !relocated && !allowNonSurplusBridge) continue;
              let promotedType = null;
              if (canSwapToType(DS, adj, bc.j, 'forest') && swapDistrictType(DS, adj, bc.j, 'forest')) promotedType = 'forest';
              else if (canSwapToType(DS, adj, bc.j, 'park') && swapDistrictType(DS, adj, bc.j, 'park')) promotedType = 'park';
              if (!promotedType) {
                if (relocated && DS[relocated.rj]?.type === relocated.to) {
                  if (swapDistrictType(DS, adj, relocated.rj, relocated.from)) trackSwap(relocated.to, relocated.from);
                }
                continue;
              }
              trackSwap(fromT, promotedType);
              parkBridged += 1;
              // if at/over max share, compensate by demoting a peripheral park in a larger component
              if (plate > 0 && parkAreaNow() / plate > maxShare) {
                const { pset: pset2, compId: compId2 } = buildParkComps();
                const compSizes2 = new Map();
                for (const [, cid] of compId2.entries()) compSizes2.set(cid, (compSizes2.get(cid) || 0) + 1);
                const demoteCands = [...pset2].map(i => ({ i, adjPark: parkNeighborCount(i), lv: DS[i]?.landValue ?? 0, compSize: compSizes2.get(compId2.get(i)) || 0 }))
                  .filter(x => x.compSize > 1 && x.i !== bc.j)
                  .sort((a, b) => (b.compSize - a.compSize) || (a.adjPark - b.adjPark) || (b.lv - a.lv));
                let demotedOne = false;
                const preserveFromT = (!relocated && !isSurplus(fromT) && allowNonSurplusBridge);
                const toTPref = preserveFromT ? [fromT] : ['residential','suburb','parking','commercial','office','old_town','campus','market','slums','industrial','luxury','sports'];
                for (const dc of demoteCands) {
                  if (!PARK_TYPES.has(DS[dc.i]?.type)) continue;
                  const fromD = DS[dc.i].type;
                  if (!isSurplus(fromD)) continue;
                  for (const toT of toTPref) {
                    if (!toT || PARK_TYPES.has(toT)) continue;
                    if (swapDistrictType(DS, adj, dc.i, toT)) { trackSwap(fromD, toT); demoted += 1; demotedOne = true; break; }
                  }
                  if (demotedOne) break;
                }
                // if we couldn't demote to fromT while preserving a non-surplus bridge, try any demote and restore fromT
                if (!demotedOne && preserveFromT) {
                  for (const dc of demoteCands) {
                    if (!PARK_TYPES.has(DS[dc.i]?.type)) continue;
                    const fromD = DS[dc.i].type;
                    if (!isSurplus(fromD)) continue;
                    let demotedTo = null;
                    for (const toT of ['residential','suburb','parking','commercial','office','old_town','campus','market','slums','industrial','luxury','sports']) {
                      if (!toT || PARK_TYPES.has(toT) || toT === fromT) continue;
                      if (swapDistrictType(DS, adj, dc.i, toT)) { trackSwap(fromD, toT); demotedTo = toT; break; }
                    }
                    if (!demotedTo) continue;
                    // try to restore fromT count by converting a surplus cell (not bc.j, not dc.i) to fromT
                    let restored = false;
                    for (let rj = 0; rj < DS.length; rj++) {
                      if (rj === bc.j || rj === dc.i || PARK_TYPES.has(DS[rj]?.type)) continue;
                      if (!isSurplus(DS[rj].type)) continue;
                      const rFrom = DS[rj].type;
                      if (swapDistrictType(DS, adj, rj, fromT)) { trackSwap(rFrom, fromT); restored = true; break; }
                    }
                    if (restored) { demoted += 1; demotedOne = true; break; }
                    // fallback: accept demote without strict restore, then try best-effort representation restore
                    demoted += 1; demotedOne = true;
                    if (!isSurplus(fromT) && (curCounts[fromT] || 0) < Math.max(1, TYPE_PROTECT[fromT] ?? 1)) {
                      for (let rj = 0; rj < DS.length; rj++) {
                        if (rj === bc.j || rj === dc.i || PARK_TYPES.has(DS[rj]?.type)) continue;
                        if (!isSurplus(DS[rj].type)) continue;
                        const rFrom = DS[rj].type;
                        if (swapDistrictType(DS, adj, rj, fromT)) { trackSwap(rFrom, fromT); break; }
                      }
                    }
                    break;
                  }
                }
                if (!demotedOne) {
                  if (swapDistrictType(DS, adj, bc.j, fromT)) { trackSwap(promotedType, fromT); parkBridged = Math.max(0, parkBridged - 1); }
                  if (relocated && DS[relocated.rj]?.type === relocated.to) {
                    if (swapDistrictType(DS, adj, relocated.rj, relocated.from)) trackSwap(relocated.to, relocated.from);
                  }
                  continue;
                }
              }
              bridged = true;
              break;
            }
            if (bridged) continue;
            // Fallback growth step (allow net-neutral growth when share at/over max)
            const compSizes = new Map();
            for (const [idx, cid] of compId.entries()) compSizes.set(cid, (compSizes.get(cid) || 0) + 1);
            let smallestCid = null, smallestSz = Infinity;
            for (const [cid, sz] of compSizes.entries()) if (sz < smallestSz) { smallestSz = sz; smallestCid = cid; }
            if (smallestCid == null) break;
            const growCands = [];
            for (let j = 0; j < DS.length; j++) {
              if (PARK_TYPES.has(DS[j]?.type)) continue;
              if (rectAreaOf(DS[j]) <= 0 || !isSurplus(DS[j].type)) continue;
              let touchesSmall = false, touchesOther = false;
              for (const n of (adj[j] ?? [])) if (pset.has(n)) {
                if (compId.get(n) === smallestCid) touchesSmall = true; else touchesOther = true;
              }
              if (!touchesSmall) continue; // must extend a green component
              const r = DS[j]?.geometry?.rect;
              const cx = r ? (Number(r.minX) + Number(r.maxX)) / 2 : 0;
              const cz = r ? (Number(r.minZ) + Number(r.maxZ)) / 2 : 0;
              const bw = beltWedgeBonus(cx, cz);
              growCands.push({ j, touchesOther, bw, adjPark: parkNeighborCount(j) });
            }
            growCands.sort((a, b) => (Number(b.touchesOther) - Number(a.touchesOther)) || (b.bw - a.bw) || (b.adjPark - a.adjPark));
            let grew = false;
            for (const gc of growCands) {
              const fromT = DS[gc.j].type;
              let promotedType = null;
              if (canSwapToType(DS, adj, gc.j, 'forest') && swapDistrictType(DS, adj, gc.j, 'forest')) promotedType = 'forest';
              else if (canSwapToType(DS, adj, gc.j, 'park') && swapDistrictType(DS, adj, gc.j, 'park')) promotedType = 'park';
              if (!promotedType) continue;
              trackSwap(fromT, promotedType);
              parkBridged += 1;
              if (plate > 0 && parkAreaNow() / plate > maxShare) {
                const { pset: pset2, compId: compId2 } = buildParkComps();
                const compSizes2 = new Map();
                for (const [, cid] of compId2.entries()) compSizes2.set(cid, (compSizes2.get(cid) || 0) + 1);
                const demoteCands = [...pset2].map(i => ({ i, adjPark: parkNeighborCount(i), lv: DS[i]?.landValue ?? 0, compSize: compSizes2.get(compId2.get(i)) || 0 }))
                  .filter(x => x.compSize > 1 && x.i !== gc.j)
                  .sort((a, b) => (b.compSize - a.compSize) || (a.adjPark - b.adjPark) || (b.lv - a.lv));
                let demotedOne = false;
                for (const dc of demoteCands) {
                  if (!PARK_TYPES.has(DS[dc.i]?.type)) continue;
                  const fromD = DS[dc.i].type;
                  if (!isSurplus(fromD)) continue;
                  for (const toT of ['residential','suburb','parking','commercial','office','old_town','campus','market','slums','industrial','luxury','sports']) {
                    if (PARK_TYPES.has(toT)) continue;
                    if (swapDistrictType(DS, adj, dc.i, toT)) { trackSwap(fromD, toT); demoted += 1; demotedOne = true; break; }
                  }
                  if (demotedOne) break;
                }
                if (!demotedOne) {
                  if (swapDistrictType(DS, adj, gc.j, fromT)) { trackSwap(promotedType, fromT); parkBridged = Math.max(0, parkBridged - 1); }
                  continue;
                }
              }
              grew = true;
              break;
            }
            if (!grew && shareNow >= maxShare) break; // cannot progress without exceeding max when net-neutral impossible
            if (!grew) {
              // Path-bridge fallback (§6.8): try to connect two park components via a short
              // chain of convertible non-park cells (net-neutral when at/over max share).
              const tryPathBridge = () => {
                const { pset: psetP, compId: compIdP, count: compCountP } = buildParkComps();
                if (psetP.size < 2 || compCountP <= 1) return false;
                // multi-source BFS from all park cells through convertible non-park cells
                const prev = new Map(); // idx -> prev idx or -1 for park source
                const srcComp = new Map(); // idx -> component id of source
                const q = [];
                for (const i of psetP) { prev.set(i, -1); srcComp.set(i, compIdP.get(i)); q.push(i); }
                const maxPath = 6;
                while (q.length) {
                  const cur = q.shift();
                  const sc = srcComp.get(cur);
                  for (const j of (adj[cur] ?? [])) {
                    if (PARK_TYPES.has(DS[j]?.type)) {
                      const jc = compIdP.get(j);
                      if (jc !== sc) {
                        // reconstruct path of non-park cells between components
                        const path = [];
                        let x = cur;
                        while (x != null && prev.get(x) !== -1) { if (!PARK_TYPES.has(DS[x]?.type)) path.push(x); x = prev.get(x); }
                        path.reverse();
                        // path currently ends at cur (adj to target component j) and may include cur if non-park (unlikely)
                        // ensure path connects sc-side to jc-side: include cur if convertible and adjacent chain; better rebuild from meeting edge
                        // rebuild by tracing from cur back to park source excluding parks
                        const chain = [];
                        let t = cur;
                        while (t != null && prev.get(t) !== -1) { if (!PARK_TYPES.has(DS[t]?.type)) chain.push(t); t = prev.get(t); }
                        chain.reverse();
                        // j is park in other component adjacent to cur; chain are cells to convert
                        const chainUniq = [...new Set(chain)].filter(ix => !PARK_TYPES.has(DS[ix]?.type) && rectAreaOf(DS[ix]) > 0);
                        if (!chainUniq.length || chainUniq.length > maxPath) continue;
                        // attempt conversion of whole path, then compensate at end if over max share.
                        // allow non-surplus cells via type relocation (preserve type counts/diversity).
                        const converted = [];
                        const relocations = [];
                        const inPath = new Set(chainUniq);
                        let ok = true;
                        for (const ix of chainUniq) {
                          if (PARK_TYPES.has(DS[ix]?.type)) continue;
                          const fromT = DS[ix].type;
                          let relocated = false;
                          if (!isSurplus(fromT)) {
                            // try to relocate type fromT to another surplus-compatible cell
                            for (let rj = 0; rj < DS.length; rj++) {
                              if (rj === ix || inPath.has(rj)) continue;
                              if (PARK_TYPES.has(DS[rj]?.type)) continue;
                              if (!isSurplus(DS[rj].type)) continue;
                              if (!canSwapToType(DS, adj, rj, fromT)) continue;
                              const rFrom = DS[rj].type;
                              if (swapDistrictType(DS, adj, rj, fromT)) {
                                trackSwap(rFrom, fromT);
                                relocations.push({ rj, from: rFrom, to: fromT });
                                relocated = true;
                                break;
                              }
                            }
                            if (!relocated) { ok = false; break; }
                          }
                          let promotedType = null;
                          if (canSwapToType(DS, adj, ix, 'forest') && swapDistrictType(DS, adj, ix, 'forest')) promotedType = 'forest';
                          else if (canSwapToType(DS, adj, ix, 'park') && swapDistrictType(DS, adj, ix, 'park')) promotedType = 'park';
                          if (!promotedType) { ok = false; break; }
                          trackSwap(fromT, promotedType);
                          parkBridged += 1;
                          converted.push({ ix, fromT, promotedType });
                        }
                        if (ok && plate > 0) {
                          while (ok && parkAreaNow() / plate > maxShare) {
                            const { pset: p2, compId: c2 } = buildParkComps();
                            const cs2 = new Map(); for (const [, cid] of c2.entries()) cs2.set(cid, (cs2.get(cid) || 0) + 1);
                            const demoteCands = [...p2].map(i => ({ i, adjPark: parkNeighborCount(i), lv: DS[i]?.landValue ?? 0, compSize: cs2.get(c2.get(i)) || 0 }))
                              .filter(x => x.compSize > 1 && !converted.some(c => c.ix === x.i))
                              .sort((a, b) => (b.compSize - a.compSize) || (a.adjPark - b.adjPark) || (b.lv - a.lv));
                            let demotedOne = false;
                            for (const dc of demoteCands) {
                              if (!PARK_TYPES.has(DS[dc.i]?.type)) continue;
                              const fromD = DS[dc.i].type;
                              if (!isSurplus(fromD)) continue;
                              for (const toT of ['residential','suburb','parking','commercial','office','old_town','campus','market','slums','industrial','luxury','sports']) {
                                if (PARK_TYPES.has(toT)) continue;
                                if (swapDistrictType(DS, adj, dc.i, toT)) { trackSwap(fromD, toT); demoted += 1; demotedOne = true; break; }
                              }
                              if (demotedOne) break;
                            }
                            if (!demotedOne) { ok = false; break; }
                          }
                        }
                        if (ok) return true;
                        // rollback converted path and relocations
                        for (let k = converted.length - 1; k >= 0; k--) {
                          const c = converted[k];
                          if (PARK_TYPES.has(DS[c.ix]?.type)) {
                            if (swapDistrictType(DS, adj, c.ix, c.fromT)) { trackSwap(c.promotedType, c.fromT); parkBridged = Math.max(0, parkBridged - 1); }
                          }
                        }
                        for (let k = relocations.length - 1; k >= 0; k--) {
                          const r = relocations[k];
                          if (DS[r.rj]?.type === r.to) {
                            if (swapDistrictType(DS, adj, r.rj, r.from)) trackSwap(r.to, r.from);
                          }
                        }
                        continue;
                      }
                      continue;
                    }
                    if (prev.has(j)) continue;
                    if (rectAreaOf(DS[j]) <= 0) continue;
                    // limit search depth
                    let depth = 0, t = cur;
                    while (t != null && prev.get(t) !== -1) { depth++; t = prev.get(t); }
                    if (depth + 1 > maxPath) continue;
                    prev.set(j, cur); srcComp.set(j, sc); q.push(j);
                  }
                }
                return false;
              };
              // try a few path bridges before giving up
              for (let pb = 0; pb < 5; pb++) { if (buildParkComps().count <= 1) break; if (!tryPathBridge()) break; }
              break;
            }
          }
          // Repositioning fallback (§6.8): if still disconnected and share allows,
          // promote a direct bridge and demote a peripheral park in a larger component
          // (net-neutral where possible) to improve green connectivity within [min,max].
          for (let iter = 0; iter < 6; iter++) {
            const { pset, compId, count: compCount } = buildParkComps();
            if (pset.size < 2 || compCount <= 1) break;
            const shareNow = plate > 0 ? parkAreaNow() / plate : 0;
            if (shareNow < parkRange[0]) break; // don't risk dropping below min
            const bridgeCands = [];
            for (let j = 0; j < DS.length; j++) {
              if (PARK_TYPES.has(DS[j]?.type)) continue;
              if (rectAreaOf(DS[j]) <= 0 || !isSurplus(DS[j].type)) continue;
              const touched = new Set();
              for (const n of (adj[j] ?? [])) if (pset.has(n)) touched.add(compId.get(n));
              if (touched.size < 2) continue;
              const r = DS[j]?.geometry?.rect;
              const cx = r ? (Number(r.minX) + Number(r.maxX)) / 2 : 0;
              const cz = r ? (Number(r.minZ) + Number(r.maxZ)) / 2 : 0;
              bridgeCands.push({ j, touched: touched.size, bw: beltWedgeBonus(cx, cz) });
            }
            bridgeCands.sort((a, b) => (b.touched - a.touched) || (b.bw - a.bw));
            if (!bridgeCands.length) break;
            const compSizes = new Map();
            for (const [, cid] of compId.entries()) compSizes.set(cid, (compSizes.get(cid) || 0) + 1);
            const demoteCands = [...pset].map(i => ({ i, adjPark: parkNeighborCount(i), lv: DS[i]?.landValue ?? 0, compSize: compSizes.get(compId.get(i)) || 0 }))
              .filter(x => x.compSize > 1)
              .sort((a, b) => (b.compSize - a.compSize) || (a.adjPark - b.adjPark) || (b.lv - a.lv));
            let repositioned = false;
            for (const bc of bridgeCands) {
              const fromB = DS[bc.j].type;
              let promotedType = null;
              if (canSwapToType(DS, adj, bc.j, 'forest') && swapDistrictType(DS, adj, bc.j, 'forest')) promotedType = 'forest';
              else if (canSwapToType(DS, adj, bc.j, 'park') && swapDistrictType(DS, adj, bc.j, 'park')) promotedType = 'park';
              if (!promotedType) continue;
              trackSwap(fromB, promotedType);
              parkBridged += 1;
              // keep share in bounds (prefer net-neutral when over/near max)
              if (plate > 0 && parkAreaNow() / plate > parkRange[1]) {
                let demotedOne = false;
                for (const dc of demoteCands) {
                  if (dc.i === bc.j || !PARK_TYPES.has(DS[dc.i]?.type)) continue;
                  const fromD = DS[dc.i].type;
                  if (!isSurplus(fromD)) continue;
                  for (const toT of ['residential','suburb','parking','commercial','office','old_town','campus','market','slums','industrial','luxury','sports']) {
                    if (PARK_TYPES.has(toT)) continue;
                    if (swapDistrictType(DS, adj, dc.i, toT)) { trackSwap(fromD, toT); demoted += 1; demotedOne = true; break; }
                  }
                  if (demotedOne) break;
                }
                if (!demotedOne) {
                  if (swapDistrictType(DS, adj, bc.j, fromB)) { trackSwap(promotedType, fromB); parkBridged = Math.max(0, parkBridged - 1); }
                  continue;
                }
              }
              repositioned = true;
              break;
            }
            if (!repositioned) break;
          }
          // Net-neutral connectivity fix (§6.8): swap a park with a compatible non-park touching another component.
          let parkRelocated = 0;
          for (let iter = 0; iter < 24; iter++) {
            const { pset, compId, count: compCount } = buildParkComps();
            if (pset.size < 2 || compCount <= 1) break;
            let improved = false;
            const compSizes = new Map();
            for (const [, cid] of compId.entries()) compSizes.set(cid, (compSizes.get(cid) || 0) + 1);
            const parks = [...pset].map(i => ({ i, cid: compId.get(i), sz: compSizes.get(compId.get(i)) || 0, adjPark: parkNeighborCount(i) }))
              .sort((a, b) => (a.sz - b.sz) || (a.adjPark - b.adjPark));
            outerSwap: for (const pk of parks) {
              for (let q = 0; q < DS.length; q++) {
                if (PARK_TYPES.has(DS[q]?.type) || rectAreaOf(DS[q]) <= 0) continue;
                let touchesOther = false;
                for (const nn of (adj[q] ?? [])) {
                  if (nn === pk.i) continue;
                  if (PARK_TYPES.has(DS[nn]?.type) && compId.get(nn) !== pk.cid) { touchesOther = true; break; }
                }
                if (!touchesOther) continue;
                const pkType = DS[pk.i].type, qType = DS[q].type;
                if (!canSwapToType(DS, adj, pk.i, qType)) continue;
                DS[pk.i].type = qType; DS[pk.i].profileId = qType;
                const qOk = canSwapToType(DS, adj, q, pkType);
                DS[pk.i].type = pkType; DS[pk.i].profileId = pkType;
                if (!qOk) continue;
                DS[pk.i].type = qType; DS[pk.i].profileId = qType;
                DS[q].type = pkType; DS[q].profileId = pkType;
                const after = buildParkComps();
                if (after.count < compCount) { trackSwap(pkType, qType); trackSwap(qType, pkType); parkRelocated += 1; improved = true; break outerSwap; }
                DS[pk.i].type = pkType; DS[pk.i].profileId = pkType;
                DS[q].type = qType; DS[q].profileId = qType;
              }
            }
            if (!improved) break;
          }
          if (parkRelocated > 0) ctx.report.diagnostics.push(info('park_relocated', stageId, 'net-neutral park relocation to connect components (section 6.8)', { relocated: parkRelocated }));
        }
        const shareAfter = plate > 0 ? parkAreaNow() / plate : 0;
        const parkCompCountFinal = (() => {
          const pset = new Set(DS.map((d, i) => ({ d, i })).filter(x => PARK_TYPES.has(x.d.type)).map(x => x.i));
          const seen = new Set(); let comps = 0;
          for (const i of pset) {
            if (seen.has(i)) continue; comps += 1;
            const q = [i]; seen.add(i);
            while (q.length) { const cur = q.shift(); for (const j of (adj[cur] ?? [])) if (pset.has(j) && !seen.has(j)) { seen.add(j); q.push(j); } }
          }
          return comps;
        })();
        ctx.report.diagnostics.push(info('park_share', stageId, 'park/forest share enforced by section 6.8', {
          before: +shareBefore.toFixed(4), after: +shareAfter.toFixed(4), min: parkRange[0], max: parkRange[1], promoted, demoted, bridged: parkBridged, components: parkCompCountFinal,
        }));
        // --- §6.8: river-belt & wedge repair — гарантировать непрерывную ленту зелёных
        // вдоль рек/озёр и минимум 2 клина от края плиты к центру, сохраняя связность и долю парка.
        {
          const rivers = [
            ...(ctx?.hydrology?.rivers ?? []),
            ...(ctx?.input?.cityforge?.hydrology?.rivers ?? []),
            ...(ctx?.input?.waterways ?? []),
          ];
          const BELT_R = 60;
          const beltCover = (DSc) => {
            const greenSet = new Set(DSc.map((d, i) => (PARK_TYPES.has(d?.type) ? i : -1)).filter(i => i >= 0));
            let samples = 0, covered = 0;
            for (const rv of rivers) {
              const path = Array.isArray(rv?.path) ? rv.path : [];
              for (let s = 0; s + 1 < path.length; s++) {
                const a = path[s], b = path[s + 1];
                const ax = Number(a?.[0]), az = Number(a?.[2]), bx = Number(b?.[0]), bz = Number(b?.[2]);
                if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(bx) || !Number.isFinite(bz)) continue;
                const segLen = Math.hypot(bx - ax, bz - az);
                const steps = Math.max(1, Math.floor(segLen / 20));
                for (let k = 0; k <= steps; k++) {
                  const t = k / steps;
                  const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
                  samples += 1;
                  let ok = false;
                  for (const gi of greenSet) {
                    const r = DSc[gi]?.geometry?.rect;
                    if (r && px >= r.minX - BELT_R && px <= r.maxX + BELT_R && pz >= r.minZ - BELT_R && pz <= r.maxZ + BELT_R) { ok = true; break; }
                  }
                  if (ok) covered += 1;
                }
              }
            }
            return { samples, covered, ratio: samples > 0 ? covered / samples : null };
          };
          // §6.8: net-neutral ремоделирование зелёного каркаса — переносим зелёные ячейки
          // на ближайшие к реке незаполненные пояса (не увеличивая долю парка), отщепляя «листовые»
          // зелёные ячейки с нулевым покрытием реки; компоненты каркаса не разрываются.
          const degGreen = (idx, adjg, greenSet) => [...(adjg[idx] ?? [])].filter(n => greenSet.has(n)).length;
          const greenComponentsCount = (DSx) => {
            const adjx = districtAdjacency(DSx);
            const gset = new Set(DSx.map((d, i) => (PARK_TYPES.has(d?.type) ? i : -1)).filter(i => i >= 0));
            const seen = new Set(); let comps = 0;
            for (const s of gset) {
              if (seen.has(s)) continue;
              comps += 1;
              const q = [s]; seen.add(s);
              while (q.length) {
                const cur = q.shift();
                for (const n of (adjx[cur] ?? [])) if (gset.has(n) && !seen.has(n)) { seen.add(n); q.push(n); }
              }
            }
            return comps;
          };
          const riverPointDist = (px, pz) => {
            let best = Infinity;
            for (const rv of rivers) {
              const path = Array.isArray(rv?.path) ? rv.path : [];
              for (let s = 0; s + 1 < path.length; s++) {
                const a = path[s], b = path[s + 1];
                const ax = Number(a?.[0]), az = Number(a?.[2]), bx = Number(b?.[0]), bz = Number(b?.[2]);
                if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(bx) || !Number.isFinite(bz)) continue;
                const dd = pointSegDistXZ(px, pz, ax, az, bx, bz);
                if (dd < best) best = dd;
              }
            }
            return best;
          };
          const beltSampleCoverage = (DSx) => {
            const gset = new Set(DSx.map((d, i) => (PARK_TYPES.has(d?.type) ? i : -1)).filter(i => i >= 0));
            const samples = [];
            for (const rv of rivers) {
              const path = Array.isArray(rv?.path) ? rv.path : [];
              for (let s = 0; s + 1 < path.length; s++) {
                const a = path[s], b = path[s + 1];
                const ax = Number(a?.[0]), az = Number(a?.[2]), bx = Number(b?.[0]), bz = Number(b?.[2]);
                if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(bx) || !Number.isFinite(bz)) continue;
                const segLen = Math.hypot(bx - ax, bz - az);
                const steps = Math.max(1, Math.floor(segLen / 20));
                for (let k = 0; k <= steps; k++) {
                  const tt = k / steps;
                  samples.push({ px: ax + (bx - ax) * tt, pz: az + (bz - az) * tt });
                }
              }
            }
            let covered = 0;
            for (const sm of samples) {
              let ok = false;
              for (const gi of gset) {
                const r = DSx[gi]?.geometry?.rect;
                if (r && sm.px >= r.minX - BELT_R && sm.px <= r.maxX + BELT_R && sm.pz >= r.minZ - BELT_R && sm.pz <= r.maxZ + BELT_R) { ok = true; break; }
              }
              if (ok) covered += 1;
            }
            return { samples: samples.length, covered, ratio: samples.length ? covered / samples.length : null };
          };
          // счётчик покрытий каждой зелёной ячейки (для выбора самой слабой при переносе)
          const greenCoverageContribution = (DSx) => {
            const gset = new Set(DSx.map((d, i) => (PARK_TYPES.has(d?.type) ? i : -1)).filter(i => i >= 0));
            const counts = new Map([...gset].map(i => [i, 0]));
            for (const rv of rivers) {
              const path = Array.isArray(rv?.path) ? rv.path : [];
              for (let s = 0; s + 1 < path.length; s++) {
                const a = path[s], b = path[s + 1];
                const ax = Number(a?.[0]), az = Number(a?.[2]), bx = Number(b?.[0]), bz = Number(b?.[2]);
                if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(bx) || !Number.isFinite(bz)) continue;
                const segLen = Math.hypot(bx - ax, bz - az);
                const steps = Math.max(1, Math.floor(segLen / 20));
                for (let k = 0; k <= steps; k++) {
                  const tt = k / steps;
                  const px = ax + (bx - ax) * tt, pz = az + (bz - az) * tt;
                  for (const gi of gset) {
                    const r = DSx[gi]?.geometry?.rect;
                    if (r && px >= r.minX - BELT_R && px <= r.maxX + BELT_R && pz >= r.minZ - BELT_R && pz <= r.maxZ + BELT_R) counts.set(gi, (counts.get(gi) || 0) + 1);
                  }
                }
              }
            }
            return counts;
          };
          const wedgeAngles = (() => {
            const wr = makeRng(mix(ctx.meta.seed ?? 0, 'green_wedges'));
            const base = wr() * Math.PI * 2;
            return [base, base + (Math.PI * 2) / 3, base + (2 * Math.PI * 2) / 3];
          })();
          const wedgeAlign = (x, z) => {
            const r = Math.hypot(x, z);
            if (!(r > 1e-6)) return 0;
            const a = Math.atan2(z, x);
            let best = 0;
            for (const wa of wedgeAngles) {
              let d = Math.abs(a - wa);
              d = Math.min(d, Math.PI * 2 - d);
              if (d < Math.PI / 7) best = Math.max(best, 1 - d / (Math.PI / 7));
            }
            const radial = clamp(r / Math.max(1, size / 2), 0, 1);
            return best * (0.35 + 0.65 * radial);
          };
          const greenWedgeCellCount = (DSx) => {
            let n = 0;
            for (const d of DSx) {
              if (!PARK_TYPES.has(d?.type)) continue;
              const r = d.geometry?.rect; if (!r) continue;
              const cx = (Number(r.minX) + Number(r.maxX)) / 2, cz = (Number(r.minZ) + Number(r.maxZ)) / 2;
              if (wedgeAlign(cx, cz) > 0.4) n += 1;
            }
            return n;
          };
          let beltRelocated = 0;
          const promotedCells = new Set();
          for (let iter = 0; iter < 16 && autoDistricts && plate > 0; iter++) {
            const DSb = ctx.districts ?? [];
            const cov = beltSampleCoverage(DSb);
            if (cov.samples === 0 || (cov.ratio ?? 1) >= 0.9) break;
            // цель — первая непокрытая точка вдоль реки (детерминированно)
            let target = null;
            const gset = new Set(DSb.map((d, i) => (PARK_TYPES.has(d?.type) ? i : -1)).filter(i => i >= 0));
            for (const rv of rivers) {
              const path = Array.isArray(rv?.path) ? rv.path : [];
              for (let s = 0; s + 1 < path.length && !target; s++) {
                const a = path[s], b = path[s + 1];
                const ax = Number(a?.[0]), az = Number(a?.[2]), bx = Number(b?.[0]), bz = Number(b?.[2]);
                if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(bx) || !Number.isFinite(bz)) continue;
                const segLen = Math.hypot(bx - ax, bz - az);
                const steps = Math.max(1, Math.floor(segLen / 20));
                for (let k = 0; k <= steps && !target; k++) {
                  const tt = k / steps;
                  const px = ax + (bx - ax) * tt, pz = az + (bz - az) * tt;
                  let ok = false;
                  for (const gi of gset) {
                    const r = DSb[gi]?.geometry?.rect;
                    if (r && px >= r.minX - BELT_R && px <= r.maxX + BELT_R && pz >= r.minZ - BELT_R && pz <= r.maxZ + BELT_R) { ok = true; break; }
                  }
                  if (!ok) target = { px, pz };
                }
              }
              if (target) break;
            }
            if (!target) break;
            // BFS-коридор от зелёного каркаса к непокрытой точке: монотонно по связной сети районов,
            // мост через не-зелёные ячейки с минимальным числом шагов; каждая посаженная ячейка соединяется с каркасом.
            const adjr = districtAdjacency(DSb);
            const distMap = new Map();
            const parent = new Map();
            const q = [];
            for (const gi of gset) { distMap.set(gi, 0); q.push(gi); }
            let found = -1;
            while (q.length) {
              const cur = q.shift();
              const curD = distMap.get(cur);
              const r = DSb[cur]?.geometry?.rect;
              if (r) {
                const dd = Math.hypot(Math.max(r.minX - target.px, target.px - r.maxX, 0), Math.max(r.minZ - target.pz, target.pz - r.maxZ, 0));
                if (dd <= BELT_R + 1) { found = cur; break; }
              }
              for (const n of (adjr[cur] ?? [])) {
                if (distMap.has(n)) continue;
                const nd = DSb[n];
                if (!nd || rectAreaOf(nd) <= 0) continue;
                distMap.set(n, curD + 1);
                parent.set(n, cur);
                q.push(n);
              }
            }
            if (found < 0) break;
            const pathCells = [];
            {
              let cur = found;
              while (cur !== undefined && !gset.has(cur)) { pathCells.push(cur); cur = parent.get(cur); }
              pathCells.reverse();
            }
            if (!pathCells.length) break;
            // сажаем коридор по ячейкам: каждая net-neutral (отщепляем листовой зелёный минимум вне коридора)
            for (const cellIdx of pathCells) {
              const d = DSb[cellIdx];
              if (!d || PARK_TYPES.has(d.type)) continue;
              // зелёный стык — универсальный буфер (§6.6), матрица совместимости для него не применяется
              const greenType = 'park';
              // монотонность коридора: сажаем только ячейки, смежные с уже зелёным префиксом
              if (![...(adjr[cellIdx] ?? [])].some(n => PARK_TYPES.has(DSb[n]?.type))) continue;
              const compsBefore = greenComponentsCount(DSb);
              const contrib = greenCoverageContribution(DSb);
              const adjg = districtAdjacency(DSb);
              const gsetNow = new Set(DSb.map((x, i) => (PARK_TYPES.has(x?.type) ? i : -1)).filter(i => i >= 0));
              const onPath = new Set(pathCells);
              let demoteIdx = -1, demoteScore = Infinity;
              for (const gi of gsetNow) {
                if (promotedCells.has(gi)) continue;
                if (onPath.has(gi)) continue;
                const sim = DSb.map((x, i) => i === gi ? { ...x, type: 'residential' } : x);
                if (greenComponentsCount(sim) > compsBefore) continue;
                const c = contrib.get(gi) ?? 0;
                const leaf = degGreen(gi, adjg, gsetNow) <= 1 ? 0 : 1e6;
                const match = DSb[gi]?.type === 'park' ? -1e12 : 0;
                const score = c * 1e9 + leaf + (DSb[gi]?.landValue ?? 0.5) + match;
                if (score < demoteScore) { demoteScore = score; demoteIdx = gi; }
              }
              if (demoteIdx < 0) continue;
              const demoteFrom = DSb[demoteIdx].type;
              let demoted = false;
              for (const toT of ['residential', 'suburb', 'parking', 'commercial']) {
                if (swapDistrictType(DSb, adjg, demoteIdx, toT)) { trackSwap(demoteFrom, toT); demoted = true; break; }
              }
              if (!demoted) continue;
              const fromT = DSb[cellIdx].type;
              const dP = DSb[cellIdx];
              dP.type = greenType; dP.profileId = greenType; dP.cells = []; dP.landValue = null; dP.pressure = null;
              trackSwap(fromT, greenType);
              promotedCells.add(cellIdx);
              beltRelocated += 1;
            }
          }
          // финальное связывание: после переносов каркас мог распасться — склеиваем мостами (нетто-нейтрально)
          for (let iter = 0; iter < 4; iter++) {
            const DSb = ctx.districts ?? [];
            if (greenComponentsCount(DSb) <= 1) break;
            const adjl = districtAdjacency(DSb);
            const gset = new Set(DSb.map((d, i) => (PARK_TYPES.has(d?.type) ? i : -1)).filter(i => i >= 0));
            const compId = new Map();
            let cid = 0;
            const seen = new Set();
            for (const s of gset) {
              if (seen.has(s)) continue;
              compId.set(s, cid);
              const q = [s]; seen.add(s);
              while (q.length) {
                const cur = q.shift();
                for (const n of (adjl[cur] ?? [])) if (gset.has(n) && !seen.has(n)) { compId.set(n, cid); seen.add(n); q.push(n); }
              }
              cid++;
            }
            let bestIdx = -1, bestTouch = 1;
            for (let i = 0; i < DSb.length; i++) {
              const d = DSb[i]; if (!d || PARK_TYPES.has(d.type) || rectAreaOf(d) <= 0) continue;
              const touched = new Set();
              for (const n of (adjl[i] ?? [])) if (gset.has(n)) touched.add(compId.get(n));
              if (touched.size > bestTouch) { bestTouch = touched.size; bestIdx = i; }
            }
            if (bestIdx < 0 || bestTouch < 2) break;
            const compsBefore = greenComponentsCount(DSb);
            const contrib = greenCoverageContribution(DSb);
            let demoteIdx = -1, demoteScore = Infinity;
            for (const gi of gset) {
              if (promotedCells.has(gi)) continue;
              const sim = DSb.map((d, i) => i === gi ? { ...d, type: 'residential' } : d);
              if (greenComponentsCount(sim) > compsBefore) continue;
              const c = contrib.get(gi) ?? 0;
              const leaf = degGreen(gi, adjl, gset) <= 1 ? 0 : 1e6;
              const score = c * 1e9 + leaf + (DSb[gi]?.landValue ?? 0.5);
              if (score < demoteScore) { demoteScore = score; demoteIdx = gi; }
            }
            if (demoteIdx < 0) break;
            const demoteFrom = DSb[demoteIdx].type;
            let demoted = false;
            for (const toT of ['residential', 'suburb', 'parking', 'commercial']) {
              if (swapDistrictType(DSb, adjl, demoteIdx, toT)) { trackSwap(demoteFrom, toT); demoted = true; break; }
            }
            if (!demoted) break;
            const promoteFrom = DSb[bestIdx].type;
            const dB = DSb[bestIdx];
            dB.type = 'park'; dB.profileId = 'park'; dB.cells = []; dB.landValue = null; dB.pressure = null;
            trackSwap(promoteFrom, 'park');
            promotedCells.add(bestIdx);
            beltRelocated += 1;
          }
          let wedgeFixed = 0;
          for (let iter = 0; iter < 6 && autoDistricts && plate > 0; iter++) {
            const DSb = ctx.districts ?? [];
            const wedgeCells = greenWedgeCellCount(DSb);
            if (wedgeCells >= 2) break;
            const adjl = districtAdjacency(DSb);
            let promoteIdx = -1, promoteScore = Infinity;
            for (let i = 0; i < DSb.length; i++) {
              const d = DSb[i];
              if (!d || PARK_TYPES.has(d.type) || rectAreaOf(d) <= 0 || !isSurplus(d.type)) continue;
              const r = d.geometry.rect; if (!r) continue;
              const cx = (Number(r.minX) + Number(r.maxX)) / 2, cz = (Number(r.minZ) + Number(r.maxZ)) / 2;
              const w = wedgeAlign(cx, cz);
              if (w < 0.5) continue;
              const adjGreen = [...(adjl[i] ?? [])].some(n => PARK_TYPES.has(DSb[n]?.type)) ? 1 : 0;
              const score = (1 - w) * 100 - adjGreen * 30 + (d.landValue ?? 0.5);
              if (score < promoteScore) { promoteScore = score; promoteIdx = i; }
            }
            if (promoteIdx < 0) break;
            // отщепляем листовой зелёный минимум для сохранения доли парка (net-neutral), если нужно
            const compsBefore = greenComponentsCount(DSb);
            const contrib = greenCoverageContribution(DSb);
            const gset = new Set(DSb.map((d, i) => (PARK_TYPES.has(d?.type) ? i : -1)).filter(i => i >= 0));
            let demoteIdx = -1, demoteScore = Infinity;
            for (const gi of gset) {
              if (promotedCells.has(gi)) continue;
              const sim = DSb.map((d, i) => i === gi ? { ...d, type: 'residential' } : d);
              if (greenComponentsCount(sim) > compsBefore) continue;
              const c = contrib.get(gi) ?? 0;
              const leaf = degGreen(gi, adjl, gset) <= 1 ? 0 : 1e6;
              const score = c * 1e9 + leaf + (DSb[gi]?.landValue ?? 0.5);
              if (score < demoteScore) { demoteScore = score; demoteIdx = gi; }
            }
            if (demoteIdx < 0) break;
            const demoteFrom = DSb[demoteIdx].type;
            let demoted = false;
            for (const toT of ['residential', 'suburb', 'parking', 'commercial']) {
              if (swapDistrictType(DSb, adjl, demoteIdx, toT)) { trackSwap(demoteFrom, toT); demoted = true; break; }
            }
            if (!demoted) break;
            const promoteFrom = DSb[promoteIdx].type;
            const dW = DSb[promoteIdx];
            dW.type = 'park'; dW.profileId = 'park'; dW.cells = []; dW.landValue = null; dW.pressure = null;
            trackSwap(promoteFrom, 'park');
            promotedCells.add(promoteIdx);
            wedgeFixed += 1;
          }
          const covAfter = rivers.length ? beltSampleCoverage(ctx.districts ?? []).ratio : null;
          ctx.report.diagnostics.push(info('green_belt_repair', stageId, 'net-neutral river-belt relocation of green cells towards the belt (section 6.8)', { beltRelocated, coverageAfter: covAfter != null ? +covAfter.toFixed(3) : null }));
          ctx.report.diagnostics.push(info('green_wedge_repair', stageId, 'edge wedges anchored along wedge axes (section 6.8)', { wedgeFixed, wedgeCells: greenWedgeCellCount(ctx.districts ?? []) }));
        }
        // --- §6.7: districtFrame — ось района (склон/река/артерия), локальная сетка под углом ---
        let frames = 0;
        const frameReasons = { slope: 0, river: 0, railway: 0, arterial: 0 };
        for (const d of DS) {
          const rect = d?.geometry?.rect;
          if (!rect) continue;
          const cx = (Number(rect.minX) + Number(rect.maxX)) / 2, cz = (Number(rect.minZ) + Number(rect.maxZ)) / 2;
          let yaw = null, reason = null;
          const rOff = 60;
          let bestMag = 0, bestYaw = null;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const len = Math.hypot(dx, dz);
            const hx = terrainHeightAt(cx + (dx / len) * rOff, cz + (dz / len) * rOff, baseY_, mods_);
            const hx0 = terrainHeightAt(cx, cz, baseY_, mods_);
            const mag = Math.abs(hx - hx0) / rOff;
            if (mag > bestMag) { bestMag = mag; bestYaw = Math.atan2(dx / len, dz / len) * 180 / Math.PI; }
          }
          if (bestMag >= 0.06 && bestYaw != null) { yaw = bestYaw; reason = 'slope'; }
          else {
            const riversList = ctx?.hydrology?.rivers ?? [];
            const roadsList = ctx?.networks?.roads?.segments ?? [];
            const railwaysList = ctx?.networks?.railways?.segments ?? ctx?.input?.cityforge?.networks?.railways?.segments ?? [];
            const riverSeg = minSegmentDist(cx, cz, riversList, null);
            const railSeg = minSegmentDist(cx, cz, railwaysList, null);
            const artSeg = minSegmentDist(cx, cz, roadsList, new Set(['arterial', 'highway']));
            const pickSeg = (list, filterClasses = null) => {
              let bestD = Infinity, bestYaw2 = null;
              for (const s of list) {
                if (filterClasses && !filterClasses.has(s?.class)) continue;
                const path = Array.isArray(s?.path) ? s.path : [];
                for (let k = 0; k + 1 < path.length; k++) {
                  const dd = pointSegDistXZ(cx, cz, path[k][0], path[k][2], path[k + 1][0], path[k + 1][2]);
                  if (dd < bestD) {
                    bestD = dd;
                    bestYaw2 = Math.atan2(path[k + 1][0] - path[k][0], path[k + 1][2] - path[k][2]) * 180 / Math.PI;
                  }
                }
              }
              return bestYaw2;
            };
            // R3.4 §6.7: привязка границ/оси к естественным рубежам (река, ж/д, магистраль)
            // выбираем ближайший рубеж в радиусе 40 м, чтобы ось/границы шли вдоль него.
            const candidates = [];
            if (Number.isFinite(riverSeg) && riverSeg <= 40) candidates.push({ dist: riverSeg, reason: 'river', yaw: pickSeg(riversList) });
            if (Number.isFinite(railSeg) && railSeg <= 40) candidates.push({ dist: railSeg, reason: 'railway', yaw: pickSeg(railwaysList) });
            if (Number.isFinite(artSeg) && artSeg <= 40) candidates.push({ dist: artSeg, reason: 'arterial', yaw: pickSeg(roadsList, new Set(['arterial', 'highway'])) });
            candidates.sort((a, b) => a.dist - b.dist);
            if (candidates.length && candidates[0].yaw != null) { yaw = candidates[0].yaw; reason = candidates[0].reason; }
          }
          if (yaw != null) {
            let wrapped = ((yaw + 180) % 360 + 360) % 360 - 180;
            if (wrapped <= -180) wrapped += 360;
            d.districtFrame = { cx: +cx.toFixed(1), cz: +cz.toFixed(1), yaw: +wrapped.toFixed(1), reason };
            frames += 1;
            frameReasons[reason] = (frameReasons[reason] || 0) + 1;
          }
        }
        ctx.report.diagnostics.push(info('district_frames_assigned', stageId, 'district frames assigned by dominant axis', { count: frames, reasons: frameReasons }));
        // R3.4 §6.6: explicit adjacency matrix artifact (neighbor pairs/types) for validation/reporting.
        const adjEdges = [];
        for (let i = 0; i < adj.length; i++) {
          for (const j of adj[i]) if (j > i) {
            adjEdges.push({ a: DS[i]?.id ?? String(i), b: DS[j]?.id ?? String(j), ta: DS[i]?.type ?? null, tb: DS[j]?.type ?? null });
          }
        }
        ctx.report.diagnostics.push(info('adjacency_matrix', stageId, 'district adjacency matrix (section 6.6)', { count: adjEdges.length, edges: adjEdges }));
        ctx.report.diagnostics.push(info('adjacency_repairs', stageId, 'section 6.6 adjacency repairs applied', { count: repairs.length, kinds: repairs.reduce((m, r) => { m[r.kind] = (m[r.kind] || 0) + 1; return m; }, {}) }));
        // довести этажность/плотность по финальным типам — делается следующим (R3.3) блок.
      }

      // R3.3 §6.5: этажность в этажах и плотность застройки по финальным типам (после balance-проходов).
      {
        let lvSum = 0, lvN = 0;
        for (const d of (ctx.districts ?? [])) {
          const drange = TYPE_DENSITY[d.type] ?? [0.3, 0.6];
          const frange = TYPE_FLOORS[d.type] ?? [2, 9];
          d.buildingDensity = +((drange[0] + drange[1]) / 2).toFixed(2);
          d.heightRange = [frange[0], frange[1]];
          if (d.landValue == null) {
            const rect = d?.geometry?.rect;
            const dcx = rect ? (Number(rect.minX) + Number(rect.maxX)) / 2 : 0;
            const dcz = rect ? (Number(rect.minZ) + Number(rect.maxZ)) / 2 : 0;
            d.landValue = +computeLandValue(ctx, dcx, dcz, size).landValue.toFixed(4);
          }
          if (Number.isFinite(d.landValue)) { lvSum += d.landValue; lvN += 1; }
        }
        ctx.report.diagnostics.push(info('land_value_field', stageId, 'land value field assigned to districts (profile weights)', {
          profile: ctx?.meta?.activeCityProfileId ?? null,
          mean: lvN ? +(lvSum / lvN).toFixed(4) : null,
          weights: (ctx?.meta?.activeCityProfile?.landValueWeights ?? null),
        }));
      }

      // R3.5 §7.3: рекурсивное деление блоков по давлению (D≥0.5 → 2, D≥0.75 → 4) и по B(D);
      // под-блоки пересчитывают давление/L(x) по центру. Только auto-generated: declared сохраняют структуру/ids.
      {
        const before = (ctx.districts ?? []).length;
        for (const d of (ctx.districts ?? [])) d.pressure = districtPressure(d, ctx, size);
        if (autoDistricts) {
          const policies = ctx?.meta?.policies ?? {};
          ctx.districts = splitDistrictsByPressure(ctx.districts ?? [], { ctx, size, policies });
          for (const d of (ctx.districts ?? [])) {
            d.pressure = districtPressure(d, ctx, size);
            if (d.landValue == null) {
              const rect = d?.geometry?.rect;
              const dcx = rect ? (Number(rect.minX) + Number(rect.maxX)) / 2 : 0;
              const dcz = rect ? (Number(rect.minZ) + Number(rect.maxZ)) / 2 : 0;
              d.landValue = +computeLandValue(ctx, dcx, dcz, size).landValue.toFixed(4);
            }
          }
        }
        if (ctx.districts.length !== before) {
          ctx.report.diagnostics.push(info('blocks_split', stageId, 'districts split by building pressure (section 7.3)', { before, after: ctx.districts.length }));
        }
      }

      // R3.5 §7.3: приор D₀ (buildingDensity × meanFloors/16 + бонус ядра/артерии), целевое B(D).
      {
        const policies = ctx?.meta?.policies ?? {};
        const rd = policies.roadDensity ?? {};
        const bMin = Number.isFinite(Number(rd.bMin)) ? Number(rd.bMin) : 60;
        const bMax = Number.isFinite(Number(rd.bMax)) ? Number(rd.bMax) : 260;
        const gamma = Number.isFinite(Number(rd.gamma)) ? Number(rd.gamma) : 0.8;
        let dSum = 0, dN = 0;
        const bands = { gt75: 0, b50_75: 0, b25_50: 0, le25: 0 };
        for (const d of (ctx.districts ?? [])) {
          d.pressure = districtPressure(d, ctx, size);
          d.targetB = targetBDistance(d.pressure, { bMin, bMax, gamma });
          if (d.pressure > 0.75) bands.gt75 += 1;
          else if (d.pressure > 0.5) bands.b50_75 += 1;
          else if (d.pressure > 0.25) bands.b25_50 += 1;
          else bands.le25 += 1;
          dSum += d.pressure; dN += 1;
        }
        ctx.report.diagnostics.push(info('pressure_field', stageId, 'building pressure prior D0 assigned to districts (section 7.3)', {
          mean: dN ? +(dSum / dN).toFixed(4) : null,
          bMin, bMax, gamma,
          bands,
        }));

        // R3.6 §7.3: метрика приёмки — ранговая корреляция Спирмена (D блока, 1/площадь блока) ≥ 0.6 на сериях seed.
        // Блок = район после деления по давлению; меньшая площадь при большем D даёт положительную ρ.
        const areas = [];
        const pressures = [];
        const byDistrict = [];
        for (const d of (ctx.districts ?? [])) {
          const area = rectAreaOf(d);
          const p = Number(d?.pressure);
          if (!(area > 0) || !Number.isFinite(p)) continue;
          areas.push(area);
          pressures.push(p);
          byDistrict.push({
            id: String(d?.id ?? ''),
            type: String(d?.type ?? d?.profileId ?? ''),
            pressure: +p.toFixed(4),
            area: +area.toFixed(2),
            invArea: +(1 / area).toFixed(8),
          });
        }
        const invAreas = areas.map(a => 1 / a);
        const rho = spearmanRank(pressures, invAreas);
        const ok = rho == null ? null : rho >= 0.6;
        ctx.report.diagnostics.push(info('pressure_area_spearman', stageId, 'Spearman rank correlation (D block, 1/area block) for R3.6 acceptance', {
          rho,
          target: 0.6,
          ok,
          n: byDistrict.length,
          byDistrict,
        }));
      }

      // R3.4 §6.6 (spatial buffers 40–80 m): carve buffer strips between geometrically
      // incompatible adjacent districts when a 40–80 m strip can be separated without
      // violating minimum district span. Runs on final rect districts (post-split), auto-only.
      const BUFFER_TYPES = ['park', 'forest', 'parking', 'commercial', 'suburb', 'market'];
      const emitBufferWidthCheck = (note) => {
        const DSb = ctx.districts ?? [];
        let minIncompatDist = Infinity, touchIncompat = 0, edgeTouchIncompat = 0, cornerTouchIncompat = 0, pairs = 0;
        // §6.6 acceptance focus: industrial <-> residential must be separated (>=40m or by a buffer district).
        let irPairs = 0, irMinDist = Infinity, irEdgeTouches = 0, irCornerTouches = 0, irGapBelow40 = 0, irBufferSeparated = 0;
        for (let i = 0; i < DSb.length; i++) {
          const ra = DSb[i]?.geometry?.rect; if (!ra) continue;
          for (let j = i + 1; j < DSb.length; j++) {
            const rb = DSb[j]?.geometry?.rect; if (!rb) continue;
            const ta = DSb[i]?.type, tb = DSb[j]?.type; if (!ta || !tb) continue;
            if (COMPAT[ta]?.has(tb) && COMPAT[tb]?.has(ta)) continue;
            pairs += 1;
            const dx = Math.max(ra.minX - rb.maxX, rb.minX - ra.maxX, 0);
            const dz = Math.max(ra.minZ - rb.maxZ, rb.minZ - ra.maxZ, 0);
            const d = Math.hypot(dx, dz);
            if (d < minIncompatDist) minIncompatDist = d;
            if (d <= 0.75) {
              touchIncompat += 1;
              const tinfo = rectTouchInfo(ra, rb, 0.75);
              if (tinfo) edgeTouchIncompat += 1; else cornerTouchIncompat += 1;
            }
            const isIR = (ta === 'industrial' && tb === 'residential') || (ta === 'residential' && tb === 'industrial');
            if (isIR) {
              irPairs += 1;
              if (d < irMinDist) irMinDist = d;
              if (d < 40) irGapBelow40 += 1;
              if (d <= 0.75) {
                const tinfo = rectTouchInfo(ra, rb, 0.75);
                if (tinfo) irEdgeTouches += 1; else irCornerTouches += 1;
              }
              // buffer-separated: a common neighbor of buffer type within 1 m of both rects
              let sep = false;
              const near = (r1, r2) => Math.hypot(Math.max(r1.minX - r2.maxX, r2.minX - r1.maxX, 0), Math.max(r1.minZ - r2.maxZ, r2.minZ - r1.maxZ, 0)) <= 1.0;
              for (const k of DSb) {
                if (k === DSb[i] || k === DSb[j]) continue;
                if (!BUFFER_TYPES.includes(k?.type)) continue;
                const rk = k.geometry?.rect; if (!rk) continue;
                if (near(ra, rk) && near(rb, rk)) { sep = true; break; }
              }
              if (sep) irBufferSeparated += 1;
            }
          }
        }
        ctx.report.diagnostics.push(info('buffer_width_check', stageId, 'geometric separation check for incompatible district pairs (section 6.6, target buffer 40–80m where applicable)', {
          incompatiblePairs: pairs,
          touchingIncompatible: touchIncompat,
          edgeTouchingIncompatible: edgeTouchIncompat,
          cornerTouchingIncompatible: cornerTouchIncompat,
          minDistance: Number.isFinite(minIncompatDist) ? +minIncompatDist.toFixed(3) : null,
          industrialResidential: {
            pairs: irPairs,
            minDistance: Number.isFinite(irMinDist) ? +irMinDist.toFixed(3) : null,
            gapBelow40: irGapBelow40,
            edgeTouches: irEdgeTouches,
            cornerTouches: irCornerTouches,
            bufferSeparated: irBufferSeparated,
          },
          ...(note ? { note } : {}),
        }));
      };
      // §6.8 morphology check: connectivity of the green framework, river-belt coverage and edge wedges.
      // §6.6 (rest): floorsCount contrast between adjacent districts (target <= 2.5x).
      const emitFloorsContrastCheck = () => {
        const DSb = ctx.districts ?? [];
        const floorsOf = (d) => { const fr = TYPE_FLOORS[d?.type]; return fr ? (fr[0] + fr[1]) / 2 : 4; };
        const floors = DSb.map(floorsOf);
        let viol = 0, violExGreen = 0, maxRatio = 0, adjPairs = 0;
        const worst = [];
        for (let i = 0; i < DSb.length; i++) {
          const ra = DSb[i]?.geometry?.rect; if (!ra) continue;
          for (let j = i + 1; j < DSb.length; j++) {
            const rb = DSb[j]?.geometry?.rect; if (!rb) continue;
            const touch = rectTouchInfo(ra, rb, 0.75);
            const dx = Math.max(ra.minX - rb.maxX, rb.minX - ra.maxX, 0);
            const dz = Math.max(ra.minZ - rb.maxZ, rb.minZ - ra.maxZ, 0);
            if (!touch && Math.hypot(dx, dz) > 0.75) continue;
            adjPairs += 1;
            const fa = floors[i], fb = floors[j];
            const ratio = Math.max(fa, fb) / Math.max(1e-6, Math.min(fa, fb));
            if (ratio > maxRatio) maxRatio = ratio;
            const greenSide = PARK_TYPES.has(DSb[i]?.type) || PARK_TYPES.has(DSb[j]?.type) || DSb[i]?.type === 'parking' || DSb[j]?.type === 'parking';
            if (ratio > 2.5) {
              if (worst.length < 5) worst.push({ a: DSb[i]?.id, b: DSb[j]?.id, ta: DSb[i]?.type, tb: DSb[j]?.type, ratio: +ratio.toFixed(2) });
              viol += 1;
              if (!greenSide) violExGreen += 1;
            }
          }
        }
        ctx.report.diagnostics.push(info('floors_contrast_check', stageId, 'floorsCount contrast between adjacent district profiles (section 6.6, target <= 2.5x)', {
          adjacentPairs: adjPairs,
          violations: viol,
          violationsExcludingGreenSeam: violExGreen,
          maxRatio: +maxRatio.toFixed(3),
          worst,
        }));
      };
      // §6.7 measurement: areas/count/frames/barrier-edge snapping (typical 15-60 ha, 8-14 per 2000 m).
      const emitDistrictMetricsCheck = () => {
        const DSb = ctx.districts ?? [];
        const sizeNow = ctx?.meta?.worldBounds?.size ?? ctx?.input?.ground?.size ?? 256;
        const totalArea = DSb.reduce((s, d) => s + rectAreaOf(d), 0);
        const areas = DSb.map(rectAreaOf).filter(a => a > 0).sort((a, b) => a - b);
        if (!areas.length) {
          ctx.report.diagnostics.push(info('district_metrics_check', stageId, 'district form/size metrics (section 6.7)', { districts: 0 }));
          return;
        }
        const med = areas[Math.floor(areas.length / 2)];
        const ha = (a) => +(a / 10000).toFixed(2);
        const half = sizeNow / 2;
        const rivers = [
          ...(ctx?.hydrology?.rivers ?? []),
          ...(ctx?.input?.cityforge?.hydrology?.rivers ?? []),
          ...(ctx?.input?.waterways ?? []),
        ];
        const roads = ctx?.networks?.roads?.segments ?? [];
        const railways = ctx?.networks?.railways?.segments ?? ctx?.input?.cityforge?.networks?.railways?.segments ?? [];
        const barriers = [];
        for (const rv of rivers) {
          const p = Array.isArray(rv?.path) ? rv.path : [];
          for (let s = 0; s + 1 < p.length; s++) {
            const a = p[s], b = p[s + 1];
            const ax = Number(a?.[0]), az = Number(a?.[2]), bx = Number(b?.[0]), bz = Number(b?.[2]);
            if (Number.isFinite(ax) && Number.isFinite(az) && Number.isFinite(bx) && Number.isFinite(bz)) barriers.push({ ax, az, bx, bz, kind: 'river' });
          }
        }
        for (const s of roads) {
          if (!s || (s.class !== 'arterial' && s.class !== 'highway')) continue;
          const p = Array.isArray(s?.path) ? s.path : [];
          for (let k = 0; k + 1 < p.length; k++) {
            const a = p[k], b = p[k + 1];
            barriers.push({ ax: Number(a?.[0]), az: Number(a?.[2]), bx: Number(b?.[0]), bz: Number(b?.[2]), kind: 'arterial' });
          }
        }
        for (const s of railways) {
          const p = Array.isArray(s?.path) ? s.path : [];
          for (let k = 0; k + 1 < p.length; k++) {
            const a = p[k], b = p[k + 1];
            barriers.push({ ax: Number(a?.[0]), az: Number(a?.[2]), bx: Number(b?.[0]), bz: Number(b?.[2]), kind: 'railway' });
          }
        }
        const nearBarrier = (px, pz, maxDist) => {
          for (const b of barriers) {
            if (!Number.isFinite(b.ax) || !Number.isFinite(b.az) || !Number.isFinite(b.bx) || !Number.isFinite(b.bz)) continue;
            if (pointSegDistXZ(px, pz, b.ax, b.az, b.bx, b.bz) <= maxDist) return true;
          }
          return false;
        };
        let edges = 0, snapped = 0;
        for (const d of DSb) {
          const r = d?.geometry?.rect; if (!r) continue;
          const midX = (Number(r.minX) + Number(r.maxX)) / 2, midZ = (Number(r.minZ) + Number(r.maxZ)) / 2;
          const edgeMids = [
            { x: midX, z: Number(r.minZ) },
            { x: midX, z: Number(r.maxZ) },
            { x: Number(r.minX), z: midZ },
            { x: Number(r.maxX), z: midZ },
          ];
          for (const e of edgeMids) {
            edges += 1;
            if (nearBarrier(e.x, e.z, 20)) snapped += 1;
          }
        }
        const frames = DSb.filter(d => d?.districtFrame).length;
        // §6.7 planning layer (ADR-002 variant A, informational): агрегация групп до сплита по ключу district_i_j* —
        // движок не меняется, engine-visible районов столько, сколько после деления R3.5.
        const parentKey = (id) => {
          const m = String(id ?? '').match(/^district_(\d+)_(\d+)/);
          return m ? `district_${m[1]}_${m[2]}` : String(id ?? 'other');
        };
        const parentGroups = new Map();
        for (const d of DSb) {
          const k = parentKey(d?.id);
          const a = rectAreaOf(d);
          const cur = parentGroups.get(k) ?? { area: 0, greenArea: 0, count: 0 };
          cur.area += a;
          if (PARK_TYPES.has(d?.type)) cur.greenArea += a;
          cur.count += 1;
          parentGroups.set(k, cur);
        }
        const parentAreas = [...parentGroups.values()].map(g => g.area).sort((a, b) => a - b);
        const parentMed = parentAreas.length ? parentAreas[Math.floor(parentAreas.length / 2)] : 0;
        const parentCount = parentGroups.size;
        ctx.report.diagnostics.push(info('district_metrics_check', stageId, 'district form/size metrics vs section 6.7 (typical 15-60 ha, 8-14 districts per 2000 m)', {
          districts: areas.length,
          areaHaMin: ha(areas[0]),
          areaHaMedian: ha(med),
          areaHaMax: ha(areas[areas.length - 1]),
          areaHaTotal: ha(totalArea),
          plateSizeM: sizeNow,
          districtsPerKm2: +(areas.length / Math.pow(sizeNow / 1000, 2)).toFixed(2),
          districtsPer2000m: +(areas.length * (2000 * 2000) / (sizeNow * sizeNow)).toFixed(2),
          frames,
          barriers: barriers.length,
          edgeSnappedFraction: edges ? +(snapped / edges).toFixed(3) : null,
          planningGroups: parentCount,
          planningAreaHaMedian: ha(parentMed),
          planningDistrictsPer2000m: +(parentCount * (2000 * 2000) / (sizeNow * sizeNow)).toFixed(2),
        }));
      };
      const emitGreenCorridorsCheck = () => {
        const DSb = ctx.districts ?? [];
        const sizeNow = ctx?.meta?.worldBounds?.size ?? ctx?.input?.ground?.size ?? 256;
        const totalArea = DSb.reduce((s, d) => s + rectAreaOf(d), 0);
        const greenIdx = [];
        for (let i = 0; i < DSb.length; i++) if (PARK_TYPES.has(DSb[i]?.type) && rectAreaOf(DSb[i]) > 0) greenIdx.push(i);
        const greenArea = greenIdx.reduce((s, i) => s + rectAreaOf(DSb[i]), 0);
        const share = totalArea > 0 ? greenArea / totalArea : 0;
        // components within green set (rect adjacency)
        const { adj } = geomDistrictAdjacency(DSb, 0.75);
        const gset = new Set(greenIdx);
        const seen = new Set();
        const compSizes = [];
        for (const s of greenIdx) {
          if (seen.has(s)) continue;
          const q = [s]; seen.add(s);
          let sizeC = 0;
          while (q.length) {
            const cur = q.shift(); sizeC += 1;
            for (const n of (adj[cur] ?? [])) if (gset.has(n) && !seen.has(n)) { seen.add(n); q.push(n); }
          }
          compSizes.push(sizeC);
        }
        compSizes.sort((a, b) => b - a);
        // river-belt coverage: samples along rivers within 60 m of a green rect
        const rivers = [
          ...(ctx?.hydrology?.rivers ?? []),
          ...(ctx?.input?.cityforge?.hydrology?.rivers ?? []),
          ...(ctx?.input?.waterways ?? []),
        ];
        let samples = 0, covered = 0;
        const BELT_R = 60;
        for (const rv of rivers) {
          const path = Array.isArray(rv?.path) ? rv.path : [];
          for (let s = 0; s + 1 < path.length; s++) {
            const a = path[s], b = path[s + 1];
            const ax = Number(a?.[0]), az = Number(a?.[2]), bx = Number(b?.[0]), bz = Number(b?.[2]);
            if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(bx) || !Number.isFinite(bz)) continue;
            const segLen = Math.hypot(bx - ax, bz - az);
            const steps = Math.max(1, Math.floor(segLen / 20));
            for (let k = 0; k <= steps; k++) {
              const t = k / steps;
              const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
              samples += 1;
              let ok = false;
              for (const gi of greenIdx) {
                const r = DSb[gi].geometry.rect;
                if (px >= r.minX - BELT_R && px <= r.maxX + BELT_R && pz >= r.minZ - BELT_R && pz <= r.maxZ + BELT_R) { ok = true; break; }
              }
              if (ok) covered += 1;
            }
          }
        }
        // wedges: green components touching the plate edge (fingers from окраины towards centre)
        const half = sizeNow / 2;
        const edgeTouchComps = (() => {
          const comps = [];
          const visited = new Set();
          for (const s of greenIdx) {
            if (visited.has(s)) continue;
            const q = [s]; visited.add(s);
            let touchesEdge = false;
            while (q.length) {
              const cur = q.shift();
              const r = DSb[cur]?.geometry?.rect;
              if (r && (Math.abs(r.minX + half) <= 2 || Math.abs(r.maxX - half) <= 2 || Math.abs(r.minZ + half) <= 2 || Math.abs(r.maxZ - half) <= 2)) touchesEdge = true;
              for (const n of (adj[cur] ?? [])) if (gset.has(n) && !visited.has(n)) { visited.add(n); q.push(n); }
            }
            comps.push(touchesEdge);
          }
          return comps.filter(Boolean).length;
        })();
        ctx.report.diagnostics.push(info('green_corridors_check', stageId, 'section 6.8 green framework morphology (share 8-15%, connected corridors, river belts, 2-3 edge wedges)', {
          share: +share.toFixed(4),
          shareInRange: share >= 0.08 && share <= 0.15,
          components: compSizes.length,
          largestComponent: compSizes[0] ?? 0,
          riverBeltCoverage: samples > 0 ? +(covered / samples).toFixed(3) : null,
          riverBeltSamples: samples,
          wedgeComponents: edgeTouchComps,
        }));
      };
      if (autoDistricts) {
        const bufferWidthFor = (ta, tb) => 56; // target width within 40–80 m
        let carved = 0;
        let unresolvedGeom = 0;
        const maxCarves = 64;
        for (let iter = 0; iter < 6 && carved < maxCarves; iter++) {
          const DS = ctx.districts ?? [];
          const { adj, touch } = geomDistrictAdjacency(DS, 0.75);
          let changed = false;
          const pairs = [];
          for (let i = 0; i < DS.length; i++) {
            for (const j of adj[i]) {
              if (j <= i) continue;
              const ta = DS[i]?.type, tb = DS[j]?.type;
              if (!ta || !tb) continue;
              if (COMPAT[ta]?.has(tb) && COMPAT[tb]?.has(ta)) continue;
              const tinfo = touch.get(`${i},${j}`)?.info;
              if (!tinfo) continue;
              pairs.push({ i, j, ta, tb, info: tinfo, along: tinfo.along });
            }
          }
          // process longer shared edges first for stable impact
          pairs.sort((a, b) => (b.along - a.along) || (String(DS[a.i]?.id).localeCompare(String(DS[a.j]?.id))));
          for (const p of pairs) {
            if (carved >= maxCarves) break;
            const DS2 = ctx.districts ?? [];
            // refresh touch for current indices (array may have grown)
            const tinfoNow = rectTouchInfo(DS2[p.i]?.geometry?.rect, DS2[p.j]?.geometry?.rect, 0.75);
            if (!tinfoNow) continue;
            const ta = DS2[p.i]?.type, tb = DS2[p.j]?.type;
            if (!ta || !tb || (COMPAT[ta]?.has(tb) && COMPAT[tb]?.has(ta))) continue;
            let done = false;
            const desired = bufferWidthFor(ta, tb);
            for (const bt of BUFFER_TYPES) {
              if (!COMPAT[bt]?.has(ta) || !COMPAT[ta]?.has(bt)) continue;
              if (!COMPAT[bt]?.has(tb) || !COMPAT[tb]?.has(bt)) continue;
              const carvedRes = carveBufferStrip(DS2, p.i, p.j, tinfoNow, bt, desired, 40);
              if (!carvedRes) continue;
              const donor = DS2[carvedRes.donorIdx];
              const bufId = `${donor.id}_b${carved}`;
              const bufDistrict = cloneDistrictAs(donor, {
                id: bufId,
                parentId: donor.parentId ?? donor.id,
                type: bt,
                profileId: bt,
                geometry: { rect: carvedRes.strip },
                source: 'buffer_strip',
              });
              donor.geometry = { rect: carvedRes.remain };
              donor.cells = [];
              donor.landValue = null;
              donor.pressure = null;
              ctx.districts.push(bufDistrict);
              carved += 1;
              changed = true;
              done = true;
              break;
            }
            if (!done) unresolvedGeom += 1;
          }
          if (!changed) break;
        }
        // Fallback: resolve remaining incompatible touching pairs (edge/corner) by safe type swap to a buffer district
        let swapResolved = 0;
        for (let iter = 0; iter < 6; iter++) {
          const DS3 = ctx.districts ?? [];
          const { adj } = geomDistrictAdjacency(DS3, 0.75);
          let changed = false;
          for (let i = 0; i < DS3.length; i++) {
            for (const j of adj[i]) {
              if (j <= i) continue;
              const ta = DS3[i]?.type, tb = DS3[j]?.type; if (!ta || !tb) continue;
              if (COMPAT[ta]?.has(tb) && COMPAT[tb]?.has(ta)) continue;
              let fixed = false;
              for (const bt of BUFFER_TYPES) {
                // try make i a buffer compatible with all its neighbors (including j)
                if (COMPAT[bt]?.has(tb) && COMPAT[tb]?.has(bt) && canSwapToType(DS3, adj, i, bt)) { swapDistrictType(DS3, adj, i, bt); fixed = true; }
                else if (COMPAT[bt]?.has(ta) && COMPAT[ta]?.has(bt) && canSwapToType(DS3, adj, j, bt)) { swapDistrictType(DS3, adj, j, bt); fixed = true; }
                if (fixed) { swapResolved += 1; changed = true; break; }
              }
              if (fixed) break;
            }
            if (changed) break;
          }
          if (!changed) break;
        }
        if (carved > 0 || unresolvedGeom > 0 || swapResolved > 0) {
          // recompute pressure/landValue/targetB for affected/new districts
          const policies = ctx?.meta?.policies ?? {};
          const rd = policies.roadDensity ?? {};
          const bMin = Number.isFinite(Number(rd.bMin)) ? Number(rd.bMin) : 60;
          const bMax = Number.isFinite(Number(rd.bMax)) ? Number(rd.bMax) : 260;
          const gamma = Number.isFinite(Number(rd.gamma)) ? Number(rd.gamma) : 0.8;
          for (const d of (ctx.districts ?? [])) {
            d.pressure = districtPressure(d, ctx, size);
            d.targetB = targetBDistance(d.pressure, { bMin, bMax, gamma });
            if (d.landValue == null) {
              const rect = d?.geometry?.rect;
              const dcx = rect ? (Number(rect.minX) + Number(rect.maxX)) / 2 : 0;
              const dcz = rect ? (Number(rect.minZ) + Number(rect.maxZ)) / 2 : 0;
              d.landValue = +computeLandValue(ctx, dcx, dcz, size).landValue.toFixed(4);
            }
          }
        }
        ctx.report.diagnostics.push(info('buffer_strips_carved', stageId, 'spatial buffer strips / compatibility resolution pass (section 6.6)', { carved, unresolvedGeom, swapResolved }));
        emitBufferWidthCheck();
        emitGreenCorridorsCheck();
        emitFloorsContrastCheck();
        emitDistrictMetricsCheck();
      } else {
        ctx.report.diagnostics.push(info('buffer_strips_carved', stageId, 'spatial buffer strips skipped for declared districts (author intent preserved)', { carved: 0, unresolvedGeom: 0, swapResolved: 0, skipped: true }));
        emitBufferWidthCheck('declared');
        emitGreenCorridorsCheck();
        emitFloorsContrastCheck();
        emitDistrictMetricsCheck();
      }

      // R3.2 §6.2/§6.3: кольца роста по стоимости доступа от ядер (изолинии поля, не евклид).
      {
        const eraSize = ctx.meta.worldBounds?.size ?? ctx.input?.ground?.size ?? 256;
        assignErasToDistricts(ctx, eraSize);
      }

      // Generate parcels per district (simple subdivision of rect geometry/cells)
      const parcels = [];
      const roadSegments = ctx.networks?.roads?.segments ?? [];
      const roadNeedyTypes = new Set(['office', 'residential', 'luxury', 'industrial', 'slums', 'parking', 'sports', 'commercial', 'old_town', 'campus', 'market']);
      const rivers = [
        ...(ctx.hydrology?.rivers ?? []),
        ...(ctx.input?.cityforge?.hydrology?.rivers ?? []),
        ...(ctx.input?.waterways ?? []),
      ];
      const hydro = ctx.hydrology?.rivers ?? [];
      const cfHydro = ctx.input?.cityforge?.hydrology?.rivers;
      // Prefer explicit river easements (R1.4/R1.5: buffer/floodplain metadata) when paths match hydrology.
      const riverEasements = Array.isArray(ctx.masks?.easement?.rivers) ? ctx.masks.easement.rivers : [];
      const riversForReserve = riverEasements.length ? riverEasements : rivers;
      const riverClearance = (rv) => {
        // R1.4/R1.5: water buffer/floodplain as real downstream no-build constraint for generic parcels.
        // Crossing vicinities are reserved separately as infrastructure (bridge/approach) areas.
        const buffer = Number.isFinite(Number(rv?.buffer)) ? Number(rv.buffer) : ((Number(rv?.width) || 10) * 0.5 + 12);
        const floodplain = Number.isFinite(Number(rv?.floodplain)) ? Number(rv.floodplain) : 0;
        return Math.max(buffer, floodplain, 6);
      };
      const riverIndex = (!riverEasements.length && ctx.spatial?.riverSegments && rivers.length === hydro.length &&
        !(ctx.input?.waterways?.length) && (cfHydro === hydro || !cfHydro))
        ? ctx.spatial.riverSegments : null;
      const parcelNearRiver = (aabb) => {
        const corners = [[aabb.minX,aabb.minZ],[aabb.maxX,aabb.minZ],[aabb.maxX,aabb.maxZ],[aabb.minX,aabb.maxZ],[(aabb.minX+aabb.maxX)/2,(aabb.minZ+aabb.maxZ)/2]];
        if (riverIndex) {
          const pad = 24;
          const candidates = riverIndex.query({ minX: aabb.minX - pad, maxX: aabb.maxX + pad, minZ: aabb.minZ - pad, maxZ: aabb.maxZ + pad });
          for (const seg of candidates) {
            const clearance = Number.isFinite(Number(seg.buffer)) ? Number(seg.buffer) : (seg.width ?? 10) * 0.5 + 12;
            for (const [px, pz] of corners) {
              if (pointSegDistXZ(px, pz, seg.ax, seg.az, seg.bx, seg.bz) < clearance) return true;
            }
          }
        } else {
          for (const rv of riversForReserve) {
            const path = rv?.path ?? (Array.isArray(rv?.points) ? rv.points.map(p => [p.x, 0, p.z]) : []);
            if (path.length < 2) continue;
            const clearance = riverClearance(rv);
            for (let pi = 0; pi + 1 < path.length; pi++) {
              const a = path[pi], c = path[pi + 1];
              for (const [px, pz] of corners) {
                if (pointSegDistXZ(px, pz, a[0], a[2], c[0], c[2]) < clearance) return true;
              }
            }
          }
        }
        // R1.4/R1.5: lake buffers/floodplain margins (approx by easement circle metadata)
        const lakes = Array.isArray(ctx.masks?.easement?.lakes) ? ctx.masks.easement.lakes : (ctx.hydrology?.lakes ?? []);
        for (const lk of lakes) {
          const c = lk?.center;
          const r = Number(lk?.radius);
          const buf = Number.isFinite(Number(lk?.buffer)) ? Number(lk.buffer) : 8;
          const floodplain = Number.isFinite(Number(lk?.floodplain)) ? Number(lk.floodplain) : 0;
          if (Array.isArray(c) && Number.isFinite(r) && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1]))) {
            const cx = Number(c[0]), cz = Number(c[1]);
            const clearance = r + Math.max(buf, floodplain, 8);
            for (const [px, pz] of corners) {
              if (Math.hypot(px - cx, pz - cz) < clearance) return true;
            }
          }
        }
        // Explicit floodplain masks as downstream constraints (defense-in-depth, deterministic).
        const floodplainMasks = Array.isArray(ctx.masks?.terrain?.floodplains) ? ctx.masks.terrain.floodplains
          : (Array.isArray(ctx.terrain?.analysis?.floodplains) ? ctx.terrain.analysis.floodplains : []);
        for (const fpl of floodplainMasks) {
          if (!fpl) continue;
          if (fpl.type === 'lake' && Array.isArray(fpl.center) && Number.isFinite(Number(fpl.radius))) {
            const lx = Number(fpl.center[0]), lz = Number(fpl.center[1]);
            const margin = Number.isFinite(Number(fpl.floodplain)) ? Number(fpl.floodplain) : 0;
            const clearance = Number(fpl.radius) + Math.max(margin, 8);
            for (const [px, pz] of corners) {
              if (Math.hypot(px - lx, pz - lz) < clearance) return true;
            }
            continue;
          }
          if (fpl.type === 'river' && Array.isArray(fpl.path) && fpl.path.length >= 2) {
            const margin = Number.isFinite(Number(fpl.floodplain)) ? Number(fpl.floodplain)
              : Math.max((Number(fpl.width) || 0) * 0.5 + 12, (Number(fpl.width) || 0) * 3);
            for (let pi = 0; pi + 1 < fpl.path.length; pi++) {
              const a = fpl.path[pi], b = fpl.path[pi + 1];
              for (const [px, pz] of corners) {
                if (pointSegDistXZ(px, pz, a[0], a[2], b[0], b[2]) < margin) return true;
              }
            }
          }
        }
        return false;
      };
      const reservedByReason = { water: 0, road_corridor: 0, anchor: 0, reservation: 0, crossing: 0, steep_slope: 0, remote_access: 0, railway: 0 };
      // R4.1 §9.2: railway easement reservations — parcels inside ±18 m of a railway polyline are not buildable.
      const railwaySegments = [
        ...(ctx?.networks?.railways?.segments ?? []),
        ...(ctx?.input?.cityforge?.networks?.railways?.segments ?? []),
        ...(ctx?.input?.railways?.segments ?? []),
      ];
      const railwaySenses = [];
      for (const s of railwaySegments) {
        const path = Array.isArray(s?.path) ? s.path : [];
        for (let i = 0; i + 1 < path.length; i++) {
          const ax = Number(path[i]?.[0]), az = Number(path[i]?.[2]);
          const bx = Number(path[i + 1]?.[0]), bz = Number(path[i + 1]?.[2]);
          if (Number.isFinite(ax) && Number.isFinite(az) && Number.isFinite(bx) && Number.isFinite(bz)) {
            railwaySenses.push({ ax, az, bx, bz });
          }
        }
      }
      const pointRectDistXZ = (px, pz, r) => Math.hypot(Math.max(r.minX - px, px - r.maxX, 0), Math.max(r.minZ - pz, pz - r.maxZ, 0));
      const parcelNearRail = (aabb, pad = 18) => {
        for (const s of railwaySenses) {
          const corners = [
            { x: aabb.minX, z: aabb.minZ },
            { x: aabb.maxX, z: aabb.minZ },
            { x: aabb.maxX, z: aabb.maxZ },
            { x: aabb.minX, z: aabb.maxZ },
          ];
          for (const c of corners) {
            if (pointSegDistXZ(c.x, c.z, s.ax, s.az, s.bx, s.bz) <= pad) return true;
          }
          if (pointRectDistXZ(s.ax, s.az, aabb) <= pad) return true;
          if (pointRectDistXZ(s.bx, s.bz, aabb) <= pad) return true;
          if (pointRectDistXZ((s.ax + s.bx) / 2, (s.az + s.bz) / 2, aabb) <= pad) return true;
        }
        return false;
      };
      for (const d of ctx.districts) {
        const profile = profiles[d.profileId || d.type] || profiles.office || { parcels: { min: 20, max: 40 } };
        const pmin = clamp(Number(profile.parcels?.min) || 20, 8, 120);
        const pmax = Math.max(pmin, clamp(Number(profile.parcels?.max) || 40, 8, 160));
        let rect = d.geometry?.rect;
        if (!rect && Array.isArray(d.geometry?.bounds)) {
          // [minX,minZ,maxX,maxZ] or similar - best effort
          const b = d.geometry.bounds;
          if (b.length >= 4) rect = { minX: b[0], minZ: b[1], maxX: b[2], maxZ: b[3] };
        }
        if (!rect && Array.isArray(d.cells) && d.cells.length) {
          // infer from first/last cell using grid assumption not known; skip (fallback later)
          rect = null;
        }
        if (!rect) continue;
        const w = rect.maxX - rect.minX, h = rect.maxZ - rect.minZ;
        if (w <= 0 || h <= 0) continue;
        const target = (pmin + pmax) / 2;
        const nx = Math.max(1, Math.round(w / target));
        const nz = Math.max(1, Math.round(h / target));
        const pw = w / nx, ph = h / nz;
        let seq = 0;
        for (let j = 0; j < nz; j++) {
          for (let i = 0; i < nx; i++) {
            seq++;
            const minX = rect.minX + i * pw, maxX = minX + pw;
            const minZ = rect.minZ + j * ph, maxZ = minZ + ph;
            // inset for access/spacing
            const inset = Math.min(1.5, pw * 0.1, ph * 0.1);
            const aabb = { minX: minX + inset, maxX: maxX - inset, minZ: minZ + inset, maxZ: maxZ - inset };
            if (aabb.maxX <= aabb.minX || aabb.maxZ <= aabb.minZ) continue;
            const cx = (aabb.minX + aabb.maxX) / 2, cz = (aabb.minZ + aabb.maxZ) / 2;
            const rd = minRoadDist(cx, cz, roadSegments);
            const type = d.type || d.profileId;
            let reserved = false;
            let reservedReason = null;
            // Reserve parcels conflicting with river easement/corridor.
            if (parcelNearRiver(aabb)) { reserved = true; reservedReason = 'water'; }
            // R4.1 §9.2: parcels inside the railway easement band (±18 m) are not buildable.
            if (!reserved && parcelNearRail(aabb, 18)) { reserved = true; reservedReason = 'railway'; }
            // Reserve parcels overlapping/too close to road corridors.
            if (!reserved && Number.isFinite(rd) && rd < 7) { reserved = true; reservedReason = 'road_corridor'; }
            // Reserve parcels overlapping gameplay anchors (spawn/exit) with buffer.
            if (!reserved) {
              const gp = ctx.input?.gameplay ?? {};
              const anchors = [gp.spawn, gp.exit].filter(Boolean);
              for (const a of anchors) {
                const ax = Number(a.x) || 0, az = Number(a.z) || 0;
                const pad = 10;
                if (ax >= aabb.minX - pad && ax <= aabb.maxX + pad && az >= aabb.minZ - pad && az <= aabb.maxZ + pad) { reserved = true; reservedReason = 'anchor'; break; }
              }
            }
            // R1.3: respect terrain reservations (flat earmarked sites/landmarks) as non-generic build parcels.
            if (!reserved) {
              const reserves = ctx.terrain?.analysis?.reservations ?? ctx.masks?.terrain?.reservations ?? [];
              for (const rs of reserves) {
                const rx = Number(rs?.x), rz = Number(rs?.z);
                if (!Number.isFinite(rx) || !Number.isFinite(rz)) continue;
                const pad = 6;
                if (rx >= aabb.minX - pad && rx <= aabb.maxX + pad && rz >= aabb.minZ - pad && rz <= aabb.maxZ + pad) { reserved = true; reservedReason = 'reservation'; break; }
              }
            }
            // R1.5: keep historical crossing vicinities available for bridge/approach infrastructure (not generic parcels).
            if (!reserved) {
              const crossings = ctx.terrain?.analysis?.crossings ?? ctx.masks?.terrain?.crossings ?? [];
              for (const cr of crossings) {
                const kx = Number(cr?.x), kz = Number(cr?.z);
                if (!Number.isFinite(kx) || !Number.isFinite(kz)) continue;
                const pad = 12;
                if (kx >= aabb.minX - pad && kx <= aabb.maxX + pad && kz >= aabb.minZ - pad && kz <= aabb.maxZ + pad) { reserved = true; reservedReason = 'crossing'; break; }
              }
            }
            // R1.2/R4.1: steep terrain parcels are not buildable as generic parcels (§9.1, slopes > 25%).
            if (!reserved) {
              const baseY = Number(ctx.input?.ground?.y ?? 0) || 0;
              const mods = ctx.terrain?.modifiers ?? [];
              const slope = sampleTerrainSlope(cx, cz, baseY, mods);
              if (Number.isFinite(slope) && slope > 0.25) { reserved = true; reservedReason = 'steep_slope'; }
            }
            // Reserve only very remote parcels in some road-dependent districts to keep access buffers without wiping sparse-network areas
            const hardReserveTypes = new Set(['parking', 'sports', 'industrial']);
            if (!reserved && hardReserveTypes.has(type) && Number.isFinite(rd) && rd > 300) { reserved = true; reservedReason = 'remote_access'; }
            if (!reserved && type === 'slums' && Number.isFinite(rd) && rd > 360) { reserved = true; reservedReason = 'remote_access'; }
            if (reserved && reservedReason) reservedByReason[reservedReason] = (reservedByReason[reservedReason] || 0) + 1;
            parcels.push({
              id: `${d.id}_p${seq}`,
              districtId: d.id,
              type,
              aabb,
              access: { edge: j === 0 ? 'south' : j === nz - 1 ? 'north' : (i === 0 ? 'west' : 'east'), roadDist: Number.isFinite(rd) ? +rd.toFixed(2) : null },
              reserved,
            });
          }
        }
      }
      ctx.parcels = parcels;
      ctx.meta.parcelReservedByReason = reservedByReason;
      const byType = {};
      for (const d of ctx.districts) byType[d.type || d.profileId] = (byType[d.type || d.profileId] || 0) + 1;
      ctx.report.diagnostics.push(info('parcels_generated', stageId, 'generated parcels', { districts: ctx.districts.length, parcels: parcels.length, byType }));
      const reservedTotal = parcels.filter(p => p?.reserved).length;
      if (reservedTotal > 0) {
        ctx.report.diagnostics.push(info('parcels_reserved_by_reason', stageId, 'parcel reservations by terrain/hydrology/infrastructure constraints', { reserved: reservedTotal, total: parcels.length, byReason: reservedByReason }));
      }
    },
    validate(ctx) {
      const stageId = '3_districts_parcels';
      const profiles = ctx.meta.profiles || {};
      if (!ctx.districts.length) ctx.report.diagnostics.push(warn('no_districts', stageId, 'no districts produced'));
      for (const d of ctx.districts) {
        const t = d.type || d.profileId;
        if (t && !profiles[t]) ctx.report.diagnostics.push(warn('unknown_district_profile', stageId, `district '${d.id}' uses unknown profile '${t}'`, { id: d.id, type: t }));
      }
      const size = ctx.meta.worldBounds?.size ?? ctx.input?.ground?.size ?? 256;
      const half = size / 2;
      for (const p of ctx.parcels) {
        const b = p.aabb;
        if (!b || b.maxX <= b.minX || b.maxZ <= b.minZ) ctx.report.diagnostics.push(warn('invalid_parcel', stageId, `parcel '${p.id}' invalid aabb`));
        if (b && (b.minX < -half-1 || b.maxX > half+1 || b.minZ < -half-1 || b.maxZ > half+1)) ctx.report.diagnostics.push(warn('parcel_out_of_bounds', stageId, `parcel '${p.id}' outside bounds`, { id: p.id }));
      }
      // Adjacency compatibility (rect grid neighbors best-effort)
      const byCell = new Map();
      for (const d of ctx.districts) for (const c of (d.cells || [])) byCell.set(`${c.cx},${c.cy}`, d.type || d.profileId);
      for (const d of ctx.districts) {
        for (const c of (d.cells || [])) {
          for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nt = byCell.get(`${c.cx+dx},${c.cy+dy}`);
            const t = d.type || d.profileId;
            if (nt && t && nt !== t && !(COMPAT[t]?.has(nt))) {
              ctx.report.diagnostics.push(warn('district_adjacency_fallback', stageId, `adjacency ${t}↔${nt} not preferred`, { a: t, b: nt }));
            }
          }
        }
      }
    },
    repair(ctx) {
      // Fallback: ensure every district has known profile id (use fallback chain when possible).
      const stageId = '3_districts_parcels';
      const profiles = ctx.meta.profiles || {};
      const profileIds = Object.keys(profiles);
      for (const d of ctx.districts) {
        const t = d.type || d.profileId;
        if (t && !profiles[t]) {
          const chain = FALLBACK_CHAINS[t] || ['forest', 'park', 'residential', 'parking', 'office', 'industrial', 'slums', 'luxury', 'sports'];
          const fallback = chain.find(x => profiles[x]) || profileIds[0] || 'forest';
          ctx.report.repairs.push({ stage: stageId, id: d.id, code: 'district_profile_fallback', from: t, to: fallback });
          d.type = fallback; d.profileId = fallback;
        }
      }
    },
    emit(ctx) {
      // Persist planning results in report and context (engine emission comes in later stages/TASK-008)
      ctx.report.districts = ctx.districts.map(d => {
        const dParcels = ctx.parcels.filter(p => p.districtId === d.id);
        return {
          id: d.id,
          type: d.type || d.profileId,
          profileId: d.profileId || d.type,
          era: d.era ?? null,
          style: d.style ?? null,
          landValue: d.landValue ?? null,
          buildingDensity: d.buildingDensity ?? null,
          heightRange: d.heightRange ?? null,
          pressure: d.pressure ?? null,
          targetB: d.targetB ?? null,
          frame: d.districtFrame ?? null,
          cells: d.cells?.length ?? 0,
          parcels: dParcels.length,
          reservedParcels: dParcels.filter(p => p?.reserved).length,
        };
      });
    },
  };
}
