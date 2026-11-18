# Состояние: параллельные AI-агенты и GitHub CI-only (план 22)

Дата старта: 2026-11-19  
План: `.ai/plans/22-parallel-agents-github-ci.md`  
Ветка реализации: `agent/plan22-implementation` (worktree: основной репозиторий/выделенный worktree по ходу работ)

## Решения (R1)
- [x] `[TASK-PAR-001]` Профили CI: `full` (текущий набор), `fast` (для `agent/**` push и `workflow_dispatch`), `scoped` (dispatch с параметрами). Реализация — V-A: условия/inputs в `.github/workflows/ci.yml`.
- [x] `[TASK-PAR-002]` Result-файлы: `.ai/state/ci-results/<sanitized-branch>.json|.md|-failed.log` (+ опционально скачанные артефакты), gitignored.
- [x] `[TASK-PAR-003]` Политика веток/merge задокументирована в плане/протоколе; GitHub branch protection (required checks) — настройка на стороне репозитория (вне кода), рекомендация зафиксирована.

## Прогресс задач
- [x] `[TASK-PAR-004]` `scripts/agent/check-env.mjs`
- [x] `[TASK-PAR-005]` `scripts/agent/ci-watch.mjs`
- [x] `[TASK-PAR-006]` `scripts/agent/worktree-new.mjs` + документация
- [x] `[TASK-PAR-007]` CI профили fast/scoped (MVP) в `ci.yml`
- [~] `[TASK-PAR-008]` Машиночитаемые артефакты/summary для fast-профиля (частично, follow-up)
- [x] `[TASK-PAR-009]` Concurrency/балансировка (per-ref cancel-in-progress, fast-path)
- [x] `[TASK-PAR-010]` `AGENTS.md` обновлён протоколом
- [x] `[TASK-PAR-011]` `.ai/prompts/agent-ci-protocol.md`
- [x] `[TASK-PAR-012]` `docs/architecture-testing.md` обновлён
- [ ] `[TASK-PAR-013]` Пилот: 2–3 параллельных worktree/ветки, fast CI-loop зелёный
- [ ] `[TASK-PAR-014]` Пилот self-healing (намеренная ошибка → фиксация в result-файлах → исправление → SUCCESS)
- [ ] `[TASK-PAR-015]` Пилот пересборки/детерминизма в CI
- [ ] `[TASK-PAR-016]` Постепенный merge пилотных веток, метрики зафиксированы

## Журнал выполнения
- 2026-11-19: создан стейт, начата реализация R1–R4.
- 2026-11-19: добавлены `scripts/agent/{check-env,ci-watch,worktree-new}.mjs`, обновлены `.gitignore`, `.github/workflows/ci.yml` (fast-path для `agent/**`), `AGENTS.md`, `docs/architecture-testing.md`, `.ai/prompts/agent-ci-protocol.md`. Подготовка коммита и валидации в GitHub CI.

## Пилоты / CI runs
(заполняется по мере выполнения)

## Метрики и заметки
(заполняется по мере выполнения)
