# Состояние: внедрение правил процедурной генерации (план 21)

Дата старта: 2026-11-15. Связанный план: `.ai/plans/21-citygen-procedural-rules.md`.  
Основание: `docs/level_generation_rules_claude.md` v1.0. Статус: **R0 в работе (начата спецификация/инфраструктура валидации)**.

## Фазы (сводка)

- [ ] **R0** Спецификация/валидатор/метрики/baseline/конфиг профилей
  - [x] R0.1 Матрица соответствия §3–13 ↔ модули (зафиксирована ниже, 2026-11-15)
  - [~] R0.2 Валидатор инвариантов §12.1 (read-only) + baseline на 16–19 — `tools/citygen/rules.mjs`: подмножество инвариантов/проверок + проверки уклонов дорог (абсолютный предел/политика классов `slopeLimitPct`), удалённость spawn/exit от сети, контроль целей enterable-share (info), снимок baseline 16–19
  - [~] R0.3 Каркас метрик §12.2 в report — `report.metrics`/`report.rules` (детерминированно, partial): дороги/уклоны/политики, gameplay/stream, terrain analysis (slope/share/crossings/reservations), parcels/reserved share, counts rivers/lakes, read-only проверки γ/dead-end ratio (§7.5/§12.2, informational); отчёты пилотов 16–19 пересобраны
  - [~] R0.4 Эталоны (3 seed × профили), процедура bump `generatorVersion` — `tools/citygen-baseline.mjs` поддерживает `--out <dir>`; добавлен `tools/citygen-etalon.mjs` (синтетические прогоны profile×seed, hash/metrics/summary) и `tools/citygen-etalon-check.mjs` (регрессионная проверка синтетических эталонов + pilot baseline snapshots, `--update` для контролируемого обновления снимков/summary, `--generatorVersion` для bump synthetic etalons); сохранены/обновлены снимки пилотов (`.ai/state/citygen-baselines/`) и синтетические эталоны 3×3 для `river_trade`/`hill_town`/`railway_industrial`, seeds 101/202/303, `generatorVersion=0.1.0` (`.ai/state/citygen-etalons/`), `node tools/citygen-etalon-check.mjs` зелёный; шаг регрессии эталонов добавлен в CI (`.github/workflows/ci.yml`); процедура bump/regression задокументирована в state; в коде зафиксирован `DEFAULT_GENERATOR_VERSION` (`tools/citygen/config.mjs`, используется в context/etalon tools как дефолт) — формальная политика bump в исходниках/профильных пилотах и автоматизация полного цикла не завершены
  - [~] R0.5 Структура `generator.profiles`/`generator.policies` + чтение/fallback — `tools/citygen/config.mjs`, нормализация в `ctx.meta.{policies,cityProfiles,activeCityProfile*}` (дефолты §13.2)
- [ ] **R1** Рельеф и вода (§4, §5)
  - [~] R1.1 Профили рельефа и порядок модификаторов — в `stage-1-landscape` добавлена opt-in упорядоченная генерация форм (`ordered/profileDriven`: крупные формы, средние холмы, террасы `replace/step`, платформы `replace/smooth`) с детерминированным порядком §4.2; при наличии `activeCityProfile`/`profileDriven` подставляются профильные дефолты рельефа/воды (если не заданы явно); полный цикл профилей рельефа и влияние всех параметров ещё не завершены
  - [~] R1.2 Карта уклонов (8–16 м) и классификация — `stage-1-landscape`: `ctx.terrain.analysis.slope` (grid/step/maxSlope/share по классам §4.3), диагностика `terrain_slope_analysis`
  - [~] R1.3 Бронирование плоских участков и ориентиры — `buildReservations` формирует плоские резервные площадки (`ctx.terrain.analysis.reservations`), диагностика `terrain_reservations_marked` (ориентиры/видовые точки — частично)
  - [~] R1.4 Гидрология (реки, озёра, поймы) — процедурная река семплит рельеф по Y, опционально `river.meander`/`widthProfile`, opt-in/explicit `river.downslope`; profile-driven процедурные реки по умолчанию используют cost-traced downslope-трассировку (если не задан явный режим) с учётом uphill/turn cost, детерминированный приток для `river_trade` (если не отключён), простая генерация озера (`lake.enabled`); буферы/поймы в river easements (`buffer`, `floodplain`) и `terrain.analysis/masks.waterBuffers`, диагностика `terrain_water_buffers_marked`; для озёр buffer/easements (5–10м, additive); stage 3/4 применяют hard non-buildable water buffer strip, `floodplain` — planning metadata; множественные притоки/полные поймы/расширенные запреты ещё не реализованы
  - [~] R1.5 Исторические переправы/подготовка — детерминированные кандидаты переправ по рекам в `ctx.terrain.analysis.crossings`/`ctx.masks.terrain.crossings`, диагностика `historical_crossings_marked`; stage 3 резервирует vicinity переправ как инфраструктурные (non-generic parcel) участки; буферы рек/озёр частично применяются как ограничения генерации (парсели/здания), мостопригодные участки и полноценные ограничения реализованы не полностью
  - [~] R1.6 Тесты детерминизма/пределов — добавлен детерминированный тест анализа stage 1 (slope/reservations/crossings) в `tools/citygen.test.mjs`
- [ ] **R2** Сеть, перекрёстки, мосты/тоннели/развязки (§7, §8)
  - [~] R2.1 Иерархия и параметры сегментов — stage 2 заполняет дефолты класса (в т.ч. `speedLimit` км/ч, lanes/surface) при отсутствии значений в сегментах IR (без изменения геометрии)
  - [ ] R2.2 Каркас/заполнение/постобработка
  - [~] R2.3 Рельеф и уклоны дорог — stage 2 учитывает `policies.slopeLimitPct` в read-only диагностике (`road_slope_over_class_policy` по классу сегмента), абсолютный предел ~0.3 сохранён; целевое профилирование/уклоны по классам в генерации ещё не реализованы
  - [~] R2.4 Топология и инварианты связности — read-only метрики/проверки γ, dead-end ratio, компонент/связности (частично в `rules.mjs`/stage 2); stage 2 repair (generated transport) пытается соединять компоненты с перебором альтернативных пар узлов (bounded) и диагностикой неуспеха; целевые инварианты/каркас→заполнение и repair-политики не завершены
  - [ ] R2.5 Перекрёстки и connections
  - [ ] R2.6 Мосты, тоннели, жд/тропы
  - [ ] R2.7 Развязки (шаблоны, геометрия, полнота)
  - [ ] R2.8 Валидация/repair/degradation
- [ ] **R3** Settlement, эпохи, районы, D/B(D) (§6, §7.3)
  - [ ] R3.1 Ядра (скоринг, вторичные)
  - [ ] R3.2 Эпохи и кольца роста по стоимости доступа
  - [ ] R3.3 Поле L(x) и размещение типов
  - [ ] R3.4 Соседство, форма/`districtFrame`, зелёный каркас
  - [ ] R3.5 Давление D, B(D), рекурсивное деление, второй проход
  - [ ] R3.6 Метрика Спирмена (D, 1/площадь) ≥ 0.6
- [ ] **R4** Блоки, участки, здания, интерьеры, детали (§9)
  - [ ] R4.1 Блоки/участки/buildable/maxFloors
  - [ ] R4.2 Архетипы и высоты/доминанты
  - [ ] R4.3 Расстановка, фундамент, рельеф
  - [ ] R4.4 Внешний вид/палитры/окна/крыши
  - [ ] R4.5 Интерьеры, enterable 15–25%, связность
  - [ ] R4.6 Props/свет без конфликтов
- [ ] **R5** Хаос, читаемость, геймплей, стриминг, locked (§10, §13)
  - [ ] R5.1 Контролируемый хаос + `reason`/откат
  - [ ] R5.2 Ориентиры/видовые точки/тупики/смена впечатлений
  - [ ] R5.3 Spawn/exit/cars/enemies по правилам
  - [ ] R5.4 Уважать `locked`, заполнять `instance.generation`
  - [ ] R5.5 `homeChunk`/`coverageChunks`, рез дорог, независимость
- [ ] **R6** Профили, пилоты, эталоны, доки, CI (§11, §12.3)
  - [ ] R6.1 3 профиля (Речной торговый, Город на холме, Ж/д индустриальный)
  - [ ] R6.2 Пилотные уровни (seed/версия/отчёты)
  - [ ] R6.3 Серии ≥100 seed, агрегированные метрики
  - [ ] R6.4 Эталоны (3 seed × профиль), процедура обновления
  - [ ] R6.5 Документация и CI-гейты

## R0.1 Матрица соответствия (док §3–13 ↔ модули, 2026-11-15)

| Домен дока | Целевые правила (кратко) | Текущие модули | Статус | Пробел / заметка |
| --- | --- | --- | --- | --- |
| §2–3 Конвейер, детерминизм | 7 стадий, seed/mix по stage+id, sorted-id обход, locked, оси Y-up, единицы | `tools/citygen/index.mjs`, `pipeline/stage.mjs`, `rng.mjs`, `ids.mjs`, `context.mjs`, `diagnostics.mjs` | **частично** | Стадии 0–6 есть, но семантика ≠ доку (D-PLAN-1). RNG/seed есть; нужен единый sorted-id контракт и хэши детерминизма в отчёте. |
| §4 Рельеф | профили, порядок модификаторов, карта уклонов 8–16 м, бронирование, ориентиры, гладкость, пределы | `stage-1-landscape.mjs`, `tools/cityforge-compile.mjs` (`terrainHeightAt`/relief), `tools/normalize-level.mjs` | **частично** | Есть валидация/ремонт и простая процедурная генерация холмов; нет профилей, карты уклонов, бронирования, ориентиров, террас/площадок по правилам. |
| §5 Гидрология | река вниз по высотам, меандры/widthProfile, carve, поймы, озёра, запреты, 2–4 переправы | `stage-1-landscape.mjs` | **частично** | Простая детерминированная река/валидация; нет трассировки по стоимости, меандров по ширине, пойм, озёр по впадинам, отметки переправ. |
| §6 Ядро/районы/эпохи | точка основания, вторичные ядра, эпохи/кольца роста по доступу, L(x), типы/соседство, Вороной/districtFrame, зелёный каркас | `stage-3-districts.mjs` | **частично** | Есть профили/совместимость/fallback, авто-сетка, парцелляция MVP; нет скоринга ядер, эпох, роста по стоимости, L(x), матрицы соседства/буферов, Вороного/привязки к рубежам, зелёного каркаса. |
| §7 Дороги и плотность | иерархия/параметры, 4 прохода построения, D/B(D), рельеф/уклоны, топология | `stage-2-transport.mjs`, `stage-3-districts.mjs` (parcels) | **частично** | Есть валидация/ремонт, профилирование, connectivity hints, прототипы; нет полного каркаса по стоимости/опорным точкам, B(D), классовых уклонов/серпантинов, целевой топологии (γ, тупики, углы, 2 пути). |
| §8 Перекрёстки/развязки/мосты/тоннели | типы junction+connections, параметрические развязки, мосты/тоннели/жд/тропы | `stage-2-transport.mjs`, `stage-6-finalize.mjs`, `tools/cityforge-compile.mjs`, `tools/normalize-level.mjs` | **частично** | Прототипы interchange/мостов/turnarounds есть (пилоты 16/17); нет полного выбора junction по таблице, connections, шаблонов diamond/trumpet/stack с полными инвариантами, правил порталов/жд/троп. |
| §9 Блоки/участки/здания | нарезка по типам, buildable/maxFloors, архетипы, высоты/доминанты, фундамент/рельеф, фасады, интерьеры/enterable, props/свет | `stage-3-districts.mjs`, `stage-4-buildings.mjs`, `stage-5-props.mjs` | **частично** | Параметрические архетипы/props/бюджеты есть; нет полной нарезки по фронтам, рельефного фундамента/ступеней/podium-логики по §9.6, правил доминант/силуэта, enterable-связности лобби/лестниц, запретов по буферам воды/развязок. |
| §10 Хаос/читаемость/геймплей | chaos pass, причины, откат, ориентиры/видовые, тупики/награды, смена впечатлений, spawn/exit/cars/enemies | `stage-6-finalize.mjs`, `tools/build-level.mjs` | **частично/отсутствует** | Финализация есть; нет управляемого chaos-прохода с reason/откатом, проверки читаемости, целевых правил расстановки gameplay по D/районам. |
| §11 Профили | профили городов, мутация ±20%, 1–2 особенности | `stage-3-districts.mjs` (`DEFAULT_PROFILES`), `level-schema.mjs` (`generator.profiles/policies` open) | **частично** | Есть типовые профили районов и open-поля; нет полноценных city-профилей (рельеф/вода/L-веса/развязки/chaos) и мутаций/особенностей. |
| §12 Валидация/метрики | инварианты, мягкие метрики, регрессия, 5 попыток | `tools/check-levels.mjs`, `tools/citygen.test.mjs`, `diagnostics.mjs` | **частично** | Проверки паритета/схемы/каталога и диагностики стадий есть; нет единого валидатора §12.1, метрик §12.2, серийных прогонов и эталон-хэшей. |
| §13 Чанки/конфиг | stream правила, home/coverage, пример generator | `tools/chunk-level.mjs`, `tools/build-level.mjs`, `stage-6-finalize.mjs` | **частично** | Чанкирование и stream-поля работают; нужны проверки coverage/крупных объектов/границ развязок и расширенный пример конфига профилей/политик. |

**Итог R0.1:** базовая инфраструктура (IR, RNG, 7 стадий, отчёт, часть генерации/ремонта, тесты паритета/детерминизма) присутствует; основные пробелы — причинные модели (рельеф→вода→ядра→L/D→B(D)), полная топология/развязки, рельефно-корректная застройка/интерьеры, управляемый хаос/геймплей, профили городов и формализованный валидатор/метрики/эталоны.

## Ключевые решения
- D-PLAN-1: 7 стадий сохраняются, соответствие доку — внутри текущих слотов (`0_input_space`…`6_finalize`).
- Профили/политики — в `generator.profiles`/`generator.policies` (open), fallback на текущие константы.
- Валидатор §12.1 и метрики §12.2 вводятся до/вместе с изменением генерации (R0).

## Baseline / метрики
- 2026-11-15, `runCitygen` по исходникам `src/levels/level-{16,17,18,19}.json` (с `report.metrics`/`report.rules`, partial):
  - **L16**: errors 0, warnings 10, rules {0,1,0}; graph 162/187, components 7, deadEndRatio 0.228395, gamma 0.389583; counts roads 187, districts 16, parcels 2274, buildings 402, props 360, lights 8; spawnToRoad 0, exitToRoad 0.
  - **L17**: errors 0, warnings 9, rules {0,0,0}; graph 141/171, components 1, deadEndRatio 0.177305, gamma 0.410072; counts roads 171, districts 16, parcels 2274, buildings 403, props 360, lights 8.
  - **L18**: errors 0, warnings 2, rules {0,0,0}; graph 11/10, components 1, deadEndRatio 0.272727, gamma 0.37037; counts roads 10, districts 1, parcels 121, buildings 15, props 0, lights 0.
  - **L19**: errors 0, warnings 5, rules {0,1,0}; graph 124/133, components 14, deadEndRatio 0.177419, gamma 0.363388; counts roads 133, districts 1, parcels 441, buildings 24, props 0, lights 0; spawnToRoad 179.213, exitToRoad 0.
- Примечание: это runtime-снимок IR/контекста citygen (частичный), не замена закоммиченных `generation-report.json` каталогов; R0.4 (эталоны/хэши, ≥3 seed × профиль) не выполнен.
- 2026-11-15, R1 анализ (stage 1): для L16 вычислен slope-grid 80×80 (step 16 м, maxSlope 0.37447 м/м, share по классам §4.3) и 3 кандидата переправ; отчёты пересобраны детерминированно.
- 2026-11-15, R0 (инкремент): расширены read-only rules/metrics (`road_slope_over_class_policy`, `enterable_share_far_from_target`, метрики уклонов по классам/политике); каталоги/`generation-report.json` L16–L19 пересобраны, `build-level --check`/`check-levels`/`node --test tools/citygen.test.mjs` зелёные.
- 2026-11-15, R2.3 (инкремент): `stage-2-transport` добавляет диагностику превышения уклона по классу относительно `policies.slopeLimitPct` (без изменения геометрии/лимитов); отчёты L16–L19 пересобраны, гейты зелёные.
- 2026-11-15, R2.1 (инкремент): `stage-2-transport` проставляет дефолты параметров сегментов по классу (в т.ч. `speedLimit` км/ч) при отсутствии значений; геометрия/компилируемые артефакты без регрессий, гейты зелёные.
- 2026-11-15, R0 (инкремент): `rules.mjs`/`diagnostics` расширены метриками terrain/parcels/hydrology (read-only), `citygen-baseline.mjs` поддерживает `--out` для детерминированных снимков; пересобраны отчёты L16–L19, `build-level --check`/`check-levels`/`node --test tools/citygen.test.mjs` зелёные.
- 2026-11-15, R0.4/R6 prep (инкремент): добавлен `tools/citygen-etalon.mjs` и сохранены детерминированные синтетические эталоны 3 профиля × 3 seed (`.ai/state/citygen-etalons/`, gv 0.1.0). Наблюдение: `railway_industrial` совпал по hash с `river_trade` на тех же seed (дифференциация профилей неполная, требуется R1/R3/R6).
- 2026-11-15, R1.4/R1.5 (инкремент): `stage-1-landscape` обогащает river easements/buffers (`buffer`, `floodplain`) и публикует `waterBuffers` в `terrain.analysis/masks` + диагностику; добавлены lake buffer/easement метаданные; пересобраны/актуализированы отчёты/снапшоты L16–L19 и синтетические эталоны 3×3, `build-level --check`/`check-levels`/`node --test tools/citygen.test.mjs`/`node tools/citygen-etalon-check.mjs` зелёные.
- 2026-11-15, R0.4/R1.5 (инкремент): `tools/citygen-etalon-check.mjs` добавлен в CI; stage 3/4 учитывают river/lake buffer metadata при резервировании участков и размещении зданий (без изменения derived-артефактов пилотов 16–19), scoped-гейты зелёные.
- 2026-11-15, R0.4 (инкремент): `tools/citygen-etalon-check.mjs` поддерживает `--update`/`--generatorVersion` для контролируемого обновления эталонов/базовых снимков при намеренном изменении поведения (bump/regression workflow).
- 2026-11-15, R1.3 (инкремент): stage 3 резервирует парсели, пересекающие terrain reservations (flat earmarked sites/landmarks), как non-generic; пересобраны derived каталоги/отчёты пилотов L16–L19 и обновлены baseline/etalon snapshots (`--update`), scoped-гейты зелёные.
- 2026-11-15, R2.5 (инкремент, partial): `stage-2-transport` выводит базовые road junctions + `connections` (lane-level, движения по геометрии подходов) при пустом наборе junctions; IR/engine содержат junctions, пересобраны derived-артефакты пилотов, `build-level --check`/`check-levels`/`node --test`/`citygen-etalon-check` зелёные.
- 2026-11-15, R1.3/R1.5 (инкремент): `stage-1-landscape` формирует детерминированные landmarks/orientation points (viewpoints/переправы/бассейн) в `terrain.analysis/masks.landmarks` и включает их в reservation-ограничения; stage 3 учитывает их при резервировании парселей (влияние на генерацию). Пересобраны derived каталоги/отчёты L16–L19 и обновлены baseline/etalon snapshots, scoped-гейты зелёные.
- 2026-11-15, R1.1/R1.4 (инкремент): усилена profile-driven дифференциация гидрологии в stage 1 (river_trade: процедурный meander/widthProfile по умолчанию при генерации; профильные параметры рек), синтетические эталоны `river_trade` отличаются от `railway_industrial` на тех же seed; обновлены etalon snapshots, пилоты 16–19 без регрессии, scoped-гейты зелёные.
- 2026-11-15, R1.2/R4.1 (инкремент): stage 3 резервирует парсели с локальным уклоном >25% (terrain slope sampling по модификаторам) как non-buildable/generic-reserved; пересобраны derived каталоги/отчёты пилотов L16–L19 и обновлены baseline snapshots (L16/L17 изменились, L18/L19 без hash-изменений), `build-level --check`/`check-levels`/`node --test`/`citygen-etalon-check` зелёные.
- 2026-11-15, R1.4 (инкремент): profile-driven/opt-in детерминированный приток (`river_1_trib1`) для `river_trade` в stage 1 (с буферами/easements как у рек); обновлены synthetic `river_trade` etalons 3×3, пилоты 16–19 без изменений derived/hash; scoped-гейты зелёные.
- 2026-11-15, R1.4 (инкремент): profile-driven процедурные реки по умолчанию трассируются cost-traced downslope (если режим не задан явно); обновлены synthetic `river_trade`/`railway_industrial` etalons 3×3, пилоты 16–19 без изменений derived/hash; scoped-гейты зелёные.
- 2026-11-16, R0.4/R1.4 (инкремент): формализован `DEFAULT_GENERATOR_VERSION` в `tools/citygen/config.mjs` (дефолт в context/etalon tools); усилена cost-traced трассировка рек (штраф uphill/turn, учёт спуска) для profile-driven генерации, пересчитаны synthetic etalons 3×3 (`--update`), pilot baselines/derived L16–L19 без изменений; `build-level --check` (L16–L19), `check-levels` (16/16), `node --test tools/citygen.test.mjs` (43/43), `citygen-etalon-check` (13/13) зелёные.
- 2026-11-15, R2.4 (инкремент): stage 2 repair для generated transport перебирает ограниченный набор ближайших пар узлов при соединении компонент и сообщает `transport_component_connect_failed` при неуспехе; пилоты/etalons без изменения derived/hash, scoped-гейты зелёные.
- 2026-11-15, R0.3/R2.3 (инкремент): в `tools/citygen/rules.mjs` добавлены read-only informational проверки `road_graph_gamma_out_of_target` ([0.3,0.6]) и `road_graph_dead_end_ratio_high` (>0.35); для текущих пилотов/etalons violations не изменились, scoped-гейты зелёные.
- 2026-11-15, R1.1 (инкремент): усилены profile-driven пресеты рельефа в stage 1 (relief→largeForms/terraces/platforms/hills/ordered defaults при `generate/profileDriven`), синтетические эталоны 3×3 обновлены (hill_town более рельефный, профили различаются), пилоты 16–19 без изменений derived/hash; scoped-гейты зелёные.

## Процедура bump/versioning и регрессии (R0.4, формализовано частично)

### Когда повышать `generatorVersion`
- **Повышать** при намеренном изменении раскладки/IR/отчёта, влияющем на воспроизводимый результат (геометрия, распределения, ID/порядок, диагностики/метрики, влияющие на report hash, и т.п.) для уровней с фиксированным seed+version.
- **Не повышать** для чисто нефункциональных правок, не меняющих детерминированный вывод/derived-артефакты.
- При bump: обновить `generator.generatorVersion` в затронутых исходниках/эталонных сценариях и зафиксировать причину в `.ai/state`/коммите.

### Регрессионный gate (текущее состояние)
- Синтетические эталоны 3×3: `.ai/state/citygen-etalons/` (`river_trade`,`hill_town`,`railway_industrial` × seeds `101,202,303`, gv `0.1.0`).
- Pilot baselines: `.ai/state/citygen-baselines/` для `src/levels/level-{16,17,18,19}.json`.
- Проверка: `node tools/citygen-etalon-check.mjs` (в CI: node job). Сравнивает report hash + summary/rules (и metrics для synthetic etalons).

### Контролируемое обновление при намеренном изменении поведения
1. Внести изменение генератора/правил.
2. Пересобрать затронутые derived-артефакты пилотов/уровней: `node tools/build-level.mjs src/levels/level-XX.json ...` (и `--check` для паритета).
3. Обновить pilot baselines: `node tools/citygen-baseline.mjs --out .ai/state/citygen-baselines src/levels/level-16.json src/levels/level-17.json src/levels/level-18.json src/levels/level-19.json` (или нужный scope).
4. Обновить synthetic etalons: `node tools/citygen-etalon-check.mjs --update` (обновляет несовпавшие etalon/*.json и `summary.json`). Для смены версии synthetic-сценариев: `node tools/citygen-etalon-check.mjs --update --generatorVersion <v>`.
5. Прогнать scoped-гейты: `node tools/build-level.mjs --check ...`, `node tools/check-levels.mjs ...`, `node --test tools/citygen.test.mjs`, `node tools/citygen-etalon-check.mjs`, релевантные browser/perf-гейты по scope.
6. Зафиксировать изменения derived/снапшотов/версий и причину в `.ai/state` и коммите.

### Осталось для полного закрытия R0.4
- Формальная политика bump в исходных level-брифах/профильных пилотах (не только synthetic), автоматизация полного цикла при изменении `generatorVersion`, расширение набора эталонов до целевого DoD (3 seed × профиль для воспроизводимых профильных пилотов R6).

## Открытые вопросы / риски
- GAP-01/06/07/08/11 из `docs/level_generation_rules_claude.md` §14 (см. план, раздел 2).
- Подтвердить поведение движка для пустого `rooms` у фасадных домов (GAP-11) в R4.5.
- Порог perf фиксировать фактическим замером (`open-world --details`) при изменении плотности.
