import * as THREE from 'three';
import { ProceduralTextures } from './proceduralTextures';

export interface CarRig {
  root: THREE.Group;
  chassis: THREE.Group;
  contactShadow: THREE.Mesh;
  steeringWheel: THREE.Group;
  wheelMounts: [THREE.Group, THREE.Group, THREE.Group, THREE.Group]; // FL, FR, RL, RR
  wheelSpins: [THREE.Group, THREE.Group, THREE.Group, THREE.Group];
  brakeLightMat: THREE.MeshStandardMaterial;
  reverseLightMat: THREE.MeshStandardMaterial;
  paintMaterial: THREE.MeshPhysicalMaterial;
  cockpitHeadAnchor: THREE.Object3D;
  hoodCamAnchor: THREE.Object3D;
  setPaintColor: (hex: string) => void;
  updateVisuals: (params: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    roll: number;
    steerAngle: number;
    wheelSpin: number;
    wheelCompressions: [number, number, number, number];
    braking: boolean;
    reversing: boolean;
    grounded: boolean;
  }) => void;
  dispose: () => void;
}

export const CAR_PAINT_SWATCHES = [
  { id: 'rosso', label: 'Красный', hex: '#d41e24' },
  { id: 'amber', label: 'Янтарный', hex: '#f06a00' },
  { id: 'cobalt', label: 'Кобальт', hex: '#1d5be0' },
  { id: 'slate', label: 'Графит', hex: '#48515e' },
  { id: 'emerald', label: 'Изумруд', hex: '#168a5c' },
] as const;

/**
 * Builds a sleek lofted surface between cross-sectional profiles along Z.
 */
function buildStreamlinedSectionGeometry(
  sections: {
    z: number;
    wBot: number;
    wMid: number;
    wTop: number;
    yBot: number;
    yMid: number;
    yTop: number;
    crown: number;
  }[]
): THREE.BufferGeometry {
  const ringPts = 9;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let s = 0; s < sections.length; s++) {
    const sec = sections[s];
    const pts: [number, number][] = [
      [-sec.wBot, sec.yBot],
      [-sec.wMid, sec.yMid],
      [-sec.wTop, sec.yTop],
      [-sec.wTop * 0.48, sec.yTop + sec.crown * 0.78],
      [0, sec.yTop + sec.crown],
      [sec.wTop * 0.48, sec.yTop + sec.crown * 0.78],
      [sec.wTop, sec.yTop],
      [sec.wMid, sec.yMid],
      [sec.wBot, sec.yBot],
    ];

    const v = s / Math.max(1, sections.length - 1);
    for (let p = 0; p < ringPts; p++) {
      const [px, py] = pts[p];
      positions.push(px, py, sec.z);
      uvs.push(p / (ringPts - 1), v);
    }
  }

  for (let s = 0; s < sections.length - 1; s++) {
    for (let p = 0; p < ringPts - 1; p++) {
      const a = s * ringPts + p;
      const b = s * ringPts + p + 1;
      const c = (s + 1) * ringPts + p;
      const d = (s + 1) * ringPts + p + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a slightly curved glass panel directly from its 4 exact corner points
 * so the glass always sits 100% flush with pillars, roof, and body cowl.
 */
function buildCurvedGlassGeometry(
  topLeft: [number, number, number],
  topRight: [number, number, number],
  botRight: [number, number, number],
  botLeft: [number, number, number],
  bowX = 0,
  bowY = 0.014,
  bowZ = 0,
  flipNormal = false
): THREE.BufferGeometry {
  const cols = 6;
  const rows = 4;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rows; r++) {
    const v = r / rows; // 0 = bottom, 1 = top
    for (let c = 0; c <= cols; c++) {
      const u = c / cols; // 0 = left, 1 = right
      const bx = botLeft[0] * (1 - u) + botRight[0] * u;
      const by = botLeft[1] * (1 - u) + botRight[1] * u;
      const bz = botLeft[2] * (1 - u) + botRight[2] * u;

      const tx = topLeft[0] * (1 - u) + topRight[0] * u;
      const ty = topLeft[1] * (1 - u) + topRight[1] * u;
      const tz = topLeft[2] * (1 - u) + topRight[2] * u;

      const arch = Math.sin(u * Math.PI) * Math.sin(v * Math.PI * 0.85 + 0.15);
      const x = bx * (1 - v) + tx * v + bowX * arch;
      const y = by * (1 - v) + ty * v + bowY * arch;
      const z = bz * (1 - v) + tz * v + bowZ * arch;

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = a + 1;
      const d = (r + 1) * (cols + 1) + c;
      const e = d + 1;
      if (flipNormal) {
        indices.push(a, d, b);
        indices.push(b, d, e);
      } else {
        indices.push(a, b, d);
        indices.push(b, e, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function buildCarRig(
  textures: ProceduralTextures,
  isSoftwareGl: boolean,
  initialColorHex = '#d41e24'
): CarRig {
  const disposables: { dispose: () => void }[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  const root = new THREE.Group();
  root.name = 'PlayerCarRoot';

  const shadowGeo = trackGeo(new THREE.PlaneGeometry(2.75, 5.25));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadowMap,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
    })
  );
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.024;
  contactShadow.renderOrder = 1;
  root.add(contactShadow);

  const chassis = new THREE.Group();
  chassis.name = 'CarChassis';
  root.add(chassis);

  const paintMaterial = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(initialColorHex),
      metalness: 0.62,
      roughness: 0.19,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      side: THREE.DoubleSide,
    })
  );

  const carbonMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x161a20,
      metalness: 0.24,
      roughness: 0.48,
    })
  );

  const darkTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0e1116,
      metalness: 0.14,
      roughness: 0.84,
      side: THREE.DoubleSide,
    })
  );

  const interiorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x181c23,
      metalness: 0.05,
      roughness: 0.9,
    })
  );

  const chromeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdce4ee,
      metalness: 0.94,
      roughness: 0.14,
    })
  );

  const rimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd0d8e2,
      metalness: 0.90,
      roughness: 0.18,
    })
  );

  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x16181c,
      metalness: 0.04,
      roughness: 0.86,
    })
  );

  const caliperMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe11d48,
      metalness: 0.36,
      roughness: 0.32,
    })
  );

  const engineCoverMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      metalness: 0.55,
      roughness: 0.30,
    })
  );

  const glassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x162433,
      metalness: 0.24,
      roughness: 0.04,
      transparent: true,
      opacity: isSoftwareGl ? 0.44 : 0.48,
      depthWrite: false,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      envMapIntensity: 1.75,
      side: THREE.DoubleSide,
    })
  );

  const windshieldMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x223b52,
      metalness: 0.18,
      roughness: 0.04,
      transparent: true,
      opacity: isSoftwareGl ? 0.24 : 0.28,
      depthWrite: false,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      envMapIntensity: 1.7,
      side: THREE.DoubleSide,
    })
  );

  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff7e6,
      emissiveIntensity: 2.1,
      roughness: 0.06,
      metalness: 0.1,
    })
  );

  const brakeLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      emissive: 0xef4444,
      emissiveIntensity: 0.85,
      roughness: 0.16,
    })
  );

  const reverseLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      emissive: 0xffffff,
      emissiveIntensity: 0.0,
      roughness: 0.2,
    })
  );

  const gaugeMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.gaugeClusterMap,
      emissiveMap: textures.gaugeClusterMap,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.72,
      roughness: 0.24,
    })
  );

  const addMesh = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: [number, number, number] = [0, 0, 0],
    rot: [number, number, number] = [0, 0, 0],
    castShadow = true
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  const addStrut = (
    p1: [number, number, number],
    p2: [number, number, number],
    w: number,
    h: number,
    mat: THREE.Material
  ) => {
    const v1 = new THREE.Vector3(p1[0], p1[1], p1[2]);
    const v2 = new THREE.Vector3(p2[0], p2[1], p2[2]);
    const dir = new THREE.Vector3().subVectors(v2, v1);
    const len = dir.length();
    const strut = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, h, len)), mat);
    strut.position.addVectors(v1, v2).multiplyScalar(0.5);
    strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
    strut.castShadow = true;
    strut.receiveShadow = true;
    chassis.add(strut);
    return strut;
  };

  // --- 1. LAMBORGHINI-INSPIRED LOW CAB-FORWARD WEDGE BODY ---
  // Wheel layout:
  //   Front: x = ±0.81, y = 0.33, z = -1.30 (radius 0.33 -> static top 0.66m; steered inner sweep >= 0.51m)
  //   Rear:  x = ±0.82, y = 0.33, z = +1.42 (wider rear track, inner edge 0.695m)
  // Strict clearance: front lower chassis tub <= 0.46m, rear lower tub <= 0.60m.

  // Underbody flat floor pan (narrow front tray clears steered tires; wide cabin floor behind front wheels)
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.90, 0.055, 1.48)), darkTrimMat, [0, 0.185, -1.58]);
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(1.18, 0.06, 2.94)), darkTrimMat, [0, 0.185, 0.60]);

  // Razor-Low Pointed Nose & Smooth Wedge Front Hood (-2.38 .. -1.04)
  // Unified across full width above wheel arches so hood + front fenders are one sleek wedge with zero ridges!
  const frontShellGeo = trackGeo(
    buildStreamlinedSectionGeometry([
      { z: -2.38, wBot: 0.46, wMid: 0.58, wTop: 0.46, yBot: 0.18, yMid: 0.29, yTop: 0.35, crown: 0.020 },
      { z: -2.14, wBot: 0.72, wMid: 0.86, wTop: 0.74, yBot: 0.18, yMid: 0.36, yTop: 0.43, crown: 0.024 },
      { z: -1.88, wBot: 0.50, wMid: 0.54, wTop: 0.83, yBot: 0.19, yMid: 0.46, yTop: 0.50, crown: 0.026 },
      { z: -1.60, wBot: 0.46, wMid: 0.46, wTop: 0.84, yBot: 0.19, yMid: 0.62, yTop: 0.66, crown: 0.026 },
      { z: -1.30, wBot: 0.46, wMid: 0.46, wTop: 0.85, yBot: 0.19, yMid: 0.72, yTop: 0.750, crown: 0.024 },
      { z: -1.04, wBot: 0.47, wMid: 0.68, wTop: 0.85, yBot: 0.19, yMid: 0.73, yTop: 0.760, crown: 0.022 },
    ])
  );
  addMesh(chassis, frontShellGeo, paintMaterial);

  // Sharp Pointed Lamborghini Carbon Front Splitter & Cheek Winglets
  const splitterShape = new THREE.Shape();
  splitterShape.moveTo(-0.88, -1.96);
  splitterShape.lineTo(-0.68, -2.35);
  splitterShape.lineTo(0, -2.45); // pointed V-nose tip
  splitterShape.lineTo(0.68, -2.35);
  splitterShape.lineTo(0.88, -1.96);
  splitterShape.lineTo(0.82, -1.90);
  splitterShape.lineTo(-0.82, -1.90);
  splitterShape.closePath();

  const splitterGeo = trackGeo(
    new THREE.ExtrudeGeometry(splitterShape, {
      depth: 0.028,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.008,
      bevelSegments: 1,
    })
  );
  splitterGeo.rotateX(Math.PI / 2);
  addMesh(chassis, splitterGeo, carbonMat, [0, 0.185, 0]);
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.028, 0.095, 0.24)), carbonMat, [-0.88, 0.22, -2.06]);
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.028, 0.095, 0.24)), carbonMat, [0.88, 0.22, -2.06]);

  // Twin Angular Lamborghini Front Air Intakes + Central Y-Bridge
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.56, 0.12, 0.12)), darkTrimMat, [-0.46, 0.26, -2.26], [0.06, -0.22, 0]);
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.56, 0.12, 0.12)), darkTrimMat, [0.46, 0.26, -2.26], [0.06, 0.22, 0]);
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.18, 0.15, 0.16)), paintMaterial, [0, 0.27, -2.32], [0.20, 0, 0]);

  // Sculpted Side Flanks with Aggressive Rising Wedge Beltline & FULL Wheel-Well Cutouts
  // NOTE: rotateY(-Math.PI / 2) maps shape +X -> world +Z and shape +Z_depth -> world -X
  const flankShape = new THREE.Shape();
  flankShape.moveTo(-1.92, 0.19);
  flankShape.lineTo(-1.70, 0.19);
  // Front arch cutout: radius 0.415 -> inner clear 0.395 (top = 0.725m over 0.66m tire)
  flankShape.absarc(-1.30, 0.33, 0.415, Math.PI, 0, true);
  flankShape.lineTo(1.00, 0.19);
  // Rear arch cutout: radius 0.425 -> inner clear 0.405 (top = 0.735m over 0.66m tire)
  flankShape.absarc(1.42, 0.33, 0.425, Math.PI, 0, true);
  flankShape.lineTo(2.12, 0.28);
  flankShape.lineTo(2.20, 0.75); // sharp angular Lamborghini tail corner
  flankShape.lineTo(1.42, 0.855); // muscular rear haunch peak
  flankShape.lineTo(0.62, 0.815); // sharp wedge shoulder
  flankShape.lineTo(-1.04, 0.745); // cab-forward cowl
  flankShape.quadraticCurveTo(-1.26, 0.745, -1.42, 0.720);
  flankShape.lineTo(-1.92, 0.48); // low pointed front fender
  flankShape.closePath();

  const flankGeo = trackGeo(
    new THREE.ExtrudeGeometry(flankShape, {
      depth: 0.15,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
    })
  );
  flankGeo.rotateY(-Math.PI / 2);
  // Depth [-0.02..+0.17] -> x [-0.17..+0.02]
  // Placing at x=-0.73 spans [-0.90..-0.71]; at x=+0.88 spans [+0.71..+0.90] (wide 1.80m+ supercar track!)
  addMesh(chassis, flankGeo, paintMaterial, [-0.73, 0, 0]);
  addMesh(chassis, flankGeo, paintMaterial, [0.88, 0, 0]);

  // Tucked Open-Ended Wheel-Well Liners (never poke through painted arches)
  const archTunnelGeo = trackGeo(
    new THREE.CylinderGeometry(0.388, 0.388, 0.20, 20, 1, true, 0, Math.PI)
  );
  archTunnelGeo.rotateZ(Math.PI / 2);
  addMesh(chassis, archTunnelGeo, darkTrimMat, [-0.75, 0.33, -1.30], [0, 0, 0], false);
  addMesh(chassis, archTunnelGeo, darkTrimMat, [0.75, 0.33, -1.30], [0, 0, 0], false);
  addMesh(chassis, archTunnelGeo, darkTrimMat, [-0.75, 0.33, 1.42], [0, 0, 0], false);
  addMesh(chassis, archTunnelGeo, darkTrimMat, [0.75, 0.33, 1.42], [0, 0, 0], false);

  // Signature Lamborghini Side Skirt Carbon Blades + Upturned Rear Aero Winglets
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.11, 0.042, 1.80)), carbonMat, [-0.90, 0.17, 0.08]);
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.11, 0.042, 1.80)), carbonMat, [0.90, 0.17, 0.08]);
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.03, 0.16, 0.24)), carbonMat, [-0.94, 0.24, 0.86], [0.25, 0, 0]);
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.03, 0.16, 0.24)), carbonMat, [0.94, 0.24, 0.86], [0.25, 0, 0]);

  // Signature Angular Side Air Intake Scoops ahead of Rear Haunches (tapered aero vane + tucked dark duct)
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.032, 0.26, 0.40)), darkTrimMat, [-0.882, 0.56, 0.73], [-0.12, -0.06, -0.04], false);
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.032, 0.26, 0.40)), darkTrimMat, [0.882, 0.56, 0.73], [-0.12, 0.06, 0.04], false);
  addStrut([-0.915, 0.41, 0.82], [-0.905, 0.73, 0.94], 0.032, 0.11, paintMaterial);
  addStrut([0.915, 0.41, 0.82], [0.905, 0.73, 0.94], 0.032, 0.11, paintMaterial);

  // Mid-Engine Rear Decklid & Muscular Rear Haunches (+0.62 .. +2.20)
  // Leaves recessed center engine bay pocket at z = 0.58 .. 1.66 (y = 0.73) for visible V12 + louvers!
  const rearShellGeo = trackGeo(
    buildStreamlinedSectionGeometry([
      { z: 0.62, wBot: 0.60, wMid: 0.68, wTop: 0.84, yBot: 0.19, yMid: 0.56, yTop: 0.815, crown: -0.02 },
      { z: 1.42, wBot: 0.60, wMid: 0.60, wTop: 0.86, yBot: 0.20, yMid: 0.71, yTop: 0.850, crown: -0.04 },
      { z: 1.84, wBot: 0.68, wMid: 0.82, wTop: 0.83, yBot: 0.24, yMid: 0.64, yTop: 0.805, crown: 0.012 },
      { z: 2.20, wBot: 0.72, wMid: 0.86, wTop: 0.78, yBot: 0.30, yMid: 0.56, yTop: 0.760, crown: 0.015 },
    ])
  );
  addMesh(chassis, rearShellGeo, paintMaterial);

  // --- 2. LOW CAB-FORWARD ROOF, FLYING BUTTRESSES & VISIBLE V12 ENGINE BAY ---
  // Arched Low Supercar Roof (total height 1.145m!)
  const roofShellGeo = trackGeo(
    buildStreamlinedSectionGeometry([
      { z: -0.22, wBot: 0.58, wMid: 0.57, wTop: 0.52, yBot: 1.115, yMid: 1.128, yTop: 1.132, crown: 0.020 },
      { z: 0.10, wBot: 0.60, wMid: 0.59, wTop: 0.54, yBot: 1.125, yMid: 1.138, yTop: 1.142, crown: 0.024 },
      { z: 0.42, wBot: 0.58, wMid: 0.57, wTop: 0.52, yBot: 1.105, yMid: 1.118, yTop: 1.122, crown: 0.018 },
    ])
  );
  addMesh(chassis, roofShellGeo, paintMaterial);
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.76, 0.018, 0.56)), carbonMat, [0, 1.150, 0.10], [0, 0, 0], false);

  // Pillar Endpoints (steep ~23 deg Lamborghini cab-forward windshield!)
  const aBotL: [number, number, number] = [-0.77, 0.750, -1.04];
  const aBotR: [number, number, number] = [0.77, 0.750, -1.04];
  const aTopL: [number, number, number] = [-0.57, 1.125, -0.22];
  const aTopR: [number, number, number] = [0.57, 1.125, -0.22];

  const bBotL: [number, number, number] = [-0.80, 0.795, 0.28];
  const bBotR: [number, number, number] = [0.80, 0.795, 0.28];
  const bTopL: [number, number, number] = [-0.59, 1.132, 0.28];
  const bTopR: [number, number, number] = [0.59, 1.132, 0.28];

  const cTopL: [number, number, number] = [-0.57, 1.115, 0.42];
  const cTopR: [number, number, number] = [0.57, 1.115, 0.42];
  // Flying-buttress sail pillars sweeping to the rear haunches
  const cBotL: [number, number, number] = [-0.73, 0.815, 1.76];
  const cBotR: [number, number, number] = [0.73, 0.815, 1.76];

  addStrut(aBotL, aTopL, 0.042, 0.042, carbonMat);
  addStrut(aBotR, aTopR, 0.042, 0.042, carbonMat);
  addStrut(bBotL, bTopL, 0.036, 0.055, carbonMat);
  addStrut(bBotR, bTopR, 0.036, 0.055, carbonMat);
  addStrut(cBotL, cTopL, 0.095, 0.055, paintMaterial);
  addStrut(cBotR, cTopR, 0.095, 0.055, paintMaterial);
  addStrut(aTopL, cTopL, 0.038, 0.030, paintMaterial);
  addStrut(aTopR, cTopR, 0.038, 0.030, paintMaterial);

  // Flush Steep-Raked Windshield
  const windshield = addMesh(
    chassis,
    trackGeo(buildCurvedGlassGeometry(aTopL, aTopR, aBotR, aBotL, 0, 0.015, -0.022, true)),
    windshieldMat,
    [0, 0, 0],
    [0, 0, 0],
    false
  );
  windshield.renderOrder = 4;

  // Visible Mid-Engine V12 Bay (twin red cylinder banks + polished X-brace + carbon louvers!)
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.92, 0.08, 1.06)), darkTrimMat, [0, 0.72, 1.12], [0, 0, 0], false);
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.20, 0.08, 0.82)), engineCoverMat, [-0.24, 0.78, 1.12], [0, 0, -0.22], false);
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.20, 0.08, 0.82)), engineCoverMat, [0.24, 0.78, 1.12], [0, 0, 0.22], false);
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.18, 0.09, 0.84)), carbonMat, [0, 0.80, 1.12], [0, 0, 0], false);
  // Signature Forged X-Brace over V12 bay
  addStrut([-0.34, 0.85, 0.74], [0.34, 0.84, 1.50], 0.028, 0.024, chromeMat);
  addStrut([0.34, 0.85, 0.74], [-0.34, 0.84, 1.50], 0.028, 0.024, chromeMat);

  // Angled Aventador-Style Carbon Rear Engine Louvers (4 slats sloping along the rear window plane)
  for (let i = 0; i < 4; i++) {
    const t = 0.20 + i * 0.20;
    const lz = 0.42 * (1 - t) + 1.76 * t;
    const ly = 1.115 * (1 - t) + 0.815 * t;
    const lw = 1.02 + t * 0.14;
    addMesh(chassis, trackGeo(new THREE.BoxGeometry(lw, 0.020, 0.11)), carbonMat, [0, ly, lz], [0.16, 0, 0]);
  }

  // Tinted Rear Fastback Glass Engine Cover
  const rearGlass = addMesh(
    chassis,
    trackGeo(buildCurvedGlassGeometry(cTopL, cTopR, cBotR, cBotL, 0, 0.015, 0.020, false)),
    glassMat,
    [0, 0, 0],
    [0, 0, 0],
    false
  );
  rearGlass.renderOrder = 4;

  // Flush Side Door & Quarter Windows
  const sideWinLFront = addMesh(
    chassis,
    trackGeo(buildCurvedGlassGeometry(aTopL, bTopL, bBotL, aBotL, -0.012, 0, 0, false)),
    glassMat,
    [0, 0, 0],
    [0, 0, 0],
    false
  );
  const sideWinRFront = addMesh(
    chassis,
    trackGeo(buildCurvedGlassGeometry(bTopR, aTopR, aBotR, bBotR, 0.012, 0, 0, false)),
    glassMat,
    [0, 0, 0],
    [0, 0, 0],
    false
  );
  const sideWinLRear = addMesh(
    chassis,
    trackGeo(buildCurvedGlassGeometry(bTopL, cTopL, [-0.80, 0.81, 0.62], bBotL, -0.010, 0, 0, false)),
    glassMat,
    [0, 0, 0],
    [0, 0, 0],
    false
  );
  const sideWinRRear = addMesh(
    chassis,
    trackGeo(buildCurvedGlassGeometry(cTopR, bTopR, bBotR, [0.80, 0.81, 0.62], 0.010, 0, 0, false)),
    glassMat,
    [0, 0, 0],
    [0, 0, 0],
    false
  );
  sideWinLFront.renderOrder = 4;
  sideWinRFront.renderOrder = 4;
  sideWinLRear.renderOrder = 4;
  sideWinRRear.renderOrder = 4;

  // --- 3. AGGRESSIVE REAR DIFFUSER, HONEYCOMB FASCIA & SVJ SWAN-NECK WING ---
  // Wide recessed matte-black hexagonal rear mesh fascia
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(1.56, 0.32, 0.08)), darkTrimMat, [0, 0.49, 2.18]);

  // Multi-Fin Ground-Effect Rear Diffuser
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(1.62, 0.09, 0.28)), carbonMat, [0, 0.20, 2.12]);
  for (const fx of [-0.56, -0.34, -0.11, 0.11, 0.34, 0.56]) {
    addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.028, 0.15, 0.26)), carbonMat, [fx, 0.22, 2.15], [-0.18, 0, 0]);
  }

  // Central High-Mounted Quad Hexagonal Titanium Exhaust Tips (Huracan Performante / SVJ signature)
  const exhaustGeo = trackGeo(new THREE.CylinderGeometry(0.048, 0.048, 0.16, 6));
  exhaustGeo.rotateX(Math.PI / 2);
  const boreGeo = trackGeo(new THREE.CylinderGeometry(0.036, 0.036, 0.17, 6));
  boreGeo.rotateX(Math.PI / 2);
  for (const ex of [-0.24, -0.11, 0.11, 0.24]) {
    addMesh(chassis, exhaustGeo, chromeMat, [ex, 0.39, 2.18]);
    addMesh(chassis, boreGeo, darkTrimMat, [ex, 0.39, 2.185], [0, 0, 0], false);
  }

  // Swan-Neck SVJ Carbon Rear Wing anchored cleanly into the rear decklid
  const pylonShape = new THREE.Shape();
  pylonShape.moveTo(-0.18, 0.72);
  pylonShape.lineTo(0.08, 0.72);
  pylonShape.lineTo(0.02, 0.99);
  pylonShape.quadraticCurveTo(-0.02, 1.09, -0.18, 1.07);
  pylonShape.lineTo(-0.28, 1.04);
  pylonShape.lineTo(-0.28, 1.00);
  pylonShape.lineTo(-0.14, 1.00);
  pylonShape.quadraticCurveTo(-0.10, 0.92, -0.18, 0.72);
  pylonShape.closePath();

  const pylonGeo = trackGeo(
    new THREE.ExtrudeGeometry(pylonShape, {
      depth: 0.034,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 2,
    })
  );
  pylonGeo.rotateY(Math.PI / 2);
  addMesh(chassis, pylonGeo, carbonMat, [-0.44, 0, 1.88]);
  addMesh(chassis, pylonGeo, carbonMat, [0.406, 0, 1.88]);

  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.09, 0.04, 0.28)), darkTrimMat, [-0.423, 0.81, 1.93]);
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.09, 0.04, 0.28)), darkTrimMat, [0.423, 0.81, 1.93]);

  const wingSection = new THREE.Shape();
  wingSection.moveTo(-0.16, 0.018);
  wingSection.quadraticCurveTo(0.0, 0.044, 0.17, 0.0);
  wingSection.quadraticCurveTo(0.0, -0.008, -0.16, 0.018);
  wingSection.closePath();

  const wingBladeGeo = trackGeo(
    new THREE.ExtrudeGeometry(wingSection, {
      depth: 1.74,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 2,
    })
  );
  wingBladeGeo.rotateY(Math.PI / 2);
  wingBladeGeo.translate(-0.87, 0, 0);
  addMesh(chassis, wingBladeGeo, carbonMat, [0, 1.015, 2.06], [-0.07, 0, 0]);

  const endplateShape = new THREE.Shape();
  endplateShape.moveTo(-0.22, -0.06);
  endplateShape.lineTo(0.20, -0.04);
  endplateShape.lineTo(0.22, 0.10);
  endplateShape.lineTo(-0.18, 0.08);
  endplateShape.closePath();
  const endplateGeo = trackGeo(
    new THREE.ExtrudeGeometry(endplateShape, {
      depth: 0.022,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.005,
      bevelSegments: 1,
    })
  );
  endplateGeo.rotateY(Math.PI / 2);
  addMesh(chassis, endplateGeo, paintMaterial, [-0.885, 1.02, 2.06]);
  addMesh(chassis, endplateGeo, paintMaterial, [0.863, 1.02, 2.06]);

  // --- 4. SIGNATURE Y-SHAPED LED HEADLIGHTS, Y-TAILLIGHTS & AERO MIRRORS ---
  // Front Y-shaped Lamborghini LED DRL Headlights
  for (const side of [-1, 1] as const) {
    // Dark recessed housing along sloped front fender
    addMesh(
      chassis,
      trackGeo(new THREE.BoxGeometry(0.30, 0.055, 0.18)),
      darkTrimMat,
      [side * 0.60, 0.41, -2.14],
      [0.24, side * -0.30, side * 0.10],
      false
    );
    // Main horizontal DRL spear
    addMesh(
      chassis,
      trackGeo(new THREE.BoxGeometry(0.24, 0.020, 0.036)),
      headlightMat,
      [side * 0.61, 0.42, -2.19],
      [0.24, side * -0.30, side * 0.10],
      false
    );
    // Inner Y-fork arms (seated flush in sloped nose bezel)
    addMesh(
      chassis,
      trackGeo(new THREE.BoxGeometry(0.11, 0.018, 0.032)),
      headlightMat,
      [side * 0.50, 0.412, -2.215],
      [0.22, side * -0.10, side * 0.32],
      false
    );
    addMesh(
      chassis,
      trackGeo(new THREE.BoxGeometry(0.11, 0.018, 0.032)),
      headlightMat,
      [side * 0.50, 0.382, -2.22],
      [0.22, side * -0.10, side * -0.28],
      false
    );
  }

  // Signature Rear Y-Shaped LED Taillights + Reverse Strip
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(1.56, 0.095, 0.045)), darkTrimMat, [0, 0.67, 2.20], [0, 0, 0], false);
  for (const side of [-1, 1] as const) {
    // Outer main taillight bar
    addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.34, 0.026, 0.036)), brakeLightMat, [side * 0.54, 0.675, 2.22], [0, 0, 0], false);
    // Signature Y-branches pointing inward
    addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.14, 0.022, 0.036)), brakeLightMat, [side * 0.36, 0.695, 2.22], [0, 0, side * -0.34], false);
    addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.14, 0.022, 0.036)), brakeLightMat, [side * 0.36, 0.655, 2.22], [0, 0, side * 0.34], false);
  }
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.24, 0.020, 0.035)), reverseLightMat, [0, 0.675, 2.22], [0, 0, 0], false);

  // Razor-sharp Angular Side Mirrors
  addStrut([-0.84, 0.755, -0.74], [-0.99, 0.835, -0.68], 0.028, 0.028, carbonMat);
  addStrut([0.84, 0.755, -0.74], [0.99, 0.835, -0.68], 0.028, 0.028, carbonMat);
  const mirrorHousingGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.064, 0.11));
  addMesh(chassis, mirrorHousingGeo, paintMaterial, [-1.01, 0.84, -0.67], [0, -0.22, 0.06]);
  addMesh(chassis, mirrorHousingGeo, paintMaterial, [1.01, 0.84, -0.67], [0, 0.22, -0.06]);

  // --- 5. ENCLOSED 1ST-PERSON SUPERCAR COCKPIT (ZERO GAPS, CLEAR WINDSHIELD VIEW) ---
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(1.54, 0.21, 0.52)), interiorMat, [0, 0.64, -0.74], [0, 0, 0], false);
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.06, 0.52, 1.66)), interiorMat, [-0.73, 0.49, -0.08], [0, 0, 0], false);
  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.06, 0.52, 1.66)), interiorMat, [0.73, 0.49, -0.08], [0, 0, 0], false);

  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.42, 0.12, 0.18)), interiorMat, [-0.35, 0.78, -0.58], [0, 0, 0], false);
  addMesh(chassis, trackGeo(new THREE.PlaneGeometry(0.36, 0.115)), gaugeMat, [-0.35, 0.77, -0.485], [-0.14, 0, 0], false);

  addMesh(chassis, trackGeo(new THREE.BoxGeometry(0.24, 0.22, 1.02)), interiorMat, [0, 0.40, -0.20], [0, 0, 0], false);
  addMesh(chassis, trackGeo(new THREE.CylinderGeometry(0.015, 0.02, 0.13, 10)), chromeMat, [0, 0.57, -0.28], [-0.15, 0, 0], false);
  addMesh(chassis, trackGeo(new THREE.SphereGeometry(0.030, 12, 10)), caliperMat, [0, 0.635, -0.29], [0, 0, 0], false);

  const seatBackGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.56, 0.11));
  addMesh(chassis, seatBackGeo, interiorMat, [-0.35, 0.71, 0.26], [-0.20, 0, 0], false);
  addMesh(chassis, seatBackGeo, interiorMat, [0.35, 0.71, 0.26], [-0.20, 0, 0], false);

  addMesh(chassis, trackGeo(new THREE.CylinderGeometry(0.036, 0.044, 0.24, 12)), darkTrimMat, [-0.35, 0.74, -0.45], [Math.PI / 2 - 0.28, 0, 0], false);
  const steeringWheel = new THREE.Group();
  steeringWheel.position.set(-0.35, 0.79, -0.34);
  steeringWheel.rotation.x = -0.28;
  chassis.add(steeringWheel);

  const wheelRimMesh = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.145, 0.019, 10, 28)), darkTrimMat);
  steeringWheel.add(wheelRimMesh);
  const stripeMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.023, 0.023, 0.038, 12)),
    caliperMat
  );
  stripeMesh.rotation.z = Math.PI / 2;
  stripeMesh.position.set(0, 0.145, 0);
  steeringWheel.add(stripeMesh);
  steeringWheel.add(new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.042, 0.042, 0.032, 16)), carbonMat).rotateX(Math.PI / 2));
  const spokeH = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.255, 0.026, 0.018)), rimMat);
  steeringWheel.add(spokeH);
  const spokeV = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.030, 0.125, 0.018)), rimMat);
  spokeV.position.y = -0.07;
  steeringWheel.add(spokeV);

  // Driver eye anchor positioned comfortably inside the low 1.14m canopy with clear road view
  const cockpitHeadAnchor = new THREE.Object3D();
  cockpitHeadAnchor.position.set(-0.35, 0.985, 0.02);
  chassis.add(cockpitHeadAnchor);

  const hoodCamAnchor = new THREE.Object3D();
  hoodCamAnchor.position.set(0, 0.89, -0.96);
  chassis.add(hoodCamAnchor);

  // --- 6. FORGED TWIN-Y 10-SPOKE LAMBORGHINI WHEELS & BRAKES ---
  const tireProfile = [
    new THREE.Vector2(0.215, -0.125),
    new THREE.Vector2(0.312, -0.130),
    new THREE.Vector2(0.330, -0.095),
    new THREE.Vector2(0.330, 0.095),
    new THREE.Vector2(0.312, 0.130),
    new THREE.Vector2(0.215, 0.125),
  ];
  const tireGeo = trackGeo(new THREE.LatheGeometry(tireProfile, 24));
  tireGeo.rotateZ(Math.PI / 2);

  const rimBarrelGeo = trackGeo(new THREE.CylinderGeometry(0.22, 0.22, 0.21, 20, 1, true));
  rimBarrelGeo.rotateZ(Math.PI / 2);
  const hubGeo = trackGeo(new THREE.CylinderGeometry(0.052, 0.052, 0.08, 12));
  hubGeo.rotateZ(Math.PI / 2);
  const ySpokeGeo = trackGeo(new THREE.BoxGeometry(0.020, 0.195, 0.022));
  const rotorGeo = trackGeo(new THREE.CylinderGeometry(0.172, 0.172, 0.026, 20));
  rotorGeo.rotateZ(Math.PI / 2);
  const caliperGeo = trackGeo(new THREE.BoxGeometry(0.052, 0.115, 0.082));

  const wheelPositions: [number, number, number][] = [
    [-0.81, 0.33, -1.30], // FL
    [0.81, 0.33, -1.30],  // FR
    [-0.82, 0.33, 1.42],  // RL
    [0.82, 0.33, 1.42],   // RR
  ];

  const wheelMounts: THREE.Group[] = [];
  const wheelSpins: THREE.Group[] = [];

  for (let i = 0; i < 4; i++) {
    const isLeft = i % 2 === 0;
    const isFront = i < 2;
    const mount = new THREE.Group();
    mount.position.set(wheelPositions[i][0], wheelPositions[i][1], wheelPositions[i][2]);
    root.add(mount);

    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(isLeft ? 0.03 : -0.03, 0.02, isFront ? 0.125 : -0.125);
    mount.add(caliper);

    const spinGroup = new THREE.Group();
    mount.add(spinGroup);

    const tireMesh = new THREE.Mesh(tireGeo, tireMat);
    tireMesh.castShadow = true;
    spinGroup.add(tireMesh);

    const rimBarrel = new THREE.Mesh(rimBarrelGeo, darkTrimMat);
    spinGroup.add(rimBarrel);

    const rotor = new THREE.Mesh(rotorGeo, chromeMat);
    rotor.position.x = isLeft ? 0.03 : -0.03;
    spinGroup.add(rotor);

    const hub = new THREE.Mesh(hubGeo, rimMat);
    hub.position.x = isLeft ? -0.055 : 0.055;
    spinGroup.add(hub);

    // 5 twin-Y (10-spoke) Lamborghini forged wheel pattern
    const spokeX = isLeft ? -0.092 : 0.092;
    for (let s = 0; s < 5; s++) {
      const baseAng = (s / 5) * Math.PI * 2;
      for (const forkOffset of [-0.18, 0.18]) {
        const ang = baseAng + forkOffset;
        const spoke = new THREE.Mesh(ySpokeGeo, rimMat);
        spoke.position.set(
          spokeX,
          Math.cos(baseAng) * 0.03 + Math.cos(ang) * 0.088,
          Math.sin(baseAng) * 0.03 + Math.sin(ang) * 0.088
        );
        spoke.rotation.x = ang;
        spinGroup.add(spoke);
      }
    }

    wheelMounts.push(mount);
    wheelSpins.push(spinGroup);
  }

  return {
    root,
    chassis,
    contactShadow,
    steeringWheel,
    wheelMounts: wheelMounts as [THREE.Group, THREE.Group, THREE.Group, THREE.Group],
    wheelSpins: wheelSpins as [THREE.Group, THREE.Group, THREE.Group, THREE.Group],
    brakeLightMat,
    reverseLightMat,
    paintMaterial,
    cockpitHeadAnchor,
    hoodCamAnchor,
    setPaintColor: (hex: string) => {
      paintMaterial.color.set(hex);
    },
    updateVisuals: ({
      x,
      y,
      z,
      yaw,
      pitch,
      roll,
      steerAngle,
      wheelSpin,
      wheelCompressions,
      braking,
      reversing,
      grounded,
    }) => {
      root.position.set(x, y, z);
      root.rotation.set(0, yaw, 0);

      chassis.rotation.set(pitch, 0, roll);
      const avgComp =
        (wheelCompressions[0] + wheelCompressions[1] + wheelCompressions[2] + wheelCompressions[3]) *
        0.25;
      chassis.position.y = avgComp * 0.45;

      contactShadow.visible = grounded;
      contactShadow.position.y = 0.024;

      for (let i = 0; i < 4; i++) {
        wheelMounts[i].position.y = 0.33 + wheelCompressions[i];
        if (i < 2) {
          wheelMounts[i].rotation.y = steerAngle;
        }
        wheelSpins[i].rotation.x = -wheelSpin;
      }

      steeringWheel.rotation.z = steerAngle * 3.1;

      brakeLightMat.emissiveIntensity = braking ? 3.4 : 0.85;
      reverseLightMat.emissiveIntensity = reversing ? 2.4 : 0.0;
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
