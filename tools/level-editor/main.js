import * as THREE from 'three';
import { loadRegistry, loadSource } from '../visualizer/loader.js';
import { ViewManager } from '../visualizer/views.js';
import { DraftPreview, selectionKey } from './preview.js';
import { EditorUI } from './editor-ui.js';
import {
  deepClone, ensureRoads, readNetwork, findNode, findSegment, findElement, nodePos,
  addSegment, deleteSelected, moveSelection, moveElementEnd, validateDraft, r3, lenXZ, yawFrom,
  duplicateSegment, createNodeId, MIN_SEGMENT_LENGTH, filletJoint, syncSegmentToElements,
} from './source-model.js';

const appEl = document.getElementById('app');
const ui = new EditorUI(appEl, { onChange: handleUiChange, onAction: handleAction });
const preview = new DraftPreview(ui.canvas, { meta: { plate: { size: 2560, groundY: 0 } } });
let state = {
  level: 19,
  view: 'top',
  grid: true,
  tool: 'select',
  preset: 'ground',
  snap: 5,
  selected: null,
  pendingPoint: null,
  filletFirst: null,
  filletRadius: 15,
  autoBuild: false,
};
let rawSource = null;
let draft = null;
let viewManager = null;
let registry = { numbers: [7, 8, 9, 10, 15, 16, 17, 18, 19] };
let undoStack = [];
let redoStack = [];
let fieldEditSnapshot = null;
let dragState = null;
let dirty = true;
let raf = 0;

window.__levelEditor = {
  get state() { return state; },
  get viewManager() { return viewManager; },
  get preview() { return preview; },
  get draft() { return draft; },
  screenToWorld(x, y) { return viewManager?.screenToWorld(x, y) ?? null; },
  findPick(x, y) { return findPick(x, y); },
};

function parseUrl() {
  const p = new URLSearchParams(location.search);
  if (p.has('level')) state.level = Number(p.get('level')) || state.level;
  if (p.has('view')) state.view = p.get('view') || state.view;
  if (p.has('tool')) state.tool = p.get('tool') || state.tool;
  if (p.has('grid')) state.grid = p.get('grid') !== '0';
  if (p.has('snap')) state.snap = Number(p.get('snap')) || state.snap;
}
function writeUrl() {
  const p = new URLSearchParams();
  p.set('level', String(state.level)); p.set('view', state.view); p.set('tool', state.tool);
  if (!state.grid) p.set('grid', '0');
  if (state.snap !== 5) p.set('snap', String(state.snap));
  history.replaceState(null, '', `${location.pathname}?${p.toString()}`);
}
function markDirty() { dirty = true; }
function snapCoord(v) { const s = Number(state.snap) || 0; return s > 0 ? r3(Math.round(v / s) * s) : r3(v); }
function nearestNode(p, tolerance = 3) {
  let best = null, bestD = Infinity;
  for (const n of ensureRoads(draft).nodes) {
    const np = nodePos(n);
    const d = Math.hypot(np.x - p.x, np.z - p.z);
    if (d <= tolerance && d < bestD) { best = { id: String(n.id), ...np }; bestD = d; }
  }
  return best ? { id: best.id, x: r3(best.x), y: r3(best.y), z: r3(best.z) } : null;
}
function snapPoint(p, useNodes = false) {
  if (useNodes) {
    const n = nearestNode(p, Math.max(2, Number(state.snap) || 0));
    if (n) return n;
  }
  return { x: snapCoord(p.x), y: 0, z: snapCoord(p.z) };
}
function cloneDraft() { return deepClone(draft); }
function pushHistory() { if (!draft) return; undoStack.push(JSON.stringify(draft)); if (undoStack.length > 100) undoStack.shift(); redoStack = []; }
function selectionExists(sel) {
  if (!sel || !draft) return false;
  if (sel.kind === 'node') return !!findNode(draft, sel.id);
  if (sel.kind === 'segment') return !!findSegment(draft, sel.segmentId);
  if (sel.kind === 'element') return !!findElement(draft, sel.segmentId, sel.elementIndex);
  return false;
}
function commitDraft({ history = false } = {}) {
  if (history) pushHistory();
  if (!selectionExists(state.selected)) state.selected = null;
  preview.modelMeta = viewModel();
  if (viewManager) viewManager.model = viewModel();
  preview.rebuild(draft, state.selected);
  preview.setGridVisible(state.grid);
  ui.setTree(draft, state.selected);
  renderInspector();
  ui.setDirty(undoStack.length > 0 || redoStack.length > 0, undoStack.length);
  writeUrl();
  markDirty();
}
function viewModel() {
  return { meta: { plate: { size: Number.isFinite(draft?.ground?.size) ? draft.ground.size : 2560, groundY: Number.isFinite(draft?.ground?.y) ? draft.ground.y : 0 } } };
}
function setStatus(msg) { ui.setStatus(msg); }
function formatError(e) { return e?.message || String(e); }
async function boot() {
  parseUrl();
  registry = await loadRegistry();
  ui.setLevels(registry.numbers, state.level);
  ui.gridCheck.checked = state.grid;
  ui.toolButtons; ui.setTool(state.tool); ui.setViewButtons(state.view);
  ui.preset.value = state.preset;
  bindEvents();
  await loadLevel(state.level);
  loop();
}

async function loadLevel(level) {
  setStatus(`Загрузка level ${level}…`);
  try {
    const { source } = await loadSource(level, { cacheBust: Date.now() });
    rawSource = source;
    draft = deepClone(source);
    ensureRoads(draft);
    undoStack = []; redoStack = []; state.selected = null; state.pendingPoint = null; fieldEditSnapshot = null;
    preview.modelMeta = viewModel();
    const vm = viewModel();
    if (viewManager) { viewManager.dispose(); }
    viewManager = new ViewManager(preview.renderer, ui.canvas, vm);
    viewManager.onChange(markDirty);
    viewManager.setView(state.view, false);
    preview.setGridVisible(state.grid);
    ui.setLevels(registry.numbers, state.level);
    ui.setViewButtons(state.view);
    commitDraft();
    setStatus(`level ${level} · source · ${state.tool} · изменения локальны; скачайте JSON и пересоберите каталог`);
  } catch (e) {
    console.error(e);
    ui.addBanner(`Ошибка загрузки: ${formatError(e)}`, 'error');
    setStatus('Ошибка загрузки');
  }
}

function selectionIsElement(sel, segmentId, elementIndex) {
  return sel?.kind === 'element' && String(sel.segmentId) === String(segmentId) && Number(sel.elementIndex) === Number(elementIndex);
}
function renderInspector() {
  const sel = state.selected;
  if (!sel) { ui.inspectorEmpty('Выберите узел, сегмент или элемент на плане.'); return; }
  if (sel.kind === 'node') {
    const n = findNode(draft, sel.id); if (!n) { state.selected = null; ui.inspectorEmpty('Узел исчез из черновика.'); return; }
    const { inputs } = ui.inspectorNode(n); bindNodeInputs(inputs, n);
  } else if (sel.kind === 'segment') {
    const s = findSegment(draft, sel.segmentId); if (!s) { state.selected = null; ui.inspectorEmpty('Сегмент исчез из черновика.'); return; }
    const { inputs } = ui.inspectorSegment(s); bindSegmentInputs(inputs, s);
  } else if (sel.kind === 'element') {
    const s = findSegment(draft, sel.segmentId); const el = s?.elements?.[sel.elementIndex]; if (!el) { state.selected = null; ui.inspectorEmpty('Элемент исчез из черновика.'); return; }
    const built = ui.inspectorElement(s, sel.elementIndex); if (built) { bindElementInputs(built.inputs, s, sel.elementIndex, built.kind); if (built.endpointInputs) bindEndpointInputs(built.endpointInputs, s, sel.elementIndex, built.kind); }
  }
}
function bindNodeInputs(inputs, node) {
  const update = () => { pushHistory(); const n = findNode(draft, node.id); n.position = [num(inputs.x.value), num(inputs.y.value), num(inputs.z.value)]; n.layer = inputs.layer.value || 'ground'; commitDraft(); };
  for (const i of Object.values(inputs)) i.addEventListener('change', update);
}
function bindSegmentInputs(inputs, seg) {
  const update = () => { pushHistory(); const s = findSegment(draft, seg.id); s.type = inputs.type.value || 'local'; s.layer = inputs.layer.value || 'ground'; commitDraft(); };
  for (const i of Object.values(inputs)) i.addEventListener('change', update);
}
function applyElementInputsToDraft(targetDraft, inputs, segmentId, elementIndex, kind) {
  const el = findElement(targetDraft, segmentId, elementIndex); if (!el) return false;
  if (kind === 'plate') {
    const d = el.plate;
    d.x = num(inputs.x.value); d.z = num(inputs.z.value); d.yaw = num(inputs.yaw.value); d.length = Math.max(0.1, num(inputs.length.value)); d.width = Math.max(2, num(inputs.width.value)); d.y = num(inputs.y.value); d.rise = num(inputs.rise.value);
    if (inputs.widthEnd.value === '') { delete d.widthEnd; delete d.crossStart; delete d.crossEnd; } else { d.widthEnd = Math.max(2, num(inputs.widthEnd.value)); d.crossStart = num(inputs.crossStart.value); d.crossEnd = num(inputs.crossEnd.value); }
    d.rails = !!inputs.rails.checked;
  } else {
    const d = el.arc;
    d.cx = num(inputs.cx.value); d.cz = num(inputs.cz.value); d.radius = Math.max(2, num(inputs.radius.value)); d.width = Math.max(2, num(inputs.width.value)); d.from = num(inputs.from.value); d.to = num(inputs.to.value); d.y = [num(inputs.y0.value), num(inputs.y1.value)]; d.bank = num(inputs.bank.value); d.rails = !!inputs.rails.checked;
  }
  const seg = findSegment(targetDraft, segmentId);
  if (seg) syncSegmentToElements(targetDraft, seg);
  return true;
}
function applyEndpointInputsToDraft(targetDraft, inputs, segmentId, elementIndex, kind) {
  const el = findElement(targetDraft, segmentId, elementIndex); if (!el) return false;
  const ax = num(inputs.ax.value), az = num(inputs.az.value), ay = num(inputs.ay.value), bx = num(inputs.bx.value), bz = num(inputs.bz.value), by = num(inputs.by.value);
  const d = el.plate;
  d.x = r3((ax + bx) / 2); d.z = r3((az + bz) / 2); d.yaw = yawFrom(ax, az, bx, bz); d.length = Math.max(0.1, lenXZ(ax, az, bx, bz)); d.y = r3(ay); d.rise = r3(by - ay);
  const seg = findSegment(targetDraft, segmentId);
  if (seg) syncSegmentToElements(targetDraft, seg);
  return true;
}
function liveEditEndpointInput(inputs, key, segmentId, elementIndex, kind) {
  beginElementFieldEdit();
  const base = JSON.parse(fieldEditSnapshot);
  ensureRoads(base);
  if (kind === 'plate') {
    if (!applyEndpointInputsToDraft(base, inputs, segmentId, elementIndex)) return;
  } else {
    const end = key.startsWith('a') ? 0 : 1;
    const el = findElement(base, segmentId, elementIndex); if (!el?.arc) return;
    if (key === 'ay' || key === 'by') {
      const ys = Array.isArray(el.arc.y) ? [...el.arc.y] : [0, 0];
      ys[end] = r3(num(inputs[key].value));
      el.arc.y = ys;
    } else {
      const sel = { kind: 'element-end', segmentId, elementIndex, end };
      const x = end === 0 ? num(inputs.ax.value) : num(inputs.bx.value);
      const z = end === 0 ? num(inputs.az.value) : num(inputs.bz.value);
      if (!moveElementEnd(base, sel, x, z)) return;
    }
  }
  draft = base;
  preview.rebuild(draft, state.selected);
  markDirty();
}
function bindEndpointInputs(inputs, seg, elementIndex, kind) {
  for (const [key, input] of Object.entries(inputs)) {
    input.addEventListener('focusin', beginElementFieldEdit);
    input.addEventListener('input', () => liveEditEndpointInput(inputs, key, seg.id, elementIndex, kind));
    input.addEventListener('change', finishElementFieldEdit);
  }
}
function beginElementFieldEdit() { if (!fieldEditSnapshot) fieldEditSnapshot = JSON.stringify(draft); }
function liveEditElement(inputs, segmentId, elementIndex, kind) {
  beginElementFieldEdit();
  const base = JSON.parse(fieldEditSnapshot);
  ensureRoads(base);
  if (!applyElementInputsToDraft(base, inputs, segmentId, elementIndex, kind)) return;
  draft = base;
  preview.rebuild(draft, state.selected);
  markDirty();
}
function finishElementFieldEdit() {
  if (!fieldEditSnapshot) return;
  const before = fieldEditSnapshot;
  fieldEditSnapshot = null;
  if (before !== JSON.stringify(draft)) { undoStack.push(before); if (undoStack.length > 100) undoStack.shift(); redoStack = []; }
  commitDraft();
}
function bindElementInputs(inputs, seg, elementIndex, kind) {
  for (const input of Object.values(inputs)) {
    input.addEventListener('focusin', beginElementFieldEdit);
    input.addEventListener('input', () => liveEditElement(inputs, seg.id, elementIndex, kind));
    input.addEventListener('change', finishElementFieldEdit);
  }
}
const num = (v) => Number(v) || 0;

function setSelection(sel) {
  state.selected = sel;
  ui.setTree(draft, state.selected);
  renderInspector();
  preview.selectedId = selectionKey(state.selected);
  commitDraft();
}
function findPick(clientX, clientY) {
  if (!viewManager) return null;
  const rect = ui.canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, viewManager.camera);
  const hits = ray.intersectObjects(preview.pickables, false);
  return hits[0]?.object?.userData?.entityRef || null;
}
function findPickCandidates(clientX, clientY) {
  if (!viewManager) return [];
  const rect = ui.canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, viewManager.camera);
  const hits = ray.intersectObjects(preview.pickables, false);
  const bySegment = new Map();
  for (const hit of hits) {
    const ref = hit.object?.userData?.entityRef;
    if (!ref) continue;
    if (ref.kind !== 'element' && ref.kind !== 'element-end') continue;
    const segmentId = ref.segmentId;
    if (!segmentId || bySegment.has(segmentId)) continue;
    bySegment.set(segmentId, { kind: 'element', segmentId, elementIndex: ref.elementIndex ?? 0, distance: hit.distance });
  }
  return [...bySegment.values()].sort((a, b) => a.distance - b.distance);
}
function deleteWithConfirm(sel) {
  if (!sel) return false;
  if (sel.kind === 'node') {
    const id = String(sel.id);
    const count = ensureRoads(draft).segments.filter(s => String(s.from) === id || String(s.to) === id).length;
    if (count > 0 && !window.confirm(`Узел ${id} связан с ${count} сегмент(ами). Удалить узел и все связанные сегменты?`)) return false;
  }
  fieldEditSnapshot = null;
  pushHistory();
  deleteSelected(draft, sel);
  state.selected = null;
  commitDraft();
  return true;
}
function handleCanvasPointerDown(e) {
  if (e.button !== 0) return;
  const world = viewManager?.screenToWorld(e.clientX, e.clientY);
  if (!world) return;
  const p = snapPoint(world, state.tool === 'add-segment' || state.tool === 'add-arc');
  if (state.tool === 'add-node') {
    const existing = nearestNode(world, Math.max(2, Number(state.snap) || 0));
    if (existing) {
      state.selected = { kind: 'node', id: existing.id };
      commitDraft();
      setStatus(`Узел ${existing.id} уже существует — выбран существующий`);
      return;
    }
    pushHistory();
    const roads = ensureRoads(draft);
    const id = createNodeId(draft, p.x, p.z);
    roads.nodes.push({ id, position: [p.x, 0, p.z], layer: 'ground' });
    state.selected = { kind: 'node', id };
    commitDraft();
    setStatus(`Узел ${id} создан`);
    return;
  }
  if (state.tool === 'add-segment' || state.tool === 'add-arc') {
    if (!state.pendingPoint) { state.pendingPoint = p; setStatus(`Точка A: ${p.x}, ${p.z} — кликните вторую точку`); return; }
    const a = state.pendingPoint, b = p;
    if (lenXZ(a.x, a.z, b.x, b.z) < MIN_SEGMENT_LENGTH) {
      state.pendingPoint = null;
      setStatus('Слишком короткий отрезок — создание отменено');
      return;
    }
    const preset = state.tool === 'add-arc' ? (state.preset.startsWith('arc') ? state.preset : 'arc-left') : state.preset;
    const endY = preset === 'bridge' ? 14 : preset === 'ramp' ? 10 : 0;
    pushHistory();
    const seg = addSegment(draft, a.x, 0, a.z, b.x, endY, b.z, preset);
    state.pendingPoint = null;
    if (!seg) { ui.addBanner('Слишком короткий отрезок — ничего не создано', 'warn'); setStatus('Создание отменено'); return; }
    state.selected = { kind: 'segment', segmentId: seg.id };
    commitDraft();
    setStatus(`Сегмент ${seg.id} создан (${preset})`);
    return;
  }
  if (state.tool === 'fillet-joint') {
    const candidates = findPickCandidates(e.clientX, e.clientY);
    if (!candidates.length) { setStatus('Кликните по дороге (прямым plate-сегментам)'); return; }
    let hit = candidates[0];
    if (state.filletFirst) {
      const other = candidates.find(c => c.segmentId !== state.filletFirst);
      if (other) hit = other; // берём нижележащую/соседнюю дорогу, а не ту, что сверху перекрывает первую
    }
    const segId = hit.segmentId;
    if (!state.filletFirst) {
      state.filletFirst = segId;
      setStatus(`Первая дорога: ${segId} — кликните вторую`);
      return;
    }
    const snapshot = cloneDraft();
    const res = filletJoint(draft, state.filletFirst, segId, state.filletRadius);
    if (!res.ok) {
      draft = snapshot;
      ui.addBanner(res.message || 'Не удалось скруглить стык', 'warn');
      state.filletFirst = null;
      commitDraft();
      return;
    }
    undoStack.push(JSON.stringify(snapshot));
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    state.filletFirst = null;
    state.selected = res.selectedId ? { kind: 'segment', segmentId: res.selectedId } : null;
    ui.setDirty(true, undoStack.length);
    commitDraft();
    ui.addBanner(res.message, 'info');
    setStatus(res.message);
    return;
  }
  if (state.tool === 'delete') {
    const hit = findPick(e.clientX, e.clientY);
    if (hit) { deleteWithConfirm(hit); setStatus('Удалено'); }
    return;
  }
  const hit = findPick(e.clientX, e.clientY);
  if (state.tool === 'select' || state.tool === 'move') {
    if (hit) {
      // В top-виде drag по объекту двигает объект, а карта двигается только с пустой области.
      const canDrag = state.view === 'top';
      const selection = hit.kind === 'element-end'
        ? { kind: 'element', segmentId: hit.segmentId, elementIndex: hit.elementIndex, end: hit.end }
        : hit;
      if (canDrag) {
        dragState = { snapshot: cloneDraft(), start: world, lastWorld: world, sel: hit, raw: { dx: 0, dz: 0 } };
        if (viewManager) viewManager.panning = false;
        setStatus(hit.kind === 'element-end' ? 'Тяните конец элемента' : 'Тяните объект; с пустой области двигается карта');
      } else {
        setStatus('Перетаскивание объектов доступно в top-виде');
      }
      state.selected = selection;
      ui.setTree(draft, state.selected); renderInspector(); markDirty();
    } else if (state.tool === 'select') {
      state.selected = null; ui.setTree(draft, null); renderInspector(); markDirty();
    }
  }
}
function handlePointerMove(e) {
  if (!dragState || (state.tool !== 'move' && state.tool !== 'select')) return;
  // ViewManager обрабатывает mousedown/mousemove отдельно: не даём ему
  // перетягивать карту, когда мы уже тянем выбранный объект.
  if (viewManager) { viewManager.panning = false; viewManager.didDrag = true; }
  const world = viewManager?.screenToWorld(e.clientX, e.clientY); if (!world) return;
  dragState.lastWorld = world;
  const rawDx = world.x - dragState.start.x, rawDz = world.z - dragState.start.z;
  dragState.raw = { dx: rawDx, dz: rawDz };
  if (Math.hypot(rawDx, rawDz) < 0.01 && dragState.sel.kind !== 'element-end') return;
  draft = deepClone(dragState.snapshot);
  if (dragState.sel.kind === 'element-end') {
    if (moveElementEnd(draft, dragState.sel, world.x, world.z)) {
      const s = findSegment(draft, dragState.sel.segmentId);
      if (s) syncSegmentToElements(draft, s);
    }
  }
  else moveSelection(draft, dragState.sel, rawDx, rawDz);
  preview.rebuild(draft, state.selected);
  ui.setTree(draft, state.selected);
  markDirty();
}
function handlePointerUp() {
  if (!dragState) return;
  const before = JSON.stringify(dragState.snapshot);
  draft = deepClone(dragState.snapshot);
  if (dragState.sel.kind === 'element-end') {
    const p = dragState.lastWorld || dragState.start;
    if (moveElementEnd(draft, dragState.sel, state.snap > 0 ? snapCoord(p.x) : r3(p.x), state.snap > 0 ? snapCoord(p.z) : r3(p.z))) {
      const s = findSegment(draft, dragState.sel.segmentId);
      if (s) syncSegmentToElements(draft, s);
    }
  } else {
    const raw = dragState.raw || { dx: 0, dz: 0 };
    moveSelection(draft, dragState.sel, snapCoord(raw.dx), snapCoord(raw.dz));
  }
  // Снапим результат на отпускание: во время drag движение остаётся плавным,
  // а undo получает один нормализованный шаг.
  if (JSON.stringify(draft) !== before) {
    undoStack.push(before);
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    ui.setDirty(true, undoStack.length);
  }
  preview.rebuild(draft, state.selected);
  ui.setTree(draft, state.selected);
  markDirty();
  dragState = null;
}

function handleUiChange(ev) {
  if (!ev) return;
  if (ev.type === 'level') { state.level = ev.value; state.pendingPoint = null; loadLevel(state.level); }
  else if (ev.type === 'view') { state.view = ev.value; viewManager?.setView(ev.value); ui.setViewButtons(state.view); markDirty(); }
  else if (ev.type === 'grid') { state.grid = !!ev.value; preview.setGridVisible(state.grid); markDirty(); }
  else if (ev.type === 'tool') { state.tool = ev.value; ui.setTool(state.tool); ui.canvas.className = `viz-canvas editor-canvas tool-${state.tool}`; state.pendingPoint = null; state.filletFirst = null; setStatus(`Инструмент: ${state.tool}`); }
  else if (ev.type === 'preset') { state.preset = ev.value; }
  else if (ev.type === 'filletRadius') { state.filletRadius = Math.max(2, Number(ev.value) || 15); }
  else if (ev.type === 'autoBuild') { state.autoBuild = !!ev.value; setStatus(`Auto build+check after Save: ${state.autoBuild ? 'вкл' : 'выкл'}`); }
  else if (ev.type === 'snap') { state.snap = Number(ev.value) || 0; }
  else if (ev.type === 'select') { state.selected = ev.value; commitDraft(); }
  else if (ev.type === 'focusRef') { focusRef(ev.value); }
}
function focusRef(ref) {
  if (!ref) return;
  const [kind, a, b] = String(ref).split(':');
  if (kind === 'node') state.selected = { kind: 'node', id: a };
  else if (kind === 'segment') state.selected = { kind: 'segment', segmentId: a };
  else if (kind === 'element') state.selected = { kind: 'element', segmentId: a, elementIndex: Number(b) || 0 };
  commitDraft();
}
async function saveDraft() {
  if (!draft) return;
  const body = JSON.stringify(draft, null, 2);
  try {
    const res = await fetch(`/api/level/${state.level}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok || data?.ok === false) {
      const msg = data?.error || data?.errors?.join('; ') || `${res.status} ${res.statusText}`;
      ui.addBanner(`Save не выполнен: ${msg}. Используйте Download JSON или запустите tools/level-editor-server.mjs --write.`, 'error');
      return;
    }
    rawSource = deepClone(draft);
    undoStack = []; redoStack = [];
    ui.addBanner(`Сохранено в ${data.path || `src/levels/level-${state.level}.json`} (${data.bytes} байт)`, 'info');
    setStatus(`level ${state.level} · сохранено · локальная копия очищена от dirty`);
    ui.setDirty(false, 0);
    markDirty();
    if (state.autoBuild) await rebuildLevel();
  } catch (e) {
    ui.addBanner(`Save не выполнен: ${formatError(e)}. Если открыт python http.server — используйте Download JSON или node tools/level-editor-server.mjs --write.`, 'error');
  }
}
async function rebuildLevel() {
  try {
    setStatus(`Пересборка level ${state.level}…`);
    const res = await fetch(`/api/level/${state.level}/rebuild`, { method: 'POST' });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok || !data) {
      ui.addBanner(`Build+Check не выполнен: ${res.status} ${res.statusText}. Нужен node tools/level-editor-server.mjs --write.`, 'error');
      setStatus(`level ${state.level} · build failed/unavailable`);
      return false;
    }
    if (!data.ok) {
      const stage = data.stage || 'build';
      const failed = data[stage] || data.build || data.check;
      const msg = tailForBanner(`${failed?.stderr || ''}\n${failed?.stdout || ''}`.trim() || `exit ${failed?.code}`);
      ui.addBanner(`${stage === 'build' ? 'build' : 'check'} упал: ${msg}`, 'error');
      setStatus(`level ${state.level} · ${stage} failed`);
      return false;
    }
    ui.addBanner(`build + check OK для level ${state.level} (${(data.build?.ms ?? 0) + (data.check?.ms ?? 0)} мс)`, 'info');
    setStatus(`level ${state.level} · build+check OK`);
    return true;
  } catch (e) {
    ui.addBanner(`Build+Check не выполнен: ${formatError(e)}`, 'error');
    setStatus(`level ${state.level} · build error`);
    return false;
  }
}
function tailForBanner(s, n = 900) { const str = String(s ?? ''); return str.length > n ? '…' + str.slice(str.length - n) : str; }
async function downloadDraft() {
  if (!draft) return;
  const body = JSON.stringify(draft, null, 2);
  const name = `level-${String(state.level).padStart(2, '0')}.json`;
  // Сначала пробуем File System Access API: надёжнее обычного anchor в встроенном браузере.
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(body);
      await writable.close();
      ui.addBanner(`Сохранено: ${name}`, 'info');
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.warn('showSaveFilePicker failed, falling back to blob download', e);
    }
  }
  const blob = new Blob([body], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  ui.addBanner('Download отправлен браузеру; если он не виден — используйте Copy JSON.', 'info');
}
async function copyDraft() {
  if (!draft) return;
  const body = JSON.stringify(draft, null, 2);
  try {
    await navigator.clipboard.writeText(body);
    ui.addBanner('JSON скопирован в буфер.', 'info');
    return;
  } catch (e) {
    console.warn('clipboard.writeText denied, trying execCommand', e);
  }
  // Fallback для встроенного браузера/старых окружений, где Clipboard API запрещён.
  const ta = document.createElement('textarea');
  ta.value = body;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand && document.execCommand('copy'); } catch {}
  ta.remove();
  if (ok) ui.addBanner('JSON скопирован в буфер (fallback).', 'info');
  else ui.addBanner('Буфер недоступен; используйте Save JSON или Download JSON.', 'error');
}
async function handleAction(ev) {
  if (!ev) return;
  if (ev.type === 'undo') { fieldEditSnapshot = null; if (!undoStack.length) return; redoStack.push(JSON.stringify(draft)); draft = JSON.parse(undoStack.pop()); ensureRoads(draft); commitDraft(); }
  else if (ev.type === 'redo') { fieldEditSnapshot = null; if (!redoStack.length) return; undoStack.push(JSON.stringify(draft)); draft = JSON.parse(redoStack.pop()); ensureRoads(draft); commitDraft(); }
  else if (ev.type === 'validate') { const issues = validateDraft(draft); ui.setDiagnostics(issues); if (!issues.length) ui.addBanner('Проверка черновика: ошибок нет', 'info'); }
  else if (ev.type === 'download') { await downloadDraft(); }
  else if (ev.type === 'copyJson') { await copyDraft(); }
  else if (ev.type === 'revert') {
    if (!window.confirm('Откатить ВСЕ несохранённые изменения к src/levels/level-NN.json? Для одного шага используйте Undo.')) return;
    fieldEditSnapshot = null; draft = deepClone(rawSource); ensureRoads(draft); undoStack = []; redoStack = []; state.selected = null; commitDraft();
  }
  else if (ev.type === 'save') { await saveDraft(); }
  else if (ev.type === 'rebuild') { await rebuildLevel(); }
  else if (ev.type === 'duplicate-segment') { pushHistory(); const copy = duplicateSegment(draft, ev.segmentId, 10, 0); state.selected = copy ? { kind: 'segment', segmentId: copy.id } : null; commitDraft(); }
  else if (ev.type === 'add-plate-to-segment' || ev.type === 'add-arc-to-segment') {
    pushHistory();
    const s = findSegment(draft, ev.segmentId); if (s) {
      const path = s.path || [];
      const a = path[0] || [0, 0, 0], b = path[path.length - 1] || [10, 0, 0];
      if (ev.type === 'add-plate-to-segment') s.elements = [...(s.elements || []), { plate: { rails: true, x: r3((a[0] + b[0]) / 2), z: r3((a[2] + b[2]) / 2), yaw: yawFrom(a[0], a[2], b[0], b[2]), length: r3(lenXZ(a[0], a[2], b[0], b[2])), width: 20, y: r3(Math.max(a[1], b[1])), rise: r3(b[1] - a[1]) } }];
      else s.elements = [...(s.elements || []), { arc: { cx: r3((a[0] + b[0]) / 2), cz: r3((a[2] + b[2]) / 2), radius: Math.max(10, lenXZ(a[0], a[2], b[0], b[2])), from: 0, to: 90, width: 10, y: [r3(a[1]), r3(b[1])], bank: 0, rails: true } }];
      state.selected = { kind: 'segment', segmentId: s.id };
    }
    commitDraft();
  }
}
function handleCursorMove(e) {
  const world = viewManager?.screenToWorld(e.clientX, e.clientY);
  ui.setCursor(world || null);
}
function handleCursorLeave() { ui.setCursor(null); }
function bindEvents() {
  ui.canvas.addEventListener('mousemove', handleCursorMove);
  ui.canvas.addEventListener('mouseleave', handleCursorLeave);
  ui.canvas.addEventListener('pointerdown', handleCanvasPointerDown);
  // capture-фаза: выключаем панорамирование ViewManager до его обработчика
  window.addEventListener('mousemove', () => { if (dragState && viewManager) viewManager.panning = false; }, true);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener('resize', () => { viewManager?.resize(); markDirty(); });
  window.addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); handleAction({ type: e.shiftKey ? 'redo' : 'undo' }); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { deleteWithConfirm(state.selected); }
    else if (e.key === 'Escape') { state.pendingPoint = null; state.selected = null; commitDraft(); }
    else if (e.key === '1') handleUiChange({ type: 'view', value: 'top' });
    else if (e.key === '4') handleUiChange({ type: 'view', value: 'free' });
    else if (e.key === '2') handleUiChange({ type: 'view', value: 'front' });
    else if (e.key === '3') handleUiChange({ type: 'view', value: 'side' });
  });
}
function loop() {
  raf = requestAnimationFrame(loop);
  if (!viewManager) return;
  if (viewManager.view === 'free') viewManager.controls.update();
  if (dirty || viewManager.view === 'free') {
    preview.render(viewManager.camera);
    dirty = false;
  }
}
boot().catch(e => { console.error(e); ui.addBanner(`Fatal: ${formatError(e)}`, 'error'); });
