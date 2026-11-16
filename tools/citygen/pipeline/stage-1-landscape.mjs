/**
 * Stage 1: landscape and hydrology (TASK-003, incremental; R1 progress §4–5).
 * Validates/repairs terrain modifiers and waterways in IR; emits sanitized data
 * back into the source cityforge for compilation. Deterministic, local repairs.
 * Procedural generation: when `generator.landscape` requests it (or provides
 * config and there is no authored terrain/hydrology), produces hills/rivers
 * from seed/subseed without Math.random.
 * R1: adds read-only analysis (slope grid/classification, crossing candidates) to ctx.
 */
import { warn, info } from '../diagnostics.mjs';
import { makeRng, mix } from '../rng.mjs';
import { createSpatialIndex } from '../spatial.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const EPS = 1e-9;

function inBoundsXZ(x, z, half) {
  return x >= -half - EPS && x <= half + EPS && z >= -half - EPS && z <= half + EPS;
}

function orient(ax, az, bx, bz, cx, cz) {
  return (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
}

function onSeg(ax, az, bx, bz, cx, cz) {
  return Math.min(ax, bx) - EPS <= cx && cx <= Math.max(ax, bx) + EPS
    && Math.min(az, bz) - EPS <= cz && cz <= Math.max(az, bz) + EPS;
}

function segsIntersect(a1, a2, b1, b2) {
  const o1 = orient(a1[0], a1[2], a2[0], a2[2], b1[0], b1[2]);
  const o2 = orient(a1[0], a1[2], a2[0], a2[2], b2[0], b2[2]);
  const o3 = orient(b1[0], b1[2], b2[0], b2[2], a1[0], a1[2]);
  const o4 = orient(b1[0], b1[2], b2[0], b2[2], a2[0], a2[2]);
  if ((o1 > EPS && o2 < -EPS || o1 < -EPS && o2 > EPS) && (o3 > EPS && o4 < -EPS || o3 < -EPS && o4 > EPS)) return true;
  if (Math.abs(o1) <= EPS && onSeg(a1[0], a1[2], a2[0], a2[2], b1[0], b1[2])) return true;
  if (Math.abs(o2) <= EPS && onSeg(a1[0], a1[2], a2[0], a2[2], b2[0], b2[2])) return true;
  if (Math.abs(o3) <= EPS && onSeg(b1[0], b1[2], b2[0], b2[2], a1[0], a1[2])) return true;
  if (Math.abs(o4) <= EPS && onSeg(b1[0], b1[2], b2[0], b2[2], a2[0], a2[2])) return true;
  return false;
}

function polylineSelfIntersects(path) {
  const n = path.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 2; j < n - 1; j++) {
      if (segsIntersect(path[i], path[i + 1], path[j], path[j + 1])) return true;
    }
  }
  return false;
}

function distPointSegXZ(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const apx = px - ax, apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  const t = ab2 > EPS ? clamp((apx * abx + apz * abz) / ab2, 0, 1) : 0;
  const cx = ax + abx * t, cz = az + abz * t;
  return Math.hypot(px - cx, pz - cz);
}

function riverMinDistToPoint(river, x, z) {
  const path = river.path ?? [];
  let best = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1];
    best = Math.min(best, distPointSegXZ(x, z, a[0], a[2], b[0], b[2]));
  }
  return best;
}

function hillContribution(mod, x, z) {
  const type = mod?.type;
  if (type !== 'mountain' && type !== 'valley') return 0;
  const h = Number(mod.height) || 0;
  const r = Number(mod.radius) || 0;
  if (!(r > EPS) || !Number.isFinite(h)) return 0;
  const c = Array.isArray(mod.center) ? mod.center : [Number(mod.center?.x) || 0, Number(mod.center?.z) || 0];
  const dx = x - (Number(c[0]) || 0);
  const dz = z - (Number(c[1]) || 0);
  const d = Math.hypot(dx, dz);
  if (d >= r) return 0;
  const t = 1 - d / r;
  const e = t * t * (3 - 2 * t); // smooth ease
  const signed = (mod.operation === 'subtract') ? -h : h;
  return signed * e;
}

function terrainHeightAt(x, z, baseY, modifiers = []) {
  let y = Number.isFinite(baseY) ? baseY : 0;
  for (const m of modifiers) y += hillContribution(m, x, z);
  return y;
}

function classifySlope(s) {
  // м/м (док §4.3 в процентах: 3/8/15/25%)
  if (s < 0.03) return 'flat_lt3';
  if (s < 0.08) return 'gentle_3_8';
  if (s < 0.15) return 'moderate_8_15';
  if (s < 0.25) return 'steep_15_25';
  return 'very_steep_gt25';
}

function buildSlopeAnalysis(ctx, baseY, size) {
  const step = Math.max(8, Math.min(16, Number(ctx.input?.generator?.landscape?.analysisStep) || 16));
  const half = size / 2;
  const mods = ctx.terrain.modifiers || [];
  // sample on cell centers of an analysis grid
  const n = Math.max(2, Math.ceil(size / step));
  const actualStep = size / n;
  const h = (ix, iz) => {
    const x = -half + (ix + 0.5) * actualStep;
    const z = -half + (iz + 0.5) * actualStep;
    return terrainHeightAt(x, z, baseY, mods);
  };
  const counts = { flat_lt3: 0, gentle_3_8: 0, moderate_8_15: 0, steep_15_25: 0, very_steep_gt25: 0 };
  let maxSlope = 0;
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const hc = h(ix, iz);
      let sMax = 0;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of nb) {
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= n || jz >= n) continue;
        const hn = h(jx, jz);
        const s = Math.abs(hn - hc) / actualStep;
        if (s > sMax) sMax = s;
      }
      if (sMax > maxSlope) maxSlope = sMax;
      counts[classifySlope(sMax)]++;
    }
  }
  const total = n * n;
  const share = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, +(v / total).toFixed(6)]));
  return { step: +actualStep.toFixed(3), grid: n, cells: total, maxSlope: +maxSlope.toFixed(6), counts, share };
}

function findCrossingCandidates(ctx, baseY, size) {
  const rivers = ctx.hydrology.rivers || [];
  const mods = ctx.terrain.modifiers || [];
  const half = size / 2;
  const stageId = '1_landscape_hydrology';
  const out = [];
  for (const rv of rivers) {
    const path = Array.isArray(rv.path) ? rv.path : [];
    if (path.length < 2) continue;
    const width = Number(rv.width) || 10;
    // evaluate interior vertices and midpoints as candidates
    const samples = [];
    for (let i = 1; i < path.length - 1; i++) samples.push({ x: path[i][0], z: path[i][2], t: i / (path.length - 1), kind: 'vertex' });
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1];
      samples.push({ x: (a[0] + b[0]) / 2, z: (a[2] + b[2]) / 2, t: (i + 0.5) / (path.length - 1), kind: 'mid' });
    }
    if (!samples.length && path.length >= 2) samples.push({ x: (path[0][0] + path[1][0]) / 2, z: (path[0][2] + path[1][2]) / 2, t: 0.5, kind: 'mid' });
    const scoreSample = (s) => {
      const y = terrainHeightAt(s.x, s.z, baseY, mods);
      const d = 8;
      const s1 = Math.abs(terrainHeightAt(s.x + d, s.z, baseY, mods) - y) / d;
      const s2 = Math.abs(terrainHeightAt(s.x - d, s.z, baseY, mods) - y) / d;
      const s3 = Math.abs(terrainHeightAt(s.x, s.z + d, baseY, mods) - y) / d;
      const s4 = Math.abs(terrainHeightAt(s.x, s.z - d, baseY, mods) - y) / d;
      const bankSlope = Math.max(s1, s2, s3, s4);
      const edgeDist = Math.min(half - Math.abs(s.x), half - Math.abs(s.z));
      const edgePenalty = edgeDist < width * 2 ? 1 : 0;
      const score = bankSlope + width * 0.002 + edgePenalty * 10;
      return { riverId: rv.id ?? null, x: +s.x.toFixed(3), z: +s.z.toFixed(3), t: +s.t.toFixed(4), width, bankSlope: +bankSlope.toFixed(6), score: +score.toFixed(6) };
    };
    const scored = [];
    for (const s of samples) {
      if (Math.abs(s.x) > half || Math.abs(s.z) > half) continue;
      // local terrain flatness probe (small cross offsets approximated by sampling around)
      scored.push(scoreSample(s));
    }
    scored.sort((a, b) => a.score - b.score || a.t - b.t || a.x - b.x || a.z - b.z);
    let takeCount = Math.min(4, Math.max(2, Math.min(scored.length, 3)));
    let chosen = scored.slice(0, takeCount);
    // R1.5 (deterministic repair): ensure each river has at least one marked crossing candidate for transport-compatible
    // floodplain/crossing decisions across scenarios; fallback picks best available sample (or path midpoint clamped in-bounds).
    if (!chosen.length) {
      let fallback = null;
      if (scored.length) fallback = scored[0];
      if (!fallback && samples.length) {
        // deterministic: prefer midpoint sample, clamp to plate if needed
        const mid = samples[Math.floor(samples.length / 2)] ?? samples[0];
        const cx = clamp(mid.x, -half + 1, half - 1);
        const cz = clamp(mid.z, -half + 1, half - 1);
        fallback = scoreSample({ x: cx, z: cz, t: mid.t, kind: 'fallback' });
      }
      if (fallback) {
        chosen = [{ ...fallback, fallback: true }];
        if (ctx?.report?.diagnostics) ctx.report.diagnostics.push(info('crossing_fallback_added', stageId, `added deterministic fallback crossing for river '${rv.id ?? '?'}'`, { riverId: rv.id ?? null, x: fallback.x, z: fallback.z }));
        if (ctx?.report?.repairs) ctx.report.repairs.push({ stage: stageId, id: rv.id ?? null, code: 'add_fallback_crossing_candidate' });
      }
    }
    out.push(...chosen);
  }
  // global deterministic order and cap
  out.sort((a, b) => String(a.riverId ?? '').localeCompare(String(b.riverId ?? '')) || a.score - b.score || a.t - b.t);
  return out.slice(0, 8);
}

function buildReservations(ctx, baseY, size, slope) {
  const half = size / 2;
  const mods = ctx.terrain.modifiers || [];
  const step = Math.max(16, Math.min(64, slope?.step || 16));
  // R1.3: reserve the flattest large-enough samples for core/interchange/station/plaza candidates.
  const samples = [];
  for (let z = -half + step / 2; z <= half - step / 2 + EPS; z += step) {
    for (let x = -half + step / 2; x <= half - step / 2 + EPS; x += step) {
      const y = terrainHeightAt(x, z, baseY, mods);
      const d = step / 2;
      const sx = Math.abs(terrainHeightAt(x + d, z, baseY, mods) - y) / Math.max(d, EPS);
      const sz = Math.abs(terrainHeightAt(x, z + d, baseY, mods) - y) / Math.max(d, EPS);
      const s = Math.max(sx, sz);
      // keep reasonably flat and away from plate edge
      const edge = Math.min(half - Math.abs(x), half - Math.abs(z));
      if (edge < size * 0.12) continue;
      samples.push({ x: +x.toFixed(3), z: +z.toFixed(3), slope: +s.toFixed(6), y: +y.toFixed(3) });
    }
  }
  samples.sort((a, b) => a.slope - b.slope || Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z) || a.x - b.x || a.z - b.z);
  const roles = ['core', 'station', 'interchange', 'plaza', 'industrial'];
  const picked = [];
  const minSep = Math.max(120, size * 0.12);
  for (const s of samples) {
    if (picked.length >= roles.length) break;
    if (picked.some(p => Math.hypot(p.x - s.x, p.z - s.z) < minSep)) continue;
    picked.push({ id: `reserve_${roles[picked.length]}`, role: roles[picked.length], x: s.x, z: s.z, slope: s.slope });
  }
  return { picked, samples };
}

function buildLandmarks(ctx, baseY, size, slope, crossings, flatSamples = []) {
  // R1.3/R1.5 (partial): deterministic landmarks/orientations derived from terrain and crossings.
  // These are added as reservation-like points so downstream stages can avoid/plan around them.
  const half = size / 2;
  const mods = ctx.terrain.modifiers || [];
  const step = Math.max(24, Math.min(96, (slope?.step || 16) * 2));
  const peaks = [];
  for (let z = -half + step / 2; z <= half - step / 2 + EPS; z += step) {
    for (let x = -half + step / 2; x <= half - step / 2 + EPS; x += step) {
      const edge = Math.min(half - Math.abs(x), half - Math.abs(z));
      if (edge < size * 0.1) continue;
      const y = terrainHeightAt(x, z, baseY, mods);
      peaks.push({ x: +x.toFixed(3), z: +z.toFixed(3), y: +y.toFixed(3) });
    }
  }
  peaks.sort((a, b) => b.y - a.y || Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z) || a.x - b.x || a.z - b.z);
  const landmarks = [];
  const minSep = Math.max(140, size * 0.14);
  const pushUnique = (lm) => {
    if (landmarks.some(p => Math.hypot(p.x - lm.x, p.z - lm.z) < minSep)) return false;
    landmarks.push(lm);
    return true;
  };
  // Viewpoints / hilltops
  let vi = 0;
  for (const p of peaks) {
    if (landmarks.length >= 3) break;
    if (p.y <= baseY + 1.5) continue; // only meaningful elevation
    if (pushUnique({ id: `landmark_view_${vi + 1}`, role: 'viewpoint', kind: 'viewpoint', x: p.x, z: p.z, elevation: p.y })) vi++;
  }
  // Crossing landmarks (historic/strategic crossing vicinity)
  const sortedCross = [...(crossings ?? [])].sort((a, b) => (a.score ?? 0) - (b.score ?? 0) || String(a.riverId ?? '').localeCompare(String(b.riverId ?? '')) || (a.t ?? 0) - (b.t ?? 0));
  let ci = 0;
  for (const c of sortedCross) {
    if (ci >= 2) break;
    if (!Number.isFinite(Number(c?.x)) || !Number.isFinite(Number(c?.z))) continue;
    const lm = { id: `landmark_crossing_${ci + 1}`, role: 'crossing', kind: 'historic_crossing', x: +Number(c.x).toFixed(3), z: +Number(c.z).toFixed(3), riverId: c.riverId ?? null };
    // allow a bit closer to other landmarks but not same spot
    if (landmarks.some(p => Math.hypot(p.x - lm.x, p.z - lm.z) < Math.max(80, size * 0.08))) continue;
    landmarks.push(lm); ci++;
  }
  // Valley/basin hint: lowest flat sample (if terrain varies) - useful for settlement/orientation
  const flats = [...flatSamples].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.slope ?? 0) - (b.slope ?? 0));
  const low = flats.find(s => (s.y ?? 0) < baseY - 0.5) || flats[0];
  if (low && landmarks.length < 6) {
    const lm = { id: 'landmark_basin_1', role: 'basin', kind: 'basin', x: low.x, z: low.z, elevation: low.y ?? null };
    if (!landmarks.some(p => Math.hypot(p.x - lm.x, p.z - lm.z) < Math.max(100, size * 0.1))) landmarks.push(lm);
  }
  landmarks.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  return landmarks;
}

function shouldGenerate(ctx) {
  const ls = ctx.input?.generator?.landscape;
  if (!ls || typeof ls !== 'object') return false;
  if (ls.generate === true) return true;
  if (ls.generate === false) return false;
  // If config present and no authored content, generate.
  const hasAuthored = (ctx.terrain.modifiers?.length ?? 0) > 0 || (ctx.hydrology.rivers?.length ?? 0) > 0;
  return !hasAuthored;
}

function farFromAnchors(x, z, anchors, minD) {
  for (const a of anchors) if (Math.hypot(x - a.x, z - a.z) < minD) return false;
  return true;
}

function generateLandscape(ctx) {
  const stageId = '1_landscape_hydrology';
  const ls = { ...(ctx.input.generator.landscape || {}) };
  const size = ctx.meta.worldBounds?.size ?? ctx.input?.ground?.size ?? 256;
  const half = size / 2;
  const seed = mix(ctx.meta.seed ?? 0, stageId, ls.seedOffset ?? 0);
  const rng = makeRng(seed);
  const gp = ctx.input?.gameplay ?? {};
  const anchors = [
    { x: gp.spawn?.x ?? 0, z: gp.spawn?.z ?? 0 },
    { x: gp.exit?.x ?? 0, z: gp.exit?.z ?? 0 },
  ];

  // R1.1: profile-aware defaults (opt-in via active city profile or profileDriven); explicit values win.
  const profile = ctx.meta?.activeCityProfile && typeof ctx.meta.activeCityProfile === 'object' ? ctx.meta.activeCityProfile : null;
  const reliefType = String(profile?.terrain?.relief || ls.relief || 'plain');
  const profileRivers = Number.isFinite(Number(profile?.terrain?.rivers)) ? Number(profile.terrain.rivers) : null;
  const profileLakes = Number.isFinite(Number(profile?.terrain?.lakes)) ? Number(profile.terrain.lakes) : null;
  if (ls.profileDriven === true || (profile && ls.generate === true && ls.hills == null && ls.ordered == null)) {
    // apply gentle defaults only when not explicitly specified (profile-driven forms/presets, R1.1)
    const formsPreset = (profile?.terrain?.forms && typeof profile.terrain.forms === 'object') ? profile.terrain.forms : null;
    const reliefForms = (formsPreset?.[reliefType] && typeof formsPreset[reliefType] === 'object') ? formsPreset[reliefType] : null;
    const pickForm = (key) => (reliefForms && Object.prototype.hasOwnProperty.call(reliefForms, key)) ? reliefForms[key]
      : (formsPreset && Object.prototype.hasOwnProperty.call(formsPreset, key) ? formsPreset[key] : undefined);
    if (ls.ordered == null) {
      const ordPreset = pickForm('ordered');
      if (ordPreset != null) ls.ordered = !!ordPreset;
      else if (reliefType !== 'plain') ls.ordered = true;
    }
    if (reliefType === 'hills') {
      // Hill town / rugged presets (§4.2): large forms + terraces/platforms for flat sites on slopes.
      if (ls.largeForms == null) ls.largeForms = pickForm('largeForms') ?? { count: 2, minHeight: 22, maxHeight: 55, minRadius: Math.max(120, size * 0.22), maxRadius: Math.max(220, size * 0.42) };
      if (ls.terraces == null) ls.terraces = pickForm('terraces') ?? { count: 4, minRadius: 28, maxRadius: 80 };
      if (ls.platforms == null) ls.platforms = pickForm('platforms') ?? { count: Math.max(2, Math.min(5, Math.round(size / 320))) };
      if (ls.hills == null) ls.hills = pickForm('hills') ?? { count: 9, minHeight: 12, maxHeight: 38, minRadius: 90, maxRadius: 240 };
    } else if (reliefType === 'plain') {
      if (ls.ordered == null) ls.ordered = false; // keep simple forms by default on plains unless explicitly requested
      if (ls.largeForms == null) ls.largeForms = pickForm('largeForms') ?? { count: 0 };
      if (ls.terraces == null) ls.terraces = pickForm('terraces') ?? { count: 0 };
      if (ls.platforms == null) ls.platforms = pickForm('platforms') ?? { count: Math.max(1, Math.min(3, Math.round(size / 450))) };
      if (ls.hills == null) ls.hills = pickForm('hills') ?? { count: 4, minHeight: 5, maxHeight: 18, minRadius: 140, maxRadius: 340 };
    } else {
      // generic non-plain relief
      if (ls.largeForms == null) ls.largeForms = pickForm('largeForms') ?? { count: 1, minHeight: 18, maxHeight: 45 };
      if (ls.terraces == null) ls.terraces = pickForm('terraces') ?? { count: 2 };
      if (ls.platforms == null) ls.platforms = pickForm('platforms') ?? { count: Math.max(1, Math.min(4, Math.round(size / 400))) };
      if (ls.hills == null) ls.hills = pickForm('hills') ?? { count: 6, minHeight: 8, maxHeight: 30, minRadius: 100, maxRadius: 280 };
    }
    if (ls.river == null && profileRivers != null) {
      const hydroPreset = (profile?.terrain?.hydrology && typeof profile.terrain.hydrology === 'object')
        ? profile.terrain.hydrology
        : ((profile?.hydrology && typeof profile.hydrology === 'object') ? profile.hydrology : {});
      const riverPreset = (hydroPreset.river && typeof hydroPreset.river === 'object') ? hydroPreset.river : null;
      ls.river = {
        enabled: riverPreset?.enabled != null ? riverPreset.enabled : profileRivers > 0,
        axis: riverPreset?.axis === 'x' ? 'x' : 'z',
        points: Number.isInteger(riverPreset?.points) ? riverPreset.points : 7,
        width: Number.isFinite(Number(riverPreset?.width)) ? Number(riverPreset.width) : 22,
        depth: Number.isFinite(Number(riverPreset?.depth)) ? Number(riverPreset.depth) : 4,
      };
    }
    if (ls.lake == null && profileLakes != null) {
      const hydroPreset = (profile?.terrain?.hydrology && typeof profile.terrain.hydrology === 'object')
        ? profile.terrain.hydrology
        : ((profile?.hydrology && typeof profile.hydrology === 'object') ? profile.hydrology : {});
      const lakePreset = (hydroPreset.lake && typeof hydroPreset.lake === 'object') ? hydroPreset.lake : null;
      ls.lake = {
        enabled: lakePreset?.enabled != null ? lakePreset.enabled : profileLakes > 0,
        ...(Number.isFinite(Number(lakePreset?.radius)) ? { radius: Number(lakePreset.radius) } : {}),
      };
    }
  }

  // R1.1 (§4.2): build modifiers in ordered layers when requested; default behavior preserved.
  const ordered = ls.ordered === true || ls.profileDriven === true;
  const largeForms = [];
  const mediumHills = [];
  const terraces = [];
  const platforms = [];

  // 1) Large forms (1–3), radius 25–60% of plate
  const largeCfg = ls.largeForms || {};
  const largeCount = ordered ? clamp(Number.isInteger(largeCfg.count) ? largeCfg.count : 0, 0, 3) : 0;
  for (let i = 0; i < largeCount; i++) {
    const x = lerp(-half * 0.5, half * 0.5, rng());
    const z = lerp(-half * 0.5, half * 0.5, rng());
    const radius = lerp(size * 0.25, size * 0.6, rng());
    const height = lerp(Number.isFinite(largeCfg.minHeight) ? largeCfg.minHeight : 20, Number.isFinite(largeCfg.maxHeight) ? largeCfg.maxHeight : 80, rng());
    const ltype = largeCfg.type === 'valley' ? 'valley' : 'mountain';
    largeForms.push({
      id: `large_${i + 1}`,
      type: ltype,
      center: [Math.round(x * 10) / 10, Math.round(z * 10) / 10],
      radius: Math.round(radius * 10) / 10,
      height: Math.round(height * 10) / 10,
      falloff: 'smooth',
    });
  }

  // 2) Medium hills (existing/default hills generation)
  const hillsCfg = ls.hills || {};
  const wantHills = hillsCfg.enabled !== false;
  const count = clamp(Number.isInteger(hillsCfg.count) ? hillsCfg.count : 6, 0, 40);
  const minH = Number.isFinite(hillsCfg.minHeight) ? hillsCfg.minHeight : 10;
  const maxH = Number.isFinite(hillsCfg.maxHeight) ? hillsCfg.maxHeight : 45;
  const minR = Number.isFinite(hillsCfg.minRadius) ? hillsCfg.minRadius : 80;
  const maxR = Number.isFinite(hillsCfg.maxRadius) ? hillsCfg.maxRadius : 300;
  const type = hillsCfg.type === 'valley' ? 'valley' : 'mountain';
  let attempts = 0;
  for (let i = 0; i < count && attempts < count * 20; attempts++) {
    const x = lerp(-half * 0.8, half * 0.8, rng());
    const z = lerp(-half * 0.8, half * 0.8, rng());
    if (!farFromAnchors(x, z, anchors, Math.max(40, minR * 0.25))) continue;
    const radius = lerp(minR, maxR, rng());
    const height = lerp(minH, maxH, rng());
    // §4.2/§4.7: keep hills within gentle slope ratio when ordered/profile-driven
    let h = height, r = radius;
    if (ordered && r > EPS && Math.abs(h) / r > 0.06) h = Math.sign(h || 1) * r * 0.06;
    mediumHills.push({
      id: `hill_${i + 1}`,
      type,
      center: [Math.round(x * 10) / 10, Math.round(z * 10) / 10],
      radius: Math.round(r * 10) / 10,
      height: Math.round(h * 10) / 10,
      falloff: 'smooth',
    });
    i++;
  }

  // 4) Terraces (replace/step) - optional, placed on slopes
  const terraceCfg = ls.terraces || {};
  const terraceCount = ordered ? clamp(Number.isInteger(terraceCfg.count) ? terraceCfg.count : 0, 0, 12) : 0;
  for (let i = 0; i < terraceCount; i++) {
    const x = lerp(-half * 0.7, half * 0.7, rng());
    const z = lerp(-half * 0.7, half * 0.7, rng());
    if (!farFromAnchors(x, z, anchors, 50)) continue;
    const radius = lerp(Number.isFinite(terraceCfg.minRadius) ? terraceCfg.minRadius : 30, Number.isFinite(terraceCfg.maxRadius) ? terraceCfg.maxRadius : 90, rng());
    const baseY = ctx.input?.ground?.y ?? 0;
    const levelY = Math.round(terrainHeightAt(x, z, baseY, [...largeForms, ...mediumHills]) * 1000) / 1000;
    // Compiler-safe approximation (mountain/valley only): represent terrace as additive local raise.
    const tDelta = Math.max(0, levelY - baseY);
    terraces.push({
      id: `terrace_${i + 1}`,
      type: 'mountain',
      center: [Math.round(x * 10) / 10, Math.round(z * 10) / 10],
      radius: Math.round(radius * 10) / 10,
      height: Math.round(tDelta * 1000) / 1000,
      falloff: 'smooth',
      operation: 'add',
    });
  }

  // 5) Reserved platforms (replace/smooth) - optional, last
  const platformCfg = ls.platforms || {};
  const platformCount = ordered ? clamp(Number.isInteger(platformCfg.count) ? platformCfg.count : 0, 0, 8) : 0;
  for (let i = 0; i < platformCount; i++) {
    // bias toward anchors/center for interchange/station/plaza-like pads
    const ax = anchors[i % anchors.length]?.x ?? 0;
    const az = anchors[i % anchors.length]?.z ?? 0;
    const x = clamp(ax + lerp(-120, 120, rng()), -half * 0.85, half * 0.85);
    const z = clamp(az + lerp(-120, 120, rng()), -half * 0.85, half * 0.85);
    const radius = lerp(Number.isFinite(platformCfg.minRadius) ? platformCfg.minRadius : 40, Number.isFinite(platformCfg.maxRadius) ? platformCfg.maxRadius : 120, rng());
    const baseY = ctx.input?.ground?.y ?? 0;
    const levelY = Math.round(terrainHeightAt(x, z, baseY, [...largeForms, ...mediumHills, ...terraces]) * 1000) / 1000;
    // Compiler-safe approximation (mountain/valley only): represent platform as additive local raise.
    const pDelta = Math.max(0, levelY - baseY);
    platforms.push({
      id: `platform_${i + 1}`,
      type: 'mountain',
      center: [Math.round(x * 10) / 10, Math.round(z * 10) / 10],
      radius: Math.round(radius * 10) / 10,
      height: Math.round(pDelta * 1000) / 1000,
      falloff: 'smooth',
      operation: 'add',
    });
  }

  const MAX_TERRAIN_MODIFIERS = 16; // engine/compiler relief.hills limit
  if (wantHills && count > 0) {
    ctx.terrain.modifiers = ordered
      ? [...largeForms, ...mediumHills, ...terraces, ...platforms]
      : mediumHills;
  } else if (ordered && (largeForms.length || terraces.length || platforms.length)) {
    ctx.terrain.modifiers = [...largeForms, ...terraces, ...platforms];
  }
  if (Array.isArray(ctx.terrain.modifiers) && ctx.terrain.modifiers.length > MAX_TERRAIN_MODIFIERS) {
    ctx.terrain.modifiers = ctx.terrain.modifiers.slice(0, MAX_TERRAIN_MODIFIERS);
  }

  const riverCfg = ls.river || {};
  const rivers = [];
  if (riverCfg.enabled === true) {
    const profileId = ctx.meta?.activeCityProfileId ?? null;
    // R1.1/R1.4: profile-driven hydrology across scenarios (explicit config wins).
    // Support multiple main rivers when requested by profile/config; preserve legacy behavior for count==1.
    const profileRiversRequested = Number.isFinite(Number(profile?.terrain?.rivers)) ? Number(profile.terrain.rivers)
      : (Number.isFinite(Number(profile?.hydrology?.rivers)) ? Number(profile.hydrology.rivers) : null);
    const riverCount = Number.isFinite(Number(riverCfg.count)) ? clamp(Math.floor(Number(riverCfg.count)), 0, 4)
      : (riverCfg.enabled === false ? 0
        : Math.max(1, (profileRiversRequested != null && (ls.profileDriven === true || ls.generate === true))
          ? clamp(Math.floor(profileRiversRequested), 0, 4) : 1));

    let width = clamp(Number.isFinite(riverCfg.width) ? riverCfg.width : 24, 4, 120);
    if (!Number.isFinite(Number(riverCfg.width)) && profileId === 'railway_industrial') width = clamp(width * 0.85, 4, 120);
    if (!Number.isFinite(Number(riverCfg.width)) && profileId === 'river_trade') width = clamp(width * 1.05, 4, 120);
    const depth = clamp(Number.isFinite(riverCfg.depth) ? riverCfg.depth : 4, 0.5, 30);
    const margin = half * 0.9;
    const axis = riverCfg.axis === 'x' ? 'x' : 'z';
    const steps = clamp(Number.isInteger(riverCfg.points) ? riverCfg.points : 6, 2, 24);
    const baseY0 = ctx.input?.ground?.y ?? 0;

    const useDownslope = (riverCfg.downslope === true)
      || (riverCfg.downslope == null && riverCfg.meander !== true && (ls.profileDriven === true || profile != null));

    const profileTribRaw = profile?.terrain?.tributaries ?? profile?.hydrology?.tributaries;
    const resolveProfileTribCount = (raw, allowAuto) => {
      if (!allowAuto) return 0;
      if (raw === true) return 1;
      if (raw === false || raw == null) return 0;
      if (Number.isFinite(Number(raw))) return clamp(Math.floor(Number(raw)), 0, 4);
      if (raw && typeof raw === 'object') {
        const min = clamp(Math.floor(Number(raw.min ?? 0) || 0), 0, 4);
        const maxRaw = raw.max ?? raw.min ?? 0;
        const max = Math.max(min, clamp(Math.floor(Number(maxRaw) || 0), 0, 4));
        if (max === min) return min;
        // Deterministic auto selection per scenario/profile/river (R1.4: across scenarios).
        return min + Math.floor(rng() * (max - min + 1));
      }
      return 0;
    };
    const allowProfileAutoTrib = (ls.profileDriven === true || ls.generate === true);

    for (let ri = 0; ri < riverCount; ri++) {
      const riverId = ri === 0 ? 'river_1' : `river_${ri + 1}`;
      const lateralOffset = (riverCount <= 1) ? 0 : lerp(-margin * 0.35, margin * 0.35, (ri + 1) / (riverCount + 1));
      const points = [];
      let mainWidth = width;
      let mainDepth = depth;
      if (riverCount > 1 && ri > 0) {
        mainWidth = clamp(width * (0.85 + ri * 0.05), 4, 120);
        mainDepth = clamp(depth * (0.9 + ri * 0.03), 0.5, 30);
      }

      if (useDownslope) {
        // R1.4: cost-traced downslope-biased path across the plate (deterministic greedy walk).
        // Preferred for profile-driven generation unless explicitly overridden.
        const crossStep = (margin * 2) / (steps - 1);
        const lateralStep = Math.max(8, Math.min(32, crossStep));
        const startAlong = -margin;
        // choose start lateral offset with lowest terrain at source edge among sampled candidates
        let bestLat = lateralOffset, bestH = Infinity;
        for (let k = -4; k <= 4; k++) {
          const lat = clamp(lateralOffset + (k / 4) * margin * 0.6, -margin * 0.7, margin * 0.7);
          const sx = axis === 'z' ? lat : startAlong;
          const sz = axis === 'z' ? startAlong : lat;
          const h = terrainHeightAt(sx, sz, baseY0, ctx.terrain.modifiers);
          if (h < bestH - 1e-9 || (Math.abs(h - bestH) <= 1e-9 && Math.abs(lat - lateralOffset) < Math.abs(bestLat - lateralOffset))) { bestH = h; bestLat = lat; }
        }
        let lat = bestLat;
        let prevY = bestH;
        const widthProfile = [];
        for (let i = 0; i < steps; i++) {
          const t = steps === 1 ? 0.5 : i / (steps - 1);
          const along = lerp(-margin, margin, t);
          let best = null;
          // evaluate a few lateral moves biased to descent (cost-traced: prefer valleys, avoid uphill/turns)
          for (let d = -2; d <= 2; d++) {
            const nlat = clamp(lat + d * lateralStep, -margin * 0.75, margin * 0.75);
            const x = axis === 'z' ? nlat : along;
            const z = axis === 'z' ? along : nlat;
            const y = terrainHeightAt(x, z, baseY0, ctx.terrain.modifiers);
            const turn = Math.abs(nlat - lat);
            const uphill = Math.max(0, y - prevY);
            const downhill = Math.max(0, prevY - y);
            // Strongly avoid uphill, prefer lower terrain and gentle descent, penalize sharp lateral turns.
            const cost = y + uphill * 3.5 - downhill * 0.15 + turn * 0.06;
            if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) <= 1e-9 && d === 0)) {
              best = { x, z, y, nlat, cost };
            }
          }
          lat = best.nlat;
          prevY = best.y;
          points.push([Math.round(best.x * 10) / 10, Math.round(best.y * 1000) / 1000, Math.round(best.z * 10) / 10]);
          const lo = profileId === 'river_trade' ? 0.8 : 0.7;
          const hi = profileId === 'river_trade' ? 1.35 : 1.3;
          const w = Math.round(mainWidth * lerp(lo, hi, t) * 1000) / 1000;
          widthProfile.push([+t.toFixed(4), w]);
        }
        const river = { id: riverId, path: points, width: mainWidth, depth: mainDepth, carveTerrain: riverCfg.carveTerrain !== false, downslope: true };
        if (widthProfile.length >= 2) river.widthProfile = widthProfile;
        rivers.push(river);
      } else {
        // Simple deterministic meandering river roughly across the map (west->east or north->south)
        // R1.4: optional meander/widthProfile params (backward-compatible defaults keep prior shape family)
        const profileIdLocal = ctx.meta?.activeCityProfileId ?? null;
        const meander = riverCfg.meander === true || (riverCfg.meander == null && profileIdLocal === 'river_trade');
        const baseAmp = Math.min(half * 0.35, Number.isFinite(riverCfg.amplitude) ? riverCfg.amplitude : (profileIdLocal === 'river_trade' ? half * 0.24 : half * 0.2));
        const amp = meander ? clamp(baseAmp, mainWidth * 3, mainWidth * 6) : baseAmp;
        const base = lerp(-amp, amp, rng()) + lateralOffset;
        const widthProfile = [];
        for (let i = 0; i < steps; i++) {
          const t = steps === 1 ? 0.5 : i / (steps - 1);
          const along = lerp(-margin, margin, t);
          const phase = t * Math.PI * (meander ? (profileIdLocal === 'river_trade' ? 2.8 : 2.5) : 2) + rng() * 0.5;
          const wiggle = base + Math.sin(phase) * amp * 0.5 + (meander ? Math.sin(phase * 0.5) * amp * 0.15 : 0);
          const x = axis === 'z' ? wiggle : along;
          const z = axis === 'z' ? along : wiggle;
          // sample terrain height for a more grounded path when modifiers exist
          const y = Math.round(terrainHeightAt(x, z, baseY0, ctx.terrain.modifiers) * 1000) / 1000;
          points.push([Math.round(x * 10) / 10, y, Math.round(z * 10) / 10]);
          if (meander || profileIdLocal === 'river_trade') {
            const lo = profileIdLocal === 'river_trade' ? 0.8 : 0.6;
            const hi = profileIdLocal === 'river_trade' ? 1.35 : 1.4;
            const w = Math.round(mainWidth * lerp(lo, hi, t) * 1000) / 1000;
            widthProfile.push([+t.toFixed(4), w]);
          }
        }
        const river = { id: riverId, path: points, width: mainWidth, depth: mainDepth, carveTerrain: riverCfg.carveTerrain !== false, meander: meander || undefined };
        if (widthProfile.length >= 2) river.widthProfile = widthProfile;
        rivers.push(river);
      }

      // R1.4 (profile-driven/opt-in): deterministic tributaries for main river(s).
      // Cost-traced upstream-to-join path; preserves first-tributary RNG/behavior when count=1 and single main river.
      // Explicit riverCfg.tributaryCount/tributaries wins; otherwise use active profile terrain/hydrology spec.
      const main = rivers[rivers.length - 1];
      const profileTribCount = resolveProfileTribCount(profileTribRaw, allowProfileAutoTrib);
      const legacyRiverTradeAuto = (profileId === 'river_trade' && profileTribCount === 0 && allowProfileAutoTrib && ri === 0) ? 1 : 0;
      const tribCount = Number.isFinite(Number(riverCfg.tributaryCount))
        ? clamp(Math.floor(Number(riverCfg.tributaryCount)), 0, 4)
        : (riverCfg.tributaries === false ? 0
          : (riverCfg.tributaries === true ? Math.max(1, profileTribCount || 1)
            : Math.max(profileTribCount, legacyRiverTradeAuto)));
      if (tribCount > 0) {
        const mpath = Array.isArray(main?.path) ? main.path : [];
        if (mpath.length >= 4) {
          for (let ti = 0; ti < tribCount; ti++) {
            // For ti==0 keep legacy RNG sequence/params for deterministic compatibility (single-main-river legacy path).
            const joinT = ti === 0 ? (0.38 + rng() * 0.18) : (0.22 + rng() * 0.56);
            const joinIdx = clamp(Math.round(lerp(1, mpath.length - 2, joinT)), 1, mpath.length - 2);
            const join = mpath[joinIdx];
            const prev = mpath[Math.max(0, joinIdx - 1)];
            const next = mpath[Math.min(mpath.length - 1, joinIdx + 1)];
            const tdx = Number(next[0]) - Number(prev[0]);
            const tdz = Number(next[2]) - Number(prev[2]);
            const tlen = Math.hypot(tdx, tdz) || 1;
            const side = rng() < 0.5 ? -1 : 1;
            const nx = (-tdz / tlen) * side;
            const nz = (tdx / tlen) * side;
            // bias source slightly upstream of join to create a natural confluence
            const flowx = (Number(next[0]) - Number(join[0])) / (Math.hypot(Number(next[0]) - Number(join[0]), Number(next[2]) - Number(join[2])) || 1);
            const flowz = (Number(next[2]) - Number(join[2])) / (Math.hypot(Number(next[0]) - Number(join[0]), Number(next[2]) - Number(join[2])) || 1);
            const tribLen = clamp(
              Number.isFinite(riverCfg.tributaryLength) ? riverCfg.tributaryLength : size * ((ti === 0 ? 0.18 : 0.14) + rng() * (ti === 0 ? 0.08 : 0.1)),
              80, half * 0.7
            );
            const tSteps = clamp(Number.isInteger(riverCfg.tributaryPoints) ? riverCfg.tributaryPoints : 4, 3, 8);
            const tWidth = clamp((Number(main.width) || mainWidth) * ((ti === 0 ? 0.45 : 0.35) + rng() * 0.15), 4, Math.max(6, (Number(main.width) || mainWidth) * 0.8));
            const tDepth = clamp((Number(main.depth) || mainDepth) * (0.55 + rng() * 0.2), 0.5, Number(main.depth) || mainDepth);
            const minClear = (Number(main.width) || mainWidth) * 0.5 + 10;
            const jx = Number(join[0]), jz = Number(join[2]), jy = Number(join[1]) || baseY0;

            const buildGeometric = () => {
              const tpath = [[jx, jy, jz]];
              let ok = true;
              for (let i = 1; i < tSteps; i++) {
                const t = i / (tSteps - 1);
                const along = tribLen * t;
                const spread = lerp(0.15, 0.55, t) * tribLen * (0.6 + rng() * 0.4);
                const x = jx + nx * along - flowx * spread * 0.25;
                const z = jz + nz * along - flowz * spread * 0.25;
                const cx = clamp(x, -half + 8, half - 8);
                const cz = clamp(z, -half + 8, half - 8);
                const y = Math.round(terrainHeightAt(cx, cz, baseY0, ctx.terrain.modifiers) * 1000) / 1000;
                if (riverMinDistToPoint(main, cx, cz) < minClear && i < tSteps - 1) { ok = false; break; }
                tpath.push([Math.round(cx * 10) / 10, y, Math.round(cz * 10) / 10]);
              }
              return ok && tpath.length >= 3 && !polylineSelfIntersects(tpath) ? tpath : null;
            };

            let tpath = null;
            // Choose upstream source with deterministic local search (prefer valid, not too low vs join).
            let bestSrc = null;
            for (let k = -2; k <= 2; k++) {
              const along = tribLen;
              const lateral = k * tribLen * 0.12;
              const sx = clamp(jx + nx * along - flowx * (tribLen * 0.2 + Math.abs(lateral) * 0.1) + (-flowz) * lateral, -half + 8, half - 8);
              const sz = clamp(jz + nz * along - flowz * (tribLen * 0.2 + Math.abs(lateral) * 0.1) + (flowx) * lateral, -half + 8, half - 8);
              if (riverMinDistToPoint(main, sx, sz) < minClear) continue;
              const sy = terrainHeightAt(sx, sz, baseY0, ctx.terrain.modifiers);
              const score = sy - Math.abs(k) * 0.35; // prefer higher/feasible source, mild center bias
              if (!bestSrc || score > bestSrc.score + 1e-9 || (Math.abs(score - bestSrc.score) <= 1e-9 && Math.abs(k) < Math.abs(bestSrc.k))) {
                bestSrc = { x: sx, z: sz, y: sy, k, score };
              }
            }
            if (bestSrc) {
              // Trace from source down to join in (tSteps-1) segments, biased toward join and descent.
              const rev = [];
              let cx = bestSrc.x, cz = bestSrc.z, cy = bestSrc.y;
              for (let i = 0; i < tSteps - 1; i++) {
                rev.push([Math.round(cx * 10) / 10, Math.round(cy * 1000) / 1000, Math.round(cz * 10) / 10]);
                if (i === tSteps - 2) break;
                const remain = (tSteps - 2 - i);
                const baseStepX = (jx - cx) / Math.max(1, remain);
                const baseStepZ = (jz - cz) / Math.max(1, remain);
                const baseLen = Math.hypot(baseStepX, baseStepZ) || 1;
                const dirx = baseStepX / baseLen;
                const dirz = baseStepZ / baseLen;
                const px = -dirz, pz = dirx; // perpendicular
                const stepLen = Math.min(tribLen / (tSteps - 1), Math.max(18, baseLen));
                let cand = null;
                for (const off of [0, -0.35, 0.35, -0.7, 0.7]) {
                  const tx = cx + dirx * stepLen + px * stepLen * off;
                  const tz = cz + dirz * stepLen + pz * stepLen * off;
                  const x = clamp(tx, -half + 8, half - 8);
                  const z = clamp(tz, -half + 8, half - 8);
                  const y = terrainHeightAt(x, z, baseY0, ctx.terrain.modifiers);
                  const dJoin = Math.hypot(jx - x, jz - z);
                  const uphill = Math.max(0, y - cy);
                  const downhill = Math.max(0, cy - y);
                  const clear = riverMinDistToPoint(main, x, z);
                  const clearPenalty = clear < minClear ? (minClear - clear) * 5 : 0;
                  const cost = dJoin * 0.03 + y * 0.25 + uphill * 2.2 - downhill * 0.12 + Math.abs(off) * 2.0 + clearPenalty;
                  if (!cand || cost < cand.cost - 1e-9 || (Math.abs(cost - cand.cost) <= 1e-9 && off === 0)) {
                    cand = { x, z, y, cost, clear };
                  }
                }
                if (!cand) break;
                if (cand.clear < minClear * 0.85 && remain > 1) { cand = null; break; }
                cx = cand.x; cz = cand.z; cy = cand.y;
              }
              rev.push([jx, Math.round(jy * 1000) / 1000, jz]); // join last
              // reverse to [join ... source] for existing convention
              const traced = rev.reverse();
              if (traced.length >= 3 && !polylineSelfIntersects(traced)) {
                // ensure intermediate points keep clearance
                let okTrace = true;
                for (let i = 1; i < traced.length - 1; i++) {
                  if (riverMinDistToPoint(main, traced[i][0], traced[i][2]) < minClear * 0.8) { okTrace = false; break; }
                }
                if (okTrace) tpath = traced;
              }
            }
            if (!tpath) tpath = buildGeometric();
            if (tpath && tpath.length >= 3 && !polylineSelfIntersects(tpath)) {
              const baseId = main.id ?? riverId;
              const tid = ti === 0 ? `${baseId}_trib1` : `${baseId}_trib${ti + 1}`;
              const trib = { id: tid, path: tpath, width: Math.round(tWidth * 1000) / 1000, depth: Math.round(tDepth * 1000) / 1000, carveTerrain: riverCfg.carveTerrain !== false, tributaryOf: baseId };
              rivers.push(trib);
            }
          }
        }
      }
    }
  }
  if (riverCfg.enabled === true) ctx.hydrology.rivers = rivers;

  // R1.4 (opt-in/profile-driven): procedural lake in a local low/flat basin with deterministic repair against constraints.
  const lakeCfg = ls.lake || {};
  if (lakeCfg.enabled === true) {
    const lakes = Array.isArray(ctx.hydrology.lakes) ? [...ctx.hydrology.lakes] : [];
    const probeStep = Math.max(32, Math.min(128, size / 10));
    const hydroPresetLakeGen = (profile?.terrain?.hydrology && typeof profile.terrain.hydrology === 'object')
      ? profile.terrain.hydrology
      : ((profile?.hydrology && typeof profile.hydrology === 'object') ? profile.hydrology : {});
    const lakeRadiusDefault = Number.isFinite(Number(lakeCfg.radius)) ? Number(lakeCfg.radius)
      : (Number.isFinite(Number(hydroPresetLakeGen.lakeRadius ?? profile?.terrain?.lakeRadius))
        ? Number(hydroPresetLakeGen.lakeRadius ?? profile?.terrain?.lakeRadius)
        : Math.max(30, size * 0.06));
    const lakeR = clamp(lakeRadiusDefault, 15, Math.max(20, half * 0.4));
    const riverBufAddL = Number.isFinite(Number(hydroPresetLakeGen.riverBufferMargin ?? hydroPresetLakeGen.bufferMargin ?? profile?.terrain?.riverBufferMargin))
      ? Number(hydroPresetLakeGen.riverBufferMargin ?? hydroPresetLakeGen.bufferMargin ?? profile?.terrain?.riverBufferMargin) : 12;
    const riverFloodMulL = Number.isFinite(Number(hydroPresetLakeGen.floodplainMultiplier ?? hydroPresetLakeGen.riverFloodplainMultiplier ?? profile?.terrain?.floodplainMultiplier))
      ? Number(hydroPresetLakeGen.floodplainMultiplier ?? hydroPresetLakeGen.riverFloodplainMultiplier ?? profile?.terrain?.floodplainMultiplier) : 3;
    const candidates = [];
    for (let z = -half * 0.7; z <= half * 0.7 + EPS; z += probeStep) {
      for (let x = -half * 0.7; x <= half * 0.7 + EPS; x += probeStep) {
        if (!farFromAnchors(x, z, anchors, Math.max(60, lakeR + 20))) continue;
        const y = terrainHeightAt(x, z, ctx.input?.ground?.y ?? 0, ctx.terrain.modifiers);
        const d = Math.min(24, probeStep / 2);
        const flat = Math.max(
          Math.abs(terrainHeightAt(x + d, z, ctx.input?.ground?.y ?? 0, ctx.terrain.modifiers) - y),
          Math.abs(terrainHeightAt(x - d, z, ctx.input?.ground?.y ?? 0, ctx.terrain.modifiers) - y),
          Math.abs(terrainHeightAt(x, z + d, ctx.input?.ground?.y ?? 0, ctx.terrain.modifiers) - y),
          Math.abs(terrainHeightAt(x, z - d, ctx.input?.ground?.y ?? 0, ctx.terrain.modifiers) - y),
        ) / Math.max(d, EPS);
        // avoid placing center inside river floodplain/buffer (conservative for profile-driven forms)
        let nearRiver = false;
        for (const rv of rivers) {
          const rw = Number(rv?.width) || 0;
          const riverClear = Math.max(rw * 0.5 + riverBufAddL, rw * clamp(riverFloodMulL, 2, 4));
          if (riverMinDistToPoint(rv, x, z) < (riverClear + lakeR * 0.5 + 4)) { nearRiver = true; break; }
        }
        if (nearRiver) continue;
        const score = y + flat * 5;
        candidates.push({ x, z, y, score });
      }
    }
    candidates.sort((a, b) => (a.score - b.score) || (Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)) || (a.x - b.x) || (a.z - b.z));
    let placed = false;
    const sides = 12;
    for (const cand of candidates.slice(0, 48)) {
      // deterministic repair/validation: ensure ring in-bounds and clear of river floodplain/buffer and anchors
      let ok = true;
      if (!farFromAnchors(cand.x, cand.z, anchors, Math.max(60, lakeR + 20))) ok = false;
      const ring = [];
      for (let i = 0; i < sides && ok; i++) {
        const a = (i / sides) * Math.PI * 2;
        const px = cand.x + Math.cos(a) * lakeR;
        const pz = cand.z + Math.sin(a) * lakeR;
        if (Math.abs(px) > half - 2 || Math.abs(pz) > half - 2) { ok = false; break; }
        if (!farFromAnchors(px, pz, anchors, 24)) { ok = false; break; }
        for (const rv of rivers) {
          const rw = Number(rv?.width) || 0;
          const riverClear = Math.max(rw * 0.5 + riverBufAddL, rw * clamp(riverFloodMulL, 2, 4));
          if (riverMinDistToPoint(rv, px, pz) < (riverClear + 1)) { ok = false; break; }
        }
        ring.push([
          Math.round(px * 1000) / 1000,
          Math.round(cand.y * 1000) / 1000,
          Math.round(pz * 1000) / 1000,
        ]);
      }
      if (!ok || ring.length !== sides) continue;
      lakes.push({ id: `lake_${lakes.length + 1}`, area: { type: 'polygon', points: ring }, waterLevel: Math.round(cand.y * 1000) / 1000 });
      ctx.hydrology.lakes = lakes;
      placed = true;
      break;
    }
    if (!placed) {
      ctx.report.diagnostics.push(warn('lake_generation_skipped', stageId, 'procedural lake requested but no valid placement found (constraints/repair exhausted)', { requested: 1 }));
    }
  }

  ctx.report.diagnostics.push(info('landscape_generated', stageId, 'stage 1 generated terrain/hydrology from generator.landscape', {
    modifiers: ctx.terrain.modifiers.length,
    rivers: ctx.hydrology.rivers.length,
    seed,
  }));
}

function uniqIds(items, kind, ctx, stageId) {
  const seen = new Set();
  const out = [];
  for (const it of items ?? []) {
    let cur = it;
    let id = String(cur?.id ?? kind);
    if (seen.has(id)) {
      let k = 2;
      while (seen.has(`${id}_${k}`)) k++;
      const nid = `${id}_${k}`;
      ctx.report.repairs.push({ stage: stageId, id, code: 'duplicate_id_renamed', to: nid });
      ctx.report.diagnostics.push(warn('duplicate_id', stageId, `${kind} '${id}' renamed to '${nid}'`, { id, to: nid }));
      id = nid;
      cur = { ...cur, id };
    }
    seen.add(id);
    out.push(cur?.id === id ? cur : { ...cur, id });
  }
  return out;
}

export function makeStage1() {
  return {
    id: '1_landscape_hydrology',
    prepare(ctx) {
      const cf = ctx.input?.cityforge ?? {};
      ctx.masks.easement = { rivers: [], roads: [] };
      ctx.terrain = {
        modifiers: Array.isArray(cf.terrain?.modifiers) ? structuredClone(cf.terrain.modifiers) : [],
      };
      ctx.hydrology = {
        rivers: Array.isArray(cf.hydrology?.rivers) ? structuredClone(cf.hydrology.rivers) : [],
        lakes: Array.isArray(cf.hydrology?.lakes) ? structuredClone(cf.hydrology.lakes) : [],
      };
    },
    generate(ctx) {
      const stageId = '1_landscape_hydrology';
      if (shouldGenerate(ctx)) {
        generateLandscape(ctx);
        return;
      }
      ctx.report.diagnostics.push(info('landscape_passthrough', stageId, 'stage 1 using provided terrain/hydrology (procedural generation pending)', {
        modifiers: ctx.terrain.modifiers.length,
        rivers: ctx.hydrology.rivers.length,
        lakes: ctx.hydrology.lakes.length,
      }));
    },
    validate(ctx) {
      const g = ctx.meta.worldBounds?.size ?? ctx.input?.ground?.size ?? 0;
      const half = g / 2;
      const stageId = '1_landscape_hydrology';
      // terrain modifiers
      const mods = [];
      for (const m of ctx.terrain.modifiers) {
        if (!m || typeof m !== 'object') {
          ctx.report.diagnostics.push(warn('invalid_modifier', stageId, 'terrain modifier dropped: not an object'));
          ctx.report.drops.push({ stage: stageId, id: null, reason: 'invalid_modifier' });
          continue;
        }
        const type = m.type;
        if (type !== 'mountain' && type !== 'valley' && type !== 'terrain_modifier') {
          ctx.report.diagnostics.push(warn('unsupported_modifier_type', stageId, `modifier '${m.id ?? '?'}' type '${type}' unsupported; kept for compiler validation`));
        }
        let mm = { ...m };
        if (Number.isFinite(mm.height)) {
          const ch = clamp(mm.height, -300, 300);
          if (ch !== mm.height) { mm.height = ch; ctx.report.repairs.push({ stage: stageId, id: mm.id, code: 'clamp_height', to: ch }); }
        }
        if (Number.isFinite(mm.radius)) {
          const cr = clamp(mm.radius, 1, g * 2);
          if (cr !== mm.radius) { mm.radius = cr; ctx.report.repairs.push({ stage: stageId, id: mm.id, code: 'clamp_radius', to: cr }); }
        }
        if (Array.isArray(mm.center) && mm.center.length >= 2) {
          const cx = clamp(Number(mm.center[0]) || 0, -half, half);
          const cz = clamp(Number(mm.center[1]) || 0, -half, half);
          if (cx !== mm.center[0] || cz !== mm.center[1]) {
            mm.center = [cx, cz, mm.center[2] ?? 0];
            ctx.report.repairs.push({ stage: stageId, id: mm.id, code: 'clamp_center' });
          }
        }
        mods.push(mm);
      }
      ctx.terrain.modifiers = uniqIds(mods, 'modifier', ctx, stageId);

      // waterways
      const gp = ctx.input?.gameplay ?? {};
      const anchors = [
        { name: 'spawn', x: gp.spawn?.x ?? 0, z: gp.spawn?.z ?? 0 },
        { name: 'exit', x: gp.exit?.x ?? 0, z: gp.exit?.z ?? 0 },
      ];
      const rivers = [];
      for (const r of ctx.hydrology.rivers) {
        if (!r || typeof r !== 'object') {
          ctx.report.drops.push({ stage: stageId, id: null, reason: 'invalid_river' });
          continue;
        }
        let path = Array.isArray(r.path) ? r.path.filter(p => Array.isArray(p) && p.length >= 2).map(p => [Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0]) : [];
        if (path.length < 2) {
          ctx.report.diagnostics.push(warn('river_too_short', stageId, `river '${r.id ?? '?'}' dropped: path < 2 points`));
          ctx.report.drops.push({ stage: stageId, id: r.id ?? null, reason: 'river_too_short' });
          continue;
        }
        // bounds: clamp points to plate
        let clamped = false;
        path = path.map(p => {
          const x = clamp(p[0], -half, half), z = clamp(p[2], -half, half);
          if (x !== p[0] || z !== p[2]) clamped = true;
          return [Math.round(x * 1000) / 1000, p[1], Math.round(z * 1000) / 1000];
        });
        if (clamped) ctx.report.repairs.push({ stage: stageId, id: r.id ?? null, code: 'clamp_river_path_bounds' });

        let rr = { ...r, path };
        if (Number.isFinite(rr.width)) {
          const cw = clamp(rr.width, 2, 200);
          if (cw !== rr.width) { rr.width = cw; ctx.report.repairs.push({ stage: stageId, id: rr.id, code: 'clamp_river_width', to: cw }); }
        }
        if (Number.isFinite(rr.depth)) {
          const cd = clamp(rr.depth, 0, 100);
          if (cd !== rr.depth) { rr.depth = cd; ctx.report.repairs.push({ stage: stageId, id: rr.id, code: 'clamp_river_depth', to: cd }); }
        }

        // geometric validation: self-intersection
        if (polylineSelfIntersects(path)) {
          ctx.report.diagnostics.push(warn('river_self_intersection', stageId, `river '${rr.id ?? '?'}' dropped: self-intersecting path`));
          ctx.report.drops.push({ stage: stageId, id: rr.id ?? null, reason: 'river_self_intersection' });
          continue;
        }

        // anchor conflict: river corridor too close to spawn/exit (flag/warn; bridges/routes handled later)
        const clearance = (rr.width ?? 0) * 0.5 + 6;
        for (const a of anchors) {
          const d = riverMinDistToPoint(rr, a.x, a.z);
          if (d < clearance) {
            ctx.report.diagnostics.push(warn('river_anchor_conflict', stageId, `river '${rr.id ?? '?'}' within ${clearance.toFixed(1)}m of ${a.name} (dist ${d.toFixed(1)}m)`, { anchor: a.name, distance: d, id: rr.id ?? null }));
          }
        }

        // easement mask: reserve corridor around river centerline (approx by width)
        // R1.4/R1.5/R0.4: buffer/floodplain metadata (profile-driven presets; defaults preserve prior behavior)
        const w = Number(rr.width ?? 0) || 0;
        const _cfProfile = (ctx.meta?.activeCityProfile && typeof ctx.meta.activeCityProfile === 'object') ? ctx.meta.activeCityProfile : null;
        const hydroPreset = (_cfProfile?.terrain?.hydrology && typeof _cfProfile.terrain.hydrology === 'object')
          ? _cfProfile.terrain.hydrology
          : ((_cfProfile?.hydrology && typeof _cfProfile.hydrology === 'object') ? _cfProfile.hydrology : {});
        const riverBufAdd = Number.isFinite(Number(hydroPreset.riverBufferMargin ?? hydroPreset.bufferMargin ?? _cfProfile?.terrain?.riverBufferMargin))
          ? Number(hydroPreset.riverBufferMargin ?? hydroPreset.bufferMargin ?? _cfProfile?.terrain?.riverBufferMargin) : 12;
        const riverFloodMul = Number.isFinite(Number(hydroPreset.floodplainMultiplier ?? hydroPreset.riverFloodplainMultiplier ?? _cfProfile?.terrain?.floodplainMultiplier))
          ? Number(hydroPreset.floodplainMultiplier ?? hydroPreset.riverFloodplainMultiplier ?? _cfProfile?.terrain?.floodplainMultiplier) : 3;
        const buffer = +(w * 0.5 + riverBufAdd).toFixed(3); // conservative non-buildable corridor (aligns with parcel/stage-3 checks)
        const floodplain = +(w * clamp(riverFloodMul, 2, 4)).toFixed(3); // §5.3: ~2–4 widths (profile-driven preset, default 3)
        ctx.masks.easement.rivers.push({ id: rr.id ?? null, path, width: w, buffer, floodplain });
        ctx.masks.terrain = ctx.masks.terrain || {};
        if (!Array.isArray(ctx.masks.terrain.waterBuffers)) ctx.masks.terrain.waterBuffers = [];
        ctx.masks.terrain.waterBuffers.push({ id: rr.id ?? null, type: 'river', buffer, floodplain, buildableBuffer: true });
        if (!Array.isArray(ctx.masks.terrain.floodplains)) ctx.masks.terrain.floodplains = [];
        ctx.masks.terrain.floodplains.push({ id: rr.id ?? null, type: 'river', floodplain, path, width: w });
        rivers.push(rr);
      }
      ctx.hydrology.rivers = uniqIds(rivers, 'river', ctx, stageId);
      // R1.4/R1.5: expose water buffer metadata in terrain analysis for downstream stages (additive)
      if (!ctx.terrain || typeof ctx.terrain !== 'object') ctx.terrain = { modifiers: Array.isArray(cf.terrain?.modifiers) ? structuredClone(cf.terrain.modifiers) : [] };
      if (!ctx.terrain.analysis || typeof ctx.terrain.analysis !== 'object') ctx.terrain.analysis = {};
      ctx.terrain.analysis.waterBuffers = ctx.masks?.terrain?.waterBuffers ?? ctx.terrain.analysis.waterBuffers ?? [];
      ctx.terrain.analysis.floodplains = ctx.masks?.terrain?.floodplains ?? ctx.terrain.analysis.floodplains ?? [];

      // lakes: basic validation (compiler support limited; keep deterministic/safe)
      const lakes = [];
      for (const l of ctx.hydrology.lakes) {
        if (!l || typeof l !== 'object') {
          ctx.report.diagnostics.push(warn('invalid_lake', stageId, 'lake dropped: not an object'));
          ctx.report.drops.push({ stage: stageId, id: null, reason: 'invalid_lake' });
          continue;
        }
        const ll = { ...l };
        if (!ll.id || typeof ll.id !== 'string') ll.id = `lake_${lakes.length + 1}`;
        if (ll.waterLevel != null && !Number.isFinite(Number(ll.waterLevel))) {
          delete ll.waterLevel;
          ctx.report.repairs.push({ stage: stageId, id: ll.id, code: 'drop_invalid_lake_water_level' });
        } else if (ll.waterLevel != null) {
          ll.waterLevel = Number(ll.waterLevel);
        }
        if (!ll.area || typeof ll.area !== 'object') {
          ctx.report.diagnostics.push(warn('invalid_lake_area', stageId, `lake '${ll.id}' dropped: missing/invalid area`));
          ctx.report.drops.push({ stage: stageId, id: ll.id, reason: 'invalid_lake_area' });
          continue;
        }
        lakes.push(ll);
      }
      ctx.hydrology.lakes = uniqIds(lakes, 'lake', ctx, stageId);
      // R1.4/R1.5/R0.4: lake buffers/floodplain margins (additive, profile-driven presets). §5.4: 5–10m strip from water;
      // treat floodplain/no-build margin around lakes as downstream constraint for parcels/buildings/props/finalize.
      ctx.masks.terrain = ctx.masks.terrain || {};
      if (!Array.isArray(ctx.masks.terrain.waterBuffers)) ctx.masks.terrain.waterBuffers = [];
      if (!ctx.masks.easement.lakes) ctx.masks.easement.lakes = [];
      const _cfProfileLake = (ctx.meta?.activeCityProfile && typeof ctx.meta.activeCityProfile === 'object') ? ctx.meta.activeCityProfile : null;
      const hydroPresetLake = (_cfProfileLake?.terrain?.hydrology && typeof _cfProfileLake.terrain.hydrology === 'object')
        ? _cfProfileLake.terrain.hydrology
        : ((_cfProfileLake?.hydrology && typeof _cfProfileLake.hydrology === 'object') ? _cfProfileLake.hydrology : {});
      const lakeBufferMargin = Number.isFinite(Number(hydroPresetLake.lakeBufferMargin ?? hydroPresetLake.lakeBuffer ?? _cfProfileLake?.terrain?.lakeBufferMargin))
        ? Number(hydroPresetLake.lakeBufferMargin ?? hydroPresetLake.lakeBuffer ?? _cfProfileLake?.terrain?.lakeBufferMargin) : 8; // 5–10m (default 8m)
      const lakeFloodplainMargin = Number.isFinite(Number(hydroPresetLake.lakeFloodplainMargin ?? hydroPresetLake.lakeFloodplain ?? _cfProfileLake?.terrain?.lakeFloodplainMargin))
        ? Number(hydroPresetLake.lakeFloodplainMargin ?? hydroPresetLake.lakeFloodplain ?? _cfProfileLake?.terrain?.lakeFloodplainMargin) : 16;
      for (const ll of ctx.hydrology.lakes) {
        const area = ll?.area;
        let cx = null, cz = null, r = null;
        const pts = Array.isArray(area?.points) ? area.points : (Array.isArray(area) ? area : null);
        if (Array.isArray(pts) && pts.length >= 3) {
          let sx = 0, sz = 0, n = 0;
          for (const p of pts) {
            const x = Number(Array.isArray(p) ? p[0] : p?.x), z = Number(Array.isArray(p) ? p[2] : p?.z);
            if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
            sx += x; sz += z; n++;
          }
          if (n > 0) {
            cx = sx / n; cz = sz / n;
            let maxD = 0;
            for (const p of pts) {
              const x = Number(Array.isArray(p) ? p[0] : p?.x), z = Number(Array.isArray(p) ? p[2] : p?.z);
              if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
              maxD = Math.max(maxD, Math.hypot(x - cx, z - cz));
            }
            r = maxD;
          }
        }
        const buffer = +clamp(lakeBufferMargin, 5, 20).toFixed(3);
        const floodplain = +Math.max(buffer, clamp(lakeFloodplainMargin, 8, 40)).toFixed(3);
        if (Number.isFinite(cx) && Number.isFinite(cz) && Number.isFinite(r) && r > 0) {
          const wb = {
            id: ll.id ?? null,
            type: 'lake',
            center: [Math.round(cx * 1000) / 1000, Math.round(cz * 1000) / 1000],
            radius: Math.round(r * 1000) / 1000,
            buffer,
            floodplain,
            buildableBuffer: true,
          };
          ctx.masks.terrain.waterBuffers.push(wb);
          ctx.masks.easement.lakes.push(wb);
          if (!Array.isArray(ctx.masks.terrain.floodplains)) ctx.masks.terrain.floodplains = [];
          ctx.masks.terrain.floodplains.push({ id: ll.id ?? null, type: 'lake', floodplain, center: wb.center, radius: wb.radius });
        } else {
          // Fallback without reliable geometry: keep conservative buffer metadata for analysis/reporting.
          ctx.masks.terrain.waterBuffers.push({ id: ll.id ?? null, type: 'lake', buffer, floodplain, buildableBuffer: true });
          if (!Array.isArray(ctx.masks.terrain.floodplains)) ctx.masks.terrain.floodplains = [];
          ctx.masks.terrain.floodplains.push({ id: ll.id ?? null, type: 'lake', floodplain });
        }
      }

      // terrain/river profile checks (approximate, deterministic): slopes and bed-vs-terrain
      const baseY = Number(ctx.input?.ground?.y ?? 0) || 0;
      for (const rv of ctx.hydrology.rivers) {
        const path = Array.isArray(rv.path) ? rv.path : [];
        if (path.length < 2) continue;
        const depth = Number.isFinite(rv.depth) ? rv.depth : 0;
        let steep = 0;
        let bedAbove = 0;
        let bedAboveMax = 0;
        for (let i = 0; i < path.length; i++) {
          const p = path[i];
          const ty = terrainHeightAt(p[0], p[2], baseY, ctx.terrain.modifiers);
          const bedY = (Number(p[1]) || 0) - depth;
          // If river is not explicitly carved, bed above terrain is suspicious (floating channel).
          if (rv.carveTerrain === false && bedY > ty + 0.5) {
            bedAbove++;
            bedAboveMax = Math.max(bedAboveMax, bedY - ty);
          }
          if (i + 1 < path.length) {
            const q = path[i + 1];
            const dx = q[0] - p[0], dy = (q[1] || 0) - (p[1] || 0), dz = q[2] - p[2];
            const run = Math.hypot(dx, dz);
            const grade = run > EPS ? Math.abs(dy) / run : 0;
            // generous threshold: rivers can follow terrain but extreme jumps are suspect
            if (grade > 0.35) steep++;
          }
        }
        if (steep > 0) {
          ctx.report.diagnostics.push(warn('river_steep_profile', stageId, `river '${rv.id ?? '?'}' has steep segments (>${(0.35).toFixed(2)} grade)`, { id: rv.id ?? null, segments: steep }));
        }
        if (bedAbove > 0) {
          ctx.report.diagnostics.push(warn('river_bed_above_terrain', stageId, `river '${rv.id ?? '?'}' bed above terrain at ${bedAbove} point(s) without carveTerrain`, { id: rv.id ?? null, points: bedAbove, maxDelta: +bedAboveMax.toFixed(3) }));
        }
      }
      // Spatial index for river segments (TASK-002), conservative clearance for downstream checks.
      // Index bbox must cover water buffer/floodplain so spatial queries don't miss downstream constraints.
      ctx.spatial = ctx.spatial || {};
      const rIdx = createSpatialIndex(ctx.meta.worldBounds ?? { size: ctx.input?.ground?.size ?? 256 });
      const wbById = new Map((ctx.masks?.terrain?.waterBuffers ?? []).filter(w => w?.id).map(w => [w.id, w]));
      const riverFloodMulIdx = (typeof riverFloodMul !== 'undefined' && Number.isFinite(Number(riverFloodMul))) ? Number(riverFloodMul) : 3;
      const riverBufAddIdx = (typeof riverBufAdd !== 'undefined' && Number.isFinite(Number(riverBufAdd))) ? Number(riverBufAdd) : 12;
      for (const rv of ctx.hydrology.rivers) {
        const path = Array.isArray(rv.path) ? rv.path : [];
        const w = Number(rv.width) || 10;
        const meta = wbById.get(rv.id ?? null) || null;
        const buffer = Number.isFinite(Number(meta?.buffer)) ? Number(meta.buffer) : (w * 0.5 + riverBufAddIdx);
        const floodplain = Number.isFinite(Number(meta?.floodplain)) ? Number(meta.floodplain) : Math.max(buffer, w * clamp(riverFloodMulIdx, 2, 4));
        const pad = Math.max(w * 0.5 + 20.0, buffer, floodplain);
        for (let i = 0; i + 1 < path.length; i++) {
          const a = path[i], b = path[i + 1];
          if (!a || !b) continue;
          rIdx.insert({
            id: `${rv.id ?? 'river'}_${i}`,
            riverId: rv.id ?? null,
            ax: a[0], az: a[2], bx: b[0], bz: b[2],
            width: w,
            buffer,
            floodplain,
            minX: Math.min(a[0], b[0]) - pad, maxX: Math.max(a[0], b[0]) + pad,
            minZ: Math.min(a[2], b[2]) - pad, maxZ: Math.max(a[2], b[2]) + pad,
          });
        }
      }
      ctx.spatial.riverSegments = rIdx;

      // terrain slope sanity/repair (basic): very steep hill height/radius ratio
      const repairedMods = [];
      for (const m of ctx.terrain.modifiers) {
        let mm = { ...m };
        if (Number.isFinite(mm.height) && Number.isFinite(mm.radius) && mm.radius > EPS) {
          let ratio = Math.abs(mm.height) / mm.radius;
          if (ratio > 0.8) {
            // Prefer increasing radius (gentler) up to bound, else reduce height.
            const needR = Math.abs(mm.height) / 0.8;
            const maxR = (ctx.meta.worldBounds?.size ?? ctx.input?.ground?.size ?? 256) * 2;
            if (needR <= maxR) {
              mm.radius = Math.round(needR * 1000) / 1000;
              ctx.report.repairs.push({ stage: stageId, id: mm.id, code: 'repair_steep_modifier_radius', to: mm.radius });
              ctx.report.diagnostics.push(warn('terrain_steep_modifier_repaired', stageId, `modifier '${mm.id ?? '?'}' radius increased for slope (ratio ${ratio.toFixed(2)})`, { id: mm.id ?? null, ratio }));
            } else {
              const newH = Math.sign(mm.height || 1) * (mm.radius * 0.8);
              mm.height = Math.round(newH * 1000) / 1000;
              ctx.report.repairs.push({ stage: stageId, id: mm.id, code: 'repair_steep_modifier_height', to: mm.height });
              ctx.report.diagnostics.push(warn('terrain_steep_modifier_repaired', stageId, `modifier '${mm.id ?? '?'}' height reduced for slope (ratio ${ratio.toFixed(2)})`, { id: mm.id ?? null, ratio }));
            }
            ratio = Math.abs(mm.height) / Math.max(mm.radius, EPS);
          }
          if (ratio > 0.8) {
            ctx.report.diagnostics.push(warn('terrain_steep_modifier', stageId, `modifier '${mm.id ?? '?'}' steep (|h|/r=${ratio.toFixed(2)})`, { id: mm.id ?? null, ratio }));
          }
        }
        repairedMods.push(mm);
      }
      ctx.terrain.modifiers = repairedMods;

      // R1.4/R1.5: deterministic repair - ensure every hydrology feature has water buffer/floodplain masks (downstream constraints).
      ctx.masks.terrain = ctx.masks.terrain || {};
      if (!Array.isArray(ctx.masks.terrain.waterBuffers)) ctx.masks.terrain.waterBuffers = [];
      if (!Array.isArray(ctx.masks.terrain.floodplains)) ctx.masks.terrain.floodplains = [];
      if (!ctx.masks.easement) ctx.masks.easement = {};
      if (!Array.isArray(ctx.masks.easement.rivers)) ctx.masks.easement.rivers = [];
      if (!Array.isArray(ctx.masks.easement.lakes)) ctx.masks.easement.lakes = [];
      const _wbById = new Map(ctx.masks.terrain.waterBuffers.filter(w => w?.id).map(w => [w.id, w]));
      const _fpById = new Map(ctx.masks.terrain.floodplains.filter(f => f?.id).map(f => [f.id, f]));
      const _cfProfileRepair = (ctx.meta?.activeCityProfile && typeof ctx.meta.activeCityProfile === 'object') ? ctx.meta.activeCityProfile : null;
      const _hydroPresetRepair = (_cfProfileRepair?.terrain?.hydrology && typeof _cfProfileRepair.terrain.hydrology === 'object') ? _cfProfileRepair.terrain.hydrology : null;
      const _riverBufAddR = Number.isFinite(Number(_hydroPresetRepair?.riverBufferMargin ?? _cfProfileRepair?.terrain?.riverBufferMargin))
        ? Number(_hydroPresetRepair.riverBufferMargin ?? _cfProfileRepair.terrain.riverBufferMargin) : 12;
      const _riverFloodMulR = Number.isFinite(Number(_hydroPresetRepair?.floodplainMultiplier ?? _hydroPresetRepair?.riverFloodplainMultiplier ?? _cfProfileRepair?.terrain?.floodplainMultiplier))
        ? Number(_hydroPresetRepair.floodplainMultiplier ?? _hydroPresetRepair.riverFloodplainMultiplier ?? _cfProfileRepair.terrain.floodplainMultiplier) : 3;
      const _lakeBufR = Number.isFinite(Number(_hydroPresetRepair?.lakeBufferMargin ?? _cfProfileRepair?.terrain?.lakeBufferMargin))
        ? Number(_hydroPresetRepair.lakeBufferMargin ?? _cfProfileRepair.terrain.lakeBufferMargin) : 8;
      const _lakeFloodR = Number.isFinite(Number(_hydroPresetRepair?.lakeFloodplainMargin ?? _hydroPresetRepair?.lakeFloodplain ?? _cfProfileRepair?.terrain?.lakeFloodplainMargin))
        ? Number(_hydroPresetRepair.lakeFloodplainMargin ?? _hydroPresetRepair.lakeFloodplain ?? _cfProfileRepair.terrain.lakeFloodplainMargin) : 16;
      for (const rv of (ctx.hydrology?.rivers ?? [])) {
        if (!rv?.id) continue;
        const w = Number(rv.width ?? 0) || 0;
        const path = Array.isArray(rv.path) ? rv.path : [];
        const buffer = +(w * 0.5 + _riverBufAddR).toFixed(3);
        const floodplain = +(w * clamp(_riverFloodMulR, 2, 4)).toFixed(3);
        if (!_wbById.has(rv.id)) {
          const wb = { id: rv.id, type: 'river', buffer, floodplain, buildableBuffer: true };
          ctx.masks.terrain.waterBuffers.push(wb);
          _wbById.set(rv.id, wb);
          ctx.report.repairs.push({ stage: stageId, id: rv.id, code: 'add_missing_river_water_buffer_mask' });
        }
        if (!_fpById.has(rv.id)) {
          const fp = { id: rv.id, type: 'river', floodplain, path, width: w };
          ctx.masks.terrain.floodplains.push(fp);
          _fpById.set(rv.id, fp);
          ctx.report.repairs.push({ stage: stageId, id: rv.id, code: 'add_missing_river_floodplain_mask' });
        }
        if (!ctx.masks.easement.rivers.some(e => e?.id === rv.id) && path.length >= 2) {
          ctx.masks.easement.rivers.push({ id: rv.id, path, width: w, buffer, floodplain });
          ctx.report.repairs.push({ stage: stageId, id: rv.id, code: 'add_missing_river_easement' });
        }
      }
      for (const ll of (ctx.hydrology?.lakes ?? [])) {
        if (!ll?.id) continue;
        const area = ll?.area;
        let cx = null, cz = null, r = null;
        if (area?.type === 'circle' && Array.isArray(area.center)) { cx = Number(area.center[0]); cz = Number(area.center[1]); r = Number(area.radius); }
        else if (Array.isArray(area) && area.length) {
          let sx = 0, sz = 0, n = 0;
          for (const p of area) { if (Array.isArray(p) && p.length >= 3) { sx += Number(p[0])||0; sz += Number(p[2])||0; n++; } }
          if (n) { cx = sx / n; cz = sz / n; let mr = 0; for (const p of area) { if (Array.isArray(p) && p.length >= 3) mr = Math.max(mr, Math.hypot((Number(p[0])||0)-cx, (Number(p[2])||0)-cz)); } r = mr; }
        }
        const buffer = +clamp(_lakeBufR, 3, 20).toFixed(3);
        const floodplain = +Math.max(buffer, clamp(_lakeFloodR, 8, 40)).toFixed(3);
        const hasGeom = Number.isFinite(cx) && Number.isFinite(cz) && Number.isFinite(r) && r > 0;
        if (!_wbById.has(ll.id)) {
          const wb = hasGeom ? { id: ll.id, type: 'lake', center: [cx, cz], radius: r, buffer, floodplain, buildableBuffer: true }
            : { id: ll.id, type: 'lake', buffer, floodplain, buildableBuffer: true };
          ctx.masks.terrain.waterBuffers.push(wb);
          _wbById.set(ll.id, wb);
          if (hasGeom && !ctx.masks.easement.lakes.some(e => e?.id === ll.id)) ctx.masks.easement.lakes.push(wb);
          ctx.report.repairs.push({ stage: stageId, id: ll.id, code: 'add_missing_lake_water_buffer_mask' });
        }
        if (!_fpById.has(ll.id)) {
          const fp = hasGeom ? { id: ll.id, type: 'lake', floodplain, center: [cx, cz], radius: r } : { id: ll.id, type: 'lake', floodplain };
          ctx.masks.terrain.floodplains.push(fp);
          _fpById.set(ll.id, fp);
          ctx.report.repairs.push({ stage: stageId, id: ll.id, code: 'add_missing_lake_floodplain_mask' });
        }
      }

      // R1.2/R1.3/R1.5 (analysis, read-only): slope classification, reservations, crossing candidates, landmarks.
      const analysisSize = ctx.meta.worldBounds?.size ?? ctx.input?.ground?.size ?? g;
      const slope = buildSlopeAnalysis(ctx, baseY, analysisSize);
      const crossings = findCrossingCandidates(ctx, baseY, analysisSize);
      const reservationBuild = buildReservations(ctx, baseY, analysisSize, slope);
      const flatReservations = Array.isArray(reservationBuild) ? reservationBuild : (reservationBuild.picked ?? []);
      const flatSamples = Array.isArray(reservationBuild) ? [] : (reservationBuild.samples ?? []);
      const landmarks = buildLandmarks(ctx, baseY, analysisSize, slope, crossings, flatSamples);
      // Treat landmarks as reservation-like constraints for downstream (R1.3: affect generation).
      const reservations = [...flatReservations, ...landmarks];
      const waterBuffers = Array.isArray(ctx.masks.terrain.waterBuffers) ? ctx.masks.terrain.waterBuffers : [];
      const floodplains = Array.isArray(ctx.masks.terrain.floodplains) ? ctx.masks.terrain.floodplains : [];
      ctx.terrain.analysis = { slope, crossings, reservations, landmarks, waterBuffers, floodplains };
      ctx.masks.terrain = { slopeShare: slope.share, maxSlope: slope.maxSlope, crossings, reservations, landmarks, waterBuffers, floodplains };
      if (crossings.length) {
        ctx.report.diagnostics.push(info('historical_crossings_marked', stageId, `marked ${crossings.length} historical crossing candidate(s)`, { count: crossings.length }));
      }
      if (flatReservations.length) {
        ctx.report.diagnostics.push(info('terrain_reservations_marked', stageId, `reserved ${flatReservations.length} flat site candidate(s)`, { count: flatReservations.length }));
      }
      if (landmarks.length) {
        ctx.report.diagnostics.push(info('terrain_landmarks_marked', stageId, `marked ${landmarks.length} landmark/orientation point(s)`, { count: landmarks.length }));
      }
      if (waterBuffers.length) {
        ctx.report.diagnostics.push(info('terrain_water_buffers_marked', stageId, `marked ${waterBuffers.length} water buffer zone(s)`, { count: waterBuffers.length }));
      }
      ctx.report.diagnostics.push(info('terrain_slope_analysis', stageId, 'terrain slope analysis computed', {
        step: slope.step, grid: slope.grid, maxSlope: slope.maxSlope, share: slope.share,
      }));
    },
    repair(_ctx) {
      // Repairs applied during validate for locality/determinism in this skeleton.
    },
    emit(ctx) {
      // Write sanitized terrain/hydrology back into input for downstream compilation.
      if (ctx.input?.cityforge) {
        if (ctx.input.cityforge.terrain) ctx.input.cityforge.terrain.modifiers = ctx.terrain.modifiers;
        else if (ctx.terrain.modifiers.length) ctx.input.cityforge.terrain = { base: { type: 'heightfield', source: 'procedural', resolution: 4 }, modifiers: ctx.terrain.modifiers };
        if (!ctx.input.cityforge.hydrology) ctx.input.cityforge.hydrology = { rivers: [], lakes: [] };
        ctx.input.cityforge.hydrology.rivers = ctx.hydrology.rivers;
        ctx.input.cityforge.hydrology.lakes = ctx.hydrology.lakes;
      }
      ctx.engine = ctx.input;
    },
  };
}

export function applyStage1(ctx) {
  const s = makeStage1();
  s.prepare(ctx); s.generate(ctx); s.validate(ctx); s.repair(ctx); s.emit(ctx);
  return ctx;
}
