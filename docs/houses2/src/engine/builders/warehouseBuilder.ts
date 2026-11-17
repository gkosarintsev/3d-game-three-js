import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HouseConfig } from '../../types/house';
import type { HouseBuildContext } from './types';

type WarehouseBucketKey =
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
  | 'safetyYellow'
  | 'rubberBlack'
  | 'accentBlue';

type ExtraWarehouseMatKey = 'safetyYellow' | 'rubberBlack' | 'accentBlue';

class WarehouseBatcher {
  private readonly buckets: Record<WarehouseBucketKey, THREE.BufferGeometry[]> = {
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
    safetyYellow: [],
    rubberBlack: [],
    accentBlue: [],
  };

  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly unitCyl = new THREE.CylinderGeometry(1, 1, 1, 12);
  private readonly mat4 = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();

  addBox(
    bucket: WarehouseBucketKey,
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
    bucket: WarehouseBucketKey,
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
    bucket: WarehouseBucketKey,
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
    extraMaterials: Record<ExtraWarehouseMatKey, THREE.MeshStandardMaterial>,
  ): void {
    this.unitBox.dispose();
    this.unitCyl.dispose();

    for (const [key, geos] of Object.entries(this.buckets) as Array<
      [WarehouseBucketKey, THREE.BufferGeometry[]]
    >) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      ctx.trackGeometry(merged);

      const mat =
        key in extraMaterials
          ? extraMaterials[key as ExtraWarehouseMatKey]
          : ctx.materials[key as keyof typeof ctx.materials];
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `Warehouse_${key}`;
      const isGlass = key === 'glass';
      mesh.castShadow = !isGlass;
      mesh.receiveShadow = !isGlass;
      group.add(mesh);
    }
  }
}

function createLongGableGeo(spanZ: number, lenX: number, riseH: number): THREE.BufferGeometry {
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

function createShedWarehouseGeo(spanZ: number, lenX: number, riseH: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-spanZ / 2, 0);
  shape.lineTo(spanZ / 2, 0);
  shape.lineTo(spanZ / 2, riseH);
  shape.lineTo(-spanZ / 2, riseH * 0.12);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: lenX, bevelEnabled: false });
  geo.translate(0, 0, -lenX / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
}

/**
 * Builds a Modern Logistics & Distribution Warehouse (Логистический склад):
 * - Raised truck-height concrete loading dock plinth (foundationHeight ~1.15m)
 * - Long sandwich-panel / corrugated steel warehouse hall with structural cladding ribs & high clerestory ribbon windows
 * - Row of numbered sectional roll-up dock gates with black rubber dock seals & yellow safety bumper bollards
 * - Attached 2-level corner dispatch & office annex with panoramic strip glazing & canopy entrance
 * - Three industrial roof styles:
 *   1) 'flat': Membrane parapet roof with daylight/smoke skylight domes
 *   2) 'gable': Low-slope steel-truss gable hall with continuous ridge ventilation monitor
 *   3) 'shed': Mono-pitch sloped warehouse roof rising toward the front loading apron
 * - Concrete truck loading dock ramp & safety railings (hasPorch),
 *   rooftop HVAC chillers & turbine exhaust vents (hasChimney),
 *   dock bay number headers, corner structural columns & logistics stripe (hasCornerAccents),
 *   and deep cantilevered steel loading bay canopy with dock floodlights (hasBalcony)
 */
export function buildWarehouse(config: HouseConfig, ctx: HouseBuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'WarehouseAssembly';

  const batcher = new WarehouseBatcher();

  const safetyYellow = new THREE.MeshStandardMaterial({
    name: 'Warehouse_SafetyYellow',
    color: new THREE.Color('#eab308'),
    roughness: 0.42,
    metalness: 0.18,
  });
  const rubberBlack = new THREE.MeshStandardMaterial({
    name: 'Warehouse_RubberDockSeal',
    color: new THREE.Color('#1f2937'),
    roughness: 0.88,
    metalness: 0.04,
  });
  const accentBlue = new THREE.MeshStandardMaterial({
    name: 'Warehouse_LogisticsBlue',
    color: new THREE.Color('#2563eb'),
    roughness: 0.45,
    metalness: 0.25,
  });

  const extraMaterials: Record<ExtraWarehouseMatKey, THREE.MeshStandardMaterial> = {
    safetyYellow,
    rubberBlack,
    accentBlue,
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
  const pitchRad = (roofPitchDeg * Math.PI) / 180;

  // 1. Raised truck-height concrete foundation & dock plinth
  batcher.addBox('foundation', width + 0.6, foundationHeight, depth + 0.6, 0, foundationHeight / 2, 0);
  batcher.addBox('stoneStep', width + 0.8, 0.14, depth + 0.8, 0, foundationHeight - 0.07, 0);

  // 2. Main Warehouse Hall Shell
  batcher.addBox('wall', width, wallH, depth, 0, wallBaseY + wallH / 2, 0);

  // Corner Dispatch & Admin Office Annex on the left front corner (-X, +Z)
  const officeW = Math.max(6.8, Math.min(width * 0.22, 11.0));
  const officeD = Math.min(6.4, depth * 0.32);
  const officeH = Math.min(wallH * 0.84, 6.2);
  const officeX = -width / 2 + officeW / 2 - 0.2;
  const officeZ = depth / 2 + officeD * 0.36;

  batcher.addBox('foundation', officeW + 0.4, foundationHeight, officeD + 0.4, officeX, foundationHeight / 2, officeZ);
  batcher.addBox('stoneStep', officeW, officeH, officeD, officeX, wallBaseY + officeH / 2, officeZ);
  // Office accent roof parapet cap
  batcher.addBox('accentBlue', officeW + 0.24, 0.28, officeD + 0.24, officeX, wallBaseY + officeH + 0.14, officeZ);

  // Office strip glazing & staff entry door
  const offFrontZ = officeZ + officeD / 2;
  const offGlassW = officeW * 0.72;
  batcher.addBox('glassBacking', offGlassW, 1.35, 0.06, officeX, wallBaseY + officeH * 0.72, offFrontZ + 0.03);
  batcher.addBox('glass', offGlassW, 1.35, 0.04, officeX, wallBaseY + officeH * 0.72, offFrontZ + 0.065);
  batcher.addBox('glassBacking', offGlassW * 0.56, 1.45, 0.06, officeX + officeW * 0.14, wallBaseY + 1.3, offFrontZ + 0.03);
  batcher.addBox('glass', offGlassW * 0.56, 1.45, 0.04, officeX + officeW * 0.14, wallBaseY + 1.3, offFrontZ + 0.065);
  batcher.addBox('door', 1.2, 2.25, 0.07, officeX - officeW * 0.26, wallBaseY + 1.125, offFrontZ + 0.04);
  batcher.addBox('metalAccent', 2.0, 0.12, 1.1, officeX - officeW * 0.26, wallBaseY + 2.45, offFrontZ + 0.55);

  // 3. Loading Dock Bays along the front (+Z) facade (to the right of the office annex)
  const dockStartX = -width / 2 + officeW + 1.6;
  const dockEndX = width / 2 - 1.6;
  const dockSpanW = Math.max(6.0, dockEndX - dockStartX);
  const bayCount = Math.max(
    3,
    Math.min(10, Math.round(dockSpanW / (windowDensity === 1 ? 5.6 : windowDensity === 2 ? 4.3 : 3.4))),
  );
  const baySpacing = dockSpanW / bayCount;
  const doorW = Math.min(3.0, baySpacing * 0.68);
  const doorH = Math.min(wallH * 0.68, Math.max(3.2, 3.9 * windowScale));
  const frontZ = depth / 2;

  for (let b = 0; b < bayCount; b++) {
    const bx = dockStartX + baySpacing * (b + 0.5);
    // Rubber dock shelter seal surround + ribbed light-steel sectional overhead door
    batcher.addBox('rubberBlack', doorW + 0.44, doorH + 0.3, 0.26, bx, wallBaseY + doorH / 2 + 0.12, frontZ + 0.08);
    batcher.addBox('stoneStep', doorW, doorH, 0.08, bx, wallBaseY + doorH / 2, frontZ + 0.12);

    // Horizontal sectional ribs on each roll-up door
    const slats = 5;
    for (let s = 1; s < slats; s++) {
      const sy = wallBaseY + (s / slats) * doorH;
      batcher.addBox('trim', doorW - 0.12, 0.06, 0.05, bx, sy, frontZ + 0.17);
    }

    // Two upper vision glass lites per dock door
    batcher.addBox('glassBacking', doorW * 0.26, 0.34, 0.03, bx - doorW * 0.2, wallBaseY + doorH * 0.68, frontZ + 0.17);
    batcher.addBox('glass', doorW * 0.26, 0.34, 0.03, bx - doorW * 0.2, wallBaseY + doorH * 0.68, frontZ + 0.195);
    batcher.addBox('glassBacking', doorW * 0.26, 0.34, 0.03, bx + doorW * 0.2, wallBaseY + doorH * 0.68, frontZ + 0.17);
    batcher.addBox('glass', doorW * 0.26, 0.34, 0.03, bx + doorW * 0.2, wallBaseY + doorH * 0.68, frontZ + 0.195);

    // Dock bumper guards & safety yellow guide bollards flanking each bay
    if (hasCornerAccents) {
      batcher.addBox('safetyYellow', 0.55, 0.28, 0.12, bx, wallBaseY + doorH + 0.48, frontZ + 0.14);
      batcher.addBox('rubberBlack', 0.28, 0.52, 0.22, bx - doorW / 2 - 0.16, wallBaseY - 0.28, frontZ + 0.35);
      batcher.addBox('rubberBlack', 0.28, 0.52, 0.22, bx + doorW / 2 + 0.16, wallBaseY - 0.28, frontZ + 0.35);
      batcher.addCylinder('safetyYellow', 0.09, 0.09, 1.05, bx - doorW / 2 - 0.26, 0.525, frontZ + 1.55);
      batcher.addCylinder('safetyYellow', 0.09, 0.09, 1.05, bx + doorW / 2 + 0.26, 0.525, frontZ + 1.55);
    }
  }

  // 4. High Clerestory Daylight Ribbon Windows & Structural Cladding Pilasters
  const clereH = Math.min(1.35 * windowScale, wallH * 0.22);
  const clereY = roofY - clereH * 0.9 - 0.45;
  const clereW = dockSpanW * 0.86;
  const clereX = (dockStartX + dockEndX) / 2;

  // Front clerestory strip above loading bays
  batcher.addBox('trim', clereW + 0.2, clereH + 0.14, 0.06, clereX, clereY, frontZ + 0.03);
  batcher.addBox('glassBacking', clereW, clereH, 0.04, clereX, clereY, frontZ + 0.06);
  batcher.addBox('glass', clereW, clereH, 0.03, clereX, clereY, frontZ + 0.088);

  // Rear clerestory strip + side wall emergency doors
  batcher.addBox('trim', width * 0.78 + 0.2, clereH + 0.14, 0.06, 0, clereY, -depth / 2 - 0.03);
  batcher.addBox('glassBacking', width * 0.78, clereH, 0.04, 0, clereY, -depth / 2 - 0.06);
  batcher.addBox('glass', width * 0.78, clereH, 0.03, 0, clereY, -depth / 2 - 0.088);

  for (const sideSign of [-1, 1] as const) {
    const sx = sideSign * (width / 2);
    batcher.addBox('glassBacking', 0.04, clereH, depth * 0.72, sx + sideSign * 0.04, clereY, 0);
    batcher.addBox('glass', 0.03, clereH, depth * 0.72, sx + sideSign * 0.07, clereY, 0);
    batcher.addBox('door', 0.08, 2.3, 1.3, sx + sideSign * 0.04, wallBaseY + 1.15, -depth * 0.25);
  }

  // Structural steel cladding pilasters & logistics accent stripe (hasCornerAccents)
  if (hasCornerAccents) {
    const ribCols = Math.max(5, Math.round(width / 5.5));
    for (let r = 0; r <= ribCols; r++) {
      const rx = -width / 2 + (r / ribCols) * width;
      batcher.addBox('trim', 0.24, wallH, 0.2, rx, wallBaseY + wallH / 2, -depth / 2 - 0.08);
      if (rx > dockStartX - 0.5) {
        batcher.addBox('trim', 0.22, wallH, 0.18, rx, wallBaseY + wallH / 2, frontZ + 0.06);
      }
    }
    // Logistics corporate fascia band along the top perimeter
    batcher.addBox('accentBlue', width + 0.22, 0.42, depth + 0.22, 0, roofY - 0.26, 0);
  }

  // 5. Raised Loading Dock Apron Platform, Ramp & Safety Railings (hasPorch)
  if (hasPorch) {
    const dockPlatformD = 2.2;
    const dockPlatformW = dockSpanW + 1.6;
    const dockPlatformX = (dockStartX + dockEndX) / 2;
    const dockPlatformZ = frontZ + dockPlatformD / 2;

    batcher.addBox('foundation', dockPlatformW, foundationHeight * 0.85, dockPlatformD, dockPlatformX, foundationHeight * 0.425, dockPlatformZ);
    batcher.addBox('stoneStep', dockPlatformW + 0.15, 0.16, dockPlatformD + 0.15, dockPlatformX, foundationHeight - 0.08, dockPlatformZ);

    // Side concrete truck/forklift access ramp leading up to dock platform
    const rampW = 3.6;
    const rampX = dockPlatformX + dockPlatformW / 2 + rampW / 2 - 0.2;
    const rampAngle = Math.atan2(foundationHeight, rampW);
    batcher.addBox(
      'stoneStep',
      rampW,
      0.18,
      dockPlatformD,
      rampX,
      foundationHeight * 0.46,
      dockPlatformZ,
      0,
      0,
      -rampAngle,
    );
    // Yellow safety edge stripe along loading dock lip
    batcher.addBox('safetyYellow', dockPlatformW, 0.09, 0.14, dockPlatformX, foundationHeight + 0.01, frontZ + dockPlatformD - 0.06);
  }

  // 6. Cantilevered Steel Loading Bay Weather Canopy (hasBalcony)
  if (hasBalcony) {
    const canopyD = Math.max(2.2, 1.8 + roofOverhang * 1.4);
    const canopyW = dockSpanW + 1.2;
    const canopyX = (dockStartX + dockEndX) / 2;
    const canopyY = wallBaseY + doorH + 0.85;
    const canopyZ = frontZ + canopyD / 2;

    batcher.addBox('roof', canopyW, 0.18, canopyD, canopyX, canopyY, canopyZ, 0.08, 0, 0);
    batcher.addBox('accentBlue', canopyW + 0.1, 0.16, 0.1, canopyX, canopyY - canopyD * 0.04, frontZ + canopyD - 0.05);
    // Tension hanger rods anchoring canopy back to warehouse wall
    const tieCount = Math.max(3, Math.round(canopyW / 5.5));
    for (let t = 0; t < tieCount; t++) {
      const tx = canopyX - canopyW * 0.44 + (t / (tieCount - 1)) * canopyW * 0.88;
      batcher.addBox('metalAccent', 0.08, 0.08, canopyD * 1.05, tx, canopyY + 0.48, canopyZ - 0.1, 0.42, 0, 0);
    }
  }

  // 7. Three Industrial Warehouse Roof Variants
  if (roofType === 'flat') {
    batcher.addBox('roof', width + 0.25, 0.2, depth + 0.25, 0, roofY + 0.1, 0);
    // Raised perimeter parapet coping
    batcher.addBox('trim', width + 0.4, 0.65, 0.28, 0, roofY + 0.325, frontZ);
    batcher.addBox('trim', width + 0.4, 0.65, 0.28, 0, roofY + 0.325, -depth / 2);
    batcher.addBox('trim', 0.28, 0.65, depth + 0.4, -width / 2, roofY + 0.325, 0);
    batcher.addBox('trim', 0.28, 0.65, depth + 0.4, width / 2, roofY + 0.325, 0);

    // Rows of warehouse daylight/smoke-vent skylight domes
    const skCols = Math.max(4, Math.round(width / 6.5));
    const skRows = depth > 22 ? 2 : 1;
    for (let r = 0; r < skRows; r++) {
      const rz = skRows === 1 ? 0 : (r === 0 ? -depth * 0.22 : depth * 0.22);
      for (let c = 0; c < skCols; c++) {
        const rx = -width * 0.36 + (c / (skCols - 1)) * width * 0.72;
        batcher.addBox('metalAccent', 2.4, 0.32, 1.8, rx, roofY + 0.32, rz);
        batcher.addBox('glass', 2.1, 0.26, 1.5, rx, roofY + 0.56, rz);
      }
    }
  } else if (roofType === 'gable') {
    const gableRise = Math.max(1.4, Math.tan(pitchRad) * (depth * 0.48));
    const gableGeo = createLongGableGeo(depth + roofOverhang * 1.4, width + roofOverhang * 0.8, gableRise);
    batcher.addGeometry('roof', gableGeo, 0, roofY, 0);
    // Ridge ventilation monitor running along apex
    batcher.addBox('metalAccent', width * 0.74, 0.55, 1.35, 0, roofY + gableRise + 0.24, 0);
    batcher.addBox('trim', width * 0.78, 0.16, 1.65, 0, roofY + gableRise + 0.56, 0);
  } else {
    // 'shed' Sloped industrial mono-pitch roof
    const shedRise = Math.max(1.2, Math.tan(pitchRad) * (depth * 0.62));
    const shedGeo = createShedWarehouseGeo(depth + roofOverhang * 1.2, width + roofOverhang * 0.8, shedRise);
    batcher.addGeometry('roof', shedGeo, 0, roofY, 0);
    batcher.addBox('trim', width + roofOverhang * 0.9, 0.28, 0.22, 0, roofY + shedRise, frontZ + roofOverhang * 0.5);
  }

  // 8. Rooftop Air-Handling Units & Turbine Exhaust Vents (hasChimney)
  if (hasChimney) {
    const rBase = roofType === 'flat' ? roofY + 0.2 : roofY + 0.85;
    const hvacPositions = [-width * 0.26, width * 0.24];
    for (const hx of hvacPositions) {
      batcher.addBox('stoneStep', 3.0, 0.75, 2.0, hx, rBase + 0.375, -depth * 0.18);
      batcher.addBox('metalAccent', 2.6, 0.25, 1.6, hx, rBase + 0.82, -depth * 0.18);
      batcher.addCylinder('metalAccent', 0.32, 0.36, 0.45, hx + 1.8, rBase + 0.225, depth * 0.12);
    }
  }

  batcher.flushToGroup(group, ctx, extraMaterials);
  return group;
}
