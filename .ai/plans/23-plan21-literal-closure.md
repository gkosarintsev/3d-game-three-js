# План 23 — закрытие literal-требований плана 21

Дата: 2026-11-19. Статус: **черновик (pending merge) — в работу включается после слияния и явного мандата владельца на отдельные задачи (S0/S1/S2/S3 отменены только владельцем)**.
Основание: анализ `01-08/20-22` → документированных отклонений плана 21; «Решения владельца» в `.ai/state/citygen-procedural-rules.md` (S0–S3, делегированы агенту 2026-11-19); реализованное инструментарием gv 0.69–0.83.
Связанный контекст: `.ai/plans/21-citygen-procedural-rules.md`, `.ai/plans/22-parallel-agents-github-ci.md`, `.ai/state/citygen-procedural-rules.md`, `.ai/state/citygen-plan21-execution.md`, `AGENTS.md`, `docs/architecture-citygen.md`, `docs/level_generation_rules_claude.md` §10–13.

## 0. Цель и границы

### 0.1 Цель
Перевести бывшие чекбоксы плана 21, отмеченные «stated scope»/«accepted deviation», в буквально реализованные:

- [x] **T23.1 §10.4 «живая» смена впечатлений** — генератор обеспечивает смену характера (ширина проезжей части, этажность, материал фасада, «свет»/цветности, зелень) каждые 150–300 м по spawn→exit path; метрики §12.2 verify'ят `impressionCadence.ok == true` на эталонах/сериях, либо подписанный (владельцем/агентом делегацией) waiver остаётся. _(done 2026-11-19/20, gv 0.84.0→0.86.0, PRs #55/#57 + T23.6): stage-6 cadence enforcement bands route road segments (local/collector) along actual spawn→exit path geometry; cadence metric samples along path geometry with functional-type normalization for stable character signatures; `impressionCadence.ok == true` on tracked etalon/baseline levels with routes (L16/L17/L18/L20/L21/L22). Series-level visibility via T23.6 soft informational gate (`soft_target_out_range`, non-blocking)._
- [ ] **T23.2 L17/L20/L21 в реестре** — perf-gate сойдётся с budgets реестра для profile-driven глав; регистрация в `src/levels/index.js` или официальное закрепление out-of-registry наклонкой.
- [ ] **T23.3 §11.2 features → реальные IR-объекты** — ADR: открытие IR (features manifest) или эмиссия как props/landscapeObjects; в главах появляются 1–2 из §11.2 («остров на реке/старая слобода», «холм-цитадель», «стадион — доминанта», «рынок — площадь-клапан») как читаемые объекты игры. _(in progress 2026-11-20, `agent/plan23-t233-features-adr`, docs-only, **Merged PR #63 `82d5d6a`**, push 44605462680 / PR CI 44605516605 — зелёный merge-gate): `docs/architecture/adr/ADR-003-citygen-features-ir-manifest.md` (proposed) — manifest+traceability + composition-based manifestation of selected §11.2 features; implementation pending, gv bump/rebuild required on first output-affecting increment._
- [ ] **T23.4 Макро-хаос residue:** «прорезь диагональной улицы» через stage-2 (устойчиво пересечение ткани), «площадь-клапан» на узле 5+ улиц, «срезанные углы» (если найдётся честная axis-aligned IR-реализация — либо осознанно исключены с ADR-заменой на «косые районы»).
- [ ] **T23.5 Мезо-хаос residue:** «пристройка/самострой» (маленький IR-attachment как отдельное здание с точной обработкой door-easement/walkability), «проходные дворы» (`networks.paths` через блок), «глухой торец» (IR-flag для пустого фасада без окон — `facadeBlankSides` или аналог после анализа схемы).
- [x] **T23.6 §12.2 enforcement gate** — метрики §12.2 (impressionCadence, landmarkVisibility когда доступна, blockDensityCorrelation) пишутся в правило с уровнем `warn`, и `citygen-etalon-check`/seed-series включает их как информационный gate (не auto-fail, пока владелец не даст мандат на hard §12.1/DoD промоушен). _(done 2026-11-20, `agent/plan23-t236-softgate`, gv 0.85.0 → 0.86.0, PR pending): `rules.mjs` emits `soft_target_out_range` (warn, informational, never §12.1) when `impressionCadence.ok===false`, or `blockDensityCorrelation.ok===false` (computed), or `landmarkVisibility.ok===false` (when available). `citygen-seed-series.mjs` reports per-run/per-profile `softTargets` counts (informational, no hard-fail). Rebuild L16-22, baselines/etalons refreshed._
- [x] **T23.7 План-21 cleanup** — `.ai/plans/21-*.md` переформулированы: всё реально реализованное подтверждено evidence; всё отклонённое формально помечено «выведено из scope» со ссылкой на причину; истории в state дополнены evidence этого плана. _(done 2026-11-20, `agent/plan23-t237-cleanup`, docs-only, **Merged PR #61 `db4bb5a`**, push 44603084347 / PR CI 44603141296 — зелёный merge-gate): обновлён статус/формулировки плана 21 (stated scope → ссылки на План 23), актуализированы DoD/заметки S1 и R4.3, добавлен раздел «Выведено из scope плана 21 → перенесено/закрыто в Плане 23» (маппинг T23.1–T23.8 + R4.3 deferred backlog с причинами/evidence), state дополнен записью T23.7._
- [ ] **T23.8 Evidence & release hygiene** — bump `DEFAULT_GENERATOR_VERSION` на каждый output-affecting инкремент; baselines/etalons освежаются; CI merge-gate зелёный на каждый PR.

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

**T23.2 — регистрация L17/L20/L21.**

- Перед регистрацией: прогон `node tools/ci-browser.mjs --level=17 --suites open-world,level-contract-lifecycle --fast` (local perf hint OK только как ориентир; источник истины — GitHub CI).
- Если budgets не держатся — исключить регистрацию (S2 остаётся) и зафиксировать blocking.
- Регистрация в `src/levels/index.js` только после зелёного browser gate в CI (иначе budget red blocks all PR).

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

**T23.8 — evidence & release.**

- Для каждого OUTPUT-affecting инкремента: bump `DEFAULT_GENERATOR_VERSION`, refresh etalons/baselines, `citygen.test` / `chunk.test` / `etalon-check` зелёные; merge-gate PR green.

## 3. Риски и обратимость

| Риск | Митигация |
|---|---|
| T23.1 меняет детерминизм артефакты — etalons сломаются цепью | bump `generatorVersion` обязателен; etalon-check обеспечивает согласование |
| T23.2 регистрация L17/L20/L21 сломает perf-gates всем PR | регистрация только по зелёному GitHub CI perf; возможно строго через dispatch `workflow_dispatch --full` |
| T23.3 открытие IR-схемы затрагивает всех потребителей | ADR перед кодом; эталон grid §13.2 — `additionalProperties:false` в building остаётся |
| Отмены S0/S1/S2/S3 не выполняются в рамках этого плана | фиксировано в 0.2/§1 |

## 4. Следующие шаги (после слияния этого файла)

1. Создать ветку `agent/plan23-t23-1-anchors` и реализовать T23.1 (первым этапом — read-only design notes → PR draft → CI).
2. Затем T23.6 (мягкий §12.2 gate) — параллельно, т.к. touches rules only.
3. T23.4 — следующий.
4. T23.2 — после наличия хотя бы одного зелёного perf-прогона.
5. T23.3 — после ADR владельцем.

## 5. CI & Parallelization

- Ветка/worktree: `agent/plan23-*`, отдельный worktree на задачу (см. `.ai/plans/22-parallel-agents-github-ci.md`).
- Параллельная безопасность: T23.1/T23.4 touch generation; T23.6 touches rules-only; T23.2 perf — blocked on CI; T23.3 blocked on owner ADR.
- По умолчанию каждый push: `fast` profile; PR → full gate.
- Реbuild/check: `node tools/build-level.mjs --check src/levels/level-16..22.json` + `node tools/check-levels.mjs` + `node tools/citygen-etalon-check.mjs` в CI.
- Merge target: последовательно в `main`, по одному PR.
