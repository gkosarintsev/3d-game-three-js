/**
 * Схема уровня (JSON, который выдаёт LLM) и её проверка — бэкенд-валидатор
 * пайплайна из docs/editor-plan.md.
 *
 * Ajv в проект не ставится (правило «новых npm-зависимостей» в AGENTS.md),
 * поэтому поля описаны декларативно и обходятся руками. Проверка делится на
 * два прохода: структура (типы, обязательность, enum, диапазоны, плюс правила
 * `stream`, где вердикт зависит сразу от нескольких полей) и геометрия
 * (осевые рёбра, замкнутость, «комната внутри footprint», пересечения, уклоны
 * дорог, опоры в плане дороги, лимит настоящих источников света).
 */
import { CONFIG } from '../src/config.js';
import {
  AXIS_EPS, arcBounds, cellKey, frameAt, frameOf, normalizePolygon, obbHitsObb, obbHitsRect, obbOf,
  polyBounds, polyEdges, polyRects, r3, rasterPoly, rasterRect, rectsIntersect, cellsIntersect,
  rotatedBounds,
} from '../src/geo2d.js';
import { bridgeNoses, normalizeBuilding, normalizeWaterway, resolveRoadElements, roadCapsOf, toWorld, isV2Kind } from './normalize-level.mjs';
import { ARCHETYPE_NAMES, STYLE_NAMES, DISTRICT_DEFAULTS, TRACK_DEFAULTS, TRACK_MAX_JITTER } from './city.js';
import { cellGrid, CHUNK_MIN, CHUNK_MAX } from './chunk-level.mjs';
import { reliefOf } from '../src/relief.js';

const J = CONFIG.jsonMap;
const DEG = Math.PI / 180;
// тип комнаты — подпись назначения: парсер и JsonMap его не читают (пол, солид и
// граф от него не зависят), но автору брифа он нужен, чтобы по id и типу
// различать вестибюль, рынок и склад — и чтобы этап неона мог вешать витрины
// на торговые, а не на первые попавшиеся
const ROOM_TYPES = ['office', 'corridor', 'hall', 'room', 'cafe', 'utility', 'lobby', 'market', 'warehouse'];
// skybridge — не-наземный настил без опор: его держат здания, поэтому у каждого
// его торца обязана быть дверь или ходовая кровля на той же отметке
const ROAD_TYPES = ['ground', 'bridge', 'embankment', 'skybridge'];
// ladder — вертикальный марш: план шахты не меняется с высотой, подъём одной
// проступи тот же, что у ступени (J.maxRise), поэтому нога идёт им, как лестницей
const STAIR_TYPES = ['straight', 'l_shape', 'spiral', 'ladder'];
const BANK_TYPES = ['quay', 'slope'];
const LIGHT_TYPES = ['point', 'spot', 'directional'];
const LINK_TYPES = ['main_entrance', 'door', 'back_entrance'];

// ------------------------------------------------------------- описание полей

const num = (opts = {}) => ({ kind: 'number', ...opts });
const str = (opts = {}) => ({ kind: 'string', ...opts });
const bool = (opts = {}) => ({ kind: 'boolean', ...opts });
const color = (opts = {}) => ({ kind: 'color', ...opts });
const obj = (fields, opts = {}) => ({ kind: 'object', fields, ...opts });
const arr = (items, opts = {}) => ({ kind: 'array', items, ...opts });
const ref = (name, opts = {}) => ({ kind: 'ref', name, ...opts });
const XZ = obj({ x: num({ req: true, doc: 'м: мировая координата X' }), z: num({ req: true, doc: 'м: мировая координата Z' }) }, { doc: 'точка в плане (метры)' });
const XYZ = obj({ x: num({ req: true, doc: 'м: мировая координата X' }), y: num({ req: true, doc: 'м: мировая отметка' }), z: num({ req: true, doc: 'м: мировая координата Z' }) }, { doc: 'точка в мире (метры)' });
/**
 * Описание полей брифа. У v1/v2 каждый лист несёт `doc` — смысл, единицу и
 * источник предела или дефолта; у v3 (`level-common.schema.json`) `doc` есть
 * только у неочевидных полей и только на английском. `default` ставится, лишь
 * если код действительно подставляет значение при отсутствии поля. Ни `doc`, ни `default` не участвуют в проверке:
 * `checkValue` читает `kind/min/max/enum/req/items/fields` и больше ничего. Они
 * нужны `tools/export-schema.mjs`, который печатает JSON Schema draft-07 —
 * единственный артефакт, который автор (или ИИ) может прочитать ДО запуска
 * пайплайна. Отсюда правило брифа: число, равное `default` из схемы, в бриф не
 * пишут — ср. `city.track` главы 13, где 14 полей из 15 дословно повторяли
 * `TRACK_DEFAULTS`, и правка радиуса в генераторе осталась бы невидимой в данных
 * главы.
 *
 * `default` обязан приходить из того же объекта, который подставляет его в коде
 * (`CONFIG.jsonMap`, `CONFIG.fog/sun/hemi/night/terrain`, `DISTRICT_DEFAULTS` и
 * `TRACK_DEFAULTS` из tools/city.js), иначе схема станет второй правдой.
 */

/**
 * Секция `city` описана здесь ради экспортируемой схемы: `expandCity` вырезает
 * `city` из брифа ДО валидатора, поэтому `validateLevel` её не видит и это
 * описание ничего не проверяет. Без него JSON Schema отвергал бы каждый бриф
 * с секцией `city`.
 *
 * Списки ключей живут в гейтах генератора (`CITY_KEYS`, `DISTRICT_KEYS`,
 * `DISTRICT_SECTION_KEYS`, `V2_DISTRICT_KEYS`, `V2_DISTRICT_SECTION_KEYS` и
 * `TRACK_KEYS` в tools/city.js), а совпадение описания с гейтом сторожит сюита
 * `ключи city в схеме равны гейтам генератора`: расхождение означает, что
 * редактор подсказывает автору ключ, который пайплайн бракует, или наоборот —
 * молчит о ключе, который генератор не читает.
 */
const V3XYZ = obj({ x: num({ req: true, doc: 'м: мировая координата X' }), y: num({ req: true, doc: 'м: мировая отметка' }), z: num({ req: true, doc: 'м: мировая координата Z' }) }, { doc: 'точка в мире (метры)' });
/**
 * Описание полей брифа. У v1/v2 каждый лист несёт `doc` — смысл, единицу и
 * источник предела или дефолта; у v3 (`level-common.schema.json`) `doc` есть
 * только у неочевидных полей и только на английском. `default` ставится, лишь
 * если код действительно подставляет значение при отсутствии поля. Ни `doc`, ни `default` не участвуют в проверке:
 * `checkValue` читает `kind/min/max/enum/req/items/fields` и больше ничего. Они
 * нужны `tools/export-schema.mjs`, который печатает JSON Schema draft-07 —
 * единственный артефакт, который автор (или ИИ) может прочитать ДО запуска
 * пайплайна. Отсюда правило брифа: число, равное `default` из схемы, в бриф не
 * пишут — ср. `city.track` главы 13, где 14 полей из 15 дословно повторяли
 * `TRACK_DEFAULTS`, и правка радиуса в генераторе осталась бы невидимой в данных
 * главы.
 *
 * `default` обязан приходить из того же объекта, который подставляет его в коде
 * (`CONFIG.jsonMap`, `CONFIG.fog/sun/hemi/night/terrain`, `DISTRICT_DEFAULTS` и
 * `TRACK_DEFAULTS` из tools/city.js), иначе схема станет второй правдой.
 */

/**
 * Описание полей брифа. У v1/v2 каждый лист несёт `doc` — смысл, единицу и
 * источник предела или дефолта; у v3 (`level-common.schema.json`) `doc` есть
 * только у неочевидных полей и только на английском. `default` ставится, лишь
 * если код действительно подставляет значение при отсутствии поля. Ни `doc`, ни `default` не участвуют в проверке:
 * `checkValue` читает `kind/min/max/enum/req/items/fields` и больше ничего. Они
 * нужны `tools/export-schema.mjs`, который печатает JSON Schema draft-07 —
 * единственный артефакт, который автор (или ИИ) может прочитать ДО запуска
 * пайплайна. Отсюда правило брифа: число, равное `default` из схемы, в бриф не
 * пишут — ср. `city.track` главы 13, где 14 полей из 15 дословно повторяли
 * `TRACK_DEFAULTS`, и правка радиуса в генераторе осталась бы невидимой в данных
 * главы.
 *
 * `default` обязан приходить из того же объекта, который подставляет его в коде
 * (`CONFIG.jsonMap`, `CONFIG.fog/sun/hemi/night/terrain`, `DISTRICT_DEFAULTS` и
 * `TRACK_DEFAULTS` из tools/city.js), иначе схема станет второй правдой.
 */

const PLATE = obj({
  x: num({ req: true, doc: 'м: мировой центр осевой линии пластины' }),
  z: num({ req: true, doc: 'м: мировой центр осевой линии пластины' }),
  yaw: num({ min: -360, max: 360, default: 0, doc: 'град: поворот вокруг центра; `connect: tangent` переносит только угол, позицию автор задаёт сам' }),
  length: num({ min: 1, req: true, doc: 'м: длина вдоль собственной оси (ось от −length/2 до +length/2)' }),
  width: num({ min: 2, max: 30, req: true, doc: 'м: ширина полотна поперёк оси (на начале u = −L/2; или постоянная)' }),
  widthEnd: num({ min: 2, max: 30, doc: 'м: ширина полотна на конце (u = +L/2); при отличии от width пластина становится трапециевидной (плавный переход)' }),
  crossStart: num({ min: -30, max: 30, default: 0, doc: 'м: поперечный сдвиг центра полотна на начале (u = −L/2) в локальной оси поперёк' }),
  crossEnd: num({ min: -30, max: 30, doc: 'м: поперечный сдвиг центра полотна на конце (u = +L/2); по умолчанию равен crossStart' }),
  y: num({ req: true, doc: 'м: верх нa **локальном начале** (u = −length/2), не в мировом minX; при yaw = −180 начало смотрит на восток' }),
  rise: num({ default: 0, doc: 'м: перепад верха от начала к концу; уклон = rise / length, предел J.maxSlope' }),
  rails: bool({ default: false, doc: 'перила по обеим кромкам; `railSide` сознательно не вводится' }),
}, { doc: 'прямая (или трапециевидная) пластина настила v2' });

const ARC = obj({
  cx: num({ req: true, doc: 'м: мировой центр окружности дуги' }),
  cz: num({ req: true, doc: 'м: мировой центр окружности дуги' }),
  radius: num({ min: 2, req: true, doc: 'м: радиус осевой дуги; при ширине полотна 8 м радиус < 4 м даёт отрицательную внутреннюю кромку и бракуется схемой' }),
  from: num({ min: -360, max: 360, req: true, doc: 'град: начало обхода' }),
  to: num({ min: -360, max: 360, req: true, doc: 'град: конец обхода' }),
  width: num({ min: 2, max: 30, req: true, doc: 'м: ширина полотна' }),
  y: arr(num(), { minItems: 2, maxItems: 2, req: true, doc: 'м: [верх на from, верх на to]; продольный уклон — перепад / длина дуги' }),
  bank: num({ min: -30, max: 30, default: 0, doc: 'град: крен в середине сектора, ноль на обоих срезах, переход — половиной косинуса; длина перехода считается из двух пределов (остаток J.maxSlope после продольного уклона и сам продольный уклон)' }),
  rails: bool({ default: false, doc: 'перила по обеим кромкам' }),
}, { doc: 'дуга-настил: точная поверхность по углу, радиусу и крену' });

const HILL = obj({
  id: str({ doc: 'имя для метки и для текста ошибки предельного уклона' }),
  x: num({ req: true, doc: 'м: начало капсулы' }),
  z: num({ req: true, doc: 'м: начало капсулы' }),
  bx: num({ doc: 'м: конец капсулы; без пары к (x,z) это круг' }),
  bz: num({ doc: 'м: конец капсулы' }),
  radius: num({ min: 2, req: true, doc: 'м: радиус capsule' }),
  height: num({ min: -300, max: 300, req: true, doc: 'м: подъём над полем; отрицательное — провал (долина). Крутизна холма ограничена relief.hillMaxSlope' }),
}, { doc: 'холм-капсула поля высот' });

const PAD = obj({
  id: str({ doc: 'имя для текста предупреждения о нехватке переходной зоны' }),
  minX: num({ req: true, doc: 'м: сторона ядра площадки (ось X, мировая до yaw)' }),
  maxX: num({ req: true, doc: 'м: сторона ядра площадки' }),
  minZ: num({ req: true, doc: 'м: сторона ядра площадки' }),
  maxZ: num({ req: true, doc: 'м: сторона ядра площадки' }),
  y: num({ req: true, doc: 'м: отметка ядра; смешивается с полем весом, поэтому соседние террасы обязаны не перекрываться произвольно' }),
  blend: num({ min: 1, max: 200, doc: 'м: ширина переходной зоны к полю; по умолчанию relief.blend, предел J.relief.maxBlend' }),
  yaw: num({ min: -360, max: 360, default: 0, doc: 'град: поворот вокруг центра прямоугольника' }),
}, { doc: 'площадка поля высот (терраса района, площадь, насыпь)' });

const ROAD_CORRIDOR = obj({
  id: str({ doc: 'имя коридора для отладки' }),
  width: num({ min: 2, max: 60, default: 8, doc: 'м: ширина полотна дороги' }),
  shoulder: num({ min: 0, max: 20, default: 2, doc: 'м: ширина обочины с мягким уклоном' }),
  blend: num({ min: 0.5, max: 120, default: 10, doc: 'м: ширина плавного перехода от обочины к природному полю' }),
  crossLevel: bool({ default: false, doc: 'выравнивать поперёк полотна по отметке оси, сохраняя продольный профиль по рельефу' }),
  points: arr(obj({
    x: num({ req: true, doc: 'м: ось дороги' }),
    y: num({ default: 0, doc: 'м: отметка профиля дороги в точке (при crossLevel берётся отметка рельефа на оси)' }),
    z: num({ req: true, doc: 'м: ось дороги' }),
  }, { doc: 'точка оси коридора' }), { minItems: 2, req: true, doc: 'ломаная оси коридора' }),
}, { doc: 'коридор предварительного выравнивания ландшафта под дорогой (cut-and-fill)' });

const RELIEF = obj({
  baseY: num({ doc: 'м: нулевая отметка поля; по умолчанию ground.y' }),
  maxSlope: num({ min: 0.01, max: 1.5, default: J.relief.maxSlope, doc: 'м/м: предел крутизны **поля** (уклон грунта). Не путать с `J.maxSlope` — пределом настила, и с `city.districts[].street.grade` — подъёмом проезжей части' }),
  hillMaxSlope: num({ min: 0.01, max: 1.5, default: J.relief.hillMaxSlope, doc: 'м/м: предел крутизны отдельного холма (1,5 · height / radius); умножение на 1,5 — аналитический максимум производной капсулы' }),
  blend: num({ min: 1, max: 200, default: J.relief.blend, doc: 'м: ширина перехода площадки к полю по умолчанию' }),
  cell: num({ min: 2, max: 60, default: J.planGrid, doc: 'м: сторона клетки индекса рельефа (цена пробы, не геометрия)' }),
  hills: arr(HILL, { minItems: 1, maxItems: J.relief.maxHills, doc: 'холмы поля; лимит J.relief.maxHills' }),
  pads: arr(PAD, { minItems: 1, doc: 'площадки поля' }),
  roadCorridors: arr(ROAD_CORRIDOR, { minItems: 1, doc: 'коридоры выравнивания ландшафта под дорогами' }),
}, { doc: 'аналитическое поле высот: при наличии секции гасится groundPlane («пол мира — ноль» больше не опора)' });


const DISTRICT_STREET = obj({
  pitch: num({ min: 8, default: DISTRICT_DEFAULTS.street.pitch, doc: 'м: шаг улиц квартала' }),
  width: num({ min: 2, default: DISTRICT_DEFAULTS.street.width, doc: 'м: ширина проезжей части' }),
  grade: num({ min: 0, max: J.maxSlope, default: J.streetGrade, doc: 'м/м: подъём проезжей части района по профилю поля. Это НЕ крутизна грунта (relief.maxSlope) и не уклон настила' }),
}, { doc: 'сетка улиц района' });

/** Район генератора кварталов (tools/city.js). */
const CITY_DISTRICT = obj({
  id: str({ req: true, doc: 'имя района: по нему строятся id лотов `<id>_<номер>` и префикс вытеснения авторской записи' }),
  name: str({ doc: 'название для человека' }),
  style: str({ enum: STYLE_NAMES, default: DISTRICT_DEFAULTS.style, doc: 'набор материалов фасада квартала' }),
  block: obj({
    minX: num({ req: true, doc: 'м: граница AABB квартала в мировых осях' }),
    maxX: num({ req: true, doc: 'м: граница AABB квартала' }),
    minZ: num({ req: true, doc: 'м: граница AABB квартала' }),
    maxZ: num({ req: true, doc: 'м: граница AABB квартала' }),
  }, { req: true, doc: 'прямоугольник квартала; при `polygon` это габарит полигона, и по нему мелится сетка' }),
  street: DISTRICT_STREET,
  lot: obj({
    pitch: num({ min: 4, default: DISTRICT_DEFAULTS.lot.pitch, doc: 'м: шаг лотов' }),
    inset: num({ min: 0, default: DISTRICT_DEFAULTS.lot.inset, doc: 'м: отступ корпуса от границы лота' }),
    merge: num({ min: 0, max: 1, default: DISTRICT_DEFAULTS.lot.merge, doc: 'доля лотов, склеенных в один корпус' }),
  }, { doc: 'сетка лотов квартала' }),
  height: obj({
    minFloors: num({ min: 1, default: DISTRICT_DEFAULTS.height.minFloors, doc: 'эт: нижний предел этажности' }),
    maxFloors: num({ min: 1, default: DISTRICT_DEFAULTS.height.maxFloors, doc: 'эт: верхний предел этажности (вводимый дом ограничен J.enterableFloors)' }),
    floorHeight: num({ min: 2.4, max: 8, default: DISTRICT_DEFAULTS.height.floorHeight, doc: 'м: высота этажа' }),
  }, { doc: 'разброс этажности квартала' }),
  tower: obj({
    chance: num({ min: 0, max: 1, default: DISTRICT_DEFAULTS.tower.chance, doc: 'доля лотов, ставших башней' }),
    floors: arr(num({ min: 1 }), { minItems: 2, maxItems: 2, default: DISTRICT_DEFAULTS.tower.floors, doc: 'эт: [min, max] этажности башни' }),
    floorHeight: num({ min: 2.4, max: 8, default: DISTRICT_DEFAULTS.tower.floorHeight, doc: 'м: высота этажа башни' }),
  }, { doc: 'башни района: доля лотов и их этажность' }),
  archetypes: arr(str({ enum: ARCHETYPE_NAMES }), { default: DISTRICT_DEFAULTS.archetypes, doc: 'разрешённые формы корпуса; ритм ГПСЧ района значим' }),
  enterableEvery: num({ min: 1, default: DISTRICT_DEFAULTS.enterableEvery, doc: 'каждый N-й лот-кандидат открывается' }),
  skip: num({ min: 0, max: 1, default: DISTRICT_DEFAULTS.skip, doc: 'доля лотов, оставленных пустыми' }),
  courtyard: num({ min: 0, max: 1, default: DISTRICT_DEFAULTS.courtyard, doc: 'доля лотов, ставших замкнутым двором' }),
  roofs: obj({
    walkable: bool({ default: DISTRICT_DEFAULTS.roofs.walkable, doc: 'true — кровля становится опорой' }),
    access: num({ min: 0, max: 1, default: DISTRICT_DEFAULTS.roofs.access, doc: 'доля домов с выходом на кровлю' }),
    parapet: num({ min: 0, max: 1.5, default: DISTRICT_DEFAULTS.roofs.parapet, doc: 'м: высота парапета кровли' }),
  }, { doc: 'кровля квартала' }),
  yaw: num({ min: -180, max: 180, default: 0, doc: 'град: поворот всего квартала вокруг центра блока' }),
  polygon: arr(XZ, { minItems: 3, doc: 'м: контур квартала' }),
}, { doc: 'квартал генератора (tools/city.js)' });

const CITY_TRACK = obj({
  id: str({ default: TRACK_DEFAULTS.id, doc: 'приставка id настилов трассы' }),
  center: arr(num({}), { minItems: 2, maxItems: 2, default: TRACK_DEFAULTS.center, doc: 'м: центр звезды оси [x, z]' }),
  radius: num({ min: 10, default: TRACK_DEFAULTS.radius, doc: 'м: радиус вершины звезды' }),
  turns: num({ min: 3, default: TRACK_DEFAULTS.turns, doc: 'вершин звезды = число поворотов петли' }),
  minRadius: num({ min: 2, default: TRACK_DEFAULTS.minRadius, doc: 'м: радиус самого крутого поворота' }),
  curvatureJitter: num({ min: 0, max: TRACK_MAX_JITTER, default: TRACK_DEFAULTS.curvatureJitter, doc: 'доля дрожи радиуса' }),
  width: num({ min: 2, max: 30, default: TRACK_DEFAULTS.width, doc: 'м: ширина полотна' }),
  bank: num({ min: -30, max: 30, default: TRACK_DEFAULTS.bank, doc: 'град: крен на дугах' }),
  grade: num({ min: 0, max: J.maxSlope, default: TRACK_DEFAULTS.grade, doc: 'м/м: продольный уклон оси' }),
  clearance: num({ min: 0, default: TRACK_DEFAULTS.clearance, doc: 'м: зазор полотна над корытом поля' }),
  amplitude: num({ min: 0, default: TRACK_DEFAULTS.amplitude, doc: 'м: половина высоты волны' }),
  waves: num({ min: 1, default: TRACK_DEFAULTS.waves, doc: 'число полуволн' }),
  rails: bool({ default: TRACK_DEFAULTS.rails, doc: 'перила на настилах' }),
  lamps: bool({ default: TRACK_DEFAULTS.lamps, doc: 'фонари на полотне' }),
  entries: num({ min: 0, default: TRACK_DEFAULTS.entries, doc: 'число съездов' }),
}, { doc: 'кольцевая трасса' });

const CITY_SPEC = obj({
  seed: num({ req: true, doc: 'целое: сид ГПСЧ; порядок вызовов значим' }),
  districts: arr(CITY_DISTRICT, { minItems: 1, req: true, doc: 'районы генератора' }),
  track: CITY_TRACK,
}, { doc: 'секция генератора кварталов (tools/city.js); разворачивается до валидации/нормализации' });

// Общие поля open-брифа (переиспользуются в LEVEL_SPEC_OPEN и в v3/v4).
const OPEN_METADATA = obj({
  levelName: str({ req: true, doc: 'имя главы для пайплайна (например, level-16)' }),
  name: str({ req: true, doc: 'заголовок главы в HUD' }),
  hint: str({ req: true, doc: 'подсказка игроку о пути A→B' }),
  engine: str({ doc: 'служебная подпись исходника, движок не читает' }),
  units: str({ enum: ['meters'], req: true, doc: 'единицы брифа: длины/высоты — метры, углы — градусы' }),
  notes: str({ doc: 'rationale главы; движок не читает' }),
}, { req: true, doc: 'шапка брифа' });

const OPEN_GROUND = obj({
  y: num({ default: 0, doc: 'отметка пола мира; с relief гасится' }),
  size: num({ min: 20, req: true, doc: 'сторона квадратной плиты грунта в метрах' }),
  color: color({ default: J.asphalt, doc: 'цвет грунта' }),
}, { doc: 'плита мира' });

const OPEN_WINDOWS = obj({
  spacing: num({ min: 0, max: 12, default: J.windows.spacing, doc: 'м: ритм окон вдоль грани' }),
  width: num({ min: 0.2, max: 6, default: J.windows.width, doc: 'м: ширина квада' }),
  height: num({ min: 0.2, max: 6, default: J.windows.height, doc: 'м: высота квада' }),
  sill: num({ min: 0, max: 3, default: J.windows.sill, doc: 'м: подоконник от пола этажа' }),
  offset: num({ min: 0.01, max: 1, default: J.windows.offset, doc: 'м: вынос квада за грань стены' }),
  lit: num({ min: 0, max: 1, default: J.windows.lit, doc: 'доля окон светящимися' }),
}, { doc: 'включатель + переопределение ряда окон' });

const OPEN_SKY = obj({
  sky: color({ default: CONFIG.sky, doc: 'цвет неба' }),
  fog: obj({
    color: color({ default: CONFIG.fog.color, doc: 'цвет тумана' }),
    near: num({ min: 1, default: CONFIG.fog.near, doc: 'м: начало тумана' }),
    far: num({ min: 2, default: CONFIG.fog.far, doc: 'м: полное затемнение' }),
  }, { doc: 'туман' }),
  sun: obj({
    color: color({ default: CONFIG.sun.color, doc: 'цвет солнца/луны' }),
    intensity: num({ min: 0, max: 10, default: CONFIG.sun.intensity, doc: 'яркость' }),
    position: arr(num({}), { minItems: 3, maxItems: 3, default: CONFIG.sun.position, doc: '[x,y,z]' }),
  }, { doc: 'направленный свет' }),
  hemi: obj({
    sky: color({ default: CONFIG.hemi.sky, doc: 'верх полусферического света' }),
    ground: color({ default: CONFIG.hemi.ground, doc: 'низ полусферического света' }),
    intensity: num({ min: 0, max: 10, default: CONFIG.hemi.intensity, doc: 'яркость' }),
  }, { doc: 'полусферический свет' }),
  lights: obj({
    count: num({ min: 0, max: 8, default: CONFIG.night.count, doc: 'штук: огней пула' }),
    reach: num({ min: 1, default: CONFIG.night.reach, doc: 'м: радиус поиска опор' }),
    height: num({ min: 0, default: CONFIG.night.height, doc: 'м: подъём огня' }),
    spacing: num({ min: 1, default: CONFIG.night.spacing, doc: 'м: разнос огней' }),
    intensity: num({ min: 0, max: 400, default: CONFIG.night.intensity, doc: 'яркость огня' }),
  }, { doc: 'пул ночных огней' }),
}, { doc: 'небо/освещение главы' });

const OPEN_BUILDINGS = arr(obj({
  id: str({ req: true, doc: 'уникальный id дома' }),
  name: str({ doc: 'название для метки debugIds' }),
  archetype: str({ enum: ARCHETYPE_NAMES, doc: 'форма корпуса (служебное, генератор)' }),
  buildingType: str({ doc: 'тип дома' }),
  district: str({ doc: 'id района (служебное, генератор)' }),
  isEnterable: bool({ default: true, doc: 'false — только фасадный декор' }),
  floorsCount: num({ min: 1, max: J.shellFloorsMax, req: true, doc: 'эт: число этажей' }),
  floorHeight: num({ min: 2.4, max: 8, req: true, doc: 'м: высота этажа' }),
  baseY: num({ doc: 'м: пол первого этажа' }),
  foundation: str({ enum: ['podium', 'terrain'], doc: 'вариант фундамента' }),
  facadeMaterial: str({ default: 'concrete', doc: 'материал фасада' }),
  wallColor: str({ doc: 'hex-цвет фасада' }),
  houseKind: str({ doc: 'вид/архетип дома' }),
  houseStyleId: str({ doc: 'стиль дома' }),
  entrances: num({ min: 1, max: 8, doc: 'число подъездов/секций' }),
  detailedVisual: str({ doc: 'детальная визуальная модель' }),
  windowDensity: num({ min: 1, max: 3, doc: 'плотность окон' }),
  windowScale: num({ min: 0.5, max: 2, doc: 'масштаб окон' }),
  roofMaterial: str({ doc: 'материал кровли' }),
  roofColor: str({ doc: 'цвет кровли' }),
  trimFinish: str({ doc: 'отделка' }),
  houseFeatures: obj({}, { doc: 'фичи дома' }),
  roof: obj({
    walkable: bool({ default: false, doc: 'ходовая ли кровля' }),
    parapet: num({ min: 0, max: 1.5, default: J.parapetHeight, doc: 'м: парапет' }),
  }, { doc: 'кровля' }),
  footprint: arr(XZ, { minItems: 4, req: true, doc: 'м: полигон плана дома' }),
  rooms: arr(obj({
    id: str({ req: true, doc: 'id комнаты' }),
    floor: num({ min: 0, req: true, doc: 'этаж' }),
    type: str({ enum: ROOM_TYPES, req: true, doc: 'назначение' }),
    polygon: arr(XZ, { minItems: 4, req: true, doc: 'м: план комнаты' }),
    connections: arr(obj({
      target: str({ req: true, doc: 'id цели за проёмом' }),
      portalPosition: XYZ,
      linkType: str({ enum: LINK_TYPES, doc: 'тип связки' }),
    }, { doc: 'дверь/проём' }), { doc: 'двери комнаты' }),
  }, { doc: 'комната' }), { req: true, doc: 'комнаты дома' }),
  stairs: arr(obj({
    id: str({ req: true, doc: 'id марша' }),
    connectsFloors: arr(num({ min: 0 }), { minItems: 2, maxItems: 2, req: true, doc: '[с, по]' }),
    type: str({ enum: STAIR_TYPES, req: true, doc: 'тип марша' }),
    position: XZ,
    rotation: num({ default: 0, doc: 'град' }),
    dimensions: obj({ width: num({ min: 1, req: true, doc: 'м' }), length: num({ min: 1, req: true, doc: 'м' }), height: num({ doc: 'м' }) }, { doc: 'габарит марша' }),
  }, { doc: 'марш' }), { doc: 'марши дома' }),
  rotation: num({ min: -360, max: 360, default: 0, doc: 'град: поворот дома вокруг центра габарита footprint' }),
  districtFrame: obj({
    cx: num({ req: true, doc: 'м' }), cz: num({ req: true, doc: 'м' }),
    yaw: num({ min: -180, max: 180, req: true, doc: 'град' }),
  }, { doc: 'кадр косого района (служебное, генератор)' }),
}, { doc: 'дом' }), { doc: 'дома' });

const OPEN_GAMEPLAY = obj({
  goal: str({ enum: ['exit'], req: true, doc: 'цель главы' }),
  spawn: XZ,
  exit: XZ,
  exitRadius: num({ min: 1, max: 40, default: CONFIG.terrain.exitRadius, doc: 'м: радиус точки B' }),
  enemies: obj({ count: num({ min: 0, max: 30, doc: 'человек-противники' }) }, { doc: 'пешие противники' }),
  alienEnemies: obj({ count: num({ min: 0, max: 30, doc: 'Чужие' }) }, { doc: 'Чужие' }),
  cars: obj({
    count: num({ min: 0, max: 8, req: true, doc: 'штук' }),
    spots: arr(obj({ x: num({ req: true }), z: num({ req: true }), yaw: num({ min: -360, max: 360, default: 0, doc: 'град' }) }, { doc: 'стоянка' }),
      { minItems: 0, maxItems: 8, doc: 'точки стоянок' }),
  }, { doc: 'машины главы' }),
}, { req: true, doc: 'цель и сущности главы' });

const OPEN_ROADS = arr(obj({
  id: str({ req: true, doc: 'уникальный id' }),
  type: str({ enum: ROAD_TYPES, req: true, doc: 'тип настила' }),
  width: num({ min: 2, max: 30, doc: 'м: ширина полотна (для polyline-дорог)' }),
  lamps: bool({ default: false, doc: 'фонари вдоль улицы' }),
  points: arr(XYZ, { minItems: 2, doc: 'осевая polyline (альтернатива elements)' }),
  elements: arr(obj({ plate: PLATE, arc: ARC, connect: str({ enum: ['tangent'], doc: 'маркер касательной' }) },
    { doc: 'элемент цепочки: plate или arc или connect' }), { minItems: 1, doc: 'цепочка пластин/дуг' }),
  district: str({ doc: 'служебное поле генератора' }),
  grade: num({ min: 0, max: J.maxSlope, doc: 'служебное поле генератора' }),
  crossing: bool({ default: false, doc: 'служебное поле генератора' }),
  trackRole: str({ enum: ['ring', 'entry'], doc: 'служебное поле трассы' }),
  trackId: str({ doc: 'служебное поле трассы' }),
  filletRadius: num({ min: 0, doc: 'м: радиус скругления path-дороги' }),
  fillet: num({ min: 0, doc: 'псевдоним filletRadius' }),
}, { doc: 'дорога/настил' }), { req: true, doc: 'дороги' });

const OPEN_WATERWAYS = arr(obj({
  id: str({ req: true, doc: 'id русла' }),
  width: num({ min: 2, max: 120, req: true, doc: 'м: ширина' }),
  bedY: num({ req: true, doc: 'м: отметка дна' }),
  surfaceY: num({ req: true, doc: 'м: отметка зеркала' }),
  bank: str({ enum: BANK_TYPES, req: true, doc: 'тип берега' }),
  bankRun: num({ min: 1, doc: 'м: заложение откоса' }),
  wade: bool({ default: true, doc: 'брод' }),
  ramps: arr(obj({ at: obj({ x: num({ req: true }), z: num({ req: true }) }, { req: true }), width: num({ min: 2, max: 12, default: J.rampWidth }) }, { doc: 'сход' }), { doc: 'сходы' }),
  points: arr(XZ, { minItems: 2, req: true, doc: 'осевая в плане' }),
}, { doc: 'русло' }), { doc: 'русла' });

const OPEN_TUNNELS = arr(obj({
  id: str({ req: true, doc: 'id туннеля' }),
  points: arr(obj({ x: num({ req: true }), y: num({ req: true }), z: num({ req: true }) }, { doc: 'портал' }), { minItems: 2, maxItems: 2, req: true, doc: 'порталы' }),
  width: num({ min: 2, max: 30, req: true, doc: 'м' }),
  height: num({ min: 0.5, max: 60, req: true, doc: 'м' }),
  lamps: bool({ default: false, doc: 'фонари' }),
}, { doc: 'туннель' }), { doc: 'туннели' });

const OPEN_LANDSCAPE = arr(obj({
  id: str({ req: true, doc: 'id' }),
  model: str({ enum: J.models, req: true, doc: 'модель' }),
  position: XYZ,
  rotation: obj({ x: num({ default: 0 }), y: num({ default: 0 }), z: num({ default: 0 }) }, { doc: 'град' }),
  scale: obj({ x: num({ min: 0.05, default: 1 }), y: num({ min: 0.05, default: 1 }), z: num({ min: 0.05, default: 1 }) }, { doc: 'масштаб' }),
}, { doc: 'объект ландшафта' }), { doc: 'ландшафтные объекты' });

const OPEN_LIGHTS = arr(obj({
  id: str({ req: true, doc: 'id' }),
  type: str({ enum: LIGHT_TYPES, req: true, doc: 'тип' }),
  position: XYZ,
  target: XYZ,
  color: color({ default: 0xffcf9a, doc: 'цвет' }),
  intensity: num({ min: 0, max: 400, default: CONFIG.night.intensity, doc: 'яркость' }),
  distance: num({ min: 0, default: CONFIG.night.reach, doc: 'м' }),
  angle: num({ min: 0, max: 1.57, default: 0.7, doc: 'рад (spot)' }),
}, { doc: 'источник света' }), { doc: 'источники света' });

const OPEN_CLUTTER = obj({
  tall: num({ min: 3, max: 200, default: J.clutter.tall, doc: 'м' }),
  head: num({ min: 1.5, max: 12, default: J.clutter.head, doc: 'м' }),
  roof: obj({
    edge: num({ min: 0.4, max: 8, default: J.clutter.roof.edge }),
    step: num({ min: 1, max: 20, default: J.clutter.roof.step }),
    keep: num({ min: 0, max: 1, default: J.clutter.roof.keep }),
    perHouse: num({ min: 0, max: 12, default: J.clutter.roof.perHouse }),
  }, { doc: 'мусор на кровле' }),
  street: obj({
    every: num({ min: 4, max: 60, default: J.clutter.street.every }),
    inset: num({ min: 0.3, max: 6, default: J.clutter.street.inset }),
    minLamp: num({ min: 0, max: 12, default: J.clutter.street.minLamp }),
    keep: num({ min: 0, max: 1, default: J.clutter.street.keep }),
  }, { doc: 'мусор вдоль улицы' }),
}, { doc: 'процедурный мусор' });

const OPEN_SIGNAGE = obj({
  minFloors: num({ min: 1, max: 40, default: J.signage.minFloors }),
  minRun: num({ min: 2, max: 40, default: J.signage.minRun }),
  edge: num({ min: 0.2, max: 8, default: J.signage.edge }),
  step: num({ min: 2, max: 40, default: J.signage.step }),
  width: arr(num({ min: 0.5, max: 30 }), { minItems: 2, maxItems: 2, default: J.signage.width }),
  minWidth: num({ min: 0.5, max: 20, default: J.signage.minWidth }),
  panelFloors: num({ min: 1, max: 12, default: J.signage.panelFloors }),
  perFace: num({ min: 1, max: 8, default: J.signage.perFace }),
  keep: num({ min: 0, max: 1, default: J.signage.keep }),
  offset: num({ min: 0.02, max: 2, default: J.signage.offset }),
}, { doc: 'вывески' });

const OPEN_STREAM = obj({
  chunk: num({ min: CHUNK_MIN, max: CHUNK_MAX, req: true, doc: 'м: сторона клетки разрезки; делит ground.size нацело' }),
  keep: num({ min: 0, max: 4, req: true, doc: 'клеток во все стороны от клетки игрока' }),
  aheadMin: num({ min: 0, max: 1200, req: true, doc: 'м: радиус догрузки вперёд (пешком)' }),
  aheadMax: num({ min: 0, max: 1200, req: true, doc: 'м: радиус догрузки вперёд (машина), не меньше aheadMin' }),
  budgetMs: num({ min: 1, max: 200, req: true, doc: 'мс: бюджет достройки на кадр' }),
}, { doc: 'разрезка и стриминг открытого мира' });

/**
 * Схема open-брифа (`kind: 'open'`): геометрия (повёрнутые дома, пластины/дуги,
 * рельеф), секция `city`, `stream` (обязательна), туннели и т.д. Текущий
 * поддерживаемый формат брифа для сборки в каталог; v3/v4 CityForge компилируются
 * в открытый мир отдельным путём.
 */
export const LEVEL_SPEC_OPEN = obj({
  $schema: str({ doc: 'путь к JSON Schema этого брифа' }),
  kind: str({ enum: ['open'], req: true, doc: 'open — разрезаемый на чанки открытый мир (каталог)' }),
  metadata: OPEN_METADATA,
  ground: OPEN_GROUND,
  roads: OPEN_ROADS,
  waterways: OPEN_WATERWAYS,
  buildings: OPEN_BUILDINGS,
  landscapeObjects: OPEN_LANDSCAPE,
  lights: OPEN_LIGHTS,
  windows: OPEN_WINDOWS,
  clutter: OPEN_CLUTTER,
  signage: OPEN_SIGNAGE,
  sky: OPEN_SKY,
  gameplay: OPEN_GAMEPLAY,
  city: CITY_SPEC,
  stream: OPEN_STREAM,
  navEdgeProbe: num({ min: 0.1, doc: 'шаг проб опоры вдоль навигационных рёбер (м)' }),
  bodyProbe: num({ min: 0.1, doc: 'шаг проб габарита тела вдоль навигационных рёбер (м)' }),
  relief: RELIEF,
  tunnels: OPEN_TUNNELS,
}, { doc: 'бриф открытого уровня (kind: open)' });

const CF_COLOR = color({});
const V3_XZ = obj({ x: num({ req: true }), z: num({ req: true }) });
const CF_POINT2 = arr(num({}), { minItems: 2, maxItems: 2 });
const CF_POINT3 = arr(num({}), { minItems: 3, maxItems: 3 });
const CF_POINT4 = arr(num({}), { minItems: 4, maxItems: 4 });
const CF_RING = arr(ref('point2'), { minItems: 3 });
const CF_AREA = obj({
  type: str({ enum: ['polygon'], req: true }),
  rings: arr(ref('ring'), { minItems: 1, req: true }),
});
const CF_PARAMETERS = obj({}, {
  open: true,
  doc: 'Descriptors keyed by parameter name: type, min, max, values, default.',
});
const CF_OPEN = obj({}, { open: true });
// суффикс _N — многоярусный стек (§4.1 world-format: bridge_01, bridge_02)
const CF_LAYER_PATTERN = '^(ground|embankment|bridge|skybridge|underground)(_[0-9]+)?$';

const CF_SOCKET = obj({
  id: str({ req: true }),
  position: ref('point3'),
  rotation: ref('point4'),
});

// --- chapter envelope ------------------------------------------------------

const V3_METADATA = obj({
  levelName: str({ req: true, doc: 'Pipeline name; selects the generated module name.' }),
  name: str({ req: true }),
  hint: str({ req: true }),
  engine: str({}),
  units: str({ enum: ['meters'], req: true, doc: 'All lengths are meters and angles are degrees.' }),
  notes: str({ doc: 'Free-form rationale; the engine does not read it.' }),
}, { doc: 'Chapter header; only name and hint reach the engine.' });

const V3_GROUND = obj({
  y: num({ default: 0 }),
  size: num({ min: 20, req: true, doc: 'Ground plate side in meters; outside the plate the world is blocked.' }),
  color: ref('color'),
}, { doc: 'Flat ground plate; CityForge terrain modifiers sit on top of it.' });

const V3_GAMEPLAY = obj({
  goal: str({ enum: ['exit'], req: true, doc: 'CityForge briefs use A-to-B (exit) goals.' }),
  spawn: ref('vec2', { req: true }),
  exit: ref('vec2', { req: true }),
  exitRadius: num({ min: 1, max: 40, default: 3.5 }),
  enemies: obj({ count: num({ min: 0, max: 30 }) }),
  alienEnemies: obj({ count: num({ min: 0, max: 30 }) }),
  cars: obj({
    count: num({ min: 0, max: 8, req: true, doc: 'Must equal spots length.' }),
    spots: arr(obj({
      x: num({ req: true }),
      z: num({ req: true }),
      yaw: num({ min: -360, max: 360, default: 0 }),
    }), { maxItems: 8 }),
  }),
}, { doc: 'Objective, spawn, enemies and parked cars for the chapter.' });

const V3_STREAM = obj({
  chunk: num({ min: CHUNK_MIN, max: CHUNK_MAX, req: true, doc: 'Cell side in meters; must divide ground.size.' }),
  keep: num({ min: 0, max: 4, req: true, doc: 'Loaded cells around the player: window (2*keep + 1)^2.' }),
  aheadMin: num({ min: 0, max: 1200, req: true, doc: 'Look-ahead radius on foot, in meters.' }),
  aheadMax: num({ min: 0, max: 1200, req: true, doc: 'Look-ahead radius for vehicles; must be >= aheadMin.' }),
  budgetMs: num({ min: 1, max: 200, req: true, doc: 'Per-frame build budget in milliseconds.' }),
}, { doc: 'Open-world streaming window; omit for a single-cell world.' });

// --- CityForge entities ----------------------------------------------------

const CF_WORLD = obj({
  units: str({ enum: ['meters'], req: true }),
  coordinateSystem: obj({
    type: str({ enum: ['local'], req: true }),
    handedness: str({ enum: ['right'], req: true }),
    up: str({ enum: ['Y'], req: true, doc: 'Вертикальная ось мира: Y вверх, как в рантайме/движке и в интерпретации point3 [x, y_up, z].' }),
  }, { req: true }),
  origin: ref('point3'),
  bounds: obj({ min: ref('point3'), max: ref('point3') }, { req: true }),
}, { req: true, doc: 'Локальное правое метрическое пространство, Y вверх; point3 задаётся как [x, y_up, z] (вертикаль — y).' });

const CF_GENERATION = obj({
  seed: num({ req: true, doc: 'Deterministic seed; local seeds derive from it and entity ids.' }),
  generatorVersion: str({ req: true, doc: 'Part of the seed: bumping it resets the generated layout.' }),
  deterministic: bool({ default: true }),
});

const CF_ASSET = obj({
  id: str({ req: true }),
  kind: str({
    enum: ['procedural', 'prefab', 'composite'],
    req: true,
    doc: 'procedural builds geometry, prefab references a GLB, composite assembles children.',
  }),
  generator: str({}),
  geometry: obj({
    source: str({ req: true, doc: 'GLB path or procedural source id.' }),
  }, {}),
  parameters: ref('parameters'),
  bounds: ref('point3'),
  children: arr(str({}), { minItems: 1 }),
  sockets: arr(ref('socket'), { minItems: 0 }),
}, { doc: 'Asset Library template.' });

const CF_PALETTE_ENTRY = obj({
  template: str({ req: true }),
  weight: num({ min: 0 }),
  parameterRanges: CF_OPEN,
});

const CF_DISTRICT = obj({
  id: str({ req: true }),
  type: str({ enum: ['residential', 'industrial', 'commercial', 'park', 'downtown'], req: true }),
  area: ref('area', { req: true }),
  style: str({}),
  rules: obj({
    buildingDensity: num({ min: 0, max: 1 }),
    heightRange: arr(num({ min: 1 }), { minItems: 2, maxItems: 2, doc: 'этажи: [minFloors, maxFloors] — диапазон этажности зданий района.' }),
    maxFootprintRatio: num({ min: 0, max: 1 }),
    setback: num({ min: 0 }),
    buildingPalette: arr(CF_PALETTE_ENTRY, { minItems: 1 }),
    vegetation: obj({
      density: num({ min: 0, max: 1 }),
      palette: arr(str({}), { minItems: 1 }),
    }),
    roadStyle: obj({
      type: str({ enum: ['local', 'collector', 'arterial', 'highway'] }),
      speedLimit: num({ min: 0, doc: 'км/ч: ограничение скорости на дорогах района.' }),
    }),
  }),
}, { doc: 'District extent plus generation rules and style.' });

const CF_BLOCK = obj({
  id: str({ req: true }),
  districtRef: str({ req: true }),
  area: ref('area', { req: true }),
  parcels: arr(str({}), { minItems: 0 }),
});

const CF_PARCEL = obj({
  id: str({ req: true }),
  blockRef: str({ req: true }),
  area: ref('area', { req: true }),
  buildable: bool({ default: true }),
  buildingRules: obj({ maxFloors: num({ min: 1 }) }),
});

const CF_TERRAIN_MODIFIER = obj({
  id: str({ req: true }),
  type: str({ enum: ['mountain', 'valley', 'terrain_modifier'], req: true }),
  center: ref('point2'),
  radius: num({ min: 2 }),
  height: num({ min: -300, max: 300 }),
  falloff: str({ enum: ['smooth', 'linear', 'step'] }),
  path: arr(ref('point2'), { minItems: 2 }),
  width: num({ min: 2 }),
  depth: num({ min: 0 }),
  operation: str({ enum: ['add', 'subtract', 'replace'] }),
  sourceRef: str({}),
  parameters: CF_OPEN,
}, { doc: 'Applied in array order after the base heightfield.' });

const CF_TERRAIN = obj({
  base: obj({
    type: str({ enum: ['heightfield'] }),
    source: str({ req: true }),
    resolution: num({ min: 1 }),
  }, { req: true }),
  modifiers: arr(ref('terrainModifier'), { minItems: 1 }),
}, { doc: 'Base heightfield plus sequential modifiers.' });

const CF_WATERWAY = obj({
  id: str({ req: true }),
  path: arr(ref('point3'), { minItems: 2, req: true }),
  width: num({ min: 2, max: 120, req: true }),
  widthProfile: arr(arr(num({}), { minItems: 2, maxItems: 2 }), { minItems: 2, doc: '[t, width]: riverbed width at normalized distance t along path.' }),
  depth: num({ min: 0, req: true }),
  flow: str({ enum: ['start_to_end', 'end_to_start', 'cyclic'] }),
  carveTerrain: bool({ default: false, doc: 'Carve the riverbed into the terrain.' }),
  downslope: bool({ doc: 'служебное: русло трассировано вниз по уклону (генератор).' }),
  tributaryOf: str({ doc: 'служебное: id основной реки для притока (генератор).' }),
});

const CF_LAKE = obj({
  id: str({ req: true }),
  area: ref('area', { req: true }),
  waterLevel: num({}),
});

const CF_HYDROLOGY = obj({
  rivers: arr(ref('waterway'), { minItems: 0 }),
  lakes: arr(ref('lake'), { minItems: 0 }),
});

const CF_CAVE = obj({
  id: str({ req: true }),
  chambers: arr(obj({
    id: str({ req: true }),
    center: ref('point3'),
    radius: ref('point3'),
  }), { minItems: 1 }),
  passages: arr(obj({
    id: str({ req: true }),
    from: str({ req: true }),
    to: str({ req: true }),
    path: arr(ref('point3'), { minItems: 2 }),
    radius: num({ min: 0 }),
  }), { minItems: 0 }),
  entrances: arr(obj({
    id: str({ req: true }),
    chamberRef: str({ req: true }),
    surfacePosition: ref('point3'),
    openingRadius: num({ min: 0 }),
  }), { minItems: 0 }),
}, { doc: 'Chambers, passages and surface entrances of one cave system.' });

const CF_CAVES = obj({
  systems: arr(ref('cave'), { minItems: 1 }),
}, { doc: 'Collection of cave systems.' });

const CF_NODE = obj({
  id: str({ req: true }),
  position: ref('point3', { req: true }),
  layer: str({
    pattern: CF_LAYER_PATTERN,
    doc: 'Logical topology label; physical height comes from position.z. Multi-tier stacks append _N (bridge_01).',
  }),
});

const CF_LANE = obj({
  id: str({ req: true }),
  direction: str({ enum: ['forward', 'backward'], req: true }),
  width: num({ min: 0 }),
  type: str({ enum: ['vehicle', 'bus', 'tram', 'bike', 'pedestrian', 'rail'] }),
});

const CF_SEGMENT = obj({
  id: str({ req: true }),
  from: str({ req: true }),
  to: str({ req: true }),
  type: str({ enum: ['local', 'collector', 'arterial', 'highway', 'ramp', 'merge', 'split', 'connector'] }),
  layer: str({ pattern: CF_LAYER_PATTERN, doc: 'Logical topology label; the _N suffix marks a stacked tier.' }),
  path: arr(ref('point3'), { minItems: 2 }),
  // v2 arc/plate chain for smooth turns (like chapter 13 track); alternative to axis-aligned path.
  elements: arr(obj({
    plate: PLATE,
    arc: ARC,
    connect: str({ enum: ['tangent'] }),
  })),
  lanes: arr(ref('lane'), { minItems: 0 }),
  shoulderWidth: num({ min: 0 }),
  filletRadius: num({ min: 0, doc: 'м: автоскругление path-дороги при нормализации' }),
  fillet: num({ min: 0, doc: 'м: псевдоним filletRadius' }),
  sidewalk: bool({ default: false }),
  surface: str({ enum: ['asphalt', 'gravel', 'earth'] }),
  speedLimit: num({ min: 0, doc: 'км/ч: ограничение скорости на сегменте.' }),
});

const CF_JUNCTION = obj({
  id: str({ req: true }),
  connections: arr(obj({
    from: obj({
      segment: str({ req: true }),
      lane: str({ req: true }),
      end: str({ enum: ['to', 'from'], req: true }),
    }),
    to: obj({
      segment: str({ req: true }),
      lane: str({ req: true }),
      end: str({ enum: ['to', 'from'], req: true }),
    }),
    movement: str({ enum: ['straight', 'left', 'right', 'uturn'], req: true }),
  }), { minItems: 1 }),
  type: str({ enum: ['signalized', 'roundabout', 'uncontrolled'] }),
}, { doc: 'Allowed lane-to-lane movements through a junction.' });

const CF_NETWORK = obj({
  nodes: arr(ref('node'), { minItems: 0 }),
  segments: arr(ref('segment'), { minItems: 0 }),
  junctions: arr(ref('junction'), { minItems: 0 }),
});

const CF_NETWORKS = obj({
  roads: ref('network'),
  railways: ref('network'),
  paths: ref('network'),
});

const CF_DECK = obj({
  id: str({ req: true }),
  roadRefs: arr(str({}), { minItems: 1 }),
  clearance: num({ min: 0 }),
});

const CF_BRIDGE = obj({
  id: str({ req: true }),
  type: str({ enum: ['bridge', 'embankment', 'skybridge'], req: true }),
  template: str({ req: true }),
  decks: arr(ref('deck'), { minItems: 1 }),
  supportPoints: arr(ref('point3'), { minItems: 1 }),
  parameters: obj({
    pierSpacing: num({ min: 0 }),
    railings: bool({ default: false }),
    supports: str({ enum: ['auto', 'manual'] }),
  }),
}, { doc: 'Deck geometry and supports; the road itself stays in networks.' });

const CF_TUNNEL = obj({
  id: str({ req: true }),
  type: str({ enum: ['tunnel'] }),
  template: str({ req: true }),
  roadRefs: arr(str({}), { minItems: 1 }),
  portals: arr(obj({
    id: str({ req: true }),
    position: ref('point3'),
    networkRef: str({}),
    roadRef: str({}),
    layer: str({ pattern: CF_LAYER_PATTERN, doc: 'Logical topology label; the _N suffix marks a stacked tier.' }),
    tangent: ref('point3'),
  }), { minItems: 2 }),
  parameters: obj({
    lining: str({ enum: ['concrete', 'rock', 'plastic'] }),
    lighting: bool({ default: false }),
  }),
}, { doc: 'Portals and lining; the road itself stays in networks.' });

const CF_STRUCTURES = obj({
  bridges: arr(ref('bridge'), { minItems: 0 }),
  tunnels: arr(ref('tunnel'), { minItems: 0 }),
});

const CF_INSTANCE = obj({
  id: str({ req: true }),
  template: str({ req: true }),
  transform: obj({
    position: ref('point3', { req: true }),
    rotation: ref('point4'),
    scale: ref('point3'),
  }, { req: true }),
  overrides: CF_OPEN,
  districtRef: str({}),
  parcelRef: str({}),
  homeChunk: str({ doc: 'The chunk that owns this instance; only it stores the full record.' }),
  coverageChunks: arr(str({}), { minItems: 1, doc: 'Chunks whose area the instance overlaps; loading any of them keeps the instance alive.' }),
  generation: obj({
    source: str({ enum: ['procedural', 'prefab', 'hybrid'] }),
    seed: num({}),
    generator: str({}),
    generatorVersion: str({}),
  }, { doc: 'Provenance of a generated instance.' }),
  locked: bool({ default: false, doc: 'Keep this instance as-is on regeneration.' }),
  gameplay: obj({
    interactable: bool({ default: false }),
    collision: bool({ default: true }),
  }, { doc: 'Separates appearance from interaction and collision.' }),
  properties: CF_OPEN,
  bounds: obj({ min: ref('point3'), max: ref('point3') }),
}, { doc: 'Placed template with transform and per-instance overrides.' });

const CF_CHUNK = obj({
  id: str({ req: true }),
  bounds: obj({ min: ref('point3'), max: ref('point3') }, { req: true }),
  file: str({ req: true }),
}, { doc: 'Spatial storage unit of the city.' });

const CF_CHUNK_ENTRY = obj({
  id: str({ req: true }),
  bounds: obj({ min: ref('point3'), max: ref('point3') }, { req: true }),
  neighbors: arr(str({}), { minItems: 0 }),
  files: obj({
    terrain: str({}),
    roads: str({}),
    water: str({}),
    instances: str({}),
    collision: str({}),
  }),
  entities: arr(str({}), { minItems: 0 }),
  fragments: arr(str({}), { minItems: 0 }),
  portals: arr(str({}), { minItems: 0 }),
  dependencies: arr(str({}), { minItems: 0 }),
});

const CF_CHUNK_INDEX = obj({
  version: str({ req: true }),
  chunks: arr(ref('chunkEntry'), { minItems: 1 }),
}, { doc: 'Manifest of chunk files for partial loading; the runtime streaming window lives in stream.' });

const CF_CITYFORGE = obj({
  format: str({ enum: ['cityforge'], req: true }),
  version: str({ req: true }),
  world: ref('world', { req: true }),
  generation: ref('generation'),
  assets: arr(ref('asset'), { minItems: 1 }),
  districts: arr(ref('district'), { minItems: 0 }),
  blocks: arr(ref('block'), { minItems: 0 }),
  parcels: arr(ref('parcel'), { minItems: 0 }),
  terrain: ref('terrain'),
  hydrology: ref('hydrology'),
  caves: ref('caves'),
  networks: ref('networks'),
  structures: ref('structures'),
  instances: arr(ref('instance'), { minItems: 0 }),
  chunks: arr(ref('chunk'), { minItems: 0 }),
  chunkIndex: ref('chunkIndex'),
  extensions: CF_OPEN,
}, { doc: 'CityForge source city from docs/world-format.md.' });

const COMMON_V3_DEFS = {
  color: CF_COLOR,
  vec2: V3_XZ,
  point2: CF_POINT2,
  point3: CF_POINT3,
  point4: CF_POINT4,
  ring: CF_RING,
  area: CF_AREA,
  parameters: CF_PARAMETERS,
  socket: CF_SOCKET,
  metadata: V3_METADATA,
  ground: V3_GROUND,
  gameplay: V3_GAMEPLAY,
  stream: V3_STREAM,
  world: CF_WORLD,
  generation: CF_GENERATION,
  asset: CF_ASSET,
  district: CF_DISTRICT,
  block: CF_BLOCK,
  parcel: CF_PARCEL,
  terrainModifier: CF_TERRAIN_MODIFIER,
  terrain: CF_TERRAIN,
  waterway: CF_WATERWAY,
  lake: CF_LAKE,
  hydrology: CF_HYDROLOGY,
  cave: CF_CAVE,
  caves: CF_CAVES,
  node: CF_NODE,
  lane: CF_LANE,
  segment: CF_SEGMENT,
  junction: CF_JUNCTION,
  network: CF_NETWORK,
  networks: CF_NETWORKS,
  deck: CF_DECK,
  bridge: CF_BRIDGE,
  tunnel: CF_TUNNEL,
  structures: CF_STRUCTURES,
  instance: CF_INSTANCE,
  chunk: CF_CHUNK,
  chunkEntry: CF_CHUNK_ENTRY,
  chunkIndex: CF_CHUNK_INDEX,
  cityforge: CF_CITYFORGE,
};

/** Reusable definitions for `level-common.schema.json`. */
export const LEVEL_COMMON_V3 = { definitions: COMMON_V3_DEFS };

/** Root of `level-v3.schema.json`; every section is a `$ref` into the common file. */
export const LEVEL_SPEC_V3 = obj({
  $schema: str({ doc: 'Path to this brief schema: ./level-v3.schema.json.' }),
  kind: str({
    enum: ['cityforge'],
    req: true,
    doc: 'CityForge source brief; entities are compiled into the level module.',
  }),
  metadata: ref('metadata', { req: true }),
  ground: ref('ground', { req: true }),
  gameplay: ref('gameplay', { req: true }),
  stream: ref('stream'),
  cityforge: ref('cityforge', { req: true }),
  // Движковые дома в формате v2, пропускаемые компилятором в engine.buildings
  // (до полноценной компиляции instances). Валидация структуры — нормализатором.
  buildings: OPEN_BUILDINGS,
}, { doc: 'CityForge source level from docs/world-format.md.' });

// ------------------------------------------------------------- CityForge v4 (district generator manifest, ADR-001)

const V4_OPEN = obj({}, { open: true });

const V4_DISTRICT = obj({
  id: str({ req: true }),
  type: str({}),
  profileId: str({}),
  geometry: V4_OPEN,
  mask: V4_OPEN,
  cells: arr(V4_OPEN, { minItems: 0 }),
  priority: num({}),
  overrides: V4_OPEN,
  fallbackChain: arr(str({}), { minItems: 0 }),
}, { open: true, doc: 'District declaration for generator stages/layer 3 (geometry|mask|cells as applicable).' });

const V4_GENERATOR = obj({
  generatorVersion: str({ req: true }),
  seed: num({ req: true }),
  deterministic: bool({ default: true }),
  stages: arr(obj({ id: str({}), enabled: bool({}) }, { open: true }), { minItems: 0, maxItems: 7 }),
  layers: arr(V4_OPEN, { minItems: 0, maxItems: 7 }),
  budgets: V4_OPEN,
  districts: arr(V4_DISTRICT, { minItems: 0 }),
  profiles: V4_OPEN,
  catalogs: V4_OPEN,
  refs: V4_OPEN,
  policies: V4_OPEN,
}, { open: true, doc: 'v4 city generator manifest (IR/stages/districts/policies). Details refined in TASK-002+; open for forward-compatible fields.' });

/** Root of `level-v4.schema.json`; reuses v3 common definitions plus v4 generator manifest. */
export const LEVEL_SPEC_V4 = obj({
  $schema: str({ doc: 'Path to this brief schema: ./level-v4.schema.json.' }),
  kind: str({
    enum: ['cityforge'],
    req: true,
    doc: 'CityForge v4 source brief with district generator manifest.',
  }),
  schemaVersion: num({ enum: [4], req: true, doc: 'Format version: v4 (district-aware generator).' }),
  metadata: ref('metadata', { req: true }),
  ground: ref('ground', { req: true }),
  gameplay: ref('gameplay', { req: true }),
  stream: ref('stream'),
  windows: OPEN_WINDOWS,
  sky: OPEN_SKY,
  // Optional hooks for future behavior/assets; static in MVP (ADR-001).
  properties: V4_OPEN,
  // Runtime/perf overrides for open-world nav/build probes (optional; default from CONFIG).
  navEdgeProbe: num({ min: 0.1, doc: 'Шаг проб опоры вдоль навигационных рёбер (м). Меньше — точнее, больше — быстрее сборка.' }),
  bodyProbe: num({ min: 0.1, doc: 'Шаг проб габарита тела вдоль навигационных рёбер (м). Меньше — точнее, больше — быстрее сборка.' }),
  buildings: OPEN_BUILDINGS,
  landscapeObjects: OPEN_LANDSCAPE,
  lights: OPEN_LIGHTS,
  cityforge: ref('cityforge', { req: true }),
  generator: V4_GENERATOR,
}, { open: false, doc: 'CityForge v4 source level with district generator manifest (ADR-001).' });

// ------------------------------------------------------------- обход схемы

function typeOf(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v;
}

function checkValue(value, spec, path, errors) {
  switch (spec.kind) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`${path}: ожидалось число, получено ${JSON.stringify(value)}`);
        return;
      }
      if (spec.min !== undefined && value < spec.min) errors.push(`${path}: ${value} меньше минимума ${spec.min}`);
      if (spec.max !== undefined && value > spec.max) errors.push(`${path}: ${value} больше максимума ${spec.max}`);
      return;
    case 'string':
      if (typeof value !== 'string') { errors.push(`${path}: ожидалась строка`); return; }
      if (spec.enum && !spec.enum.includes(value)) {
        errors.push(`${path}: '${value}' вне перечисления ${spec.enum.join('|')}`);
      }
      if (spec.pattern && !new RegExp(spec.pattern).test(value)) {
        errors.push(`${path}: '${value}' не соответствует шаблону ${spec.pattern}`);
      }
      return;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}: ожидалось true|false`);
      return;
    case 'color':
      if (typeof value === 'number') return;
      if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
        errors.push(`${path}: цвет — число 0x… или строка '#rrggbb'`);
      }
      return;
    case 'array': {
      if (!Array.isArray(value)) { errors.push(`${path}: ожидался массив`); return; }
      if (spec.minItems !== undefined && value.length < spec.minItems) {
        errors.push(`${path}: элементов меньше ${spec.minItems}`);
      }
      if (spec.maxItems !== undefined && value.length > spec.maxItems) {
        errors.push(`${path}: элементов больше ${spec.maxItems}`);
      }
      value.forEach((v, i) => checkValue(v, spec.items, `${path}[${i}]`, errors));
      return;
    }
    case 'ref': {
      const target = COMMON_V3_DEFS[spec.name];
      if (!target) { errors.push(`${path}: $ref '${spec.name}' не найден`); return; }
      checkValue(value, target, path, errors);
      return;
    }
    case 'object': {
      if (typeOf(value) !== 'object') { errors.push(`${path}: ожидался объект`); return; }
      for (const [key, sub] of Object.entries(spec.fields)) {
        if (value[key] === undefined) {
          if (sub.req) errors.push(`${path}.${key}: обязательное поле отсутствует`);
          continue;
        }
        checkValue(value[key], sub, `${path}.${key}`, errors);
      }
      if (!spec.open) {
        for (const key of Object.keys(value)) {
          if (!(key in spec.fields)) errors.push(`${path}.${key}: поле не описано в схеме`);
        }
      }
      return;
    }
    default:
      errors.push(`${path}: спецификация сломана (kind=${spec.kind})`);
  }
}

/** Проверка структуры: только типы, обязательность, enum и диапазоны. */
export function validateSpec(raw, spec = LEVEL_SPEC_OPEN) {
  const errors = [];
  checkValue(raw, spec, '', errors);
  return errors;
}

// ------------------------------------------------------------- разрезка (stream)

/**
 * Правила секции `stream` — то, что видно только по нескольким её полям сразу.
 * `kind: 'open'` без `stream` парсеру нечем резать мир; `chunk` обязан делить
 * плиту нацело; `aheadMax` не меньше `aheadMin`.
 */
function streamErrors(raw, spec) {
  const errors = [];
  const stream = raw.stream;
  const hasStreamField = !!(spec && spec.fields && spec.fields.stream);
  if (stream && !hasStreamField) {
    errors.push('stream: секция не поддерживается этой схемой');
    return errors;
  }
  if (raw.kind === 'open' && !stream) {
    errors.push("stream: `kind: 'open'` без секции — парсеру нечем резать мир; задайте `stream.chunk` и `stream.keep`");
  }
  if (!stream) return errors;
  const size = raw.ground?.size ?? 176;
  try {
    cellGrid(size, stream.chunk);
  } catch (e) {
    errors.push(String(e.message ?? e));
  }
  if (stream.aheadMax < stream.aheadMin) {
    errors.push(`stream.aheadMax ${stream.aheadMax} меньше aheadMin ${stream.aheadMin}: упреждение на машине не обязано быть короче пешего, иначе машина въезжает в незастроенный чанк (§ 4.4)`);
  }
  return errors;
}
// ------------------------------------------------------------- проверка геометрии

/**
 * Второй проход — то, что видно только по всей картине: комнаты внутри
 * footprint, пересечения комнат, лестницы в комнатах, осевые рёбра дорог,
 * уклоны, опоры под настилом, лимит огней.
 * @param {object} raw бриф уровня
 * @param {object} spec схема (по умолчанию `LEVEL_SPEC_OPEN`; для
 *   CityForge передаётся `LEVEL_SPEC_V3`/`LEVEL_SPEC_V4`) — структуру и
 *   геометрию обязан проверять один и тот же набор правил.
 * @returns {{errors:string[], warnings:string[]}}
 */
export function validateLevel(raw, spec = LEVEL_SPEC_OPEN) {
  const errors = validateSpec(raw, spec);
  const warnings = [];
  if (errors.length) return { errors, warnings, geometryOnly: false };

  // Разрезка — поле с последствиями в двух других модулях (парсер режет клетки,
  // движок держит окно), поэтому проверяется отдельным проходом: структурный
  // обход видит только типы и диапазоны, а «`chunk` делит плиту нацело» и
  // «`aheadMax` не меньше `aheadMin`» — свойства сразу двух чисел.
  errors.push(...streamErrors(raw, spec));
  if (errors.length) return { errors, warnings, geometryOnly: false };

  const size = raw.ground?.size ?? 176;
  const half = size / 2;
  const groundY = raw.ground?.y ?? 0;
  const cell = J.probeCell;
  // Поле местности для отметки грунта ПОД ТОЧКОЙ: правила вроде «нос подъёма
  // опознаётся по земле под ним, а не по нулю пола мира» берут его со всеми
  // авторскими площадками (терраса района — тот же грунт). Проба предельного
  // уклона ниже строит своё поле по одним холмам: у неё другой смысл, см.
  // комментарий там. Генератор кварталов (`bridgeNoses` в tools/city.js) меряет
  // пятку по этому же полю, иначе схема и разворот разъехались бы на первом же
  // брифе с рельефом.
  const reliefField = raw.relief
    ? reliefOf({ ...raw.relief, baseY: raw.relief.baseY ?? groundY })
    : null;

  // --- рельеф: крутизна поля и разумность площадок ---
  // Поле проверяется аналитикой, а не пробой сетки: у холма максимум производной
  // известен на бумаге (`1,5 · height / radius` на половине радиуса — замер в
  // `tools/relief.test.mjs`), и автор обязан получить число в тексте ошибки, а не
  // «где-то круто» после растеризации 600 × 600 м.
  if (raw.relief) {
    const r = raw.relief;
    const maxSlope = r.maxSlope ?? J.relief.maxSlope;
    // Предел ОДНОЙ капсулы — свой, `hillMaxSlope`: площадка плоская, а переход к
    // ней даёт 1,5 · |Δ| / blend поверх собственного склона холма, поэтому поле
    // сойдётся в `maxSlope` только если капсула заведомо пологое предела поля
    const hillMax = r.hillMaxSlope ?? J.relief.hillMaxSlope;
    if ((r.baseY ?? 0) !== groundY) {
      warnings.push(`relief.baseY ${r.baseY ?? 0} не совпал с ground.y ${groundY}: опорным верхом главы станет baseY`);
    }
    for (const [n, h] of (r.hills ?? []).entries()) {
      const label = `relief.hills[${n}] (${h.id ?? 'без id'})`;
      if ((h.bx === undefined) !== (h.bz === undefined)) {
        errors.push(`${label}: у капсулы задан только один конец (bx/bz) — второй парсер взял бы как центр холма`);
      }
      const peak = 1.5 * Math.abs(h.height) / h.radius;
      if (peak > hillMax + 1e-9) {
        errors.push(`${label}: склон круче предела холма — максимум ${peak.toFixed(3)} м/м (1,5 · ${Math.abs(h.height)} / ${h.radius}) `
          + `при допустимых ${hillMax}; радиус обязан быть не меньше ${(1.5 * Math.abs(h.height) / hillMax).toFixed(0)} м `
          + 'или высота меньше');
      }
    }
    // Суммарный склон поля — пробой по сетке, а не только аналитика каждой
    // капсулы: два соседних холма складываются, и предел одной (`1,5 · h / r`)
    // не видит, что их фланги дают вместе круче. Зона пробы — габарит холмов с
    // их радиусами, обрезанный по земле: вне его поле константно и проверять нечего.
    if ((r.hills ?? []).length) {
      // Предел уклона меряется по ХОЛМАМ, а не по собранному полю с площадками:
      // парсер раздувает кольцо blend каждой площадки подгонкой (`fitPadBlend`),
      // и статический проба по финальному полю брак бы вал авторский бриф за
      // переход, который нормализатор сам же и исправит. Отметка грунта под
      // объектом (`reliefField` выше) берётся наоборот — со всеми площадками.
      const field = reliefOf({ baseY: r.baseY ?? groundY, hills: r.hills ?? [] });
      let lo = { x: -half, z: -half }, hi = { x: half, z: half };
      for (const h of r.hills) {
        lo = { x: Math.max(lo.x, Math.min(h.x, h.bx ?? h.x) - h.radius),
               z: Math.max(lo.z, Math.min(h.z, h.bz ?? h.z) - h.radius) };
        hi = { x: Math.min(hi.x, Math.max(h.x, h.bx ?? h.x) + h.radius),
               z: Math.min(hi.z, Math.max(h.z, h.bz ?? h.z) + h.radius) };
      }
      const step = Math.min(J.relief.meshCell, J.planGrid);
      let worst = { mag: 0, x: 0, z: 0 };
      for (let x = lo.x; x <= hi.x + 1e-9; x += step) {
        for (let z = lo.z; z <= hi.z + 1e-9; z += step) {
          const mag = field.slopeAt(x, z).mag;
          if (mag > worst.mag) worst = { mag, x: r3(x), z: r3(z) };
        }
      }
      if (worst.mag > maxSlope * 1.02) {
        errors.push(`relief: поле в точке (${worst.x}, ${worst.z}) даёт уклон ${worst.mag.toFixed(3)} м/м `
          + `круче предела ${maxSlope} — холмы складываются, и поштучный предел капсулы этого не видит; `
          + 'уменьшите высоту или раздвиньте радиусы');
      }
    }
    for (const [n, p] of (r.pads ?? []).entries()) {
      const label = `relief.pads[${n}] (${p.id ?? 'без id'})`;
      if (!(p.minX < p.maxX) || !(p.minZ < p.maxZ)) {
        errors.push(`${label}: вырожденная площадка (${p.minX}…${p.maxX} × ${p.minZ}…${p.maxZ}) — опора в её ядре нечем не держится`);
      }
      const reach = Math.max(p.blend ?? r.blend ?? J.relief.blend, 0);
      // Кольцо обрезано лишь тогда, когда ЯДРО площадки ещё лежит внутри земли:
      // тогда в кадре остаётся оборванный переход, и его уклон нечем ограничить.
      // Ядро, дотянутое до самого края, перехода в кадре не имеет вовсе — так
      // держится коридор поймы, который обязан пересекать карту целиком
      const cut = (lo, hi, edge) => (edge === 'lo' ? lo - reach < -half : hi + reach > half)
        && (edge === 'lo' ? lo > -half : hi < half);
      if (cut(p.minX, p.maxX, 'lo') || cut(p.minX, p.maxX, 'hi')
        || cut(p.minZ, p.maxZ, 'lo') || cut(p.minZ, p.maxZ, 'hi')) {
        errors.push(`${label}: площадка с переходной зоной ${reach} м выходит за землю ${size} м — `
          + 'кольцо blend обрезано внутри кадра, и у её края уклон не ограничен');
      }
    }
  }

  // --- дороги: последовательность точек и разумные уклоны (любое прямое направление) ---
  const roadRects = [];
  for (const [n, road] of (raw.roads ?? []).entries()) {
    const label = `roads[${n}] (${road.id})`;
    if (road.elements) {
      errors.push(...checkRoadElements(road, label, half, groundY, warnings));
      roadRects.push(...roadRectsOf(road));
      continue;
    }
    if (!road.points) {
      errors.push(`${label}: ни points, ни elements — у дороги нет осевой линии`);
      continue;
    }
    for (let i = 0; i + 1 < road.points.length; i++) {
      const a = road.points[i], b = road.points[i + 1];
      const dx = Math.abs(a.x - b.x), dz = Math.abs(a.z - b.z);
      const run = Math.hypot(dx, dz);
      const rise = Math.abs(b.y - a.y);
      if (run < 0.01) errors.push(`${label}: отрезок ${i}→${i + 1} нулевой длины`);
      // настил с подъёмом — одна наклонная пластина (не лестница коробок), и её
      // крутизна ограничена тем, что перешагивает нога и что берёт сфера Чужого
      if (run > 0.01 && rise / run > J.maxSlope + 1e-9) {
        errors.push(`${label}: отрезок ${i}→${i + 1} даёт уклон ${(rise / run).toFixed(2)} м/м — `
          + `круче ${J.maxSlope} (подъём ${rise.toFixed(2)} м на ${run.toFixed(2)} м неперешагиваем)`);
      }
      if (road.type !== 'ground' && Math.max(a.y, b.y) - groundY < J.bridgeMinHeight) {
        warnings.push(`${label}: настил на ${road.id} ниже ${J.bridgeMinHeight} м над землёй — под ним не пройти`);
      }
    }
    if (road.type !== 'ground') {
      const top = Math.max(...road.points.map(p => p.y));
      if (top - groundY < J.bridgeMinHeight) {
        errors.push(`${label}: ${road.type} с верхом ${top} не поднимается над землёй на ${J.bridgeMinHeight} м`);
      }
    }
    roadRects.push(...roadRectsOf(road));
  }

  // --- туннели: прямые коридоры, проверка порталов и уклона пола ---
  // Коридор прямой, поэтому у него нет «кривых» профилей: проверяем только, что
  // порталы стоят на земле (в пределах плиты) и что пол коридора — настил над
  // землёй (не «пол под землёй»), а высота туннеля позволяла стенам быть высокими
  // над полом человека.
  for (const [n, t] of (raw.tunnels ?? []).entries()) {
    const label = `tunnels[${n}] (${t.id})`;
    const [a, b] = t.points;
    for (const [i, p] of t.points.entries()) {
      const plabel = `${label}.points[${i}]`;
      if (Math.abs(p.x) > half || Math.abs(p.z) > half) {
        errors.push(`${plabel}: портал (${p.x}, ${p.z}) вне земли ${size} м`);
      }
      if (p.y < -1e-9) errors.push(`${plabel}: портал ниже земли ${groundY} — коридор должен стоять над полом`);
    }
    const run = Math.hypot(b.x - a.x, b.z - a.z);
    if (run < 0.01) errors.push(`${label}: порталы совпадают — коридор пуст`);
    const rise = Math.abs(b.y - a.y);
    if (run > 0.01 && rise / run > J.maxSlope + 1e-9) {
      errors.push(`${label}: коридор даёт уклон ${(rise / run).toFixed(2)} м/м — круче ${J.maxSlope}`);
    }
    if (Math.abs(a.x - b.x) > AXIS_EPS && Math.abs(a.z - b.z) > AXIS_EPS) {
      errors.push(`${label}: коридор не идёт по оси X или Z — прямой туннель должен лежать по оси`);
    }
    if (t.height < J.tunnelMinHeight) {
      errors.push(`${label}: высота коридора ${t.height} м — ниже минимума ${J.tunnelMinHeight} м (человеческий глаз+тело)`);
    }
  }

  // --- вода: русло, берега, сходы ---
  // Планы берёт нормализатор: проверять «дом не в русле» по своей копии
  // арифметики берега значило бы держать её в двух местах и разъезжаться с
  // парсером при первой же правке.
  const channelRects = [];
  for (const [n, w] of (raw.waterways ?? []).entries()) {
    const label = `waterways[${n}] (${w.id})`;
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i], b = w.points[i + 1];
      const dx = Math.abs(a.x - b.x), dz = Math.abs(a.z - b.z);
      if (dx < AXIS_EPS && dz < AXIS_EPS) errors.push(`${label}: отрезок ${i}→${i + 1} нулевой длины`);
    }
    for (const [i, p] of w.points.entries()) {
      if (Math.abs(p.x) > half || Math.abs(p.z) > half) {
        errors.push(`${label}: точка русла ${i} (${p.x}, ${p.z}) вне земли ${size} м`);
      }
    }
    const rise = groundY - w.bedY;
    if (rise < 0.2) {
      errors.push(`${label}: дно ${w.bedY} мельче 0,2 м под землёй ${groundY} — русла нет, есть канава в полшага`);
    }
    if (w.bedY >= w.surfaceY) errors.push(`${label}: surfaceY ${w.surfaceY} не выше дна ${w.bedY} — воде негде лечь`);
    if (w.surfaceY > groundY) {
      errors.push(`${label}: surfaceY ${w.surfaceY} выше земли ${groundY} — вода стояла бы поверх улиц`);
    }

    let ch = null;
    try {
      ch = normalizeWaterway(w, { y: groundY });
    } catch (e) {
      errors.push(`${label}: ${e.message}`);
    }
    if (!ch) continue;

    const seg0 = ch.segments[0];
    if (w.bank === 'slope' && rise > 0 && seg0.run > 0 && rise / seg0.run > J.maxSlope + 1e-9) {
      errors.push(`${label}: bankRun ${seg0.run} при перепаде ${rise} даёт уклон берега `
        + `${(rise / seg0.run).toFixed(2)} м/м — круче ${J.maxSlope}, нога и сфера Чужого склон не возьмут`);
    }
    if (w.bank === 'quay' && ch.wade && (w.ramps ?? []).length < 2) {
      errors.push(`${label}: набережная с бродом и ${(w.ramps ?? []).length} сходами — в русло войти можно,`
        + ' а стенка карниза не отпускает обратно: сходов нужно не меньше двух');
    }
    for (const [i, r] of (w.ramps ?? []).entries()) {
      const rlabel = `${label}.ramps[${i}]`;
      const reach = Math.max(...ch.segments.map(s => s.halfW + s.depth + s.rampRun + 2));
      const d = Math.min(...ch.segments.map(s => {
        const along = s.axis === 'x' ? r.at.x : r.at.z;
        const cross = s.axis === 'x' ? r.at.z : r.at.x;
        const outAlong = Math.max(s.lo - along, along - s.hi, 0);
        return Math.hypot(outAlong, Math.abs(cross - s.cross));
      }));
      if (d > reach) {
        errors.push(`${rlabel}: сход ${r.at.x}, ${r.at.z} в ${d.toFixed(1)} м от русла — дальше, чем `
          + `${reach.toFixed(1)} м (полширины + берег + длина пандуса); пандус ушёл бы в никуда`);
      }
    }
    for (const h of ch.holes) channelRects.push({ id: w.id, rect: h });
  }
  // наземная улица в русле — асфальт лег бы на воду: опоры у настила нет, и
  // ни ноги, ни маршруты через такое место не проходят
  for (const rr of roadRects) {
    if (!rr.ground) continue;
    for (const c of channelRects) {
      // план улицы из пластин повёрнут: его габарит заходит в воду углами, где
      // асфальта нет, и `rectsIntersect` браковал бы улицу, ни разу не коснувшуюся
      // русла. SAT по собственным осям полотна — та же проверка, что у парсера
      if (obbHitsRect(rr.rect, c.rect, 0.05)) {
        errors.push(`roads (${rr.id}): план наземной улицы пересёкся с руслом ${c.id} — дорогу через воду делает мост`);
      }
    }
  }

  // --- здания: footprint, комнаты, лестницы, двери ---
  const roadIds = new Set((raw.roads ?? []).map(r => r.id));
  // наземная улица под домом — дом посреди проезжей части: маршруты идут по
  // настилу, а габарит стоит в нём, поэтому такое здание бракуется
  const groundRects = roadRects.filter(r => r.ground);
  // нормализованные копии зданий: торцы переходов проверяются по тем же отметкам
  // полов, кровель и дверей, что считает парсер, — своя копия этой арифметики
  // разъехалась бы с ним при первой же правке
  const normBuildings = [];
  // планы домов в мировых осях (OBB для косых) — для проверки «соседями не
  // пересечься»; собирается всегда, а сравнивается только если в брифе есть
  // хотя бы один поворот: район из 600 соосных домов сверялся бы по габаритам,
  // которые и так не пересекаются
  const planBoxes = [];
  for (const [n, b] of (raw.buildings ?? []).entries()) {
    const label = `buildings[${n}] (${b.id})`;
    const enterable = b.isEnterable !== false;
    if (enterable && b.floorsCount > J.enterableFloors) {
      errors.push(`${label}: ${b.floorsCount} этажей во вводимом доме — максимум ${J.enterableFloors}`
        + ' (механизм маршей: посадка и проёмы перекрытий считаются по этажам)');
    }
    if (b.roof && b.roof.walkable !== true && (b.roof.parapet ?? 0) > 0) {
      warnings.push(`${label}: парапет ${b.roof.parapet} при невходимой кровле — по ней никто не ходит, ограждения парсер не ставит`);
    }
    try {
      normBuildings.push(normalizeBuilding(b, { y: groundY, size }, []));
    } catch {
      // разбор полигона упадёт уже в ошибках ниже — проверять торцы перехода не по чему
    }
    const fp = normalizePolygon(b.footprint, `${label}.footprint`, errors);
    if (!fp) continue;
    const fpCells = rasterPoly(fp, cell);
    if (fpCells.size === 0) { errors.push(`${label}: footprint не покрывает ни одной клетки — здания нет`); continue; }
    const bounds = polyBounds(fp);
    // косой дом: весь план ниже считается в его осях, а в мировой он ставится
    // поворотом вокруг центра габарита — тем же `frameOf`, что и карта
    const frame = frameOf(bounds, b.rotation ?? 0);
    planBoxes.push({
      label, rotation: b.rotation ?? 0, rotated: !!frame,
      rects: polyRects(fp).map(r => obbOf(r, frame)),
    });
    for (const rect of polyRects(fp)) {
      const o = obbOf(rect, frame);
      for (const rr of groundRects) {
        // у повёрнутой улицы план — тоже OBB: дом, вставший в её габаритный угол,
        // стоит на свободном асфальте, а `obbHitsRect` сравнивал бы корпус с
        // прямоугольником мировой сетки и браковал бы именно такой угол
        if (obbHitsObb(o, rr.rect, 0.05)) {
          errors.push(`${label}: часть footprint ${fmtRect(rotatedBounds(rect, frame))} легла на план наземной дороги ${rr.id} — дом стоит в улице`);
        }
      }
      // план русла включает дно, берега, сходы и стенки: дом, вставший в него,
      // отнял бы у воды суши, а игрок — дорогу вброд
      for (const c of channelRects) {
        if (obbHitsRect(o, c.rect, 0.05)) {
          errors.push(`${label}: часть footprint ${fmtRect(rotatedBounds(rect, frame))} легла в русло ${c.id} — дом стоит в воде`);
        }
      }
    }
    const outline = rotatedBounds(bounds, frame);
    for (const v of [[outline.minX, outline.minZ], [outline.maxX, outline.maxZ]]) {
      if (Math.abs(v[0]) > half || Math.abs(v[1]) > half) {
        errors.push(`${label}: выходит за землю (${size} м): точка ${v[0]}, ${v[1]}`);
      }
    }

    const used = [];
    // цель двери может быть только улицей, комнатой этого же дома или лестницей:
    // на несуществующий адрес карта повесила бы проём, ведущий в никуда
    const roomIds = new Set(b.rooms.map(r => r.id));
    const stairIds = new Set((b.stairs ?? []).map(s => s.id));
    for (const [k, room] of b.rooms.entries()) {
      const rlabel = `${label}.rooms[${k}] (${room.id})`;
      if (room.floor >= b.floorsCount) {
        errors.push(`${rlabel}: этаж ${room.floor} при floorsCount ${b.floorsCount}`);
      }
      const rp = normalizePolygon(room.polygon, `${rlabel}.polygon`, errors);
      if (!rp) continue;
      const rc = rasterPoly(rp, cell);
      for (const key of rc) {
        if (!fpCells.has(key)) { errors.push(`${rlabel}: комната выходит за периметр footprint (клетка ${key})`); break; }
      }
      for (const prev of used) {
        if (prev.floor !== room.floor) continue;
        if (cellsIntersect(rc, prev.cells)) {
          errors.push(`${rlabel}: пересекается с комнатой ${prev.id} того же этажа`);
        }
      }
      used.push({ id: room.id, floor: room.floor, cells: rc, rect: boundsOf(rp) });
      for (const c of (room.connections ?? [])) {
        if (!roadIds.has(c.target) && !roomIds.has(c.target) && !stairIds.has(c.target)) {
          errors.push(`${rlabel}: target '${c.target}' — не улица, не комната и не лестница этого дома`);
        }
        const onEdge = polyEdges(rp).some(e => distToEdge(e, c.portalPosition.x, c.portalPosition.z) <= 0.25);
        if (!onEdge) {
          errors.push(`${rlabel}: portalPosition ${c.portalPosition.x}, ${c.portalPosition.z} не на ребре комнаты —`
            + ' дверь не прорежет стену');
        }
      }
    }

    for (const [k, st] of (b.stairs ?? []).entries()) {
      const slabel = `${label}.stairs[${k}] (${st.id})`;
      const [k0, k1] = st.connectsFloors;
      // верх марша обязан совпасть с чем-то: перекрытием этажа (k1 < floorsCount)
      // или кровлей (k1 === floorsCount — люк на крышу). Глубже кровли марша нет:
      // плита её не пропустит, а на отметке выше roofY опоры не существует
      const toRoof = k1 === b.floorsCount;
      if (k1 <= k0) errors.push(`${slabel}: connectsFloors [${k0}, ${k1}] — вниз лестница не ведёт`);
      if (k1 > b.floorsCount) {
        errors.push(`${slabel}: верхний этаж ${k1} при floorsCount ${b.floorsCount} — марш ушёл выше кровли (отметка ${b.baseY ?? 0} + ${k1}·${b.floorHeight})`);
      }
      if (toRoof && b.roof?.walkable !== true) {
        errors.push(`${slabel}: марш выведен на кровлю (этаж ${k1}), а она не ходкая — roof.walkable: true`
          + ' иначе поднявшийся встанет на плиту, по которой парсер не ведёт маршруты, и упрётся в парапет');
      }
      // план по умолчанию имеет только вертикальный марш (шахта J.ladderShaft):
      // у остальных размеров нет, и марш встал бы в точку
      const d = st.dimensions ?? (st.type === 'ladder' ? { width: J.ladderShaft, length: J.ladderShaft } : null);
      if (!d) {
        errors.push(`${slabel}: ${st.type} без dimensions — план марша обязана задавать схема, по умолчанию его держит только ladder`);
      }
      const dd = d ?? { width: J.ladderShaft, length: J.ladderShaft };
      const along = Math.max(dd.width, dd.length), across = Math.min(dd.width, dd.length);
      // план марша поворачивает тот же toWorld, что и парсер: своя арифметика
      // «габарит вдоль X» проверила бы не тот проём, который режется в плите
      const rect = toWorld({ minX: 0, maxX: along, minZ: 0, maxZ: across },
        st.rotation ?? 0, st.position.x, st.position.z, along, across);
      const sc = rasterRect(rect, cell);
      for (const key of sc) {
        if (!fpCells.has(key)) { errors.push(`${slabel}: лестница вне footprint (клетка ${key})`); break; }
      }
      if (st.type === 'spiral' && across < 2 * (CONFIG.alien.radius + CONFIG.radius)) {
        errors.push(`${slabel}: винтовая лестница уже ${2 * (CONFIG.alien.radius + CONFIG.radius)} м — тело Чужого не впишется`);
      }
      // перекрытие и крыша вокруг марша режутся проёмом на клиенте, поэтому
      // соседство комнаты с лестницей — норма. Норма обязана быть с обеих сторон:
      // без комнаты внизу марш стоит над ямой, без комнаты наверху поднявшийся
      // выходит в плиту перекрытия
      const roomAt = floor => used.find(r => r.floor === floor && cellsIntersect(sc, r.cells));
      if (!roomAt(k0)) {
        errors.push(`${slabel}: низ марша не попадает ни в одну комнату этажа ${k0} — под ступенями нет пола`);
      }
      if (!toRoof && !roomAt(k1)) {
        errors.push(`${slabel}: верх марша не попадает ни в одну комнату этажа ${k1} — поднявшийся выйдет в перекрытие`);
      }
    }

    // вход обязан лежать на фасадном ребре: парсер знает только комнату,
    // поэтому проверяем, что портал на ребре и footprint тоже (иначе это
    // внутренняя перегородка, и с улицы в дом не попасть)
    for (const room of used) {
      for (const c of (room.connections ?? [])) {
        const onFp = polyEdges(fp).some(e => distToEdge(e, c.portalPosition.x, c.portalPosition.z) <= 0.25);
        if (!onFp) warnings.push(`${label}: вход ${c.linkType ?? 'door'} комнаты ${room.id} на внутренней перегородке, не на фасаде`);
      }
    }
  }

  // --- косые дома: пересечение планов ---
  // Разрешена только соосная пара (подиум + башня): при одном угле планы
  // переводятся друг в друга сдвигом, и парсер прорезает кровлю чужим планом
  // корректно. Разный угол дал бы пересечение, которое в локальных осях дома
  // не выражается ничем, — кровля под таким домом прорезалась бы его габаритом.
  // Габарит для проверки не годится: два косых дома могут смотреть друг на
  // друга углами, а их охватывающие коробки — пересекаться.
  if (planBoxes.some(b => b.rotated)) {
    for (const [i, a] of planBoxes.entries()) {
      for (const b of planBoxes.slice(i + 1)) {
        if (b.rotation === a.rotation) continue;
        const hit = a.rects.some(ra => b.rects.some(rb => obbHitsObb(ra, rb, 0.05)));
        if (hit) {
          errors.push(`${a.label} и ${b.label}: планы пересекаются при разных rotation `
            + `(${a.rotation}° и ${b.rotation}°) — косой дом нельзя ни вписать в чужую кровлю, `
            + 'ни обходить: соосная пара (одинаковый rotation) разрешена');
        }
      }
    }
  }

  // --- переходы (skybridge): у пластины нет опор с земли, её держат здания ---
  // Каждый торец обязан совпасть с отметкой пола комнаты (тогда в переход ведёт
  // её дверь) или с ходовой кровлей (тогда настил примыкает к плите). Без этого
  // парсер выдал бы пластину в воздухе: нога на неё встанет из узла настила, а
  // маршруту негде было бы на неё войти и с неё выйти.
  // Проверяется не вся пластина, а её конец глубиной в ширину настила: прямолинейный
  // переход — одна пластина на оба торца, и проверка ею целиком пропускала бы
  // висячий конец, стоило бы другому концу зацепить здание.
  // Конец отпускается на J.skybridgeFit и в плане, как по высоте: плита кровли и
  // фасад приходят ровно в черту торца, и строгая пересечённость браковала бы
  // примыкание в ноль.
  for (const [n, road] of (raw.roads ?? []).entries()) {
    if (road.type !== 'skybridge' || !road.points) continue;
    const label = `roads[${n}] (${road.id})`;
    const plans = roadRectsOf(road);
    const ends = [[0, road.points[0], 'начальный'], [plans.length - 1, road.points[road.points.length - 1], 'конечный']];
    for (const [pi, p, name] of ends) {
      const plate = plans[pi]?.rect;
      if (!plate) { errors.push(`${label}: настил не разложен на пластины — торцу негде проверять опору`); continue; }
      const cap = grown(endCap(plate, p, road.width), J.skybridgeFit);
      const elabel = `${label}: торец ${name} (${p.x}, ${p.z}) на отметке ${p.y}`;
      // примыкание меряется проёмом двери, а не её наружным узлом: узел парсер
      // выносит на 1,4 м за фасад (там нога входит в дверь), а пластина кончается
      // у стены — проверять по узлу значило бы требовать перехода длиннее дома
      // косой дом торцом перехода не отпускается: и дверь, и плита кровли лежат
      // в его осях, поэтому мировой прямоугольник настила сравнивался бы с
      // локальным планом и согласил бы примыкание там, где его нет
      const door = normBuildings.some(b => !b.rotation && b.doors.some(d => Math.abs(d.y - p.y) <= J.skybridgeFit
        && rectsIntersect(cap, d.rect, 0.05)));
      const roof = normBuildings.some(b => !b.rotation && b.roof?.walkable === true
        && Math.abs(b.roofY - p.y) <= J.skybridgeFit
        && rectsIntersect(cap, b.bounds, 0.05));
      if (!door && !roof) {
        errors.push(`${elabel}: не имеет опоры в плане — ни двери комнаты, ни ходовой кровли на своей отметке `
          + `(допуск ${J.skybridgeFit} м): настил перехода висит в воздухе`);
      }
    }
  }

  // --- свободный нос подъёма обязан прийти на улицу (v2) ---
  // Мост заканчивается там, где по нему въезжают: на полотне наземной улицы.
  // Замер развёрнутого v1-города показал обратное — из 6 свободных носов 3 кончались в 4 и 13 м
  // от ближайшей улицы, один стоял над домом `ncc_012`, и маршрут выводил
  // человека в двор, где обрывается мост. Проверка только для v2: модули v1-глав
  // обязаны побайтово совпадать с парсером, а их носы сегодня именно таковы.
  // `open` — поддерживаемый формат, правило носов действует для него.
  if (isV2Kind(raw.kind)) {
    const streetPlans = [];
    for (const road of raw.roads ?? []) {
      if (road.type !== 'ground') continue;
      const rc = roadRectsOf(road), cp = roadCapsOf(road);
      // `roadRectsOf` и `roadCapsOf` идут по элементам в одном порядке, поэтому
      // i-я пластина и её пара срезов соответствуют друг другу
      for (let i = 0; i < rc.length; i++) {
        streetPlans.push({
          id: road.id, rect: rc[i].rect, topLo: rc[i].topLo, gen: road.district !== undefined,
          a: cp[2 * i], b: cp[2 * i + 1],
        });
      }
    }
    // список носов — общий с генератором кварталов (`tools/city.js` дотягивает к
    // ним оси улиц): тот же гейт «стык цепочки», та же пятка по тому же полю
    for (const cap of bridgeNoses(raw.roads ?? [], groundY, reliefField)) {
      const label = `roads[${cap.n}] (${cap.road.id})`;
      const elabel = `${label}: свободный нос подъёма (${cap.x}, ${cap.z}) на отметке ${cap.top}`;
      let best = null;
      for (const pl of streetPlans) {
        const dist = distToDeck(pl.rect, cap.x, cap.z);
        if (!best || dist < best.dist) best = { ...pl, dist };
      }
      const house = planBoxes.find(b => b.rects.some(r => distToDeck(r, cap.x, cap.z) === 0));
      if (!best || best.dist > J.skybridgeFit) {
        errors.push(`${elabel} не находит наземную улицу — `
          + (best ? `ближайшая ${best.id} в ${best.dist.toFixed(3)} м` : 'ни одной наземной дороги в уровне нет')
          + ` (допуск ${J.skybridgeFit} м): подъём обязан кончаться на полотне улицы, а не`
          + (house ? ` над домом ${house.label}` : ' над пустой землёй'));
        continue;
      }
      // полотно под носом обязано быть на той же отметке: нос в метре над
      // асфальтом — не въезд, а стена, и нога её не берёт. Меряется только по
      // АВТОРСКОЙ улице: отметка генераторной пластины в брифе — намерение, её
      // парсер кладёт на поле (`profileDistrictStreets`), и сравнивать съезд с
      // provisional `y` значило бы браковать всякий район не на нуле. Стык с
      // СОБРАННЫм полотном называет предупреждением парсер — закоммиченная
      // глава предупреждений не носит, поэтому дыра не пройдёт и оттуда.
      if (best.gen) continue;
      const top = deckTopAt(best, cap.x, cap.z);
      if (Math.abs(top - cap.top) > J.skybridgeFit) {
        errors.push(`${elabel} сходится с улицей ${best.id} ступенью `
          + `${Math.abs(top - cap.top).toFixed(3)} м (её полотно ${top}): подъём обязан приходить к `
          + `улице вровень (допуск ${J.skybridgeFit} м)`);
      }
    }
  }

  // --- косая кровля не принимает настил ---
  // Плита примыкающего настила режет ходовую плиту и парапет в осях дома. У
  // повёрнутого корпуса мировая пластина в этих осях не прямоугольник, поэтому
  // её габарит вырезал бы дыру шире перехода — сход с крыши в никуда. `JsonMap`
  // у косого дома примыканий не рассматривает вовсе, и схема бракует такую
  // стыковку явно: иначе глава молча получила бы кровлю без проёма там, где
  // автор перехода рисовал мост.
  for (const b of normBuildings) {
    if (!b.rotation) continue;
    const outline = obbOf(b.bounds, frameOf(b.bounds, b.rotation));
    for (const [n, road] of (raw.roads ?? []).entries()) {
      if (road.type === 'ground') continue;
      for (const pl of roadRectsOf(road)) {
        // торцы пластины лежат на её концах: у повёрнутой пластины проверяются
        // собственные пределы верха, а не точки осевой линии, которой у элементов
        // нет вовсе
        const level = Math.abs(pl.topLo - b.roofY) <= J.skybridgeFit
          || Math.abs(pl.topHi - b.roofY) <= J.skybridgeFit;
        if (level && obbHitsObb(outline, pl.rect, 0.05)) {
          errors.push(`roads[${n}] (${road.id}) и ${b.id}: настил лег на косую кровлю `
            + `(кровля ${b.roofY}, rotation ${b.rotation}°) — проём в плите под углом не вырезать; `
            + 'поставь дому rotation 0 или уведи настил');
        }
      }
    }
  }

  // --- уникальность идентификаторов ---
  const ids = new Set();
  const addId = (v, where) => {
    if (ids.has(v)) errors.push(`${where}: id '${v}' уже занят`);
    ids.add(v);
  };
  for (const r of raw.roads ?? []) addId(r.id, 'roads');
  for (const w of raw.waterways ?? []) addId(w.id, 'waterways');
  for (const b of raw.buildings ?? []) {
    addId(b.id, 'buildings');
    for (const r of b.rooms ?? []) addId(r.id, `buildings/${b.id}/rooms`);
    for (const s of b.stairs ?? []) addId(s.id, `buildings/${b.id}/stairs`);
  }
  for (const o of raw.landscapeObjects ?? []) addId(o.id, 'landscapeObjects');
  for (const l of raw.lights ?? []) addId(l.id, 'lights');

  // --- настоящие источники: лимит и опоры моста вне планов дорог ---
  const real = (raw.lights ?? []).filter(l => l.type !== 'directional');
  if (real.length > J.maxRealLights) {
    errors.push(`lights: ${real.length} источников point/spot — максимум ${J.maxRealLights}`
      + ' (каждый умножает свет во все фрагменты сцены)');
  }
  if ((raw.lights ?? []).filter(l => l.type === 'directional').length > 1) {
    errors.push('lights: больше одного directional — второй складывать в sky.sun некуда');
  }
  for (const o of raw.landscapeObjects ?? []) {
    if (o.model !== 'concrete_pillar') continue;
    const rect = rectAround(o.position.x, o.position.z, J.pillarSection, J.pillarSection);
    for (const rr of roadRects) {
      if (rr.ground && obbHitsRect(rr.rect, rect, 0.05)) {
        errors.push(`landscapeObjects (${o.id}): опора стоит в плане наземной дороги ${rr.id} — по улице она преградой не станет, но визуально закопана в асфальт`);
      }
    }
  }

  // --- спавн и точка B внутри земли ---
  for (const [key, pos] of [['gameplay.spawn', raw.gameplay?.spawn], ['gameplay.exit', raw.gameplay?.exit]]) {
    if (!pos) continue;
    if (Math.abs(pos.x) > half || Math.abs(pos.z) > half) {
      errors.push(`${key}: точка ${pos.x}, ${pos.z} вне земли ${raw.ground?.size} м`);
    }
  }

  // --- автомобили: обещанное число, точки в кадре, корпус ни во что не упирается ---
  // Мерится корпус с его поворотом, а не точка-центр: центр ничего не говорит о
  // том, куда смотрит капот, и повёрнутый в фасад корпус точка бы не выдала
  const carsGp = raw.gameplay?.cars;
  if (carsGp) {
    const spots = carsGp.spots ?? [];
    if (carsGp.count !== spots.length) {
      errors.push(`gameplay.cars: count ${carsGp.count} не совпал с числом точек (${spots.length}) — `
        + 'движок ставит ровно по списку, и вторая цифра читалась бы как обещание, которого данные не отдают');
    }
    const boxes = [];
    for (const [n, p] of spots.entries()) {
      const label = `gameplay.cars.spots[${n}] (${p.x}, ${p.z}, yaw ${p.yaw ?? 0}°)`;
      if (Math.abs(p.x) > half || Math.abs(p.z) > half) {
        errors.push(`${label}: точка вне земли ${size} м — машина встанет за её краем, где ни опоры, ни дороги нет`);
        continue;
      }
      const box = obbOf(rectAround(p.x, p.z, CONFIG.car.length, CONFIG.car.width), frameAt(p.x, p.z, p.yaw ?? 0));
      for (const b of normBuildings) {
        const outline = obbOf(b.bounds, frameOf(b.bounds, b.rotation ?? 0));
        if (obbHitsObb(outline, box, 0.05)) {
          errors.push(`${label}: корпус лег в план дома ${b.id} — машина внутри фасада не видна с улиц, `
            + 'и подойти к ней нельзя; уведи точку или поверни её');
          break;
        }
      }
      boxes.push({ label, box });
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (obbHitsObb(boxes[i].box, boxes[j].box)) {
          errors.push(`${boxes[i].label} и ${boxes[j].label}: планы машин пересеклись — два корпуса на одном `
            + 'асфальте, и игрок видит только ближайший: вторую машину он не находит');
        }
      }
    }
  }

  return { errors, warnings, geometryOnly: true };
}

/**
 * Дорога из пластин и дуг (v2): у каждой свой центр, длина, ширина и угол к
 * северу — полотно развязки законно расширяется, а цепочка элементов идёт не по
 * мировой оси. Проверки те же, что у осевых сегментов v1: уклон, ширина, земля,
 * высота моста; отличие одно — план считается по осям полотна (у дуги — по её
 * кольцевому сектору), а не по габариту.
 */
function checkRoadElements(road, label, half, groundY, warnings) {
  const errors = [];
  if (road.points) {
    errors.push(`${label}: points и elements одновременно — у дороги одна осевая модель`);
    return errors;
  }
  if (road.type === 'embankment' || road.type === 'skybridge') {
    errors.push(`${label}: ${road.type} из пластин не поддержан — насыпь и переход собираются `
      + 'из осевых points (опоры и примыкание торцов считаются по ним)');
    return errors;
  }
  const TAU = Math.PI * 2;
  // маркеры касательной разворачиваются до покомпонентных проверок: план
  // повёрнутой пластины и её угол считаются по тому же `yaw`, что увидит движок
  let elements;
  try {
    elements = resolveRoadElements(road.elements);
  } catch (e) {
    errors.push(`${label}.${e.message}`);
    return errors;
  }
  let top = -Infinity;
  for (const { el, i } of elements) {
    const pl = el?.plate, ar = el?.arc;
    const elabel = `${label}.elements[${i}]`;
    if (pl && ar) {
      errors.push(`${elabel}: plate и arc одновременно — у элемента одна форма`);
      continue;
    }
    if (!pl && !ar) {
      errors.push(`${elabel}: элемент без plate или arc — в схеме v2 описаны две формы`);
      continue;
    }
    if (ar) {
      const span = (ar.to - ar.from) * DEG;
      if (Math.abs(span) < 1e-6 || Math.abs(span) > TAU + 1e-9) {
        errors.push(`${elabel}: размах дуги ${r3(ar.to - ar.from)}° — нужен отличный от нуля и не больше 360°`);
        continue;
      }
      const halfW = ar.width / 2;
      if (ar.radius - halfW <= 0.5) {
        errors.push(`${elabel}: внутренний радиус ${r3(ar.radius - halfW)} м при радиусе ${ar.radius}`
          + ` и ширине ${ar.width} — полотно выворачивается через центр`);
        continue;
      }
      const len = ar.radius * Math.abs(span);
      const rise = (ar.y[1] ?? 0) - (ar.y[0] ?? 0);
      if (Math.abs(rise) / len > J.maxSlope + 1e-9) {
        errors.push(`${elabel}: уклон дуги ${(Math.abs(rise) / len).toFixed(2)} м/м — круче ${J.maxSlope}`
          + ` (подъём ${Math.abs(rise).toFixed(2)} м на ${r3(len)} м неперешагиваем)`);
      }
      const box = arcBounds(ar.cx, ar.cz, ar.radius, halfW, ar.from * DEG, ar.to * DEG);
      for (const [x, z] of [[box.minX, box.minZ], [box.maxX, box.minZ], [box.minX, box.maxZ], [box.maxX, box.maxZ]]) {
        if (Math.abs(x) > half || Math.abs(z) > half) {
          errors.push(`${elabel}: дуга выходит за землю (${half * 2} м): точка ${r3(x)}, ${r3(z)}`);
          break;
        }
      }
      // отметки торцов — средины полотна без крена: крен у обоих концов дуги
      // сходится к нулю (переход пишет нормализатор), а гребень живёт в середине
      // развёртки и сравнивать его с концом соседнего элемента незачем
      const lo = Math.min(ar.y[0], ar.y[1]), hi = Math.max(ar.y[0], ar.y[1]);
      if (road.type !== 'ground' && hi - groundY < J.bridgeMinHeight) {
        warnings.push(`${elabel}: настил на ${road.id} ниже ${J.bridgeMinHeight} м над землёй — под ним не пройти`);
      }
      top = Math.max(top, hi);
      continue;
    }
    const rise = pl.rise ?? 0;
    if (Math.abs(rise) / pl.length > J.maxSlope + 1e-9) {
      errors.push(`${elabel}: уклон ${(Math.abs(rise) / pl.length).toFixed(2)} м/м — круче ${J.maxSlope}`
        + ` (подъём ${Math.abs(rise).toFixed(2)} м на ${pl.length.toFixed(2)} м неперешагиваем)`);
    }
    const plan = {
      minX: pl.x - pl.length / 2, maxX: pl.x + pl.length / 2,
      minZ: pl.z - pl.width / 2, maxZ: pl.z + pl.width / 2,
    };
    const box = rotatedBounds(plan, frameAt(pl.x, pl.z, pl.yaw ?? 0));
    for (const [x, z] of [[box.minX, box.minZ], [box.maxX, box.maxZ]]) {
      if (Math.abs(x) > half || Math.abs(z) > half) {
        errors.push(`${elabel}: пластина выходит за землю (${half * 2} м): точка ${r3(x)}, ${r3(z)}`);
        break;
      }
    }
    const lo = Math.min(pl.y, pl.y + rise), hi = Math.max(pl.y, pl.y + rise);
    if (road.type !== 'ground' && hi - groundY < J.bridgeMinHeight) {
      warnings.push(`${elabel}: настил на ${road.id} ниже ${J.bridgeMinHeight} м над землёй — под ним не пройти`);
    }
    top = Math.max(top, hi);
  }
  if (road.type !== 'ground' && top - groundY < J.bridgeMinHeight) {
    errors.push(`${label}: ${road.type} с верхом ${top} не поднимается над землёй на ${J.bridgeMinHeight} м`);
  }
  return errors;
}

/** План полосы дороги (для проверки «опора не посреди улицы»). */
function roadRectsOf(road) {
  const out = [];
  if (!road.points) {
    // негодный маркер уже назван `checkRoadElements`: здесь он не должен ронять
    // геометрический проход стеком, потому что ошибки собираются, а не бросаются
    let elements = [];
    try { elements = resolveRoadElements(road.elements ?? []); } catch { /* ошибка уже в списке */ }
    for (const { el } of elements) {
      const pl = el?.plate;
      if (el?.arc) {
        const ar = el.arc, halfW = ar.width / 2;
        out.push({
          id: road.id, ground: road.type === 'ground',
          rect: arcBounds(ar.cx, ar.cz, ar.radius, halfW, ar.from * DEG, ar.to * DEG),
          // та же арифметика, что у нормализатора: отметки торцов без крена
          topLo: Math.min(ar.y[0], ar.y[1]),
          topHi: Math.max(ar.y[0], ar.y[1]),
        });
        continue;
      }
      if (!pl) continue;
      const plan = {
        minX: pl.x - pl.length / 2, maxX: pl.x + pl.length / 2,
        minZ: pl.z - pl.width / 2, maxZ: pl.z + pl.width / 2,
      };
      out.push({
        id: road.id, ground: road.type === 'ground',
        rect: obbOf(plan, frameAt(pl.x, pl.z, pl.yaw ?? 0)),
        topLo: Math.min(pl.y, pl.y + (pl.rise ?? 0)),
        topHi: Math.max(pl.y, pl.y + (pl.rise ?? 0)),
      });
    }
    return out;
  }
  const halfW = road.width / 2;
  for (let i = 0; i + 1 < road.points.length; i++) {
    const a = road.points[i], b = road.points[i + 1];
    const horiz = Math.abs(a.x - b.x) >= Math.abs(a.z - b.z);
    // вдоль оси план кончается концом пластины, как его считает нормализатор:
    // наращивать его на полwidth «на случай стыка» значило бы браковать дом,
    // вставший в метре от торца улицы, — генератор как раз обрывает её у его фасада
    const minX = horiz ? Math.min(a.x, b.x) : a.x - halfW;
    const maxX = horiz ? Math.max(a.x, b.x) : a.x + halfW;
    const minZ = horiz ? a.z - halfW : Math.min(a.z, b.z);
    const maxZ = horiz ? a.z + halfW : Math.max(a.z, b.z);
    out.push({
      id: road.id, ground: road.type === 'ground', rect: { minX, maxX, minZ, maxZ },
      topLo: Math.min(a.y, b.y), topHi: Math.max(a.y, b.y),
    });
  }
  return out;
}

/** Расстояние от точки до плана настила (0 — внутри или впритык): у OBB — в своих осях. */
function distToDeck(rect, x, z) {
  const o = rect.obb;
  if (o) {
    const du = Math.max(Math.abs((x - o.cx) * o.c + (z - o.cz) * o.s) - o.hx, 0);
    const dv = Math.max(Math.abs(-(x - o.cx) * o.s + (z - o.cz) * o.c) - o.hz, 0);
    return r3(Math.hypot(du, dv));
  }
  return r3(Math.hypot(Math.max(rect.minX - x, x - rect.maxX, 0), Math.max(rect.minZ - z, z - rect.maxZ, 0)));
}

/** Отметка верха настила в точке плана — линейно между его торцами (`a`, `b` из `roadCapsOf`). */
function deckTopAt(plan, x, z) {
  if (!plan.a || !plan.b) return plan.topLo;
  const dx = plan.b.x - plan.a.x, dz = plan.b.z - plan.a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - plan.a.x) * dx + (z - plan.a.z) * dz) / len2)) : 0;
  return r3(plan.a.top + (plan.b.top - plan.a.top) * t);
}

/** Прямоугольник, отпущенный во все стороны на `d` — допуск примыкания в плане. */
function grown(rect, d) {
  return { minX: rect.minX - d, maxX: rect.maxX + d, minZ: rect.minZ - d, maxZ: rect.maxZ + d };
}

/** Конец пластины в плане: полоса глубиной `depth` у той границы, к которой ближе точка. */
function endCap(rect, p, depth) {
  const alongX = rect.maxX - rect.minX >= rect.maxZ - rect.minZ;
  const lo = alongX ? p.x : p.z, min = alongX ? rect.minX : rect.minZ, max = alongX ? rect.maxX : rect.maxZ;
  const d = Math.min(depth, max - min);
  const [a0, a1] = Math.abs(lo - min) <= Math.abs(lo - max) ? [min, min + d] : [max - d, max];
  return alongX
    ? { minX: r3(a0), maxX: r3(a1), minZ: rect.minZ, maxZ: rect.maxZ }
    : { minX: rect.minX, maxX: rect.maxX, minZ: r3(a0), maxZ: r3(a1) };
}

/** Расстояние от точки до отрезка в плане (отрезок — по оси). */
function distToEdge(e, x, z) {
  const lo = e.axis === 'x' ? Math.min(e.x0, e.x1) : Math.min(e.z0, e.z1);
  const hi = e.axis === 'x' ? Math.max(e.x0, e.x1) : Math.max(e.z0, e.z1);
  const t = e.axis === 'x' ? x : z;
  const cross = e.axis === 'x' ? z : x;
  const fixed = e.axis === 'x' ? e.z0 : e.x0;
  return Math.hypot(Math.max(lo - t, 0, t - hi), Math.abs(cross - fixed));
}

/** Прямоугольник заданного размера вокруг точки (длина — по X, ширина — по Z). */
function rectAround(cx, cz, length, width) {
  return {
    minX: r3(cx - length / 2), maxX: r3(cx + length / 2),
    minZ: r3(cz - width / 2), maxZ: r3(cz + width / 2),
  };
}

/** Габарит полигона как rect. */
function boundsOf(poly) {
  const b = polyBounds(poly);
  return { minX: r3(b.minX), maxX: r3(b.maxX), minZ: r3(b.minZ), maxZ: r3(b.maxZ) };
}

/** Прямоугольник в текст ошибки — чтобы по координатам было видно, где именно. */
const fmtRect = r => `[${r3(r.minX)}…${r3(r.maxX)} × ${r3(r.minZ)}…${r3(r.maxZ)}]`;

export { ROOM_TYPES, ROAD_TYPES, STAIR_TYPES, LIGHT_TYPES, LINK_TYPES, cellKey };
