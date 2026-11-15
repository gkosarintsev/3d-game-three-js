import { Game } from './game.js';
import { CONFIG } from './config.js';
import { LEVEL_NUMBERS } from './levels/index.js';

const params = new URLSearchParams(location.search);
// ?level=16 — номер главы из реестра (LEVEL_NUMBERS), не индекс массива.
const levelParam = params.get('level');
let initialLevel = 0;
if (levelParam != null) {
  const n = Number(levelParam);
  const idx = Number.isInteger(n) ? LEVEL_NUMBERS.indexOf(n) : -1;
  if (idx >= 0) initialLevel = idx;
  else console.warn(`?level=${levelParam}: глава не найдена в реестре, старт с первой`);
}

const game = new Game(initialLevel);
game.start();
// отладочная точка входа для консоли страницы (см. AGENTS.md); модули её не используют
window.game = game;

// отладочное меню (выбор глав, live-параметры) — только с ?debug=1, см. src/debug.js
if (new URLSearchParams(location.search).has('debug')) {
  import('./debug.js').then(m => m.mountDebug(game));
}

// отладочный переключатель физики (Часть II плана открытого мира): 'own' по
// умолчанию и эталон вердиктов; 'rapier' — @dimforge/rapier3d-compat. Читается
// до загрузки главы, чтобы первая сборка уже шла в выбранном режиме.
const physicsMode = new URLSearchParams(location.search).get('physics');
if (physicsMode === 'own' || physicsMode === 'rapier') {
  CONFIG.physics.mode = physicsMode;
}
