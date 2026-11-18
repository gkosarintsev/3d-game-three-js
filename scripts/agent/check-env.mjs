#!/usr/bin/env node
/**
 * Guardrails для CI-only/worktree схемы параллельных агентов.
 *
 * Проверяет, что работа ведётся в изолированном контексте (не на main),
 * git/remote/gh готовы для цикла push→CI→watch.
 *
 * Использование:
 *   node scripts/agent/check-env.mjs [--allow-main] [--require-worktree] [--json]
 *
 * Коды выхода: 0 — ok, 1 — нарушение/ошибка проверки.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const allowMain = args.has('--allow-main');
const requireWorktree = args.has('--require-worktree');
const asJson = args.has('--json');

function run(cmd, cmdArgs, opts = {}) {
  try {
    const out = execFileSync(cmd, cmdArgs, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    });
    return { ok: true, out: String(out).trim() };
  } catch (e) {
    const stderr = e && e.stderr ? String(e.stderr).trim() : '';
    const stdout = e && e.stdout ? String(e.stdout).trim() : '';
    return { ok: false, out: stdout, err: stderr || String(e.message || e), code: e.status ?? 1 };
  }
}

const errors = [];
const warnings = [];
const info = {};

const inside = run('git', ['rev-parse', '--is-inside-work-tree']);
if (!inside.ok || inside.out !== 'true') {
  errors.push('Не git-репозиторий (или git недоступен).');
} else {
  const root = run('git', ['rev-parse', '--show-toplevel']);
  const gitDir = run('git', ['rev-parse', '--git-dir']);
  const commonDir = run('git', ['rev-parse', '--git-common-dir']);
  const branch = run('git', ['branch', '--show-current']);
  const head = run('git', ['rev-parse', '--short', 'HEAD']);
  const status = run('git', ['status', '--porcelain']);
  const remote = run('git', ['remote', 'get-url', 'origin']);

  info.toplevel = root.out;
  info.gitDir = gitDir.out;
  info.gitCommonDir = commonDir.out;
  info.branch = branch.out || '(detached)';
  info.head = head.out;
  info.hasOrigin = remote.ok;
  info.origin = remote.ok ? remote.out : null;

  const gitPath = path.resolve(process.cwd(), gitDir.out || '.git');
  let linkedWorktree = false;
  try {
    // В linked worktree .git — файл с gitdir:, в основном рабочем дереве — каталог.
    linkedWorktree = existsSync(gitPath) && statSync(gitPath).isFile();
  } catch {
    linkedWorktree = false;
  }
  info.linkedWorktree = linkedWorktree;

  if (requireWorktree && !linkedWorktree) {
    errors.push('Требуется linked git worktree, но текущее рабочее дерево не является linked worktree.');
  }

  const protectedBranches = new Set(['main', 'master']);
  if (protectedBranches.has(branch.out) && !allowMain) {
    errors.push(`Текущая ветка "${branch.out}" защищена для agent-loop. Создай/переключись на ветку agent/* или feat/* в отдельном worktree (или передай --allow-main только для maintainer-сценария).`);
  }

  if (!branch.out) {
    warnings.push('HEAD в detached состоянии: для push/CI-loop нужна именованная ветка.');
  }

  if (!remote.ok) {
    warnings.push('Remote "origin" не настроен: push в GitHub CI невозможен.');
  }

  const porcelain = status.ok ? status.out : '';
  info.dirty = !!porcelain;
  info.changedEntries = porcelain ? porcelain.split(/\r?\n/).filter(Boolean).length : 0;
  if (porcelain) {
    warnings.push(`Рабочее дерево не чистое (${info.changedEntries} записей в git status). Перед commit/push проверь, что в коммит не попадёт мусор.`);
  }

  const inProgress = ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']
    .filter((name) => existsSync(path.resolve(info.gitDir || '.git', name)));
  if (inProgress.length) {
    errors.push(`Обнаружено незавершённое состояние git: ${inProgress.join(', ')}.`);
  }
}

const ghVer = run('gh', ['--version']);
info.ghInstalled = ghVer.ok;
if (!ghVer.ok) {
  warnings.push('gh CLI не найден: ожидание CI/сбор результатов будет недоступен.');
} else {
  const auth = run('gh', ['auth', 'status']);
  info.ghAuthed = auth.ok;
  if (!auth.ok) {
    warnings.push('gh auth status неуспешен: проверь аутентификацию GitHub перед push/watch.');
  }
}

const ok = errors.length === 0;
const result = { ok, errors, warnings, info };

if (asJson) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} else {
  const mark = ok ? 'OK' : 'FAIL';
  console.log(`[check-env] ${mark}`);
  if (info.branch) console.log(`  branch: ${info.branch} @ ${info.head || '?'}`);
  if (info.toplevel) console.log(`  workdir: ${process.cwd()}`);
  if (info.toplevel) console.log(`  toplevel: ${info.toplevel}`);
  console.log(`  linked worktree: ${info.linkedWorktree ? 'yes' : 'no'}`);
  for (const w of warnings) console.log(`  WARN: ${w}`);
  for (const e of errors) console.log(`  ERROR: ${e}`);
  if (ok) console.log('  Готово к агентскому циклу (с учётом предупреждений).');
}

process.exit(ok ? 0 : 1);
