import * as THREE from 'three';
import type { HouseConfig } from '../../types/house';
import type { ProceduralTextureLibrary } from '../textures/proceduralTextures';

export interface SiteEnvironmentResult {
  group: THREE.Group;
  dispose: () => void;
}

/**
 * Builds the non-exported architectural plot environment:
 * - Soft ground terrain disc fading into fog
 * - Soft radial contact shadow beneath the house footprint
 * - Paving walkway from the front porch
 * - Composite multi-part stylized trees framing the plot
 */
export function buildSiteEnvironment(
  config: HouseConfig,
  textures: ProceduralTextureLibrary,
): SiteEnvironmentResult {
  const group = new THREE.Group();
  group.name = 'SiteEnvironment';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const disposables: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const entrances = config.dimensions.entrances ?? 1;
  const totalW = config.dimensions.width * entrances;
  const depth = config.dimensions.depth;
  const isApartment = config.styleId === 'soviet-panel';
  const isOffice = config.styleId === 'office-building';
  const isSkyscraper = config.styleId === 'skyscraper';
  const isMegabuilding = config.styleId === 'megabuilding';
  const isSlum = config.styleId === 'slum-shack';
  const isFactory = config.styleId === 'factory';
  const isBlastFurnace = config.styleId === 'blast-furnace';
  const isPark = config.styleId === 'park-pavilion';
  const isVilla = config.styleId === 'villa';
  const isStadium = config.styleId === 'stadium';
  const isParkingBooth = config.styleId === 'parking-booth';
  const isSportsGround = config.styleId === 'sports-ground';
  const isEarly20c = config.styleId === 'early-20c-house';
  const isAcademic = config.styleId === 'academic-building';
  const isMarketRow = config.styleId === 'market-row';
  const isMarket = config.styleId === 'market-pavilion' || isMarketRow;
  const isMall = config.styleId === 'shopping-mall';
  const isWarehouse = config.styleId === 'warehouse';
  const isIndustrial = isFactory || isBlastFurnace;
  const isHighrise = isSkyscraper || isMegabuilding;
  const isUrban = isHighrise || isOffice;
  const maxSpan = Math.max(totalW, depth);

  // 1. Expansive ground terrain (extends well past fog.far so horizon blends seamlessly)
  const groundRadius = Math.max(isHighrise || isStadium || isMall ? 1800 : isOffice || isIndustrial || isWarehouse || isAcademic ? 500 : 140, maxSpan * 45);
  const groundGeo = trackGeo(new THREE.CircleGeometry(groundRadius, 64));
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(
        isMegabuilding
          ? '#172031'
          : isIndustrial || isWarehouse
            ? '#c7c5be'
            : isSlum
              ? '#cfc5b4'
              : isPark || isSportsGround
                ? '#d4e2ce'
                : isVilla
                  ? '#dce4cf'
                  : isStadium
                    ? '#d3ded1'
                    : isParkingBooth || isAcademic
                      ? '#cfd7df'
                      : isEarly20c || isMarket
                        ? '#d8ddd4'
                        : isSkyscraper || isOffice || isMall
                          ? '#cfd6e0'
                          : isApartment
                            ? '#d5dcd0'
                            : '#dfe5dc',
      ),
      roughness: 0.94,
      metalness: 0.0,
    }),
  );
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.position.y = -0.02;
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  // 2. Architectural lot terrace / stone plaza around the building
  const padW =
    totalW +
    (isStadium
      ? 32
      : isParkingBooth
        ? 14
        : isSportsGround
          ? 12
          : isAcademic || isMall
            ? 18
            : isMarket
              ? 12
              : isEarly20c
                ? 9
                : isMegabuilding
                  ? 24
                  : isSkyscraper
                    ? 18
                    : isOffice || isIndustrial || isWarehouse
                      ? 16
                      : isPark
                        ? 8.5
                        : isVilla
                          ? 11.5
                          : isApartment
                            ? 10
                            : isSlum
                              ? 4.8
                              : 6.5);
  const padD =
    depth +
    (isStadium
      ? 32
      : isParkingBooth
        ? 16
        : isSportsGround
          ? 11
          : isAcademic || isMall
            ? 18
            : isMarket
              ? 13
              : isEarly20c
                ? 10
                : isMegabuilding
                  ? 24
                  : isSkyscraper
                    ? 18
                    : isOffice || isIndustrial || isWarehouse
                      ? 15
                      : isPark
                        ? 8.5
                        : isVilla
                          ? 13.0
                          : isApartment
                            ? 12
                            : isSlum
                              ? 5.2
                              : 6.5);
  const padGeo = trackGeo(new THREE.BoxGeometry(padW, 0.04, padD));
  const padMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(
        isMegabuilding
          ? '#2c3445'
          : isIndustrial || isWarehouse
            ? '#9da3ab'
            : isSlum
              ? '#a9a295'
              : isPark
                ? '#dad3c4'
                : isVilla
                  ? '#ded8c8'
                  : isParkingBooth || isAcademic
                    ? '#c2c9d2'
                    : isMarket || isEarly20c
                      ? '#cbc8bf'
                      : isSportsGround
                        ? '#c7d1c4'
                        : isStadium || isSkyscraper || isOffice || isMall
                          ? '#c6cdd6'
                          : '#c8d2c3',
      ),
      roughness: 0.92,
      metalness: isMegabuilding ? 0.08 : 0.0,
    }),
  );
  const padMesh = new THREE.Mesh(padGeo, padMat);
  padMesh.position.set(
    isParkingBooth ? 0.6 : isSportsGround ? 1.2 : 0,
    -0.02,
    isUrban || isIndustrial || isWarehouse || isAcademic || isMall ? 1.8 : isApartment ? 2.2 : isVilla || isMarket ? 1.6 : isPark || isStadium || isParkingBooth || isSportsGround ? 0 : 0.4,
  );
  padMesh.receiveShadow = true;
  group.add(padMesh);

  // 3. Soft radial contact shadow plane directly beneath the building
  const shadowTex = textures.createContactShadowTexture();
  disposables.push(shadowTex);
  const shadowGeo = trackGeo(
    new THREE.PlaneGeometry(
      isParkingBooth ? totalW + 6.5 : totalW * 1.32,
      isParkingBooth ? depth * 1.8 : depth * 1.45,
    ),
  );
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: isMegabuilding ? 0.7 : 0.55,
    }),
  );
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.position.set(isParkingBooth ? 0.4 : 0, 0.004, 0);
  group.add(shadowPlane);

  // 4. Front walkway(s), courtyard road, or urban avenue
  const walkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(isMegabuilding ? '#3a4457' : '#b8bec7'),
      roughness: 0.85,
      metalness: 0.04,
    }),
  );

  const hw = totalW / 2;
  const hd = depth / 2;

  if (isUrban) {
    // Broad entrance promenade from podium steps to city avenue
    const promW = Math.min(totalW * 0.48, isMegabuilding ? 15.0 : isOffice ? 11.0 : 10.2);
    const promGeo = trackGeo(new THREE.BoxGeometry(promW, 0.036, isMegabuilding ? 10.2 : 7.6));
    const prom = new THREE.Mesh(promGeo, walkMat);
    prom.position.set(0, 0.008, depth / 2 + (isMegabuilding ? 8.2 : 6.9));
    prom.receiveShadow = true;
    group.add(prom);

    // City avenue asphalt carriageway in front of the plaza
    const roadW = Math.max(220, totalW + (isMegabuilding ? 180 : 140));
    const roadD = isMegabuilding ? 11.0 : 7.2;
    const roadGeo = trackGeo(new THREE.BoxGeometry(roadW, 0.03, roadD));
    const roadMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(isMegabuilding ? '#171c26' : '#5a6270'),
        roughness: 0.85,
        metalness: 0.05,
      }),
    );
    const roadZ = depth / 2 + (isMegabuilding ? 18.0 : 14.2);
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.position.set(0, 0.004, roadZ);
    road.receiveShadow = true;
    group.add(road);

    // Dashed avenue lane markings (amber cyber markings for megabuilding)
    const dashGeo = trackGeo(new THREE.BoxGeometry(3.8, 0.034, 0.24));
    const dashMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(isMegabuilding ? '#f59e0b' : '#e5e7eb'),
        emissive: new THREE.Color(isMegabuilding ? '#b45309' : '#000000'),
        emissiveIntensity: isMegabuilding ? 0.45 : 0,
        roughness: 0.7,
      }),
    );
    const dashCount = Math.floor(roadW / 7.5);
    for (let i = -Math.floor(dashCount / 2); i <= Math.floor(dashCount / 2); i++) {
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.position.set(i * 7.2, 0.006, roadZ);
      group.add(dash);
    }

    if (isMegabuilding) {
      // Glowing cyan cyber-curb guide strips along highway edge
      const curbGlowGeo = trackGeo(new THREE.BoxGeometry(roadW, 0.06, 0.22));
      const curbGlowMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: new THREE.Color('#00e5ff'),
          emissive: new THREE.Color('#00d8ff'),
          emissiveIntensity: 1.25,
        }),
      );
      const curb = new THREE.Mesh(curbGlowGeo, curbGlowMat);
      curb.position.set(0, 0.015, roadZ - roadD / 2 - 0.12);
      group.add(curb);
    }
  } else if (isApartment) {
    // Concrete sidewalk along the entire +Z front facade
    const sidewalkGeo = trackGeo(new THREE.BoxGeometry(totalW + 4.0, 0.035, 2.2));
    const sidewalk = new THREE.Mesh(sidewalkGeo, walkMat);
    sidewalk.position.set(0, 0.008, depth / 2 + 3.4);
    sidewalk.receiveShadow = true;
    group.add(sidewalk);

    // Asphalt courtyard driveway in front of sidewalk
    const roadGeo = trackGeo(new THREE.BoxGeometry(totalW + 10.0, 0.025, 4.4));
    const roadMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color('#6b7280'),
        roughness: 0.92,
        metalness: 0.02,
      }),
    );
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.position.set(0, 0.004, depth / 2 + 6.7);
    road.receiveShadow = true;
    group.add(road);

    // Individual walkways connecting each entrance stoop to the sidewalk
    const entryWalkGeo = trackGeo(new THREE.BoxGeometry(2.1, 0.035, 2.4));
    const sectionW = config.dimensions.width;
    for (let e = 0; e < entrances; e++) {
      const sx = -totalW / 2 + sectionW * (e + 0.5);
      const ew = new THREE.Mesh(entryWalkGeo, walkMat);
      ew.position.set(sx, 0.009, depth / 2 + 1.8);
      ew.receiveShadow = true;
      group.add(ew);
    }
  } else if (isSlum) {
    // Cracked alley lane in front + wooden utility pole with sagging power lines + scrap barrels
    const alleyGeo = trackGeo(new THREE.BoxGeometry(totalW + 18, 0.028, 3.2));
    const alleyMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#8f897f', roughness: 0.94, metalness: 0.02 }),
    );
    const alley = new THREE.Mesh(alleyGeo, alleyMat);
    alley.position.set(0, 0.004, depth / 2 + 4.4);
    alley.receiveShadow = true;
    group.add(alley);

    // Wooden utility pole + crossarm + overhead sagging power cables connected to house corner
    const poleMat = trackMat(new THREE.MeshStandardMaterial({ color: '#5c4636', roughness: 0.88 }));
    const wireMat = trackMat(new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.6 }));
    const poleX = -hw - 2.6;
    const poleZ = hd + 2.8;
    const poleH = Math.max(5.6, config.dimensions.floors * config.dimensions.floorHeight + 1.8);

    const poleGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.16, poleH, 8));
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(poleX, poleH / 2, poleZ);
    pole.castShadow = true;
    group.add(pole);

    const armGeo = trackGeo(new THREE.BoxGeometry(1.5, 0.1, 0.1));
    const arm = new THREE.Mesh(armGeo, poleMat);
    arm.position.set(poleX, poleH - 0.35, poleZ);
    group.add(arm);

    const hookY =
      config.dimensions.foundationHeight +
      Math.min(config.dimensions.floors, 2) * config.dimensions.floorHeight -
      0.35;
    for (const [ox, oy] of [
      [-0.45, 0],
      [0.45, -0.15],
    ]) {
      const start = new THREE.Vector3(poleX + ox, poleH - 0.35, poleZ);
      const end = new THREE.Vector3(-hw * 0.86, hookY + oy, hd * 0.55);
      const mid = start.clone().lerp(end, 0.5);
      mid.y -= 0.75;
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const tubeGeo = trackGeo(new THREE.TubeGeometry(curve, 12, 0.022, 6, false));
      group.add(new THREE.Mesh(tubeGeo, wireMat));
    }

    // Scrap oil drums and stacked wooden crates near the shack wall
    const drumGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.88, 12));
    const drumMat = trackMat(new THREE.MeshStandardMaterial({ color: '#7c4331', roughness: 0.72, metalness: 0.3 }));
    const crateGeo = trackGeo(new THREE.BoxGeometry(0.68, 0.52, 0.56));
    for (const [dx, dz] of [
      [-hw - 0.55, -hd * 0.25],
      [-hw - 0.6, -hd * 0.25 + 0.62],
    ]) {
      const drum = new THREE.Mesh(drumGeo, drumMat);
      drum.position.set(dx, 0.44, dz);
      drum.castShadow = true;
      group.add(drum);
    }
    const crate = new THREE.Mesh(crateGeo, poleMat);
    crate.position.set(hw + 0.55, 0.26, -hd * 0.1);
    crate.castShadow = true;
    group.add(crate);
  } else if (isIndustrial) {
    // Industrial logistics road, railroad spur track, shipping container, transformer station & fence
    const roadW = Math.max(180, totalW + 110);
    const roadZ = hd + 12.2;
    const roadGeo = trackGeo(new THREE.BoxGeometry(roadW, 0.03, 7.6));
    const roadMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#4c535e', roughness: 0.88, metalness: 0.04 }),
    );
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.position.set(0, 0.004, roadZ);
    road.receiveShadow = true;
    group.add(road);

    // Yellow industrial road lane dashes
    const dashGeo = trackGeo(new THREE.BoxGeometry(3.4, 0.034, 0.22));
    const dashMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.72 }),
    );
    const dashCount = Math.floor(roadW / 8);
    for (let i = -Math.floor(dashCount / 2); i <= Math.floor(dashCount / 2); i++) {
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.position.set(i * 7.4, 0.006, roadZ);
      group.add(dash);
    }

    // Railroad spur track entering from the left industrial corridor to a buffer stop on the yard apron
    const railZ = hd + 6.0;
    const spurStart = -roadW / 2;
    const spurEnd = hw + 16.0;
    const trackLen = spurEnd - spurStart;
    const trackMidX = (spurStart + spurEnd) / 2;

    const ballastGeo = trackGeo(new THREE.BoxGeometry(trackLen, 0.04, 2.5));
    const ballastMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#78736c', roughness: 0.95 }),
    );
    const ballast = new THREE.Mesh(ballastGeo, ballastMat);
    ballast.position.set(trackMidX, 0.015, railZ);
    ballast.receiveShadow = true;
    group.add(ballast);

    const tieGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.07, 2.05));
    const tieMat = trackMat(new THREE.MeshStandardMaterial({ color: '#4d3b2f', roughness: 0.9 }));
    const railGeo = trackGeo(new THREE.BoxGeometry(trackLen, 0.09, 0.09));
    const railMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.35, metalness: 0.8 }),
    );
    const tieStep = 0.85;
    const tieCount = Math.floor(trackLen / tieStep);
    const tiesMesh = new THREE.InstancedMesh(tieGeo, tieMat, tieCount);
    const dummy = new THREE.Object3D();
    for (let t = 0; t < tieCount; t++) {
      dummy.position.set(spurStart + 0.5 + t * tieStep, 0.04, railZ);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      tiesMesh.setMatrixAt(t, dummy.matrix);
    }
    tiesMesh.instanceMatrix.needsUpdate = true;
    tiesMesh.computeBoundingSphere();
    group.add(tiesMesh);

    for (const rz of [railZ - 0.72, railZ + 0.72]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(trackMidX, 0.1, rz);
      rail.castShadow = true;
      group.add(rail);
    }

    // Steel & hazard-red railroad buffer stop at the spur terminus
    const bufferGroup = new THREE.Group();
    const stopRedMat = trackMat(new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: 0.55, metalness: 0.25 }));
    const beamGeo = trackGeo(new THREE.BoxGeometry(0.28, 0.34, 2.1));
    const strutGeo = trackGeo(new THREE.BoxGeometry(0.14, 1.15, 0.14));
    const stopBeam = new THREE.Mesh(beamGeo, stopRedMat);
    stopBeam.position.set(0, 0.78, 0);
    bufferGroup.add(stopBeam);
    for (const sz of [-0.72, 0.72]) {
      const sFront = new THREE.Mesh(strutGeo, railMat);
      sFront.position.set(-0.35, 0.45, sz);
      sFront.rotation.z = -0.45;
      const sBack = new THREE.Mesh(strutGeo, railMat);
      sBack.position.set(0.35, 0.45, sz);
      sBack.rotation.z = 0.45;
      bufferGroup.add(sFront, sBack);
    }
    bufferGroup.position.set(spurEnd - 0.6, 0.08, railZ);
    group.add(bufferGroup);

    // Composite intermodal cargo shipping container parked on right apron
    const contGroup = new THREE.Group();
    const contMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#2b5b7a', roughness: 0.58, metalness: 0.35 }),
    );
    const contFrameMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.48, metalness: 0.65 }),
    );
    const contBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.0, 2.48, 2.38)), contMat);
    contBody.position.y = 1.3;
    contBody.castShadow = true;
    contBody.receiveShadow = true;
    contGroup.add(contBody);
    // Corner castings & vertical ribs
    const ribGeo = trackGeo(new THREE.BoxGeometry(0.08, 2.36, 2.44));
    for (let r = -2; r <= 2; r++) {
      const rib = new THREE.Mesh(ribGeo, contMat);
      rib.position.set(r * 1.15, 1.3, 0);
      contGroup.add(rib);
    }
    const postCGeo = trackGeo(new THREE.BoxGeometry(0.14, 2.58, 0.14));
    for (const [cx, cz] of [
      [-2.98, -1.16],
      [2.98, -1.16],
      [-2.98, 1.16],
      [2.98, 1.16],
    ]) {
      const cp = new THREE.Mesh(postCGeo, contFrameMat);
      cp.position.set(cx, 1.3, cz);
      contGroup.add(cp);
    }
    const contRoof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.1, 0.08, 2.46)), contFrameMat);
    contRoof.position.y = 2.56;
    contGroup.add(contRoof);
    contGroup.position.set(hw + 5.2, 0, hd + 1.5);
    contGroup.rotation.y = 0.06;
    group.add(contGroup);

    // Composite electrical substation transformer with concrete pad, radiators & HV bushings
    const subGroup = new THREE.Group();
    const subMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#4b5563', roughness: 0.55, metalness: 0.45 }),
    );
    const insulatorMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#d1d5db', roughness: 0.25, metalness: 0.1 }),
    );
    const subPad = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 0.18, 2.5)), ballastMat);
    subPad.position.y = 0.09;
    const subTank = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.4, 2.0, 1.8)), subMat);
    subTank.position.y = 1.18;
    subTank.castShadow = true;
    const finGeo = trackGeo(new THREE.BoxGeometry(2.68, 1.6, 0.12));
    for (const fz of [-0.55, 0, 0.55]) {
      const fin = new THREE.Mesh(finGeo, subMat);
      fin.position.set(0, 1.15, fz);
      subGroup.add(fin);
    }
    const bushGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.14, 0.65, 10));
    for (const bx of [-0.65, 0, 0.65]) {
      const bush = new THREE.Mesh(bushGeo, insulatorMat);
      bush.position.set(bx, 2.48, 0);
      subGroup.add(bush);
    }
    subGroup.add(subPad, subTank);
    subGroup.position.set(hw + 5.0, 0, -hd * 0.58);
    group.add(subGroup);

    // Concrete perimeter industrial fence posts along back lot edge
    const postGeo = trackGeo(new THREE.BoxGeometry(0.18, 2.2, 0.18));
    const panelGeo = trackGeo(new THREE.BoxGeometry(3.8, 1.85, 0.06));
    const fenceMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#8d949d', roughness: 0.86 }),
    );
    const backFenceZ = -padD / 2 + 1.8;
    const fenceCols = Math.floor((padW - 4) / 4);
    for (let i = 0; i <= fenceCols; i++) {
      const fx = -padW / 2 + 2 + i * 4;
      const post = new THREE.Mesh(postGeo, fenceMat);
      post.position.set(fx, 1.1, backFenceZ);
      post.castShadow = true;
      group.add(post);
      if (i < fenceCols) {
        const panel = new THREE.Mesh(panelGeo, fenceMat);
        panel.position.set(fx + 2, 0.95, backFenceZ);
        panel.receiveShadow = true;
        group.add(panel);
      }
    }

    if (isBlastFurnace) {
      // Coke & iron-ore stockpile mounds tucked inside left yard near the skip hoist bunker
      const cokeMat = trackMat(new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.96 }));
      const oreMat = trackMat(new THREE.MeshStandardMaterial({ color: '#6b3e31', roughness: 0.94 }));
      const mound1 = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(3.1, 2.3, 9)), cokeMat);
      mound1.position.set(-hw - 3.8, 1.15, -hd * 0.45);
      mound1.castShadow = true;
      const mound2 = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(2.5, 1.9, 9)), oreMat);
      mound2.position.set(-hw - 3.6, 0.95, hd * 0.15);
      mound2.castShadow = true;
      group.add(mound1, mound2);
    }
  } else if (isPark) {
    // Intersecting botanical garden gravel promenades + ornamental cast-iron park lamps + outdoor benches + trimmed shrubs
    const gravelMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#cfc7b6', roughness: 0.9, metalness: 0.02 }),
    );
    const edgeMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.85, metalness: 0.04 }),
    );
    const pathZLen = depth + 44;
    const pathXLen = totalW + 40;
    const pathZMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 0.03, pathZLen)), gravelMat);
    pathZMesh.position.set(0, 0.008, 0);
    pathZMesh.receiveShadow = true;
    const pathXMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(pathXLen, 0.028, 2.6)), gravelMat);
    pathXMesh.position.set(0, 0.006, 0);
    pathXMesh.receiveShadow = true;
    group.add(pathZMesh, pathXMesh);

    // Granite curb borders along front promenade
    const curbGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.06, pathZLen / 2 - hd - 2.2));
    for (const sx of [-1.66, 1.66]) {
      const curbF = new THREE.Mesh(curbGeo, edgeMat);
      curbF.position.set(sx, 0.025, hd + 2.2 + (pathZLen / 2 - hd - 2.2) / 2);
      group.add(curbF);
    }

    // Ornamental wrought-iron park street lamps flanking the promenade
    const lampIronMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.42, metalness: 0.72 }),
    );
    const lampGlobeMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#fef08a',
        emissive: '#f59e0b',
        emissiveIntensity: 1.3,
        roughness: 0.25,
      }),
    );
    const postPoleGeo = trackGeo(new THREE.CylinderGeometry(0.055, 0.09, 2.9, 10));
    const postBaseGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.22, 0.42, 10));
    const globeGeo = trackGeo(new THREE.SphereGeometry(0.2, 12, 10));
    const capGeo = trackGeo(new THREE.ConeGeometry(0.24, 0.16, 10));
    for (const [lx, lz] of [
      [-2.25, hd + 3.8],
      [2.25, hd + 3.8],
      [-2.25, -hd - 3.8],
      [2.25, -hd - 3.8],
    ]) {
      const lamp = new THREE.Group();
      const base = new THREE.Mesh(postBaseGeo, lampIronMat);
      base.position.y = 0.21;
      const pole = new THREE.Mesh(postPoleGeo, lampIronMat);
      pole.position.y = 1.65;
      pole.castShadow = true;
      const globe = new THREE.Mesh(globeGeo, lampGlobeMat);
      globe.position.y = 3.22;
      const cap = new THREE.Mesh(capGeo, lampIronMat);
      cap.position.y = 3.44;
      lamp.add(base, pole, globe, cap);
      lamp.position.set(lx, 0, lz);
      group.add(lamp);
    }

    // Two outdoor wooden park benches flanking the front gravel plaza
    const benchWoodMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#8c5e3c', roughness: 0.78 }),
    );
    const seatGeo = trackGeo(new THREE.BoxGeometry(1.9, 0.08, 0.52));
    const backGeo = trackGeo(new THREE.BoxGeometry(1.9, 0.36, 0.07));
    const legGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.44, 0.46));
    for (const bx of [-hw * 0.65 - 1.4, hw * 0.65 + 1.4]) {
      const bench = new THREE.Group();
      const seat = new THREE.Mesh(seatGeo, benchWoodMat);
      seat.position.set(0, 0.44, 0);
      seat.castShadow = true;
      const back = new THREE.Mesh(backGeo, benchWoodMat);
      back.position.set(0, 0.72, -0.22);
      back.rotation.x = -0.15;
      back.castShadow = true;
      const l1 = new THREE.Mesh(legGeo, lampIronMat);
      l1.position.set(-0.76, 0.22, 0);
      const l2 = new THREE.Mesh(legGeo, lampIronMat);
      l2.position.set(0.76, 0.22, 0);
      bench.add(seat, back, l1, l2);
      bench.position.set(bx, 0, hd + 2.3);
      group.add(bench);
    }
  } else if (isVilla) {
    // Villa motor court, travertine stepping path, low garden privacy walls & warm garden bollards
    const pathMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#d8d0c1', roughness: 0.84, metalness: 0.03 }),
    );
    const wallMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#ebe4d5', roughness: 0.88, metalness: 0.02 }),
    );
    const capMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#b5ada0', roughness: 0.78, metalness: 0.04 }),
    );
    const bollardMetalMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.38, metalness: 0.7 }),
    );
    const bollardGlowMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#fef08a',
        emissive: '#f59e0b',
        emissiveIntensity: 1.2,
      }),
    );

    // Entry stepping-stone path from front driveway to villa steps
    const walkGeo = trackGeo(new THREE.BoxGeometry(2.8, 0.035, 6.4));
    const walkMesh = new THREE.Mesh(walkGeo, pathMat);
    walkMesh.position.set(-totalW * 0.07, 0.008, hd + 6.4);
    walkMesh.receiveShadow = true;
    group.add(walkMesh);

    // Private estate access road across front of lot
    const driveGeo = trackGeo(new THREE.BoxGeometry(padW + 24, 0.03, 4.6));
    const driveMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#9ca3af', roughness: 0.88, metalness: 0.03 }),
    );
    const driveMesh = new THREE.Mesh(driveGeo, driveMat);
    driveMesh.position.set(0, 0.004, hd + 11.2);
    driveMesh.receiveShadow = true;
    group.add(driveMesh);

    // Low Mediterranean courtyard perimeter walls framing left, right & back garden edges
    const wallH = 1.05;
    const backWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(padW - 1.4, wallH, 0.28)), wallMat);
    backWall.position.set(0, wallH / 2, -hd - 4.4);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    const backCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(padW - 1.2, 0.09, 0.38)), capMat);
    backCap.position.set(0, wallH + 0.04, -hd - 4.4);
    group.add(backWall, backCap);

    const sideLen = padD - 3.0;
    const sideZ = 1.2;
    for (const sx of [-padW / 2 + 0.7, padW / 2 - 0.7]) {
      const sWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, wallH, sideLen)), wallMat);
      sWall.position.set(sx, wallH / 2, sideZ);
      sWall.castShadow = true;
      sWall.receiveShadow = true;
      const sCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.38, 0.09, sideLen + 0.2)), capMat);
      sCap.position.set(sx, wallH + 0.04, sideZ);
      group.add(sWall, sCap);
    }

    // Warm pathway bollards flanking entry walkway
    const bBodyGeo = trackGeo(new THREE.CylinderGeometry(0.075, 0.085, 0.75, 10));
    const bLampGeo = trackGeo(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 10));
    for (const [bx, bz] of [
      [-totalW * 0.07 - 1.65, hd + 5.2],
      [-totalW * 0.07 + 1.65, hd + 5.2],
      [-totalW * 0.07 - 1.65, hd + 7.8],
      [-totalW * 0.07 + 1.65, hd + 7.8],
    ]) {
      const bollard = new THREE.Group();
      const body = new THREE.Mesh(bBodyGeo, bollardMetalMat);
      body.position.y = 0.375;
      body.castShadow = true;
      const glow = new THREE.Mesh(bLampGeo, bollardGlowMat);
      glow.position.y = 0.8;
      bollard.add(body, glow);
      bollard.position.set(bx, 0, bz);
      group.add(bollard);
    }
  } else if (isStadium) {
    // Broad North & South fan approach promenades + city boulevard + stadium avenue lamps
    const promW = Math.min(22, totalW * 0.28);
    const promLen = 18;
    const promGeo = trackGeo(new THREE.BoxGeometry(promW, 0.036, promLen));
    for (const dirZ of [-1, 1]) {
      const prom = new THREE.Mesh(promGeo, walkMat);
      prom.position.set(0, 0.008, dirZ * (hd + 9.5));
      prom.receiveShadow = true;
      group.add(prom);
    }

    const roadW = Math.max(260, totalW + 160);
    const roadZ = hd + 21.5;
    const roadGeo = trackGeo(new THREE.BoxGeometry(roadW, 0.03, 9.2));
    const roadMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#565e6b', roughness: 0.86, metalness: 0.04 }),
    );
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.position.set(0, 0.004, roadZ);
    road.receiveShadow = true;
    group.add(road);

    const dashGeo = trackGeo(new THREE.BoxGeometry(4.2, 0.034, 0.24));
    const dashMat = trackMat(new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.7 }));
    const dashCount = Math.floor(roadW / 9);
    for (let i = -Math.floor(dashCount / 2); i <= Math.floor(dashCount / 2); i++) {
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.position.set(i * 8.6, 0.006, roadZ);
      group.add(dash);
    }

    // Tall boulevard street lamp posts flanking front approach plaza
    const lampPostGeo = trackGeo(new THREE.CylinderGeometry(0.1, 0.14, 5.4, 8));
    const lampArmGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.14, 1.4));
    const lampHeadGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.12, 0.8));
    const postMat = trackMat(new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.45, metalness: 0.65 }));
    const lampGlowMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#fef9c3',
        emissive: '#facc15',
        emissiveIntensity: 1.1,
      }),
    );
    for (const lx of [-promW * 0.65, promW * 0.65, -hw * 0.72, hw * 0.72]) {
      const postGrp = new THREE.Group();
      const pMesh = new THREE.Mesh(lampPostGeo, postMat);
      pMesh.position.y = 2.7;
      pMesh.castShadow = true;
      const aMesh = new THREE.Mesh(lampArmGeo, postMat);
      aMesh.position.set(0, 5.3, 0.55);
      const hMesh = new THREE.Mesh(lampHeadGeo, lampGlowMat);
      hMesh.position.set(0, 5.2, 1.0);
      postGrp.add(pMesh, aMesh, hMesh);
      postGrp.position.set(lx, 0, hd + 15.8);
      group.add(postGrp);
    }
  } else if (isParkingBooth) {
    // Asphalt vehicle entry lane aligned cleanly outside island curb and beneath the barrier arm
    const boothX = -1.75;
    const gateX = boothX + totalW / 2 + (config.features.hasPorch ? 0.56 : 0.44);
    const laneW = 3.9;
    const laneLeft = gateX + 0.34;
    const laneCenterX = laneLeft + laneW / 2;
    const laneLen = 32;

    const asphaltMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#454c59', roughness: 0.88, metalness: 0.04 }),
    );
    const stripeMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.7 }),
    );
    const yellowStripeMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.65 }),
    );

    // Entry driveway passing under barrier gate along Z
    const laneMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(laneW, 0.026, laneLen)), asphaltMat);
    laneMesh.position.set(laneCenterX, 0.005, 0);
    laneMesh.receiveShadow = true;
    group.add(laneMesh);

    // Parking apron bay zone behind barrier (-Z)
    const lotApron = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(14, 0.022, 11.5)), asphaltMat);
    lotApron.position.set(laneCenterX + 1.5, 0.003, -9.2);
    lotApron.receiveShadow = true;
    group.add(lotApron);

    // Crisp white edge lines & stop bar before the barrier gate (+Z side)
    const edgeGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.03, laneLen - 0.5));
    for (const ex of [laneLeft + 0.18, laneLeft + laneW - 0.18]) {
      const eMesh = new THREE.Mesh(edgeGeo, stripeMat);
      eMesh.position.set(ex, 0.008, 0);
      group.add(eMesh);
    }
    const stopLine = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(laneW - 0.68, 0.032, 0.28)), stripeMat);
    stopLine.position.set(laneCenterX, 0.009, 2.35);
    group.add(stopLine);

    // Yellow speed-bump / threshold strip neatly inside lane stripes
    const bumpMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(laneW - 0.86, 0.045, 0.3)), yellowStripeMat);
    bumpMesh.position.set(laneCenterX, 0.014, 0.27);
    group.add(bumpMesh);

    // White parking bay stall dividers in background lot (-Z)
    const stallGeo = trackGeo(new THREE.BoxGeometry(0.12, 0.028, 4.2));
    for (let i = -2; i <= 3; i++) {
      const sMesh = new THREE.Mesh(stallGeo, stripeMat);
      sMesh.position.set(laneCenterX - 2.6 + i * 2.5, 0.008, -12.6);
      group.add(sMesh);
    }

    // Pedestrian walkway from booth rear door (-X)
    const backWalk = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.2, 0.03, 1.4)), walkMat);
    backWalk.position.set(boothX - totalW / 2 - 1.8, 0.006, 0);
    backWalk.receiveShadow = true;
    group.add(backWalk);

    // Tall parking-lot streetlight pole beside outer edge of lane
    const poleMat = trackMat(new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.45, metalness: 0.65 }));
    const glowMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#fef9c3', emissive: '#fde047', emissiveIntensity: 1.1 }),
    );
    const lPole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.065, 0.09, 4.8, 10)), poleMat);
    lPole.position.set(laneCenterX + laneW / 2 + 0.65, 2.4, -2.1);
    lPole.castShadow = true;
    const lArm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.1, 0.09, 0.09)), poleMat);
    lArm.position.set(laneCenterX + laneW / 2 + 0.15, 4.78, -2.1);
    const lHead = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.55, 0.08, 0.24)), glowMat);
    lHead.position.set(laneCenterX + laneW / 2 - 0.28, 4.72, -2.1);
    group.add(lPole, lArm, lHead);
  } else if (isSportsGround) {
    // Central park pathway approaching the +Z court entrance gate & spectator walkway across front
    const walkGeo = trackGeo(new THREE.BoxGeometry(3.2, 0.03, 5.2));
    const walkMesh = new THREE.Mesh(walkGeo, walkMat);
    walkMesh.position.set(0, 0.006, hd + 3.1);
    walkMesh.receiveShadow = true;
    const crossWalk = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(padW - 1.6, 0.028, 2.4)), walkMat);
    crossWalk.position.set(1.2, 0.004, hd + 6.4);
    crossWalk.receiveShadow = true;
    group.add(walkMesh, crossWalk);
  } else if (isAcademic) {
    // Grand paved campus promenade & front boulevard avenue
    const promW = Math.min(12, totalW * 0.34);
    const promMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(promW, 0.034, 8.2)), walkMat);
    promMesh.position.set(0, 0.007, hd + 5.4);
    promMesh.receiveShadow = true;
    const crossPlaza = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(padW - 2.0, 0.03, 3.2)), walkMat);
    crossPlaza.position.set(0, 0.005, hd + 9.2);
    crossPlaza.receiveShadow = true;
    group.add(promMesh, crossPlaza);
  } else if (isMarket) {
    // Broad market cobblestone front square plaza
    const squareMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(totalW + 7.5, 0.032, 6.2)), walkMat);
    squareMesh.position.set(0, 0.006, hd + 4.4);
    squareMesh.receiveShadow = true;
    group.add(squareMesh);
  } else if (isMall) {
    // Grand commercial mall front plaza & city boulevard avenue
    const plazaMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(totalW + 12.0, 0.032, 10.0)), walkMat);
    plazaMesh.position.set(0, 0.006, hd + 6.4);
    plazaMesh.receiveShadow = true;
    const roadW = Math.max(200, totalW + 140);
    const roadZ = hd + 15.2;
    const roadMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#474f5c', roughness: 0.88, metalness: 0.04 }),
    );
    const roadMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(roadW, 0.026, 7.6)), roadMat);
    roadMesh.position.set(0, 0.003, roadZ);
    roadMesh.receiveShadow = true;
    group.add(plazaMesh, roadMesh);

    const dashGeo = trackGeo(new THREE.BoxGeometry(3.8, 0.032, 0.22));
    const dashMat = trackMat(new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.7 }));
    const dashCount = Math.floor(roadW / 7.5);
    for (let i = -Math.floor(dashCount / 2); i <= Math.floor(dashCount / 2); i++) {
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.position.set(i * 7.2, 0.006, roadZ);
      group.add(dash);
    }
  } else if (isWarehouse) {
    // Heavy-duty asphalt truck loading apron, dock bay lane stripes & access highway (no railroad tracks)
    const apronMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#444b57', roughness: 0.88, metalness: 0.04 }),
    );
    const stripeMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.7 }),
    );
    const apronMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(totalW + 14.0, 0.028, 11.2)), apronMat);
    apronMesh.position.set(0, 0.004, hd + 6.8);
    apronMesh.receiveShadow = true;
    group.add(apronMesh);

    const stripeGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.03, 6.8));
    const laneCount = Math.max(4, Math.round(totalW / 6.5));
    for (let i = 0; i <= laneCount; i++) {
      const sx = -totalW * 0.28 + (i / laneCount) * totalW * 0.72;
      const st = new THREE.Mesh(stripeGeo, stripeMat);
      st.position.set(sx, 0.009, hd + 6.2);
      group.add(st);
    }

    const roadW = Math.max(180, totalW + 110);
    const roadZ = hd + 16.2;
    const roadMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(roadW, 0.026, 7.2)), apronMat);
    roadMesh.position.set(0, 0.003, roadZ);
    roadMesh.receiveShadow = true;
    group.add(roadMesh);

    const dashGeo = trackGeo(new THREE.BoxGeometry(3.4, 0.032, 0.22));
    const dashMat = trackMat(new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.72 }));
    const dashCount = Math.floor(roadW / 8);
    for (let i = -Math.floor(dashCount / 2); i <= Math.floor(dashCount / 2); i++) {
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.position.set(i * 7.4, 0.006, roadZ);
      group.add(dash);
    }
  } else {
    const walkGeo = trackGeo(new THREE.BoxGeometry(isEarly20c ? 2.4 : 1.5, 0.03, 4.6));
    const walkMesh = new THREE.Mesh(walkGeo, walkMat);
    walkMesh.position.set(0, 0.006, depth / 2 + 3.2);
    walkMesh.receiveShadow = true;
    group.add(walkMesh);
  }

  // 5. Composite 3-part stylized trees (or cyberpunk street light pylons for megabuilding)
  if (isMegabuilding) {
    const poleGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.24, 6.2, 8));
    const armGeo = trackGeo(new THREE.BoxGeometry(0.22, 0.22, 1.8));
    const lampGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.14, 1.1));
    const poleMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.4, metalness: 0.7 }),
    );
    const lampMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#00e5ff',
        emissive: '#00d8ff',
        emissiveIntensity: 1.5,
      }),
    );

    const pylonPositions: Array<[number, number]> = [
      [-hw - 8, hd + 11.5],
      [hw + 8, hd + 11.5],
      [-hw * 0.45, hd + 11.5],
      [hw * 0.45, hd + 11.5],
      [-hw - 10, 0],
      [hw + 10, 0],
      [-hw - 8, -hd - 8],
      [hw + 8, -hd - 8],
    ];
    for (const [px, pz] of pylonPositions) {
      const pylon = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 3.1;
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.position.set(0, 6.1, 0.7);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(0, 5.95, 1.2);
      pylon.add(pole, arm, lamp);
      pylon.position.set(px, 0, pz);
      group.add(pylon);
    }
  } else {
    const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.16, 1.5, 10));
    const trunkMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color('#6c5340'),
        roughness: 0.88,
        metalness: 0.02,
      }),
    );
    const crownGeo1 = trackGeo(new THREE.ConeGeometry(0.95, 1.9, 10));
    const crownGeo2 = trackGeo(new THREE.ConeGeometry(0.72, 1.5, 10));
    const foliageMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color('#5a7d5c'),
        roughness: 0.78,
        metalness: 0.0,
      }),
    );

    const treeScaleBoost = isStadium
      ? 2.4
      : isSkyscraper || isMall
        ? 1.85
        : isOffice || isIndustrial || isWarehouse
          ? 1.55
          : isApartment
            ? 1.45
            : isSlum
              ? 0.85
              : 1.0;
    const treeCoords: Array<[number, number, number]> =
      isParkingBooth
        ? [
            [-6.4, -4.8, 1.1],
            [-6.8, 4.0, 1.0],
            [7.6, -5.6, 1.1],
            [8.8, -1.6, 0.95],
          ]
        : isStadium
        ? [
            [-hw - 12, -hd - 10, 1.15 * treeScaleBoost],
            [hw + 12, -hd - 10, 1.15 * treeScaleBoost],
            [-hw - 14, 0, 1.2 * treeScaleBoost],
            [hw + 14, 0, 1.2 * treeScaleBoost],
            [-hw - 11, hd + 11, 1.1 * treeScaleBoost],
            [hw + 11, hd + 11, 1.1 * treeScaleBoost],
            [-hw * 0.55, -hd - 13, 1.15 * treeScaleBoost],
            [hw * 0.55, -hd - 13, 1.15 * treeScaleBoost],
          ]
        : isIndustrial || isWarehouse
          ? [
              [-hw - 11.5, -hd - 10.5, 1.2 * treeScaleBoost],
              [hw + 11.5, -hd - 10.5, 1.15 * treeScaleBoost],
              [0, -hd - 11.5, 1.1 * treeScaleBoost],
            ]
          : isSkyscraper || isOffice || isMall
            ? [
                [-hw - 6.2, hd + 8.0, 1.05 * treeScaleBoost],
                [hw + 6.2, hd + 8.0, 1.05 * treeScaleBoost],
                [-hw - 11.5, hd + 8.0, 1.15 * treeScaleBoost],
                [hw + 11.5, hd + 8.0, 1.15 * treeScaleBoost],
                [-hw - 7.2, 0, 1.1 * treeScaleBoost],
                [hw + 7.2, 0, 1.1 * treeScaleBoost],
                [-hw - 6.0, -hd - 5.8, 1.2 * treeScaleBoost],
                [hw + 6.0, -hd - 5.8, 1.2 * treeScaleBoost],
              ]
            : isApartment
              ? [
                  [-hw - 3.6, -hd - 2.0, 1.2 * treeScaleBoost],
                  [-hw - 4.2, 2.5, 1.0 * treeScaleBoost],
                  [hw + 3.6, -hd - 2.0, 1.25 * treeScaleBoost],
                  [hw + 4.2, 2.5, 1.05 * treeScaleBoost],
                  [-hw * 0.65, -hd - 4.5, 1.15 * treeScaleBoost],
                  [0, -hd - 4.8, 1.2 * treeScaleBoost],
                  [hw * 0.65, -hd - 4.5, 1.1 * treeScaleBoost],
                ]
              : isSlum
                ? [
                    [-hw - 3.8, -hd - 1.6, 0.9],
                    [hw + 3.2, -hd - 1.8, 0.8],
                  ]
                : isPark
                  ? [
                      [-hw - 4.4, -hd - 2.6, 1.35],
                      [hw + 4.4, -hd - 2.6, 1.3],
                      [-hw - 5.2, 2.8, 1.15],
                      [hw + 5.2, 2.8, 1.2],
                      [-hw - 3.2, hd + 5.8, 1.05],
                      [hw + 3.2, hd + 5.8, 1.1],
                      [-hw * 0.55, -hd - 5.8, 1.25],
                      [hw * 0.55, -hd - 5.8, 1.28],
                    ]
            : isSportsGround
              ? [
                  [-hw - 3.8, -hd - 4.2, 1.35],
                  [hw + 4.2, -hd - 4.4, 1.35],
                  [-hw - 4.5, 1.5, 1.25],
                  [hw + 6.4, -0.8, 1.25],
                  [-hw * 0.45, -hd - 5.2, 1.4],
                  [hw * 0.45, -hd - 5.2, 1.32],
                ]
              : isAcademic
                ? [
                    [-hw - 4.5, -hd - 3.8, 1.65],
                    [hw + 4.5, -hd - 3.8, 1.65],
                    [-hw - 5.2, 2.2, 1.5],
                    [hw + 5.2, 2.2, 1.5],
                    [-hw * 0.55, hd + 6.4, 1.35],
                    [hw * 0.55, hd + 6.4, 1.35],
                  ]
                : isMarket
                  ? [
                      [-hw - 4.2, -hd - 3.0, 1.3],
                      [hw + 4.2, -hd - 3.0, 1.3],
                      [-hw - 4.6, 2.2, 1.2],
                      [hw + 4.6, 2.2, 1.2],
                    ]
                  : isEarly20c
                    ? [
                        [-hw - 3.6, -hd - 2.2, 1.25],
                        [hw + 3.6, -hd - 2.2, 1.25],
                        [-hw - 4.2, 2.2, 1.1],
                        [hw + 4.2, 2.2, 1.1],
                      ]
                    : isVilla
                      ? [
                          [-hw - 3.4, -hd - 2.5, 1.35],
                          [hw + 3.4, -hd - 2.5, 1.35],
                          [-hw - 3.8, 1.5, 1.25],
                          [hw + 3.8, 1.5, 1.25],
                          [-hw * 0.45, -hd - 3.2, 1.4],
                          [hw * 0.45, -hd - 3.2, 1.32],
                        ]
                      : [
                          [-hw - 3.2, -hd - 1.5, 1.15],
                          [-hw - 4.0, 1.8, 0.9],
                          [hw + 3.5, -hd - 1.8, 1.2],
                          [hw + 3.8, 2.2, 0.95],
                          [-hw - 1.2, -hd - 4.2, 1.05],
                          [hw + 1.6, -hd - 4.0, 0.88],
                        ];

    if (isVilla) {
      // Sculptural slender Mediterranean cypress trees flanking the villa estate
      const cypressGeo1 = trackGeo(new THREE.ConeGeometry(0.68, 4.4, 10));
      const cypressGeo2 = trackGeo(new THREE.ConeGeometry(0.46, 2.8, 10));
      const cypressMat = trackMat(
        new THREE.MeshStandardMaterial({ color: '#3b6647', roughness: 0.82, metalness: 0.0 }),
      );
      for (const [tx, tz, scale] of treeCoords) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 0.75;
        trunk.castShadow = true;

        const c1 = new THREE.Mesh(cypressGeo1, cypressMat);
        c1.position.y = 2.9;
        c1.castShadow = true;
        c1.receiveShadow = true;

        const c2 = new THREE.Mesh(cypressGeo2, cypressMat);
        c2.position.y = 4.6;
        c2.castShadow = true;

        tree.add(trunk, c1, c2);
        tree.position.set(tx, 0, tz);
        tree.scale.setScalar(scale);
        group.add(tree);
      }
    } else {
      for (const [tx, tz, scale] of treeCoords) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 0.75;
        trunk.castShadow = true;

        const c1 = new THREE.Mesh(crownGeo1, foliageMat);
        c1.position.y = 2.0;
        c1.castShadow = true;
        c1.receiveShadow = true;

        const c2 = new THREE.Mesh(crownGeo2, foliageMat);
        c2.position.y = 2.95;
        c2.castShadow = true;

        tree.add(trunk, c1, c2);
        tree.position.set(tx, 0, tz);
        tree.scale.setScalar(scale);
        group.add(tree);
      }
    }
  }

  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    disposables.forEach((t) => t.dispose());
  };

  return { group, dispose };
}
