#!/usr/bin/env node
/**
 * Local dev server for Level Editor.
 *
 * Сервирует статический репозиторий (как `python -m http.server`, но с теми же
 * MIME-типами) и добавляет ограниченный endpoint сохранения source-файла:
 *   POST /api/level/<NN>[?dryRun=1]
 *   body: application/json — draft level-NN.json
 *
 * По умолчанию запись выключена; реально пишет только при `--write`.
 * Путь жёстко ограничен `<repo>/src/levels/level-<NN>.json`.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const writeEnabled = args.includes('--write');
const selfTest = args.includes('--self-test');
const portArg = args.find(a => a.startsWith('--port='));
const PORT = portArg ? Number(portArg.split('=')[1]) : Number(process.env.PORT || 8125);
const MAX_BODY = 64 * 1024 * 1024;
const CMD_TIMEOUT_MS = 180_000;
const CMD_MAX_OUTPUT = 1_500_000;

function tail(s, n = 4000) { const str = String(s ?? ''); return str.length > n ? str.slice(str.length - n) : str; }
function runCommand(cmd, args, cwd = ROOT) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(cmd, args, { cwd, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', done = false;
    const finish = (result) => { if (done) return; done = true; resolve({ ...result, ms: Date.now() - t0, stdout: tail(stdout, CMD_MAX_OUTPUT), stderr: tail(stderr, CMD_MAX_OUTPUT) }); };
    const killTimer = setTimeout(() => { try { child.kill('SIGTERM'); } catch {} finish({ code: null, signal: 'timeout', timedOut: true }); }, CMD_TIMEOUT_MS);
    child.stdout.on('data', c => { stdout += c; if (stdout.length > CMD_MAX_OUTPUT * 2) stdout = stdout.slice(-CMD_MAX_OUTPUT); });
    child.stderr.on('data', c => { stderr += c; if (stderr.length > CMD_MAX_OUTPUT * 2) stderr = stderr.slice(-CMD_MAX_OUTPUT); });
    child.on('error', e => { clearTimeout(killTimer); finish({ code: null, error: e?.message || String(e) }); });
    child.on('close', code => { clearTimeout(killTimer); finish({ code: code ?? null }); });
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm',
  '.l14b': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}
function sendJson(res, status, obj) { send(res, status, JSON.stringify(obj, null, 2), 'application/json; charset=utf-8'); }
function levelTarget(level) {
  if (!/^\d{1,2}$/.test(String(level))) return null;
  const nn = String(level).padStart(2, '0');
  const target = path.resolve(ROOT, 'src', 'levels', `level-${nn}.json`);
  const root = path.resolve(ROOT, 'src', 'levels');
  if (path.dirname(target) !== root) return null;
  return { nn, target };
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function validateLevelDraft(draft, nn) {
  const errs = [];
  if (!draft || typeof draft !== 'object') errs.push('root must be object');
  if (draft?.kind !== 'cityforge' && draft?.kind !== 'open') errs.push(`kind must be cityforge/open, got ${String(draft?.kind)}`);
  if (!draft?.ground) errs.push('missing ground');
  if (!draft?.cityforge?.networks?.roads) errs.push('missing cityforge.networks.roads');
  if (draft?.levelName && String(draft.levelName) !== `level-${nn}`) errs.push('levelName mismatch');
  if (draft?.metadata?.levelName && String(draft.metadata.levelName) !== `level-${nn}`) errs.push('metadata.levelName mismatch');
  return errs;
}
const handler = async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const rebuild = url.pathname.match(/^\/api\/level\/(\d{1,2})\/rebuild$/);
    if (rebuild && req.method === 'POST') {
      const t = levelTarget(rebuild[1]); if (!t) { sendJson(res, 400, { ok: false, error: 'bad level' }); return; }
      const sourceRel = path.relative(ROOT, path.resolve(ROOT, 'src', 'levels', `level-${t.nn}.json`));
      const commands = [
        { label: 'build', args: [path.join('tools', 'build-level.mjs'), sourceRel] },
        { label: 'check', args: [path.join('tools', 'build-level.mjs'), sourceRel, '--check'] },
      ];
      if (url.searchParams.get('dryRun') === '1') {
        sendJson(res, 200, { ok: true, dryRun: true, commands: commands.map(c => [process.execPath, ...c.args]) });
        return;
      }
      if (!writeEnabled) { sendJson(res, 403, { ok: false, error: 'rebuild disabled; restart with --write' }); return; }
      const build = await runCommand(process.execPath, commands[0].args, ROOT);
      if (build.code !== 0) { sendJson(res, 200, { ok: false, stage: 'build', build, check: null }); return; }
      const check = await runCommand(process.execPath, commands[1].args, ROOT);
      sendJson(res, 200, { ok: check.code === 0, stage: 'check', build, check });
      return;
    }
    const m = url.pathname.match(/^\/api\/level\/(\d{1,2})$/);
    if (m && req.method === 'POST') {
      if (!writeEnabled && url.searchParams.get('dryRun') !== '1') {
        sendJson(res, 403, { ok: false, error: 'write disabled; restart with --write (static server /api only accepts dryRun=1)' });
        return;
      }
      const t = levelTarget(m[1]); if (!t) { sendJson(res, 400, { ok: false, error: 'bad level' }); return; }
      const raw = await readBody(req);
      let draft;
      try { draft = JSON.parse(raw.toString('utf8')); } catch (e) { sendJson(res, 400, { ok: false, error: `invalid JSON: ${e.message}` }); return; }
      const errs = validateLevelDraft(draft, t.nn);
      if (errs.length) { sendJson(res, 422, { ok: false, errors: errs }); return; }
      const bytes = Buffer.byteLength(JSON.stringify(draft, null, 2) + '\n');
      if (url.searchParams.get('dryRun') === '1') { sendJson(res, 200, { ok: true, dryRun: true, bytes, path: path.relative(ROOT, t.target) }); return; }
      fs.writeFileSync(t.target, JSON.stringify(draft, null, 2) + '\n', 'utf8');
      sendJson(res, 200, { ok: true, dryRun: false, bytes, path: path.relative(ROOT, t.target) });
      return;
    }
    if (m && req.method === 'GET') {
      const t = levelTarget(m[1]); if (!t) { sendJson(res, 400, { ok: false, error: 'bad level' }); return; }
      if (!fs.existsSync(t.target)) { sendJson(res, 404, { ok: false, error: 'not found' }); return; }
      send(res, 200, fs.readFileSync(t.target), MIME['.json']);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { sendJson(res, 405, { ok: false, error: 'method not allowed' }); return; }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/3d-game.html';
    const target = path.resolve(ROOT, '.' + pathname);
    if (!target.startsWith(ROOT) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) { send(res, 404, 'not found'); return; }
    const ext = path.extname(target).toLowerCase();
    const body = fs.readFileSync(target);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
    if (req.method !== 'HEAD') res.end(body); else res.end();
  } catch (e) {
    sendJson(res, 500, { ok: false, error: e?.message || String(e) });
  }
};
const server = http.createServer(handler);

const HTTP_TIMEOUT_MS = 5000;
function httpRaw(method, url, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, agent: false, headers: body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {} }, (res) => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(HTTP_TIMEOUT_MS, () => req.destroy(new Error('timeout')));
    if (body) req.write(body);
    req.end();
  });
}
async function runSelfTest() {
  const testServer = http.createServer(handler);
  await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));
  const { port } = testServer.address();
  const base = `http://127.0.0.1:${port}`;
  const get = await httpRaw('GET', `${base}/tools/level-editor.html`);
  const html = get.text;
  const postBody = JSON.stringify({ kind: 'cityforge', ground: { size: 2560 }, cityforge: { networks: { roads: { nodes: [], segments: [] } } } });
  const post = await httpRaw('POST', `${base}/api/level/19?dryRun=1`, postBody);
  const json = JSON.parse(post.text);
  const bad = await httpRaw('POST', `${base}/api/level/99?dryRun=1`, '{}');
  const badJson = JSON.parse(bad.text);
  const rebuild = await httpRaw('POST', `${base}/api/level/19/rebuild?dryRun=1`, '');
  const rebuildJson = JSON.parse(rebuild.text);
  testServer.closeAllConnections?.();
  await new Promise(resolve => testServer.close(resolve));
  const ok = get.status === 200 && html.includes('Level Editor') && json.ok === true && json.dryRun === true && bad.status === 422 && rebuild.status === 200 && rebuildJson?.dryRun === true && Array.isArray(rebuildJson?.commands) && rebuildJson.commands.every(c => Array.isArray(c));
  console.log(JSON.stringify({ ok, html: get.status, dryRun: json, bad: badJson, rebuild: rebuildJson }, null, 2));
  process.exitCode = ok ? 0 : 1;
}
if (selfTest) runSelfTest().catch(e => { console.error(e); process.exitCode = 1; });
else {
  server.listen(PORT, () => {
    console.log(`Level Editor server: http://localhost:${PORT}/tools/level-editor.html?level=19`);
    console.log(writeEnabled ? 'Save endpoint: POST /api/level/<NN> (пишет src/levels/level-NN.json)' : 'Save endpoint disabled; restart with --write or use dryRun=1');
  });
}
