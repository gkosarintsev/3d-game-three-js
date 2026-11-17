import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HouseConfig } from '../../types/house';
import type { HouseBuildContext } from './types';

type VillaBucketKey =
  | 'wall'
  | 'roof'
  | 'trim'
  | 'door'
  | 'foundation'
  | 'stoneStep'
  | 'glass'
  | 'glassBacking'
  | 'metalAccent'
  | 'timberAccent'
  | 'chimney'
  | 'poolWater'
  | 'warmGlow'
  | 'foliage';

class VillaBatcher {
  private readonly buckets: Record<VillaBucketKey, THREE.BufferGeometry[]> = {
    wall: [],
    roof: [],
    trim: [],
    door: [],
    foundation: [],
    stoneStep: [],
    glass: [],
    glassBacking: [],
    metalAccent: [],
    timberAccent: [],
    chimney: [],
    poolWater: [],
    warmGlow: [],
    foliage: [],
  };

  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly unitCyl = new THREE.CylinderGeometry(1, 1, 1, 14);
  private readonly unitSphere = new THREE.SphereGeometry(1, 12, 10);
  private readonly mat4 = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();

  addBox(
    bucket: VillaBucketKey,
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
    bucket: VillaBucketKey,
    radiusBottom: number,
    radiusTop: number,
    height: number,
    x: number,
    y: number,
    z: number,
  ): void {
    const isUniform = Math.abs(radiusBottom - radiusTop) < 1e-4;
    const geo = isUniform
      ? this.unitCyl.clone().toNonIndexed()
      : new THREE.CylinderGeometry(radiusTop, radiusBottom, 1, 14).toNonIndexed();
    this.pos.set(x, y, z);
    this.quat.identity();
    this.scale.set(isUniform ? radiusBottom : 1, height, isUniform ? radiusBottom : 1);
    this.mat4.compose(this.pos, this.quat, this.scale);
    geo.applyMatrix4(this.mat4);
    this.buckets[bucket].push(geo);
  }

  addSphere(
    bucket: VillaBucketKey,
    rx: number,
    ry: number,
    rz: number,
    x: number,
    y: number,
    z: number,
  ): void {
    const geo = this.unitSphere.clone().toNonIndexed();
    this.pos.set(x, y, z);
    this.quat.identity();
    this.scale.set(rx, ry, rz);
    this.mat4.compose(this.pos, this.quat, this.scale);
    geo.applyMatrix4(this.mat4);
    this.buckets[bucket].push(geo);
  }

  addGeometry(
    bucket: VillaBucketKey,
    rawGeo: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
  ): void {
    const geo = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo.clone();
    rawGeo.dispose();
    this.pos.set(x, y, z);
    this.quat.identity();
    this.scale.set(1, 1, 1);
    this.mat4.compose(this.pos, this.quat, this.scale);
    geo.applyMatrix4(this.mat4);
    this.buckets[bucket].push(geo);
  }

  flushToGroup(
    group: THREE.Group,
    ctx: HouseBuildContext,
    extraMaterials: Record<'poolWater' | 'warmGlow' | 'foliage', THREE.MeshStandardMaterial>,
  ): void {
    this.unitBox.dispose();
    this.unitCyl.dispose();
    this.unitSphere.dispose();

    const entries = Object.entries(this.buckets) as Array<
      [VillaBucketKey, THREE.BufferGeometry[]]
    >;
    for (const [key, geos] of entries) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      ctx.trackGeometry(merged);

      const mat =
        key === 'poolWater' || key === 'warmGlow' || key === 'foliage'
          ? extraMaterials[key]
          : ctx.materials[key];
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `Villa_${key}`;
      const isGlass = key === 'glass' || key === 'glassBacking';
      mesh.castShadow = !isGlass && key !== 'poolWater' && key !== 'warmGlow';
      mesh.receiveShadow = key !== 'glass' && key !== 'warmGlow';
      group.add(mesh);
    }
  }
}

function createHipRoofGeo(
  spanX: number,
  spanZ: number,
  riseH: number,
  ridgeLen: number,
  ridgeAlongX: boolean,
): THREE.BufferGeometry {
  const hx = spanX / 2;
  const hz = spanZ / 2;
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

  // Bottom soffit cap
  pushTri(p0, p3, p2);
  pushTri(p0, p2, p1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a multi-wing Mediterranean / Resort Villa (Вилла):
 * - Stepped travertine stone podium with pool deck terrace & turquoise infinity pool (hasPorch)
 * - Sun loungers, shaded pergola loggia, grand double entry portal with warm lanterns
 * - Multi-volume massing: main living wing, projecting right guest/garage wing, left covered veranda
 * - Cantilevered upper balconies & frameless glass balustrades (hasBalcony when floors >= 2)
 * - 3 distinct roof styles: 'hip' Mediterranean clay tiles, 'flat' Modern cantilevered overhangs,
 *   and 'stepped' Split-level terraced villa with skylight pergola monitor
 * - Tall stone fireplace chimney tower (hasChimney) & timber privacy louvers + planters (hasCornerAccents)
 */
export function buildVilla(config: HouseConfig, ctx: HouseBuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'VillaModel';

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

  const poolWaterMat = new THREE.MeshStandardMaterial({
    name: 'VillaPoolWater',
    color: new THREE.Color('#22b8cf'),
    emissive: new THREE.Color('#0c4a6e'),
    emissiveIntensity: 0.22,
    roughness: 0.08,
    metalness: 0.15,
  });
  const warmGlowMat = new THREE.MeshStandardMaterial({
    name: 'VillaWarmLighting',
    color: new THREE.Color('#fef3c7'),
    emissive: new THREE.Color('#f59e0b'),
    emissiveIntensity: 1.05,
    roughness: 0.25,
  });
  const foliageMat = new THREE.MeshStandardMaterial({
    name: 'VillaGardenFoliage',
    color: new THREE.Color('#4a7c59'),
    roughness: 0.82,
    metalness: 0.02,
  });
  ctx.trackDisposable(poolWaterMat);
  ctx.trackDisposable(warmGlowMat);
  ctx.trackDisposable(foliageMat);

  const batch = new VillaBatcher();
  const baseY = foundationHeight;

  // Massing splits: Main Center-Left Living Hall + Right Projecting Wing + Left Covered Pergola Terrace
  const mainW = width * 0.62;
  const mainD = depth * 0.78;
  const mainX = -width * 0.12;
  const mainZ = -depth * 0.06;

  const wingW = width * 0.36;
  const wingD = depth * 0.92;
  const wingX = width * 0.31;
  const wingZ = depth * 0.04;

  const porchLoggiaW = width * 0.22;
  const porchLoggiaD = mainD * 0.74;
  const porchLoggiaX = mainX - mainW / 2 - porchLoggiaW / 2 + 0.1;
  const porchLoggiaZ = mainZ + 0.35;

  // 1. Stepped Stone Podium Base + Front Pool Deck Terrace
  const podiumW = width + 1.4;
  const podiumD = depth + (hasPorch ? 4.4 : 1.2);
  const podiumCenterZ = hasPorch ? 1.85 : 0.2;
  batch.addBox('foundation', podiumW, foundationHeight, podiumD, 0, foundationHeight / 2, podiumCenterZ);
  batch.addBox(
    'stoneStep',
    podiumW + 0.28,
    0.09,
    podiumD + 0.28,
    0,
    foundationHeight - 0.035,
    podiumCenterZ,
  );

  // Broad travertine steps leading up to the villa terrace on +Z
  const stepZEdge = podiumCenterZ + podiumD / 2;
  const stepCount = Math.max(2, Math.round(foundationHeight / 0.16));
  const stepRise = foundationHeight / stepCount;
  const stepW = Math.min(4.6, width * 0.32);
  const entryStepX = mainX + mainW * 0.08;
  for (let s = 0; s < stepCount; s++) {
    const sy = stepRise * (stepCount - s - 0.5);
    const sz = stepZEdge + 0.14 + s * 0.34 + 0.17;
    batch.addBox('stoneStep', stepW, stepRise, 0.34, entryStepX, sy, sz);
  }

  // 2. Pool Deck, Turquoise Swimming Pool & Sun Loungers (hasPorch)
  if (hasPorch) {
    const poolW = Math.max(4.6, mainW * 0.56);
    const poolD = 3.1;
    const poolX = mainX - mainW * 0.1;
    const poolZ = wingZ + wingD / 2 + 0.55;

    // Raised stone pool coping rim around water basin
    const rimT = 0.26;
    const rimH = 0.12;
    batch.addBox('stoneStep', poolW + rimT * 2, rimH, rimT, poolX, baseY + rimH / 2, poolZ + poolD / 2 + rimT / 2);
    batch.addBox('stoneStep', poolW + rimT * 2, rimH, rimT, poolX, baseY + rimH / 2, poolZ - poolD / 2 - rimT / 2);
    batch.addBox('stoneStep', rimT, rimH, poolD, poolX - poolW / 2 - rimT / 2, baseY + rimH / 2, poolZ);
    batch.addBox('stoneStep', rimT, rimH, poolD, poolX + poolW / 2 + rimT / 2, baseY + rimH / 2, poolZ);

    // Glossy turquoise water surface slightly below coping lip
    batch.addBox('poolWater', poolW, 0.05, poolD, poolX, baseY + 0.06, poolZ);

    // Hardwood sun-lounger deck beside pool (+X side in front of right wing)
    const deckW = Math.max(3.2, wingW * 0.78);
    const deckD = 2.8;
    const deckX = wingX;
    const deckZ = poolZ + 0.05;
    batch.addBox('timberAccent', deckW, 0.05, deckD, deckX, baseY + 0.03, deckZ);

    // Two modern villa sun loungers with raised backrests + pool-side pergola posts & shade louvers
    for (const lxOffset of [-0.62, 0.62]) {
      const lx = deckX + lxOffset;
      batch.addBox('trim', 0.72, 0.18, 1.85, lx, baseY + 0.16, deckZ);
      batch.addBox('trim', 0.72, 0.1, 0.62, lx, baseY + 0.36, deckZ - 0.62, 0.42, 0, 0);
    }
    // Lightweight poolside timber sun-pergola framing the loungers on the right front corner
    const cabH = Math.min(floorHeight - 0.35, 2.85);
    const cabW = deckW - 0.25;
    const cabD = deckD - 0.2;
    for (const [px, pz] of [
      [deckX - cabW / 2 + 0.12, deckZ + cabD / 2 - 0.12],
      [deckX + cabW / 2 - 0.12, deckZ + cabD / 2 - 0.12],
    ]) {
      batch.addBox('timberAccent', 0.14, cabH, 0.14, px, baseY + cabH / 2, pz);
    }
    batch.addBox('trim', cabW + 0.16, 0.14, cabD + 0.2, deckX, baseY + cabH, deckZ);
    for (let s = 0; s <= 5; s++) {
      const sz = deckZ - cabD / 2 + 0.15 + (s / 5) * (cabD - 0.3);
      batch.addBox('timberAccent', cabW, 0.08, 0.06, deckX, baseY + cabH + 0.09, sz);
    }

    // Left covered outdoor veranda / pergola arcade floor & shade beams
    batch.addBox('timberAccent', porchLoggiaW, 0.05, porchLoggiaD, porchLoggiaX, baseY + 0.03, porchLoggiaZ);
    const colPositions: Array<[number, number]> = [
      [porchLoggiaX - porchLoggiaW / 2 + 0.22, porchLoggiaZ + porchLoggiaD / 2 - 0.22],
      [porchLoggiaX - porchLoggiaW / 2 + 0.22, porchLoggiaZ],
      [porchLoggiaX - porchLoggiaW / 2 + 0.22, porchLoggiaZ - porchLoggiaD / 2 + 0.22],
    ];
    for (const [cx, cz] of colPositions) {
      batch.addBox('trim', 0.28, floorHeight - 0.12, 0.28, cx, baseY + (floorHeight - 0.12) / 2, cz);
      batch.addBox('stoneStep', 0.38, 0.18, 0.38, cx, baseY + 0.09, cz);
    }
    // Pergola perimeter fascia beam & slatted timber shade louvers
    batch.addBox('trim', porchLoggiaW + 0.25, 0.22, porchLoggiaD + 0.25, porchLoggiaX, baseY + floorHeight - 0.11, porchLoggiaZ);
    const pergSlats = Math.max(5, Math.floor(porchLoggiaD / 0.48));
    for (let s = 0; s <= pergSlats; s++) {
      const sz = porchLoggiaZ - porchLoggiaD / 2 + 0.2 + (s / pergSlats) * (porchLoggiaD - 0.4);
      batch.addBox('timberAccent', porchLoggiaW - 0.25, 0.1, 0.07, porchLoggiaX, baseY + floorHeight + 0.03, sz);
    }
  }

  // Helper to populate panoramic villa windows & mullions flush onto a wall face
  const addWindowBand = (
    cx: number,
    cy: number,
    cz: number,
    spanLen: number,
    outDir: 1 | -1,
    alongX: boolean,
    isGroundPortal = false,
  ) => {
    const winH = Math.min(floorHeight * 0.72, (isGroundPortal ? 2.55 : 2.1) * windowScale);
    const bayCount = windowDensity + (spanLen > 9 ? 1 : 0);
    const totalGlazeSpan = spanLen * 0.72;
    const winW = Math.min(2.6, (totalGlazeSpan / bayCount) * 0.84);
    const spacing = totalGlazeSpan / bayCount;
    const frameT = 0.075;

    for (let i = 0; i < bayCount; i++) {
      const offset = -totalGlazeSpan / 2 + spacing * (i + 0.5);
      const wx = alongX ? cx + offset : cx;
      const wz = alongX ? cz : cz + offset;

      const backOff = 0.015;
      const glassOff = 0.04;
      const sillOff = 0.06;

      if (alongX) {
        batch.addBox('glassBacking', winW - 0.06, winH - 0.06, 0.03, wx, cy, cz + outDir * backOff);
        batch.addBox('glass', winW - 0.08, winH - 0.08, 0.025, wx, cy, cz + outDir * glassOff);
        batch.addBox('trim', winW + 0.08, frameT, 0.11, wx, cy + winH / 2, cz + outDir * sillOff);
        batch.addBox('stoneStep', winW + 0.14, frameT * 1.15, 0.16, wx, cy - winH / 2, cz + outDir * (sillOff + 0.02));
        batch.addBox('trim', frameT, winH, 0.1, wx - winW / 2, cy, cz + outDir * sillOff);
        batch.addBox('trim', frameT, winH, 0.1, wx + winW / 2, cy, cz + outDir * sillOff);
        batch.addBox('trim', frameT * 0.75, winH - 0.06, 0.09, wx, cy, cz + outDir * sillOff);
      } else {
        batch.addBox('glassBacking', 0.03, winH - 0.06, winW - 0.06, cx + outDir * backOff, cy, wz);
        batch.addBox('glass', 0.025, winH - 0.08, winW - 0.08, cx + outDir * glassOff, cy, wz);
        batch.addBox('trim', 0.11, frameT, winW + 0.08, cx + outDir * sillOff, cy + winH / 2, wz);
        batch.addBox('stoneStep', 0.16, frameT * 1.15, winW + 0.14, cx + outDir * (sillOff + 0.02), cy - winH / 2, wz);
        batch.addBox('trim', 0.1, winH, frameT, cx + outDir * sillOff, cy, wz - winW / 2);
        batch.addBox('trim', 0.1, winH, frameT, cx + outDir * sillOff, cy, wz + winW / 2);
        batch.addBox('trim', 0.09, winH - 0.06, frameT * 0.75, cx + outDir * sillOff, cy, wz);
      }
    }
  };

  // Helper for warm architectural exterior wall sconces
  const addWallSconce = (x: number, y: number, z: number) => {
    batch.addBox('metalAccent', 0.1, 0.22, 0.1, x, y, z);
    batch.addBox('warmGlow', 0.08, 0.12, 0.08, x, y - 0.04, z);
  };

  // 3. Multi-Story Villa Volumes
  // Ground floor: Main Living Hall + Right Wing (lounge/guest suite)
  const gCenterY = baseY + floorHeight / 2;
  batch.addBox('wall', mainW, floorHeight, mainD, mainX, gCenterY, mainZ);
  batch.addBox('wall', wingW, floorHeight, wingD, wingX, gCenterY, wingZ);

  // Horizontal stringcourse belt trim on ground floor top
  batch.addBox('trim', mainW + 0.18, 0.16, mainD + 0.18, mainX, baseY + floorHeight - 0.04, mainZ);
  batch.addBox('trim', wingW + 0.18, 0.16, wingD + 0.18, wingX, baseY + floorHeight - 0.04, wingZ);

  // Main Double Villa Entrance Portal (+Z face of main hall, framed with cantilevered canopy & sconces)
  const doorW = 1.95;
  const doorH = Math.min(floorHeight - 0.45, 2.65);
  const doorX = mainX + mainW * 0.18;
  const doorZ = mainZ + mainD / 2;
  batch.addBox('trim', doorW + 0.28, doorH + 0.18, 0.18, doorX, baseY + doorH / 2, doorZ + 0.04);
  batch.addBox('door', doorW, doorH, 0.1, doorX, baseY + doorH / 2, doorZ + 0.08);
  batch.addBox('glass', doorW * 0.34, doorH * 0.76, 0.04, doorX - doorW * 0.24, baseY + doorH * 0.48, doorZ + 0.14);
  batch.addBox('glass', doorW * 0.34, doorH * 0.76, 0.04, doorX + doorW * 0.24, baseY + doorH * 0.48, doorZ + 0.14);
  batch.addBox('metalAccent', 0.05, 0.65, 0.06, doorX - 0.1, baseY + 1.15, doorZ + 0.16);
  batch.addBox('metalAccent', 0.05, 0.65, 0.06, doorX + 0.1, baseY + 1.15, doorZ + 0.16);
  // Crisp entrance canopy slab with warm recessed light
  batch.addBox('trim', doorW + 1.1, 0.14, 1.35, doorX, baseY + doorH + 0.22, doorZ + 0.65);
  batch.addBox('warmGlow', doorW * 0.5, 0.04, 0.35, doorX, baseY + doorH + 0.14, doorZ + 0.55);
  addWallSconce(doorX - doorW / 2 - 0.32, baseY + 2.0, doorZ + 0.08);
  addWallSconce(doorX + doorW / 2 + 0.32, baseY + 2.0, doorZ + 0.08);

  // Ground panoramic windows on left half of Main Hall + Side/Back facades + Right Wing
  const mainLeftWinX = mainX - mainW * 0.2;
  addWindowBand(mainLeftWinX, baseY + floorHeight * 0.46, mainZ + mainD / 2, mainW * 0.46, 1, true, true);
  addWindowBand(mainX, baseY + floorHeight * 0.5, mainZ - mainD / 2, mainW * 0.82, -1, true, false);
  addWindowBand(mainX - mainW / 2, baseY + floorHeight * 0.48, mainZ, mainD * 0.75, -1, false, true);

  // Right Wing front (+Z) wide lounge/gallery glazing + right flank (+X) windows
  addWindowBand(wingX, baseY + floorHeight * 0.48, wingZ + wingD / 2, wingW * 0.74, 1, true, true);
  addWindowBand(wingX + wingW / 2, baseY + floorHeight * 0.5, wingZ, wingD * 0.72, 1, false, false);
  addWindowBand(wingX, baseY + floorHeight * 0.5, wingZ - wingD / 2, wingW * 0.7, -1, true, false);

  // Upper Floors (Floor 2..floors): stepped / cantilevered upper suite + panoramic sun terrace over right wing
  let topY = baseY + floorHeight;
  let upperMainW = mainW;
  let upperMainD = mainD;
  let upperMainX = mainX;
  let upperMainZ = mainZ;
  let upperWingW = wingW;
  let upperWingD = wingD * 0.68;
  let upperWingX = wingX;
  let upperWingZ = wingZ - wingD * 0.16;

  if (floors >= 2) {
    // Ground-floor right wing becomes a luxury rooftop sun terrace in front (+Z) when floors >= 2
    const terraceZ = wingZ + wingD * 0.34;
    const terraceD = wingD * 0.32;
    batch.addBox('timberAccent', wingW - 0.3, 0.05, terraceD - 0.2, wingX, topY + 0.03, terraceZ);

    if (hasBalcony) {
      // Frameless glass & brushed metal handrail balcony around the right rooftop terrace
      const rx = wingX;
      const rzFront = wingZ + wingD / 2 - 0.06;
      const railH = 0.96;
      batch.addBox('glass', wingW - 0.22, railH, 0.04, rx, topY + railH / 2 + 0.04, rzFront);
      batch.addBox('metalAccent', wingW - 0.16, 0.06, 0.09, rx, topY + railH + 0.05, rzFront);
      batch.addBox('glass', 0.04, railH, terraceD, rx + wingW / 2 - 0.08, topY + railH / 2 + 0.04, terraceZ);
      batch.addBox('metalAccent', 0.09, 0.06, terraceD + 0.06, rx + wingW / 2 - 0.08, topY + railH + 0.05, terraceZ);
      batch.addBox('glass', 0.04, railH, terraceD, rx - wingW / 2 + 0.08, topY + railH / 2 + 0.04, terraceZ);
      batch.addBox('metalAccent', 0.09, 0.06, terraceD + 0.06, rx - wingW / 2 + 0.08, topY + railH + 0.05, terraceZ);

      // Cantilevered glass balcony projecting from main upper bedroom suite (+Z)
      const balcW = mainW * 0.72;
      const balcD = 1.65;
      const balcZ = mainZ + mainD / 2 + balcD / 2 - 0.05;
      batch.addBox('trim', balcW, 0.16, balcD, mainX, topY - 0.04, balcZ);
      batch.addBox('timberAccent', balcW - 0.2, 0.04, balcD - 0.2, mainX, topY + 0.05, balcZ);
      const bzFront = mainZ + mainD / 2 + balcD - 0.1;
      batch.addBox('glass', balcW - 0.14, railH, 0.04, mainX, topY + railH / 2 + 0.05, bzFront);
      batch.addBox('metalAccent', balcW - 0.08, 0.06, 0.08, mainX, topY + railH + 0.06, bzFront);
      for (const sx of [-1, 1]) {
        const sideX = mainX + sx * (balcW / 2 - 0.08);
        batch.addBox('glass', 0.04, railH, balcD - 0.1, sideX, topY + railH / 2 + 0.05, balcZ);
        batch.addBox('metalAccent', 0.08, 0.06, balcD - 0.04, sideX, topY + railH + 0.06, balcZ);
      }
    }

    for (let f = 1; f < floors; f++) {
      const fY = baseY + f * floorHeight;
      const fCenterY = fY + floorHeight / 2;
      // Floor 3 (penthouse belvedere) steps back slightly more
      const shrink = f >= 2 ? 0.78 : 1.0;
      upperMainW = mainW * shrink;
      upperMainD = mainD * shrink;
      upperMainX = mainX;
      upperMainZ = mainZ - (f >= 2 ? 0.55 : 0);

      batch.addBox('wall', upperMainW, floorHeight, upperMainD, upperMainX, fCenterY, upperMainZ);
      batch.addBox('trim', upperMainW + 0.16, 0.14, upperMainD + 0.16, upperMainX, fY + floorHeight - 0.03, upperMainZ);

      addWindowBand(upperMainX, fCenterY, upperMainZ + upperMainD / 2, upperMainW * 0.8, 1, true);
      addWindowBand(upperMainX, fCenterY, upperMainZ - upperMainD / 2, upperMainW * 0.78, -1, true);
      addWindowBand(upperMainX - upperMainW / 2, fCenterY, upperMainZ, upperMainD * 0.72, -1, false);

      if (f === 1) {
        batch.addBox('wall', upperWingW, floorHeight, upperWingD, upperWingX, fCenterY, upperWingZ);
        batch.addBox('trim', upperWingW + 0.16, 0.14, upperWingD + 0.16, upperWingX, fY + floorHeight - 0.03, upperWingZ);
        addWindowBand(upperWingX, fCenterY, upperWingZ + upperWingD / 2, upperWingW * 0.72, 1, true);
        addWindowBand(upperWingX + upperWingW / 2, fCenterY, upperWingZ, upperWingD * 0.68, 1, false);
        addWindowBand(upperWingX, fCenterY, upperWingZ - upperWingD / 2, upperWingW * 0.68, -1, true);
      } else if (f >= 2 && hasBalcony) {
        // Glass rooftop parapet balustrade around Floor 3 setback terrace on +Z
        const pRailY = fY + 0.5;
        const pZFront = mainZ + mainD / 2 - 0.1;
        batch.addBox('glass', mainW - 0.3, 0.92, 0.04, mainX, pRailY, pZFront);
        batch.addBox('metalAccent', mainW - 0.24, 0.06, 0.08, mainX, fY + 0.98, pZFront);
      }
    }
    topY = baseY + floors * floorHeight;
  }

  // 4. Three Distinct Villa Roof Styles: 'hip' (Mediterranean), 'flat' (Modern Cantilever), 'stepped' (Terraced Penthouse)
  const rad = (roofPitchDeg * Math.PI) / 180;
  const mainRoofW = upperMainW + roofOverhang * 2;
  const mainRoofD = upperMainD + roofOverhang * 2;
  const mainSpan = Math.min(upperMainW, upperMainD);
  const hipRise = Math.max(1.15, Math.tan(rad) * (mainSpan / 2));

  if (roofType === 'hip') {
    // Classic Mediterranean terracotta hipped roofs over Main Hall & Right Wing + Porch Pergola
    const ridgeAlongX = mainRoofW >= mainRoofD;
    const ridgeLen = Math.max(0.6, Math.abs(mainRoofW - mainRoofD) + 0.5);
    batch.addGeometry(
      'roof',
      createHipRoofGeo(mainRoofW, mainRoofD, hipRise, ridgeLen, ridgeAlongX),
      upperMainX,
      topY - 0.02,
      upperMainZ,
    );
    // Crisp cornice fascia trim around main eaves
    batch.addBox('trim', mainRoofW + 0.08, 0.14, 0.1, upperMainX, topY - 0.02, upperMainZ + mainRoofD / 2);
    batch.addBox('trim', mainRoofW + 0.08, 0.14, 0.1, upperMainX, topY - 0.02, upperMainZ - mainRoofD / 2);
    batch.addBox('trim', 0.1, 0.14, mainRoofD + 0.08, upperMainX - mainRoofW / 2, topY - 0.02, upperMainZ);
    batch.addBox('trim', 0.1, 0.14, mainRoofD + 0.08, upperMainX + mainRoofW / 2, topY - 0.02, upperMainZ);

    // Secondary hip roof atop the Right Wing (at floor 2 height if floors >= 2, else floor 1)
    const wingRoofY = floors >= 2 ? baseY + 2 * floorHeight : baseY + floorHeight;
    const wRoofW = (floors >= 2 ? upperWingW : wingW) + roofOverhang * 1.65;
    const wRoofD = (floors >= 2 ? upperWingD : wingD) + roofOverhang * 1.65;
    const wX = floors >= 2 ? upperWingX : wingX;
    const wZ = floors >= 2 ? upperWingZ : wingZ;
    const wRise = Math.max(0.95, Math.tan(rad) * (Math.min(wRoofW, wRoofD) * 0.42));
    const wAlongX = wRoofW >= wRoofD;
    const wRidge = Math.max(0.4, Math.abs(wRoofW - wRoofD) + 0.35);
    batch.addGeometry('roof', createHipRoofGeo(wRoofW, wRoofD, wRise, wRidge, wAlongX), wX, wingRoofY - 0.02, wZ);
    batch.addBox('trim', wRoofW + 0.08, 0.12, 0.09, wX, wingRoofY - 0.02, wZ + wRoofD / 2);
    batch.addBox('trim', wRoofW + 0.08, 0.12, 0.09, wX, wingRoofY - 0.02, wZ - wRoofD / 2);
    batch.addBox('trim', 0.09, 0.12, wRoofD + 0.08, wX + wRoofW / 2, wingRoofY - 0.02, wZ);
  } else if (roofType === 'flat') {
    // Modernist Cantilevered Horizontal Roof Slabs with Dark Slate Deck, Timber Soffits & Blade Pergola
    const slabW = upperMainW + roofOverhang * 2.5;
    const slabD = upperMainD + roofOverhang * 2.5;
    batch.addBox('trim', slabW, 0.28, slabD, upperMainX, topY + 0.14, upperMainZ);
    batch.addBox('foundation', slabW - 0.45, 0.08, slabD - 0.45, upperMainX, topY + 0.29, upperMainZ);
    // Warm timber soffit inlay beneath cantilevered overhang
    batch.addBox('timberAccent', slabW - 0.35, 0.04, slabD - 0.35, upperMainX, topY - 0.01, upperMainZ);

    // Right Wing modernist cantilevered slab roof + slatted pergola extension over upper terrace
    const wingRoofY = floors >= 2 ? baseY + 2 * floorHeight : baseY + floorHeight;
    const wSlabW = (floors >= 2 ? upperWingW : wingW) + roofOverhang * 2.0;
    const wSlabD = (floors >= 2 ? upperWingD : wingD) + roofOverhang * 2.2;
    const wX = floors >= 2 ? upperWingX : wingX;
    const wZ = floors >= 2 ? upperWingZ : wingZ;
    batch.addBox('trim', wSlabW, 0.26, wSlabD, wX, wingRoofY + 0.13, wZ);
    batch.addBox('foundation', wSlabW - 0.4, 0.08, wSlabD - 0.4, wX, wingRoofY + 0.27, wZ);
    batch.addBox('timberAccent', wSlabW - 0.3, 0.04, wSlabD - 0.3, wX, wingRoofY - 0.01, wZ);
  } else {
    // 'stepped': Split-Level Terraced Villa Roof + Rooftop Skylight Belvedere Lounge & Pergola
    const slabW = upperMainW + roofOverhang * 1.6;
    const slabD = upperMainD + roofOverhang * 1.6;
    batch.addBox('trim', slabW, 0.22, slabD, upperMainX, topY + 0.11, upperMainZ);
    batch.addBox('roof', slabW - 0.22, 0.1, slabD - 0.22, upperMainX, topY + 0.24, upperMainZ);

    // Right Wing pitched/cantilevered shed roof rising cleanly toward main volume
    const wingRoofY = floors >= 2 ? baseY + 2 * floorHeight : baseY + floorHeight;
    const wSlabW = (floors >= 2 ? upperWingW : wingW) + roofOverhang * 1.5;
    const wSlabD = (floors >= 2 ? upperWingD : wingD) + roofOverhang * 1.5;
    const wX = floors >= 2 ? upperWingX : wingX;
    const wZ = floors >= 2 ? upperWingZ : wingZ;
    batch.addBox('trim', wSlabW, 0.22, wSlabD, wX, wingRoofY + 0.11, wZ);
    batch.addBox('roof', wSlabW - 0.2, 0.1, wSlabD - 0.2, wX, wingRoofY + 0.24, wZ);

    // Glazed Clerestory Rooftop Atrium Pavilion + Slatted Timber Roof Lounge
    const skyW = upperMainW * 0.56;
    const skyD = upperMainD * 0.52;
    const skyH = 1.05;
    batch.addBox('trim', skyW + 0.16, 0.14, skyD + 0.16, upperMainX, topY + 0.32, upperMainZ);
    batch.addBox('glass', skyW - 0.12, skyH, skyD - 0.12, upperMainX, topY + 0.36 + skyH / 2, upperMainZ);
    batch.addBox('warmGlow', skyW * 0.45, skyH * 0.55, skyD * 0.45, upperMainX, topY + 0.36 + skyH / 2, upperMainZ);
    for (const [cx, cz] of [
      [-skyW / 2 + 0.08, -skyD / 2 + 0.08],
      [skyW / 2 - 0.08, -skyD / 2 + 0.08],
      [-skyW / 2 + 0.08, skyD / 2 - 0.08],
      [skyW / 2 - 0.08, skyD / 2 - 0.08],
    ]) {
      batch.addBox('trim', 0.14, skyH + 0.08, 0.14, upperMainX + cx, topY + 0.36 + skyH / 2, upperMainZ + cz);
    }
    batch.addBox('trim', skyW + 0.9, 0.18, skyD + 0.9, upperMainX, topY + 0.4 + skyH + 0.08, upperMainZ);
    batch.addBox('roof', skyW + 0.68, 0.09, skyD + 0.68, upperMainX, topY + 0.4 + skyH + 0.19, upperMainZ);
  }

  // 5. Tall Architectural Stone Fireplace Chimney Stack (hasChimney)
  if (hasChimney) {
    const chimW = 1.15;
    const chimD = 1.05;
    const chimX = upperMainX - upperMainW / 2 + 0.35;
    const chimZ = upperMainZ - upperMainD * 0.28;
    const roofPeakOffset = roofType === 'hip' ? hipRise + 0.75 : roofType === 'stepped' ? 2.35 : 1.35;
    const chimTotalH = floors * floorHeight + roofPeakOffset;
    batch.addBox('chimney', chimW, chimTotalH, chimD, chimX, baseY + chimTotalH / 2, chimZ);
    batch.addBox('stoneStep', chimW + 0.2, 0.16, chimD + 0.2, chimX, baseY + chimTotalH + 0.06, chimZ);
    batch.addBox('metalAccent', chimW * 0.65, 0.22, chimD * 0.65, chimX, baseY + chimTotalH + 0.22, chimZ);
  }

  // 6. Architectural Timber Privacy Louvers & Sculpted Planter Beds (hasCornerAccents)
  if (hasCornerAccents) {
    // Vertical architectural timber louver fins flanking the upper bedroom suite or ground facade
    const louverFloor = floors >= 2 ? 1 : 0;
    const louverY = baseY + louverFloor * floorHeight + floorHeight / 2;
    const louverH = floorHeight - 0.24;
    const louverXBase = mainX - mainW / 2 + 0.35;
    const louverZ = (floors >= 2 ? upperMainZ + upperMainD / 2 : mainZ + mainD / 2) + 0.12;
    for (let l = 0; l < 5; l++) {
      batch.addBox('timberAccent', 0.07, louverH, 0.22, louverXBase + l * 0.24, louverY, louverZ);
    }

    // Sculpted travertine corner planter boxes & Mediterranean shrubs flanking entry & terrace
    const planterSpots: Array<[number, number]> = [
      [entryStepX - stepW / 2 - 0.65, stepZEdge - 0.38],
      [entryStepX + stepW / 2 + 0.65, stepZEdge - 0.38],
      [wingX + wingW / 2 + 0.25, wingZ + wingD / 2 - 0.35],
    ];
    for (const [px, pz] of planterSpots) {
      batch.addBox('stoneStep', 1.15, 0.44, 0.85, px, baseY + 0.22, pz);
      batch.addBox('trim', 1.24, 0.08, 0.94, px, baseY + 0.46, pz);
      batch.addSphere('foliage', 0.36, 0.32, 0.32, px, baseY + 0.72, pz);
      batch.addSphere('foliage', 0.24, 0.24, 0.24, px - 0.24, baseY + 0.64, pz + 0.05);
      batch.addSphere('foliage', 0.24, 0.24, 0.24, px + 0.24, baseY + 0.64, pz - 0.05);
    }
  }

  batch.flushToGroup(group, ctx, {
    poolWater: poolWaterMat,
    warmGlow: warmGlowMat,
    foliage: foliageMat,
  });

  return group;
}
