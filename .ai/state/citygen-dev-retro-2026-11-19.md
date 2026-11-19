# Plan 21 — ретроспектива сессии 2026-11-18/19 (анализ хода и профилирование)

Цель: оценить скорость и стоимость прохода «инкремент → зелёный CI → sequential merge → evidence», найти узкие места и способы их устранения, и задать протокол профилирования для дальнейшего ускорения.

Все времена — UTC, распределение по коммитам `origin/main`.

## 1. Что реально сделано за сессию

- `origin/main`: `69d40e1` (08:31) → `22957d7` (06:01). Продвинуто на **31 PR**.
- GV: `0.66.0` → `0.74.0` (9 бампов версии), каждый раз детерминированный rebuild `src/levels/level-16..22` (0 warnings), обновление baselines/etalons.
- Предметные инкременты (код/данные, output-affecting): R4.3 финал (0.57–0.64), R4.4 окна/палитры/крыши (0.65–0.68, 0.72), R0.3 metrics (0.69), R0.4/R5.4/R6.3/R6.4/R6.5 stated scope, R5.2 LOS/доминанты/впечатления (0.70/0.71/0.73), R5.3 геймплейный валидатор (0.74).
- Чисто документальные инкременты: R0.1 matrix, R0.2/R0.5/R5.4 formalization (#15–17), R0.4 (#19), R6.3/R6.4/R6.5 (#20).
- Standalone evidence-PR (запись CI/merge evidence в `.ai/state`): **#16, #21, #23, #25, #27, #29, #31 = 7 циклов**.

## 2. Замеры этапов (честные, из GitHub API и локального лога)

### CI: PR merge-gate (runs `pull_request`)
- `run_duration_ms` по типам за последние инкременты: **218–263 s** (3.6–4.4 мин).
- Конкретно (окно сегодняшних):
  - `44451506464` (#18 R0.3, gv 0.69) = **218 с**, `44466063763` (#28 R5.2, gv 0.73) = **236 с**, `44464051061` (#26 R4.4, gv 0.72) = **246 с**, `44459988928` (#22 LOS, gv 0.70) = **236 с**, `44453558056` (#19 docs, R0.4) = **263 с**.
  - Push fast (`event: push`): **~2–4 мин** (например `44467865746` = 35s+~2.5 min fast suite).
  - Jobs внутри PR-гейта (0435 полный merge-gate): стартуют все одновременно; самые длинные — `series / transport / river_trade` **~198 s**, `series / transport / hill_town` **~172 s**, `browser / level-contract-lifecycle` **~149–192 s**. Самые быстрые — rebuild shards (~15–20 s), node fast checks (~90–155 s), aggregate report (~6–10 s).

### Локальная часть вывода одного output-affecting инкремента
- `node --test tools/citygen.test.mjs`: **30–36 с** (57/57).
- `node tools/build-level.mjs src/levels/level-NN.json` (per level): порядка **1–5 с** каждый (L19-пилот — до ~9 с из-за 1.2 MB чанков), итого **~10–25 с** на все 7 уровней эхом.
- `node tools/citygen-baseline.mjs --out .ai/state/citygen-baselines src/levels/level-*.json` + `citygen-etalon-check.mjs --update`: **~5–10 с**.
- `node tools/citygen-etalon-check.mjs`: **~5–10 с** (16/16).
- Git add/commit/push: **~5–15 с**.

### Полный цикл «инкремент до merge»
- Оценка по меткам времени для PR: R5.3 (`#30`): commit `10:50:03` → PR created `05:50:16` (commit→push ~1 мин) → PR green `05:53:50` (~3.5 мин) → merged `05:55:48` (~5.5 мин от первого коммита ветки).
- Средний end-to-end на инкремент: **~12–20 мин** (avg), из них ~4–5 мин чистая CI-очередь/исполнение, остальное — локальный rebuild и подготовка, плюс ручные шаги (проверка состояния, запуск watch, merge с удалением ветки).
- ~**30–35 мин** за сессию — только на 7 standalone-science evidence-PR (чистый CI, тот же pipeline, ноль новизны).

## 3. Узкие места (что тратит время)

1. **Отдельные evidence-PR на каждый merge.** Каждый такой PR прогоняет тот же полный gate (docs-only всё равно требует PR CI) ≈ 4 мин × 7 циклов + merge overhead. Это ~15–20% всего времени dag.
2. **Последовательный rebuild `level-16..22`.** `build-level.mjs` по одному уровню; суммарно ~10–25 с — терпимо, но при регрессионных волнах (когда CI падает несколько раз на один и тот же образ IR) каждый раз всё пересобирается с нуля.
3. **Локальный full-test `node --test tools/citygen.test.mjs` на каждый инкремент (30–36 с)**, включая чистый docs-PR.
4. **Двойное ожидание CI**: fast push → wait → PR gate → wait → merge. Каждый `gh run watch` блокирует поток.
5. **Bumpless-диффы из 38+ файлов**: пересобранные каталоги + baselines/etalons + отчёты, даже когда содержимое не менялось (CRLF/LF шум). Ревью и артефакты тяжелее, чем должны быть.
6. **IR хэши пересобираются целиком на каждый gv bump**, хотя изменились только `generation-report` и `hashes` в `index.js` (чанки вообще не тронуты).
7. **CI PR-гейт ~4 мин**, критический путь = `series / transport / river_trade (198 s)` и `browser / level-contract-lifecycle (149–192 s)`.
8. **Ручной цикл «commit → push → watch → merge → delete → fetch»** без скрипта: ~30–60 с человеческого времени × 31 PR ≈ 15–30 мин.

## 4. Предложения по ускорению и оптимизации (по убыванию эффекта)

1. **Убрать standalone evidence-PR**: объединять state-update (CI/merge evidence + текущая позиция) в следующий содержательный инкремент; для последнего инкремента закрытия плана — один консолидированный evidence-PR **в конце секции/цикла**, не на каждый merge. Дорожная карта: поместить sha/run IDs — в PR-описание и merge-commit (они и так там), а `.ai/plan` фиксировать по окончании секции, не атомарно после merge. Экономия ≈ 4–5 мин × сколько инкрементов останется.
2. **`scripts/agent/pr21.mjs`** — автоматизированный цикл W1 (branch/worktree → gv bump → parallel build-level → baselines/etalons → test → commit → push → PR → `gh run watch --exit-status` → `gh pr merge --merge --delete-branch` → `git fetch` → единое обновление `.ai/state` следующим commit'ом). Лежит рядом с `scripts/agent/*` и следует протоколу plan 22 (worktree isolation, CI-only gate).
3. **Параллельный `node tools/build-level.mjs level-16.json level-17.json ... --parallel N`** (воркер-потоки, уровни независимы). Внутри одного уровня стадии не параллелить (IR-цепочка последовательна); стоит всего 10–20 строк.
4. **Дифф-ориентированный rebuild**: флаг `--check` останавливается, если источник (`level-NN.json`) и его производные не менялись с прошлой генерации (сверься по git diff этого файла); при report-only бампе флаг `--reports-only` пересобирает только `generation-report.json/index.js`, не трогая чанки (сегодня чанки не менялись ни в одном R5.2/R5.3 инкременте).
5. **Режим `ci_profile=docs-fast`**: PR только с `docs/**`/`.ai/state/**` может пропускать rebuild/series/browser (`.github/workflows/ci.yml`, `paths-ignore`/`if: always()` split already exists для `workflow_dispatch`; нужен аналог для `pull_request`). Ускорит docs-only PR до ~1 мин.
6. **Предвычисление IR-хэша для etalon-check**: сохранять `sha256(input JSON)→reportHash` cache в temp (`.ai/state/.cache/`, gitignored); etalon-check без cache-fallback всегда, локально 2–4 с.
7. **Сократить CI critical path**: `series / transport` поднять `--concurrency 2 → 4` для shard-параллельности на одном раннере (~3.3 мин → ~1.6 мин); `browser / level-contract-lifecycle` профилировать отдельно (см. §5) и решить, можно ли параллелить ожидание внутреннего pointer-lock шага.
8. **Нормализация окончаний строк** в репо: `.gitattributes text=eol=file` + `core.autocrlf=false` для `.ai/state/**`, `.ai/plans/**`, `src/levels/**`. Диффы останутся по существу; артефакты не будут «протекать» CRLF-шумом.
9. **Локальный предсок чесающий smoke вместо full unit suite**: задать `tools/citygen.test.mjs` групповые теги; на pre-push запускать только изменённые домены (по import graph) за считанные секунды; полный suite — в CI.
10. **Слить мелкие инкременты одной секции в один PR** (например R1.1+R1.2+R1.3+R1.5+R1.6 одним рельефным PR и R2-валидаторы одним R2 PR): меньше CI-циклов, меньше evidence-механики, один gv bump на зону.

Ожидаемый эффект: R5.x/R4.x-темп вывода будет выглядеть примерно как **+30–45%** инкрементов за то же время, и процент полезного CI (вместо механики доказательств) упадёт заметнее.

## 5. Профилирование: что и как измерять (чтобы эффективно оптимизировать дальше)

**Интервал замера:** журнальная структура `.ai/state/citygen-metrics.jsonl` (gitignored, локально), поля: `increment (plan item)`, `date`, `gvBefore/After`, `filesChanged`, `phase`, `wallMs`, размеры `.ai/state/*`, CI: `pushMs/pullRequestMs/aggregateMs/reportMs`, `mainBranchDelete` (мс). Пробег после каждой сессии: `node scripts/agent/citygen-retro.mjs` (см. ниже) сводит медиану/перцентили.

### Локальные фазы (Node.js)
- `tools/build-level.mjs`: в каждый этап (`parse → runCitygen → compile → chunk → write`) вставить `performance.now()` и печать `timing: <phase> <ms>` + опциональный JSON-флаг `--json-out`. Цель — отличить мир `runCitygen` от `compile/write`.
- Крупные стадии `tools/citygen/pipeline/*.mjs`: тёплый проход в `node --cpu-prof` во время `node --test` или при gv-bump сценарии (`node --cpu-prof tools/build-level.mjs ...`), `node --inspect`/`node --inspect-brk` при необходимости интерактива. `clinic --node ./tools/citygen-index...` удобнее на большом объёме.
- Метрики IR: `report.stages[*].ms` — уже ударены детерминированными числами, но не используются для gating: требуется сделать SLO-лейблы `citygen.stage.*.p95` .
- Отчёты: `generation-report.json` размер и время сериализации вынести в отдельные поля `reportGenMs`.

### CI (GitHub Actions)
- `gh api repos/.../actions/runs/<id>/timing` даёт `run_duration_ms` и per-job `duration_ms`; `.../jobs` — детальные `started_at/completed_at`. Коллектор `scripts/agent/ci-timings.mjs` раз в сутки (или после merge секции) выгружает CSV `.ai/state/citygen-timings.csv` с полями: `runId, pr, event, job, started, completed, durationMs, mergeCommit` и сводкой по `aggregate / report` и критическому пути.
- Опубликовать бюджеты (SLO): push fast ≤ 3 мин, PR merge-gate ≤ 5 мин, `aggregate / report` ≤ 15 с, seed-series shard ≤ 150 с. При регрессии — red check либо warning-аннотация в PR.
- Включить автозагрузку `actions/upload-artifact@v4` для timings-артефакта (уже есть в `.github/workflows/ci.yml` веткой `node-fast-failure-*` в кеш; расширить на `aggregate` job).

### Производственные (игра) измерители для рельевро-сетки (R1/R2)
- Хотспоты `tools/build-level.mjs` и `tools/citygen/*`: открывать `node --cpu-prof` на эталонных сценариях `river_trade/hill_town/railway_industrial × seeds 101/202/303`. Отдельные файрволы: `streamPump` / `chunkCompile` / `build:picture-ground-geo` (единственный известный тяжёлый этап; требует бюджета и `picture-ground-geo` серии).
- Browser: `tests/open-world.test.js#testEngineChapter --details` — `worst-frame`, `picture` огрехи; метрика `renderer.info.memory`/`scene.children`; прогресс perf-бюджет стянуть в CI `aggregate / report` (сейчас только pass/fail).

### Стабильность/регрессии
- Удельный индикатор: доля воспроизводимых хэшей по seed за 100×3 (уже `deterministicOk=100` как gate).
- После каждого gv bump — замер «кол-во бит на отчёт» (байты `generation-report.json` Δ) — ранний сигнал размывания отчёта.

## 6. Что делать дальше (по R1/R2) с учётом выводов

- Сначала push/profile: единый PR `feat(citygen): R1 relief + R2 validator wave` вместо инкрементов по одному чекбоксу; тот же gv bump; одно окно CI; один evidence-PR по закрытии секции.
- R1.2 (карта уклонов/классификация) уже реализован; добавить тесты/формализовать DoD. R1.1: коммит-таймлай порядка модификаторов (large→mid→rivers→terraces→platforms) — есть; R1.3 (резервация плоских участков + ориентиры) — есть; R1.4 (гидрология по правилам) — есть (меандры/поймa/притоки); R1.5 — исторические переправы — есть; R1.6 — тесты — добавить.
- R2.4/R2.8/R2.6/R2.7 — сначала read-only валидатор + метрики (причинный метод), затем ограничение/repair; каждый шаг — CI только при зелёной серии. R2.2/R2.3 — в существующем x-monotone/profile-driven уже частично; формализовать, не расширять категорию ради категории.
- Итог сессии в `.ai/state/citygen-procedural-rules.md`: формализация чеклиста по окончании секции R1/R2 единым блоком (экономия ~4–5 мин × закрываемых чекбоксов).

## 7. Риски коррекции
- Ускорение **не** означает ослабление CI/гейтов; любой пресет скорости — поверх существующей схемы `scripts/agent/*`, с сохранением required jobs.
- Единый PR на зону съедает детерминизм атомарности diff: риски — больше конфликтов с параллельными линиями; компенсация — worktree isolation + строго последовательный merge целых секций (как сегодня).
- `--reports-only` разрешает обновлять IR-хэши только когда IR не изменился; флаг применяется только при подтверждённом отсутствии изменений в чанках (сейчас это все R5.x метрики PR).
