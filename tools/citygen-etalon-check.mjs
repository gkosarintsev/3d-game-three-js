#!/usr/bin/env node
/**
 * R0.4/R6.4: regression check (and controlled update) for stored citygen etalons/baselines.
 *
 * Verifies deterministic snapshots against current generator output.
 * - Synthetic etalons: .ai/state/citygen-etalons/<profile>-seed<seed>.json (+ summary.json)
 * - Pilot baselines:   .ai/state/citygen-baselines/<level>.citygen-baseline.json
 *
 * Usage:
 *   node tools/citygen-etalon-check.mjs [--etalons <dir>] [--baselines <dir>] [--skip-etalons] [--skip-baselines] [--update] [--generatorVersion <v>]
 *
 * --update rewrites snapshots to match current deterministic output (intentional regression/bump workflow).
 * --generatorVersion overrides generatorVersion when recomputing/writing synthetic etalons (use for bump).
 * Exits 1 on mismatch unless --update is used.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { runCitygen } from './citygen/index.mjs';
import { DEFAULT_CITY_PROFILES, DEFAULT_GENERATOR_VERSION } from './citygen/config.mjs';

const args = process.argv.slice(2);
let etalonsDir = '.ai/state/citygen-etalons';
let baselinesDir = '.ai/state/citygen-baselines';
let skipEtalons = false;
let skipBaselines = false;
let update = false;
let generatorVersionOverride = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const take = () => args[++i];
  if (a === '--etalons') etalonsDir = take();
  else if (a.startsWith('--etalons=')) etalonsDir = a.slice('--etalons='.length);
  else if (a === '--baselines') baselinesDir = take();
  else if (a.startsWith('--baselines=')) baselinesDir = a.slice('--baselines='.length);
  else if (a === '--skip-etalons') skipEtalons = true;
  else if (a === '--skip-baselines') skipBaselines = true;
  else if (a === '--update' || a === '--write') update = true;
  else if (a === '--generatorVersion') generatorVersionOverride = String(take() ?? '') || null;
  else if (a.startsWith('--generatorVersion=')) generatorVersionOverride = a.slice('--generatorVersion='.length) || null;
}

let failures = 0;
let checks = 0;
let updated = 0;
function fail(msg) { failures++; console.error(`FAIL: ${msg}`); }
function ok(msg) { console.log(`OK: ${msg}`); }
function upd(msg) { updated++; console.log(`UPDATE: ${msg}`); }

function stable(v) { return JSON.stringify(v); }
function writeJson(filePath, obj) {
  writeFileSync(filePath, JSON.stringify(obj, null, 2).replace(/\r\n/g, '\n') + '\n', 'utf8');
}

function makeSynthetic(profileId, seed, generatorVersion = DEFAULT_GENERATOR_VERSION, size = 1280, chunk = 256) {
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

function computeEtalonRun(expected) {
  const { profile, seed } = expected;
  const gv = generatorVersionOverride ?? expected.generatorVersion ?? DEFAULT_GENERATOR_VERSION;
  if (!DEFAULT_CITY_PROFILES[profile]) return { error: `unknown profile ${profile}` };
  const raw = makeSynthetic(profile, seed, gv);
  const r = runCitygen(raw);
  const hash = createHash('sha256').update(r.reportJson).digest('hex');
  const m = r.report.metrics ?? {};
  const run = {
    profile,
    seed,
    generatorVersion: gv,
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
  return { run };
}

function compareEtalon(expected, filePath = null) {
  const { profile, seed, generatorVersion } = expected;
  checks++;
  const computed = computeEtalonRun(expected);
  if (computed.error) { fail(`etalon ${profile} seed ${seed}: ${computed.error}`); return computed; }
  const run = computed.run;
  const got = {
    reportHash: run.reportHash,
    summary: run.summary ?? null,
    rules: run.rules ?? null,
    metrics: expected.metrics ? run.metrics : null,
  };
  const exp = {
    reportHash: expected.reportHash,
    summary: expected.summary ?? null,
    rules: expected.rules ?? null,
    metrics: expected.metrics ?? null,
  };
  // Also detect generatorVersion bump intent mismatch in stored file when not updating.
  const gvMismatch = (generatorVersion ?? null) !== (run.generatorVersion ?? null);
  if (stable(got) !== stable(exp) || gvMismatch) {
    if (update && filePath) {
      writeJson(filePath, run);
      upd(`etalon ${profile} seed ${seed} -> ${run.reportHash} (gv=${run.generatorVersion})`);
      return { run, updated: true };
    }
    fail(`etalon ${profile} seed ${seed} (gv=${generatorVersion}): snapshot mismatch${gvMismatch ? ' [generatorVersion]' : ''}`);
    console.error(`  expected hash=${exp.reportHash} gv=${generatorVersion} summary=${stable(exp.summary)} rules=${stable(exp.rules)}`);
    console.error(`  got      hash=${got.reportHash} gv=${run.generatorVersion} summary=${stable(got.summary)} rules=${stable(got.rules)}`);
    return { run, mismatch: true };
  } else {
    ok(`etalon ${profile} seed ${seed} hash=${run.reportHash}`);
    return { run };
  }
}

function computeBaselineRun(expected) {
  const file = expected.file;
  if (!file) return { error: 'missing file' };
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
      landmarkVisibility: m.landmarkVisibility ?? null,
      blockDensityCorrelation: m.blockDensityCorrelation ?? null,
      chunkBuild: m.chunkBuild ?? null,
      stream: m.stream,
    } : null,
  };
  return { out };
}

function compareBaseline(expected, filePath = null) {
  checks++;
  const file = expected.file;
  const computed = computeBaselineRun(expected);
  if (computed.error) { fail(`baseline ${file ?? '(unknown)'}: ${computed.error}`); return computed; }
  const out = computed.out;
  const got = {
    reportHash: out.reportHash,
    summary: out.summary ?? null,
    rules: out.rules ?? null,
  };
  const exp = {
    reportHash: expected.reportHash,
    summary: expected.summary ?? null,
    rules: expected.rules ?? null,
  };
  // Baseline snapshots may include extended metrics; compare hash + summary/rules as primary gate.
  if (got.reportHash !== exp.reportHash || stable(got.summary) !== stable(exp.summary) || stable(got.rules) !== stable(exp.rules)) {
    if (update && filePath) {
      writeJson(filePath, out);
      upd(`baseline ${file} -> ${out.reportHash}`);
      return { out, updated: true };
    }
    fail(`baseline ${file}: snapshot mismatch`);
    console.error(`  expected hash=${exp.reportHash} summary=${stable(exp.summary)} rules=${stable(exp.rules)}`);
    console.error(`  got      hash=${got.reportHash} summary=${stable(got.summary)} rules=${stable(got.rules)}`);
    return { out, mismatch: true };
  } else {
    ok(`baseline ${file} hash=${out.reportHash}`);
    return { out };
  }
}

function agg(nums) {
  const a = nums.filter(n => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const sum = a.reduce((s, n) => s + n, 0);
  return { count: a.length, min: a[0], max: a[a.length - 1], mean: +(sum / a.length).toFixed(6) };
}

if (!skipEtalons) {
  const dir = resolve(etalonsDir);
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'summary.json').sort();
    const runs = [];
    for (const f of files) {
      const filePath = join(dir, f);
      const expected = JSON.parse(readFileSync(filePath, 'utf8'));
      if (!expected || !expected.profile || expected.seed == null) {
        checks++; fail(`etalon file ${f}: invalid format`); continue;
      }
      const res = compareEtalon(expected, filePath);
      if (res?.run) runs.push(res.run);
    }
    // When updating, refresh summary.json from current etalon set for consistency.
    if (update && runs.length) {
      const byProfile = {};
      const profiles = [...new Set(runs.map(r => r.profile))].sort();
      const seeds = [...new Set(runs.map(r => r.seed))].sort((a, b) => a - b);
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
        generatorVersion: generatorVersionOverride ?? (runs[0]?.generatorVersion ?? DEFAULT_GENERATOR_VERSION),
        profiles,
        seeds,
        runs: runs.length,
        deterministic: true,
        byProfile,
      };
      writeJson(join(dir, 'summary.json'), summary);
      upd(`etalon summary.json refreshed`);
    }
  } else {
    console.log(`skip: etalons dir not found (${dir})`);
  }
}

if (!skipBaselines) {
  const dir = resolve(baselinesDir);
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    for (const f of files) {
      const filePath = join(dir, f);
      const expected = JSON.parse(readFileSync(filePath, 'utf8'));
      compareBaseline(expected, filePath);
    }
  } else {
    console.log(`skip: baselines dir not found (${dir})`);
  }
}

console.log(`\nEtalon check: ${checks - failures}/${checks} passed, ${failures} failed${updated ? `, ${updated} updated` : ''}`);
if (failures > 0) process.exit(1);
