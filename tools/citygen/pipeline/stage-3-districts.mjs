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
                const w = base * balance * targetBoost * access * landMult(id);
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
          // --- §6.6: industrial ↔ residential только через буфер (парк/склады/commercial) ---
          for (let i = 0; i < DS.length; i++) {
            if (DS[i].type !== 'industrial') continue;
            for (const j of [...adj[i]]) {
              if (!RES_LIKE.has(DS[j]?.type)) continue;
              const fromType = DS[j].type;
              const fromI = DS[i].type;
              if (isSurplus(fromType) && swapDistrictType(DS, adj, j, 'commercial')) { trackSwap(fromType, 'commercial'); repairs.push({ kind: 'industrial_buffer', id: DS[j].id, to: 'commercial' }); continue; }
              if (isSurplus(fromI) && swapDistrictType(DS, adj, i, 'market')) { trackSwap(fromI, 'market'); repairs.push({ kind: 'industrial_buffer', id: DS[i].id, to: 'market' }); continue; }
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
        if (autoDistricts && plate > 0 && shareBefore < parkRange[0]) {
          const cands = DS.map((d, idx) => ({ d, idx, t: d.type }))
            .filter(x => !PARK_TYPES.has(x.t) && rectAreaOf(x.d) > 0 && isSurplus(x.t))
            .map(x => {
              const r = x.d.geometry.rect;
              const cx = (Number(r.minX) + Number(r.maxX)) / 2, cz = (Number(r.minZ) + Number(r.maxZ)) / 2;
              const slope = sampleTerrainSlope(cx, cz, baseY_, mods_);
              const fpl = inFloodplainAt(cx, cz, ctx?.masks?.terrain?.floodplains) ? 1 : 0;
              return { ...x, s: fpl * 1000 + slope * 100 + (1 - (x.d.landValue ?? 0.5)) };
            })
            .sort((a, b) => b.s - a.s);
          for (const { idx } of cands) {
            if (plate > 0 && parkAreaNow() / plate >= parkRange[0]) break;
            const fromT = DS[idx].type;
            if (swapDistrictType(DS, adj, idx, 'park') || swapDistrictType(DS, adj, idx, 'forest')) { trackSwap(fromT, DS[idx].type); promoted += 1; }
          }
        }
        if (autoDistricts && plate > 0 && parkAreaNow() / plate > parkRange[1]) {
          const parkCount = () => DS.reduce((s, d) => s + (PARK_TYPES.has(d.type) ? 1 : 0), 0);
          const demote = DS.map((d, idx) => ({ d, idx }))
            .filter(x => PARK_TYPES.has(x.d.type))
            .sort((a, b) => (b.d.landValue ?? 0) - (a.d.landValue ?? 0));
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
        const shareAfter = plate > 0 ? parkAreaNow() / plate : 0;
        ctx.report.diagnostics.push(info('park_share', stageId, 'park/forest share enforced by section 6.8', {
          before: +shareBefore.toFixed(4), after: +shareAfter.toFixed(4), min: parkRange[0], max: parkRange[1], promoted, demoted,
        }));
        // --- §6.7: districtFrame — ось района (склон/река/артерия), локальная сетка под углом ---
        let frames = 0;
        const frameReasons = { slope: 0, river: 0, arterial: 0 };
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
            const riverSeg = minSegmentDist(cx, cz, ctx?.hydrology?.rivers ?? [], null);
            const artSeg = minSegmentDist(cx, cz, ctx?.networks?.roads?.segments ?? [], new Set(['arterial', 'highway']));
            const pickSeg = (list) => {
              let bestD = Infinity, bestYaw2 = null;
              for (const s of list) {
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
            if (Number.isFinite(riverSeg) && riverSeg <= 40) { yaw = pickSeg(ctx?.hydrology?.rivers ?? []); reason = 'river'; }
            else if (Number.isFinite(artSeg) && artSeg <= 40) { yaw = pickSeg(ctx?.networks?.roads?.segments ?? []); reason = 'arterial'; }
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
      const reservedByReason = { water: 0, road_corridor: 0, anchor: 0, reservation: 0, crossing: 0, steep_slope: 0, remote_access: 0 };
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
          frame: d.districtFrame ?? null,
          cells: d.cells?.length ?? 0,
          parcels: dParcels.length,
          reservedParcels: dParcels.filter(p => p?.reserved).length,
        };
      });
    },
  };
}
