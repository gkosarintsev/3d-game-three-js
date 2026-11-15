/**
 * Автотест пайплайна v3/v4 (CityForge → каталог) на Node.
 *
 * Покрывает поддерживаемые пути: экспорт/приёмку JSON Schema v3/common/v4,
 * валидацию v3/v4 брифов и отказ инструмента сборки от устаревших v1/v2
 * (`json`/`json2`) источников. Браузерные автотесты карты стоят отдельно.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateLevel, LEVEL_SPEC_OPEN, LEVEL_SPEC_V3, LEVEL_SPEC_V4, LEVEL_COMMON_V3 } from './level-schema.mjs';
import { generateOutput, expandCityforgeSource, ValidationError } from './build-level.mjs';
import { schemaTextFor, SCHEMA_FILES } from './export-schema.mjs';
import { normalizeLevel } from './normalize-level.mjs';

const ROOT = resolve(import.meta.dirname, '..');

let passed = 0;
const failures = [];
const pending = [];

function t(name, fn) {
  pending.push((async () => {
    try {
      await fn();
      passed++;
      console.log(`  ok  ${name}`);
    } catch (e) {
      failures.push(name);
      console.log(`FAIL  ${name}\n      ${String(e.message).split('\n')[0]}`);
    }
  })());
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function eq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
  }
}

function hasError(errors, ...needles) {
  const hit = errors.find(e => needles.every(n => e.includes(n)));
  assert(hit, `ошибка не найдена.\nожидались подстроки: ${needles.join(' + ')}\nполучены: ${errors.join('\n') || '(нет ошибок)'}`);
  return hit;
}

const BRIEFS = readdirSync(resolve(ROOT, 'src/levels'))
  .filter(f => /^level-.*\.json$/.test(f) && !/schema\.json$/.test(f))
  .sort()
  .map(f => `src/levels/${f}`);

function checkJsonSchema(value, schema, path, errors, defs) {
  defs = defs ?? schema.__defs;
  if (schema.$ref) {
    const name = schema.$ref.slice(schema.$ref.lastIndexOf('/') + 1);
    const target = defs?.[name];
    if (!target) { errors.push(`${path}: $ref ${schema.$ref} не разрешён`); return; }
    checkJsonSchema(value, target, path, errors, defs);
    return;
  }
  if (schema.oneOf) {
    if (!schema.oneOf.some(br => !checkJsonSchema(value, br, path, [], defs))) {
      errors.push(`${path}: не подходит ни под одну ветку oneOf`);
    }
    return;
  }
  switch (schema.type) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) { errors.push(`${path}: ожидалось число`); return; }
      if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: ${value} < minimum ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: ${value} > maximum ${schema.maximum}`);
      return;
    case 'string':
      if (typeof value !== 'string') { errors.push(`${path}: ожидалась строка`); return; }
      if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: '${value}' вне enum`);
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: '${value}' не в pattern ${schema.pattern}`);
      return;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}: ожидалось true|false`);
      return;
    case 'array':
      if (!Array.isArray(value)) { errors.push(`${path}: ожидался массив`); return; }
      if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: меньше ${schema.minItems} элементов`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: больше ${schema.maxItems} элементов`);
      value.forEach((v, i) => checkJsonSchema(v, schema.items, `${path}[${i}]`, errors, defs));
      return;
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${path}: ожидался объект`); return; }
      for (const key of schema.required ?? []) {
        if (value[key] === undefined) errors.push(`${path}.${key}: обязательное поле отсутствует`);
      }
      for (const [key, sub] of Object.entries(schema.properties ?? {})) {
        if (value[key] !== undefined) checkJsonSchema(value[key], sub, `${path}.${key}`, errors, defs);
      }
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!(key in (schema.properties ?? {}))) errors.push(`${path}.${key}: поля нет в схеме`);
        }
      }
      return;
    }
    default:
      errors.push(`${path}: схема дала узел без известного type (${JSON.stringify(schema.type)})`);
  }
}

function renderFor(entry) {
  const root = JSON.parse(schemaTextFor(entry));
  const common = SCHEMA_FILES.find(e => e.definitions);
  if (common) root.__defs = JSON.parse(schemaTextFor(common)).definitions;
  return root;
}

t('закоммиченные JSON Schema совпадают с выводом экспортёра побайтово', () => {
  for (const entry of SCHEMA_FILES) {
    const { out } = entry;
    const fresh = schemaTextFor(entry);
    const committed = readFileSync(out, 'utf8').replace(/\r\n/g, '\n');
    assert(committed === fresh,
      `${out.split(/[\\/]/).pop()}: расходится с DSL — перезапустите node tools/export-schema.mjs`);
  }
});

t('экспортированная схема принимает каждый закоммиченный cityforge-бриф', () => {
  assert(BRIEFS.length > 0, 'нет закоммиченных брифов src/levels/level-*.json');
  for (const file of BRIEFS) {
    const raw = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));
    assert(raw.kind === 'cityforge', `${file}: ожидается cityforge, получено ${raw.kind}`);
    const entry = raw.schemaVersion === 4 ? SCHEMA_FILES[2] : SCHEMA_FILES[0];
    const errors = [];
    checkJsonSchema(raw, renderFor(entry), '', errors);
    assert(errors.length === 0, `${file}: rejected — ${errors.slice(0, 4).join(' | ')}`);
  }
});

t('схема отбраковывает лишний ключ и число вне предела', () => {
  const raw = JSON.parse(readFileSync(resolve(ROOT, BRIEFS[0]), 'utf8'));
  const entry = raw.schemaVersion === 4 ? SCHEMA_FILES[2] : SCHEMA_FILES[0];
  const schema = renderFor(entry);
  const stray = structuredClone(raw);
  stray.unknownTopLevel = 1;
  const errors = [];
  checkJsonSchema(stray, schema, '', errors);
  hasError(errors, '.unknownTopLevel', 'поля нет в схеме');

  const out = structuredClone(raw);
  delete out.unknownTopLevel;
  out.ground.size = 1;
  const e2 = [];
  checkJsonSchema(out, schema, '', e2);
  hasError(e2, 'ground.size', 'minimum');
});

t('v3 принимает минимальный CityForge-бриф и не оставляет неразрешённых $ref', () => {
  const brief = {
    kind: 'cityforge',
    metadata: { levelName: 'level-99', name: 'Test', hint: 'Reach B', units: 'meters' },
    ground: { size: 256 },
    gameplay: { goal: 'exit', spawn: { x: 0, z: 0 }, exit: { x: 10, z: 10 } },
    cityforge: {
      format: 'cityforge',
      version: '0.1',
      world: {
        units: 'meters',
        coordinateSystem: { type: 'local', handedness: 'right', up: 'Y' },
        bounds: { min: [0, 0, 0], max: [256, 0, 256] },
      },
    },
  };
  const errors = [];
  checkJsonSchema(brief, renderFor(SCHEMA_FILES[0]), '', errors);
  eq(errors.length, 0, `CityForge-бриф отвергнут: ${errors.slice(0, 4).join(' | ')}`);

  const broken = mutate => {
    const bad = structuredClone(brief);
    mutate(bad);
    const errs = [];
    checkJsonSchema(bad, renderFor(SCHEMA_FILES[0]), '', errs);
    return errs;
  };
  hasError(broken(b => { delete b.gameplay.exit; }), 'gameplay.exit', 'обязательное поле отсутствует');
  hasError(broken(b => { b.cityforge.networks = { roads: { nodes: [{ id: 'n1' }] } }; }), 'networks.roads.nodes[0].position', 'обязательное поле отсутствует');
  hasError(broken(b => { b.cityforge.networks = { roads: { nodes: [{ id: 'n1', position: [0, 0, 0], layer: 'bogus' }] } }; }), 'networks.roads.nodes[0].layer', 'pattern');
  hasError(broken(b => { b.cityforge.instances = [{ id: 'i1', template: 't', transform: { rotation: [0, 0, 0, 1] } }]; }), 'instances[0].transform.position', 'обязательное поле отсутствует');
  hasError(broken(b => { b.cityforge.caves = [{ id: 'c1' }]; }), 'cityforge.caves', 'ожидался объект');

  const common = JSON.parse(schemaTextFor(SCHEMA_FILES.find(e => e.definitions)));
  const refs = [];
  const walk = node => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.$ref === 'string') refs.push(node.$ref);
    Object.values(node).forEach(walk);
  };
  walk(JSON.parse(schemaTextFor(SCHEMA_FILES[0])));
  walk(common);
  const missing = refs.filter(r => !common.definitions[r.split('/definitions/')[1]]);
  eq(missing.length, 0, `неразрешённые $ref: ${missing.slice(0, 4).join(', ')}`);
});

t('validateLevel принимает минимальные v3/v4 по DSL и бракует лишние поля', () => {
  const v3 = {
    kind: 'cityforge',
    metadata: { levelName: 'level-99', name: 'Test', hint: 'Reach B', units: 'meters' },
    ground: { size: 256 },
    gameplay: { goal: 'exit', spawn: { x: 0, z: 0 }, exit: { x: 10, z: 10 } },
    cityforge: {
      format: 'cityforge',
      version: '0.1',
      world: {
        units: 'meters',
        coordinateSystem: { type: 'local', handedness: 'right', up: 'Y' },
        bounds: { min: [0, 0, 0], max: [256, 0, 256] },
      },
    },
  };
  const ok3 = validateLevel(v3, LEVEL_SPEC_V3);
  eq(ok3.errors.length, 0, `v3 DSL errors: ${ok3.errors.join(' | ')}`);
  const bad3 = structuredClone(v3);
  bad3.extra = 1;
  hasError(validateLevel(bad3, LEVEL_SPEC_V3).errors, 'extra');

  const v4 = structuredClone(v3);
  v4.schemaVersion = 4;
  v4.generator = { generatorVersion: '0.1', seed: 1, districts: [] };
  const ok4 = validateLevel(v4, LEVEL_SPEC_V4);
  eq(ok4.errors.length, 0, `v4 DSL errors: ${ok4.errors.join(' | ')}`);
});

t('косой path-отрезок: схема принимает, нормализатор даёт повёрнутую пластину, а не осевой габарит', () => {
  // 1. Схема: path-дорога под 45° больше не бракуется «настил обязан идти по оси X/Z».
  const source = {
    kind: 'cityforge', schemaVersion: 4,
    metadata: { levelName: 'diag', name: 'diag', hint: 'diag', units: 'meters' },
    ground: { y: 0, size: 400 },
    gameplay: { goal: 'exit', spawn: { x: -100, z: -100 }, exit: { x: 100, z: 100 } },
    cityforge: {
      format: 'cityforge', version: '0.1',
      world: {
        units: 'meters',
        coordinateSystem: { type: 'local', handedness: 'right', up: 'Y' },
        origin: [0, 0, 0],
        bounds: { min: [-200, -200, -80], max: [200, 200, 160] },
      },
      networks: {
        roads: {
          nodes: [
            { id: 'a', position: [-50, 0, -50], layer: 'ground' },
            { id: 'b', position: [50, 0, 50], layer: 'ground' },
          ],
          segments: [{
            id: 'diag', from: 'a', to: 'b', type: 'local', layer: 'ground',
            path: [[-50, 0, -50], [50, 0, 50]],
            lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }],
          }],
          junctions: [],
        },
      },
    },
  };
  const { errors } = validateLevel(source, LEVEL_SPEC_V4);
  eq(errors.length, 0, `схема v4 отвергла косой path: ${errors.join(' | ')}`);

  // 2. Нормализатор: косой отрезок — повёрнутая пластина с кадром/obb, иначе
  // осевой габарит крошил бы дорогу в ступенчатую ленту.
  const engine = {
    kind: 'open', metadata: { name: 'diag' }, ground: { y: 0, size: 400 },
    roads: [{
      id: 'diag', type: 'ground', width: 8,
      points: [{ x: -50, y: 0, z: -50 }, { x: 0, y: 0, z: 0 }, { x: 50, y: 0, z: 50 }],
    }],
    gameplay: { goal: 'exit', spawn: { x: -100, z: -100 }, exit: { x: 100, z: 100 } },
  };
  const level = normalizeLevel(engine);
  const road = level.map.roads.find(r => r.id === 'diag');
  assert(road, 'нормализатор потерял косую path-дорогу');
  eq(road.type, 'ground', 'тип косой дороги перестал быть ground');
  eq(road.decks.length, 2, 'ожидались две пластины на два косых отрезка');
  const len = Math.hypot(100, 100) / 2;
  for (const d of road.decks) {
    eq(d.axis, 'x', 'у повёрнутой пластины кадр обязан быть по локальной X');
    assert(d.obb, 'у косой пластины нет obb — твёрдость считалась бы по осевому габариту');
    assert(Math.abs(d.yaw) > 1 && Math.abs(d.yaw) < 89, `ожидался косой yaw, получено ${d.yaw}`);
    eq(d.width, 8, 'ширина пластины не совпала с полотном');
    assert(Math.abs(d.length - len) < 0.01, `длина пластины ${d.length}, ожидалась ${len}`);
    // габарит повёрнутой пластины 70,7×8 при 45° — это ~78,7×78,7, а не полоса 8 м
    assert(d.maxX - d.minX > 8.5 && d.maxZ - d.minZ > 8.5, 'габарит остался осевой полосой');
  }
  const [d1, d2] = road.decks;
  assert(Math.abs(d1.topAtMax - d2.topAtMin) < 1e-9, 'отметки на стыке пластин не совпали');
  assert(Math.abs((d2.cx - d1.cx) - 50) < 0.01 && Math.abs((d2.cz - d1.cz) - 50) < 0.01,
    'вторая пластина не продолжает диагональ от стыка');
});

t('expand детерминирован, идемпотентен и не мутирует исходный бриф', () => {
  // Стадии citygen пишут в ctx.input, поэтому expand обязан работать по копии:
  // иначе второй разворот того же объекта (редактор зовёт Expand на уже
  // развёрнутом черновике) получал бы мутированный вход и другой источник.
  const file = resolve(ROOT, 'src', 'levels', 'level-17.json');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const snapshot = JSON.stringify(raw);
  const a = expandCityforgeSource(raw, 'level-17.json');
  const b = expandCityforgeSource(raw, 'level-17.json');
  eq(JSON.stringify(raw), snapshot, 'expand изменил входной бриф');
  eq(JSON.stringify(a.source), JSON.stringify(b.source), 'два expand одного объекта дали разные источники');
  const val = validateLevel(a.source, LEVEL_SPEC_V4);
  eq(val.errors.length, 0, `развёрнутый источник не проходит схему v4: ${val.errors.join(' | ')}`);
  const re = expandCityforgeSource(JSON.parse(JSON.stringify(a.source)), 'level-17.json').source;
  const counts = (s) => [
    (s.cityforge?.networks?.roads?.segments ?? []).length,
    (s.buildings ?? []).length,
    (s.landscapeObjects ?? []).length,
    (s.lights ?? []).length,
  ].join('/');
  eq(counts(re), counts(a.source), 'повторный expand развёрнутого источника добавил объекты');
});

t('build-level отвергает устаревшие json/json2 источники', () => {
  for (const kind of ['json', 'json2']) {
    let err = null;
    try { generateOutput({ kind, metadata: {}, ground: { size: 64 }, gameplay: { goal: 'exit', spawn: { x: 0, z: 0 }, exit: { x: 1, z: 1 } } }, `src/levels/legacy-${kind}.json`); }
    catch (e) { err = e; }
    assert(err instanceof ValidationError, `${kind}: ожидался ValidationError`);
    assert(String(err.message).includes(kind) && /не поддерж/i.test(err.message), `${kind}: нет ясной ошибки: ${err?.message}`);
  }
});

t('у каждого адресуемого поля v3-схемы и common есть описание (где применимо)', () => {
  const PRIM = new Set(['number', 'string', 'boolean', 'color']);
  const missing = [];
  const walk = (node, path, isField) => {
    if (!node || typeof node !== 'object') return;
    if ((isField || node.kind === 'object') && !node.doc) missing.push(path);
    if (node.kind === 'object') {
      for (const [k, sub] of Object.entries(node.fields ?? {})) walk(sub, `${path}.${k}`, true);
    } else if (node.kind === 'array') {
      walk(node.items, `${path}[]`, !PRIM.has(node.items?.kind));
    }
  };
  walk(LEVEL_SPEC_V3, 'v3', true);
  for (const [name, def] of Object.entries(LEVEL_COMMON_V3.definitions ?? {})) walk(def, `common.${name}`, true);
  assert(missing.length < 500, `подозрительно много полей без описания: ${missing.slice(0, 8).join(', ')} (всего ${missing.length})`);
});

t('$schema каждого закоммиченного брифа ведёт к существующей схеме своей версии', () => {
  const want = raw => raw.schemaVersion === 4 ? './level-v4.schema.json' : './level-v3.schema.json';
  for (const file of BRIEFS) {
    const raw = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));
    eq(raw.$schema, want(raw), `${file}: $schema не соответствует версии`);
    assert(existsSync(resolve(ROOT, 'src/levels', raw.$schema)), `${file}: ${raw.$schema} не существует`);
  }
});

await Promise.all(pending);

console.log(`\n${passed}/${passed + failures.length} проверок зелёные`);
if (failures.length) {
  console.error(`провалено: ${failures.join(', ')}`);
  process.exitCode = 1;
}
