#!/usr/bin/env node
/**
 * R0.4/R6.4: regression check for stored citygen etalons/baselines.
 *
 * Verifies deterministic snapshots against current generator output.
 * - Synthetic etalons: .ai/state/citygen-etalons/<profile>-seed<seed>.json
 * - Pilot baselines:   .ai/state/citygen-baselines/<level>.citygen-baseline.json
 *
 * Usage:
 *   node tools/citygen-etalon-check.mjs [--etalons <dir>] [--baselines <dir>] [--skip-etalons] [--skip-baselines]
 * Exits 1 on mismatch.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { runCitygen } from './citygen/index.mjs';
import { DEFAULT_CITY_PROFILES } from './citygen/config.mjs';

const args = process.argv.slice(2);
let etalonsDir = '.ai/state/citygen-etalons';
let baselinesDir = '.ai/state/citygen-baselines';
let skipEtalons = false;
let skipBaselines = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const take = () => args[++i];
  if (a === '--etalons') etalonsDir = take();
  else if (a.startsWith('--etalons=')) etalonsDir = a.slice('--etalons='.length);
  else if (a === '--baselines') baselinesDir = take();
  else if (a.startsWith('--baselines=')) baselinesDir = a.slice('--baselines='.length);
  else if (a === '--skip-etalons') skipEtalons = true;
  else if (a === '--skip-baselines') skipBaselines = true;
}

let failures = 0;
let checks = 0;
function fail(msg) { failures++; console.error(`FAIL: ${msg}`); }
function ok(msg) { console.log(`OK: ${msg}`); }

function stable(v) { return JSON.stringify(v); }

function makeSynthetic(profileId, seed, generatorVersion = '0.1.0', size = 1280, chunk = 256) {
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

function compareEtalon(expected) {
  const { profile, seed, generatorVersion } = expected;
  checks++;
  if (!DEFAULT_CITY_PROFILES[profile]) { fail(`etalon ${profile} seed ${seed}: unknown profile`); return; }
  const raw = makeSynthetic(profile, seed, generatorVersion ?? '0.1.0');
  const r = runCitygen(raw);
  const hash = createHash('sha256').update(r.reportJson).digest('hex');
  const got = {
    reportHash: hash,
    summary: r.report.summary ?? null,
    rules: r.report.rules?.summary ?? null,
    metrics: expected.metrics ? {
      partial: r.report.metrics?.partial ?? true,
      counts: r.report.metrics?.counts ?? null,
      graph: r.report.metrics?.graph ?? null,
      roads: r.report.metrics?.roads ?? null,
      gameplay: r.report.metrics?.gameplay ?? null,
      terrain: r.report.metrics?.terrain ?? null,
      parcels: r.report.metrics?.parcels ?? null,
    } : null,
  };
  const exp = {
    reportHash: expected.reportHash,
    summary: expected.summary ?? null,
    rules: expected.rules ?? null,
    metrics: expected.metrics ?? null,
  };
  if (stable(got) !== stable(exp)) {
    fail(`etalon ${profile} seed ${seed} (gv=${generatorVersion}): snapshot mismatch`);
    console.error(`  expected hash=${exp.reportHash} summary=${stable(exp.summary)} rules=${stable(exp.rules)}`);
    console.error(`  got      hash=${got.reportHash} summary=${stable(got.summary)} rules=${stable(got.rules)}`);
  } else {
    ok(`etalon ${profile} seed ${seed} hash=${hash}`);
  }
}

function compareBaseline(expected) {
  checks++;
  const file = expected.file;
  if (!file) { fail(`baseline entry missing file`); return; }
  const abs = resolve(file);
  const raw = JSON.parse(readFileSync(abs, 'utf8'));
  const r = runCitygen(raw);
  const hash = createHash('sha256').update(r.reportJson).digest('hex');
  const got = {
    reportHash: hash,
    summary: r.report.summary ?? null,
    rules: r.report.rules?.summary ?? null,
  };
  const exp = {
    reportHash: expected.reportHash,
    summary: expected.summary ?? null,
    rules: expected.rules ?? null,
  };
  // Baseline snapshots may include extended metrics; compare hash + summary/rules as primary gate.
  if (got.reportHash !== exp.reportHash || stable(got.summary) !== stable(exp.summary) || stable(got.rules) !== stable(exp.rules)) {
    fail(`baseline ${file}: snapshot mismatch`);
    console.error(`  expected hash=${exp.reportHash} summary=${stable(exp.summary)} rules=${stable(exp.rules)}`);
    console.error(`  got      hash=${got.reportHash} summary=${stable(got.summary)} rules=${stable(got.rules)}`);
  } else {
    ok(`baseline ${file} hash=${hash}`);
  }
}

if (!skipEtalons) {
  const dir = resolve(etalonsDir);
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'summary.json').sort();
    for (const f of files) {
      const expected = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (!expected || !expected.profile || expected.seed == null) {
        checks++; fail(`etalon file ${f}: invalid format`); continue;
      }
      compareEtalon(expected);
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
      const expected = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      compareBaseline(expected);
    }
  } else {
    console.log(`skip: baselines dir not found (${dir})`);
  }
}

console.log(`\nEtalon check: ${checks - failures}/${checks} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
