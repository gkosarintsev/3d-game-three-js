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
  const sorted = [...pool].sort((a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? '')));
  return sorted[Math.floor(rng() * sorted.length) % sorted.length] || sorted[0];
}

function addProp(ctx, item, prop) {
  const props = ctx.infrastructure?.props;
  if (!Array.isArray(props)) return false;
  props.push(prop);
  item.emitted.props.push(prop.id);
  return true;
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
    const id = `feat_${item.type}_${placed + 1}`;
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
    const id = `feat_${item.type}_${placed + 1}`;
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

const HANDLERS = {
  old_market_square: applyOldMarketSquare,
  cemetery_park: applyCemeteryPark,
};

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
