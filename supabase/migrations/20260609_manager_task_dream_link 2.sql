-- ─────────────────────────────────────────────────────────────────────────────
--  Dream → Action loop: link manager_tasks back to their originating source.
--  ─────────────────────────────────────────────────────────────────────────────
--  Reuses the existing manager_tasks table (no parallel task system). Adds:
--    - owner       : who the task is assigned to (Atlas sets this)
--    - source      : origin system, e.g. 'dream'
--    - source_key  : the originating record's key (for dream: the memories.key,
--                    i.e. 'dream_<date>_<category>') so a task references the
--                    exact Dream finding it was created from.
--
--  Dream-finding lifecycle (OPEN / IN_PROGRESS / COMPLETED) is DERIVED from the
--  linked task's existing status — no lifecycle column is added to memories:
--    no task / failed / cancelled        → OPEN
--    task pending or in_progress         → IN_PROGRESS
--    task done                           → COMPLETED
--
--  All additive + idempotent. No data migration, no constraint changes.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.manager_tasks add column if not exists owner      text;
alter table public.manager_tasks add column if not exists source     text;
alter table public.manager_tasks add column if not exists source_key text;

-- Fast lookup + idempotency for "does a task already exist for this finding?"
create index if not exists idx_manager_tasks_source
  on public.manager_tasks (project_id, source, source_key);
