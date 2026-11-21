/**
 * T23.3 (ADR-003): deterministic §11.2 feature manifest and manifestation.
 * Manifest is traceable in ctx/report; manifestation emits readable game objects
 * using existing primitives (props/landscapeObjects, etc.) where applicable.
 */
import { makeRng, mix } from './rng.mjs';

function round3(v) { return Math.round((Number(v) || 0) * 1000) / 1000; }

function districtRect(d) {
  const g = d?.geometry ?? d;
  if (g?.rect && Number.isFinite(g.rect.minX)) return g.rect;
  if (Number.isFinite(g?.x) && Number.isFinite(g?.z) && Number.isFinite(g?.width) && Number.isFinite(g?.height)) {
    return { minX: g.x - g.width / 2, maxX: g.x + g.width / 2, minZ: g.z - g.height / 2, maxZ: g.z + g.height / 2 };
  }
  if (Array.isArray(d?.bounds)) return { minX: d.bounds[0], minZ: d.bounds[1], maxX: d.bounds[2], maxZ: d.bounds[3] };
  return null;
}
function districtCenter(d) {
  const r = districtRect(d);
  if (!r) return null;
  return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
}

function pointSegDistXZ(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az, apx = px - ax, apz = pz - az;
  const ab2 = abx * abx + abz * abz || 1e-12;
  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / ab2));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}
function minRoadDist(x, z, roads = []) {
  let best = Infinity;
  for (const s of roads) {
    const pts = Array.isArray(s?.path) ? s.path : [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      if (!a || !b) continue;
      const d = pointSegDistXZ(x, z, a[0], a[2], b[0], b[2]);
      if (d < best) best = d;
    }
  }
  return best;
}

function canPlaceProp(x, z, props, roads, roadPad = 4.0, minSep = 4.0) {
  if (minRoadDist(x, z, roads) < roadPad) return false;
  for (const p of props) {
    const pos = p?.position;
    if (!pos) continue;
    if (Math.hypot((pos.x ?? 0) - x, (pos.z ?? 0) - z) < minSep) return false;
  }
  return true;
}

function pickDistrict(ctx, wantedTypes, rng) {
  const ds = Array.isArray(ctx?.districts) ? ctx.districts : [];
  const preferred = ds.filter(d => wantedTypes.includes(String(d?.type || '').toLowerCase()));
  const pool = preferred.length ? preferred : ds;
  if (!pool.length) return null;
  // deterministic: stable order by id then rng pick
  const sorted = [...pool].sort((a, b) => { const aa = String(a?.id ?? ''); const bb = String(b?.id ?? ''); return aa < bb ? -1 : aa > bb ? 1 : 0; });
  return sorted[Math.floor(rng() * sorted.length) % sorted.length] || sorted[0];
}

function addProp(ctx, item, prop) {
  const props = ctx.infrastructure?.props;
  if (!Array.isArray(props)) return false;
  props.push(prop);
  item.emitted.props.push(prop.id);
  return true;
}

function featurePropId(ctx) {
  // Use prop_<digits> form so visualizer provenance classifies as generated.
  const n = 900000 + ctx.infrastructure.props.length + 1;
  return `prop_${n}`;
}

function applyOldMarketSquare(ctx, item, rng) {
  const roads = ctx.networks?.roads?.segments ?? [];
  const d = pickDistrict(ctx, ['market', 'downtown', 'commercial', 'mixed', 'retail', 'office'], rng);
  const c = districtCenter(d);
  if (!c) { item.status = 'skipped'; item.reason = 'no_anchor_district'; return; }
  item.anchor = { districtId: d.id, x: round3(c.x), z: round3(c.z) };
  const baseY = Number(ctx.meta?.worldBounds?.y ?? ctx.input?.ground?.y ?? 0) || 0;
  let placed = 0;
  const offsets = [
    [-6, -6], [0, -6], [6, -6],
    [-6, 0],           [6, 0],
    [-6, 6],  [0, 6],  [6, 6],
    [-3, -3], [3, 3], [-3, 3], [3, -3],
  ];
  for (let i = 0; i < offsets.length && placed < 8; i++) {
    const [ox, oz] = offsets[i];
    const x = c.x + ox, z = c.z + oz;
    if (!canPlaceProp(x, z, ctx.infrastructure.props, roads, 4.2, 3.8)) continue;
    const id = featurePropId(ctx);
    addProp(ctx, item, {
      id,
      model: 'market_stall',
      position: { x: round3(x), y: baseY, z: round3(z) },
      scale: { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: round3(((Math.floor(rng() * 4) * 90) % 360)), z: 0 },
    });
    placed++;
  }
  if (placed > 0) { item.status = 'applied'; item.reason = null; }
  else { item.status = 'degraded'; item.reason = 'no_valid_positions'; }
}

function applyCemeteryPark(ctx, item, rng) {
  const roads = ctx.networks?.roads?.segments ?? [];
  const d = pickDistrict(ctx, ['park', 'green', 'residential', 'suburb'], rng);
  const c = districtCenter(d);
  if (!c) { item.status = 'skipped'; item.reason = 'no_anchor_district'; return; }
  item.anchor = { districtId: d.id, x: round3(c.x), z: round3(c.z) };
  const baseY = Number(ctx.meta?.worldBounds?.y ?? ctx.input?.ground?.y ?? 0) || 0;
  let placed = 0;
  const plan = [
    { ox: -8, oz: -8, model: 'tree' }, { ox: 0, oz: -8, model: 'bench' }, { ox: 8, oz: -8, model: 'tree' },
    { ox: -8, oz: 0, model: 'bench' }, { ox: 0, oz: 0, model: 'bollard' }, { ox: 8, oz: 0, model: 'bench' },
    { ox: -8, oz: 8, model: 'tree' }, { ox: 0, oz: 8, model: 'bench' }, { ox: 8, oz: 8, model: 'tree' },
  ];
  for (let i = 0; i < plan.length && placed < 8; i++) {
    const { ox, oz, model } = plan[i];
    const x = c.x + ox, z = c.z + oz;
    if (!canPlaceProp(x, z, ctx.infrastructure.props, roads, 4.0, 3.5)) continue;
    const id = featurePropId(ctx);
    addProp(ctx, item, {
      id,
      model,
      position: { x: round3(x), y: baseY, z: round3(z) },
      scale: { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: round3(rng() * 360), z: 0 },
    });
    placed++;
  }
  if (placed >= 3) { item.status = 'applied'; item.reason = null; }
  else if (placed > 0) { item.status = 'degraded'; item.reason = 'partial_placement'; }
  else { item.status = 'skipped'; item.reason = 'no_valid_positions'; }
}

function tryPlacePlan(ctx, item, roads, baseY, cx, cz, plan, roadPad = 4.0, minSep = 3.8, target = null) {
  let placed = 0;
  const need = target == null ? plan.length : Math.min(target, plan.length);
  for (let i = 0; i < plan.length && placed < need; i++) {
    const e = plan[i];
    const x = cx + (e.ox || 0), z = cz + (e.oz || 0);
    if (!canPlaceProp(x, z, ctx.infrastructure.props, roads, roadPad, minSep)) continue;
    const id = featurePropId(ctx);
    addProp(ctx, item, {
      id,
      model: e.model,
      position: { x: round3(x), y: baseY, z: round3(z) },
      scale: e.scale || { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: round3(e.ry != null ? e.ry : rng() * 360), z: 0 },
    });
    placed++;
  }
  return placed;
}

function applyCitadelHill(ctx, item, rng) {
  const roads = ctx.networks?.roads?.segments ?? [];
  const d = pickDistrict(ctx, ['old_town', 'historic', 'downtown', 'luxury', 'residential', 'office', 'suburb'], rng);
  const c = districtCenter(d);
  if (!c) { item.status = 'skipped'; item.reason = 'no_anchor_district'; return; }
  item.anchor = { districtId: d.id, x: round3(c.x), z: round3(c.z) };
  const baseY = Number(ctx.meta?.worldBounds?.y ?? ctx.input?.ground?.y ?? 0) || 0;
  // Readable "citadel/fort on hill" cluster: central tower marker + fortified perimeter.
  const plan = [
    { ox: 0, oz: 0, model: 'antenna', scale: { x: 1.2, y: 1.4, z: 1.2 }, ry: 0 },
    { ox: 0, oz: 0, model: 'concrete_pillar', scale: { x: 1.3, y: 1.6, z: 1.3 }, ry: 0 },
    { ox: -10, oz: -10, model: 'concrete_pillar', ry: 0 }, { ox: 0, oz: -10, model: 'barrier', ry: 0 }, { ox: 10, oz: -10, model: 'concrete_pillar', ry: 0 },
    { ox: -10, oz: 0, model: 'barrier', ry: 90 }, { ox: 10, oz: 0, model: 'barrier', ry: 90 },
    { ox: -10, oz: 10, model: 'concrete_pillar', ry: 0 }, { ox: 0, oz: 10, model: 'barrier', ry: 0 }, { ox: 10, oz: 10, model: 'concrete_pillar', ry: 0 },
    { ox: -5, oz: -5, model: 'lamp_post', ry: 45 }, { ox: 5, oz: -5, model: 'lamp_post', ry: -45 },
    { ox: -5, oz: 5, model: 'bench', ry: 135 }, { ox: 5, oz: 5, model: 'bench', ry: -135 },
  ];
  const placed = tryPlacePlan(ctx, item, roads, baseY, c.x, c.z, plan, 4.5, 3.2, 12);
  if (placed >= 5) { item.status = 'applied'; item.reason = null; }
  else if (placed > 0) { item.status = 'degraded'; item.reason = 'partial_placement'; }
  else { item.status = 'skipped'; item.reason = 'no_valid_positions'; }
}

function applyStadiumDominant(ctx, item, rng) {
  const roads = ctx.networks?.roads?.segments ?? [];
  const d = pickDistrict(ctx, ['sports', 'stadium', 'park', 'commercial', 'downtown', 'forest'], rng);
  const c = districtCenter(d);
  if (!c) { item.status = 'skipped'; item.reason = 'no_anchor_district'; return; }
  item.anchor = { districtId: d.id, x: round3(c.x), z: round3(c.z) };
  const baseY = Number(ctx.meta?.worldBounds?.y ?? ctx.input?.ground?.y ?? 0) || 0;
  // Readable dominant "stadium/arena" as a large enclosed oval outline.
  const rx = 22, rz = 16;
  const plan = [
    { ox: 0, oz: 0, model: 'av_pad', scale: { x: 1.6, y: 1, z: 1.6 }, ry: 0 },
    { ox: -rx, oz: 0, model: 'concrete_pillar', ry: 90 }, { ox: rx, oz: 0, model: 'concrete_pillar', ry: 90 },
    { ox: 0, oz: -rz, model: 'concrete_pillar', ry: 0 }, { ox: 0, oz: rz, model: 'concrete_pillar', ry: 0 },
    { ox: -16, oz: -12, model: 'container', ry: 45 }, { ox: 16, oz: -12, model: 'container', ry: -45 },
    { ox: -16, oz: 12, model: 'container', ry: 135 }, { ox: 16, oz: 12, model: 'container', ry: -135 },
    { ox: -22, oz: -6, model: 'barrier', ry: 80 }, { ox: -22, oz: 6, model: 'barrier', ry: 100 },
    { ox: 22, oz: -6, model: 'barrier', ry: -80 }, { ox: 22, oz: 6, model: 'barrier', ry: -100 },
    { ox: -8, oz: -16, model: 'barrier', ry: 10 }, { ox: 8, oz: -16, model: 'barrier', ry: -10 },
    { ox: -8, oz: 16, model: 'barrier', ry: -10 }, { ox: 8, oz: 16, model: 'barrier', ry: 10 },
    { ox: -6, oz: 0, model: 'bench', ry: 90 }, { ox: 6, oz: 0, model: 'bench', ry: -90 },
    { ox: 0, oz: -8, model: 'lamp_post', ry: 0 }, { ox: 0, oz: 8, model: 'lamp_post', ry: 180 },
  ];
  const placed = tryPlacePlan(ctx, item, roads, baseY, c.x, c.z, plan, 4.5, 3.2, 16);
  if (placed >= 6) { item.status = 'applied'; item.reason = null; }
  else if (placed > 0) { item.status = 'degraded'; item.reason = 'partial_placement'; }
  else { item.status = 'skipped'; item.reason = 'no_valid_positions'; }
}

function applyRiverIslandPark(ctx, item, rng) {
  const roads = ctx.networks?.roads?.segments ?? [];
  const rivers = Array.isArray(ctx?.landscape?.rivers) ? ctx.landscape.rivers : (Array.isArray(ctx?.input?.rivers) ? ctx.input.rivers : []);
  const d = pickDistrict(ctx, ['park', 'green', 'residential', 'suburb', 'forest', 'old_town'], rng);
  const c = districtCenter(d);
  if (!c) { item.status = 'skipped'; item.reason = 'no_anchor_district'; return; }
  // Prefer anchoring near river geometry when present; otherwise manifest as a readable "island park" motif.
  let ax = c.x, az = c.z;
  if (rivers.length) {
    const r = rivers[0];
    const pts = Array.isArray(r?.path) ? r.path : (Array.isArray(r?.points) ? r.points : []);
    if (pts.length) {
      const mid = pts[Math.floor(pts.length / 2)];
      const mx = Array.isArray(mid) ? (mid[0] ?? c.x) : (mid?.x ?? c.x);
      const mz = Array.isArray(mid) ? (mid[2] ?? mid?.z ?? c.z) : (mid?.z ?? c.z);
      ax = mx + 10;
      az = mz + 10;
    }
  }
  item.anchor = { districtId: d?.id ?? null, x: round3(ax), z: round3(az), riverNearby: rivers.length > 0 };
  const baseY = Number(ctx.meta?.worldBounds?.y ?? ctx.input?.ground?.y ?? 0) || 0;
  const plan = [
    { ox: 0, oz: 0, model: 'av_pad', scale: { x: 1.2, y: 1, z: 1.2 }, ry: 0 },
    { ox: -10, oz: 0, model: 'tree', ry: 20 }, { ox: 10, oz: 0, model: 'tree', ry: -20 },
    { ox: 0, oz: -10, model: 'tree', ry: 40 }, { ox: 0, oz: 10, model: 'tree', ry: -40 },
    { ox: -7, oz: -7, model: 'bench', ry: 45 }, { ox: 7, oz: -7, model: 'bench', ry: -45 },
    { ox: -7, oz: 7, model: 'bench', ry: 135 }, { ox: 7, oz: 7, model: 'bench', ry: -135 },
    { ox: -12, oz: 6, model: 'lamp_post', ry: 0 }, { ox: 12, oz: -6, model: 'lamp_post', ry: 0 },
    { ox: -4, oz: 0, model: 'bollard', ry: 0 }, { ox: 4, oz: 0, model: 'bollard', ry: 0 },
  ];
  const placed = tryPlacePlan(ctx, item, roads, baseY, ax, az, plan, 4.0, 3.2, 10);
  if (placed >= 5) { item.status = 'applied'; item.reason = rivers.length ? null : 'motif_applied_no_river'; }
  else if (placed > 0) { item.status = 'degraded'; item.reason = 'partial_placement'; }
  else { item.status = 'skipped'; item.reason = rivers.length ? 'no_valid_positions' : 'no_river_no_valid_positions'; }
}

const HANDLERS = {
  old_market_square: applyOldMarketSquare,
  cemetery_park: applyCemeteryPark,
  citadel_hill: applyCitadelHill,
  stadium_dominant: applyStadiumDominant,
  river_island_park: applyRiverIslandPark,
};

export function isHandledFeatureType(type) {
  return Object.prototype.hasOwnProperty.call(HANDLERS, type);
}

export function initFeatureManifest(ctx) {
  const selected = Array.isArray(ctx?.meta?.profileMutation?.features) ? [...ctx.meta.profileMutation.features] : [];
  const items = selected.map((type, i) => ({
    id: `feature_${i + 1}_${String(type)}`,
    type: String(type),
    status: 'planned',
    reason: null,
    anchor: null,
    emitted: { props: [], landscapeObjects: [], buildings: [], districts: [] },
  }));
  ctx.features = { selected, items };
  return ctx.features;
}

export function applyFeatureProps(ctx, stageId = '5_infrastructure_props') {
  if (!ctx.features) initFeatureManifest(ctx);
  if (!ctx.infrastructure) ctx.infrastructure = { lights: [], props: [] };
  if (!Array.isArray(ctx.infrastructure.props)) ctx.infrastructure.props = [];
  const seed = Number(ctx?.meta?.seed ?? 0) >>> 0;
  for (const item of ctx.features.items) {
    if (item.status !== 'planned') continue;
    const handler = HANDLERS[item.type];
    const rng = makeRng(mix(seed, 'feature', item.type, item.id));
    if (!handler) {
      // Not yet manifested as concrete object in this increment; keep traceable.
      item.status = 'planned';
      item.reason = 'handler_not_implemented';
      continue;
    }
    try {
      handler(ctx, item, rng);
    } catch (e) {
      item.status = 'skipped';
      item.reason = `error:${String(e?.message || e)}`;
      if (ctx?.report?.diagnostics) ctx.report.diagnostics.push({ severity: 'warn', code: 'feature_apply_failed', stage: stageId, message: `feature '${item.type}' apply failed`, feature: item.type });
    }
  }
}

export function finalizeFeatureManifest(ctx, stageId = '6_finalize_emit') {
  if (!ctx.features) initFeatureManifest(ctx);
  for (const item of ctx.features.items) {
    if (item.status === 'planned') {
      item.status = HANDLERS[item.type] ? item.status : 'skipped';
      if (item.status === 'skipped' && !item.reason) item.reason = 'not_implemented';
    }
  }
  // Deterministic summary for report
  const summary = {
    selected: [...ctx.features.selected],
    count: ctx.features.items.length,
    applied: ctx.features.items.filter(i => i.status === 'applied').length,
    degraded: ctx.features.items.filter(i => i.status === 'degraded').length,
    skipped: ctx.features.items.filter(i => i.status === 'skipped').length,
    planned: ctx.features.items.filter(i => i.status === 'planned').length,
    items: ctx.features.items.map(i => ({
      id: i.id, type: i.type, status: i.status, reason: i.reason ?? null,
      anchor: i.anchor ?? null,
      emitted: {
        props: (i.emitted?.props ?? []).length,
        landscapeObjects: (i.emitted?.landscapeObjects ?? []).length,
        buildings: (i.emitted?.buildings ?? []).length,
        districts: (i.emitted?.districts ?? []).length,
      },
    })),
  };
  ctx.report.features = summary;
  if (ctx?.report?.diagnostics) {
    ctx.report.diagnostics.push({ severity: 'info', code: 'features_manifest', stage: stageId, message: `feature manifest: ${summary.applied} applied, ${summary.degraded} degraded, ${summary.skipped} skipped, ${summary.planned} planned`, selected: summary.selected, applied: summary.applied, degraded: summary.degraded, skipped: summary.skipped, planned: summary.planned });
  }
  return summary;
}
