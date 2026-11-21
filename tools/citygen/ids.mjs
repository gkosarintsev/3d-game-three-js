/**
 * Stable, deterministic ids for citygen artifacts (ADR-001).
 */
import { mix } from './rng.mjs';

export function stableId(...parts) {
  return parts.map(p => String(p ?? '')).join('_');
}

export function stageSubseed(seed, stage, districtId = '', chunkY = 0, chunkX = 0, slotId = '', attempt = 0) {
  return mix(seed, stage, districtId, chunkY, chunkX, slotId, attempt);
}

/** Deterministic sort key: by id (codepoint, locale-independent). */
export function byId(a, b) {
  const aa = String(a?.id ?? '');
  const bb = String(b?.id ?? '');
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}
