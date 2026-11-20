# План 23 — закрытие literal-требований плана 21

Дата: 2026-11-19. Статус: **закрыт (2026-11-20, решение владельца: новых output-affecting изменений в рамках Плана 23 не будет; T23.1–T23.8 выполнены/зафиксированы)**.
Основание: анализ `01-08/20-22` → документированных отклонений плана 21; «Решения владельца» в `.ai/state/citygen-procedural-rules.md` (S0–S3, делегированы агенту 2026-11-19); реализованное инструментарием gv 0.69–0.83.
Связанный контекст: `.ai/plans/21-citygen-procedural-rules.md`, `.ai/plans/22-parallel-agents-github-ci.md`, `.ai/state/citygen-procedural-rules.md`, `.ai/state/citygen-plan21-execution.md`, `AGENTS.md`, `docs/architecture-citygen.md`, `docs/level_generation_rules_claude.md` §10–13.

## 0. Цель и границы

### 0.1 Цель
Перевести бывшие чекбоксы плана 21, отмеченные «stated scope»/«accepted deviation», в буквально реализованные:

- [x] **T23.1 §10.4 «живая» смена впечатлений** — генератор обеспечивает смену характера (ширина проезжей части, этажность, материал фасада, «свет»/цветности, зелень) каждые 150–300 м по spawn→exit path; метрики §12.2 verify'ят `impressionCadence.ok == true` на эталонах/сериях, либо подписанный (владельцем/агентом делегацией) waiver остаётся. _(done 2026-11-19/20, gv 0.84.0→0.86.0, PRs #55/#57 + T23.6): stage-6 cadence enforcement bands route road segments (local/collector) along actual spawn→exit path geometry; cadence metric samples along path geometry with functional-type normalization for stable character signatures; `impressionCadence.ok == true` on tracked etalon/baseline levels with routes (L16/L17/L18/L20/L21/L22). Series-level visibility via T23.6 soft informational gate (`soft_target_out_range`, non-blocking)._
- [x] **T23.2 L17/L20/L21 в реестре** — reconciled 2026-11-20: `src/levels/index.js`/`LEVEL_NUMBERS` на `origin/main` (7342df3) уже включают L17/L20/L21 (и 18/19/22). Зелёный CI (full push) run [44646615819](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44646615819), merge `4686b472` (PR #71), подтвердил browser/registry gates при зарегистрированных главах: `browser / open-world`, `browser / level-contract-lifecycle`, `browser / misc`, `browser / alien`, `browser / stream-vehicle-rotated-solid` — success; `rebuild / build-level --check (levels-17-18-19)` и `(levels-20-21-22)` — success; node fast/citygen/etalon/series/aggregate — success. Perf-hard бюджеты (reload-scene-budget/picture-ground-geo) выведены из DoD решением владельца 2026-11-16; условие T23.2 (регистрация при зелёном CI browser/perf gate в рамках текущего DoD) выполнено, stale out-of-registry статус снят.
- [x] **T23.3 §11.2 features → реальные IR-объекты** — ADR: открытие IR (features manifest) или эмиссия как props/landscapeObjects; в главах появляются 1–2 из §11.2 («остров на реке/старая слобода», «холм-цитадель», «стадион — доминанта», «рынок — площадь-клапан») как читаемые объекты игры. _(done 2026-11-20: ADR-003 merged **PR #63 `82d5d6a`**; manifest/report plumbing merged **PR #65 `1a257dc`** (gv 0.86.0→0.87.0). Closure increment merged **PR #67 `03eda4c`** (`3044642`, fix `2e5cab6`) gv 0.87.0→0.88.0 — push CI 44621347667 / PR CI 44621359724, зелёный merge-gate: deterministic handlers/manifestation for `citadel_hill`, `stadium_dominant`, `river_island_park` (+ existing `old_market_square`, `cemetery_park`), prop-based readable clusters traced in `report.features`; applied in chapters L16/L17/L20 `citadel_hill`, L19 `stadium_dominant`, L22 `river_island_park`, L18/L21 `cemetery_park`. L16-22 rebuilt 0 warnings, baselines/etalons refreshed. Self-heal (1): fixed fast-check `level-parser.test.mjs` expand idempotence + feature application/passthrough; L16 artifacts/baseline corrected to deterministic pipeline output (finalize floodplain drops) with citadel_hill preserved.)_
- [x] **T23.4 Макро-хаос residue** (gv 0.88.0 → 0.89.0, `agent/plan23-t234-macro`, ADR-004): «прорезь диагональной улицы» реализована в stage-2 как детерминированный terrain-profiled cut-through по существующим узлам/пересечениям ткани (устойчивые стыки, slope-safe профиль, обход river crossings, классификация диагональных сегментов как at-grade `ground` в compile для 0-warning сборки). «Площадь-клапан» — детерминированно 1–2 на город на узлах степени ≥5, планируется в stage-2 и эмитится кластером prop-объектов через stage-5 merge (readable IR/props). «Срезанные углы» честно осознанно исключены (нет axis-aligned IR-реализации) с ADR-заменой «косые районы» (`docs/architecture/adr/ADR-004-t234-macro-residue-chamfer-exclusion.md`). Применено к generated и passthrough/expanded v4 сетям (city-scale gate). Rebuild L16–22 (0 warnings), baselines/etalons refreshed, local hints: `build-level --check` L16–22, `check-levels` 48/48, `chunk.test` 20/20, `level-parser.test` 10/10, `citygen-etalon-check` 16/16, `citygen.test` 65/65. **Merged PR #69 `15610f7`** (impl `80eec43`, self-heal fix `f6304bd`: `tools/visualizer/model.test.mjs` aligned to T23.4 counts/provenance for L16/L18/L19). CI: PR run [44635779056](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44635779056) (head `80eec43`) failed `node / fast checks` (`Сюита модели визуализатора уровней`) + `aggregate / report`; green merge-gate PR run [44637047390](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44637047390) (head `f6304bd`, all required checks green: fast checks, citygen unit tests, etalon regression, rebuild 07-08-09/10-15-16/17-18-19/20-21-22, browser alien/misc/open-world/stream-vehicle-rotated-solid/level-contract-lifecycle, series plain+transport river_trade/hill_town/railway_industrial, aggregate); push run [44637036497](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44637036497) green (fast profile).
- [x] **T23.5 Мезо-хаос residue** (gv 0.89.0 → 0.90.0, `agent/plan23-t235-meso`, ADR-005 `docs/architecture/adr/ADR-005-t235-meso-residue.md`, **Merged PR #71 `4686b472ad6b86570c0ee953289465ff1d4a90b2`**, 2026-11-20T00:31:58Z): «пристройка/самострой» — детерминированно 1–2 малых attachment-здания (`buildings[].attachment: { hostId, offset }`) в хаотичных/старых районах (`old_town|historic|slums|irregular`, axis-aligned хосты), размещение с переиспользованием существующих проверок (road/water easements, min dist to road >= 3 м, без пересечений планов, door-easement/walkability по обычным правилам). «Проходные дворы» — `networks.paths` (nodes/segments/junctions) детерминированно для кварталов `old_town|historic`/«1860» (сквозной проход между двумя сторонами блока), валидация: сегменты не пересекают bounds зданий; `cityforge-compile` сохраняет paths в cityforge IR (без отклонения), schema/DSL поддерживают `attachment`/`facadeBlankSides` и `networks.paths`. «Глухой торец» — IR-флаг `facadeBlankSides` (`north|south|east|west`, локальные фасады), детерминированная разметка в плотных/старых районах; рендер окон/вывесок пропускает глухие фасады (двери приоритетнее, поле опционально). Rebuild L16–22 (0 warnings), baselines/etalons refreshed (gv 0.90.0, 16/16), local hints: `build-level --check` L16–22 OK, `check-levels` 48/48, `chunk.test` 20/20, `level-parser.test` 10/10, `citygen-etalon-check` 16/16, `citygen.test` 65/65. CI: push [44644612845](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44644612845) (head `bd64f8e`, iteration 1) failed `node / fast checks` (`Сюита модели визуализатора уровней`, 356!==354) → self-heal fix `218cce1`; push [44645834097](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44645834097) (head `218cce1`, iteration 2, success, fast checks + aggregate); PR merge-gate [44645842338](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44645842338) (pull_request, head `218cce1`, **success**, all required checks green). T23.8 evidence recorded.
- [x] **T23.6 §12.2 enforcement gate** — метрики §12.2 (impressionCadence, landmarkVisibility когда доступна, blockDensityCorrelation) пишутся в правило с уровнем `warn`, и `citygen-etalon-check`/seed-series включает их как информационный gate (не auto-fail, пока владелец не даст мандат на hard §12.1/DoD промоушен). _(done 2026-11-20, `agent/plan23-t236-softgate`, gv 0.85.0 → 0.86.0, PR pending): `rules.mjs` emits `soft_target_out_range` (warn, informational, never §12.1) when `impressionCadence.ok===false`, or `blockDensityCorrelation.ok===false` (computed), or `landmarkVisibility.ok===false` (when available). `citygen-seed-series.mjs` reports per-run/per-profile `softTargets` counts (informational, no hard-fail). Rebuild L16-22, baselines/etalons refreshed._
- [x] **T23.7 План-21 cleanup** — `.ai/plans/21-*.md` переформулированы: всё реально реализованное подтверждено evidence; всё отклонённое формально помечено «выведено из scope» со ссылкой на причину; истории в state дополнены evidence этого плана. _(done 2026-11-20, `agent/plan23-t237-cleanup`, docs-only, **Merged PR #61 `db4bb5a`**, push 44603084347 / PR CI 44603141296 — зелёный merge-gate): обновлён статус/формулировки плана 21 (stated scope → ссылки на План 23), актуализированы DoD/заметки S1 и R4.3, добавлен раздел «Выведено из scope плана 21 → перенесено/закрыто в Плане 23» (маппинг T23.1–T23.8 + R4.3 deferred backlog с причинами/evidence), state дополнен записью T23.7._
- [x] **T23.8 Evidence & release hygiene** — закрыт для scope Плана 23 (решение владельца 2026-11-20: новых output-affecting изменений в рамках Плана 23 не будет). Для всех состоявшихся output-affecting инкрементов плана требования соблюдены и зафиксированы evidence (bump `DEFAULT_GENERATOR_VERSION`, rebuild `src/levels/level-16..22/*` с 0 warnings, refresh baselines/etalons в том же инкременте, зелёный CI merge-gate): T23.3 gv 0.86→0.88.0 (PR #63/#65/#67), T23.4 gv 0.88→0.89.0 (PR #69 `15610f7`, evidence PR #70 `c864c58`), T23.5 gv 0.89→0.90.0 (PR #71 `4686b472`, evidence PR #72 `7342df3`). При будущих output-affecting изменениях **вне** данного плана процедура T23.8 остаётся обязательной по общим правилам репозитория.

### 0.2 Не входит (в план 23, без отдельного согласования)
- Отмена S0/S1/S2/S3 — только владелец письменно (делегирование прекращено после 2026-11-19).
- Perf-артефакт платформы (browser matrix engine pooling) — отдельный план при необходимости 2A.
- gameplay механики (авиадвижение/эффекты) — вне плана 23, если не нужно для DoD.
- Полная §10.3 «1/3 подряд» enforcement (requires full path/cell tracking) — через T23.6 как soft/warn gate, не §12.1.

### 0.3 Неподвижные ограничения
- Не менять игровые контракты без ADR; замкнутая IR-схема `building` как есть (или ADR-для-T23.3).
- Каждый output-affecting инкремент: `bump DEFAULT_GENERATOR_VERSION` + rebuild L16–22 (0 warnings) + refresh 3×3 etalons + baselines + `node --test tools/citygen.test.mjs` (65/65) + `chunk.test` (20/20) + `citygen-etalon-check` (16/16) + green merge-gate CI.
- Один worktree + одна ветка на задачу: `agent/plan23-<taskid>-<slug>`.
- Сброс/перепроверка существующих etalons недопустимы без целевой задачи (T23.8).

## 1. Методика и критерии приёмки

"Done" считается выполненным только при выполнении ВСЕХ:

1. Код + диагностика + (где применимо) IR имеют реализацию до план 21 «stated scope», а не замысел (доказуемая смена гейтов/проверок в CI / содержании эталонов).
2. На merge-gate каждого PR: push-CI и PR-CI SUCCESS, etalons обновлены детерминированно побайтово (`summary.json` gv обновляется).
3. Пункт называется точным именем (T23.X); отклонения фиксируются подписью в state (owner/accepted deviations).
4. Пункты 0.1 Отмены решений S0–S3 — не выполняются без владельца.

## 2. Декомпозиция по этапам (порядок = приоритет)

### Этап А (первым берётся T23.1 — самый объёмный, блокирует DoD; остальные задачи не начинаются до «T23.1 accepted»)

**T23.1 — «Живая» cadence-смена в генерации.**

Дизайн (утверждён в этом плане; детали реализации во время отседок):

- В stage-2 (transport) добавляем `impressionAnchors(seed, route, policy)`: детерминированно берёт spawn→exit кратчайший путь (Dijkstra уже есть для `gameplay` в rules) и ставит якоря каждые `policy.cadenceSpacingMeters` (default `200`; кламп `[150, 300]`). Якорь = точка пути, где сигнатура `(район|класс дороги)` обязана смениться.
- В stage-3/5 якоря подадим в блокированный IR как контекст: якорю ставится некоторый «слой» изменения — смена соседнего типа района, ширина дороги (`width`, `lanes[i].width` ±20%), этажность одного здания по одному из якорных окружений (например, +1–2 этажа в радиусе 30 м у якоря), фасаднаяпалитра (один building в якоре переходит `modern↔historic` как в meso v1).
- Эталонные уровни должны дать `impressionCadence.ok == true`. Если гейт красный — доработка finetune ограничений §9.4 (высота доминант) вместо подгона метрики.
- Diagnostic `cadence_anchors` в report; `properties.reason = 't23_1_cadence'` (если будет поддержка schema §13;) иначе → diagnostics.
- Тесты: новый `tools/citygen.cadence.test.mjs` (или в `citygen.test.mjs`): синтетический spawn→exit 1500 м через 3 района → ожидаем ≥5 якорей (delta ≤ 25 м); `report.metrics.impressionCadence.ok == true`; детерминизм двойным прогон; L16/L17/L20/L22 в ok после bump.

**T23.2 — регистрация L17/L20/L21 (closed by evidence, 2026-11-20).**

- На `origin/main` L17/L20/L21 зарегистрированы в `src/levels/index.js`/`LEVEL_NUMBERS` (вместе с 18/19/22).
- CI evidence (source of truth): full push run [44646615819](https://github.com/gkosarintsev/3d-game-three-js/actions/runs/44646615819) (merge `4686b472`, PR #71) — success, включая `browser / open-world`, `browser / level-contract-lifecycle`, `browser / misc/alien/stream-vehicle-rotated-solid` и rebuild/check `levels-17-18-19`, `levels-20-21-22`.
- Perf-hard бюджеты (reload-scene-budget/picture-ground-geo) de-scoped из DoD (owner, 2026-11-16); при регрессии в CI — self-heal/фикс или owner decision (ADR/rollback), без «молчаливого hold».

**T23.3 — features как IR.**

- ADR: `docs/architecture/adr/…` (следующий свободный ADR-номер) «open features into IR: `marker` slugs»; IR-схема: новое IR-секция `features: []` с `{ id, type, x, z, radiusMeters, references: [buildingId] }` (не наследование от building ⇒ схема building остаётся замкнутой; общий `level-common` section расширение отдельным ADR).
- Реализация: стадия 3 (districts) знает про generator.profiles + выбирает 1–2 фичи из `selectProfileFeatures` (уже есть) в lowest-lv district / seam-s правом saw; стадия 5 (props) ставит IR-props в позицию фичи (стадион: открытые трибуны как props + трибуны-меши (уже есть `stadium` как kind? — нет, только houses; поэтому feature marker → SW-зелёные quad-лиги стадион как decor mark, использующий `decor.js` с лояльным темпом дизайна) или roster → модель asset? assets требуют GLB — есть ли в репозитории `runtime assets`? Нет. Следовательно первый слайс = IR-маркеры + минимальная визуализация по принципу bread-and-decor existing.
- Это самый-длинный слайс плана 23; допускает свой отдельный план-23.x если решение «следовать сейчас» не даст быстрого результата.

**T23.4 — макро residue.**

- «Прорезь диагональной улицы»: в stage-2 (transport), после генерации сети, детерминированно одна диагональ одной из seam-линий (как §10.1 macro — «сетка эпох несоосна») прокладывается через сеть с фиксацией мостов/арок. 1 приём.
- «Площадь-клапан»: на узле с ≥5 улиц (generator.nodes degree ≥ 5) создаётся `networks.nodes[].plaza=true`-кластер props (fountain/bühme): детерминированно, 1–2 на город.
- «Срезанные углы»: после ADR возможна ар-aligned-реализация «скошенная крыша» (`roofline: chamfered`) или явно НЕ поддерживается с ADR-исключением; решение по архитектурным пометкам.

**T23.5 — мезо residue.**

- «Пристройка»: IR `buildings` — отдельный IR-здание-`attachment: { hostId, offset }`, детерминированно 1–2 в районах с хаосом > 0.5, не §13.2 безопасности (min dist to road ≥ 3 м, не в cones).
- «Проходные дворы»: `networks.paths` (см. `level-common.schema.json#networks.paths`) — 1 проход через каждый квартал «старый ядро» / «1860» (2 стороны блока); валидация paths ensure nonintersecting buildings bounds.
- «Глухой торец»: предложение схемы `facadeBlank` — в рамках закрытой схемы building НЕ может добавиться без ADR ⇒ T23.3-ADR выдерживает или отвергает флаг вместе; не делать отдельным обходом.

**T23.6 — §12.2 enforcement.**

- `rules.mjs`: новый warn-код `soft_target_out_range` — пишется, если impressionCadence/`landmarkVisibility` выйдет за заданный диапазон; never §12.1.
- CI seed-series report агрегат объявляет subset'у `soft target violations` и связывает с §12.2 (не gating пока мандата нет).

**T23.7 — план 21 cleanup.**

- `.ai/plans/21-citygen-procedural-rules.md` обновляется с датам и ссылками на этот план + список «выведено из scope» как bullet-лист с reasons.
- `.ai/state/` дополняется итоговым статусом ида plan21 («принят с выводом в План 23»).

**T23.8 — evidence & release (closed for Plan 23 scope, 2026-11-20).**

- Выполнено для всех output-affecting инкрементов Плана 23 (см. T23.3/T23.4/T23.5): bump `DEFAULT_GENERATOR_VERSION`, rebuild/refresh etalons/baselines, `citygen.test` / `chunk.test` / `etalon-check` и CI merge-gate зелёные, evidence записан. Новых output-affecting инкрементов в рамках Плана 23 не планируется (решение владельца).

## 3. Риски и обратимость

| Риск | Митигация |
|---|---|
| T23.1 меняет детерминизм артефакты — etalons сломаются цепью | bump `generatorVersion` обязателен; etalon-check обеспечивает согласование |
| T23.2 регистрация L17/L20/L21 сломает perf-gates всем PR | mitigated/closed by evidence: registry на main при зелёном CI (run 44646615819); при регрессии — self-heal/фикс в CI или owner decision |
| T23.3 открытие IR-схемы затрагивает всех потребителей | ADR перед кодом; эталон grid §13.2 — `additionalProperties:false` в building остаётся |
| Отмены S0/S1/S2/S3 не выполняются в рамках этого плана | фиксировано в 0.2/§1 |

## 4. Следующие шаги (после слияния этого файла)

1. Создать ветку `agent/plan23-t23-1-anchors` и реализовать T23.1 (первым этапом — read-only design notes → PR draft → CI).
2. Затем T23.6 (мягкий §12.2 gate) — параллельно, т.к. touches rules only.
3. T23.4 — следующий.
4. ~~T23.2 — после наличия хотя бы одного зелёного perf-прогона.~~ **Закрыто (2026-11-20):** registry + зелёный CI evidence (run 44646615819) подтверждены. **T23.8 закрыт для scope Плана 23** (решение владельца: новых output-affecting инкрементов не будет); общая гигиена CI/evidence для будущих изменений вне плана сохраняется по правилам репозитория.
5. T23.3 — после ADR владельцем.

## 5. CI & Parallelization

- Ветка/worktree: `agent/plan23-*`, отдельный worktree на задачу (см. `.ai/plans/22-parallel-agents-github-ci.md`).
- Параллельная безопасность: T23.1/T23.4 touch generation; T23.6 touches rules-only; T23.2 perf — blocked on CI; T23.3 blocked on owner ADR.
- По умолчанию каждый push: `fast` profile; PR → full gate.
- Реbuild/check: `node tools/build-level.mjs --check src/levels/level-16..22.json` + `node tools/check-levels.mjs` + `node tools/citygen-etalon-check.mjs` в CI.
- Merge target: последовательно в `main`, по одному PR.
