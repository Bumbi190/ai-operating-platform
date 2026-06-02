-- Fas 4a: opportunities — Atlas SAMLAR möjligheter (Feature 7). INGA auto-actions.
create table if not exists public.opportunities (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references public.projects(id) on delete set null,
  type         text not null,
  title        text not null,
  rationale    text,
  score        numeric(5,2),
  confidence   text check (confidence in ('low','medium','high')),
  evidence     jsonb,
  status       text not null default 'open' check (status in ('open','dismissed','actioned')),
  detected_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists opportunities_proj_status_score_idx
  on public.opportunities (project_id, status, score desc);

alter table public.opportunities enable row level security;
