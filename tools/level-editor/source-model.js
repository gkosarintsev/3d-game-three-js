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
    // Если элементов не осталось, дорога не может собраться: path без elements
    // обязан быть осевым, а диагональный двухкликовый сегмент таким не является.
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
      const skew = p.length >= 2 && a && b && Math.abs(a[0] - b[0]) > AXIS_EPS_V && Math.abs(a[2] - b[2]) > AXIS_EPS_V;
      issues.push({ severity: 'error', code: skew ? 'segment.skew-empty' : 'segment.empty', message: `${id}: после удаления элементов дорога осталась без geometry/elements${skew ? ' и её path косой (требуется элемент или осевой path)' : ''}`, ref: `segment:${id}` });
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
