import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { JsonMap } from '../../src/json-map.js';

function disposeObject(obj) {
  if (!obj) return;
  obj.traverse?.((o) => {
    if (o.geometry) { try { o.geometry.dispose(); } catch {} }
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        // карты/текстуры материалов: у общих материалов props их не трогаем (sharedMaterial),
        // но для одиночных превью JsonMap мы чистим карту целиком через map.dispose/release.
        for (const k of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap','bumpMap','displacementMap']) {
          try { m?.[k]?.dispose?.(); } catch {}
        }
        try { m?.dispose?.(); } catch {}
      }
    }
  });
}

function makeGrid(size = 40, step = 2) {
  const g = new THREE.GridHelper(size, Math.max(2, Math.round(size / step)), 0x33465f, 0x243040);
  if (Array.isArray(g.material)) g.material.forEach(m => { m.transparent = true; m.opacity = 0.6; });
  else { g.material.transparent = true; g.material.opacity = 0.6; }
  return g;
}

function bboxFromObject(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  if (!isFinite(box.min.x)) return null;
  return box;
}

function centerAndPlaceOnGrid(root) {
  // центрируем по XZ и ставим основание на y=0 для удобного просмотра
  const box = bboxFromObject(root);
  if (!box) return;
  const c = new THREE.Vector3(); box.getCenter(c);
  root.position.x -= c.x;
  root.position.z -= c.z;
  // пересчитать после сдвига XZ
  const box2 = bboxFromObject(root);
  if (box2) root.position.y -= box2.min.y;
}

function buildLevelBaseSpec(levelData) {
  const src = levelData?.source || {};
  const idx = levelData?.compiledIndex || {};
  const ground = src.ground || idx.ground || { y: 0, size: 1280, color: 0x6fb04a };
  const bounds = idx.bounds || (src.cityforge?.world?.bounds && Array.isArray(src.cityforge.world.bounds.min) ? {
    minX: src.cityforge.world.bounds.min[0], minZ: src.cityforge.world.bounds.min[2],
    maxX: src.cityforge.world.bounds.max[0], maxZ: src.cityforge.world.bounds.max[2],
  } : null) || { minX: -ground.size / 2, maxX: ground.size / 2, minZ: -ground.size / 2, maxZ: ground.size / 2 };
  const spawn = src.gameplay?.spawn || idx.spawn || { x: 0, z: 0 };
  const spec = {
    kind: 'json',
    ground: { ...ground },
    bounds: { ...bounds },
    spawn: { ...spawn },
    buildings: [], roads: [], channels: [], props: [], lights: [], tunnels: [],
  };
  if (src.windows) spec.windows = src.windows;
  if (src.signage) spec.signage = src.signage;
  if (src.clutter) spec.clutter = src.clutter;
  if (idx.relief) spec.relief = idx.relief; else if (src.relief) spec.relief = src.relief;
  return spec;
}

export class ObjectViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setClearColor(0x0d1117, 1);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 8000);
    this.camera.position.set(6, 5, 8);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 1, 0);

    const hemi = new THREE.HemisphereLight(0xbfdcff, 0x445566, 1.0);
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(12, 20, 10);
    const amb = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(hemi, dir, amb);

    this.grid = makeGrid(40, 2);
    this.scene.add(this.grid);

    this.content = new THREE.Group();
    this.scene.add(this.content);

    this._current = null; // { root, kind, update(dt,t), dispose(), animatable, setAnimate(on), applyStatic() }
    this.animateEnabled = false;
    this._t = 0;
    this._raf = 0;
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width));
    const h = Math.max(1, Math.floor(r.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  clear() {
    if (this._current) {
      try { this._current.dispose?.(); } catch {}
      if (this._current.root) {
        this.content.remove(this._current.root);
        // корень детального JsonMap превью чистит map.dispose внутри dispose(), но на всякий случай
        if (!this._current.skipDisposeObject) disposeObject(this._current.root);
      }
      this._current = null;
    }
    while (this.content.children.length) {
      const c = this.content.children[0];
      this.content.remove(c);
      disposeObject(c);
    }
  }

  frameObject(obj, padding = 1.35) {
    const box = bboxFromObject(obj);
    if (!box) {
      this.controls.target.set(0, 1, 0);
      this.camera.position.set(6, 5, 8);
      this.controls.update();
      return;
    }
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z, 0.5);
    const dist = maxDim * padding * 1.2 / Math.tan((this.camera.fov * Math.PI / 180) / 2);
    const dir = new THREE.Vector3(1, 0.6, 1).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, Math.max(dist, 2));
    this.camera.near = Math.max(0.05, dist / 100);
    this.camera.far = Math.max(8000, dist * 20);
    this.camera.updateProjectionMatrix();
    this.controls.update();

    // adjust grid to object
    this.scene.remove(this.grid);
    disposeObject(this.grid);
    const gsize = Math.max(20, Math.ceil(maxDim * 4 / 10) * 10);
    this.grid = makeGrid(gsize, gsize >= 80 ? 10 : gsize >= 40 ? 5 : 2);
    this.grid.position.y = box.min.y - 0.001;
    this.scene.add(this.grid);
  }

  setContent(root, opts = {}) {
    this.clear();
    this._t = 0;
    if (root) this.content.add(root);
    this._current = {
      root,
      kind: opts.kind || null,
      update: opts.update || null,
      dispose: opts.dispose || null,
      animatable: !!opts.animatable,
      setAnimate: opts.setAnimate || null,
      applyStatic: opts.applyStatic || null,
      skipDisposeObject: !!opts.skipDisposeObject,
    };
    if (opts.frame !== false) this.frameObject(root || this.content);
    this.setAnimationEnabled(this.animateEnabled);
  }

  setAnimationEnabled(on) {
    this.animateEnabled = !!on;
    const cur = this._current;
    if (!cur) return;
    try { cur.setAnimate?.(this.animateEnabled); } catch {}
    if (!this.animateEnabled) {
      try { cur.applyStatic?.(); } catch {}
    }
  }

  async _showDetailedLevelObject(item, levelData) {
    const raw = item.rawData || item.entity?.attrs?.raw || item.entity?.raw;
    if (!raw) throw new Error('Нет сырых данных объекта для детального превью');
    const spec = buildLevelBaseSpec(levelData);
    const coll = ({ building: 'buildings', prop: 'props', road: 'roads', channel: 'channels', tunnel: 'tunnels', light: 'lights' })[item.type];
    if (!coll) throw new Error(`Неизвестный тип объекта: ${item.type}`);
    spec[coll] = [raw];
    // без зеркал воды — объект показываем отдельно, не "на карте"
    spec.waterRects = [];

    let map = null;
    const group = new THREE.Group();
    group.name = `detail-${item.type}-${item.id}`;
    try {
      map = new JsonMap(spec);
    } catch (e) {
      e.message = `JsonMap init: ${e.message}`;
      throw e;
    }
    await new Promise(r => setTimeout(r, 0));
    try {
      map.build(group);
    } catch (e) {
      try { map.dispose?.(); } catch {}
      e.message = `JsonMap build: ${e.message}`;
      throw e;
    }

    // JsonMap.build всегда добавляет грунт уровня первым объектом (и воду, если есть).
    // Для превью показываем только сам объект, без карты/подложки.
    try {
      const objs = Array.isArray(map.sceneObjects) ? map.sceneObjects : [];
      let removeCount = 0;
      if (objs[0]) removeCount = 1; // ground
      const waterN = Array.isArray(map.waterRects) ? map.waterRects.length : 0;
      // вода (если вдруг задана) идёт сразу после грунта отдельными мешами
      removeCount += waterN;
      for (let i = 0; i < removeCount && i < objs.length; i++) {
        try { objs[i]?.parent?.remove(objs[i]); } catch {}
      }
    } catch {}

    centerAndPlaceOnGrid(group);
    const dispose = () => {
      try { map.dispose?.(); } catch {}
      // запасная очистка геометрий/материалов (текстуры фасадов внутри houseTex уже отданы map.dispose)
      try { disposeObject(group); } catch {}
    };
    this.setContent(group, { kind: item.type, dispose, animatable: false, skipDisposeObject: true });
  }

  showGenericFallback(item) {
    const group = new THREE.Group();
    const b = item.entity?.bbox;
    const mat = new THREE.MeshStandardMaterial({ color: 0x5f748a, roughness: 0.8 });
    if (b) {
      const w = Math.max(0.3, b.maxX - b.minX), h = Math.max(0.3, b.maxY - b.minY), d = Math.max(0.3, b.maxZ - b.minZ);
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xcfe3ff, transparent: true, opacity: 0.45 })));
      group.add(mesh);
    } else {
      group.add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), mat));
    }
    centerAndPlaceOnGrid(group);
    this.setContent(group, { kind: item.type || 'generic' });
  }

  async showEnemySoldier(variant = 'assault') {
    const mod = await import('../../src/soldier.js');
    const rig = mod.buildEnemySoldier(variant);
    if (rig.root) rig.root.position.y = 0;
    // начальная статическая поза
    try { rig.applyPose?.(0.016, 0, 0, 0, 0); } catch {}
    let animate = false;
    const setAnimate = (on) => { animate = !!on; };
    const applyStatic = () => { try { rig.applyPose?.(0.016, 0, 0, 0, 0); } catch {} };
    const update = (dt, t) => {
      if (!animate) return;
      try { rig.applyPose?.(dt, t, 0.7, 0, 0); } catch {} // ходьба/бег
    };
    const dispose = () => { try { rig.dispose?.(); } catch {} };
    this.setContent(rig.root, { kind: 'enemy_soldier', update, dispose, animatable: true, setAnimate, applyStatic });
  }

  async showEnemyAlien() {
    const { createXenomorphRig, createProceduralTextures, XenoAnimator } = await import('../../src/xenomorph.js');
    const tex = createProceduralTextures(4);
    const rig = createXenomorphRig({ textures: tex });
    const root = rig.root || rig.group || rig;
    const animator = XenoAnimator ? new XenoAnimator() : null;
    // стартовая поза
    try { animator?.update?.(rig, 0.016, { move: 0, run: false }); } catch {}
    let animate = false;
    const setAnimate = (on) => { animate = !!on; };
    const applyStatic = () => { try { animator?.update?.(rig, 0.016, { move: 0, run: false }); } catch {} };
    const update = (dt) => {
      if (!animate) return;
      try { animator?.update?.(rig, dt, { move: 1, run: false }); } catch {}
    };
    const dispose = () => {
      try {
        for (const v of Object.values(tex || {})) { try { v?.dispose?.(); } catch {} }
      } catch {}
      // геометрии/материалы рига чистятся через disposeObject(root)
    };
    this.setContent(root, { kind: 'enemy_alien', update, dispose, animatable: true, setAnimate, applyStatic });
  }

  async showItem(item, levelData = null) {
    if (!item) { this.clear(); return; }
    try {
      if (item.type === 'enemy_soldier') return await this.showEnemySoldier(item.variant || 'assault');
      if (item.type === 'enemy_alien') return await this.showEnemyAlien();
      if (['building', 'prop', 'road', 'channel', 'tunnel', 'light'].includes(item.type)) {
        try {
          return await this._showDetailedLevelObject(item, levelData);
        } catch (e) {
          console.warn('Detailed preview failed, fallback to bbox:', e);
          return this.showGenericFallback(item);
        }
      }
      return this.showGenericFallback(item);
    } catch (e) {
      console.error(e);
      this.showGenericFallback(item);
      throw e;
    }
  }

  isCurrentAnimatable() {
    return !!this._current?.animatable;
  }

  start() {
    if (this._raf) return;
    let last = performance.now();
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this._t += dt;
      try { this._current?.update?.(dt, this._t); } catch {}
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this._raf = requestAnimationFrame(loop);
  }

  dispose() {
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.clear();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
