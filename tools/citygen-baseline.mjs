#!/usr/bin/env node
/**
 * R0.2/R0.4 helper: reproducible citygen rules/metrics snapshot for v4 source levels.
 * Usage: node tools/citygen-baseline.mjs [level.json ...]
 * Default: src/levels/level-16.json 17 18 19
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runCitygen } from './citygen/index.mjs';

const defaults = [16, 17, 18, 19].map(n => `src/levels/level-${n}.json`);
const files = process.argv.slice(2).length ? process.argv.slice(2) : defaults;

for (const file of files) {
  const abs = resolve(file);
  const raw = JSON.parse(readFileSync(abs, 'utf8'));
  const r = runCitygen(raw);
  const m = r.report.metrics ?? null;
  const ru = r.report.rules ?? null;
  const out = {
    file,
    levelName: raw?.metadata?.levelName ?? null,
    generator: r.report.generator ?? null,
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
      stream: m.stream,
    } : null,
  };
  console.log(JSON.stringify(out));
}
