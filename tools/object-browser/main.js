import { loadRegistry, buildCatalog } from './catalog.js';
import { BrowserUI } from './ui.js';
import { ObjectViewer } from './viewer.js';

const state = {
  level: 18,
  filter: '',
  selectedId: null,
  catalog: null,
  animate: false,
};

function readUrl() {
  const p = new URLSearchParams(location.search);
  if (p.has('level')) state.level = Number(p.get('level')) || state.level;
  if (p.has('q')) state.filter = p.get('q') || '';
  if (p.has('sel')) state.selectedId = p.get('sel') || null;
  if (p.has('anim')) state.animate = p.get('anim') === '1';
}

function writeUrl() {
  const p = new URLSearchParams();
  p.set('level', String(state.level));
  if (state.filter) p.set('q', state.filter);
  if (state.selectedId) p.set('sel', state.selectedId);
  if (state.animate) p.set('anim', '1');
  history.replaceState(null, '', `${location.pathname}?${p.toString()}`);
}

const ui = new BrowserUI(document.getElementById('app'), {
  onLevelChange: (n) => { state.level = n; state.selectedId = null; writeUrl(); loadCatalog(); },
  onSearch: (q) => { state.filter = q; ui.renderGroups(state.catalog?.groups || [], state.filter); writeUrl(); },
  onSelect: (item) => selectItem(item),
  onAnimateToggle: (on) => {
    state.animate = !!on;
    viewer.setAnimationEnabled(state.animate);
    ui.setAnimateControl({ visible: viewer.isCurrentAnimatable(), enabled: state.animate });
    writeUrl();
  },
});

const viewer = new ObjectViewer(ui.canvas);
viewer.setAnimationEnabled(state.animate);
viewer.start();

function findItemById(id) {
  if (!id || !state.catalog) return null;
  for (const g of state.catalog.groups || []) {
    for (const it of g.items || []) if (it.id === id) return it;
  }
  return null;
}

async function selectItem(item) {
  state.selectedId = item?.id || null;
  ui.setSelected(state.selectedId);
  ui.setOverlay(item || null);
  ui.setBanner('');
  ui.setAnimateControl({ visible: !!item?.animatable, enabled: state.animate });
  writeUrl();
  if (!item) { viewer.clear(); return; }
  ui.setStatus('Построение детального превью…');
  try {
    await viewer.showItem(item, state.catalog?.levelData || null);
    ui.setAnimateControl({ visible: viewer.isCurrentAnimatable(), enabled: state.animate });
  } catch (e) {
    console.error(e);
    ui.setBanner(`Ошибка превью: ${e?.message || e}`);
  } finally {
    // восстановим статус каталога
    const total = (state.catalog?.groups || []).reduce((s,g)=>s + (g.items?.length || 0), 0);
    ui.setStatus(state.filter ? ui.status.textContent : `Объектов: ${total} · Групп: ${(state.catalog?.groups||[]).length}`);
  }
}

async function loadCatalog() {
  ui.setStatus(`Загрузка каталога level-${String(state.level).padStart(2,'0')}…`);
  ui.setBanner('');
  ui.setAnimateControl({ visible: false, enabled: state.animate });
  ui.renderGroups([], '');
  try {
    const cat = await buildCatalog(state.level);
    state.catalog = cat;
    const warns = cat.meta?.warnings || [];
    if (warns.length) ui.setBanner(warns.join(' | '));
    ui.search.value = state.filter;
    ui.renderGroups(cat.groups, state.filter);
    // restore selection
    let sel = state.selectedId ? findItemById(state.selectedId) : null;
    if (!sel) {
      // default: first building if any, else first item
      for (const g of cat.groups) {
        if (g.items?.length) { sel = g.items[0]; break; }
      }
    }
    if (sel) await selectItem(sel);
    else { ui.setStatus(`Объектов: 0`); viewer.clear(); }
  } catch (e) {
    console.error(e);
    ui.setStatus('Ошибка загрузки каталога');
    ui.setBanner(String(e?.message || e));
    viewer.clear();
  }
}

async function boot() {
  readUrl();
  const reg = await loadRegistry();
  const nums = reg.numbers || [7,8,9,10,15,16,17,18,19];
  if (!nums.includes(state.level)) state.level = nums[nums.length - 1] || 18;
  ui.setLevels(nums, state.level);
  ui.search.value = state.filter;
  ui.setAnimateControl({ visible: false, enabled: state.animate });
  await loadCatalog();
}

boot();
