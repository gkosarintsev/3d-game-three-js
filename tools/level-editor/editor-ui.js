import { ROAD_LAYERS, ROAD_TYPES, readNetwork, nodePos, validateDraft, elementEndpoints, arcEndpoints } from './source-model.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export class EditorUI {
  constructor(root, { onChange, onAction }) {
    this.root = root; this.onChange = onChange || (() => {}); this.onAction = onAction || (() => {});
    this.state = { level: 19, view: 'top', grid: true, tool: 'select', preset: 'ground', snap: 5, dirty: false, historyDepth: 0, autoBuild: false };
    this.selected = null;
    this.issues = [];
    this.build();
  }

  build() {
    this.root.innerHTML = '';
    this.toolbar = el('div', 'editor-toolbar');
    this.left = el('div', 'editor-left');
    this.right = el('div', 'editor-right');
    this.status = el('div', 'editor-status', 'Загрузка…');
    this.wrap = el('div', 'editor-canvas-wrap');
    this.canvas = document.createElement('canvas'); this.canvas.className = 'viz-canvas editor-canvas'; this.canvas.tabIndex = 0;
    this.bannerHost = el('div', 'viz-banners');
    this.wrap.append(this.canvas, this.bannerHost);
    const mid = el('div', 'editor-mid'); mid.append(this.left, this.wrap, this.right);
    this.root.append(this.toolbar, mid, this.status);
    this.buildToolbar(); this.buildLeft(); this.buildRight();
  }

  buildToolbar() {
    const addBtn = (label, title, ev) => { const b = el('button', 'viz-btn', label); b.title = title || label; b.addEventListener('click', () => this.onAction(ev)); return b; };
    this.levelSelect = document.createElement('select'); this.levelSelect.addEventListener('change', () => this.onChange({ type: 'level', value: Number(this.levelSelect.value) }));
    this.toolButtons = {};
    const tools = el('div', 'editor-tool-group');
    for (const [id, label] of [['select', 'Выбор'], ['move', 'Двигать'], ['add-node', '+ Узел'], ['add-segment', '+ Сегмент'], ['add-arc', '+ Дуга'], ['fillet-joint', 'Скруглить стык'], ['delete', 'Удалить']]) {
      const b = el('button', 'viz-btn editor-tool', label); b.dataset.tool = id; b.addEventListener('click', () => this.onChange({ type: 'tool', value: id })); this.toolButtons[id] = b; tools.append(b);
    }
    this.preset = document.createElement('select');
    for (const [v, label] of [['ground', 'Земля · ширина 20'], ['bridge', 'Мост · y 14'], ['ramp', 'Подъём · rise +10'], ['taper', 'Расширение → 30/+5'], ['arc-left', 'Левый съезд (arc)'], ['arc-right', 'Правый съезд (arc)']]) { const o = document.createElement('option'); o.value = v; o.textContent = label; this.preset.append(o); }
    this.preset.addEventListener('change', () => this.onChange({ type: 'preset', value: this.preset.value }));
    this.snapInput = document.createElement('input'); this.snapInput.type = 'number'; this.snapInput.min = '0'; this.snapInput.step = '1'; this.snapInput.value = '5'; this.snapInput.title = 'snap, м (0 — выкл.)'; this.snapInput.addEventListener('input', () => this.onChange({ type: 'snap', value: Number(this.snapInput.value) }));
    this.filletInput = document.createElement('input'); this.filletInput.type = 'number'; this.filletInput.min = '1'; this.filletInput.step = '1'; this.filletInput.value = '15'; this.filletInput.className = 'editor-fillet-input'; this.filletInput.title = 'радиус скругления стыка, м'; this.filletInput.addEventListener('input', () => this.onChange({ type: 'filletRadius', value: Number(this.filletInput.value) }));
    const grid = el('label', 'viz-inline'); this.gridCheck = document.createElement('input'); this.gridCheck.type = 'checkbox'; this.gridCheck.checked = true; this.gridCheck.addEventListener('change', () => this.onChange({ type: 'grid', value: this.gridCheck.checked })); grid.append(this.gridCheck, ' grid');
    const views = el('div', 'viz-view-btns'); this.viewBtns = {};
    for (const [id, label] of [['top', '1 top'], ['free', '4 free'], ['front', '2 front'], ['side', '3 side']]) { const b = el('button', 'viz-btn', label); b.addEventListener('click', () => this.onChange({ type: 'view', value: id })); this.viewBtns[id] = b; views.append(b); }
    this.undoBtn = addBtn('Undo', 'Ctrl+Z', { type: 'undo' }); this.redoBtn = addBtn('Redo', 'Ctrl+Shift+Z', { type: 'redo' });
    this.validateBtn = addBtn('Validate', 'Быстрая проверка черновика', { type: 'validate' });
    this.saveBtn = addBtn('Save JSON', 'Записать draft в src/levels/level-NN.json через local dev-endpoint (tools/level-editor-server.mjs --write). Иначе — 403 и используйте Download.', { type: 'save' });
    const autoWrap = el('label', 'viz-inline editor-autobuild'); this.autoBuildCheck = document.createElement('input'); this.autoBuildCheck.type = 'checkbox'; this.autoBuildCheck.checked = !!this.state.autoBuild; this.autoBuildCheck.title = 'После Save выполнить node tools/build-level.mjs src/levels/level-NN.json и --check'; this.autoBuildCheck.addEventListener('change', () => this.onChange({ type: 'autoBuild', value: this.autoBuildCheck.checked })); autoWrap.append(this.autoBuildCheck, ' build+check');
    this.rebuildBtn = addBtn('Build + Check', 'Пересобрать каталог и проверить (build-level + --check). Только через node tools/level-editor-server.mjs --write.', { type: 'rebuild' });
    this.expandBtn = addBtn('Expand generated', 'Развернуть процедурный v4-источник генератором (как при build-level) и сделать дороги/здания редактируемыми. Можно отменить через Undo.', { type: 'expand' });
    this.copyBtn = addBtn('Copy JSON', 'Копировать черновик JSON в буфер обмена', { type: 'copyJson' });
    this.downloadBtn = addBtn('Download JSON', 'Скачать черновик level-NN.json', { type: 'download' });
    this.revertBtn = addBtn('Revert', 'Откатить все несохранённые изменения к src/levels/level-NN.json', { type: 'revert' });
    this.toolbar.append(el('span', 'viz-tool-label', 'Level'), this.levelSelect, tools, el('span', 'viz-tool-label', 'Preset'), this.preset, el('span', 'viz-tool-label', 'snap'), this.snapInput, el('span', 'viz-tool-label', 'R'), this.filletInput, grid, views, this.undoBtn, this.redoBtn, this.validateBtn, autoWrap, this.saveBtn, this.rebuildBtn, this.expandBtn, this.downloadBtn, this.copyBtn, this.revertBtn);
  }

  buildLeft() {
    this.tree = el('div', 'viz-panel editor-tree');
    this.tree.append(el('div', 'viz-panel-title', 'Роад-граф (черновик)'));
    this.treeBody = el('div', 'editor-tree-body');
    this.tree.append(this.treeBody);
    this.diag = el('div', 'viz-panel editor-diagnostics');
    this.diag.append(el('div', 'viz-panel-title', 'Диагностика'));
    this.diagBody = el('div', 'viz-diag-body', 'Нажмите Validate…');
    this.diag.append(this.diagBody);
    this.left.append(this.tree, this.diag);
  }

  buildRight() {
    this.inspector = el('div', 'viz-panel viz-inspector editor-inspector');
    this.inspector.append(el('div', 'viz-panel-title', 'Инспектор'));
    this.inspectorBody = el('div', 'viz-inspector-body', 'Выберите узел, сегмент или элемент на плане.');
    this.inspector.append(this.inspectorBody);

    this.cursor = el('div', 'viz-panel editor-cursor');
    this.cursor.append(el('div', 'viz-panel-title', 'Курсор'));
    this.cursorBody = el('div', 'editor-cursor-body', 'Курсор не над картой.');
    this.cursor.append(this.cursorBody);

    this.right.append(this.inspector, this.cursor);
  }

  setLevels(nums, selected) { this.levelSelect.innerHTML = ''; for (const n of nums) { const o = document.createElement('option'); o.value = String(n); o.textContent = `level ${n}`; this.levelSelect.append(o); } this.levelSelect.value = String(selected); }
  setViewButtons(view) { for (const [k, b] of Object.entries(this.viewBtns)) b.classList.toggle('active', k === view); for (const [k, b] of Object.entries(this.toolButtons)) b.classList.toggle('active', k === this.state.tool); }
  setTool(tool) { this.state.tool = tool; this.setViewButtons(this.state.view); }

  setTree(draft, selected) {
    this.treeBody.innerHTML = '';
    const net = readNetwork(draft);
    const addRow = (label, cls, onClick, depth = 0) => { const row = el('div', 'editor-tree-row ' + cls); row.style.paddingLeft = `${depth * 12 + 6}px`; row.textContent = label; row.addEventListener('click', onClick); if (selected && this.sameSel(selected, cls, row.dataset?.ref)) row.classList.add('selected'); this.treeBody.append(row); return row; };
    const nodeSel = selId => selected?.kind === 'node' && String(selected.id) === String(selId);
    const segSel = selId => selected?.kind === 'segment' && String(selected.segmentId) === String(selId);
    const elSel = (sid, i) => selected?.kind === 'element' && String(selected.segmentId) === String(sid) && Number(selected.elementIndex) === i;
    const nodes = new Map(net.nodes.map(n => [n.id, n]));
    addRow(`Узлы (${net.nodes.length})`, 'editor-tree-group', () => {}, 0);
    for (const n of net.nodes.slice(0, 60)) { const row = addRow(`${n.id}  [${n.position.map(v => Number(v).toFixed(1)).join(', ')}]`, 'editor-tree-node', () => this.onChange({ type: 'select', value: { kind: 'node', id: n.id } }), 1); if (nodeSel(n.id)) row.classList.add('selected'); }
    if (net.nodes.length > 60) addRow(`… ещё ${net.nodes.length - 60}`, 'editor-tree-muted', () => {}, 1);
    addRow(`Сегменты (${net.segments.length})`, 'editor-tree-group', () => {}, 0);
    for (const s of net.segments) { const row = addRow(`${s.id}  ${s.type}/${s.layer}  ${s.from}→${s.to}`, 'editor-tree-segment', () => this.onChange({ type: 'select', value: { kind: 'segment', segmentId: s.id } }), 1); if (segSel(s.id)) row.classList.add('selected');
      s.elements.forEach((e, i) => { const erow = addRow(`[${i}] ${e.kind}${e.data?.width ? '  w=' + e.data.width : ''}${e.data?.radius ? '  R=' + e.data.radius : ''}`, 'editor-tree-element', () => this.onChange({ type: 'select', value: { kind: 'element', segmentId: s.id, elementIndex: i } }), 2); if (elSel(s.id, i)) erow.classList.add('selected'); });
    }
  }

  sameSel() { return false; }

  setDiagnostics(issues) {
    this.issues = issues || [];
    this.diagBody.innerHTML = '';
    if (!this.issues.length) { this.diagBody.append(el('div', 'viz-muted', 'Ошибок нет.')); return; }
    for (const d of this.issues.slice(0, 150)) {
      const row = el('div', 'viz-diag-row ' + (d.severity === 'error' ? 'warn' : 'info')); row.textContent = `[${d.code}] ${d.message}`; row.title = d.message;
      if (d.ref) row.addEventListener('click', () => this.onChange({ type: 'focusRef', value: d.ref }));
      this.diagBody.append(row);
    }
  }

  addBanner(text, kind = 'info') { const b = el('div', 'viz-banner ' + kind); b.append(el('span', 'viz-banner-text', text)); this.bannerHost.append(b); setTimeout(() => b.remove(), 6000); }
  setLoading(text) { this.status.textContent = text || ''; }
  setStatus(text) { this.status.textContent = text; }
  setCursor(point) {
    if (!this.cursorBody) return;
    if (!point) { this.cursorBody.innerHTML = ''; this.cursorBody.append(el('div', 'viz-muted', 'Курсор не над картой.')); return; }
    this.cursorBody.innerHTML = '';
    const fmt = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '—';
    for (const [k, v] of [['x', point.x], ['y', point.y], ['z', point.z]]) {
      const row = el('div', 'viz-kv');
      row.append(el('span', 'viz-k', k), el('span', 'viz-v', fmt(v)));
      this.cursorBody.append(row);
    }
  }
  setDirty(dirty, depth = 0) { this.state.dirty = !!dirty; this.state.historyDepth = depth; this.downloadBtn.classList.toggle('active', !!dirty); }

  inspectorEmpty(msg) { this.inspectorBody.innerHTML = ''; this.inspectorBody.append(el('div', 'viz-muted', msg || 'Выберите объект.')); }
  field(label, value, { step = '1', type = 'number' } = {}) {
    const row = el('label', 'editor-field'); row.append(el('span', 'viz-k', label));
    const input = document.createElement('input'); input.className = 'editor-input'; input.type = type; input.step = step; input.value = value ?? '';
    row.append(input); this.inspectorBody.append(row); return input;
  }
  inspectorNode(node) {
    this.inspectorBody.innerHTML = ''; this.inspectorBody.append(el('div', 'viz-muted', 'Узел роад-графа'));
    const id = this.field('id', node.id, { type: 'text' }); id.readOnly = true;
    const p = nodePos(node);
    const x = this.field('x, м', p.x, { step: '0.5' }); const y = this.field('y, м', p.y, { step: '0.5' }); const z = this.field('z, м', p.z, { step: '0.5' });
    const layer = this.field('layer', node.layer || 'ground', { type: 'text' });
    return { inputs: { x, y, z, layer }, kind: 'node' };
  }
  inspectorSegment(seg) {
    this.inspectorBody.innerHTML = ''; this.inspectorBody.append(el('div', 'viz-muted', 'Сегмент (path + elements)'));
    const id = this.field('id', seg.id, { type: 'text' }); id.readOnly = true;
    const type = this.field('type', seg.type || 'local', { type: 'text' }); const layer = this.field('layer', seg.layer || 'ground', { type: 'text' });
    const from = this.field('from', seg.from || '', { type: 'text' }); from.readOnly = true; const to = this.field('to', seg.to || '', { type: 'text' }); to.readOnly = true;
    const actions = el('div', 'viz-actions'); const dup = el('button', 'viz-btn', 'Duplicate +10m'); dup.addEventListener('click', () => this.onAction({ type: 'duplicate-segment', segmentId: seg.id })); actions.append(dup);
    const addPlate = el('button', 'viz-btn', '+ plate'); addPlate.addEventListener('click', () => this.onAction({ type: 'add-plate-to-segment', segmentId: seg.id })); actions.append(addPlate);
    const addArc = el('button', 'viz-btn', '+ arc'); addArc.addEventListener('click', () => this.onAction({ type: 'add-arc-to-segment', segmentId: seg.id })); actions.append(addArc);
    this.inspectorBody.append(actions);
    return { inputs: { type, layer }, kind: 'segment' };
  }
  inspectorElement(seg, elementIndex) {
    this.inspectorBody.innerHTML = ''; const elData = seg.elements?.[elementIndex]; if (!elData) { this.inspectorEmpty('Элемент не найден.'); return null; }
    this.inspectorBody.append(el('div', 'viz-muted', `${seg.id} · element[${elementIndex}]`));
    const kind = elData.plate ? 'plate' : elData.arc ? 'arc' : 'unknown';
    const kindRow = el('div', 'viz-kv'); kindRow.textContent = `kind: ${kind}`; this.inspectorBody.append(kindRow);
    if (elData.plate) { const d = elData.plate;
      const x = this.field('x, м', d.x, { step: '0.5' }); const z = this.field('z, м', d.z, { step: '0.5' }); const yaw = this.field('yaw, град', d.yaw ?? 0, { step: '0.5' });
      const length = this.field('length, м', d.length, { step: '0.5' }); const width = this.field('width, м', d.width, { step: '0.1' }); const y = this.field('y, м', d.y ?? 0, { step: '0.1' }); const rise = this.field('rise, м', d.rise ?? 0, { step: '0.1' });
      const widthEnd = this.field('widthEnd, м', d.widthEnd ?? '', { step: '0.1' }); const crossStart = this.field('crossStart, м', d.crossStart ?? '', { step: '0.1' }); const crossEnd = this.field('crossEnd, м', d.crossEnd ?? '', { step: '0.1' });
      const rails = this.check('rails', !!d.rails);
      this.inspectorBody.append(el('div', 'viz-panel-title', 'Концы элемента'));
      const [A, B] = elementEndpoints(d);
      const ax = this.field('A x, м', A.x, { step: '0.5' }); const az = this.field('A z, м', A.z, { step: '0.5' }); const ay = this.field('A y, м', A.y, { step: '0.1' });
      const bx = this.field('B x, м', B.x, { step: '0.5' }); const bz = this.field('B z, м', B.z, { step: '0.5' }); const by = this.field('B y, м', B.y, { step: '0.1' });
      return { inputs: { x, z, yaw, length, width, y, rise, widthEnd, crossStart, crossEnd, rails }, endpointInputs: { ax, az, ay, bx, bz, by }, kind: 'plate' };
    }
    if (elData.arc) { const d = elData.arc;
      const cx = this.field('cx, м', d.cx, { step: '0.5' }); const cz = this.field('cz, м', d.cz, { step: '0.5' }); const radius = this.field('radius, м', d.radius, { step: '0.5' }); const width = this.field('width, м', d.width, { step: '0.1' });
      const from = this.field('from, град', d.from, { step: '0.5' }); const to = this.field('to, град', d.to, { step: '0.5' }); const y0 = this.field('y0, м', Array.isArray(d.y) ? d.y[0] : d.y, { step: '0.1' }); const y1 = this.field('y1, м', Array.isArray(d.y) ? d.y[1] : d.y, { step: '0.1' }); const bank = this.field('bank, град', d.bank ?? 0, { step: '0.5' }); const rails = this.check('rails', !!d.rails);
      this.inspectorBody.append(el('div', 'viz-panel-title', 'Концы элемента'));
      const [A, B] = arcEndpoints(d);
      const ax = this.field('A x, м', A.x, { step: '0.5' }); const az = this.field('A z, м', A.z, { step: '0.5' }); const ay = this.field('A y, м', A.y, { step: '0.1' });
      const bx = this.field('B x, м', B.x, { step: '0.5' }); const bz = this.field('B z, м', B.z, { step: '0.5' }); const by = this.field('B y, м', B.y, { step: '0.1' });
      return { inputs: { cx, cz, radius, width, from, to, y0, y1, bank, rails }, endpointInputs: { ax, az, ay, bx, bz, by }, kind: 'arc' };
    }
    return null;
  }
  check(label, checked) { const row = el('label', 'viz-check-row editor-check'); const c = document.createElement('input'); c.type = 'checkbox'; c.checked = checked; row.append(c, ' ', label); this.inspectorBody.append(row); return c; }
}
