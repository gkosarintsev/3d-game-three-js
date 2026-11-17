import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HouseConfig } from '../../types/house';
import type { HouseBuildContext } from './types';

type SportsBucketKey =
  | 'wall'
  | 'roof'
  | 'trim'
  | 'foundation'
  | 'stoneStep'
  | 'glass'
  | 'metalAccent'
  | 'timberAccent'
  | 'paintZone'
  | 'lineWhite'
  | 'sportOrange'
  | 'lampGlow'
  | 'ledCyan';

class SportsGroundBatcher {
  private readonly buckets: Record<SportsBucketKey, THREE.BufferGeometry[]> = {
    wall: [],
    roof: [],
    trim: [],
    foundation: [],
    stoneStep: [],
    glass: [],
    metalAccent: [],
    timberAccent: [],
    paintZone: [],
    lineWhite: [],
    sportOrange: [],
    lampGlow: [],
    ledCyan: [],
  };

  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly unitCyl = new THREE.CylinderGeometry(1, 1, 1, 12);
  private readonly unitTorus = new THREE.TorusGeometry(1, 0.06, 8, 22);
  private readonly mat4 = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();

  addBox(
    bucket: SportsBucketKey,
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
    bucket: SportsBucketKey,
    radiusBottom: number,
    radiusTop: number,
    height: number,
    x: number,
    y: number,
    z: number,
    rotX = 0,
    rotY = 0,
    rotZ = 0,
  ): void {
    const isUniform = Math.abs(radiusBottom - radiusTop) < 1e-4;
    const geo = isUniform
      ? this.unitCyl.clone().toNonIndexed()
      : new THREE.CylinderGeometry(radiusTop, radiusBottom, 1, 12).toNonIndexed();
    this.pos.set(x, y, z);
    this.euler.set(rotX, rotY, rotZ);
    this.quat.setFromEuler(this.euler);
    this.scale.set(isUniform ? radiusBottom : 1, height, isUniform ? radiusBottom : 1);
    this.mat4.compose(this.pos, this.quat, this.scale);
    geo.applyMatrix4(this.mat4);
    this.buckets[bucket].push(geo);
  }

  addHorizontalRing(
    bucket: SportsBucketKey,
    radius: number,
    x: number,
    y: number,
    z: number,
  ): void {
    const geo = this.unitTorus.clone().toNonIndexed();
    this.pos.set(x, y, z);
    this.euler.set(Math.PI / 2, 0, 0);
    this.quat.setFromEuler(this.euler);
    this.scale.set(radius, radius, radius);
    this.mat4.compose(this.pos, this.quat, this.scale);
    geo.applyMatrix4(this.mat4);
    this.buckets[bucket].push(geo);
  }

  addBeamSpan(
    bucket: SportsBucketKey,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    thickness: number,
  ): void {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-4) return;
    const geo = this.unitBox.clone().toNonIndexed();
    const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
    this.quat.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    this.pos.set((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
    this.scale.set(len, thickness, thickness);
    this.mat4.compose(this.pos, this.quat, this.scale);
    geo.applyMatrix4(this.mat4);
    this.buckets[bucket].push(geo);
  }

  addArcLine(
    bucket: SportsBucketKey,
    cx: number,
    y: number,
    cz: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    segments: number,
    lineW = 0.08,
    lineH = 0.016,
  ): void {
    const step = (endAngle - startAngle) / segments;
    for (let i = 0; i < segments; i++) {
      const a0 = startAngle + i * step;
      const a1 = a0 + step;
      const x0 = cx + Math.cos(a0) * radius;
      const z0 = cz + Math.sin(a0) * radius;
      const x1 = cx + Math.cos(a1) * radius;
      const z1 = cz + Math.sin(a1) * radius;
      const mx = (x0 + x1) * 0.5;
      const mz = (z0 + z1) * 0.5;
      const segLen = Math.hypot(x1 - x0, z1 - z0) + lineW * 0.45;
      const angle = Math.atan2(z1 - z0, x1 - x0);
      this.addBox(bucket, segLen, lineH, lineW, mx, y, mz, 0, -angle, 0);
    }
  }

  addGeometry(
    bucket: SportsBucketKey,
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
    extraMaterials: Record<
      'paintZone' | 'lineWhite' | 'sportOrange' | 'lampGlow' | 'ledCyan',
      THREE.MeshStandardMaterial
    >,
  ): void {
    this.unitBox.dispose();
    this.unitCyl.dispose();
    this.unitTorus.dispose();

    const entries = Object.entries(this.buckets) as Array<
      [SportsBucketKey, THREE.BufferGeometry[]]
    >;
    for (const [key, geos] of entries) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      ctx.trackGeometry(merged);

      const mat =
        key === 'paintZone' ||
        key === 'lineWhite' ||
        key === 'sportOrange' ||
        key === 'lampGlow' ||
        key === 'ledCyan'
          ? extraMaterials[key]
          : ctx.materials[key];
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `SportsGround_${key}`;
      const isGlass = key === 'glass';
      const isEmissive = key === 'lampGlow' || key === 'ledCyan';
      mesh.castShadow = !isGlass && !isEmissive && key !== 'lineWhite' && key !== 'paintZone';
      mesh.receiveShadow = !isGlass && !isEmissive;
      group.add(mesh);
    }
  }
}

/**
 * Builds an Outdoor Multi-Sport Court & Athletic Complex (Спортивная площадка):
 * - Concrete curb plinth + outer run-off apron (roof material) + central tartan rubberized playing court (wall material)
 * - Crisp raised 3D court markings: sidelines, center line, center circle, 3-point arcs & painted key/penalty zones
 * - Three court archetypes:
 *   1) 'flat': Basketball / Streetball court with dual cantilevered gooseneck hoops, tempered glass backboards & rims
 *   2) 'stepped': Multisport cage combining steel mini-football goal cages beneath basketball hoop towers at both ends
 *   3) 'gable': Covered all-weather sports court sheltered by a high steel truss gable canopy
 * - Tall perimeter ball-stop fence (trim finish) with vertical mesh bars & entrance gate; full 360 cage toggle (hasBalcony)
 * - 3-tier spectator bleachers & players' bench (hasPorch), 4 corner LED floodlight masts (hasChimney),
 *   outdoor calisthenics workout station + electronic scoreboard (hasCornerAccents)
 */
export function buildSportsGround(
  config: HouseConfig,
  ctx: HouseBuildContext,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'SportsGroundModel';

  const {
    width,
    depth,
    floorHeight: fenceH,
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
    hasBalcony: fullFrontFence,
  } = config.features;

  // Custom athletic materials with >= 0.25 roughness contrast against steel trim & painted rubber
  const paintZoneMat = new THREE.MeshStandardMaterial({
    name: 'CourtKeyZoneBlue',
    color: new THREE.Color('#2563eb'),
    roughness: 0.85,
    metalness: 0.02,
  });
  const lineWhiteMat = new THREE.MeshStandardMaterial({
    name: 'CourtLineWhite',
    color: new THREE.Color('#f8fafc'),
    roughness: 0.72,
    metalness: 0.0,
  });
  const sportOrangeMat = new THREE.MeshStandardMaterial({
    name: 'BasketballRimOrange',
    color: new THREE.Color('#ea580c'),
    roughness: 0.34,
    metalness: 0.38,
  });
  const lampGlowMat = new THREE.MeshStandardMaterial({
    name: 'FloodlightLed',
    color: new THREE.Color('#fef9c3'),
    emissive: new THREE.Color('#fde047'),
    emissiveIntensity: 1.25,
    roughness: 0.2,
  });
  const ledCyanMat = new THREE.MeshStandardMaterial({
    name: 'ScoreboardLed',
    color: new THREE.Color('#38bdf8'),
    emissive: new THREE.Color('#0ea5e9'),
    emissiveIntensity: 1.15,
    roughness: 0.25,
  });

  ctx.trackDisposable(paintZoneMat);
  ctx.trackDisposable(lineWhiteMat);
  ctx.trackDisposable(sportOrangeMat);
  ctx.trackDisposable(lampGlowMat);
  ctx.trackDisposable(ledCyanMat);

  const batch = new SportsGroundBatcher();

  const apronMargin = Math.max(0.5, roofOverhang * 1.15);
  const totalW = width + apronMargin * 2;
  const totalD = depth + apronMargin * 2;
  const hw = width / 2;
  const hd = depth / 2;
  const baseY = foundationHeight;

  // 1. Concrete Foundation Plinth, Perimeter Run-off Apron & Tartan Playing Deck
  batch.addBox('foundation', totalW + 0.4, foundationHeight * 0.82, totalD + 0.4, 0, (foundationHeight * 0.82) / 2, 0);
  batch.addBox('stoneStep', totalW + 0.56, foundationHeight * 0.22, totalD + 0.56, 0, foundationHeight * 0.9, 0);

  // Outer run-off athletic safety border (uses roof material for customizable perimeter contrast)
  batch.addBox('roof', totalW, 0.036, totalD, 0, baseY + 0.018, 0);
  // Central rubberized EPDM/tartan playing court (uses wall material)
  batch.addBox('wall', width, 0.036, depth, 0, baseY + 0.038, 0);

  // 2. Crisp Non-Z-Fighting 3D Court Markings
  const lineY = baseY + 0.066;
  const zoneY = baseY + 0.056;
  const lineW = 0.09;
  const lineH = 0.016;

  // Outer playing boundary rectangle
  batch.addBox('lineWhite', width, lineH, lineW, 0, lineY, hd - lineW / 2);
  batch.addBox('lineWhite', width, lineH, lineW, 0, lineY, -hd + lineW / 2);
  batch.addBox('lineWhite', lineW, lineH, depth, -hw + lineW / 2, lineY, 0);
  batch.addBox('lineWhite', lineW, lineH, depth, hw - lineW / 2, lineY, 0);

  // Half-court division line & center jump/kickoff circle
  batch.addBox('lineWhite', lineW, lineH, depth, 0, lineY, 0);
  const centerR = Math.min(2.2, depth * 0.16);
  batch.addArcLine('lineWhite', 0, lineY, 0, centerR, 0, Math.PI * 2, 24, lineW, lineH);
  // Subtle colored center circle fill
  batch.addCylinder('paintZone', centerR * 0.55, centerR * 0.55, 0.016, 0, zoneY, 0);

  const isMultisport = roofType === 'stepped';
  const isCoveredCanopy = roofType === 'gable';
  const keyLen = Math.min(4.6, width * 0.2);
  const keyWid = Math.min(4.8, depth * 0.36);
  const arcR = Math.min(5.2, Math.min(width * 0.28, depth * 0.41));

  for (const dir of [-1, 1]) {
    // Painted basketball key / football penalty box
    const kx = dir * (hw - keyLen / 2 - 0.04);
    batch.addBox('paintZone', keyLen, 0.016, keyWid, kx, zoneY, 0);
    // White key outline
    batch.addBox('lineWhite', keyLen, lineH, lineW, kx, lineY, keyWid / 2);
    batch.addBox('lineWhite', keyLen, lineH, lineW, kx, lineY, -keyWid / 2);
    batch.addBox('lineWhite', lineW, lineH, keyWid, dir * (hw - keyLen), lineY, 0);

    // Three-point / penalty semi-circle arc
    const startA = dir === -1 ? -Math.PI * 0.44 : Math.PI * 0.56;
    const endA = dir === -1 ? Math.PI * 0.44 : Math.PI * 1.44;
    batch.addArcLine('lineWhite', dir * (hw - 1.15), lineY, 0, arcR, startA, endA, 18, lineW, lineH);

    // Free-throw circle
    batch.addArcLine('lineWhite', dir * (hw - keyLen), lineY, 0, Math.min(1.5, keyWid * 0.34), 0, Math.PI * 2, 16, lineW * 0.85, lineH);
  }

  // 3. Basketball Gooseneck Stanchions & Optional Steel Mini-Football Goal Cages
  const hoopScale = Math.max(0.88, Math.min(1.18, windowScale));
  const rimH = 3.05;
  const boardW = 1.65 * hoopScale;
  const boardH = 1.05 * hoopScale;

  for (const dir of [-1, 1]) {
    const postX = dir * (hw + 0.55);
    const boardX = dir * (hw - 0.65);

    if (isMultisport) {
      // Combined Mini-Football / Futsal Goal Cage (3.0m wide x 2.0m tall) integrated at end baseline
      const goalW = Math.min(3.2, depth * 0.3);
      const goalH = 2.0;
      const goalD = 0.85;
      const frontX = dir * (hw - 0.08);
      const backX = dir * (hw + goalD);

      // Goal front posts & crossbar (crisp white painted steel)
      batch.addCylinder('lineWhite', 0.055, 0.055, goalH, frontX, baseY + goalH / 2, -goalW / 2);
      batch.addCylinder('lineWhite', 0.055, 0.055, goalH, frontX, baseY + goalH / 2, goalW / 2);
      batch.addBox('lineWhite', 0.11, 0.11, goalW + 0.11, frontX, baseY + goalH, 0);

      // Rear goal cage ground frame & diagonal back supports
      batch.addBox('trim', goalD, 0.07, 0.07, (frontX + backX) / 2, baseY + 0.05, -goalW / 2);
      batch.addBox('trim', goalD, 0.07, 0.07, (frontX + backX) / 2, baseY + 0.05, goalW / 2);
      batch.addBox('trim', 0.07, 0.07, goalW, backX, baseY + 0.05, 0);
      batch.addBeamSpan('trim', frontX, baseY + goalH, -goalW / 2, backX, baseY + 0.05, -goalW / 2, 0.06);
      batch.addBeamSpan('trim', frontX, baseY + goalH, goalW / 2, backX, baseY + 0.05, goalW / 2, 0.06);
      batch.addBox('trim', 0.05, 0.05, goalW, (frontX + backX) / 2, baseY + goalH * 0.55, 0);

      // Subtle back net mesh vertical bars inside goal cage
      const netCount = 6;
      for (let ni = 1; ni < netCount; ni++) {
        const nz = -goalW / 2 + (goalW * ni) / netCount;
        batch.addBeamSpan('metalAccent', frontX, baseY + goalH, nz, backX, baseY + 0.05, nz, 0.02);
      }

      // Elevated Basketball Tower rising directly behind the goal center
      const towerX = backX + dir * 0.25;
      batch.addBox('foundation', 0.34, 0.14, 0.34, towerX, baseY + 0.07, 0);
      batch.addBox('trim', 0.16, rimH + 0.55, 0.16, towerX, baseY + (rimH + 0.55) / 2, 0);
      batch.addBeamSpan('trim', towerX, baseY + rimH + 0.42, 0, boardX, baseY + rimH + 0.28, 0, 0.12);
    } else {
      // Classic Basketball Stanchion with protective base sleeve & overhanging gooseneck arm
      batch.addBox('foundation', 0.36, 0.14, 0.36, postX, baseY + 0.07, 0);
      batch.addCylinder('sportOrange', 0.11, 0.11, 1.35, postX, baseY + 0.72, 0);
      batch.addCylinder('trim', 0.085, 0.085, rimH + 0.65, postX, baseY + (rimH + 0.65) / 2, 0);
      batch.addBeamSpan('trim', postX, baseY + rimH + 0.48, 0, boardX, baseY + rimH + 0.34, 0, 0.13);
    }

    // Backboard frame, transparent acrylic glass & shooter square
    const boardCenterY = baseY + rimH + boardH * 0.32;
    batch.addBox('trim', 0.05, boardH + 0.08, boardW + 0.08, boardX + dir * 0.03, boardCenterY, 0);
    batch.addBox('glass', 0.035, boardH, boardW, boardX, boardCenterY, 0);
    // White shooter target rectangle on board face
    const targetZ = 0.26 * hoopScale;
    const faceX = boardX - dir * 0.025;
    batch.addBox('lineWhite', 0.015, 0.04, targetZ * 2, faceX, baseY + rimH + 0.06, 0);
    batch.addBox('lineWhite', 0.015, 0.04, targetZ * 2, faceX, baseY + rimH + 0.48 * hoopScale, 0);
    batch.addBox('lineWhite', 0.015, 0.42 * hoopScale, 0.04, faceX, baseY + rimH + 0.26 * hoopScale, -targetZ);
    batch.addBox('lineWhite', 0.015, 0.42 * hoopScale, 0.04, faceX, baseY + rimH + 0.26 * hoopScale, targetZ);

    // Orange steel rim & stylized net basket cone
    const rimX = boardX - dir * 0.34;
    batch.addBox('sportOrange', 0.14, 0.045, 0.12, boardX - dir * 0.08, baseY + rimH, 0);
    batch.addHorizontalRing('sportOrange', 0.24, rimX, baseY + rimH, 0);
    batch.addCylinder('lineWhite', 0.13, 0.22, 0.38, rimX, baseY + rimH - 0.2, 0);
  }

  // 4. Perimeter Ball-Stop Fence & Entrance Gate
  const fenceX = totalW / 2 - 0.18;
  const fenceZ = totalD / 2 - 0.18;
  const postStep = windowDensity === 3 ? 2.6 : windowDensity === 2 ? 3.2 : 4.0;
  const barStep = windowDensity === 3 ? 0.55 : windowDensity === 2 ? 0.75 : 1.0;

  const buildFenceSegment = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    height: number,
    withMesh: boolean,
  ) => {
    const segLen = Math.hypot(bx - ax, bz - az);
    if (segLen < 0.3) return;
    const postCount = Math.max(2, Math.round(segLen / postStep) + 1);
    for (let i = 0; i < postCount; i++) {
      const t = i / (postCount - 1);
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      batch.addBox('trim', 0.09, height, 0.09, px, baseY + height / 2, pz);
    }

    const railLevels = height > 1.8 ? [0.22, height * 0.52, height - 0.05] : [0.22, height - 0.05];
    for (const ry of railLevels) {
      batch.addBeamSpan('trim', ax, baseY + ry, az, bx, baseY + ry, bz, 0.055);
    }

    if (withMesh) {
      const meshCount = Math.max(2, Math.floor(segLen / barStep));
      for (let m = 1; m < meshCount; m++) {
        const t = m / meshCount;
        const mx = ax + (bx - ax) * t;
        const mz = az + (bz - az) * t;
        batch.addCylinder('metalAccent', 0.014, 0.014, height - 0.26, mx, baseY + (height + 0.16) / 2, mz);
      }
    }
  };

  // Left (-X), Right (+X), and Back (-Z) tall ball-stop perimeter cage walls
  buildFenceSegment(-fenceX, -fenceZ, -fenceX, fenceZ, fenceH, true);
  buildFenceSegment(fenceX, -fenceZ, fenceX, fenceZ, fenceH, true);
  buildFenceSegment(-fenceX, -fenceZ, fenceX, -fenceZ, fenceH, true);

  // Front (+Z) perimeter: wide central entrance gateway (3.2m wide); either low 1.15m viewing rail or full cage
  const frontH = fullFrontFence ? fenceH : 1.18;
  const gateHalfW = 1.65;
  buildFenceSegment(-fenceX, fenceZ, -gateHalfW, fenceZ, frontH, true);
  buildFenceSegment(gateHalfW, fenceZ, fenceX, fenceZ, frontH, true);
  if (fullFrontFence) {
    // Overhead transom bar framing entry doorway
    batch.addBox('trim', gateHalfW * 2 + 0.14, 0.1, 0.1, 0, baseY + Math.min(2.6, fenceH - 0.2), fenceZ);
  }

  // 5. Optional Covered All-Weather Sports Canopy ('gable')
  if (isCoveredCanopy) {
    const rad = (roofPitchDeg * Math.PI) / 180;
    const canopyClearY = baseY + Math.max(fenceH + 1.5, 4.7);
    const canopyW = totalW + 0.8;
    const canopyD = totalD + 0.8;
    const ridgeRise = Math.max(1.4, Math.tan(rad) * (canopyD / 2) * 0.55);
    const colCountX = Math.max(4, Math.round(canopyW / 5.5) + 1);

    for (let i = 0; i < colCountX; i++) {
      const cx = -canopyW / 2 + 0.4 + ((canopyW - 0.8) * i) / (colCountX - 1);
      // Heavy portal steel columns along -Z and +Z outside fence
      for (const sz of [-1, 1]) {
        const cz = sz * (canopyD / 2 - 0.25);
        batch.addBox('foundation', 0.42, 0.26, 0.42, cx, baseY + 0.13, cz);
        batch.addBox('trim', 0.2, canopyClearY - baseY, 0.2, cx, baseY + (canopyClearY - baseY) / 2, cz);
      }
      // Steel gable roof truss rafters spanning across depth
      batch.addBeamSpan('trim', cx, canopyClearY, -canopyD / 2, cx, canopyClearY + ridgeRise, 0, 0.14);
      batch.addBeamSpan('trim', cx, canopyClearY + ridgeRise, 0, cx, canopyClearY, canopyD / 2, 0.14);
      batch.addBeamSpan('metalAccent', cx, canopyClearY, -canopyD / 2 + 0.3, cx, canopyClearY, canopyD / 2 - 0.3, 0.08);
    }

    // Two pitched roof deck slopes + central skylight glass ridge band
    const halfSpanZ = canopyD / 2;
    const slopeLen = Math.hypot(halfSpanZ, ridgeRise);
    const slopeAngle = Math.atan2(ridgeRise, halfSpanZ);
    const midSlopeY = canopyClearY + ridgeRise * 0.5 + 0.08;
    batch.addBox('roof', canopyW, 0.1, slopeLen, 0, midSlopeY, -halfSpanZ / 2, slopeAngle, 0, 0);
    batch.addBox('roof', canopyW, 0.1, slopeLen, 0, midSlopeY, halfSpanZ / 2, -slopeAngle, 0, 0);
    // Ridge vent/skylight cap
    batch.addBox('glass', canopyW - 0.6, 0.12, 1.35, 0, canopyClearY + ridgeRise + 0.08, 0);
  }

  // 6. Three-Tier Spectator Bleachers & Players' Bench (hasPorch)
  if (hasPorch) {
    // 3-tier grandstand along the back (-Z) outside fence facing +Z toward the camera & court
    const standW = Math.min(width * 0.56, 12.5);
    const standZ = isCoveredCanopy ? -fenceZ - 2.15 : -fenceZ - 1.35;
    batch.addBox('foundation', standW + 0.4, baseY + 0.06, 2.5, 0, (baseY + 0.06) / 2, standZ);
    for (let tier = 0; tier < 3; tier++) {
      const ty = baseY + 0.38 + tier * 0.44;
      const tz = standZ + 0.68 - tier * 0.68;
      batch.addBox('timberAccent', standW, 0.09, 0.48, 0, ty, tz);
      // Steel bench risers
      for (const sx of [-standW * 0.42, 0, standW * 0.42]) {
        batch.addBox('trim', 0.12, ty - baseY, 0.14, sx, baseY + (ty - baseY) / 2, tz);
      }
    }
    // Side & back bleacher safety railings
    batch.addBox('trim', standW, 0.06, 0.06, 0, baseY + 1.95, standZ - 0.96);
    for (const sx of [-standW / 2, -standW / 6, standW / 6, standW / 2]) {
      batch.addBox('trim', 0.06, 0.85, 0.06, sx, baseY + 1.55, standZ - 0.96);
    }

    // Two team rest benches flanking the front (+Z) entry gate inside/outside court apron
    for (const bx of [-4.2, 4.2]) {
      const bz = fenceZ - 0.42;
      batch.addBox('timberAccent', 2.4, 0.07, 0.44, bx, baseY + 0.45, bz);
      batch.addBox('trim', 0.08, 0.44, 0.36, bx - 0.95, baseY + 0.22, bz);
      batch.addBox('trim', 0.08, 0.44, 0.36, bx + 0.95, baseY + 0.22, bz);
    }
  }

  // 7. Four Corner Stadium-Style Floodlight Masts (hasChimney)
  if (hasChimney) {
    const mastH = Math.max(fenceH + 2.6, isCoveredCanopy ? fenceH + 3.4 : fenceH + 2.6);
    const mastTopY = baseY + mastH;
    const mxOff = fenceX + 0.38;
    const mzOff = fenceZ + 0.38;
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const mx = sx * mxOff;
      const mz = sz * mzOff;
      batch.addBox('foundation', 0.42, baseY + 0.24, 0.42, mx, (baseY + 0.24) / 2, mz);
      batch.addCylinder('trim', 0.08, 0.12, mastH, mx, baseY + mastH / 2, mz);
      // Angled crossarm aiming inward toward center court
      const inX = mx - sx * 0.45;
      const inZ = mz - sz * 0.35;
      batch.addBeamSpan('trim', mx, mastTopY, mz, inX, mastTopY - 0.12, inZ, 0.09);
      const yaw = Math.atan2(-sz, -sx);
      batch.addBox('trim', 0.22, 0.36, 0.88, inX, mastTopY - 0.14, inZ, 0, -yaw, 0.35);
      batch.addBox('lampGlow', 0.08, 0.28, 0.78, inX - sx * 0.1, mastTopY - 0.18, inZ - sz * 0.08, 0, -yaw, 0.35);
    }
  }

  // 8. Street Workout Rig & Electronic Scoreboard (hasCornerAccents)
  if (hasCornerAccents) {
    // Electronic scoreboard mounted prominently on -Z fence frame
    const sbY = baseY + fenceH + 0.45;
    batch.addBox('trim', 2.8, 0.96, 0.18, 0, sbY, -fenceZ);
    batch.addBox('ledCyan', 0.82, 0.48, 0.04, -0.68, sbY + 0.05, -fenceZ + 0.1);
    batch.addBox('sportOrange', 0.82, 0.48, 0.04, 0.68, sbY + 0.05, -fenceZ + 0.1);
    batch.addBox('lineWhite', 0.22, 0.26, 0.04, 0, sbY + 0.05, -fenceZ + 0.1);
    // Support uprights down to fence rail
    batch.addBox('trim', 0.1, 0.6, 0.1, -1.0, baseY + fenceH + 0.08, -fenceZ);
    batch.addBox('trim', 0.1, 0.6, 0.1, 1.0, baseY + fenceH + 0.08, -fenceZ);

    // Adjacent Outdoor Street Workout Rig (rubber mat + pull-up/dip/monkey bars) on right shoulder (+X)
    const woX = fenceX + 2.35;
    const woZ = 1.4;
    batch.addBox('foundation', 3.4, baseY + 0.02, 5.2, woX, (baseY + 0.02) / 2, woZ);
    batch.addBox('roof', 3.1, 0.04, 4.8, woX, baseY + 0.04, woZ);
    // Pull-up & monkey-bar station (4 tall vertical posts + top horizontal rungs)
    const pCoords: Array<[number, number, number]> = [
      [woX - 0.85, woZ - 1.5, 2.35],
      [woX + 0.85, woZ - 1.5, 2.35],
      [woX - 0.85, woZ + 0.1, 2.35],
      [woX + 0.85, woZ + 0.1, 2.35],
    ];
    for (const [px, pz, ph] of pCoords) {
      batch.addCylinder('sportOrange', 0.055, 0.055, ph, px, baseY + ph / 2, pz);
    }
    // Side bars & overhead monkey-bar ladder rungs
    batch.addBeamSpan('metalAccent', woX - 0.85, baseY + 2.28, woZ - 1.5, woX - 0.85, baseY + 2.28, woZ + 0.1, 0.05);
    batch.addBeamSpan('metalAccent', woX + 0.85, baseY + 2.28, woZ - 1.5, woX + 0.85, baseY + 2.28, woZ + 0.1, 0.05);
    for (let r = 0; r < 5; r++) {
      const rz = woZ - 1.35 + r * 0.34;
      batch.addBeamSpan('metalAccent', woX - 0.85, baseY + 2.28, rz, woX + 0.85, baseY + 2.28, rz, 0.042);
    }
    // Parallel dip bars on front side of workout mat
    for (const px of [woX - 0.45, woX + 0.45]) {
      batch.addCylinder('sportOrange', 0.045, 0.045, 1.3, px, baseY + 0.65, woZ + 0.95);
      batch.addCylinder('sportOrange', 0.045, 0.045, 1.3, px, baseY + 0.65, woZ + 2.0);
      batch.addBeamSpan('metalAccent', px, baseY + 1.28, woZ + 0.95, px, baseY + 1.28, woZ + 2.0, 0.048);
    }
  }

  batch.flushToGroup(group, ctx, {
    paintZone: paintZoneMat,
    lineWhite: lineWhiteMat,
    sportOrange: sportOrangeMat,
    lampGlow: lampGlowMat,
    ledCyan: ledCyanMat,
  });

  return group;
}
