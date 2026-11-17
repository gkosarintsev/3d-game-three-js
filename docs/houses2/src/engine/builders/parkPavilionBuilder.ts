import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HouseConfig } from '../../types/house';
import type { HouseBuildContext } from './types';

type PavilionBucketKey =
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
  | 'warmLantern'
  | 'foliage';

class PavilionBatcher {
  private readonly buckets: Record<PavilionBucketKey, THREE.BufferGeometry[]> = {
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
    warmLantern: [],
    foliage: [],
  };

  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly unitCyl = new THREE.CylinderGeometry(1, 1, 1, 16);
  private readonly unitSphere = new THREE.SphereGeometry(1, 14, 10);
  private readonly mat4 = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();

  addBox(
    bucket: PavilionBucketKey,
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
    bucket: PavilionBucketKey,
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

  addSphere(
    bucket: PavilionBucketKey,
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
    bucket: PavilionBucketKey,
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
    extraMaterials: Record<'warmLantern' | 'foliage', THREE.MeshStandardMaterial>,
  ): void {
    this.unitBox.dispose();
    this.unitCyl.dispose();
    this.unitSphere.dispose();

    const entries = Object.entries(this.buckets) as Array<
      [PavilionBucketKey, THREE.BufferGeometry[]]
    >;
    for (const [key, geos] of entries) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      ctx.trackGeometry(merged);

      const mat =
        key === 'warmLantern' || key === 'foliage' ? extraMaterials[key] : ctx.materials[key];
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `ParkPavilion_${key}`;
      const isGlass = key === 'glass' || key === 'glassBacking';
      mesh.castShadow = !isGlass && key !== 'warmLantern';
      mesh.receiveShadow = key !== 'glass' && key !== 'warmLantern';
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

  pushTri(p0, p3, p2);
  pushTri(p0, p2, p1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

function createCupolaDomeGeo(radius: number, height: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const segs = 12;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    // Graceful classic ogee/hemispherical belvedere dome profile
    const r = Math.max(0.001, radius * Math.cos(t * Math.PI * 0.5) * (1 - 0.08 * Math.sin(t * Math.PI)));
    const y = height * Math.sin(t * Math.PI * 0.5);
    pts.push(new THREE.Vector2(r, y));
  }
  const geo = new THREE.LatheGeometry(pts, 16);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds an architectural Park Pavilion (Парковый павильон):
 * - Raised stone podium terrace with wood deck inlay and radial park entry steps (hasPorch)
 * - Perimeter colonnade with stone plinths, classical column shafts, capitals & arch brackets
 * - Configurable enclosure via windowDensity: 1 = open colonnade, 2 = tea-house half-glazing, 3 = full glass conservatory
 * - Balustrade railings & built-in park benches (hasBalcony) + corner stone flower planters & pergola trellises (hasCornerAccents)
 * - 3 park roof archetypes: 'hip' tented pavilion with exposed rafters, 'stepped' octagonal dome rotunda + clerestory lantern,
 *   and 'flat' cantilevered botanical canopy with slatted timber pergola extension
 * - Optional belvedere finial spire / skylight turret (hasChimney) + warm interior chandelier globes
 */
export function buildParkPavilion(
  config: HouseConfig,
  ctx: HouseBuildContext,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ParkPavilionModel';

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

  const warmLanternMat = new THREE.MeshStandardMaterial({
    name: 'PavilionWarmLantern',
    color: new THREE.Color('#fde68a'),
    emissive: new THREE.Color('#f59e0b'),
    emissiveIntensity: 1.15,
    roughness: 0.3,
  });
  const foliageMat = new THREE.MeshStandardMaterial({
    name: 'PavilionPlanterFoliage',
    color: new THREE.Color('#4d7c54'),
    roughness: 0.8,
    metalness: 0.02,
  });
  ctx.trackDisposable(warmLanternMat);
  ctx.trackDisposable(foliageMat);

  const batch = new PavilionBatcher();
  const baseY = foundationHeight;

  // 1. Stepped Stone Terrace Podium + Timber Floor Deck Inlay
  batch.addBox('foundation', width, foundationHeight, depth, 0, foundationHeight / 2, 0);
  batch.addBox('stoneStep', width + 0.34, 0.1, depth + 0.34, 0, foundationHeight - 0.04, 0);
  // Warm hardwood terrace plank floor raised slightly to eliminate z-fighting
  batch.addBox('timberAccent', width - 0.65, 0.05, depth - 0.65, 0, baseY + 0.025, 0);

  // Radial approach stairways & flanking stone lantern piers (+Z front and -Z park promenade axis)
  if (hasPorch) {
    const stepW = Math.min(3.6, width * 0.42);
    const stepCount = Math.max(2, Math.round(foundationHeight / 0.16));
    const stepRise = foundationHeight / stepCount;
    const stepRun = 0.34;

    for (const dirZ of [1, -1]) {
      for (let s = 0; s < stepCount; s++) {
        const sy = stepRise * (stepCount - s - 0.5);
        const sz = dirZ * (depth / 2 + 0.17 + s * stepRun + stepRun / 2);
        batch.addBox('stoneStep', stepW, stepRise, stepRun, 0, sy, sz);
      }
      // Cheek walls & globe lantern bollards on front entry (+Z)
      const pierZ = dirZ * (depth / 2 + 0.38);
      for (const sideX of [-1, 1]) {
        const px = sideX * (stepW / 2 + 0.22);
        batch.addBox('stoneStep', 0.36, foundationHeight + 0.55, 0.42, px, (foundationHeight + 0.55) / 2, pierZ);
        batch.addBox('trim', 0.44, 0.08, 0.5, px, foundationHeight + 0.58, pierZ);
        if (dirZ === 1) {
          batch.addCylinder('metalAccent', 0.045, 0.045, 0.28, px, foundationHeight + 0.74, pierZ);
          batch.addSphere('warmLantern', 0.14, 0.15, 0.14, px, foundationHeight + 0.94, pierZ);
        }
      }
    }
  }

  // Helper to build a full colonnade + bay infill tier
  const buildPavilionTier = (
    tierW: number,
    tierD: number,
    tierFloorY: number,
    tierH: number,
    isUpperTier: boolean,
  ) => {
    const hx = tierW / 2 - 0.28;
    const hz = tierD / 2 - 0.28;
    const colsX = Math.max(2, Math.round(tierW / 2.9));
    const colsZ = Math.max(2, Math.round(tierD / 2.8));

    const colPositions: Array<{ x: number; z: number; edge: 'front' | 'back' | 'left' | 'right' | 'corner' }> = [];
    for (let ix = 0; ix <= colsX; ix++) {
      const x = -hx + (ix / colsX) * (hx * 2);
      const isCorner = ix === 0 || ix === colsX;
      colPositions.push({ x, z: hz, edge: isCorner ? 'corner' : 'front' });
      colPositions.push({ x, z: -hz, edge: isCorner ? 'corner' : 'back' });
    }
    for (let iz = 1; iz < colsZ; iz++) {
      const z = -hz + (iz / colsZ) * (hz * 2);
      colPositions.push({ x: -hx, z, edge: 'left' });
      colPositions.push({ x: hx, z, edge: 'right' });
    }

    // Perimeter columns with stone base plinth, slender shaft & classical capital
    const plinthH = 0.24;
    const capH = 0.2;
    const shaftH = Math.max(1.2, tierH - plinthH - capH - 0.34);
    for (const cp of colPositions) {
      batch.addBox('stoneStep', 0.34, plinthH, 0.34, cp.x, tierFloorY + plinthH / 2, cp.z);
      batch.addCylinder(
        'trim',
        0.135,
        0.115,
        shaftH,
        cp.x,
        tierFloorY + plinthH + shaftH / 2,
        cp.z,
      );
      batch.addBox('trim', 0.34, capH, 0.34, cp.x, tierFloorY + plinthH + shaftH + capH / 2, cp.z);
    }

    // Continuous entablature frieze beam around top of columns
    const beamY = tierFloorY + tierH - 0.17;
    batch.addBox('wall', tierW - 0.16, 0.34, 0.3, 0, beamY, hz);
    batch.addBox('wall', tierW - 0.16, 0.34, 0.3, 0, beamY, -hz);
    batch.addBox('wall', 0.3, 0.34, tierD - 0.72, -hx, beamY, 0);
    batch.addBox('wall', 0.3, 0.34, tierD - 0.72, hx, beamY, 0);
    // Crisp cornice trim molding
    batch.addBox('trim', tierW + 0.06, 0.09, tierD + 0.06, 0, tierFloorY + tierH + 0.02, 0);

    // Bay Infills: balustrades, half-glazed wainscot or full conservatory glass, plus open center portals
    const buildBayInfill = (
      x1: number,
      z1: number,
      x2: number,
      z2: number,
      isHorizontalX: boolean,
      isPortalBay: boolean,
    ) => {
      const mx = (x1 + x2) / 2;
      const mz = (z1 + z2) / 2;
      const span = Math.hypot(x2 - x1, z2 - z1) - 0.28;
      if (span <= 0.35) return;

      // Decorative angled timber corner knee braces anchored from column capital to frieze beam
      const braceOffset = Math.max(0.2, span / 2 - 0.22);
      const braceY = tierFloorY + plinthH + shaftH - 0.16;
      if (isHorizontalX) {
        for (const s of [-1, 1]) {
          batch.addBox('timberAccent', 0.48, 0.085, 0.085, mx + s * braceOffset, braceY, mz, 0, 0, s * 0.72);
        }
      } else {
        for (const s of [-1, 1]) {
          batch.addBox('timberAccent', 0.085, 0.085, 0.48, mx, braceY, mz + s * braceOffset, -s * 0.72, 0, 0);
        }
      }

      if (isPortalBay) {
        // Center walkway portal stays open at density 1 & 2, or gets glazed French double doors at density 3
        if (windowDensity === 3 && !isUpperTier) {
          const doorH = Math.min(2.45, shaftH * 0.88);
          const dW = Math.min(span * 0.85, 2.2);
          if (isHorizontalX) {
            batch.addBox('trim', dW + 0.12, doorH + 0.08, 0.1, mx, tierFloorY + doorH / 2, mz);
            batch.addBox('glass', dW - 0.12, doorH - 0.12, 0.04, mx, tierFloorY + doorH / 2, mz);
            batch.addBox('trim', 0.06, doorH, 0.08, mx, tierFloorY + doorH / 2, mz);
          } else {
            batch.addBox('trim', 0.1, doorH + 0.08, dW + 0.12, mx, tierFloorY + doorH / 2, mz);
            batch.addBox('glass', 0.04, doorH - 0.12, dW - 0.12, mx, tierFloorY + doorH / 2, mz);
            batch.addBox('trim', 0.08, doorH, 0.06, mx, tierFloorY + doorH / 2, mz);
          }
        }
        return;
      }

      // Balustrade railing along non-portal bays (hasBalcony)
      if (hasBalcony && windowDensity < 3) {
        const railH = 0.86;
        if (isHorizontalX) {
          batch.addBox('trim', span, 0.07, 0.12, mx, tierFloorY + railH, mz);
          batch.addBox('stoneStep', span, 0.08, 0.14, mx, tierFloorY + 0.08, mz);
        } else {
          batch.addBox('trim', 0.12, 0.07, span, mx, tierFloorY + railH, mz);
          batch.addBox('stoneStep', 0.14, 0.08, span, mx, tierFloorY + 0.08, mz);
        }
        const balCount = Math.max(3, Math.floor(span / 0.34));
        for (let b = 1; b < balCount; b++) {
          const t = b / balCount - 0.5;
          const bx = isHorizontalX ? mx + t * span : mx;
          const bz = isHorizontalX ? mz : mz + t * span;
          batch.addBox('trim', 0.065, railH - 0.12, 0.065, bx, tierFloorY + railH / 2 + 0.02, bz);
        }
      }

      // Half-glazed wainscot (windowDensity === 2) or full glass conservatory walls (windowDensity === 3)
      if (windowDensity === 2) {
        const panelH = 0.86;
        const winH = Math.max(0.85, (shaftH - panelH - 0.18) * Math.min(1.0, windowScale * 0.88));
        const winY = tierFloorY + panelH + winH / 2 + 0.06;
        if (isHorizontalX) {
          batch.addBox('wall', span, panelH, 0.14, mx, tierFloorY + panelH / 2, mz);
          batch.addBox('glass', span - 0.14, winH, 0.04, mx, winY, mz);
          batch.addBox('trim', span, 0.06, 0.09, mx, winY + winH / 2, mz);
          batch.addBox('trim', 0.06, winH, 0.08, mx, winY, mz);
        } else {
          batch.addBox('wall', 0.14, panelH, span, mx, tierFloorY + panelH / 2, mz);
          batch.addBox('glass', 0.04, winH, span - 0.14, mx, winY, mz);
          batch.addBox('trim', 0.09, 0.06, span, mx, winY + winH / 2, mz);
          batch.addBox('trim', 0.08, winH, 0.06, mx, winY, mz);
        }
      } else if (windowDensity === 3) {
        const glassH = Math.max(1.4, shaftH * Math.min(1.02, windowScale * 0.94));
        const glassY = tierFloorY + plinthH + glassH / 2;
        if (isHorizontalX) {
          batch.addBox('wall', span, 0.24, 0.14, mx, tierFloorY + 0.12, mz);
          batch.addBox('glass', span - 0.1, glassH, 0.04, mx, glassY, mz);
          batch.addBox('trim', span, 0.07, 0.09, mx, glassY + glassH / 2, mz);
          batch.addBox('trim', 0.06, glassH, 0.08, mx - span * 0.18, glassY, mz);
          batch.addBox('trim', 0.06, glassH, 0.08, mx + span * 0.18, glassY, mz);
          batch.addBox('trim', span, 0.05, 0.07, mx, glassY + glassH * 0.18, mz);
        } else {
          batch.addBox('wall', 0.14, 0.24, span, mx, tierFloorY + 0.12, mz);
          batch.addBox('glass', 0.04, glassH, span - 0.1, mx, glassY, mz);
          batch.addBox('trim', 0.09, 0.07, span, mx, glassY + glassH / 2, mz);
          batch.addBox('trim', 0.08, glassH, 0.06, mx, glassY, mz - span * 0.18);
          batch.addBox('trim', 0.08, glassH, 0.06, mx, glassY, mz + span * 0.18);
          batch.addBox('trim', 0.07, 0.05, span, mx, glassY + glassH * 0.18, mz);
        }
      }
    };

    for (let ix = 0; ix < colsX; ix++) {
      const x1 = -hx + (ix / colsX) * (hx * 2);
      const x2 = -hx + ((ix + 1) / colsX) * (hx * 2);
      const portal = colsX === 1 || ix === Math.floor((colsX - 1) / 2);
      buildBayInfill(x1, hz, x2, hz, true, portal);
      buildBayInfill(x1, -hz, x2, -hz, true, portal && hasPorch);
    }
    for (let iz = 0; iz < colsZ; iz++) {
      const z1 = -hz + (iz / colsZ) * (hz * 2);
      const z2 = -hz + ((iz + 1) / colsZ) * (hz * 2);
      buildBayInfill(-hx, z1, -hx, z2, false, false);
      buildBayInfill(hx, z1, hx, z2, false, false);
    }

    // Interior warm ceiling crossbeams + glowing suspended lantern chandelier
    batch.addBox('timberAccent', tierW - 0.7, 0.14, 0.16, 0, beamY - 0.1, 0);
    batch.addBox('timberAccent', 0.16, 0.14, tierD - 0.7, 0, beamY - 0.1, 0);
    if (!isUpperTier) {
      batch.addCylinder('metalAccent', 0.025, 0.025, 0.55, 0, beamY - 0.42, 0);
      batch.addCylinder('metalAccent', 0.42, 0.42, 0.04, 0, beamY - 0.7, 0);
      for (const [lx, lz] of [
        [-0.36, 0],
        [0.36, 0],
        [0, -0.36],
        [0, 0.36],
      ]) {
        batch.addSphere('warmLantern', 0.09, 0.11, 0.09, lx, beamY - 0.62, lz);
      }
    }
  };

  // Build Floor 1
  buildPavilionTier(width, depth, baseY, floorHeight, false);

  // Built-in wooden park benches inside ground pavilion along left/right bays (when space allows)
  if (!hasBalcony || windowDensity <= 2) {
    const benchLen = Math.min(2.6, depth * 0.36);
    for (const sideX of [-1, 1]) {
      const bx = sideX * (width / 2 - 0.92);
      batch.addBox('timberAccent', 0.48, 0.06, benchLen, bx, baseY + 0.46, 0);
      batch.addBox('timberAccent', 0.06, 0.38, benchLen, bx + sideX * 0.18, baseY + 0.74, 0);
      for (const lz of [-benchLen * 0.38, benchLen * 0.38]) {
        batch.addBox('metalAccent', 0.42, 0.44, 0.07, bx, baseY + 0.22, lz);
      }
    }
  }

  // Optional 2nd Belvedere Gallery Tier when floors === 2
  let roofBaseW = width;
  let roofBaseD = depth;
  let eaveY = baseY + floorHeight;

  if (floors >= 2) {
    const upperW = width * 0.76;
    const upperD = depth * 0.76;
    const upperFloorY = baseY + floorHeight + 0.08;
    // Flat deck terrace atop Floor 1 framing Floor 2 belvedere
    batch.addBox('roof', width + 0.25, 0.14, depth + 0.25, 0, baseY + floorHeight, 0);
    batch.addBox('timberAccent', upperW + 0.6, 0.06, upperD + 0.6, 0, upperFloorY + 0.02, 0);

    // Terrace perimeter safety railing around Floor 1 deck
    if (hasBalcony) {
      const rx = width / 2 - 0.12;
      const rz = depth / 2 - 0.12;
      const rY = upperFloorY + 0.85;
      batch.addBox('trim', width - 0.2, 0.07, 0.1, 0, rY, rz);
      batch.addBox('trim', width - 0.2, 0.07, 0.1, 0, rY, -rz);
      batch.addBox('trim', 0.1, 0.07, depth - 0.2, -rx, rY, 0);
      batch.addBox('trim', 0.1, 0.07, depth - 0.2, rx, rY, 0);
      for (let i = -3; i <= 3; i++) {
        const px = (i / 3) * (rx - 0.3);
        batch.addBox('trim', 0.07, 0.82, 0.07, px, upperFloorY + 0.42, rz);
        batch.addBox('trim', 0.07, 0.82, 0.07, px, upperFloorY + 0.42, -rz);
      }
      for (let j = -2; j <= 2; j++) {
        const pz = (j / 2) * (rz - 0.3);
        batch.addBox('trim', 0.07, 0.82, 0.07, -rx, upperFloorY + 0.42, pz);
        batch.addBox('trim', 0.07, 0.82, 0.07, rx, upperFloorY + 0.42, pz);
      }
    }

    buildPavilionTier(upperW, upperD, upperFloorY, floorHeight, true);
    roofBaseW = upperW;
    roofBaseD = upperD;
    eaveY = upperFloorY + floorHeight;
  }

  // 2. Three Park Pavilion Roof Archetypes
  const rad = (roofPitchDeg * Math.PI) / 180;
  const span = Math.min(roofBaseW, roofBaseD);

  if (roofType === 'stepped') {
    // Rotunda & Clerestory Cupola Dome
    const skirtW = roofBaseW + roofOverhang * 1.85;
    const skirtD = roofBaseD + roofOverhang * 1.85;
    const skirtRise = Math.max(0.85, Math.min(1.4, span * 0.14));
    const ridgeAlongX = roofBaseW >= roofBaseD;
    const skirtRidge = Math.max(0.4, Math.abs(skirtW - skirtD) + 0.4);
    batch.addGeometry(
      'roof',
      createHipRoofGeo(skirtW, skirtD, skirtRise, skirtRidge, ridgeAlongX),
      0,
      eaveY - 0.04,
      0,
    );

    // Octagonal Clerestory Drum atop lower roof skirt with open glass bays & 8 perimeter mullions
    const drumR = Math.min(roofBaseW, roofBaseD) * 0.34;
    const drumH = Math.max(1.2, floorHeight * 0.36);
    const drumY = eaveY + skirtRise * 0.62;
    // Lower sill ring & upper entablature ring
    batch.addGeometry('trim', new THREE.CylinderGeometry(drumR + 0.08, drumR + 0.08, 0.18, 8), 0, drumY + 0.09, 0);
    batch.addGeometry('trim', new THREE.CylinderGeometry(drumR + 0.16, drumR + 0.12, 0.2, 8), 0, drumY + drumH - 0.08, 0);
    // Translucent glass clerestory wall inside the 8 corner mullions
    batch.addGeometry('glass', new THREE.CylinderGeometry(drumR * 0.94, drumR * 0.94, drumH - 0.24, 8), 0, drumY + drumH / 2, 0);
    // Warm glowing lantern core inside clerestory
    batch.addCylinder('warmLantern', drumR * 0.42, drumR * 0.42, drumH * 0.55, 0, drumY + drumH / 2, 0);
    // 8 exterior vertical mullions framing the glass panels
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2 + Math.PI / 8;
      batch.addBox(
        'trim',
        0.13,
        drumH - 0.1,
        0.13,
        Math.cos(ang) * (drumR * 0.96),
        drumY + drumH / 2,
        Math.sin(ang) * (drumR * 0.96),
        0,
        -ang,
        0,
      );
    }

    // Crown cornice ring + Ribbed Belvedere Lathe Dome
    const domeBaseY = drumY + drumH;
    batch.addGeometry('trim', new THREE.CylinderGeometry(drumR + 0.24, drumR + 0.18, 0.14, 8), 0, domeBaseY + 0.05, 0);

    const domeH = Math.max(1.45, drumR * 0.88);
    batch.addGeometry('roof', createCupolaDomeGeo(drumR + 0.12, domeH), 0, domeBaseY + 0.1, 0);
    // 8 subtle standing-seam meridian ribs curving over the dome
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI;
      const rib = new THREE.TorusGeometry(drumR + 0.1, 0.032, 6, 20, Math.PI);
      rib.scale(1, domeH / (drumR + 0.1), 1);
      batch.addGeometry('trim', rib, 0, domeBaseY + 0.1, 0, ang);
    }

    if (hasChimney) {
      const spireBaseY = domeBaseY + domeH + 0.06;
      batch.addCylinder('metalAccent', 0.26, 0.11, 0.32, 0, spireBaseY + 0.16, 0);
      batch.addCylinder('metalAccent', 0.045, 0.016, 0.95, 0, spireBaseY + 0.78, 0);
      batch.addSphere('warmLantern', 0.13, 0.13, 0.13, 0, spireBaseY + 0.38, 0);
    }
  } else if (roofType === 'flat') {
    // Contemporary Botanical Park Canopy: trim fascia base below + colored roof membrane deck on top
    const deckW = roofBaseW + roofOverhang * 1.9;
    const deckD = roofBaseD + roofOverhang * 1.9;
    batch.addBox('trim', deckW + 0.14, 0.12, deckD + 0.14, 0, eaveY + 0.08, 0);
    batch.addBox('roof', deckW, 0.16, deckD, 0, eaveY + 0.2, 0);

    // Timber soffit slats beneath cantilevered canopy overhang
    const slatCount = Math.max(5, Math.floor(deckW / 0.85));
    for (let i = 0; i <= slatCount; i++) {
      const sx = -deckW / 2 + 0.25 + (i / slatCount) * (deckW - 0.5);
      batch.addBox('timberAccent', 0.08, 0.08, deckD - 0.15, sx, eaveY - 0.02, 0);
    }

    // Side Slatted Timber Pergola Extension Wing (+X terrace deck)
    const wingW = Math.max(2.2, roofOverhang * 2.1);
    const wingX = roofBaseW / 2 + wingW / 2 - 0.05;
    batch.addBox('trim', wingW, 0.14, roofBaseD * 0.82, wingX, eaveY + 0.07, 0);
    // Outer slender pergola posts grounded onto stone plinth pads
    for (const pz of [-roofBaseD * 0.36, roofBaseD * 0.36]) {
      batch.addBox('stoneStep', 0.42, 0.12, 0.42, wingX + wingW / 2 - 0.18, 0.06, pz);
      batch.addBox('timberAccent', 0.16, eaveY, 0.16, wingX + wingW / 2 - 0.18, eaveY / 2, pz);
    }
    const louverCount = Math.max(4, Math.floor((roofBaseD * 0.8) / 0.45));
    for (let l = 0; l <= louverCount; l++) {
      const lz = -roofBaseD * 0.38 + (l / louverCount) * (roofBaseD * 0.76);
      batch.addBox('timberAccent', wingW - 0.2, 0.12, 0.06, wingX, eaveY + 0.14, lz);
    }

    // Optional Central Glazed Clerestory Skylight Monitor with exposed glass & mullions
    if (hasChimney) {
      const skyW = roofBaseW * 0.44;
      const skyD = roofBaseD * 0.44;
      const skyBaseY = eaveY + 0.28;
      batch.addBox('trim', skyW, 0.1, skyD, 0, skyBaseY + 0.05, 0);
      batch.addBox('glass', skyW - 0.14, 0.4, skyD - 0.14, 0, skyBaseY + 0.3, 0);
      batch.addBox('warmLantern', skyW * 0.5, 0.25, skyD * 0.5, 0, skyBaseY + 0.28, 0);
      for (const [cx, cz] of [
        [-skyW / 2 + 0.06, -skyD / 2 + 0.06],
        [skyW / 2 - 0.06, -skyD / 2 + 0.06],
        [-skyW / 2 + 0.06, skyD / 2 - 0.06],
        [skyW / 2 - 0.06, skyD / 2 - 0.06],
      ]) {
        batch.addBox('trim', 0.1, 0.44, 0.1, cx, skyBaseY + 0.3, cz);
      }
      batch.addBox('roof', skyW + 0.34, 0.12, skyD + 0.34, 0, skyBaseY + 0.56, 0);
    }
  } else {
    // Classic Tented Hip Pavilion Roof ('hip') with Exposed Carved Rafters & Belvedere Finial
    const spanX = roofBaseW + roofOverhang * 2.0;
    const spanZ = roofBaseD + roofOverhang * 2.0;
    const ridgeAlongX = roofBaseW >= roofBaseD;
    const ridgeLen = Math.max(0.5, Math.abs(spanX - spanZ) + 0.5);
    const hipRise = Math.max(1.4, Math.tan(rad) * (span / 2));

    batch.addGeometry(
      'roof',
      createHipRoofGeo(spanX, spanZ, hipRise + 0.14, ridgeLen, ridgeAlongX),
      0,
      eaveY - 0.06,
      0,
    );

    // Crisp perimeter fascia trim
    batch.addBox('trim', spanX + 0.06, 0.13, 0.09, 0, eaveY - 0.03, spanZ / 2);
    batch.addBox('trim', spanX + 0.06, 0.13, 0.09, 0, eaveY - 0.03, -spanZ / 2);
    batch.addBox('trim', 0.09, 0.13, spanZ + 0.06, -spanX / 2, eaveY - 0.03, 0);
    batch.addBox('trim', 0.09, 0.13, spanZ + 0.06, spanX / 2, eaveY - 0.03, 0);

    // Exposed Timber Rafter Tails along all 4 eaves
    const rafterStep = 0.72;
    const countX = Math.max(4, Math.floor(spanX / rafterStep));
    for (let i = 1; i < countX; i++) {
      const rx = -spanX / 2 + (i / countX) * spanX;
      batch.addBox('timberAccent', 0.08, 0.12, roofOverhang + 0.25, rx, eaveY - 0.08, roofBaseD / 2 + roofOverhang * 0.45);
      batch.addBox('timberAccent', 0.08, 0.12, roofOverhang + 0.25, rx, eaveY - 0.08, -roofBaseD / 2 - roofOverhang * 0.45);
    }
    const countZ = Math.max(3, Math.floor(spanZ / rafterStep));
    for (let i = 1; i < countZ; i++) {
      const rz = -spanZ / 2 + (i / countZ) * spanZ;
      batch.addBox('timberAccent', roofOverhang + 0.25, 0.12, 0.08, -roofBaseW / 2 - roofOverhang * 0.45, eaveY - 0.08, rz);
      batch.addBox('timberAccent', roofOverhang + 0.25, 0.12, 0.08, roofBaseW / 2 + roofOverhang * 0.45, eaveY - 0.08, rz);
    }

    // Ornate Ridge Lantern Turret & Brass Spire Finial (hasChimney)
    if (hasChimney) {
      const peakY = eaveY + hipRise + 0.06;
      const turR = Math.min(0.85, span * 0.12);
      batch.addBox('trim', turR * 1.7, 0.55, turR * 1.7, 0, peakY + 0.18, 0);
      batch.addBox('warmLantern', turR * 1.3, 0.36, turR * 1.3, 0, peakY + 0.2, 0);
      batch.addCylinder('roof', turR * 1.2, 0.04, 0.75, 0, peakY + 0.82, 0);
      batch.addCylinder('metalAccent', 0.035, 0.015, 0.55, 0, peakY + 1.35, 0);
      batch.addSphere('metalAccent', 0.1, 0.1, 0.1, 0, peakY + 1.22, 0);
    } else {
      batch.addBox(
        'trim',
        ridgeAlongX ? ridgeLen + 0.14 : 0.18,
        0.09,
        ridgeAlongX ? 0.18 : ridgeLen + 0.14,
        0,
        eaveY + hipRise + 0.08,
        0,
      );
    }
  }

  // 3. Corner Stone Flower Planters, Shrubs & Decorative Timber Trellis Accents (hasCornerAccents)
  if (hasCornerAccents) {
    for (const [sx, sz] of [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ]) {
      const px = sx * (width / 2 - 0.65);
      const pz = sz * (depth / 2 + 0.42);
      batch.addBox('stoneStep', 0.92, 0.42, 0.68, px, 0.21, pz);
      batch.addBox('trim', 0.98, 0.07, 0.74, px, 0.44, pz);
      // Multi-sphere sculpted park shrub inside planter
      batch.addSphere('foliage', 0.32, 0.28, 0.28, px, 0.64, pz);
      batch.addSphere('foliage', 0.22, 0.22, 0.22, px - 0.2, 0.58, pz + 0.06);
      batch.addSphere('foliage', 0.22, 0.22, 0.22, px + 0.2, 0.58, pz - 0.06);
    }

    // Slatted ornamental wooden trellis screens framing left & right corner bays
    for (const sideX of [-1, 1]) {
      const tx = sideX * (width / 2 - 0.28);
      for (const sideZ of [-1, 1]) {
        const tz = sideZ * (depth / 2 - 0.75);
        for (let bar = -1; bar <= 1; bar++) {
          batch.addBox('timberAccent', 0.05, floorHeight * 0.62, 0.05, tx, baseY + floorHeight * 0.42, tz + bar * 0.2);
        }
      }
    }
  }

  batch.flushToGroup(group, ctx, {
    warmLantern: warmLanternMat,
    foliage: foliageMat,
  });

  return group;
}
