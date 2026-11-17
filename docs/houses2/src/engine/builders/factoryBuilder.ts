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
  | 'hazardYellow';

class FactoryBatcher {
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
  };

  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly unitCyl = new THREE.CylinderGeometry(1, 1, 1, 16);
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
      : new THREE.CylinderGeometry(radiusTop, radiusBottom, 1, 16).toNonIndexed();
    this.pos.set(x, y, z);
    this.euler.set(rotX, rotY, rotZ);
    this.quat.setFromEuler(this.euler);
    this.scale.set(isUniform ? radiusBottom : 1, height, isUniform ? radiusBottom : 1);
    this.mat4.compose(this.pos, this.quat, this.scale);
    geo.applyMatrix4(this.mat4);
    this.buckets[bucket].push(geo);
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
    extraMaterials: Record<'warningRed' | 'warningWhite' | 'hazardYellow', THREE.MeshStandardMaterial>,
  ): void {
    this.unitBox.dispose();
    this.unitCyl.dispose();

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
        key === 'warningRed' || key === 'warningWhite' || key === 'hazardYellow'
          ? extraMaterials[key]
          : ctx.materials[key];
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `Factory_${key}`;
      const isGlass = key === 'glass' || key === 'glassBacking';
      mesh.castShadow = !isGlass;
      mesh.receiveShadow = key !== 'glass';
      group.add(mesh);
    }
  }
}

/**
 * Extrudes a single sawtooth bay prism along X (width), with vertical glass front at +Z bay edge
 * and sloped roof dropping back toward -Z.
 */
function createSawtoothBayGeo(width: number, bayDepth: number, bayRise: number): THREE.BufferGeometry {
  const hd = bayDepth / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-hd, 0);
  shape.lineTo(hd, 0);
  shape.lineTo(hd, bayRise);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: false,
  });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function createGableEndGeo(width: number, depth: number, rise: number): THREE.BufferGeometry {
  const hd = depth / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-hd, 0);
  shape.lineTo(hd, 0);
  shape.lineTo(0, rise);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: false,
  });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds an industrial factory / manufacturing complex:
 * - Reinforced concrete plinth, loading dock apron with forklift ramp & bollards
 * - Main multi-story production hall with recessed steel-mullion grid windows & structural buttresses
 * - Adjacent boiler/turbine annex on -X flank
 * - Roll-up corrugated cargo gates with steel canopy & hazard bumpers ('hasPorch')
 * - Twin galvanized raw-material silos on hopper legs + overhead pipe bridge ('hasCornerAccents')
 * - External steel catwalk gallery & fire-escape staircase ('hasBalcony' on 2+ floors)
 * - Tall tapered boiler smokestack with red/white warning bands & secondary steel flue ('hasChimney')
 * - Three industrial roof styles: Sawtooth Northlight ('stepped'), Clerestory Gable ('gable'), Flat Skylight Deck ('flat')
 */
export function buildFactoryBuilding(
  config: HouseConfig,
  ctx: HouseBuildContext,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'FactoryBuildingModel';

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
    name: 'FactoryWarningRed',
    color: new THREE.Color('#c23b2b'),
    roughness: 0.62,
    metalness: 0.08,
  });
  const warningWhiteMat = new THREE.MeshStandardMaterial({
    name: 'FactoryWarningWhite',
    color: new THREE.Color('#eceae4'),
    roughness: 0.65,
    metalness: 0.05,
  });
  const hazardYellowMat = new THREE.MeshStandardMaterial({
    name: 'FactoryHazardYellow',
    color: new THREE.Color('#eab308'),
    roughness: 0.44,
    metalness: 0.25,
  });
  ctx.trackDisposable(warningRedMat);
  ctx.trackDisposable(warningWhiteMat);
  ctx.trackDisposable(hazardYellowMat);

  const batch = new FactoryBatcher();
  const baseY = foundationHeight;
  const hallH = floors * floorHeight;
  const topY = baseY + hallH;

  // 1. Reinforced Concrete Foundation Plinth
  batch.addBox('foundation', width + 0.56, foundationHeight, depth + 0.56, 0, foundationHeight / 2, 0);
  batch.addBox('stoneStep', width + 0.68, 0.1, depth + 0.68, 0, foundationHeight - 0.04, 0);

  // 2. Main Production Hall & Inter-Floor Spandrel Bands
  batch.addBox('wall', width, hallH, depth, 0, baseY + hallH / 2, 0);
  for (let f = 1; f < floors; f++) {
    const beltY = baseY + f * floorHeight;
    batch.addBox('stoneStep', width + 0.18, 0.22, depth + 0.18, 0, beltY, 0);
  }
  // Roof parapet coping belt
  batch.addBox('stoneStep', width + 0.26, 0.24, depth + 0.26, 0, topY + 0.1, 0);

  // 3. Adjacent Boiler / Turbine Annex (-X flank)
  const annexW = Math.max(4.4, Math.min(8.5, width * 0.23));
  const annexD = Math.max(7.5, depth * 0.58);
  const annexH = Math.min(hallH - 0.2, Math.max(4.4, floorHeight * (floors >= 2 ? 1.35 : 0.85)));
  const annexX = -width / 2 - annexW / 2 + 0.06;
  const annexZ = -depth * 0.12;

  batch.addBox('foundation', annexW + 0.36, foundationHeight, annexD + 0.36, annexX, foundationHeight / 2, annexZ);
  batch.addBox('wall', annexW, annexH, annexD, annexX, baseY + annexH / 2, annexZ);
  batch.addBox('stoneStep', annexW + 0.24, 0.2, annexD + 0.24, annexX, baseY + annexH + 0.08, annexZ);
  batch.addBox('roof', annexW - 0.1, 0.14, annexD - 0.1, annexX, baseY + annexH + 0.2, annexZ);
  // Louvered exhaust intake box on boiler annex roof
  batch.addBox('metalAccent', annexW * 0.45, 0.72, annexD * 0.34, annexX, baseY + annexH + 0.6, annexZ + annexD * 0.14);

  // Helper: Multi-pane industrial factory window with steel mullions & concrete sill
  const addFactoryWindow = (
    cx: number,
    cy: number,
    cz: number,
    w: number,
    h: number,
    rotY: number,
  ) => {
    const nx = Math.sin(rotY);
    const nz = Math.cos(rotY);
    batch.addBox('glassBacking', w, h, 0.08, cx + nx * 0.03, cy, cz + nz * 0.03, 0, rotY);
    batch.addBox('glass', w - 0.08, h - 0.08, 0.06, cx + nx * 0.06, cy, cz + nz * 0.06, 0, rotY);

    // Outer steel frame + concrete sill
    batch.addBox('trim', w + 0.14, 0.09, 0.12, cx + nx * 0.08, cy + h / 2, cz + nz * 0.08, 0, rotY);
    batch.addBox('stoneStep', w + 0.2, 0.12, 0.18, cx + nx * 0.09, cy - h / 2 - 0.02, cz + nz * 0.09, 0, rotY);

    // Vertical mullions (3-4 panes wide)
    const vBars = Math.max(2, Math.round(w / 0.85));
    for (let i = 0; i <= vBars; i++) {
      const along = -w / 2 + (i / vBars) * w;
      batch.addBox(
        'trim',
        0.05,
        h,
        0.09,
        cx + Math.cos(rotY) * along + nx * 0.08,
        cy,
        cz - Math.sin(rotY) * along + nz * 0.08,
        0,
        rotY,
      );
    }
    // Horizontal transoms (2 rows)
    for (const frac of [-0.18, 0.18]) {
      batch.addBox('trim', w, 0.045, 0.09, cx + nx * 0.08, cy + h * frac, cz + nz * 0.08, 0, rotY);
    }
  };

  // 4. Facade Window Grid & Structural Buttresses
  const frontBays = Math.max(4, Math.round((width / 4.8) * (0.65 + windowDensity * 0.2)));
  const baySpacingX = width / frontBays;
  const winMaxH = Math.min(floorHeight * 0.62, 2.55 * windowScale);
  const winBayW = Math.min(baySpacingX * 0.64, 3.1 * windowScale);

  const dockSpanStart = width * 0.02 - Math.min(width * 0.54, 13.5) / 2;
  const dockSpanEnd = width * 0.02 + Math.min(width * 0.54, 13.5) / 2 + 2.2;
  const staffDoorX = -width * 0.36;

  for (let f = 0; f < floors; f++) {
    const wy = baseY + f * floorHeight + floorHeight * 0.54;

    for (let b = 0; b < frontBays; b++) {
      const bx = -width / 2 + baySpacingX * (b + 0.5);

      // Front (+Z) windows (skip bays taken by loading gates on floor 0 or upper stair door)
      const hitsCargoDock = f === 0 && hasPorch && bx > dockSpanStart - 0.8 && bx < dockSpanEnd - 1.2;
      const hitsStaffDoor = f === 0 && Math.abs(bx - staffDoorX) < 1.35;
      const hitsUpperDoor = f === 1 && hasBalcony && Math.abs(bx - staffDoorX) < 1.25;
      if (!hitsCargoDock && !hitsStaffDoor && !hitsUpperDoor) {
        addFactoryWindow(bx, wy, depth / 2, winBayW, winMaxH, 0);
      }

      // Back (-Z) windows
      addFactoryWindow(bx, wy, -depth / 2, winBayW, winMaxH, Math.PI);
    }

    // Structural brick/steel pilasters between front & back bays
    if (hasCornerAccents) {
      for (let b = 0; b <= frontBays; b++) {
        const px = -width / 2 + b * baySpacingX;
        const clampedX = Math.max(-width / 2 + 0.24, Math.min(width / 2 - 0.24, px));
        batch.addBox('trim', 0.28, hallH + 0.15, 0.26, clampedX, baseY + hallH / 2, depth / 2 + 0.06);
        batch.addBox('trim', 0.28, hallH + 0.15, 0.26, clampedX, baseY + hallH / 2, -depth / 2 - 0.06);
      }
    }

    // Side (+X and -X) industrial windows
    const sideBays = Math.max(2, Math.round((depth / 5.0) * (0.65 + windowDensity * 0.2)));
    const baySpacingZ = depth / sideBays;
    const sideWinW = Math.min(baySpacingZ * 0.62, 2.9 * windowScale);

    for (let s = 0; s < sideBays; s++) {
      const bz = -depth / 2 + baySpacingZ * (s + 0.5);
      addFactoryWindow(width / 2, wy, bz, sideWinW, winMaxH, Math.PI / 2);

      // -X upper windows clear of the boiler annex
      const clearOfAnnex = wy - winMaxH / 2 > baseY + annexH + 0.25 || bz > annexZ + annexD / 2 + 0.8;
      if (clearOfAnnex) {
        addFactoryWindow(-width / 2, wy, bz, sideWinW, winMaxH, -Math.PI / 2);
      }
    }

    if (hasCornerAccents) {
      for (let s = 0; s <= sideBays; s++) {
        const pz = -depth / 2 + s * baySpacingZ;
        const clampedZ = Math.max(-depth / 2 + 0.24, Math.min(depth / 2 - 0.24, pz));
        batch.addBox('trim', 0.26, hallH + 0.15, 0.28, width / 2 + 0.06, baseY + hallH / 2, clampedZ);
      }
    }
  }

  // Boiler annex industrial windows on +Z and -X faces
  addFactoryWindow(annexX, baseY + annexH * 0.55, annexZ + annexD / 2, annexW * 0.58, annexH * 0.42, 0);
  addFactoryWindow(annexX - annexW / 2, baseY + annexH * 0.55, annexZ + annexD * 0.15, annexD * 0.36, annexH * 0.42, -Math.PI / 2);

  // 5. Loading Dock Platform, Roll-Up Cargo Gates & Steel Canopy (hasPorch)
  if (hasPorch) {
    const dockW = Math.min(width * 0.56, 14.5);
    const dockD = 2.4;
    const dockX = width * 0.08;
    const dockZ = depth / 2 + dockD / 2;
    const dockH = Math.max(0.75, foundationHeight + 0.12);

    batch.addBox('foundation', dockW, dockH, dockD, dockX, dockH / 2, dockZ);
    batch.addBox('stoneStep', dockW + 0.12, 0.1, dockD + 0.12, dockX, dockH, dockZ);
    // Yellow safety edge stripe on loading apron
    batch.addBox('hazardYellow', dockW, 0.08, 0.14, dockX, dockH + 0.03, dockZ + dockD / 2 - 0.04);

    // Forklift concrete ramp at +X end of loading dock
    const rampLen = 3.2;
    const rampAngle = Math.atan2(dockH, rampLen);
    batch.addBox(
      'stoneStep',
      Math.hypot(rampLen, dockH),
      0.16,
      1.8,
      dockX + dockW / 2 + rampLen / 2 - 0.1,
      dockH / 2,
      dockZ + 0.15,
      0,
      0,
      -rampAngle,
    );

    // Roll-up corrugated steel cargo doors (2 or 3 gates depending on dock width)
    const gateCount = dockW >= 10.5 ? 3 : 2;
    const gateW = 3.0;
    const gateH = Math.min(floorHeight - 0.5, 3.35);
    const gateTopY = baseY + gateH;

    for (let g = 0; g < gateCount; g++) {
      const gx = dockX - ((gateCount - 1) * 4.0) / 2 + g * 4.0;
      // Steel frame & roll-up shutter housing box
      batch.addBox('trim', gateW + 0.28, gateH + 0.2, 0.18, gx, baseY + gateH / 2, depth / 2 + 0.05);
      batch.addBox('metalAccent', gateW, gateH, 0.12, gx, baseY + gateH / 2, depth / 2 + 0.09);
      batch.addBox('trim', gateW + 0.34, 0.36, 0.34, gx, gateTopY + 0.12, depth / 2 + 0.16);
      // Horizontal ribbing bands across roll-up gate
      for (let r = 1; r <= 4; r++) {
        batch.addBox('trim', gateW - 0.1, 0.05, 0.06, gx, baseY + (gateH * r) / 5, depth / 2 + 0.16);
      }
      // Yellow hazard bumper bollards flanking each gate
      batch.addBox('hazardYellow', 0.18, 0.95, 0.18, gx - gateW / 2 - 0.22, dockH + 0.48, depth / 2 + 0.22);
      batch.addBox('hazardYellow', 0.18, 0.95, 0.18, gx + gateW / 2 + 0.22, dockH + 0.48, depth / 2 + 0.22);
    }

    // Cantilevered Steel Canopy Hood above Loading Gates with tension tie-rods
    const canopyY = Math.min(baseY + floorHeight - 0.18, gateTopY + 0.48);
    batch.addBox('roof', dockW + 0.6, 0.14, dockD + 0.4, dockX, canopyY, dockZ + 0.15, 0.06, 0, 0);
    batch.addBox('trim', dockW + 0.64, 0.16, 0.1, dockX, canopyY - 0.06, dockZ + dockD / 2 + 0.32);
    for (let g = 0; g <= gateCount; g++) {
      const tx = dockX - dockW / 2 + 0.6 + (g / gateCount) * (dockW - 1.2);
      batch.addBox(
        'trim',
        0.07,
        0.07,
        dockD * 0.95,
        tx,
        canopyY + 0.42,
        depth / 2 + dockD * 0.42,
        0.42,
        0,
        0,
      );
    }

    // Personnel steel entrance door on front-left (-X side)
    const doorW = 1.15;
    const doorH = Math.min(floorHeight - 0.5, 2.25);
    batch.addBox('trim', doorW + 0.22, doorH + 0.14, 0.16, staffDoorX, baseY + doorH / 2, depth / 2 + 0.05);
    batch.addBox('door', doorW, doorH, 0.1, staffDoorX, baseY + doorH / 2, depth / 2 + 0.08);
    batch.addBox('metalAccent', doorW + 0.8, 0.1, 1.1, staffDoorX, baseY + doorH + 0.22, depth / 2 + 0.55);
    for (let s = 0; s < 2; s++) {
      const sh = foundationHeight * ((2 - s) / 3);
      batch.addBox('stoneStep', doorW + 0.7, sh, 0.42, staffDoorX, sh / 2, depth / 2 + 0.25 + s * 0.42);
    }
  }

  // 6. External Steel Catwalk Gallery & Fire-Escape Staircase (hasBalcony, floors >= 2)
  if (hasBalcony && floors >= 2) {
    const catY = baseY + floorHeight;
    const catW = Math.min(width * 0.28, 6.2);
    const catD = 1.45;
    const catX = staffDoorX;
    const catZ = depth / 2 + catD / 2;

    // Upper floor access door onto catwalk
    const uDoorW = 1.05;
    const uDoorH = Math.min(floorHeight - 0.55, 2.15);
    batch.addBox('trim', uDoorW + 0.2, uDoorH + 0.12, 0.14, catX, catY + uDoorH / 2, depth / 2 + 0.04);
    batch.addBox('door', uDoorW, uDoorH, 0.09, catX, catY + uDoorH / 2, depth / 2 + 0.07);

    // Steel grating catwalk & support gussets
    batch.addBox('metalAccent', catW, 0.14, catD, catX, catY, catZ);
    for (const gx of [catX - catW * 0.4, catX, catX + catW * 0.4]) {
      batch.addBox('trim', 0.1, 0.95, 0.1, gx, catY - 0.36, catZ - 0.15, 0.65, 0, 0);
    }
    // Safety handrail along catwalk
    batch.addBox('hazardYellow', catW, 0.06, 0.06, catX, catY + 0.96, catZ + catD / 2 - 0.05);
    batch.addBox('trim', catW, 0.04, 0.04, catX, catY + 0.5, catZ + catD / 2 - 0.05);
    for (let i = 0; i <= 4; i++) {
      const px = catX - catW / 2 + 0.06 + (i / 4) * (catW - 0.12);
      batch.addBox('trim', 0.05, 0.98, 0.05, px, catY + 0.48, catZ + catD / 2 - 0.05);
    }

    // External sloped steel stair descending toward -X to ground yard
    const stairSpanX = 3.2;
    const stairStartX = catX - catW / 2 + 0.15;
    const steps = 10;
    for (let s = 0; s < steps; s++) {
      const frac = (s + 0.5) / steps;
      const sx = stairStartX - frac * stairSpanX;
      const sy = catY - frac * (catY - 0.12);
      batch.addBox('metalAccent', 0.28, 0.06, 0.95, sx, sy, catZ + 0.05);
    }
    const stairLen = Math.hypot(stairSpanX, catY - 0.1);
    const stairAngle = Math.atan2(catY - 0.1, stairSpanX);
    batch.addBox(
      'trim',
      stairLen,
      0.12,
      0.08,
      stairStartX - stairSpanX / 2,
      catY / 2,
      catZ + 0.52,
      0,
      0,
      stairAngle,
    );
    batch.addBox(
      'hazardYellow',
      stairLen,
      0.06,
      0.06,
      stairStartX - stairSpanX / 2,
      catY / 2 + 0.92,
      catZ + 0.52,
      0,
      0,
      stairAngle,
    );
    batch.addBox('trim', 0.07, 0.96, 0.07, stairStartX - stairSpanX, 0.48, catZ + 0.52);
  }

  // 7. Twin Storage Silos & Overhead Pipeline Bridges (hasCornerAccents)
  if (hasCornerAccents) {
    const siloRadius = 1.45;
    const siloX = width / 2 + siloRadius + 1.05;
    const siloTotalH = Math.min(hallH + 1.4, Math.max(6.8, hallH * 0.88));
    const cylH = siloTotalH * 0.58;
    const legH = siloTotalH * 0.24;
    const coneH = 1.25;
    const siloZList = [-depth * 0.2, depth * 0.18];

    for (const sz of siloZList) {
      // Concrete pad
      batch.addBox('foundation', siloRadius * 2.25, 0.24, siloRadius * 2.25, siloX, 0.12, sz);
      // 4 steel support legs
      for (const [lx, lz] of [
        [-0.88, -0.88],
        [0.88, -0.88],
        [-0.88, 0.88],
        [0.88, 0.88],
      ]) {
        batch.addBox('trim', 0.16, legH + 0.6, 0.16, siloX + lx, 0.24 + (legH + 0.6) / 2, sz + lz);
      }
      // Conical discharge hopper + main cylinder + dome cap
      batch.addCylinder('metalAccent', 0.42, siloRadius, coneH, siloX, 0.24 + legH + coneH / 2 - 0.15, sz);
      const bodyCenterY = 0.24 + legH + coneH + cylH / 2 - 0.15;
      batch.addCylinder('metalAccent', siloRadius, siloRadius, cylH, siloX, bodyCenterY, sz);
      batch.addCylinder('trim', siloRadius + 0.08, siloRadius + 0.08, 0.14, siloX, bodyCenterY + cylH * 0.28, sz);
      batch.addCylinder('roof', siloRadius + 0.06, 0.28, 0.65, siloX, bodyCenterY + cylH / 2 + 0.32, sz);
    }

    // Overhead steel pipe & catwalk bridge linking silos into +X factory wall
    const bridgeY = 0.24 + legH + coneH + cylH * 0.72;
    batch.addBox('trim', 2.4, 0.14, Math.abs(siloZList[1] - siloZList[0]) + 1.2, siloX, bridgeY, 0);
    batch.addCylinder(
      'metalAccent',
      0.24,
      0.24,
      siloX - width / 2 + 0.4,
      (width / 2 + siloX) / 2,
      bridgeY + 0.35,
      siloZList[0],
      0,
      0,
      Math.PI / 2,
    );
    batch.addCylinder(
      'metalAccent',
      0.24,
      0.24,
      siloX - width / 2 + 0.4,
      (width / 2 + siloX) / 2,
      bridgeY + 0.35,
      siloZList[1],
      0,
      0,
      Math.PI / 2,
    );
  }

  // 8. Industrial Roof Geometries: Sawtooth ('stepped'), Clerestory Gable ('gable'), Flat Skylight Deck ('flat')
  const rW = width + roofOverhang * 1.4;
  const rD = depth + roofOverhang * 0.9;
  const pitchRad = (roofPitchDeg * Math.PI) / 180;

  if (roofType === 'stepped') {
    const bayCount = depth >= 26 ? 4 : 3;
    const bayD = rD / bayCount;
    const bayRise = Math.max(1.8, Math.tan(pitchRad) * Math.max(4.2, depth / 4));

    for (let i = 0; i < bayCount; i++) {
      const bayCenterZ = -rD / 2 + bayD * (i + 0.5);
      const wedge = createSawtoothBayGeo(rW, bayD, bayRise);
      batch.addGeometry('wall', wedge, 0, topY + 0.16, bayCenterZ);

      // Sloped metal roof plate resting on the sawtooth hypotenuse
      const slopeLen = Math.hypot(bayD, bayRise) + 0.22;
      const slopeAngle = Math.atan2(bayRise, bayD);
      batch.addBox(
        'roof',
        rW + 0.24,
        0.14,
        slopeLen,
        0,
        topY + 0.16 + bayRise / 2 + 0.06,
        bayCenterZ,
        -slopeAngle,
        0,
        0,
      );

      // Vertical northlight glazed clerestory strip facing +Z on each sawtooth step
      const glassZ = bayCenterZ + bayD / 2 + 0.03;
      const glassH = bayRise * 0.72;
      const glassY = topY + 0.16 + bayRise * 0.48;
      batch.addBox('glassBacking', rW - 0.8, glassH, 0.08, 0, glassY, glassZ - 0.02);
      batch.addBox('glass', rW - 0.9, glassH - 0.1, 0.06, 0, glassY, glassZ + 0.02);

      const mCount = Math.max(4, Math.round(rW / 3.4));
      for (let m = 0; m <= mCount; m++) {
        const mx = -rW / 2 + 0.4 + (m / mCount) * (rW - 0.8);
        batch.addBox('trim', 0.08, glassH + 0.08, 0.12, mx, glassY, glassZ + 0.04);
      }
    }
  } else if (roofType === 'gable') {
    const ridgeRise = Math.tan(pitchRad) * (rD * 0.48);
    const gableWall = createGableEndGeo(width, depth, ridgeRise);
    batch.addGeometry('wall', gableWall, 0, topY, 0);

    // Two pitched metal roof slopes
    const slopeSpan = Math.hypot(rD / 2, ridgeRise) + 0.3;
    const slopeAngle = Math.atan2(ridgeRise, rD / 2);
    for (const side of [-1, 1]) {
      batch.addBox(
        'roof',
        rW,
        0.16,
        slopeSpan,
        0,
        topY + ridgeRise / 2 + 0.08,
        side * (rD / 4),
        side * slopeAngle,
        0,
        0,
      );
    }

    // Raised glazed clerestory monitor along the ridge
    const monW = width * 0.72;
    const monD = 2.4;
    const monH = 1.25;
    const monBaseY = topY + ridgeRise - 0.12;
    batch.addBox('trim', monW, monH, monD, 0, monBaseY + monH / 2, 0);
    batch.addBox('glass', monW - 0.5, monH * 0.65, monD + 0.08, 0, monBaseY + monH * 0.5, 0);
    batch.addBox('roof', monW + 0.45, 0.18, monD + 0.45, 0, monBaseY + monH + 0.06, 0);
  } else {
    // Flat industrial roof deck with raised skylight monitors & twin chiller units
    batch.addBox('roof', width - 0.12, 0.16, depth - 0.12, 0, topY + 0.14, 0);
    // Raised parapet rim
    batch.addBox('stoneStep', width + 0.24, 0.42, 0.26, 0, topY + 0.34, depth / 2);
    batch.addBox('stoneStep', width + 0.24, 0.42, 0.26, 0, topY + 0.34, -depth / 2);
    batch.addBox('stoneStep', 0.26, 0.42, depth, width / 2, topY + 0.34, 0);
    batch.addBox('stoneStep', 0.26, 0.42, depth, -width / 2, topY + 0.34, 0);

    // 3 skylight light-wells
    for (const sx of [-width * 0.28, 0, width * 0.28]) {
      batch.addBox('trim', 2.8, 0.65, depth * 0.46, sx, topY + 0.48, -depth * 0.08);
      batch.addBox('glass', 2.6, 0.22, depth * 0.44, sx, topY + 0.85, -depth * 0.08);
    }

    // Twin HVAC chillers & ducting
    for (const cx of [-width * 0.18, width * 0.22]) {
      batch.addBox('metalAccent', 3.4, 1.15, 2.1, cx, topY + 0.72, depth * 0.24);
      batch.addCylinder('trim', 0.52, 0.52, 0.32, cx - 0.85, topY + 1.38, depth * 0.24);
      batch.addCylinder('trim', 0.52, 0.52, 0.32, cx + 0.85, topY + 1.38, depth * 0.24);
    }
  }

  // 9. Tall Industrial Boiler Smokestack with Warning Bands & Steel Flue (hasChimney)
  if (hasChimney) {
    const stackX = annexX - annexW * 0.08;
    const stackZ = annexZ - annexD * 0.12;
    const roofPeakHint =
      roofType === 'stepped'
        ? Math.max(1.8, Math.tan(pitchRad) * Math.max(4.2, depth / 4))
        : roofType === 'gable'
          ? Math.tan(pitchRad) * (depth * 0.48) + 1.35
          : 1.45;
    const stackAboveRoof = Math.max(5.5, hallH * 0.65);
    const stackTopY = topY + Math.max(roofPeakHint + 2.2, roofPeakHint * 0.4 + stackAboveRoof);

    // Masonry pedestal base emerging through boiler annex roof
    const pedTopY = baseY + annexH + 1.45;
    batch.addBox('chimney', 2.35, pedTopY, 2.35, stackX, pedTopY / 2, stackZ);
    batch.addBox('stoneStep', 2.55, 0.22, 2.55, stackX, pedTopY + 0.05, stackZ);

    // Tapered brick smokestack shaft below warning bands
    const shaftBottomY = pedTopY + 0.16;
    const bandTotalH = 3.0;
    const mainShaftTopY = stackTopY - bandTotalH;
    const mainShaftH = Math.max(2.5, mainShaftTopY - shaftBottomY);
    const rBase = 0.96;
    const rMid = 0.68;
    const rCrown = 0.56;

    batch.addCylinder('chimney', rBase, rMid, mainShaftH, stackX, shaftBottomY + mainShaftH / 2, stackZ);

    // Alternating red & white aviation warning bands near top
    const bandH = bandTotalH / 3;
    const bandR1 = rMid - (rMid - rCrown) * 0.33;
    const bandR2 = rMid - (rMid - rCrown) * 0.66;
    batch.addCylinder('warningRed', rMid, bandR1, bandH, stackX, mainShaftTopY + bandH * 0.5, stackZ);
    batch.addCylinder('warningWhite', bandR1, bandR2, bandH, stackX, mainShaftTopY + bandH * 1.5, stackZ);
    batch.addCylinder('warningRed', bandR2, rCrown, bandH, stackX, mainShaftTopY + bandH * 2.5, stackZ);

    // Cast-iron crown collar ring
    batch.addCylinder('trim', rCrown + 0.14, rCrown + 0.08, 0.24, stackX, stackTopY + 0.06, stackZ);

    // Secondary galvanized steel exhaust stack alongside boiler wing
    const flueX = annexX + annexW * 0.22;
    const flueZ = annexZ + annexD * 0.12;
    const flueTopY = topY + 2.8;
    const flueBottomY = baseY + annexH + 0.1;
    const flueH = Math.max(2.0, flueTopY - flueBottomY);
    batch.addCylinder('metalAccent', 0.34, 0.34, flueH, flueX, flueBottomY + flueH / 2, flueZ);
    batch.addCylinder('trim', 0.42, 0.34, 0.22, flueX, flueTopY + 0.08, flueZ);
  }

  batch.flushToGroup(group, ctx, {
    warningRed: warningRedMat,
    warningWhite: warningWhiteMat,
    hazardYellow: hazardYellowMat,
  });

  return group;
}
