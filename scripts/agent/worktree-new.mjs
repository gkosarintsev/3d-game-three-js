#!/usr/bin/env node
/**
 * Helper: создать git worktree + ветку для агентской задачи.
 *
 * Использование:
 *   node scripts/agent/worktree-new.mjs --branch agent/<id>-<slug> [--path ../wt-<id>] [--from origin/main]
 *
 * По умолчанию worktree создаётся рядом с корнем репозитория: ../wt-<sanitized-branch>
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

function parse(argv) {
  const out = { branch: null, path: null, from: 'origin/main' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--branch') out.branch = argv[++i];
    else if (a === '--path') out.path = argv[++i];
    else if (a === '--from') out.from = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/agent/worktree-new.mjs --branch agent/<id>-<slug> [--path ../wt-name] [--from origin/main]');
      process.exit(0);
    }
  }
  return out;
}

const opt = parse(process.argv);
if (!opt.branch) {
  console.error('ERROR: --branch is required (e.g. --branch agent/par-013-doc-pilot-a)');
  process.exit(1);
}

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

try {
  const root = sh('git', ['rev-parse', '--show-toplevel']);
  sh('git', ['fetch', '--all', '--prune']);
  const safe = opt.branch.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const wtPath = path.resolve(root, opt.path || path.join('..', `wt-${safe}`));
  console.log(`Creating worktree: ${wtPath}`);
  console.log(`Branch: ${opt.branch} (from ${opt.from})`);
  execFileSync('git', ['worktree', 'add', wtPath, '-b', opt.branch, opt.from], { stdio: 'inherit' });
  console.log('Done.');
  console.log(`Next: cd "${wtPath}" && node scripts/agent/check-env.mjs`);
} catch (e) {
  const msg = e && e.stderr ? String(e.stderr) : String(e.message || e);
  console.error('Failed to create worktree:\n' + msg);
  process.exit(1);
}
