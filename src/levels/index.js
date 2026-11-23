/**
 * Реестр глав: порядок массива = порядок прохождения (как главы Half-Life).
 * Новая глава — новый файл-определение + строка здесь; движок не правим.
 *
 * Номера глав в реестре не совпадают с позицией: часть глав удалена, и
 * `LEVEL_NUMBERS` держит прежние номера рядом с именами файлов. По ним меню
 * отладки и отчёт бюджетов находят каталог главы (`level-NN`), поэтому номер
 * нельзя выводить из индекса массива.
 *
 * Scope (v3/v4, TASK-001): legacy главы 01,02,04,06,11,12,13,14 удалены (см. ADR-001,
 * .ai/plans/01-city-generator-districts.md). Главы 03,05 удалены по запросу. В реестре остаются
 * v3 CityForge/open: 07,08,09,10,15, пилот v4 — глава 16, тестовая копия — глава 17 (4 чанка),
 * глава 18 (мост), глава 19 (турбинная развязка), профильные пилоты v4/citygen — главы 20,21,
 * быстрая smoke-глава для локальных тестов — глава 22, разнообразные главы 23,24.
 *
 * Главы 07,08,09,10,15,16,17,18,19,20,21,22,23,24,25 — **открытый мир** (`kind: 'open'`): v3 CityForge
 * (07,08,09,10,15) и v4 citygen/test (16,17,18,19,20,21,22,23,24,25). Источник `src/levels/level-NN.json`,
 * скомпилированный каталог `src/levels/level-NN/`
 * (`node tools/build-level.mjs src/levels/level-NN.json`).
 * Глава 26 — GLB-макет (`kind: 'model'`, ModelMap): ассет `src/assets/scene-002/scene.glb`.
 */
import { LEVEL_07 } from './level-07/index.js';
import { LEVEL_08 } from './level-08/index.js';
import { LEVEL_09 } from './level-09/index.js';
import { LEVEL_10 } from './level-10/index.js';
import { LEVEL_15 } from './level-15/index.js';
import { LEVEL_16 } from './level-16/index.js';
import { LEVEL_17 } from './level-17/index.js';
import { LEVEL_18 } from './level-18/index.js';
import { LEVEL_19 } from './level-19/index.js';
import { LEVEL_20 } from './level-20/index.js';
import { LEVEL_21 } from './level-21/index.js';
import { LEVEL_22 } from './level-22/index.js';
import { LEVEL_23 } from './level-23/index.js';
import { LEVEL_24 } from './level-24/index.js';
import { LEVEL_25 } from './level-25/index.js';
import { LEVEL_26 } from './level-26.js';

export const LEVELS = [
  LEVEL_07, LEVEL_08, LEVEL_09, LEVEL_10, LEVEL_15, LEVEL_16, LEVEL_17, LEVEL_18, LEVEL_19, LEVEL_20, LEVEL_21, LEVEL_22, LEVEL_23, LEVEL_24, LEVEL_25, LEVEL_26,
];

/** Номер главы для каждой позиции `LEVELS` (файлы/каталоги `level-NN`). */
export const LEVEL_NUMBERS = [7, 8, 9, 10, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26];
