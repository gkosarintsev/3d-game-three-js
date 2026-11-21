import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Детальная визуальная модель «Учебный корпус» (docs/houses2 academic-building).
 * Только картинка — коллизии/навигация остаются у данных здания.
 * Локальные координаты: центр XZ в (0,0), низ (основание) в y=0.
 */

class Batcher {
  constructor() {
    this.buckets = {
      wall: [], roof: [], trim: [], door: [], foundation: [], stoneStep: [],
      glass: [], glassBacking: [], metalAccent: [], lampGlow: [],
    };
    this.unitBox = new THREE.BoxGeometry(1, 1, 1);
    this.unitCyl = new THREE.CylinderGeometry(1, 1, 1, 16);
    this.mat4 = new THREE.Matrix4();
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.scale = new THREE.Vector3();
    this.euler = new THREE.Euler();
  }
  addBox(bucket, w, h, d, x, y, z, rotX = 0, rotY = 0, rotZ = 0) {
    const geo = this.unitBox.clone().toNonIndexed();
    this.pos.set(x, y, z); this.euler.set(rotX, rotY, rotZ); this.quat.setFromEuler(this.euler);
    this.scale.set(w, h, d); this.mat4.compose(this.pos, this.quat, this.scale);
    geo.applyMatrix4(this.mat4); this.buckets[bucket].push(geo);
  }
  addCylinder(bucket, rBot, rTop, h, x, y, z, rotX = 0, rotY = 0, rotZ = 0) {
    const isUniform = Math.abs(rBot - rTop) < 1e-4;
    const geo = isUniform ? this.unitCyl.clone().toNonIndexed() : new THREE.CylinderGeometry(rTop, rBot, 1, 16).toNonIndexed();
    this.pos.set(x, y, z); this.euler.set(rotX, rotY, rotZ); this.quat.setFromEuler(this.euler);
    this.scale.set(isUniform ? rBot : 1, h, isUniform ? rBot : 1);
    this.mat4.compose(this.pos, this.quat, this.scale); geo.applyMatrix4(this.mat4); this.buckets[bucket].push(geo);
  }
  addGeometry(bucket, rawGeo, x, y, z) {
    const geo = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo.clone();
    rawGeo.dispose?.();
    if (x !== 0 || y !== 0 || z !== 0) geo.translate(x, y, z);
    this.buckets[bucket].push(geo);
  }
  buildMeshes(materials) {
    this.unitBox.dispose(); this.unitCyl.dispose();
    const meshes = [];
    for (const [key, geos] of Object.entries(this.buckets)) {
      if (!geos.length) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, materials[key] || materials.wall);
      mesh.name = `Academic_${key}`;
      mesh.castShadow = key !== 'glass' && key !== 'lampGlow';
      mesh.receiveShadow = key !== 'glass' && key !== 'lampGlow';
      meshes.push(mesh);
    }
    return meshes;
  }
}

function createHipRoofGeometry(spanX, spanZ, riseH) {
  const hx = spanX / 2, hz = spanZ / 2;
  const ridgeAlongX = spanX >= spanZ;
  const ridgeLen = Math.max(0.6, Math.abs(spanX - spanZ) * 0.72);
  const rx = ridgeAlongX ? ridgeLen / 2 : 0;
  const rz = ridgeAlongX ? 0 : ridgeLen / 2;
  const p0 = [-hx, 0, hz], p1 = [hx, 0, hz], p2 = [hx, 0, -hz], p3 = [-hx, 0, -hz];
  const r0 = ridgeAlongX ? [-rx, riseH, 0] : [0, riseH, -rz];
  const r1 = ridgeAlongX ? [rx, riseH, 0] : [0, riseH, rz];
  const pos = [], uvs = [];
  const tri = (a, b, c) => { pos.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]); uvs.push(a[0]*0.3,a[2]*0.3,b[0]*0.3,b[2]*0.3,c[0]*0.3,c[2]*0.3); };
  if (ridgeAlongX) { tri(p0,p1,r1); tri(p0,r1,r0); tri(p2,p3,r0); tri(p2,r0,r1); tri(p1,p2,r1); tri(p3,p0,r0); }
  else { tri(p1,p2,r0); tri(p1,r0,r1); tri(p3,p0,r1); tri(p3,r1,r0); tri(p0,p1,r1); tri(p2,p3,r0); }
  tri(p0,p3,p2); tri(p0,p2,p1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}
function createGablePrismGeo(spanX, spanZ, riseH) {
  const shape = new THREE.Shape();
  shape.moveTo(-spanX / 2, 0); shape.lineTo(spanX / 2, 0); shape.lineTo(0, riseH); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: spanZ, bevelEnabled: false });
  geo.translate(0, 0, -spanZ / 2);
  return geo;
}

export function buildDetailedAcademicBuilding(config, materials) {
  const width = config.width, depth = config.depth, floorHeight = config.floorHeight, floors = config.floors;
  const foundationHeight = config.foundationHeight ?? 1.0;
  const roofPitchDeg = config.roofPitchDeg ?? 20;
  const roofOverhang = config.roofOverhang ?? 0.55;
  const roofType = config.roofType ?? 'hip';
  const windowDensity = config.windowDensity ?? 2;
  const windowScale = config.windowScale ?? 1.08;
  const hasPorch = config.hasPorch !== false;
  const hasCornerAccents = config.hasCornerAccents !== false;

  const batch = new Batcher();
  const baseY = 0;
  const totalWallH = floors * floorHeight;
  const topY = baseY + totalWallH;
  const wingW = Math.max(8.5, width * 0.28);
  const wingD = Math.max(7.2, depth * 0.72);
  const wingH = Math.max(floorHeight * 2, totalWallH - floorHeight * 0.5);
  const wingOffsetX = width / 2 + wingW / 2 - 0.45;
  const wingOffsetZ = -depth * 0.08;
  const hw = width / 2, hd = depth / 2;
  const rad = (roofPitchDeg * Math.PI) / 180;

  // 1. Podium
  batch.addBox('foundation', width + 0.6, foundationHeight * 0.82, depth + 0.6, 0, (foundationHeight * 0.82) / 2, 0);
  batch.addBox('stoneStep', width + 0.85, foundationHeight * 0.22, depth + 0.85, 0, foundationHeight * 0.92, 0);
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    batch.addBox('foundation', wingW + 0.45, foundationHeight * 0.82, wingD + 0.45, s * wingOffsetX, (foundationHeight * 0.82) / 2, wingOffsetZ);
    batch.addBox('stoneStep', wingW + 0.7, foundationHeight * 0.22, wingD + 0.7, s * wingOffsetX, foundationHeight * 0.92, wingOffsetZ);
  }

  // 2. Massing
  batch.addBox('wall', width, totalWallH, depth, 0, baseY + totalWallH / 2, 0);
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    batch.addBox('wall', wingW, wingH, wingD, s * wingOffsetX, baseY + wingH / 2, wingOffsetZ);
  }
  for (let f = 1; f < floors; f++) {
    const fy = baseY + f * floorHeight;
    batch.addBox('stoneStep', width + 0.25, 0.16, depth + 0.25, 0, fy, 0);
    if (fy < baseY + wingH) {
      for (let i = 0; i < 2; i++) batch.addBox('stoneStep', wingW + 0.2, 0.14, wingD + 0.2, (i === 0 ? -1 : 1) * wingOffsetX, fy, wingOffsetZ);
    }
  }
  batch.addBox('stoneStep', width + 0.45, 0.22, depth + 0.45, 0, topY - 0.12, 0);
  batch.addBox('trim', width + 0.62, 0.16, depth + 0.62, 0, topY + 0.02, 0);

  // 3. Windows (simplified from houses2 builder for portability)
  const colsFront = windowDensity === 1 ? 4 : windowDensity === 2 ? 6 : 8;
  const winW = Math.min(1.35, (width - 4.2) / (colsFront * 1.6));
  const winH = Math.min(floorHeight * 0.58, 2.05 * windowScale);
  const addWindow = (cx, cy, cz, rotY) => {
    const dirZ = Math.cos(rotY), dirX = Math.sin(rotY);
    const p = (d) => [cx + dirX * d, cz + dirZ * d];
    const [bx,bz]=p(0.02), [gx,gz]=p(0.045), [fx,fz]=p(0.06);
    batch.addBox('glassBacking', winW - 0.06, winH - 0.06, 0.04, bx, cy, bz, 0, rotY, 0);
    batch.addBox('glass', winW - 0.1, winH - 0.1, 0.025, gx, cy, gz, 0, rotY, 0);
    batch.addBox('trim', winW + 0.14, 0.08, 0.08, fx, cy + winH / 2 + 0.02, fz, 0, rotY, 0);
    batch.addBox('trim', 0.08, winH, 0.08, fx - dirZ * (winW / 2), cy, fz + dirX * (winW / 2), 0, rotY, 0);
    batch.addBox('trim', 0.08, winH, 0.08, fx + dirZ * (winW / 2), cy, fz - dirX * (winW / 2), 0, rotY, 0);
    batch.addBox('trim', 0.05, winH - 0.08, 0.05, fx, cy, fz, 0, rotY, 0);
    batch.addBox('trim', winW - 0.08, 0.05, 0.05, fx, cy + winH * 0.16, fz, 0, rotY, 0);
  };
  const porticoW = Math.min(width * 0.42, 13.5);
  for (let f = 0; f < floors; f++) {
    const cy = baseY + f * floorHeight + floorHeight * 0.52;
    for (let i = 0; i < colsFront; i++) {
      const wx = -hw + 2.1 + ((width - 4.2) * i) / Math.max(1, colsFront - 1);
      if (f < 2 && Math.abs(wx) < porticoW * 0.34) continue;
      addWindow(wx, cy, hd, 0);
      addWindow(wx, cy, -hd, Math.PI);
    }
  }

  // 4. Portico
  if (hasPorch) {
    const stairDepth = 1.45, stairRise = foundationHeight / 4;
    for (let s = 0; s < 4; s++) {
      batch.addBox('stoneStep', porticoW + 1.2 - s * 0.12, stairRise, stairDepth, 0, baseY - foundationHeight * 0.18 + stairRise * s + stairRise / 2, hd + stairDepth * 0.5 + s * 0.24);
    }
    const colCount = Math.max(4, Math.min(6, Math.round(porticoW / 2.4)));
    const colH = Math.min(totalWallH - 0.45, floorHeight * 2 + 0.65);
    const platformY = baseY + 0.05;
    const colY = platformY + colH / 2;
    for (let c = 0; c < colCount; c++) {
      const px = -porticoW / 2 + 0.65 + ((porticoW - 1.3) * c) / Math.max(1, colCount - 1);
      batch.addBox('stoneStep', 0.58, 0.18, 0.58, px, platformY + 0.09, hd + 0.78);
      batch.addCylinder('trim', 0.18, 0.22, colH, px, colY, hd + 0.78);
      batch.addBox('trim', 0.46, 0.14, 0.46, px, platformY + colH - 0.06, hd + 0.78);
    }
    const entablatureY = platformY + colH + 0.18;
    batch.addBox('stoneStep', porticoW + 0.95, 0.34, 1.25, 0, entablatureY, hd + 0.78);
    const pedW = porticoW * 0.92;
    const pedRise = Math.max(1.35, pedW * 0.16);
    batch.addGeometry('wall', createGablePrismGeo(pedW, 0.65, pedRise), 0, entablatureY + 0.2, hd + 0.48);
    batch.addGeometry('roof', createGablePrismGeo(pedW + 0.45, 1.45, pedRise + 0.2), 0, entablatureY + 0.2, hd + 0.48);
    const doorW = 1.75, doorH = Math.min(floorHeight * 0.82, 2.8);
    batch.addBox('stoneStep', doorW + 0.48, doorH + 0.32, 0.14, 0, baseY + (doorH + 0.32) / 2, hd + 0.05);
    batch.addBox('door', doorW * 0.46, doorH, 0.08, -doorW * 0.24, baseY + doorH / 2, hd + 0.08);
    batch.addBox('door', doorW * 0.46, doorH, 0.08, doorW * 0.24, baseY + doorH / 2, hd + 0.08);
    batch.addBox('lampGlow', 0.18, 0.32, 0.12, -porticoW * 0.42, platformY + colH * 0.55, hd + 0.9);
    batch.addBox('lampGlow', 0.18, 0.32, 0.12, porticoW * 0.42, platformY + colH * 0.55, hd + 0.9);
  }

  // 5. Roofs
  const roofW = width + roofOverhang * 2;
  const roofD = depth + roofOverhang * 2;
  if (roofType === 'flat') {
    batch.addBox('roof', roofW, 0.3, roofD, 0, topY + 0.15, 0);
    batch.addBox('trim', roofW + 0.1, 0.55, 0.22, 0, topY + 0.45, hd + roofOverhang - 0.1);
    batch.addBox('trim', roofW + 0.1, 0.55, 0.22, 0, topY + 0.45, -hd - roofOverhang + 0.1);
  } else if (roofType === 'gable') {
    const rise = Math.max(1.8, Math.tan(rad) * (depth / 2));
    const g = createGablePrismGeo(roofD, roofW, rise); g.rotateY(Math.PI / 2);
    batch.addGeometry('roof', g, 0, topY, 0);
  } else {
    const rise = Math.max(1.6, Math.tan(rad) * (Math.min(width, depth) / 2) * 0.85);
    batch.addGeometry('roof', createHipRoofGeometry(roofW, roofD, rise), 0, topY, 0);
  }

  return batch.buildMeshes(materials);
}

export function makeAcademicBuildingMaterials(wallColorHex = '#d5cbb8') {
  const mk = (color, roughness = 0.8, metalness = 0.05, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  return {
    wall: mk(new THREE.Color(wallColorHex), 0.78, 0.03),
    roof: mk(0x3f4a52, 0.72, 0.08),
    trim: mk(0xf4efe3, 0.44, 0.08),
    door: mk(0x4a3324, 0.5, 0.06),
    foundation: mk(0x7b8087, 0.86, 0.04),
    stoneStep: mk(0xb8bdc4, 0.72, 0.05),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa8c4d8, transparent: true, opacity: 0.4, roughness: 0.05, metalness: 0.0, transmission: 0.18 }),
    glassBacking: mk(0x10161f, 0.9, 0.0),
    metalAccent: mk(0x6b5840, 0.45, 0.35),
    lampGlow: mk(0xffe8b5, 0.4, 0.0, { emissive: 0xf0c060, emissiveIntensity: 0.6 }),
  };
}
