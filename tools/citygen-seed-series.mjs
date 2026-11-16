#!/usr/bin/env node
/**
 * R6.3: deterministic seed-series validation for citygen profiles.
 *
 * Runs synthetic v4 generation for (profile × seed) combinations, verifies
 * determinism (two runs per seed → identical report hash), aggregates summary/
 * rules/metrics, and reports hard failures (errors, non-determinism).
 *
 * Usage:
 *   node tools/citygen-seed-series.mjs [--profiles p1,p2,...] [--seeds n1,n2,...]
 *     [--count N] [--start N] [--generatorVersion v] [--size N] [--chunk N]
 *     [--transport] [--out <dir>] [--json]
 *
 * Defaults: profiles river_trade,hill_town,railway_industrial; seeds 1..20
 * (or --count/--start); generatorVersion from config; transport disabled.
 * When --out is set writes per-run JSON (<profile>-seed<seed>.json) and
 * series-summary.json. Exits 1 on hard failures (errors/non-determinism).
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
let seeds = null;
let count = 20;
let start = 1;
let generatorVersion = DEFAULT_GENERATOR_VERSION;
let size = 1280;
let chunk = 256;
let transport = false;
let jsonOut = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const take = () => args[++i];
  if (a === '--out') outDir = take();
  else if (a.startsWith('--out=')) outDir = a.slice('--out='.length);
  else if (a === '--profiles') profiles = parseList(take());
  else if (a.startsWith('--profiles=')) profiles = parseList(a.slice('--profiles='.length));
  else if (a === '--seeds') seeds = parseNums(take());
  else if (a.startsWith('--seeds=')) seeds = parseNums(a.slice('--seeds='.length));
  else if (a === '--count') count = Math.max(1, Math.floor(Number(take()) || count));
  else if (a.startsWith('--count=')) count = Math.max(1, Math.floor(Number(a.slice('--count='.length)) || count));
  else if (a === '--start') start = Math.floor(Number(take()) || start);
  else if (a.startsWith('--start=')) start = Math.floor(Number(a.slice('--start='.length)) || start);
  else if (a === '--generatorVersion') generatorVersion = String(take() ?? generatorVersion);
  else if (a.startsWith('--generatorVersion=')) generatorVersion = a.slice('--generatorVersion='.length) || generatorVersion;
  else if (a === '--size') size = Number(take()) || size;
  else if (a.startsWith('--size=')) size = Number(a.slice('--size='.length)) || size;
  else if (a === '--chunk') chunk = Number(take()) || chunk;
  else if (a.startsWith('--chunk=')) chunk = Number(a.slice('--chunk='.length)) || chunk;
  else if (a === '--transport') transport = true;
  else if (a === '--no-transport') transport = false;
  else if (a === '--json') jsonOut = true;
}

if (!seeds || !seeds.length) {
  seeds = Array.from({ length: count }, (_, i) => start + i);
}
if (outDir) mkdirSync(resolve(outDir), { recursive: true });

function makeSynthetic(profileId, seed) {
  return {
    schemaVersion: 4,
    $schema: './level-v4.schema.json',
    metadata: { levelName: `series-${profileId}-${seed}` },
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
      transport: { generate: !!transport },
    },
    gameplay: {
      spawn: { x: 0, z: 0 },
      exit: { x: Math.min(100, size / 4), z: Math.min(100, size / 4) },
    },
  };
}

function agg(nums) {
  const a = nums.filter(n => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const sum = a.reduce((s, n) => s + n, 0);
  const mean = sum / a.length;
  const mid = Math.floor(a.length / 2);
  const median = a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  const p = (q) => a[Math.min(a.length - 1, Math.max(0, Math.ceil(q * a.length) - 1))];
  return { count: a.length, min: a[0], max: a[a.length - 1], mean: +mean.toFixed(6), median: +median.toFixed(6), p95: +p(0.95).toFixed(6) };
}

const runs = [];
let hardFailures = 0;

for (const profileId of profiles) {
  if (!DEFAULT_CITY_PROFILES[profileId]) {
    console.error(`unknown profile: ${profileId}`);
    hardFailures++;
    continue;
  }
  for (const seed of seeds) {
    const raw = makeSynthetic(profileId, seed);
    let r1, r2;
    try {
      r1 = runCitygen(structuredClone(raw));
      r2 = runCitygen(structuredClone(raw));
    } catch (e) {
      hardFailures++;
      const fail = { profile: profileId, seed, generatorVersion, error: String(e?.stack || e) };
      runs.push(fail);
      console.error(`FAIL ${profileId} seed=${seed}: exception ${e?.message || e}`);
      continue;
    }
    const h1 = createHash('sha256').update(r1.reportJson).digest('hex');
    const h2 = createHash('sha256').update(r2.reportJson).digest('hex');
    const deterministic = h1 === h2;
    const m = r1.report.metrics ?? {};
    const run = {
      profile: profileId,
      seed,
      generatorVersion,
      deterministic,
      reportHash: h1,
      summary: r1.report.summary ?? null,
      rules: r1.report.rules?.summary ?? null,
      metrics: {
        partial: m.partial ?? true,
        counts: m.counts ?? null,
        graph: m.graph ?? null,
        roads: m.roads ?? null,
        gameplay: m.gameplay ?? null,
        terrain: m.terrain ?? null,
        parcels: m.parcels ?? null,
        stream: m.stream ?? null,
      },
    };
    const errors = run.summary?.errors ?? 0;
    const ruleErrors = run.rules?.errors ?? 0;
    if (!deterministic || errors > 0 || ruleErrors > 0) {
      hardFailures++;
      console.error(`FAIL ${profileId} seed=${seed}: deterministic=${deterministic} errors=${errors} ruleErrors=${ruleErrors} hash=${h1}`);
    } else {
      const msg = `OK ${profileId} seed=${seed} hash=${h1} warn=${run.summary?.warnings ?? 0} drops=${run.summary?.drops ?? 0}`;
      if (!jsonOut) console.log(msg);
    }
    runs.push(run);
    if (outDir) {
      writeFileSync(join(resolve(outDir), `${profileId}-seed${seed}.json`), JSON.stringify(run, null, 2).replace(/\r\n/g, '\n') + '\n', 'utf8');
    }
  }
}

const byProfile = {};
for (const p of profiles) {
  const rs = runs.filter(r => r.profile === p && !r.error);
  const detOk = rs.filter(r => r.deterministic).length;
  const errRuns = rs.filter(r => (r.summary?.errors ?? 0) > 0 || (r.rules?.errors ?? 0) > 0).length;
  byProfile[p] = {
    runs: rs.length,
    deterministicOk: detOk,
    errorRuns: errRuns,
    warningRuns: rs.filter(r => (r.summary?.warnings ?? 0) > 0).length,
    dropsRuns: rs.filter(r => (r.summary?.drops ?? 0) > 0).length,
    hashesUnique: new Set(rs.map(r => r.reportHash)).size,
    errors: agg(rs.map(r => r.summary?.errors ?? 0)),
    warnings: agg(rs.map(r => r.summary?.warnings ?? 0)),
    repairs: agg(rs.map(r => r.summary?.repairs ?? 0)),
    drops: agg(rs.map(r => r.summary?.drops ?? 0)),
    ruleErrors: agg(rs.map(r => r.rules?.errors ?? 0)),
    ruleWarnings: agg(rs.map(r => r.rules?.warnings ?? 0)),
    roads: agg(rs.map(r => r.metrics?.counts?.roads ?? 0)),
    parcels: agg(rs.map(r => r.metrics?.counts?.parcels ?? 0)),
    buildings: agg(rs.map(r => r.metrics?.counts?.buildings ?? 0)),
    enterableBuildings: agg(rs.map(r => r.metrics?.counts?.enterableBuildings ?? 0)),
    props: agg(rs.map(r => r.metrics?.counts?.props ?? 0)),
    deadEndRatio: agg(rs.map(r => r.metrics?.graph?.deadEndRatio ?? NaN)),
    gamma: agg(rs.map(r => r.metrics?.graph?.gamma ?? NaN)),
  };
}

const summary = {
  generatorVersion,
  profiles,
  seeds,
  seedCount: seeds.length,
  runs: runs.length,
  hardFailures,
  transport,
  byProfile,
};

if (outDir) {
  writeFileSync(join(resolve(outDir), 'series-summary.json'), JSON.stringify(summary, null, 2).replace(/\r\n/g, '\n') + '\n', 'utf8');
}
if (jsonOut) console.log(JSON.stringify(summary, null, 2));
else {
  console.log('\nSeries summary:');
  console.log(JSON.stringify(summary, null, 2));
}

if (hardFailures > 0) process.exit(1);
