#!/usr/bin/env node
/**
 * R0.2/R0.4 helper: reproducible citygen rules/metrics snapshot for v4 source levels.
 * Usage:
 *   node tools/citygen-baseline.mjs [--out <dir>] [level.json ...]
 * Default: src/levels/level-16.json 17 18 19
 * With --out, writes deterministic JSON snapshot per level: <basename>.citygen-baseline.json
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { createHash } from 'node:crypto';
import { runCitygen } from './citygen/index.mjs';

const args = process.argv.slice(2);
let outDir = null;
const filesArg = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') { outDir = args[++i] ?? null; continue; }
  if (a.startsWith('--out=')) { outDir = a.slice('--out='.length); continue; }
  filesArg.push(a);
}
const defaults = [16, 17, 18, 19].map(n => `src/levels/level-${n}.json`);
const files = filesArg.length ? filesArg : defaults;
if (outDir) mkdirSync(resolve(outDir), { recursive: true });

for (const file of files) {
  const abs = resolve(file);
  const raw = JSON.parse(readFileSync(abs, 'utf8'));
  const r = runCitygen(raw);
  const m = r.report.metrics ?? null;
  const ru = r.report.rules ?? null;
  const hash = createHash('sha256').update(r.reportJson).digest('hex');
  const out = {
    file,
    levelName: raw?.metadata?.levelName ?? null,
    generator: r.report.generator ?? null,
    reportHash: hash,
    stages: (r.report.stages ?? []).length,
    summary: r.report.summary ?? null,
    rules: ru?.summary ?? null,
    metrics: m ? {
      partial: m.partial,
      counts: m.counts,
      graph: m.graph,
      roads: m.roads,
      gameplay: m.gameplay,
      districts: m.districts,
      parcels: m.parcels ?? null,
      terrain: m.terrain ?? null,
      stream: m.stream,
    } : null,
  };
  const line = JSON.stringify(out);
  console.log(line);
  if (outDir) {
    const name = basename(file).replace(/\.json$/i, '') + '.citygen-baseline.json';
    writeFileSync(join(resolve(outDir), name), line + '\n', 'utf8');
  }
}
