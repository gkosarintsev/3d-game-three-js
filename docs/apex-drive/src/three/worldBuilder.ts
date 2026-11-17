import * as THREE from 'three';
import {
  BARRIER_HALF_WIDTH,
  ConeObstacle,
  getGroundHeightAt,
  RAMP_FEATURES,
  SPEED_BUMPS,
  TRACK_HALF_WIDTH,
  TRACK_SAMPLES,
} from '../game/trackData';
import { ProceduralTextures } from './proceduralTextures';

export interface WorldRig {
  group: THREE.Group;
  syncCones: (cones: ConeObstacle[]) => void;
  dispose: () => void;
}

function buildRibbonGeometry(
  offsetMin: number,
  offsetMax: number,
  yOffset: number,
  uvRepeatPerMeter: number,
  closed = true
): THREE.BufferGeometry {
  const n = TRACK_SAMPLES.length;
  const count = closed ? n + 1 : n;
  const positions = new Float32Array(count * 2 * 3);
  const normals = new Float32Array(count * 2 * 3);
  const uvs = new Float32Array(count * 2 * 2);
  const indices: number[] = [];

  for (let i = 0; i < count; i++) {
    const s = TRACK_SAMPLES[i % n];
    const distS = i === n ? TRACK_SAMPLES[n - 1].s + 2.5 : s.s;

    const lx = s.x + s.nx * offsetMin;
    const lz = s.z + s.nz * offsetMin;
    const rx = s.x + s.nx * offsetMax;
    const rz = s.z + s.nz * offsetMax;

    const vi = i * 2;
    positions[vi * 3] = lx;
    positions[vi * 3 + 1] = yOffset;
    positions[vi * 3 + 2] = lz;

    positions[(vi + 1) * 3] = rx;
    positions[(vi + 1) * 3 + 1] = yOffset;
    positions[(vi + 1) * 3 + 2] = rz;

    normals[vi * 3] = 0;
    normals[vi * 3 + 1] = 1;
    normals[vi * 3 + 2] = 0;
    normals[(vi + 1) * 3] = 0;
    normals[(vi + 1) * 3 + 1] = 1;
    normals[(vi + 1) * 3 + 2] = 0;

    uvs[vi * 2] = 0;
    uvs[vi * 2 + 1] = distS * uvRepeatPerMeter;
    uvs[(vi + 1) * 2] = 1;
    uvs[(vi + 1) * 2 + 1] = distS * uvRepeatPerMeter;

    if (i < count - 1) {
      const a = vi;
      const b = vi + 1;
      const c = vi + 2;
      const d = vi + 3;
      // Counter-clockwise winding facing +Y: (b-a) x (c-a) = (+X) x (-Z) = +Y
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

export function buildWorldRig(textures: ProceduralTextures): WorldRig {
  const disposables: { dispose: () => void }[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  const group = new THREE.Group();
  group.name = 'ProvingGroundsWorld';

  // 1. Rolling Outdoor Terrain
  const terrainGeo = trackGeo(new THREE.PlaneGeometry(460, 460, 88, 88));
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    // Keep track corridor flat at y=0, sculpt hills outside
    const h = getGroundHeightAt(x, z);
    posAttr.setY(i, Math.max(0, h));
  }
  terrainGeo.computeVertexNormals();

  const terrainMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.grassMap,
      roughness: 0.94,
      metalness: 0.0,
    })
  );
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // 2. Asphalt Circuit Ribbon (offset +0.03 above terrain to prevent Z-fighting)
  const asphaltGeo = trackGeo(buildRibbonGeometry(-TRACK_HALF_WIDTH, TRACK_HALF_WIDTH, 0.03, 0.075));
  const asphaltMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.asphaltMap,
      bumpMap: textures.asphaltBump,
      bumpScale: 0.015,
      roughness: 0.78,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const asphaltMesh = new THREE.Mesh(asphaltGeo, asphaltMat);
  asphaltMesh.receiveShadow = true;
  group.add(asphaltMesh);

  // 3. FIA Red/White Track Curbs
  const curbMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.curbMap,
      roughness: 0.72,
      metalness: 0.05,
    })
  );
  const leftCurbGeo = trackGeo(
    buildRibbonGeometry(-TRACK_HALF_WIDTH - 0.75, -TRACK_HALF_WIDTH + 0.05, 0.058, 0.35)
  );
  const rightCurbGeo = trackGeo(
    buildRibbonGeometry(TRACK_HALF_WIDTH - 0.05, TRACK_HALF_WIDTH + 0.75, 0.058, 0.35)
  );
  const leftCurb = new THREE.Mesh(leftCurbGeo, curbMat);
  const rightCurb = new THREE.Mesh(rightCurbGeo, curbMat);
  leftCurb.receiveShadow = true;
  rightCurb.receiveShadow = true;
  group.add(leftCurb, rightCurb);

  // 4. Start / Finish Checkered Line & Tall Overhead Timing Gantry (spawn focal landmark!)
  const startStripGeo = trackGeo(new THREE.PlaneGeometry(TRACK_HALF_WIDTH * 2 - 0.6, 2.6));
  startStripGeo.rotateX(-Math.PI / 2);
  const startStripMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.startLineMap,
      roughness: 0.65,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    })
  );
  const startStrip = new THREE.Mesh(startStripGeo, startStripMat);
  startStrip.position.set(0, 0.045, 0);
  startStrip.receiveShadow = true;
  group.add(startStrip);

  const gantryGroup = new THREE.Group();
  gantryGroup.position.set(0, 0, 0);
  const steelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.8,
      roughness: 0.32,
    })
  );
  const gantryAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x161b22,
      metalness: 0.25,
      roughness: 0.55,
    })
  );
  const gantryEmissiveMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.35,
      roughness: 0.2,
    })
  );
  const pillarGeo = trackGeo(new THREE.BoxGeometry(0.65, 6.8, 0.65));
  const leftPillar = new THREE.Mesh(pillarGeo, steelMat);
  leftPillar.position.set(-8.4, 3.4, 0);
  leftPillar.castShadow = true;
  const rightPillar = new THREE.Mesh(pillarGeo, steelMat);
  rightPillar.position.set(8.4, 3.4, 0);
  rightPillar.castShadow = true;
  const crossBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(17.6, 1.35, 0.85)), gantryAccentMat);
  crossBeam.position.set(0, 6.4, 0);
  crossBeam.castShadow = true;
  const lightStrip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(14.5, 0.24, 0.92)), gantryEmissiveMat);
  lightStrip.position.set(0, 6.4, 0);
  gantryGroup.add(leftPillar, rightPillar, crossBeam, lightStrip);
  group.add(gantryGroup);

  // 5. Driveable Launch Ramp & Speed Bumps (matching trackData.ts 1-to-1)
  const rampMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b4252,
      roughness: 0.58,
      metalness: 0.2,
    })
  );
  const rampStripeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.45,
      metalness: 0.1,
    })
  );

  for (const r of RAMP_FEATURES) {
    // Wedge profile along Z (entry at +length/2, lip at -length/2)
    const segs = 12;
    const shape = new THREE.Shape();
    shape.moveTo(-r.length * 0.5, 0);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const xLocal = -r.length * 0.5 + t * r.length;
      const yLocal = r.height * Math.pow(t, 1.35);
      shape.lineTo(xLocal, yLocal);
    }
    shape.lineTo(r.length * 0.5, 0);
    shape.closePath();

    const rampGeo = trackGeo(
      new THREE.ExtrudeGeometry(shape, {
        depth: r.halfWidth * 2,
        bevelEnabled: false,
      })
    );
    // Align shape +X with ramp travel dir (0, -1) -> rotateY(+PI/2)
    rampGeo.rotateY(Math.PI / 2);
    rampGeo.translate(-r.halfWidth, 0.025, 0);
    const rampMesh = new THREE.Mesh(rampGeo, rampMat);
    rampMesh.position.set(r.cx, 0, r.cz);
    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    group.add(rampMesh);

    // Warning chevron edge strips on ramp
    const edgeGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.05, r.length * 0.96));
    const leftEdge = new THREE.Mesh(edgeGeo, rampStripeMat);
    leftEdge.position.set(r.cx - r.halfWidth + 0.12, 0.52, r.cz);
    leftEdge.rotation.x = Math.atan2(r.height, r.length);
    const rightEdge = new THREE.Mesh(edgeGeo, rampStripeMat);
    rightEdge.position.set(r.cx + r.halfWidth - 0.12, 0.52, r.cz);
    rightEdge.rotation.x = Math.atan2(r.height, r.length);
    group.add(leftEdge, rightEdge);
  }

  for (const b of SPEED_BUMPS) {
    const bumpGeo = trackGeo(new THREE.CylinderGeometry(b.halfLength, b.halfLength, b.halfWidth * 2, 12, 1, false, 0, Math.PI));
    bumpGeo.rotateZ(Math.PI / 2);
    bumpGeo.scale(1, b.height / b.halfLength, 1);
    const bumpMesh = new THREE.Mesh(bumpGeo, rampStripeMat);
    bumpMesh.position.set(b.cx, 0.028, b.cz);
    bumpMesh.castShadow = true;
    bumpMesh.receiveShadow = true;
    group.add(bumpMesh);
  }

  // 6. Perimeter Guardrail Barriers (Instanced posts + continuous rail ribbon)
  const railMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.72,
      roughness: 0.36,
    })
  );
  const railOuterL = trackGeo(
    buildRibbonGeometry(-BARRIER_HALF_WIDTH - 0.45, -BARRIER_HALF_WIDTH - 0.30, 0.72, 0.25)
  );
  const railOuterR = trackGeo(
    buildRibbonGeometry(BARRIER_HALF_WIDTH + 0.30, BARRIER_HALF_WIDTH + 0.45, 0.72, 0.25)
  );
  // Extrude vertical wall thickness for barriers using simple instanced segments along samples
  const railSegGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.36, 1.0));
  const postGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.88, 0.14));
  const sampleCount = TRACK_SAMPLES.length;
  const railInst = new THREE.InstancedMesh(railSegGeo, railMat, sampleCount * 2);
  const postInst = new THREE.InstancedMesh(postGeo, steelMat, sampleCount * 2);
  railInst.castShadow = true;
  railInst.receiveShadow = true;

  const dummy = new THREE.Object3D();
  let idx = 0;
  for (let i = 0; i < TRACK_SAMPLES.length; i++) {
    const s = TRACK_SAMPLES[i];
    const next = TRACK_SAMPLES[(i + 1) % TRACK_SAMPLES.length];
    const yaw = Math.atan2(-s.tx, -s.tz);
    for (const side of [-1, 1]) {
      const dist = (BARRIER_HALF_WIDTH + 0.48) * side;
      const px = s.x + s.nx * dist;
      const pz = s.z + s.nz * dist;
      const nx = next.x + next.nx * dist;
      const nz = next.z + next.nz * dist;
      const segLen = Math.hypot(nx - px, nz - pz) + 0.18;
      const midX = (px + nx) * 0.5;
      const midZ = (pz + nz) * 0.5;
      const midY = getGroundHeightAt(midX, midZ);
      const segYaw = Math.atan2(-(nx - px), -(nz - pz));

      dummy.position.set(midX, midY + 0.56, midZ);
      dummy.rotation.set(0, segYaw, 0);
      dummy.scale.set(1, 1, segLen);
      dummy.updateMatrix();
      railInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(px, getGroundHeightAt(px, pz) + 0.44, pz);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      postInst.setMatrixAt(idx, dummy.matrix);
      idx++;
    }
  }
  railInst.instanceMatrix.needsUpdate = true;
  postInst.instanceMatrix.needsUpdate = true;
  railInst.computeBoundingSphere();
  postInst.computeBoundingSphere();
  group.add(railInst, postInst);
  // Dispose unused thin ribbon geos
  railOuterL.dispose();
  railOuterR.dispose();

  // 7. Pit Garage / Grandstand Structure beside Main Straight
  const paddockGroup = new THREE.Group();
  paddockGroup.position.set(-18.5, 0, 4);
  const concreteMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85, metalness: 0.05 })
  );
  const roofMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.4 })
  );
  const baseBlock = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.5, 4.4, 24)), concreteMat);
  baseBlock.position.y = 2.2;
  baseBlock.castShadow = true;
  baseBlock.receiveShadow = true;
  const canopy = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.5, 0.45, 25.5)), roofMat);
  canopy.position.set(1.2, 4.6, 0);
  canopy.castShadow = true;
  const stripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.2, 0.5, 24.2)), gantryEmissiveMat);
  stripe.position.set(4.35, 3.8, 0);
  paddockGroup.add(baseBlock, canopy, stripe);
  group.add(paddockGroup);

  // 8. Instanced Pine / Cypress Trees around the Proving Grounds (±15% scale + tint variation)
  const treeCount = 150;
  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.28, 1.8, 7));
  const crownGeo = trackGeo(new THREE.ConeGeometry(1.55, 5.2, 8));
  const trunkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.92 }));
  const crownMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84 }));

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crownInst = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
  crownInst.castShadow = true;
  crownInst.receiveShadow = true;

  const colorTmp = new THREE.Color();
  let placed = 0;
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  while (placed < treeCount) {
    const angle = rand() * Math.PI * 2;
    const radius = 24 + rand() * 165;
    const tx = 40 + Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;

    // Ensure outside track + barrier + paddock
    let tooClose = Math.abs(tx + 18.5) < 12 && Math.abs(tz - 4) < 18;
    if (!tooClose) {
      for (let i = 0; i < TRACK_SAMPLES.length; i += 3) {
        const s = TRACK_SAMPLES[i];
        if ((tx - s.x) ** 2 + (tz - s.z) ** 2 < 17 * 17) {
          tooClose = true;
          break;
        }
      }
    }
    if (tooClose) continue;

    const ty = getGroundHeightAt(tx, tz);
    const sc = 0.85 + rand() * 0.35; // ±15% natural scale variation

    dummy.position.set(tx, ty + 0.9 * sc, tz);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(placed, dummy.matrix);

    dummy.position.set(tx, ty + 3.9 * sc, tz);
    dummy.updateMatrix();
    crownInst.setMatrixAt(placed, dummy.matrix);

    colorTmp.setHSL(0.28 + (rand() - 0.5) * 0.05, 0.42 + rand() * 0.14, 0.24 + rand() * 0.12);
    crownInst.setColorAt(placed, colorTmp);
    placed++;
  }
  trunkInst.instanceMatrix.needsUpdate = true;
  crownInst.instanceMatrix.needsUpdate = true;
  if (crownInst.instanceColor) crownInst.instanceColor.needsUpdate = true;
  trunkInst.computeBoundingSphere();
  crownInst.computeBoundingSphere();
  group.add(trunkInst, crownInst);

  // 9. Distant Mountain Ridge Ring (blends smoothly into horizon fog)
  const ridgeGeo = trackGeo(new THREE.CylinderGeometry(205, 225, 24, 36, 1, true));
  const ridgePos = ridgeGeo.attributes.position;
  for (let i = 0; i < ridgePos.count; i++) {
    if (ridgePos.getY(i) > 0) {
      const x = ridgePos.getX(i);
      const z = ridgePos.getZ(i);
      const ang = Math.atan2(z, x);
      const peak = 10 + Math.sin(ang * 7) * 7 + Math.cos(ang * 13) * 4;
      ridgePos.setY(i, peak);
    } else {
      ridgePos.setY(i, -2);
    }
  }
  ridgeGeo.computeVertexNormals();
  const ridgeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x62788d,
      roughness: 0.95,
      side: THREE.BackSide,
    })
  );
  const ridgeMesh = new THREE.Mesh(ridgeGeo, ridgeMat);
  ridgeMesh.position.set(35, 0, 0);
  group.add(ridgeMesh);

  // 10. Dynamic Slalom Cones
  const coneGroups: THREE.Group[] = [];
  const coneBodyGeo = trackGeo(new THREE.ConeGeometry(0.22, 0.62, 12));
  const coneBaseGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.05, 0.42));
  const coneBandGeo = trackGeo(new THREE.CylinderGeometry(0.115, 0.155, 0.14, 12, 1, true));
  const coneOrangeMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.55 }));
  const coneWhiteMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 }));
  const coneBaseMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 }));

  const ensureConeMeshes = (count: number) => {
    while (coneGroups.length < count) {
      const cg = new THREE.Group();
      const base = new THREE.Mesh(coneBaseGeo, coneBaseMat);
      base.position.y = 0.025;
      const body = new THREE.Mesh(coneBodyGeo, coneOrangeMat);
      body.position.y = 0.34;
      body.castShadow = true;
      const band = new THREE.Mesh(coneBandGeo, coneWhiteMat);
      band.position.y = 0.36;
      cg.add(base, body, band);
      group.add(cg);
      coneGroups.push(cg);
    }
  };

  return {
    group,
    syncCones: (cones: ConeObstacle[]) => {
      ensureConeMeshes(cones.length);
      for (let i = 0; i < cones.length; i++) {
        const c = cones[i];
        const m = coneGroups[i];
        m.position.set(c.x, 0.025, c.z);
        m.rotation.set(c.tiltX, 0, c.tiltZ);
      }
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
