/**
 * СГЕНЕРИРОВАННО — руками не править.
 *
 * Источник правки: src/levels/level-23.json. После его изменения запуск
 * `node tools/build-level.mjs src/levels/level-23.json` перезаписывает этот файл и все
 * бинарные файлы каталога побайтово одинаково (ГПСЧ в разрезке нет, ключи и
 * объекты отсортированы).
 *
 * Открытая глава: геометрии здесь нет. Мир лежит по клеткам `cells[]`, у каждой
 * — прямоугольник в мировых осях и свой файл `chunk-<i>-<j>.l14b` с данными
 * `JsonMap` в бинарном кодеке (src/level-bin.js) в тех же мировых осях. Скелет
 * — глобальная сеть улиц/русов/дверей — лежит в `skeleton.l14b` плоскими
 * typed arrays и догружается top-level await; в браузере и в Node один и тот же
 * модуль, поэтому загрузка идёт через `fetch` относительного URL с откатом на
 * `node:fs` под Node.
 *
 * Файлы клеток берёт `WorldMap.chunkUrl` из `catalog` — браузерного пути
 * каталога от корня сайта.
 * Предупреждения парсера:
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *   — roads[4] (tr_main_g_3): настил на tr_main_g_3 ниже 1.2 м над землёй — под ним не пройти
 *
 */
import { decodeSkeleton } from '../../level-bin.js';

async function loadSkel() {
  const url = new URL('./skeleton.l14b', import.meta.url);
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    return readFileSync(fileURLToPath(url));
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ': ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

export const LEVEL_23 = {
  "gameplay": {
    "alienEnemies": {
      "count": 3
    },
    "cars": {
      "count": 2,
      "spots": [
        {
          "x": -560,
          "y": 0.12,
          "yaw": 90,
          "z": -520
        },
        {
          "x": 480,
          "y": 0,
          "yaw": 180,
          "z": 560
        }
      ]
    },
    "enemies": {
      "count": 7
    },
    "exit": {
      "x": 520,
      "z": 520
    },
    "exitRadius": 4,
    "goal": "exit"
  },
  "hint": "Разнообразный процедурный город: река, холмистый рельеф, разные районы и дороги. Доберитесь до маяка.",
  "map": {
    "bodyProbe": 1.2,
    "bounds": {
      "maxX": 640,
      "maxZ": 640,
      "minX": -640,
      "minZ": -640
    },
    "catalog": "/src/levels/level-23",
    "cells": [
      {
        "file": "chunk-0-0.l14b",
        "id": "0_0",
        "objects": {
          "buildings": 27,
          "lights": 1,
          "props": 15,
          "roads": 11
        },
        "rect": {
          "maxX": -384,
          "maxZ": -384,
          "minX": -640,
          "minZ": -640
        }
      },
      {
        "file": "chunk-0-1.l14b",
        "id": "0_1",
        "objects": {
          "buildings": 23,
          "props": 5,
          "roads": 5
        },
        "rect": {
          "maxX": -384,
          "maxZ": -128,
          "minX": -640,
          "minZ": -384
        }
      },
      {
        "file": "chunk-0-2.l14b",
        "id": "0_2",
        "objects": {
          "buildings": 19,
          "lights": 1,
          "props": 5,
          "roads": 2
        },
        "rect": {
          "maxX": -384,
          "maxZ": 128,
          "minX": -640,
          "minZ": -128
        }
      },
      {
        "file": "chunk-0-3.l14b",
        "id": "0_3",
        "objects": {
          "buildings": 3,
          "props": 16
        },
        "rect": {
          "maxX": -384,
          "maxZ": 384,
          "minX": -640,
          "minZ": 128
        }
      },
      {
        "file": "chunk-0-4.l14b",
        "id": "0_4",
        "objects": {
          "buildings": 12,
          "props": 4
        },
        "rect": {
          "maxX": -384,
          "maxZ": 640,
          "minX": -640,
          "minZ": 384
        }
      },
      {
        "file": "chunk-1-0.l14b",
        "id": "1_0",
        "objects": {
          "buildings": 3,
          "channels": 1,
          "props": 21,
          "roads": 3
        },
        "rect": {
          "maxX": -128,
          "maxZ": -384,
          "minX": -384,
          "minZ": -640
        }
      },
      {
        "file": "chunk-1-1.l14b",
        "id": "1_1",
        "objects": {
          "channels": 1,
          "props": 3
        },
        "rect": {
          "maxX": -128,
          "maxZ": -128,
          "minX": -384,
          "minZ": -384
        }
      },
      {
        "file": "chunk-1-2.l14b",
        "id": "1_2",
        "objects": {
          "buildings": 1,
          "channels": 2,
          "props": 7,
          "roads": 7
        },
        "rect": {
          "maxX": -128,
          "maxZ": 128,
          "minX": -384,
          "minZ": -128
        }
      },
      {
        "file": "chunk-1-3.l14b",
        "id": "1_3",
        "objects": {
          "buildings": 1,
          "channels": 1,
          "lights": 1,
          "props": 5,
          "roads": 12
        },
        "rect": {
          "maxX": -128,
          "maxZ": 384,
          "minX": -384,
          "minZ": 128
        }
      },
      {
        "file": "chunk-1-4.l14b",
        "id": "1_4",
        "objects": {
          "buildings": 16,
          "channels": 1,
          "props": 9,
          "roads": 9
        },
        "rect": {
          "maxX": -128,
          "maxZ": 640,
          "minX": -384,
          "minZ": 384
        }
      },
      {
        "file": "chunk-2-0.l14b",
        "id": "2_0",
        "objects": {
          "buildings": 22,
          "lights": 1,
          "props": 14,
          "roads": 1
        },
        "rect": {
          "maxX": 128,
          "maxZ": -384,
          "minX": -128,
          "minZ": -640
        }
      },
      {
        "file": "chunk-2-1.l14b",
        "id": "2_1",
        "objects": {
          "props": 19,
          "roads": 5
        },
        "rect": {
          "maxX": 128,
          "maxZ": -128,
          "minX": -128,
          "minZ": -384
        }
      },
      {
        "file": "chunk-2-2.l14b",
        "id": "2_2",
        "objects": {
          "buildings": 4,
          "channels": 1,
          "props": 16,
          "roads": 11
        },
        "rect": {
          "maxX": 128,
          "maxZ": 128,
          "minX": -128,
          "minZ": -128
        }
      },
      {
        "file": "chunk-2-3.l14b",
        "id": "2_3",
        "objects": {
          "buildings": 2,
          "props": 14,
          "roads": 8
        },
        "rect": {
          "maxX": 128,
          "maxZ": 384,
          "minX": -128,
          "minZ": 128
        }
      },
      {
        "file": "chunk-2-4.l14b",
        "id": "2_4",
        "objects": {
          "buildings": 29,
          "lights": 1,
          "props": 22,
          "roads": 16
        },
        "rect": {
          "maxX": 128,
          "maxZ": 640,
          "minX": -128,
          "minZ": 384
        }
      },
      {
        "file": "chunk-3-0.l14b",
        "id": "3_0",
        "objects": {
          "buildings": 28,
          "props": 16,
          "roads": 1
        },
        "rect": {
          "maxX": 384,
          "maxZ": -384,
          "minX": 128,
          "minZ": -640
        }
      },
      {
        "file": "chunk-3-1.l14b",
        "id": "3_1",
        "objects": {
          "buildings": 1,
          "props": 23,
          "roads": 4
        },
        "rect": {
          "maxX": 384,
          "maxZ": -128,
          "minX": 128,
          "minZ": -384
        }
      },
      {
        "file": "chunk-3-2.l14b",
        "id": "3_2",
        "objects": {
          "lights": 1,
          "props": 15,
          "roads": 6
        },
        "rect": {
          "maxX": 384,
          "maxZ": 128,
          "minX": 128,
          "minZ": -128
        }
      },
      {
        "file": "chunk-3-3.l14b",
        "id": "3_3",
        "objects": {
          "buildings": 2,
          "props": 15,
          "roads": 3
        },
        "rect": {
          "maxX": 384,
          "maxZ": 384,
          "minX": 128,
          "minZ": 128
        }
      },
      {
        "file": "chunk-3-4.l14b",
        "id": "3_4",
        "objects": {
          "buildings": 36,
          "props": 18,
          "roads": 6
        },
        "rect": {
          "maxX": 384,
          "maxZ": 640,
          "minX": 128,
          "minZ": 384
        }
      },
      {
        "file": "chunk-4-0.l14b",
        "id": "4_0",
        "objects": {
          "buildings": 19,
          "lights": 1,
          "props": 3,
          "roads": 1
        },
        "rect": {
          "maxX": 640,
          "maxZ": -384,
          "minX": 384,
          "minZ": -640
        }
      },
      {
        "file": "chunk-4-1.l14b",
        "id": "4_1",
        "objects": {
          "buildings": 38,
          "props": 37,
          "roads": 1
        },
        "rect": {
          "maxX": 640,
          "maxZ": -128,
          "minX": 384,
          "minZ": -384
        }
      },
      {
        "file": "chunk-4-2.l14b",
        "id": "4_2",
        "objects": {
          "buildings": 36,
          "props": 33,
          "roads": 1
        },
        "rect": {
          "maxX": 640,
          "maxZ": 128,
          "minX": 384,
          "minZ": -128
        }
      },
      {
        "file": "chunk-4-3.l14b",
        "id": "4_3",
        "objects": {
          "buildings": 41,
          "props": 26,
          "roads": 1
        },
        "rect": {
          "maxX": 640,
          "maxZ": 384,
          "minX": 384,
          "minZ": 128
        }
      },
      {
        "file": "chunk-4-4.l14b",
        "id": "4_4",
        "objects": {
          "buildings": 26,
          "lights": 1,
          "props": 30,
          "roads": 77
        },
        "rect": {
          "maxX": 640,
          "maxZ": 640,
          "minX": 384,
          "minZ": 384
        }
      }
    ],
    "ground": {
      "color": 7322954,
      "size": 1280,
      "y": 0
    },
    "kind": "open",
    "navEdgeProbe": 1.2,
    "relief": {
      "baseY": 0,
      "blend": 14,
      "cell": 24,
      "hills": [
        {
          "bx": -54.5,
          "bz": -343.3,
          "height": 5.7,
          "id": "hill_1",
          "radius": 339.9,
          "x": -54.5,
          "z": -343.3
        },
        {
          "bx": -63.8,
          "bz": -310.3,
          "height": 17.4,
          "id": "hill_2",
          "radius": 334.5,
          "x": -63.8,
          "z": -310.3
        },
        {
          "bx": 177.5,
          "bz": -410,
          "height": 13,
          "id": "hill_3",
          "radius": 339.1,
          "x": 177.5,
          "z": -410
        },
        {
          "bx": -481.1,
          "bz": -240,
          "height": 15,
          "id": "hill_4",
          "radius": 249.6,
          "x": -481.1,
          "z": -240
        },
        {
          "bx": -500.3,
          "bz": -407,
          "height": 3.749,
          "id": "platform_1",
          "radius": 82.7,
          "x": -500.3,
          "z": -407
        },
        {
          "bx": 482.9,
          "bz": 427.6,
          "height": 0,
          "id": "platform_2",
          "radius": 106.4,
          "x": 482.9,
          "z": 427.6
        },
        {
          "bx": -544,
          "bz": -544,
          "height": 0,
          "id": "platform_3",
          "radius": 42.8,
          "x": -544,
          "z": -544
        }
      ],
      "maxSlope": 0.61,
      "pads": [],
      "rivers": [
        {
          "bankY": 0,
          "bedY": -4,
          "halfW": 11,
          "ramp": 30,
          "segments": [
            {
              "ax": null,
              "az": null,
              "bx": null,
              "bz": null
            },
            {
              "ax": -345.6,
              "az": -384,
              "bx": -313.6,
              "bz": -192
            },
            {
              "ax": null,
              "az": null,
              "bx": null,
              "bz": null
            },
            {
              "ax": null,
              "az": null,
              "bx": null,
              "bz": null
            },
            {
              "ax": null,
              "az": null,
              "bx": null,
              "bz": null
            },
            {
              "ax": null,
              "az": null,
              "bx": null,
              "bz": null
            }
          ],
          "surfaceY": -0.2
        },
        {
          "bankY": 0,
          "bedY": -2.698,
          "halfW": 5.731,
          "ramp": 30,
          "segments": [
            {
              "ax": -313.6,
              "az": 0,
              "bx": -231.8,
              "bz": -16.4
            },
            {
              "ax": -231.8,
              "az": -16.4,
              "bx": -154.5,
              "bz": -31.8
            },
            {
              "ax": -154.5,
              "az": -31.8,
              "bx": -77.3,
              "bz": -47.3
            }
          ],
          "surfaceY": -0.2
        }
      ],
      "roadCorridors": [
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_main_g_1",
          "points": [
            {
              "x": -520,
              "y": 0,
              "z": -520
            },
            {
              "x": -508.75,
              "y": 0,
              "z": -520
            },
            {
              "x": -497.5,
              "y": 0,
              "z": -520
            },
            {
              "x": -486.25,
              "y": 0,
              "z": -520
            },
            {
              "x": -475,
              "y": 0,
              "z": -520
            },
            {
              "x": -463.75,
              "y": 0,
              "z": -520
            },
            {
              "x": -452.5,
              "y": 0,
              "z": -520
            },
            {
              "x": -441.25,
              "y": 0,
              "z": -520
            },
            {
              "x": -430,
              "y": 0,
              "z": -520
            },
            {
              "x": -418.75,
              "y": 0,
              "z": -520
            },
            {
              "x": -407.5,
              "y": 0,
              "z": -520
            },
            {
              "x": -396.25,
              "y": 0,
              "z": -520
            },
            {
              "x": -385,
              "y": 0,
              "z": -520
            },
            {
              "x": -374.75,
              "y": 1.15,
              "z": -520
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_sp2_r",
          "points": [
            {
              "x": -520,
              "y": 0,
              "z": -520
            },
            {
              "x": -520,
              "y": 0,
              "z": -508
            },
            {
              "x": -520,
              "y": 0,
              "z": -496
            },
            {
              "x": -520,
              "y": 0.02,
              "z": -484
            },
            {
              "x": -520,
              "y": 0.46,
              "z": -472
            },
            {
              "x": -520,
              "y": 1.35,
              "z": -460
            },
            {
              "x": -520,
              "y": 2.53,
              "z": -448
            },
            {
              "x": -520,
              "y": 3.85,
              "z": -436
            },
            {
              "x": -520,
              "y": 5.15,
              "z": -424
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_sp4_r",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 508
            },
            {
              "x": 520,
              "y": 0,
              "z": 496
            },
            {
              "x": 520,
              "y": 0,
              "z": 484
            },
            {
              "x": 520,
              "y": 0,
              "z": 472
            },
            {
              "x": 520,
              "y": 0,
              "z": 460
            },
            {
              "x": 520,
              "y": 0,
              "z": 448
            },
            {
              "x": 520,
              "y": 0,
              "z": 436
            },
            {
              "x": 520,
              "y": 0,
              "z": 424
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_7",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 508,
              "y": 0,
              "z": 520
            },
            {
              "x": 496,
              "y": 0,
              "z": 520
            },
            {
              "x": 484,
              "y": 0,
              "z": 520
            },
            {
              "x": 472,
              "y": 0,
              "z": 520
            },
            {
              "x": 460,
              "y": 0,
              "z": 520
            },
            {
              "x": 448,
              "y": 0,
              "z": 520
            },
            {
              "x": 436,
              "y": 0,
              "z": 520
            },
            {
              "x": 424,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_9",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 531.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 542.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 554.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 565.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 577.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 588.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 600,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_10",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 508.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 497.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 485.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 474.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 462.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 451.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 440,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_11",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 531.43
            },
            {
              "x": 520,
              "y": 0,
              "z": 542.86
            },
            {
              "x": 520,
              "y": 0,
              "z": 554.29
            },
            {
              "x": 520,
              "y": 0,
              "z": 565.71
            },
            {
              "x": 520,
              "y": 0,
              "z": 577.14
            },
            {
              "x": 520,
              "y": 0,
              "z": 588.57
            },
            {
              "x": 520,
              "y": 0,
              "z": 600
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_12",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 508.57
            },
            {
              "x": 520,
              "y": 0,
              "z": 497.14
            },
            {
              "x": 520,
              "y": 0,
              "z": 485.71
            },
            {
              "x": 520,
              "y": 0,
              "z": 474.29
            },
            {
              "x": 520,
              "y": 0,
              "z": 462.86
            },
            {
              "x": 520,
              "y": 0,
              "z": 451.43
            },
            {
              "x": 520,
              "y": 0,
              "z": 440
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_13",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 530.67,
              "y": 0,
              "z": 520
            },
            {
              "x": 541.33,
              "y": 0,
              "z": 520
            },
            {
              "x": 552,
              "y": 0,
              "z": 520
            },
            {
              "x": 562.67,
              "y": 0,
              "z": 520
            },
            {
              "x": 573.33,
              "y": 0,
              "z": 520
            },
            {
              "x": 584,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_14",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 509.33,
              "y": 0,
              "z": 520
            },
            {
              "x": 498.67,
              "y": 0,
              "z": 520
            },
            {
              "x": 488,
              "y": 0,
              "z": 520
            },
            {
              "x": 477.33,
              "y": 0,
              "z": 520
            },
            {
              "x": 466.67,
              "y": 0,
              "z": 520
            },
            {
              "x": 456,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_15",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 530.67
            },
            {
              "x": 520,
              "y": 0,
              "z": 541.33
            },
            {
              "x": 520,
              "y": 0,
              "z": 552
            },
            {
              "x": 520,
              "y": 0,
              "z": 562.67
            },
            {
              "x": 520,
              "y": 0,
              "z": 573.33
            },
            {
              "x": 520,
              "y": 0,
              "z": 584
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_16",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 509.33
            },
            {
              "x": 520,
              "y": 0,
              "z": 498.67
            },
            {
              "x": 520,
              "y": 0,
              "z": 488
            },
            {
              "x": 520,
              "y": 0,
              "z": 477.33
            },
            {
              "x": 520,
              "y": 0,
              "z": 466.67
            },
            {
              "x": 520,
              "y": 0,
              "z": 456
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_17",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 532,
              "y": 0,
              "z": 520
            },
            {
              "x": 544,
              "y": 0,
              "z": 520
            },
            {
              "x": 556,
              "y": 0,
              "z": 520
            },
            {
              "x": 568,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_18",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 508,
              "y": 0,
              "z": 520
            },
            {
              "x": 496,
              "y": 0,
              "z": 520
            },
            {
              "x": 484,
              "y": 0,
              "z": 520
            },
            {
              "x": 472,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_19",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 532
            },
            {
              "x": 520,
              "y": 0,
              "z": 544
            },
            {
              "x": 520,
              "y": 0,
              "z": 556
            },
            {
              "x": 520,
              "y": 0,
              "z": 568
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_20",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 508
            },
            {
              "x": 520,
              "y": 0,
              "z": 496
            },
            {
              "x": 520,
              "y": 0,
              "z": 484
            },
            {
              "x": 520,
              "y": 0,
              "z": 472
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_21",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 530,
              "y": 0,
              "z": 520
            },
            {
              "x": 540,
              "y": 0,
              "z": 520
            },
            {
              "x": 550,
              "y": 0,
              "z": 520
            },
            {
              "x": 560,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_22",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 510,
              "y": 0,
              "z": 520
            },
            {
              "x": 500,
              "y": 0,
              "z": 520
            },
            {
              "x": 490,
              "y": 0,
              "z": 520
            },
            {
              "x": 480,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_23",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 530
            },
            {
              "x": 520,
              "y": 0,
              "z": 540
            },
            {
              "x": 520,
              "y": 0,
              "z": 550
            },
            {
              "x": 520,
              "y": 0,
              "z": 560
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_24",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 510
            },
            {
              "x": 520,
              "y": 0,
              "z": 500
            },
            {
              "x": 520,
              "y": 0,
              "z": 490
            },
            {
              "x": 520,
              "y": 0,
              "z": 480
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_26",
          "points": [
            {
              "x": 632,
              "y": 0,
              "z": 520
            },
            {
              "x": 632,
              "y": 0,
              "z": 531.2
            },
            {
              "x": 632,
              "y": 0,
              "z": 542.4
            },
            {
              "x": 632,
              "y": 0,
              "z": 553.6
            },
            {
              "x": 632,
              "y": 0,
              "z": 564.8
            },
            {
              "x": 632,
              "y": 0,
              "z": 576
            },
            {
              "x": 632,
              "y": 0,
              "z": 587.2
            },
            {
              "x": 632,
              "y": 0,
              "z": 598.4
            },
            {
              "x": 632,
              "y": 0,
              "z": 609.6
            },
            {
              "x": 632,
              "y": 0,
              "z": 620.8
            },
            {
              "x": 632,
              "y": 0,
              "z": 632
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_27",
          "points": [
            {
              "x": 632,
              "y": 0,
              "z": 520
            },
            {
              "x": 632,
              "y": 0,
              "z": 508.8
            },
            {
              "x": 632,
              "y": 0,
              "z": 497.6
            },
            {
              "x": 632,
              "y": 0,
              "z": 486.4
            },
            {
              "x": 632,
              "y": 0,
              "z": 475.2
            },
            {
              "x": 632,
              "y": 0,
              "z": 464
            },
            {
              "x": 632,
              "y": 0,
              "z": 452.8
            },
            {
              "x": 632,
              "y": 0,
              "z": 441.6
            },
            {
              "x": 632,
              "y": 0,
              "z": 430.4
            },
            {
              "x": 632,
              "y": 0,
              "z": 419.2
            },
            {
              "x": 632,
              "y": 0,
              "z": 408
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_28",
          "points": [
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 508.8,
              "y": 0,
              "z": 520
            },
            {
              "x": 497.6,
              "y": 0,
              "z": 520
            },
            {
              "x": 486.4,
              "y": 0,
              "z": 520
            },
            {
              "x": 475.2,
              "y": 0,
              "z": 520
            },
            {
              "x": 464,
              "y": 0,
              "z": 520
            },
            {
              "x": 452.8,
              "y": 0,
              "z": 520
            },
            {
              "x": 441.6,
              "y": 0,
              "z": 520
            },
            {
              "x": 430.4,
              "y": 0,
              "z": 520
            },
            {
              "x": 419.2,
              "y": 0,
              "z": 520
            },
            {
              "x": 408,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_29",
          "points": [
            {
              "x": 408,
              "y": 0,
              "z": 540
            },
            {
              "x": 408,
              "y": 0,
              "z": 542.4
            },
            {
              "x": 408,
              "y": 0,
              "z": 553.6
            },
            {
              "x": 408,
              "y": 0,
              "z": 564.8
            },
            {
              "x": 408,
              "y": 0,
              "z": 576
            },
            {
              "x": 408,
              "y": 0,
              "z": 587.2
            },
            {
              "x": 408,
              "y": 0,
              "z": 598.4
            },
            {
              "x": 408,
              "y": 0,
              "z": 609.6
            },
            {
              "x": 408,
              "y": 0,
              "z": 620.8
            },
            {
              "x": 408,
              "y": 0,
              "z": 632
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_30",
          "points": [
            {
              "x": 408,
              "y": 0,
              "z": 500
            },
            {
              "x": 408,
              "y": 0,
              "z": 497.6
            },
            {
              "x": 408,
              "y": 0,
              "z": 486.4
            },
            {
              "x": 408,
              "y": 0,
              "z": 475.2
            },
            {
              "x": 408,
              "y": 0,
              "z": 464
            },
            {
              "x": 408,
              "y": 0,
              "z": 452.8
            },
            {
              "x": 408,
              "y": 0,
              "z": 441.6
            },
            {
              "x": 408,
              "y": 0,
              "z": 430.4
            },
            {
              "x": 408,
              "y": 0,
              "z": 419.2
            },
            {
              "x": 408,
              "y": 0,
              "z": 500
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_32",
          "points": [
            {
              "x": 616,
              "y": 0,
              "z": 520
            },
            {
              "x": 616,
              "y": 0,
              "z": 508
            },
            {
              "x": 616,
              "y": 0,
              "z": 496
            },
            {
              "x": 616,
              "y": 0,
              "z": 484
            },
            {
              "x": 616,
              "y": 0,
              "z": 472
            },
            {
              "x": 616,
              "y": 0,
              "z": 460
            },
            {
              "x": 616,
              "y": 0,
              "z": 448
            },
            {
              "x": 616,
              "y": 0,
              "z": 436
            },
            {
              "x": 616,
              "y": 0,
              "z": 424
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_34",
          "points": [
            {
              "x": 424,
              "y": 0,
              "z": 520
            },
            {
              "x": 424,
              "y": 0,
              "z": 508
            },
            {
              "x": 424,
              "y": 0,
              "z": 496
            },
            {
              "x": 424,
              "y": 0,
              "z": 484
            },
            {
              "x": 424,
              "y": 0,
              "z": 472
            },
            {
              "x": 424,
              "y": 0,
              "z": 460
            },
            {
              "x": 424,
              "y": 0,
              "z": 448
            },
            {
              "x": 424,
              "y": 0,
              "z": 436
            },
            {
              "x": 424,
              "y": 0,
              "z": 424
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_35",
          "points": [
            {
              "x": 600,
              "y": 0,
              "z": 520
            },
            {
              "x": 600,
              "y": 0,
              "z": 531.43
            },
            {
              "x": 600,
              "y": 0,
              "z": 542.86
            },
            {
              "x": 600,
              "y": 0,
              "z": 554.29
            },
            {
              "x": 600,
              "y": 0,
              "z": 565.71
            },
            {
              "x": 600,
              "y": 0,
              "z": 577.14
            },
            {
              "x": 600,
              "y": 0,
              "z": 588.57
            },
            {
              "x": 600,
              "y": 0,
              "z": 600
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_36",
          "points": [
            {
              "x": 600,
              "y": 0,
              "z": 520
            },
            {
              "x": 600,
              "y": 0,
              "z": 508.57
            },
            {
              "x": 600,
              "y": 0,
              "z": 497.14
            },
            {
              "x": 600,
              "y": 0,
              "z": 485.71
            },
            {
              "x": 600,
              "y": 0,
              "z": 474.29
            },
            {
              "x": 600,
              "y": 0,
              "z": 462.86
            },
            {
              "x": 600,
              "y": 0,
              "z": 451.43
            },
            {
              "x": 600,
              "y": 0,
              "z": 440
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_37",
          "points": [
            {
              "x": 440,
              "y": 0,
              "z": 520
            },
            {
              "x": 440,
              "y": 0,
              "z": 531.43
            },
            {
              "x": 440,
              "y": 0,
              "z": 542.86
            },
            {
              "x": 440,
              "y": 0,
              "z": 554.29
            },
            {
              "x": 440,
              "y": 0,
              "z": 565.71
            },
            {
              "x": 440,
              "y": 0,
              "z": 577.14
            },
            {
              "x": 440,
              "y": 0,
              "z": 588.57
            },
            {
              "x": 440,
              "y": 0,
              "z": 600
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_38",
          "points": [
            {
              "x": 440,
              "y": 0,
              "z": 520
            },
            {
              "x": 440,
              "y": 0,
              "z": 508.57
            },
            {
              "x": 440,
              "y": 0,
              "z": 497.14
            },
            {
              "x": 440,
              "y": 0,
              "z": 485.71
            },
            {
              "x": 440,
              "y": 0,
              "z": 474.29
            },
            {
              "x": 440,
              "y": 0,
              "z": 462.86
            },
            {
              "x": 440,
              "y": 0,
              "z": 451.43
            },
            {
              "x": 440,
              "y": 0,
              "z": 440
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_39",
          "points": [
            {
              "x": 584,
              "y": 0,
              "z": 540
            },
            {
              "x": 584,
              "y": 0,
              "z": 541.33
            },
            {
              "x": 584,
              "y": 0,
              "z": 552
            },
            {
              "x": 584,
              "y": 0,
              "z": 562.67
            },
            {
              "x": 584,
              "y": 0,
              "z": 573.33
            },
            {
              "x": 584,
              "y": 0,
              "z": 584
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_40",
          "points": [
            {
              "x": 584,
              "y": 0,
              "z": 500
            },
            {
              "x": 584,
              "y": 0,
              "z": 498.67
            },
            {
              "x": 584,
              "y": 0,
              "z": 488
            },
            {
              "x": 584,
              "y": 0,
              "z": 477.33
            },
            {
              "x": 584,
              "y": 0,
              "z": 466.67
            },
            {
              "x": 584,
              "y": 0,
              "z": 500
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_41",
          "points": [
            {
              "x": 456,
              "y": 0,
              "z": 540
            },
            {
              "x": 456,
              "y": 0,
              "z": 541.33
            },
            {
              "x": 456,
              "y": 0,
              "z": 552
            },
            {
              "x": 456,
              "y": 0,
              "z": 562.67
            },
            {
              "x": 456,
              "y": 0,
              "z": 573.33
            },
            {
              "x": 456,
              "y": 0,
              "z": 584
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_42",
          "points": [
            {
              "x": 456,
              "y": 0,
              "z": 500
            },
            {
              "x": 456,
              "y": 0,
              "z": 498.67
            },
            {
              "x": 456,
              "y": 0,
              "z": 488
            },
            {
              "x": 456,
              "y": 0,
              "z": 477.33
            },
            {
              "x": 456,
              "y": 0,
              "z": 466.67
            },
            {
              "x": 456,
              "y": 0,
              "z": 500
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_43",
          "points": [
            {
              "x": -520,
              "y": 0,
              "z": -520
            },
            {
              "x": -508,
              "y": 0,
              "z": -520
            },
            {
              "x": -496,
              "y": 0,
              "z": -520
            },
            {
              "x": -484,
              "y": 0,
              "z": -520
            },
            {
              "x": -472,
              "y": 0,
              "z": -520
            },
            {
              "x": -460,
              "y": 0,
              "z": -520
            },
            {
              "x": -448,
              "y": 0,
              "z": -520
            },
            {
              "x": -436,
              "y": 0,
              "z": -520
            },
            {
              "x": -424,
              "y": 0,
              "z": -520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_44",
          "points": [
            {
              "x": -520,
              "y": 0,
              "z": -520
            },
            {
              "x": -532,
              "y": 0,
              "z": -520
            },
            {
              "x": -544,
              "y": 0,
              "z": -520
            },
            {
              "x": -556,
              "y": 0,
              "z": -520
            },
            {
              "x": -568,
              "y": 0,
              "z": -520
            },
            {
              "x": -580,
              "y": 0,
              "z": -520
            },
            {
              "x": -592,
              "y": 0,
              "z": -520
            },
            {
              "x": -604,
              "y": 0,
              "z": -520
            },
            {
              "x": -616,
              "y": 0,
              "z": -520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_45",
          "points": [
            {
              "x": -520,
              "y": 0,
              "z": -520
            },
            {
              "x": -520,
              "y": 0,
              "z": -532
            },
            {
              "x": -520,
              "y": 0,
              "z": -544
            },
            {
              "x": -520,
              "y": 0,
              "z": -556
            },
            {
              "x": -520,
              "y": 0,
              "z": -568
            },
            {
              "x": -520,
              "y": 0,
              "z": -580
            },
            {
              "x": -520,
              "y": 0,
              "z": -592
            },
            {
              "x": -520,
              "y": 0,
              "z": -604
            },
            {
              "x": -520,
              "y": 0,
              "z": -616
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_46",
          "points": [
            {
              "x": 600,
              "y": 0,
              "z": 520
            },
            {
              "x": 588.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 577.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 565.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 554.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 542.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 531.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 531.43
            },
            {
              "x": 520,
              "y": 0,
              "z": 542.86
            },
            {
              "x": 520,
              "y": 0,
              "z": 554.29
            },
            {
              "x": 520,
              "y": 0,
              "z": 565.71
            },
            {
              "x": 520,
              "y": 0,
              "z": 577.14
            },
            {
              "x": 520,
              "y": 0,
              "z": 588.57
            },
            {
              "x": 520,
              "y": 0,
              "z": 600
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_47",
          "points": [
            {
              "x": 600,
              "y": 0,
              "z": 520
            },
            {
              "x": 588.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 577.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 565.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 554.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 542.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 531.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 508.57
            },
            {
              "x": 520,
              "y": 0,
              "z": 497.14
            },
            {
              "x": 520,
              "y": 0,
              "z": 485.71
            },
            {
              "x": 520,
              "y": 0,
              "z": 474.29
            },
            {
              "x": 520,
              "y": 0,
              "z": 462.86
            },
            {
              "x": 520,
              "y": 0,
              "z": 451.43
            },
            {
              "x": 520,
              "y": 0,
              "z": 440
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_48",
          "points": [
            {
              "x": 600,
              "y": 0,
              "z": 520
            },
            {
              "x": 588.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 577.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 565.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 554.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 542.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 531.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 530.67
            },
            {
              "x": 520,
              "y": 0,
              "z": 541.33
            },
            {
              "x": 520,
              "y": 0,
              "z": 552
            },
            {
              "x": 520,
              "y": 0,
              "z": 562.67
            },
            {
              "x": 520,
              "y": 0,
              "z": 573.33
            },
            {
              "x": 520,
              "y": 0,
              "z": 584
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_49",
          "points": [
            {
              "x": 600,
              "y": 0,
              "z": 520
            },
            {
              "x": 588.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 577.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 565.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 554.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 542.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 531.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 509.33
            },
            {
              "x": 520,
              "y": 0,
              "z": 498.67
            },
            {
              "x": 520,
              "y": 0,
              "z": 488
            },
            {
              "x": 520,
              "y": 0,
              "z": 477.33
            },
            {
              "x": 520,
              "y": 0,
              "z": 466.67
            },
            {
              "x": 520,
              "y": 0,
              "z": 456
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_50",
          "points": [
            {
              "x": 600,
              "y": 0,
              "z": 520
            },
            {
              "x": 588.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 577.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 565.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 554.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 542.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 531.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 532
            },
            {
              "x": 520,
              "y": 0,
              "z": 544
            },
            {
              "x": 520,
              "y": 0,
              "z": 556
            },
            {
              "x": 520,
              "y": 0,
              "z": 568
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_51",
          "points": [
            {
              "x": 600,
              "y": 0,
              "z": 520
            },
            {
              "x": 588.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 577.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 565.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 554.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 542.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 531.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 508
            },
            {
              "x": 520,
              "y": 0,
              "z": 496
            },
            {
              "x": 520,
              "y": 0,
              "z": 484
            },
            {
              "x": 520,
              "y": 0,
              "z": 472
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_52",
          "points": [
            {
              "x": 600,
              "y": 0,
              "z": 520
            },
            {
              "x": 588.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 577.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 565.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 554.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 542.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 531.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 530
            },
            {
              "x": 520,
              "y": 0,
              "z": 540
            },
            {
              "x": 520,
              "y": 0,
              "z": 550
            },
            {
              "x": 520,
              "y": 0,
              "z": 560
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_53",
          "points": [
            {
              "x": 600,
              "y": 0,
              "z": 520
            },
            {
              "x": 588.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 577.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 565.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 554.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 542.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 531.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 510
            },
            {
              "x": 520,
              "y": 0,
              "z": 500
            },
            {
              "x": 520,
              "y": 0,
              "z": 490
            },
            {
              "x": 520,
              "y": 0,
              "z": 480
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_54",
          "points": [
            {
              "x": 600,
              "y": 0,
              "z": 520
            },
            {
              "x": 608,
              "y": 0,
              "z": 520
            },
            {
              "x": 616,
              "y": 0,
              "z": 520
            },
            {
              "x": 616,
              "y": 0,
              "z": 532
            },
            {
              "x": 616,
              "y": 0,
              "z": 544
            },
            {
              "x": 616,
              "y": 0,
              "z": 556
            },
            {
              "x": 616,
              "y": 0,
              "z": 568
            },
            {
              "x": 616,
              "y": 0,
              "z": 580
            },
            {
              "x": 616,
              "y": 0,
              "z": 592
            },
            {
              "x": 616,
              "y": 0,
              "z": 604
            },
            {
              "x": 616,
              "y": 0,
              "z": 616
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_55",
          "points": [
            {
              "x": 600,
              "y": 0,
              "z": 520
            },
            {
              "x": 608,
              "y": 0,
              "z": 520
            },
            {
              "x": 616,
              "y": 0,
              "z": 520
            },
            {
              "x": 616,
              "y": 0,
              "z": 508
            },
            {
              "x": 616,
              "y": 0,
              "z": 496
            },
            {
              "x": 616,
              "y": 0,
              "z": 484
            },
            {
              "x": 616,
              "y": 0,
              "z": 472
            },
            {
              "x": 616,
              "y": 0,
              "z": 460
            },
            {
              "x": 616,
              "y": 0,
              "z": 448
            },
            {
              "x": 616,
              "y": 0,
              "z": 436
            },
            {
              "x": 616,
              "y": 0,
              "z": 424
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_56",
          "points": [
            {
              "x": 600,
              "y": 0,
              "z": 520
            },
            {
              "x": 592,
              "y": 0,
              "z": 520
            },
            {
              "x": 584,
              "y": 0,
              "z": 520
            },
            {
              "x": 584,
              "y": 0,
              "z": 530.67
            },
            {
              "x": 584,
              "y": 0,
              "z": 541.33
            },
            {
              "x": 584,
              "y": 0,
              "z": 552
            },
            {
              "x": 584,
              "y": 0,
              "z": 562.67
            },
            {
              "x": 584,
              "y": 0,
              "z": 573.33
            },
            {
              "x": 584,
              "y": 0,
              "z": 584
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_57",
          "points": [
            {
              "x": 600,
              "y": 0,
              "z": 520
            },
            {
              "x": 592,
              "y": 0,
              "z": 520
            },
            {
              "x": 584,
              "y": 0,
              "z": 520
            },
            {
              "x": 584,
              "y": 0,
              "z": 509.33
            },
            {
              "x": 584,
              "y": 0,
              "z": 498.67
            },
            {
              "x": 584,
              "y": 0,
              "z": 488
            },
            {
              "x": 584,
              "y": 0,
              "z": 477.33
            },
            {
              "x": 584,
              "y": 0,
              "z": 466.67
            },
            {
              "x": 584,
              "y": 0,
              "z": 456
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_58",
          "points": [
            {
              "x": 600,
              "y": 0,
              "z": 520
            },
            {
              "x": 588.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 577.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 565.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 554.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 542.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 531.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 532
            },
            {
              "x": 520,
              "y": 0,
              "z": 544
            },
            {
              "x": 520,
              "y": 0,
              "z": 556
            },
            {
              "x": 520,
              "y": 0,
              "z": 568
            },
            {
              "x": 520,
              "y": 0,
              "z": 580
            },
            {
              "x": 520,
              "y": 0,
              "z": 592
            },
            {
              "x": 520,
              "y": 0,
              "z": 604
            },
            {
              "x": 520,
              "y": 0,
              "z": 616
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_59",
          "points": [
            {
              "x": 600,
              "y": 0,
              "z": 520
            },
            {
              "x": 588.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 577.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 565.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 554.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 542.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 531.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 508
            },
            {
              "x": 520,
              "y": 0,
              "z": 496
            },
            {
              "x": 520,
              "y": 0,
              "z": 484
            },
            {
              "x": 520,
              "y": 0,
              "z": 472
            },
            {
              "x": 520,
              "y": 0,
              "z": 460
            },
            {
              "x": 520,
              "y": 0,
              "z": 448
            },
            {
              "x": 520,
              "y": 0,
              "z": 436
            },
            {
              "x": 520,
              "y": 0,
              "z": 424
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_60",
          "points": [
            {
              "x": 440,
              "y": 0,
              "z": 520
            },
            {
              "x": 451.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 462.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 474.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 485.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 497.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 508.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 531.43
            },
            {
              "x": 520,
              "y": 0,
              "z": 542.86
            },
            {
              "x": 520,
              "y": 0,
              "z": 554.29
            },
            {
              "x": 520,
              "y": 0,
              "z": 565.71
            },
            {
              "x": 520,
              "y": 0,
              "z": 577.14
            },
            {
              "x": 520,
              "y": 0,
              "z": 588.57
            },
            {
              "x": 520,
              "y": 0,
              "z": 600
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_61",
          "points": [
            {
              "x": 440,
              "y": 0,
              "z": 520
            },
            {
              "x": 451.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 462.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 474.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 485.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 497.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 508.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 508.57
            },
            {
              "x": 520,
              "y": 0,
              "z": 497.14
            },
            {
              "x": 520,
              "y": 0,
              "z": 485.71
            },
            {
              "x": 520,
              "y": 0,
              "z": 474.29
            },
            {
              "x": 520,
              "y": 0,
              "z": 462.86
            },
            {
              "x": 520,
              "y": 0,
              "z": 451.43
            },
            {
              "x": 520,
              "y": 0,
              "z": 440
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_62",
          "points": [
            {
              "x": 440,
              "y": 0,
              "z": 520
            },
            {
              "x": 451.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 462.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 474.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 485.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 497.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 508.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 530.67
            },
            {
              "x": 520,
              "y": 0,
              "z": 541.33
            },
            {
              "x": 520,
              "y": 0,
              "z": 552
            },
            {
              "x": 520,
              "y": 0,
              "z": 562.67
            },
            {
              "x": 520,
              "y": 0,
              "z": 573.33
            },
            {
              "x": 520,
              "y": 0,
              "z": 584
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_63",
          "points": [
            {
              "x": 440,
              "y": 0,
              "z": 520
            },
            {
              "x": 451.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 462.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 474.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 485.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 497.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 508.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 509.33
            },
            {
              "x": 520,
              "y": 0,
              "z": 498.67
            },
            {
              "x": 520,
              "y": 0,
              "z": 488
            },
            {
              "x": 520,
              "y": 0,
              "z": 477.33
            },
            {
              "x": 520,
              "y": 0,
              "z": 466.67
            },
            {
              "x": 520,
              "y": 0,
              "z": 456
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_64",
          "points": [
            {
              "x": 440,
              "y": 0,
              "z": 520
            },
            {
              "x": 451.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 462.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 474.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 485.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 497.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 508.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 532
            },
            {
              "x": 520,
              "y": 0,
              "z": 544
            },
            {
              "x": 520,
              "y": 0,
              "z": 556
            },
            {
              "x": 520,
              "y": 0,
              "z": 568
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_65",
          "points": [
            {
              "x": 440,
              "y": 0,
              "z": 520
            },
            {
              "x": 451.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 462.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 474.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 485.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 497.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 508.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 508
            },
            {
              "x": 520,
              "y": 0,
              "z": 496
            },
            {
              "x": 520,
              "y": 0,
              "z": 484
            },
            {
              "x": 520,
              "y": 0,
              "z": 472
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_66",
          "points": [
            {
              "x": 440,
              "y": 0,
              "z": 520
            },
            {
              "x": 451.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 462.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 474.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 485.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 497.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 508.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 530
            },
            {
              "x": 520,
              "y": 0,
              "z": 540
            },
            {
              "x": 520,
              "y": 0,
              "z": 550
            },
            {
              "x": 520,
              "y": 0,
              "z": 560
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_67",
          "points": [
            {
              "x": 440,
              "y": 0,
              "z": 520
            },
            {
              "x": 451.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 462.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 474.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 485.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 497.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 508.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 520
            },
            {
              "x": 520,
              "y": 0,
              "z": 510
            },
            {
              "x": 520,
              "y": 0,
              "z": 500
            },
            {
              "x": 520,
              "y": 0,
              "z": 490
            },
            {
              "x": 520,
              "y": 0,
              "z": 480
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_68",
          "points": [
            {
              "x": 440,
              "y": 0,
              "z": 520
            },
            {
              "x": 432,
              "y": 0,
              "z": 520
            },
            {
              "x": 424,
              "y": 0,
              "z": 520
            },
            {
              "x": 424,
              "y": 0,
              "z": 532
            },
            {
              "x": 424,
              "y": 0,
              "z": 544
            },
            {
              "x": 424,
              "y": 0,
              "z": 556
            },
            {
              "x": 424,
              "y": 0,
              "z": 568
            },
            {
              "x": 424,
              "y": 0,
              "z": 580
            },
            {
              "x": 424,
              "y": 0,
              "z": 592
            },
            {
              "x": 424,
              "y": 0,
              "z": 604
            },
            {
              "x": 424,
              "y": 0,
              "z": 616
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gc_69",
          "points": [
            {
              "x": 440,
              "y": 0,
              "z": 520
            },
            {
              "x": 432,
              "y": 0,
              "z": 520
            },
            {
              "x": 424,
              "y": 0,
              "z": 520
            },
            {
              "x": 424,
              "y": 0,
              "z": 508
            },
            {
              "x": 424,
              "y": 0,
              "z": 496
            },
            {
              "x": 424,
              "y": 0,
              "z": 484
            },
            {
              "x": 424,
              "y": 0,
              "z": 472
            },
            {
              "x": 424,
              "y": 0,
              "z": 460
            },
            {
              "x": 424,
              "y": 0,
              "z": 448
            },
            {
              "x": 424,
              "y": 0,
              "z": 436
            },
            {
              "x": 424,
              "y": 0,
              "z": 424
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_70",
          "points": [
            {
              "x": -520,
              "y": 0,
              "z": -520
            },
            {
              "x": -529.14,
              "y": 0,
              "z": -513.14
            },
            {
              "x": -538.29,
              "y": 0,
              "z": -506.29
            },
            {
              "x": -547.43,
              "y": 0,
              "z": -499.43
            },
            {
              "x": -556.57,
              "y": 0,
              "z": -492.57
            },
            {
              "x": -565.71,
              "y": 0,
              "z": -485.71
            },
            {
              "x": -574.86,
              "y": 0,
              "z": -478.86
            },
            {
              "x": -584,
              "y": 0,
              "z": -472
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_71",
          "points": [
            {
              "x": -584,
              "y": 0,
              "z": -472
            },
            {
              "x": -596,
              "y": 0,
              "z": -472
            },
            {
              "x": -608,
              "y": 0,
              "z": -472
            },
            {
              "x": -620,
              "y": 0,
              "z": -472
            },
            {
              "x": -632,
              "y": 0,
              "z": -472
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_72",
          "points": [
            {
              "x": -520,
              "y": 0,
              "z": -520
            },
            {
              "x": -513.14,
              "y": 0,
              "z": -529.14
            },
            {
              "x": -506.29,
              "y": 0,
              "z": -538.29
            },
            {
              "x": -499.43,
              "y": 0,
              "z": -547.43
            },
            {
              "x": -492.57,
              "y": 0,
              "z": -556.57
            },
            {
              "x": -485.71,
              "y": 0,
              "z": -565.71
            },
            {
              "x": -478.86,
              "y": 0,
              "z": -574.86
            },
            {
              "x": -472,
              "y": 0,
              "z": -584
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_73",
          "points": [
            {
              "x": -472,
              "y": 0,
              "z": -584
            },
            {
              "x": -472,
              "y": 0,
              "z": -596
            },
            {
              "x": -472,
              "y": 0,
              "z": -608
            },
            {
              "x": -472,
              "y": 0,
              "z": -620
            },
            {
              "x": -472,
              "y": 0,
              "z": -632
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_74",
          "points": [
            {
              "x": 408,
              "y": 0,
              "z": 520
            },
            {
              "x": 396.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 385.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 373.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 362.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 350.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 339.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 328,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_75",
          "points": [
            {
              "x": 328,
              "y": 0,
              "z": 520
            },
            {
              "x": 316.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 305.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 293.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 282.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 270.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 259.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 248,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_76",
          "points": [
            {
              "x": 248,
              "y": 0,
              "z": 520
            },
            {
              "x": 236.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 225.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 213.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 202.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 190.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 179.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 168,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_77",
          "points": [
            {
              "x": 168,
              "y": 0,
              "z": 520
            },
            {
              "x": 156.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 145.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 133.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 122.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 110.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 99.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 88,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_78",
          "points": [
            {
              "x": 28,
              "y": 0,
              "z": 520
            },
            {
              "x": 76.57,
              "y": 0,
              "z": 520
            },
            {
              "x": 65.14,
              "y": 0,
              "z": 520
            },
            {
              "x": 53.71,
              "y": 0,
              "z": 520
            },
            {
              "x": 42.29,
              "y": 0,
              "z": 520
            },
            {
              "x": 30.86,
              "y": 0,
              "z": 520
            },
            {
              "x": 28,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_79",
          "points": [
            {
              "x": 8,
              "y": 0,
              "z": 520
            },
            {
              "x": 8,
              "y": 0,
              "z": 508.57
            },
            {
              "x": 8,
              "y": 0,
              "z": 497.14
            },
            {
              "x": 8,
              "y": 0,
              "z": 485.71
            },
            {
              "x": 8,
              "y": 0,
              "z": 474.29
            },
            {
              "x": 8,
              "y": 0,
              "z": 462.86
            },
            {
              "x": 8,
              "y": 0,
              "z": 451.43
            },
            {
              "x": 8,
              "y": 0,
              "z": 440
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_80",
          "points": [
            {
              "x": 8,
              "y": 0,
              "z": 440
            },
            {
              "x": 8,
              "y": 0,
              "z": 428.57
            },
            {
              "x": 8,
              "y": 0,
              "z": 417.14
            },
            {
              "x": 8,
              "y": 0,
              "z": 405.71
            },
            {
              "x": 8,
              "y": 0,
              "z": 394.29
            },
            {
              "x": 8,
              "y": 0,
              "z": 382.86
            },
            {
              "x": 8,
              "y": 0,
              "z": 371.43
            },
            {
              "x": 8,
              "y": 0,
              "z": 360
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_81",
          "points": [
            {
              "x": 8,
              "y": 0,
              "z": 360
            },
            {
              "x": 8,
              "y": 0,
              "z": 348.57
            },
            {
              "x": 8,
              "y": 0,
              "z": 337.14
            },
            {
              "x": 8,
              "y": 0,
              "z": 325.71
            },
            {
              "x": 8,
              "y": 0,
              "z": 314.29
            },
            {
              "x": 8,
              "y": 0,
              "z": 302.86
            },
            {
              "x": 8,
              "y": 0,
              "z": 291.43
            },
            {
              "x": 8,
              "y": 0,
              "z": 280
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_82",
          "points": [
            {
              "x": 8,
              "y": 0,
              "z": 280
            },
            {
              "x": -2.67,
              "y": 0,
              "z": 280
            },
            {
              "x": -13.33,
              "y": 0,
              "z": 280
            },
            {
              "x": -24,
              "y": 0,
              "z": 280
            },
            {
              "x": -34.67,
              "y": 0,
              "z": 280
            },
            {
              "x": -45.33,
              "y": 0,
              "z": 280
            },
            {
              "x": -56,
              "y": 0,
              "z": 280
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_83",
          "points": [
            {
              "x": -56,
              "y": 0,
              "z": 280
            },
            {
              "x": -56,
              "y": 0,
              "z": 269.33
            },
            {
              "x": -56,
              "y": 0,
              "z": 258.67
            },
            {
              "x": -56,
              "y": 0,
              "z": 248
            },
            {
              "x": -56,
              "y": 0,
              "z": 237.33
            },
            {
              "x": -56,
              "y": 0,
              "z": 226.67
            },
            {
              "x": -56,
              "y": 0,
              "z": 216
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_84",
          "points": [
            {
              "x": -56,
              "y": 0,
              "z": 216
            },
            {
              "x": -67.43,
              "y": 0,
              "z": 216
            },
            {
              "x": -78.86,
              "y": 0,
              "z": 216
            },
            {
              "x": -90.29,
              "y": 0,
              "z": 216
            },
            {
              "x": -101.71,
              "y": 0,
              "z": 216
            },
            {
              "x": -113.14,
              "y": 0,
              "z": 216
            },
            {
              "x": -124.57,
              "y": 0,
              "z": 216
            },
            {
              "x": -136,
              "y": 0,
              "z": 216
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_85",
          "points": [
            {
              "x": -136,
              "y": 0,
              "z": 216
            },
            {
              "x": -147.43,
              "y": 0,
              "z": 216
            },
            {
              "x": -158.86,
              "y": 0,
              "z": 216
            },
            {
              "x": -170.29,
              "y": 0,
              "z": 216
            },
            {
              "x": -181.71,
              "y": 0,
              "z": 216
            },
            {
              "x": -193.14,
              "y": 0,
              "z": 216
            },
            {
              "x": -204.57,
              "y": 0,
              "z": 216
            },
            {
              "x": -216,
              "y": 0,
              "z": 216
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_86",
          "points": [
            {
              "x": -136,
              "y": 0,
              "z": 216
            },
            {
              "x": -144.08,
              "y": 0,
              "z": 207.92
            },
            {
              "x": -152.16,
              "y": 0,
              "z": 199.84
            },
            {
              "x": -160.24,
              "y": 0,
              "z": 191.76
            },
            {
              "x": -168.33,
              "y": 0,
              "z": 183.67
            },
            {
              "x": -176.41,
              "y": 0,
              "z": 175.59
            },
            {
              "x": -184.49,
              "y": 0,
              "z": 167.51
            },
            {
              "x": -192.57,
              "y": 0,
              "z": 159.43
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_87",
          "points": [
            {
              "x": -192.57,
              "y": 0,
              "z": 159.43
            },
            {
              "x": -201.05,
              "y": 0,
              "z": 167.92
            },
            {
              "x": -209.54,
              "y": 0,
              "z": 176.4
            },
            {
              "x": -218.02,
              "y": 0,
              "z": 184.89
            },
            {
              "x": -226.51,
              "y": 0,
              "z": 193.37
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_88",
          "points": [
            {
              "x": -192.57,
              "y": 0,
              "z": 159.43
            },
            {
              "x": -202.57,
              "y": 0,
              "z": 159.43
            },
            {
              "x": -212.57,
              "y": 0,
              "z": 159.43
            },
            {
              "x": -222.57,
              "y": 0,
              "z": 159.43
            },
            {
              "x": -232.57,
              "y": 0,
              "z": 159.43
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_89",
          "points": [
            {
              "x": -12,
              "y": 0,
              "z": 520
            },
            {
              "x": -13.33,
              "y": 0,
              "z": 520
            },
            {
              "x": -24,
              "y": 0,
              "z": 520
            },
            {
              "x": -34.67,
              "y": 0,
              "z": 520
            },
            {
              "x": -45.33,
              "y": 0,
              "z": 520
            },
            {
              "x": -12,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_90",
          "points": [
            {
              "x": -56,
              "y": 0,
              "z": 520
            },
            {
              "x": -68,
              "y": 0,
              "z": 520
            },
            {
              "x": -80,
              "y": 0,
              "z": 520
            },
            {
              "x": -92,
              "y": 0,
              "z": 520
            },
            {
              "x": -104,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_91",
          "points": [
            {
              "x": -192.57,
              "y": 0,
              "z": 159.43
            },
            {
              "x": -192.57,
              "y": 0,
              "z": 148
            },
            {
              "x": -192.57,
              "y": 0,
              "z": 136.57
            },
            {
              "x": -192.57,
              "y": 0,
              "z": 125.14
            },
            {
              "x": -192.57,
              "y": 0,
              "z": 113.72
            },
            {
              "x": -192.57,
              "y": 0,
              "z": 102.29
            },
            {
              "x": -192.57,
              "y": 0,
              "z": 90.86
            },
            {
              "x": -192.57,
              "y": 0,
              "z": 79.43
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_92",
          "points": [
            {
              "x": -192.57,
              "y": 0,
              "z": 79.43
            },
            {
              "x": -184.49,
              "y": 0,
              "z": 71.35
            },
            {
              "x": -176.41,
              "y": 0,
              "z": 63.27
            },
            {
              "x": -168.33,
              "y": 0,
              "z": 55.19
            },
            {
              "x": -160.24,
              "y": 0,
              "z": 47.1
            },
            {
              "x": -152.16,
              "y": 0,
              "z": 39.02
            },
            {
              "x": -144.08,
              "y": 0,
              "z": 30.94
            },
            {
              "x": -136,
              "y": 0,
              "z": 22.86
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_93",
          "points": [
            {
              "x": -192.57,
              "y": 0,
              "z": 79.43
            },
            {
              "x": -192.57,
              "y": 0,
              "z": 69.83
            },
            {
              "x": -192.57,
              "y": 0,
              "z": 60.23
            },
            {
              "x": -192.57,
              "y": 0,
              "z": 50.63
            },
            {
              "x": -192.57,
              "y": 0,
              "z": 41.03
            },
            {
              "x": -192.57,
              "y": 0,
              "z": 31.43
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_94",
          "points": [
            {
              "x": -192.57,
              "y": 0,
              "z": 159.43
            },
            {
              "x": -184.49,
              "y": 0,
              "z": 151.35
            },
            {
              "x": -176.41,
              "y": 0,
              "z": 143.27
            },
            {
              "x": -168.33,
              "y": 0,
              "z": 135.19
            },
            {
              "x": -160.24,
              "y": 0,
              "z": 127.1
            },
            {
              "x": -152.16,
              "y": 0,
              "z": 119.02
            },
            {
              "x": -144.08,
              "y": 0,
              "z": 110.94
            },
            {
              "x": -136,
              "y": 0,
              "z": 102.86
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_95",
          "points": [
            {
              "x": -136,
              "y": 0,
              "z": 102.86
            },
            {
              "x": -136,
              "y": 0,
              "z": 92.19
            },
            {
              "x": -136,
              "y": 0,
              "z": 81.53
            },
            {
              "x": -136,
              "y": 0,
              "z": 70.86
            },
            {
              "x": -136,
              "y": 0,
              "z": 60.19
            },
            {
              "x": -136,
              "y": 0,
              "z": 49.53
            },
            {
              "x": -136,
              "y": 0,
              "z": 38.86
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_96",
          "points": [
            {
              "x": -136,
              "y": 0,
              "z": 22.86
            },
            {
              "x": -124.57,
              "y": 0,
              "z": 22.86
            },
            {
              "x": -113.14,
              "y": 0,
              "z": 22.86
            },
            {
              "x": -101.71,
              "y": 0,
              "z": 22.86
            },
            {
              "x": -90.29,
              "y": 0,
              "z": 22.86
            },
            {
              "x": -78.86,
              "y": 0,
              "z": 22.86
            },
            {
              "x": -67.43,
              "y": 0,
              "z": 22.86
            },
            {
              "x": -56,
              "y": 0,
              "z": 22.86
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_97",
          "points": [
            {
              "x": -56,
              "y": 0,
              "z": 22.86
            },
            {
              "x": -44.57,
              "y": 0,
              "z": 22.86
            },
            {
              "x": -33.14,
              "y": 0,
              "z": 22.86
            },
            {
              "x": -21.71,
              "y": 0,
              "z": 22.86
            },
            {
              "x": -10.29,
              "y": 0,
              "z": 22.86
            },
            {
              "x": 1.14,
              "y": 0,
              "z": 22.86
            },
            {
              "x": 12.57,
              "y": 0,
              "z": 22.86
            },
            {
              "x": 24,
              "y": 0,
              "z": 22.86
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_98",
          "points": [
            {
              "x": 24,
              "y": 0,
              "z": 22.86
            },
            {
              "x": 24,
              "y": 0,
              "z": 11.43
            },
            {
              "x": 24,
              "y": 0.07,
              "z": 0
            },
            {
              "x": 24,
              "y": 0.24,
              "z": -11.43
            },
            {
              "x": 24,
              "y": 0.52,
              "z": -22.85
            },
            {
              "x": 24,
              "y": 0.92,
              "z": -34.28
            },
            {
              "x": 24,
              "y": 1.43,
              "z": -45.71
            },
            {
              "x": 24,
              "y": 2.04,
              "z": -57.14
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_99",
          "points": [
            {
              "x": 24,
              "y": 2.04,
              "z": -57.14
            },
            {
              "x": 34.67,
              "y": 1.83,
              "z": -57.14
            },
            {
              "x": 45.33,
              "y": 1.61,
              "z": -57.14
            },
            {
              "x": 56,
              "y": 1.38,
              "z": -57.14
            },
            {
              "x": 66.67,
              "y": 1.16,
              "z": -57.14
            },
            {
              "x": 77.33,
              "y": 0.93,
              "z": -57.14
            },
            {
              "x": 88,
              "y": 0.72,
              "z": -57.14
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_100",
          "points": [
            {
              "x": 88,
              "y": 0.72,
              "z": -57.14
            },
            {
              "x": 88,
              "y": 1.16,
              "z": -69.14
            },
            {
              "x": 88,
              "y": 1.7,
              "z": -81.14
            },
            {
              "x": 88,
              "y": 2.34,
              "z": -93.14
            },
            {
              "x": 88,
              "y": 3.12,
              "z": -105.14
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_101",
          "points": [
            {
              "x": 24,
              "y": 0,
              "z": 22.86
            },
            {
              "x": 24,
              "y": 0,
              "z": 33.53
            },
            {
              "x": 24,
              "y": 0,
              "z": 44.19
            },
            {
              "x": 24,
              "y": 0,
              "z": 54.86
            },
            {
              "x": 24,
              "y": 0,
              "z": 65.53
            },
            {
              "x": 24,
              "y": 0,
              "z": 76.19
            },
            {
              "x": 24,
              "y": 0,
              "z": 86.86
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_102",
          "points": [
            {
              "x": 24,
              "y": 0,
              "z": 86.86
            },
            {
              "x": 34.67,
              "y": 0,
              "z": 86.86
            },
            {
              "x": 45.33,
              "y": 0,
              "z": 86.86
            },
            {
              "x": 56,
              "y": 0,
              "z": 86.86
            },
            {
              "x": 66.67,
              "y": 0,
              "z": 86.86
            },
            {
              "x": 77.33,
              "y": 0,
              "z": 86.86
            },
            {
              "x": 88,
              "y": 0,
              "z": 86.86
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_103",
          "points": [
            {
              "x": -520,
              "y": 5.15,
              "z": -424
            },
            {
              "x": -520,
              "y": 6.25,
              "z": -412.57
            },
            {
              "x": -520,
              "y": 7.11,
              "z": -401.14
            },
            {
              "x": -520,
              "y": 7.72,
              "z": -389.71
            },
            {
              "x": -520,
              "y": 8.13,
              "z": -378.29
            },
            {
              "x": -520,
              "y": 8.44,
              "z": -366.86
            },
            {
              "x": -520,
              "y": 8.74,
              "z": -355.43
            },
            {
              "x": -520,
              "y": 9.13,
              "z": -344
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_104",
          "points": [
            {
              "x": -520,
              "y": 9.13,
              "z": -344
            },
            {
              "x": -520,
              "y": 9.67,
              "z": -333.33
            },
            {
              "x": -520,
              "y": 10.44,
              "z": -322.67
            },
            {
              "x": -520,
              "y": 11.22,
              "z": -312
            },
            {
              "x": -520,
              "y": 11.93,
              "z": -301.33
            },
            {
              "x": -520,
              "y": 12.56,
              "z": -290.67
            },
            {
              "x": -520,
              "y": 13.09,
              "z": -280
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_105",
          "points": [
            {
              "x": -520,
              "y": 13.09,
              "z": -280
            },
            {
              "x": -520,
              "y": 13.55,
              "z": -268
            },
            {
              "x": -520,
              "y": 13.87,
              "z": -256
            },
            {
              "x": -520,
              "y": 14.01,
              "z": -244
            },
            {
              "x": -520,
              "y": 13.98,
              "z": -232
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_106",
          "points": [
            {
              "x": -216,
              "y": 0,
              "z": 216
            },
            {
              "x": -216,
              "y": 0,
              "z": 227.43
            },
            {
              "x": -216,
              "y": 0,
              "z": 238.86
            },
            {
              "x": -216,
              "y": 0,
              "z": 250.29
            },
            {
              "x": -216,
              "y": 0,
              "z": 261.71
            },
            {
              "x": -216,
              "y": 0,
              "z": 273.14
            },
            {
              "x": -216,
              "y": 0,
              "z": 284.57
            },
            {
              "x": -216,
              "y": 0,
              "z": 296
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_107",
          "points": [
            {
              "x": -216,
              "y": 0,
              "z": 296
            },
            {
              "x": -216,
              "y": 0,
              "z": 306.67
            },
            {
              "x": -216,
              "y": 0,
              "z": 317.33
            },
            {
              "x": -216,
              "y": 0,
              "z": 328
            },
            {
              "x": -216,
              "y": 0,
              "z": 338.67
            },
            {
              "x": -216,
              "y": 0,
              "z": 349.33
            },
            {
              "x": -216,
              "y": 0,
              "z": 360
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_108",
          "points": [
            {
              "x": -216,
              "y": 0,
              "z": 360
            },
            {
              "x": -216,
              "y": 0,
              "z": 371.43
            },
            {
              "x": -216,
              "y": 0,
              "z": 382.86
            },
            {
              "x": -216,
              "y": 0,
              "z": 394.29
            },
            {
              "x": -216,
              "y": 0,
              "z": 405.71
            },
            {
              "x": -216,
              "y": 0,
              "z": 417.14
            },
            {
              "x": -216,
              "y": 0,
              "z": 428.57
            },
            {
              "x": -216,
              "y": 0,
              "z": 440
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_109_a",
          "points": [
            {
              "x": -216,
              "y": 0,
              "z": 440
            },
            {
              "x": -216,
              "y": 0,
              "z": 450.67
            },
            {
              "x": -216,
              "y": 0,
              "z": 461.33
            },
            {
              "x": -216,
              "y": 0,
              "z": 472
            },
            {
              "x": -216,
              "y": 0,
              "z": 482.67
            },
            {
              "x": -216,
              "y": 0,
              "z": 488
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_109_b",
          "points": [
            {
              "x": -216,
              "y": 0,
              "z": 488
            },
            {
              "x": -216,
              "y": 0,
              "z": 493.33
            },
            {
              "x": -216,
              "y": 0,
              "z": 504
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_110",
          "points": [
            {
              "x": -104,
              "y": 0,
              "z": 520
            },
            {
              "x": -115.43,
              "y": 0,
              "z": 520
            },
            {
              "x": -126.86,
              "y": 0,
              "z": 520
            },
            {
              "x": -138.29,
              "y": 0,
              "z": 520
            },
            {
              "x": -149.71,
              "y": 0,
              "z": 520
            },
            {
              "x": -161.14,
              "y": 0,
              "z": 520
            },
            {
              "x": -172.57,
              "y": 0,
              "z": 520
            },
            {
              "x": -184,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_111_a",
          "points": [
            {
              "x": -184,
              "y": 0,
              "z": 520
            },
            {
              "x": -191.54,
              "y": 0,
              "z": 512.46
            },
            {
              "x": -199.08,
              "y": 0,
              "z": 504.92
            },
            {
              "x": -206.62,
              "y": 0,
              "z": 497.38
            },
            {
              "x": -214.17,
              "y": 0,
              "z": 489.83
            },
            {
              "x": -216,
              "y": 0,
              "z": 488
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_111_b",
          "points": [
            {
              "x": -216,
              "y": 0,
              "z": 488
            },
            {
              "x": -221.71,
              "y": 0,
              "z": 482.29
            },
            {
              "x": -229.25,
              "y": 0,
              "z": 474.75
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_112",
          "points": [
            {
              "x": -184,
              "y": 0,
              "z": 520
            },
            {
              "x": -196,
              "y": 0,
              "z": 520
            },
            {
              "x": -208,
              "y": 0,
              "z": 520
            },
            {
              "x": -220,
              "y": 0,
              "z": 520
            },
            {
              "x": -232,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_113",
          "points": [
            {
              "x": -229.25,
              "y": 0,
              "z": 474.75
            },
            {
              "x": -229.25,
              "y": 0,
              "z": 463.32
            },
            {
              "x": -229.25,
              "y": 0,
              "z": 451.89
            },
            {
              "x": -229.25,
              "y": 0,
              "z": 440.46
            },
            {
              "x": -229.25,
              "y": 0,
              "z": 429.04
            },
            {
              "x": -229.25,
              "y": 0,
              "z": 417.61
            },
            {
              "x": -229.25,
              "y": 0,
              "z": 406.18
            },
            {
              "x": -229.25,
              "y": 0,
              "z": 394.75
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_114",
          "points": [
            {
              "x": -232,
              "y": 0,
              "z": 520
            },
            {
              "x": -232,
              "y": 0,
              "z": 531.43
            },
            {
              "x": -232,
              "y": 0,
              "z": 542.86
            },
            {
              "x": -232,
              "y": 0,
              "z": 554.29
            },
            {
              "x": -232,
              "y": 0,
              "z": 565.71
            },
            {
              "x": -232,
              "y": 0,
              "z": 577.14
            },
            {
              "x": -232,
              "y": 0,
              "z": 588.57
            },
            {
              "x": -232,
              "y": 0,
              "z": 600
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_115",
          "points": [
            {
              "x": -520,
              "y": 13.98,
              "z": -232
            },
            {
              "x": -520,
              "y": 13.79,
              "z": -220.57
            },
            {
              "x": -520,
              "y": 13.46,
              "z": -209.14
            },
            {
              "x": -520,
              "y": 12.98,
              "z": -197.71
            },
            {
              "x": -520,
              "y": 12.39,
              "z": -186.29
            },
            {
              "x": -520,
              "y": 11.68,
              "z": -174.86
            },
            {
              "x": -520,
              "y": 10.89,
              "z": -163.43
            },
            {
              "x": -520,
              "y": 10.03,
              "z": -152
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_116",
          "points": [
            {
              "x": -232.57,
              "y": 0,
              "z": 159.43
            },
            {
              "x": -232.57,
              "y": 0,
              "z": 148.76
            },
            {
              "x": -232.57,
              "y": 0,
              "z": 138.1
            },
            {
              "x": -232.57,
              "y": 0,
              "z": 127.43
            },
            {
              "x": -232.57,
              "y": 0,
              "z": 116.76
            },
            {
              "x": -232.57,
              "y": 0,
              "z": 106.1
            },
            {
              "x": -232.57,
              "y": 0,
              "z": 95.43
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_gb_117",
          "points": [
            {
              "x": -232.57,
              "y": 0,
              "z": 159.43
            },
            {
              "x": -232.57,
              "y": 0,
              "z": 170.86
            },
            {
              "x": -232.57,
              "y": 0,
              "z": 182.29
            },
            {
              "x": -232.57,
              "y": 0,
              "z": 193.72
            },
            {
              "x": -232.57,
              "y": 0,
              "z": 205.14
            },
            {
              "x": -232.57,
              "y": 0,
              "z": 216.57
            },
            {
              "x": -232.57,
              "y": 0,
              "z": 228
            },
            {
              "x": -232.57,
              "y": 0,
              "z": 239.43
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_jc_tr_gn_14_a",
          "points": [
            {
              "x": 584,
              "y": 0,
              "z": 520
            },
            {
              "x": 584,
              "y": 0,
              "z": 530.67
            },
            {
              "x": 584,
              "y": 0,
              "z": 540
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_jc_tr_gn_14_b",
          "points": [
            {
              "x": 584,
              "y": 0,
              "z": 520
            },
            {
              "x": 584,
              "y": 0,
              "z": 509.33
            },
            {
              "x": 584,
              "y": 0,
              "z": 500
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_jc_tr_gn_15_a",
          "points": [
            {
              "x": 456,
              "y": 0,
              "z": 520
            },
            {
              "x": 456,
              "y": 0,
              "z": 530.67
            },
            {
              "x": 456,
              "y": 0,
              "z": 540
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_jc_tr_gn_15_b",
          "points": [
            {
              "x": 456,
              "y": 0,
              "z": 520
            },
            {
              "x": 456,
              "y": 0,
              "z": 509.33
            },
            {
              "x": 456,
              "y": 0,
              "z": 500
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_jc_tr_gn_29_a",
          "points": [
            {
              "x": 408,
              "y": 0,
              "z": 520
            },
            {
              "x": 408,
              "y": 0,
              "z": 531.2
            },
            {
              "x": 408,
              "y": 0,
              "z": 540
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_jc_tr_gn_29_b",
          "points": [
            {
              "x": 408,
              "y": 0,
              "z": 520
            },
            {
              "x": 408,
              "y": 0,
              "z": 508.8
            },
            {
              "x": 408,
              "y": 0,
              "z": 500
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_jc_tr_gn_55_a",
          "points": [
            {
              "x": 8,
              "y": 0,
              "z": 520
            },
            {
              "x": 19.43,
              "y": 0,
              "z": 520
            },
            {
              "x": 28,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_jc_tr_gn_55_b",
          "points": [
            {
              "x": 8,
              "y": 0,
              "z": 520
            },
            {
              "x": -2.67,
              "y": 0,
              "z": 520
            },
            {
              "x": -12,
              "y": 0,
              "z": 520
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_diag_1",
          "points": [
            {
              "x": 24,
              "y": 2.04,
              "z": -57.14
            },
            {
              "x": 0,
              "y": 1.75,
              "z": -48.98
            },
            {
              "x": 0,
              "y": 1.46,
              "z": -34.99
            },
            {
              "x": 0,
              "y": 1.17,
              "z": -20.99
            },
            {
              "x": 0,
              "y": 0.87,
              "z": -7
            },
            {
              "x": 0,
              "y": 0.58,
              "z": 7
            },
            {
              "x": 0,
              "y": 0.29,
              "z": 20.99
            },
            {
              "x": 24,
              "y": 0,
              "z": 22.86
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_diag_2",
          "points": [
            {
              "x": 24,
              "y": 0,
              "z": 22.86
            },
            {
              "x": 0,
              "y": 0,
              "z": 34.99
            },
            {
              "x": 0,
              "y": 0,
              "z": 48.98
            },
            {
              "x": 0,
              "y": 0,
              "z": 62.98
            },
            {
              "x": 0,
              "y": 0,
              "z": 76.97
            },
            {
              "x": 0,
              "y": 0,
              "z": 90.97
            },
            {
              "x": 0,
              "y": 0,
              "z": 104.96
            },
            {
              "x": 0,
              "y": 0,
              "z": 118.95
            },
            {
              "x": 0,
              "y": 0,
              "z": 132.95
            },
            {
              "x": 0,
              "y": 0,
              "z": 146.94
            },
            {
              "x": 0,
              "y": 0,
              "z": 160.94
            },
            {
              "x": 0,
              "y": 0,
              "z": 174.93
            },
            {
              "x": 0,
              "y": 0,
              "z": 188.93
            },
            {
              "x": 0,
              "y": 0,
              "z": 202.92
            },
            {
              "x": 0,
              "y": 0,
              "z": 216.92
            },
            {
              "x": 0,
              "y": 0,
              "z": 230.91
            },
            {
              "x": 0,
              "y": 0,
              "z": 244.91
            },
            {
              "x": 0,
              "y": 0,
              "z": 258.9
            },
            {
              "x": 0,
              "y": 0,
              "z": 272.9
            },
            {
              "x": 8,
              "y": 0,
              "z": 280
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_diag_3",
          "points": [
            {
              "x": 8,
              "y": 0,
              "z": 280
            },
            {
              "x": 0,
              "y": 0,
              "z": 286.89
            },
            {
              "x": 0,
              "y": 0,
              "z": 300.89
            },
            {
              "x": 0,
              "y": 0,
              "z": 314.88
            },
            {
              "x": 0,
              "y": 0,
              "z": 328.87
            },
            {
              "x": 0,
              "y": 0,
              "z": 342.87
            },
            {
              "x": 0,
              "y": 0,
              "z": 356.86
            },
            {
              "x": 8,
              "y": 0,
              "z": 360
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_diag_4",
          "points": [
            {
              "x": 8,
              "y": 0,
              "z": 360
            },
            {
              "x": 0,
              "y": 0,
              "z": 370.86
            },
            {
              "x": 0,
              "y": 0,
              "z": 384.85
            },
            {
              "x": 0,
              "y": 0,
              "z": 398.85
            },
            {
              "x": 0,
              "y": 0,
              "z": 412.84
            },
            {
              "x": 0,
              "y": 0,
              "z": 426.84
            },
            {
              "x": 8,
              "y": 0,
              "z": 440
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_1",
          "points": [
            {
              "x": 88,
              "y": 3.12,
              "z": -105.14
            },
            {
              "x": 88,
              "y": 4.04,
              "z": -117.14
            },
            {
              "x": 88,
              "y": 5.07,
              "z": -129.14
            },
            {
              "x": 88,
              "y": 6.19,
              "z": -141.14
            },
            {
              "x": 88,
              "y": 7.39,
              "z": -153.14
            },
            {
              "x": 88,
              "y": 8.64,
              "z": -165.14
            },
            {
              "x": 88,
              "y": 9.93,
              "z": -177.14
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_1_2",
          "points": [
            {
              "x": 88,
              "y": 9.93,
              "z": -177.14
            },
            {
              "x": 77.26,
              "y": 10.51,
              "z": -177.14
            },
            {
              "x": 66.52,
              "y": 11.06,
              "z": -177.14
            },
            {
              "x": 55.77,
              "y": 11.58,
              "z": -177.14
            },
            {
              "x": 45.03,
              "y": 12.07,
              "z": -177.14
            },
            {
              "x": 34.29,
              "y": 12.51,
              "z": -177.14
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_3",
          "points": [
            {
              "x": 88,
              "y": 9.93,
              "z": -177.14
            },
            {
              "x": 88,
              "y": 11.24,
              "z": -189.14
            },
            {
              "x": 88,
              "y": 12.55,
              "z": -201.14
            },
            {
              "x": 88,
              "y": 13.85,
              "z": -213.14
            },
            {
              "x": 88,
              "y": 15.11,
              "z": -225.14
            },
            {
              "x": 88,
              "y": 16.32,
              "z": -237.14
            },
            {
              "x": 88,
              "y": 17.48,
              "z": -249.14
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_3_2",
          "points": [
            {
              "x": 88,
              "y": 17.48,
              "z": -249.14
            },
            {
              "x": 95.43,
              "y": 16.98,
              "z": -249.14
            },
            {
              "x": 102.86,
              "y": 16.46,
              "z": -249.14
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_5",
          "points": [
            {
              "x": 102.86,
              "y": 16.46,
              "z": -249.14
            },
            {
              "x": 112.46,
              "y": 15.78,
              "z": -249.14
            },
            {
              "x": 122.06,
              "y": 15.07,
              "z": -249.14
            },
            {
              "x": 131.66,
              "y": 14.34,
              "z": -249.14
            },
            {
              "x": 141.26,
              "y": 13.61,
              "z": -249.14
            },
            {
              "x": 150.86,
              "y": 12.86,
              "z": -249.14
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_5_2",
          "points": [
            {
              "x": 150.86,
              "y": 12.86,
              "z": -249.14
            },
            {
              "x": 150.86,
              "y": 13.86,
              "z": -261.14
            },
            {
              "x": 150.86,
              "y": 14.78,
              "z": -273.14
            },
            {
              "x": 150.86,
              "y": 15.63,
              "z": -285.14
            },
            {
              "x": 150.86,
              "y": 16.4,
              "z": -297.14
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_7",
          "points": [
            {
              "x": 88,
              "y": 0.72,
              "z": -57.14
            },
            {
              "x": 100,
              "y": 0.5,
              "z": -57.14
            },
            {
              "x": 112,
              "y": 0.32,
              "z": -57.14
            },
            {
              "x": 124,
              "y": 0.17,
              "z": -57.14
            },
            {
              "x": 136,
              "y": 0.07,
              "z": -57.14
            },
            {
              "x": 148,
              "y": 0.01,
              "z": -57.14
            },
            {
              "x": 160,
              "y": 0,
              "z": -57.14
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_7_2",
          "points": [
            {
              "x": 160,
              "y": 0,
              "z": -57.14
            },
            {
              "x": 160,
              "y": 0,
              "z": -45.84
            },
            {
              "x": 160,
              "y": 0,
              "z": -34.54
            },
            {
              "x": 160,
              "y": 0,
              "z": -23.23
            },
            {
              "x": 160,
              "y": 0,
              "z": -11.93
            },
            {
              "x": 160,
              "y": 0,
              "z": -0.63
            },
            {
              "x": 160,
              "y": 0,
              "z": 10.67
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_9",
          "points": [
            {
              "x": 160,
              "y": 0,
              "z": 10.67
            },
            {
              "x": 172,
              "y": 0,
              "z": 10.67
            },
            {
              "x": 184,
              "y": 0,
              "z": 10.67
            },
            {
              "x": 196,
              "y": 0,
              "z": 10.67
            },
            {
              "x": 208,
              "y": 0,
              "z": 10.67
            },
            {
              "x": 220,
              "y": 0,
              "z": 10.67
            },
            {
              "x": 232,
              "y": 0,
              "z": 10.67
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_9_2",
          "points": [
            {
              "x": 232,
              "y": 0,
              "z": 10.67
            },
            {
              "x": 232,
              "y": 0,
              "z": 21.34
            },
            {
              "x": 232,
              "y": 0,
              "z": 32
            },
            {
              "x": 232,
              "y": 0,
              "z": 42.67
            },
            {
              "x": 232,
              "y": 0,
              "z": 53.34
            },
            {
              "x": 232,
              "y": 0,
              "z": 64
            },
            {
              "x": 232,
              "y": 0,
              "z": 74.67
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_11",
          "points": [
            {
              "x": 232,
              "y": 0,
              "z": 74.67
            },
            {
              "x": 244,
              "y": 0,
              "z": 74.67
            },
            {
              "x": 256,
              "y": 0,
              "z": 74.67
            },
            {
              "x": 268,
              "y": 0,
              "z": 74.67
            },
            {
              "x": 280,
              "y": 0,
              "z": 74.67
            },
            {
              "x": 292,
              "y": 0,
              "z": 74.67
            },
            {
              "x": 304,
              "y": 0,
              "z": 74.67
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_11_2",
          "points": [
            {
              "x": 304,
              "y": 0,
              "z": 74.67
            },
            {
              "x": 304,
              "y": 0,
              "z": 86.67
            },
            {
              "x": 304,
              "y": 0,
              "z": 98.67
            },
            {
              "x": 304,
              "y": 0,
              "z": 110.67
            },
            {
              "x": 304,
              "y": 0,
              "z": 122.67
            },
            {
              "x": 304,
              "y": 0,
              "z": 134.67
            },
            {
              "x": 304,
              "y": 0,
              "z": 146.67
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_13",
          "points": [
            {
              "x": 304,
              "y": 0,
              "z": 146.67
            },
            {
              "x": 313.14,
              "y": 0,
              "z": 146.67
            },
            {
              "x": 322.29,
              "y": 0,
              "z": 146.67
            },
            {
              "x": 331.43,
              "y": 0,
              "z": 146.67
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_13_2",
          "points": [
            {
              "x": 331.43,
              "y": 0,
              "z": 146.67
            },
            {
              "x": 331.43,
              "y": 0,
              "z": 158.67
            },
            {
              "x": 331.43,
              "y": 0,
              "z": 170.67
            },
            {
              "x": 331.43,
              "y": 0,
              "z": 182.67
            },
            {
              "x": 331.43,
              "y": 0,
              "z": 194.67
            },
            {
              "x": 331.43,
              "y": 0,
              "z": 206.67
            },
            {
              "x": 331.43,
              "y": 0,
              "z": 218.67
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_15",
          "points": [
            {
              "x": 150.86,
              "y": 16.4,
              "z": -297.14
            },
            {
              "x": 162.86,
              "y": 15.4,
              "z": -297.14
            },
            {
              "x": 174.86,
              "y": 14.4,
              "z": -297.14
            },
            {
              "x": 186.86,
              "y": 13.4,
              "z": -297.14
            },
            {
              "x": 198.86,
              "y": 12.42,
              "z": -297.14
            },
            {
              "x": 210.86,
              "y": 11.48,
              "z": -297.14
            },
            {
              "x": 222.86,
              "y": 10.59,
              "z": -297.14
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_15_2",
          "points": [
            {
              "x": 222.86,
              "y": 10.59,
              "z": -297.14
            },
            {
              "x": 222.86,
              "y": 11.15,
              "z": -308.11
            },
            {
              "x": 222.86,
              "y": 11.65,
              "z": -319.08
            },
            {
              "x": 222.86,
              "y": 12.1,
              "z": -330.06
            },
            {
              "x": 222.86,
              "y": 12.48,
              "z": -341.03
            },
            {
              "x": 222.86,
              "y": 12.79,
              "z": -352
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_17",
          "points": [
            {
              "x": -520,
              "y": 10.03,
              "z": -152
            },
            {
              "x": -520,
              "y": 9.07,
              "z": -140
            },
            {
              "x": -520,
              "y": 8.06,
              "z": -128
            },
            {
              "x": -520,
              "y": 7.04,
              "z": -116
            },
            {
              "x": -520,
              "y": 6.01,
              "z": -104
            },
            {
              "x": -520,
              "y": 5,
              "z": -92
            },
            {
              "x": -520,
              "y": 4.03,
              "z": -80
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_acc_1_17_2",
          "points": [
            {
              "x": -520,
              "y": 4.03,
              "z": -80
            },
            {
              "x": -532,
              "y": 3.77,
              "z": -80
            },
            {
              "x": -544,
              "y": 3.45,
              "z": -80
            },
            {
              "x": -556,
              "y": 3.09,
              "z": -80
            },
            {
              "x": -568,
              "y": 2.7,
              "z": -80
            },
            {
              "x": -580,
              "y": 2.28,
              "z": -80
            }
          ],
          "shoulder": 1,
          "width": 8
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_postb_1",
          "points": [
            {
              "x": 28,
              "y": 0,
              "z": 520
            },
            {
              "x": 28,
              "y": 0,
              "z": 531.67
            },
            {
              "x": 28,
              "y": 0,
              "z": 543.33
            },
            {
              "x": 28,
              "y": 0,
              "z": 555
            },
            {
              "x": 28,
              "y": 0,
              "z": 566.67
            },
            {
              "x": 28,
              "y": 0,
              "z": 578.33
            },
            {
              "x": 28,
              "y": 0,
              "z": 590
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_postb_1_2",
          "points": [
            {
              "x": 28,
              "y": 0,
              "z": 590
            },
            {
              "x": 37.72,
              "y": 0,
              "z": 590
            },
            {
              "x": 47.44,
              "y": 0,
              "z": 590
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_postb_2",
          "points": [
            {
              "x": 47.44,
              "y": 0,
              "z": 590
            },
            {
              "x": 58.76,
              "y": 0,
              "z": 590
            },
            {
              "x": 70.07,
              "y": 0,
              "z": 590
            },
            {
              "x": 81.39,
              "y": 0,
              "z": 590
            },
            {
              "x": 92.7,
              "y": 0,
              "z": 590
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_postb_2_2",
          "points": [
            {
              "x": 92.7,
              "y": 0,
              "z": 590
            },
            {
              "x": 92.7,
              "y": 0,
              "z": 599.67
            },
            {
              "x": 92.7,
              "y": 0,
              "z": 609.34
            },
            {
              "x": 92.7,
              "y": 0,
              "z": 619.01
            },
            {
              "x": 92.7,
              "y": 0,
              "z": 628.68
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_postb_3",
          "points": [
            {
              "x": 248,
              "y": 0,
              "z": 520
            },
            {
              "x": 248,
              "y": 0,
              "z": 531.67
            },
            {
              "x": 248,
              "y": 0,
              "z": 543.33
            },
            {
              "x": 248,
              "y": 0,
              "z": 555
            },
            {
              "x": 248,
              "y": 0,
              "z": 566.67
            },
            {
              "x": 248,
              "y": 0,
              "z": 578.33
            },
            {
              "x": 248,
              "y": 0,
              "z": 590
            }
          ],
          "shoulder": 1,
          "width": 6
        },
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_postb_3_2",
          "points": [
            {
              "x": 248,
              "y": 0,
              "z": 590
            },
            {
              "x": 238.26,
              "y": 0,
              "z": 590
            },
            {
              "x": 228.52,
              "y": 0,
              "z": 590
            },
            {
              "x": 218.78,
              "y": 0,
              "z": 590
            },
            {
              "x": 209.04,
              "y": 0,
              "z": 590
            }
          ],
          "shoulder": 1,
          "width": 6
        }
      ]
    },
    "spawn": {
      "x": -520,
      "z": -520
    },
    "stream": {
      "aheadMax": 900,
      "aheadMin": 200,
      "budgetMs": 120,
      "chunk": 256,
      "keep": 1,
      "overlap": 1.175
    },
    "units": "meters",
    "windows": {
      "lit": 0.42,
      "spacing": 12
    }
  },
  "name": "Глава 23. Разнообразный речной город",
  "sky": {
    "fog": {
      "color": 14230008,
      "far": 900,
      "near": 120
    },
    "hemi": {
      "ground": 5527871,
      "intensity": 1,
      "sky": 13613055
    },
    "sky": 12575732,
    "sun": {
      "color": 16771932,
      "intensity": 2.2,
      "position": [
        -200,
        260,
        -140
      ]
    }
  }
};
LEVEL_23.map.skeleton = decodeSkeleton(await loadSkel());
