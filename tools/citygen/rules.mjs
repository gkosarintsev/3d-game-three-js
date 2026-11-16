/**
 * R0.2/R0.3: read-only validation (invariants, §12.1 subset) and metrics (§12.2 subset)
 * for citygen IR/context. Deterministic, no mutations of input data.
 *
 * This is an incremental baseline: it reports what can be computed from ctx/meta/report
 * today (v4 pilots 16–19) without changing generation behavior. Checks/metrics are
 * extended in later phases as IR becomes richer.
 */
import { byId } from './ids.mjs';

function round(v, n = 6) {
  if (!Number.isFinite(v)) return null;
  const p = 10 ** n;
  return Math.round(v * p) / p;
}

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
      if (!a || !b) continue;
      best = Math.min(best, pointSegDistXZ(x, z, a[0], a[2], b[0], b[2]));
    }
  }
  return Number.isFinite(best) ? best : null;
}

function segLengthXZ(seg) {
  if (Number.isFinite(seg?.length)) return Number(seg.length);
  const pts = Array.isArray(seg?.path) ? seg.path : [];
  let len = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    if (!a || !b) continue;
    len += Math.hypot((b[0] ?? 0) - (a[0] ?? 0), (b[2] ?? 0) - (a[2] ?? 0));
  }
  // element/arc-based segments may not carry path length in IR snapshots; best-effort from elements
  if (len <= 0 && Array.isArray(seg?.elements) && seg.elements.length) {
    for (const el of seg.elements) {
      if (el?.arc) {
        const r = Number(el.arc.radius) || 0;
        const from = Number(el.arc.from) || 0;
        const to = Number(el.arc.to) || 0;
        len += Math.abs((to - from) * Math.PI / 180) * r;
      } else if (el?.plate) {
        const l = Number(el.plate.length);
        if (Number.isFinite(l) && l > 0) len += l;
      }
    }
  }
  return len;
}

function segMaxSlope(seg) {
  const pts = Array.isArray(seg?.path) ? seg.path : [];
  let maxS = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    if (!a || !b) continue;
    const dx = (b[0] ?? 0) - (a[0] ?? 0);
    const dz = (b[2] ?? 0) - (a[2] ?? 0);
    const dy = (b[1] ?? 0) - (a[1] ?? 0);
    const run = Math.hypot(dx, dz);
    if (run <= 1e-9) continue;
    const s = Math.abs(dy) / run;
    if (s > maxS) maxS = s;
  }
  if (maxS <= 0 && Array.isArray(seg?.elements) && seg.elements.length) {
    for (const el of seg.elements) {
      if (el?.arc && Array.isArray(el.arc.y) && el.arc.y.length === 2) {
        const r = Number(el.arc.radius) || 0;
        const span = Math.abs(((Number(el.arc.to) || 0) - (Number(el.arc.from) || 0)) * Math.PI / 180) * r;
        if (span > 1e-9) maxS = Math.max(maxS, Math.abs((Number(el.arc.y[1]) || 0) - (Number(el.arc.y[0]) || 0)) / span);
      }
      if (el?.plate) {
        const l = Number(el.plate.length) || 0;
        const rise = Number(el.plate.rise) || 0;
        if (l > 1e-9) maxS = Math.max(maxS, Math.abs(rise) / l);
      }
    }
  }
  return maxS;
}

function classSlopeLimitPct(type, policies) {
  const t = String(type || 'local');
  const sl = policies?.slopeLimitPct && typeof policies.slopeLimitPct === 'object' ? policies.slopeLimitPct : null;
  const map = { highway: 'highway', arterial: 'arterial', collector: 'collector', local: 'local', ramp: 'collector', merge: 'collector', split: 'collector', connector: 'local' };
  const key = map[t] || 'local';
  const pct = Number(sl?.[key]);
  return Number.isFinite(pct) ? pct : null;
}

function roadGraphStats(nodes = [], segments = []) {
  const adj = new Map();
  for (const n of nodes) if (n?.id != null) adj.set(String(n.id), new Set());
  let edgesConsidered = 0;
  for (const s of segments) {
    const a = s?.from != null ? String(s.from) : null;
    const b = s?.to != null ? String(s.to) : null;
    if (!a || !b || !adj.has(a) || !adj.has(b) || a === b) continue;
    adj.get(a).add(b); adj.get(b).add(a);
    edgesConsidered++;
  }
  const ids = Array.from(adj.keys()).sort();
  const seen = new Set();
  let components = 0;
  let largest = 0;
  for (const id of ids) {
    if (seen.has(id)) continue;
    components++;
    const q = [id]; seen.add(id);
    let size = 0;
    while (q.length) {
      const cur = q.shift();
      size++;
      for (const nb of (adj.get(cur) || [])) if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
    }
    if (size > largest) largest = size;
  }
  let deadEnds = 0, degreeSum = 0;
  for (const id of ids) {
    const d = (adj.get(id) || new Set()).size;
    degreeSum += d;
    if (d === 1) deadEnds++;
  }
  const V = ids.length;
  const E = edgesConsidered;
  const gamma = V > 2 ? E / (3 * (V - 2)) : null; // planar-ish road graph index §12.2
  return {
    nodes: V,
    edges: E,
    components,
    largestComponent: largest,
    deadEnds,
    deadEndRatio: V > 0 ? round(deadEnds / V, 6) : null,
    avgDegree: V > 0 ? round(degreeSum / V, 6) : null,
    gamma: round(gamma, 6),
  };
}

function roadClassShares(segments = []) {
  const byType = Object.create(null);
  let total = 0;
  for (const s of segments) {
    const t = String(s?.type || s?.class || 'unknown');
    const len = segLengthXZ(s);
    byType[t] = (byType[t] || 0) + len;
    total += len;
  }
  const types = Object.keys(byType).sort();
  const shares = Object.create(null);
  for (const t of types) shares[t] = total > 0 ? round(byType[t] / total, 6) : 0;
  const lengths = Object.create(null);
  for (const t of types) lengths[t] = round(byType[t], 3);
  return { totalLength: round(total, 3), lengthByType: lengths, shareByType: shares };
}

function districtAreaShare(districts = [], groundSize = 0) {
  const plateArea = groundSize > 0 ? groundSize * groundSize : 0;
  const byType = Object.create(null);
  let known = 0;
  for (const d of districts) {
    const t = String(d?.type || d?.profileId || 'unknown');
    // v4 generator districts in source/report often lack explicit area; skip unknown areas.
    const area = Number.isFinite(d?.area) ? Number(d.area)
      : (Number.isFinite(d?.geometry?.width) && Number.isFinite(d?.geometry?.height) ? d.geometry.width * d.geometry.height : null);
    if (Number.isFinite(area) && area > 0) {
      byType[t] = (byType[t] || 0) + area;
      known += area;
    }
  }
  const types = Object.keys(byType).sort();
  const shareByType = Object.create(null);
  for (const t of types) shareByType[t] = plateArea > 0 ? round(byType[t] / plateArea, 6) : null;
  return { plateArea: round(plateArea, 3), knownArea: round(known, 3), areaByType: byType, shareByType };
}

function insidePlate(x, z, size) {
  if (!(size > 0) || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  const h = size / 2;
  return x >= -h && x <= h && z >= -h && z <= h;
}

export function evaluateRules(ctx) {
  const report = ctx?.report ?? {};
  const input = ctx?.input ?? {};
  const meta = ctx?.meta ?? {};
  const policies = meta?.policies ?? {};
  const roads = ctx?.networks?.roads?.segments ?? input?.cityforge?.networks?.roads?.segments ?? [];
  const nodes = ctx?.networks?.roads?.nodes ?? input?.cityforge?.networks?.roads?.nodes ?? [];
  const districts = Array.isArray(ctx?.districts) ? ctx.districts : (Array.isArray(input?.generator?.districts) ? input.generator.districts : []);
  const parcels = Array.isArray(ctx?.parcels) ? ctx.parcels : [];
  const buildings = Array.isArray(ctx?.buildings) ? ctx.buildings : (Array.isArray(input?.buildings) ? input.buildings : []);
  const props = Array.isArray(ctx?.infrastructure?.props) ? ctx.infrastructure.props : (Array.isArray(input?.landscapeObjects) ? input.landscapeObjects : []);
  const lights = Array.isArray(ctx?.infrastructure?.lights) ? ctx.infrastructure.lights : (Array.isArray(input?.lights) ? input.lights : []);
  const gp = input?.gameplay ?? {};
  const groundSize = Number(meta?.worldBounds?.size ?? input?.ground?.size ?? 0) || 0;
  const stream = meta?.stream ?? input?.stream ?? null;

  const violations = [];
  const v = (severity, code, message, extra = {}) => violations.push({ severity, code, stage: 'rules', message, ...extra });

  // §12.1 subset: stream divisibility, spawn/exit on plate, basic gameplay refs
  if (stream && groundSize > 0 && Number.isFinite(Number(stream.chunk)) && Number(stream.chunk) > 0) {
    const chunk = Number(stream.chunk);
    const ratio = groundSize / chunk;
    if (Math.abs(ratio - Math.round(ratio)) > 1e-9) {
      v('error', 'stream_chunk_not_dividing_plate', 'stream.chunk must divide ground.size', { chunk, groundSize });
    }
  }
  if (gp.spawn && groundSize > 0 && !insidePlate(gp.spawn.x, gp.spawn.z, groundSize)) {
    v('error', 'spawn_outside_plate', 'gameplay.spawn is outside ground plate', { spawn: gp.spawn, groundSize });
  }
  if (gp.exit && groundSize > 0 && !insidePlate(gp.exit.x, gp.exit.z, groundSize)) {
    v('error', 'exit_outside_plate', 'gameplay.exit is outside ground plate', { exit: gp.exit, groundSize });
  }
  if (Array.isArray(gp?.cars?.spots) && Number.isFinite(Number(gp?.cars?.count)) && gp.cars.count !== gp.cars.spots.length) {
    v('error', 'cars_count_mismatch', 'gameplay.cars.count must equal cars.spots.length', { count: gp.cars.count, spots: gp.cars.spots.length });
  }
  if (Number.isFinite(Number(gp?.cars?.count)) && gp.cars.count > 8) {
    v('error', 'cars_count_limit', 'gameplay.cars.count must be <= 8', { count: gp.cars.count });
  }

  const graph = roadGraphStats(nodes, roads);
  if (graph.nodes > 0 && graph.components > 1) {
    v('warn', 'road_graph_not_single_component', `road graph has ${graph.components} connected components`, { components: graph.components, nodes: graph.nodes });
  }
  // R2.3/R2.4 (read-only targets, §7.5/§12.2): connectivity density and dead-end ratio
  if (graph.nodes > 2 && Number.isFinite(graph.gamma)) {
    if (graph.gamma < 0.3 || graph.gamma > 0.6) {
      v('info', 'road_graph_gamma_out_of_target', 'road graph gamma outside target range [0.3, 0.6] (informational)', { gamma: graph.gamma, target: [0.3, 0.6] });
    }
  }
  if (graph.nodes > 0 && Number.isFinite(graph.deadEndRatio) && graph.deadEndRatio > 0.35) {
    v('info', 'road_graph_dead_end_ratio_high', 'road dead-end ratio above 0.35 (informational)', { deadEndRatio: graph.deadEndRatio });
  }
  // R2.4: soft topology targets (§7.5, §12.2)
  if (graph.gamma != null) {
    if (graph.gamma < 0.3 || graph.gamma > 0.6) {
      v('info', 'road_graph_gamma_out_of_target', 'road graph gamma outside typical target range [0.3, 0.6] (informational)', { gamma: graph.gamma, target: [0.3, 0.6] });
    }
  }
  if (graph.deadEndRatio != null) {
    // rough target: collector/local grid-like networks often 5–20%; keep informational
    if (graph.deadEndRatio > 0.35) {
      v('info', 'road_graph_dead_end_ratio_high', 'road graph dead-end ratio is high (informational)', { deadEndRatio: graph.deadEndRatio, targetMax: 0.35 });
    }
  }
  const spawnDist = gp.spawn ? minRoadDist(gp.spawn.x, gp.spawn.z, roads) : null;
  const exitDist = gp.exit ? minRoadDist(gp.exit.x, gp.exit.z, roads) : null;
  if (spawnDist != null && spawnDist > 20) {
    v('warn', 'spawn_far_from_road', 'gameplay.spawn is far from road network (>20m)', { distance: round(spawnDist, 3) });
  }
  if (exitDist != null && exitDist > 20) {
    v('warn', 'exit_far_from_road', 'gameplay.exit is far from road network (>20m)', { distance: round(exitDist, 3) });
  }

  // R0.2/R2 prep: road slope vs class policy (read-only; absolute engine limit J.maxSlope=0.3 remains authoritative)
  let roadSlopeViolations = 0;
  let roadSlopeWarns = 0;
  let maxObservedRoadSlope = 0;
  const slopeByClass = Object.create(null);
  for (const s of roads) {
    const ms = segMaxSlope(s);
    if (ms > maxObservedRoadSlope) maxObservedRoadSlope = ms;
    const t = String(s?.type || s?.class || 'unknown');
    if (!slopeByClass[t]) slopeByClass[t] = { count: 0, maxSlope: 0, overPolicy: 0, overAbsolute: 0 };
    const rec = slopeByClass[t];
    rec.count++;
    if (ms > rec.maxSlope) rec.maxSlope = ms;
    const pct = classSlopeLimitPct(t, policies);
    if (pct != null) {
      const lim = pct / 100;
      if (ms > lim + 1e-9) { rec.overPolicy++; roadSlopeWarns++; }
    }
    if (ms > 0.3005) { rec.overAbsolute++; roadSlopeViolations++; }
  }
  for (const [t, rec] of Object.entries(slopeByClass)) {
    rec.maxSlope = round(rec.maxSlope, 6);
  }
  if (roadSlopeViolations > 0) {
    v('error', 'road_slope_over_absolute_limit', `road segments exceed absolute slope limit (>0.3)`, { segments: roadSlopeViolations, maxSlope: round(maxObservedRoadSlope, 6) });
  } else if (roadSlopeWarns > 0) {
    v('warn', 'road_slope_over_class_policy', `road segments exceed class slope policy (see policies.slopeLimitPct)`, { segments: roadSlopeWarns, maxSlope: round(maxObservedRoadSlope, 6) });
  }

  const enterable = buildings.filter(b => b?.isEnterable === true).length;
  const enterableShare = buildings.length > 0 ? round(enterable / buildings.length, 6) : null;
  const roadShares = roadClassShares(roads);
  const districtShare = districtAreaShare(districts, groundSize);
  const targetEnterable = Number.isFinite(Number(policies?.enterableShare)) ? Number(policies.enterableShare) : null;
  if (buildings.length > 0 && targetEnterable != null && enterableShare != null) {
    // мягкая цель §9.8: 15–25% (policy default 0.2)
    if (Math.abs(enterableShare - targetEnterable) > 0.15) {
      v('info', 'enterable_share_far_from_target', 'enterable building share differs from policy target (informational)', { share: enterableShare, target: targetEnterable });
    }
  }

  const diagErrors = (report.diagnostics ?? []).filter(d => d?.severity === 'error').length;
  const diagWarns = (report.diagnostics ?? []).filter(d => d?.severity === 'warn').length;

  // R2.6/§8.4 §12.1 (read-only): tunnel structures diagnostics (portals/lining/lighting per tunnel)
  const tunnels = Array.isArray(ctx?.structures?.tunnels) ? ctx.structures.tunnels
    : (Array.isArray(input?.cityforge?.structures?.tunnels) ? input.cityforge.structures.tunnels : []);
  for (const [i, t] of tunnels.entries()) {
    const id = String(t?.id ?? `tunnel_${i}`);
    if (t && t.type != null && String(t.type) !== 'tunnel') {
      v('error', 'tunnel_invalid_type', `tunnel '${id}' has type '${String(t.type)}' (expected 'tunnel')`, { index: i, id, type: t.type });
    }
    const portals = t?.portals ?? [];
    if (!Array.isArray(portals) || portals.length < 2) {
      v('error', 'tunnel_portals_too_few', `tunnel '${id}' must declare at least two portals`, { index: i, id, portals: Array.isArray(portals) ? portals.length : 0 });
    } else {
      const p0 = portals[0];
      const p1 = portals[portals.length - 1];
      const p0v = p0?.position ?? p0;
      const p1v = p1?.position ?? p1;
      const p0ok = Array.isArray(p0v) && p0v.length >= 3 && p0v.every(n => Number.isFinite(Number(n)));
      const p1ok = Array.isArray(p1v) && p1v.length >= 3 && p1v.every(n => Number.isFinite(Number(n)));
      if (!p0ok || !p1ok) {
        v('error', 'tunnel_portal_position_invalid', `tunnel '${id}' portal position must be a finite [x,y,z]`, { index: i, id });
      }
      if (p0ok && p1ok) {
        const t0x = Number(p0v[0]), t0z = Number(p0v[2]), t1x = Number(p1v[0]), t1z = Number(p1v[2]);
        const sameAxisX = Math.abs(t0x - t1x) < 1e-3;
        const sameAxisZ = Math.abs(t0z - t1z) < 1e-3;
        if (!sameAxisX && !sameAxisZ) {
          v('info', 'tunnel_portals_not_axis_aligned', `tunnel '${id}' portals are not axis-aligned (informational)`, { index: i, id });
        }
        const run = Math.hypot(t1x - t0x, t1z - t0z);
        if (run < 1) {
          v('warn', 'tunnel_degenerate_run', `tunnel '${id}' portals coincide or are too close`, { index: i, id, run: round(run, 3) });
        }
      }
    }
    const lining = t?.parameters?.lining ?? null;
    if (lining != null && !['concrete', 'rock', 'plastic'].includes(String(lining))) {
      v('warn', 'tunnel_lining_unknown', `tunnel '${id}' lining '${String(lining)}' not in {concrete,rock,plastic}`, { index: i, id, lining });
    }
    const lighting = t?.parameters?.lighting;
    if (lighting != null && typeof lighting !== 'boolean') {
      v('info', 'tunnel_lighting_not_boolean', `tunnel '${id}' lighting should be boolean`, { index: i, id, lighting });
    }
    const roadRefs = t?.roadRefs ?? [];
    if (Array.isArray(roadRefs) && roadRefs.length === 0) {
      v('warn', 'tunnel_references_empty', `tunnel '${id}' has empty roadRefs`, { index: i, id });
    }
  }

  // R2.8/§8.1 §12.2 (read-only): junction type vs adjacent road classes (validator)
  const junctions = Array.isArray(ctx?.networks?.roads?.junctions) ? ctx.networks.roads.junctions
    : (Array.isArray(input?.cityforge?.networks?.roads?.junctions) ? input.cityforge.networks.roads.junctions : []);
  if (junctions.length > 0 && roads.length > 0) {
    const segById = new Map(roads.map(s => [String(s?.id ?? ''), s]));
    for (const [i, j] of junctions.entries()) {
      const id = String(j?.id ?? `j_${i}`);
      const declared = String(j?.type ?? '').toLowerCase();
      const nodeId = (String(id).match(/^j_(.+)$/) || [])[1] ?? null;
      const incident = [];
      for (const idSeg of [j?.node, j?.nodeId]) {
        if (idSeg != null && !incident.length) {
          const nid = String(idSeg);
          for (const s of roads) {
            if (String(s?.from) === nid || String(s?.to) === nid) incident.push(s);
          }
        }
      }
      if (!incident.length && nodeId) {
        for (const s of roads) {
          if (String(s?.from) === nodeId || String(s?.to) === nodeId) incident.push(s);
        }
      }
      // if we cannot infer incidence, skip (irrelevant for read-only rules or missing IR nodes)
      if (incident.length > 0) {
        const types = new Set(incident.map(s => String(s?.type || '').toLowerCase()).filter(Boolean));
        const hasArt = types.has('arterial');
        const hasHwy = types.has('highway');
        const hasCol = types.has('collector');
        const hasLocal = types.has('local');
        let expected = null;
        if (hasHwy || (hasArt && (hasArt || hasHwy || hasCol))) expected = 'signalized';
        else if (hasCol && !hasArt && !hasHwy) expected = (incident.length <= 4) ? 'roundabout' : 'signalized';
        else if (hasLocal && !hasCol && !hasArt && !hasHwy) expected = 'uncontrolled';
        if (expected && declared && declared !== expected) {
          v('warn', 'junction_type_mismatch_class', `junction '${id}' type '${declared}' does not match adjacent classes (expected '${expected}')`, {
            index: i, id, declared, expected, classes: [...types], incidentCount: incident.length,
          });
        } else if (expected && !declared) {
          v('warn', 'junction_type_missing', `junction '${id}' missing type; expected '${expected}'`, {
            index: i, id, expected, classes: [...types], incidentCount: incident.length,
          });
        }
      }
    }
  }

  // R1/R3: terrain/hydrology analysis and parcel reservation metrics when available (read-only)
  const terrainAnalysis = ctx?.terrain?.analysis ?? null;
  const terrainMasks = ctx?.masks?.terrain ?? ctx?.terrain?.analysis ?? null;
  const rivers = ctx?.hydrology?.rivers ?? [];
  const lakes = ctx?.hydrology?.lakes ?? [];
  const waterBuffers = Array.isArray(ctx?.masks?.terrain?.waterBuffers) ? ctx.masks.terrain.waterBuffers
    : (Array.isArray(ctx?.terrain?.analysis?.waterBuffers) ? ctx.terrain.analysis.waterBuffers : []);
  const floodplains = Array.isArray(ctx?.masks?.terrain?.floodplains) ? ctx.masks.terrain.floodplains
    : (Array.isArray(ctx?.terrain?.analysis?.floodplains) ? ctx.terrain.analysis.floodplains : []);
  const reservedParcels = parcels.filter(p => p?.reserved === true).length;
  const reservedShare = parcels.length > 0 ? round(reservedParcels / parcels.length, 6) : null;
  const parcelsByDistrict = Object.create(null);
  for (const p of parcels) {
    const k = String(p?.districtId ?? p?.type ?? 'unknown');
    parcelsByDistrict[k] = (parcelsByDistrict[k] || 0) + 1;
  }

  // R1 (read-only validation, §4–§5): water/slope/crossing/landmark/reservation masks as downstream constraints.
  if ((rivers.length + lakes.length) > 0 && waterBuffers.length === 0) {
    v('warn', 'terrain_water_buffers_missing', 'hydrology present but water buffer/floodplain masks are missing', { rivers: rivers.length, lakes: lakes.length });
  } else if ((rivers.length + lakes.length) > 0) {
    const missingMeta = waterBuffers.filter(w => !(Number.isFinite(Number(w?.buffer)) || Number.isFinite(Number(w?.floodplain)))).length;
    if (missingMeta > 0) v('info', 'terrain_water_buffer_metadata_incomplete', 'some water buffers are missing buffer/floodplain metadata (informational)', { missing: missingMeta, total: waterBuffers.length });
    if (floodplains.length === 0) {
      v('warn', 'terrain_floodplain_masks_missing', 'hydrology present but floodplain masks are missing', { rivers: rivers.length, lakes: lakes.length, waterBuffers: waterBuffers.length });
    } else if (floodplains.length < (rivers.length + lakes.length)) {
      v('info', 'terrain_floodplain_masks_partial', 'floodplain masks cover fewer hydrology features than present (informational)', { floodplains: floodplains.length, hydrology: rivers.length + lakes.length });
    } else {
      const missingFp = floodplains.filter(f => !Number.isFinite(Number(f?.floodplain)) || Number(f.floodplain) <= 0).length;
      if (missingFp > 0) v('info', 'terrain_floodplain_metadata_incomplete', 'some floodplain masks are missing/invalid floodplain margin (informational)', { missing: missingFp, total: floodplains.length });
    }
  }
  if (terrainAnalysis) {
    if (!terrainAnalysis.slope) v('info', 'terrain_slope_analysis_missing', 'terrain analysis missing slope mask/classification (informational)');
    if (!Array.isArray(terrainAnalysis.crossings)) v('info', 'terrain_crossings_mask_missing', 'terrain analysis missing crossings mask/list (informational)');
    else if (rivers.length > 0 && terrainAnalysis.crossings.length === 0) v('info', 'terrain_crossings_none_marked', 'rivers present but no crossing candidates marked (informational)', { rivers: rivers.length });
    if (!Array.isArray(terrainAnalysis.reservations) && !Array.isArray(terrainMasks?.reservations)) {
      v('info', 'terrain_reservations_mask_missing', 'terrain analysis missing reservations mask/list (informational)');
    }
    if (!Array.isArray(terrainAnalysis.landmarks) && !Array.isArray(terrainMasks?.landmarks)) {
      v('info', 'terrain_landmarks_mask_missing', 'terrain analysis missing landmarks mask/list (informational)');
    }
  } else if ((rivers.length + lakes.length) > 0) {
    v('info', 'terrain_analysis_missing', 'hydrology present but terrain analysis/masks are unavailable (informational)');
  }

  // §12.2 subset metrics (deterministic snapshot). Many targets need richer IR; marked partial.
  const metrics = {
    version: 1,
    partial: true,
    counts: {
      roads: roads.length,
      roadNodes: nodes.length,
      districts: districts.length,
      parcels: parcels.length,
      reservedParcels,
      buildings: buildings.length,
      enterableBuildings: enterable,
      props: props.length,
      lights: lights.length,
      rivers: rivers.length,
      lakes: lakes.length,
    },
    graph,
    roads: {
      ...roadShares,
      maxSlope: round(maxObservedRoadSlope, 6),
      slopeByClass,
      slopePolicy: policies?.slopeLimitPct ?? null,
      classPolicyViolations: roadSlopeWarns,
      classPolicyOk: Math.max(0, roads.length - roadSlopeWarns),
      overAbsolute: roadSlopeViolations,
      version: 2,
    },
    gameplay: {
      spawnToRoad: round(spawnDist, 3),
      exitToRoad: round(exitDist, 3),
      enterableShare,
      enterableTarget: targetEnterable,
    },
    districts: districtShare,
    parcels: {
      reservedShare,
      byDistrictCount: parcels.length ? parcelsByDistrict : null,
    },
    terrain: terrainAnalysis ? {
      slope: terrainAnalysis.slope ? {
        step: terrainAnalysis.slope.step ?? null,
        grid: terrainAnalysis.slope.grid ?? null,
        cells: terrainAnalysis.slope.cells ?? null,
        maxSlope: round(terrainAnalysis.slope.maxSlope, 6),
        share: terrainAnalysis.slope.share ?? null,
        counts: terrainAnalysis.slope.counts ?? null,
      } : null,
      crossings: Array.isArray(terrainAnalysis.crossings) ? terrainAnalysis.crossings.length : (terrainAnalysis.crossings ?? null),
      reservations: Array.isArray(terrainAnalysis.reservations) ? terrainAnalysis.reservations.length
        : (terrainAnalysis.reservations ? {
          road: Array.isArray(terrainAnalysis.reservations.road) ? terrainAnalysis.reservations.road.length : 0,
          water: Array.isArray(terrainAnalysis.reservations.water) ? terrainAnalysis.reservations.water.length : 0,
          buildable: Array.isArray(terrainAnalysis.reservations.buildable) ? terrainAnalysis.reservations.buildable.length : 0,
        } : null),
      landmarks: Array.isArray(terrainAnalysis.landmarks) ? terrainAnalysis.landmarks.length : (terrainAnalysis.landmarks ?? null),
      waterBuffers: waterBuffers.length,
      floodplains: floodplains.length,
    } : ((rivers.length + lakes.length) > 0 ? { waterBuffers: waterBuffers.length, floodplains: floodplains.length } : null),
    stream: stream ? {
      chunk: stream.chunk ?? null,
      keep: stream.keep ?? null,
      aheadMin: stream.aheadMin ?? null,
      aheadMax: stream.aheadMax ?? null,
      budgetMs: stream.budgetMs ?? null,
      dividesPlate: groundSize > 0 && Number.isFinite(Number(stream.chunk)) && Number(stream.chunk) > 0
        ? Math.abs(groundSize / Number(stream.chunk) - Math.round(groundSize / Number(stream.chunk))) <= 1e-9
        : null,
    } : null,
    determinism: {
      generatorVersion: meta.generatorVersion ?? report?.generator?.generatorVersion ?? null,
      seed: meta.seed ?? report?.generator?.seed ?? null,
      deterministic: meta.deterministic ?? report?.generator?.deterministic ?? true,
    },
    report: {
      diagnosticsErrors: diagErrors,
      diagnosticsWarnings: diagWarns,
      repairs: Array.isArray(report.repairs) ? report.repairs.length : 0,
      drops: Array.isArray(report.drops) ? report.drops.length : 0,
    },
  };

  const sevRank = { error: 0, warn: 1, info: 2 };
  violations.sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9)
    || String(a.code).localeCompare(String(b.code))
    || String(a.message).localeCompare(String(b.message)));

  const rules = {
    version: 1,
    partial: true,
    violations,
    summary: {
      errors: violations.filter(x => x.severity === 'error').length,
      warnings: violations.filter(x => x.severity === 'warn').length,
      infos: violations.filter(x => x.severity === 'info').length,
    },
  };

  return { metrics, rules };
}

export function attachRulesToReport(report, ctx) {
  const { metrics, rules } = evaluateRules(ctx);
  report.metrics = metrics;
  report.rules = rules;
  return report;
}
