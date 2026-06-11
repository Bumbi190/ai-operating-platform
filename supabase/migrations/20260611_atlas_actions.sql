-- Atlas Actions — episodic action ledger (Phase 1).
--
-- Append-only record of actions Atlas ACTUALLY performed, written at tool-success
-- time. Lets Atlas answer "what did you just do?" from memory instead of
-- re-fetching domain tables. Phase 1 records only: dream_delegation, workflow_run.
--
-- Project-isolated (project_id), conversation link optional. This is the episodic
-- foundation; semantic rollups into `memories` are intentionally NOT part of Phase 1.

create table if not exists atlas_actions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references projects(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  actor           text not null default 'Atlas',
  action_type     text not null,           -- 'dream_delegation' | 'workflow_run' (Phase 1)
  tool_name       text not null,           -- e.g. delegate_dream_finding, trigger_workflow
  target_kind     text,                    -- 'manager_task' | 'run'
  target_id       text,                    -- created/affected row id (task_id, run_id)
  summary         text not null,           -- human-readable one-liner
  detail          jsonb,                   -- structured extras (issue_id, workflow_id, …)
  status          text,                    -- outcome status if relevant
  created_at      timestamptz not null default now()
);

create index if not exists atlas_actions_project_recent
  on atlas_actions (project_id, created_at desc);
create index if not exists atlas_actions_conversation_recent
  on atlas_actions (conversation_id, created_at desc);
