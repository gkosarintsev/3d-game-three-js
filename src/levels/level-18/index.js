/**
 * СГЕНЕРИРОВАННО — руками не править.
 *
 * Источник правки: src/levels/level-18.json. После его изменения запуск
 * `node tools/build-level.mjs src/levels/level-18.json` перезаписывает этот файл и все
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

export const LEVEL_18 = {
  "gameplay": {
    "alienEnemies": {
      "count": 0
    },
    "cars": {
      "count": 0,
      "spots": []
    },
    "enemies": {
      "count": 0
    },
    "exit": {
      "x": 90,
      "z": 90
    },
    "exitRadius": 4,
    "goal": "exit"
  },
  "hint": "Длинный мост: подъём с земли, плавное расширение и полоса разгона, съезд вправо с спуском.",
  "map": {
    "bounds": {
      "maxX": 640,
      "maxZ": 640,
      "minX": -640,
      "minZ": -640
    },
    "catalog": "/src/levels/level-18",
    "cells": [
      {
        "file": "chunk-0-0.l14b",
        "id": "0_0",
        "objects": {
          "buildings": 1,
          "props": 41,
          "roads": 7
        },
        "rect": {
          "maxX": 0,
          "maxZ": 0,
          "minX": -640,
          "minZ": -640
        }
      },
      {
        "file": "chunk-0-1.l14b",
        "id": "0_1",
        "objects": {
          "buildings": 4,
          "props": 41,
          "roads": 7
        },
        "rect": {
          "maxX": 0,
          "maxZ": 640,
          "minX": -640,
          "minZ": 0
        }
      },
      {
        "file": "chunk-1-0.l14b",
        "id": "1_0",
        "objects": {
          "buildings": 4,
          "props": 45,
          "roads": 7
        },
        "rect": {
          "maxX": 640,
          "maxZ": 0,
          "minX": 0,
          "minZ": -640
        }
      },
      {
        "file": "chunk-1-1.l14b",
        "id": "1_1",
        "objects": {
          "buildings": 3,
          "props": 51,
          "roads": 10
        },
        "rect": {
          "maxX": 640,
          "maxZ": 640,
          "minX": 0,
          "minZ": 0
        }
      }
    ],
    "ground": {
      "color": 7322954,
      "size": 1280,
      "y": 0
    },
    "kind": "open",
    "relief": {
      "baseY": 0,
      "blend": 14,
      "cell": 24,
      "hills": [
        {
          "bx": 0,
          "bz": 0,
          "height": 0.01,
          "id": "flat_seed",
          "radius": 2,
          "x": 0,
          "z": 0
        }
      ],
      "maxSlope": 0.12,
      "pads": [],
      "roadCorridors": [
        {
          "blend": 5,
          "crossLevel": true,
          "id": "tr_diag_2",
          "points": [
            {
              "x": -360,
              "y": 8,
              "z": 0
            },
            {
              "x": -356.86,
              "y": 8,
              "z": 0
            },
            {
              "x": -342.87,
              "y": 8,
              "z": 0
            },
            {
              "x": -328.87,
              "y": 8,
              "z": 0
            },
            {
              "x": -314.88,
              "y": 8,
              "z": 0
            },
            {
              "x": -300.89,
              "y": 8,
              "z": 0
            },
            {
              "x": -286.89,
              "y": 8,
              "z": 0
            },
            {
              "x": -272.9,
              "y": 8,
              "z": 0
            },
            {
              "x": -258.9,
              "y": 8,
              "z": 0
            },
            {
              "x": -244.91,
              "y": 8,
              "z": 0
            },
            {
              "x": -230.91,
              "y": 8,
              "z": 0
            },
            {
              "x": -216.92,
              "y": 8,
              "z": 0
            },
            {
              "x": -202.92,
              "y": 8,
              "z": 0
            },
            {
              "x": -188.93,
              "y": 8,
              "z": 0
            },
            {
              "x": -174.93,
              "y": 8,
              "z": 0
            },
            {
              "x": -160.94,
              "y": 8,
              "z": 0
            },
            {
              "x": -146.94,
              "y": 8,
              "z": 0
            },
            {
              "x": -132.95,
              "y": 8,
              "z": 0
            },
            {
              "x": -118.95,
              "y": 8,
              "z": 0
            },
            {
              "x": -104.96,
              "y": 8,
              "z": 0
            },
            {
              "x": -90.97,
              "y": 8,
              "z": 0
            },
            {
              "x": -76.97,
              "y": 8,
              "z": 0
            },
            {
              "x": -62.98,
              "y": 8,
              "z": 0
            },
            {
              "x": -48.98,
              "y": 8,
              "z": 0
            },
            {
              "x": -34.99,
              "y": 8,
              "z": 0
            },
            {
              "x": -20.99,
              "y": 8,
              "z": 0
            },
            {
              "x": -7,
              "y": 8,
              "z": 0
            },
            {
              "x": 7,
              "y": 8,
              "z": 0
            },
            {
              "x": 20.99,
              "y": 8,
              "z": 0
            },
            {
              "x": 34.99,
              "y": 8,
              "z": 0
            },
            {
              "x": 48.98,
              "y": 8,
              "z": 0
            },
            {
              "x": 60,
              "y": 8,
              "z": 0
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
              "x": 60,
              "y": 8,
              "z": 0
            },
            {
              "x": 62.98,
              "y": 8,
              "z": 0
            },
            {
              "x": 76.97,
              "y": 8,
              "z": 0
            },
            {
              "x": 90.97,
              "y": 8,
              "z": 0
            },
            {
              "x": 104.96,
              "y": 8,
              "z": 0
            },
            {
              "x": 118.95,
              "y": 8,
              "z": 0
            },
            {
              "x": 132.95,
              "y": 8,
              "z": 0
            },
            {
              "x": 146.94,
              "y": 8,
              "z": 0
            },
            {
              "x": 160.94,
              "y": 8,
              "z": 0
            },
            {
              "x": 174.93,
              "y": 8,
              "z": 0
            },
            {
              "x": 188.93,
              "y": 8,
              "z": 0
            },
            {
              "x": 202.92,
              "y": 8,
              "z": 0
            },
            {
              "x": 216.92,
              "y": 8,
              "z": 0
            },
            {
              "x": 230.91,
              "y": 8,
              "z": 0
            },
            {
              "x": 244.91,
              "y": 8,
              "z": 0
            },
            {
              "x": 258.9,
              "y": 8,
              "z": 0
            },
            {
              "x": 272.9,
              "y": 8,
              "z": 0
            },
            {
              "x": 286.89,
              "y": 8,
              "z": 0
            },
            {
              "x": 300.89,
              "y": 8,
              "z": 0
            },
            {
              "x": 314.88,
              "y": 8,
              "z": 0
            },
            {
              "x": 328.87,
              "y": 8,
              "z": 0
            },
            {
              "x": 340,
              "y": 8,
              "z": 0
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
              "x": 340,
              "y": 8,
              "z": 0
            },
            {
              "x": 342.87,
              "y": 7.2,
              "z": 0
            },
            {
              "x": 356.86,
              "y": 6.4,
              "z": 0
            },
            {
              "x": 370.86,
              "y": 5.6,
              "z": 0
            },
            {
              "x": 384.85,
              "y": 4.8,
              "z": 0
            },
            {
              "x": 398.85,
              "y": 4,
              "z": 0
            },
            {
              "x": 412.84,
              "y": 3.2,
              "z": 0
            },
            {
              "x": 426.84,
              "y": 2.4,
              "z": 0
            },
            {
              "x": 440.83,
              "y": 1.6,
              "z": 0
            },
            {
              "x": 454.83,
              "y": 0.8,
              "z": 0
            },
            {
              "x": 480,
              "y": 0,
              "z": 0
            }
          ],
          "shoulder": 1,
          "width": 6
        }
      ]
    },
    "spawn": {
      "x": -510,
      "z": 0
    },
    "stream": {
      "aheadMax": 900,
      "aheadMin": 200,
      "budgetMs": 120,
      "chunk": 640,
      "keep": 1,
      "overlap": 1.175
    },
    "units": "meters",
    "windows": {
      "lit": 0.4,
      "spacing": 12
    }
  },
  "name": "Глава 18. Мост и съезд",
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
LEVEL_18.map.skeleton = decodeSkeleton(await loadSkel());
