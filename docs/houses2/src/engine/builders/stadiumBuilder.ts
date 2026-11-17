import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HouseConfig } from '../../types/house';
import type { HouseBuildContext } from './types';

type StadiumBucketKey =
  | 'wall'
  | 'roof'
  | 'trim'
  | 'door'
  | 'foundation'
  | 'stoneStep'
  | 'glass'
  | 'glassBacking'
  | 'metalAccent'
  | 'pitchTurf'
  | 'pitchStripe'
  | 'trackClay'
  | 'seatBlue'
  | 'whiteLine'
  | 'ledGlow';

class StadiumBatcher {
  private readonly buckets: Record<StadiumBucketKey, THREE.BufferGeometry[]> = {
    wall: [],
    roof: [],
    trim: [],
    door: [],
    foundation: [],
    stoneStep: [],
    glass: [],
    glassBacking: [],
    metalAccent: [],
    pitchTurf: [],
    pitchStripe: [],
    trackClay: [],
    seatBlue: [],
    whiteLine: [],
    ledGlow: [],
  };

  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly unitCyl = new THREE.CylinderGeometry(1, 1, 1, 12);
  private readonly mat4 = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();
  private readonly dirVec = new THREE.Vector3();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);

  addBox(
    bucket: StadiumBucketKey,
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

  addSpanBeam(
    bucket: StadiumBucketKey,
    w: number,
    h: number,
    p0: [number, number, number],
    p1: [number, number, number],
  ): void {
    this.dirVec.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const len = this.dirVec.length();
    if (len < 1e-4) return;
    this.dirVec.divideScalar(len);
    this.pos.set((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5, (p0[2] + p1[2]) * 0.5);
    this.quat.setFromUnitVectors(this.zAxis, this.dirVec);
    this.scale.set(w, h, len);
    this.mat4.compose(this.pos, this.quat, this.scale);
    const geo = this.unitBox.clone().toNonIndexed();
    geo.applyMatrix4(this.mat4);
    this.buckets[bucket].push(geo);
  }

  addCylinder(
    bucket: StadiumBucketKey,
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
      : new THREE.CylinderGeometry(radiusTop, radiusBottom, 1, 12).toNonIndexed();
    this.pos.set(x, y, z);
    this.quat.identity();
    this.scale.set(isUniform ? radiusBottom : 1, height, isUniform ? radiusBottom : 1);
    this.mat4.compose(this.pos, this.quat, this.scale);
    geo.applyMatrix4(this.mat4);
    this.buckets[bucket].push(geo);
  }

  /**
   * Adds a closed 6-sided wedge prism defined by 4 XZ corners (inner0, outer0, outer1, inner1)
   * and vertical bounds [y0Bot..y0Top] at inner edge and [y1Bot..y1Top] at outer edge.
   */
  addRingSectorPrism(
    bucket: StadiumBucketKey,
    in0: [number, number],
    out0: [number, number],
    out1: [number, number],
    in1: [number, number],
    yInBot: number,
    yInTop: number,
    yOutBot: number,
    yOutTop: number,
  ): void {
    // 8 vertices:
    // bottom: 0=in0, 1=out0, 2=out1, 3=in1
    // top:    4=in0, 5=out0, 6=out1, 7=in1
    const v: Array<[number, number, number]> = [
      [in0[0], yInBot, in0[1]],
      [out0[0], yOutBot, out0[1]],
      [out1[0], yOutBot, out1[1]],
      [in1[0], yInBot, in1[1]],
      [in0[0], yInTop, in0[1]],
      [out0[0], yOutTop, out0[1]],
      [out1[0], yOutTop, out1[1]],
      [in1[0], yInTop, in1[1]],
    ];

    const positions: number[] = [];
    const uvs: number[] = [];
    const pushTri = (a: number, b: number, c: number) => {
      const va = v[a];
      const vb = v[b];
      const vc = v[c];
      positions.push(va[0], va[1], va[2], vb[0], vb[1], vb[2], vc[0], vc[1], vc[2]);
      uvs.push(va[0] * 0.08, va[2] * 0.08 + va[1] * 0.12, vb[0] * 0.08, vb[2] * 0.08 + vb[1] * 0.12, vc[0] * 0.08, vc[2] * 0.08 + vc[1] * 0.12);
    };
    const pushQuad = (a: number, b: number, c: number, d: number) => {
      pushTri(a, b, c);
      pushTri(a, c, d);
    };

    // Outward winding for CCW theta traversal (theta goes 0 -> 2pi in XZ where +x, +z)
    // Top face (4, 7, 6, 5)
    pushQuad(4, 7, 6, 5);
    // Bottom face (0, 1, 2, 3)
    pushQuad(0, 1, 2, 3);
    // Outer wall (1, 5, 6, 2)
    pushQuad(1, 5, 6, 2);
    // Inner wall (3, 7, 4, 0)
    pushQuad(3, 7, 4, 0);
    // Side cap 0 (0, 4, 5, 1)
    pushQuad(0, 4, 5, 1);
    // Side cap 1 (2, 6, 7, 3)
    pushQuad(2, 6, 7, 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    this.buckets[bucket].push(geo);
  }

  addGeometry(bucket: StadiumBucketKey, rawGeo: THREE.BufferGeometry, x = 0, y = 0, z = 0): void {
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
      'pitchTurf' | 'pitchStripe' | 'trackClay' | 'seatBlue' | 'whiteLine' | 'ledGlow',
      THREE.MeshStandardMaterial
    >,
  ): void {
    this.unitBox.dispose();
    this.unitCyl.dispose();

    const entries = Object.entries(this.buckets) as Array<
      [StadiumBucketKey, THREE.BufferGeometry[]]
    >;
    for (const [key, geos] of entries) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      ctx.trackGeometry(merged);

      const mat =
        key === 'pitchTurf' ||
        key === 'pitchStripe' ||
        key === 'trackClay' ||
        key === 'seatBlue' ||
        key === 'whiteLine' ||
        key === 'ledGlow'
          ? extraMaterials[key]
          : ctx.materials[key];
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `Stadium_${key}`;
      const isGlass = key === 'glass' || key === 'glassBacking';
      const isGroundMarking =
        key === 'pitchTurf' || key === 'pitchStripe' || key === 'trackClay' || key === 'whiteLine';
      mesh.castShadow = !isGlass && !isGroundMarking && key !== 'ledGlow';
      mesh.receiveShadow = key !== 'glass' && key !== 'ledGlow';
      group.add(mesh);
    }
  }
}

function ovalPoint(rx: number, rz: number, theta: number): [number, number] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const exp = 0.84;
  return [Math.sign(c) * Math.pow(Math.abs(c), exp) * rx, Math.sign(s) * Math.pow(Math.abs(s), exp) * rz];
}

function createOvalDiscGeo(rx: number, rz: number, thickness: number, segs = 36): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    const [px, pz] = ovalPoint(rx, rz, t);
    if (i === 0) shape.moveTo(px, -pz);
    else shape.lineTo(px, -pz);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds an architectural Multi-Tiered Sports Stadium (Стадион):
 * - Inner mowed turf pitch with white field markings, goal frames, and terracotta running track oval
 * - Continuous 32-sector superellipse seating bowl across 1-3 tiers with cobalt seating rows & glass rim rails
 * - Raised concourse plinth & North/South entry grand portals with stairs (hasPorch)
 * - Exterior concourse curtain-wall glazing bands, structural fins (windowDensity), & glowing LED media ribbon (hasCornerAccents)
 * - 3 distinct stadium roofs: 'stepped' full cantilevered oval ring canopy, 'flat' twin sweeping grandstand wing canopies,
 *   and 'hip' vaulted domed arena roof with translucent skylight crown
 * - 4 towering corner floodlight pylons with illuminated LED banks (hasChimney) + twin end-zone Jumbotron screens
 */
export function buildStadium(config: HouseConfig, ctx: HouseBuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'StadiumModel';

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

  const pitchTurfMat = new THREE.MeshStandardMaterial({
    name: 'StadiumPitchTurf',
    color: new THREE.Color('#3b8747'),
    roughness: 0.9,
    metalness: 0.0,
  });
  const pitchStripeMat = new THREE.MeshStandardMaterial({
    name: 'StadiumPitchStripe',
    color: new THREE.Color('#479b54'),
    roughness: 0.88,
    metalness: 0.0,
  });
  const trackClayMat = new THREE.MeshStandardMaterial({
    name: 'StadiumRunningTrack',
    color: new THREE.Color('#b6533e'),
    roughness: 0.84,
    metalness: 0.02,
  });
  const seatBlueMat = new THREE.MeshStandardMaterial({
    name: 'StadiumSeatingBlue',
    color: new THREE.Color('#1e4ed8'),
    roughness: 0.52,
    metalness: 0.08,
  });
  const whiteLineMat = new THREE.MeshStandardMaterial({
    name: 'StadiumPitchMarkings',
    color: new THREE.Color('#f8fafc'),
    roughness: 0.65,
  });
  const ledGlowMat = new THREE.MeshStandardMaterial({
    name: 'StadiumLedDisplay',
    color: new THREE.Color('#e0f2fe'),
    emissive: new THREE.Color('#38bdf8'),
    emissiveIntensity: 1.05,
    roughness: 0.25,
  });
  ctx.trackDisposable(pitchTurfMat);
  ctx.trackDisposable(pitchStripeMat);
  ctx.trackDisposable(trackClayMat);
  ctx.trackDisposable(seatBlueMat);
  ctx.trackDisposable(whiteLineMat);
  ctx.trackDisposable(ledGlowMat);

  const batch = new StadiumBatcher();
  const SEGS = 32;

  const outerRx = width / 2;
  const outerRz = depth / 2;
  const innerRx = width * 0.31;
  const innerRz = depth * 0.28;

  // 1. Inner Athletics Track Oval + Mowed Football Pitch + Field Markings + Goal Posts
  batch.addGeometry('trackClay', createOvalDiscGeo(innerRx + 0.6, innerRz + 0.6, 0.06, 36), 0, 0, 0);

  const pitchL = width * 0.44;
  const pitchW = depth * 0.38;
  const pitchY = 0.085;
  batch.addBox('pitchTurf', pitchL + 2.4, 0.04, pitchW + 2.2, 0, pitchY, 0);

  // Alternating mowed grass stripes
  const stripeCount = 8;
  const stripeW = pitchL / stripeCount;
  for (let s = 0; s < stripeCount; s += 2) {
    const sx = -pitchL / 2 + stripeW * (s + 0.5);
    batch.addBox('pitchStripe', stripeW, 0.044, pitchW, sx, pitchY + 0.004, 0);
  }

  // White pitch markings (touchlines, halfway line, center circle, penalty boxes)
  const lineY = pitchY + 0.032;
  const lw = 0.22;
  batch.addBox('whiteLine', pitchL, 0.015, lw, 0, lineY, pitchW / 2);
  batch.addBox('whiteLine', pitchL, 0.015, lw, 0, lineY, -pitchW / 2);
  batch.addBox('whiteLine', lw, 0.015, pitchW, -pitchL / 2, lineY, 0);
  batch.addBox('whiteLine', lw, 0.015, pitchW, pitchL / 2, lineY, 0);
  batch.addBox('whiteLine', lw, 0.015, pitchW, 0, lineY, 0);
  // Center ring
  const centerR = Math.min(pitchL, pitchW) * 0.16;
  const ringGeo = new THREE.RingGeometry(centerR - 0.2, centerR, 24);
  ringGeo.rotateX(-Math.PI / 2);
  batch.addGeometry('whiteLine', ringGeo, 0, lineY + 0.01, 0);
  // Penalty areas & goal frames
  const penW = pitchL * 0.14;
  const penD = pitchW * 0.44;
  for (const sx of [-1, 1]) {
    const gx = sx * (pitchL / 2);
    const boxEdgeX = sx * (pitchL / 2 - penW);
    batch.addBox('whiteLine', lw, 0.015, penD, boxEdgeX, lineY, 0);
    batch.addBox('whiteLine', penW, 0.015, lw, sx * (pitchL / 2 - penW / 2), lineY, penD / 2);
    batch.addBox('whiteLine', penW, 0.015, lw, sx * (pitchL / 2 - penW / 2), lineY, -penD / 2);
    // Goal posts + crossbar
    const goalW = Math.min(4.8, pitchW * 0.18);
    const goalH = 1.65;
    batch.addCylinder('metalAccent', 0.07, 0.07, goalH, gx, pitchY + goalH / 2, -goalW / 2);
    batch.addCylinder('metalAccent', 0.07, 0.07, goalH, gx, pitchY + goalH / 2, goalW / 2);
    batch.addBox('metalAccent', 0.12, 0.12, goalW + 0.14, gx, pitchY + goalH, 0);
  }

  // 2. Stepped Concourse Plinth & Entry Grand Portals (hasPorch)
  const plinthRx = outerRx + (hasPorch ? 2.8 : 0.7);
  const plinthRz = outerRz + (hasPorch ? 2.8 : 0.7);
  for (let i = 0; i < SEGS; i++) {
    const t0 = (i / SEGS) * Math.PI * 2;
    const t1 = ((i + 1) / SEGS) * Math.PI * 2;
    const in0 = ovalPoint(innerRx + 0.3, innerRz + 0.3, t0);
    const in1 = ovalPoint(innerRx + 0.3, innerRz + 0.3, t1);
    const out0 = ovalPoint(plinthRx, plinthRz, t0);
    const out1 = ovalPoint(plinthRx, plinthRz, t1);
    batch.addRingSectorPrism('foundation', in0, out0, out1, in1, 0, foundationHeight * 0.55, 0, foundationHeight * 0.55);
  }

  if (hasPorch) {
    // North & South grand fan entry portals & radial steps along ±Z
    const portalW = Math.min(18, width * 0.24);
    const stepCount = Math.max(3, Math.round(foundationHeight / 0.24));
    const stepRise = (foundationHeight * 0.6) / stepCount;
    for (const dirZ of [1, -1]) {
      const zBase = dirZ * (plinthRz - 0.2);
      for (let s = 0; s < stepCount; s++) {
        const sy = stepRise * (stepCount - s - 0.5);
        const sz = zBase + dirZ * (0.3 + s * 0.48);
        batch.addBox('stoneStep', portalW, stepRise, 0.52, 0, sy, sz);
      }
      // Illuminated glass turnstile entry lobby + mullions + projecting architectural canopy
      const lobbyZ = dirZ * (outerRz + 0.8);
      const lobbyH = Math.min(floorHeight * 0.85, 4.4);
      batch.addBox('glassBacking', portalW * 0.82, lobbyH, 1.8, 0, foundationHeight * 0.55 + lobbyH / 2, lobbyZ);
      batch.addBox('glass', portalW * 0.8, lobbyH - 0.25, 1.9, 0, foundationHeight * 0.55 + lobbyH / 2, lobbyZ);
      batch.addBox('trim', portalW + 1.4, 0.35, 3.2, 0, foundationHeight * 0.55 + lobbyH + 0.15, lobbyZ + dirZ * 0.5);
      // Portal support piers & mullions
      for (let m = -2; m <= 2; m++) {
        const mx = (m / 2) * (portalW * 0.42);
        batch.addBox('trim', 0.35, lobbyH + 0.2, 0.45, mx, foundationHeight * 0.55 + lobbyH / 2, lobbyZ + dirZ * 1.15);
      }
      batch.addBox('ledGlow', portalW * 0.72, 0.24, 0.18, 0, foundationHeight * 0.55 + lobbyH + 0.14, lobbyZ + dirZ * 2.08);
    }
  }

  // 3. Multi-Tiered Stadium Seating Bowl & Exterior Architectural Shell (floors = 1..3 tiers)
  const baseY = foundationHeight * 0.55;
  const totalBowlH = floors * floorHeight;
  const topRimY = baseY + totalBowlH;
  const stepsPerTier = 3;

  for (let i = 0; i < SEGS; i++) {
    const t0 = (i / SEGS) * Math.PI * 2;
    const t1 = ((i + 1) / SEGS) * Math.PI * 2;

    const exIn0 = ovalPoint(outerRx - 1.15, outerRz - 1.15, t0);
    const exIn1 = ovalPoint(outerRx - 1.15, outerRz - 1.15, t1);
    const exOut0 = ovalPoint(outerRx, outerRz, t0);
    const exOut1 = ovalPoint(outerRx, outerRz, t1);

    // Solid exterior structural wall shell up to top rim
    batch.addRingSectorPrism('wall', exIn0, exOut0, exOut1, exIn1, baseY, topRimY, baseY, topRimY);

    // Exterior concourse curtain-wall glazing band per tier
    const bandH = Math.min(floorHeight * 0.56, floorHeight * 0.52 * windowScale);
    const gIn0 = ovalPoint(outerRx - 0.12, outerRz - 0.12, t0);
    const gIn1 = ovalPoint(outerRx - 0.12, outerRz - 0.12, t1);
    const gOut0 = ovalPoint(outerRx + 0.14, outerRz + 0.14, t0);
    const gOut1 = ovalPoint(outerRx + 0.14, outerRz + 0.14, t1);

    for (let f = 0; f < floors; f++) {
      const fBaseY = baseY + f * floorHeight;
      const gBot = fBaseY + (floorHeight - bandH) * 0.5;
      const gTop = gBot + bandH;
      batch.addRingSectorPrism('glass', gIn0, gOut0, gOut1, gIn1, gBot, gTop, gBot, gTop);
      // Horizontal floor spandrel ring trim
      batch.addRingSectorPrism('trim', exIn0, gOut0, gOut1, exIn1, fBaseY + floorHeight - 0.28, fBaseY + floorHeight, fBaseY + floorHeight - 0.28, fBaseY + floorHeight);

      // Tiered interior seating bleachers (each tier overlaps/steps radially outward from innerRx to outerRx)
      const tierFracIn = f === 0 ? 0 : (f / floors) * 0.35;
      const tierFracOut = 0.94 - (floors - 1 - f) * 0.04;
      const tInnerRx = THREE.MathUtils.lerp(innerRx + 0.6, outerRx - 1.3, tierFracIn);
      const tInnerRz = THREE.MathUtils.lerp(innerRz + 0.6, outerRz - 1.3, tierFracIn);
      const tOuterRx = THREE.MathUtils.lerp(innerRx + 0.6, outerRx - 1.1, tierFracOut);
      const tOuterRz = THREE.MathUtils.lerp(innerRz + 0.6, outerRz - 1.1, tierFracOut);

      // Sloped concrete bleacher slab
      const bIn0 = ovalPoint(tInnerRx, tInnerRz, t0);
      const bIn1 = ovalPoint(tInnerRx, tInnerRz, t1);
      const bOut0 = ovalPoint(tOuterRx, tOuterRz, t0);
      const bOut1 = ovalPoint(tOuterRx, tOuterRz, t1);
      const slabInBot = f === 0 ? baseY : fBaseY - 0.2;
      const slabInTop = fBaseY + 0.7;
      const slabOutBot = f === 0 ? baseY : fBaseY + floorHeight - 1.0;
      const slabOutTop = fBaseY + floorHeight - 0.15;
      batch.addRingSectorPrism('stoneStep', bIn0, bOut0, bOut1, bIn1, slabInBot, slabInTop, slabOutBot, slabOutTop);

      // Stepped cobalt-blue stadium seat tiers sitting cleanly atop concrete riser
      for (let st = 0; st < stepsPerTier; st++) {
        const s0 = st / stepsPerTier;
        const s1 = (st + 0.92) / stepsPerTier;
        const srInRx = THREE.MathUtils.lerp(tInnerRx + 0.3, tOuterRx - 0.3, s0);
        const srInRz = THREE.MathUtils.lerp(tInnerRz + 0.3, tOuterRz - 0.3, s0);
        const srOutRx = THREE.MathUtils.lerp(tInnerRx + 0.3, tOuterRx - 0.3, s1);
        const srOutRz = THREE.MathUtils.lerp(tInnerRz + 0.3, tOuterRz - 0.3, s1);
        const ySeatBot = THREE.MathUtils.lerp(slabInTop, slabOutTop, s0);
        const ySeatTop = THREE.MathUtils.lerp(slabInTop, slabOutTop, s1) + 0.35;
        batch.addRingSectorPrism(
          'seatBlue',
          ovalPoint(srInRx, srInRz, t0),
          ovalPoint(srOutRx, srOutRz, t0),
          ovalPoint(srOutRx, srOutRz, t1),
          ovalPoint(srInRx, srInRz, t1),
          ySeatBot,
          ySeatTop,
          ySeatBot,
          ySeatTop,
        );
      }

      // Optional upper tier safety glass balustrades (hasBalcony)
      if (hasBalcony && f >= 1) {
        const railIn0 = ovalPoint(tInnerRx, tInnerRz, t0);
        const railIn1 = ovalPoint(tInnerRx, tInnerRz, t1);
        const railOut0 = ovalPoint(tInnerRx + 0.14, tInnerRz + 0.14, t0);
        const railOut1 = ovalPoint(tInnerRx + 0.14, tInnerRz + 0.14, t1);
        batch.addRingSectorPrism('glass', railIn0, railOut0, railOut1, railIn1, slabInTop, slabInTop + 0.95, slabInTop, slabInTop + 0.95);
      }
    }

    // Glowing LED media ribbon wrapping exterior rim (hasCornerAccents)
    if (hasCornerAccents) {
      const ledBot = topRimY - 1.25;
      const ledTop = topRimY - 0.48;
      const ledIn0 = ovalPoint(outerRx + 0.05, outerRz + 0.05, t0);
      const ledIn1 = ovalPoint(outerRx + 0.05, outerRz + 0.05, t1);
      const ledOut0 = ovalPoint(outerRx + 0.28, outerRz + 0.28, t0);
      const ledOut1 = ovalPoint(outerRx + 0.28, outerRz + 0.28, t1);
      batch.addRingSectorPrism('ledGlow', ledIn0, ledOut0, ledOut1, ledIn1, ledBot, ledTop, ledBot, ledTop);
    }
  }

  // Structural Exterior Diagrid / Buttress Fins around the oval facade (hasCornerAccents + windowDensity)
  if (hasCornerAccents) {
    const finCount = windowDensity === 1 ? 16 : windowDensity === 2 ? 24 : 32;
    const finH = totalBowlH + 0.5;
    for (let f = 0; f < finCount; f++) {
      const th = (f / finCount) * Math.PI * 2;
      const [fx, fz] = ovalPoint(outerRx + 0.48, outerRz + 0.48, th);
      const rotY = Math.atan2(fx / outerRx, fz / outerRz);
      batch.addBox('trim', 0.48, finH, 0.95, fx, baseY + finH / 2, fz, 0, rotY, 0);
    }
  }

  // Twin Hanging End-Zone Jumbotron Scoreboards inside the bowl (±X)
  for (const dirX of [-1, 1]) {
    const jx = dirX * (innerRx + 2.2);
    const jy = topRimY - 1.2;
    batch.addBox('trim', 0.55, 2.8, 7.6, jx, jy, 0);
    batch.addBox('ledGlow', 0.14, 2.2, 6.8, jx - dirX * 0.28, jy, 0);
    batch.addBox('metalAccent', 1.8, 0.35, 0.4, jx + dirX * 0.9, jy + 1.5, -2.4);
    batch.addBox('metalAccent', 1.8, 0.35, 0.4, jx + dirX * 0.9, jy + 1.5, 2.4);
  }

  // 4. Three Stadium Roof Canopy Archetypes ('stepped', 'flat', 'hip')
  const rad = (roofPitchDeg * Math.PI) / 180;
  const canopyOverhang = 1.6 + roofOverhang * 1.4;
  const canopyOuterRx = outerRx + canopyOverhang;
  const canopyOuterRz = outerRz + canopyOverhang;
  const canopyInnerRx = Math.max(innerRx - 1.2, width * 0.27);
  const canopyInnerRz = Math.max(innerRz - 1.2, depth * 0.24);
  const canopyRise = Math.max(1.2, Math.tan(rad) * (width * 0.1));

  if (roofType === 'stepped') {
    // Classic Oval Cantilevered Membrane Ring Canopy with Open Pitch Oculus & Steel Truss Ribs
    for (let i = 0; i < SEGS; i++) {
      const t0 = (i / SEGS) * Math.PI * 2;
      const t1 = ((i + 1) / SEGS) * Math.PI * 2;
      const cIn0 = ovalPoint(canopyInnerRx, canopyInnerRz, t0);
      const cIn1 = ovalPoint(canopyInnerRx, canopyInnerRz, t1);
      const cOut0 = ovalPoint(canopyOuterRx, canopyOuterRz, t0);
      const cOut1 = ovalPoint(canopyOuterRx, canopyOuterRz, t1);
      const innerY = topRimY + canopyRise;
      batch.addRingSectorPrism('roof', cIn0, cOut0, cOut1, cIn1, innerY, innerY + 0.45, topRimY + 0.2, topRimY + 0.65);
      // Inner compression truss ring
      const trIn0 = ovalPoint(canopyInnerRx - 0.35, canopyInnerRz - 0.35, t0);
      const trIn1 = ovalPoint(canopyInnerRx - 0.35, canopyInnerRz - 0.35, t1);
      batch.addRingSectorPrism('metalAccent', trIn0, cIn0, cIn1, trIn1, innerY - 0.15, innerY + 0.55, innerY - 0.15, innerY + 0.55);
    }
    // Radial cantilevered steel roof trusses aligned cleanly along canopy slope
    const trussCount = 16;
    const innerTrussY = topRimY + canopyRise + 0.35;
    const outerTrussY = topRimY + 0.55;
    for (let k = 0; k < trussCount; k++) {
      const th = (k / trussCount) * Math.PI * 2;
      const [pInX, pInZ] = ovalPoint(canopyInnerRx, canopyInnerRz, th);
      const [pOutX, pOutZ] = ovalPoint(canopyOuterRx, canopyOuterRz, th);
      batch.addSpanBeam(
        'metalAccent',
        0.38,
        0.52,
        [pInX, innerTrussY, pInZ],
        [pOutX, outerTrussY, pOutZ],
      );
    }
  } else if (roofType === 'flat') {
    // Twin Sweeping Grandstand Wing Canopies (North & South main sidelines) with Arched Steel Spine Trusses
    const wingSpanX = width * 0.72;
    const wingSpanZ = depth * 0.27 + canopyOverhang;
    for (const dirZ of [-1, 1]) {
      const wz = dirZ * (outerRz * 0.74);
      const innerEdgeY = topRimY + canopyRise * 1.15;
      const outerEdgeY = topRimY + 0.45;
      const tilt = dirZ * Math.atan2(innerEdgeY - outerEdgeY, wingSpanZ);
      batch.addBox('roof', wingSpanX, 0.45, wingSpanZ, 0, (innerEdgeY + outerEdgeY) / 2, wz, tilt, 0, 0);
      batch.addBox('trim', wingSpanX + 0.3, 0.55, 0.4, 0, innerEdgeY, wz - dirZ * (wingSpanZ / 2 - 0.2));
      // Dramatic overhead steel arch spine truss spanning cleanly between North/South rim piers
      const archH = Math.max(3.6, width * 0.06);
      const archSegs = 8;
      for (let a = 0; a < archSegs; a++) {
        const u0 = -1 + (2 * a) / archSegs;
        const u1 = -1 + (2 * (a + 1)) / archSegs;
        const x0 = u0 * (wingSpanX * 0.47);
        const x1 = u1 * (wingSpanX * 0.47);
        const y0 = topRimY + 0.2 + archH * (1 - u0 * u0);
        const y1 = topRimY + 0.2 + archH * (1 - u1 * u1);
        const segLen = Math.hypot(x1 - x0, y1 - y0);
        const rotZ = Math.atan2(y1 - y0, x1 - x0);
        batch.addBox('metalAccent', segLen + 0.2, 0.5, 0.55, (x0 + x1) / 2, (y0 + y1) / 2, wz, 0, 0, rotZ);
      }
      // Concrete/steel arch abutment piers seated firmly on the bowl rim
      for (const sx of [-1, 1]) {
        batch.addBox('metalAccent', 0.9, 1.4, 0.9, sx * (wingSpanX * 0.47), topRimY + 0.3, wz);
      }
    }
  } else {
    // 'hip': Full Domed / Retractable Covered Arena Roof with Central Skylight Oculus
    const skyRx = width * 0.16;
    const skyRz = depth * 0.14;
    const crownY = topRimY + canopyRise * 2.1;
    for (let i = 0; i < SEGS; i++) {
      const t0 = (i / SEGS) * Math.PI * 2;
      const t1 = ((i + 1) / SEGS) * Math.PI * 2;
      const cIn0 = ovalPoint(skyRx, skyRz, t0);
      const cIn1 = ovalPoint(skyRx, skyRz, t1);
      const cOut0 = ovalPoint(canopyOuterRx, canopyOuterRz, t0);
      const cOut1 = ovalPoint(canopyOuterRx, canopyOuterRz, t1);
      batch.addRingSectorPrism('roof', cIn0, cOut0, cOut1, cIn1, crownY, crownY + 0.5, topRimY + 0.25, topRimY + 0.7);
      // Skylight compression frame ring
      const frIn0 = ovalPoint(skyRx - 0.25, skyRz - 0.25, t0);
      const frIn1 = ovalPoint(skyRx - 0.25, skyRz - 0.25, t1);
      batch.addRingSectorPrism('metalAccent', frIn0, cIn0, cIn1, frIn1, crownY - 0.1, crownY + 0.65, crownY - 0.1, crownY + 0.65);
    }
    // Translucent retractable glazed center skylight dome capping the center oval
    const skyCrownY = crownY + 0.1;
    batch.addGeometry('glass', createOvalDiscGeo(skyRx + 0.2, skyRz + 0.2, 0.45, 24), 0, skyCrownY, 0);
    // Radial structural dome ribs sloping cleanly from skylight crown down to stadium rim
    const domeRibCount = 16;
    const domeTopY = crownY + 0.55;
    const domeBotY = topRimY + 0.72;
    for (let k = 0; k < domeRibCount; k++) {
      const th = (k / domeRibCount) * Math.PI * 2;
      const [pInX, pInZ] = ovalPoint(skyRx, skyRz, th);
      const [pOutX, pOutZ] = ovalPoint(canopyOuterRx, canopyOuterRz, th);
      batch.addSpanBeam(
        'metalAccent',
        0.44,
        0.52,
        [pInX, domeTopY, pInZ],
        [pOutX, domeBotY, pOutZ],
      );
    }
    // Skylight mullion crossbars within the central oval
    batch.addBox('metalAccent', skyRx * 1.9, 0.3, 0.35, 0, skyCrownY + 0.45, 0);
    batch.addBox('metalAccent', 0.35, 0.3, skyRz * 1.9, 0, skyCrownY + 0.45, 0);
  }

  // 5. Four Corner Stadium Floodlight Pylon Towers outside canopy rim on grounded concrete piers (hasChimney)
  if (hasChimney) {
    const mastH = Math.max(9.5, totalBowlH * 0.72 + 4.5);
    const pierH = Math.max(2.4, topRimY - 0.5);
    for (const [sx, sz] of [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ]) {
      const angle = Math.atan2(sz, sx);
      const [mx, mz] = ovalPoint(canopyOuterRx + 1.4, canopyOuterRz + 1.4, angle);
      const mBaseY = topRimY - 0.5;
      const rotY = Math.atan2(-mx, -mz);
      // Grounded concrete pylon pier rising from plaza y=0 to mast collar
      batch.addCylinder('foundation', 0.85, 0.72, pierH, mx, pierH / 2, mz);
      // Tapered steel pylon mast
      batch.addCylinder('metalAccent', 0.55, 0.34, mastH, mx, mBaseY + mastH / 2, mz);
      // Angled floodlight head frame + glowing LED lamp bank facing pitch center
      const headY = mBaseY + mastH + 0.5;
      batch.addBox('trim', 4.6, 2.2, 0.45, mx, headY, mz, 0.32, rotY, 0);
      batch.addBox('ledGlow', 4.1, 1.7, 0.16, mx - Math.sin(rotY) * 0.26, headY - 0.06, mz - Math.cos(rotY) * 0.26, 0.32, rotY, 0);
    }
  }

  batch.flushToGroup(group, ctx, {
    pitchTurf: pitchTurfMat,
    pitchStripe: pitchStripeMat,
    trackClay: trackClayMat,
    seatBlue: seatBlueMat,
    whiteLine: whiteLineMat,
    ledGlow: ledGlowMat,
  });

  return group;
}
