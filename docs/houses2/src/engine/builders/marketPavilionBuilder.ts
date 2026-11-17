import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HouseConfig } from '../../types/house';
import type { HouseBuildContext } from './types';

type MarketBucketKey =
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
  | 'awningRed'
  | 'awningAmber'
  | 'lanternGlow';

class MarketPavilionBatcher {
  private readonly buckets: Record<MarketBucketKey, THREE.BufferGeometry[]> = {
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
    awningRed: [],
    awningAmber: [],
    lanternGlow: [],
  };

  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly unitCyl = new THREE.CylinderGeometry(1, 1, 1, 14);
  private readonly mat4 = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();

  addBox(
    bucket: MarketBucketKey,
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
    bucket: MarketBucketKey,
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
    bucket: MarketBucketKey,
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
    extraMaterials: Record<'awningRed' | 'awningAmber' | 'lanternGlow', THREE.MeshStandardMaterial>,
  ): void {
    this.unitBox.dispose();
    this.unitCyl.dispose();

    for (const [key, geos] of Object.entries(this.buckets) as Array<
      [MarketBucketKey, THREE.BufferGeometry[]]
    >) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      ctx.trackGeometry(merged);

      const mat =
        key === 'awningRed' || key === 'awningAmber' || key === 'lanternGlow'
          ? extraMaterials[key]
          : ctx.materials[key];
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `MarketPavilion_${key}`;
      const isGlass = key === 'glass';
      const isEmissive = key === 'lanternGlow';
      mesh.castShadow = !isGlass && !isEmissive;
      mesh.receiveShadow = !isGlass && !isEmissive;
      group.add(mesh);
    }
  }
}

function createLongitudinalGable(spanZ: number, lenX: number, riseH: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-spanZ / 2, 0);
  shape.lineTo(spanZ / 2, 0);
  shape.lineTo(0, riseH);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: lenX,
    bevelEnabled: false,
  });
  geo.translate(0, 0, -lenX / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
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
    uvs.push(a[0] * 0.3, a[2] * 0.3, b[0] * 0.3, b[2] * 0.3, c[0] * 0.3, c[2] * 0.3);
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
 * Builds a Covered Urban / Farmer's Market Hall Pavilion (Рыночный павильон):
 * - Broad stone/concrete market plinth & welcoming front entrance stairs
 * - High brick/masonry & timber market hall with airy clerestory arched-feel window bays (windowDensity 1..3)
 *   and wide double timber/glass market hall doors on front & sides
 * - Three period/contemporary market hall roofs:
 *   1) 'gable': Vaulted Basilica Market Hall with elevated central skylight monitor spine
 *   2) 'hip': Festive timber hipped fairground pavilion roof with double flared eaves
 *   3) 'flat': Contemporary steel-and-glass urban food-hall canopy with linear glass skylight ridge
 * - Exterior market vendor stalls with striped red & amber awnings, wooden produce counters & crates (hasPorch),
 *   rooftop market sign fascia / glowing clock lantern & vents (hasChimney),
 *   corner masonry piers & decorative timber knee braces (hasCornerAccents), and flank arcade awnings (hasBalcony)
 */
export function buildMarketPavilion(
  config: HouseConfig,
  ctx: HouseBuildContext,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'MarketPavilionModel';

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

  const awningRedMat = new THREE.MeshStandardMaterial({
    name: 'MarketAwningTerracotta',
    color: new THREE.Color('#c2412d'),
    roughness: 0.78,
    metalness: 0.02,
  });
  const awningAmberMat = new THREE.MeshStandardMaterial({
    name: 'MarketAwningOchre',
    color: new THREE.Color('#eab308'),
    roughness: 0.78,
    metalness: 0.02,
  });
  const lanternGlowMat = new THREE.MeshStandardMaterial({
    name: 'MarketLanternWarmGlow',
    color: new THREE.Color('#fef3c7'),
    emissive: new THREE.Color('#f59e0b'),
    emissiveIntensity: 1.05,
    roughness: 0.25,
  });

  ctx.trackDisposable(awningRedMat);
  ctx.trackDisposable(awningAmberMat);
  ctx.trackDisposable(lanternGlowMat);

  const batch = new MarketPavilionBatcher();
  const baseY = foundationHeight;
  const topY = baseY + floorHeight;
  const hw = width / 2;
  const hd = depth / 2;

  // 1. Broad Stone Market Plinth & Raised Sidewalk Apron
  const plinthPad = hasPorch ? 2.1 : 0.7;
  batch.addBox('foundation', width + plinthPad * 2, foundationHeight * 0.84, depth + plinthPad * 2, 0, (foundationHeight * 0.84) / 2, 0);
  batch.addBox('stoneStep', width + plinthPad * 2 + 0.18, foundationHeight * 0.22, depth + plinthPad * 2 + 0.18, 0, foundationHeight * 0.9, 0);

  if (hasPorch) {
    // Broad ceremonial market steps centered along +Z front promenade
    const stepW = Math.min(6.4, width * 0.36);
    for (let s = 0; s < 2; s++) {
      const sh = (foundationHeight / 2) * (2 - s);
      batch.addBox('stoneStep', stepW + s * 0.4, sh * 0.5, 0.42, 0, sh * 0.25 + (1 - s) * 0.08, hd + plinthPad + 0.22 + s * 0.38);
    }
  }

  // 2. Main Market Hall Perimeter Walls, Timber/Masonry Piers & Clerestory Glazing
  batch.addBox('wall', width, floorHeight, depth, 0, baseY + floorHeight / 2, 0);
  // Decorative stone plinth wainscot skirt & upper timber frieze beam
  batch.addBox('stoneStep', width + 0.12, 0.85, depth + 0.12, 0, baseY + 0.425, 0);
  batch.addBox('trim', width + 0.32, 0.18, depth + 0.32, 0, topY - 0.09, 0);

  // Corner masonry/timber buttress piers & overhead arcade braces (hasCornerAccents)
  const bayCols = windowDensity === 1 ? 3 : windowDensity === 2 ? 5 : 7;
  const sideCols = windowDensity === 1 ? 2 : 3;
  const bayWinW = Math.min(2.15, (width - 3.0) / (bayCols * 1.4));
  const bayWinH = Math.min(floorHeight * 0.54, 2.35 * windowScale);
  const winMidY = baseY + floorHeight * 0.58;

  if (hasCornerAccents) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        batch.addBox('stoneStep', 0.68, floorHeight, 0.68, sx * (hw - 0.15), baseY + floorHeight / 2, sz * (hd - 0.15));
        batch.addBox('stoneStep', 0.82, 0.24, 0.82, sx * (hw - 0.15), topY - 0.12, sz * (hd - 0.15));
      }
    }
    // Rhythm facade pilasters between bays
    for (let i = 0; i < bayCols - 1; i++) {
      const px = -hw + 1.5 + ((width - 3.0) * (i + 0.5)) / Math.max(1, bayCols - 1);
      for (const sz of [-1, 1]) {
        batch.addBox('stoneStep', 0.32, floorHeight - 0.18, 0.16, px, baseY + floorHeight / 2, sz * (hd + 0.04));
      }
    }
  }

  // Tall Market Clerestory Windows & Front Center Market Portal Door
  const addMarketWindow = (cx: number, cy: number, cz: number, rotY: number) => {
    const dirZ = Math.cos(rotY);
    const dirX = Math.sin(rotY);
    batch.addBox('glassBacking', bayWinW - 0.08, bayWinH - 0.08, 0.05, cx + dirX * 0.02, cy, cz + dirZ * 0.02, 0, rotY, 0);
    batch.addBox('glass', bayWinW - 0.12, bayWinH - 0.12, 0.03, cx + dirX * 0.05, cy, cz + dirZ * 0.05, 0, rotY, 0);
    batch.addBox('trim', bayWinW + 0.14, 0.09, 0.1, cx + dirX * 0.06, cy + bayWinH / 2, cz + dirZ * 0.06, 0, rotY, 0);
    batch.addBox('stoneStep', bayWinW + 0.2, 0.1, 0.16, cx + dirX * 0.08, cy - bayWinH / 2 - 0.04, cz + dirZ * 0.08, 0, rotY, 0);
    // Multi-pane lattice mullions
    batch.addBox('trim', 0.06, bayWinH - 0.06, 0.07, cx + dirX * 0.065, cy, cz + dirZ * 0.065, 0, rotY, 0);
    batch.addBox('trim', bayWinW - 0.08, 0.06, 0.07, cx + dirX * 0.065, cy + bayWinH * 0.16, cz + dirZ * 0.065, 0, rotY, 0);
  };

  const centerIdx = Math.floor(bayCols / 2);
  for (let i = 0; i < bayCols; i++) {
    const wx = -hw + 1.6 + ((width - 3.2) * i) / Math.max(1, bayCols - 1);
    if (i === centerIdx) {
      // Wide double timber/glass Market Entrance Portal (+Z and -Z)
      const doorW = Math.min(2.8, bayWinW * 1.35);
      const doorH = Math.min(2.85, floorHeight - 0.5);
      for (const sz of [-1, 1]) {
        batch.addBox('trim', doorW + 0.28, doorH + 0.16, 0.1, wx, baseY + doorH / 2, sz * (hd + 0.04));
        batch.addBox('door', doorW, doorH * 0.72, 0.07, wx, baseY + doorH * 0.36, sz * (hd + 0.07));
        batch.addBox('glassBacking', doorW * 0.74, doorH * 0.44, 0.05, wx, baseY + doorH * 0.38, sz * (hd + 0.095));
        batch.addBox('glass', doorW * 0.7, doorH * 0.4, 0.03, wx, baseY + doorH * 0.38, sz * (hd + 0.115));
        batch.addBox('glassBacking', doorW * 0.82, doorH * 0.24, 0.05, wx, baseY + doorH * 0.85, sz * (hd + 0.095));
        batch.addBox('glass', doorW * 0.78, doorH * 0.21, 0.03, wx, baseY + doorH * 0.85, sz * (hd + 0.115));
        batch.addBox('trim', 0.07, doorH * 0.94, 0.03, wx, baseY + doorH * 0.48, sz * (hd + 0.135));
      }
    } else {
      addMarketWindow(wx, winMidY, hd, 0);
      addMarketWindow(wx, winMidY, -hd, Math.PI);
    }
  }
  for (let j = 0; j < sideCols; j++) {
    const wz = -hd + 1.8 + ((depth - 3.6) * j) / Math.max(1, sideCols - 1);
    addMarketWindow(-hw, winMidY, wz, -Math.PI / 2);
    addMarketWindow(hw, winMidY, wz, Math.PI / 2);
  }

  // 3. Exterior Market Stalls, Striped Fabric Awnings & Wooden Produce Counters (hasPorch)
  if (hasPorch) {
    const awningZ = hd + 0.92;
    const stallH = 2.45;
    // Left and right vendor stall wings flanking the center entrance door
    const wingLen = Math.max(2.6, hw - 2.3);
    for (const sx of [-1, 1]) {
      const wingCenter = sx * (2.15 + wingLen / 2);
      const stripeCount = Math.max(4, Math.round(wingLen / 0.65));
      const stripeW = wingLen / stripeCount;

      // Striped pitched fabric awning (alternating red/ochre stripes)
      for (let st = 0; st < stripeCount; st++) {
        const ax = wingCenter - wingLen / 2 + (st + 0.5) * stripeW;
        batch.addBox(
          st % 2 === 0 ? 'awningRed' : 'awningAmber',
          stripeW + 0.005,
          0.06,
          1.85,
          ax,
          baseY + stallH,
          awningZ,
          0.26,
          0,
          0,
        );
      }
      // Front valance scallop strip & timber arcade posts supporting awning
      batch.addBox('timberAccent', wingLen, 0.1, 0.1, wingCenter, baseY + stallH - 0.22, hd + 1.78);
      batch.addCylinder('timberAccent', 0.065, 0.065, stallH - 0.22, wingCenter - wingLen / 2 + 0.15, baseY + (stallH - 0.22) / 2, hd + 1.78);
      batch.addCylinder('timberAccent', 0.065, 0.065, stallH - 0.22, wingCenter + wingLen / 2 - 0.15, baseY + (stallH - 0.22) / 2, hd + 1.78);

      // Wooden produce counter & stacked market crates under each awning
      batch.addBox('timberAccent', wingLen - 0.5, 0.82, 0.72, wingCenter, baseY + 0.41, hd + 0.72);
      batch.addBox('timberAccent', wingLen - 0.36, 0.08, 0.86, wingCenter, baseY + 0.84, hd + 0.75);
      // Warm display crates & hanging market pendant lights
      for (const ox of [-wingLen * 0.28, 0, wingLen * 0.28]) {
        batch.addBox('timberAccent', 0.52, 0.24, 0.42, wingCenter + ox, baseY + 1.0, hd + 0.76, 0.14, 0, 0);
        batch.addBox('lanternGlow', 0.16, 0.14, 0.16, wingCenter + ox, baseY + stallH - 0.16, hd + 0.82);
      }
    }

    // Grand center market entrance timber gable awning
    batch.addBox('timberAccent', 3.4, 0.12, 1.95, 0, baseY + 2.95, hd + 0.95, 0.12, 0, 0);
    batch.addBox('roof', 3.6, 0.09, 2.05, 0, baseY + 3.04, hd + 0.95, 0.12, 0, 0);
    for (const sx of [-1, 1]) {
      batch.addCylinder('timberAccent', 0.09, 0.09, 2.9, sx * 1.55, baseY + 1.45, hd + 1.8);
    }
  }

  // Side-Arcade Striped Awnings along -X & +X flanks (hasBalcony)
  if (hasBalcony) {
    const sideLen = Math.max(4.0, depth - 2.6);
    const stripeCount = Math.max(4, Math.round(sideLen / 0.8));
    const stripeD = sideLen / stripeCount;
    for (const sx of [-1, 1]) {
      for (let st = 0; st < stripeCount; st++) {
        const az = -sideLen / 2 + (st + 0.5) * stripeD;
        batch.addBox(
          st % 2 === 0 ? 'awningRed' : 'awningAmber',
          1.55,
          0.06,
          stripeD + 0.005,
          sx * (hw + 0.72),
          baseY + 2.45,
          az,
          0,
          0,
          sx * -0.25,
        );
      }
      // Articulated side counter table with legs, produce crates & awning posts
      const counterLen = sideLen * 0.72;
      batch.addBox('timberAccent', 0.72, 0.08, counterLen, sx * (hw + 0.55), baseY + 0.82, 0);
      batch.addBox('timberAccent', 0.62, 0.28, counterLen - 0.12, sx * (hw + 0.55), baseY + 0.64, 0);
      for (const lz of [-counterLen * 0.44, 0, counterLen * 0.44]) {
        batch.addBox('trim', 0.08, 0.52, 0.08, sx * (hw + 0.8), baseY + 0.26, lz);
        batch.addBox('trim', 0.08, 0.52, 0.08, sx * (hw + 0.32), baseY + 0.26, lz);
        batch.addBox('timberAccent', 0.42, 0.18, 0.52, sx * (hw + 0.55), baseY + 0.95, lz, 0, 0, sx * -0.12);
      }
      batch.addBox('timberAccent', 0.1, 0.1, sideLen, sx * (hw + 1.44), baseY + 2.24, 0);
      for (const pz of [-sideLen / 2 + 0.2, sideLen / 2 - 0.2]) {
        batch.addCylinder('timberAccent', 0.06, 0.06, 2.24, sx * (hw + 1.44), baseY + 1.12, pz);
      }
    }
  }

  // 4. Three Market Hall Roof Systems
  const rad = (roofPitchDeg * Math.PI) / 180;
  const roofW = width + roofOverhang * 2;
  const roofD = depth + roofOverhang * 2;
  let ridgeTopY = topY + 1.4;

  if (roofType === 'hip') {
    // Hipped Pavilion Roof with flared upper lantern & eaves brackets
    const rise = Math.max(1.8, Math.tan(rad) * (Math.min(width, depth) / 2) * 0.82);
    batch.addBox('trim', roofW + 0.14, 0.14, roofD + 0.14, 0, topY + 0.05, 0);
    batch.addGeometry('roof', createHipRoofGeometry(roofW, roofD, rise), 0, topY + 0.08, 0);
    ridgeTopY = topY + 0.08 + rise;
  } else if (roofType === 'flat') {
    // Contemporary Steel & Timber Urban Food-Hall Roof with Clerestory Skylight Spine
    batch.addBox('trim', roofW + 0.2, 0.16, roofD + 0.2, 0, topY + 0.08, 0);
    batch.addBox('roof', roofW, 0.16, roofD, 0, topY + 0.22, 0);
    // Raised central skylight monitor along X
    const skyW = width * 0.68;
    const skyD = Math.min(3.4, depth * 0.28);
    batch.addBox('trim', skyW, 0.68, skyD, 0, topY + 0.62, 0);
    batch.addBox('glass', skyW - 0.3, 0.52, skyD + 0.04, 0, topY + 0.64, 0);
    batch.addBox('roof', skyW + 0.4, 0.12, skyD + 0.4, 0, topY + 1.0, 0);
    ridgeTopY = topY + 1.08;
  } else {
    // 'gable': Vaulted Basilica Market Hall Roof + Elevated Spine Clerestory Monitor
    const rise = Math.max(2.0, Math.tan(rad) * (depth / 2) * 0.85);
    batch.addGeometry('roof', createLongitudinalGable(roofD, roofW, rise), 0, topY, 0);
    // Clerestory monitor spine sitting atop the main ridge
    const monW = width * 0.72;
    const monD = Math.min(3.0, depth * 0.24);
    const monH = 0.88;
    const monBaseY = topY + rise * 0.72;
    batch.addBox('trim', monW, monH, monD, 0, monBaseY + monH / 2, 0);
    batch.addBox('glass', monW - 0.4, monH * 0.66, monD + 0.04, 0, monBaseY + monH * 0.52, 0);
    batch.addGeometry('roof', createLongitudinalGable(monD + 0.6, monW + 0.6, 0.72), 0, monBaseY + monH, 0);
    ridgeTopY = monBaseY + monH + 0.72;
  }

  // 5. Rooftop Illuminated Market Clock Sign Crest & Lantern Cupolas (hasChimney)
  if (hasChimney) {
    // Central front pediment market clock/crest facing +Z
    const crestZ = hd - 0.12;
    const crestY = topY + 0.15;
    batch.addBox('timberAccent', 3.4, 1.35, 0.24, 0, crestY + 0.65, crestZ + roofOverhang * 0.5);
    batch.addBox('trim', 3.6, 0.18, 0.34, 0, crestY + 1.35, crestZ + roofOverhang * 0.5);
    batch.addCylinder('metalAccent', 0.48, 0.48, 0.1, 0, crestY + 0.72, crestZ + roofOverhang * 0.5 + 0.09, Math.PI / 2, 0, 0);
    batch.addCylinder('lanternGlow', 0.38, 0.38, 0.11, 0, crestY + 0.72, crestZ + roofOverhang * 0.5 + 0.105, Math.PI / 2, 0, 0);
    batch.addBox('metalAccent', 0.04, 0.26, 0.03, 0, crestY + 0.82, crestZ + roofOverhang * 0.5 + 0.17);
    batch.addBox('metalAccent', 0.2, 0.04, 0.03, 0.08, crestY + 0.72, crestZ + roofOverhang * 0.5 + 0.17);

    // Ornate roof ridge vent lantern cupola
    const cupY = ridgeTopY - 0.15;
    batch.addBox('trim', 1.6, 0.95, 1.6, 0, cupY + 0.45, 0);
    batch.addBox('lanternGlow', 1.1, 0.62, 1.64, 0, cupY + 0.45, 0);
    batch.addBox('lanternGlow', 1.64, 0.62, 1.1, 0, cupY + 0.45, 0);
    batch.addCylinder('roof', 1.15, 0.08, 1.05, 0, cupY + 1.4, 0);
    batch.addCylinder('metalAccent', 0.04, 0.02, 0.75, 0, cupY + 2.2, 0);
  }

  batch.flushToGroup(group, ctx, {
    awningRed: awningRedMat,
    awningAmber: awningAmberMat,
    lanternGlow: lanternGlowMat,
  });

  return group;
}
