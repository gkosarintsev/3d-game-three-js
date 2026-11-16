/**
 * R2.2/§7.2: детерминированный A* (cost-path) поиск оси городской сети.
 *
 * Сетка — квадратные клетки со стороной `step` (по умолчанию 12 м, как SAMPLE_STEP).
 * Стоимость перехода в 4-соседство (вверх/вниз/лево/право):
 *
 *   c = len * (1 + kSlope * slope^2)   where len = step, slope = |Δheight|/len
 *
 * slope > 0.3005 — соседнее ребро недопустимо (абсолютный предел §3.5).
 * Переходы через/рядом с рекой (ближе half-width + buffer) запрещаются: для обычной
 * грунтовой дороги вода — запретное русло; мосты генерируются отдельно (R2.6).
 *
 * Результат — массив точек [x, y, z] мировых координат; всегда монотонный по XZ-порядку
 * (ось-параллельные звенья). Детерминирован: эвристика = Манхэттен × len (допустим,
 * т.к. стоимость ребра ≥ len); tie-break по (cost+heuristic, x, z, index) — всегда один
 * и тот же путь при одинаковых весах.
 */

const EPS = 1e-9;

function riverMinDistXZ(px, pz, rivers) {
  let best = Infinity;
  for (const rv of rivers) {
    const pathPts = Array.isArray(rv?.path) ? rv.path : [];
    for (let i = 0; i + 1 < pathPts.length; i++) {
      const axp = pathPts[i], bxp = pathPts[i + 1];
      const dx = bxp[0] - axp[0], dz = bxp[2] - axp[2];
      const len2 = dx * dx + dz * dz;
      let t = 0;
      if (len2 > EPS) {
        t = ((px - axp[0]) * dx + (pz - axp[2]) * dz) / len2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
      }
      const x = axp[0] + t * dx, z = axp[2] + t * dz;
      const d2 = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (d2 < best) best = d2;
    }
  }
  return Math.sqrt(best);
}

function riverCrossingOffer(ax, az, bx, bz, rivers) {
  const margin = 8;
  const samples = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 6));
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
    for (const rv of rivers) {
      const hw = (Number(rv?.width) || 10) * 0.5 + margin;
      // reuse riverMinDistXZ for the specific river by checking all — cheap enough on small grids
      const d = riverMinDistXZ(px, pz, [rv]);
      if (d < hw) return true;
    }
  }
  return false;
}

export function findAxisCostPath({
  from,
  to,
  sampler,
  rivers = [],
  gridStep = 12,
  searchMargin = 192,
  slopeK = 6,
  maxVisited = 200000,
}) {
  if (!sampler || typeof sampler.heightAt !== 'function') return { points: null, cost: Infinity, visited: 0, failure: 'no_sampler' };
  if (!from || !to) return { points: null, cost: Infinity, visited: 0, failure: 'missing_endpoints' };
  const sx = Math.round(Number(from.x) / gridStep);
  const sz = Math.round(Number(from.z) / gridStep);
  const tx = Math.round(Number(to.x) / gridStep);
  const tz = Math.round(Number(to.z) / gridStep);
  const expand = Math.max(24, Math.ceil(searchMargin / gridStep));
  const minIx = Math.floor(Math.min(sx, tx) - expand);
  const maxIx = Math.ceil(Math.max(sx, tx) + expand);
  const minIz = Math.floor(Math.min(sz, tz) - expand);
  const maxIz = Math.ceil(Math.max(sz, tz) + expand);
  const width = Math.max(1, maxIx - minIx + 1);
  const gridSize = Math.max(1, maxIz - minIz + 1) * width;
  const idx = (ix, iz) => (iz - minIz) * width + (ix - minIx);
  const yAt = (ix, iz) => sampler.heightAt(ix * gridStep, iz * gridStep);
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const dist = new Float64Array(gridSize).fill(Infinity);
  const prev = new Int32Array(gridSize).fill(-1);
  const visited = new Uint8Array(gridSize);
  const start = idx(sx, sz);
  const target = idx(tx, tz);

  // Binary min-heap keyed by (cost, tieBreak)
  const heap = [];
  const hEst = (ix, iz) => (Math.abs(ix - tx) + Math.abs(iz - tz)) * gridStep;
  const heapLess = (a, b) => (a[0] - b[0]) || (a[1] - b[1]);
  const pushHeap = (node, f) => {
    heap.push([f, node]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapLess(heap[p], heap[i]) <= 0) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const popHeap = () => {
    if (!heap.length) return null;
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      while (true) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heapLess(heap[l], heap[m]) < 0) m = l;
        if (r < heap.length && heapLess(heap[r], heap[m]) < 0) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  dist[start] = 0;
  pushHeap(start, hEst(sx, sz));
  let explored = 0;
  while (heap.length) {
    const [f, u] = popHeap();
    if (visited[u]) continue;
    visited[u] = 1;
    explored++;
    if (u === target) break;
    if (explored > maxVisited) return { points: null, cost: Infinity, visited: explored, failure: 'search_budget' };
    const ux = (u % width) + minIx;
    const uz = Math.floor(u / width) + minIz;
    const uxF = ux * gridStep, uzF = uz * gridStep;
    const uy = yAt(ux, uz);
    for (const [dx, dz] of neighbors) {
      const vx = ux + dx, vz = uz + dz;
      if (vx < minIx || vz < minIz || vx > maxIx || vz > maxIz) continue;
      const v = idx(vx, vz);
      if (visited[v]) continue;
      const vxF = vx * gridStep, vzF = vz * gridStep;
      const vy = yAt(vx, vz);
      const dXZ = gridStep;
      const dy = vy - uy;
      const slope = Math.abs(dy) / dXZ;
      if (slope > 0.3005) continue;
      if (riverCrossingOffer(uxF, uzF, vxF, vzF, rivers)) continue;
      const w = dXZ * (1 + slopeK * slope * slope);
      const nd = dist[u] + w;
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
        pushHeap(v, nd + hEst(vx, vz));
      }
    }
  }
  if (target !== start && prev[target] === -1) return { points: null, cost: Infinity, visited: explored, failure: 'unreachable' };
  const gridPts = [];
  let cur = target;
  while (true) {
    gridPts.push(cur);
    if (cur === start) break;
    cur = prev[cur];
    if (cur === -1) return { points: null, cost: Infinity, visited: explored, failure: 'reconstruct_failed' };
  }
  gridPts.reverse();
  const points = gridPts.map(u => {
    const ix = (u % width) + minIx;
    const iz = Math.floor(u / width) + minIz;
    return [Math.round(ix * gridStep * 100) / 100, Math.round(yAt(ix, iz) * 100) / 100, Math.round(iz * gridStep * 100) / 100];
  });
  return { points, cost: +dist[target].toFixed(3), visited: explored, failure: null };
}
