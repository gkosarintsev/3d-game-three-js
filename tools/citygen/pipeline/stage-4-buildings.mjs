/**
 * Stage 4: buildings and large structures (TASK-006, incremental MVP).
 * Places simple deterministic buildings on parcels by district profile, emitting
 * engine-compatible building definitions (no new primitives). Static only.
 */
import { info, warn } from '../diagnostics.mjs';
import { makeRng, mix } from '../rng.mjs';
import { createSpatialIndex } from '../spatial.mjs';
import { CONFIG } from '../../../src/config.js';
import { addAxisAlignedAccessRoadsForParcels, makeRoadSegment, buildAxisAlignedTerrainPath, isValidAxisAlignedTerrainPath, makeTerrainSampler } from './stage-2-transport.mjs';
import { frameOf, polyBounds, rotatedBounds } from '../../../src/geo2d.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const EPS = 1e-9;

function pick(arr, rng) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

function footprintRect(cx, cz, w, d) {
  const hx = w / 2, hz = d / 2;
  // CCW
  return [
    { x: +(cx - hx).toFixed(3), z: +(cz - hz).toFixed(3) },
    { x: +(cx + hx).toFixed(3), z: +(cz - hz).toFixed(3) },
    { x: +(cx + hx).toFixed(3), z: +(cz + hz).toFixed(3) },
    { x: +(cx - hx).toFixed(3), z: +(cz + hz).toFixed(3) },
  ];
}

function rotateFootprint(fp, cx, cz, yawDeg) {
  const r = (yawDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return fp.map(p => {
    const dx = p.x - cx, dz = p.z - cz;
    return { x: +(cx + dx * c - dz * s).toFixed(3), z: +(cz + dx * s + dz * c).toFixed(3) };
  });
}

function snapYaw90(yaw) {
  let a = Math.round(Math.abs(yaw ?? 0) / 90) * 90;
  a = ((a % 360) + 360) % 360;
  return [0, 90, 180, 270].includes(a) ? a : 0;
}

function streetYawFromEdge(edge, rng, jitterDeg = 0) {
  const base = (edge === 'east' || edge === 'west') ? 90 : 0;
  if (!edge) return 0;
  // jitter disabled: the validator demands axis-aligned room edges, so buildings stay axis-aligned
  const jitter = jitterDeg > 0 ? (rng() - 0.5) * 2 * jitterDeg : 0;
  return +(((base + jitter) % 180 + 180) % 180).toFixed(1);
}

const SETBACK_BY_TYPE = {
  old_town: 0.3, office: 4.0, commercial: 4.5, market: 4.0, residential: 7.0,
  luxury: 5.0, suburb: 11.0, slums: 2.0, industrial: 5.0, campus: 3.0,
  sports: 3.0, parking: 2.0, forest: 5.0, park: 5.0,
};
function translateFootprint(fp, dx, dz) {
  if (!dx && !dz) return fp;
  return fp.map(pt => ({ x: +(pt.x + dx).toFixed(3), z: +(pt.z + dz).toFixed(3) }));
}

function clampFootprintToParcel(fp, parcelAabb, margin = 0.75, opts = null) {
  // R4.3 §9.5: clamp footprint inside parcel; frontage-preserving mode is best-effort for continuity.
  if (!parcelAabb) return fp;
  const { minX: pMinX, maxX: pMaxX, minZ: pMinZ, maxZ: pMaxZ } = parcelAabb;
  const preserveEdge = opts?.preserveEdge ?? null; // 'south'|'north'|'west'|'east' (street-facing facade edge)
  let dx = 0, dz = 0;
  for (let iter = 0; iter < 2; iter++) {
    let fMinX = Infinity, fMaxX = -Infinity, fMinZ = Infinity, fMaxZ = -Infinity;
    for (const pt of fp) {
      const x = pt.x + dx, z = pt.z + dz;
      if (x < fMinX) fMinX = x; if (x > fMaxX) fMaxX = x;
      if (z < fMinZ) fMinZ = z; if (z > fMaxZ) fMaxZ = z;
    }
    if (!Number.isFinite(fMinX)) break;
    const innerMinX = pMinX + margin, innerMaxX = pMaxX - margin;
    const innerMinZ = pMinZ + margin, innerMaxZ = pMaxZ - margin;
    let sx = 0, sz = 0;
    if (fMinX < innerMinX) sx = innerMinX - fMinX;
    else if (fMaxX > innerMaxX) sx = innerMaxX - fMaxX;
    if (fMinZ < innerMinZ) sz = innerMinZ - fMinZ;
    else if (fMaxZ > innerMaxZ) sz = innerMaxZ - fMaxZ;
    // Best-effort continuity: prefer not to move frontage edge to fix opposite overflow.
    // If that would leave the building outside on the opposite side, fall back to normal clamp for validity.
    if (preserveEdge === 'south') {
      if (sz < 0 && fMaxZ + sz <= innerMaxZ + EPS) sz = 0;
    } else if (preserveEdge === 'north') {
      if (sz > 0 && fMinZ + sz >= innerMinZ - EPS) sz = 0;
    } else if (preserveEdge === 'west') {
      if (sx < 0 && fMaxX + sx <= innerMaxX + EPS) sx = 0;
    } else if (preserveEdge === 'east') {
      if (sx > 0 && fMinX + sx >= innerMinX - EPS) sx = 0;
    }
    dx += sx; dz += sz;
  }
  return translateFootprint(fp, +dx.toFixed(3), +dz.toFixed(3));
}

function outlineOfFootprint(fp, rotation = 0) {
  const b = polyBounds(fp);
  if (!Number.isFinite(b.minX)) return b;
  return rotatedBounds(b, frameOf(b, rotation ?? 0));
}

function clampFootprintToWorld(fp, worldHalf, rotation = 0, margin = 0.75) {
  if (!Number.isFinite(worldHalf) || worldHalf <= 0) return fp;
  const limit = Math.max(0, worldHalf - margin);
  let dx = 0, dz = 0;
  for (let iter = 0; iter < 4; iter++) {
    const shifted = (dx || dz) ? translateFootprint(fp, +dx.toFixed(3), +dz.toFixed(3)) : fp;
    const o = outlineOfFootprint(shifted, rotation);
    if (!Number.isFinite(o.minX)) break;
    let ndx = dx, ndz = dz;
    if (o.minX < -limit) ndx += -limit - o.minX;
    else if (o.maxX > limit) ndx += limit - o.maxX;
    if (o.minZ < -limit) ndz += -limit - o.minZ;
    else if (o.maxZ > limit) ndz += limit - o.maxZ;
    if (Math.abs(ndx - dx) < 1e-6 && Math.abs(ndz - dz) < 1e-6) { dx = ndx; dz = ndz; break; }
    dx = ndx; dz = ndz;
  }
  return translateFootprint(fp, +dx.toFixed(3), +dz.toFixed(3));
}

function parcelStreetEdgeForAccess(parcelAabb, edge) {
  if (!parcelAabb || !edge) return null;
  if (edge === 'south') return parcelAabb.minZ;
  if (edge === 'north') return parcelAabb.maxZ;
  if (edge === 'west') return parcelAabb.minX;
  if (edge === 'east') return parcelAabb.maxX;
  return null;
}

function frontageBandInterval(parcelAabb, edge) {
  if (!parcelAabb || !edge) return null;
  if (edge === 'south' || edge === 'north') return { a: parcelAabb.minX, b: parcelAabb.maxX };
  return { a: parcelAabb.minZ, b: parcelAabb.maxZ };
}

function computeFrontageGroupStreetEdges(parcels) {
  // R4.3 §9.5: adjacency-aware continuous frontage line across parcel groups/blocks.
  // Parcels on the same street-facing edge and approximately the same street-edge coordinate
  // (tolerating block/grid inset differences) with touching/overlapping frontage projections
  // share one canonical building-line datum (street-most boundary of the group).
  const byEdge = { south: [], north: [], west: [], east: [] };
  for (const p of parcels ?? []) {
    if (p?.reserved) continue;
    const edge = p?.access?.edge;
    const aabb = p?.aabb;
    if (!edge || !aabb || !byEdge[edge]) continue;
    const streetEdge = parcelStreetEdgeForAccess(aabb, edge);
    const band = frontageBandInterval(aabb, edge);
    if (!Number.isFinite(streetEdge) || !band) continue;
    byEdge[edge].push({ p, streetEdge, a0: Math.min(band.a, band.b), b0: Math.max(band.a, band.b) });
  }
  const out = new Map();
  const edgeTol = 2.0;    // tolerate block/parcel inset differences across adjacent groups
  const touchTol = 0.75;  // frontage adjacency/touch along the street
  for (const edge of ['south', 'north', 'west', 'east']) {
    const items = byEdge[edge];
    const n = items.length;
    if (!n) continue;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
    const compat = (i, j) => {
      const A = items[i], B = items[j];
      if (Math.abs(A.streetEdge - B.streetEdge) > edgeTol) return false;
      // overlap/touch along frontage axis
      return !(A.b0 < B.a0 - touchTol || B.b0 < A.a0 - touchTol);
    };
    // O(n^2) is fine for parcel counts; deterministic by stable item order in source array.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (compat(i, j)) union(i, j);
      }
    }
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(i);
    }
    for (const idxs of groups.values()) {
      let groupStreetEdge = items[idxs[0]].streetEdge;
      for (const k of idxs) {
        const se = items[k].streetEdge;
        if (edge === 'south' || edge === 'west') groupStreetEdge = Math.min(groupStreetEdge, se);
        else groupStreetEdge = Math.max(groupStreetEdge, se);
      }
      for (const k of idxs) out.set(items[k].p, groupStreetEdge);
    }
  }
  return out;
}

function finalizeByAccess(fp, cx, cz, p, maxW, maxD, rng, worldHalf = Infinity, frontageGroupStreetEdges = null) {
  const access = p?.access ?? null;
  if (!access || !access.edge) return { fp, rotation: 0 };
  const edge = access.edge;
  const yaw = streetYawFromEdge(edge, rng);
  const rot = rotateFootprint(fp, cx, cz, yaw);

  // R4.3 §9.5: линия застройки — отступ от улицы (границы участка/группы участков со стороны доступа) внутрь участка.
  // Выравниваем фасад к setback-линии, затем гарантируем, что footprint целиком внутри участка и мира.
  let aligned = rot;
  const parcel = p?.aabb ?? null;
  if (parcel) {
    const b = aabbOfFootprint(rot);
    const spanX = b.maxX - b.minX, spanZ = b.maxZ - b.minZ;
    const margin = 0.75;
    const innerMinX = parcel.minX + margin, innerMaxX = parcel.maxX - margin;
    const innerMinZ = parcel.minZ + margin, innerMaxZ = parcel.maxZ - margin;
    const desiredSetback = SETBACK_BY_TYPE[p?.type] ?? 5.0;
    // R4.3 §9.5: explicit continuous building-line/frontage target from (group-aware) parcel street boundary.
    // Adjacent parcels on the same frontage band/group share a canonical street-edge datum so aligning to
    // street edge + desired setback yields a continuous facade line across parcel groups/blocks when depth allows.
    const groupStreetEdge = frontageGroupStreetEdges?.get?.(p);
    const streetEdge = Number.isFinite(groupStreetEdge) ? groupStreetEdge : parcelStreetEdgeForAccess(parcel, edge);
    const availDepth = (edge === 'north' || edge === 'south')
      ? Math.max(0, (innerMaxZ - innerMinZ) - spanZ)
      : Math.max(0, (innerMaxX - innerMinX) - spanX);
    const frontageSetback = Math.min(desiredSetback, availDepth);
    let dx = 0, dz = 0;
    if (edge === 'south') {
      // улица у южной границы участка/группы: фасад (minZ) на линию застройки внутрь
      const wantMinZ = streetEdge + frontageSetback;
      dz = wantMinZ - b.minZ;
    } else if (edge === 'north') {
      // улица у северной границы участка/группы: фасад (maxZ) на линию застройки внутрь
      const wantMaxZ = streetEdge - frontageSetback;
      dz = wantMaxZ - b.maxZ;
    } else if (edge === 'west') {
      const wantMinX = streetEdge + frontageSetback;
      dx = wantMinX - b.minX;
    } else if (edge === 'east') {
      const wantMaxX = streetEdge - frontageSetback;
      dx = wantMaxX - b.maxX;
    }
    aligned = translateFootprint(rot, +dx.toFixed(3), +dz.toFixed(3));
    // R4.3 §9.5: угловой дом — соблюдаем линию застройки и на вторичной уличной грани (угол квартала),
    // смещая здание к пересечению фасадных линий без нарушения основной (primary) фасадной линии.
    // Вторичная грань использует локальную границу участка (пересечение фасадных линий на углу).
    if (access?.corner && Array.isArray(access.cornerEdges) && access.cornerEdges.length > 1) {
      const b2 = aabbOfFootprint(aligned);
      const spanX2 = b2.maxX - b2.minX, spanZ2 = b2.maxZ - b2.minZ;
      let cdx = 0, cdz = 0;
      if (access.cornerEdges.includes('west') && edge !== 'west') {
        const secAvailX = Math.max(0, (innerMaxX - innerMinX) - spanX2);
        const secSetbackX = Math.min(desiredSetback, secAvailX);
        cdx += (parcel.minX + secSetbackX) - b2.minX;
      } else if (access.cornerEdges.includes('east') && edge !== 'east') {
        const secAvailX = Math.max(0, (innerMaxX - innerMinX) - spanX2);
        const secSetbackX = Math.min(desiredSetback, secAvailX);
        cdx += (parcel.maxX - secSetbackX) - b2.maxX;
      }
      if (access.cornerEdges.includes('south') && edge !== 'south') {
        const secAvailZ = Math.max(0, (innerMaxZ - innerMinZ) - spanZ2);
        const secSetbackZ = Math.min(desiredSetback, secAvailZ);
        cdz += (parcel.minZ + secSetbackZ) - b2.minZ;
      } else if (access.cornerEdges.includes('north') && edge !== 'north') {
        const secAvailZ = Math.max(0, (innerMaxZ - innerMinZ) - spanZ2);
        const secSetbackZ = Math.min(desiredSetback, secAvailZ);
        cdz += (parcel.maxZ - secSetbackZ) - b2.maxZ;
      }
      // Ограничиваем сдвиг к углу, чтобы не ломать фасадную линию вдоль основной улицы (preserveEdge в clamp — страховка).
      const maxCornerShift = 4.0;
      cdx = clamp(cdx, -maxCornerShift, maxCornerShift);
      cdz = clamp(cdz, -maxCornerShift, maxCornerShift);
      if (cdx || cdz) aligned = translateFootprint(aligned, +cdx.toFixed(3), +cdz.toFixed(3));
    }
    aligned = clampFootprintToParcel(aligned, parcel, margin, { preserveEdge: edge });
  } else {
    // fallback: legacy center shift when parcel bounds are unavailable
    const b = aabbOfFootprint(rot);
    const spanX = b.maxX - b.minX, spanZ = b.maxZ - b.minZ;
    const avail = (edge === 'north' || edge === 'south')
      ? Math.max(0.5, Math.min(maxD - spanZ, maxD * 0.5))
      : Math.max(0.5, Math.min(maxW - spanX, maxW * 0.5));
    const need = Math.min(SETBACK_BY_TYPE[p?.type] ?? 5.0, avail);
    const n = +need.toFixed(3);
    if (edge === 'north') aligned = translateFootprint(rot, 0, -n);
    else if (edge === 'south') aligned = translateFootprint(rot, 0, +n);
    else if (edge === 'east') aligned = translateFootprint(rot, -n, 0);
    else if (edge === 'west') aligned = translateFootprint(rot, +n, 0);
  }
  aligned = clampFootprintToWorld(aligned, worldHalf, yaw, 0.75);
  return { fp: aligned, rotation: yaw };
}

function aabbOfFootprint(fp) {
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for (const p of fp) { minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minZ=Math.min(minZ,p.z); maxZ=Math.max(maxZ,p.z); }
  return { minX,maxX,minZ,maxZ };
}

function pointSegDistXZ(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az, apx = px - ax, apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  const t = ab2 > EPS ? clamp((apx * abx + apz * abz) / ab2, 0, 1) : 0;
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

function medianOf(values) {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) * 0.5;
}

function footprintReliefStats(fp, sampler) {
  if (!sampler || typeof sampler.heightAt !== 'function' || !Array.isArray(fp) || fp.length < 3) {
    return { medianY: Number(sampler?.groundY ?? 0) || 0, delta: 0 };
  }
  const b = aabbOfFootprint(fp);
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const pts = [
    [cx, cz],
    [b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ],
    [cx, b.minZ], [b.maxX, cz], [cx, b.maxZ], [b.minX, cz],
  ];
  const hs = [];
  for (const [x, z] of pts) {
    const y = Number(sampler.heightAt(x, z));
    if (Number.isFinite(y)) hs.push(y);
  }
  if (!hs.length) return { medianY: Number(sampler.groundY ?? 0) || 0, delta: 0 };
  let minY = Infinity, maxY = -Infinity;
  for (const y of hs) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return { medianY: medianOf(hs), delta: +(maxY - minY).toFixed(4), minY, maxY };
}

function isFootprintFoundationAllowed(fp, floors, sampler) {
  const stats = footprintReliefStats(fp, sampler);
  const d = stats.delta || 0;
  // R4.3 §9.6: до 1.5 м — terrain; 1.5–3 м и до 4 этажей — ступенчатый цоколь (terrain-compatible);
  // свыше 3 м или (1.5–3 м и >4 этажей) — podium либо участок снимается. Podium не поддержан текущим normalizer/пайплайном,
  // поэтому детерминированно снимаем размещение на таком пятне (эквивалент buildable:false для данного footprint).
  if (d > 3.0) return { ok: false, reason: 'relief_delta_gt_3', stats };
  if (d > 1.5 && floors > 4) return { ok: false, reason: 'relief_delta_mid_highrise', stats };
  return { ok: true, reason: null, stats };
}

function footprintIntersectsRiver(fp, rivers = [], riverIndex = null, waterBufferById = null) {
  const b = aabbOfFootprint(fp);
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const corners = [[b.minX,b.minZ],[b.maxX,b.minZ],[b.maxX,b.maxZ],[b.minX,b.maxZ],[cx,cz]];
  const riverClearance = (rvOrSeg) => {
    // Prefer explicit easement buffer/floodplain (R1.4/R1.5): floodplain acts as real no-build constraint for buildings.
    const id = rvOrSeg?.id ?? null;
    const riverId = rvOrSeg?.riverId ?? null;
    const meta = (waterBufferById && (id || riverId))
      ? (waterBufferById.get(id) || waterBufferById.get(riverId) || null)
      : null;
    const buffer = Number.isFinite(Number(rvOrSeg?.buffer)) ? Number(rvOrSeg.buffer)
      : (Number.isFinite(Number(meta?.buffer)) ? Number(meta.buffer) : NaN);
    const floodplain = Number.isFinite(Number(rvOrSeg?.floodplain)) ? Number(rvOrSeg.floodplain)
      : (Number.isFinite(Number(meta?.floodplain)) ? Number(meta.floodplain) : NaN);
    if (Number.isFinite(buffer) || Number.isFinite(floodplain)) {
      return Math.max(Number.isFinite(buffer) ? buffer : 6, Number.isFinite(floodplain) ? floodplain : 0, 6);
    }
    return (Number(rvOrSeg?.width) || 10) * 0.5 + 20.0;
  };
  if (riverIndex) {
    // Query pad must cover max clearance (buffer/floodplain can exceed fixed pad); use generous bound.
    let pad = 80;
    if (waterBufferById && waterBufferById.size) {
      for (const w of waterBufferById.values()) {
        const c = Math.max(Number(w?.buffer) || 0, Number(w?.floodplain) || 0, 6);
        if (c + 2 > pad) pad = c + 2;
      }
    }
    const candidates = riverIndex.query({ minX: b.minX - pad, maxX: b.maxX + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad });
    for (const seg of candidates) {
      const clearance = riverClearance(seg);
      for (const [px,pz] of corners) {
        if (pointSegDistXZ(px, pz, seg.ax, seg.az, seg.bx, seg.bz) < clearance) return true;
      }
      if (pointSegDistXZ(cx, cz, seg.ax, seg.az, seg.bx, seg.bz) < clearance) return true;
    }
    return false;
  }
  for (const rv of rivers) {
    const path = rv.path ?? [];
    // Be conservative: include banks/bed margins used by compiled waterway/channel checks.
    const clearance = riverClearance(rv);
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], c = path[i+1];
      for (const [px,pz] of corners) {
        if (pointSegDistXZ(px,pz,a[0],a[2],c[0],c[2]) < clearance) return true;
      }
      // centerline near box center
      if (pointSegDistXZ(cx,cz,a[0],a[2],c[0],c[2]) < clearance) return true;
    }
  }
  return false;
}

function footprintIntersectsLake(fp, lakes = []) {
  if (!Array.isArray(lakes) || lakes.length === 0) return false;
  const b = aabbOfFootprint(fp);
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const corners = [[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ], [cx, cz]];
  for (const lk of lakes) {
    const c = lk?.center;
    const r = Number(lk?.radius);
    if (!Array.isArray(c) || !Number.isFinite(r) || r <= 0) continue;
    const lx = Number(c[0]), lz = Number(c[1]);
    if (!Number.isFinite(lx) || !Number.isFinite(lz)) continue;
    const buf = Number.isFinite(Number(lk?.buffer)) ? Number(lk.buffer) : 8;
    const floodplain = Number.isFinite(Number(lk?.floodplain)) ? Number(lk.floodplain) : 0;
    const clearance = r + Math.max(buf, floodplain, 8);
    for (const [px, pz] of corners) {
      if (Math.hypot(px - lx, pz - lz) < clearance) return true;
    }
  }
  return false;
}

function footprintIntersectsFloodplainMask(fp, floodplains = []) {
  if (!Array.isArray(floodplains) || floodplains.length === 0) return false;
  const b = aabbOfFootprint(fp);
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const corners = [[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ], [cx, cz]];
  for (const fpl of floodplains) {
    if (!fpl) continue;
    if (fpl.type === 'lake' && Array.isArray(fpl.center) && Number.isFinite(Number(fpl.radius))) {
      const lx = Number(fpl.center[0]), lz = Number(fpl.center[1]);
      const margin = Number.isFinite(Number(fpl.floodplain)) ? Number(fpl.floodplain) : 0;
      const clearance = Number(fpl.radius) + Math.max(margin, 8);
      for (const [px, pz] of corners) {
        if (Math.hypot(px - lx, pz - lz) < clearance) return true;
      }
      continue;
    }
    if (fpl.type === 'river' && Array.isArray(fpl.path) && fpl.path.length >= 2) {
      const margin = Number.isFinite(Number(fpl.floodplain)) ? Number(fpl.floodplain)
        : Math.max((Number(fpl.width) || 0) * 0.5 + 12, (Number(fpl.width) || 0) * 3);
      for (const [px, pz] of corners) {
        let best = Infinity;
        for (let i = 0; i + 1 < fpl.path.length; i++) {
          const a = fpl.path[i], c = fpl.path[i + 1];
          best = Math.min(best, pointSegDistXZ(px, pz, a[0], a[2], c[0], c[2]));
        }
        if (best < margin) return true;
      }
    }
  }
  return false;
}

function footprintIntersectsRoad(fp, roads = [], roadSegments = [], roadIndex = null, { ignoreEasements = false } = {}) {
  const b = aabbOfFootprint(fp);
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const samplePts = [[b.minX,b.minZ],[b.maxX,b.minZ],[b.maxX,b.maxZ],[b.minX,b.maxZ],[cx,cz]];
  const padMax = 16; // conservative query margin (typ lane half-width + clearance)
  if (!ignoreEasements) {
    const candidates = roadIndex
      ? roadIndex.query({ minX: b.minX - padMax, maxX: b.maxX + padMax, minZ: b.minZ - padMax, maxZ: b.maxZ + padMax })
      : roads;
    for (const r of candidates) {
      if (r && Number.isFinite(r.minX)) {
        const pad = (r.width ?? 8) * 0.5 + 1.5;
        if (b.maxX >= r.minX - pad && b.minX <= r.maxX + pad && b.maxZ >= r.minZ - pad && b.minZ <= r.maxZ + pad) return true;
      }
    }
  }
  for (const s of roadSegments) {
    const pts = Array.isArray(s?.path) ? s.path : [];
    if (pts.length < 2) continue;
    const w = (Array.isArray(s.lanes) && s.lanes[0]?.width) ? s.lanes[0].width : 8;
    const clearance = w * 0.5 + 2.0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], c = pts[i+1];
      for (const [px,pz] of samplePts) {
        if (pointSegDistXZ(px,pz,a[0],a[2],c[0],c[2]) < clearance) return true;
      }
    }
  }
  return false;
}

function minDistanceToRoadSegments(x, z, roadSegments = []) {
  let best = Infinity;
  for (const s of roadSegments) {
    const pts = Array.isArray(s?.path) ? s.path : [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], c = pts[i+1];
      best = Math.min(best, pointSegDistXZ(x, z, a[0], a[2], c[0], c[2]));
    }
  }
  return best;
}

function footprintNearAnchors(fp, anchors = [], margin = 8) {
  const b = aabbOfFootprint(fp);
  for (const a of anchors) {
    if (a.x >= b.minX - margin && a.x <= b.maxX + margin && a.z >= b.minZ - margin && a.z <= b.maxZ + margin) return true;
  }
  return false;
}

function materialFor(profile, kind, rng, districtType = null) {
  // Промышленные типы industrial-района получают собственный фасадный материал,
  // чтобы рантайм мог отрисовать им особый процедурный (шейдерный) вид.
  const INDUSTRIAL_FACADE = {
    warehouse: 'industrial_warehouse',
    factory: 'industrial_factory',
    workshop: 'industrial_workshop',
  };
  if (INDUSTRIAL_FACADE[kind]) return INDUSTRIAL_FACADE[kind];

  // R4.4 §9.7 (partial): district palette policies (coherent per district type, with variation).
  const DISTRICT_MATS = {
    office: ['glass_and_concrete', 'concrete', 'glass_steel'],
    commercial: ['glass_and_concrete', 'concrete', 'painted_brick'],
    retail: ['glass_and_concrete', 'painted_brick', 'concrete'],
    downtown: ['glass_and_concrete', 'concrete', 'glass_steel', 'painted_brick'],
    old_town: ['stone_base', 'painted_brick'],
    historic: ['stone_base', 'painted_brick'],
    residential: ['painted_brick', 'stone_base', 'concrete'],
    suburban: ['painted_brick', 'stone_base'],
    housing: ['painted_brick', 'stone_base', 'panel_block'],
    luxury: ['stone_base', 'glass_and_concrete', 'painted_brick'],
    industrial: ['concrete', 'rusted_metal'],
    port: ['concrete', 'rusted_metal'],
    railway: ['concrete', 'rusted_metal'],
    slums: ['rusted_metal', 'painted_brick'],
    campus: ['concrete', 'painted_brick', 'glass_and_concrete'],
    park: ['painted_brick', 'stone_base'],
    forest: ['painted_brick', 'stone_base'],
    sports: ['concrete', 'glass_and_concrete', 'painted_brick'],
  };

  const ARCH_MATS = {
    office_tower: ['glass_and_concrete', 'concrete'],
    office_mid: ['glass_and_concrete', 'concrete', 'painted_brick'],
    office_block: ['glass_and_concrete', 'concrete'],
    skyscraper: ['glass_steel', 'glass_and_concrete'],
    megablock: ['concrete', 'glass_and_concrete'],
    apartment_block: ['painted_brick', 'concrete'],
    panelka: ['panel_block', 'concrete'],
    residential_low: ['painted_brick', 'stone_base'],
    residential_mid: ['painted_brick', 'concrete'],
    townhouse: ['painted_brick', 'stone_base'],
    cottage: ['painted_brick', 'stone_base'],
    classic_cottage: ['painted_brick', 'stone_base'],
    barn_house: ['painted_brick', 'concrete'],
    aframe: ['painted_brick', 'concrete'],
    chalet: ['stone_base', 'painted_brick'],
    mansard_house: ['painted_brick', 'stone_base'],
    villa: ['stone_base', 'glass_and_concrete', 'painted_brick'],
    historic_block: ['stone_base', 'painted_brick'],
    shop_row: ['painted_brick', 'concrete', 'glass_and_concrete'],
    mall: ['concrete', 'glass_and_concrete'],
    market_hall: ['painted_brick', 'rusted_metal', 'concrete'],
    modern_pavilion: ['glass_and_concrete', 'concrete'],
    warehouse: ['concrete', 'rusted_metal'],
    factory: ['concrete', 'rusted_metal'],
    workshop: ['concrete', 'rusted_metal', 'painted_brick'],
    sports_hall: ['concrete', 'glass_and_concrete'],
    pavilion: ['painted_brick', 'concrete'],
    campus_hall: ['concrete', 'painted_brick', 'glass_and_concrete'],
    shack: ['rusted_metal', 'painted_brick'],
    slum_shack: ['rusted_metal', 'painted_brick'],
    booth: ['concrete', 'painted_brick'],
  };

  const profMats = Array.isArray(profile?.buildings?.materials) ? profile.buildings.materials.filter(Boolean) : [];
  if (profMats.length) {
    const dm = DISTRICT_MATS[districtType] || null;
    if (dm && dm.length) {
      const inter = profMats.filter(m => dm.includes(m));
      if (inter.length) return pick(inter, rng);
    }
    return pick(profMats, rng);
  }

  const km = ARCH_MATS[kind];
  const dm = DISTRICT_MATS[districtType] || null;
  if (Array.isArray(km) && km.length) {
    if (dm && dm.length) {
      const inter = km.filter(m => dm.includes(m));
      if (inter.length) return pick(inter, rng);
    }
    return pick(km, rng);
  }
  if (dm && dm.length) return pick(dm, rng);
  return 'concrete';
}

  // Свотчи цветов стен из docs/houses (materialsRegistry) — детерминированная вариация фасада.
  const FACADE_SWATCHES = {
    panel_block:        ['#d6d0c4', '#9eb5c4', '#9db6a8', '#d4be8c', '#b4bac0', '#c5998d'],
    painted_brick:      ['#a95842', '#7b493b', '#c8ab89', '#4b4e54'],
    stone_base:         ['#d9dde2', '#adb5bd', '#5f6770', '#d5cbb8'],
    concrete:           ['#d9dde2', '#adb5bd', '#5f6770', '#d5cbb8'],
    glass_and_concrete: ['#b8c2cc', '#8899ab', '#c9bfae', '#4b5563'],
    glass_steel:        ['#4b5563', '#8899ab', '#b8c2cc'],
    rusted_metal:       ['#5a8a92', '#8e5a44', '#8d949b', '#b88a56', '#484e57'],
    neon_panel:         ['#4b5563', '#8899ab', '#c9bfae'],
  };
  // R4.4 §9.7 (partial): district palette bias for wall colors (coherent per district type).
  const DISTRICT_WALL_BIAS = {
    office:        { concrete: ['#b8c2cc', '#8899ab', '#adb5bd'], glass_and_concrete: ['#b8c2cc', '#8899ab', '#4b5563'], glass_steel: ['#4b5563', '#8899ab'] },
    commercial:    { painted_brick: ['#c8ab89', '#a95842'], glass_and_concrete: ['#b8c2cc', '#8899ab', '#c9bfae'] },
    retail:        { painted_brick: ['#c8ab89', '#a95842'], glass_and_concrete: ['#b8c2cc', '#c9bfae'] },
    downtown:      { concrete: ['#b8c2cc', '#8899ab', '#adb5bd'], glass_and_concrete: ['#4b5563', '#8899ab', '#b8c2cc'] },
    old_town:      { stone_base: ['#d5cbb8', '#d9dde2', '#adb5bd'], painted_brick: ['#a95842', '#7b493b', '#c8ab89'] },
    historic:      { stone_base: ['#d5cbb8', '#d9dde2', '#adb5bd'], painted_brick: ['#a95842', '#7b493b', '#c8ab89'] },
    residential:   { painted_brick: ['#c8ab89', '#a95842', '#7b493b'], stone_base: ['#d9dde2', '#d5cbb8'] },
    suburban:      { painted_brick: ['#c8ab89', '#a95842'], stone_base: ['#d9dde2', '#d5cbb8'] },
    housing:       { panel_block: ['#d6d0c4', '#9eb5c4', '#b4bac0'], painted_brick: ['#c8ab89', '#a95842'] },
    luxury:        { stone_base: ['#d9dde2', '#d5cbb8', '#adb5bd'], glass_and_concrete: ['#b8c2cc', '#8899ab'] },
    industrial:    { concrete: ['#adb5bd', '#5f6770', '#8d949b'], rusted_metal: ['#8d949b', '#484e57', '#8e5a44'] },
    port:          { concrete: ['#adb5bd', '#5f6770'], rusted_metal: ['#5a8a92', '#484e57', '#8d949b'] },
    railway:       { concrete: ['#adb5bd', '#5f6770'], rusted_metal: ['#484e57', '#8d949b', '#5a8a92'] },
    slums:         { rusted_metal: ['#484e57', '#8e5a44', '#8d949b'], painted_brick: ['#7b493b', '#4b4e54'] },
    campus:        { painted_brick: ['#c8ab89', '#a95842'], concrete: ['#d9dde2', '#adb5bd'], glass_and_concrete: ['#b8c2cc', '#8899ab'] },
    park:          { painted_brick: ['#c8ab89', '#a95842'], stone_base: ['#d5cbb8', '#d9dde2'] },
    forest:        { painted_brick: ['#c8ab89', '#7b493b'], stone_base: ['#d5cbb8', '#d9dde2'] },
    sports:        { concrete: ['#d9dde2', '#b8c2cc', '#adb5bd'], glass_and_concrete: ['#b8c2cc', '#8899ab'] },
  };
  function pickWallColor(mat, rng, districtType = null) {
    const bias = DISTRICT_WALL_BIAS[districtType]?.[mat];
    if (Array.isArray(bias) && bias.length) return bias[Math.floor(rng() * bias.length) % bias.length];
    const s = FACADE_SWATCHES[mat];
    return s ? s[Math.floor(rng() * s.length) % s.length] : null;
  }

  // R4.4 §9.7 (partial): typological window rhythm/scale and roof materials/parapets (deterministic, schema-supported).
  function pickWindowParams(kind, districtType, floors, rng) {
    let dMin = 1, dMax = 3, sMin = 0.85, sMax = 1.2;
    if (kind === 'skyscraper' || kind === 'office_block' || kind === 'office' || kind === 'megablock') {
      dMin = 2; dMax = 3; sMin = 0.95; sMax = 1.25;
    } else if (kind === 'panelka' || kind === 'apartment') {
      dMin = 2; dMax = 3; sMin = 0.9; sMax = 1.15;
    } else if (kind === 'warehouse' || kind === 'factory' || kind === 'hangar' || districtType === 'industrial') {
      dMin = 1; dMax = 2; sMin = 0.85; sMax = 1.05;
    } else if (kind === 'slum_shack') {
      dMin = 1; dMax = 2; sMin = 0.8; sMax = 0.95;
    } else if (kind === 'classic_cottage' || kind === 'barn_house' || kind === 'aframe' || kind === 'chalet' || kind === 'mansard_house' || kind === 'modern_pavilion') {
      dMin = 1; dMax = 2; sMin = 0.9; sMax = 1.1;
    } else if (districtType === 'commercial' || districtType === 'retail') {
      dMin = 2; dMax = 3; sMin = 0.95; sMax = 1.2;
    }
    if (floors >= 12) { dMin = Math.max(dMin, 2); sMin = Math.max(sMin, 0.95); }
    const density = clamp(dMin + Math.floor(rng() * (dMax - dMin + 1)), 1, 3);
    const scale = +clamp(sMin + rng() * (sMax - sMin), 0.5, 2).toFixed(2);
    return { density, scale };
  }

  function pickRoofAppearance(kind, facadeMaterial, floors, rng, districtType = null) {
    let mats = ['concrete_slab', 'bitumen'];
    let colors = ['#5f6770', '#4b5563', '#6b7280', '#8d949b'];
    if (kind === 'skyscraper' || kind === 'office_block' || kind === 'office' || kind === 'megablock') {
      mats = ['concrete_slab', 'metal_sheet', 'composite'];
      colors = ['#4b5563', '#5f6770', '#6b7280', '#77808a'];
    } else if (kind === 'warehouse' || kind === 'factory' || kind === 'hangar' || facadeMaterial === 'industrial_metal' || facadeMaterial === 'industrial_metal_rusted') {
      mats = ['metal_sheet', 'corrugated_metal', 'bitumen'];
      colors = ['#6b7280', '#7a6a58', '#5f6770', '#8b7355'];
    } else if (kind === 'classic_cottage' || kind === 'barn_house' || kind === 'aframe' || kind === 'chalet' || kind === 'mansard_house' || kind === 'modern_pavilion') {
      mats = ['tile', 'metal_sheet', 'shingles'];
      colors = ['#7a4a3a', '#6b5b4b', '#5f6770', '#8b7355', '#4f5d4a'];
    } else if (kind === 'slum_shack') {
      mats = ['corrugated_metal', 'bitumen', 'patchwork'];
      colors = ['#7a6a58', '#6b7280', '#8d949b', '#5f6770'];
    } else if (facadeMaterial === 'brick' || facadeMaterial === 'old_brick') {
      mats = ['tile', 'bitumen', 'metal_sheet'];
      colors = ['#6b4a3a', '#5f6770', '#7a6a58', '#4b5563'];
    }

    // R4.4 §9.7 (partial): district palette bias for roofs (coherent per district type).
    const DISTRICT_ROOF = {
      office:        { mats: ['concrete_slab', 'metal_sheet', 'composite'], colors: ['#4b5563', '#5f6770', '#6b7280', '#77808a'] },
      commercial:    { mats: ['concrete_slab', 'metal_sheet', 'bitumen'],    colors: ['#5f6770', '#4b5563', '#6b7280'] },
      retail:        { mats: ['metal_sheet', 'bitumen', 'concrete_slab'],   colors: ['#5f6770', '#6b7280', '#7a6a58'] },
      downtown:      { mats: ['concrete_slab', 'metal_sheet', 'composite'], colors: ['#4b5563', '#5f6770', '#77808a'] },
      old_town:      { mats: ['tile', 'shingles', 'bitumen'],               colors: ['#6b4a3a', '#7a4a3a', '#5f6770', '#6b5b4b'] },
      historic:      { mats: ['tile', 'shingles', 'bitumen'],               colors: ['#6b4a3a', '#7a4a3a', '#5f6770'] },
      residential:   { mats: ['tile', 'bitumen', 'metal_sheet', 'shingles'],colors: ['#6b5b4b', '#7a6a58', '#5f6770', '#6b4a3a'] },
      suburban:      { mats: ['tile', 'shingles', 'metal_sheet'],           colors: ['#7a4a3a', '#6b5b4b', '#5f6770'] },
      housing:       { mats: ['concrete_slab', 'bitumen', 'tile'],          colors: ['#5f6770', '#6b7280', '#7a6a58'] },
      luxury:        { mats: ['tile', 'metal_sheet', 'shingles'],           colors: ['#4b5563', '#6b5b4b', '#5f6770', '#7a4a3a'] },
      industrial:    { mats: ['metal_sheet', 'corrugated_metal', 'bitumen'],colors: ['#6b7280', '#7a6a58', '#5f6770', '#8b7355'] },
      port:          { mats: ['metal_sheet', 'corrugated_metal'],           colors: ['#6b7280', '#5f6770', '#7a6a58'] },
      railway:       { mats: ['metal_sheet', 'corrugated_metal', 'bitumen'],colors: ['#6b7280', '#5f6770', '#7a6a58'] },
      slums:         { mats: ['corrugated_metal', 'bitumen', 'patchwork'],  colors: ['#7a6a58', '#6b7280', '#8d949b', '#5f6770'] },
      campus:        { mats: ['metal_sheet', 'concrete_slab', 'tile'],      colors: ['#5f6770', '#6b7280', '#6b5b4b'] },
      park:          { mats: ['tile', 'shingles', 'metal_sheet'],           colors: ['#6b5b4b', '#4f5d4a', '#7a6a58'] },
      forest:        { mats: ['tile', 'shingles', 'metal_sheet'],           colors: ['#4f5d4a', '#6b5b4b', '#5f6770'] },
      sports:        { mats: ['metal_sheet', 'concrete_slab'],              colors: ['#6b7280', '#5f6770', '#77808a'] },
    };
    const db = DISTRICT_ROOF[districtType];
    if (db) {
      if (Array.isArray(db.mats) && db.mats.length) mats = db.mats;
      if (Array.isArray(db.colors) && db.colors.length) colors = db.colors;
    }

    const roofMaterial = mats[Math.floor(rng() * mats.length) % mats.length];
    const roofColor = colors[Math.floor(rng() * colors.length) % colors.length];
    // Explicit roof object: keep non-walkable, no parapet to avoid nav/physics changes (R4.4 data/visual metadata increment).
    const roof = { walkable: false, parapet: 0 };
    if (floors >= 20) roof.parapet = 0; // keep explicit; tall buildings remain non-walkable by default here
    return { roofMaterial, roofColor, roof };
  }

const ARCHETYPES = {
  office_tower:    { floors: [10, 20], floorHeight: [3.5, 3.8], scale: [0.45, 0.62], aspect: [0.7, 1.3] },
  office_mid:      { floors: [4, 9],   floorHeight: [3.4, 3.7], scale: [0.5, 0.72],  aspect: [0.75, 1.35] },
  // Офисное здание (docs/houses office-building): средне-высокий деловой блок
  office_block:    { floors: [4, 12],  floorHeight: [3.4, 4.0], scale: [0.52, 0.76], aspect: [1.0, 1.7] },
  // Небоскрёб (docs/houses skyscraper): высокая башня
  skyscraper:      { floors: [14, 30], floorHeight: [3.4, 4.0], scale: [0.46, 0.66], aspect: [0.75, 1.2] },
  // Мегастроение H10 (docs/houses megabuilding): массивный многоэтажный мегаблок
  megablock:       { floors: [18, 36], floorHeight: [3.2, 3.8], scale: [0.62, 0.86], aspect: [0.9, 1.5] },
  apartment_block: { floors: [4, 9],   floorHeight: [3.1, 3.4], scale: [0.58, 0.78], aspect: [1.2, 2.1] },
  // Панелька (docs/houses soviet-panel): многоэтажный жилой панельный дом (пропорции ближе к серии)
  panelka:         { floors: [5, 16],  floorHeight: [2.65, 2.95], scale: [0.58, 0.82], aspect: [1.15, 1.9] },
  residential_low: { floors: [1, 3],   floorHeight: [3.0, 3.3], scale: [0.45, 0.68], aspect: [0.8, 1.4] },
  residential_mid: { floors: [3, 7],   floorHeight: [3.1, 3.4], scale: [0.5, 0.72],  aspect: [0.85, 1.5] },
  townhouse:       { floors: [2, 4],   floorHeight: [3.0, 3.3], scale: [0.42, 0.62], aspect: [0.55, 0.95] },
  cottage:         { floors: [1, 2],   floorHeight: [3.0, 3.3], scale: [0.38, 0.58], aspect: [0.75, 1.35] },
  // Классик-коттедж (docs/houses classic-cottage)
  classic_cottage: { floors: [1, 2],   floorHeight: [2.8, 3.1], scale: [0.4, 0.58],  aspect: [0.8, 1.35] },
  // Сканди-барн (docs/houses nordic-barn): вытянутый низкий дом
  barn_house:      { floors: [1, 2],   floorHeight: [3.0, 3.4], scale: [0.45, 0.66], aspect: [1.3, 2.0] },
  // А-фрейм (docs/houses a-frame): компактный высокий силуэт
  aframe:          { floors: [1, 2],   floorHeight: [3.2, 3.8], scale: [0.34, 0.52], aspect: [0.7, 1.1] },
  // Альпийское шале (docs/houses alpine-chalet)
  chalet:          { floors: [2, 3],   floorHeight: [2.8, 3.2], scale: [0.42, 0.62], aspect: [0.8, 1.3] },
  // Мансардный дом (docs/houses mansard-house)
  mansard_house:   { floors: [2, 4],   floorHeight: [2.8, 3.2], scale: [0.44, 0.64], aspect: [0.8, 1.3] },
  villa:           { floors: [1, 3],   floorHeight: [3.2, 3.6], scale: [0.4, 0.6],   aspect: [0.8, 1.25] },
  historic_block:  { floors: [2, 5],   floorHeight: [3.2, 3.5], scale: [0.52, 0.72], aspect: [0.7, 1.2] },
  shop_row:        { floors: [1, 3],   floorHeight: [3.4, 3.8], scale: [0.55, 0.78], aspect: [1.4, 2.4] },
  mall:            { floors: [1, 3],   floorHeight: [4.0, 5.0], scale: [0.68, 0.86], aspect: [0.9, 1.6] },
  market_hall:     { floors: [1, 2],   floorHeight: [3.8, 4.6], scale: [0.58, 0.8],  aspect: [0.9, 1.5] },
  // Модерн-павильон (docs/houses modern-pavilion): широкий низкий павильон
  modern_pavilion: { floors: [1, 2],   floorHeight: [3.2, 4.0], scale: [0.5, 0.72],  aspect: [1.1, 1.8] },
  warehouse:       { floors: [1, 2],   floorHeight: [4.5, 6.0], scale: [0.65, 0.86], aspect: [1.0, 1.8] },
  factory:         { floors: [1, 3],   floorHeight: [4.5, 6.5], scale: [0.66, 0.86], aspect: [1.0, 1.9] },
  workshop:        { floors: [1, 2],   floorHeight: [3.8, 4.8], scale: [0.5, 0.74],  aspect: [0.8, 1.5] },
  sports_hall:     { floors: [1, 2],   floorHeight: [5.0, 7.0], scale: [0.62, 0.84], aspect: [0.9, 1.5] },
  pavilion:        { floors: [1, 1],   floorHeight: [3.2, 4.0], scale: [0.35, 0.55], aspect: [0.8, 1.3] },
  campus_hall:     { floors: [2, 5],   floorHeight: [3.6, 4.2], scale: [0.58, 0.8],  aspect: [0.9, 1.7] },
  shack:           { floors: [1, 2],   floorHeight: [2.8, 3.2], scale: [0.38, 0.58], aspect: [0.7, 1.5] },
  // Трущобы (docs/houses slum-shack): самострой/фавела
  slum_shack:      { floors: [1, 4],   floorHeight: [2.4, 3.0], scale: [0.34, 0.56], aspect: [0.7, 1.5] },
  booth:           { floors: [1, 1],   floorHeight: [2.8, 3.2], scale: [0.18, 0.32], aspect: [0.7, 1.4] },
};

function rangePick([a, b], rng) { return a + rng() * (b - a); }
function rangePickInt([a, b], rng) { return a + Math.floor(rng() * (b - a + 1)); }

export function makeStage4() {
  return {
    id: '4_buildings_structures',
    prepare(ctx) {
      ctx.buildings = Array.isArray(ctx.input?.buildings) ? structuredClone(ctx.input.buildings) : [];
      ctx.meta._buildingSeq = 0;
    },
    generate(ctx) {
      const stageId = '4_buildings_structures';
      if (ctx.buildings.length > 0) {
        ctx.report.diagnostics.push(info('buildings_passthrough', stageId, 'using declared buildings', { count: ctx.buildings.length }));
        return;
      }
      // Targeted axis-aligned access roads for far road-needy parcels (TASK-004/005/006).
      try {
        addAxisAlignedAccessRoadsForParcels(ctx);
      } catch (e) {
        ctx.report.diagnostics.push(warn('transport_access_augment_failed', stageId, `access augmentation failed: ${e?.message ?? e}`));
      }
      const profiles = ctx.meta.profiles || {};
      const parcels = ctx.parcels || [];
      const seed = mix(ctx.meta.seed ?? 0, stageId);
      const rng = makeRng(seed);
      const out = [];
      const size = ctx.meta.worldBounds?.size ?? ctx.input?.ground?.size ?? 256;
      const levelName = String(ctx.input?.metadata?.levelName ?? '');
      const budget = Math.min(420, Math.max(40, Math.floor(size * size / 3000))); // overall cap (+headroom for district representation)
      const normalBudget = Math.min(budget, 400);
      const rivers = ctx.masks?.easement?.rivers ?? ctx.hydrology?.rivers ?? ctx.input?.cityforge?.hydrology?.rivers ?? [];
      const waterBufferById = (() => {
        const src = Array.isArray(ctx.masks?.terrain?.waterBuffers) ? ctx.masks.terrain.waterBuffers : [];
        const m = new Map();
        for (const w of src) if (w?.id) m.set(w.id, w);
        return m;
      })();
      const floodplainMasks = Array.isArray(ctx.masks?.terrain?.floodplains) ? ctx.masks.terrain.floodplains
        : (Array.isArray(ctx.terrain?.analysis?.floodplains) ? ctx.terrain.analysis.floodplains : []);
      const roads = ctx.masks?.easement?.roads ?? [];
      const roadSegments = ctx.networks?.roads?.segments ?? ctx.input?.cityforge?.networks?.roads?.segments ?? [];
      const terrainSampler = (() => { try { return makeTerrainSampler(ctx); } catch { return null; } })();
      const gp = ctx.input?.gameplay ?? {};
      const anchors = [
        { x: gp.spawn?.x ?? 0, z: gp.spawn?.z ?? 0 },
        { x: gp.exit?.x ?? 0, z: gp.exit?.z ?? 0 },
      ];
      // R1.3/R1.5: crossing/landmark/reservation masks as downstream constraints (defense-in-depth; deterministic).
      const crossingsMask = ctx.terrain?.analysis?.crossings ?? ctx.masks?.terrain?.crossings ?? [];
      const landmarksMask = ctx.terrain?.analysis?.landmarks ?? ctx.masks?.terrain?.landmarks ?? [];
      const reservationsMaskRaw = ctx.terrain?.analysis?.reservations ?? ctx.masks?.terrain?.reservations ?? [];
      const reservationsMask = Array.isArray(reservationsMaskRaw)
        ? reservationsMaskRaw
        : [
            ...(Array.isArray(reservationsMaskRaw?.road) ? reservationsMaskRaw.road : []),
            ...(Array.isArray(reservationsMaskRaw?.water) ? reservationsMaskRaw.water : []),
            ...(Array.isArray(reservationsMaskRaw?.buildable) ? reservationsMaskRaw.buildable : []),
          ];
      const footprintNearReservedMask = (fp) => {
        if (!fp) return false;
        const pts = Array.isArray(fp.points) ? fp.points : [];
        if (!pts.length) return false;
        let sx = 0, sz = 0;
        for (const pt of pts) { sx += Number(pt?.[0]) || 0; sz += Number(pt?.[1]) || 0; }
        const cx = sx / pts.length, cz = sz / pts.length;
        for (const cr of crossingsMask) {
          const kx = Number(cr?.x), kz = Number(cr?.z);
          if (!Number.isFinite(kx) || !Number.isFinite(kz)) continue;
          if (Math.abs(cx - kx) <= 12 && Math.abs(cz - kz) <= 12) return true;
        }
        for (const lm of landmarksMask) {
          const lx = Number(lm?.x), lz = Number(lm?.z);
          if (!Number.isFinite(lx) || !Number.isFinite(lz)) continue;
          const role = String(lm?.role ?? lm?.kind ?? '');
          const pad = role.includes('cross') ? 12 : 10;
          if (Math.abs(cx - lx) <= pad && Math.abs(cz - lz) <= pad) return true;
        }
        for (const rs of reservationsMask) {
          const rx = Number(rs?.x ?? rs?.cx ?? rs?.position?.[0]);
          const rz = Number(rs?.z ?? rs?.cz ?? rs?.position?.[2]);
          if (!Number.isFinite(rx) || !Number.isFinite(rz)) continue;
          const role = String(rs?.role ?? '');
          const pad = (role === 'core' || role === 'station' || role === 'interchange') ? 14 : (role === 'viewpoint' ? 12 : 8);
          if (Math.abs(cx - rx) <= pad && Math.abs(cz - rz) <= pad) return true;
        }
        return false;
      };
      let placed = 0, skippedConflict = 0;
      // Prioritize parcels with better road access so budget favors reachable built-up areas.
      const orderedParcels = parcels.map((p, idx) => {
        const b = p.aabb; const cx = b ? (b.minX + b.maxX) / 2 : 0; const cz = b ? (b.minZ + b.maxZ) / 2 : 0;
        const rd = Number.isFinite(p?.access?.roadDist) ? p.access.roadDist : minDistanceToRoadSegments(cx, cz, roadSegments);
        return { p, idx, rd: Number.isFinite(rd) ? rd : 1e9 };
      }).sort((a, b) => a.rd - b.rd || a.idx - b.idx).map(x => x.p);
      // R4.3 §9.5: shared frontage building-line datums for adjacency-aware continuity across parcel groups/blocks.
      const frontageGroupStreetEdges = computeFrontageGroupStreetEdges(parcels);

      const stream = ctx.meta?.stream ?? ctx.input?.stream ?? null;
      const chunkSize = Number(stream?.chunk) > 0 ? Number(stream.chunk) : null;
      const chunkGrid = chunkSize ? Math.max(1, Math.round(size / chunkSize)) : 0;
      const totalChunks = chunkGrid > 0 ? chunkGrid * chunkGrid : 0;
      const idealPerChunk = totalChunks > 0 ? (budget / totalChunks) : Infinity;
      const chunkSoft = Number.isFinite(idealPerChunk) ? Math.max(8, Math.ceil(idealPerChunk * 1.3)) : Infinity;
      const chunkHard = Number.isFinite(idealPerChunk) ? Math.max(chunkSoft + 2, Math.ceil(idealPerChunk * 1.7)) : Infinity;
      const placedPerChunk = new Map();
      const placedParcel = new Set();
      const conflictParcel = new Set();
      const chunkKeyFor = (x, z) => {
        if (!chunkSize || !chunkGrid) return null;
        const half = size / 2;
        const ix = Math.max(0, Math.min(chunkGrid - 1, Math.floor((x + half) / chunkSize)));
        const iz = Math.max(0, Math.min(chunkGrid - 1, Math.floor((z + half) / chunkSize)));
        return `${ix},${iz}`;
      };

      const placedByType = Object.create(null);
      // Soft per-type budget shares to avoid one district type consuming the whole building budget.
      const typeShare = {
        office: 0.11, residential: 0.14, luxury: 0.1, industrial: 0.08, slums: 0.08,
        parking: 0.06, sports: 0.06, park: 0.05, forest: 0.04,
        commercial: 0.08, suburb: 0.08, old_town: 0.05, campus: 0.04, market: 0.05,
      };
      const typeTarget = (t) => Math.max(4, Math.round(budget * (typeShare[t] ?? 0.08)));

      const tryPlaceBuilding = (p, { relaxChunk = false, force = false } = {}) => {
        if (placed >= budget) return false;
        if (placedParcel.has(p)) return false;
        if (p?.reserved) return false;
        const profile = profiles[p.type] || profiles[p.profileId] || {};
        const kinds = profile.buildings?.kinds ?? [];
        const coverage = clamp(Number(profile.parcels?.coverage ?? 0.3), 0, 0.85);
        // base placement probability by district/building profile
        const chance = kinds.length === 0 ? 0 : Math.max(0.15, coverage + 0.1);
        const b = p.aabb; if (!b) return false;
        const pw = b.maxX - b.minX, ph = b.maxZ - b.minZ;
        if (pw < 6 || ph < 6) return false;
        const margin = 1.0;
        const maxW = Math.max(4, pw - margin * 2);
        const maxD = Math.max(4, ph - margin * 2);
        const cx = (b.minX + b.maxX) / 2;
        const cz = (b.minZ + b.maxZ) / 2;
        const parcelArea = Math.max(EPS, pw * ph);
        const maxFootprintRatio = clamp(Number(profile.parcels?.coverage ?? profile.parcels?.maxFootprintRatio ?? 0.3), 0.05, 0.85);
        // Road-access metrics used by archetype, scale and placement chance.
        const roadDist = Number.isFinite(p?.access?.roadDist) ? p.access.roadDist : minDistanceToRoadSegments(cx, cz, roadSegments);
        const nearRoad = Number.isFinite(roadDist) && roadDist < 70;
        // RNG: consume kind/shape seeds deterministically per eligible attempt before conflict checks.
        const kind = kinds.length ? pick(kinds, rng) : 'generic';
        const arch = ARCHETYPES[kind] || null;
        let scaleBase = arch ? rangePick(arch.scale, rng) : (kinds.length ? (0.55 + rng() * 0.35) : 0.4);
        if (!arch) {
          if (p.type === 'industrial') scaleBase = 0.65 + rng() * 0.28;
          else if (p.type === 'office') scaleBase = nearRoad ? (0.58 + rng() * 0.3) : (0.5 + rng() * 0.28);
          else if (p.type === 'slums') scaleBase = 0.45 + rng() * 0.35;
          else if (p.type === 'park' || p.type === 'forest') scaleBase = 0.35 + rng() * 0.25;
          else if (p.type === 'suburb') scaleBase = 0.4 + rng() * 0.22;
          else if (p.type === 'commercial' || p.type === 'market') scaleBase = 0.56 + rng() * 0.28;
          else if (p.type === 'campus' || p.type === 'old_town') scaleBase = 0.5 + rng() * 0.28;
        }
        const aspect = arch ? rangePick(arch.aspect, rng) : (0.8 + rng() * 0.6);
        // Level 17: панельки — 3 подъезда и пропорции оригинала (docs/houses soviet-panel)
        const panelkaL17 = kind === 'panelka' && /level-17/i.test(levelName);
        const panelkaSectionW = 13.6, panelkaDepth = 11.8, panelkaEntrances = 3;
        let footprint = null;
        let buildingRotation = 0;
        let reliefStats = null;
        let placedAccessEdge = p?.access?.edge ?? null;
        const capByCoverage = (w, d) => {
          // R4.3 §9.5: доля застройки участка не больше maxFootprintRatio (coverage).
          let ww = w, dd = d;
          const areaCap = Math.max(16, parcelArea * maxFootprintRatio);
          const a = ww * dd;
          if (a > areaCap) {
            const k = Math.sqrt(areaCap / a);
            ww = Math.max(4, ww * k);
            dd = Math.max(4, dd * k);
          }
          ww = Math.min(ww, maxW);
          dd = Math.min(dd, maxD);
          return [ww, dd];
        };
        if (panelkaL17) {
          // оригинал: 3 секции × 13.6м = 40.8м, глубина 11.8м. Ищем максимально широкое
          // размещение в рамках участка (пропорции 3-секционной панельки), не уже ~24м.
          const targetRatio = (panelkaSectionW * panelkaEntrances) / panelkaDepth; // ~3.46
          for (const m of [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52]) {
            let w = panelkaSectionW * panelkaEntrances * m;
            let d = panelkaDepth * m;
            // подгоняем под границы участка, сохраняя вытянутость 3-секционного дома
            if (w > maxW) { const s = maxW / w; w = maxW; d *= s; }
            if (d > maxD) { const s = maxD / d; d = maxD; w *= s; }
            [w, d] = capByCoverage(w, d);
            // шире для 3 подъездов (оригинальные пропорции), но допускаем ужатие под участок
            if (w < 18 || d < 7) continue;
            const fp = footprintRect(cx, cz, w, d);
            const riverIndex = (rivers === (ctx.hydrology?.rivers ?? null) || rivers === (ctx.masks?.easement?.rivers ?? null)) ? (ctx.spatial?.riverSegments ?? null) : null;
            const lakes = ctx.masks?.easement?.lakes ?? [];
            // R4.3 §9.5/§9.6: orientation aligned to street + setback pushes away from street — for rotated footprint
            const fin = finalizeByAccess(fp, cx, cz, p, maxW, maxD, rng, size / 2, frontageGroupStreetEdges);
            const fpAligned = fin.fp;
            const fchk = isFootprintFoundationAllowed(fpAligned, Math.max(1, Number(profile.buildings?.maxFloors ?? 16)), terrainSampler);
            if (!fchk.ok) continue;
            if (footprintNearAnchors(fpAligned, anchors, 10) || footprintIntersectsRiver(fpAligned, rivers, riverIndex, waterBufferById) || footprintIntersectsLake(fpAligned, lakes) || footprintIntersectsFloodplainMask(fpAligned, floodplainMasks) || footprintIntersectsRoad(fpAligned, roads, roadSegments, ctx.spatial?.roadEasements, { ignoreEasements: !!force && !!relaxChunk })) continue;
            footprint = fpAligned;
            buildingRotation = fin.rotation;
            reliefStats = fchk.stats;
            break;
          }
        }
        if (!footprint) {
          for (const scaleMul of [1, 0.82, 0.68]) {
            const s = scaleBase * scaleMul;
            let w = clamp(maxW * s * Math.sqrt(Math.max(0.4, aspect)), 4, maxW);
            let d = clamp(maxD * s / Math.sqrt(Math.max(0.4, aspect)), 4, maxD);
            // If aspect pushes out of bounds, rebalance.
            if (w >= maxW - 0.01) d = clamp(maxD * s * s / (w / maxW || 1), 4, maxD);
            if (d >= maxD - 0.01) w = clamp(maxW * s * s / (d / maxD || 1), 4, maxW);
            [w, d] = capByCoverage(w, d);
            if (w < 4 || d < 4) continue;
            const fp = footprintRect(cx, cz, w, d);
            const riverIndex = (rivers === (ctx.hydrology?.rivers ?? null) || rivers === (ctx.masks?.easement?.rivers ?? null)) ? (ctx.spatial?.riverSegments ?? null) : null;
            const lakes = ctx.masks?.easement?.lakes ?? [];
            const fin = finalizeByAccess(fp, cx, cz, p, maxW, maxD, rng, size / 2, frontageGroupStreetEdges);
            const fpAligned = fin.fp;
            const fchk = isFootprintFoundationAllowed(fpAligned, Math.max(1, Number(profile.buildings?.maxFloors ?? (arch ? arch.floors[1] : 4))), terrainSampler);
            if (!fchk.ok) continue;
            if (footprintNearAnchors(fpAligned, anchors, 10) || footprintIntersectsRiver(fpAligned, rivers, riverIndex, waterBufferById) || footprintIntersectsLake(fpAligned, lakes) || footprintIntersectsFloodplainMask(fpAligned, floodplainMasks) || footprintIntersectsRoad(fpAligned, roads, roadSegments, ctx.spatial?.roadEasements, { ignoreEasements: !!force && !!relaxChunk })) continue;
            footprint = fpAligned;
            buildingRotation = fin.rotation;
            reliefStats = fchk.stats;
            break;
          }
        }
        if (!footprint) {
          if (!conflictParcel.has(p)) { conflictParcel.add(p); skippedConflict++; }
          return false;
        }
        // Crossing/landmark/reservation masks as real downstream constraints (transport-compatible, deterministic degradation).
        if (footprintNearReservedMask(footprint)) {
          if (!conflictParcel.has(p)) { conflictParcel.add(p); skippedConflict++; }
          return false;
        }

        // Road-access bias: prefer parcels closer to emitted road network for built-up districts.
        let accessChance = chance;
        if (Number.isFinite(roadDist) && roadDist !== Infinity) {
          const needsAccess = ['office', 'residential', 'luxury', 'industrial', 'slums', 'parking', 'sports', 'commercial', 'old_town', 'campus', 'market'].includes(p.type);
          if (needsAccess) {
            if (roadDist < 60) accessChance = Math.min(0.97, chance + 0.2);
            else if (roadDist < 140) accessChance = Math.min(0.85, chance + 0.08);
            else accessChance = Math.max(0.06, chance - 0.14);
          } else if (p.type === 'park' || p.type === 'forest') {
            if (roadDist > 120) accessChance = Math.min(0.92, chance + 0.06);
            if (roadDist < 50 && rng() < 0.5) accessChance *= 0.5; // keep parks/forest more open near roads
          } else if (p.type === 'suburb') {
            // low-density, prefers some setback but still reachable
            if (roadDist < 70) accessChance = Math.min(0.8, chance + 0.08);
            else if (roadDist < 180) accessChance = Math.min(0.65, chance + 0.02);
            else accessChance = Math.max(0.08, chance - 0.1);
          }
        }
        // Chunk load balancing (TASK-006/008): discourage concentration in a single stream chunk.
        const ck = chunkKeyFor(cx, cz);
        const cc = ck ? (placedPerChunk.get(ck) || 0) : 0;
        const hard = relaxChunk ? Math.ceil(chunkHard * 1.15) : chunkHard;
        const soft = relaxChunk ? Math.ceil(chunkSoft * 1.1) : chunkSoft;
        if (!force && Number.isFinite(idealPerChunk)) {
          if (cc >= hard) accessChance *= (relaxChunk ? 0.2 : 0.05);
          else if (cc >= soft) accessChance *= (relaxChunk ? 0.45 : 0.25);
          else if (cc >= Math.ceil(idealPerChunk * 1.15)) accessChance *= 0.7;
        }
        // Balance across district types: penalize types that already reached their soft target share.
        const tcount = placedByType[p.type] || 0;
        const ttarget = typeTarget(p.type);
        if (!force) {
          if (tcount >= ttarget) accessChance *= 0.4;
          else if (tcount >= Math.floor(ttarget * 0.8)) accessChance *= 0.7;
          // If budget is still open near the end, allow deficit types to catch up.
          const remaining = budget - placed;
          if (remaining < 60 && tcount < Math.floor(ttarget * 0.5)) accessChance = Math.min(0.98, accessChance * 1.2);
        } else {
          accessChance = 1.0;
        }
        if (!force && rng() > accessChance) return false;

        // District archetypes: parametric footprint/height/material (kind/shape seeded above).
        const maxFloors = Math.max(1, Number(profile.buildings?.maxFloors ?? (arch ? arch.floors[1] : 4)));
        let floors = arch ? rangePickInt(arch.floors, rng) : (1 + Math.floor(rng() * Math.min(maxFloors, 4)));
        if (p.type === 'office' && nearRoad) floors = Math.max(floors, Math.min(maxFloors, 6 + Math.floor(rng() * 6)));
        if (p.type === 'office' && rng() < 0.12) floors = Math.max(floors, Math.min(maxFloors, 12 + Math.floor(rng() * 8)));
        if ((p.type === 'park' || p.type === 'forest') && kinds.length) floors = Math.min(floors, 2);
        floors = clamp(floors, 1, maxFloors);
        let floorHeight = arch ? +rangePick(arch.floorHeight, rng).toFixed(2) : 3.3;
        if (p.type === 'industrial' && floorHeight < 4.2) floorHeight = +(4.2 + rng() * 1.2).toFixed(2);
        if ((p.type === 'sports' || p.type === 'campus') && floorHeight < 3.8) floorHeight = +(3.8 + rng() * 1.4).toFixed(2);
        const id = `b_${p.districtId}_${placed + 1}`;
        const facadeMaterial = materialFor(profile, kind, rng, p.type ?? p.profileId ?? null);
        const wallColor = pickWallColor(facadeMaterial, rng, p.type ?? p.profileId ?? null);
        // Подъезды (docs/houses): для панельки рандомизируемо по длине фасада, иначе 1
        let entrances = 1;
        if (kind === 'panelka') {
          const longSide = Math.max(footprint ? Math.abs(footprint[1].x - footprint[0].x) : 0, footprint ? Math.abs(footprint[2].z - footprint[1].z) : 0);
          const maxE = Math.max(1, Math.min(4, Math.floor(longSide / 10)));
          entrances = 1 + Math.floor(rng() * maxE);
        }
        const isL17Panelka = panelkaL17;
        if (isL17Panelka) entrances = 3;
        // Детальная визуальная модель (docs/houses): назначаем по houseKind.
        const DETAILED_VISUAL_BY_KIND = {
          panelka: 'soviet_panel',
          skyscraper: 'skyscraper',
          office_block: 'office-building',
          megablock: 'megabuilding',
          slum_shack: 'slum-shack',
          classic_cottage: 'classic-cottage',
          barn_house: 'nordic-barn',
          aframe: 'a-frame',
          chalet: 'alpine-chalet',
          mansard_house: 'mansard-house',
          modern_pavilion: 'modern-pavilion',
        };
        const detailedVisual = isL17Panelka ? 'soviet_panel' : (DETAILED_VISUAL_BY_KIND[kind] || null);
        // R4.4 §9.7 (partial): typological windows + deterministic roof material/color/parapet metadata.
        const win = pickWindowParams(kind, p.type ?? null, floors, rng);
        const roofApp = pickRoofAppearance(kind, facadeMaterial, floors, rng, p.type ?? p.profileId ?? null);
        // R4.3 §9.6: baseY от медианы рельефа пятна + цоколь (normalizer зафиксирует по фактической опоре; задаём осмысленный минимум).
        const reliefBaseY = (reliefStats && Number.isFinite(reliefStats.medianY))
          ? +(reliefStats.medianY + (floors > 4 ? 0.25 : 0.2)).toFixed(3)
          : null;
        out.push({
          id,
          districtId: p.districtId ?? null,
          districtType: p.type ?? null,
          name: `B ${placed + 1}`,
          isEnterable: false,
          ...(reliefBaseY != null ? { baseY: reliefBaseY } : {}),
          floorsCount: floors,
          floorHeight,
          foundation: 'terrain',
          facadeMaterial,
          ...(wallColor ? { wallColor } : {}),
          houseKind: kind,
          ...(isL17Panelka ? { entrances } : (entrances > 1 ? { entrances } : (kind === 'panelka' ? { entrances: 1 } : {}))),
          ...(detailedVisual ? { detailedVisual } : {}),
          windowDensity: win.density,
          windowScale: win.scale,
          footprint,
          ...(buildingRotation ? { rotation: buildingRotation } : {}),
          roofMaterial: roofApp.roofMaterial,
          roofColor: roofApp.roofColor,
          roof: roofApp.roof,
          rooms: [],
          stairs: [],
          _accessEdge: placedAccessEdge,
          _cornerAccess: p?.access?.corner ? { edges: Array.isArray(p.access.cornerEdges) ? [...p.access.cornerEdges] : [] } : null,
        });
        placed++;
        placedParcel.add(p);
        placedByType[p.type] = (placedByType[p.type] || 0) + 1;
        if (ck) placedPerChunk.set(ck, (placedPerChunk.get(ck) || 0) + 1);
        return true;
      };

      for (const p of orderedParcels) {
        if (placed >= normalBudget) break;
        tryPlaceBuilding(p);
      }
      // Fill pass: if chunk balancing left budget unused, relax chunk pressure to reach target density.
      if (placed < normalBudget) {
        for (const p of orderedParcels) {
          if (placed >= normalBudget) break;
          tryPlaceBuilding(p, { relaxChunk: true });
        }
      }
      // Final fallback: if still under budget, allow placement with minimal extra pressure (keeps some spread).
      if (placed < Math.floor(normalBudget * 0.9)) {
        for (const p of orderedParcels) {
          if (placed >= normalBudget) break;
          if (placedParcel.has(p) || p?.reserved) continue;
          tryPlaceBuilding(p, { relaxChunk: true });
        }
      }
      // Ensure district representation: try to place at least one building in districts that have buildable kinds.
      const reprBudget = budget;
      if (placed < reprBudget) {
        const placedByDistrict = new Map();
        for (const b of out) {
          const m = /^b_(.+)_\d+$/.exec(String(b.id || ''));
          const did = m ? m[1] : null;
          if (did) placedByDistrict.set(did, (placedByDistrict.get(did) || 0) + 1);
        }
        for (const d of (ctx.districts || [])) {
          if (placed >= budget) break;
          const profile = profiles[d.type] || profiles[d.profileId] || {};
          const kinds = profile.buildings?.kinds ?? [];
          if (!kinds.length) continue;
          if ((placedByDistrict.get(d.id) || 0) > 0) continue;
          const dp = orderedParcels.filter(p => p.districtId === d.id && !placedParcel.has(p) && !p?.reserved);
          // prefer better road access first
          dp.sort((a,b) => {
            const ba = a.aabb, bb = b.aabb;
            const acx = ba ? (ba.minX+ba.maxX)/2 : 0, acz = ba ? (ba.minZ+ba.maxZ)/2 : 0;
            const bcx = bb ? (bb.minX+bb.maxX)/2 : 0, bcz = bb ? (bb.minZ+bb.maxZ)/2 : 0;
            const ad = Number.isFinite(a?.access?.roadDist) ? a.access.roadDist : minDistanceToRoadSegments(acx,acz,roadSegments);
            const bd = Number.isFinite(b?.access?.roadDist) ? b.access.roadDist : minDistanceToRoadSegments(bcx,bcz,roadSegments);
            return (Number.isFinite(ad)?ad:1e9) - (Number.isFinite(bd)?bd:1e9);
          });
          let placedDistrict = false;
          for (const p of dp.slice(0, 80)) {
            if (placed >= reprBudget) break;
            if (tryPlaceBuilding(p, { relaxChunk: true, force: true })) {
              placedByDistrict.set(d.id, (placedByDistrict.get(d.id) || 0) + 1);
              placedDistrict = true;
              break;
            }
          }
          if (placedDistrict) continue;
          // Deterministic recovery: place a minimal valid building ignoring easement AABBs and probabilistic/RNG shape variance.
          for (const p of dp.slice(0, 120)) {
            if (placed >= reprBudget) break;
            const b = p.aabb; if (!b) continue;
            const pw = b.maxX - b.minX, ph = b.maxZ - b.minZ;
            if (pw < 6 || ph < 6) continue;
            const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
            let footprint = null;
            for (const scale of [0.45, 0.35, 0.28]) {
              const w = clamp((pw - 2) * scale, 4, Math.max(4, pw - 2));
              const dlen = clamp((ph - 2) * scale, 4, Math.max(4, ph - 2));
              const fp = footprintRect(cx, cz, w, dlen);
              const riverIndex = (rivers === (ctx.hydrology?.rivers ?? null) || rivers === (ctx.masks?.easement?.rivers ?? null)) ? (ctx.spatial?.riverSegments ?? null) : null;
              const lakes = ctx.masks?.easement?.lakes ?? [];
              if (footprintNearAnchors(fp, anchors, 10)) continue;
              if (footprintIntersectsRiver(fp, rivers, riverIndex, waterBufferById)) continue;
              if (footprintIntersectsLake(fp, lakes)) continue;
              if (footprintIntersectsFloodplainMask(fp, floodplainMasks)) continue;
              if (footprintIntersectsRoad(fp, roads, roadSegments, ctx.spatial?.roadEasements, { ignoreEasements: true })) continue;
              footprint = fp;
              break;
            }
            if (!footprint) continue;
            if (footprintNearReservedMask(footprint)) continue;
            const kind = kinds[0] || 'generic';
            const arch = ARCHETYPES[kind] || null;
            const maxFloors = Math.max(1, Number(profile.buildings?.maxFloors ?? (arch ? arch.floors[1] : 2)));
            const floors = clamp(arch ? arch.floors[0] : 1, 1, maxFloors);
            const floorHeight = arch ? +Number(arch.floorHeight[0]).toFixed(2) : (d.type === 'industrial' ? 4.5 : 3.3);
            const id = `b_${d.id}_${placed + 1}`;
            const facadeMaterial = materialFor(profile, kind, () => 0, d.type ?? d.profileId ?? null);
            const isL17PanelkaFallback = kind === 'panelka' && /level-17/i.test(levelName);
            const DETAILED_VISUAL_BY_KIND = {
              panelka: 'soviet_panel',
              skyscraper: 'skyscraper',
              office_block: 'office-building',
              megablock: 'megabuilding',
              slum_shack: 'slum-shack',
              classic_cottage: 'classic-cottage',
              barn_house: 'nordic-barn',
              aframe: 'a-frame',
              chalet: 'alpine-chalet',
              mansard_house: 'mansard-house',
              modern_pavilion: 'modern-pavilion',
            };
            const detailedVisual = isL17PanelkaFallback ? 'soviet_panel' : (DETAILED_VISUAL_BY_KIND[kind] || null);
            const win = pickWindowParams(kind, d.type ?? null, floors, () => 0);
            const roofApp = pickRoofAppearance(kind, facadeMaterial, floors, () => 0, d.type ?? d.profileId ?? null);
            out.push({
              id,
              districtId: d.id ?? null,
              districtType: d.type ?? null,
              name: `B ${placed + 1}`,
              isEnterable: false,
              floorsCount: floors,
              floorHeight,
              foundation: 'terrain',
              facadeMaterial,
              ...(pickWallColor(facadeMaterial, () => 0, d.type ?? d.profileId ?? null) ? { wallColor: pickWallColor(facadeMaterial, () => 0, d.type ?? d.profileId ?? null) } : {}),
              houseKind: kind,
              ...(isL17PanelkaFallback ? { entrances: 3 } : (kind === 'panelka' ? { entrances: 1 } : {})),
              ...(detailedVisual ? { detailedVisual } : {}),
              windowDensity: win.density,
              windowScale: win.scale,
              footprint,
              roofMaterial: roofApp.roofMaterial,
              roofColor: roofApp.roofColor,
              roof: roofApp.roof,
              rooms: [],
              stairs: [],
              _accessEdge: p?.access?.edge ?? null,
              _cornerAccess: p?.access?.corner ? { edges: Array.isArray(p.access.cornerEdges) ? [...p.access.cornerEdges] : [] } : null,
            });
            placed++;
            placedParcel.add(p);
            placedByType[d.type] = (placedByType[d.type] || 0) + 1;
            const ck = chunkKeyFor(cx, cz);
            if (ck) placedPerChunk.set(ck, (placedPerChunk.get(ck) || 0) + 1);
            placedByDistrict.set(d.id, (placedByDistrict.get(d.id) || 0) + 1);
            placedDistrict = true;
            break;
          }
        }
      }
      ctx.buildings = out;
      ctx.report.diagnostics.push(info('buildings_generated', stageId, 'generated buildings from parcels', { count: out.length, budget, skippedConflict }));
    },
    validate(ctx) {
      const stageId = '4_buildings_structures';
      if (!Array.isArray(ctx.buildings)) { ctx.buildings = []; ctx.report.diagnostics.push(warn('buildings_invalid', stageId, 'buildings not an array')); }
      // Basic checks; detailed geometric validation happens in normalize/level schema pipeline.
      const seen = new Set();
      let pre = [];
      for (const b of ctx.buildings) {
        if (!b || typeof b !== 'object' || !Array.isArray(b.footprint) || b.footprint.length < 3) {
          ctx.report.drops.push({ stage: stageId, id: b?.id ?? null, reason: 'invalid_building' });
          continue;
        }
        let id = String(b.id ?? 'b');
        if (seen.has(id)) { id = `${id}_2`; ctx.report.repairs.push({ stage: stageId, id: b.id, code: 'duplicate_building_id', to: id }); b.id = id; }
        seen.add(id);
        pre.push(b);
      }

      // R1.4/R1.5: enforce terrain/hydrology downstream constraints (including passthrough buildings).
      // Water hard-buffer/floodplain and steep slope zones are not buildable for generic buildings.
      const rivers = ctx.masks?.easement?.rivers ?? ctx.hydrology?.rivers ?? ctx.input?.cityforge?.hydrology?.rivers ?? [];
      const waterBufferById = (() => {
        const src = Array.isArray(ctx.masks?.terrain?.waterBuffers) ? ctx.masks.terrain.waterBuffers : [];
        const m = new Map();
        for (const w of src) if (w?.id) m.set(w.id, w);
        return m;
      })();
      const floodplainMasks = Array.isArray(ctx.masks?.terrain?.floodplains) ? ctx.masks.terrain.floodplains
        : (Array.isArray(ctx.terrain?.analysis?.floodplains) ? ctx.terrain.analysis.floodplains : []);
      const riverIndex = (rivers === (ctx.hydrology?.rivers ?? null) || rivers === (ctx.masks?.easement?.rivers ?? null)) ? (ctx.spatial?.riverSegments ?? null) : null;
      const lakes = ctx.masks?.easement?.lakes ?? [];
      const baseY = Number(ctx.input?.ground?.y ?? 0) || 0;
      const mods = ctx.terrain?.modifiers ?? [];
      const filtered = [];
      let droppedWater = 0, droppedSlope = 0;
      for (const b of pre) {
        const fp = b.footprint;
        if (footprintIntersectsRiver(fp, rivers, riverIndex, waterBufferById) || footprintIntersectsLake(fp, lakes) || footprintIntersectsFloodplainMask(fp, floodplainMasks)) {
          ctx.report.drops.push({ stage: stageId, id: b.id ?? null, reason: 'building_in_water_constraint' });
          droppedWater++;
          continue;
        }
        const bb = aabbOfFootprint(fp);
        const cx = (bb.minX + bb.maxX) / 2, cz = (bb.minZ + bb.maxZ) / 2;
        // Local slope sample (R1.2/R4.1): slopes > 25% are not buildable.
        const d = 8;
        const y = (() => { let yy = baseY; for (const m of mods) { const type=m?.type; if(type!=='mountain'&&type!=='valley') continue; const h=Number(m.height)||0,r=Number(m.radius)||0; if(!(r>EPS)||!Number.isFinite(h)) continue; const c=Array.isArray(m.center)?m.center:[Number(m.center?.x)||0,Number(m.center?.z)||0]; const dx=cx-(Number(c[0])||0), dz=cz-(Number(c[1])||0); const dist=Math.hypot(dx,dz); if(dist>=r) continue; const t=1-dist/r; const e=t*t*(3-2*t); const signed=(m.operation==='subtract')?-h:h; yy+=signed*e; } return yy; })();
        const heightAt = (x, z) => { let yy = baseY; for (const m of mods) { const type=m?.type; if(type!=='mountain'&&type!=='valley') continue; const h=Number(m.height)||0,r=Number(m.radius)||0; if(!(r>EPS)||!Number.isFinite(h)) continue; const c=Array.isArray(m.center)?m.center:[Number(m.center?.x)||0,Number(m.center?.z)||0]; const dx=x-(Number(c[0])||0), dz=z-(Number(c[1])||0); const dist=Math.hypot(dx,dz); if(dist>=r) continue; const t=1-dist/r; const e=t*t*(3-2*t); const signed=(m.operation==='subtract')?-h:h; yy+=signed*e; } return yy; };
        const sMax = Math.max(
          Math.abs(heightAt(cx + d, cz) - y),
          Math.abs(heightAt(cx - d, cz) - y),
          Math.abs(heightAt(cx, cz + d) - y),
          Math.abs(heightAt(cx, cz - d) - y),
        ) / d;
        if (Number.isFinite(sMax) && sMax > 0.25) {
          ctx.report.drops.push({ stage: stageId, id: b.id ?? null, reason: 'building_on_steep_slope' });
          droppedSlope++;
          continue;
        }
        filtered.push(b);
      }
      if (droppedWater > 0) ctx.report.diagnostics.push(warn('buildings_dropped_water_constraint', stageId, `dropped ${droppedWater} building(s) violating water buffer/floodplain constraints`, { count: droppedWater }));
      if (droppedSlope > 0) ctx.report.diagnostics.push(warn('buildings_dropped_steep_slope', stageId, `dropped ${droppedSlope} building(s) on steep slopes (>25%)`, { count: droppedSlope }));

      // R3 split-regression fix: reassign buildings to current (possibly split) districts
      // by footprint center. Keeps stable building ids, but updates districtId/type refs
      // used by reporting and downstream logic.
      const districtsForAssign = Array.isArray(ctx.districts) ? ctx.districts : [];
      if (districtsForAssign.length && filtered.length) {
        const districtCenter = (d) => {
          const r = d?.geometry?.rect;
          if (r && Number.isFinite(r.minX)) return { x: (Number(r.minX) + Number(r.maxX)) / 2, z: (Number(r.minZ) + Number(r.maxZ)) / 2 };
          return null;
        };
        const pointInRect = (x, z, r) => r && x >= Number(r.minX) && x <= Number(r.maxX) && z >= Number(r.minZ) && z <= Number(r.maxZ);
        let reassigned = 0;
        for (const b of filtered) {
          const fp = Array.isArray(b?.footprint) ? b.footprint : [];
          if (fp.length < 3) continue;
          let sx = 0, sz = 0, n = 0;
          for (const p of fp) { const x = Number(p?.x ?? p?.[0]), z = Number(p?.z ?? p?.[2] ?? p?.[1]); if (Number.isFinite(x) && Number.isFinite(z)) { sx += x; sz += z; n++; } }
          if (!n) continue;
          const cx = sx / n, cz = sz / n;
          let best = null;
          for (const d of districtsForAssign) {
            const r = d?.geometry?.rect;
            if (pointInRect(cx, cz, r)) { best = d; break; }
          }
          if (!best) {
            let bestD = Infinity;
            for (const d of districtsForAssign) {
              const c = districtCenter(d);
              if (!c) continue;
              const dd = (cx - c.x) * (cx - c.x) + (cz - c.z) * (cz - c.z);
              if (dd < bestD) { bestD = dd; best = d; }
            }
          }
          if (best) {
            const nextId = best.id ?? null;
            const nextType = best.type || best.profileId || null;
            if (nextId && b.districtId !== nextId) reassigned++;
            if (nextId) b.districtId = nextId;
            if (nextType) b.districtType = nextType;
          }
        }
        if (reassigned > 0) ctx.report.diagnostics.push(info('buildings_reassigned_to_split_districts', stageId, 'reassigned buildings to current districts by footprint center', { count: reassigned }));

        // Rebalance buildings across split siblings: if a child district has parcels but no
        // buildings (common after pressure-split of pre-split placement), move nearby buildings
        // from siblings under the same parent to reduce empty-district artifacts.
        const parcels = Array.isArray(ctx.parcels) ? ctx.parcels : [];
        const parcelsByDistrict = new Map();
        for (const p of parcels) {
          if (!p?.districtId) continue;
          parcelsByDistrict.set(p.districtId, (parcelsByDistrict.get(p.districtId) || 0) + 1);
        }
        const buildingsByDistrict = new Map();
        const bCenter = (b) => {
          const fp = Array.isArray(b?.footprint) ? b.footprint : [];
          let sx = 0, sz = 0, n = 0;
          for (const p of fp) { const x = Number(p?.x ?? p?.[0]), z = Number(p?.z ?? p?.[2] ?? p?.[1]); if (Number.isFinite(x) && Number.isFinite(z)) { sx += x; sz += z; n++; } }
          return n ? { x: sx / n, z: sz / n } : null;
        };
        for (const b of filtered) {
          const id = b?.districtId;
          if (!id) continue;
          if (!buildingsByDistrict.has(id)) buildingsByDistrict.set(id, []);
          buildingsByDistrict.get(id).push(b);
        }
        const expectsBuildings = (t) => !['forest', 'park', 'field', 'sports_field'].includes(String(t || ''));
        let rebalanced = 0;
        for (const d of districtsForAssign) {
          const did = d?.id;
          if (!did) continue;
          const pCount = parcelsByDistrict.get(did) || 0;
          const bList = buildingsByDistrict.get(did) || [];
          if (pCount <= 0 || bList.length > 0 || !expectsBuildings(d.type || d.profileId)) continue;
          const dc = districtCenter(d);
          if (!dc) continue;
          // Prefer siblings (same parentId/type group), then any donor with surplus.
          const donors = districtsForAssign
            .filter(x => x && x.id !== did && (buildingsByDistrict.get(x.id) || []).length > 1)
            .map(x => ({ d: x, sameParent: !!(d.parentId && x.parentId === d.parentId), sameType: (x.type || x.profileId) === (d.type || d.profileId), count: (buildingsByDistrict.get(x.id) || []).length }))
            .sort((a, b) => (Number(b.sameParent) - Number(a.sameParent)) || (Number(b.sameType) - Number(a.sameType)) || (b.count - a.count));
          const donor = donors[0]?.d;
          if (!donor) continue;
          const donorList = buildingsByDistrict.get(donor.id) || [];
          // Move the building from donor whose center is closest to target district center.
          let bestIdx = -1, bestDist = Infinity;
          for (let i = 0; i < donorList.length; i++) {
            const bc = bCenter(donorList[i]);
            if (!bc) continue;
            const dd = (bc.x - dc.x) * (bc.x - dc.x) + (bc.z - dc.z) * (bc.z - dc.z);
            if (dd < bestDist) { bestDist = dd; bestIdx = i; }
          }
          if (bestIdx < 0) continue;
          const [moved] = donorList.splice(bestIdx, 1);
          moved.districtId = did;
          moved.districtType = d.type || d.profileId || moved.districtType || null;
          bList.push(moved);
          buildingsByDistrict.set(donor.id, donorList);
          buildingsByDistrict.set(did, bList);
          rebalanced++;
        }
        if (rebalanced > 0) ctx.report.diagnostics.push(info('buildings_rebalanced_to_empty_split_districts', stageId, 'moved buildings to split child districts with parcels but no buildings', { count: rebalanced }));
      }

      // R4.4 §9.7: запрет трёх подряд одинаковых фасадов/внешнего облика (детерминированная ремедиация, schema-supported).
      {
        const WALL_PALETTE = ['#b8c2cc', '#8899ab', '#c8ab89', '#d9dde2', '#c9bfae', '#a95842', '#d5cbb8', '#adb5bd', '#5f6770', '#4b5563', '#4b4e54', '#8d949b', '#b0b7bd'];
        const ROOF_MAT = ['concrete_slab', 'bitumen', 'metal_sheet', 'tile', 'shingles', 'corrugated_metal'];
        const ROOF_COL = ['#5f6770', '#4b5563', '#6b7280', '#8d949b', '#7a6a58', '#6b4a3a', '#4f5d4a', '#77808a'];
        const W_DENS = [1, 2, 3];
        const appKey = (x) => `${x?.houseKind ?? ''}|${x?.facadeMaterial ?? ''}|${x?.wallColor ?? ''}|${x?.roofMaterial ?? ''}|${x?.roofColor ?? ''}|${x?.windowDensity ?? ''}`;
        const pickAlt = (arr, cur, avoidA, avoidB) => arr.find(x => x !== cur && x !== avoidA && x !== avoidB) ?? arr.find(x => x !== cur) ?? arr[0] ?? cur;
        const byDistrict = new Map();
        for (const b of filtered) {
          const k = b?.districtType || b?.type || 'x';
          if (!byDistrict.has(k)) byDistrict.set(k, []);
          byDistrict.get(k).push(b);
        }
        let swapped = 0;
        for (const arr of byDistrict.values()) {
          for (let j = 0; j + 2 < arr.length; j++) {
            const a = arr[j], b = arr[j + 1], c = arr[j + 2];
            if (appKey(a) === appKey(b) && appKey(b) === appKey(c)) {
              // Vary multiple appearance attributes deterministically to break the triple.
              c.wallColor = pickAlt(WALL_PALETTE, c.wallColor, a?.wallColor, b?.wallColor);
              c.roofMaterial = pickAlt(ROOF_MAT, c.roofMaterial, a?.roofMaterial, b?.roofMaterial);
              c.roofColor = pickAlt(ROOF_COL, c.roofColor, a?.roofColor, b?.roofColor);
              c.windowDensity = pickAlt(W_DENS, c.windowDensity, a?.windowDensity, b?.windowDensity);
              // keep roof object consistent if present
              if (!c.roof || typeof c.roof !== 'object') c.roof = { walkable: false, parapet: 0 };
              swapped += 1;
            }
          }
        }
        ctx.report.diagnostics.push(info('facade_no_three_consecutive_same', stageId, 'three consecutive identical facades remediated (section 9.7)', { swapped }));
      }

      ctx.buildings = filtered;
      // R4.2 §9.4/§6.6 + R4.5 §9.5/§9.8 — applied on the final building set (post-drop/reassign/rebalance).
      const seedPlan = mix(ctx.meta.seed ?? 0, stageId);
      const roadSegmentsPlan = ctx.networks?.roads?.segments ?? [];
      const out = filtered;
      // R4.2 §9.4/§6.6: floors distribution & neighbour contrast.
      // L-modulation: higher landValue -> taller (bounded), then adjacency clamp for built-floors contrast <= 2.5x,
      // exempting green seams (park/forest/parking/sports) as §10 relief, then 5-8 dominants per city (one per high-L district, capped/filled 2026-11-19).
      {
        const DS = ctx.districts ?? [];
        const rectOf = (d) => d?.geometry?.rect ?? null;
        const edgeTouch = (a, b, eps = 0.75) => {
          const ixMin = Math.max(a.minX, b.minX), ixMax = Math.min(a.maxX, b.maxX);
          const izMin = Math.max(a.minZ, b.minZ), izMax = Math.min(a.maxZ, b.maxZ);
          return (Math.abs(a.maxX - b.minX) <= eps && (izMax - izMin) > eps)
            || (Math.abs(b.maxX - a.minX) <= eps && (izMax - izMin) > eps)
            || (Math.abs(a.maxZ - b.minZ) <= eps && (ixMax - ixMin) > eps)
            || (Math.abs(b.maxZ - a.minZ) <= eps && (ixMax - ixMin) > eps);
        };
        const adjD = Array.from({ length: DS.length }, () => new Set());
        for (let i = 0; i < DS.length; i++) for (let j = i + 1; j < DS.length; j++) {
          const ra = rectOf(DS[i]), rb = rectOf(DS[j]); if (!ra || !rb) continue;
          if (edgeTouch(ra, rb)) { adjD[i].add(j); adjD[j].add(i); }
        }
        // L-modulation of floors (0.75..1.25 by landValue), railway-like profiles have LV in [0.35..1]
        for (const b of out) {
          const d = DS.find(x => x?.id === b.districtId);
          const lv = Number(d?.landValue);
          if (Number.isFinite(lv)) b.floorsCount = Math.max(1, Math.min(60, Math.floor((b.floorsCount ?? 1) * (0.75 + lv * 0.5))));
        }

        // dominants (R5.2 §10.4: 5-8 dominants per city): one per district, picked by landValue/floors;
        // globally capped to 8 and filled to a minimum of 5 (when enough districts exist).
        const byDistrict = new Map();
        for (const b of out) { const arr = byDistrict.get(b.districtId) ?? []; arr.push(b); byDistrict.set(b.districtId, arr); }
        const districtCandidates = [];
        for (const [did, arr] of byDistrict) {
          const d = DS.find(x => x?.id === did); if (!d) continue;
          const lvRaw = Number(d?.landValue);
          const lv = Number.isFinite(lvRaw) ? lvRaw : 0;
          const hi = [...arr].sort((x, y) => (Number(y.floorsCount ?? 0) - Number(x.floorsCount ?? 0)) || String(x.id).localeCompare(String(y.id)))[0];
          if (!hi) continue;
          districtCandidates.push({ did, lv, hi });
        }
        districtCandidates.sort((a, b) => (b.lv - a.lv) || (Number(b.hi.floorsCount ?? 0) - Number(a.hi.floorsCount ?? 0)) || String(a.did).localeCompare(String(b.did)));
        const minDom = 5, maxDom = 8; // §10.4
        const picked = [];
        for (const cd of districtCandidates) if (cd.lv >= 0.6 && picked.length < maxDom) picked.push(cd);
        for (const cd of districtCandidates) if (picked.length < minDom && !picked.includes(cd)) picked.push(cd);
        let dominants = 0;
        for (const cd of picked) {
          const hi = cd.hi;
          hi.floorsCount = Math.min(60, Number(hi.floorsCount ?? 1) + 1);
          dominants += 1;
        }

        // adjacency clamp AFTER dominants: enforce <=2.5x for built floors

        const greenish = new Set(['park', 'forest', 'parking', 'sports']);
        let clamped = 0;
        for (let iter = 0; iter < 3; iter++) {
          const byDist = new Map();
          for (const b of out) {
            const cur = byDist.get(b.districtId) ?? 1;
            byDist.set(b.districtId, Math.max(cur, Number(b.floorsCount ?? 1)));
          }
          const traceKeys = ['district_3_1_01', 'district_3_1_2100', 'district_3_1_201'];
          ctx.report.diagnostics.push(info('floors_clamp_bydist', stageId, 'trace byDist in clamp', { iter, keys: traceKeys.map(k => ({ id: k, max: byDist.get(k) ?? null })), totKeys: byDist.size }));
          let changed = false;
          for (let i = 0; i < DS.length; i++) {
            for (const j of adjD[i]) {
              if (j <= i) continue;
              const ti = DS[i]?.type, tj = DS[j]?.type;
              if (greenish.has(ti) || greenish.has(tj)) continue;
              const vi = byDist.get(DS[i]?.id), vj = byDist.get(DS[j]?.id);
              if (!Number.isFinite(vi) || !Number.isFinite(vj)) continue;
              if ((DS[i]?.id === 'district_3_1_01' && DS[j]?.id === 'district_3_1_2100') || (DS[j]?.id === 'district_3_1_01' && DS[i]?.id === 'district_3_1_2100')) {
                ctx.report.diagnostics.push(info('floors_clamp_pair', stageId, 'trace pair', { i, j, idI: DS[i]?.id, idJ: DS[j]?.id, ti: DS[i]?.type, tj: DS[j]?.type, vi, vj, cap: Math.max(1, Math.floor(2.5 * Math.max(1, Math.min(vi, vj)))) }));
              }
              const hi = vi >= vj ? i : j;
              const hiMax = Math.max(vi, vj), loMax = Math.max(1, Math.min(vi, vj));
              const cap = Math.max(1, Math.floor(2.5 * loMax));
              if (hiMax > cap) {
                for (const b of out) {
                  if (b.districtId === DS[hi]?.id && Number(b.floorsCount ?? 1) > cap) { b.floorsCount = cap; clamped += 1; changed = true; }
                }
              }
            }
          }
          if (!changed) break;
        }
        ctx.report.diagnostics.push(info('floors_contrast_built', stageId, 'building floors distribution (section 9.4): L-modulation, adjacency contrast <= 2.5x, 5-8 dominants per city (one per high-L district, capped/filled 2026-11-19)', { clamped, dominants, districts: DS.length, adjacencyPairs: adjD.reduce((s, s2) => s + s2.size, 0) / 2 }));
      }

      // R4.5 §9.5/§9.8: enterable share target = policies.enterableShare (default 0.2, clamp 0.15–0.25).
      // Маршрутная плотность: кандидаты у дорог приоритезируются. Каждый enterable несёт lobby/corridor/room и straight stairs.
      {
        const genEnterableCap = Number.isFinite(CONFIG?.jsonMap?.genEnterableFloors) ? CONFIG.jsonMap.genEnterableFloors : 4;
        const hardEnterableCap = Number.isFinite(CONFIG?.jsonMap?.enterableFloors) ? CONFIG.jsonMap.enterableFloors : 12;
        const enterableTarget = (() => {
          const p = Number(ctx?.meta?.policies?.enterableShare);
          return Number.isFinite(p) ? Math.min(0.25, Math.max(0.15, p)) : 0.2;
        })();
        const erng = makeRng(mix(mix(seedPlan, 'r45_enterable'), 'gen'));
        const cand = [];
        for (const b of out) {
          const fp = b?.footprint;
          let roadDist = Infinity;
          if (Array.isArray(fp) && fp.length >= 4) {
            const minX = Math.min(...fp.map(v => v.x)), maxX = Math.max(...fp.map(v => v.x));
            const minZ = Math.min(...fp.map(v => v.z)), maxZ = Math.max(...fp.map(v => v.z));
            roadDist = minDistanceToRoadSegments((minX + maxX) / 2, (minZ + maxZ) / 2, roadSegmentsPlan);
          }
          const routeBoost = Number.isFinite(roadDist) && roadDist < 60 ? 0.1 : 0;
          const score = erng() + routeBoost; // больше — вероятнее enterable
          const floorsOk0 = Number.isFinite(Number(b?.floorsCount)) && Number(b.floorsCount) <= hardEnterableCap;
          // лестница обязана помещаться в footprint с отступом >= 0.5 м (raster-grid 0.5/probeCell),
          // иначе парсер бракует марш как «вне footprint»
          let stairFit = false;
          if (floorsOk0 && Array.isArray(fp) && fp.length >= 4) {
            const sx0 = Math.min(...fp.map(v => v.x)), sx1 = Math.max(...fp.map(v => v.x));
            const sz0 = Math.min(...fp.map(v => v.z)), sz1 = Math.max(...fp.map(v => v.z));
            const spanMin = Math.min(sx1 - sx0, sz1 - sz0);
            const rise = Number.isFinite(Number(b?.floorHeight)) && Number(b.floorHeight) > 0 ? Number(b.floorHeight) : 3.3;
            const needLen = Math.max(3, Math.ceil((rise / 0.78 + 0.001) * 2) / 2);
            stairFit = needLen <= Math.floor((spanMin - 1.0) * 2) / 2;
          }
          const floorsOk = floorsOk0 && stairFit;
          cand.push({ b, roadDist, score, isEnterable: false, floorsOk });
        }
        const tierOf = (x) => (x.floorsOk && Number(x.b?.floorsCount ?? 1) <= genEnterableCap) ? 0 : (x.floorsOk ? 1 : 2);
        const sortedByScore = [...cand].sort((a, b) => (tierOf(a) - tierOf(b)) || (b.score - a.score) || (a.roadDist - b.roadDist) || (String(a.b.id).localeCompare(String(b.b.id))));
        const targetCount = out.length ? Math.round(out.length * enterableTarget) : 0;
        const capCount = Math.floor(out.length * 0.25);
        const floorCount = Math.max(0, Math.ceil(out.length * 0.15));
        const eligible = sortedByScore.filter(x => x.floorsOk).length;
        const want = Math.min(capCount, Math.max(floorCount, Math.min(targetCount, eligible)));
        for (let i = 0; i < sortedByScore.length; i++) sortedByScore[i].isEnterable = (i < want && sortedByScore[i].floorsOk);
        const polyOf = (r) => ([{ x: r.minX, z: r.minZ }, { x: r.maxX, z: r.minZ }, { x: r.maxX, z: r.maxZ }, { x: r.minX, z: r.maxZ }]);
        let enterCount = 0;
        for (const x of cand) {
          const b = x.b;
          b.isEnterable = x.isEnterable;
          if (!x.isEnterable) { b.rooms = []; b.stairs = []; continue; }
          enterCount += 1;
          const id = b.id;
          const fp = b.footprint;
          const fpCx = (fp[0].x + fp[2].x) / 2, fpCz = (fp[0].z + fp[2].z) / 2;
          const fpEx = fp[1].x - fp[0].x, fpEz = fp[1].z - fp[0].z;
          const fpFx = fp[3].x - fp[0].x, fpFz = fp[3].z - fp[0].z;
          const Lside = Math.hypot(fpEx, fpEz), Wside = Math.hypot(fpFx, fpFz);
          const ex = fpEx / Lside, ez = fpEz / Lside, fx = fpFx / Wside, fz = fpFz / Wside;
          const inL = Math.max(0.5, Lside * 0.12), inW = Math.max(0.5, Wside * 0.12);
          const innerPoly = (() => {
            const hw = Math.max(0.5, Lside / 2 - inL), hd = Math.max(0.5, Wside / 2 - inW);
            return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => ({
              x: +(fpCx + x * ex + z * fx).toFixed(3),
              z: +(fpCz + x * ez + z * fz).toFixed(3),
            }));
          })();
          // axis-aligned inner bounds used only for stair dimensions and stairCenter (axis variant fine)
          const inner = (() => {
            const xs = innerPoly.map(p => p.x), zs = innerPoly.map(p => p.z);
            return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
          })();
          const floorsN = Math.max(1, Math.floor(Number(b.floorsCount) || 1));
          const edge = b._accessEdge || null;
          const rooms = [];
          for (let s = 0; s < floorsN; s++) {
            rooms.push({ id: `${id}:r${s}`, type: s === 0 ? 'lobby' : 'room', floor: s, polygon: innerPoly });
          }
          // R4.3 §9.6: explicit entrance/door portal semantics to sidewalk/street on lobby (ground floor).
          // Portal is placed on the street-access facade edge; target must resolve to a valid adjacent road id (schema).
          const lobby = rooms[0];
          if (lobby && edge) {
            const portalY = +(Number.isFinite(Number(b.baseY)) ? Number(b.baseY) : 0).toFixed(3);
            let px = fpCx, pz = fpCz;
            if (edge === 'south') { px = (inner.minX + inner.maxX) / 2; pz = inner.minZ; }
            else if (edge === 'north') { px = (inner.minX + inner.maxX) / 2; pz = inner.maxZ; }
            else if (edge === 'west') { px = inner.minX; pz = (inner.minZ + inner.maxZ) / 2; }
            else if (edge === 'east') { px = inner.maxX; pz = (inner.minZ + inner.maxZ) / 2; }
            let bestRoadId = null, bestRoadD = Infinity;
            for (const seg of roadSegmentsPlan) {
              const pts = seg?.path;
              if (!seg?.id || !Array.isArray(pts)) continue;
              for (let i = 0; i + 5 < pts.length; i += 3) {
                const d = pointSegDistXZ(px, pz, pts[i], pts[i + 2], pts[i + 3], pts[i + 5]);
                if (d < bestRoadD) { bestRoadD = d; bestRoadId = seg.id; }
              }
            }
            if (bestRoadId && bestRoadD <= 40) {
              lobby.connections = [{
                target: bestRoadId,
                linkType: 'main_entrance',
                portalPosition: { x: +px.toFixed(3), y: portalY, z: +pz.toFixed(3) },
              }];
            }
          }
          // R4.3 §9.6: вход/лестница ближе к уличному фасаду (сторона доступа/тротуара), а не в геометрическом центре.
          const stairRise = Number.isFinite(Number(b.floorHeight)) && Number(b.floorHeight) > 0 ? Number(b.floorHeight) : 3.3;
          const stairLen = Math.max(3, Math.ceil((stairRise / 0.78 + 0.001) * 2) / 2);
          const innerW = Math.max(0.1, inner.maxX - inner.minX);
          const innerD = Math.max(0.1, inner.maxZ - inner.minZ);
          const margin = 0.75;
          let sx = fpCx, sz = fpCz;
          // offset inward from facade edge so stair body stays inside inner polygon
          const offZ = Math.min(innerD / 2 - 0.25, Math.max(stairLen / 2 + 0.5, innerD * 0.22));
          const offX = Math.min(innerW / 2 - 0.25, Math.max(stairLen / 2 + 0.5, innerW * 0.22));
          if (edge === 'south') sz = inner.minZ + Math.max(margin, offZ);
          else if (edge === 'north') sz = inner.maxZ - Math.max(margin, offZ);
          else if (edge === 'west') sx = inner.minX + Math.max(margin, offX);
          else if (edge === 'east') sx = inner.maxX - Math.max(margin, offX);
          // corner house: slight bias toward secondary corner edge to keep entrance near corner
          const cornerEdges = Array.isArray(b?._cornerAccess?.edges) ? b._cornerAccess.edges : null;
          if (cornerEdges && cornerEdges.length > 1) {
            if (cornerEdges.includes('west') && edge !== 'west') sx = inner.minX + Math.max(margin, Math.min(offX, innerW * 0.28));
            else if (cornerEdges.includes('east') && edge !== 'east') sx = inner.maxX - Math.max(margin, Math.min(offX, innerW * 0.28));
            if (cornerEdges.includes('south') && edge !== 'south') sz = inner.minZ + Math.max(margin, Math.min(offZ, innerD * 0.28));
            else if (cornerEdges.includes('north') && edge !== 'north') sz = inner.maxZ - Math.max(margin, Math.min(offZ, innerD * 0.28));
          }
          // clamp to inner bounds with stair footprint margin
          sx = clamp(sx, inner.minX + 1.2, inner.maxX - 1.2);
          sz = clamp(sz, inner.minZ + 1.2, inner.maxZ - 1.2);
          const stairsPos = { x: +sx.toFixed(3), z: +sz.toFixed(3) };
          // R4.3 §9.6: orient straight stair so its bottom/entry faces the street-access (sidewalk) side
          // and the run ascends inward. Local +X is ascent (bottom at X=0) in normalize-level toWorld.
          const stairEntryRot = (() => {
            if (edge === 'south') return 90;  // face south, ascend north (inward)
            if (edge === 'north') return 270; // face north, ascend south (inward)
            if (edge === 'west') return 0;    // face west, ascend east (inward)
            if (edge === 'east') return 180;  // face east, ascend west (inward)
            return snapYaw90(b.rotation ?? 0);
          })();
          const stairs = [];
          for (let s = 0; s + 1 < floorsN; s++) {
            stairs.push({ id: `${id}:s${s}_${s + 1}`, connectsFloors: [s, s + 1], type: 'straight', position: stairsPos, rotation: stairEntryRot, dimensions: { width: 2, length: stairLen } });
          }
          b.rooms = rooms;
          b.stairs = stairs;
        }
        ctx.report.diagnostics.push(info('enterable_share', stageId, 'enterable buildings share (section 9.8, target 15-25%)', { total: out.length, enterable: enterCount, share: out.length ? +(enterCount / out.length).toFixed(3) : 0, targetShare: +enterableTarget.toFixed(3), required: { min: Math.max(1, Math.ceil(out.length * 0.15)), max: Math.floor(out.length * 0.25) } }));
      }
      ctx.buildings = out;
    },
    repair(_ctx) {},
    emit(ctx) {
      // R3.5 (post-buildings, second pass): add only local/connector roads toward dense
      // buildings with poor access, without recalculating the transport frame.
      try {
        const stageId = '4_buildings_structures';
        const networks = ctx.networks?.roads;
        const segments = Array.isArray(networks?.segments) ? networks.segments : null;
        const nodes = Array.isArray(networks?.nodes) ? networks.nodes : null;
        const buildings = Array.isArray(ctx.buildings) ? ctx.buildings : [];
        const districts = Array.isArray(ctx.districts) ? ctx.districts : [];
        if (segments && nodes && segments.length && nodes.length && buildings.length && districts.length) {
          const size = ctx.meta?.worldBounds?.size ?? ctx.input?.ground?.size ?? 256;
          if (size >= 512) {
            const half = size / 2;
            const sampler = makeTerrainSampler(ctx);
            const rivers = ctx.hydrology?.rivers ?? ctx.input?.cityforge?.hydrology?.rivers ?? [];
            const waterBufferById = (() => {
              const src = Array.isArray(ctx.masks?.terrain?.waterBuffers) ? ctx.masks.terrain.waterBuffers
                : (Array.isArray(ctx.terrain?.analysis?.waterBuffers) ? ctx.terrain.analysis.waterBuffers : []);
              const byId = new Map();
              for (const w of src) if (w?.id) byId.set(w.id, w);
              return byId;
            })();
            const floodplainMasks = Array.isArray(ctx.masks?.terrain?.floodplains) ? ctx.masks.terrain.floodplains
              : (Array.isArray(ctx.terrain?.analysis?.floodplains) ? ctx.terrain.analysis.floodplains : []);
            const distPointSegXZ = (px, pz, ax, az, bx, bz) => {
              const abx = bx - ax, abz = bz - az, apx = px - ax, apz = pz - az;
              const ab2 = abx * abx + abz * abz || 1e-12;
              const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / ab2));
              return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
            };
            const minRoadDist = (x, z) => {
              let best = Infinity;
              for (const s of segments) {
                const pts = Array.isArray(s?.path) ? s.path : [];
                for (let i = 0; i + 1 < pts.length; i++) {
                  const a = pts[i], b = pts[i + 1];
                  if (!a || !b) continue;
                  best = Math.min(best, distPointSegXZ(x, z, a[0], a[2], b[0], b[2]));
                }
              }
              return best;
            };
            const nodePos = (n) => { const p = Array.isArray(n?.position) ? n.position : [0, 0, 0]; return { x: Number(p[0]) || 0, y: Number(p[1]) || 0, z: Number(p[2]) || 0 }; };
            const nearestNode = (x, z) => {
              let best = null, bestD = Infinity;
              for (const n of nodes) {
                if (n?.layer === 'elevated') continue;
                const p = nodePos(n);
                const d = Math.hypot(p.x - x, p.z - z);
                if (d < bestD) { bestD = d; best = n; }
              }
              return best ? { node: best, d: bestD } : null;
            };
            const usedSegIds = new Set(segments.map(s => s?.id).filter(Boolean));
            const usedNodeIds = new Set(nodes.map(n => n?.id).filter(Boolean));
            const uniqueSegId = (base) => { if (!usedSegIds.has(base)) { usedSegIds.add(base); return base; } let k = 2; while (usedSegIds.has(`${base}_${k}`)) k++; const id = `${base}_${k}`; usedSegIds.add(id); return id; };
            const uniqueNodeId = (base) => { if (!usedNodeIds.has(base)) { usedNodeIds.add(base); return base; } let k = 2; while (usedNodeIds.has(`${base}_${k}`)) k++; const id = `${base}_${k}`; usedNodeIds.add(id); return id; };
            const edgeExists = (a, b) => segments.some(s => (s.from === a && s.to === b) || (s.from === b && s.to === a));
            const ensureRoadIndex = () => {
              ctx.spatial = ctx.spatial || {};
              if (ctx.spatial.roadEasements && typeof ctx.spatial.roadEasements.insert === 'function') return ctx.spatial.roadEasements;
              const idx = createSpatialIndex(ctx.meta.worldBounds ?? { size });
              for (const r of (ctx.masks?.easement?.roads ?? [])) idx.insert(r);
              ctx.spatial.roadEasements = idx;
              return idx;
            };
            const syncSegment = (seg) => {
              let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
              for (const pt of (seg.path || [])) { minX = Math.min(minX, pt[0]); maxX = Math.max(maxX, pt[0]); minZ = Math.min(minZ, pt[2]); maxZ = Math.max(maxZ, pt[2]); }
              const eas = { id: seg.id, minX, maxX, minZ, maxZ, width: (Array.isArray(seg?.lanes) && seg.lanes[0]?.width) ? seg.lanes[0].width : 6 };
              if (!ctx.masks.easement) ctx.masks.easement = { rivers: [], roads: [] };
              ctx.masks.easement.roads = ctx.masks.easement.roads || [];
              ctx.masks.easement.roads.push(eas);
              ensureRoadIndex().insert(eas);
            };
            const getOrCreateNodeAt = (x, y, z, baseId) => {
              let n = nodes.find(nn => nn.layer !== 'elevated' && Math.hypot(nn.position[0] - x, nn.position[2] - z) < 0.5);
              if (!n) { n = { id: uniqueNodeId(baseId), position: [Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.round(z * 100) / 100], layer: 'ground' }; nodes.push(n); }
              return n;
            };
            const districtById = new Map(districts.map(d => [d.id, d]));
            const bCenter = (b) => {
              const fp = Array.isArray(b?.footprint) ? b.footprint : [];
              let sx = 0, sz = 0, n = 0;
              for (const p of fp) { const x = Number(p?.x ?? p?.[0]), z = Number(p?.z ?? p?.[2] ?? p?.[1]); if (Number.isFinite(x) && Number.isFinite(z)) { sx += x; sz += z; n++; } }
              return n ? { x: sx / n, z: sz / n } : null;
            };
            const targets = [];
            for (const b of buildings) {
              const bc = bCenter(b);
              if (!bc) continue;
              const d = districtById.get(b.districtId) || null;
              const pressure = Number(d?.pressure) || 0;
              if (pressure < 0.4) continue;
              const rd = minRoadDist(bc.x, bc.z);
              if (rd < 85) continue;
              targets.push({ id: b.id, x: bc.x, z: bc.z, rd, pressure, type: b.districtType || d?.type || null });
            }
            targets.sort((a, b) => (b.pressure - a.pressure) || (b.rd - a.rd) || String(a.id).localeCompare(String(b.id)));
            const picked = [];
            for (const t of targets) {
              if (picked.some(p => Math.hypot(p.x - t.x, p.z - t.z) < 40)) continue;
              picked.push(t);
              if (picked.length >= 24) break;
            }
            let added = 0;
            const budget = 12;
            for (const t of picked) {
              if (added >= budget) break;
              const near = nearestNode(t.x, t.z);
              if (!near || near.d < 20) continue;
              const fp = nodePos(near.node);
              const dx = t.x - fp.x, dz = t.z - fp.z;
              const adx = Math.abs(dx), adz = Math.abs(dz);
              if (adx < 8 && adz < 8) continue;
              const step = Math.min(70, Math.max(35, Math.min(near.d, t.rd) - 20));
              const sx = Math.sign(dx) || 1, sz = Math.sign(dz) || 1;
              const routes = [];
              if (adx >= adz) routes.push([[fp.x + sx * Math.min(step, adx), fp.z], [fp.x + sx * Math.min(step, adx), fp.z + sz * Math.min(40, adz)]]);
              else routes.push([[fp.x, fp.z + sz * Math.min(step, adz)], [fp.x + sx * Math.min(40, adx), fp.z + sz * Math.min(step, adz)]]);
              routes.push([[fp.x + sx * Math.min(step, adx), fp.z]]);
              routes.push([[fp.x, fp.z + sz * Math.min(step, adz)]]);
              let placed = false;
              for (const route of routes) {
                if (placed) break;
                let from = near.node;
                const legs = [];
                let ok = true;
                for (let i = 0; i < route.length; i++) {
                  const [txRaw, tzRaw] = route[i];
                  const tx = Math.round(clamp(txRaw, -half + 6, half - 6) * 100) / 100;
                  const tz = Math.round(clamp(tzRaw, -half + 6, half - 6) * 100) / 100;
                  const fromP = nodePos(from);
                  if (Math.abs(tx - fromP.x) > 0.01 && Math.abs(tz - fromP.z) > 0.01) { ok = false; break; }
                  if (Math.hypot(tx - fromP.x, tz - fromP.z) < 12) { ok = false; break; }
                  let path;
                  try { path = buildAxisAlignedTerrainPath(fromP.x, fromP.z, tx, tz, sampler, rivers, 12); } catch { ok = false; break; }
                  if (!path || !isValidAxisAlignedTerrainPath(path, rivers, waterBufferById, { includeFloodplain: true, floodplainMasks })) { ok = false; break; }
                  const end = path[path.length - 1];
                  const toNode = getOrCreateNodeAt(end[0], end[1], end[2], `tr_postb_n_${added + 1}`);
                  if (edgeExists(from.id, toNode.id)) { ok = false; break; }
                  const segId = uniqueSegId(`tr_postb_${added + 1}`);
                  const seg = makeRoadSegment(segId, from.id, toNode.id, path, 6, 'local');
                  legs.push({ seg, toNode });
                  from = toNode;
                }
                if (!ok) continue;
                for (const leg of legs) { segments.push(leg.seg); syncSegment(leg.seg); }
                added += 1;
                placed = true;
              }
            }
            if (added > 0) {
              // keep ctx.input in sync with mutated networks (compile/build uses ctx.engine/input)
              if (ctx.input?.cityforge?.networks) ctx.input.cityforge.networks.roads = { nodes, segments };
              ctx.report.diagnostics.push(info('post_buildings_local_connectors', stageId, 'added local connector segments after building placement (R3.5)', { added, candidates: picked.length }));
            }
          }
        }
      } catch (e) {
        ctx.report.diagnostics.push(warn('post_buildings_local_connectors_failed', stageId, `post-buildings connector pass failed: ${e?.message || e}`));
      }

      // Emit into source so compileCityforge/build pipeline can pass buildings through.
      // Strip internal/transient refs to keep schema compatibility.
      const emitBuildings = (ctx.buildings ?? []).map(b => {
        if (!b || typeof b !== 'object') return b;
        const { districtId: _districtId, districtType: _districtType, _accessEdge, _cornerAccess, ...rest } = b;
        return rest;
      });
      // also clean transient fields from ctx.buildings (kept for downstream spatial/indexing in this run)
      for (const b of (ctx.buildings ?? [])) {
        if (b && typeof b === 'object') { delete b._accessEdge; delete b._cornerAccess; }
      }
      if (!Array.isArray(ctx.input.buildings) || ctx.input.buildings.length === 0) {
        ctx.input.buildings = emitBuildings;
      } else if (emitBuildings.length) {
        ctx.input.buildings = emitBuildings;
      }
      // Spatial index for building footprints (TASK-002), additive for downstream queries.
      ctx.spatial = ctx.spatial || {};
      const bIdx = createSpatialIndex(ctx.meta.worldBounds ?? { size: ctx.input?.ground?.size ?? 256 });
      for (const b of (ctx.buildings ?? [])) {
        if (!Array.isArray(b?.footprint)) continue;
        const a = aabbOfFootprint(b.footprint);
        if (Number.isFinite(a.minX)) bIdx.insert({ id: b.id ?? null, ...a });
      }
      ctx.spatial.buildings = bIdx;
      ctx.engine = ctx.input;
    },
  };
}
