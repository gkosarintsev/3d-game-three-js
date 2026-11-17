import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HouseConfig } from '../../types/house';
import type { HouseBuildContext } from './types';

type MallBucketKey =
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
  | 'signBlue'
  | 'signCoral'
  | 'signAmber'
  | 'signDark'
  | 'foliageGreen';

type ExtraMallMatKey = 'signBlue' | 'signCoral' | 'signAmber' | 'signDark' | 'foliageGreen';

class ShoppingMallBatcher {
  private readonly buckets: Record<MallBucketKey, THREE.BufferGeometry[]> = {
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
    signBlue: [],
    signCoral: [],
    signAmber: [],
    signDark: [],
    foliageGreen: [],
  };

  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly unitCyl = new THREE.CylinderGeometry(1, 1, 1, 14);
  private readonly mat4 = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();

  addBox(
    bucket: MallBucketKey,
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
    bucket: MallBucketKey,
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
    bucket: MallBucketKey,
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
    extraMaterials: Record<ExtraMallMatKey, THREE.MeshStandardMaterial>,
  ): void {
    this.unitBox.dispose();
    this.unitCyl.dispose();

    for (const [key, geos] of Object.entries(this.buckets) as Array<
      [MallBucketKey, THREE.BufferGeometry[]]
    >) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      ctx.trackGeometry(merged);

      const mat =
        key in extraMaterials
          ? extraMaterials[key as ExtraMallMatKey]
          : ctx.materials[key as keyof typeof ctx.materials];
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `ShoppingMall_${key}`;
      const isGlass = key === 'glass';
      const isSignEmissive = key === 'signBlue' || key === 'signCoral' || key === 'signAmber';
      mesh.castShadow = !isGlass && !isSignEmissive;
      mesh.receiveShadow = !isGlass && !isSignEmissive;
      group.add(mesh);
    }
  }
}

function createVaultedGableGeometry(spanX: number, lenZ: number, riseH: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-spanX / 2, 0);
  shape.lineTo(spanX / 2, 0);
  shape.lineTo(spanX * 0.22, riseH);
  shape.lineTo(-spanX * 0.22, riseH);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: lenZ, bevelEnabled: false });
  geo.translate(0, 0, -lenZ / 2);
  return geo;
}

/**
 * Builds a Contemporary Commercial Shopping Mall (Торговый молл):
 * - Massive multi-story anchor department wings with horizontal architectural cladding reveals
 * - Grand forward-projecting glazed central atrium lobby with curtain wall mullions,
 *   multi-bay glass entrance doors & cantilevered steel-and-glass marquee canopy
 * - Ground-floor retail boutique vitrines and illuminated brand lightbox signage boards
 * - Three commercial roof formats:
 *   1) 'flat': Long central stepped glass skylight atrium spine + commercial parapet
 *   2) 'stepped': Setback upper food-court / cinema multiplex terrace block with glass curtain wall
 *   3) 'gable': Sculptural vaulted wave-gable skylight atrium crowning the shopping gallery
 * - Entrance plaza canopy, planters & bollards (hasPorch),
 *   rooftop HVAC chillers & tall freestanding mall totem pylon sign (hasChimney),
 *   facade vertical fins, stone pilasters & brand lightboxes (hasCornerAccents),
 *   and upper-level food-court cantilevered terrace balcony (hasBalcony)
 */
export function buildShoppingMall(config: HouseConfig, ctx: HouseBuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ShoppingMallAssembly';

  const batcher = new ShoppingMallBatcher();

  const signBlue = new THREE.MeshStandardMaterial({
    name: 'Mall_SignBlue',
    color: new THREE.Color('#38bdf8'),
    emissive: new THREE.Color('#0284c7'),
    emissiveIntensity: 0.9,
    roughness: 0.24,
    metalness: 0.12,
  });
  const signCoral = new THREE.MeshStandardMaterial({
    name: 'Mall_SignCoral',
    color: new THREE.Color('#fb7185'),
    emissive: new THREE.Color('#e11d48'),
    emissiveIntensity: 0.85,
    roughness: 0.24,
    metalness: 0.12,
  });
  const signAmber = new THREE.MeshStandardMaterial({
    name: 'Mall_SignAmber',
    color: new THREE.Color('#fbbf24'),
    emissive: new THREE.Color('#d97706'),
    emissiveIntensity: 0.85,
    roughness: 0.24,
    metalness: 0.12,
  });
  const signDark = new THREE.MeshStandardMaterial({
    name: 'Mall_SignDark',
    color: new THREE.Color('#1e293b'),
    roughness: 0.42,
    metalness: 0.35,
  });
  const foliageGreen = new THREE.MeshStandardMaterial({
    name: 'Mall_PlanterFoliage',
    color: new THREE.Color('#4d7c4f'),
    roughness: 0.86,
    metalness: 0.02,
  });

  const extraMaterials: Record<ExtraMallMatKey, THREE.MeshStandardMaterial> = {
    signBlue,
    signCoral,
    signAmber,
    signDark,
    foliageGreen,
  };
  for (const mat of Object.values(extraMaterials)) {
    ctx.trackDisposable(mat);
  }

  const { width, depth, floors, floorHeight, foundationHeight, roofPitchDeg, roofOverhang } =
    config.dimensions;
  const {
    roofType,
    windowDensity,
    windowScale,
    hasPorch,
    hasChimney,
    hasCornerAccents,
    hasBalcony,
  } = config.features;

  const wallH = floors * floorHeight;
  const wallBaseY = foundationHeight;
  const roofY = wallBaseY + wallH;

  // 1. Wide commercial podium foundation plinth + entrance steps
  batcher.addBox('foundation', width + 1.2, foundationHeight * 0.75, depth + 1.2, 0, foundationHeight * 0.375, 0);
  batcher.addBox('stoneStep', width + 1.4, foundationHeight * 0.25, depth + 1.4, 0, foundationHeight * 0.875, 0);

  // 2. Main anchor retail volume + projecting central glazed atrium wing
  const atriumW = Math.max(12.0, Math.min(width * 0.36, 22.0));
  const atriumProj = Math.min(4.2, depth * 0.14);
  const atriumD = depth + atriumProj * 2;
  const wingW = (width - atriumW) / 2;

  // Left & right anchor wings
  batcher.addBox('wall', wingW, wallH, depth, -atriumW / 2 - wingW / 2, wallBaseY + wallH / 2, 0);
  batcher.addBox('wall', wingW, wallH, depth, atriumW / 2 + wingW / 2, wallBaseY + wallH / 2, 0);

  // Central atrium core (slightly taller crown parapet for strong center anchor)
  const atriumBonusH = 1.15;
  batcher.addBox(
    'stoneStep',
    atriumW + 0.4,
    wallH + atriumBonusH,
    atriumD,
    0,
    wallBaseY + (wallH + atriumBonusH) / 2,
    0,
  );
  batcher.addBox(
    'trim',
    atriumW + 0.56,
    0.48,
    atriumD + 0.16,
    0,
    wallBaseY + wallH + atriumBonusH + 0.24,
    0,
  );

  // Horizontal architectural floor reveal bands across both anchor wings
  for (let fl = 1; fl <= floors; fl++) {
    const bandY = wallBaseY + fl * floorHeight;
    batcher.addBox('metalAccent', wingW + 0.14, 0.24, depth + 0.14, -atriumW / 2 - wingW / 2, bandY, 0);
    batcher.addBox('metalAccent', wingW + 0.14, 0.24, depth + 0.14, atriumW / 2 + wingW / 2, bandY, 0);
  }

  // 3. Central Atrium Glazed Curtain Wall (front +Z and rear -Z)
  const atriumFrontZ = atriumD / 2;
  const atriumBackZ = -atriumD / 2;
  const glassWallW = atriumW - 1.4;
  const glassWallH = wallH + atriumBonusH - 1.1;
  const glassWallY = wallBaseY + 0.35 + glassWallH / 2;

  for (const [zFace, dir] of [
    [atriumFrontZ, 1],
    [atriumBackZ, -1],
  ] as Array<[number, number]>) {
    // Deep recessed interior atrium backing, glass pane, and mullions (monotonic Z!)
    batcher.addBox('glassBacking', glassWallW, glassWallH, 0.08, 0, glassWallY, zFace + dir * 0.03);
    batcher.addBox('glass', glassWallW, glassWallH, 0.05, 0, glassWallY, zFace + dir * 0.075);

    const mullionCols = Math.max(4, Math.round(glassWallW / 2.2) + windowDensity);
    for (let c = 0; c <= mullionCols; c++) {
      const mx = -glassWallW / 2 + (c / mullionCols) * glassWallW;
      batcher.addBox('metalAccent', 0.12, glassWallH + 0.1, 0.12, mx, glassWallY, zFace + dir * 0.12);
    }
    for (let fl = 1; fl <= floors; fl++) {
      const ty = wallBaseY + fl * floorHeight;
      batcher.addBox('metalAccent', glassWallW + 0.15, 0.18, 0.14, 0, ty, zFace + dir * 0.13);
    }
  }

  // Grand double-bay glass mall entrance doors on +Z atrium
  const doorBayW = Math.min(7.2, glassWallW * 0.62);
  const doorH = Math.min(3.4, floorHeight * 0.74);
  batcher.addBox('signDark', doorBayW + 0.4, doorH + 0.25, 0.22, 0, wallBaseY + doorH / 2, atriumFrontZ + 0.16);
  batcher.addBox('glass', doorBayW, doorH, 0.08, 0, wallBaseY + doorH / 2, atriumFrontZ + 0.24);
  const doorLeaves = 4;
  for (let d = 0; d <= doorLeaves; d++) {
    const dx = -doorBayW / 2 + (d / doorLeaves) * doorBayW;
    batcher.addBox('metalAccent', 0.09, doorH, 0.14, dx, wallBaseY + doorH / 2, atriumFrontZ + 0.27);
  }

  // 4. Ground-floor retail boutique vitrines & upper-story ribbon windows on both wings
  const wingFrontZ = depth / 2;
  const wingBackZ = -depth / 2;
  const baysPerWing = Math.max(2, Math.min(5, Math.round(wingW / 5.4) + (windowDensity - 1)));
  const baySpan = (wingW - 2.4) / baysPerWing;
  const vitrineW = Math.min(baySpan * 0.76, 3.8 * windowScale);
  const vitrineH = Math.min(floorHeight * 0.68 * windowScale, floorHeight - 0.9);

  for (const sideSign of [-1, 1] as const) {
    const wingCenterX = sideSign * (atriumW / 2 + wingW / 2);

    for (let b = 0; b < baysPerWing; b++) {
      const bx = wingCenterX - (wingW - 2.4) / 2 + baySpan * (b + 0.5);
      // Ground-floor shop vitrine on front +Z
      const vy = wallBaseY + 0.4 + vitrineH / 2;
      batcher.addBox('trim', vitrineW + 0.18, vitrineH + 0.16, 0.08, bx, vy, wingFrontZ + 0.03);
      batcher.addBox('glassBacking', vitrineW, vitrineH, 0.05, bx, vy, wingFrontZ + 0.065);
      batcher.addBox('glass', vitrineW, vitrineH, 0.04, bx, vy, wingFrontZ + 0.095);
      batcher.addBox('metalAccent', 0.07, vitrineH, 0.06, bx, vy, wingFrontZ + 0.12);

      // Upper-story boutique/gallery clerestory windows on alternating bays
      if (floors >= 2 && b % 2 === 0) {
        for (let fl = 1; fl < floors; fl++) {
          const uy = wallBaseY + fl * floorHeight + floorHeight * 0.52;
          const uw = vitrineW * 0.88;
          const uh = floorHeight * 0.48 * windowScale;
          batcher.addBox('trim', uw + 0.14, uh + 0.12, 0.07, bx, uy, wingFrontZ + 0.028);
          batcher.addBox('glassBacking', uw, uh, 0.04, bx, uy, wingFrontZ + 0.06);
          batcher.addBox('glass', uw, uh, 0.035, bx, uy, wingFrontZ + 0.088);
        }
      }

      // Rear service / emergency bays & upper windows on -Z
      if (b % 2 === 1) {
        batcher.addBox('door', 1.5, 2.4, 0.08, bx, wallBaseY + 1.2, wingBackZ - 0.03);
      }
    }

    // Side facade architectural glazing strip + loading/service door
    const sideX = sideSign * (width / 2);
    const sideGlassW = Math.min(depth * 0.45, 12.0);
    batcher.addBox('glassBacking', 0.06, vitrineH, sideGlassW, sideX + sideSign * 0.03, wallBaseY + 0.4 + vitrineH / 2, depth * 0.16);
    batcher.addBox('glass', 0.05, vitrineH, sideGlassW, sideX + sideSign * 0.065, wallBaseY + 0.4 + vitrineH / 2, depth * 0.16);
    batcher.addBox('door', 0.08, 2.7, 2.8, sideX + sideSign * 0.04, wallBaseY + 1.35, -depth * 0.28);
  }

  // 5. Media Lightbox Billboards, Facade Louver Fins & Corner Pilasters (hasCornerAccents)
  if (hasCornerAccents) {
    const signBuckets: ExtraMallMatKey[] = ['signBlue', 'signCoral', 'signAmber'];

    // Anchor billboard lightboxes on upper facade of left & right wings
    for (const [idx, sideSign] of ([-1, 1] as const).entries()) {
      const wingCenterX = sideSign * (atriumW / 2 + wingW / 2);
      const boardW = Math.min(wingW * 0.56, 8.8);
      const boardH = Math.min(floorHeight * 0.62, 2.8);
      const boardY = wallBaseY + wallH - floorHeight * 0.48;
      batcher.addBox('signDark', boardW + 0.35, boardH + 0.35, 0.22, wingCenterX, boardY, wingFrontZ + 0.12);
      batcher.addBox(signBuckets[idx % signBuckets.length], boardW, boardH, 0.1, wingCenterX, boardY, wingFrontZ + 0.25);

      // Vertical architectural louver fins flanking each wing
      const finCount = windowDensity + 3;
      for (let f = 0; f < finCount; f++) {
        const fx = wingCenterX - wingW * 0.44 + (f / (finCount - 1)) * wingW * 0.88;
        batcher.addBox('metalAccent', 0.14, wallH - 0.8, 0.38, fx, wallBaseY + wallH / 2, wingFrontZ + 0.16);
      }

      // Heavy corner cladding pilasters
      batcher.addBox('stoneStep', 0.9, wallH + 0.4, 0.9, sideSign * (width / 2 - 0.35), wallBaseY + wallH / 2, wingFrontZ - 0.35);
      batcher.addBox('stoneStep', 0.9, wallH + 0.4, 0.9, sideSign * (width / 2 - 0.35), wallBaseY + wallH / 2, wingBackZ + 0.35);
    }

    // Illuminated Mall Crown Signboard mounted atop the central atrium facade
    const crownSignW = Math.min(atriumW * 0.72, 11.5);
    const crownSignY = roofY + atriumBonusH + 0.75;
    batcher.addBox('signDark', crownSignW + 0.5, 1.35, 0.28, 0, crownSignY, atriumFrontZ - 0.15);
    batcher.addBox('signAmber', crownSignW, 0.92, 0.14, 0, crownSignY, atriumFrontZ + 0.02);
  }

  // 6. Three Commercial Roof Archetypes
  batcher.addBox('roof', width + 0.2, 0.22, depth + 0.2, 0, roofY + 0.11, 0);
  // Roof parapet coping around perimeter
  batcher.addBox('trim', width + 0.4, 0.85, 0.32, 0, roofY + 0.425, -depth / 2);
  batcher.addBox('trim', wingW + 0.2, 0.85, 0.32, -atriumW / 2 - wingW / 2, roofY + 0.425, depth / 2);
  batcher.addBox('trim', wingW + 0.2, 0.85, 0.32, atriumW / 2 + wingW / 2, roofY + 0.425, depth / 2);
  batcher.addBox('trim', 0.32, 0.85, depth + 0.4, -width / 2, roofY + 0.425, 0);
  batcher.addBox('trim', 0.32, 0.85, depth + 0.4, width / 2, roofY + 0.425, 0);

  if (roofType === 'flat') {
    // Long central vaulted/stepped glass skylight spine running through the mall
    const skyW = atriumW * 0.58;
    const skyL = depth * 0.86;
    batcher.addBox('metalAccent', skyW + 0.5, 0.65, skyL + 0.5, 0, roofY + 0.45, 0);
    batcher.addBox('glass', skyW, 1.15, skyL, 0, roofY + 1.15, 0);
    const ribCount = 7;
    for (let r = 0; r < ribCount; r++) {
      const rz = -skyL / 2 + (r / (ribCount - 1)) * skyL;
      batcher.addBox('metalAccent', skyW + 0.3, 1.32, 0.18, 0, roofY + 1.2, rz);
    }
  } else if (roofType === 'stepped') {
    // Upper multiplex cinema / panoramic food-court setback volume
    const upperW = width * 0.54;
    const upperD = depth * 0.56;
    const upperH = floorHeight * 0.88;
    batcher.addBox('wall', upperW, upperH, upperD, 0, roofY + upperH / 2, -depth * 0.06);
    batcher.addBox('roof', upperW + 0.5, 0.28, upperD + 0.5, 0, roofY + upperH + 0.14, -depth * 0.06);
    batcher.addBox('glassBacking', upperW * 0.72, upperH * 0.62, 0.08, 0, roofY + upperH * 0.52, -depth * 0.06 + upperD / 2 + 0.03);
    batcher.addBox('glass', upperW * 0.72, upperH * 0.62, 0.05, 0, roofY + upperH * 0.52, -depth * 0.06 + upperD / 2 + 0.07);
    batcher.addBox('signCoral', upperW * 0.42, 0.75, 0.14, 0, roofY + upperH + 0.58, -depth * 0.06 + upperD / 2);
  } else {
    // 'gable' Sculptural vaulted skylight gallery running along the atrium axis
    const pitchRad = (roofPitchDeg * Math.PI) / 180;
    const ridgeH = Math.max(2.6, Math.tan(pitchRad) * (depth * 0.24));
    const vaultGeo = createVaultedGableGeometry(atriumW * 0.82, atriumD - 0.6, ridgeH);
    batcher.addGeometry('glass', vaultGeo, 0, roofY + atriumBonusH, 0);
    // Steel ribs hugging the vaulted atrium roof
    const ribCount = 8;
    for (let r = 0; r < ribCount; r++) {
      const rz = -atriumD / 2 + 0.6 + (r / (ribCount - 1)) * (atriumD - 1.2);
      batcher.addBox('metalAccent', atriumW * 0.86, 0.26, 0.24, 0, roofY + atriumBonusH + ridgeH, rz);
      batcher.addBox('metalAccent', atriumW * 0.86, 0.24, 0.24, 0, roofY + atriumBonusH + 0.1, rz);
    }
  }

  // 7. Upper-level Food-Court Cantilevered Terrace Balcony (hasBalcony)
  if (hasBalcony) {
    const terrY = wallBaseY + floorHeight * 1.18 + 0.15;
    const terrD = 2.4;
    const terrW = atriumW * 0.84;
    const terrZ = atriumFrontZ + terrD / 2;
    batcher.addBox('stoneStep', terrW, 0.24, terrD, 0, terrY, terrZ);
    // Glass balustrade railing around front & sides
    batcher.addBox('glass', terrW - 0.2, 0.95, 0.05, 0, terrY + 0.58, atriumFrontZ + terrD - 0.08);
    batcher.addBox('metalAccent', terrW, 0.08, 0.1, 0, terrY + 1.08, atriumFrontZ + terrD - 0.08);
    batcher.addBox('metalAccent', 0.1, 0.08, terrD, -terrW / 2 + 0.05, terrY + 1.08, terrZ);
    batcher.addBox('metalAccent', 0.1, 0.08, terrD, terrW / 2 - 0.05, terrY + 1.08, terrZ);
  }

  // 8. Sculptural Entrance Canopy Marquee, Plaza Planters & Bollards (hasPorch)
  if (hasPorch) {
    const canopyD = Math.min(4.8, 3.2 + roofOverhang * 1.1);
    const canopyW = atriumW + 2.8;
    const canopyY = wallBaseY + Math.min(3.85, floorHeight * 0.78);
    const canopyZ = atriumFrontZ + canopyD / 2;

    batcher.addBox('metalAccent', canopyW, 0.24, canopyD, 0, canopyY, canopyZ);
    batcher.addBox('glass', canopyW - 0.8, 0.08, canopyD - 0.6, 0, canopyY + 0.14, canopyZ);
    // Angled steel support columns at front corners of marquee
    for (const sx of [-canopyW * 0.42, canopyW * 0.42]) {
      batcher.addCylinder('metalAccent', 0.16, 0.16, canopyY - wallBaseY, sx, wallBaseY + (canopyY - wallBaseY) / 2, atriumFrontZ + canopyD - 0.45);
    }

    // Front granite plaza steps
    batcher.addBox('stoneStep', canopyW + 2.0, foundationHeight * 0.5, 2.2, 0, foundationHeight * 0.25, atriumFrontZ + 1.6);

    // Architectural concrete planters with greenery & bollards flanking entrance plaza
    for (const px of [-atriumW * 0.68, -atriumW * 0.46, atriumW * 0.46, atriumW * 0.68]) {
      const pz = atriumFrontZ + canopyD + 1.1;
      batcher.addBox('stoneStep', 2.2, 0.55, 1.3, px, 0.275, pz);
      batcher.addBox('foliageGreen', 1.85, 0.48, 0.95, px, 0.72, pz);
    }
    for (let b = -3; b <= 3; b++) {
      if (Math.abs(b) <= 1) continue;
      batcher.addCylinder('signDark', 0.09, 0.08, 0.78, b * 1.6, 0.39, atriumFrontZ + canopyD + 1.8);
    }
  }

  // 9. Rooftop HVAC Chillers & Tall Freestanding Road/Plaza Mall Totem Pylon (hasChimney)
  if (hasChimney) {
    for (const sideSign of [-1, 1] as const) {
      const hx = sideSign * (atriumW / 2 + wingW * 0.55);
      batcher.addBox('stoneStep', 3.4, 1.1, 2.2, hx, roofY + 0.75, -depth * 0.18);
      batcher.addBox('metalAccent', 2.8, 0.35, 1.8, hx, roofY + 1.4, -depth * 0.18);
      batcher.addCylinder('metalAccent', 0.45, 0.45, 0.35, hx - 0.8, roofY + 1.65, -depth * 0.18);
      batcher.addCylinder('metalAccent', 0.45, 0.45, 0.35, hx + 0.8, roofY + 1.65, -depth * 0.18);
    }

    // Tall illuminated freestanding mall totem pylon sign in the front corner plaza
    const pylonX = width / 2 - 1.5;
    const pylonZ = atriumFrontZ + 5.2;
    const pylonH = Math.max(8.5, wallH * 0.68);
    batcher.addBox('stoneStep', 2.4, 0.6, 1.3, pylonX, 0.3, pylonZ);
    batcher.addBox('signDark', 1.85, pylonH, 0.72, pylonX, 0.6 + pylonH / 2, pylonZ);
    batcher.addBox('signBlue', 1.45, 1.1, 0.82, pylonX, pylonH - 0.9, pylonZ);
    batcher.addBox('signAmber', 1.45, 0.85, 0.82, pylonX, pylonH - 2.3, pylonZ);
    batcher.addBox('signCoral', 1.45, 0.85, 0.82, pylonX, pylonH - 3.6, pylonZ);
  }

  batcher.flushToGroup(group, ctx, extraMaterials);
  return group;
}
