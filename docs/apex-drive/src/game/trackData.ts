export interface Vec2 {
  x: number;
  z: number;
}

export interface TrackSample {
  x: number;
  z: number;
  tx: number; // unit tangent x
  tz: number; // unit tangent z
  nx: number; // unit right normal x
  nz: number; // unit right normal z
  s: number;  // cumulative arc length
}

export interface Checkpoint {
  index: number;
  x: number;
  z: number;
  tx: number;
  tz: number;
  radius: number;
}

export interface RampFeature {
  cx: number;
  cz: number;
  dirX: number;
  dirZ: number;
  halfWidth: number;
  length: number;
  height: number;
}

export interface SpeedBumpFeature {
  cx: number;
  cz: number;
  dirX: number;
  dirZ: number;
  halfWidth: number;
  halfLength: number;
  height: number;
}

export interface ConeObstacle {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  hit: boolean;
  tiltX: number;
  tiltZ: number;
}

export const TRACK_HALF_WIDTH = 6.5;
export const RUNOFF_HALF_WIDTH = 10.5;
export const BARRIER_HALF_WIDTH = 12.2;

// Closed proving-grounds circuit waypoints (counter-clockwise / forward along -Z at start)
const CONTROL_POINTS: Vec2[] = [
  { x: 0, z: 42 },
  { x: 0, z: 0 },
  { x: 0, z: -44 },
  { x: 16, z: -74 },
  { x: 54, z: -80 },
  { x: 82, z: -52 },
  { x: 76, z: -14 },
  { x: 48, z: 2 },
  { x: 56, z: 36 },
  { x: 82, z: 62 },
  { x: 54, z: 84 },
  { x: 14, z: 72 },
];

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function buildTrackSamples(points: Vec2[], subdivisionsPerSeg = 18): TrackSample[] {
  const raw: Vec2[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let j = 0; j < subdivisionsPerSeg; j++) {
      const t = j / subdivisionsPerSeg;
      raw.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
        z: catmullRom(p0.z, p1.z, p2.z, p3.z, t),
      });
    }
  }

  const samples: TrackSample[] = [];
  let s = 0;
  const total = raw.length;
  for (let i = 0; i < total; i++) {
    const prev = raw[(i - 1 + total) % total];
    const curr = raw[i];
    const next = raw[(i + 1) % total];
    if (i > 0) {
      s += Math.hypot(curr.x - prev.x, curr.z - prev.z);
    }
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const tx = dx / len;
    const tz = dz / len;
    // Right normal in XZ plane when looking down +Y (forward = (tx, tz), right = (-tz, tx))
    // Check: if forward = (0, -1), right = (1, 0) -> (-tz, tx) = (1, 0). Exact!
    const nx = -tz;
    const nz = tx;
    samples.push({ x: curr.x, z: curr.z, tx, tz, nx, nz, s });
  }
  return samples;
}

export const TRACK_SAMPLES: TrackSample[] = buildTrackSamples(CONTROL_POINTS, 18);

export const TRACK_LENGTH: number = (() => {
  const last = TRACK_SAMPLES[TRACK_SAMPLES.length - 1];
  const first = TRACK_SAMPLES[0];
  return last.s + Math.hypot(first.x - last.x, first.z - last.z);
})();

export const CHECKPOINTS: Checkpoint[] = (() => {
  const count = 8;
  const list: Checkpoint[] = [];
  const step = Math.floor(TRACK_SAMPLES.length / count);
  // Offset so checkpoint 0 is right at start/finish (x:0, z:0 -> around index 18)
  let startIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < TRACK_SAMPLES.length; i++) {
    const d = Math.hypot(TRACK_SAMPLES[i].x, TRACK_SAMPLES[i].z);
    if (d < bestDist) {
      bestDist = d;
      startIdx = i;
    }
  }
  for (let c = 0; c < count; c++) {
    const idx = (startIdx + c * step) % TRACK_SAMPLES.length;
    const smp = TRACK_SAMPLES[idx];
    list.push({
      index: c,
      x: smp.x,
      z: smp.z,
      tx: smp.tx,
      tz: smp.tz,
      radius: TRACK_HALF_WIDTH + 3.0,
    });
  }
  return list;
})();

// Test features placed cleanly on the wide straightaway (main straight runs along x=0, dir=(0,-1))
export const RAMP_FEATURES: RampFeature[] = [
  {
    cx: 3.4,
    cz: -28,
    dirX: 0,
    dirZ: -1,
    halfWidth: 2.0,
    length: 7.5,
    height: 1.05,
  },
];

export const SPEED_BUMPS: SpeedBumpFeature[] = [
  { cx: -3.4, cz: -20, dirX: 0, dirZ: -1, halfWidth: 2.1, halfLength: 0.45, height: 0.13 },
  { cx: -3.4, cz: -24, dirX: 0, dirZ: -1, halfWidth: 2.1, halfLength: 0.45, height: 0.13 },
  { cx: -3.4, cz: -28, dirX: 0, dirZ: -1, halfWidth: 2.1, halfLength: 0.45, height: 0.13 },
];

export function createInitialCones(): ConeObstacle[] {
  const cones: ConeObstacle[] = [];
  let id = 1;
  // Slalom / chicane marker cones on main straight left shoulder & Turn 1 apex
  const positions: Vec2[] = [
    { x: -5.6, z: -12 },
    { x: -5.6, z: -18 },
    { x: -5.6, z: -24 },
    { x: -5.6, z: -30 },
    { x: -5.6, z: -36 },
    { x: 5.6, z: -16 },
    { x: 5.6, z: -34 },
    // Chicane cones near middle S-bend
    { x: 43.0, z: 0.0 },
    { x: 43.8, z: 5.0 },
    { x: 53.0, z: 2.0 },
  ];
  for (const p of positions) {
    cones.push({
      id: id++,
      x: p.x,
      z: p.z,
      vx: 0,
      vz: 0,
      hit: false,
      tiltX: 0,
      tiltZ: 0,
    });
  }
  return cones;
}

export interface NearestTrackPoint {
  sample: TrackSample;
  distance: number;
  signedOffset: number; // + = right side, - = left side
  index: number;
}

export function findNearestTrackPoint(x: number, z: number): NearestTrackPoint {
  let bestIdx = 0;
  let bestDistSq = Infinity;
  for (let i = 0; i < TRACK_SAMPLES.length; i++) {
    const s = TRACK_SAMPLES[i];
    const dx = x - s.x;
    const dz = z - s.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestIdx = i;
    }
  }
  const sample = TRACK_SAMPLES[bestIdx];
  const dx = x - sample.x;
  const dz = z - sample.z;
  const signedOffset = dx * sample.nx + dz * sample.nz;
  return {
    sample,
    distance: Math.sqrt(bestDistSq),
    signedOffset,
    index: bestIdx,
  };
}

export type SurfaceType = 'asphalt' | 'curb' | 'grass' | 'ramp';

export function getSurfaceAt(x: number, z: number): {
  height: number;
  surface: SurfaceType;
  gripMultiplier: number;
  trackDistance: number;
} {
  // Check ramps first
  for (const r of RAMP_FEATURES) {
    const dx = x - r.cx;
    const dz = z - r.cz;
    const along = dx * r.dirX + dz * r.dirZ; // -length/2 .. +length/2 along travel
    const side = Math.abs(dx * -r.dirZ + dz * r.dirX);
    if (side <= r.halfWidth && along >= -r.length * 0.5 && along <= r.length * 0.5) {
      const t = (along + r.length * 0.5) / r.length; // 0 at entry, 1 at lip
      // Smooth upward curve
      const h = r.height * Math.pow(t, 1.35);
      return { height: h, surface: 'ramp', gripMultiplier: 0.96, trackDistance: 0 };
    }
  }

  // Check speed bumps
  let bumpHeight = 0;
  for (const b of SPEED_BUMPS) {
    const dx = x - b.cx;
    const dz = z - b.cz;
    const along = Math.abs(dx * b.dirX + dz * b.dirZ);
    const side = Math.abs(dx * -b.dirZ + dz * b.dirX);
    if (side <= b.halfWidth && along <= b.halfLength) {
      const t = along / b.halfLength;
      bumpHeight = Math.max(bumpHeight, b.height * Math.cos(t * Math.PI * 0.5));
    }
  }

  const nearest = findNearestTrackPoint(x, z);
  const absOff = Math.abs(nearest.signedOffset);

  if (absOff <= TRACK_HALF_WIDTH - 0.15) {
    return {
      height: bumpHeight,
      surface: 'asphalt',
      gripMultiplier: 1.0,
      trackDistance: absOff,
    };
  }
  if (absOff <= TRACK_HALF_WIDTH + 0.85) {
    // Raised rumble curb with slight periodic ripple
    const ripple = 0.055 + 0.018 * Math.sin(nearest.sample.s * 2.4);
    return {
      height: Math.max(bumpHeight, ripple),
      surface: 'curb',
      gripMultiplier: 0.9,
      trackDistance: absOff,
    };
  }
  if (absOff <= RUNOFF_HALF_WIDTH) {
    return {
      height: 0,
      surface: 'grass',
      gripMultiplier: 0.68,
      trackDistance: absOff,
    };
  }

  // Gentle rolling hills beyond runoff
  const outer = absOff - RUNOFF_HALF_WIDTH;
  const blend = Math.min(1, outer / 18);
  const hill =
    (Math.sin(x * 0.032) * Math.cos(z * 0.028) * 3.8 +
      Math.sin((x + z) * 0.018) * 2.4 +
      1.6) *
    blend;

  return {
    height: Math.max(0, hill),
    surface: 'grass',
    gripMultiplier: 0.62,
    trackDistance: absOff,
  };
}

export function getGroundHeightAt(x: number, z: number): number {
  return getSurfaceAt(x, z).height;
}

export const INITIAL_SPAWN = {
  x: 0,
  y: 0.05,
  z: 22,
  yaw: 0, // facing -Z toward start/finish gantry at z=0
};
