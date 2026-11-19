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
 *     [--transport] [--out <dir>] [--json] [--single-run] [--fail-fast] [--quiet]
 *     [--concurrency N]
 *
 * Defaults: profiles river_trade,hill_town,railway_industrial; seeds 1..20
 * (or --count/--start); generatorVersion from config; transport disabled.
 * When --out is set writes per-run JSON (<profile>-seed<seed>.json) and
 * series-summary.json. Exits 1 on hard failures (errors/non-determinism).
 *
 * Speed-up options (partial checks, not a full regression replacement):
 *   --single-run    run once per seed (skip 2nd determinism pass/hash compare)
 *   --fail-fast     stop at first hard failure
 *   --quiet         suppress per-seed OK lines (summary still printed unless --json)
 *   --concurrency N run up to N seeds in parallel via worker threads (default: 1)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { isMainThread, parentPort, workerData, Worker } from 'node:worker_threads';
import { runCitygen } from './citygen/index.mjs';
import { DEFAULT_CITY_PROFILES, DEFAULT_GENERATOR_VERSION } from './citygen/config.mjs';

function makeSynthetic(profileId, seed, opts) {
  const { size, chunk, generatorVersion, transport } = opts;
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

function executeTask(task) {
  const startedMs = Date.now();
  const { profileId, seed, generatorVersion, singleRun, opts } = task;
  const raw = makeSynthetic(profileId, seed, opts);
  let r1, r2 = null;
  try {
    r1 = runCitygen(structuredClone(raw));
    if (!singleRun) r2 = runCitygen(structuredClone(raw));
  } catch (e) {
    return { profile: profileId, seed, generatorVersion, determinismChecked: !singleRun, error: String(e?.stack || e), _exception: true, durationMs: Date.now() - startedMs };
  }
  const h1 = createHash('sha256').update(r1.reportJson).digest('hex');
  const h2 = r2 ? createHash('sha256').update(r2.reportJson).digest('hex') : h1;
  const deterministic = singleRun ? null : h1 === h2;
  const m = r1.report.metrics ?? {};
  const rhoDiag = (r1.report.diagnostics || []).find(d => d?.code === 'pressure_area_spearman');
  const rho = Number.isFinite(Number(rhoDiag?.rho)) ? Number(rhoDiag.rho) : null;
  const softTargetViolations = (r1.report.rules?.violations || []).filter(v => v?.code === 'soft_target_out_range');
  const softTargets = {
    count: softTargetViolations.length,
    metrics: Array.from(new Set(softTargetViolations.map(v => String(v?.metric ?? v?.extra?.metric ?? 'unknown')).filter(Boolean))).sort(),
  };
  return {
    profile: profileId,
    seed,
    generatorVersion,
    determinismChecked: !singleRun,
    deterministic: singleRun ? null : deterministic,
    reportHash: h1,
    rho,
    rhoOk: rho != null ? rho >= 0.6 : null,
    summary: r1.report.summary ?? null,
    rules: r1.report.rules?.summary ?? null,
    softTargets,
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
    durationMs: Date.now() - startedMs,
  };
}

if (!isMainThread) {
  try {
    const result = executeTask(workerData);
    parentPort.postMessage({ ok: true, result });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: String(e?.stack || e) });
  }
} else {

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
let singleRun = false;
let failFast = false;
let quiet = false;
let concurrency = 1;
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
  else if (a === '--single-run' || a === '--no-determinism-check') singleRun = true;
  else if (a === '--fail-fast') failFast = true;
  else if (a === '--quiet') quiet = true;
  else if (a === '--concurrency') concurrency = Math.max(1, Math.floor(Number(take()) || 1));
  else if (a.startsWith('--concurrency=')) concurrency = Math.max(1, Math.floor(Number(a.slice('--concurrency='.length)) || 1));
}

if (!seeds || !seeds.length) {
  seeds = Array.from({ length: count }, (_, i) => start + i);
}
if (outDir) mkdirSync(resolve(outDir), { recursive: true });

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

function isHardFailure(run) {
  if (!run) return true;
  if (run._exception || run.error) return true;
  if (run.deterministic === false) return true;
  if ((run.summary?.errors ?? 0) > 0) return true;
  if ((run.rules?.errors ?? 0) > 0) return true;
  return false;
}

function logRun(run) {
  const profileId = run.profile, seed = run.seed;
  if (run._exception || run.error) {
    console.error(`FAIL ${profileId} seed=${seed}: exception ${String(run.error || '').split('\n')[0]}`);
    return;
  }
  if (isHardFailure(run)) {
    console.error(`FAIL ${profileId} seed=${seed}: deterministic=${run.deterministic} errors=${run.summary?.errors ?? 0} ruleErrors=${run.rules?.errors ?? 0} hash=${run.reportHash}`);
  } else {
    const msg = `OK ${profileId} seed=${seed} hash=${run.reportHash} warn=${run.summary?.warnings ?? 0} drops=${run.summary?.drops ?? 0}${singleRun ? ' (single-run)' : ''}`;
    if (!jsonOut && !quiet) console.log(msg);
  }
}

const tasks = [];
for (const profileId of profiles) tasks.push(...seeds.map(seed => ({ profileId, seed })));

const opts = { size, chunk, generatorVersion, transport };
const runs = new Array(tasks.length);
let hardFailures = 0;
let aborted = false;
const seriesStartedAt = new Date().toISOString();
const seriesStartedMs = Date.now();

function processResult(idx, run) {
  runs[idx] = run;
  if (isHardFailure(run)) hardFailures++;
  logRun(run);
  if (outDir) {
    const toWrite = { ...run };
    delete toWrite._exception;
    writeFileSync(join(resolve(outDir), `${run.profile}-seed${run.seed}.json`), JSON.stringify(toWrite, null, 2).replace(/\r\n/g, '\n') + '\n', 'utf8');
  }
}

if (concurrency <= 1) {
  outer: for (let idx = 0; idx < tasks.length; idx++) {
    const t = tasks[idx];
    if (!DEFAULT_CITY_PROFILES[t.profileId]) {
      console.error(`unknown profile: ${t.profileId}`);
      const run = { profile: t.profileId, seed: t.seed, generatorVersion, error: `unknown profile: ${t.profileId}`, durationMs: 0 };
      processResult(idx, run);
      if (failFast) { aborted = true; break outer; }
      continue;
    }
    const run = executeTask({ ...t, generatorVersion, singleRun, opts });
    processResult(idx, run);
    if (failFast && isHardFailure(run)) { aborted = true; break outer; }
  }
} else {
  const selfUrl = new URL(import.meta.url);
  let next = 0;
  let active = 0;
  await new Promise((resolveAll) => {
    const maybeStart = () => {
      while (!aborted && active < concurrency && next < tasks.length) {
        const idx = next++;
        const t = tasks[idx];
        if (!DEFAULT_CITY_PROFILES[t.profileId]) {
          console.error(`unknown profile: ${t.profileId}`);
          const run = { profile: t.profileId, seed: t.seed, generatorVersion, error: `unknown profile: ${t.profileId}`, durationMs: 0 };
          processResult(idx, run);
          if (failFast) { aborted = true; }
          continue;
        }
        active++;
        const w = new Worker(selfUrl, { type: 'module', workerData: { ...t, generatorVersion, singleRun, opts } });
        let settled = false;
        const done = (run) => {
          if (settled) return;
          settled = true;
          active--;
          processResult(idx, run);
          if (failFast && isHardFailure(run)) aborted = true;
          if ((aborted || next >= tasks.length) && active === 0) resolveAll();
          else maybeStart();
        };
        w.on('message', (msg) => {
          if (msg && msg.ok) done(msg.result);
          else done({ profile: t.profileId, seed: t.seed, generatorVersion, determinismChecked: !singleRun, error: String(msg?.error || 'worker error'), _exception: true, durationMs: 0 });
        });
        w.on('error', (err) => done({ profile: t.profileId, seed: t.seed, generatorVersion, determinismChecked: !singleRun, error: String(err?.stack || err), _exception: true, durationMs: 0 }));
        w.on('exit', (code) => { if (code !== 0) done({ profile: t.profileId, seed: t.seed, generatorVersion, determinismChecked: !singleRun, error: `worker exited with code ${code}`, _exception: true, durationMs: 0 }); });
      }
      if ((aborted || next >= tasks.length) && active === 0) resolveAll();
    };
    maybeStart();
  });
  for (let i = 0; i < runs.length; i++) if (!runs[i]) runs[i] = { profile: tasks[i].profileId, seed: tasks[i].seed, generatorVersion, skipped: true };
}

const completedRuns = runs.filter(r => r && !r.error && !r.skipped && !r._exception);

const byProfile = {};
for (const p of profiles) {
  const rs = completedRuns.filter(r => r.profile === p);
  const detCheckedRuns = rs.filter(r => r.determinismChecked !== false);
  const detOk = detCheckedRuns.filter(r => r.deterministic === true).length;
  const errRuns = rs.filter(r => (r.summary?.errors ?? 0) > 0 || (r.rules?.errors ?? 0) > 0 || r.deterministic === false).length;
  const profTimed = runs.filter(r => r && !r.skipped && r.profile === p);
  byProfile[p] = {
    runs: rs.length,
    determinismCheckedRuns: detCheckedRuns.length,
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
    rho: (() => {
      const vals = rs.map(r => r.rho).filter(n => Number.isFinite(n));
      const a = agg(vals);
      return a ? { ...a, okCount: vals.filter(v => v >= 0.6).length, missing: rs.length - vals.length } : null;
    })(),
    softTargets: (() => {
      const counts = rs.map(r => r.softTargets?.count ?? 0);
      const runsWith = rs.filter(r => (r.softTargets?.count ?? 0) > 0).length;
      const byMetric = {};
      for (const r of rs) {
        for (const m of (r.softTargets?.metrics ?? [])) byMetric[m] = (byMetric[m] || 0) + 1;
      }
      return {
        total: counts.reduce((a, b) => a + b, 0),
        runsWith,
        runsTotal: rs.length,
        byMetric,
        informational: true,
      };
    })(),
    taskDurationMs: agg(profTimed.map(r => r.durationMs ?? NaN)),
  };
}

const timedRuns = runs.filter(r => r && !r.skipped);
const taskTimings = timedRuns.map(r => ({
  profile: r.profile,
  seed: r.seed,
  durationMs: r.durationMs ?? null,
  hardFailure: isHardFailure(r),
  error: !!(r && (r.error || r._exception)),
  deterministic: r?.deterministic ?? null,
}));
const totalDurationMs = Date.now() - seriesStartedMs;
const summary = {
  generatorVersion,
  profiles,
  seeds,
  seedCount: seeds.length,
  runs: timedRuns.length,
  hardFailures,
  transport,
  singleRun,
  failFast,
  aborted,
  concurrency,
  startedAt: seriesStartedAt,
  finishedAt: new Date().toISOString(),
  totalDurationMs,
  timing: {
    taskDurationMs: agg(timedRuns.map(r => r.durationMs ?? NaN)),
    tasksTimed: timedRuns.filter(r => Number.isFinite(r.durationMs)).length,
  },
  taskTimings,
  byProfile,
};

if (outDir) {
  const out = resolve(outDir);
  writeFileSync(join(out, 'series-summary.json'), JSON.stringify(summary, null, 2).replace(/\r\n/g, '\n') + '\n', 'utf8');
  writeFileSync(join(out, 'series-timings.json'), JSON.stringify({ startedAt: seriesStartedAt, finishedAt: summary.finishedAt, totalDurationMs, tasks: taskTimings, byProfileTiming: Object.fromEntries(Object.entries(byProfile).map(([p, v]) => [p, v.taskDurationMs])) }, null, 2).replace(/\r\n/g, '\n') + '\n', 'utf8');
}
if (jsonOut) console.log(JSON.stringify(summary, null, 2));
else {
  console.log('\nSeries summary:');
  console.log(JSON.stringify(summary, null, 2));
}

if (hardFailures > 0) process.exit(1);

}
