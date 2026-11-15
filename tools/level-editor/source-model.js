/** Редактор уровней: черновик CityForge source-JSON (`level-NN.json`). */

export const ROAD_LAYERS = ['ground', 'embankment', 'bridge_01', 'bridge_02', 'bridge_03', 'bridge_04', 'bridge_05', 'skybridge', 'underground'];
export const ROAD_TYPES = ['ground', 'local', 'highway', 'ramp', 'bridge', 'embankment', 'skybridge'];
const AXIS_EPS_V = 1e-9;
export const MIN_SEGMENT_LENGTH = 1;

export function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

export function ensureRoads(draft) {
  draft.cityforge = draft.cityforge || {};
  draft.cityforge.networks = draft.cityforge.networks || {};
  draft.cityforge.networks.roads = draft.cityforge.networks.roads || { nodes: [], segments: [], junctions: [] };
  const roads = draft.cityforge.networks.roads;
  roads.nodes = Array.isArray(roads.nodes) ? roads.nodes : [];
  roads.segments = Array.isArray(roads.segments) ? roads.segments : [];
  roads.junctions = Array.isArray(roads.junctions) ? roads.junctions : [];
  return roads;
}

export function pointInBounds(draft, x, z) {
  const g = draft?.ground || {};
  const size = Number.isFinite(g.size) ? g.size : 2560;
  const min = -size / 2, max = size / 2;
  return x >= min && x <= max && z >= min && z <= max;
}

export function readNetwork(draft) {
  const roads = ensureRoads(draft);
  return {
    nodes: roads.nodes.map(n => ({ node: n, id: String(n.id), position: Array.isArray(n.position) ? n.position : [0, 0, 0], layer: n.layer || 'ground' })),
    segments: roads.segments.map((s, segmentIndex) => ({
      segment: s,
      segmentIndex,
      id: String(s.id ?? `segment_${segmentIndex}`),
      from: s.from ?? null,
      to: s.to ?? null,
      layer: s.layer || 'ground',
      type: s.type || 'local',
      elements: (s.elements || []).map((el, elementIndex) => ({ el, elementIndex, kind: el?.plate ? 'plate' : el?.arc ? 'arc' : 'unknown', data: el?.plate || el?.arc || null })),
    })),
  };
}

export function findNode(draft, id) {
  return ensureRoads(draft).nodes.find(n => String(n?.id) === String(id)) || null;
}
export function findSegment(draft, id) {
  return ensureRoads(draft).segments.find(s => String(s?.id) === String(id)) || null;
}
export function findSegmentIndex(draft, id) {
  return ensureRoads(draft).segments.findIndex(s => String(s?.id) === String(id));
}
export function findElement(draft, segId, elementIndex) {
  const s = findSegment(draft, segId);
  return s?.elements?.[elementIndex] || null;
}

export function nodePos(n) {
  const p = Array.isArray(n?.position) ? n.position : [0, 0, 0];
  return { x: Number(p[0]) || 0, y: Number(p[1]) || 0, z: Number(p[2]) || 0 };
}

export function uniqueId(base, taken) {
  const set = new Set([...taken].map(String));
  if (!set.has(base)) return base;
  for (let i = 2; ; i++) { const cand = `${base}_${i}`; if (!set.has(cand)) return cand; }
}

export function createNodeId(draft, x, z) {
  const roads = ensureRoads(draft);
  const taken = roads.nodes.map(n => n.id);
  const prefix = `n_${Math.round(x)}_${Math.round(z)}`.replace(/-/g, 'm');
  return uniqueId(prefix, taken);
}

export function createSegmentId(draft, prefix = 'seg_') {
  const roads = ensureRoads(draft);
  const taken = roads.segments.map(s => s.id);
  let i = roads.segments.length + 1;
  while (taken.includes(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

/** yaw: 0 = +X, 90 = +Z (как в source-данных). */
export function yawFrom(ax, az, bx, bz) { return Math.round(((Math.atan2(bz - az, bx - ax) * 180) / Math.PI) * 1000) / 1000; }
export function lenXZ(ax, az, bx, bz) { return Math.hypot(bx - ax, bz - az); }

export function makePlateElement(ax, ay, az, bx, by, bz, opts = {}) {
  const length = Math.max(0.1, lenXZ(ax, az, bx, bz));
  const dx = bx - ax, dz = bz - az;
  return {
    plate: {
      rails: opts.rails ?? true,
      x: r3((ax + bx) / 2), z: r3((az + bz) / 2), yaw: yawFrom(ax, az, bx, bz),
      length: r3(length), width: r3(opts.width ?? 20), y: r3(ay), rise: r3(by - ay),
      ...(opts.taper ? { widthEnd: r3(opts.widthEnd ?? opts.width ?? 20), crossStart: r3(opts.crossStart ?? 0), crossEnd: r3(opts.crossEnd ?? 0) } : {}),
    },
  };
}

export function makeArcElement(ax, ay, az, bx, by, bz, opts = {}) {
  // Дуга с заданным радиусом: центр выбирается по стороне (left/right).
  const chord = lenXZ(ax, az, bx, bz);
  const R = Math.max(opts.radius ?? Math.max(10, chord / Math.SQRT2), 2);
  const side = opts.side === 'right' ? -1 : 1;
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const px = -(bz - az), pz = bx - ax;
  const pl = Math.hypot(px, pz) || 1;
  // расстояние от середины до центра для 90° дуги по этой хорде
  const off = Math.sqrt(Math.max(0, R * R - (chord / 2) * (chord / 2)));
  const cx = r3(mx + (px / pl) * off * side), cz = r3(mz + (pz / pl) * off * side);
  const from = Math.round(((Math.atan2(az - cz, ax - cx) * 180) / Math.PI) * 1000) / 1000;
  // цель: дуга идёт от угла `from` в сторону поворота; знак вычислим через сторону
  const signed = (opts.side === 'right' ? -1 : 1) * 90;
  const to = Math.round((from + signed) * 1000) / 1000;
  return { arc: { cx, cz, radius: r3(R), from, to, width: r3(opts.width ?? 10), y: [r3(ay), r3(by)], bank: opts.bank ?? 0, rails: opts.rails ?? true } };
}

export function addSegment(draft, ax, ay, az, bx, by, bz, preset = 'ground') {
  const roads = ensureRoads(draft);
  if (lenXZ(ax, az, bx, bz) < MIN_SEGMENT_LENGTH) return null;
  const baseA = `n_${String(Math.round(ax)).replace('-', 'm')}_${String(Math.round(az)).replace('-', 'm')}`;
  const baseB = `n_${String(Math.round(bx)).replace('-', 'm')}_${String(Math.round(bz)).replace('-', 'm')}`;
  const taken = () => roads.nodes.map(n => String(n.id));
  const aId = uniqueId(baseA, taken()), bId = uniqueId(baseB, taken());
  const aNode = { id: aId, position: [r3(ax), r3(ay), r3(az)], layer: presetLayer(preset) };
  const bNode = { id: bId, position: [r3(bx), r3(by), r3(bz)], layer: presetLayer(preset) };
  roads.nodes.push(aNode, bNode);
  const seg = {
    id: createSegmentId(draft, presetToPrefix(preset)),
    from: aId, to: bId,
    type: preset === 'ramp' ? 'ramp' : 'highway',
    layer: presetLayer(preset),
    path: [[r3(ax), r3(ay), r3(az)], [r3(bx), r3(by), r3(bz)]],
    elements: [],
    lanes: [],
  };
  if (preset === 'arc-left') seg.elements.push(makeArcElement(ax, ay, az, bx, by, bz, { side: 'left', radius: lenXZ(ax, az, bx, bz), width: 10 }));
  else if (preset === 'arc-right') seg.elements.push(makeArcElement(ax, ay, az, bx, by, bz, { side: 'right', radius: lenXZ(ax, az, bx, bz), width: 10 }));
  else if (preset === 'taper') seg.elements.push(makePlateElement(ax, ay, az, bx, by, bz, { width: 20, taper: true, widthEnd: 30, crossStart: 0, crossEnd: 5, rails: true }));
  else if (preset === 'bridge') seg.elements.push(makePlateElement(ax, ay, az, bx, by, bz, { width: 20, rails: true, y: Math.max(ay, by) === 0 ? 14 : Math.max(ay, by), rise: by - ay }));
  else if (preset === 'ramp') seg.elements.push(makePlateElement(ax, ay, az, bx, by, bz, { width: 20, rails: true }));
  else seg.elements.push(makePlateElement(ax, ay, az, bx, by, bz, { width: 20, rails: true }));
  roads.segments.push(seg);
  return seg;
}

function optsNodeId(x, z) { const a = Math.round(x), b = Math.round(z); return `n_${String(a).replace('-', 'm')}_${String(b).replace('-', 'm')}`; }
function presetToPrefix(p) { return p === 'bridge' ? 'bridge_' : p === 'ramp' ? 'ramp_' : p.startsWith('arc') ? 'ramp_' : p === 'taper' ? 'taper_' : 'road_'; }
function presetLayer(p) { return p === 'bridge' || p === 'ramp' || p.startsWith('arc') || p === 'taper' ? 'bridge_01' : 'ground'; }

export function makeGroundPathSegment(draft, ax, ay, az, bx, by, bz, opts = {}) {
  const roads = ensureRoads(draft);
  if (lenXZ(ax, az, bx, bz) < MIN_SEGMENT_LENGTH) return null;
  const baseA = `n_${String(Math.round(ax)).replace('-', 'm')}_${String(Math.round(az)).replace('-', 'm')}`;
  const baseB = `n_${String(Math.round(bx)).replace('-', 'm')}_${String(Math.round(bz)).replace('-', 'm')}`;
  const taken = () => roads.nodes.map(n => String(n.id));
  const aId = uniqueId(baseA, taken()), bId = uniqueId(baseB, taken());
  const width = Number.isFinite(opts.width) ? opts.width : 8;
  const type = opts.type || 'local';
  const layer = opts.layer || 'ground';
  const id = createSegmentId(draft, 'road_');
  roads.nodes.push({ id: aId, position: [r3(ax), r3(ay), r3(az)], layer });
  roads.nodes.push({ id: bId, position: [r3(bx), r3(by), r3(bz)], layer });
  const seg = {
    id,
    from: aId,
    to: bId,
    type,
    layer,
    path: [[r3(ax), r3(ay), r3(az)], [r3(bx), r3(by), r3(bz)]],
    elements: [],
    lanes: [{ id: `${id}_lane_1`, direction: 'forward', width: r3(width), type: 'vehicle' }],
  };
  roads.segments.push(seg);
  return seg;
}

export function duplicateSegment(draft, segId, dx = 10, dz = 0) {
  const roads = ensureRoads(draft);
  const source = findSegment(draft, segId);
  if (!source) return null;
  const copy = deepClone(source);
  copy.id = createSegmentId(draft, 'copy_');
  const mapNode = new Map();
  copy.path = (copy.path || []).map(([x, y, z]) => [r3(x + dx), y, r3(z + dz)]);
  const nodeMap = new Map();
  for (const endpoint of ['from', 'to']) {
    if (!copy[endpoint]) continue;
    const orig = findNode(draft, copy[endpoint]);
    const nid = createNodeId(draft, (copy.path?.[endpoint === 'from' ? 0 : copy.path.length - 1]?.[0] ?? dx), (copy.path?.[endpoint === 'from' ? 0 : copy.path.length - 1]?.[2] ?? dz));
    if (orig) roads.nodes.push({ id: nid, position: [r3(nodePos(orig).x + dx), nodePos(orig).y, r3(nodePos(orig).z + dz)], layer: orig.layer || 'ground' });
    nodeMap.set(copy[endpoint], nid); copy[endpoint] = nid;
  }
  for (const el of copy.elements || []) {
    const d = el.plate || el.arc; if (!d) continue;
    if (el.plate) { d.x = r3(d.x + dx); d.z = r3(d.z + dz); } else { d.cx = r3(d.cx + dx); d.cz = r3(d.cz + dz); }
  }
  roads.segments.push(copy);
  return copy;
}

export function deleteSelected(draft, sel) {
  const roads = ensureRoads(draft);
  if (!sel) return false;
  if (sel.kind === 'element') {
    const i = findSegmentIndex(draft, sel.segmentId);
    const seg = i >= 0 ? roads.segments[i] : null;
    if (!seg) return false;
    seg.elements = seg.elements || [];
    if (sel.elementIndex < 0 || sel.elementIndex >= seg.elements.length) return false;
    seg.elements.splice(sel.elementIndex, 1);
    // Если элементов не осталось, дорога может не собраться (вырожденный path без geometry).
    // Удаляем пустую дорогу целиком вместе с осиротевшими узлами.
    if (seg.elements.length === 0) {
      roads.segments.splice(i, 1);
      for (const nid of [seg.from, seg.to]) {
        if (!nid) continue;
        const used = roads.segments.some(s => String(s.from) === String(nid) || String(s.to) === String(nid));
        if (!used) {
          const ni = roads.nodes.findIndex(n => String(n.id) === String(nid));
          if (ni >= 0) roads.nodes.splice(ni, 1);
        }
      }
    }
    return true;
  }
  if (sel.kind === 'segment') {
    const i = findSegmentIndex(draft, sel.segmentId);
    if (i < 0) return false;
    const seg = roads.segments[i]; roads.segments.splice(i, 1);
    // Узел остаётся, если он нужен другому сегменту/порту спавна/выхода
    for (const nid of [seg.from, seg.to]) {
      if (!nid) continue;
      const used = roads.segments.some(s => s.from === nid || s.to === nid); if (!used) {
        const ni = roads.nodes.findIndex(n => String(n.id) === String(nid));
        if (ni >= 0) roads.nodes.splice(ni, 1);
      }
    }
    return true;
  }
  if (sel.kind === 'node') {
    const i = roads.nodes.findIndex(n => String(n.id) === String(sel.id)); if (i < 0) return false;
    roads.nodes.splice(i, 1);
    roads.segments = roads.segments.filter(s => String(s.from) !== String(sel.id) && String(s.to) !== String(sel.id));
    return true;
  }
  return false;
}

export function moveSelection(draft, sel, dx, dz) {
  const roads = ensureRoads(draft);
  const apply = (d) => {
    if (!d) return;
    if (d.x !== undefined) { d.x = r3(d.x + dx); d.z = r3(d.z + dz); }
    if (d.cx !== undefined) { d.cx = r3(d.cx + dx); d.cz = r3(d.cz + dz); }
  };
  if (!sel) return false;
  if (sel.kind === 'node') {
    const n = findNode(draft, sel.id); if (!n) return false;
    const p = nodePos(n); n.position = [r3(p.x + dx), p.y, r3(p.z + dz)];
    // path endpoints connected to this node move with it
    for (const s of roads.segments) {
      const path = s.path || [];
      if (String(s.from) === String(n.id) && path[0]) path[0] = [r3(path[0][0] + dx), path[0][1], r3(path[0][2] + dz)];
      if (String(s.to) === String(n.id) && path.length) { const last = path[path.length - 1]; last[0] = r3(last[0] + dx); last[2] = r3(last[2] + dz); }
      // single plate follows midpoint/length/yaw
      if (path.length === 2) {
        const [a, b] = path;
        if (String(s.from) === String(n.id) || String(s.to) === String(n.id)) {
          const el = (s.elements || [])[0]?.plate;
          if (el) {
            const p0 = nodePos(findNode(draft, s.from) || { position: a });
            const p1 = nodePos(findNode(draft, s.to) || { position: b });
            el.x = r3((p0.x + p1.x) / 2); el.z = r3((p0.z + p1.z) / 2); el.yaw = yawFrom(p0.x, p0.z, p1.x, p1.z); el.length = r3(lenXZ(p0.x, p0.z, p1.x, p1.z)); el.rise = r3(p1.y - p0.y); el.y = r3(Math.max(p0.y, p1.y));
          }
        }
      }
    }
    return true;
  }
  if (sel.kind === 'segment') {
    for (const s of (sel.elementIndex == null ? roads.segments.filter(s => String(s.id) === String(sel.segmentId)) : [])) {
      s.path = (s.path || []).map(([x, y, z]) => [r3(x + dx), y, r3(z + dz)]);
      for (const el of s.elements || []) apply(el.plate || el.arc);
      for (const endpoint of ['from', 'to']) {
        const n = findNode(draft, s[endpoint]); if (!n) continue;
        const p = nodePos(n); n.position = [r3(p.x + dx), p.y, r3(p.z + dz)];
      }
    }
    return true;
  }
  if (sel.kind === 'element') {
    const el = findElement(draft, sel.segmentId, sel.elementIndex); if (!el) return false;
    apply(el.plate || el.arc);
    return true;
  }
  return false;
}

export function elementEndpoints(d) {
  const length = Math.max(0.1, d.length || 1);
  const yaw = (isNumT(d.yaw) ? d.yaw : 0) * Math.PI / 180;
  const ux = Math.cos(yaw), uz = Math.sin(yaw);
  const y0 = isNumT(d.y) ? d.y : 0, y1 = y0 + (isNumT(d.rise) ? d.rise : 0);
  return [
    { x: r3(d.x - ux * length / 2), z: r3(d.z - uz * length / 2), y: r3(y0) },
    { x: r3(d.x + ux * length / 2), z: r3(d.z + uz * length / 2), y: r3(y1) },
  ];
}
export function arcEndpoints(d) {
  const from = (isNumT(d.from) ? d.from : 0) * Math.PI / 180, to = (isNumT(d.to) ? d.to : from + Math.PI / 2) * Math.PI / 180;
  const y = Array.isArray(d.y) ? d.y.map(Number) : [Number(d.y) || 0, Number(d.y) || 0];
  const R = isNumT(d.radius) ? d.radius : 10;
  const pt = (angY, ang) => ({ x: r3(d.cx + Math.cos(ang) * R), z: r3(d.cz + Math.sin(ang) * R), y: r3(angY) });
  return [pt(y[0], from), pt(y[1], to)];
}
export function moveElementEnd(draft, sel, x, z) {
  const el = findElement(draft, sel.segmentId, sel.elementIndex); if (!el) return false;
  const end = Number(sel.end) || 0;
  if (el.plate) {
    const d = el.plate; const eps = elementEndpoints(d);
    const a = eps[0], b = eps[1];
    if (end === 0) a.x = r3(x), a.z = r3(z); else b.x = r3(x), b.z = r3(z);
    d.x = r3((a.x + b.x) / 2); d.z = r3((a.z + b.z) / 2); d.yaw = yawFrom(a.x, a.z, b.x, b.z); d.length = r3(lenXZ(a.x, a.z, b.x, b.z)); d.y = r3(a.y); d.rise = r3(b.y - a.y);
    return true;
  }
  if (el.arc) {
    const d = el.arc; const dx = x - d.cx, dz = z - d.cz; const dist = Math.hypot(dx, dz);
    if (dist >= 2) d.radius = r3(dist);
    const ang = r3((Math.atan2(dz, dx) * 180) / Math.PI);
    if (end === 0) d.from = ang; else d.to = ang;
    return true;
  }
  return false;
}
function isNumT(v) { return typeof v === 'number' && Number.isFinite(v); }

function findNearEndpointId(draft, a, b, tol = 1.5) {
  const aPts = a.path?.length >= 2 ? [a.path[0], a.path[a.path.length - 1]] : null;
  const bPts = b.path?.length >= 2 ? [b.path[0], b.path[b.path.length - 1]] : null;
  const nodePt = (id) => {
    const p = findNode(draft, id)?.position;
    return Array.isArray(p) ? p : [0, 0, 0];
  };
  const pa = aPts ?? [nodePt(a.from), nodePt(a.to)];
  const pb = bPts ?? [nodePt(b.from), nodePt(b.to)];
  let best = null;
  for (let i = 0; i < 2; i++) {
    const ap = pa[i]; const aNodeId = i === 0 ? a.from : a.to;
    for (let j = 0; j < 2; j++) {
      const bp = pb[j]; const bNodeId = j === 0 ? b.from : b.to;
      const dy = (ap[1] - bp[1]) * 2; // y весим строже: разные ярусы не склеиваем
      const d = Math.hypot(ap[0] - bp[0], dy, ap[2] - bp[2]);
      if (d <= tol && (!best || d < best.d)) best = { aIndex: i, bIndex: j, aNodeId: String(aNodeId), bNodeId: String(bNodeId), d };
    }
  }
  return best;
}
function isStraightPath(path) {
  if (!Array.isArray(path) || path.length < 2) return false;
  for (let i = 2; i < path.length; i++) {
    const a = path[0], b = path[1], p = path[i];
    const cross = (b[0] - a[0]) * (p[2] - b[2]) - (b[2] - a[2]) * (p[0] - b[0]);
    if (Math.abs(cross) > 1e-6) return false;
  }
  return true;
}
function plateEnd(d, which) { // which: 'start' | 'end'
  const len = Math.max(0.1, d.length || 1);
  const yaw = (isNumT(d.yaw) ? d.yaw : 0) * Math.PI / 180;
  const ux = Math.cos(yaw), uz = Math.sin(yaw);
  const s = which === 'start' ? -0.5 : 0.5;
  const y = r3((d.y ?? 0) + (which === 'start' ? 0 : (d.rise ?? 0)));
  return { x: r3(d.x + ux * len * s), z: r3(d.z + uz * len * s), y };
}
function reverseSegment(seg) {
  if (!seg) return false;
  for (const el of seg.elements || []) if (!el.plate) return false;
  const oldFrom = seg.from;
  const oldTo = seg.to;
  seg.from = oldTo;
  seg.to = oldFrom;
  seg.path = [...(seg.path || [])].reverse();
  seg.elements = [...(seg.elements || [])].reverse().map(el => {
    const d = el.plate;
    const yaw = r3(wrapDeg180((d.yaw ?? 0) + 180));
    const width0 = d.widthEnd, width1 = d.width;
    const cross0 = d.crossEnd, cross1 = d.crossStart;
    const out = {
      plate: {
        ...d,
        yaw,
        y: r3((d.y ?? 0) + (d.rise ?? 0)),
        rise: r3(-(d.rise ?? 0)),
      },
    };
    if (width0 !== undefined) {
      out.plate.width = width0;
      out.plate.widthEnd = width1;
      out.plate.crossStart = r3(-(cross0 ?? 0));
      out.plate.crossEnd = r3(-(cross1 ?? 0));
    }
    return out;
  });
  return true;
}
function wrapDeg180(a) { let x = Number(a) || 0; while (x > 180) x -= 360; while (x < -180) x += 360; return x; }
function sweepAngle(a0, a1, sign) {
  let d = a1 - a0;
  if (sign >= 0) { while (d <= 0) d += 360; while (d > 360) d -= 360; }
  else { while (d >= 0) d -= 360; while (d < -360) d += 360; }
  return d;
}
const MIN_PLATE_KEEP = 0.5;
export function syncSegmentToElements(draft, seg) {
  const els = seg?.elements ?? [];
  if (!els.length) return false;
  const first = els[0], last = els[els.length - 1];
  const start = first.plate ? elementEndpoints(first.plate)[0] : first.arc ? arcEndpoints(first.arc)[0] : null;
  const end = last.plate ? elementEndpoints(last.plate)[1] : last.arc ? arcEndpoints(last.arc)[1] : null;
  if (!start || !end) return false;
  seg.path = [[r3(start.x), r3(start.y), r3(start.z)], [r3(end.x), r3(end.y), r3(end.z)]];
  const nodes = ensureRoads(draft).nodes;
  for (const [key, p] of [['from', start], ['to', end]]) {
    const n = nodes.find(n => String(n.id) === String(seg[key]));
    if (n) n.position = [r3(p.x), r3(p.y), r3(p.z)];
  }
  return true;
}

export function filletJoint(draft, firstId, secondId, radius = 15) {
  const roads = ensureRoads(draft);
  const first = findSegment(draft, firstId), second = findSegment(draft, secondId);
  if (!first || !second) return { ok: false, message: 'оба сегмента должны существовать' };
  if (String(first.id) === String(second.id)) return { ok: false, message: 'выбран один и тот же сегмент дважды' };
  // path/nodes могли разойтись с геометрией элементов: сначала чинить выбранные дороги
  syncSegmentToElements(draft, first);
  syncSegmentToElements(draft, second);
  const a = first, b = second;
  let shared = [String(a.from), String(a.to)].find(id => id === String(b.from) || id === String(b.to));
  if (!shared) {
    // если конечные точки совпали по координатам, но это разные узлы — склеиваем их в один
    const near = findNearEndpointId(draft, a, b, 1.5);
    if (near) {
      const keepId = near.aNodeId, dropId = near.bNodeId;
      if (dropId !== keepId) {
        if (String(b.from) === dropId) b.from = keepId;
        if (String(b.to) === dropId) b.to = keepId;
        const stillUsed = roads.segments.some(s => s !== b && (String(s.from) === dropId || String(s.to) === dropId));
        if (!stillUsed) {
          const ni = roads.nodes.findIndex(n => String(n.id) === dropId);
          if (ni >= 0) roads.nodes.splice(ni, 1);
        }
        shared = keepId;
      }
    }
  }
  if (!shared) return { ok: false, message: 'у выбранных дорог нет общего узла стыка' };
  // Ориентируем первую дорогу «в узел», вторую — «из узла».
  if (String(a.to) !== String(shared)) {
    if (String(a.from) !== String(shared)) return { ok: false, message: 'первый сегмент не касается общего узла' };
    if (!reverseSegment(a)) return { ok: false, message: 'первый сегмент нельзя развернуть: скругление работает только с plate- или path-дорогами' };
  }
  if (String(b.from) !== String(shared)) {
    if (String(b.to) !== String(shared)) return { ok: false, message: 'второй сегмент не касается общего узла' };
    if (!reverseSegment(b)) return { ok: false, message: 'второй сегмент нельзя развернуть: скругление работает только с plate- или path-дорогами' };
  }
  if (!isStraightPath(a.path) || !isStraightPath(b.path)) {
    return { ok: false, message: 'скругление умеет работать только с прямой path-дорогой' };
  }
  if ((a.elements || []).some(el => !el.plate) || (b.elements || []).some(el => !el.plate)) {
    return { ok: false, message: 'пока поддерживаются только plate-элементы на стыке' };
  }
  const aPathOnly = (a.elements || []).length === 0;
  const bPathOnly = (b.elements || []).length === 0;
  const aPath = a.path, bPath = b.path;
  const aStart = aPath[0], aEnd = aPath[aPath.length - 1], bStart = bPath[0], bEnd = bPath[bPath.length - 1];
  const lenA = lenXZ(aStart[0], aStart[2], aEnd[0], aEnd[2]);
  const lenB = lenXZ(bStart[0], bStart[2], bEnd[0], bEnd[2]);
  if (lenA < 1e-6 || lenB < 1e-6) return { ok: false, message: 'один из сегментов вырожден' };
  const ux = (aEnd[0] - aStart[0]) / lenA, uz = (aEnd[2] - aStart[2]) / lenA;
  const vx = (bEnd[0] - bStart[0]) / lenB, vz = (bEnd[2] - bStart[2]) / lenB;
  const cross = ux * vz - uz * vx, dot = ux * vx + uz * vz;
  const turn = Math.atan2(cross, dot), absTurn = Math.abs(turn);
  if (absTurn < 0.01 || Math.abs(absTurn - Math.PI) < 0.01) {
    return { ok: false, message: 'угол стыка почти прямой или почти 180° — скругление не строится' };
  }
  const requested = Math.max(2, Number(radius) || 15);
  const tanHalf = Math.tan(absTurn / 2);
  // длина от вершины до точки касания вдоль каждого плеча
  const maxRadius = Math.min(lenA, lenB) / tanHalf - 0.1;
  if (!Number.isFinite(maxRadius) || maxRadius < 2) {
    return { ok: false, message: `недостаточно места на прямых для радиуса ${requested} м` };
  }
  const usedR = Math.min(requested, maxRadius);
  const clamped = usedR < requested - 1e-6;
  const t = usedR * tanHalf;
  const yA0 = aStart[1], yA1 = aEnd[1], yB0 = bStart[1], yB1 = bEnd[1];
  const yT1 = r3(yA1 - ((yA1 - yA0) / lenA) * t), yT2 = r3(yB0 + ((yB1 - yB0) / lenB) * t);
  const T1 = { x: r3(aEnd[0] - ux * t), y: yT1, z: r3(aEnd[2] - uz * t) };
  const T2 = { x: r3(bStart[0] + vx * t), y: yT2, z: r3(bStart[2] + vz * t) };
  const sgn = cross >= 0 ? 1 : -1;
  const nx = -uz * sgn, nz = ux * sgn;
  const cx = r3(T1.x + nx * usedR), cz = r3(T1.z + nz * usedR);
  const angleOf = (x, z) => Math.atan2(z - cz, x - cx) * 180 / Math.PI;
  const from = angleOf(T1.x, T1.z), to = angleOf(T2.x, T2.z);
  const sweep = sweepAngle(from, to, sgn);
  // новые узлы
  const t1Id = createNodeId(draft, T1.x, T1.z), t2Id = createNodeId(draft, T2.x, T2.z);
  roads.nodes.push({ id: t1Id, position: [r3(T1.x), r3(T1.y), r3(T1.z)], layer: 'ground' });
  roads.nodes.push({ id: t2Id, position: [r3(T2.x), r3(T2.y), r3(T2.z)], layer: 'ground' });
  // подрезаем первую дорогу до T1
  a.path = [[r3(aStart[0]), r3(aStart[1]), r3(aStart[2])], [r3(T1.x), r3(T1.y), r3(T1.z)]];
  a.to = t1Id;
  let widthA = 20, railsA = false;
  if (aPathOnly) {
    widthA = Number(a.lanes?.[0]?.width ?? a.width ?? 8) || 8;
    railsA = !!a.rails;
  } else {
    const lastA = [...(a.elements || [])].reverse().find(el => el.plate);
    const idxA = a.elements.indexOf(lastA);
    const oldA = a.elements[idxA].plate;
    const yawA = r3(oldA.yaw ?? 0);
    a.elements[idxA] = { plate: { ...oldA, x: r3((aStart[0] + T1.x) / 2), z: r3((aStart[2] + T1.z) / 2), yaw: yawA, length: r3(lenXZ(aStart[0], aStart[2], T1.x, T1.z)), y: r3(aStart[1]), rise: r3(yT1 - aStart[1]) } };
    widthA = Number(oldA.width) || 20; railsA = !!oldA.rails;
  }
  // подрезаем вторую дорогу от T2
  b.path = [[r3(T2.x), r3(T2.y), r3(T2.z)], [r3(bEnd[0]), r3(bEnd[1]), r3(bEnd[2])]];
  b.from = t2Id;
  let widthB = 20, railsB = false;
  if (bPathOnly) {
    widthB = Number(b.lanes?.[0]?.width ?? b.width ?? 8) || 8;
    railsB = !!b.rails;
  } else {
    const firstB = (b.elements || []).find(el => el.plate);
    const idxB = b.elements.indexOf(firstB);
    const oldB = b.elements[idxB].plate;
    const yawB = r3(oldB.yaw ?? 0);
    b.elements[idxB] = { plate: { ...oldB, x: r3((T2.x + bEnd[0]) / 2), z: r3((T2.z + bEnd[2]) / 2), yaw: yawB, length: r3(lenXZ(T2.x, T2.z, bEnd[0], bEnd[2])), y: r3(yT2), rise: r3(bEnd[1] - yT2) } };
    widthB = Number(oldB.width) || 20; railsB = !!oldB.rails;
  }
  // удаляем старый общий узел, если он больше никому не нужен
  const oldShared = String(shared);
  const used = roads.segments.some(s => String(s.from) === oldShared || String(s.to) === oldShared);
  if (!used) {
    const i = roads.nodes.findIndex(n => String(n.id) === oldShared);
    if (i >= 0) roads.nodes.splice(i, 1);
  }
  const width = r3(Math.min(widthA, widthB));
  const rails = !!railsA || !!railsB;
  const arcId = createSegmentId(draft, 'arc_');
  const layer = a.layer ?? b.layer ?? 'ground';
  const arcSeg = {
    id: arcId,
    from: t1Id,
    to: t2Id,
    type: (aPathOnly && bPathOnly) ? (a.type ?? b.type ?? 'local') : 'ramp',
    layer,
    path: [[r3(T1.x), r3(T1.y), r3(T1.z)], [r3(T2.x), r3(T2.y), r3(T2.z)]],
    elements: [],
    lanes: [],
  };
  if (aPathOnly && bPathOnly) {
    // Обычные path-дороги (в т.ч. по рельефу) нормализатор драпирует по точкам
    // пути; arc-элемент с явным y=[yT1,yT2] остался бы на авторских отметках и
    // на холме ушёл под землю. Поэтому скругление — полилиния, которую дрейп поднимет.
    // Более частая разбивка уменьшает клиновидные щели на внешней стороне
    // поворота (каждый хорд — отдельная пластина), при этом путь остаётся
    // драпируемым по рельефу при нормализации.
    const n = Math.max(6, Math.ceil(Math.abs(sweep) / 6));
    const arcPath = [];
    for (let i = 0; i <= n; i++) {
      const tA = i / n;
      const ang = (from + sweep * tA) * Math.PI / 180;
      const x = r3(cx + Math.cos(ang) * usedR);
      const z = r3(cz + Math.sin(ang) * usedR);
      const y = r3(yT1 + (yT2 - yT1) * tA);
      arcPath.push([x, y, z]);
    }
    arcSeg.path = arcPath;
    arcSeg.lanes = [{ id: `${arcId}_lane_1`, direction: 'forward', width, type: 'vehicle' }];
  } else {
    arcSeg.elements = [{ arc: { cx, cz, radius: r3(usedR), from: r3(from), to: r3(from + sweep), width, y: [r3(yT1), r3(yT2)], bank: 0, rails } }];
  }
  roads.segments.push(arcSeg);
  return { ok: true, message: `стык скруглён (R = ${r3(usedR)} м${clamped ? `, ограничено ${r3(usedR)} м` : ''})`, selectedId: arcId };
}

export function validateDraft(draft) {
  const issues = [];
  const roads = ensureRoads(draft);
  const plateSize = Number.isFinite(draft?.ground?.size) ? draft.ground.size : 2560;
  const within = (x, z) => Math.abs(x) <= plateSize / 2 + 1e-6 && Math.abs(z) <= plateSize / 2 + 1e-6;
  const nodeIds = new Set();
  for (const n of roads.nodes) {
    const id = String(n?.id ?? '');
    if (!id) { issues.push({ severity: 'error', code: 'node.id', message: 'узел без id', ref: null }); continue; }
    if (nodeIds.has(id)) issues.push({ severity: 'error', code: 'node.id.dup', message: `дублируется id узла ${id}`, ref: `node:${id}` });
    nodeIds.add(id);
    const p = nodePos(n);
    if (!within(p.x, p.z)) issues.push({ severity: 'warn', code: 'node.bounds', message: `узел ${id} вне плиты`, ref: `node:${id}` });
  }
  const segIds = new Set();
  for (const s of roads.segments) {
    const id = String(s?.id ?? '');
    if (!id) { issues.push({ severity: 'error', code: 'seg.id', message: 'сегмент без id', ref: null }); continue; }
    if (segIds.has(id)) issues.push({ severity: 'error', code: 'seg.id.dup', message: `дублируется id сегмента ${id}`, ref: `segment:${id}` });
    segIds.add(id);
    if (!nodeIds.has(String(s.from))) issues.push({ severity: 'error', code: 'seg.from', message: `${id}: from ${s.from} не существует`, ref: `segment:${id}` });
    if (!nodeIds.has(String(s.to))) issues.push({ severity: 'error', code: 'seg.to', message: `${id}: to ${s.to} не существует`, ref: `segment:${id}` });
    const layer = s.layer || 'ground';
    if (!ROAD_LAYERS.includes(layer)) issues.push({ severity: 'warn', code: 'seg.layer', message: `${id}: layer ${layer} не в списке известных`, ref: `segment:${id}` });
    const elements = s.elements || [];
    if (elements.length === 0) {
      const p = s.path || [];
      const a = p[0], b = p[p.length - 1];
      const axisOk = p.length >= 2 && p.every((pt, i, arr) => { if (!i) return true; const a = arr[i - 1]; return Math.hypot(pt[0] - a[0], pt[2] - a[2]) > AXIS_EPS_V; });
      if (!axisOk) {
        const skew = p.length >= 2 && a && b && Math.abs(a[0] - b[0]) > AXIS_EPS_V && Math.abs(a[2] - b[2]) > AXIS_EPS_V;
        issues.push({ severity: 'error', code: 'segment.empty', message: `${id}: после удаления элементов дорога осталась без geometry/elements${p.length >= 2 ? ' и её path нулевой/вырожденной' : ''}`, ref: `segment:${id}` });
      }
    }
    (s.elements || []).forEach((el, i) => {
      const label = `${id}[${i}]`;
      if (el?.plate) {
        const d = el.plate;
        if (!(d.width >= 2)) issues.push({ severity: 'error', code: 'plate.width', message: `${label}: width < 2`, ref: `element:${id}:${i}` });
        if (!(d.length >= 0.1)) issues.push({ severity: 'error', code: 'plate.length', message: `${label}: length нулевая`, ref: `element:${id}:${i}` });
        if (!within(d.x, d.z)) issues.push({ severity: 'warn', code: 'plate.bounds', message: `${label}: центр вне плиты`, ref: `element:${id}:${i}` });
      } else if (el?.arc) {
        const d = el.arc;
        if (!(d.radius >= 2)) issues.push({ severity: 'error', code: 'arc.radius', message: `${label}: radius < 2`, ref: `element:${id}:${i}` });
        if (!(d.width >= 2)) issues.push({ severity: 'error', code: 'arc.width', message: `${label}: width < 2`, ref: `element:${id}:${i}` });
        if (Math.abs(d.to - d.from) < 0.01) issues.push({ severity: 'error', code: 'arc.span', message: `${label}: span дуги нулевой`, ref: `element:${id}:${i}` });
      } else issues.push({ severity: 'error', code: 'el.kind', message: `${label}: неизвестный элемент`, ref: `element:${id}:${i}` });
    });
  }
  if (!draft?.gameplay?.spawn) issues.push({ severity: 'warn', code: 'spawn', message: 'нет gameplay.spawn', ref: null });
  if (!draft?.gameplay?.exit) issues.push({ severity: 'warn', code: 'exit', message: 'нет gameplay.exit', ref: null });
  return issues;
}

export function r3(v) { return Math.round(Number(v) * 1000) / 1000; }
