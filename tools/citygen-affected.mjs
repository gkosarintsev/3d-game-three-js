#!/usr/bin/env node
/**
 * Affected-test picker for plan 21 hot path (retro dev-loop acceleration).
 * Maps changed paths (git diff --name-only <base>...HEAD) to the narrowest useful local checks.
 * Prints commands; does not execute them. Full suite always runs in CI.
 *
 *   node tools/citygen-affected.mjs [--base origin/main] [--json]
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
let base = 'origin/main';
let asJson = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--base') base = args[++i] ?? base;
  else if (a.startsWith('--base=')) base = a.slice('--base='.length);
  else if (a === '--json') asJson = true;
}

const changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' })
  .split('\n').map(s => s.trim()).filter(Boolean);

const notes = [];
const cmds = new Set();
const add = (cmd) => cmds.add(cmd);

let citygenTouched = false;
let levelsTouched = new Set();
let levelsRegistryTouched = false;
let runtimeTouched = false;
let docsOnly = true;

for (const f of changed) {
  if (/^src\/levels\/level-\d+\.json$/.test(f)) { levelsTouched.add(Number(f.match(/\d+/)[0])); docsOnly = false; }
  else if (/^src\/levels\/level-\d+\/.*$/.test(f)) { levelsTouched.add(Number(f.match(/\d+/)[0])); docsOnly = false; }
  else if (/^src\/levels\/index\.js$/.test(f)) { levelsRegistryTouched = true; runtimeTouched = true; docsOnly = false; }
  else if (/^src\/(map|hud|game|engine|json-map|surfaces|nav-graph|building|cityforge-|level-bin|skeleton|decor|terrain-map|model-map|streamed-model-map|town-map|city-map|world-map)\.js$/.test(f) || /^src\/(map|game)\.js$/.test(f)) { runtimeTouched = true; docsOnly = false; }
  else if (/^(docs\/|\.ai\/plans\/|\.ai\/state\/|\.ai\/prompts\/)/.test(f)) { /* docs */ }
  else if (/^tools\/citygen/.test(f) || /^tools\/citygen-(test|baseline|etalon|etalon-check|seed-series|schema)/.test(f) || f === 'tools/citygen.test.mjs') { citygenTouched = true; docsOnly = false; }
  else if (/^tools\/build-level/.test(f) || /^tools\/level-schema/.test(f) || /^tools\/normalize-level/.test(f) || /^tools\/chunk-level/.test(f) || /^src\/level-bin\.js$/.test(f)) { citygenTouched = true; docsOnly = false; }
  else if (/^tests\//.test(f) || /^tools\/ci-browser\.mjs$/.test(f)) { runtimeTouched = true; docsOnly = false; }
  else if (f === '.github/workflows/ci.yml' || /^scripts\/agent\//.test(f)) { docsOnly = false; }
  else { docsOnly = docsOnly && /^(\.github\/|package\.json)/.test(f) ? false : false; }
}

if (citygenTouched) {
  add('node --test tools/citygen.test.mjs');
  notes.push('Citygen pipeline touched: run the IR suite (57/57 locally is a hint; authoritative gate in CI).');
  add('node tools/citygen-etalon-check.mjs');
  notes.push('Etalon/baselines regression (16/16) — fast local check; CI re-verifies with full gate.');
}
if (levelsTouched.size) {
  const nums = [...levelsTouched].sort((a, b) => a - b);
  for (const n of nums) add(`node tools/build-level.mjs --check src/levels/level-${n}.json`);
  notes.push(`Levels touched [${nums.join(', ')}]: build-level --check verifies pars/derived parity (0 warnings).`);
  if (runtimeTouched || levelsRegistryTouched) {
    add('node tools/ci-browser.mjs --level ' + [...levelsTouched][0] + ' --details');
    notes.push('Runtime/registry touched: open-world suite for an affected level.');
  }
} else if (runtimeTouched) {
  add('node tools/ci-browser.mjs --level 16 --details');
  notes.push('Runtime modules touched: run open-world for pilot level-16.');
}
if (levelsRegistryTouched) {
  notes.push('src/levels/index.js changed (registry): engine-chapter browser suite required for affected chapters.');
}
if (docsOnly) {
  notes.push('Docs-only change: no local checks expected; full suite runs in CI anyway.');
}

const unique = [...new Set([...cmds])];
if (asJson) {
  console.log(JSON.stringify({ changed, docsOnly, commands: unique, notes }, null, 2));
} else {
  console.log('changed (' + changed.length + ' files):');
  for (const f of changed) console.log('  ' + f);
  console.log('');
  console.log('suggested local checks:');
  for (const c of unique) console.log('  ' + c);
  for (const n of notes) console.log('  # ' + n);
}
