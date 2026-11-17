import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HouseConfig } from '../../types/house';
import type { HouseBuildContext } from './types';

type AcademicBucketKey =
  | 'wall'
  | 'roof'
  | 'trim'
  | 'door'
  | 'foundation'
  | 'stoneStep'
  | 'glass'
  | 'glassBacking'
  | 'metalAccent'
  | 'lampGlow';

class AcademicBatcher {
  private readonly buckets: Record<AcademicBucketKey, THREE.BufferGeometry[]> = {
    wall: [],
    roof: [],
    trim: [],
    door: [],
    foundation: [],
    stoneStep: [],
    glass: [],
    glassBacking: [],
    metalAccent: [],
    lampGlow: [],
  };

  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly unitCyl = new THREE.CylinderGeometry(1, 1, 1, 16);
  private readonly mat4 = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();

  addBox(
    bucket: AcademicBucketKey,
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
    bucket: AcademicBucketKey,
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
      : new THREE.CylinderGeometry(rTop, rBot, 1, 16).toNonIndexed();
    this.pos.set(x, y, z);
    this.euler.set(rotX, rotY, rotZ);
    this.quat.setFromEuler(this.euler);
    this.scale.set(isUniform ? rBot : 1, h, isUniform ? rBot : 1);
    this.mat4.compose(this.pos, this.quat, this.scale);
    geo.applyMatrix4(this.mat4);
    this.buckets[bucket].push(geo);
  }

  addGeometry(
    bucket: AcademicBucketKey,
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

  flushToGroup(
    group: THREE.Group,
    ctx: HouseBuildContext,
    lampGlowMat: THREE.MeshStandardMaterial,
  ): void {
    this.unitBox.dispose();
    this.unitCyl.dispose();

    for (const [key, geos] of Object.entries(this.buckets) as Array<
      [AcademicBucketKey, THREE.BufferGeometry[]]
    >) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      ctx.trackGeometry(merged);

      const mat = key === 'lampGlow' ? lampGlowMat : ctx.materials[key];
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `AcademicBuilding_${key}`;
      const isGlass = key === 'glass';
      const isGlow = key === 'lampGlow';
      mesh.castShadow = !isGlass && !isGlow;
      mesh.receiveShadow = !isGlass && !isGlow;
      group.add(mesh);
    }
  }
}

function createHipRoofGeometry(spanX: number, spanZ: number, riseH: number): THREE.BufferGeometry {
  const hx = spanX / 2;
  const hz = spanZ / 2;
  const ridgeAlongX = spanX >= spanZ;
  const ridgeLen = Math.max(0.6, Math.abs(spanX - spanZ) * 0.78);
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
    uvs.push(a[0] * 0.25, a[2] * 0.25, b[0] * 0.25, b[2] * 0.25, c[0] * 0.25, c[2] * 0.25);
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

function createPedimentGeo(spanW: number, spanD: number, riseH: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-spanW / 2, 0);
  shape.lineTo(spanW / 2, 0);
  shape.lineTo(0, riseH);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: spanD,
    bevelEnabled: false,
  });
  geo.translate(0, 0, -spanD / 2);
  return geo;
}

/**
 * Builds a University / School Academic Campus Building (Учебный корпус):
 * - Monumental symmetrical E-wing / central-risalit footprint with recessed classroom wings & projecting end pavilions
 * - Grounded granite base plinth, belt courses & heavy top entablature cornice
 * - Rhythmic tall lecture-hall & classroom window bays across 2..5 floors (windowDensity 1..3)
 * - Grand 4-column classical colonnade portico with ceremonial steps & glazed double doors (hasPorch)
 * - 3 campus roof options: 'hip' pitched academic roof + front pediment, 'flat' modernist parapet with central skylight atrium,
 *   and 'gable' pitched wing roofs + triangular clock gable
 * - Central campus clock/bell cupola tower with illuminated clock dial & spire (hasChimney),
 *   classical facade pilasters/piers (hasCornerAccents), and upper parapet balustrade & portico terrace (hasBalcony)
 */
export function buildAcademicBuilding(
  config: HouseConfig,
  ctx: HouseBuildContext,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'AcademicBuildingModel';

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

  const lampGlowMat = new THREE.MeshStandardMaterial({
    name: 'CampusClockDial',
    color: new THREE.Color('#fefce8'),
    emissive: new THREE.Color('#fde68a'),
    emissiveIntensity: 0.95,
    roughness: 0.22,
  });
  ctx.trackDisposable(lampGlowMat);

  const batch = new AcademicBatcher();
  const baseY = foundationHeight;
  const totalWallH = floors * floorHeight;
  const topY = baseY + totalWallH;

  // Massing breakdown: Central Risalit + Recessed Wings + Projecting End Pavilions
  const mainD = depth * 0.86;
  const wingW = width;
  const hw = wingW / 2;
  const hmD = mainD / 2;

  const centerRisalitW = Math.min(11.5, Math.max(6.8, width * 0.28));
  const centerRisalitD = depth;
  const endPavW = Math.min(7.5, Math.max(4.6, width * 0.17));
  const endPavD = depth * 0.96;

  // 1. Continuous Granite Plinth & Belt Trim
  batch.addBox('foundation', width + 0.6, foundationHeight * 0.85, mainD + 0.6, 0, (foundationHeight * 0.85) / 2, 0);
  batch.addBox('foundation', centerRisalitW + 0.6, foundationHeight * 0.85, centerRisalitD + 0.6, 0, (foundationHeight * 0.85) / 2, 0);
  for (const sx of [-1, 1]) {
    const px = sx * (hw - endPavW / 2);
    batch.addBox('foundation', endPavW + 0.5, foundationHeight * 0.85, endPavD + 0.5, px, (foundationHeight * 0.85) / 2, 0);
  }
  batch.addBox('stoneStep', width + 0.78, foundationHeight * 0.2, mainD + 0.78, 0, foundationHeight * 0.92, 0);

  // 2. Main Architectural Volumes
  batch.addBox('wall', width, totalWallH, mainD, 0, baseY + totalWallH / 2, 0);
  batch.addBox('wall', centerRisalitW, totalWallH, centerRisalitD, 0, baseY + totalWallH / 2, 0);
  for (const sx of [-1, 1]) {
    const px = sx * (hw - endPavW / 2);
    batch.addBox('wall', endPavW, totalWallH, endPavD, px, baseY + totalWallH / 2, 0);
  }

  // Horizontal stringcourses & top cornice molding
  batch.addBox('stoneStep', width + 0.35, 0.2, mainD + 0.35, 0, baseY + floorHeight, 0);
  batch.addBox('stoneStep', centerRisalitW + 0.35, 0.2, centerRisalitD + 0.35, 0, baseY + floorHeight, 0);
  batch.addBox('stoneStep', width + 0.52, 0.24, mainD + 0.52, 0, topY - 0.14, 0);
  batch.addBox('stoneStep', centerRisalitW + 0.52, 0.24, centerRisalitD + 0.52, 0, topY - 0.14, 0);
  for (const sx of [-1, 1]) {
    const px = sx * (hw - endPavW / 2);
    batch.addBox('stoneStep', endPavW + 0.45, 0.24, endPavD + 0.45, px, topY - 0.14, 0);
  }

  // 3. Rhythmic Classroom & Lecture Hall Windows
  const winW = windowDensity === 3 ? 1.15 : windowDensity === 2 ? 1.35 : 1.55;
  const winH = Math.min(floorHeight * 0.64, 2.25 * windowScale);

  const addFacadeWindow = (cx: number, cy: number, cz: number, rotY: number) => {
    const dirZ = Math.cos(rotY);
    const dirX = Math.sin(rotY);
    batch.addBox('glassBacking', winW - 0.06, winH - 0.06, 0.05, cx + dirX * 0.02, cy, cz + dirZ * 0.02, 0, rotY, 0);
    batch.addBox('glass', winW - 0.1, winH - 0.1, 0.03, cx + dirX * 0.05, cy, cz + dirZ * 0.05, 0, rotY, 0);
    batch.addBox('trim', winW + 0.12, 0.08, 0.09, cx + dirX * 0.06, cy + winH / 2 + 0.02, cz + dirZ * 0.06, 0, rotY, 0);
    batch.addBox('stoneStep', winW + 0.2, 0.08, 0.14, cx + dirX * 0.08, cy - winH / 2 - 0.03, cz + dirZ * 0.08, 0, rotY, 0);
    // Vertical & transom window mullions
    batch.addBox('trim', 0.05, winH - 0.06, 0.06, cx + dirX * 0.065, cy, cz + dirZ * 0.065, 0, rotY, 0);
    batch.addBox('trim', winW - 0.08, 0.05, 0.06, cx + dirX * 0.065, cy + winH * 0.2, cz + dirZ * 0.065, 0, rotY, 0);
  };

  // Wing bay positions (left and right recessed spans between endPav and centerRisalit)
  const wingStart = centerRisalitW / 2 + 1.0;
  const wingEnd = hw - endPavW - 0.85;
  const wingSpan = Math.max(2.0, wingEnd - wingStart);
  const baySpacing = windowDensity === 3 ? 2.1 : windowDensity === 2 ? 2.65 : 3.4;
  const wingBays = Math.max(2, Math.floor(wingSpan / baySpacing) + 1);
  const backCols = Math.max(5, Math.floor((width - 4.0) / baySpacing));
  const sideCols = Math.max(2, Math.floor((endPavD - 3.0) / 3.2));

  for (let f = 0; f < floors; f++) {
    const cy = baseY + f * floorHeight + floorHeight * 0.52;

    // Front (+Z) wing windows (left & right)
    for (const sx of [-1, 1]) {
      for (let b = 0; b < wingBays; b++) {
        const wx = sx * (wingStart + (wingSpan * b) / Math.max(1, wingBays - 1));
        addFacadeWindow(wx, cy, hmD, 0);
      }
      // End pavilion front windows (2 per pavilion)
      const pavCenter = sx * (hw - endPavW / 2);
      for (const ox of [-endPavW * 0.24, endPavW * 0.24]) {
        addFacadeWindow(pavCenter + ox, cy, endPavD / 2, 0);
      }
    }

    // Center risalit front windows (upper floors or flanking entrance on ground floor)
    const risOffsets = f === 0 && hasPorch ? [-centerRisalitW * 0.34, centerRisalitW * 0.34] : [-centerRisalitW * 0.32, 0, centerRisalitW * 0.32];
    for (const rx of risOffsets) {
      addFacadeWindow(rx, cy, centerRisalitD / 2, 0);
    }

    // Back (-Z) uniform rhythm windows
    for (let i = 0; i < backCols; i++) {
      const bx = -hw + 2.0 + ((width - 4.0) * i) / Math.max(1, backCols - 1);
      addFacadeWindow(bx, cy, -hmD, Math.PI);
    }

    // Left & Right side windows (-X / +X)
    for (let j = 0; j < sideCols; j++) {
      const sz = -endPavD / 2 + 1.8 + ((endPavD - 3.6) * j) / Math.max(1, sideCols - 1);
      addFacadeWindow(-hw, cy, sz, -Math.PI / 2);
      addFacadeWindow(hw, cy, sz, Math.PI / 2);
    }
  }

  // Classical vertical pilasters between wing bays & pavilion corners (hasCornerAccents)
  if (hasCornerAccents) {
    for (const sx of [-1, 1]) {
      // Center risalit framing pilasters
      batch.addBox('stoneStep', 0.42, totalWallH - 0.2, 0.16, sx * (centerRisalitW / 2 - 0.32), baseY + totalWallH / 2, centerRisalitD / 2 + 0.06);
      // End pavilion framing pilasters
      batch.addBox('stoneStep', 0.42, totalWallH - 0.2, 0.16, sx * (hw - 0.32), baseY + totalWallH / 2, endPavD / 2 + 0.06);
      batch.addBox('stoneStep', 0.42, totalWallH - 0.2, 0.16, sx * (hw - endPavW + 0.32), baseY + totalWallH / 2, endPavD / 2 + 0.06);
      // Wing vertical mullions
      for (let b = 0; b < wingBays - 1; b++) {
        const px = sx * (wingStart + ((wingSpan * (b + 0.5)) / Math.max(1, wingBays - 1)));
        batch.addBox('stoneStep', 0.26, totalWallH - 0.25, 0.12, px, baseY + totalWallH / 2, hmD + 0.04);
      }
    }
  }

  // 4. Grand Ceremonial Portico, 4-Column Colonnade & Campus Steps (hasPorch)
  const porticoZ = centerRisalitD / 2;
  if (hasPorch) {
    const portW = Math.min(centerRisalitW * 0.88, 8.6);
    const portD = 2.6;
    const colH = Math.min(totalWallH - 0.5, floorHeight * (floors >= 3 ? 1.85 : 1.25));
    const deckY = baseY;

    // Monumental granite terrace + 4 broad ceremonial steps
    batch.addBox('foundation', portW + 0.6, foundationHeight, portD, 0, foundationHeight / 2, porticoZ + portD / 2);
    for (let s = 0; s < 4; s++) {
      const sh = (foundationHeight / 4) * (4 - s);
      batch.addBox('stoneStep', portW + 0.8 + s * 0.45, sh * 0.28, 0.42, 0, sh * 0.14 + (3 - s) * 0.08, porticoZ + portD + 0.24 + s * 0.4);
    }

    // Glazed double campus entry doors inside colonnade (strict monotonic Z offsets to prevent Z-fighting)
    const doorW = Math.min(3.2, portW * 0.44);
    const doorH = Math.min(2.9, floorHeight - 0.35);
    batch.addBox('trim', doorW + 0.28, doorH + 0.16, 0.08, 0, baseY + doorH / 2, porticoZ + 0.04);
    batch.addBox('door', doorW, doorH, 0.06, 0, baseY + doorH / 2, porticoZ + 0.07);
    batch.addBox('glassBacking', doorW * 0.72, doorH * 0.65, 0.04, 0, baseY + doorH * 0.54, porticoZ + 0.1);
    batch.addBox('glass', doorW * 0.68, doorH * 0.61, 0.03, 0, baseY + doorH * 0.54, porticoZ + 0.125);
    // Double-door vertical center stile & horizontal transom bar
    batch.addBox('trim', 0.07, doorH * 0.66, 0.03, 0, baseY + doorH * 0.54, porticoZ + 0.145);
    batch.addBox('trim', doorW * 0.72, 0.06, 0.03, 0, baseY + doorH * 0.74, porticoZ + 0.145);

    // 4 Classical Stone Columns + Entablature Beam + Portico Pediment
    const colZ = porticoZ + portD - 0.35;
    for (let c = 0; c < 4; c++) {
      const cx = -portW * 0.42 + (portW * 0.84 * c) / 3;
      batch.addBox('stoneStep', 0.58, 0.24, 0.58, cx, deckY + 0.12, colZ);
      batch.addCylinder('stoneStep', 0.24, 0.21, colH - 0.42, cx, deckY + 0.24 + (colH - 0.42) / 2, colZ);
      batch.addBox('stoneStep', 0.54, 0.2, 0.54, cx, deckY + colH - 0.1, colZ);
    }
    const entabY = deckY + colH;
    batch.addBox('stoneStep', portW + 0.45, 0.42, portD + 0.2, 0, entabY + 0.2, porticoZ + portD / 2);
    batch.addGeometry('wall', createPedimentGeo(portW + 0.3, portD + 0.05, 1.45), 0, entabY + 0.4, porticoZ + portD / 2);
    batch.addGeometry('roof', createPedimentGeo(portW + 0.65, portD + 0.3, 1.65), 0, entabY + 0.42, porticoZ + portD / 2);
  }

  // 5. Roof Parapet Balustrade & Upper Ceremonial Balcony Accents (hasBalcony)
  if (hasBalcony) {
    batch.addBox('stoneStep', width + 0.2, 0.48, 0.22, 0, topY + 0.24, hmD + 0.06);
    batch.addBox('stoneStep', width + 0.2, 0.48, 0.22, 0, topY + 0.24, -hmD - 0.06);
    batch.addBox('stoneStep', centerRisalitW + 0.2, 0.58, 0.24, 0, topY + 0.29, centerRisalitD / 2 + 0.06);
  }

  // 6. Three Campus Roof Variants
  const rad = (roofPitchDeg * Math.PI) / 180;
  let roofRidgeY = topY + 0.9;

  if (roofType === 'flat') {
    // Academic Modernist Parapeted Roof + Central Skylight Lecture Atrium Band
    batch.addBox('stoneStep', width + 0.42, 0.55, mainD + 0.42, 0, topY + 0.27, 0);
    batch.addBox('roof', width + 0.1, 0.14, mainD + 0.1, 0, topY + 0.08, 0);
    const atrW = Math.min(12, width * 0.36);
    const atrD = Math.min(7.5, mainD * 0.55);
    batch.addBox('trim', atrW, 0.72, atrD, 0, topY + 0.46, 0);
    batch.addBox('glass', atrW - 0.3, 0.22, atrD - 0.3, 0, topY + 0.88, 0);
    roofRidgeY = topY + 0.98;
  } else if (roofType === 'gable') {
    const rise = Math.max(1.8, Math.tan(rad) * (mainD / 2) * 0.88);
    // Longitudinal pitched roof along X spanning main building width
    const wingGable = createPedimentGeo(mainD + roofOverhang * 2, width + roofOverhang * 1.4, rise);
    wingGable.rotateY(Math.PI / 2);
    batch.addGeometry('roof', wingGable, 0, topY, 0);
    // Forward cross-gable over central risalit & projecting end pavilions
    const risRise = rise * 1.05;
    batch.addGeometry(
      'roof',
      createPedimentGeo(centerRisalitW + roofOverhang * 1.5, centerRisalitD + roofOverhang * 1.6, risRise),
      0,
      topY,
      0,
    );
    for (const sx of [-1, 1]) {
      const px = sx * (hw - endPavW / 2);
      batch.addGeometry(
        'roof',
        createPedimentGeo(endPavW + roofOverhang * 1.4, endPavD + roofOverhang * 1.5, rise * 0.94),
        px,
        topY,
        0,
      );
    }
    roofRidgeY = topY + risRise;
  } else {
    // 'hip': Classical Hipped Campus Roofs over Main Wing, Central Risalit & End Pavilions
    const rise = Math.max(1.6, Math.tan(rad) * (mainD / 2) * 0.72);
    batch.addGeometry('roof', createHipRoofGeometry(width + roofOverhang * 1.8, mainD + roofOverhang * 1.8, rise), 0, topY, 0);
    batch.addGeometry('roof', createHipRoofGeometry(centerRisalitW + roofOverhang * 1.5, centerRisalitD + roofOverhang * 1.5, rise * 1.06), 0, topY, 0);
    for (const sx of [-1, 1]) {
      const px = sx * (hw - endPavW / 2);
      batch.addGeometry('roof', createHipRoofGeometry(endPavW + roofOverhang * 1.4, endPavD + roofOverhang * 1.4, rise * 0.96), px, topY, 0);
    }
    roofRidgeY = topY + rise * 1.06;
  }

  // 7. Rooftop Campus Clock / Bell Cupola Tower (hasChimney)
  if (hasChimney) {
    const baseCupY = roofRidgeY - 0.35;
    const baseW = 3.2;
    batch.addBox('wall', baseW, 1.85, baseW, 0, baseCupY + 0.92, 0);
    batch.addBox('stoneStep', baseW + 0.36, 0.22, baseW + 0.36, 0, baseCupY + 1.88, 0);
    // Illuminated circular campus clock face facing +Z (and -Z) with dark bezel & hands
    for (const sz of [-1, 1]) {
      const cz = sz * (baseW / 2 + 0.04);
      batch.addCylinder('metalAccent', 0.64, 0.64, 0.1, 0, baseCupY + 1.02, cz, Math.PI / 2, 0, 0);
      batch.addCylinder('lampGlow', 0.52, 0.52, 0.11, 0, baseCupY + 1.02, cz + sz * 0.02, Math.PI / 2, 0, 0);
      batch.addBox('metalAccent', 0.045, 0.34, 0.03, 0, baseCupY + 1.15, cz + sz * 0.085);
      batch.addBox('metalAccent', 0.26, 0.045, 0.03, sz * 0.11, baseCupY + 1.02, cz + sz * 0.085);
    }
    // Lantern belfry stage & spire
    batch.addBox('trim', 2.2, 1.35, 2.2, 0, baseCupY + 2.66, 0);
    batch.addBox('glass', 1.55, 1.0, 2.24, 0, baseCupY + 2.66, 0);
    batch.addBox('glass', 2.24, 1.0, 1.55, 0, baseCupY + 2.66, 0);
    batch.addCylinder('roof', 1.45, 0.12, 1.8, 0, baseCupY + 4.22, 0);
    batch.addCylinder('metalAccent', 0.05, 0.02, 1.3, 0, baseCupY + 5.6, 0);
  }

  batch.flushToGroup(group, ctx, lampGlowMat);
  return group;
}
