#!/usr/bin/env node
/**
 * Full citygen incremental loop for plan 21 (retro of 2026-11-19).
 *
 *   node scripts/agent/pr21.mjs --slug <name>
 *     [--branch agent/pr21-<slug>] [--from origin/main] [--path ../wt-pr21-<slug>]
 *     [--gv <version>]                 // bump DEFAULT_GENERATOR_VERSION + rebuild L16..22 + refresh baselines/etalons
 *     [--levels 16,17,...]             // restrict rebuild levels (default: 16..22)
 *     [--title "<title>"]              // PR title (default: derived from slug/gv)
 *     [--commit-message "<message>"]   // commit message headline; defaults to same as slug
 *     [--no-test]                      // skip node --test tools/citygen.test.mjs
 *     [--watch]                        // wait for push & PR runs; exit nonzero on failure
 *     [--merge]                        // merge PR--merge --delete-branch after green CI
 *     [--dry-run]
 *
 * Composes: git worktree + check-env + gv bump + build-level --parallel + baselines + etalons + tests + commit + push + PR (+ watch + merge).
 * Never bypasses CI; --merge only after all required jobs are green (watch enforces).
 */
import { execFileSync, execFile } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function parse(argv) {
  const out = {
    slug: null, branch: null, from: 'origin/main', path: null, gv: null,
    levels: [16, 17, 18, 19, 20, 21, 22], title: null, commitMessage: null,
    noTest: false, watch: false, merge: false, dryRun: false, resume: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--slug') out.slug = argv[++i];
    else if (a === '--branch') out.branch = argv[++i];
    else if (a === '--from') out.from = argv[++i];
    else if (a === '--path') out.path = argv[++i];
    else if (a === '--gv') out.gv = String(argv[++i] ?? '');
    else if (a === '--levels') out.levels = String(argv[++i] ?? '').split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
    else if (a === '--title') out.title = argv[++i];
    else if (a === '--commit-message') out.commitMessage = argv[++i];
    else if (a === '--no-test') out.noTest = true;
    else if (a === '--watch') out.watch = true;
    else if (a === '--merge') out.merge = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--resume') out.resume = true;
    else if (a === '--help' || a === '-h') { console.log(usage()); process.exit(0); }
  }
  return out;
}

function usage() {
  return 'Usage: node scripts/agent/pr21.mjs --slug <name> [--gv <version>] [--levels 16,17,...] [--watch] [--merge] [--dry-run]';
}

const opt = parse(process.argv);
if (!opt.slug && !opt.resume) { console.error('ERROR: --slug required'); console.error(usage()); process.exit(1); }

const ROOT = process.cwd();
const sh = (cmd, args, { cwd = ROOT, allowFailure = false, stdio = 'inherit' } = {}) => {
  console.log('>>', [cmd, ...args].join(' '));
  if (opt.dryRun) return { code: 0, out: '' };
  try {
    execFileSync(cmd, args, { cwd, stdio: ['ignore', stdio === 'pipe' ? 'pipe' : 'inherit', stdio === 'pipe' ? 'pipe' : 'inherit'] });
    return { code: 0, out: '' };
  } catch (e) {
    if (allowFailure) return { code: e.status ?? 1, out: e.stdout ? String(e.stdout) : '' };
    console.error('FAIL at:', [cmd, ...args].join(' '));
    process.exit(e.status ?? 1);
  }
};

const steps = [];
const step = (name, fn) => steps.push([name, fn]);

let worktree = ROOT;
const sanitized = (opt.slug ?? path.basename(ROOT)).replace(/[^a-zA-Z0-9._-]+/g, '-');
const branch = opt.branch ?? `agent/pr21-${sanitized}`;
const wtDir = opt.path ? path.resolve(opt.path) : path.resolve(ROOT, '..', `wt-pr21-${sanitized}`);

if (!opt.resume) {
  step('worktree-create', () => {
    sh('node', ['scripts/agent/worktree-new.mjs', '--branch', branch, '--path', wtDir, '--from', opt.from]);
    worktree = wtDir;
  });
}

step('preflight', () => sh('node', [path.join('scripts', 'agent', 'check-env.mjs')], { cwd: worktree }));

if (opt.gv) {
  step('bump gene version', () => {
    const cfg = path.join(worktree, 'tools', 'citygen', 'config.mjs');
    let s = opt.dryRun ? '' : readFileSync(cfg, 'utf8');
    const next = `export const DEFAULT_GENERATOR_VERSION = '${opt.gv}';`;
    s = s.replace(/export const DEFAULT_GENERATOR_VERSION = '[^']*';/, next);
    if (opt.dryRun) { console.log('dry-run: would set', next); return; }
    writeFileSync(cfg, s);
    for (const n of opt.levels) {
      const f = path.join(worktree, 'src', 'levels', `level-${n}.json`);
      if (!existsSync(f)) { console.error('missing', f); process.exit(2); }
      const raw = readFileSync(f, 'utf8');
      const out = raw.replace(/"generatorVersion":\s*"[^"]*"/, `"generatorVersion": "${opt.gv}"`);
      if (out === raw && !raw.includes(`"generatorVersion"`)) console.warn('warn: no generatorVersion in', f);
      writeFileSync(f, out);
    }
  });
  step('rebuild levels', () => {
    const files = opt.levels.map(n => path.join('src', 'levels', `level-${n}.json`));
    sh('node', ['tools/build-level.mjs', '--parallel', '4', ...files], { cwd: worktree });
  });
  step('refresh baselines', () => {
    const files = opt.levels.map(n => path.join('src', 'levels', `level-${n}.json`));
    sh('node', ['tools/citygen-baseline.mjs', '--out', '.ai/state/citygen-baselines', ...files], { cwd: worktree });
  });
  step('refresh etalons', () => {
    sh('node', ['tools/citygen-etalon-check.mjs', '--update', '--generatorVersion', opt.gv], { cwd: worktree });
  });
  step('verify etalons/baselines', () => sh('node', ['tools/citygen-etalon-check.mjs'], { cwd: worktree }));
}

if (!opt.noTest) step('unit tests', () => sh('node', ['--test', 'tools/citygen.test.mjs'], { cwd: worktree }));

const commitMessage = opt.commitMessage ?? `feat(citygen): ${opt.slug}${opt.gv ? ` (gv ${opt.gv})` : ''}`;
const prTitle = opt.title ?? commitMessage;
const prBody = [
  '## Summary',
  `- ${opt.slug}${opt.gv ? ` (gv bump to ${opt.gv})` : ''}.`,
  `- Generated via scripts/agent/pr21.mjs (retro dev-loop acceleration).`,
  '',
  'CI (GitHub Actions) is the source of truth; sequential merge only on green required checks.',
].join('\n');

step('commit', () => {
  sh('git', ['add', '-A'], { cwd: worktree });
  sh('git', ['commit', '-m', commitMessage], { cwd: worktree });
});
step('push', () => sh('git', ['push', '-u', 'origin', branch], { cwd: worktree }));
step('pr create', () => {
  const shPty = `--head ${branch}`;
  sh('gh', ['pr', 'create', '--repo', 'gkosarintsev/3d-game-three-js', '--base', 'main', '--head', branch, '--title', prTitle, '--body', prBody], { cwd: worktree });
});

if (opt.dryRun && opt.watch) {
  console.log('dry-run: skip watch');
} else if (opt.watch) {
  step('watch runs & list', () => {
    // wait for the two events (push, pull_request); report run ids
    sh('gh', ['run', 'list', '--repo', 'gkosarintsev/3d-game-three-js', '--branch', branch, '--limit', '5'], { cwd: worktree });
  });
  step('watch push & PR', () => {
    const out = execFileSync('gh', ['run', 'list', '--repo', 'gkosarintsev/3d-game-three-js', '--branch', branch, '--limit', '5', '--json', 'databaseId,event,status,conclusion'], { cwd: worktree, encoding: 'utf8' }).trim();
    const runs = JSON.parse(out || '[]');
    const pending = runs.filter(r => r.status !== 'completed').map(r => String(r.databaseId));
    const failed = runs.filter(r => r.status === 'completed' && r.conclusion && r.conclusion !== 'success');
    if (failed.length) { console.error('FAIL: at least one run failed:', JSON.stringify(failed)); process.exit(2); }
    for (const id of pending) sh('gh', ['run', 'watch', id, '--repo', 'gkosarintsev/3d-game-three-js', '--exit-status'], { cwd: worktree });
  });
}
if (opt.merge) {
  step('merge', () => {
    const view = execFileSync('gh', ['pr', 'view', branch, '--repo', 'gkosarintsev/3d-game-three-js', '--json', 'number,state,mergeStateStatus'], { cwd: worktree, encoding: 'utf8' }).trim();
    const info = JSON.parse(view);
    if (info.state !== 'OPEN') { console.error('PR not open:', view); process.exit(2); }
    if (info.mergeStateStatus !== 'CLEAN') { console.error('PR not CLEAN:', view); process.exit(3); }
    sh('gh', ['pr', 'merge', String(info.number), '--repo', 'gkosarintsev/3d-game-three-js', '--merge', '--delete-branch'], { cwd: worktree });
  });
  step('fetch main', () => sh('git', ['fetch', 'origin', 'main'], { cwd: worktree }));
}

step('summary', () => {
  console.log('');
  console.log('pr21.mjs finished. Next steps:');
  console.log('  git fetch origin main && git log --oneline origin/main -3');
  console.log('  record merge/CI evidence in .ai/state/citygen-plan21-execution.md within the next substantive increment (no standalone evidence PR)');
});

process.chdir(ROOT);
for (const [name, fn] of steps) {
  console.log('\n=== STEP:', name, '===');
  fn();
}
