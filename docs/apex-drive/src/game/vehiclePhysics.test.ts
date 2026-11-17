import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialVehicleState,
  stepVehiclePhysics,
  VehicleInput,
} from './vehiclePhysics';
import { BARRIER_HALF_WIDTH, findNearestTrackPoint, getSurfaceAt } from './trackData';

const IDLE_INPUT: VehicleInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
};

test('car survives first seconds without input on flat asphalt', () => {
  const car = createInitialVehicleState();
  const startZ = car.z;
  for (let i = 0; i < 120; i++) {
    stepVehiclePhysics(car, IDLE_INPUT, 'sport', 1 / 60);
  }
  assert.ok(Math.abs(car.z - startZ) < 0.05);
  assert.ok(car.speedKmh < 0.5);
  assert.equal(car.grounded, true);
  assert.equal(car.surface, 'asphalt');
});

test('throttle accelerates forward along -Z and shifts gears upward', () => {
  const car = createInitialVehicleState();
  const startZ = car.z;
  for (let i = 0; i < 240; i++) {
    stepVehiclePhysics(car, { ...IDLE_INPUT, throttle: 1 }, 'sport', 1 / 60);
  }
  assert.ok(car.z < startZ - 30, `expected car to move forward along -Z, got z=${car.z}`);
  assert.ok(car.speedKmh > 90, `expected speed > 90 km/h, got ${car.speedKmh}`);
  assert.ok(car.gear >= 2, `expected upshift >= 2nd gear, got gear=${car.gear}`);
});

test('steering left turns yaw positive, moves left (-X), and rolls chassis outward', () => {
  const car = createInitialVehicleState();
  // First accelerate to 60 km/h
  for (let i = 0; i < 90; i++) {
    stepVehiclePhysics(car, { ...IDLE_INPUT, throttle: 1 }, 'sport', 1 / 60);
  }
  // Steer left
  for (let i = 0; i < 45; i++) {
    stepVehiclePhysics(car, { ...IDLE_INPUT, throttle: 0.6, steer: 1 }, 'sport', 1 / 60);
  }
  assert.ok(car.yaw > 0.25, `expected positive yaw when steering left, got ${car.yaw}`);
  assert.ok(car.x < -1.0, `expected car to turn left (-X), got x=${car.x}`);
  assert.ok(car.roll < -0.01, `expected body roll right (< 0) when turning left, got ${car.roll}`);
});

test('braking slows down moving car and engages reverse from standstill', () => {
  const car = createInitialVehicleState();
  for (let i = 0; i < 90; i++) {
    stepVehiclePhysics(car, { ...IDLE_INPUT, throttle: 1 }, 'sport', 1 / 60);
  }
  const peakSpeed = car.speedKmh;
  for (let i = 0; i < 45; i++) {
    stepVehiclePhysics(car, { ...IDLE_INPUT, brake: 1 }, 'sport', 1 / 60);
  }
  assert.ok(car.speedKmh < peakSpeed * 0.65, `expected strong braking, speed=${car.speedKmh}`);
  assert.equal(car.brakingLights, true);

  // Fresh stationary car reversing
  const revCar = createInitialVehicleState();
  const startZ = revCar.z;
  for (let i = 0; i < 90; i++) {
    stepVehiclePhysics(revCar, { ...IDLE_INPUT, brake: 1 }, 'sport', 1 / 60);
  }
  assert.equal(revCar.gear, -1);
  assert.equal(revCar.reversingLights, true);
  assert.ok(revCar.z > startZ + 1.5, `expected reverse along +Z, got z=${revCar.z}`);
});

test('handbrake drift induces rear slip and drift score in drift mode', () => {
  const car = createInitialVehicleState();
  for (let i = 0; i < 100; i++) {
    stepVehiclePhysics(car, { ...IDLE_INPUT, throttle: 1 }, 'drift', 1 / 60);
  }
  for (let i = 0; i < 40; i++) {
    stepVehiclePhysics(
      car,
      { throttle: 0.8, brake: 0, steer: 1, handbrake: true },
      'drift',
      1 / 60
    );
  }
  assert.ok(car.rearSlip > 0.35, `expected rear slip > 0.35, got ${car.rearSlip}`);
  assert.ok(car.activeDriftPoints > 0 || car.driftScore > 0);
});

test('ramp surface elevates car and launches airborne briefly', () => {
  const rampCheck = getSurfaceAt(3.4, -31.5);
  assert.equal(rampCheck.surface, 'ramp');
  assert.ok(rampCheck.height > 0.6);

  const car = createInitialVehicleState();
  car.x = 3.4;
  car.z = -15;
  car.vz = -28; // ~100 km/h toward ramp at z=-28
  let maxH = 0;
  let sawAirborne = false;
  for (let i = 0; i < 90; i++) {
    stepVehiclePhysics(car, { ...IDLE_INPUT, throttle: 1 }, 'sport', 1 / 60);
    if (car.y > maxH) maxH = car.y;
    if (!car.grounded) sawAirborne = true;
  }
  assert.ok(maxH > 0.6, `expected car CG to climb ramp > 0.6m, got ${maxH}`);
  assert.equal(sawAirborne, true, 'expected car to launch airborne off ramp');
});

test('perimeter barrier keeps car within track corridor', () => {
  const car = createInitialVehicleState();
  car.x = 20; // well outside barrier
  car.vx = 15;
  stepVehiclePhysics(car, IDLE_INPUT, 'sport', 1 / 60);
  const nearest = findNearestTrackPoint(car.x, car.z);
  assert.ok(Math.abs(nearest.signedOffset) <= BARRIER_HALF_WIDTH + 0.01);
});
