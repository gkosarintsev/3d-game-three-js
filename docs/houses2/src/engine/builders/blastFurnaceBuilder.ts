import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HouseConfig } from '../../types/house';
import type { HouseBuildContext } from './types';

type MaterialBucketKey =
  | 'wall'
  | 'roof'
  | 'trim'
  | 'door'
  | 'foundation'
  | 'stoneStep'
  | 'glass'
  | 'glassBacking'
  | 'metalAccent'
  | 'chimney'
  | 'warningRed'
  | 'warningWhite'
  | 'hazardYellow'
  | 'pipeRust'
  | 'cisternPaint'
  | 'furnaceGlow';

class BlastFurnaceBatcher {
  private readonly buckets: Record<MaterialBucketKey, THREE.BufferGeometry[]> = {
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
    warningRed: [],
    warningWhite: [],
    hazardYellow: [],
    pipeRust: [],
    cisternPaint: [],
    furnaceGlow: [],
  };

  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly unitCyl = new THREE.CylinderGeometry(1, 1, 1, 18);
  private readonly unitSphere = new THREE.SphereGeometry(1, 16, 12);
  private readonly mat4 = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();

  addBox(
    bucket: MaterialBucketKey,
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
    bucket: MaterialBucketKey,
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
      : new THREE.CylinderGeometry(radiusTop, radiusBottom, 1, 18).toNonIndexed();
    this.pos.set(x, y, z);
    this.euler.set(rotX, rotY, rotZ);
    this.quat.setFromEuler(this.euler);
    this.scale.set(isUniform ? radiusBottom : 1, height, isUniform ? radiusBottom : 1);
    this.mat4.compose(this.pos, this.quat, this.scale);
    geo.applyMatrix4(this.mat4);
    this.buckets[bucket].push(geo);
  }

  addDomeCap(
    bucket: MaterialBucketKey,
    radius: number,
    heightScale: number,
    x: number,
    y: number,
    z: number,
  ): void {
    const geo = this.unitSphere.clone().toNonIndexed();
    this.pos.set(x, y, z);
    this.quat.identity();
    this.scale.set(radius, radius * heightScale, radius);
    this.mat4.compose(this.pos, this.quat, this.scale);
    geo.applyMatrix4(this.mat4);
    this.buckets[bucket].push(geo);
  }

  addPipePath(
    bucket: MaterialBucketKey,
    points: THREE.Vector3[],
    radius: number,
    withFlanges = true,
  ): void {
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.25);
    const tube = new THREE.TubeGeometry(curve, Math.max(12, points.length * 6), radius, 10, false);
    const nonIdx = tube.toNonIndexed();
    tube.dispose();
    this.buckets[bucket].push(nonIdx);

    if (withFlanges && points.length >= 2) {
      // Add bolted collar rings at intermediate joints & ends
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const prev = points[Math.max(0, i - 1)];
        const next = points[Math.min(points.length - 1, i + 1)];
        const dir = next.clone().sub(prev);
        if (dir.lengthSq() < 1e-6) continue;
        dir.normalize();
        const collar = new THREE.CylinderGeometry(radius * 1.24, radius * 1.24, radius * 0.45, 12).toNonIndexed();
        this.quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        this.pos.copy(p);
        this.scale.set(1, 1, 1);
        this.mat4.compose(this.pos, this.quat, this.scale);
        collar.applyMatrix4(this.mat4);
        this.buckets['trim'].push(collar);
      }
    }
  }

  addHorizontalCistern(
    bucket: MaterialBucketKey,
    radius: number,
    length: number,
    x: number,
    y: number,
    z: number,
    alongZ = false,
  ): void {
    // Concrete saddle supports grounded at y = foundationY -> handled by caller saddle height
    if (alongZ) {
      this.addCylinder(bucket, radius, radius, length, x, y, z, Math.PI / 2, 0, 0);
      this.addDomeCap(bucket, radius, 0.72, x, y, z - length / 2);
      this.addDomeCap(bucket, radius, 0.72, x, y, z + length / 2);
      this.addCylinder('trim', radius + 0.05, radius + 0.05, 0.14, x, y, z - length * 0.26, Math.PI / 2, 0, 0);
      this.addCylinder('trim', radius + 0.05, radius + 0.05, 0.14, x, y, z + length * 0.26, Math.PI / 2, 0, 0);
    } else {
      this.addCylinder(bucket, radius, radius, length, x, y, z, 0, 0, Math.PI / 2);
      this.addDomeCap(bucket, radius, 0.72, x - length / 2, y, z);
      this.addDomeCap(bucket, radius, 0.72, x + length / 2, y, z);
      this.addCylinder('trim', radius + 0.05, radius + 0.05, 0.14, x - length * 0.26, y, z, 0, 0, Math.PI / 2);
      this.addCylinder('trim', radius + 0.05, radius + 0.05, 0.14, x + length * 0.26, y, z, 0, 0, Math.PI / 2);
    }
  }

  addGeometry(
    bucket: MaterialBucketKey,
    rawGeo: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    rotY = 0,
  ): void {
    const geo = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo.clone();
    rawGeo.dispose();
    this.pos.set(x, y, z);
    this.euler.set(0, rotY, 0);
    this.quat.setFromEuler(this.euler);
    this.scale.set(1, 1, 1);
    this.mat4.compose(this.pos, this.quat, this.scale);
    geo.applyMatrix4(this.mat4);
    this.buckets[bucket].push(geo);
  }

  flushToGroup(
    group: THREE.Group,
    ctx: HouseBuildContext,
    extraMaterials: Record<
      'warningRed' | 'warningWhite' | 'hazardYellow' | 'pipeRust' | 'cisternPaint' | 'furnaceGlow',
      THREE.MeshStandardMaterial
    >,
  ): void {
    this.unitBox.dispose();
    this.unitCyl.dispose();
    this.unitSphere.dispose();

    const entries = Object.entries(this.buckets) as Array<
      [MaterialBucketKey, THREE.BufferGeometry[]]
    >;

    for (const [key, geos] of entries) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      ctx.trackGeometry(merged);

      const mat =
        key === 'warningRed' ||
        key === 'warningWhite' ||
        key === 'hazardYellow' ||
        key === 'pipeRust' ||
        key === 'cisternPaint' ||
        key === 'furnaceGlow'
          ? extraMaterials[key]
          : ctx.materials[key];
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `BlastFurnace_${key}`;
      const isGlass = key === 'glass' || key === 'glassBacking';
      mesh.castShadow = !isGlass && key !== 'furnaceGlow';
      mesh.receiveShadow = key !== 'glass' && key !== 'furnaceGlow';
      group.add(mesh);
    }
  }
}

function createGableCapGeo(width: number, depth: number, rise: number): THREE.BufferGeometry {
  const hd = depth / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-hd, 0);
  shape.lineTo(hd, 0);
  shape.lineTo(0, rise);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds an integrated metallurgical Blast Furnace Complex as a single unified structure:
 * - Unified reinforced concrete machinery slab plinth
 * - Hero Blast Furnace tower (hearth, bustle pipe & tuyeres, bosh, belly, shaft, throat)
 * - 4-post structural steel framework with ring walkways & stair flights
 * - Tightly packed cluster of 3 domed Cowper Hot-Blast Stoves + collector breeching duct
 * - Cyclone Dust-Catcher & Wet Scrubber Tower linked via sweeping overhead gas downcomer
 * - Tightly clustered horizontal & vertical pressurized cistern tanks & interlocking pipe manifolds
 * - Inclined steel truss Skip Hoist bridge climbing to the furnace top charging bell
 * - Front Cast-House hall (Литейный двор) with molten-metal glow bay & torpedo-car canopy
 * - Tall tapered industrial Smokestack with red/white aviation warning bands
 */
export function buildBlastFurnace(
  config: HouseConfig,
  ctx: HouseBuildContext,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'BlastFurnaceModel';

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

  const warningRedMat = new THREE.MeshStandardMaterial({
    name: 'FurnaceWarningRed',
    color: new THREE.Color('#c23b2b'),
    roughness: 0.62,
    metalness: 0.08,
  });
  const warningWhiteMat = new THREE.MeshStandardMaterial({
    name: 'FurnaceWarningWhite',
    color: new THREE.Color('#eceae4'),
    roughness: 0.65,
    metalness: 0.05,
  });
  const hazardYellowMat = new THREE.MeshStandardMaterial({
    name: 'FurnaceHazardYellow',
    color: new THREE.Color('#eab308'),
    roughness: 0.44,
    metalness: 0.25,
  });
  const pipeRustMat = new THREE.MeshStandardMaterial({
    name: 'FurnaceInsulatedPipe',
    color: new THREE.Color('#8e563f'),
    roughness: 0.64,
    metalness: 0.36,
  });
  const cisternPaintMat = new THREE.MeshStandardMaterial({
    name: 'FurnaceCisternPaint',
    color: new THREE.Color('#4d728a'),
    roughness: 0.42,
    metalness: 0.48,
  });
  const furnaceGlowMat = new THREE.MeshStandardMaterial({
    name: 'FurnaceMoltenGlow',
    color: new THREE.Color('#ff7a29'),
    emissive: new THREE.Color('#ff4d00'),
    emissiveIntensity: 1.4,
    roughness: 0.4,
  });

  ctx.trackDisposable(warningRedMat);
  ctx.trackDisposable(warningWhiteMat);
  ctx.trackDisposable(hazardYellowMat);
  ctx.trackDisposable(pipeRustMat);
  ctx.trackDisposable(cisternPaintMat);
  ctx.trackDisposable(furnaceGlowMat);

  const batch = new BlastFurnaceBatcher();
  const baseY = foundationHeight;
  const towerH = floors * floorHeight;
  const topY = baseY + towerH;

  // 1. Unified Concrete Industrial Slab Plinth
  batch.addBox('foundation', width + 0.6, foundationHeight, depth + 0.6, 0, foundationHeight / 2, 0);
  batch.addBox('stoneStep', width + 0.72, 0.1, depth + 0.72, 0, foundationHeight - 0.04, 0);

  // Core coordinates inside unified footprint
  const fx = -width * 0.16;
  const fz = -depth * 0.06;
  const rBelly = Math.min(3.45, Math.max(2.35, width * 0.135));
  const rHearth = rBelly * 0.84;
  const rThroat = rBelly * 0.58;

  // 2. Central Blast Furnace Shaft (Hearth -> Bosh -> Belly -> Tapered Shaft -> Throat)
  const hHearth = towerH * 0.2;
  const hBosh = towerH * 0.12;
  const hBelly = towerH * 0.14;
  const hShaft = towerH * 0.42;
  const hThroat = towerH * 0.12;

  let curY = baseY;
  batch.addCylinder('wall', rHearth, rHearth, hHearth, fx, curY + hHearth / 2, fz);
  curY += hHearth;
  batch.addCylinder('wall', rHearth, rBelly, hBosh, fx, curY + hBosh / 2, fz);
  curY += hBosh;
  batch.addCylinder('wall', rBelly, rBelly, hBelly, fx, curY + hBelly / 2, fz);
  curY += hBelly;
  batch.addCylinder('wall', rBelly, rThroat, hShaft, fx, curY + hShaft / 2, fz);
  curY += hShaft;
  batch.addCylinder('metalAccent', rThroat, rThroat * 0.94, hThroat, fx, curY + hThroat / 2, fz);

  // Steel stiffening jacket rings around the furnace shell
  for (const frac of [0.18, 0.34, 0.52, 0.7, 0.88]) {
    const ry = baseY + towerH * frac;
    const rad =
      frac < 0.3
        ? rBelly * 0.96
        : rBelly - ((frac - 0.3) / 0.6) * (rBelly - rThroat);
    batch.addCylinder('trim', rad + 0.12, rad + 0.12, 0.18, fx, ry, fz);
  }

  // Hot-Blast Bustle Pipe Ring (Torus) encircling the hearth/bosh + 10 angled Tuyere blowpipes
  const bustleY = baseY + towerH * 0.24;
  const bustleRingR = rBelly + 0.72;
  const torusGeo = new THREE.TorusGeometry(bustleRingR, 0.36, 12, 28);
  torusGeo.rotateX(Math.PI / 2);
  batch.addGeometry('pipeRust', torusGeo, fx, bustleY, fz);

  const tuyereCount = 10;
  for (let i = 0; i < tuyereCount; i++) {
    const ang = (i / tuyereCount) * Math.PI * 2;
    const tx1 = fx + Math.cos(ang) * bustleRingR;
    const tz1 = fz + Math.sin(ang) * bustleRingR;
    const tx2 = fx + Math.cos(ang) * (rHearth * 0.92);
    const tz2 = fz + Math.sin(ang) * (rHearth * 0.92);
    batch.addPipePath(
      'pipeRust',
      [new THREE.Vector3(tx1, bustleY, tz1), new THREE.Vector3(tx2, bustleY - 0.85, tz2)],
      0.13,
      false,
    );
  }

  // 3. 4-Post Heavy Steel Structural Frame, Ring Platforms & External Stairs (hasBalcony)
  const frameHalf = rBelly + 1.15;
  const frameTopY = topY + 0.4;
  for (const [cx, cz] of [
    [-frameHalf, -frameHalf],
    [frameHalf, -frameHalf],
    [-frameHalf, frameHalf],
    [frameHalf, frameHalf],
  ]) {
    batch.addBox('trim', 0.36, frameTopY - baseY, 0.36, fx + cx, baseY + (frameTopY - baseY) / 2, fz + cz);
  }

  for (let f = 1; f <= floors; f++) {
    const py = baseY + f * floorHeight;
    const pw = frameHalf * 2 + 0.7;
    const isTopDeck = f === floors;
    const platW = isTopDeck ? pw + 0.8 : pw + 0.3;

    // Ring service grating gallery around furnace frame
    batch.addBox('metalAccent', platW, 0.16, 0.85, fx, py, fz + frameHalf + 0.25);
    batch.addBox('metalAccent', platW, 0.16, 0.85, fx, py, fz - frameHalf - 0.25);
    batch.addBox('metalAccent', 0.85, 0.16, platW - 1.5, fx - frameHalf - 0.25, py, fz);
    batch.addBox('metalAccent', 0.85, 0.16, platW - 1.5, fx + frameHalf + 0.25, py, fz);

    if (hasBalcony) {
      // Yellow safety handrails on every level
      const railY = py + 0.92;
      batch.addBox('hazardYellow', platW, 0.06, 0.06, fx, railY, fz + frameHalf + 0.64);
      batch.addBox('hazardYellow', platW, 0.06, 0.06, fx, railY, fz - frameHalf - 0.64);
      batch.addBox('hazardYellow', 0.06, 0.06, platW, fx - frameHalf - 0.64, railY, fz);
      batch.addBox('hazardYellow', 0.06, 0.06, platW, fx + frameHalf + 0.64, railY, fz);

      // Diagonal steel stair flight connecting levels along the -X side of the frame
      if (f < floors) {
        const nextY = py + floorHeight;
        const stairX = fx - frameHalf - 0.92;
        const stairLenZ = frameHalf * 1.6;
        const flightAngle = Math.atan2(floorHeight, stairLenZ);
        batch.addBox(
          'trim',
          0.75,
          0.1,
          Math.hypot(stairLenZ, floorHeight),
          stairX,
          (py + nextY) / 2,
          fz,
          f % 2 === 0 ? flightAngle : -flightAngle,
          0,
          0,
        );
        batch.addBox(
          'hazardYellow',
          0.06,
          0.06,
          Math.hypot(stairLenZ, floorHeight),
          stairX - 0.34,
          (py + nextY) / 2 + 0.85,
          fz,
          f % 2 === 0 ? flightAngle : -flightAngle,
          0,
          0,
        );
      }
    }
  }

  // 4. Charging Bell Crown Modes ('stepped' Headframe+Bleeders | 'gable' Enclosed Cap | 'flat' Maintenance Deck)
  const throatTopY = topY;
  batch.addCylinder('metalAccent', rThroat * 1.15, rThroat * 0.7, 1.35, fx, throatTopY + 0.65, fz);

  if (roofType === 'stepped') {
    // 4-column headframe gantry + symmetrical gas uptake tubes + vertical bleeder flare stacks
    const headH = 5.4;
    for (const [cx, cz] of [
      [-rThroat - 0.7, -rThroat - 0.7],
      [rThroat + 0.7, -rThroat - 0.7],
      [-rThroat - 0.7, rThroat + 0.7],
      [rThroat + 0.7, rThroat + 0.7],
    ]) {
      batch.addBox('trim', 0.24, headH, 0.24, fx + cx, throatTopY + headH / 2, fz + cz);
    }
    batch.addBox('roof', (rThroat + 1.0) * 2, 0.25, (rThroat + 1.0) * 2, fx, throatTopY + headH, fz);

    // 4 gas uptake pipes rising symmetrically and converging into top bleeder manifold
    for (const [ux, uz] of [
      [-rThroat * 0.78, 0],
      [rThroat * 0.78, 0],
      [0, -rThroat * 0.78],
      [0, rThroat * 0.78],
    ]) {
      batch.addPipePath(
        'metalAccent',
        [
          new THREE.Vector3(fx + ux, throatTopY + 0.5, fz + uz),
          new THREE.Vector3(fx + ux * 1.15, throatTopY + 2.8, fz + uz * 1.15),
          new THREE.Vector3(fx + ux * 0.35, throatTopY + 4.2, fz + uz * 0.35),
        ],
        0.34,
        true,
      );
    }
    // Twin vertical bleeder flare stacks above headframe
    for (const bx of [-0.75, 0.75]) {
      batch.addCylinder('pipeRust', 0.26, 0.22, 2.2, fx + bx, throatTopY + headH + 1.1, fz);
      batch.addCylinder('warningRed', 0.34, 0.26, 0.25, fx + bx, throatTopY + headH + 2.22, fz);
    }
  } else if (roofType === 'gable') {
    const capW = frameHalf * 2 + 1.1;
    const capD = frameHalf * 2 + 1.1;
    const capH = 2.1;
    const ridgeRise = Math.tan((roofPitchDeg * Math.PI) / 180) * (capD * 0.45);
    batch.addBox('wall', capW, capH, capD, fx, throatTopY + capH / 2, fz);
    const gable = createGableCapGeo(capW, capD, ridgeRise);
    batch.addGeometry('wall', gable, fx, throatTopY + capH, fz);
    const sSpan = Math.hypot(capD / 2, ridgeRise) + roofOverhang;
    const sAng = Math.atan2(ridgeRise, capD / 2);
    for (const side of [-1, 1]) {
      batch.addBox(
        'roof',
        capW + roofOverhang * 2,
        0.16,
        sSpan,
        fx,
        throatTopY + capH + ridgeRise / 2 + 0.08,
        fz + side * (capD / 4),
        side * sAng,
        0,
        0,
      );
    }
  } else {
    // Flat enclosed charging house + maintenance davit crane
    const capS = frameHalf * 2 + 0.9;
    batch.addBox('roof', capS, 1.5, capS, fx, throatTopY + 0.75, fz);
    batch.addBox('hazardYellow', capS + 0.2, 0.18, capS + 0.2, fx, throatTopY + 1.55, fz);
    batch.addBox('trim', 0.25, 2.2, 0.25, fx + capS * 0.35, throatTopY + 2.5, fz);
    batch.addBox('hazardYellow', 2.4, 0.22, 0.22, fx + capS * 0.35 + 1.0, throatTopY + 3.45, fz);
  }

  // 5. Dense Cluster of 3 Cowper Hot-Blast Stoves + Dust Catcher + Scrubber + Cisterns + Interlocking Pipes
  const cowperR = Math.min(1.88, Math.max(1.38, width * 0.068));
  const cowperSpacing = cowperR * 2.18;
  const cowperStartX = fx + frameHalf + cowperR + 0.95;
  const cowperZ = fz - depth * 0.14;
  const cowperH = towerH * 0.82;
  const cowperCenters: number[] = [];

  for (let c = 0; c < 3; c++) {
    const cx = cowperStartX + c * cowperSpacing;
    if (cx + cowperR > width / 2 + 0.4) continue;
    cowperCenters.push(cx);

    batch.addBox('foundation', cowperR * 2.1, 0.28, cowperR * 2.1, cx, baseY + 0.14, cowperZ);
    batch.addCylinder('metalAccent', cowperR, cowperR, cowperH, cx, baseY + 0.28 + cowperH / 2, cowperZ);
    batch.addDomeCap('metalAccent', cowperR, 0.78, cx, baseY + 0.28 + cowperH, cowperZ);

    // Jacket stiffener rings around each cowper stove
    for (const frac of [0.25, 0.55, 0.85]) {
      batch.addCylinder('trim', cowperR + 0.08, cowperR + 0.08, 0.14, cx, baseY + 0.28 + cowperH * frac, cowperZ);
    }

    // Vertical hot-blast feeder pipe dropping into common hot-blast main
    batch.addPipePath(
      'pipeRust',
      [
        new THREE.Vector3(cx, baseY + cowperH * 0.62, cowperZ + cowperR),
        new THREE.Vector3(cx, bustleY + 0.9, cowperZ + cowperR + 0.95),
        new THREE.Vector3(cx, bustleY, cowperZ + cowperR + 0.95),
      ],
      0.34,
      true,
    );
  }

  // Upper catwalk bridge linking all cowpers to furnace shaft
  if (cowperCenters.length > 0) {
    const cMin = cowperCenters[0];
    const cMax = cowperCenters[cowperCenters.length - 1];
    const bridgeY = baseY + cowperH * 0.92;
    batch.addBox('trim', cMax - cMin + cowperR * 1.4, 0.18, 1.3, (cMin + cMax) / 2, bridgeY, cowperZ);
    batch.addBox('hazardYellow', cMax - cMin + cowperR * 1.4, 0.06, 0.06, (cMin + cMax) / 2, bridgeY + 0.95, cowperZ + 0.62);

    // Massive Insulated Hot-Blast Main Pipe linking all Cowper Stoves directly into Furnace Bustle Ring
    batch.addPipePath(
      'pipeRust',
      [
        new THREE.Vector3(cMax + 0.4, bustleY, cowperZ + cowperR + 0.95),
        new THREE.Vector3(cMin - 0.5, bustleY, cowperZ + cowperR + 0.95),
        new THREE.Vector3(fx + bustleRingR * 0.85, bustleY, fz + 0.2),
      ],
      0.44,
      true,
    );
  }

  // Cyclone Dust-Catcher & Wet Scrubber Vessel on -X flank tightly tied via overhead Gas Downcomer
  const dustX = fx - frameHalf - 2.35;
  const dustZ = fz + 0.35;
  const dustR = Math.min(1.85, Math.max(1.3, width * 0.072));
  const dustLegH = Math.max(2.4, floorHeight * 0.55);
  const dustBodyH = Math.max(4.5, towerH * 0.34);
  const dustBodyY = baseY + dustLegH + 1.4 + dustBodyH / 2;

  // Dust-catcher 4 legs + conical hopper + drum + conical top cap
  for (const [lx, lz] of [
    [-dustR * 0.65, -dustR * 0.65],
    [dustR * 0.65, -dustR * 0.65],
    [-dustR * 0.65, dustR * 0.65],
    [dustR * 0.65, dustR * 0.65],
  ]) {
    batch.addBox('trim', 0.2, dustLegH + 0.8, 0.2, dustX + lx, baseY + (dustLegH + 0.8) / 2, dustZ + lz);
  }
  batch.addCylinder('cisternPaint', 0.38, dustR, 1.5, dustX, baseY + dustLegH + 0.65, dustZ);
  batch.addCylinder('cisternPaint', dustR, dustR, dustBodyH, dustX, dustBodyY, dustZ);
  batch.addCylinder('cisternPaint', dustR, 0.55, 1.35, dustX, dustBodyY + dustBodyH / 2 + 0.67, dustZ);

  // Giant Sweeping Gas Downcomer Tube from top furnace manifold down into Cyclone Dust-Catcher
  batch.addPipePath(
    'metalAccent',
    [
      new THREE.Vector3(fx - rThroat * 0.5, throatTopY + 2.8, fz),
      new THREE.Vector3((fx + dustX) / 2, throatTopY + 3.2, (fz + dustZ) / 2),
      new THREE.Vector3(dustX, dustBodyY + dustBodyH / 2 + 2.1, dustZ),
      new THREE.Vector3(dustX, dustBodyY + dustBodyH / 2 + 1.2, dustZ),
    ],
    0.48,
    true,
  );

  // Adjacent Scrubber Cylinder + Dense Cluster of Pressurized Cistern Tanks & Interlocking Pipes (hasCornerAccents)
  if (hasCornerAccents) {
    // Wet Gas Scrubber right behind Dust-Catcher
    const scrubX = dustX - 0.55;
    const scrubZ = dustZ - dustR * 2.25;
    const scrubR = dustR * 0.78;
    const scrubH = dustBodyH * 1.35;
    batch.addCylinder('metalAccent', scrubR, scrubR, scrubH, scrubX, baseY + scrubH / 2, scrubZ);
    batch.addDomeCap('metalAccent', scrubR, 0.65, scrubX, baseY + scrubH, scrubZ);
    batch.addPipePath(
      'cisternPaint',
      [
        new THREE.Vector3(dustX - dustR * 0.6, dustBodyY + dustBodyH * 0.2, dustZ - dustR * 0.5),
        new THREE.Vector3(scrubX, dustBodyY + 1.2, scrubZ + scrubR * 0.4),
        new THREE.Vector3(scrubX, baseY + scrubH * 0.32, scrubZ + scrubR * 0.8),
      ],
      0.32,
      true,
    );

    // Front-left Auxiliary Gas Receiver Cistern right beside Dust-Catcher
    const leftTankX = dustX - 0.45;
    const leftTankZ = fz + frameHalf * 0.85;
    const leftTankR = 1.05;
    const leftTankH = Math.max(3.6, floorHeight * 0.85);
    batch.addBox('foundation', leftTankR * 2.1, 0.3, leftTankR * 2.1, leftTankX, baseY + 0.15, leftTankZ);
    batch.addCylinder('pipeRust', leftTankR, leftTankR, leftTankH, leftTankX, baseY + 0.3 + leftTankH / 2, leftTankZ);
    batch.addDomeCap('pipeRust', leftTankR, 0.68, leftTankX, baseY + 0.3 + leftTankH, leftTankZ);
    batch.addPipePath(
      'metalAccent',
      [
        new THREE.Vector3(dustX, dustBodyY - 0.5, dustZ + dustR * 0.75),
        new THREE.Vector3(leftTankX, dustBodyY - 0.5, leftTankZ),
        new THREE.Vector3(leftTankX, baseY + 0.3 + leftTankH + 0.5, leftTankZ),
      ],
      0.28,
      true,
    );
    batch.addPipePath(
      'cisternPaint',
      [
        new THREE.Vector3(leftTankX + leftTankR * 0.7, baseY + leftTankH * 0.72, leftTankZ),
        new THREE.Vector3(fx - frameHalf * 0.9, bustleY + 1.5, leftTankZ),
        new THREE.Vector3(fx - bustleRingR * 0.85, bustleY + 0.4, fz + bustleRingR * 0.5),
      ],
      0.24,
      true,
    );

    // Dense 3-Cistern Horizontal Tank Farm tightly packed on right-front flank beside the Cowper Stoves
    const cistBaseX = cowperStartX + cowperSpacing * 0.92;
    const cistZ1 = fz + depth * 0.2;
    const cistZ2 = cistZ1 + 2.45;
    const cistR = 1.05;
    const cistLen = Math.min(5.6, Math.max(3.8, width * 0.22));
    const saddleH = 1.15;

    for (const [cz, paintKey] of [
      [cistZ1, 'cisternPaint'] as const,
      [cistZ2, 'metalAccent'] as const,
    ]) {
      for (const sx of [cistBaseX - cistLen * 0.3, cistBaseX + cistLen * 0.3]) {
        batch.addBox('foundation', 0.42, saddleH, cistR * 1.75, sx, baseY + saddleH / 2, cz);
      }
      batch.addHorizontalCistern(paintKey, cistR, cistLen, cistBaseX, baseY + saddleH + cistR * 0.78, cz, false);
      // Top safety dome hatch on each cistern
      batch.addCylinder('trim', 0.32, 0.32, 0.48, cistBaseX, baseY + saddleH + cistR * 1.78, cz);
    }

    // Elevated Piggyback Upper Cistern mounted on steel cradle above cistZ1/cistZ2
    const upperCistY = baseY + saddleH + cistR * 2.85;
    for (const sx of [cistBaseX - cistLen * 0.26, cistBaseX + cistLen * 0.26]) {
      batch.addBox('trim', 0.2, cistR * 1.8, 0.2, sx, baseY + saddleH + cistR * 1.4, cistZ1 + 1.22);
      batch.addBox('trim', 0.28, 0.2, 2.75, sx, upperCistY - cistR * 0.82, cistZ1 + 1.22);
    }
    batch.addHorizontalCistern('pipeRust', cistR * 0.82, cistLen * 0.88, cistBaseX, upperCistY, cistZ1 + 1.22, false);
    batch.addCylinder('hazardYellow', 0.26, 0.26, 0.42, cistBaseX, upperCistY + cistR * 0.9, cistZ1 + 1.22);

    // Elevated Vertical Surge Tank on steel frame right beside horizontal cisterns
    const vTankX = cistBaseX + cistLen * 0.45;
    const vTankZ = cowperZ + cowperR * 1.7;
    const vTankR = 0.98;
    const vTankH = Math.max(4.0, floorHeight * 0.92);
    const vLegH = 2.3;
    for (const [lx, lz] of [
      [-0.68, -0.68],
      [0.68, -0.68],
      [-0.68, 0.68],
      [0.68, 0.68],
    ]) {
      batch.addBox('trim', 0.16, vLegH, 0.16, vTankX + lx, baseY + vLegH / 2, vTankZ + lz);
    }
    batch.addCylinder('pipeRust', vTankR, vTankR, vTankH, vTankX, baseY + vLegH + vTankH / 2, vTankZ);
    batch.addDomeCap('pipeRust', vTankR, 0.65, vTankX, baseY + vLegH + vTankH, vTankZ);

    // Dense Overhead Pipe Rack & Looping Interconnecting Pipelines (density scales with windowDensity!)
    const rackY = baseY + Math.max(5.2, floorHeight * 1.04);
    const pipeOffsets = windowDensity === 1 ? [0] : windowDensity === 2 ? [-0.45, 0.45] : [-0.75, 0, 0.75];
    for (let idx = 0; idx < pipeOffsets.length; idx++) {
      const off = pipeOffsets[idx];
      const bucket: MaterialBucketKey =
        idx % 3 === 0 ? 'pipeRust' : idx % 3 === 1 ? 'cisternPaint' : 'metalAccent';
      // Multi-bend pipe tying cisterns -> overhead rack -> cowpers -> furnace shaft
      batch.addPipePath(
        bucket,
        [
          new THREE.Vector3(cistBaseX - cistLen * 0.22 + off, upperCistY + 0.55, cistZ1 + 0.6 + off * 0.5),
          new THREE.Vector3(cistBaseX - cistLen * 0.22 + off, rackY + idx * 0.36, cistZ1 + 0.6 + off * 0.5),
          new THREE.Vector3(cistBaseX - cistLen * 0.22 + off, rackY + idx * 0.36, cowperZ + cowperR + 0.65),
          new THREE.Vector3(fx + frameHalf * 0.7, rackY + idx * 0.36, fz + frameHalf * 0.4 + off * 0.5),
          new THREE.Vector3(fx + rBelly * 0.85, bustleY + 1.4 + idx * 0.42, fz + off * 0.5),
        ],
        0.21,
        true,
      );
    }

    // Cross-tie pipeline connecting upper cistern directly to vertical surge tank
    batch.addPipePath(
      'cisternPaint',
      [
        new THREE.Vector3(cistBaseX + cistLen * 0.32, upperCistY + 0.45, cistZ1 + 1.22),
        new THREE.Vector3(vTankX, upperCistY + 1.35, (cistZ1 + 1.22 + vTankZ) / 2),
        new THREE.Vector3(vTankX, baseY + vLegH + vTankH * 0.72, vTankZ + vTankR * 0.75),
      ],
      0.22,
      true,
    );

    // Secondary pipe rack bent frames holding the overhead pipe bundle
    for (const rz of [cistZ1 - 0.7, (cistZ1 + cowperZ) / 2]) {
      batch.addBox('trim', 0.16, rackY + 0.8, 0.16, cistBaseX - cistLen * 0.22 - 1.1, baseY + (rackY + 0.8) / 2, rz);
      batch.addBox('trim', 0.16, rackY + 0.8, 0.16, cistBaseX - cistLen * 0.22 + 1.1, baseY + (rackY + 0.8) / 2, rz);
      batch.addBox('trim', 2.4, 0.16, 0.18, cistBaseX - cistLen * 0.22, rackY - 0.18, rz);
    }

    // Vertical tank to Cowper manifold riser pipe
    batch.addPipePath(
      'metalAccent',
      [
        new THREE.Vector3(vTankX, baseY + vLegH + vTankH + 0.5, vTankZ),
        new THREE.Vector3(vTankX, baseY + vLegH + vTankH + 1.5, vTankZ),
        new THREE.Vector3(cowperStartX + cowperSpacing, baseY + cowperH * 0.65, cowperZ + cowperR * 0.8),
      ],
      0.24,
      true,
    );

    // Inclined Skip Hoist Charging Bridge climbing from rear-left pit up to furnace throat
    const skipBottom = new THREE.Vector3(-width * 0.42, baseY + 0.4, -depth * 0.42);
    const skipTop = new THREE.Vector3(fx - rThroat * 0.6, throatTopY + 1.8, fz - rThroat * 0.6);
    const skipVec = skipTop.clone().sub(skipBottom);
    const skipLen = skipVec.length();
    const skipMid = skipBottom.clone().lerp(skipTop, 0.5);
    const skipDir = skipVec.clone().normalize();

    const skipTruss = new THREE.BoxGeometry(1.45, 0.85, skipLen).toNonIndexed();
    const qSkip = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), skipDir);
    const mSkip = new THREE.Matrix4().compose(skipMid, qSkip, new THREE.Vector3(1, 1, 1));
    skipTruss.applyMatrix4(mSkip);
    batch.addGeometry('trim', skipTruss, 0, 0, 0);

    // Charging bunker shed at bottom of skip hoist
    batch.addBox('wall', 3.4, 2.4, 3.2, skipBottom.x, baseY + 1.2, skipBottom.z);
    batch.addBox('roof', 3.7, 0.2, 3.5, skipBottom.x, baseY + 2.45, skipBottom.z);
  }

  // 6. Front Cast-House Hall (Литейный двор) + Glowing Hearth Bay + Torpedo Canopy (hasPorch)
  if (hasPorch) {
    const castW = Math.min(width * 0.5, 13.4);
    const castD = Math.min(depth * 0.34, 6.8);
    const castH = Math.max(4.4, floorHeight * 0.92);
    const castX = fx + 0.4;
    const castZ = fz + frameHalf + castD * 0.42;

    batch.addBox('wall', castW, castH, castD, castX, baseY + castH / 2, castZ);
    // Sloped shed roof over cast-house
    const shedAng = Math.atan2(1.4, castD);
    batch.addBox(
      'roof',
      castW + 0.7,
      0.18,
      Math.hypot(castD, 1.4) + 0.4,
      castX,
      baseY + castH + 0.45,
      castZ,
      shedAng,
      0,
      0,
    );
    // Ridge louver vent atop cast-house
    batch.addBox('trim', castW * 0.65, 0.55, 1.2, castX, baseY + castH + 1.15, castZ - castD * 0.24);

    // Steel-mullion windows across cast-house front wall
    const winW = 1.65 * windowScale;
    const winH = 1.55 * windowScale;
    for (const wx of [castX - castW * 0.32, castX + castW * 0.32]) {
      batch.addBox('glassBacking', winW, winH, 0.08, wx, baseY + castH * 0.58, castZ + castD / 2 + 0.02);
      batch.addBox('glass', winW - 0.1, winH - 0.1, 0.06, wx, baseY + castH * 0.58, castZ + castD / 2 + 0.05);
      batch.addBox('trim', winW + 0.14, 0.08, 0.12, wx, baseY + castH * 0.58 + winH / 2, castZ + castD / 2 + 0.07);
    }

    // Center Hot-Metal Pouring Bay Portal with glowing orange molten trough depth + loading canopy
    const bayW = 3.8;
    const bayH = Math.min(castH - 0.6, 3.4);
    batch.addBox('trim', bayW + 0.36, bayH + 0.2, 0.22, castX, baseY + bayH / 2, castZ + castD / 2 + 0.05);
    batch.addBox('glassBacking', bayW, bayH, 0.12, castX, baseY + bayH / 2, castZ + castD / 2 + 0.08);
    batch.addBox('furnaceGlow', bayW * 0.72, 0.48, 0.14, castX, baseY + 0.34, castZ + castD / 2 + 0.1);
    batch.addBox('roof', bayW + 1.6, 0.14, 2.2, castX, baseY + bayH + 0.32, castZ + castD / 2 + 1.05, 0.1, 0, 0);

    // Yellow hazard bollards guarding the pouring portal
    for (const bx of [castX - bayW / 2 - 0.35, castX + bayW / 2 + 0.35]) {
      batch.addBox('hazardYellow', 0.2, 1.05, 0.2, bx, baseY + 0.52, castZ + castD / 2 + 0.28);
    }
  }

  // 7. Tall Tapered Smokestack with Red/White Bands & Cowper Breeching Duct (hasChimney)
  if (hasChimney) {
    const stackX =
      cowperCenters.length > 0
        ? cowperCenters[cowperCenters.length - 1] - cowperR * 0.15
        : fx + width * 0.34;
    const stackZ = cowperZ - cowperR - 2.35;
    const smokestackExtra = Math.max(6.5, towerH * 0.45);
    const stackTopY = topY + Math.max(5.8, smokestackExtra);

    // Concrete/brick pedestal base + horizontal collector breeching duct terminating inside pedestal
    const pedH = 3.2;
    batch.addBox('chimney', 2.8, pedH, 2.8, stackX, baseY + pedH / 2, stackZ);
    batch.addBox('stoneStep', 3.05, 0.24, 3.05, stackX, baseY + pedH + 0.06, stackZ);

    if (cowperCenters.length > 0) {
      const cMin = cowperCenters[0];
      const ductEnd = Math.max(cowperCenters[cowperCenters.length - 1], stackX);
      const ductLen = Math.max(1.2, ductEnd - cMin + 0.6);
      batch.addCylinder(
        'trim',
        0.68,
        0.68,
        ductLen,
        (cMin - 0.3 + ductEnd) / 2,
        baseY + 1.65,
        stackZ + 0.05,
        0,
        0,
        Math.PI / 2,
      );
      for (const cx of cowperCenters) {
        batch.addCylinder(
          'trim',
          0.52,
          0.52,
          Math.abs(stackZ - cowperZ),
          cx,
          baseY + 1.65,
          (stackZ + cowperZ) / 2,
          Math.PI / 2,
          0,
          0,
        );
      }
    }

    // Tapered brick stack shaft + 3 aviation warning bands
    const shaftBottomY = baseY + pedH + 0.18;
    const bandTotalH = 3.6;
    const mainTopY = stackTopY - bandTotalH;
    const mainH = Math.max(4.0, mainTopY - shaftBottomY);
    const rBase = 1.18;
    const rMid = 0.78;
    const rCrown = 0.62;

    batch.addCylinder('chimney', rBase, rMid, mainH, stackX, shaftBottomY + mainH / 2, stackZ);
    const bH = bandTotalH / 3;
    const r1 = rMid - (rMid - rCrown) * 0.33;
    const r2 = rMid - (rMid - rCrown) * 0.66;
    batch.addCylinder('warningRed', rMid, r1, bH, stackX, mainTopY + bH * 0.5, stackZ);
    batch.addCylinder('warningWhite', r1, r2, bH, stackX, mainTopY + bH * 1.5, stackZ);
    batch.addCylinder('warningRed', r2, rCrown, bH, stackX, mainTopY + bH * 2.5, stackZ);
    batch.addCylinder('trim', rCrown + 0.16, rCrown + 0.08, 0.28, stackX, stackTopY + 0.08, stackZ);
  }

  batch.flushToGroup(group, ctx, {
    warningRed: warningRedMat,
    warningWhite: warningWhiteMat,
    hazardYellow: hazardYellowMat,
    pipeRust: pipeRustMat,
    cisternPaint: cisternPaintMat,
    furnaceGlow: furnaceGlowMat,
  });

  return group;
}
