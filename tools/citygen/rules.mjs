/**
 * R0.2/R0.3: read-only validation (invariants, §12.1 subset) and metrics (§12.2 subset)
 * for citygen IR/context. Deterministic, no mutations of input data.
 *
 * This is an incremental baseline: it reports what can be computed from ctx/meta/report
 * today (v4 pilots 16–19) without changing generation behavior. Checks/metrics are
 * extended in later phases as IR becomes richer.
 */
import { byId } from './ids.mjs';
import { terrainHeightAt } from './terrain-height.mjs';
import { CONFIG } from '../../src/config.js';

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

// Возвращает класс ближайшей дороги в пределах ~25 м от точки; вне 25 м — 'offroad'.
// Используется §10.4 «impression cadence»: смена класса дороги тоже считается
// впечатлением, иначе длинная монотонная магистраль давала бы ложные нули.
function nearestRoadClassAt(x, z, segments = []) {
  let best = Infinity;
  let cls = null;
  for (const s of segments) {
    const pts = Array.isArray(s?.path) ? s.path : [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      if (!a || !b) continue;
      const d = pointSegDistXZ(x, z, a[0], a[2], b[0], b[2]);
      if (d < best) { best = d; cls = String(s?.type || 'local'); }
    }
  }
  return (Number.isFinite(best) && best <= 25) ? cls : 'offroad';
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

function districtRectOf(d) {
  const g = d?.geometry;
  const r = g?.rect ?? (Number.isFinite(Number(g?.minX)) ? g : null);
  if (!r) return null;
  const minX = Number(r.minX), maxX = Number(r.maxX), minZ = Number(r.minZ), maxZ = Number(r.maxZ);
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || !(maxX > minX) || !(maxZ > minZ)) return null;
  return { minX, maxX, minZ, maxZ };
}

function districtTypeAt(districts, x, z) {
  let best = null, bestArea = Infinity;
  for (const d of districts ?? []) {
    const r = districtRectOf(d);
    if (!r) continue;
    if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
    const a = (r.maxX - r.minX) * (r.maxZ - r.minZ);
    if (a < bestArea) { bestArea = a; best = d; }
  }
  return best?.type ?? 'unknown';
}

/** Shared: spawn→exit shortest path by road graph (Dijkstra); returns legs [ {x,z}, {x,z}, len ] or null. */
function spawnExitLegs(nodes, segments, gp) {
  if (!gp?.spawn || !gp?.exit || !Array.isArray(nodes) || !Array.isArray(segments) || !segments.length) return null;
  if (!Number.isFinite(Number(gp.spawn.x)) || !Number.isFinite(Number(gp.spawn.z))) return null;
  if (!Number.isFinite(Number(gp.exit.x)) || !Number.isFinite(Number(gp.exit.z))) return null;

  const posOf = (n) => {
    const p = Array.isArray(n?.position) ? n.position : (n?.x != null && n?.z != null ? [n.x, 0, n.z] : null);
    if (!p) return null;
    const x = Number(p[0]), z = Number(p[2] ?? p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return { x, z };
  };
  const byId = new Map();
  for (const n of nodes) {
    const id = String(n?.id ?? '');
    if (!id) continue;
    const q = posOf(n);
    if (q) byId.set(id, q);
  }
  if (byId.size < 2) return null;

  const adj = new Map();
  const add = (a, b, len) => {
    const arr = adj.get(a) ?? [];
    arr.push({ to: b, len });
    adj.set(a, arr);
  };
  for (const s of segments) {
    const a = String(s?.from ?? ''), b = String(s?.to ?? '');
    if (!a || !b || a === b) continue;
    if (!byId.has(a) || !byId.has(b)) continue;
    const len = segLengthXZ(s);
    if (!Number.isFinite(len) || len <= 0) continue;
    add(a, b, len);
    add(b, a, len);
  }

  const nearestNode = (x, z) => {
    let best = null, bd = Infinity;
    for (const [id, q] of byId) {
      const d = Math.hypot(q.x - x, q.z - z);
      if (d < bd) { bd = d; best = id; }
    }
    return { id: best, dist: bd };
  };
  const sN = nearestNode(Number(gp.spawn.x), Number(gp.spawn.z));
  const eN = nearestNode(Number(gp.exit.x), Number(gp.exit.z));
  if (!sN.id || !eN.id) return null;

  const dist = new Map([[sN.id, 0]]);
  const prev = new Map();
  const remaining = new Set(byId.keys());
  while (remaining.size) {
    let cur = null, bd = Infinity;
    for (const id of remaining) {
      const d = dist.get(id);
      if (d != null && d < bd) { bd = d; cur = id; }
    }
    if (cur == null) break;
    remaining.delete(cur);
    if (cur === eN.id) break;
    const cd = dist.get(cur) ?? Infinity;
    for (const { to, len } of adj.get(cur) || []) {
      if (!remaining.has(to)) continue;
      const nd = cd + len;
      if (dist.get(to) == null || nd < dist.get(to)) { dist.set(to, nd); prev.set(to, cur); }
    }
  }
  if (!dist.has(eN.id)) return null;

  const path = [];
  let cur = eN.id;
  path.push(cur);
  while (prev.has(cur)) { cur = prev.get(cur); path.push(cur); }
  path.reverse();
  const legs = [];
  for (let i = 1; i < path.length; i++) {
    const a = byId.get(path[i - 1]), b = byId.get(path[i]);
    if (!a || !b) continue;
    const legLen = Math.hypot(b.x - a.x, b.z - a.z);
    if (legLen <= 0) continue;
    legs.push([a, b, legLen]);
  }
  if (!legs.length) return null;
  return { legs };
}

/** §10.4: якоря «живой» смены — детерминированные точки вдоль маршрута каждые `spacingMeters`. */
function impressionAnchorsMetric(nodes, segments, gp, spacingMeters = 200) {
  const legsInfo = spawnExitLegs(nodes, segments, gp);
  const legs = legsInfo?.legs;
  if (!legs) return null;
  const spacing = Math.max(150, Math.min(300, Math.floor(Number(spacingMeters) || 200)));
  const anchors = [];
  let traveled = 0;
  let next = spacing;
  let total = 0;
  for (const [a, b, legLen] of legs) {
    total += legLen;
    while (next <= traveled + legLen) {
      const t = (next - traveled) / legLen;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      anchors.push({ d: round(next, 1), x: round(x, 1), z: round(z, 1) });
      next += spacing;
    }
    traveled += legLen;
  }
  return {
    method: 'spawn_exit_anchors_spacing',
    spacingMeters: spacing,
    anchors,
    anchorsCount: anchors.length,
    pathLength: round(total, 1),
  };
}

function impressionCadenceMetric(districts, nodes, segments, gp) {
  // R5.2 §10.4: «смена впечатлений каждые 150–300 м пути» — приближённая метрика.
  // Детерминированно: shortest path spawn→exit по графу дорог (Dijkstra), дискретизация
  // каждые 25 м, наблюдение смены типа района. Ритм — чисто исследовательская метрика,
  // не требование инварианта; целевые 150–300 м фиксируются, ок=false допустимо.
  const legsInfo = spawnExitLegs(nodes, segments, gp);
  const legs = legsInfo?.legs;
  if (!legs) return null;

  const sampleStep = 25;
  const signatureOf = (x, z) => {
    const dT = districtTypeAt(districts, x, z);
    const rC = nearestRoadClassAt(x, z, segments);
    return dT + '|' + rC;
  };
  let traveled = 0;
  const firstPos = { x: legs[0][0].x, z: legs[0][0].z };
  let prevType = signatureOf(firstPos.x, firstPos.z);
  let changes = 0;
  let lastChangeAt = 0;
  let minGap = null;
  let samples = 0;
  for (const [a, b, legLen] of legs) {
    for (let d = traveled + sampleStep; d <= traveled + legLen; d += sampleStep) {
      const t = (d - traveled) / legLen;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      samples += 1;
      const sig = signatureOf(x, z);
      if (sig !== prevType) {
        changes += 1;
        const gap = d - lastChangeAt;
        if (minGap == null || gap < minGap) minGap = gap;
        lastChangeAt = d;
        prevType = sig;
      }
    }
    traveled += legLen;
  }
  const total = traveled;
  const avg = changes > 0 ? round(total / (changes + 1), 1) : total;
  // §10.4: «смена впечатлений каждые 150–300 м» — теперь считаем впечатление как
  // (класс района + класс дороги). Pure-district-метрика не детектировала смену остаточного коридора.
  return {
    partial: true,
    method: 'spawn_exit_shortest_path_25m_district_roadclass',
    samples,
    changes,
    pathLength: round(total, 1),
    avgSpacingMeters: avg,
    minSpacingMeters: minGap == null ? null : round(minGap, 1),
    targetMin: 150,
    targetMax: 300,
    ok: avg >= 150 && avg <= 300,
  };
}

function nearestRoadGeometry(x, z, segments = []) {
  let best = Infinity, dirAngle = null;
  for (const s of segments) {
    const pts = Array.isArray(s?.path) ? s.path : [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      if (!a || !b) continue;
      const d = pointSegDistXZ(x, z, a[0], a[2], b[0], b[2]);
      if (d < best) { best = d; dirAngle = Math.atan2((b[2] ?? 0) - (a[2] ?? 0), (b[0] ?? 0) - (a[0] ?? 0)); }
    }
  }
  return { dist: Number.isFinite(best) ? best : null, dirAngle };
}

function nearestRoadNodePoint(nodes, x, z) {
  let best = null, bd = Infinity;
  for (const n of nodes) {
    const p = Array.isArray(n?.position) ? n.position : (n?.x != null && n?.z != null ? [n.x, 0, n.z] : null);
    if (!p) continue;
    const px = Number(p[0]), pz = Number(p[2] ?? p[1]);
    if (!Number.isFinite(px) || !Number.isFinite(pz)) continue;
    const d = Math.hypot(px - x, pz - z);
    if (d < bd) { bd = d; best = { id: String(n?.id ?? ''), x: px, z: pz, dist: d }; }
  }
  return best;
}

function findRoadRoute(nodes, segments, from, to) {
  // Детерминированная Dijkstra по дорожному графу; читаем как есть (без мутаций IR).
  const byId = new Map();
  for (const n of nodes) {
    const p = Array.isArray(n?.position) ? n.position : (n?.x != null && n?.z != null ? [n.x, 0, n.z] : null);
    if (!p) continue;
    const px = Number(p[0]), pz = Number(p[2] ?? p[1]);
    if (!Number.isFinite(px) || !Number.isFinite(pz)) continue;
    byId.set(String(n?.id ?? ''), { x: px, z: pz });
  }
  if (!byId.has(from.id) || !byId.has(to.id)) return null;
  const adj = new Map();
  const addE = (a, b, len) => { const arr = adj.get(a) ?? []; arr.push({ to: b, len }); adj.set(a, arr); };
  for (const s of segments) {
    const a = String(s?.from ?? ''), b = String(s?.to ?? '');
    if (!a || !b || a === b) continue;
    if (!byId.has(a) || !byId.has(b)) continue;
    const len = segLengthXZ(s);
    if (!Number.isFinite(len) || len <= 0) continue;
    addE(a, b, len);
    addE(b, a, len);
  }
  const dist = new Map([[from.id, 0]]);
  const prev = new Map();
  const remaining = new Set(byId.keys());
  while (remaining.size) {
    let cur = null, bd = Infinity;
    for (const id of remaining) { const d = dist.get(id); if (d != null && d < bd) { bd = d; cur = id; } }
    if (cur == null) break;
    remaining.delete(cur);
    if (cur === to.id) break;
    const cd = dist.get(cur) ?? Infinity;
    for (const { to: nb, len } of adj.get(cur) || []) {
      if (!remaining.has(nb)) continue;
      const nd = cd + len;
      if (dist.get(nb) == null || nd < dist.get(nb)) { dist.set(nb, nd); prev.set(nb, cur); }
    }
  }
  if (!dist.has(to.id)) return null;
  const path = [];
  let cur = to.id;
  path.push(cur);
  while (prev.has(cur)) { cur = prev.get(cur); path.push(cur); }
  path.reverse();
  const pts = path.map(id => byId.get(id)).filter(Boolean);
  return { pathLength: dist.get(to.id), pathNodeIds: path, pathPoints: pts };
}

function gameplayPlacementMetric(districts, nodes, segments, buildings, gp) {
  // R5.3 §10.5: read-only checks for exit-goal gameplay (spawn/exit, cars).
  // Enemies/alienEnemies placement éteht runtime (nav graph) — генератор не ставит врагов;
  // валидируем только статические поля gameplay и дорожную привязку.
  const out = {
    available: true,
    spawnDistrictType: null,
    exitDistrictType: null,
    straightMeters: null,
    routeMeters: null,
    routeRatio: null,
    districtsPassed: null,
    exitRadius: null,
    cars: { declared: null, spots: 0, onRoad: 0, misaligned: 0, nearJunction: 0 },
    enemies: { count: null, alienCount: null, available: false, note: 'runtime placement via nav graph; D-scaling/spawn-distance enforced by engine constraints (not implemented in generator)' },
  };
  const sx = Number(gp?.spawn?.x), sz = Number(gp?.spawn?.z);
  const ex = Number(gp?.exit?.x), ez = Number(gp?.exit?.z);
  if (Number.isFinite(sx) && Number.isFinite(sz)) out.spawnDistrictType = districtTypeAt(districts, sx, sz);
  if (Number.isFinite(ex) && Number.isFinite(ez)) out.exitDistrictType = districtTypeAt(districts, ex, ez);
  if (Number.isFinite(sx) && Number.isFinite(ex) && Number.isFinite(sz) && Number.isFinite(ez)) {
    out.straightMeters = round(Math.hypot(ex - sx, ez - sz), 1);
    out.exitRadius = Number.isFinite(Number(gp?.exitRadius)) ? Number(gp.exitRadius) : null;
    const sN = nearestRoadNodePoint(nodes, sx, sz);
    const eN = nearestRoadNodePoint(nodes, ex, ez);
    if (sN && eN) {
      const route = findRoadRoute(nodes, segments, sN, eN);
      if (route) {
        out.routeMeters = round(route.pathLength, 1);
        if (out.straightMeters > 0) out.routeRatio = round(route.pathLength / out.straightMeters, 3);
        // районы вдоль пути (уникальные типы по дискретизации 25 м)
        const seen = new Set();
        const pts = route.pathPoints;
        const step = 25;
        let count = 0;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          const legLen = Math.hypot(b.x - a.x, b.z - a.z);
          if (legLen <= 0) continue;
          for (let d = 0; d <= legLen; d += step) {
            const t = d / legLen;
            const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
            const dt = districtTypeAt(districts, x, z);
            const key = dt;
            if (!seen.has(key)) { seen.add(key); count += 1; }
          }
        }
        out.districtsPassed = seen.size;
      }
    }
  }
  const cars = gp?.cars ?? {};
  const spots = Array.isArray(cars?.spots) ? cars.spots : [];
  out.cars.declared = Number.isFinite(Number(cars?.count)) ? Number(cars.count) : null;
  out.cars.spots = spots.length;
  let onRoad = 0, misaligned = 0, nearJunction = 0;
  const DEG = Math.PI / 180;
  for (const sp of spots) {
    const x = Number(sp?.x), z = Number(sp?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const geo = nearestRoadGeometry(x, z, segments);
    if (geo.dist != null && geo.dist <= 8) onRoad += 1;
    if (geo.dist != null && geo.dist <= 30 && Number.isFinite(Number(sp?.yaw)) && Number.isFinite(geo.dirAngle)) {
      // vehicle.js: yaw в градусах; direction = (cos yaw, -sin yaw)
      const yaw = Number(sp.yaw) * DEG;
      const vx = Math.cos(yaw), vz = -Math.sin(yaw);
      let roadAng = geo.dirAngle;
      const rx = Math.cos(roadAng), rz = Math.sin(roadAng);
      let dot = Math.abs(vx * rx + vz * rz); // против направления тоже вдоль дороги
      dot = Math.max(-1, Math.min(1, dot));
      const ang = Math.acos(dot) / DEG;
      if (ang > 35) misaligned += 1;
    }
    const near = (nodes ?? []).some(n => {
      const p = Array.isArray(n?.position) ? n.position : null;
      if (!p) return false;
      const px = Number(p[0]), pz = Number(p[2] ?? p[1]);
      return Number.isFinite(px) && Math.hypot(px - x, pz - z) <= 15;
    });
    if (near) nearJunction += 1;
  }
  out.cars.onRoad = onRoad;
  out.cars.misaligned = misaligned;
  out.cars.nearJunction = nearJunction;
  if (Number.isFinite(Number(gp?.enemies?.count))) out.enemies.count = Number(gp.enemies.count);
  if (Number.isFinite(Number(gp?.alienEnemies?.count))) out.enemies.alienCount = Number(gp.alienEnemies.count);
  return out;
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

function rectArea(rect) {
  if (!rect) return null;
  const w = Number(rect.maxX) - Number(rect.minX);
  const h = Number(rect.maxZ) - Number(rect.minZ);
  if (!(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0)) return null;
  return w * h;
}

function districtAreaOf(d) {
  if (Number.isFinite(d?.area) && d.area > 0) return Number(d.area);
  const r = d?.geometry?.rect ?? (Number.isFinite(d?.geometry?.minX) ? d.geometry : null);
  const ra = rectArea(r);
  if (ra != null) return ra;
  if (Number.isFinite(d?.geometry?.width) && Number.isFinite(d?.geometry?.height)) {
    const a = d.geometry.width * d.geometry.height;
    return Number.isFinite(a) && a > 0 ? a : null;
  }
  return null;
}

function districtAreaShare(districts = [], groundSize = 0) {
  const plateArea = groundSize > 0 ? groundSize * groundSize : 0;
  const byType = Object.create(null);
  let known = 0;
  let parkArea = 0;
  for (const d of districts) {
    const t = String(d?.type || d?.profileId || 'unknown');
    const area = districtAreaOf(d);
    if (Number.isFinite(area) && area > 0) {
      byType[t] = (byType[t] || 0) + area;
      known += area;
      if (t === 'park' || t === 'forest') parkArea += area;
    }
  }
  const types = Object.keys(byType).sort();
  const shareByType = Object.create(null);
  const areaByType = Object.create(null);
  for (const t of types) {
    areaByType[t] = round(byType[t], 3);
    shareByType[t] = plateArea > 0 ? round(byType[t] / plateArea, 6) : null;
  }
  const parkShare = plateArea > 0 ? round(parkArea / plateArea, 6) : (known > 0 ? round(parkArea / known, 6) : null);
  return {
    plateArea: round(plateArea, 3),
    knownArea: round(known, 3),
    areaByType,
    shareByType,
    parkShare,
  };
}

function rankWithTies(values) {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v || a.i - b.i);
  const ranks = new Array(values.length);
  for (let i = 0; i < order.length;) {
    let j = i + 1;
    while (j < order.length && order[j].v === order[i].v) j++;
    const avgRank = (i + 1 + j) / 2; // 1-based average rank
    for (let k = i; k < j; k++) ranks[order[k].i] = avgRank;
    i = j;
  }
  return ranks;
}

function spearmanRho(xs, ys) {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  const rx = rankWithTies(xs);
  const ry = rankWithTies(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - mx;
    const dy = ry[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (!(dx2 > 0 && dy2 > 0)) return null;
  return round(num / Math.sqrt(dx2 * dy2), 6);
}

function blockDensityCorrelation(districts = []) {
  // R0.3/R3.6 metric (каркас): Spearman(D, 1/area) по районам, когда D и площадь доступны.
  const xs = [];
  const ys = [];
  for (const d of districts) {
    const pressure = Number(d?.pressure ?? d?.D ?? d?.metrics?.D);
    const area = districtAreaOf(d);
    if (!Number.isFinite(pressure) || !(area > 0)) continue;
    xs.push(pressure);
    ys.push(1 / area);
  }
  if (xs.length < 3) return { rho: null, n: xs.length, target: 0.6, ok: null, partial: true };
  const rho = spearmanRho(xs, ys);
  return { rho, n: xs.length, target: 0.6, ok: rho == null ? null : rho >= 0.6, partial: false };
}

function landmarkVisibilityMetric(ctx, terrainAnalysis) {
  // R5.2 §12.2/§10.4: приближённая проверка видимости ориентиров — детерминированный
  // 1-D raycast по аналитическому полю высот (mountain/valley smooth ease).
  // Обозреватели: отмеченные viewpoint-ориентиры (landmarks c kind==='viewpoint'),
  // пересечения и spawn/exit якоря геймплея (eye level 1.7 м).
  // Здания/растительность не учитываются — метрика partial, но уже не заглушка.
  const landmarks = Array.isArray(terrainAnalysis?.landmarks) ? terrainAnalysis.landmarks
    : (Array.isArray(ctx?.masks?.terrain?.landmarks) ? ctx.masks.terrain.landmarks : []);
  const crossings = Array.isArray(terrainAnalysis?.crossings) ? terrainAnalysis.crossings
    : (Array.isArray(ctx?.masks?.terrain?.crossings) ? ctx.masks.terrain.crossings : []);
  const cores = Array.isArray(terrainAnalysis?.cores) ? terrainAnalysis.cores
    : (Array.isArray(ctx?.terrain?.analysis?.cores) ? ctx.terrain.analysis.cores : []);
  const total = landmarks.length + crossings.length;

  const input = ctx?.input ?? {};
  const baseY = Number(input?.ground?.y ?? 0) || 0;
  const modifiers = ctx?.terrain?.modifiers ?? input?.cityforge?.terrain?.modifiers ?? [];
  const gp = input?.gameplay ?? {};

  const observers = [];
  const addObs = (id, x, z) => {
    const nx = Number(x), nz = Number(z);
    if (!Number.isFinite(nx) || !Number.isFinite(nz)) return;
    observers.push({ id: String(id), x: +nx.toFixed(3), z: +nz.toFixed(3), y: +(terrainHeightAt(nx, nz, baseY, modifiers) + 1.7).toFixed(3) });
  };
  let vo = 0;
  for (const lm of landmarks) {
    if (lm?.kind === 'viewpoint') { addObs('obs_' + (lm.id ?? ('v' + vo)), lm.x, lm.z); vo += 1; }
  }
  for (const cr of crossings) addObs('obs_crossing_' + (cr?.riverId ?? 'i'), cr?.x, cr?.z);
  if (gp?.spawn) addObs('obs_spawn', gp.spawn.x, gp.spawn.z);
  if (gp?.exit) addObs('obs_exit', gp.exit.x, gp.exit.z);

  const losClear = (a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    if (!(dist > 1e-6)) return false;
    const steps = Math.max(6, Math.min(32, Math.ceil(dist / 8)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = a.x + dx * t, z = a.z + dz * t;
      const yLine = a.y + (b.y - a.y) * t;
      const th = terrainHeightAt(x, z, baseY, modifiers);
      if (th >= yLine) return false; // рельеф закрывает луч
    }
    return true;
  };

  const targets = [];
  for (const lm of landmarks) targets.push({ id: lm?.id ?? 'lm', x: lm?.x, z: lm?.z, y: Number.isFinite(Number(lm?.elevation)) ? Number(lm.elevation) + 1.7 : undefined });
  for (const cr of crossings) targets.push({ id: 'cross_' + (cr?.riverId ?? 'i'), x: cr?.x, z: cr?.z });

  let visibleTargets = 0, visiblePairs = 0, totalPairs = 0;
  for (const tg of targets) {
    const tx = Number(tg.x), tz = Number(tg.z);
    if (!Number.isFinite(tx) || !Number.isFinite(tz)) continue;
    const ty = Number.isFinite(Number(tg.y)) ? Number(tg.y)
      : terrainHeightAt(tx, tz, baseY, modifiers) + 1.7;
    const tv = { x: tx, z: tz, y: ty };
    let seen = false;
    for (const obs of observers) {
      if (Math.hypot(obs.x - tx, obs.z - tz) < 1) continue;
      totalPairs += 1;
      if (losClear(obs, tv)) { visiblePairs += 1; seen = true; }
    }
    if (seen) visibleTargets += 1;
  }

  return {
    partial: true,
    method: 'terrain_los_sample',
    landmarks: landmarks.length,
    crossings: crossings.length,
    cores: cores.length,
    total,
    observers: observers.length,
    totalPairs,
    visiblePairs,
    visibleApprox: visibleTargets, // сколько ориентиров видно хотя бы из одной точки
    visibleFraction: totalPairs > 0 ? round(visiblePairs / totalPairs, 6) : null,
    visibleTargets,
  };
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
  // R5.2 §10.4: приближённая метрика 'смена впечатлений каждые 150-300 м' - read-only (путь spawn/exit + смены типа района каждые 25 м).
  const impressionCadence = impressionCadenceMetric(districts, nodes, roads, gp);
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
  // R5.3 §10.5: read-only validation of gameplay placement (spawn/exit on suitable
  // roads/districts, cars along road & away from junctions). No IR mutation; diagnostics only.
  const gameplayPlace = gameplayPlacementMetric(districts, nodes, roads, buildings, gp);
  if (gameplayPlace.spawnDistrictType) {
    const okD = ['park','forest','residential','housing','suburb','campus','sports','old_town','historic','market','luxury'];
    if (!okD.includes(String(gameplayPlace.spawnDistrictType))) v('info', 'spawn_district_unusual', 'gameplay.spawn is not in a typical calm residential district', { districtType: gameplayPlace.spawnDistrictType });
  }
  if (gameplayPlace.cars.spots > 0) {
    if (gameplayPlace.cars.onRoad < gameplayPlace.cars.spots) v('warn', 'cars_spot_off_road', 'cars.spots must be near road network (<=8m)', { spots: gameplayPlace.cars.spots, onRoad: gameplayPlace.cars.onRoad });
    if (gameplayPlace.cars.misaligned > 0) v('warn', 'cars_spot_misaligned', 'cars.spots yaw should align along the road (<=35deg)', { misaligned: gameplayPlace.cars.misaligned });
    if (gameplayPlace.cars.nearJunction > 0) v('warn', 'cars_spot_near_junction', 'cars.spots must be >=15m from junctions', { nearJunction: gameplayPlace.cars.nearJunction });
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

  // R1.2: генератор читает физические константы рельефа движка (src/config.js#jsonMap.relief),
  // а не только policy-дефолты §13.2: hillMaxSlope — предел уклона ОДНОЙ капсулы брифа,
  // maxSlope — предел градиента самого поля. На committed-главах значения заведомо
  // превышаются локальными холмами (они легальны), поэтому это advisory, не §12.1 error.
  {
    const tSlope = ctx?.terrain?.analysis?.slope ?? null;
    const reliefCfg = CONFIG?.jsonMap?.relief ?? CONFIG?.relief ?? null;
    const ceilHill = Number(reliefCfg?.hillMaxSlope ?? 0.06);
    const ceilField = Number(reliefCfg?.maxSlope ?? 0.12);
    if (tSlope && Number.isFinite(Number(tSlope.maxSlope))) {
      const over = round(Number(tSlope.maxSlope) - ceilField, 6);
      if (over > 0) {
        v('warn', 'relief_ceiling_advisory', 'terrain analysis maxSlope exceeds engine field capability (CONFIG.jsonMap.relief.maxSlope / CONFIG.relief.maxSlope) — advisory only (hills legal); autoring cap for a single capsule is relief.hillMaxSlope', { maxSlope: round(Number(tSlope.maxSlope), 6), engineMaxSlope: ceilField, hillCapsuleCap: ceilHill, excess: over });
      }
    }
  }

  const enterable = buildings.filter(b => b?.isEnterable === true).length;
  const enterableShare = buildings.length > 0 ? round(enterable / buildings.length, 6) : null;
  const roadShares = roadClassShares(roads);
  const districtShare = districtAreaShare(districts, groundSize);
  const blockDensityCorr = blockDensityCorrelation(districts);
  const terrainAnalysisForMetrics = ctx?.terrain?.analysis ?? null;
  const landmarkVisibility = landmarkVisibilityMetric(ctx, terrainAnalysisForMetrics);
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

  // §12.2 subset metrics (deterministic snapshot). R0.3 scaffold/coverage: γ, road class shares,
  // dead-end share, park share (by district area), enterable-share, landmark visibility (stub),
  // chunk build time (scaffold), D vs 1/area correlation (when available). Marked partial.
  const metrics = {
    version: 2,
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
      spawnDistrictType: gameplayPlace.spawnDistrictType,
      exitDistrictType: gameplayPlace.exitDistrictType,
      straightMeters: gameplayPlace.straightMeters,
      routeMeters: gameplayPlace.routeMeters,
      routeRatio: gameplayPlace.routeRatio,
      districtsPassed: gameplayPlace.districtsPassed,
      exitRadius: gameplayPlace.exitRadius,
      cars: gameplayPlace.cars,
      enemies: gameplayPlace.enemies,
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
    reliefCeiling: (CONFIG?.jsonMap?.relief ?? CONFIG?.relief) && typeof (CONFIG?.jsonMap?.relief ?? CONFIG?.relief) === 'object' ? (() => {
      const reliefCfg = CONFIG?.jsonMap?.relief ?? CONFIG.relief;
      return {
        engineHillMaxSlope: Number(reliefCfg.hillMaxSlope ?? 0.06),
        engineMaxSlope: Number(reliefCfg.maxSlope ?? 0.12),
        terrainMaxSlope: terrainAnalysis?.slope ? round(terrainAnalysis.slope.maxSlope, 6) : null,
        overEngineCapExceeds: !!(terrainAnalysis?.slope && Number(terrainAnalysis.slope.maxSlope) > Number(reliefCfg.maxSlope ?? 0.12)),
      };
    })() : null,
    landmarkVisibility,
    impressionCadence,
    impressionAnchors: impressionAnchorsMetric(nodes, roads, gp, 200),
    falseDeadEnds: {
      // R5.2 §10.4: false dead-ends must be ≤10% of dead-ends. None are emitted by the
      // generator design (turnarounds are reward endpoints, not fake-passes); audit-only
      // scaffold until false-pass semantics (lit reveal/choke) are implemented.
      count: 0, share: 0, deadEndRatio: null, target: 0.1, ok: true, partial: true,
      note: 'no false dead-ends emitted by design; metric scaffold until false-pass semantics are implemented',
    },
    blockDensityCorrelation: blockDensityCorr,
    chunkBuild: { partial: true, buildTimeMs: null },
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
