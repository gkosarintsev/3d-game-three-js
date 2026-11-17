import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HouseConfig } from '../../types/house';
import type { HouseBuildContext } from './types';

type MarketRowBucketKey =
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
  | 'awningTeal'
  | 'awningCream'
  | 'crateGreen'
  | 'crateOrange'
  | 'signDark'
  | 'lanternGlow';

type ExtraMarketRowMatKey =
  | 'awningRed'
  | 'awningAmber'
  | 'awningTeal'
  | 'awningCream'
  | 'crateGreen'
  | 'crateOrange'
  | 'signDark'
  | 'lanternGlow';

class MarketRowBatcher {
  private readonly buckets: Record<MarketRowBucketKey, THREE.BufferGeometry[]> = {
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
    awningTeal: [],
    awningCream: [],
    crateGreen: [],
    crateOrange: [],
    signDark: [],
    lanternGlow: [],
  };

  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly unitCyl = new THREE.CylinderGeometry(1, 1, 1, 12);
  private readonly mat4 = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();

  addBox(
    bucket: MarketRowBucketKey,
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
    bucket: MarketRowBucketKey,
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
      : new THREE.CylinderGeometry(rTop, rBot, 1, 12).toNonIndexed();
    this.pos.set(x, y, z);
    this.euler.set(rotX, rotY, rotZ);
    this.quat.setFromEuler(this.euler);
    this.scale.set(isUniform ? rBot : 1, h, isUniform ? rBot : 1);
    this.mat4.compose(this.pos, this.quat, this.scale);
    geo.applyMatrix4(this.mat4);
    this.buckets[bucket].push(geo);
  }

  addGeometry(
    bucket: MarketRowBucketKey,
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
    extraMaterials: Record<ExtraMarketRowMatKey, THREE.MeshStandardMaterial>,
  ): void {
    this.unitBox.dispose();
    this.unitCyl.dispose();

    for (const [key, geos] of Object.entries(this.buckets) as Array<
      [MarketRowBucketKey, THREE.BufferGeometry[]]
    >) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      ctx.trackGeometry(merged);

      const mat =
        key in extraMaterials
          ? extraMaterials[key as ExtraMarketRowMatKey]
          : ctx.materials[key as keyof typeof ctx.materials];
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `MarketRow_${key}`;
      const isGlass = key === 'glass';
      const isEmissive = key === 'lanternGlow';
      mesh.castShadow = !isGlass && !isEmissive;
      mesh.receiveShadow = !isGlass && !isEmissive;
      group.add(mesh);
    }
  }
}

function createGableRoofGeo(spanZ: number, lenX: number, riseH: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-spanZ / 2, 0);
  shape.lineTo(spanZ / 2, 0);
  shape.lineTo(0, riseH);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: lenX, bevelEnabled: false });
  geo.translate(0, 0, -lenX / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
}

function createShedRoofGeo(spanZ: number, lenX: number, riseH: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-spanZ / 2, 0);
  shape.lineTo(spanZ / 2, 0);
  shape.lineTo(spanZ / 2, riseH * 0.25);
  shape.lineTo(-spanZ / 2, riseH);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: lenX, bevelEnabled: false });
  geo.translate(0, 0, -lenX / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
}

interface MarketUnitSpec {
  kind: 'bakery-shop' | 'produce-stall' | 'grocery-shop' | 'artisan-kiosk' | 'deli-stall';
  heightMult: number;
  depthMult: number;
  awningA: ExtraMarketRowMatKey;
  awningB: ExtraMarketRowMatKey;
  wallBucket: 'wall' | 'timberAccent' | 'stoneStep';
}

const UNIT_PATTERN: MarketUnitSpec[] = [
  {
    kind: 'bakery-shop',
    heightMult: 1.08,
    depthMult: 1.0,
    awningA: 'awningRed',
    awningB: 'awningCream',
    wallBucket: 'wall',
  },
  {
    kind: 'produce-stall',
    heightMult: 0.84,
    depthMult: 0.78,
    awningA: 'awningTeal',
    awningB: 'awningCream',
    wallBucket: 'timberAccent',
  },
  {
    kind: 'grocery-shop',
    heightMult: 1.0,
    depthMult: 0.96,
    awningA: 'awningAmber',
    awningB: 'awningCream',
    wallBucket: 'stoneStep',
  },
  {
    kind: 'artisan-kiosk',
    heightMult: 0.88,
    depthMult: 0.8,
    awningA: 'awningRed',
    awningB: 'awningAmber',
    wallBucket: 'timberAccent',
  },
  {
    kind: 'deli-stall',
    heightMult: 0.96,
    depthMult: 0.92,
    awningA: 'awningTeal',
    awningB: 'awningAmber',
    wallBucket: 'wall',
  },
];

/**
 * Builds a Bustling Street Row of Market Shops & Kiosks (Ряд магазинов и ларьков на рынке):
 * - Alternating masonry/timber retail shopfronts and open-hatch market stalls along the X promenade
 * - Distinct staggered unit heights, depths, and alternating striped fabric awnings
 * - Wide glazed shop vitrines, serving hatches, roll-up shutter boxes, vertical & fascia signs
 * - Three roof/promenade archetypes:
 *   1) 'shed': Stepped street-facing lean-to market kiosk roofs
 *   2) 'gable': Traditional pitched market roofs with front timber promenade canopy
 *   3) 'flat': Modern urban street-food / container-kiosk promenade with parapet signage frames
 * - Protruding display tables, produce crates, bollards & benches (hasPorch),
 *   rooftop café chimneys, exhaust cowls & AC units (hasChimney),
 *   illuminated shop signs & shutter housings (hasCornerAccents), and promenade gallery overhang (hasBalcony)
 */
export function buildMarketRow(config: HouseConfig, ctx: HouseBuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'MarketRowAssembly';

  const batcher = new MarketRowBatcher();

  const awningRed = new THREE.MeshStandardMaterial({
    name: 'MarketRow_AwningRed',
    color: new THREE.Color('#b9382c'),
    roughness: 0.86,
    metalness: 0.02,
  });
  const awningAmber = new THREE.MeshStandardMaterial({
    name: 'MarketRow_AwningAmber',
    color: new THREE.Color('#d97706'),
    roughness: 0.86,
    metalness: 0.02,
  });
  const awningTeal = new THREE.MeshStandardMaterial({
    name: 'MarketRow_AwningTeal',
    color: new THREE.Color('#1f6e6c'),
    roughness: 0.86,
    metalness: 0.02,
  });
  const awningCream = new THREE.MeshStandardMaterial({
    name: 'MarketRow_AwningCream',
    color: new THREE.Color('#f4ead7'),
    roughness: 0.88,
    metalness: 0.01,
  });
  const crateGreen = new THREE.MeshStandardMaterial({
    name: 'MarketRow_CrateGreen',
    color: new THREE.Color('#5a8f49'),
    roughness: 0.88,
    metalness: 0.02,
  });
  const crateOrange = new THREE.MeshStandardMaterial({
    name: 'MarketRow_CrateOrange',
    color: new THREE.Color('#dd6b20'),
    roughness: 0.88,
    metalness: 0.02,
  });
  const signDark = new THREE.MeshStandardMaterial({
    name: 'MarketRow_SignDark',
    color: new THREE.Color('#1e293b'),
    roughness: 0.42,
    metalness: 0.28,
  });
  const lanternGlow = new THREE.MeshStandardMaterial({
    name: 'MarketRow_LanternGlow',
    color: new THREE.Color('#fef3c7'),
    emissive: new THREE.Color('#f59e0b'),
    emissiveIntensity: 1.25,
    roughness: 0.25,
    metalness: 0.05,
  });

  const extraMaterials: Record<ExtraMarketRowMatKey, THREE.MeshStandardMaterial> = {
    awningRed,
    awningAmber,
    awningTeal,
    awningCream,
    crateGreen,
    crateOrange,
    signDark,
    lanternGlow,
  };
  for (const mat of Object.values(extraMaterials)) {
    ctx.trackDisposable(mat);
  }

  const { width, depth, floorHeight, foundationHeight, roofPitchDeg, roofOverhang } =
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

  const basePlinthTop = foundationHeight;
  const pitchRad = (roofPitchDeg * Math.PI) / 180;

  // 1. Continuous market cobblestone / concrete street curb & deck plinth
  const deckW = width + 1.4;
  const deckD = depth + 1.8;
  batcher.addBox('foundation', deckW, foundationHeight * 0.72, deckD, 0, foundationHeight * 0.36, 0.2);
  batcher.addBox('stoneStep', deckW + 0.16, foundationHeight * 0.28, deckD + 0.16, 0, foundationHeight * 0.86, 0.2);

  // Rear service alley wall curb
  batcher.addBox('stoneStep', width + 0.3, 0.16, 0.22, 0, basePlinthTop + 0.08, -depth / 2 - 0.05);

  // 2. Subdivide row into individual shops & open kiosks
  const unitCount = Math.max(4, Math.min(7, Math.round(width / 4.2) + (windowDensity - 2)));
  const alleyGap = 0.22; // Narrow service gap or timber separator between modules
  const usableW = width - alleyGap * (unitCount - 1);
  const baseUnitW = usableW / unitCount;

  // Subtle width weights so shops are slightly wider than compact stalls
  const rawWeights = Array.from({ length: unitCount }, (_, idx) => {
    const spec = UNIT_PATTERN[idx % UNIT_PATTERN.length];
    return spec.kind.endsWith('shop') ? 1.16 : 0.86;
  });
  const weightSum = rawWeights.reduce((acc, w) => acc + w, 0);

  let cursorX = -width / 2;
  const frontZMax = depth * 0.48;

  for (let i = 0; i < unitCount; i++) {
    const spec = UNIT_PATTERN[i % UNIT_PATTERN.length];
    const uW = (rawWeights[i] / weightSum) * usableW;
    const uX = cursorX + uW / 2;
    cursorX += uW + alleyGap;

    const uD = Math.max(3.4, depth * spec.depthMult);
    const uH = Math.max(2.6, floorHeight * spec.heightMult);
    // Align front facades near +frontZMax with subtle stepped variation (shops slightly prouder)
    const frontOffset = spec.kind.endsWith('shop') ? 0.16 : -0.14;
    const uFrontZ = frontZMax + frontOffset;
    const uCenterZ = uFrontZ - uD / 2;
    const uBackZ = uCenterZ - uD / 2;

    const isOpenStall = spec.kind === 'produce-stall' || spec.kind === 'artisan-kiosk';
    const wallY = basePlinthTop + uH / 2;

    // 2a. Unit base shell or open-counter kiosk frame
    if (isOpenStall) {
      // Lower wooden stall apron wall + back & side walls + corner timber posts
      const apronH = Math.min(1.12, uH * 0.38);
      batcher.addBox(spec.wallBucket, uW, apronH, uD, uX, basePlinthTop + apronH / 2, uCenterZ);
      // Back wall & side piers above apron
      const upperH = uH - apronH;
      const upperMidY = basePlinthTop + apronH + upperH / 2;
      batcher.addBox(spec.wallBucket, uW, upperH, 0.28, uX, upperMidY, uBackZ + 0.14);
      batcher.addBox(spec.wallBucket, 0.24, upperH, uD - 0.28, uX - uW / 2 + 0.12, upperMidY, uCenterZ + 0.14);
      batcher.addBox(spec.wallBucket, 0.24, upperH, uD - 0.28, uX + uW / 2 - 0.12, upperMidY, uCenterZ + 0.14);
      // Header frieze above serving opening
      const headerH = Math.max(0.45, uH * 0.22);
      batcher.addBox(
        spec.wallBucket,
        uW,
        headerH,
        0.26,
        uX,
        basePlinthTop + uH - headerH / 2,
        uFrontZ - 0.13,
      );
      // Dark interior stall depth backing
      batcher.addBox(
        'glassBacking',
        uW - 0.56,
        upperH - headerH,
        0.14,
        uX,
        basePlinthTop + apronH + (upperH - headerH) / 2,
        uFrontZ - 0.35,
      );
      // Serving counter sill ledge
      batcher.addBox(
        'timberAccent',
        uW - 0.12,
        0.09,
        0.58,
        uX,
        basePlinthTop + apronH + 0.045,
        uFrontZ + 0.16,
      );
      // Center vertical mullion / post on wide stalls
      if (uW > 3.2) {
        batcher.addBox(
          'trim',
          0.1,
          upperH - headerH,
          0.12,
          uX,
          basePlinthTop + apronH + (upperH - headerH) / 2,
          uFrontZ - 0.08,
        );
      }
    } else {
      // Enclosed shopfront building module
      batcher.addBox(spec.wallBucket, uW, uH, uD, uX, wallY, uCenterZ);
      // Base wainscot trim band along bottom of storefront
      batcher.addBox('stoneStep', uW + 0.05, 0.42, uD + 0.05, uX, basePlinthTop + 0.21, uCenterZ);

      // Doorway on one side + wide vitrine display window on the other
      const doorOnRight = i % 2 === 0;
      const doorW = Math.min(1.15, uW * 0.28);
      const doorH = Math.min(2.35, uH * 0.72);
      const doorX = uX + (doorOnRight ? uW * 0.28 : -uW * 0.28);

      // Door frame, leaf, transom glass & threshold step (strictly monotonic Z offsets!)
      batcher.addBox('trim', doorW + 0.14, doorH + 0.08, 0.07, doorX, basePlinthTop + doorH / 2, uFrontZ + 0.025);
      batcher.addBox('door', doorW, doorH, 0.05, doorX, basePlinthTop + doorH / 2, uFrontZ + 0.05);
      batcher.addBox(
        'glassBacking',
        doorW * 0.62,
        doorH * 0.48,
        0.03,
        doorX,
        basePlinthTop + doorH * 0.6,
        uFrontZ + 0.072,
      );
      batcher.addBox(
        'glass',
        doorW * 0.62,
        doorH * 0.48,
        0.025,
        doorX,
        basePlinthTop + doorH * 0.6,
        uFrontZ + 0.095,
      );
      batcher.addBox('metalAccent', 0.05, 0.34, 0.05, doorX + (doorOnRight ? -doorW * 0.34 : doorW * 0.34), basePlinthTop + 1.05, uFrontZ + 0.11);

      // Wide retail display vitrine window
      const vitrineW = Math.max(1.2, (uW - doorW - 0.72) * Math.min(1.06, windowScale));
      const vitrineH = Math.min(1.95, uH * 0.56 * windowScale);
      const vitrineX = uX + (doorOnRight ? -uW * 0.16 : uW * 0.16);
      const vitrineY = basePlinthTop + 0.55 + vitrineH / 2;

      batcher.addBox('trim', vitrineW + 0.14, vitrineH + 0.14, 0.06, vitrineX, vitrineY, uFrontZ + 0.025);
      batcher.addBox('glassBacking', vitrineW, vitrineH, 0.04, vitrineX, vitrineY, uFrontZ + 0.05);
      batcher.addBox('glass', vitrineW, vitrineH, 0.03, vitrineX, vitrineY, uFrontZ + 0.078);
      // Vertical glass mullion & lower windowsill
      batcher.addBox('trim', 0.06, vitrineH, 0.04, vitrineX, vitrineY, uFrontZ + 0.1);
      batcher.addBox('stoneStep', vitrineW + 0.24, 0.08, 0.18, vitrineX, basePlinthTop + 0.5, uFrontZ + 0.08);
    }

    // 2b. Roll-up shutter boxes, corner pilasters & shop signage (hasCornerAccents)
    const signY = basePlinthTop + uH - 0.36;
    if (hasCornerAccents) {
      // Corner pilasters on shops
      if (!isOpenStall) {
        batcher.addBox('trim', 0.16, uH, 0.16, uX - uW / 2 + 0.06, wallY, uFrontZ + 0.04);
        batcher.addBox('trim', 0.16, uH, 0.16, uX + uW / 2 - 0.06, wallY, uFrontZ + 0.04);
      }
      // Metal roll-up shutter housing box across storefront opening
      batcher.addBox(
        'metalAccent',
        uW * 0.84,
        0.24,
        0.24,
        uX,
        basePlinthTop + uH - 0.62,
        uFrontZ + 0.11,
      );
      // Dark fascia shop signboard + bright accent frame
      batcher.addBox('signDark', uW * 0.82, 0.42, 0.08, uX, signY, uFrontZ + 0.06);
      batcher.addBox(spec.awningA, uW * 0.74, 0.26, 0.04, uX, signY, uFrontZ + 0.105);

      // Projecting perpendicular blade sign on alternating shops
      if (i % 2 === 0) {
        const bladeX = uX + uW / 2 - 0.12;
        batcher.addBox('metalAccent', 0.06, 0.06, 0.56, bladeX, signY - 0.15, uFrontZ + 0.28);
        batcher.addBox('signDark', 0.08, 0.46, 0.44, bladeX, signY - 0.22, uFrontZ + 0.42);
        batcher.addBox('lanternGlow', 0.11, 0.3, 0.28, bladeX, signY - 0.22, uFrontZ + 0.42);
      }
    }

    // 2c. Striped fabric market awning over every shop/kiosk
    const awningH = 0.12;
    const awningD = Math.min(1.45, 0.88 + roofOverhang * 0.38);
    const awningY = basePlinthTop + uH - 0.78;
    const awningZ = uFrontZ + awningD * 0.48;
    const stripeCount = Math.max(5, Math.round(uW / 0.42));
    const stripeW = (uW * 0.92) / stripeCount;
    for (let s = 0; s < stripeCount; s++) {
      const sx = uX - (uW * 0.92) / 2 + stripeW * (s + 0.5);
      const bucket = s % 2 === 0 ? spec.awningA : spec.awningB;
      batcher.addBox(bucket, stripeW * 0.98, awningH, awningD, sx, awningY, awningZ, 0.26, 0, 0);
      // Hanging scalloped front valance flap
      batcher.addBox(
        bucket,
        stripeW * 0.96,
        0.16,
        0.04,
        sx,
        awningY - awningD * Math.sin(0.26) * 0.5 - 0.06,
        uFrontZ + awningD * 0.92,
      );
    }
    // Awning side bracket arms
    batcher.addBox('metalAccent', 0.05, 0.05, awningD * 0.85, uX - uW * 0.43, awningY - 0.14, uFrontZ + awningD * 0.4, 0.1, 0, 0);
    batcher.addBox('metalAccent', 0.05, 0.05, awningD * 0.85, uX + uW * 0.43, awningY - 0.14, uFrontZ + awningD * 0.4, 0.1, 0, 0);

    // Warm glowing lantern bulbs tucked under the awning
    const bulbCount = Math.max(2, Math.round(uW / 1.4));
    for (let b = 0; b < bulbCount; b++) {
      const bx = uX - uW * 0.3 + (bulbCount > 1 ? (b / (bulbCount - 1)) * uW * 0.6 : uW * 0.3);
      batcher.addCylinder('lanternGlow', 0.06, 0.07, 0.11, bx, awningY - 0.2, uFrontZ + 0.46);
    }

    // 2d. Unit Roofs according to selected roofType
    const roofBaseY = basePlinthTop + uH;
    const roofSpanZ = uD + roofOverhang * 0.9;
    const roofLenX = uW + 0.16;

    if (roofType === 'shed') {
      const shedRise = Math.max(0.45, Math.tan(pitchRad) * (uD * 0.48));
      const shedGeo = createShedRoofGeo(roofSpanZ, roofLenX, shedRise);
      batcher.addGeometry('roof', shedGeo, uX, roofBaseY, uCenterZ);
      // Fascia trim along front edge of shed roof
      batcher.addBox('trim', roofLenX + 0.06, 0.14, 0.1, uX, roofBaseY + shedRise * 0.25, uCenterZ + roofSpanZ / 2);
    } else if (roofType === 'gable') {
      const gableRise = Math.max(0.55, Math.tan(pitchRad) * (uD * 0.46));
      const gableGeo = createGableRoofGeo(roofSpanZ, roofLenX, gableRise);
      batcher.addGeometry('roof', gableGeo, uX, roofBaseY, uCenterZ);
      // Timber bargeboard eaves beam
      batcher.addBox('trim', roofLenX + 0.06, 0.12, 0.12, uX, roofBaseY + 0.04, uCenterZ + roofSpanZ / 2 - 0.04);
    } else {
      // 'flat' modern street-food / container-kiosk promenade parapet + rooftop sign frame
      const parapetH = spec.kind.endsWith('shop') ? 0.56 : 0.34;
      batcher.addBox('roof', roofLenX, 0.14, uD + 0.24, uX, roofBaseY + 0.07, uCenterZ);
      batcher.addBox('trim', roofLenX + 0.08, parapetH, 0.14, uX, roofBaseY + parapetH / 2, uFrontZ + 0.05);
      batcher.addBox('trim', roofLenX + 0.08, parapetH * 0.72, 0.14, uX, roofBaseY + parapetH * 0.36, uBackZ - 0.05);
      if (hasCornerAccents && i % 2 === 1) {
        batcher.addBox('signDark', uW * 0.65, 0.45, 0.08, uX, roofBaseY + parapetH + 0.22, uFrontZ + 0.04);
        batcher.addBox(spec.awningA, uW * 0.55, 0.3, 0.05, uX, roofBaseY + parapetH + 0.22, uFrontZ + 0.085);
      }
    }

    // 2e. Rooftop café chimney flue, stainless exhaust hoods & AC boxes (hasChimney)
    if (hasChimney) {
      if (spec.kind === 'bakery-shop' || spec.kind === 'deli-stall') {
        const pipeH = 1.15;
        batcher.addCylinder(
          'metalAccent',
          0.16,
          0.18,
          pipeH,
          uX + uW * 0.22,
          roofBaseY + pipeH * 0.5 + 0.25,
          uCenterZ - uD * 0.18,
        );
        batcher.addCylinder(
          'trim',
          0.26,
          0.14,
          0.16,
          uX + uW * 0.22,
          roofBaseY + pipeH + 0.28,
          uCenterZ - uD * 0.18,
        );
      } else if (i % 2 === 1) {
        // Compact rooftop AC condenser unit
        batcher.addBox('stoneStep', 0.76, 0.48, 0.44, uX - uW * 0.18, roofBaseY + 0.42, uBackZ + 0.55);
        batcher.addBox('signDark', 0.36, 0.32, 0.06, uX - uW * 0.18, roofBaseY + 0.42, uBackZ + 0.78);
      }
    }

    // 2f. Exterior front produce counters, wooden crates, menu A-frame boards & bollards (hasPorch)
    if (hasPorch) {
      const tableZ = uFrontZ + 0.68;
      if (isOpenStall || i % 2 === 0) {
        const tableW = Math.min(uW * 0.78, 2.3);
        batcher.addBox('timberAccent', tableW, 0.07, 0.66, uX - 0.15, basePlinthTop + 0.74, tableZ);
        batcher.addBox('trim', 0.07, 0.74, 0.07, uX - 0.15 - tableW * 0.42, basePlinthTop + 0.37, tableZ - 0.25);
        batcher.addBox('trim', 0.07, 0.74, 0.07, uX - 0.15 + tableW * 0.42, basePlinthTop + 0.37, tableZ - 0.25);
        batcher.addBox('trim', 0.07, 0.74, 0.07, uX - 0.15 - tableW * 0.42, basePlinthTop + 0.37, tableZ + 0.25);
        batcher.addBox('trim', 0.07, 0.74, 0.07, uX - 0.15 + tableW * 0.42, basePlinthTop + 0.37, tableZ + 0.25);

        // Produce crates sitting on top of the display table
        const crateCount = windowDensity >= 3 ? 3 : 2;
        for (let c = 0; c < crateCount; c++) {
          const cx = uX - 0.15 + (c - (crateCount - 1) / 2) * 0.62;
          batcher.addBox('timberAccent', 0.52, 0.22, 0.46, cx, basePlinthTop + 0.88, tableZ, 0.16, 0, 0);
          batcher.addBox(
            (i + c) % 2 === 0 ? 'crateGreen' : 'crateOrange',
            0.44,
            0.14,
            0.38,
            cx,
            basePlinthTop + 0.96,
            tableZ,
            0.16,
            0,
            0,
          );
        }
      }

      // Sidewalk A-frame chalkboard menu stand near shop entrances
      if (!isOpenStall) {
        const boardX = uX + uW * 0.36;
        const boardZ = uFrontZ + 0.98;
        batcher.addBox('timberAccent', 0.52, 0.84, 0.06, boardX, basePlinthTop + 0.42, boardZ - 0.12, 0.18, 0.15, 0);
        batcher.addBox('timberAccent', 0.52, 0.84, 0.06, boardX, basePlinthTop + 0.42, boardZ + 0.12, -0.18, 0.15, 0);
        batcher.addBox('signDark', 0.42, 0.62, 0.03, boardX, basePlinthTop + 0.46, boardZ + 0.15, -0.18, 0.15, 0);
      }
    }

    // 2g. Promenade walkway timber pergola / continuous upper cornice gallery (hasBalcony)
    if (hasBalcony) {
      const pergolaZ = uFrontZ + awningD + 0.24;
      const pergolaY = basePlinthTop + uH - 0.22;
      batcher.addBox('timberAccent', uW + alleyGap, 0.14, 0.16, uX, pergolaY, pergolaZ);
      // Timber rafter tails projecting over the market walkway
      const rafterCount = Math.max(3, Math.round(uW / 0.8));
      for (let r = 0; r < rafterCount; r++) {
        const rx = uX - uW * 0.42 + (rafterCount > 1 ? (r / (rafterCount - 1)) * uW * 0.84 : uW * 0.42);
        batcher.addBox('timberAccent', 0.08, 0.12, awningD + 0.36, rx, pergolaY - 0.06, uFrontZ + (awningD + 0.36) * 0.5);
      }
      // Slender steel/timber colonnade posts framing unit boundaries along promenade
      batcher.addBox('trim', 0.13, uH - 0.2, 0.13, uX - uW / 2, basePlinthTop + (uH - 0.2) / 2, pergolaZ);
      if (i === unitCount - 1) {
        batcher.addBox('trim', 0.13, uH - 0.2, 0.13, uX + uW / 2, basePlinthTop + (uH - 0.2) / 2, pergolaZ);
      }
    }
  }

  // Front promenade street bollards & bench islands when hasPorch is active
  if (hasPorch) {
    const bollardCount = Math.max(4, Math.round(width / 4.8));
    for (let b = 0; b < bollardCount; b++) {
      const bx = -width * 0.45 + (bollardCount > 1 ? (b / (bollardCount - 1)) * width * 0.9 : 0);
      const bz = deckD * 0.46 + 0.18;
      batcher.addCylinder('signDark', 0.08, 0.07, 0.72, bx, 0.36, bz);
      batcher.addCylinder('awningAmber', 0.085, 0.085, 0.09, bx, 0.64, bz);
    }
  }

  // Unused helper reference guard
  void baseUnitW;

  batcher.flushToGroup(group, ctx, extraMaterials);
  return group;
}
