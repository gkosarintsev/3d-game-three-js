import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampHouseConfig,
  computeHouseMetrics,
  createDefaultConfigForStyle,
  validateProjectName,
} from './houseMetrics';

test('computeHouseMetrics calculates accurate footprint, gross floor area, and ridge height', () => {
  const config = createDefaultConfigForStyle('classic-cottage');
  config.dimensions.width = 10;
  config.dimensions.depth = 8;
  config.dimensions.floors = 2;
  config.dimensions.floorHeight = 3;
  config.dimensions.foundationHeight = 0.5;
  config.dimensions.roofPitchDeg = 45;
  config.features.roofType = 'gable';

  const metrics = computeHouseMetrics(config);
  assert.equal(metrics.footprintAreaM2, 80);
  assert.equal(metrics.grossFloorAreaM2, 160);
  assert.equal(metrics.wallHeightTotalM, 6);
  // tan(45deg) * (8 / 2) = 4.0m
  assert.equal(metrics.roofRiseM, 4);
  assert.equal(metrics.totalRidgeHeightM, 10.5);
});

test('clampHouseConfig enforces parameter bounds and supported roof types', () => {
  const config = createDefaultConfigForStyle('modern-pavilion');
  config.dimensions.width = 100;
  config.dimensions.depth = 1;
  config.dimensions.floors = 10;
  // classic 'hip' is unsupported for modern-pavilion
  config.features.roofType = 'hip';

  const clamped = clampHouseConfig(config);
  assert.equal(clamped.dimensions.width, 16);
  assert.equal(clamped.dimensions.depth, 4.5);
  assert.equal(clamped.dimensions.floors, 2);
  assert.equal(clamped.features.roofType, 'flat');
});

test('validateProjectName rejects empty or short names and trims valid names', () => {
  const emptyResult = validateProjectName('   ');
  assert.equal(emptyResult.valid, false);
  assert.ok(emptyResult.error);

  const shortResult = validateProjectName('А');
  assert.equal(shortResult.valid, false);

  const validResult = validateProjectName('  Мой коттедж  ');
  assert.equal(validResult.valid, true);
  assert.equal(validResult.trimmedName, 'Мой коттедж');
});

test('computeHouseMetrics supports A-frame and Mansard house geometries', () => {
  const aframe = createDefaultConfigForStyle('a-frame');
  const aframeMetrics = computeHouseMetrics(aframe);
  assert.equal(aframeMetrics.wallHeightTotalM, 0.45);
  assert.ok(aframeMetrics.roofRiseM > 5.0);
  assert.ok(aframeMetrics.grossFloorAreaM2 > aframeMetrics.footprintAreaM2);

  const mansard = createDefaultConfigForStyle('mansard-house');
  const mansardMetrics = computeHouseMetrics(mansard);
  assert.ok(mansardMetrics.roofRiseM >= 2.4);
  assert.ok(mansardMetrics.grossFloorAreaM2 > mansardMetrics.footprintAreaM2);
});

test('computeHouseMetrics and clampHouseConfig support multi-story multi-entrance soviet-panel buildings', () => {
  const panel = createDefaultConfigForStyle('soviet-panel');
  panel.dimensions.width = 14.0;
  panel.dimensions.depth = 12.0;
  panel.dimensions.floors = 12;
  panel.dimensions.entrances = 4;
  panel.dimensions.floorHeight = 2.8;
  panel.dimensions.foundationHeight = 0.9;

  const clamped = clampHouseConfig(panel);
  assert.equal(clamped.dimensions.floors, 12);
  assert.equal(clamped.dimensions.entrances, 4);

  const metrics = computeHouseMetrics(clamped);
  assert.equal(metrics.entrances, 4);
  assert.equal(metrics.totalWidthM, 56);
  assert.equal(metrics.footprintAreaM2, 672);
  assert.equal(metrics.grossFloorAreaM2, 8064);
  assert.equal(metrics.wallHeightTotalM, 33.6);
  assert.equal(metrics.totalRidgeHeightM, 35.05);

  // Verify out-of-range floors/entrances clamp cleanly to [3..16] and [1..6]
  panel.dimensions.floors = 99;
  panel.dimensions.entrances = 12;
  const maxClamped = clampHouseConfig(panel);
  assert.equal(maxClamped.dimensions.floors, 16);
  assert.equal(maxClamped.dimensions.entrances, 6);

  panel.dimensions.floors = 1;
  panel.dimensions.entrances = 0;
  const minClamped = clampHouseConfig(panel);
  assert.equal(minClamped.dimensions.floors, 3);
  assert.equal(minClamped.dimensions.entrances, 1);
});

test('computeHouseMetrics and clampHouseConfig support 12-60 story skyscrapers with stepped spire', () => {
  const tower = createDefaultConfigForStyle('skyscraper');
  tower.dimensions.width = 24;
  tower.dimensions.depth = 20;
  tower.dimensions.floors = 45;
  tower.dimensions.floorHeight = 3.6;
  tower.dimensions.foundationHeight = 1.2;
  tower.features.roofType = 'stepped';
  tower.features.hasChimney = true;

  const clamped = clampHouseConfig(tower);
  assert.equal(clamped.dimensions.floors, 45);
  assert.equal(clamped.dimensions.entrances, 1);
  assert.equal(clamped.features.roofType, 'stepped');

  const metrics = computeHouseMetrics(clamped);
  assert.equal(metrics.footprintAreaM2, 480);
  // 480 * (45 * 0.84) = 18144
  assert.equal(metrics.grossFloorAreaM2, 18144);
  assert.equal(metrics.wallHeightTotalM, 162);
  // Stepped crown (4.2) + spire (162 * 0.16 = 25.92) = 30.12
  assert.equal(metrics.roofRiseM, 30.12);
  assert.equal(metrics.totalRidgeHeightM, 193.32);

  // Verify out-of-range floors clamp cleanly to [12..60]
  tower.dimensions.floors = 4;
  assert.equal(clampHouseConfig(tower).dimensions.floors, 12);
  tower.dimensions.floors = 120;
  assert.equal(clampHouseConfig(tower).dimensions.floors, 60);
});

test('computeHouseMetrics and clampHouseConfig support Cyberpunk 2077 megabuilding constraints and massing', () => {
  const mega = createDefaultConfigForStyle('megabuilding');
  mega.dimensions.width = 40;
  mega.dimensions.depth = 34;
  mega.dimensions.floors = 42;
  mega.dimensions.floorHeight = 3.3;
  mega.dimensions.foundationHeight = 2.5;
  mega.features.roofType = 'stepped';
  mega.features.hasChimney = true;

  const clamped = clampHouseConfig(mega);
  assert.equal(clamped.dimensions.floors, 42);
  assert.equal(clamped.dimensions.width, 40);

  const metrics = computeHouseMetrics(clamped);
  assert.equal(metrics.footprintAreaM2, 1360);
  // 1360 * (42 * 0.76) = 43411.2
  assert.equal(metrics.grossFloorAreaM2, 43411.2);
  assert.equal(metrics.wallHeightTotalM, 138.6);
  // Stepped crown (6.5) + relay mast (138.6 * 0.16 = 22.18) = 28.68
  assert.equal(metrics.roofRiseM, 28.68);
  assert.equal(metrics.totalRidgeHeightM, 169.78);

  // Verify out-of-range floors/width clamp cleanly to [16..64] and [26..56]
  mega.dimensions.floors = 5;
  mega.dimensions.width = 10;
  const minClamped = clampHouseConfig(mega);
  assert.equal(minClamped.dimensions.floors, 16);
  assert.equal(minClamped.dimensions.width, 26);

  mega.dimensions.floors = 120;
  mega.dimensions.width = 90;
  const maxClamped = clampHouseConfig(mega);
  assert.equal(maxClamped.dimensions.floors, 64);
  assert.equal(maxClamped.dimensions.width, 56);
});

test('computeHouseMetrics and clampHouseConfig support corporate office-building constraints and roof options', () => {
  const office = createDefaultConfigForStyle('office-building');
  office.dimensions.width = 30;
  office.dimensions.depth = 18;
  office.dimensions.floors = 8;
  office.dimensions.floorHeight = 3.8;
  office.dimensions.foundationHeight = 0.7;
  office.features.roofType = 'flat';
  office.features.hasChimney = true;

  const clamped = clampHouseConfig(office);
  assert.equal(clamped.dimensions.floors, 8);
  assert.equal(clamped.dimensions.width, 30);

  const flatMetrics = computeHouseMetrics(clamped);
  assert.equal(flatMetrics.footprintAreaM2, 540);
  assert.equal(flatMetrics.grossFloorAreaM2, 4320);
  assert.equal(flatMetrics.wallHeightTotalM, 30.4);
  // flat crown (0.9) + rooftop mechanical penthouse (1.8) = 2.7
  assert.equal(flatMetrics.roofRiseM, 2.7);
  assert.equal(flatMetrics.totalRidgeHeightM, 33.8);

  // Stepped office terrace applies 0.88 floor fill factor
  office.features.roofType = 'stepped';
  const steppedMetrics = computeHouseMetrics(office);
  assert.equal(steppedMetrics.grossFloorAreaM2, 3801.6);

  // Verify out-of-range floors/width clamp cleanly to [3..18] and [18..46]
  office.dimensions.floors = 1;
  office.dimensions.width = 10;
  const minClamped = clampHouseConfig(office);
  assert.equal(minClamped.dimensions.floors, 3);
  assert.equal(minClamped.dimensions.width, 18);

  office.dimensions.floors = 40;
  office.dimensions.width = 80;
  const maxClamped = clampHouseConfig(office);
  assert.equal(maxClamped.dimensions.floors, 18);
  assert.equal(maxClamped.dimensions.width, 46);
});

test('computeHouseMetrics and clampHouseConfig support slum-shack favela constraints and roof modes', () => {
  const slum = createDefaultConfigForStyle('slum-shack');
  slum.dimensions.width = 8.4;
  slum.dimensions.depth = 7.0;
  slum.dimensions.floors = 2;
  slum.dimensions.floorHeight = 2.6;
  slum.dimensions.foundationHeight = 0.35;
  slum.features.roofType = 'flat';
  slum.features.hasChimney = true;

  const clamped = clampHouseConfig(slum);
  assert.equal(clamped.dimensions.floors, 2);
  assert.equal(clamped.materials.wallMaterial, 'corrugated');

  const flatMetrics = computeHouseMetrics(clamped);
  assert.equal(flatMetrics.footprintAreaM2, 58.8);
  assert.equal(flatMetrics.grossFloorAreaM2, 117.6);
  assert.equal(flatMetrics.wallHeightTotalM, 5.2);
  // flat roof base (0.45) + water tank/stovepipe (1.35) = 1.8
  assert.equal(flatMetrics.roofRiseM, 1.8);
  assert.equal(flatMetrics.totalRidgeHeightM, 7.35);

  // Stepped slum shack adds rooftop cabin (+0.45 effective floors, rounded to 1 decimal)
  slum.features.roofType = 'stepped';
  const steppedMetrics = computeHouseMetrics(slum);
  assert.equal(steppedMetrics.grossFloorAreaM2, 144.1);

  // Verify out-of-range floors/width clamp cleanly to [1..4] and [5.5..14.0]
  slum.dimensions.floors = 0;
  slum.dimensions.width = 2;
  const minClamped = clampHouseConfig(slum);
  assert.equal(minClamped.dimensions.floors, 1);
  assert.equal(minClamped.dimensions.width, 5.5);

  slum.dimensions.floors = 12;
  slum.dimensions.width = 30;
  const maxClamped = clampHouseConfig(slum);
  assert.equal(maxClamped.dimensions.floors, 4);
  assert.equal(maxClamped.dimensions.width, 14);
});

test('computeHouseMetrics and clampHouseConfig support factory industrial constraints and smokestack ridge height', () => {
  const factory = createDefaultConfigForStyle('factory');
  factory.dimensions.width = 28;
  factory.dimensions.depth = 18;
  factory.dimensions.floors = 2;
  factory.dimensions.floorHeight = 4.4;
  factory.dimensions.foundationHeight = 0.75;
  factory.features.roofType = 'flat';
  factory.features.hasChimney = true;

  const clamped = clampHouseConfig(factory);
  assert.equal(clamped.dimensions.floors, 2);
  assert.equal(clamped.materials.wallMaterial, 'brick');

  const flatMetrics = computeHouseMetrics(clamped);
  assert.equal(flatMetrics.footprintAreaM2, 504);
  assert.equal(flatMetrics.grossFloorAreaM2, 1008);
  assert.equal(flatMetrics.wallHeightTotalM, 8.8);
  // flat roof base (1.45) * 0.4 + smokestack (max(5.5, 8.8 * 0.65 = 5.72)) = 0.58 + 5.72 = 6.3
  assert.equal(flatMetrics.roofRiseM, 6.3);
  assert.equal(flatMetrics.totalRidgeHeightM, 15.85);

  // Sawtooth ('stepped') roof without smokestack computes sawtooth bay rise cleanly
  factory.features.roofType = 'stepped';
  factory.features.hasChimney = false;
  const sawtoothMetrics = computeHouseMetrics(factory);
  assert.ok(sawtoothMetrics.roofRiseM >= 1.8);

  // Clamp bounds [1..4] floors and [18..52] width
  factory.dimensions.floors = 0;
  factory.dimensions.width = 5;
  const minClamped = clampHouseConfig(factory);
  assert.equal(minClamped.dimensions.floors, 1);
  assert.equal(minClamped.dimensions.width, 18);

  factory.dimensions.floors = 10;
  factory.dimensions.width = 100;
  const maxClamped = clampHouseConfig(factory);
  assert.equal(maxClamped.dimensions.floors, 4);
  assert.equal(maxClamped.dimensions.width, 52);
});

test('computeHouseMetrics and clampHouseConfig support blast-furnace constraints and unified height metrics', () => {
  const furnace = createDefaultConfigForStyle('blast-furnace');
  furnace.dimensions.width = 24;
  furnace.dimensions.depth = 20;
  furnace.dimensions.floors = 4;
  furnace.dimensions.floorHeight = 5.8;
  furnace.dimensions.foundationHeight = 0.85;
  furnace.features.roofType = 'stepped';
  furnace.features.hasChimney = true;

  const clamped = clampHouseConfig(furnace);
  assert.equal(clamped.dimensions.floors, 4);
  assert.equal(clamped.materials.wallMaterial, 'curtain');

  const metrics = computeHouseMetrics(clamped);
  assert.equal(metrics.footprintAreaM2, 480);
  assert.equal(metrics.grossFloorAreaM2, 1920);
  assert.equal(metrics.wallHeightTotalM, 23.2);
  // smokestackExtra = 23.2 * 0.45 = 10.44 (> crownH 5.8)
  assert.equal(metrics.roofRiseM, 10.44);
  assert.equal(metrics.totalRidgeHeightM, 34.49);

  // Clamp bounds [2..5] tiers and [18..42] width
  furnace.dimensions.floors = 1;
  furnace.dimensions.width = 5;
  const minClamped = clampHouseConfig(furnace);
  assert.equal(minClamped.dimensions.floors, 2);
  assert.equal(minClamped.dimensions.width, 18);

  furnace.dimensions.floors = 12;
  furnace.dimensions.width = 80;
  const maxClamped = clampHouseConfig(furnace);
  assert.equal(maxClamped.dimensions.floors, 5);
  assert.equal(maxClamped.dimensions.width, 42);
});

test('computeHouseMetrics and clampHouseConfig support park-pavilion constraints and roof modes', () => {
  const park = createDefaultConfigForStyle('park-pavilion');
  park.dimensions.width = 10;
  park.dimensions.depth = 8;
  park.dimensions.floors = 1;
  park.dimensions.floorHeight = 3.6;
  park.dimensions.foundationHeight = 0.5;
  park.dimensions.roofPitchDeg = 45;
  park.features.roofType = 'hip';
  park.features.hasChimney = true;

  const clamped = clampHouseConfig(park);
  assert.equal(clamped.dimensions.floors, 1);
  assert.equal(clamped.materials.wallMaterial, 'timber');

  const hipMetrics = computeHouseMetrics(clamped);
  assert.equal(hipMetrics.footprintAreaM2, 80);
  assert.equal(hipMetrics.grossFloorAreaM2, 80);
  // tan(45deg)*(8/2) + finial lantern (1.25) = 5.25
  assert.equal(hipMetrics.roofRiseM, 5.25);
  assert.equal(hipMetrics.totalRidgeHeightM, 9.35);

  // Stepped rotunda dome roof rise
  park.features.roofType = 'stepped';
  const rotundaMetrics = computeHouseMetrics(park);
  assert.ok(rotundaMetrics.roofRiseM >= 3.8);

  // Clamp bounds [1..2] floors and [6.5..18.0] width
  park.dimensions.floors = 0;
  park.dimensions.width = 3;
  const minClamped = clampHouseConfig(park);
  assert.equal(minClamped.dimensions.floors, 1);
  assert.equal(minClamped.dimensions.width, 6.5);

  park.dimensions.floors = 6;
  park.dimensions.width = 40;
  const maxClamped = clampHouseConfig(park);
  assert.equal(maxClamped.dimensions.floors, 2);
  assert.equal(maxClamped.dimensions.width, 18);
});

test('computeHouseMetrics and clampHouseConfig support villa constraints and roof modes', () => {
  const villa = createDefaultConfigForStyle('villa');
  villa.dimensions.width = 20;
  villa.dimensions.depth = 14;
  villa.dimensions.floors = 2;
  villa.dimensions.floorHeight = 3.5;
  villa.dimensions.foundationHeight = 0.5;
  villa.dimensions.roofPitchDeg = 20;
  villa.features.roofType = 'hip';
  villa.features.hasChimney = true;

  const clamped = clampHouseConfig(villa);
  assert.equal(clamped.dimensions.floors, 2);
  assert.equal(clamped.materials.wallMaterial, 'stucco');
  assert.equal(clamped.materials.roofMaterial, 'terracotta');

  const hipMetrics = computeHouseMetrics(clamped);
  assert.equal(hipMetrics.footprintAreaM2, 280);
  assert.equal(hipMetrics.grossFloorAreaM2, 560);
  assert.equal(hipMetrics.wallHeightTotalM, 7);
  // mainSpan = min(20*0.62=12.4, 14*0.78=10.92) = 10.92; tan(20deg)*5.46 + 0.75 = 1.987 + 0.75 = 2.74
  assert.equal(hipMetrics.roofRiseM, 2.74);
  assert.equal(hipMetrics.totalRidgeHeightM, 10.24);

  // Flat modernist villa roof mode
  villa.features.roofType = 'flat';
  const flatMetrics = computeHouseMetrics(villa);
  assert.equal(flatMetrics.roofRiseM, 1.2);

  // Clamp bounds [1..3] floors and [14..28] width
  villa.dimensions.floors = 0;
  villa.dimensions.width = 6;
  const minClamped = clampHouseConfig(villa);
  assert.equal(minClamped.dimensions.floors, 1);
  assert.equal(minClamped.dimensions.width, 14);

  villa.dimensions.floors = 8;
  villa.dimensions.width = 50;
  const maxClamped = clampHouseConfig(villa);
  assert.equal(maxClamped.dimensions.floors, 3);
  assert.equal(maxClamped.dimensions.width, 28);
});

test('computeHouseMetrics and clampHouseConfig support stadium constraints and roof modes', () => {
  const stadium = createDefaultConfigForStyle('stadium');
  stadium.dimensions.width = 82;
  stadium.dimensions.depth = 64;
  stadium.dimensions.floors = 2;
  stadium.dimensions.floorHeight = 5.4;
  stadium.dimensions.foundationHeight = 1.8;
  stadium.dimensions.roofPitchDeg = 14;
  stadium.features.roofType = 'stepped';
  stadium.features.hasChimney = true;

  const clamped = clampHouseConfig(stadium);
  assert.equal(clamped.dimensions.floors, 2);
  assert.equal(clamped.materials.wallMaterial, 'concrete');
  assert.equal(clamped.materials.roofMaterial, 'membrane');

  const steppedMetrics = computeHouseMetrics(clamped);
  assert.equal(steppedMetrics.footprintAreaM2, 5248);
  assert.equal(steppedMetrics.grossFloorAreaM2, 10496);
  assert.equal(steppedMetrics.wallHeightTotalM, 10.8);
  // Floodlight mast extra = max(9.5, 10.8 * 0.72 + 4.5 = 12.276) + 1.1 = 13.38
  assert.equal(steppedMetrics.roofRiseM, 13.38);
  assert.equal(steppedMetrics.totalRidgeHeightM, 25.98);

  // Domed hip arena without floodlights uses dome rise
  stadium.features.roofType = 'hip';
  stadium.features.hasChimney = false;
  const hipMetrics = computeHouseMetrics(stadium);
  assert.ok(hipMetrics.roofRiseM > 4.5);

  // Clamp bounds [1..3] tiers and [56..120] width, [44..96] depth
  stadium.dimensions.floors = 0;
  stadium.dimensions.width = 20;
  stadium.dimensions.depth = 20;
  const minClamped = clampHouseConfig(stadium);
  assert.equal(minClamped.dimensions.floors, 1);
  assert.equal(minClamped.dimensions.width, 56);
  assert.equal(minClamped.dimensions.depth, 44);

  stadium.dimensions.floors = 7;
  stadium.dimensions.width = 200;
  stadium.dimensions.depth = 150;
  const maxClamped = clampHouseConfig(stadium);
  assert.equal(maxClamped.dimensions.floors, 3);
  assert.equal(maxClamped.dimensions.width, 120);
  assert.equal(maxClamped.dimensions.depth, 96);
});

test('computeHouseMetrics and clampHouseConfig support parking-booth constraints and roof modes', () => {
  const booth = createDefaultConfigForStyle('parking-booth');
  booth.dimensions.width = 3.2;
  booth.dimensions.depth = 2.6;
  booth.dimensions.floorHeight = 2.7;
  booth.dimensions.foundationHeight = 0.25;
  booth.features.roofType = 'flat';
  booth.features.hasChimney = true;

  const clamped = clampHouseConfig(booth);
  assert.equal(clamped.dimensions.floors, 1);
  assert.equal(clamped.materials.wallMaterial, 'panel');

  const flatMetrics = computeHouseMetrics(clamped);
  assert.equal(flatMetrics.footprintAreaM2, 8.3);
  assert.equal(flatMetrics.grossFloorAreaM2, 8.3);
  assert.equal(flatMetrics.wallHeightTotalM, 2.7);
  // flat roof (0.25) + strobe beacon (0.28) = 0.53
  assert.equal(flatMetrics.roofRiseM, 0.53);
  assert.equal(flatMetrics.totalRidgeHeightM, 3.48);

  // Full lane canopy ('stepped') elevates canopy clearance to 3.15m
  booth.features.roofType = 'stepped';
  const laneMetrics = computeHouseMetrics(booth);
  assert.ok(laneMetrics.roofRiseM > 0.8);

  // Clamp bounds [1..1] floors and [2.2..4.6] width, [2.0..4.0] depth
  booth.dimensions.floors = 3;
  booth.dimensions.width = 1.0;
  booth.dimensions.depth = 1.0;
  const minClamped = clampHouseConfig(booth);
  assert.equal(minClamped.dimensions.floors, 1);
  assert.equal(minClamped.dimensions.width, 2.2);
  assert.equal(minClamped.dimensions.depth, 2.0);

  booth.dimensions.width = 12.0;
  booth.dimensions.depth = 10.0;
  const maxClamped = clampHouseConfig(booth);
  assert.equal(maxClamped.dimensions.width, 4.6);
  assert.equal(maxClamped.dimensions.depth, 4.0);
});

test('computeHouseMetrics and clampHouseConfig support sports-ground constraints and roof modes', () => {
  const sports = createDefaultConfigForStyle('sports-ground');
  sports.dimensions.width = 24;
  sports.dimensions.depth = 14;
  sports.dimensions.floorHeight = 3.2;
  sports.dimensions.foundationHeight = 0.28;
  sports.features.roofType = 'flat';
  sports.features.hasChimney = true;

  const clamped = clampHouseConfig(sports);
  assert.equal(clamped.dimensions.floors, 1);
  assert.equal(clamped.materials.wallMaterial, 'stucco');

  const openMetrics = computeHouseMetrics(clamped);
  assert.equal(openMetrics.footprintAreaM2, 336);
  assert.equal(openMetrics.grossFloorAreaM2, 336);
  assert.equal(openMetrics.wallHeightTotalM, 3.2);
  // Floodlight mast extra = 2.6
  assert.equal(openMetrics.roofRiseM, 2.6);
  assert.equal(openMetrics.totalRidgeHeightM, 6.08);
  // Open-air court uses 0.14 wallFillFactor for volume
  assert.ok(openMetrics.estimatedVolumeM3 < 500);

  // Covered all-weather canopy ('gable') elevates ridge height above fence
  sports.features.roofType = 'gable';
  const canopyMetrics = computeHouseMetrics(sports);
  assert.ok(canopyMetrics.roofRiseM >= 3.4);

  // Clamp bounds [14..36] width and [10..24] depth
  sports.dimensions.width = 5;
  sports.dimensions.depth = 3;
  const minClamped = clampHouseConfig(sports);
  assert.equal(minClamped.dimensions.width, 14);
  assert.equal(minClamped.dimensions.depth, 10);

  sports.dimensions.width = 60;
  sports.dimensions.depth = 40;
  const maxClamped = clampHouseConfig(sports);
  assert.equal(maxClamped.dimensions.width, 36);
  assert.equal(maxClamped.dimensions.depth, 24);
});

test('computeHouseMetrics and clampHouseConfig support early-20c-house constraints and roof modes', () => {
  const house = createDefaultConfigForStyle('early-20c-house');
  house.dimensions.width = 16;
  house.dimensions.depth = 11;
  house.dimensions.floors = 3;
  house.dimensions.floorHeight = 3.4;
  house.dimensions.foundationHeight = 0.7;
  house.dimensions.roofPitchDeg = 32;
  house.features.roofType = 'mansard';
  house.features.hasChimney = true;

  const clamped = clampHouseConfig(house);
  assert.equal(clamped.dimensions.floors, 3);
  assert.equal(clamped.materials.wallMaterial, 'brick');

  const mansardMetrics = computeHouseMetrics(clamped);
  assert.equal(mansardMetrics.footprintAreaM2, 176);
  // Mansard attic adds +0.75 effective floors: 176 * 3.75 = 660
  assert.equal(mansardMetrics.grossFloorAreaM2, 660);
  assert.equal(mansardMetrics.wallHeightTotalM, 10.2);
  assert.ok(mansardMetrics.roofRiseM >= 3.5);

  // Clamp bounds [2..4] floors and [11..24] width
  house.dimensions.floors = 1;
  house.dimensions.width = 4;
  const minClamped = clampHouseConfig(house);
  assert.equal(minClamped.dimensions.floors, 2);
  assert.equal(minClamped.dimensions.width, 11);

  house.dimensions.floors = 9;
  house.dimensions.width = 40;
  const maxClamped = clampHouseConfig(house);
  assert.equal(maxClamped.dimensions.floors, 4);
  assert.equal(maxClamped.dimensions.width, 24);
});

test('computeHouseMetrics and clampHouseConfig support academic-building constraints and roof modes', () => {
  const academic = createDefaultConfigForStyle('academic-building');
  academic.dimensions.width = 40;
  academic.dimensions.depth = 18;
  academic.dimensions.floors = 3;
  academic.dimensions.floorHeight = 3.7;
  academic.dimensions.foundationHeight = 0.85;
  academic.features.roofType = 'flat';
  academic.features.hasChimney = true;

  const clamped = clampHouseConfig(academic);
  assert.equal(clamped.dimensions.floors, 3);
  assert.equal(clamped.materials.wallMaterial, 'stucco');

  const flatMetrics = computeHouseMetrics(clamped);
  assert.equal(flatMetrics.footprintAreaM2, 720);
  assert.equal(flatMetrics.grossFloorAreaM2, 2160);
  assert.equal(flatMetrics.wallHeightTotalM, 11.1);
  // 0.98 + (5.95 - 0.35) = 6.58
  assert.equal(flatMetrics.roofRiseM, 6.58);
  assert.equal(flatMetrics.totalRidgeHeightM, 18.53);

  // Clamp bounds [2..5] floors and [24..54] width
  academic.dimensions.floors = 1;
  academic.dimensions.width = 10;
  const minClamped = clampHouseConfig(academic);
  assert.equal(minClamped.dimensions.floors, 2);
  assert.equal(minClamped.dimensions.width, 24);

  academic.dimensions.floors = 12;
  academic.dimensions.width = 120;
  const maxClamped = clampHouseConfig(academic);
  assert.equal(maxClamped.dimensions.floors, 5);
  assert.equal(maxClamped.dimensions.width, 54);
});

test('computeHouseMetrics and clampHouseConfig support market-pavilion constraints and roof modes', () => {
  const market = createDefaultConfigForStyle('market-pavilion');
  market.dimensions.width = 22;
  market.dimensions.depth = 13;
  market.dimensions.floorHeight = 4.6;
  market.dimensions.foundationHeight = 0.45;
  market.features.roofType = 'flat';
  market.features.hasChimney = true;

  const clamped = clampHouseConfig(market);
  assert.equal(clamped.dimensions.floors, 1);
  assert.equal(clamped.materials.wallMaterial, 'brick');

  const flatMetrics = computeHouseMetrics(clamped);
  assert.equal(flatMetrics.footprintAreaM2, 286);
  assert.equal(flatMetrics.grossFloorAreaM2, 286);
  assert.equal(flatMetrics.wallHeightTotalM, 4.6);
  // flat base (1.08) + lantern (2.05) = 3.13
  assert.equal(flatMetrics.roofRiseM, 3.13);
  assert.equal(flatMetrics.totalRidgeHeightM, 8.18);

  // Clamp bounds [1..1] floors and [12..32] width
  market.dimensions.floors = 4;
  market.dimensions.width = 5;
  const minClamped = clampHouseConfig(market);
  assert.equal(minClamped.dimensions.floors, 1);
  assert.equal(minClamped.dimensions.width, 12);

  market.dimensions.width = 80;
  const maxClamped = clampHouseConfig(market);
  assert.equal(maxClamped.dimensions.width, 32);
});

test('computeHouseMetrics and clampHouseConfig support market-row constraints and roof modes', () => {
  const row = createDefaultConfigForStyle('market-row');
  row.dimensions.width = 24;
  row.dimensions.depth = 6.0;
  row.dimensions.floorHeight = 3.4;
  row.dimensions.foundationHeight = 0.25;
  row.features.roofType = 'flat';
  row.features.hasChimney = true;

  const clamped = clampHouseConfig(row);
  assert.equal(clamped.dimensions.floors, 1);
  assert.equal(clamped.materials.wallMaterial, 'brick');

  const flatMetrics = computeHouseMetrics(clamped);
  assert.equal(flatMetrics.footprintAreaM2, 144);
  assert.equal(flatMetrics.grossFloorAreaM2, 144);
  assert.equal(flatMetrics.wallHeightTotalM, 3.4);
  // flat base (0.95) + flueExtra (1.15) = 2.1
  assert.equal(flatMetrics.roofRiseM, 2.1);
  assert.equal(flatMetrics.totalRidgeHeightM, 5.75);

  row.dimensions.floors = 3;
  row.dimensions.width = 4;
  row.dimensions.depth = 1.5;
  const minClamped = clampHouseConfig(row);
  assert.equal(minClamped.dimensions.floors, 1);
  assert.equal(minClamped.dimensions.width, 14);
  assert.equal(minClamped.dimensions.depth, 4.2);

  row.dimensions.width = 60;
  row.dimensions.depth = 20;
  const maxClamped = clampHouseConfig(row);
  assert.equal(maxClamped.dimensions.width, 38);
  assert.equal(maxClamped.dimensions.depth, 9);
});

test('computeHouseMetrics and clampHouseConfig support shopping-mall constraints and roof modes', () => {
  const mall = createDefaultConfigForStyle('shopping-mall');
  mall.dimensions.width = 52;
  mall.dimensions.depth = 34;
  mall.dimensions.floors = 3;
  mall.dimensions.floorHeight = 4.8;
  mall.dimensions.foundationHeight = 0.65;
  mall.features.roofType = 'flat';
  mall.features.hasChimney = true;

  const clamped = clampHouseConfig(mall);
  assert.equal(clamped.dimensions.floors, 3);
  assert.equal(clamped.materials.wallMaterial, 'panel');

  const flatMetrics = computeHouseMetrics(clamped);
  assert.equal(flatMetrics.footprintAreaM2, 1768);
  assert.equal(flatMetrics.grossFloorAreaM2, 5304);
  assert.equal(flatMetrics.wallHeightTotalM, 14.4);
  // flat atrium skylight (2.35) + hvacCrown (1.4) = 3.75
  assert.equal(flatMetrics.roofRiseM, 3.75);
  assert.equal(flatMetrics.totalRidgeHeightM, 18.8);

  mall.dimensions.floors = 1;
  mall.dimensions.width = 10;
  const minClamped = clampHouseConfig(mall);
  assert.equal(minClamped.dimensions.floors, 2);
  assert.equal(minClamped.dimensions.width, 34);

  mall.dimensions.floors = 12;
  mall.dimensions.width = 120;
  const maxClamped = clampHouseConfig(mall);
  assert.equal(maxClamped.dimensions.floors, 5);
  assert.equal(maxClamped.dimensions.width, 76);
});

test('computeHouseMetrics and clampHouseConfig support warehouse constraints and roof modes', () => {
  const wh = createDefaultConfigForStyle('warehouse');
  wh.dimensions.width = 44;
  wh.dimensions.depth = 26;
  wh.dimensions.floors = 1;
  wh.dimensions.floorHeight = 7.2;
  wh.dimensions.foundationHeight = 1.15;
  wh.features.roofType = 'flat';
  wh.features.hasChimney = true;

  const clamped = clampHouseConfig(wh);
  assert.equal(clamped.dimensions.floors, 1);
  assert.equal(clamped.materials.wallMaterial, 'corrugated');

  const flatMetrics = computeHouseMetrics(clamped);
  assert.equal(flatMetrics.footprintAreaM2, 1144);
  assert.equal(flatMetrics.grossFloorAreaM2, 1144);
  assert.equal(flatMetrics.wallHeightTotalM, 7.2);
  // flat base (0.95) + ventExtra (0.95) = 1.9
  assert.equal(flatMetrics.roofRiseM, 1.9);
  assert.equal(flatMetrics.totalRidgeHeightM, 10.25);

  wh.dimensions.floors = 0;
  wh.dimensions.width = 10;
  const minClamped = clampHouseConfig(wh);
  assert.equal(minClamped.dimensions.floors, 1);
  assert.equal(minClamped.dimensions.width, 24);

  wh.dimensions.floors = 5;
  wh.dimensions.width = 100;
  const maxClamped = clampHouseConfig(wh);
  assert.equal(maxClamped.dimensions.floors, 2);
  assert.equal(maxClamped.dimensions.width, 68);
});




