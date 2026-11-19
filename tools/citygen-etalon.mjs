#!/usr/bin/env node
/**
 * R0.4/R6.3/R6.4 helper: deterministic etalon/batch snapshots for city profiles.
 *
 * Generates synthetic v4 levels for (profile × seed) combinations, runs citygen,
 * and records per-run hashes/metrics plus an aggregate summary.
 *
 * Usage:
 *   node tools/citygen-etalon.mjs [--out <dir>] [--profiles p1,p2,...] [--seeds n1,n2,n3] [--generatorVersion v] [--size N] [--chunk N]
 * Defaults: profiles river_trade,hill_town,railway_industrial; seeds 101,202,303; generatorVersion 0.1.0.
 * Writes (when --out): <profile>-seed<seed>.json, summary.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { runCitygen } from './citygen/index.mjs';
import { DEFAULT_CITY_PROFILES, DEFAULT_GENERATOR_VERSION } from './citygen/config.mjs';

function parseList(v) { return String(v || '').split(',').map(s => s.trim()).filter(Boolean); }
function parseNums(v) { return parseList(v).map(x => Number(x)).filter(n => Number.isFinite(n)); }

const args = process.argv.slice(2);
let outDir = null;
let profiles = ['river_trade', 'hill_town', 'railway_industrial'];
let seeds = [101, 202, 303];
let generatorVersion = DEFAULT_GENERATOR_VERSION;
let size = 1280;
let chunk = 256;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const take = () => args[++i];
  if (a === '--out') outDir = take();
  else if (a.startsWith('--out=')) outDir = a.slice('--out='.length);
  else if (a === '--profiles') profiles = parseList(take());
  else if (a.startsWith('--profiles=')) profiles = parseList(a.slice('--profiles='.length));
  else if (a === '--seeds') seeds = parseNums(take());
  else if (a.startsWith('--seeds=')) seeds = parseNums(a.slice('--seeds='.length));
  else if (a === '--generatorVersion') generatorVersion = String(take() ?? generatorVersion);
  else if (a.startsWith('--generatorVersion=')) generatorVersion = a.slice('--generatorVersion='.length) || generatorVersion;
  else if (a === '--size') size = Number(take()) || size;
  else if (a.startsWith('--size=')) size = Number(a.slice('--size='.length)) || size;
  else if (a === '--chunk') chunk = Number(take()) || chunk;
  else if (a.startsWith('--chunk=')) chunk = Number(a.slice('--chunk='.length)) || chunk;
}

if (outDir) mkdirSync(resolve(outDir), { recursive: true });

function makeSynthetic(profileId, seed) {
  const prof = DEFAULT_CITY_PROFILES[profileId];
  return {
    schemaVersion: 4,
    $schema: './level-v4.schema.json',
    metadata: { levelName: `etalon-${profileId}-${seed}` },
    ground: { size, y: 0 },
    stream: { chunk, keep: 1, aheadMin: 200, aheadMax: 900, budgetMs: 120 },
    cityforge: {},
    generator: {
      generatorVersion,
      seed,
      deterministic: true,
      profile: profileId,
      stages: [
        { id: 'terrain', enabled: true },
        { id: 'hydrology', enabled: true },
        { id: 'settlement', enabled: true },
        { id: 'roads', enabled: true },
        { id: 'parcels', enabled: true },
        { id: 'buildings', enabled: true },
        { id: 'finish', enabled: true },
      ],
      landscape: { generate: true, profileDriven: true },
      transport: { generate: false },
    },
    gameplay: {
      spawn: { x: 0, z: 0 },
      exit: { x: Math.min(100, size / 4), z: Math.min(100, size / 4) },
    },
  };
}

const runs = [];
for (const profileId of profiles) {
  for (const seed of seeds) {
    const raw = makeSynthetic(profileId, seed);
    const r = runCitygen(raw);
    const hash = createHash('sha256').update(r.reportJson).digest('hex');
    const m = r.report.metrics ?? {};
    const run = {
      profile: profileId,
      seed,
      generatorVersion,
      reportHash: hash,
      summary: r.report.summary ?? null,
      rules: r.report.rules?.summary ?? null,
      metrics: {
        partial: m.partial ?? true,
        counts: m.counts ?? null,
        graph: m.graph ?? null,
        roads: m.roads ?? null,
        gameplay: m.gameplay ?? null,
        districts: m.districts ?? null,
        terrain: m.terrain ?? null,
        parcels: m.parcels ?? null,
        landmarkVisibility: m.landmarkVisibility ?? null,
        blockDensityCorrelation: m.blockDensityCorrelation ?? null,
        chunkBuild: m.chunkBuild ?? null,
      },
    };
    runs.push(run);
    console.log(JSON.stringify(run));
    if (outDir) {
      const name = `${profileId}-seed${seed}.json`;
      writeFileSync(join(resolve(outDir), name), JSON.stringify(run, null, 2).replace(/\r\n/g, '\n') + '\n', 'utf8');
    }
  }
}

function agg(nums) {
  const a = nums.filter(n => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const sum = a.reduce((s, n) => s + n, 0);
  return { count: a.length, min: a[0], max: a[a.length - 1], mean: +(sum / a.length).toFixed(6) };
}

const byProfile = {};
for (const p of profiles) {
  const rs = runs.filter(r => r.profile === p);
  byProfile[p] = {
    runs: rs.length,
    hashes: rs.map(r => r.reportHash),
    errors: agg(rs.map(r => r.summary?.errors ?? 0)),
    warnings: agg(rs.map(r => r.summary?.warnings ?? 0)),
    roads: agg(rs.map(r => r.metrics?.counts?.roads ?? 0)),
    parcels: agg(rs.map(r => r.metrics?.counts?.parcels ?? 0)),
    buildings: agg(rs.map(r => r.metrics?.counts?.buildings ?? 0)),
  };
}
const summary = {
  generatorVersion,
  profiles,
  seeds,
  runs: runs.length,
  deterministic: true,
  byProfile,
};
if (outDir) {
  writeFileSync(join(resolve(outDir), 'summary.json'), JSON.stringify(summary, null, 2).replace(/\r\n/g, '\n') + '\n', 'utf8');
}
console.log(JSON.stringify({ summary }));
