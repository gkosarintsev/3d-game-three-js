/**
 * R1.2/R5.2: shared deterministic terrain height sampler for citygen analysis.
 * Extracted from stage-1-landscape so read-only metrics (rules.mjs, visibility)
 * can sample the exact same analytic height field the generator reasons about.
 * Deterministic: depends only on baseY + modifier list (mountain/valley, smooth ease).
 */
const EPS = 1e-9;

export function hillContribution(mod, x, z) {
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

export function terrainHeightAt(x, z, baseY, modifiers = []) {
  let y = Number.isFinite(baseY) ? baseY : 0;
  for (const m of modifiers) y += hillContribution(m, x, z);
  return y;
}
