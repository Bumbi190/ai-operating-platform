-- ─────────────────────────────────────────────────────────────────────────────
--  Dream issue ledger — stable identity + recurrence for self-improvement.
--  ─────────────────────────────────────────────────────────────────────────────
--  Problem: Dream writes date/day-stamped memory keys (dream_2026-06-08_x_day3,
--  dream_2026-06-09_x_day4) for the SAME underlying issue, so dedup/lifecycle
--  fragment across nights.
--
--  Design:
--    - memories (dream_*)  : unchanged — the immutable nightly observation log.
--    - dream_issues        : the stable issue ledger (this table). One row per
--                            real issue per project, keyed by a stable issue_id.
--                            Recurring findings UPDATE the same row (occurrences,
--                            last_seen_at, latest_*) instead of forking lifecycle.
--    - manager_tasks       : unchanged — the execution layer.
--
--  Lifecycle (open / in_progress / completed) is NOT stored here — it is DERIVED
--  from the linked manager_task status (single source of truth = manager_tasks):
--    no/failed/cancelled task -> open ; pending|in_progress -> in_progress ;
--    done -> completed. We only store the LINK (manager_task_id).
--
--  Additive + idempotent. memories untouched; existing dream data preserved.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.dream_issues (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  issue_id          text not null,                 -- stable identity (slug), reused across nights
  title             text,
  severity          text,                          -- latest observed severity
  latest_insight    text,
  latest_action     text,
  latest_memory_key text,                          -- newest memories.key for this issue (traceability)
  manager_task_id   uuid references public.manager_tasks(id) on delete set null,
  occurrences       int  not null default 1,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (project_id, issue_id)
);

create index if not exists idx_dream_issues_project on public.dream_issues (project_id);
create index if not exists idx_dream_issues_task    on public.dream_issues (manager_task_id);

-- ── Backfill: map each existing dream memory to a stable issue_id ─────────────
--  issue_id is derived from the memory key by stripping the dream_ prefix, the
--  date segment, and trailing _dayN / _N counters. This satisfies "existing
--  findings mapped to a stable issue_id" and preserves history. It does NOT
--  retroactively merge historical day3/day4 variants (that needs semantics);
--  identity is stable from here forward. Keep the newest memory per derived id.
insert into public.dream_issues
  (project_id, issue_id, title, severity, latest_insight, latest_action, latest_memory_key, occurrences, first_seen_at, last_seen_at)
select
  d.project_id,
  d.issue_id,
  d.insight                         as title,
  d.severity,
  d.insight                         as latest_insight,
  d.action                          as latest_action,
  d.key                             as latest_memory_key,
  d.occurrences,
  d.first_seen,
  d.last_seen
from (
  select
    m.project_id,
    -- derive a stable-ish issue_id from the dated key
    regexp_replace(
      regexp_replace(m.key, '^dream_[0-9]{4}-?[0-9]{2}-?[0-9]{2}_', ''),  -- strip dream_<date>_
      '_(day)?[0-9]+$', ''                                                 -- strip trailing _dayN / _N
    ) as issue_id,
    m.key,
    -- parse "[SEV] insight → action"
    lower(coalesce(substring(m.value from '^\[(CRITICAL|WARNING|INFO)\]'), 'info')) as severity,
    trim(both ' ' from regexp_replace(split_part(regexp_replace(m.value, '^\[[A-Z]+\]\s*', ''), '→', 1), '\s+$', '')) as insight,
    nullif(trim(both ' ' from split_part(regexp_replace(m.value, '^\[[A-Z]+\]\s*', ''), '→', 2)), '') as action,
    m.updated_at,
    1 as occurrences,
    m.updated_at as first_seen,
    m.updated_at as last_seen,
    row_number() over (
      partition by m.project_id,
        regexp_replace(regexp_replace(m.key, '^dream_[0-9]{4}-?[0-9]{2}-?[0-9]{2}_', ''), '_(day)?[0-9]+$', '')
      order by m.updated_at desc
    ) as rn
  from public.memories m
  where m.key like 'dream_%'
) d
where d.rn = 1
on conflict (project_id, issue_id) do nothing;
