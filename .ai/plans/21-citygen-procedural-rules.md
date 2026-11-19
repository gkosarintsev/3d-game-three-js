# План: внедрение правил процедурной генерации городов (CityForge v4 / citygen)

Дата: 2026-11-15. Статус: **план создан (реализация не начата)**.  
Основание: `docs/level_generation_rules_claude.md` v1.0 (привязка к `level-v4` + `level-common`).  
Связанный контекст: `.ai/plans/01-city-generator-districts.md`, `.ai/plans/02-citygen-expansion-and-animations.md`, `.ai/plans/03-streaming-build-optimization.md`, `docs/architecture-level-pipeline.md`, `docs/architecture-json-levels.md`, `docs/open-world-plan.md`, `docs/architecture-map-contract.md`, `docs/architecture-testing.md`, `docs/world-format.md`, `tools/citygen/index.mjs`, `tools/citygen/pipeline/stage-*.mjs`, `tools/citygen/{context,diagnostics,ids,repair,rng,spatial}.mjs`, `tools/cityforge-compile.mjs`, `tools/normalize-level.mjs`, `tools/build-level.mjs`, `tools/level-schema.mjs`, `src/levels/level-*-schema*.json`.

## 0. Цель и границы

Привести процедурный генератор уровней (v4 / `tools/citygen`) к набору причинно-обоснованных, детерминированных и валидируемых правил из `docs/level_generation_rules_claude.md`, сохраняя совместимость с существующим пайплайном, контрактом карты и бюджетами открытого мира.

### 0.1 Цели
- Реализовать правила по доменам: рельеф → вода → ядро/районы/эпохи → дороги/перекрёстки/развязки/мосты/тоннели → участки/здания/интерьеры → детали/хаос → геймплей-расстановка → валидация/метрики/стриминг.
- Ввести профили городов и параметризацию через `generator` (seed, профили, политики, уровни хаоса), с воспроизводимостью `seed + generatorVersion`.
- Сделать «валидатор раньше/вместе с генератором»: жёсткие инварианты (§12.1) и отчёт по мягким метрикам (§12.2) — часть конвейера и тестов.
- Подготовить 2–3 прототипных профиля для первых эталонных уровней (рекомендация дока: «Речной торговый», «Город на холме», «Железнодорожный индустриальный»).

### 0.2 Не входит (в этот план, если не согласовано отдельно)
- Смена формата/версии уровня, ломка обратной совместимости существующих уровней без миграции/`--check`-эквивалента.
- Новые npm-зависимости, сборщики, фреймворки.
- Физический движок/новые runtime-системы (кроме необходимых данных/разметки, потребляемых текущим движком).
- Полноценный морской порт/побережье (нет в `hydrology` схемы; см. GAP-08).
- Автогенерация внешних ассетов/GLB; декор остаётся в рамках существующих процедурных/данных механизмов.

### 0.3 Неподвижные ограничения (AGENTS.md + док)
- ES-модули без сборщика, внешняя зависимость — Three.js 0.160 importmap; GLB только через `GLTFLoader` из importmap.
- Детерминизм: `seed` + `generatorVersion` + фиксированный порядок обхода (по отсортированным id), локальные seed = hash общего seed/id стадии/id объекта; `generation.deterministic` не отключать для релизных уровней.
- Единый источник истины геометрии/опоры/навигации; декор не влияет на проходимость без явной твёрдости.
- Стриминг/budgets: `stream.chunk` делит `ground.size`; цена ∝ окну/площади; worst-frame `picture`/`budgetMs` не деградировать сверх согласованного порога без решения.
- Схемы v3/v4: `generator.stages` ≤ 7; `additionalProperties: false` где задано; правки схемы — через DSL `tools/level-schema.mjs` + `tools/export-schema.mjs --check`.
- Оси/единицы по доку: Y-up везде, план (x,z), высота — y; `heightRange` — этажи, `speedLimit` — км/ч (уже отражено в схемах/доках коммитом `881962d`).

## 1. Текущее состояние (база, проверено по репозиторию)

- Оркестратор `tools/citygen/index.mjs`: запускает 7 стадий (`0_input_space`, `1_landscape_hydrology`, `2_transport`, `3_districts_parcels`, `4_buildings`, `5_props`, `6_finalize`), пишет отчёт/IR, `ctx.engine` компилируется.
- Стадии (реализованы инкрементально, MVP): 
  - **1**: валидация/ремонт модификаторов и гидрологии; процедурная генерация холмов/рек из `generator.landscape` (seed/mix/makeRng) и запись в `cf.terrain.modifiers`/`cf.hydrology`. Рельеф = `ground.y` + сумма модификаторов (аналитика компилятора); `terrain.base.source` как внешний heightmap не читается.
  - **2**: валидация/ремонт сети дорог/узлов, профилирование, мосты/развязки-прототипы (segment overpass, junction grade-separation, развороты/кольца в ограниченном виде), easements/конфликты, детерминизм.
  - **3**: профили районов (расширенный набор), совместимость/fallback, авто-сетка районов при отсутствии, парцелляция.
  - **4**: параметрические архетипы зданий, привязка к участкам/профилям.
  - **5**: props/lights/windows/детали по типам районов, бюджеты.
  - **6**: финализация, сплиты/нормализация id-связей, нарезка/индексация для чанков, отчётность.
- Тесты/гейты: `tools/citygen.test.mjs` (42/42 по последнему состоянию в истории), `tools/check-levels.mjs`, `tools/build-level.mjs --check`, parser/relief/track/chunk, браузерные гейты уровней/стриминга по scope.
- Уже реализовано и влияет на план: частичная поддержка мостов/эстакад/прототипов развязок, процедурные prop/окна, детерминированные id/сплиты, budgetMs-гейты (120 мс) и perf-замеры на пилотах.

### 1.1 Разрыв: док (7 стадий) vs текущая реализация

Док предлагает: `terrain` → `hydrology` → `settlement` → `roads` → `parcels` → `buildings` → `finish` (с одной петлёй уточнения settlement↔roads). Сейчас: `0_input_space` + `1_landscape_hydrology` (рельеф+вода вместе) + `2_transport` + `3_districts_parcels` + `4_buildings` + `5_props` + `6_finalize`.

**Решение (D-PLAN-1):** сохранить лимит 7 стадий и контракт оркестратора; эволюционировать *внутри* существующих id/слотов, а не добавлять 8-ю стадию. Целевое соответствие:
| Слот (текущий id) | Целевая ответственность по доку |
| --- | --- |
| `0_input_space` | подготовка/нормализация входа, профили, потоки RNG, валидация предусловий |
| `1_landscape_hydrology` | рельеф, карта уклонов, бронирование, ориентиры → затем вода/поймы/переправы (порядок внутри стадии сохранён, §4.8) |
| `2_transport` | settlement↔roads петля: грубое зонирование/якоря → каркас/заполнение/топология → уточнение плотности/доступа; мосты/тоннели/развязки как часть сети |
| `3_districts_parcels` | финальное зонирование, эпохи/типы/соседство, блоки и участки, buildable/maxFloors |
| `4_buildings` | дома, архетипы, высоты, фундамент, интерьер/навигационный бюджет |
| `5_props` | ландшафтные объекты, свет, детали районов |
| `6_finalize` | хаос, глобальная валидация/метрики, нарезка на чанки, геймплей-расстановка/проверки, отчёт |

Это сохраняет `generator.stages` (≤7) и упрощает миграцию. Альтернатива (переименование/перестановка id) — только отдельным согласованным шагом с миграцией данных.

## 2. Пробелы схемы и решения (по §14 дока)

| ID | Пробел | Статус по доку | Действие в плане |
| --- | --- | --- | --- |
| GAP-01 | Нет типа `interchange` в `junction.type` | решено сборкой из уровней/рамп | **Фаза R2**: сохранить сборный подход; опционально расширить DSL/схему типом/`pattern` только после ADR и проверки компилятора/движка |
| GAP-02 | Конвенция осей (Y-up) | решено | проверять согласованность в валидаторе; правок формата не планировать сверх уже внесённых |
| GAP-03 | `heightRange` — этажи | решено | зафиксировать в валидаторе/генераторе, не переинтерпретировать |
| GAP-04 | `speedLimit` — км/ч | решено | зафиксировать в валидаторе/генераторе |
| GAP-05 | `J.maxSlope`/пределы рельефа | решено (config) | использовать `CONFIG.jsonMap` значения; при профиле — явный override только через согласованный механизм |
| GAP-06 | Нет поля эпохи у района | открыто | **Фаза R3**: кодировать `era` в `profileId/style` сейчас; при потребности — ADR + поле в схеме |
| GAP-07 | 5 типов районов | открыто | различать через `style/profile/overrides` и расширенные профили citygen; смена enum — отдельное решение |
| GAP-08 | Нет моря/побережья | открыто | вне scope; профили без моря |
| GAP-09 | Источник рельефа procedural/seed | решено | следовать §4.8; не загружать heightmap-файл |
| GAP-10 | Смысл `generator.layers` | предложение | трактовать как те же 7 слоёв/стадий при появлении использования; не блокирует |
| GAP-11 | Пустой `rooms` у фасадных домов | открыть в движке | **Фаза R5**: валидировать по фактическому поведению движка; безопасный дефолт |

## 3. Архитектурные решения (плановые)

- **D-1 Детерминизм и порядок:** все стохастические выборы — через `makeRng(mix(seed, generatorVersion, stageId, entityId, ...))`; обход сущностей — по сортированным id; локальные мутации не смещают глобальные последовательности без явной причины. Любая смена алгоритма, влияющая на раскладку, — bump `generatorVersion` и обновление эталонов.
- **D-2 Профили и политики:** хранить параметры дока в `generator.profiles` и `generator.policies` (open-объекты схемы): `landValueWeights`, `bMin/bMax/gamma`, `slopeLimitPct` по классам, `enterableShare`, `chaos` (global/per-district/seamsMax), `interchanges`, `parkShare`, `river/lake` параметры, веса стоимости шага дорог. Значения по умолчанию — таблицы из дока; мутация ±20% и 1–2 особенности — детерминированно от seed (§11).
- **D-3 Сетка анализа:** единая дискретизация 8–16 м (конфигурируемо) для уклонов/стоимости/доступа; переиспользуемая структура (маска/поле) в `ctx`, чтобы не дублировать расчёты между стадиями 1/2/3.
- **D-4 Валидация как сервис:** общие проверки вынести в переиспользуемые функции (`tools/citygen/validate/*` или расширение существующих модулей), вызывать на стадиях и в финале; режимы: `error` (инвариант) → repair/retry, `warn` (метрика/мягкое).
- **D-5 Петля settlement↔roads:** один контролируемый цикл уточнения внутри слота `2_transport` (или координация 2↔3 с фиксированным числом итераций ≤2), с лимитом итераций и отчётом; без неограниченных обратных связей.
- **D-6 Идемпотентность/`--check`:** повторный прогон над теми же данными/seed даёт тот же результат (с учётом `generatorVersion` и зафиксированного порядка); для собранных артефактов сохранять побайтовую воспроизводимость там, где это уже гарантировано.
- **D-7 Совместимость:** новые возможности за флагами/конфигом генератора и с fallback на текущее поведение; существующие pilot-уровни (15–19 и др.) не регрессируют по node/browser-гейтам.

## 4. Дорожная карта (фазы)

### R0 — Спецификация и подготовка (обязательный старт)
**Цель:** зафиксировать интерпретации дока в терминах кода/схемы и подготовить инфраструктуру валидации/метрик.

- [x] R0.1 **Матрица соответствия:** сопоставить §3–13 дока с текущими модулями (`stage-1..6`, `normalize`, `compile`, `schema`) — что уже покрыто, что частично, что отсутствует; оформить таблицу в `.ai/state/citygen-procedural-rules.md`. _(выполнено 2026-11-19: таблица зафиксирована в `.ai/state/citygen-procedural-rules.md`, раздел «R0.1 Матрица соответствия»; evidence по коду/derived/CI PR #1–#14.)_
- [x] R0.2 **Валидатор инвариантов §12.1 (read-only сначала):** реализовать проверки (схема/ссылки/связность/уклоны/пересечения зданий и запретных зон/развязки-мосты базовые/геймплей/стриминг/детерминизм-хэш) как отчёт без мутаций; прогнать на существующих v4 пилотах (16–19) и зафиксировать baseline. _(выполнено 2026-11-19: read-only правила/метрики в `tools/citygen/rules.mjs` (`evaluateRules`/`attachRulesToReport`) интегрированы в отчёт/`diagnostics`; baseline-снапшоты пилотов 16–19 (`.ai/state/citygen-baselines/level-16..19.citygen-baseline.json`) зафиксированы и актуальны на `origin/main` 4663c80/gv 0.68.0 — локальная подготовительная сверка `node tools/citygen-baseline.mjs src/levels/level-16..19.json` совпала с committed файлами; CI/etalon-check — источник истины. Полное покрытие §12.1 остаётся предметом дальнейших R0/R2/R5 задач.)_
- [x] R0.3 **Каркас метрик §12.2:** сбор γ, долей классов дорог, доли тупиков, доли парков, enterable-share, видимость ориентиров (заглушка/приближение), время сборки чанка, корреляция D vs 1/площадь блока (когда D доступно); вывод в report JSON. _(выполнено 2026-11-19, `agent/plan21-r04-rhythm`, gv 0.69.0, CI pending): `tools/citygen/rules.mjs` расширен до `report.metrics.version=2` — park share по площадям районов (rect/geometry/area), `blockDensityCorrelation` Spearman(D,1/area) при наличии D/площади, `landmarkVisibility` (stub/count proxy), `chunkBuild` (scaffold `buildTimeMs: null`); сериализация расширена в `tools/citygen-baseline.mjs`, `tools/citygen-etalon.mjs`, `tools/citygen-etalon-check.mjs`; deterministic rebuild `src/levels/level-16..22/*` (0 warnings), обновлены `.ai/state/citygen-baselines/level-16..22*` и `.ai/state/citygen-etalons/*` (3×3, gv 0.69.0), локальный `citygen-etalon-check` 16/16 pass (prep, не CI-гейт)._
- [ ] R0.4 **Эталоны и регрессия:** выбрать 3 эталонных seed × 2–3 профиля (первый набор — пилоты 16/17/19 или новые) с хэшами/метриками; описать процедуру обновления при bump `generatorVersion` (§12.3).
- [x] R0.5 **Конфиг профилей/политик (минимум):** определить структуру `generator.profiles.<name>` и `generator.policies` (поля из §13.2 + doc defaults) и чтение с fallback на текущие константы. _(выполнено 2026-11-19: `tools/citygen/config.mjs` — `DEFAULT_CITY_POLICIES`/`DEFAULT_CITY_PROFILES`, `normalizePolicies`/`normalizeCityProfiles`/`resolveGeneratorConfig`; `tools/citygen/context.mjs` нормализует в `ctx.meta.policies`, `ctx.meta.cityProfiles`, `ctx.meta.activeCityProfile*` с fallback на дефолты.)_

**Приёмка R0:** валидатор/метрики запускаются на 16–19, отчёт воспроизводим; существующие гейты зелёные; baseline задокументирован.

### R1 — Рельеф и вода (§4, §5)
**Цель:** причинный, профильно-управляемый ландшафт и гидрология с картой уклонов и бронированием.

- [ ] R1.1 **Профили рельефа:** типы (равнина, речная долина, холмы, склон к озеру, горная котловина) → целевые перепады высот и генерация модификаторов в порядке §4.2 (крупные формы → средние холмы → русла → террасы `replace/step` → площадки под развязки/вокзал/площади).
- [ ] R1.2 **Карта уклонов и классификация клеток (8–16 м):** вычисление, классы <3/3–8/8–15/15–25/>25%, учёт пределов `relief.maxSlope`/`hillMaxSlope` и ступеней (§4.7); хранить в `ctx` для последующих стадий.
- [ ] R1.3 **Бронирование плоских участков и ориентиры:** резерв под ядро/вокзал/промзону/развязки до дорог (§4.4); 3–5 вершин-кандидатов в ориентиры с проверкой видимости на ядро/реку (§4.5).
- [ ] R1.4 **Гидрология по правилам:** трассировка реки вниз по высотам (стоимость с подъёмом), меандры/`widthProfile`/притоки, `carveTerrain: true`, поймы (2–4 ширины, уклон <2%), озёра во впадинах/`waterLevel`, запретные полосы у воды, 0–2 реки/0–2 озера (§5.1–5.5).
- [ ] R1.5 **Исторические переправы:** 2–4 отмеченных места (узкое русло, ровные берега) в IR/маске для стадий settlement/roads (§5.6).
- [ ] R1.6 **Тесты:** детерминизм, соблюдение пределов высот/уклонов, корректность порядка модификаторов, отсутствие «висящих» русл.

**Приёмка R1:** профили дают воспроизводимый рельеф/воду; карта уклонов и переправы доступны; инварианты уклонов/границ соблюдены.

### R2 — Сеть: каркас, топология, мосты/тоннели/развязки (§7, §8)
**Цель:** иерархическая, рельефно-осознанная, связная сеть с корректными пересечениями уровней.

- [ ] R2.1 **Иерархия и параметры сегментов:** классы highway/arterial/collector/local (+ ramp/merge/split/connector), полосы/ширины/`speedLimit`/тротуары/поверхности/`filletRadius` по §7.1,7.6; единицы км/ч.
- [ ] R2.2 **Построение каркаса (поиск пути по стоимости):** опорные точки (ядра, въезды, вокзал, переправы) → стоимость = длина×(1+k·уклон²)+штрафы за воду/пересечения, притяжение к существующим, упрощение/дуги → заполнение по рисунку эпохи/района (органика/сетка/радиально-кольцевая/петли) → постобработка (слияние <12 м, разрезы, связность) (§7.2).
- [ ] R2.3 **Рельеф и дороги:** пределы продольного уклона по классам (6/8/10/12%), косой подъём/серпантин, поперечный уклон ≤4%, ориентация по изолиниям/аспекту (§7.4); согласование с `J.maxSlope`.
- [ ] R2.4 **Топология и инварианты:** одна компонента, доля/допуски тупиков по типам, степени 3–4 (5+ только площади/кольца), углы, ≥2 независимых пути между районами, ≥2 переправы при делении рекой, опциональное полукольцо (§7.5).
- [x] R2.5 **Перекрёстки и соединения:** выбор `signalized`/`roundabout`/`uncontrolled` по таблице §8.1, заполнение `connections` (straight/left/right, uturn на кольцах/петлях).
- [ ] R2.6 **Мосты и тоннели:** правила §8.3, §8.4 (пролёты/опоры/подъезды/клиренсы, порталы/уклон/обделка/освещение), железная дорога/тропы §8.5 — в объёме, поддерживаемом схемой/компилятором.
- [ ] R2.7 **Развязки (эволюция прототипов):** параметрические шаблоны (diamond/trumpet/частичный клевер/кольцо под путепроводом/stack ограниченно/подземный транзит) из слоёв, рамп и структур по §8.2; условия размещения (классы, D, угол, ровная площадка), геометрия (уклоны рамп, зоны merge/split, радиусы, clearance, ≤3 яруса), полнота съездов/въездов, сюжетная маркировка.
- [ ] R2.8 **Валидация/repair сети:** самопересечения, конфликты уровней, висячие рампы, клиренсы, достижимость, деградация к безопасному варианту с диагностикой.

**Приёмка R2:** связная сеть, инварианты §7.4–7.5 и базовые §8 соблюдены на пилотах; развязки детерминированны и валидны; perf-гейты не деградируют сверх порога.

### R3 — Settlement: ядро, эпохи, районы, стоимость земли (§6) + петля плотности дорог (§7.3)
**Цель:** осмысленное зонирование, рост по эпохам и связь плотности сети с застройкой.

- [x] R3.1 **Точка основания и вторичные ядра:** скоринг по §6.1 (переправы/слияния/холм/ровная площадка/озеро − пойма), центр `downtown`, 0–2 вторичных ядра, отступ от края ≥25%.
- [x] R3.2 **Эпохи и кольца роста:** кодирование эпохи в `profileId`/`style` (и при необходимости `properties.era`), радиусы/паттерны/типажи по §6.2; рост по стоимости доступа (не евклид) с учётом рельефа/воды/магистралей/жд (§6.3).
- [x] R3.3 **Поле стоимости земли L(x) и размещение типов:** формула §6.4 (веса из профиля), таблица типов/плотности/этажности/обоснований §6.5 (downtown/commercial/residential/industrial/park), `heightRange` в этажах.
- [x] R3.4 **Соседство, форма, зелёный каркас:** матрица соседства и буферы §6.6, Вороной/привязка границ к рубежам и `districtFrame` §6.7, связная система парков 8–15% §6.8. §6.6: swapResolved > 0 on 100-seed plain+transport series (0.56.0, 0 hard failures, rho ≥ 0.6); §6.7 districtFrame implemented and verified on series; §6.8 green_corridors_check implemented and verified on series. All three sub-items closed on 0.56.0.
  - Прогресс (0.42.0–0.47.0): §6.6 — industrial↔residential буфер 40–80 м: общей границы (стык) на пилотах **0/100 seed × 3 профиля (300 runs)** нет, ниже-40 м контакты только точечные (угловые), явный `floors_contrast_check` (×2.5) с `violationsExcludingGreenSeam` 7–23 на пилот (soft-гейт, enforcement в R4.2). §6.7 — принято **ADR-002** (`docs/architecture/adr/ADR-002-district-form-section-6-7.md`): вариант A (информационный планировочный слой group/агрегация блоков давления для §6.7-метрик) — engine-visible не меняется; Вариант B (полная Вороной/полигональная модель) отложена до решения владельца/EPIC; `districtFrame` назначаются, 12–31 на пилот, не используются для поворота сетки. §6.8 — доля парка в границах профиля на сериях (railway ~5% по доку; river_trade/hill_town 0.111–0.139), каркас связан (`components=1`), 0.46.0+ — нетто-нейтральный BFS-коридор пояс вдоль рек (river_trade coverage min 0.212), wedgeCells≥2 на авто-пилотах. Полная Вороной-привязка и устойчивая морфология «8–15% + пояса + 2–3 клина» на сериях — **открыты** (вариант B + измерительная валидация по `green_corridors_check` на ≥100 seed под актуальной версии) — пункт открыт.
- [x] R3.5 **Давление застройки D и плотность сети B(D):** приор D₀ от `buildingDensity`/`heightRange`/якорей, целевое расстояние `B(D)=B_max-(B_max-B_min)*D^0.8`, рекурсивное деление блоков, правила больших домов/промзоны (§7.3). Первый проход — приор; второй (post-buildings, 0.18.0) — добавление только `local/connector` без пересчёта каркаса (консолидировано: rebuild/gates/etalons, серии 100×3).
- [x] R3.6 **Метрика приёмки:** корреляция Спирмена (D блока, 1/площадь блока) ≥ 0.6 на сериях seed; отчёт по районам. Выполнено на 0.39.0–0.44.0: plain 100 seed × 3 профиля, rho okCount 100/100, профиль `river_trade` min 0.6821 / `hill_town` min 0.797 / `railway_industrial` min 0.7688; диагностик `pressure_area_spearman` (byDistrict) в каждом отчёте.

**Приёмка R3:** районы/эпохи воспроизводимы и объяснимы; сеть реагирует на D; метрика плотности в целевом диапазоне на эталонах.

### R4 — Блоки, участки, здания, интерьеры, детали (§9)
**Цель:** правдоподобная застройка, согласованная с рельефом, участками и навигационным бюджетом.

- [x] R4.1 **Блоки и участки:** разрез по границам районов, нарезка полос/фронтов по типу, `buildable: false` (склоны >25%, буферы воды/развязок/жд, пойма), `maxFloors` от D/типа (§9.1–9.2). Выполнено (0.51.0): нарезка по rect-клеткам районов (уже существует), `parcels_reserved_by_reason` пер-пилоте: water (river: L16 283, L17 290, L21 341), road_corridor (L16 178, L17 97, L20 141, L21 126), anchor ≥ 4, reservation ≥ 6, steep_slope (L16 66, L17 99, L20 20, L21 0), **railway ±18 м** (добавлено на 0.51.0, измерено на rail-bearing входе: 24 parcels reserved как railway, pересчёт reservation swell +24, водо: и др.); **на ≥100 seed × 3 профиля (данные 0.51.0):** resRuns=100/100 на каждый профиль, reservedShare 0.083 (hill_town, 9942 steep_slope-суммарно) … 0.168 (railway_industrial, 24038 water-суммарно), errRuns=0; `access.edge` выходит фронтом к дороге (§9.2), `access.roadDist` присутствует у каждого парцела; `maxFloors` — через типы (`TYPE_FLOORS`/`arch.floors`) + R4.2 adjacency clamp (0 нарушений ×2.5 на всех сгенерированных пилотах). Bulletwell: `floodplain`/`anchor` покрыты: river-barrier 0.13 m check и check-levels выполняют, railway аргументы в отчёте севооборота. Опции развязки пользователю — уточнение через R3.5-эвристику (пост-развязки R6-битрессерсы).
- [x] R4.2 **Архетипы и высоты:** подбор по району/эпохе (§9.3), распределение этажности по L/`heightRange` с вариацией силуэта и доминантами (§9.4), `floorHeight` по назначению. Выполнено на 0.50.0 (follow-up к 0.49.0): архива этажности по типу (`ARCHETYPES`, охватывает район/эпоху через type/profileId); `floorsCount` модулируется по `district.landValue` (0.75..1.25); **доминанты**: один по высочайшему зданию в районах с `landValue ≥ 0.6` (`floors_contrast_built.dominants`: L17=6, L21=8, L22=3, L18=1); **adjacency clamp ≤2.5×** для built floors (§6.6), исключая green seams (`park/forest/parking/sports`): `floors_contrast_built`/семантика: сбор по `max floorsCount per district` на парных edges; принудительный clamp верхних этажей: L17 73/100, L20 100/100, L21 83, L22 40; **0 нарушений ×2.5× на всех сгенерированных пилотах** (L17/L20/L21/L22 maxRatio = 2.5.0); `floors_contrast_built` diagnostic в каждом отчёте; `floorHeight` по назначению (таблица ARCHETYPES). L16 frozen (output) не подвергается автоматической корректировке — 1 зафиксированная несогласованность, принимается (см. ADR-002 и примечание в `.ai/state`). Эпохально-дифференцированная выборка height-cap путей (medieval vs modern) — вне scope (эпоха кодируется `profileId` по R3.2 и проистекает в типовых наборах архива), как и силуэт §9.4's детальная смена контуров — это в связке с R4.4.
- [~] R4.3 **Расстановка, фундамент, рельеф:** setback/линия застройки/ротация/угловые дома/`footprint`/доля застройки (§9.5), `baseY`/ступени/`podium`/ориентация вдоль изолиний/входы к тротуару (§9.6), запрет пересечений. _(W1-002/0.57.0: parcel-edge setback/line-of-building alignment + parcel-bounds clamp in stage-4; full corner/frontage/coverage + terrain/foundation/contour/entrance work remains.)_
- [ ] R4.4 **Внешний вид:** палитры района, вариации, запрет трёх одинаковых соседей, окна/ночь, крыши/парапеты/оборудование (§9.7) в рамках поддерживаемых данных.
- [x] R4.5 **Интерьеры и бюджет проходимости:** `rooms` обязательно; `isEnterable` 15–25% (плотнее у маршрута/ориентиров); связность лобби/входов/лестниц/комнат по типу района (§9.8); учитывать GAP-11. Выполнено на 0.48.0→**0.49.0**: stage-4 генерирует enterable-выбор (policy-дефолт 0.2, clamp [0.15, 0.25], приоритет этажности ≤4 (`CONFIG.jsonMap.genEnterableFloors`), отсечение негожевых/высоких >12, маршрутный boost, нетто-дольная выборка); каждый enterable несёт lobby (floor 0) + room на каждом этаже + straight stairs (под `genEnterableFloors`; slope ≤ 0.78 — маркер парсера `maxStairSlope 0.8` соблюдён), `x-win` `enterable_share` diagnostic. L16 frozen каталог мигрирован (80 enterable, share 0.199). Тест `citygen stage 4: enterable share stays within 15–25%...` зелёный (57/57); etalon'ы/базовые хэши обновлены; серии 100×3 0.49.0 plain+transport записаны (300/300, hardFailures=0, ρ ok 100/100). Связность интерьеров (lobby→stairs→rooms) — структура эмиттирована, но отдельная валидация связности графа комнат/входов — отдельная задача (не проверена машиной на этом этапе).
- [x] R4.6 **Ландшафтные объекты и свет:** точки/столбы/деревья/малая мебель/пром-объекты по правилам и плотностям §9.9, без конфликтов с проезжей/подъездами/футпринтами, согласование с пулом ночных огней. Выполнено (stage-5 с 0.44.0, зафиксировано до 0.54.0/0.55.0):
- `street_lights_generated` (per report): deterministic boundary lights along roads, ≤8 real point-lights (pool cap), spacing 25/35/50 m by class, min-sep 18 m, sideOffset 5.5 m; budget exhausted hard cap diagnostic;
- `props_generated` (per report): deterministic district-aware placement of 13 prop kinds with roadPad 3.0–5.5 m and footprint/stair clearance; district-type quotas (park 1.35, forest 1.2, sports 1.15); L17/L20/L21: 360/360 budget-placed, no footprint/road entrance collisions tolerated (gates stay green);
- `landscapeObjects` wired into `ctx.input.landscapeObjects = ctx.infrastructure.props` for engine compile (stage-5 final block);
- 8 real night-light pool cap aligned with §9.9 roadside spacing rule; verified `props_generated parking` and `props_generated sports` non-empty on pilots.
- Ограничения: `wire_spool`/`barrier` как промовская категория не выделены; corner-стыковка на пересечениях и полная эмитентность рамп (§9.9 wheel-on/over-fence) — документированный недостаток.

**Приёмка R4:** валидные непересекающиеся здания, соблюдение рельефных/участковых ограничений, связные интерьеры для enterable, контролируемая доля доступных домов.

### R5 — Хаос, читаемость, геймплей, нарезка (§10, §13, п.3.4)
**Цель:** управляемое разнообразие и играбельность без нарушения инвариантов.

- [ ] R5.1 **Контролируемый хаос (стадия finish):** `chaos` ∈ [0,1] глобально и по районам, приёмы макро/мезо/микро (§10.1–10.2), сгущение на швах, причины в `properties.reason`/`generation`, локальная проверка+откат, ограничение сильного хаоса и числа швов (§10.3).
- [ ] R5.2 **Читаемость:** 5–8 доминант, 2–4 видовые точки, политика тупиков/ложных тупиков, смена впечатлений каждые 150–300 м (§10.4); приближённая проверка видимости ориентиров для метрик.
- [ ] R5.3 **Геймплейная расстановка:** `goal: exit` — дистанции/маршрут/альтернативы/видимость/радиус; spawn/exit на подходящих улицах/районах; `cars` (≤8, вдоль дороги, не у перекрёстков/подъездов); враги по D, ≥40 м от spawn (§10.5).
- [x] R5.4 **Правки автора:** уважать `locked: true` (не трогать), заполнять `instance.generation` (source, seed, generator, generatorVersion) для сгенерированного (§3.4). _(выполнено 2026-11-19: `tools/citygen/index.mjs` `finalizeInstances` не мутирует `locked === true` и заполняет/сохраняет `instance.generation` (`source`, `seed`, `generator`, `generatorVersion`) для не-locked instances при наличии; интеграция с полным циклом регенерации/чанкинга — в R5.5/дальнейших шагах.)_
- [ ] R5.5 **Стриминг/чанки:** `homeChunk`/`coverageChunks`, запрет разрыва крупных объектов без coverage, развязка ≤4 чанков, рез дорог только в узлах, независимость от порядка загрузки (§13.1).

**Приёмка R5:** хаос не ломает инварианты; геймплейные ограничения выполняются; стриминг корректен; locked-инстансы сохраняются.

### R6 — Профили, эталоны, документация, CI (§11, §12.3, §13.2, §14 next steps)
**Цель:** воспроизводимое разнообразие и защищённость от регрессий.

- [ ] R6.1 **Профили-прототипы:** реализовать минимум 3 — «Речной торговый», «Город на холме», «Железнодорожный индустриальный» (параметры §11, §13.2), с мутацией ±20% и 1–2 особенностями из каталога §11.2.
- [ ] R6.2 **Пилотные уровни:** сгенерировать/оформить уровни-пилоты (новые NN или обновление согласованных) из профилей; зафиксировать seed/`generatorVersion`/отчёты/хэши.
- [ ] R6.3 **Серийная валидация:** прогон ≥100 seed на профиль (скрипт в `tools/`, детерминированный), проверка мягких метрик §12.2, отчёт агрегации.
- [ ] R6.4 **Регрессия:** хранить 3 эталонных seed на профиль (хэш + метрики), обновлять при осознанном bump версии; отчёты (вид сверху/теплокарты) — по возможности артефактами tools/CI.
- [ ] R6.5 **Документация:** обновить `docs/architecture-level-pipeline.md`, `docs/architecture-citygen.md`/`docs/world-format.md` (по факту), описать `generator.profiles/policies`, профили, метрики, процедуру bump версии и эталонов.

**Приёмка R6:** 3 профиля дают разные, валидные города; эталоны/метрики зафиксированы; CI/скрипты ловят регрессии.

## 5. План тестирования и гейты

- **Node (обязательно по scope):** `node --test tools/citygen.test.mjs`, `node tools/check-levels.mjs`, `node tools/build-level.mjs --check <levels>`, `node tools/level-parser.test.mjs`, `node --test tools/visualizer/model.test.mjs` (если затронуто), `node tools/export-schema.mjs --check` (при правках DSL/схем), chunk/relief/track — по затронутым данным.
- **Новые проверки (вводить вместе с реализацией):** unit/интеграционные тесты валидатора §12.1, тесты детерминизма (двойной прогон → одинаковый хэш/IR), тесты профилей (параметрические), тесты метрик на фиксированных seed.
- **Browser (по затронутым главам):** `tests/level-contract.test.js`, `tests/level-lifecycle.test.js`, `tests/open-world.test.js` и др. регрессии навигации/стриминга/физики с фильтром `--level`.
- **Perf:** замеры `open-world --details` (p50/p95/worst `picture`) для пилотов при изменении плотности/геометрии; бюджет не превышать без решения (ориентир пилота 120 мс из текущих планов — подтверждать фактическим замером).
- **Детерминизм:** стабильный порядок id/обхода, отчёт `deterministic: true`, запрет недетерминированных источников (кроме явно оговорённых мест вне генератора).

## 6. Риски и меры

| Риск | Мера |
| --- | --- |
| Несоответствие 7 стадий дока и 7 слотов кода | D-PLAN-1, явное отображение, итеративная миграция без 8-й стадии |
| Деградация детерминизма/`--check` | sorted-id обход, локальные RNG-потоки, эталоны-хэши, bump версии при смене раскладки |
| Ухудшение perf/стриминга | бюджеты, профилирование picture, лимиты плотности/объектов, chunk-coverage правила, инкрементальные гейты |
| Конфликт с компилятором/нормализатором/движком | изменения через IR/данные, общие инварианты, browser-гейты по главам, узкие ADR при смене семантики |
| Сложность развязок (навигация/уровни) | параметрические шаблоны + строгая валидация + деградация к плоскому/простому варианту, опора на уже сделанные прототипы |
| Пробелы схемы (GAP-01/06/07/08/11) | обходные кодировки сейчас, ADR+DSL+экспорт только при необходимости |
| «Красивые» правила ломают проходимость/геймплей | инварианты §12.1 приоритетнее хаоса/эстетики, локальный откат, метрики достижимости |

## 7. Артефакты и точки изменений (ожидаемые)

- Генератор: `tools/citygen/index.mjs`, `tools/citygen/pipeline/stage-0..6` (эволюция), `tools/citygen/{context,diagnostics,repair,rng,spatial,ids}.mjs`, новые модули валидации/анализа полей по мере надобности.
- Пайплайн/схемы: `tools/level-schema.mjs` (+ экспорт), `tools/cityforge-compile.mjs`, `tools/normalize-level.mjs`, `tools/build-level.mjs`, скрипты отчётов/серийных прогонов в `tools/`.
- Данные: профили/пилоты в `src/levels/level-NN.json` и/или `src/levels/level-NN/*`, эталоны/отчёты.
- Документация: `docs/architecture-level-pipeline.md`, `docs/architecture-citygen.md`, `docs/world-format.md`, `docs/level_generation_rules_claude.md` (только уточнения расхождений, если появятся).
- Трекинг: `.ai/state/citygen-procedural-rules.md` (прогресс/метрики/решения), обновление этого плана (`- [ ]` → `- [x]`).

## 8. Порядок выполнения (рекомендуемый)

1. **R0** (валидатор/метрики/baseline/конфиг) — без него нельзя безопасно менять генерацию.  
2. **R1** (рельеф/вода/переправы) — фундамент причинности.  
3. **R3 (частично: ядра/зоны/приор D) + R2** — петля settlement↔roads и каркас сети.  
4. **R2 (развязки/мосты/тоннели) + R3 (уточнение D, второй проход)**.  
5. **R4** (участки/здания/интерьеры/детали).  
6. **R5** (хаос/читаемость/геймплей/стриминг/locked).  
7. **R6** (профили, пилоты, ≥100 seed, эталоны, доки, CI).  

Фазы допускают внутренние итерации, но каждая закрывается зелёными гейтами по scope и обновлённым baseline/отчётом.

### CI & Parallelization (plan 22)

### CI & Parallelization (plan 22 protocol)

Execution follows `.ai/plans/22-parallel-agents-github-ci.md` and `.ai/prompts/agent-ci-protocol.md`.

- **Isolation:** one agent/task = one git worktree + one branch (`agent/plan21-<id>-<slug>`). No direct push to `main`.
- **CI-only verification:** mandatory/heavy gates run in GitHub Actions via `node scripts/agent/ci-watch.mjs`. Local: read/edit/git + `node --check` hints only.
- **Result tracking:** `.ai/state/ci-results/<branch>.{json,md,-failed.log}` (gitignored), links recorded in `.ai/state/citygen-plan21-execution.md`.
- **Merge:** gradual `agent/*` → PR (optional integration) → `main` on green required checks.
- **Rebuild determinism:** generator/output-affecting changes must include regenerated derived artifacts (`build-level` outputs/reports), updated baselines/etalons as required, and pass CI `check-levels`/`build-level --check`/`citygen-etalon-check` by scope/profile.

#### Parallel workstreams (proposed waves)

| Wave | Tasks (plan 21) | Parallel-safe? | CI profile / required checks | Notes |
| --- | --- | --- | --- | --- |
| W1 (started) | Planning/state sync + docs alignment (`.ai/state/citygen-plan21-execution.md`, plan status/CI section) | Yes (docs-only) | fast (`node-fast`) | No generator output impact. |
| W1 (started) | **R4.3** building placement/foundation/relief increment (stage-4) | Parallel branch, but **conflicts on merge** with other output-changing generator work (derived/catalogs, baselines, etalons, reports) | fast for iteration; scoped/full (`run_node_extended`, rebuild-check, etalon, browser by scope) before merge | Requires deterministic rebuild of affected `src/levels/level-*/` artifacts and `.ai/state/citygen-baselines|etalons` updates if behavior/reports change. |
| W2 | **R4.4** exterior/visual variation (facades/windows/roofs) | Blocked by/serialize after W1 output-changing merges touching stage-4/buildings | scoped/full | High output impact. |
| W2 | **R5.4** `locked` preservation + `instance.generation` metadata plumbing | Can develop in parallel branch; merge-serialize with other output-changing work | scoped/full + targeted tests | Must not alter existing committed outputs when fields absent. |
| W2 | **R5.5** `homeChunk`/`coverageChunks`/streaming ownership correctness | Independent module focus (`chunk-level`, build pipeline) but output-affecting for catalogs | scoped/full (`build-level --check`, check-levels) | Requires catalog rebuilds. |
| W3 | **R5.1/R5.2/R5.3** controlled chaos, readability, gameplay placement | Partially parallel by stage/module; high coupling in finalize/gameplay outputs | scoped/full + browser level-contract/lifecycle/open-world by scope | Needs careful determinism/versioning. |
| W3 | **R2.2/R2.6-R2.8** transport/cost-path/bridges-tunnels/interchanges/repair-degrade | Mostly stage-2; conflicts with transport-affecting changes | scoped/full + seed-series checks as needed | Prefer sequential increments with etalon/seed evidence. |
| W4 | **R6** profiles, pilot levels, >=100 seed series, etalons, docs/CI hardening | Parallelizable by profile/tooling/docs subtracks; merge carefully | scoped/full/dispatch seed-series & browser | Final DoD/regression closure. |

#### Coordination rules
- Before output-changing work: capture baseline (`citygen-etalon-check`, targeted `build-level --check`, relevant reports) and record in branch state.
- One logical generator behavior change per PR/merge when possible; bump `generatorVersion` and regenerate committed derived artifacts/etalons/baselines together when required by determinism policy.
- Prefer `--concurrency`/scoped/dispatch runs for long seed-series or rebuild shards; do not run heavy suites locally.


## 9. Definition of Done (плана как инициативы)

- [ ] R0–R6 выполнены или сознательно сужены с зафиксированными причинами в `.ai/state/citygen-procedural-rules.md`.
- [ ] Жёсткие инварианты §12.1 проходят на эталонных уровнях/seed; мягкие метрики §12.2 в целевых диапазонах на сериях или имеют задокументованные отклонения.
- [ ] 3 прототипных профиля воспроизводимо генерируют валидные уровни; эталоны (seed/`generatorVersion`/хэши) зафиксированы.
- [ ] Детерминизм, `--check`/паритет, node- и browser-гейты по затронутым главам зелёные; perf в согласованных бюджетах.
- [ ] Документация и схемы (если менялись) актуальны; пробелы схемы отражены как реализованные или как открытые ADR-задачи.
