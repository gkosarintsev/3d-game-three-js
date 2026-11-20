# ADR-005: T23.5 meso-chaos residue — attachment buildings, courtyard paths, blank facades

- Статус: **accepted** (T23.5 design, 2026-11-20)
- Дата: 2026-11-20
- Автор: agent (`agent/plan23-t235-meso`)
- Связано: `.ai/plans/23-plan21-literal-closure.md` (T23.5), `docs/level_generation_rules_claude.md` §10.2 (мезо: «пристройка/самострой», «проходные дворы», «глухой торец»), `.ai/state/citygen-procedural-rules.md`, ADR-003, ADR-004, `tools/level-schema.mjs`, `tools/normalize-level.mjs`, `tools/cityforge-compile.mjs`, `tools/citygen/pipeline/stage-4-buildings.mjs`.

## Контекст

План 23 (T23.5) требует реализовать meso-chaos residue:

1. **«Пристройка/самострой»** — маленькое IR-пристроенное здание как **отдельное здание** с корректной door-easement/walkability, с переиспользованием существующей логики размещения/проверок. План уточняет форму IR: `attachment: { hostId, offset }`.
2. **«Проходные дворы»** — `networks.paths` через блок (1 проход через каждый квартал «старый ядро» / «1860», 2 стороны блока); валидация: paths не пересекают границы зданий.
3. **«Глухой торец»** — IR-флаг для пустого фасада без окон (напр. `facadeBlankSides`/аналог после анализа схемы). В рамках закрытой схемы building добавление поля без ADR недопустимо (см. план 23: «не делать отдельным обходом»).

Текущие ограничения/факты:
- `OPEN_BUILDINGS` (`tools/level-schema.mjs`) и нормализованный building (`tools/normalize-level.mjs`) не несут `attachment`/флагов глухих фасадов; схема building закрыта (`additionalProperties: false`).
- `networks.paths` определён в common/CF network DSL (`#definitions.networks.paths`), но `tools/cityforge-compile.mjs` жёстко отклоняет `cityforge.networks.paths` (`SUPPORTED_NONE`), а citygen v4 passthrough/emit path не гарантирован.
- Двери/entrances и оконный ряд выводятся/нормализуются в `normalizeBuilding` и генерируются в stage-4; easements/доступ учитываются при размещении (расстояния до дорог, пересечения с road/water easements, access edges).

## Решение

### 1) Пристройка/самострой (attachment building)

- **IR/схема:** добавить в building (open/cityforge v4 building schema и нормализованный объект) опциональное поле
  - `attachment: { hostId: string, offset?: { x?: number, z?: number } }`
  где `hostId` — id здания-хоста, `offset` — опциональный плановый сдвиг/метаданные IR (фактическая геометрия определяется footprint). Поле не меняет топологию footprint/walls/rooms: пристройка — **отдельная запись `buildings[]`** со своим footprint/этажностью/материалами.
- **Генерация (детерминированно):** 1–2 пристройки на город в районах с хаосом/нерегулярностью > 0.5. При отсутствии явного числового метра chaos в ctx — использовать детерминированный критерий старых/хаотичных районов (напр. `old_town|historic|slums|irregular` или эквивалентный profile/type сигнал). Размещать как малое здание рядом с выбранным хостом с переиспользованием существующих проверок размещения: не ближе 3 м к дороге, вне road/water easements и safety-конусов, без пересечения footprint других зданий, с валидным доступом по обычным правилам — **door-easement/walkability не ломаются** (пристройка не перекрывает access edge/двери хоста; выбирается свободная сторона/зона).
- **Нормализация/валидация:** `hostId` должен ссылаться на существующее здание в итоговом наборе (консистентность IR); `attachment` сохраняется в нормализованном выводе. Отдельные комнаты/лестницы/вход — по обычным правилам enterability/размеров.

### 2) Проходные дворы (networks.paths)

- **IR/схема:** использовать существующий `networks.paths` (`network: {nodes, segments, junctions}`) в v4/cityforge IR. Снять искусственный запрет в компиляторе: `cityforge-compile` **не отклоняет** `cityforge.networks.paths`; paths сохраняются/пробрасываются в результирующий IR/артефакт конвейера, где поддерживается (минимум — в citygen ctx/output и скомпилированном уровне без потери данных), без нарушения текущего поведения roads/railways.
- **Генерация (детерминированно):** 1 проход через каждый квартал типа «старый ядро» / «1860» (исторические/старые кварталы по district/profile/type) — путь из узлов/сегментов, соединяющий **две стороны блока** (сквозной двор). Детеминированный выбор блока/оси; реализация в stage-2/meso-проходе после формирования опорных данных.
- **Валидация:** сегменты/полоса прохода **не пересекают bounds/footprint зданий** (проверка в генераторе/валидаторе). Если безопасный проход невозможен — детерминированная деградация с диагностикой (без молчаливого нарушения геометрии).

### 3) Глухой торец (blank facade)

- **IR/схема:** добавить опциональное поле здания `facadeBlankSides?: string[]` — список фасадов без окон. Допустимые значения: `north|south|east|west` (стороны в локальных осях footprint до поворота; семантика согласуется с геометрией здания).
- **Генерация:** детерминированно помечать фасады у части зданий в плотных/старых/рядовых условиях (meso residue) без нарушения обязательных дверей/входов (дверь/entrance приоритетнее blank на соответствующей грани).
- **Нормализация/рендер:** поле проходит через схему/нормализацию; при отрисовке окон фасады из `facadeBlankSides` не получают оконные квады (читаемый визуальный эффект), при этом существующее поведение для зданий без поля сохраняется.

## Последствия

- **Схема/DSL:** `OPEN_BUILDINGS` расширяется полями `attachment`, `facadeBlankSides`; common/v4 схемы экспортируются из DSL. `networks.paths` поддерживается в compile/pipeline вместо жёсткого отказа.
- **Output-affecting:** bump `DEFAULT_GENERATOR_VERSION` (ожидаемо `0.89.0 → 0.90.0`), детерминированный rebuild `level-16..22` (0 warnings), refresh baselines/etalons, зелёный CI merge-gate.
- **Совместимость:** поля опциональны; существующие брифы/уровни без них нормализуются как раньше.
- **Деградация:** при невозможности честной геометрии (нет безопасного прохода/места для пристройки) — детерминированная деградация + диагностика, без ad-hoc обходов.

## CI & Parallelization

- Ветка/worktree: `agent/plan23-t235-meso` @ `C:\Temp\wt-t235-meso` (от `origin/main` `c864c58`, gv `0.89.0`).
- Профиль CI: `fast` на push, PR merge-gate по required checks; обязательные/тяжёлые гейты — только в CI.
- Output-affecting: gv bump, `build-level --check`, `check-levels`, rebuild `src/levels/level-16..22/*`, refresh `.ai/state/citygen-baselines/*` и `.ai/state/citygen-etalons/*`, локальные hints (`chunk.test`, `level-parser.test`, `citygen-etalon-check`, `citygen.test`).
- Merge: последовательно в `main` при зелёном CI; self-heal ≤4 итераций.
