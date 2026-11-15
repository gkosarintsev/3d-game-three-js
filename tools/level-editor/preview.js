import * as THREE from 'three';
import { nodePos } from './source-model.js';

const LAYER_COLORS = {
  ground: 0x4aa3ff,
  embankment: 0x7bd88f,
  bridge_01: 0xb58cff,
  bridge_02: 0xd78cff,
  bridge_03: 0xff8cd0,
  bridge_04: 0xff8c8c,
  bridge_05: 0xffb866,
  skybridge: 0xffffff,
  underground: 0x8b97a8,
};
const SELECTED = 0xffffff;
const RAIL = 0xe6edf3;

function colorForLayer(layer) { return LAYER_COLORS[layer] ?? 0x8b97a8; }
function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function r3(v) { return Math.round(Number(v) * 1000) / 1000; }

export class DraftPreview {
  constructor(canvas, modelMeta) {
    this.canvas = canvas;
    this.modelMeta = modelMeta || { meta: { plate: { size: 2560, groundY: 0 } } };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setClearColor(0x0d1117, 1);
    this.scene = new THREE.Scene();
    this.group = new THREE.Group();
    this.grid = new THREE.Group();
    this.scene.add(this.group, this.grid);
    this.pickables = [];
    this.selectedId = null;
    this.buildGrid();
  }

  setSize(w, h) { this.renderer.setSize(w, h, false); }

  buildGrid() {
    const size = this.modelMeta?.meta?.plate?.size || 2560;
    const gy = (this.modelMeta?.meta?.plate?.groundY || 0) - 0.02;
    const lineMatMinor = new THREE.LineBasicMaterial({ color: 0x243040, transparent: true, opacity: 0.7 });
    const lineMatMajor = new THREE.LineBasicMaterial({ color: 0x33465f, transparent: true, opacity: 0.9 });
    const mk = (pts, mat) => { const g = new THREE.BufferGeometry().setFromPoints(pts); const l = new THREE.Line(g, mat); l.userData.noPick = true; this.grid.add(l); };
    for (let i = -size / 2; i <= size / 2 + 0.01; i += 50) {
      const major = Math.abs(i % 250) < 0.001;
      const p1 = new THREE.Vector3(i, gy, -size / 2), p2 = new THREE.Vector3(i, gy, size / 2);
      const p3 = new THREE.Vector3(-size / 2, gy, i), p4 = new THREE.Vector3(size / 2, gy, i);
      mk([p1, p2], major ? lineMatMajor : lineMatMinor);
      mk([p3, p4], major ? lineMatMajor : lineMatMinor);
    }
    // оси
    mk([new THREE.Vector3(-size / 2, gy + 0.01, 0), new THREE.Vector3(size / 2, gy + 0.01, 0)], new THREE.LineBasicMaterial({ color: 0x6a86aa }));
    mk([new THREE.Vector3(0, gy + 0.01, -size / 2), new THREE.Vector3(0, gy + 0.01, size / 2)], new THREE.LineBasicMaterial({ color: 0x6a86aa }));
  }

  clear() {
    for (const obj of [...this.group.children]) {
      this.disposeObject(obj);
      this.group.remove(obj);
    }
    this.pickables = [];
  }

  disposeObject(obj) {
    obj.traverse?.((node) => {
      if (node.geometry && !node.userData.sharedGeometry) node.geometry.dispose?.();
      if (node.material && !node.userData.sharedMaterial) {
        if (Array.isArray(node.material)) node.material.forEach(m => m.dispose?.());
        else node.material.dispose?.();
      }
    });
  }

  rebuild(draft, selection = null) {
    this.selectedId = selection ? selectionKey(selection) : null;
    this.selectedEnd = Number.isFinite(selection?.end) ? Number(selection.end) : null;
    this.clear();
    const roads = draft?.cityforge?.networks?.roads || { nodes: [], segments: [] };
    for (const n of roads.nodes || []) this.addNode(n);
    for (const s of roads.segments || []) for (const [elementIndex, el] of (s.elements || []).entries()) this.addElement(s, elementIndex, el);
    this.applySelection();
  }

  addEndpointHandle(segment, elementIndex, end, x, y, z) {
    const selected = this.selectedId === `element:${segment.id}:${elementIndex}` && Number(this.selectedEnd) === end;
    const color = selected ? SELECTED : (end === 0 ? 0x6ff2ff : 0xffae42);
    const g = new THREE.SphereGeometry(4.0, 12, 8);
    const m = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y + 1.1, z);
    mesh.userData.entityRef = { kind: 'element-end', segmentId: segment.id, elementIndex, end };
    this.group.add(mesh); this.pickables.push(mesh);
  }

  baseMaterial(layer, selected = false, opacity = 0.5) {
    const color = selected ? SELECTED : colorForLayer(layer);
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
  }

  addNode(n) {
    const p = nodePos(n);
    const g = new THREE.SphereGeometry(1.7, 12, 8);
    const selected = this.selectedId === `node:${String(n.id)}`;
    const m = new THREE.MeshBasicMaterial({ color: selected ? SELECTED : 0x6ff2ff });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(p.x, p.y + 0.8, p.z);
    mesh.userData.entityRef = { kind: 'node', id: String(n.id), x: p.x, y: p.y, z: p.z };
    this.pickables.push(mesh);
    this.group.add(mesh);
  }

  addElement(segment, elementIndex, el) {
    const layer = segment.layer || 'ground';
    const selectedBase = `element:${segment.id}:${elementIndex}`;
    if (el?.plate) this.addPlate(segment, el.plate, layer, selectedBase, elementIndex);
    else if (el?.arc) this.addArc(segment, el.arc, layer, selectedBase, elementIndex);
  }

  taperGeom(plate) {
    const length = Math.max(0.1, plate.length || 1);
    const y0 = isNum(plate.y) ? plate.y : 0;
    const rise = isNum(plate.rise) ? plate.rise : 0;
    const w0 = isNum(plate.width) ? plate.width : 20;
    const w1 = isNum(plate.widthEnd) ? plate.widthEnd : w0;
    const c0 = isNum(plate.crossStart) ? plate.crossStart : 0;
    const c1 = isNum(plate.crossEnd) ? plate.crossEnd : c0;
    const yaw = (isNum(plate.yaw) ? plate.yaw : 0) * Math.PI / 180;
    const ux = Math.cos(yaw), uz = Math.sin(yaw);
    const sx = -uz, sz = ux;
    const ax = plate.x - ux * length / 2, az = plate.z - uz * length / 2, ay = y0;
    const bx = plate.x + ux * length / 2, bz = plate.z + uz * length / 2, by = y0 + rise;
    const at = (t) => {
      const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t, cy = ay + (by - ay) * t;
      const w = w0 + (w1 - w0) * t, c = c0 + (c1 - c0) * t;
      const px = cx + sx * c, pz = cz + sz * c;
      return { px, py: cy, pz, w };
    };
    return [at(0), at(1)];
  }

  prismGeometry(a, b, thickness = 0.7) {
    // a/b: {px,py,pz,w}; строим верхний и нижний прямоугольник в горизонтальном поперечном направлении
    const yaw = Math.atan2(b.pz - a.pz, b.px - a.px);
    const sx = -Math.sin(yaw), sz = Math.cos(yaw);
    const corners = [
      [a.px + sx * a.w / 2, a.py, a.pz + sz * a.w / 2],
      [a.px - sx * a.w / 2, a.py, a.pz - sz * a.w / 2],
      [b.px - sx * b.w / 2, b.py, b.pz - sz * b.w / 2],
      [b.px + sx * b.w / 2, b.py, b.pz + sz * b.w / 2],
    ];
    const pos = new Float32Array(corners.concat(corners.map(([x, y, z]) => [x, y - thickness, z])).flat());
    const idx = [
      0, 1, 2, 0, 2, 3, // top
      4, 6, 5, 4, 7, 6, // bottom
      0, 3, 7, 0, 7, 4, // +s side
      1, 5, 6, 1, 6, 2, // -s side
      0, 4, 5, 0, 5, 1, // a end
      3, 2, 6, 3, 6, 7, // b end
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  addPlate(segment, plate, layer, selectedBase, elementIndex) {
    const selected = this.selectedId === `element:${segment.id}:${elementIndex}`;
    const [a, b] = this.taperGeom(plate);
    const geom = this.prismGeometry(a, b, 0.75);
    const mesh = new THREE.Mesh(geom, this.baseMaterial(layer, selected, selected ? 0.85 : 0.5));
    mesh.userData.entityRef = { kind: 'element', segmentId: segment.id, elementIndex, id: `${segment.id}:${elementIndex}` };
    this.group.add(mesh); this.pickables.push(mesh);
    this.addEndpointHandle(segment, elementIndex, 0, a.px, a.py, a.pz);
    this.addEndpointHandle(segment, elementIndex, 1, b.px, b.py, b.pz);
    this.addRayLines([a, b], layer, selected, plate.rails, a, b);
  }

  addArc(segment, arc, layer, selectedBase, elementIndex) {
    const selected = this.selectedId === `element:${segment.id}:${elementIndex}`;
    const from = isNum(arc.from) ? arc.from * Math.PI / 180 : 0;
    let to = isNum(arc.to) ? arc.to * Math.PI / 180 : Math.PI / 2;
    const width = isNum(arc.width) ? arc.width : 10, R = isNum(arc.radius) ? arc.radius : 20;
    const y0 = Array.isArray(arc.y) ? Number(arc.y[0]) || 0 : Number(arc.y) || 0;
    const y1 = Array.isArray(arc.y) ? Number(arc.y[1]) || 0 : Number(arc.y) || 0;
    let span = to - from;
    const steps = Math.max(6, Math.ceil(Math.abs(span) / (Math.PI / 10)));
    if (Math.abs(span) < 1e-6) span = Math.PI / 2;
    const ptsIn = [], ptsOut = [], linePts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, ang = from + span * t, y = y0 + (y1 - y0) * t;
      const ix = arc.cx + Math.cos(ang) * (R - width / 2), iz = arc.cz + Math.sin(ang) * (R - width / 2);
      const ox = arc.cx + Math.cos(ang) * (R + width / 2), oz = arc.cz + Math.sin(ang) * (R + width / 2);
      ptsIn.push([ix, y, iz]); ptsOut.push([ox, y, oz]);
      linePts.push([arc.cx + Math.cos(ang) * R, y + 0.12, arc.cz + Math.sin(ang) * R]);
    }
    const pos = [], idx = [];
    for (const p of ptsIn) pos.push(p[0], p[1], p[2]);
    for (const p of ptsOut) pos.push(p[0], p[1], p[2]);
    const n = ptsIn.length;
    for (let i = 0; i < steps; i++) {
      idx.push(i, i + 1, n + i + 1, i, n + i + 1, n + i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, this.baseMaterial(layer, selected, selected ? 0.85 : 0.5));
    mesh.userData.entityRef = { kind: 'element', segmentId: segment.id, elementIndex, id: `${segment.id}:${elementIndex}` };
    this.group.add(mesh); this.pickables.push(mesh);
    // осевые линии бортов
    const yA = Array.isArray(arc.y) ? Number(arc.y[0]) || 0 : Number(arc.y) || 0;
    const yB = Array.isArray(arc.y) ? Number(arc.y[1]) || 0 : Number(arc.y) || 0;
    this.addEndpointHandle(segment, elementIndex, 0, arc.cx + Math.cos(from) * R, yA, arc.cz + Math.sin(from) * R);
    this.addEndpointHandle(segment, elementIndex, 1, arc.cx + Math.cos(to) * R, yB, arc.cz + Math.sin(to) * R);
    const mkLine = (arr, color, opacity) => {
      const gg = new THREE.BufferGeometry().setFromPoints(arr.map(([x, y, z]) => new THREE.Vector3(x, y + 0.12, z)));
      const ll = new THREE.Line(gg, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
      ll.userData.noPick = true; this.group.add(ll);
    };
    mkLine(ptsIn, selected ? SELECTED : RAIL, 0.95); mkLine(ptsOut, selected ? SELECTED : RAIL, 0.95);
    mkLine(linePts, colorForLayer(layer), 0.45);
  }

  addRayLines([a, b], layer, selected, rails, pa, pb) {
    const color = selected ? SELECTED : colorForLayer(layer);
    const yaw = Math.atan2(pb.pz - pa.pz, pb.px - pa.px);
    const sx = -Math.sin(yaw), sz = Math.cos(yaw);
    const line = (offset, color, opacity) => {
      const s = new THREE.Vector3(pa.px + sx * offset, pa.py + 0.12, pa.pz + sz * offset);
      const e = new THREE.Vector3(pb.px + sx * offset, pb.py + 0.12, pb.pz + sz * offset);
      const g = new THREE.BufferGeometry().setFromPoints([s, e]);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
      l.userData.noPick = true; this.group.add(l);
    };
    line(-a.w / 2, selected ? SELECTED : RAIL, rails ? 0.95 : 0.25);
    line(a.w / 2, selected ? SELECTED : RAIL, rails ? 0.95 : 0.25);
    line(0, color, 0.4);
  }

  setGridVisible(v) { this.grid.visible = !!v; }

  applySelection() {
    // перестраивать материалы вручную не нужно: ребилд учитывает selectedId
  }

  render(camera) { this.renderer.render(this.scene, camera); }
}

export function selectionKey(sel) {
  if (!sel) return null;
  if (sel.kind === 'element') return `element:${sel.segmentId}:${sel.elementIndex}`;
  return `${sel.kind}:${sel.id ?? sel.segmentId}`;
}
