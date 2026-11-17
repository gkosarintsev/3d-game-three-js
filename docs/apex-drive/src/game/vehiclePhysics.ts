import {
  BARRIER_HALF_WIDTH,
  CHECKPOINTS,
  ConeObstacle,
  createInitialCones,
  findNearestTrackPoint,
  getSurfaceAt,
  INITIAL_SPAWN,
  SurfaceType,
} from './trackData';

export type DrivingMode = 'sport' | 'drift' | 'track';
export type CameraMode = 'third_person' | 'first_person' | 'hood';

export interface VehicleInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (right) .. +1 (left)
  handbrake: boolean;
}

export interface VehicleState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  yawRate: number;
  pitch: number;
  pitchVel: number;
  roll: number;
  rollVel: number;
  steerAngle: number;
  wheelSpin: number;
  wheelCompressions: [number, number, number, number]; // FL, FR, RL, RR (-0.12..+0.12 m)
  grounded: boolean;
  speedKmh: number;
  forwardSpeed: number;
  lateralSpeed: number;
  rpm: number;
  gear: number; // -1 = R, 0 = N, 1..6
  shiftTimer: number;
  rearSlip: number; // 0..1+ for smoke/audio
  brakingLights: boolean;
  reversingLights: boolean;
  surface: SurfaceType;
  absActive: boolean;
  tcsActive: boolean;
  driftScore: number;
  activeDriftPoints: number;
  totalDistance: number;
  // Lap tracking
  lap: number;
  nextCheckpoint: number;
  lapTime: number;
  bestLapTime: number | null;
  lastLapTime: number | null;
  // Obstacles
  cones: ConeObstacle[];
  impactIntensity: number; // decayed 0..1 for camera trauma & audio
}

interface ModeSpec {
  engineTorqueMul: number;
  frontGrip: number;
  rearGrip: number;
  handbrakeRearGrip: number;
  tcsEnabled: boolean;
  suspensionStiffness: number;
  suspensionDamping: number;
  maxSteer: number;
}

const MODE_SPECS: Record<DrivingMode, ModeSpec> = {
  sport: {
    engineTorqueMul: 1.0,
    frontGrip: 1.12,
    rearGrip: 1.08,
    handbrakeRearGrip: 0.24,
    tcsEnabled: true,
    suspensionStiffness: 68,
    suspensionDamping: 11.5,
    maxSteer: 0.56,
  },
  drift: {
    engineTorqueMul: 1.15,
    frontGrip: 1.18,
    rearGrip: 0.82,
    handbrakeRearGrip: 0.16,
    tcsEnabled: false,
    suspensionStiffness: 74,
    suspensionDamping: 12.0,
    maxSteer: 0.68,
  },
  track: {
    engineTorqueMul: 1.08,
    frontGrip: 1.32,
    rearGrip: 1.30,
    handbrakeRearGrip: 0.30,
    tcsEnabled: true,
    suspensionStiffness: 92,
    suspensionDamping: 14.5,
    maxSteer: 0.50,
  },
};

const MASS = 1380; // kg
const INERTIA_Y = 2350; // kg*m^2
const LF = 1.28; // front axle to CG (m)
const LR = 1.40; // rear axle to CG (m)
const WHEELBASE = LF + LR;
const HALF_TRACK = 0.79; // m
const WHEEL_RADIUS = 0.33; // m
const GRAVITY = 9.81;

const GEAR_RATIOS = [3.42, 2.28, 1.62, 1.22, 0.96, 0.78];
const FINAL_DRIVE = 3.73;
const REVERSE_RATIO = 3.15;
const IDLE_RPM = 900;
const REDLINE_RPM = 7400;

export function createInitialVehicleState(): VehicleState {
  return {
    x: INITIAL_SPAWN.x,
    y: INITIAL_SPAWN.y,
    z: INITIAL_SPAWN.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: INITIAL_SPAWN.yaw,
    yawRate: 0,
    pitch: 0,
    pitchVel: 0,
    roll: 0,
    rollVel: 0,
    steerAngle: 0,
    wheelSpin: 0,
    wheelCompressions: [0, 0, 0, 0],
    grounded: true,
    speedKmh: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    rpm: IDLE_RPM,
    gear: 1,
    shiftTimer: 0,
    rearSlip: 0,
    brakingLights: false,
    reversingLights: false,
    surface: 'asphalt',
    absActive: false,
    tcsActive: false,
    driftScore: 0,
    activeDriftPoints: 0,
    totalDistance: 0,
    lap: 1,
    nextCheckpoint: 0,
    lapTime: 0,
    bestLapTime: null,
    lastLapTime: null,
    cones: createInitialCones(),
    impactIntensity: 0,
  };
}

function engineTorqueAtRpm(rpm: number): number {
  // Smooth realistic naturally-aspirated/turbo sports coupe curve (Nm)
  const norm = Math.max(0, Math.min(1, (rpm - IDLE_RPM) / (REDLINE_RPM - IDLE_RPM)));
  // Rises from 240 Nm at idle to 440 Nm around 4800 rpm, tapers to 345 Nm at redline
  return 240 + 200 * Math.sin(norm * Math.PI * 0.78);
}

function pacejkaLat(slip: number, stiffness: number): number {
  // Peak around ~10-12 deg, saturates & gently drops off at steep drift angles
  const B = stiffness;
  const C = 1.42;
  return Math.sin(C * Math.atan(B * slip));
}

export function stepVehiclePhysics(
  state: VehicleState,
  input: VehicleInput,
  mode: DrivingMode,
  rawDt: number
): void {
  const dt = Math.min(rawDt, 0.05);
  if (dt <= 0) return;

  // Sub-step at <= 1/120s for rock-solid suspension & tire stability
  const subSteps = dt > 0.016 ? 2 : 1;
  const h = dt / subSteps;

  for (let s = 0; s < subSteps; s++) {
    stepSub(state, input, mode, h);
  }
}

function stepSub(
  s: VehicleState,
  input: VehicleInput,
  mode: DrivingMode,
  dt: number
): void {
  const spec = MODE_SPECS[mode];
  s.impactIntensity = Math.max(0, s.impactIntensity - dt * 2.8);
  s.shiftTimer = Math.max(0, s.shiftTimer - dt);

  const sinY = Math.sin(s.yaw);
  const cosY = Math.cos(s.yaw);

  // Car local axes in XZ plane:
  // forward = (-sinY, -cosY), right = (cosY, -sinY)
  const fwdX = -sinY;
  const fwdZ = -cosY;
  const rightX = cosY;
  const rightZ = -sinY;

  // World velocity -> local components
  const vForward = s.vx * fwdX + s.vz * fwdZ;
  const vRight = s.vx * rightX + s.vz * rightZ;
  const speed = Math.hypot(vForward, vRight);

  // Speed-sensitive max steering angle
  const speedFactor = Math.min(1, speed / 42);
  const dynamicMaxSteer = spec.maxSteer * (1 - 0.56 * speedFactor);
  const targetSteer = input.steer * dynamicMaxSteer;
  const steerRate = input.steer !== 0 ? 5.8 : 7.5;
  s.steerAngle += (targetSteer - s.steerAngle) * (1 - Math.exp(-steerRate * dt));

  // Sample ground under 4 wheels
  const wheelOffsets: [number, number][] = [
    [-HALF_TRACK, -LF], // FL
    [HALF_TRACK, -LF],  // FR
    [-HALF_TRACK, LR],  // RL
    [HALF_TRACK, LR],   // RR
  ];

  let hSum = 0;
  let gripSum = 0;
  const wheelHeights: [number, number, number, number] = [0, 0, 0, 0];
  let centerSurface: SurfaceType = 'asphalt';

  for (let i = 0; i < 4; i++) {
    const [lx, lz] = wheelOffsets[i];
    // local (lx, lz) -> world: right * lx + (-fwd) * lz
    const wx = s.x + rightX * lx - fwdX * lz;
    const wz = s.z + rightZ * lx - fwdZ * lz;
    const surf = getSurfaceAt(wx, wz);
    wheelHeights[i] = surf.height;
    hSum += surf.height;
    gripSum += surf.gripMultiplier;
    if (i === 0) centerSurface = surf.surface;
  }
  const centerSurf = getSurfaceAt(s.x, s.z);
  s.surface = centerSurf.surface || centerSurface;

  const groundAvg = hSum * 0.25;
  const surfaceGrip = gripSum * 0.25;

  // Ground slope pitch & roll
  const frontAvgH = (wheelHeights[0] + wheelHeights[1]) * 0.5;
  const rearAvgH = (wheelHeights[2] + wheelHeights[3]) * 0.5;
  const leftAvgH = (wheelHeights[0] + wheelHeights[2]) * 0.5;
  const rightAvgH = (wheelHeights[1] + wheelHeights[3]) * 0.5;

  const terrainPitch = Math.atan2(frontAvgH - rearAvgH, WHEELBASE);
  const terrainRoll = Math.atan2(rightAvgH - leftAvgH, HALF_TRACK * 2);

  // Vertical heave & airborne physics
  const restHeight = groundAvg;
  const prevGrounded = s.grounded;
  if (s.y > restHeight + 0.06 || s.vy > 0.45) {
    s.vy -= GRAVITY * dt;
    s.y += s.vy * dt;
    if (s.y <= restHeight) {
      const impact = Math.abs(s.vy);
      if (impact > 1.4) {
        s.impactIntensity = Math.min(1, s.impactIntensity + impact * 0.16);
      }
      s.y = restHeight;
      s.vy = 0;
      s.grounded = true;
    } else {
      s.grounded = false;
    }
  } else {
    // Grounded suspension tracking (preserve upward velocity when driving off a ramp lip)
    const dh = restHeight - s.y;
    if (prevGrounded && dh < -0.18 && vForward > 6 && s.pitch > 0.04) {
      s.vy = Math.max(s.vy, vForward * Math.sin(s.pitch) * 1.15);
      s.y += s.vy * dt;
      s.grounded = false;
    } else {
      const springF = dh * 140 - s.vy * 18;
      s.vy += springF * dt;
      s.y += s.vy * dt;
      if (s.y < restHeight - 0.14) {
        s.y = restHeight - 0.14;
        s.vy = Math.max(0, s.vy);
      }
      s.grounded = true;
    }
  }

  // Automatic / Smart Gear & Reverse logic
  let throttle = input.throttle;
  let brake = input.brake;
  let wantReverse = false;

  if (brake > 0.1 && vForward < 0.2 && throttle < 0.1) {
    wantReverse = true;
    s.gear = -1;
  } else if (s.gear === -1) {
    if (throttle > 0.1 && vForward > -0.3) {
      s.gear = 1;
    } else {
      wantReverse = true;
    }
  }

  s.reversingLights = s.gear === -1;
  s.brakingLights = (!wantReverse && brake > 0.1) || input.handbrake;

  // Compute wheel RPM & automatic upshift/downshift
  const absFwd = Math.abs(vForward);
  const wheelOmega = absFwd / WHEEL_RADIUS;
  const activeRatio =
    s.gear === -1
      ? REVERSE_RATIO
      : GEAR_RATIOS[Math.max(0, Math.min(GEAR_RATIOS.length - 1, s.gear - 1))] * FINAL_DRIVE;

  let targetRpm = IDLE_RPM + (wheelOmega * activeRatio * 60) / (2 * Math.PI);
  if (s.gear === 1 && absFwd < 4 && throttle > 0.05) {
    // Torque converter / clutch slip launch
    targetRpm = Math.max(targetRpm, IDLE_RPM + throttle * 2600);
  }
  if (wantReverse && brake > 0.05) {
    targetRpm = Math.max(targetRpm, IDLE_RPM + brake * 2200);
  }
  targetRpm = Math.min(REDLINE_RPM + 150, Math.max(IDLE_RPM, targetRpm));
  s.rpm += (targetRpm - s.rpm) * (1 - Math.exp(-12 * dt));

  if (s.gear >= 1 && s.shiftTimer <= 0) {
    if (s.rpm > 6750 && s.gear < GEAR_RATIOS.length && throttle > 0.2) {
      s.gear += 1;
      s.shiftTimer = 0.28;
    } else if (s.rpm < 2250 && s.gear > 1) {
      s.gear -= 1;
      s.shiftTimer = 0.28;
    }
  }

  // Longitudinal forces
  let fLong = 0;
  s.tcsActive = false;
  s.absActive = false;

  if (s.grounded) {
    if (wantReverse) {
      const revTorque = engineTorqueAtRpm(s.rpm) * REVERSE_RATIO * 0.72 * brake;
      fLong -= revTorque / WHEEL_RADIUS;
      if (throttle > 0.1 && vForward < -0.2) {
        fLong += throttle * 9500; // forward brake while reversing
      }
    } else {
      const gearRatio = GEAR_RATIOS[Math.max(0, s.gear - 1)] * FINAL_DRIVE;
      const shiftCut = s.shiftTimer > 0.18 ? 0.25 : 1.0;
      let driveForce =
        ((engineTorqueAtRpm(s.rpm) * gearRatio * spec.engineTorqueMul * throttle * shiftCut) /
          WHEEL_RADIUS) *
        0.92;

      // Cap max speed smoothly ~215 km/h (59.7 m/s)
      if (vForward > 58) driveForce *= Math.max(0, 1 - (vForward - 58) / 4);

      if (spec.tcsEnabled && Math.abs(vRight) > 3.2 && throttle > 0.4) {
        driveForce *= 0.65;
        s.tcsActive = true;
      }

      fLong += driveForce;

      // Service braking
      if (brake > 0.02) {
        const brakeForce = 14800 * brake * surfaceGrip;
        if (vForward > 0.15) {
          fLong -= brakeForce;
          if (brake > 0.8 && vForward > 6) s.absActive = true;
        } else if (vForward < -0.15) {
          fLong += brakeForce;
        } else {
          // Hold stationary on slopes
          fLong -= vForward * 4000;
        }
      }
    }

    // Handbrake drag
    if (input.handbrake && speed > 0.2) {
      fLong -= Math.sign(vForward) * 4200 * surfaceGrip;
    }

    // Rolling resistance
    const rollResist = (s.surface === 'grass' ? 520 : 190) + 18 * absFwd;
    if (speed > 0.05) {
      fLong -= Math.sign(vForward) * rollResist;
    }
  }

  // Aerodynamic drag
  const aeroDrag = 0.42 * vForward * Math.abs(vForward);
  fLong -= aeroDrag;

  // Lateral tire forces & yaw torque (Bicycle model + weight transfer)
  let fLatFront = 0;
  let fLatRear = 0;
  let rearSlipRatio = 0;

  if (s.grounded && speed > 0.25) {
    const vRightFront = vRight - s.yawRate * LF;
    const vRightRear = vRight + s.yawRate * LR;

    // Longitudinal weight transfer estimation
    const longAccelEst = fLong / MASS;
    const weightTransfer = Math.max(-0.22, Math.min(0.22, (longAccelEst * 0.48) / (WHEELBASE * GRAVITY)));
    const frontLoadFactor = LR / WHEELBASE - weightTransfer;
    const rearLoadFactor = LF / WHEELBASE + weightTransfer;

    const effectiveFwd = Math.max(1.4, Math.abs(vForward));
    const steerSign = vForward >= -0.2 ? 1 : -1;
    const slipFront = Math.atan2(vRightFront, effectiveFwd) + s.steerAngle * steerSign;
    const slipRear = Math.atan2(vRightRear, effectiveFwd);

    const maxFrontLat = MASS * GRAVITY * frontLoadFactor * surfaceGrip * spec.frontGrip;
    const rearGripBase = input.handbrake ? spec.handbrakeRearGrip : spec.rearGrip;
    const maxRearLat = MASS * GRAVITY * rearLoadFactor * surfaceGrip * rearGripBase;

    fLatFront = -maxFrontLat * pacejkaLat(slipFront, 6.2);
    fLatRear = -maxRearLat * pacejkaLat(slipRear, input.handbrake ? 2.8 : 6.6);

    // At very low speed, blend out excessive yaw oscillation
    const lowSpeedFade = Math.min(1, speed / 2.2);
    fLatFront *= lowSpeedFade;
    fLatRear *= lowSpeedFade;

    rearSlipRatio =
      (Math.abs(slipRear) * 1.35 + (input.handbrake && speed > 4 ? 0.5 : 0)) *
      Math.min(1, speed / 5);
  } else if (s.grounded && speed <= 0.25 && throttle < 0.05 && brake < 0.05) {
    // Gentle rest damping so car sits perfectly still at 0
    s.vx *= Math.exp(-12 * dt);
    s.vz *= Math.exp(-12 * dt);
    s.yawRate *= Math.exp(-14 * dt);
  }

  s.rearSlip += (Math.min(1.5, rearSlipRatio) - s.rearSlip) * (1 - Math.exp(-10 * dt));

  const fRightTotal = fLatFront + fLatRear;
  // Yaw torque: tau_y = (-lf) * fLatFront + (+lr) * fLatRear
  const yawTorque = -LF * fLatFront + LR * fLatRear;

  // Convert local accelerations back to world frame
  const aFwd = fLong / MASS;
  const aRight = fRightTotal / MASS;

  const ax = aFwd * fwdX + aRight * rightX;
  const az = aFwd * fwdZ + aRight * rightZ;

  s.vx += ax * dt;
  s.vz += az * dt;

  // Natural lateral damping at near-zero speed to prevent creep
  if (s.grounded && speed < 0.35 && throttle < 0.05 && (!wantReverse || brake < 0.05)) {
    s.vx *= Math.exp(-8 * dt);
    s.vz *= Math.exp(-8 * dt);
  }

  s.yawRate += (yawTorque / INERTIA_Y) * dt;
  // Subtle aerodynamic/tire yaw damping
  s.yawRate *= Math.exp(-1.2 * dt);

  s.x += s.vx * dt;
  s.z += s.vz * dt;
  s.yaw += s.yawRate * dt;

  // Track distance & wheel spin
  const stepDist = Math.hypot(s.vx, s.vz) * dt;
  s.totalDistance += stepDist;
  s.wheelSpin += (vForward / WHEEL_RADIUS) * dt;
  s.forwardSpeed = vForward;
  s.lateralSpeed = vRight;
  s.speedKmh = Math.hypot(s.vx, s.vz) * 3.6;

  // Chassis suspension pitch & roll spring-damper
  const targetPitch = terrainPitch + Math.max(-0.065, Math.min(0.065, aFwd * 0.0048));
  const targetRoll = terrainRoll + Math.max(-0.085, Math.min(0.085, aRight * 0.0056));

  const pitchAccel = (targetPitch - s.pitch) * spec.suspensionStiffness - s.pitchVel * spec.suspensionDamping;
  const rollAccel = (targetRoll - s.roll) * spec.suspensionStiffness - s.rollVel * spec.suspensionDamping;
  s.pitchVel += pitchAccel * dt;
  s.rollVel += rollAccel * dt;
  s.pitch += s.pitchVel * dt;
  s.roll += s.rollVel * dt;

  // Individual wheel travel relative to chassis
  for (let i = 0; i < 4; i++) {
    const comp = Math.max(-0.11, Math.min(0.11, wheelHeights[i] - s.y));
    s.wheelCompressions[i] += (comp - s.wheelCompressions[i]) * (1 - Math.exp(-22 * dt));
  }

  // Barrier collision (keeps car inside proving grounds circuit corridor)
  const nearest = findNearestTrackPoint(s.x, s.z);
  const absOffset = Math.abs(nearest.signedOffset);
  if (absOffset > BARRIER_HALF_WIDTH) {
    const sign = Math.sign(nearest.signedOffset);
    const pushBack = absOffset - BARRIER_HALF_WIDTH;
    const nx = nearest.sample.nx * sign;
    const nz = nearest.sample.nz * sign;
    s.x -= nx * pushBack;
    s.z -= nz * pushBack;

    // Reflect outward velocity
    const vn = s.vx * nx + s.vz * nz;
    if (vn > 0) {
      s.vx -= 1.35 * vn * nx;
      s.vz -= 1.35 * vn * nz;
      s.vx *= 0.82;
      s.vz *= 0.82;
      if (vn > 2.5) {
        s.impactIntensity = Math.min(1, s.impactIntensity + vn * 0.08);
      }
    }
  }

  // Cone obstacle collisions
  for (let i = 0; i < s.cones.length; i++) {
    const c = s.cones[i];
    const dx = c.x - s.x;
    const dz = c.z - s.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.35 && dist > 0.001) {
      const nx = dx / dist;
      const nz = dz / dist;
      const push = 1.35 - dist;
      c.x += nx * push;
      c.z += nz * push;
      if (!c.hit) {
        c.hit = true;
        c.vx = s.vx * 1.15 + nx * 4.5;
        c.vz = s.vz * 1.15 + nz * 4.5;
        c.tiltX = (Math.random() - 0.5) * 1.4;
        c.tiltZ = (Math.random() - 0.5) * 1.4;
        s.impactIntensity = Math.min(1, s.impactIntensity + 0.14);
      }
    }
    if (Math.abs(c.vx) > 0.01 || Math.abs(c.vz) > 0.01) {
      c.x += c.vx * dt;
      c.z += c.vz * dt;
      c.vx *= Math.exp(-3.2 * dt);
      c.vz *= Math.exp(-3.2 * dt);
    }
  }

  // Drift score accumulation
  if (s.grounded && s.speedKmh > 25 && s.rearSlip > 0.35) {
    s.activeDriftPoints += s.rearSlip * s.speedKmh * dt * 1.8;
  } else if (s.activeDriftPoints > 0) {
    s.driftScore += Math.round(s.activeDriftPoints);
    s.activeDriftPoints = 0;
  }

  // Checkpoint & Lap timing
  s.lapTime += dt;
  const cp = CHECKPOINTS[s.nextCheckpoint];
  if (cp) {
    const dCp = Math.hypot(s.x - cp.x, s.z - cp.z);
    if (dCp < cp.radius) {
      if (s.nextCheckpoint === 0 && s.totalDistance > 40) {
        // Completed a lap!
        s.lastLapTime = s.lapTime;
        if (s.bestLapTime === null || s.lapTime < s.bestLapTime) {
          s.bestLapTime = s.lapTime;
        }
        s.lapTime = 0;
        s.lap += 1;
      }
      s.nextCheckpoint = (s.nextCheckpoint + 1) % CHECKPOINTS.length;
    }
  }
}
