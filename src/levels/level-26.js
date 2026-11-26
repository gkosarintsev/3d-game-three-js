/**
 * Глава 26 — «Букингемский дворец»: импортированная GLB-сцена дворца,
 * двора, ограды, Мемориала Виктории, парков и Мэлл.
 *
 * Карта — внешний GLB-макет (ModelMap, контракт src/map.js): твёрдость
 * извлекается из меша в сетку колонок, навигация строится по проходимым
 * клеткам. Геометрия/текстуры — данные ассета, не хардкод движка.
 *
 * Источник сцены: C:\Temp\005\scenes\scene-002 (Buckingham Palace 3D,
 * перенос из docs/buckingham-palace-3d, 5 итераций детализации).
 * Атрибуция ассета также в README.md.
 */
export const LEVEL_26 = {
  name: 'Глава 26. Букингемский дворец',
  hint: 'Осмотрись у дворца и дойди до точки выхода.',
  map: {
    kind: 'model',
    // Путь относительно корня сервера (python -m http.server из корня репо).
    asset: 'src/assets/scene-002/scene.glb',
    // GLB уже в метрах; scaleFrom.tallestTower из CONFIG.model дал бы
    // перескалирование 60 м → 150 м, поэтому фиксируем масштаб 1:1.
    scale: 1,
    // Окно покрывает bounds сцены (x: -460..420, z: -460..460) с запасом.
    // Центр окна становится (0,0) мира главы.
    window: { x: -20, z: 0, size: 920 },
    albedo: 0.45,
    spawn: { x: 0, z: 200 },
  },
  sky: {
    sky: 0x6f9bc4,
    fog: { color: 0xd4dfe9, near: 240, far: 1400 },
    sun: { color: 0xfff5e4, intensity: 2.25, position: [85, 96, 95] },
    hemi: { sky: 0xbfd7f0, ground: 0x7a7568, intensity: 1.0 },
  },
  gameplay: {
    goal: 'exit',
    spawn: { x: 0, z: 200 },
    exit: { x: 0, z: -120 },
    exitRadius: 8,
    enemies: { count: 3 },
    alienEnemies: { count: 1 },
  },
};
