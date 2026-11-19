# ADR-003: Citygen §11.2 features — IR manifest and deterministic manifestation

- Статус: **proposed** (T23.3 design; implementation pending)
- Дата: 2026-11-20
- Автор: agent (`agent/plan23-t233-features-adr`)
- Связано: `.ai/plans/23-plan21-literal-closure.md` (T23.3), `.ai/plans/21-citygen-procedural-rules.md` (R6.1/§11.2), `docs/level_generation_rules_claude.md` §11.2, `tools/citygen/config.mjs` (`FEATURE_CATALOG`, `selectProfileFeatures`, `resolveGeneratorConfig`), `.ai/state/citygen-procedural-rules.md` (owner confirmation 2026-11-19: IR extension for §11.2 features permitted; ADR/design required before implementation)

## Контекст

Профиль/мутация генератора уже детерминированно выбирает 1–2 особенности из каталога §11.2 (`profileMutation.features` в `resolveGeneratorConfig`, `tools/citygen/config.mjs`). Однако выбранные особенности **не проявляются** как реальные IR-объекты уровня и не становятся читаемыми объектами игры. План 23 (T23.3) требует ADR и реализацию: «§11.2 features → реальные IR-объекты … в главах появляются 1–2 из §11.2 … как читаемые объекты игры».

Целевые примеры (T23.3): «остров на реке/старая слобода», «холм-цитадель», «стадион — доминанта», «рынок — площадь-клапан». Каталог в коде (`FEATURE_CATALOG`): `old_market_square`, `citadel_hill`, `river_island_park`, `ravine_bridge`, `industrial_waterfront`, `maze_block`, `stadium_dominant`, `cemetery_park`, `burnt_quarter`.

Ограничения:
- Детерминизм/seed и `generatorVersion` bump при output-affecting изменениях (R0.4, T23.8).
- Контракт карты и существующие примитивы предпочтительны; новые движковые примитивы/изменения контрактов — только при необходимости и с ADR/согласованием (см. ADR-001: MVP без новых примитивов).
- IR/схемы v4 частично строгие (напр. закрытые объекты в отдельных местах); владелец разрешил расширение IR для §11.2 features (2026-11-19), но изменения схемы/компилятора должны быть осознанными и обратимыми.
- Стадии уже распределяют ответственность (landscape/hydrology/transport/districts/buildings/props/finalize); feature может затрагивать несколько слоёв.

## Решение (proposed)

### 1) Явный feature-manifest в IR и отчёте

Ввести детерминированный **manifest** выбранных/применённых особенностей как часть generator/IR контекста и отчёта:

- Источник выбора: существующий `selectProfileFeatures` (seed/profileMutation) — единый источник истины.
- IR/ctx: `ctx.features` (или эквивалентное поле в нормализованном generator-контексте) — массив записей вида `{ id, type, seedKey, status, anchors?, emitted? }`.
  - `type` — идентификатор из каталога §11.2 (напр. `stadium_dominant`).
  - `status`: `planned | applied | degraded | skipped` + `reason` для degraded/skipped.
  - `anchors/emitted`: ссылки на созданные/затронутые сущности (district/parcel/building/prop/landscapeObject/road ids, terrain modifier refs) для трассируемости и тестов.
- Report: включить сводку features в `report`/diagnostics (детерминированно, без таймстемпов) — какие features выбраны, применены, деградированы.
- Схема: при необходимости расширить v4/generator schema открытым, версионируемым полем для feature-manifest/overrides (напр. `generator.features` как опциональный input override/hint, не ломая существующие источники). Изменения схемы — через `tools/level-schema.mjs` + экспорт/`--check` в том же инкременте.

### 2) Манифестация через композицию существующих примитивов (предпочтительно)

Каждая поддерживаемая feature реализуется **детерминированным emitter/handler**’ом, который отображает feature в композицию уже поддерживаемых сущностей:

- **`stadium_dominant`** (пример T23.3): крупный узнаваемый объект-доминанта — композиция зданий/футпринтов (напр. большой овал/арена из building-примитивов или специальный крупный building footprint) + окружающее открытое пространство/подходы (parcels/landscapeObjects/props), размещение в подходящем районе (sport/civic/downtown edge) с резервированием места; при невозможности точной формы — деградация в крупный landmark-комплекс из допустимых примитивов, но `status=applied|degraded` явно в report.
- **`old_market_square` / «рынок — площадь-клапан»**: площадь/открытый узел (district/parcel open space, `networks`/paths или road junction plaza semantics где применимо) + рыночные постройки/навесы/киоски как buildings/props/landscapeObjects, повышенная проходимость/доступность; согласование с R2/R3 (узел высокой связности) без нарушения инвариантов графа.
- **`citadel_hill` / «холм-цитадель»**: привязка к terrain modifier/высокой точке (R1 ориентиры/резервы), доминирующее здание/ансамбль на возвышении, ограниченные подъезды; использовать существующие terrain/building/placement механизмы.
- **`river_island_park` / «остров на реке/старая слобода»**: при наличии подходящей гидрологии — остров/береговая зона как композиция hydrology-safe terrain masks + park/green parcels + малые здания/props; если река/остров недоступны в профиле/геометрии — `degraded|skipped` с диагностикой (не ошибкой), детерминированно.

Аналогично для остальных типов каталога (`ravine_bridge`, `industrial_waterfront`, `maze_block`, `cemetery_park`, `burnt_quarter`) — поэтапно, с приоритетом 1–2 feature на уровень и читаемостью в игре.

### 3) Точки интеграции (ориентир реализации)

- **Config/selection:** reuse `FEATURE_CATALOG`/`selectProfileFeatures`/`profileMutation.features`; нормализовать/зафиксировать выбранные features в ctx на ранней стадии.
- **Planning/application:** выделить небольшой модуль/слой (напр. `tools/citygen/features.mjs` или stage hook) + точечные применения в стадиях:
  - stage 1 (landscape/hydrology/reservations): terrain/water anchors (citadel/island/ravine hints) через допустимые поля.
  - stage 3 (districts/parcels): резерв/типизация зон (market square, stadium grounds, cemetery/park).
  - stage 4/5 (buildings/props/landscapeObjects): материальные объекты-доминанты и оформление.
  - stage 6/finalize: валидация применимости, диагностика `applied/degraded/skipped`, report/manifest.
- **Схема/компиляция/build:** только необходимые, минимальные расширения (open manifest/refs), сохранение совместимости существующих уровней/артефактов при отсутствии feature-полей.
- **Chunking/streaming:** все эмитируемые сущности должны иметь корректную привязку/владение чанков в рамках существующего пайплайна (`homeChunk`/coverage) — без специальных движковых исключений.

### 4) Нефункциональные требования

- **Детерминизм:** одинаковый seed/profile/config → одинаковый выбор, размещение и набор эмитируемых сущностей.
- **Обратимость/безопасность:** отсутствие feature или неприменимость → нет падения; только диагностика/`skipped|degraded`.
- **Versioning:** первый output-affecting инкремент T23.3 → bump `DEFAULT_GENERATOR_VERSION`, rebuild L16–22 (0 warnings), refresh baselines/etalons, зелёный CI merge-gate (T23.8).
- **Тестируемость:** unit/интеграционные проверки manifest+emission по фиксированным seed; seed-series информирует о применимости/деградациях (не hard-fail без мандата).

## Альтернативы

- **A. Только manifest, без реальных объектов:** не удовлетворяет T23.3 («как читаемые объекты игры»). Отклонено.
- **B. Только ad-hoc эмиссия без manifest/трассируемости:** сложно валидировать и отлаживать; нарушает наблюдаемость IR/отчёта. Отклонено.
- **C. Новые специализированные примитивы движка/схемы для каждой feature:** дорого, повышает риск контрактов/рендера/физики, выходит за MVP-подход. Отклонено как основной путь; допускается точечное расширение только при доказанной необходимости отдельным ADR.

## Последствия

- Появляется трассируемый слой «намерение → manifestation» для §11.2, улучшающий воспроизводимость и отчётность.
- Потребуются изменения в `tools/citygen/*`, возможно в `tools/level-schema.mjs`/schema export, `tools/cityforge-compile.mjs`, `tools/build-level.mjs` и в детерминированных артефактах уровней/эталонов при включении manifestation.
- Реализацию следует вести инкрементально: (1) manifest+report plumbing, (2) 1–2 feature (приоритет примеров T23.3, напр. `stadium_dominant` и `old_market_square`), (3) расширение каталога/покрытия, с отдельными gv-bump/CI циклами по scope.

## План реализации (T23.3, после принятия/согласования ADR)

1. Зафиксировать статус ADR (proposed → accepted) и финальный набор полей manifest/схемы.
2. Добавить IR manifest + report/diagnostics plumbing (без изменения геометрии или с нейтральным эффектом) — при необходимости отдельным малым инкрементом.
3. Реализовать первые 2 features как читаемые композиции в подходящих уровнях/профилях; обновить тесты/эталоны/derived артефакты детерминированно.
4. Расширить на остальные типы каталога по мере готовности, сохраняя деградацию и детерминизм.
