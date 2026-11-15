/**
 * Level Editor MVP — технический план
 *
 * Цель: браузерный редактор поверх `tools/level-visualizer.html` (не заменять его):
 * выбор/создание/правка CityForge-узлов и элементов дорог/мостов/съездов, базируясь
 * на `source`-JSON (`src/levels/level-NN.json`), с пересборкой/проверкой и live preview.
 *
 * Non-goals (MVP): редактирование compiled `.l14b`, произвольные B-spline, разметка полос,
 * серверная запись файла в репозиторий, мультипользовательская работа.
 */

# TASK-001 — Структура страницы и общий каркас
- [x] Создать `tools/level-editor.html` на основе `level-visualizer.html`.
- [x] Создать `tools/level-editor/` (модули редактора) и подключить их вместо/поверх visualizer UI.
- [x] Кастомный CSS редактора (`tools/level-editor/editor.css`) без поломки `visualizer/style.css`.
- [x] URL-state: `?level=19&view=top&tool=select&grid=0&snap=5` (частично: без `labels`).

# TASK-002 — Source-редактирование без compiled-слоя
- [x] Убрать зависимость от `detail`/compiled как от редактируемого источника.
- [x] Редактируемое состояние хранится как `draft` (глубокая копия JSON).
- [x] Кнопки: `Download JSON`, `Revert` (скачивание/откат); preview обновляется после каждого изменения.
- [x] `compiled` остаётся доступен только через существующий visualizer, но не правится.

# TASK-003 — Модель данных для редактора
- [x] `tools/level-editor/source-model.js`: черновик, селекторы узлов/сегментов/элементов.
- [x] Поддержка element-форм: `plate` и `arc`.
- [x] Генератор пресетов: ground road, bridge, ramp, left/right arc, taper.
- [x] Undo/redo по JSON-снапшотам (100 шагов).

# TASK-004 — Рендер preview из draft
- [x] Preview-only renderer/инстанс сцены, построенный из draft-данных (не из `.l14b`).
- [x] Упрощённые примитивы: plate → призма по слою; arc → ribbon-сектор; rails → линии.
- [x] Подсветка выбранного узла/сегмента/элемента (белый/яркий материал).
- [ ] Отладочные подписи элементов (не в MVP).

# TASK-005 — Инструменты редактирования
- [x] Tool modes: `select`, `move`, `add-node`, `add-segment`, `add-arc`, `delete` (+ validate/duplicate/download/save).
- [x] Snap к сетке и к ближайшим существующим узлам для `add-segment`/`add-arc` (радиус max(2 м, snap)); snap к осевым рёбрам — не в MVP.
- [x] Drag выбранного объекта и его концов `A/B` в `top` view (плавный preview, snap результата на pointer-up; plate пересчитывает x/z/yaw/length/y/rise, arc — угол и radius).
- [x] Delete selected (`Delete`/кнопка); узел с привязанными сегментами просит подтверждение.
- [x] Дублирование сегмента (offset на 10 м, кнопка в инспекторе).

# TASK-006 — Инспектор параметров
- [x] Для сегмента: `id`, `type`, `layer`, `from`, `to`, действия (`duplicate`, `+ plate`, `+ arc`).
- [x] Для plate: `x`, `z`, `yaw`, `length`, `width`, `y`, `rise`, `rails`, `widthEnd`, `crossStart`, `crossEnd`.
- [x] Для arc: `cx`, `cz`, `radius`, `from`, `to`, `width`, `y0`, `y1`, `bank`, `rails`.
- [x] Поля применяются по `input` с live preview; `change`/blur фиксирует шаг в undo; валидация в `Validate`.

# TASK-007 — Диагностика до сборки
- [x] Быстрые проверки: дубли `id`, отсутствующие `from/to`, нулевая длина, `radius < 2`, arc span == 0, plate `width < 2`, `layer` вне allowlist, spawn/exit, границы плиты.
- [x] Кнопка `Validate` + панель с кликабельными Ref (`node:`, `segment:`, `element:seg:index`).

# TASK-008 — Экспорт/интеграция
- [x] `Download JSON` (скачивает draft как `level-NN.json`).
- [x] `Save JSON` через local dev-endpoint `tools/level-editor-server.mjs --write` (`POST /api/level/<NN>`; без `--write` — 403, `dryRun=1` доступен для проверки).
- [x] `Build + Check` через `/api/level/<NN>/rebuild` (fixed commands, timeout/output cap) + чекбокс `build+check` для авто-запуска после успешного `Save JSON`.
- [x] README (`tools/level-editor/README.md`) с ограничениями и шагами пересборки для обоих вариантов.

# TASK-009 — Проверка
- [x] `node --test tools/visualizer/model.test.mjs` — 11/11 зелёные (ожидания level-18/19 обновлены под текущие пересобранные каталоги).
- [x] `node --check` всех новых JS.
- [x] Ручной smoke: `http://localhost:8124/tools/level-editor.html?level=19&tool=select` — загрузка, выбор arc на плане, undo/redo, add-node + `Ctrl+Z`, `Validate` ("ошибок нет"), `Download`/`Revert` реализованы (скачивание не проверялось программно).
- [x] `node tools/check-levels.mjs` — 36/36 зелёные (проверялось ранее для текущего рабочего дерева).
- [x] Сервер редактора перезапущен с `--write` на 8124; кнопки `Save JSON` / `Build + Check` и чекбокс `build+check` видны в UI; сама сборка level-19 при проверке UI не запускалась.
