# Лог выполнения работ: citygen procedural rules (план 21)

Правила: время зафиксировано в минутах; `~` = примерная оценка по печати команд; точные цифры в `date` перед/после.

## 2026-11-16
- Создание `.ai/state/citygen-seed-series/series-summary.json` (100 seed × 3 профиля, `--json`, `hardFailures=0`): ~3 мин.
- Исправление кодировки `series-summary-transport.json` (UTF-8 без BOM, после фич-бенчмарка `citygen-seed-series.mjs`): ~1 мин.
- Добавление `generatorVersion` → `0.2.0`, пересборка derived L16–L21, re-baseline эталонов/базовых (`citygen-etalon-check --update --generatorVersion 0.2.0`, 16 updated): ~6–8 мин (build-level ×6 + browser-gated regenerate).
- `bump 0.3.0` (main arterial bridges) + derived/etalons re-baseline (100-seed transport series re-run): ~10 мин.
- `bump 0.4.0` (cost-path A*) + derived/etalons re-baseline: ~7–9 мин.
- Bump 0.4.0 ассоциированные `etalon-check --update`: ~1 мин.
- Прогон `node --test tools/citygen.test.mjs`: ~20–25 с.
- R2.6 partial (tunnel validator в `rules.mjs` + автотест, без bump): ~25 мин (чтение схемы компилятора, тест, фикстуры).
- R2.8 partial (junction class/type validator в `rules.mjs` + автотест, без bump): ~20 мин.
- R3.1 (инкремент 1: `buildCoreCandidates` + тест + bump `generatorVersion` → 0.6.0, derived L16–L22, baselines/etalons, transport-серия под 0.6.0): ~12:42–12:56 (~14 мин).
- R3.1 (инкремент 2: §6.1-faithful multiplicative scoring — брод×3/слияние×2/холм×2/ровная площадка 150 м×2/озеро×1 − пойма 2, re-baseline + обе серии seed-100 перепрогнаны под 0.6.0): ~12:58–13:09 (~11 мин).
- R3.2 (computeAccessCostField + assignErasToDistricts в `stage-3-districts.mjs`, bump → 0.7.0, derived/etalons/baselines + обе серии seed-100 под 0.7.0, автотест): ~13:10–13:29 (~19 мин).
- R3.3 (computeLandValue + affinity §6.5 + density/floors, bump → 0.8.0, derived/etalons/baselines + обе серии seed-100 под 0.8.0, автотест): ~13:30–13:47 (~17 мин).
- Прогон `node tools/citygen-etalon-check.mjs`: ~10–15 с.
- `build-level --check` для L16–L21: ~1 мин на прогон.
- `ci-browser.mjs --level 17|20|21 level-lifecycle` (через `NODE_PATH=$(npm root --global)`): ~1 мин на главу (15 сюит прогона, только одна глава).
- **Создание small v4 `level-22`** как быстрая тестовая глава: ~10 мин (файл карты, регистрация в реестре, `build-level`, `check-levels`, `ci-browser` smoke).
- Итог мок-файла: `src/levels/level-22.json` (реестр, индексы/каталоги), `build-level --check` зелёный, `ci-browser --level 22 level-contract` 8/8 PASS, `open-world.test.js` 2/2 PASS, `level-lifecycle` 4/5 (красная perf-проверка `reload-scene-budget` — исключена из DoD владельцем 2026-11-16).
- Примечание: `AGENTS.md` и `docs/prompts/010.md` изменены владельцем (разрешение ставить Playwright), правок не вношу.
