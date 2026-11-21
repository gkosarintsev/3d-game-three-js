import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Детальная визуальная модель крепостной стены и башни для примера
 * внешнего автора (.ai/prompts/castle-authoring). Это только картинка:
 * твёрдость, опора и навигация целиком остаются у данных здания
 * (`isEnterable: false`, пустые `rooms`), поэтому модель не добавляет
 * ни одного коллайдера и не выходит за footprint.
 *
 * Локальные координаты — как у остальных detail-моделей: центр XZ в (0,0),
 * низ (основание) в y=0.
 */

class Batcher {
  constructor() {
    this.b = { stone: [], stoneDark: [], stoneLight: [], slit: [] };
    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.m4 = new THREE.Matrix4();
    this.p = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.e = new THREE.Euler();
  }

  add(kind, w, h, d, x, y, z, ry = 0) {
    const g = this.box.clone().toNonIndexed();
    this.p.set(x, y, z);
    this.e.set(0, ry, 0);
    this.q.setFromEuler(this.e);
    this.s.set(w, h, d);
    this.m4.compose(this.p, this.q, this.s);
    g.applyMatrix4(this.m4);
    this.b[kind].push(g);
  }

  build(mats, prefix) {
    this.box.dispose();
    const meshes = [];
    for (const [kind, geos] of Object.entries(this.b)) {
      if (!geos.length) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mats[kind] || mats.stone);
      mesh.name = `${prefix}_${kind}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      meshes.push(mesh);
    }
    return meshes;
  }
}

/** Материалы замка: тёплый камень, тёмный цоколь, светлые тёсаные камни, бойницы. */
export function makeCastleMaterials(wallColor = '#8a857b') {
  const mk = (c, r = 0.88, m = 0.02) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  return {
    stone: mk(wallColor),
    stoneDark: mk(new THREE.Color(wallColor).multiplyScalar(0.72), 0.95, 0.01),
    stoneLight: mk(new THREE.Color(wallColor).lerp(new THREE.Color(0xffffff), 0.18), 0.82, 0.02),
    slit: mk(0x171a1d, 0.7, 0.15),
  };
}

/** Ряд зубцов вдоль оси X; `offset` — смещение по Z от центра. */
function merlonsAlongX(b, len, z, top, width = 1.1, height = 0.9, depth = 0.6) {
  const step = width * 2;
  const count = Math.max(2, Math.floor((len - 0.8) / step));
  const start = -((count - 1) * step) / 2;
  for (let i = 0; i < count; i++) {
    b.add('stoneLight', width, height, depth, start + i * step, top - height / 2, z);
  }
}

/** Ряд зубцов вдоль оси Z; `offset` — смещение по X от центра. */
function merlonsAlongZ(b, len, x, top, width = 1.1, height = 0.9, depth = 0.6) {
  const step = width * 2;
  const count = Math.max(2, Math.floor((len - 0.8) / step));
  const start = -((count - 1) * step) / 2;
  for (let i = 0; i < count; i++) {
    b.add('stoneLight', depth, height, width, x, top - height / 2, start + i * step);
  }
}

/**
 * Крепостная стена: тело с цоколем и двумя рядами зубцов по верхней кромке.
 * Длинная ось берётся из локальных габаритов, поэтому одна модель годится
 * и для северной/южной, и для западной/восточной стены.
 */
export function buildDetailedCastleWall({ width, depth, height }, mats) {
  const b = new Batcher();
  const long = width >= depth;
  const len = long ? width : depth;
  const thick = long ? depth : width;
  const bodyH = Math.max(2, height - 0.9);
  b.add('stone', width, bodyH, depth, 0, bodyH / 2, 0);
  b.add('stoneDark', width, 0.7, depth, 0, 0.35, 0);
  // Тёсаный пояс под зубцами читается как боевой ход, даже если по данным
  // наверх не подняться.
  b.add('stoneLight', width + 0.02, 0.35, depth + 0.02, 0, bodyH - 0.1, 0);
  const edge = Math.max(0.35, thick / 2 - 0.35);
  if (long) {
    merlonsAlongX(b, len, -edge, height);
    merlonsAlongX(b, len, edge, height);
  } else {
    merlonsAlongZ(b, len, -edge, height);
    merlonsAlongZ(b, len, edge, height);
  }
  return b.build(mats, 'CastleWall');
}

/**
 * Башня: квадратное тело, цоколь, пояс, бойницы на четырёх фасадах и зубцы
 * по периметру. Угловые лопатки сужают силуэт кверху, не выходя за footprint.
 */
export function buildDetailedCastleTower({ width, depth, height }, mats) {
  const b = new Batcher();
  const bodyH = Math.max(2, height - 0.9);
  b.add('stone', width * 0.95, bodyH, depth * 0.95, 0, bodyH / 2, 0);
  b.add('stoneDark', width, 0.9, depth, 0, 0.45, 0);
  b.add('stoneLight', width * 0.97, 0.4, depth * 0.97, 0, bodyH - 0.12, 0);

  // Угловые лопатки — четыре вертикальные полосы по углам тела.
  const qx = width * 0.95 / 2 - 0.22;
  const qz = depth * 0.95 / 2 - 0.22;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.add('stoneLight', 0.44, bodyH * 0.86, 0.44, sx * qx, bodyH * 0.43, sz * qz);
    }
  }

  // Бойницы: по две на фасад, на двух уровнях, утоплены в тело.
  const slitH = 1.25, slitW = 0.22;
  for (const y of [bodyH * 0.38, bodyH * 0.7]) {
    for (const x of [-width * 0.18, width * 0.18]) {
      b.add('slit', slitW, slitH, 0.18, x, y, depth * 0.475 + 0.04);
      b.add('slit', slitW, slitH, 0.18, x, y, -depth * 0.475 - 0.04);
    }
    for (const z of [-depth * 0.18, depth * 0.18]) {
      b.add('slit', 0.18, slitH, slitW, width * 0.475 + 0.04, y, z);
      b.add('slit', 0.18, slitH, slitW, -width * 0.475 - 0.04, y, z);
    }
  }

  const ex = width / 2 - 0.35;
  const ez = depth / 2 - 0.35;
  merlonsAlongX(b, width, -ez, height, 1.0, 0.9, 0.55);
  merlonsAlongX(b, width, ez, height, 1.0, 0.9, 0.55);
  merlonsAlongZ(b, depth, -ex, height, 1.0, 0.9, 0.55);
  merlonsAlongZ(b, depth, ex, height, 1.0, 0.9, 0.55);
  return b.build(mats, 'CastleTower');
}
