#!/usr/bin/env node
/**
 * CI-loop helper: push → дождаться run для HEAD SHA → watch → собрать логи/артефакты → записать result-файлы.
 *
 * Использование:
 *   node scripts/agent/ci-watch.mjs [options]
 *
 * Опции:
 *   --no-push                 не делать git push, только наблюдать run для текущего HEAD
 *   --branch <name>           ветка (по умолчанию: текущая)
 *   --workflow <file|name>    фильтр workflow для gh run list/watch
 *   --timeout <sec>           таймаут ожидания появления run (default: 180)
 *   --watch-timeout <sec>     таймаут gh run watch (default: 3600)
 *   --interval <sec>          интервал poll поиска run (default: 5)
 *   --download-artifacts      скачать артефакты run в .ai/state/ci-results/<branch>/artifacts/<runId>
 *   --max-log-bytes <n>       лимит сохранённых failed-логов (default: 300000)
 *   --iteration <n>           номер итерации self-healing цикла (default: 1)
 *   --max-iterations <n>      лимит итераций для nextAction (default: 4)
 *   --json                    продублировать итоговый JSON в stdout
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const out = {
    push: true,
    branch: null,
    workflow: null,
    timeout: 180,
    watchTimeout: 3600,
    interval: 5,
    downloadArtifacts: false,
    maxLogBytes: 300000,
    iteration: 1,
    maxIterations: 4,
    jsonStdout: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--no-push') out.push = false;
    else if (a === '--download-artifacts') out.downloadArtifacts = true;
    else if (a === '--json') out.jsonStdout = true;
    else if (a === '--branch') out.branch = next();
    else if (a === '--workflow') out.workflow = next();
    else if (a === '--timeout') out.timeout = Number(next());
    else if (a === '--watch-timeout') out.watchTimeout = Number(next());
    else if (a === '--interval') out.interval = Number(next());
    else if (a === '--max-log-bytes') out.maxLogBytes = Number(next());
    else if (a === '--iteration') out.iteration = Number(next());
    else if (a === '--max-iterations') out.maxIterations = Number(next());
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/agent/ci-watch.mjs [--no-push] [--branch name] [--workflow file] [--timeout sec] [--watch-timeout sec] [--interval sec] [--download-artifacts] [--max-log-bytes n] [--iteration n] [--max-iterations n] [--json]');
      process.exit(0);
    }
  }
  return out;
}

const opt = parseArgs(process.argv);

function sh(cmd, args, opts = {}) {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    return { ok: true, out: String(out), err: '' };
  } catch (e) {
    return {
      ok: false,
      out: e && e.stdout ? String(e.stdout) : '',
      err: e && e.stderr ? String(e.stderr) : String(e.message || e),
      code: e && e.status != null ? e.status : 1,
    };
  }
}

function shInherit(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', encoding: 'utf8', ...opts });
  return { ok: r.status === 0, code: r.status ?? 1 };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function sanitizeBranch(name) {
  return String(name || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

function nowIso() { return new Date().toISOString(); }

function tailBytes(text, maxBytes) {
  const buf = Buffer.from(String(text || ''), 'utf8');
  if (buf.length <= maxBytes) return { text: String(text || ''), truncated: false };
  const sliced = buf.subarray(buf.length - maxBytes);
  return { text: `[truncated to last ${maxBytes} bytes]\n` + sliced.toString('utf8'), truncated: true };
}

function classify(run, jobs, failingLogs) {
  if (!run) return 'unknown';
  if (run.conclusion === 'success') return 'none';
  const blob = String(failingLogs || '').toLowerCase();
  if (/timed? ?out|timeout|exceeded the maximum execution time/.test(blob)) return 'timeout';
  if (/flake|flaky/.test(blob)) return 'flake';
  if (/determin/i.test(blob) || /побайтов|mismatch|--check/.test(blob)) return 'determinism';
  if (/build-level|schema|rebuild|пересбор/.test(blob)) return 'rebuild';
  if (/infrastructure|runner|internal error|rate limit|service unavailable|network|econn|enotfound/.test(blob)) return 'infra';
  const failedJobs = (jobs || []).filter(j => ['failure', 'timed_out', 'cancelled', 'action_required'].includes(j.conclusion));
  if (failedJobs.length) return 'test';
  return 'unknown';
}

function writeResults(baseDir, branchKey, result, md, logText) {
  mkdirSync(baseDir, { recursive: true });
  writeFileSync(path.join(baseDir, `${branchKey}.json`), JSON.stringify(result, null, 2) + '\n', 'utf8');
  writeFileSync(path.join(baseDir, `${branchKey}.md`), md, 'utf8');
  writeFileSync(path.join(baseDir, `${branchKey}-failed.log`), logText || '', 'utf8');
}

function toMd(r) {
  const lines = [];
  lines.push(`# CI result: ${r.branch}`);
  lines.push('');
  lines.push(`- generatedAt: ${r.generatedAt}`);
  lines.push(`- headSha: ${r.headSha || 'n/a'}`);
  lines.push(`- nextAction: ${r.nextAction}`);
  lines.push(`- errorClass: ${r.errorClass}`);
  lines.push(`- iteration: ${r.iteration.current}/${r.iteration.max}`);
  if (r.run) {
    lines.push(`- run: ${r.run.id || 'n/a'} (${r.run.status || 'n/a'}/${r.run.conclusion || 'n/a'}) attempt ${r.run.attempt || 'n/a'}`);
    if (r.run.url) lines.push(`- url: ${r.run.url}`);
    if (r.run.workflow) lines.push(`- workflow: ${r.run.workflow}`);
    if (r.run.event) lines.push(`- event: ${r.run.event}`);
  }
  if (r.error) {
    lines.push('');
    lines.push('## Error');
    lines.push('```');
    lines.push(String(r.error));
    lines.push('```');
  }
  if (r.jobs && r.jobs.length) {
    lines.push('');
    lines.push('## Jobs');
    for (const j of r.jobs) {
      const mark = j.conclusion === 'success' ? '✅' : (j.conclusion === 'skipped' ? '⏭️' : (j.conclusion ? '❌' : '•'));
      lines.push(`- ${mark} ${j.name} — ${j.status || 'n/a'}/${j.conclusion || 'n/a'}${j.url ? ` (${j.url})` : ''}`);
    }
  }
  if (r.failing && r.failing.length) {
    lines.push('');
    lines.push('## Failing summary');
    for (const f of r.failing) {
      lines.push(`- ${f.job || 'job'}${f.step ? ` / ${f.step}` : ''}: ${String(f.messageExcerpt || '').slice(0, 500)}`);
    }
  }
  if (r.artifactsDownloaded && r.artifactsDownloaded.length) {
    lines.push('');
    lines.push('## Downloaded artifacts');
    for (const a of r.artifactsDownloaded) lines.push(`- ${a.name} -> ${a.path}`);
  }
  lines.push('');
  return lines.join('\n');
}

(async () => {
  const started = nowIso();
  const repoRootRes = sh('git', ['rev-parse', '--show-toplevel']);
  const repoRoot = repoRootRes.ok ? repoRootRes.out.trim() : process.cwd();
  const branchRes = opt.branch ? { ok: true, out: opt.branch } : sh('git', ['branch', '--show-current']);
  const branch = (branchRes.out || '').trim();
  const shaRes = sh('git', ['rev-parse', 'HEAD']);
  let headSha = (shaRes.out || '').trim();
  const remoteRes = sh('git', ['remote', 'get-url', 'origin']);
  const remote = remoteRes.ok ? remoteRes.out.trim() : null;

  const branchKey = sanitizeBranch(branch || 'detached');
  const resultsDir = path.join(repoRoot, '.ai', 'state', 'ci-results');

  const baseResult = {
    schemaVersion: 1,
    generatedAt: started,
    branch: branch || null,
    headSha: headSha || null,
    remote,
    run: null,
    jobs: [],
    failing: [],
    artifactsDownloaded: [],
    nextAction: 'retry',
    iteration: { current: opt.iteration, max: opt.maxIterations },
    errorClass: 'unknown',
    error: null,
  };

  if (!branch) {
    baseResult.error = 'Не удалось определить текущую ветку (detached HEAD?).';
    baseResult.nextAction = 'escalate';
    writeResults(resultsDir, branchKey, baseResult, toMd(baseResult), baseResult.error + '\n');
    console.error(baseResult.error);
    process.exit(1);
  }

  if (opt.push) {
    console.log(`[ci-watch] push origin ${branch}...`);
    const push = shInherit('git', ['push', '-u', 'origin', branch], { cwd: repoRoot });
    if (!push.ok) {
      baseResult.error = `git push завершился с кодом ${push.code}`;
      baseResult.errorClass = 'infra';
      baseResult.generatedAt = nowIso();
      writeResults(resultsDir, branchKey, baseResult, toMd(baseResult), baseResult.error + '\n');
      process.exit(push.code || 1);
    }
    // refresh SHA after potential hooks, though unlikely
    const sha2 = sh('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
    if (sha2.ok) headSha = sha2.out.trim();
    baseResult.headSha = headSha || baseResult.headSha;
  }

  console.log(`[ci-watch] waiting for workflow run: branch=${branch} sha=${headSha}`);
  const deadline = Date.now() + opt.timeout * 1000;
  let run = null;
  while (Date.now() < deadline) {
    const listArgs = ['run', 'list', '--branch', branch, '--limit', '20', '--json', 'databaseId,headSha,status,conclusion,workflowName,event,createdAt,updatedAt,url,displayTitle'];
    if (opt.workflow) listArgs.push('--workflow', opt.workflow);
    const listed = sh('gh', listArgs, { cwd: repoRoot });
    if (listed.ok) {
      try {
        const runs = JSON.parse(listed.out || '[]');
        run = runs.find(r => String(r.headSha || '').toLowerCase() === String(headSha || '').toLowerCase()) || null;
        if (run) break;
      } catch (e) {
        // ignore parse error, retry
      }
    }
    sleep(opt.interval * 1000);
  }

  if (!run) {
    baseResult.error = `Не найден workflow run для ${branch}@${headSha} за ${opt.timeout}с. Проверь, что push создал run и gh auth имеет доступ.`;
    baseResult.errorClass = 'infra';
    baseResult.generatedAt = nowIso();
    writeResults(resultsDir, branchKey, baseResult, toMd(baseResult), baseResult.error + '\n');
    console.error(baseResult.error);
    process.exit(1);
  }

  console.log(`[ci-watch] run ${run.databaseId} (${run.workflowName || 'workflow'}) status=${run.status} conclusion=${run.conclusion || 'n/a'}`);
  const watchArgs = ['run', 'watch', String(run.databaseId), '--exit-status'];
  if (opt.watchTimeout > 0) watchArgs.push('--interval', '10');
  let watchOk = false;
  if (['completed'].includes(run.status)) {
    watchOk = run.conclusion === 'success';
  } else {
    const w = spawnSync('gh', watchArgs, { stdio: 'inherit', encoding: 'utf8', cwd: repoRoot, timeout: opt.watchTimeout > 0 ? opt.watchTimeout * 1000 : undefined });
    watchOk = w.status === 0;
  }

  // Refresh run view
  const view = sh('gh', ['run', 'view', String(run.databaseId), '--json', 'databaseId,headSha,status,conclusion,workflowName,event,createdAt,updatedAt,url,displayTitle,jobs,attempt'], { cwd: repoRoot });
  let runView = run;
  let jobs = [];
  if (view.ok) {
    try {
      runView = JSON.parse(view.out || '{}');
      jobs = Array.isArray(runView.jobs) ? runView.jobs : [];
    } catch {}
  }

  let failedLog = '';
  if (!watchOk || (runView && runView.conclusion !== 'success')) {
    const logRes = sh('gh', ['run', 'view', String(run.databaseId), '--log-failed'], { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 });
    const raw = (logRes.out || '') + (logRes.err ? `\n[stderr]\n${logRes.err}` : '');
    failedLog = tailBytes(raw, opt.maxLogBytes).text;
  }

  const artifactsDownloaded = [];
  if (opt.downloadArtifacts) {
    const artDir = path.join(resultsDir, branchKey, 'artifacts', String(run.databaseId));
    mkdirSync(artDir, { recursive: true });
    const dl = sh('gh', ['run', 'download', String(run.databaseId), '-D', artDir], { cwd: repoRoot });
    artifactsDownloaded.push({ name: 'all', path: artDir, ok: dl.ok, note: dl.ok ? null : (dl.err || 'download failed').slice(0, 500) });
  }

  const finalRun = {
    id: runView.databaseId || run.databaseId,
    url: runView.url || run.url || null,
    workflow: runView.workflowName || run.workflowName || null,
    event: runView.event || run.event || null,
    status: runView.status || null,
    conclusion: runView.conclusion || null,
    attempt: runView.attempt || 1,
    createdAt: runView.createdAt || run.createdAt || null,
    updatedAt: runView.updatedAt || run.updatedAt || null,
    displayTitle: runView.displayTitle || null,
  };

  const jobItems = jobs.map(j => ({
    id: j.databaseId || null,
    name: j.name,
    status: j.status,
    conclusion: j.conclusion,
    url: j.url || null,
  }));

  const failingJobs = jobItems.filter(j => j.conclusion && j.conclusion !== 'success' && j.conclusion !== 'skipped' && j.conclusion !== 'neutral');
  const failing = failingJobs.map(j => ({ job: j.name, step: null, messageExcerpt: `job conclusion=${j.conclusion}`, artifactRefs: [] }));

  const success = finalRun.conclusion === 'success';
  const errorClass = classify(finalRun, jobItems, failedLog);
  let nextAction = 'retry';
  if (success) nextAction = 'success';
  else if (opt.iteration >= opt.maxIterations) nextAction = 'escalate';

  const result = {
    schemaVersion: 1,
    generatedAt: nowIso(),
    branch,
    headSha,
    remote,
    run: finalRun,
    jobs: jobItems,
    failing,
    artifactsDownloaded,
    nextAction,
    iteration: { current: opt.iteration, max: opt.maxIterations },
    errorClass: success ? 'none' : errorClass,
    error: success ? null : `CI conclusion=${finalRun.conclusion || 'unknown'} for run ${finalRun.id}`,
  };

  const md = toMd(result);
  writeResults(resultsDir, branchKey, result, md, failedLog);
  console.log(`[ci-watch] result: ${result.nextAction} (${result.errorClass}) -> ${path.join(resultsDir, branchKey + '.json')}`);
  if (opt.jsonStdout) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(success ? 0 : 1);
})().catch((e) => {
  console.error('[ci-watch] fatal:', e && e.stack ? e.stack : e);
  process.exit(1);
});
