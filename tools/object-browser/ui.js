function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export class BrowserUI {
  constructor(root, { onLevelChange, onSelect, onSearch, onAnimateToggle } = {}) {
    this.onLevelChange = onLevelChange;
    this.onSelect = onSelect;
    this.onSearch = onSearch;
    this.onAnimateToggle = onAnimateToggle;
    this.root = root;

    const wrap = el('div', 'ob-root');
    const sidebar = el('div', 'ob-sidebar');
    const main = el('div', 'ob-main');

    const toolbar = el('div', 'ob-toolbar');
    toolbar.append(el('label', null, 'Уровень:'));
    this.levelSelect = document.createElement('select');
    this.levelSelect.addEventListener('change', () => this.onLevelChange?.(Number(this.levelSelect.value)));
    toolbar.append(this.levelSelect);
    this.search = el('input', 'ob-search');
    this.search.type = 'search';
    this.search.placeholder = 'Поиск по id/типу…';
    this.search.addEventListener('input', () => this.onSearch?.(this.search.value));
    toolbar.append(this.search);

    this.status = el('div', 'ob-status', 'Загрузка…');
    this.list = el('div', 'ob-list');

    sidebar.append(toolbar, this.status, this.list);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ob-canvas';
    this.overlay = el('div', 'ob-overlay');
    this.overlay.style.display = 'none';
    this.banner = el('div', 'ob-banner');
    this.banner.style.display = 'none';

    this.controlsBar = el('div', 'ob-controls');
    this.controlsBar.style.display = 'none';
    const animLabel = el('label', 'ob-toggle');
    this.animateCheck = document.createElement('input');
    this.animateCheck.type = 'checkbox';
    this.animateCheck.addEventListener('change', () => this.onAnimateToggle?.(this.animateCheck.checked));
    animLabel.append(this.animateCheck, document.createTextNode(' Анимация'));
    this.controlsBar.append(animLabel);

    main.append(this.canvas, this.overlay, this.controlsBar, this.banner);

    wrap.append(sidebar, main);
    root.append(wrap);

    this._items = new Map(); // id -> {item, el}
    this._groups = [];
    this._selectedId = null;
  }

  setLevels(nums, current) {
    this.levelSelect.innerHTML = '';
    for (const n of nums) {
      const o = document.createElement('option');
      o.value = String(n);
      o.textContent = `level-${String(n).padStart(2,'0')}`;
      if (n === current) o.selected = true;
      this.levelSelect.append(o);
    }
  }

  setStatus(text) { this.status.textContent = text || ''; }

  setBanner(text) {
    if (!text) { this.banner.style.display = 'none'; this.banner.textContent = ''; return; }
    this.banner.style.display = '';
    this.banner.textContent = text;
  }

  renderGroups(groups, filter = '') {
    this.list.innerHTML = '';
    this._items.clear();
    this._groups = groups || [];
    const q = (filter || '').trim().toLowerCase();
    let total = 0, shown = 0;

    for (const g of groups) {
      const items = (g.items || []).filter(it => {
        total++;
        if (!q) return true;
        const hay = `${it.id} ${it.label || ''} ${it.type || ''} ${it.meta || ''} ${g.title || ''}`.toLowerCase();
        return hay.includes(q);
      });
      if (!items.length) continue;

      const sec = el('div', 'ob-group');
      const header = el('div', 'ob-group-header');
      const title = el('span', null, g.title || g.id);
      const count = el('span', 'ob-group-count', String(items.length));
      header.append(title, count);
      header.addEventListener('click', () => sec.classList.toggle('collapsed'));
      const body = el('div', 'ob-group-items');

      for (const it of items) {
        shown++;
        const row = el('div', 'ob-item');
        const label = document.createElement('span');
        label.textContent = it.label || it.id;
        row.append(label);
        if (it.meta) {
          const meta = el('span', 'ob-item-meta', it.meta);
          row.append(meta);
        }
        row.title = `${it.type || ''} ${it.id}`.trim();
        row.addEventListener('click', () => this.onSelect?.(it));
        body.append(row);
        this._items.set(it.id, { item: it, el: row });
      }

      sec.append(header, body);
      this.list.append(sec);
    }

    if (!this.list.children.length) {
      this.list.append(el('div', 'ob-empty', q ? 'Ничего не найдено' : 'Нет объектов'));
    }
    this.setStatus(q ? `Показано: ${shown} из ${total}` : `Объектов: ${total} · Групп: ${groups.length}`);
  }

  setSelected(id) {
    if (this._selectedId && this._items.has(this._selectedId)) {
      this._items.get(this._selectedId).el.classList.remove('selected');
    }
    this._selectedId = id || null;
    if (id && this._items.has(id)) {
      const entry = this._items.get(id);
      entry.el.classList.add('selected');
      try { entry.el.scrollIntoView({ block: 'nearest' }); } catch {}
    }
  }

  setAnimateControl({ visible, enabled }) {
    this.controlsBar.style.display = visible ? '' : 'none';
    this.animateCheck.checked = !!enabled;
    this.animateCheck.disabled = !visible;
  }

  setOverlay(item) {
    if (!item) { this.overlay.style.display = 'none'; this.overlay.innerHTML = ''; return; }
    this.overlay.style.display = '';
    this.overlay.innerHTML = '';
    const h = el('h3', null, item.label || item.id);
    this.overlay.append(h);
    const lines = [];
    lines.push(`Тип: ${item.type || '—'}`);
    lines.push(`ID: ${item.id}`);
    if (item.districtId != null) lines.push(`Район: ${item.districtId}`);
    if (item.entity?.origin) lines.push(`Источник: ${item.entity.origin}`);
    if (item.entity?.bbox) {
      const b = item.entity.bbox;
      const w = (b.maxX-b.minX).toFixed(2), d = (b.maxZ-b.minZ).toFixed(2), hgt = (b.maxY-b.minY).toFixed(2);
      lines.push(`Размер: ${w} × ${hgt} × ${d} м`);
    }
    if (item.entity?.attrs?.floorsCount != null) lines.push(`Этажей: ${item.entity.attrs.floorsCount}`);
    for (const t of lines.slice(1)) this.overlay.append(el('div', 'muted', t));
    if (item.animatable) {
      this.overlay.append(el('div', 'muted', 'Анимация: переключатель справа вверху'));
    }
  }
}
