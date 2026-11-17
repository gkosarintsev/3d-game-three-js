import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HouseConfig } from '../../types/house';
import type { HouseBuildContext } from './types';

type Early20cBucketKey =
  | 'wall'
  | 'roof'
  | 'trim'
  | 'door'
  | 'foundation'
  | 'stoneStep'
  | 'glass'
  | 'glassBacking'
  | 'metalAccent'
  | 'chimney';

class Early20cBatcher {
  private readonly buckets: Record<Early20cBucketKey, THREE.BufferGeometry[]> = {
    wall: [],
    roof: [],
    trim: [],
    door: [],
    foundation: [],
    stoneStep: [],
    glass: [],
    glassBacking: [],
    metalAccent: [],
    chimney: [],
  };

  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly unitCyl = new THREE.CylinderGeometry(1, 1, 1, 14);
  private readonly mat4 = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();

  addBox(
    bucket: Early20cBucketKey,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    rotX = 0,
    rotY = 0,
    rotZ = 0,
  ): void {
    const geo = this.unitBox.clone().toNonIndexed();
    this.pos.set(x, y, z);
    this.euler.set(rotX, rotY, rotZ);
    this.quat.setFromEuler(this.euler);
    this.scale.set(w, h, d);
    this.mat4.compose(this.pos, this.quat, this.scale);
    geo.applyMatrix4(this.mat4);
    this.buckets[bucket].push(geo);
  }

  addCylinder(
    bucket: Early20cBucketKey,
    rBot: number,
    rTop: number,
    h: number,
    x: number,
    y: number,
    z: number,
    rotX = 0,
    rotY = 0,
    rotZ = 0,
  ): void {
    const isUniform = Math.abs(rBot - rTop) < 1e-4;
    const geo = isUniform
      ? this.unitCyl.clone().toNonIndexed()
      : new THREE.CylinderGeometry(rTop, rBot, 1, 14).toNonIndexed();
    this.pos.set(x, y, z);
    this.euler.set(rotX, rotY, rotZ);
    this.quat.setFromEuler(this.euler);
    this.scale.set(isUniform ? rBot : 1, h, isUniform ? rBot : 1);
    this.mat4.compose(this.pos, this.quat, this.scale);
    geo.applyMatrix4(this.mat4);
    this.buckets[bucket].push(geo);
  }

  addGeometry(
    bucket: Early20cBucketKey,
    rawGeo: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
  ): void {
    const geo = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo.clone();
    rawGeo.dispose();
    if (x !== 0 || y !== 0 || z !== 0) {
      geo.translate(x, y, z);
    }
    this.buckets[bucket].push(geo);
  }

  flushToGroup(group: THREE.Group, ctx: HouseBuildContext): void {
    this.unitBox.dispose();
    this.unitCyl.dispose();

    for (const [key, geos] of Object.entries(this.buckets) as Array<
      [Early20cBucketKey, THREE.BufferGeometry[]]
    >) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      ctx.trackGeometry(merged);

      const mesh = new THREE.Mesh(merged, ctx.materials[key]);
      mesh.name = `Early20cHouse_${key}`;
      const isGlass = key === 'glass';
      mesh.castShadow = !isGlass;
      mesh.receiveShadow = !isGlass;
      group.add(mesh);
    }
  }
}

function createHipRoofGeometry(spanX: number, spanZ: number, riseH: number): THREE.BufferGeometry {
  const hx = spanX / 2;
  const hz = spanZ / 2;
  const ridgeAlongX = spanX >= spanZ;
  const ridgeLen = Math.max(0.4, Math.abs(spanX - spanZ) * 0.72);
  const rx = ridgeAlongX ? ridgeLen / 2 : 0;
  const rz = ridgeAlongX ? 0 : ridgeLen / 2;

  const p0 = [-hx, 0, hz];
  const p1 = [hx, 0, hz];
  const p2 = [hx, 0, -hz];
  const p3 = [-hx, 0, -hz];
  const r0 = ridgeAlongX ? [-rx, riseH, 0] : [0, riseH, -rz];
  const r1 = ridgeAlongX ? [rx, riseH, 0] : [0, riseH, rz];

  const positions: number[] = [];
  const uvs: number[] = [];
  const pushTri = (a: number[], b: number[], c: number[]) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    uvs.push(a[0] * 0.35, a[2] * 0.35, b[0] * 0.35, b[2] * 0.35, c[0] * 0.35, c[2] * 0.35);
  };

  if (ridgeAlongX) {
    pushTri(p0, p1, r1);
    pushTri(p0, r1, r0);
    pushTri(p2, p3, r0);
    pushTri(p2, r0, r1);
    pushTri(p1, p2, r1);
    pushTri(p3, p0, r0);
  } else {
    pushTri(p1, p2, r0);
    pushTri(p1, r0, r1);
    pushTri(p3, p0, r1);
    pushTri(p3, r1, r0);
    pushTri(p0, p1, r1);
    pushTri(p2, p3, r0);
  }
  pushTri(p0, p3, p2);
  pushTri(p0, p2, p1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

function createMansardRoofGeometry(
  spanX: number,
  spanZ: number,
  riseH: number,
): THREE.BufferGeometry {
  const hx = spanX / 2;
  const hz = spanZ / 2;
  const lowerH = riseH * 0.68;
  const upperInsetX = Math.max(0.9, spanX * 0.16);
  const upperInsetZ = Math.max(0.9, spanZ * 0.18);
  const mx = Math.max(0.6, hx - upperInsetX);
  const mz = Math.max(0.6, hz - upperInsetZ);

  const b = [
    [-hx, 0, hz],
    [hx, 0, hz],
    [hx, 0, -hz],
    [-hx, 0, -hz],
  ];
  const m = [
    [-mx, lowerH, mz],
    [mx, lowerH, mz],
    [mx, lowerH, -mz],
    [-mx, lowerH, -mz],
  ];
  const ridgeAlongX = mx >= mz;
  const ridgeHalf = Math.max(0.25, Math.abs(mx - mz) * 0.6);
  const r0 = ridgeAlongX ? [-ridgeHalf, riseH, 0] : [0, riseH, -ridgeHalf];
  const r1 = ridgeAlongX ? [ridgeHalf, riseH, 0] : [0, riseH, ridgeHalf];

  const positions: number[] = [];
  const uvs: number[] = [];
  const pushTri = (p: number[], q: number[], r: number[]) => {
    positions.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]);
    uvs.push(p[0] * 0.35, p[2] * 0.35, q[0] * 0.35, q[2] * 0.35, r[0] * 0.35, r[2] * 0.35);
  };
  const pushQuad = (a: number[], c0: number[], c1: number[], d: number[]) => {
    pushTri(a, c0, c1);
    pushTri(a, c1, d);
  };

  // Lower steep mansard slopes
  pushQuad(b[0], b[1], m[1], m[0]);
  pushQuad(b[1], b[2], m[2], m[1]);
  pushQuad(b[2], b[3], m[3], m[2]);
  pushQuad(b[3], b[0], m[0], m[3]);

  // Upper hipped crown
  if (ridgeAlongX) {
    pushQuad(m[0], m[1], r1, r0);
    pushQuad(m[2], m[3], r0, r1);
    pushTri(m[1], m[2], r1);
    pushTri(m[3], m[0], r0);
  } else {
    pushQuad(m[1], m[2], r0, r1);
    pushQuad(m[3], m[0], r1, r0);
    pushTri(m[0], m[1], r1);
    pushTri(m[2], m[3], r0);
  }

  // Bottom cap
  pushQuad(b[0], b[3], b[2], b[1]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

function createGablePrismGeo(spanX: number, spanZ: number, riseH: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-spanX / 2, 0);
  shape.lineTo(spanX / 2, 0);
  shape.lineTo(0, riseH);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: spanZ,
    bevelEnabled: false,
  });
  geo.translate(0, 0, -spanZ / 2);
  return geo;
}

/**
 * Builds an Early 20th-Century Low-Rise Urban / Merchant House (Малоэтажный дом начала 20 века):
 * - Granite rusticated foundation plinth, chamfered stone water-table & ground-floor quoin bands
 * - Symmetrical multi-bay brick/stucco facade with stringcourses, dentiled classical cornice & molded pilasters
 * - Historic multi-pane casement windows with stone sills, keystones & piano-nobile pediments
 * - 3 period roof options: 'hip' pitched standing-seam roof with corner parapet pedestals,
 *   'mansard' steep mansard roof with dormer lucarnes, and 'gable' street-facing triangular pediment gable
 * - Carved stone entrance portico with double oak door + Art Nouveau iron & glass canopy (hasPorch),
 *   twin brick stove chimneys (hasChimney), corner quoins/pilasters (hasCornerAccents), and wrought-iron balconies (hasBalcony)
 */
export function buildEarly20cHouse(
  config: HouseConfig,
  ctx: HouseBuildContext,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Early20cHouseModel';

  const {
    width,
    depth,
    floorHeight,
    floors,
    foundationHeight,
    roofPitchDeg,
    roofOverhang,
  } = config.dimensions;
  const {
    roofType,
    windowDensity,
    windowScale,
    hasPorch,
    hasChimney,
    hasCornerAccents,
    hasBalcony,
  } = config.features;

  const batch = new Early20cBatcher();
  const baseY = foundationHeight;
  const totalWallH = floors * floorHeight;
  const topY = baseY + totalWallH;
  const hw = width / 2;
  const hd = depth / 2;

  // 1. Granite Rusticated Plinth & Stone Belt Cap
  batch.addBox('foundation', width + 0.32, foundationHeight * 0.86, depth + 0.32, 0, (foundationHeight * 0.86) / 2, 0);
  batch.addBox('stoneStep', width + 0.44, foundationHeight * 0.2, depth + 0.44, 0, foundationHeight * 0.92, 0);

  // 2. Main Building Shell + Ground-Floor Horizontal Stone Rustication & Story Stringcourses
  batch.addBox('wall', width, totalWallH, depth, 0, baseY + totalWallH / 2, 0);

  // Ground floor rustication stone bands
  const rustCount = 4;
  for (let r = 0; r < rustCount; r++) {
    const ry = baseY + 0.35 + ((floorHeight - 0.55) * r) / Math.max(1, rustCount - 1);
    batch.addBox('stoneStep', width + 0.06, 0.11, depth + 0.06, 0, ry, 0);
  }

  // Inter-floor molded stone belt courses & grand top entablature cornice
  for (let f = 1; f < floors; f++) {
    const fy = baseY + f * floorHeight;
    batch.addBox('stoneStep', width + 0.22, 0.16, depth + 0.22, 0, fy, 0);
  }
  batch.addBox('stoneStep', width + 0.36, 0.2, depth + 0.36, 0, topY - 0.16, 0);
  batch.addBox('trim', width + 0.52, 0.14, depth + 0.52, 0, topY - 0.02, 0);

  // Dentil brackets tucked beneath the cornice
  if (hasCornerAccents) {
    const dentCountX = Math.max(8, Math.round(width / 0.85));
    for (let i = 0; i < dentCountX; i++) {
      const dx = -hw + 0.4 + ((width - 0.8) * i) / (dentCountX - 1);
      for (const sz of [-1, 1]) {
        batch.addBox('stoneStep', 0.12, 0.14, 0.12, dx, topY - 0.28, sz * (hd + 0.07));
      }
    }
    // Corner quoins & classical pilasters dividing main bays
    const pilPositions = [-hw + 0.25, -hw * 0.34, hw * 0.34, hw - 0.25];
    for (const px of pilPositions) {
      for (const sz of [-1, 1]) {
        batch.addBox('stoneStep', 0.34, totalWallH - 0.25, 0.12, px, baseY + (totalWallH - 0.25) / 2, sz * (hd + 0.04));
        // Corinthian/Doric pilaster capital under cornice
        batch.addBox('stoneStep', 0.44, 0.18, 0.16, px, topY - 0.34, sz * (hd + 0.05));
      }
    }
    for (const pz of [-hd + 0.25, hd - 0.25]) {
      for (const sx of [-1, 1]) {
        batch.addBox('stoneStep', 0.12, totalWallH - 0.25, 0.34, sx * (hw + 0.04), baseY + (totalWallH - 0.25) / 2, pz);
      }
    }
  }

  // 3. Period Multi-Pane Windows with Stone Sills, Keystones & Piano-Nobile Pediments
  const colsFront = windowDensity === 1 ? 3 : windowDensity === 2 ? 5 : 7;
  const colsSide = windowDensity === 1 ? 2 : 3;
  const winW = Math.min(1.22, (width - 2.2) / (colsFront * 1.65));
  const winH = Math.min(floorHeight * 0.62, 1.85 * windowScale);

  const addHistoricWindow = (
    cx: number,
    cy: number,
    cz: number,
    rotY: number,
    isPianoNobile: boolean,
  ) => {
    const dirZ = Math.cos(rotY);
    const dirX = Math.sin(rotY);
    const pushOut = (dist: number) => [cx + dirX * dist, cz + dirZ * dist] as const;

    const [bx, bz] = pushOut(0.02);
    const [gx, gz] = pushOut(0.045);
    const [fx, fz] = pushOut(0.06);

    const wRot = rotY;
    batch.addBox('glassBacking', winW - 0.06, winH - 0.06, 0.04, bx, cy, bz, 0, wRot, 0);
    batch.addBox('glass', winW - 0.1, winH - 0.1, 0.025, gx, cy, gz, 0, wRot, 0);
    // Warm-white casement surround & cross mullions
    batch.addBox('trim', winW + 0.14, 0.08, 0.08, fx, cy + winH / 2 + 0.02, fz, 0, wRot, 0);
    batch.addBox('trim', 0.08, winH, 0.08, fx - dirZ * (winW / 2), cy, fz + dirX * (winW / 2), 0, wRot, 0);
    batch.addBox('trim', 0.08, winH, 0.08, fx + dirZ * (winW / 2), cy, fz - dirX * (winW / 2), 0, wRot, 0);
    batch.addBox('trim', 0.05, winH - 0.08, 0.05, fx, cy, fz, 0, wRot, 0);
    batch.addBox('trim', winW - 0.08, 0.05, 0.05, fx, cy + winH * 0.18, fz, 0, wRot, 0);

    // Molded stone sill & keystone crown
    const [sx, sz] = pushOut(0.09);
    batch.addBox('stoneStep', winW + 0.24, 0.09, 0.14, sx, cy - winH / 2 - 0.04, sz, 0, wRot, 0);
    batch.addBox('stoneStep', 0.18, 0.22, 0.12, sx, cy + winH / 2 + 0.1, sz, 0, wRot, 0);
    if (isPianoNobile) {
      // Ornamental window lintel cap on 2nd-floor piano nobile
      batch.addBox('stoneStep', winW + 0.34, 0.11, 0.16, sx, cy + winH / 2 + 0.18, sz, 0, wRot, 0);
    }
  };

  for (let f = 0; f < floors; f++) {
    const cy = baseY + f * floorHeight + floorHeight * 0.52;
    const isPianoNobile = f === 1;

    // Front (+Z) and Back (-Z) windows
    for (let i = 0; i < colsFront; i++) {
      const wx = -hw + 1.25 + ((width - 2.5) * i) / Math.max(1, colsFront - 1);
      // Center bay on ground floor becomes entrance door when hasPorch is active
      const isCenterEntry = f === 0 && hasPorch && i === Math.floor(colsFront / 2);
      if (!isCenterEntry) {
        addHistoricWindow(wx, cy, hd, 0, isPianoNobile);
      }
      addHistoricWindow(wx, cy, -hd, Math.PI, isPianoNobile);
    }

    // Left (-X) and Right (+X) gable/end-wall windows
    for (let j = 0; j < colsSide; j++) {
      const wz = -hd + 1.5 + ((depth - 3.0) * j) / Math.max(1, colsSide - 1);
      addHistoricWindow(-hw, cy, wz, -Math.PI / 2, isPianoNobile);
      addHistoricWindow(hw, cy, wz, Math.PI / 2, isPianoNobile);
    }
  }

  // 4. Historic Main Entrance Portico, Oak Double Door & Art Nouveau Iron/Glass Canopy (hasPorch)
  if (hasPorch) {
    const porchW = 2.65;
    const doorH = Math.min(2.5, floorHeight - 0.45);
    const doorW = 1.42;

    // Three wide granite stairs stepping forward from ground
    for (let s = 0; s < 3; s++) {
      const stepH = (foundationHeight / 3) * (3 - s);
      batch.addBox('stoneStep', porchW + s * 0.25, stepH * 0.36, 0.38, 0, stepH * 0.18 + (2 - s) * 0.08, hd + 0.38 + s * 0.34);
    }
    batch.addBox('foundation', porchW, foundationHeight, 0.85, 0, foundationHeight / 2, hd + 0.42);

    // Molded stone portal surround + paneled oak/glass door + glazed fanlight transom
    batch.addBox('stoneStep', doorW + 0.42, doorH + 0.25, 0.12, 0, baseY + (doorH + 0.25) / 2, hd + 0.05);
    batch.addBox('door', doorW, doorH * 0.72, 0.08, 0, baseY + doorH * 0.36, hd + 0.08);
    batch.addBox('glassBacking', doorW * 0.32, doorH * 0.28, 0.04, -doorW * 0.22, baseY + doorH * 0.46, hd + 0.11);
    batch.addBox('glassBacking', doorW * 0.32, doorH * 0.28, 0.04, doorW * 0.22, baseY + doorH * 0.46, hd + 0.11);
    batch.addBox('glass', doorW * 0.28, doorH * 0.25, 0.03, -doorW * 0.22, baseY + doorH * 0.46, hd + 0.13);
    batch.addBox('glass', doorW * 0.28, doorH * 0.25, 0.03, doorW * 0.22, baseY + doorH * 0.46, hd + 0.13);
    batch.addBox('glassBacking', doorW - 0.16, doorH * 0.22, 0.05, 0, baseY + doorH * 0.84, hd + 0.095);
    batch.addBox('glass', doorW - 0.2, doorH * 0.19, 0.03, 0, baseY + doorH * 0.84, hd + 0.115);
    batch.addBox('metalAccent', 0.05, 0.32, 0.05, -0.09, baseY + 1.05, hd + 0.155);
    batch.addBox('metalAccent', 0.05, 0.32, 0.05, 0.09, baseY + 1.05, hd + 0.155);

    // Cantilevered Art Nouveau iron & glass canopy above entrance
    const canopyY = baseY + doorH + 0.34;
    batch.addBox('trim', porchW + 0.1, 0.1, 1.35, 0, canopyY, hd + 0.7);
    batch.addBox('glass', porchW - 0.14, 0.04, 1.15, 0, canopyY + 0.05, hd + 0.7);
    // Decorative wrought-iron wall-to-canopy tension rods
    for (const sx of [-1, 1]) {
      batch.addBox('metalAccent', 0.045, 0.045, 1.25, sx * (porchW * 0.44), canopyY + 0.28, hd + 0.62, 0.44, 0, 0);
      batch.addBox('metalAccent', 0.12, 0.12, 0.08, sx * (porchW * 0.44), canopyY + 0.52, hd + 0.06);
    }
  }

  // 5. Wrought-Iron & Stone Piano-Nobile Balconies (hasBalcony)
  if (hasBalcony && floors >= 2) {
    const balcY = baseY + floorHeight + 0.06;
    const balcW = Math.min(3.2, width * 0.26);
    const balcD = 1.05;
    const balcZ = hd + balcD / 2;

    batch.addBox('stoneStep', balcW, 0.16, balcD, 0, balcY, balcZ);
    // Stone corbel brackets beneath balcony slab
    for (const bx of [-balcW * 0.36, balcW * 0.36]) {
      batch.addBox('stoneStep', 0.2, 0.34, balcD * 0.72, bx, balcY - 0.24, hd + balcD * 0.36);
    }
    // Wrought-iron top rail + vertical balusters
    const railH = 0.96;
    batch.addBox('trim', balcW - 0.08, 0.05, 0.06, 0, balcY + railH, hd + balcD - 0.05);
    batch.addBox('trim', 0.06, 0.05, balcD, -balcW / 2 + 0.05, balcY + railH, balcZ);
    batch.addBox('trim', 0.06, 0.05, balcD, balcW / 2 - 0.05, balcY + railH, balcZ);
    const bars = Math.max(7, Math.round(balcW / 0.22));
    for (let i = 0; i < bars; i++) {
      const bx = -balcW / 2 + 0.12 + ((balcW - 0.24) * i) / (bars - 1);
      batch.addCylinder('trim', 0.018, 0.018, railH - 0.08, bx, balcY + railH / 2 + 0.02, hd + balcD - 0.05);
    }
  }

  // 6. Three Period Roof Silhouettes
  const rad = (roofPitchDeg * Math.PI) / 180;
  const roofW = width + roofOverhang * 2;
  const roofD = depth + roofOverhang * 2;
  let ridgeTopY = topY + 1.5;

  if (roofType === 'mansard') {
    const rise = Math.max(2.3, Math.tan(rad) * (Math.min(width, depth) / 2) * 0.95);
    batch.addGeometry('roof', createMansardRoofGeometry(roofW, roofD, rise), 0, topY, 0);
    // Classical dormer lucarnes projecting along the mansard front (+Z) & back (-Z) slopes
    const dormerCount = Math.min(3, colsFront >= 5 ? 3 : 2);
    for (let i = 0; i < dormerCount; i++) {
      const dx = dormerCount === 1 ? 0 : -hw * 0.56 + (hw * 1.12 * i) / (dormerCount - 1);
      for (const sz of [-1, 1]) {
        const dz = sz * (hd - 0.35);
        batch.addBox('wall', 1.15, 1.35, 1.1, dx, topY + 0.72, dz);
        batch.addBox('glassBacking', 0.7, 0.9, 0.06, dx, topY + 0.72, dz + sz * 0.54);
        batch.addBox('glass', 0.64, 0.84, 0.04, dx, topY + 0.72, dz + sz * 0.57);
        batch.addBox('trim', 0.8, 0.98, 0.06, dx, topY + 0.72, dz + sz * 0.53);
        batch.addGeometry('roof', createGablePrismGeo(1.36, 1.32, 0.58), dx, topY + 1.38, dz);
      }
    }
    ridgeTopY = topY + rise;
  } else if (roofType === 'gable') {
    const rise = Math.max(1.8, Math.tan(rad) * (depth / 2));
    // Main longitudinal pitched roof along X (eaves facing street +Z), intersected by central street pediment
    const gableGeo = createGablePrismGeo(roofD, roofW, rise);
    gableGeo.rotateY(Math.PI / 2);
    batch.addGeometry('roof', gableGeo, 0, topY, 0);
    // Ornate central street pediment with circular attic oculus window (+Z)
    const pedW = Math.min(5.2, width * 0.42);
    const pedRise = Math.max(1.5, pedW * 0.34);
    batch.addBox('stoneStep', pedW + 0.3, 0.16, 0.3, 0, topY + 0.06, hd + 0.08);
    batch.addGeometry('wall', createGablePrismGeo(pedW, 0.48, pedRise), 0, topY + 0.12, hd - 0.1);
    batch.addGeometry('roof', createGablePrismGeo(pedW + 0.46, Math.min(depth * 0.48, 2.8), pedRise + 0.18), 0, topY + 0.12, hd - Math.min(depth * 0.22, 1.1));
    batch.addCylinder('trim', 0.42, 0.42, 0.16, 0, topY + pedRise * 0.52, hd + 0.16, Math.PI / 2, 0, 0);
    batch.addCylinder('glass', 0.32, 0.32, 0.18, 0, topY + pedRise * 0.52, hd + 0.17, Math.PI / 2, 0, 0);
    ridgeTopY = topY + Math.max(rise, pedRise);
  } else {
    // 'hip': Classic hipped early-20th-century standing-seam roof with corner masonry cornice finials
    const rise = Math.max(1.6, Math.tan(rad) * (Math.min(width, depth) / 2) * 0.9);
    batch.addGeometry('roof', createHipRoofGeometry(roofW, roofD, rise), 0, topY, 0);
    // Subtle corner eaves pedestals flush at cornice corners
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        batch.addBox('stoneStep', 0.46, 0.32, 0.46, sx * (hw + 0.05), topY + 0.12, sz * (hd + 0.05));
      }
    }
    ridgeTopY = topY + rise;
  }

  // 7. Twin Historic Brick Stove Chimneys (hasChimney)
  if (hasChimney) {
    const chimTop = ridgeTopY + 0.85;
    for (const sx of [-1, 1]) {
      const cx = sx * (hw * 0.48);
      const cz = -hd * 0.32;
      const chH = Math.max(1.6, chimTop - topY);
      batch.addBox('chimney', 0.68, chH, 0.68, cx, topY + chH / 2, cz);
      batch.addBox('stoneStep', 0.84, 0.14, 0.84, cx, topY + chH + 0.05, cz);
      batch.addCylinder('metalAccent', 0.11, 0.13, 0.32, cx, topY + chH + 0.26, cz);
    }
  }

  batch.flushToGroup(group, ctx);
  return group;
}
