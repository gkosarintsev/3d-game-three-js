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
- Прогон `node tools/citygen-etalon-check.mjs`: ~10–15 с.
- `build-level --check` для L16–L21: ~1 мин на прогон.
- `ci-browser.mjs --level 17|20|21 level-lifecycle` (через `NODE_PATH=$(npm root --global)`): ~1 мин на главу (15 сюит прогона, только одна глава).
- **Создание small v4 `level-22`** как быстрая тестовая глава: ~10 мин (файл карты, регистрация в реестре, `build-level`, `check-levels`, `ci-browser` smoke).
- Итог мок-файла: `src/levels/level-22.json` (реестр, индексы/каталоги), `build-level --check` зелёный, `ci-browser --level 22 level-contract` 8/8 PASS, `open-world.test.js` 2/2 PASS, `level-lifecycle` 4/5 (красная perf-проверка `reload-scene-budget` — исключена из DoD владельцем 2026-11-16).
- Примечание: `AGENTS.md` и `docs/prompts/010.md` изменены владельцем (разрешение ставить Playwright), правок не вношу.
