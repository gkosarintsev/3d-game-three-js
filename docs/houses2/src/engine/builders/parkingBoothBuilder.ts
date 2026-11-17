import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HouseConfig } from '../../types/house';
import type { HouseBuildContext } from './types';

type BoothBucketKey =
  | 'wall'
  | 'roof'
  | 'trim'
  | 'door'
  | 'foundation'
  | 'stoneStep'
  | 'glass'
  | 'metalAccent'
  | 'timberAccent'
  | 'barrierOrange'
  | 'boomRed'
  | 'boomWhite'
  | 'hazardYellow'
  | 'ledCyan'
  | 'signalLight'
  | 'signBlue';

class ParkingBoothBatcher {
  private readonly buckets: Record<BoothBucketKey, THREE.BufferGeometry[]> = {
    wall: [],
    roof: [],
    trim: [],
    door: [],
    foundation: [],
    stoneStep: [],
    glass: [],
    metalAccent: [],
    timberAccent: [],
    barrierOrange: [],
    boomRed: [],
    boomWhite: [],
    hazardYellow: [],
    ledCyan: [],
    signalLight: [],
    signBlue: [],
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
    bucket: BoothBucketKey,
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
    bucket: BoothBucketKey,
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
      : new THREE.CylinderGeometry(radiusTop, radiusBottom, 1, 14).toNonIndexed();
    this.pos.set(x, y, z);
    this.euler.set(rotX, rotY, rotZ);
    this.quat.setFromEuler(this.euler);
    this.scale.set(isUniform ? radiusBottom : 1, height, isUniform ? radiusBottom : 1);
    this.mat4.compose(this.pos, this.quat, this.scale);
    geo.applyMatrix4(this.mat4);
    this.buckets[bucket].push(geo);
  }

  addSphere(
    bucket: BoothBucketKey,
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
    bucket: BoothBucketKey,
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
      'barrierOrange' | 'boomRed' | 'boomWhite' | 'hazardYellow' | 'ledCyan' | 'signalLight' | 'signBlue',
      THREE.MeshStandardMaterial
    >,
  ): void {
    this.unitBox.dispose();
    this.unitCyl.dispose();
    this.unitSphere.dispose();

    const entries = Object.entries(this.buckets) as Array<
      [BoothBucketKey, THREE.BufferGeometry[]]
    >;
    for (const [key, geos] of entries) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      ctx.trackGeometry(merged);

      const mat =
        key === 'barrierOrange' ||
        key === 'boomRed' ||
        key === 'boomWhite' ||
        key === 'hazardYellow' ||
        key === 'ledCyan' ||
        key === 'signalLight' ||
        key === 'signBlue'
          ? extraMaterials[key]
          : ctx.materials[key];
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `ParkingBooth_${key}`;
      const isGlass = key === 'glass';
      const isEmissive = key === 'ledCyan' || key === 'signalLight';
      mesh.castShadow = !isGlass && !isEmissive;
      mesh.receiveShadow = !isGlass && !isEmissive;
      group.add(mesh);
    }
  }
}

function createHipRoofGeo(spanX: number, spanZ: number, riseH: number): THREE.BufferGeometry {
  const hx = spanX / 2;
  const hz = spanZ / 2;
  const ridgeLen = Math.max(0.25, Math.abs(spanX - spanZ) * 0.65);
  const ridgeAlongX = spanX >= spanZ;
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
    uvs.push(a[0] * 0.4, a[2] * 0.4, b[0] * 0.4, b[2] * 0.4, c[0] * 0.4, c[2] * 0.4);
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

/**
 * Builds an architectural Parking Security Booth with Mechanical Barrier Gate (Будка со шлагбаумом):
 * - Offset concrete safety island with yellow/black curb bumpers, RFID ticket kiosk & traffic mirror (hasPorch)
 * - Hollow insulated guardhouse cabin with panoramic glazing (windowDensity 1..3), pass-through tray,
 *   visible interior counter, operator chair & glowing monitor terminal, plus rear access door
 * - Mechanical barrier pedestal cabinet with counterweight, red-and-white striped boom arm & catch fork post;
 *   toggles smoothly between closed (0°) and raised (78° open) via hasBalcony
 * - 3 roof/shelter archetypes: 'flat' modern visor canopy, 'hip' pitched pavilion roof, and
 *   'stepped' full drive-through overhead lane canopy with LED status signal
 * - Rooftop amber strobe beacon, CCTV camera & exterior split AC unit (hasChimney) + crash bollards & 'P' sign (hasCornerAccents)
 */
export function buildParkingBooth(
  config: HouseConfig,
  ctx: HouseBuildContext,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ParkingBoothModel';

  const {
    width,
    depth,
    floorHeight,
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

  const isBarrierOpen = hasBalcony;

  const barrierOrangeMat = new THREE.MeshStandardMaterial({
    name: 'BarrierCabinetOrange',
    color: new THREE.Color('#ea580c'),
    roughness: 0.36,
    metalness: 0.35,
  });
  const boomRedMat = new THREE.MeshStandardMaterial({
    name: 'BarrierBoomRed',
    color: new THREE.Color('#dc2626'),
    roughness: 0.35,
    metalness: 0.15,
  });
  const boomWhiteMat = new THREE.MeshStandardMaterial({
    name: 'BarrierBoomWhite',
    color: new THREE.Color('#f8fafc'),
    roughness: 0.35,
    metalness: 0.1,
  });
  const hazardYellowMat = new THREE.MeshStandardMaterial({
    name: 'SafetyBollardYellow',
    color: new THREE.Color('#eab308'),
    roughness: 0.42,
    metalness: 0.25,
  });
  const ledCyanMat = new THREE.MeshStandardMaterial({
    name: 'BoothMonitorLed',
    color: new THREE.Color('#bae6fd'),
    emissive: new THREE.Color('#0ea5e9'),
    emissiveIntensity: 0.9,
    roughness: 0.25,
  });
  const signalLightMat = new THREE.MeshStandardMaterial({
    name: 'BarrierStatusSignal',
    color: new THREE.Color(isBarrierOpen ? '#bbf7d0' : '#fecaca'),
    emissive: new THREE.Color(isBarrierOpen ? '#22c55e' : '#ef4444'),
    emissiveIntensity: 1.35,
    roughness: 0.22,
  });
  const signBlueMat = new THREE.MeshStandardMaterial({
    name: 'ParkingSignBlue',
    color: new THREE.Color('#1d4ed8'),
    roughness: 0.38,
    metalness: 0.12,
  });

  ctx.trackDisposable(barrierOrangeMat);
  ctx.trackDisposable(boomRedMat);
  ctx.trackDisposable(boomWhiteMat);
  ctx.trackDisposable(hazardYellowMat);
  ctx.trackDisposable(ledCyanMat);
  ctx.trackDisposable(signalLightMat);
  ctx.trackDisposable(signBlueMat);

  const batch = new ParkingBoothBatcher();

  // Position booth on left side of center so booth + 3.9m lane barrier stay balanced around (0, 0, 0)
  const boothX = -1.75;
  const hw = width / 2;
  const hd = depth / 2;
  const gateX = boothX + hw + (hasPorch ? 0.56 : 0.44);
  const laneWidth = 3.9;
  const laneLeft = gateX + 0.34;
  const laneCenterX = laneLeft + laneWidth / 2;
  const baseY = foundationHeight;

  // 1. Concrete Guard Island & Curb Trim (flush right curb edge at gateX + 0.30, cleanly abutting asphalt lane)
  if (hasPorch) {
    const islandLeft = boothX - hw - 0.72;
    const islandRight = gateX + 0.28;
    const islandW = islandRight - islandLeft;
    const islandD = depth + 1.65;
    const islandX = (islandLeft + islandRight) / 2;
    batch.addBox('foundation', islandW, foundationHeight * 0.78, islandD, islandX, (foundationHeight * 0.78) / 2, 0);
    batch.addBox('stoneStep', islandW + 0.12, foundationHeight * 0.24, islandD + 0.12, islandX, foundationHeight * 0.88, 0);
    // Yellow lane-edge curb bumper warning strip along island edge
    batch.addBox('hazardYellow', 0.1, 0.12, islandD * 0.68, islandRight + 0.04, 0.08, 0);
  } else {
    batch.addBox('foundation', width + 0.28, foundationHeight, depth + 0.28, boothX, foundationHeight / 2, 0);
    batch.addBox('stoneStep', width + 0.38, 0.08, depth + 0.38, boothX, foundationHeight - 0.02, 0);
  }

  // 2. Hollow Insulated Booth Walls, Panoramic Observation Glazing, Pass-through Shelf & Interior
  const wallT = 0.14;
  const sillH = windowDensity === 3 ? 0.26 : windowDensity === 2 ? 0.86 : 1.05;
  const headerH = 0.32;
  const rawWinH = Math.max(0.65, floorHeight - sillH - headerH);
  const winH = Math.min(floorHeight - sillH - 0.16, rawWinH * Math.min(1.08, windowScale));
  const winBotY = baseY + sillH;
  const winMidY = winBotY + winH / 2;
  const topY = baseY + floorHeight;

  // Booth interior floor deck (wood plank) & interior ceiling soffit
  batch.addBox('timberAccent', width - wallT * 2, 0.05, depth - wallT * 2, boothX, baseY + 0.025, 0);
  batch.addBox('trim', width - wallT * 2, 0.06, depth - wallT * 2, boothX, topY - 0.05, 0);

  // Interior operator desk counter (along +X lane side & +Z front), glowing monitor, and chair
  const deskX = boothX + hw - wallT - 0.26;
  batch.addBox('timberAccent', 0.44, 0.06, depth - wallT * 2 - 0.24, deskX, baseY + 0.82, 0);
  batch.addBox('trim', 0.4, 0.78, 0.08, deskX, baseY + 0.41, -hd + wallT + 0.2);
  batch.addBox('trim', 0.4, 0.78, 0.08, deskX, baseY + 0.41, hd - wallT - 0.2);
  // Operator monitor screen facing into booth
  batch.addBox('trim', 0.08, 0.36, 0.5, deskX + 0.06, baseY + 1.06, -0.22);
  batch.addBox('ledCyan', 0.02, 0.3, 0.44, deskX + 0.01, baseY + 1.06, -0.22);
  // Swivel chair inside booth
  batch.addCylinder('metalAccent', 0.04, 0.04, 0.45, boothX - 0.15, baseY + 0.24, 0.05);
  batch.addBox('door', 0.44, 0.07, 0.44, boothX - 0.15, baseY + 0.48, 0.05);
  batch.addBox('door', 0.07, 0.46, 0.42, boothX - 0.34, baseY + 0.72, 0.05);

  // Corner structural steel frame posts of booth
  for (const [sx, sz] of [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ]) {
    batch.addBox(
      'trim',
      0.16,
      floorHeight,
      0.16,
      boothX + sx * (hw - 0.08),
      baseY + floorHeight / 2,
      sz * (hd - 0.08),
    );
  }

  // Helper for each perimeter wall with optional window cutout or rear entry door
  const buildBoothSide = (
    side: 'front' | 'back' | 'right' | 'left',
  ) => {
    const isX = side === 'front' || side === 'back';
    const span = (isX ? width : depth) - 0.32;
    const cx = isX ? boothX : side === 'right' ? boothX + hw - wallT / 2 : boothX - hw + wallT / 2;
    const cz = !isX ? 0 : side === 'front' ? hd - wallT / 2 : -hd + wallT / 2;

    if (side === 'left') {
      // Rear entry wall (-X) with solid steel/glazed guard door
      const doorW = Math.min(0.95, span * 0.62);
      const doorH = Math.min(2.05, floorHeight - 0.24);
      const sidePanelW = Math.max(0.25, (span - doorW) / 2);
      batch.addBox('wall', wallT, floorHeight, sidePanelW, cx, baseY + floorHeight / 2, -span / 2 + sidePanelW / 2);
      batch.addBox('wall', wallT, floorHeight, sidePanelW, cx, baseY + floorHeight / 2, span / 2 - sidePanelW / 2);
      batch.addBox('wall', wallT, floorHeight - doorH, doorW, cx, baseY + doorH + (floorHeight - doorH) / 2, 0);
      // Door frame + leaf + upper vision glass + handle
      batch.addBox('trim', wallT + 0.04, doorH, doorW + 0.06, cx, baseY + doorH / 2, 0);
      batch.addBox('door', wallT - 0.03, doorH - 0.08, doorW - 0.06, cx, baseY + doorH / 2, 0);
      batch.addBox('glass', wallT + 0.02, 0.56, doorW * 0.52, cx, baseY + doorH - 0.52, 0);
      batch.addBox('metalAccent', 0.06, 0.16, 0.04, cx - 0.08, baseY + 1.0, doorW * 0.34);
      return;
    }

    // Glazed observation wall (front +Z, lane-facing +X, or back -Z)
    const winW = windowDensity === 1 ? span * 0.58 : span * 0.94;
    const sideWallW = (span - winW) / 2;

    if (isX) {
      // Lower wainscot & upper header fascia
      batch.addBox('wall', span, sillH, wallT, cx, baseY + sillH / 2, cz);
      batch.addBox('wall', span, floorHeight - sillH - winH, wallT, cx, baseY + sillH + winH + (floorHeight - sillH - winH) / 2, cz);
      if (sideWallW > 0.04) {
        batch.addBox('wall', sideWallW, winH, wallT, cx - span / 2 + sideWallW / 2, winMidY, cz);
        batch.addBox('wall', sideWallW, winH, wallT, cx + span / 2 - sideWallW / 2, winMidY, cz);
      }
      // Window frame + clear glass + vertical mullion
      batch.addBox('trim', winW + 0.04, 0.06, wallT + 0.05, cx, winBotY + 0.02, cz);
      batch.addBox('trim', winW + 0.04, 0.06, wallT + 0.05, cx, winBotY + winH - 0.02, cz);
      batch.addBox('glass', winW - 0.06, winH - 0.08, 0.03, cx, winMidY, cz);
      batch.addBox('trim', 0.05, winH - 0.06, wallT * 0.7, cx, winMidY, cz);
    } else {
      // Lane-facing +X wall: includes driver pass-through tray sill & sliding wicket window!
      batch.addBox('wall', wallT, sillH, span, cx, baseY + sillH / 2, cz);
      batch.addBox('wall', wallT, floorHeight - sillH - winH, span, cx, baseY + sillH + winH + (floorHeight - sillH - winH) / 2, cz);
      if (sideWallW > 0.04) {
        batch.addBox('wall', wallT, winH, sideWallW, cx, winMidY, -span / 2 + sideWallW / 2);
        batch.addBox('wall', wallT, winH, sideWallW, cx, winMidY, span / 2 - sideWallW / 2);
      }
      batch.addBox('trim', wallT + 0.05, 0.06, winW + 0.04, cx, winBotY + 0.02, cz);
      batch.addBox('trim', wallT + 0.05, 0.06, winW + 0.04, cx, winBotY + winH - 0.02, cz);
      batch.addBox('glass', 0.03, winH - 0.08, winW - 0.06, cx, winMidY, cz);
      // Sliding wicket mullions + exterior stainless pay shelf facing driver
      batch.addBox('trim', wallT * 0.7, winH - 0.06, 0.05, cx, winMidY, -winW * 0.16);
      batch.addBox('trim', wallT * 0.7, winH - 0.06, 0.05, cx, winMidY, winW * 0.16);
      batch.addBox('metalAccent', 0.28, 0.045, Math.min(1.1, winW * 0.55), cx + 0.15, Math.max(baseY + 0.95, winBotY + 0.04), 0);
    }
  };

  buildBoothSide('front');
  buildBoothSide('back');
  buildBoothSide('right');
  buildBoothSide('left');

  // 3. Three Booth & Lane Roof Canopy Archetypes
  const roofW = width + roofOverhang * 2.1;
  const roofD = depth + roofOverhang * 2.1;
  const rad = (roofPitchDeg * Math.PI) / 180;
  let canopyTopY = topY + 0.25;

  const steppedCanopyY = Math.max(topY + 0.2, baseY + 3.15);

  if (roofType === 'hip') {
    // Classic Pitched Pavilion Booth Roof with exposed fascia trim
    const rise = Math.max(0.5, Math.tan(rad) * (Math.min(roofW, roofD) / 2));
    batch.addBox('trim', roofW + 0.06, 0.12, roofD + 0.06, boothX, topY + 0.04, 0);
    batch.addGeometry('roof', createHipRoofGeo(roofW, roofD, rise), boothX, topY + 0.08, 0);
    canopyTopY = topY + 0.08 + rise;
  } else if (roofType === 'stepped') {
    // Full Drive-Through Overhead Parking Gatehouse Canopy spanning across booth AND vehicle lane
    const totalCanopyW = width + laneWidth + 1.8 + roofOverhang;
    const canopyCenterX = boothX + totalCanopyW / 2 - hw - roofOverhang * 0.55;
    const canopyD = depth + roofOverhang * 1.9;
    const canopyY = steppedCanopyY;

    // Steel box beams & fascia spanning over the lane
    batch.addBox('trim', totalCanopyW + 0.14, 0.18, canopyD + 0.14, canopyCenterX, canopyY + 0.09, 0);
    batch.addBox('roof', totalCanopyW, 0.14, canopyD, canopyCenterX, canopyY + 0.24, 0);
    // Illuminated lane-entry edge strip & underside downlight panel
    batch.addBox('signalLight', 1.4, 0.1, 0.1, laneCenterX, canopyY + 0.09, canopyD / 2 + 0.08);
    batch.addBox('ledCyan', 1.6, 0.04, 0.45, laneCenterX, canopyY - 0.01, 0);

    // Far-side structural steel portal columns supporting the lane canopy (+X side of lane)
    const farColX = Math.max(laneLeft + laneWidth + 0.42, canopyCenterX + totalCanopyW / 2 - 0.32);
    for (const sz of [-1, 1]) {
      const colZ = sz * (canopyD / 2 - 0.32);
      batch.addBox('foundation', 0.38, 0.24, 0.38, farColX, 0.12, colZ);
      batch.addBox('trim', 0.18, canopyY, 0.18, farColX, canopyY / 2, colZ);
    }
    // Support collar connecting booth top to stepped canopy if canopyY > topY
    if (canopyY > topY + 0.06) {
      batch.addBox('wall', width - 0.18, canopyY - topY, depth - 0.18, boothX, topY + (canopyY - topY) / 2, 0);
    }
    canopyTopY = canopyY + 0.32;
  } else {
    // 'flat': Modern Cantilevered Flat Roof with Projecting Front/Lane Ticket Visor
    batch.addBox('trim', roofW + 0.1, 0.14, roofD + 0.1, boothX, topY + 0.07, 0);
    batch.addBox('roof', roofW, 0.12, roofD, boothX, topY + 0.18, 0);
    // Projecting steel-framed glass/metal canopy visor shielding the driver payment window (+X)
    const visorW = Math.max(0.95, roofOverhang * 1.45);
    const visorD = Math.min(depth * 0.9, 2.2);
    const visorX = boothX + hw + visorW / 2 - 0.05;
    const visorY = baseY + Math.min(floorHeight - 0.28, 2.38);
    batch.addBox('trim', visorW, 0.08, visorD, visorX, visorY, 0);
    batch.addBox('ledCyan', visorW * 0.65, 0.03, visorD * 0.6, visorX, visorY - 0.045, 0);
    canopyTopY = topY + 0.25;
  }

  // 4. Mechanical Barrier Gate Pedestal & Striped Boom Arm (Шлагбаум)
  const gateZ = 0.08;
  const gateBaseY = hasPorch ? foundationHeight * 0.96 : 0;

  // Pedestal base plate & main orange powder-coated motor cabinet
  batch.addBox('metalAccent', 0.46, 0.06, 0.42, gateX, gateBaseY + 0.03, gateZ);
  batch.addBox('barrierOrange', 0.38, 0.98, 0.34, gateX, gateBaseY + 0.55, gateZ);
  // Dark service door inset & top bevel cap
  batch.addBox('trim', 0.26, 0.64, 0.03, gateX, gateBaseY + 0.48, gateZ + 0.175);
  batch.addBox('trim', 0.42, 0.09, 0.38, gateX, gateBaseY + 1.07, gateZ);
  // Integrated green/red gate status light dome atop cabinet
  batch.addCylinder('metalAccent', 0.07, 0.07, 0.05, gateX, gateBaseY + 1.14, gateZ);
  batch.addSphere('signalLight', 0.075, 0.085, 0.075, gateX, gateBaseY + 1.21, gateZ);

  // Pivot hub & rotating red-and-white striped boom arm (articulated hinge when under overhead lane canopy)
  const pivotX = gateX + 0.04;
  const pivotY = gateBaseY + 0.9;
  const pivotZ = gateZ + 0.19;
  const isArticulated = roofType === 'stepped';
  const boomAngle = isBarrierOpen ? (isArticulated ? 1.32 : 1.34) : 0;

  batch.addCylinder('metalAccent', 0.09, 0.09, 0.12, pivotX, pivotY, pivotZ, Math.PI / 2, 0, 0);

  // Build segmented red-white boom arm + counterweight spanning neatly across asphalt lane to outer shoulder pad
  const restX = laneLeft + laneWidth + 0.16;
  const boomLen = Math.max(3.6, restX - pivotX - 0.12);
  const segCount = 8;
  const segLen = boomLen / segCount;
  const hingeSeg = 3;
  const hingeLocalX = 0.08 + hingeSeg * segLen;
  const cosA = Math.cos(boomAngle);
  const sinA = Math.sin(boomAngle);
  const hingeWx = pivotX + hingeLocalX * cosA;
  const hingeWy = pivotY + hingeLocalX * sinA;
  const outerAngle = isBarrierOpen && isArticulated ? 0.05 : boomAngle;
  const cosB = Math.cos(outerAngle);
  const sinB = Math.sin(outerAngle);

  const addInnerBoom = (
    bucket: BoothBucketKey,
    localX: number,
    localY: number,
    w: number,
    h: number,
    d: number,
  ) => {
    const wx = pivotX + localX * cosA - localY * sinA;
    const wy = pivotY + localX * sinA + localY * cosA;
    batch.addBox(bucket, w, h, d, wx, wy, pivotZ, 0, 0, boomAngle);
  };

  const addOuterBoom = (
    bucket: BoothBucketKey,
    distFromHinge: number,
    localY: number,
    w: number,
    h: number,
    d: number,
  ) => {
    const wx = hingeWx + distFromHinge * cosB - localY * sinB;
    const wy = hingeWy + distFromHinge * sinB + localY * cosB;
    batch.addBox(bucket, w, h, d, wx, wy, pivotZ, 0, 0, outerAngle);
  };

  // Counterweight bracket (-X side of pivot)
  addInnerBoom('metalAccent', -0.22, 0, 0.38, 0.12, 0.09);
  addInnerBoom('trim', -0.4, 0, 0.18, 0.18, 0.15);

  if (!isArticulated) {
    for (let s = 0; s < segCount; s++) {
      const lx = 0.08 + (s + 0.5) * segLen;
      addInnerBoom(s % 2 === 0 ? 'boomRed' : 'boomWhite', lx, 0, segLen + 0.004, 0.1, 0.055);
    }
    addInnerBoom('trim', 0.08 + boomLen / 2, -0.062, boomLen - 0.08, 0.03, 0.045);
    addInnerBoom('signalLight', 0.08 + boomLen + 0.04, 0, 0.09, 0.1, 0.065);
  } else {
    // Inner articulated boom arm (segments 0..hingeSeg-1)
    for (let s = 0; s < hingeSeg; s++) {
      const lx = 0.08 + (s + 0.5) * segLen;
      addInnerBoom(s % 2 === 0 ? 'boomRed' : 'boomWhite', lx, 0, segLen + 0.004, 0.1, 0.055);
    }
    const innerSpan = hingeSeg * segLen;
    addInnerBoom('trim', 0.08 + innerSpan / 2, -0.062, innerSpan - 0.06, 0.03, 0.045);

    // Folding steel hinge bracket & pivot pin between inner and outer boom sections
    batch.addCylinder('metalAccent', 0.055, 0.055, 0.095, hingeWx, hingeWy, pivotZ, Math.PI / 2, 0, 0);
    batch.addBox('trim', 0.14, 0.13, 0.08, hingeWx, hingeWy, pivotZ, 0, 0, (boomAngle + outerAngle) * 0.5);

    // Outer folding boom arm (segments hingeSeg..segCount-1)
    const outerSegs = segCount - hingeSeg;
    const outerSpan = outerSegs * segLen;
    for (let s = hingeSeg; s < segCount; s++) {
      const dist = (s - hingeSeg + 0.5) * segLen;
      addOuterBoom(s % 2 === 0 ? 'boomRed' : 'boomWhite', dist, 0, segLen + 0.004, 0.1, 0.055);
    }
    addOuterBoom('trim', outerSpan / 2, -0.062, outerSpan - 0.06, 0.03, 0.045);
    addOuterBoom('signalLight', outerSpan + 0.04, 0, 0.09, 0.1, 0.065);
  }

  // Fixed catch-fork receiver post on a concrete pad just outside the right lane stripe
  batch.addBox('foundation', 0.34, 0.1, 0.34, restX, 0.05, pivotZ);
  batch.addBox('metalAccent', 0.24, 0.04, 0.24, restX, 0.11, pivotZ);
  batch.addCylinder('metalAccent', 0.045, 0.045, pivotY - 0.12, restX, (pivotY - 0.12) / 2 + 0.1, pivotZ);
  batch.addBox('trim', 0.14, 0.04, 0.16, restX, pivotY - 0.04, pivotZ);
  batch.addBox('trim', 0.04, 0.14, 0.04, restX, pivotY + 0.02, pivotZ - 0.065);
  batch.addBox('trim', 0.04, 0.14, 0.04, restX, pivotY + 0.02, pivotZ + 0.065);

  // 5. Driver RFID / Ticket Terminal Kiosk & Convex Traffic Mirror (hasPorch)
  if (hasPorch) {
    const kioskX = gateX - 0.04;
    const kioskZ = 1.48;
    const kBaseY = foundationHeight * 0.96;
    batch.addBox('barrierOrange', 0.34, 1.22, 0.34, kioskX, kBaseY + 0.61, kioskZ);
    batch.addBox('trim', 0.38, 0.08, 0.38, kioskX, kBaseY + 1.24, kioskZ);
    // Glowing ticket display screen facing incoming drivers (+X)
    batch.addBox('trim', 0.04, 0.34, 0.24, kioskX + 0.175, kBaseY + 0.96, kioskZ);
    batch.addBox('ledCyan', 0.02, 0.26, 0.18, kioskX + 0.19, kBaseY + 0.96, kioskZ);
    batch.addBox('metalAccent', 0.03, 0.06, 0.12, kioskX + 0.18, kBaseY + 0.72, kioskZ);

    // Pole-mounted convex safety mirror near back-right island corner
    const mirX = gateX - 0.02;
    const mirZ = -hd - 0.42;
    batch.addCylinder('metalAccent', 0.04, 0.04, 2.2, mirX, kBaseY + 1.1, mirZ);
    batch.addCylinder('barrierOrange', 0.26, 0.26, 0.06, mirX, kBaseY + 2.2, mirZ, Math.PI / 2, 0.45, 0);
    batch.addCylinder('metalAccent', 0.21, 0.21, 0.07, mirX + 0.02, kBaseY + 2.2, mirZ + 0.02, Math.PI / 2, 0.45, 0);
  }

  // 6. Rooftop Strobe Beacon, CCTV Security Camera & Split AC Condenser Unit (hasChimney)
  if (hasChimney) {
    // Rooftop amber strobe beacon
    batch.addCylinder('trim', 0.12, 0.1, 0.1, boothX + 0.45, canopyTopY + 0.05, 0.35);
    batch.addCylinder('barrierOrange', 0.085, 0.075, 0.18, boothX + 0.45, canopyTopY + 0.18, 0.35);

    // Security CCTV camera mounted under front-right roof eave pointing down the lane
    const camX = boothX + hw + 0.06;
    const camY = topY - 0.14;
    const camZ = hd - 0.25;
    batch.addBox('metalAccent', 0.18, 0.06, 0.06, camX + 0.06, camY, camZ);
    batch.addBox('boomWhite', 0.26, 0.11, 0.11, camX + 0.2, camY - 0.06, camZ + 0.05, 0.25, 0.35, -0.3);
    batch.addCylinder('trim', 0.04, 0.04, 0.05, camX + 0.3, camY - 0.1, camZ + 0.11, Math.PI / 2, 0, -0.4);

    // Wall-mounted AC condenser box on back (-Z) wall
    batch.addBox('boomWhite', 0.72, 0.52, 0.28, boothX - 0.15, baseY + 0.65, -hd - 0.15);
    batch.addCylinder('trim', 0.18, 0.18, 0.04, boothX - 0.26, baseY + 0.65, -hd - 0.29, Math.PI / 2, 0, 0);
    batch.addBox('metalAccent', 0.06, 0.22, 0.26, boothX - 0.4, baseY + 0.36, -hd - 0.14);
    batch.addBox('metalAccent', 0.06, 0.22, 0.26, boothX + 0.1, baseY + 0.36, -hd - 0.14);
  }

  // 7. Protective Crash Bollards & Blue 'P' Parking Sign (hasCornerAccents)
  if (hasCornerAccents) {
    const bX = gateX + 0.22;
    const bY = hasPorch ? foundationHeight * 0.94 : 0;
    for (const bz of [-hd - 0.52, 1.92]) {
      batch.addCylinder('hazardYellow', 0.085, 0.085, 0.88, bX, bY + 0.44, bz);
      batch.addCylinder('trim', 0.09, 0.09, 0.16, bX, bY + 0.68, bz);
      batch.addSphere('hazardYellow', 0.085, 0.07, 0.085, bX, bY + 0.89, bz);
    }
    // Tall 'P' Parking Sign Post on front-left island corner (clear of roof eaves)
    const signX = boothX - hw - 0.48;
    const signZ = hd + 0.55;
    batch.addCylinder('metalAccent', 0.04, 0.04, 2.5, signX, 1.25, signZ);
    batch.addBox('boomWhite', 0.62, 0.62, 0.05, signX, 2.52, signZ);
    batch.addBox('signBlue', 0.54, 0.54, 0.06, signX, 2.52, signZ);
    // Crisp white letter "P" geometry formed cleanly on front & back face
    for (const faceZ of [signZ + 0.036, signZ - 0.036]) {
      batch.addBox('boomWhite', 0.08, 0.36, 0.014, signX - 0.08, 2.52, faceZ);
      batch.addBox('boomWhite', 0.16, 0.07, 0.014, signX + 0.01, 2.665, faceZ);
      batch.addBox('boomWhite', 0.16, 0.07, 0.014, signX + 0.01, 2.525, faceZ);
      batch.addBox('boomWhite', 0.07, 0.21, 0.014, signX + 0.085, 2.595, faceZ);
    }
  }

  batch.flushToGroup(group, ctx, {
    barrierOrange: barrierOrangeMat,
    boomRed: boomRedMat,
    boomWhite: boomWhiteMat,
    hazardYellow: hazardYellowMat,
    ledCyan: ledCyanMat,
    signalLight: signalLightMat,
    signBlue: signBlueMat,
  });

  return group;
}
