-- Familje-Stunden Marketing Engine v1 — Fas 1 (Foundation).
-- ENDAST datamodell + engine-wiring-stöd. Ingen agent-logik, ingen UI.
-- Mönster följer befintlig kodbas: service-role-åtkomst (RLS på, inga policies),
-- spårbarhet via run_id, scoped project_id (familje-stunden). The Prompt berörs aldrig.

-- ─────────────────────────────────────────────────────────────────────────────
--  RUNS: kod-drivna marketing-workflows (kind) + nullable workflow_id
--  Marketing-runs körs av kod-handlers (inte agent-steg) → de behöver ingen
--  workflows-rad. Drainern dispatchar på 'kind' när det är satt.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.runs add column if not exists kind text;
alter table public.runs alter column workflow_id drop not null;
create index if not exists runs_kind_pending_idx
  on public.runs (created_at) where status = 'pending' and kind is not null;

-- ─────────────────────────────────────────────────────────────────────────────
--  CAMPAIGN_PLANS — en månadskampanjplan (Campaign Planner-output)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.campaign_plans (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  run_id             uuid references public.runs(id) on delete set null,
  plan_key           text not null,
  target_month       date not null,
  theme_key          text,
  theme_name         text,
  next_theme_key     text,
  status             text not null default 'draft'
                       check (status in ('draft','approved','archived','superseded')),
  campaign_angle     jsonb,
  revenue_strategy   jsonb,
  gaps               jsonb not null default '[]'::jsonb,
  human_input_needed jsonb not null default '[]'::jsonb,
  canon_level        jsonb,
  generated_at       timestamptz,
  approved_at        timestamptz,
  approved_by        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (project_id, plan_key)
);
create index if not exists campaign_plans_proj_month_idx
  on public.campaign_plans (project_id, target_month desc);
create index if not exists campaign_plans_status_idx
  on public.campaign_plans (project_id, status);
-- Endast en aktiv (draft/approved) plan per månad.
create unique index if not exists campaign_plans_active_month_uidx
  on public.campaign_plans (project_id, target_month)
  where status in ('draft','approved');

-- ─────────────────────────────────────────────────────────────────────────────
--  CAMPAIGN_BRIEFS — en content brief per planerad post (IG/FB)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.campaign_briefs (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  plan_id        uuid not null references public.campaign_plans(id) on delete cascade,
  brief_key      text not null,
  post_key       text,
  channel        text not null check (channel in ('instagram','facebook')),
  format         text not null
                   check (format in ('reel','carousel','story','single_post','fb_post','fb_event')),
  beat           text not null check (beat in ('teaser','launch','mid','bridge')),
  scheduled_week text,
  scheduled_date date,
  objective      text,
  brief_payload  jsonb,
  canon_level    jsonb,
  status         text not null default 'planned'
                   check (status in ('planned','drafting','drafted','needs_input')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (plan_id, brief_key)
);
create index if not exists campaign_briefs_plan_idx on public.campaign_briefs (plan_id);
create index if not exists campaign_briefs_status_idx on public.campaign_briefs (project_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
--  DRAFT_POSTS — ett utkast per brief (Channel Drafter-output)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.draft_posts (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  run_id        uuid references public.runs(id) on delete set null,
  brief_id      uuid not null references public.campaign_briefs(id) on delete cascade,
  draft_key     text not null,
  channel       text not null check (channel in ('instagram','facebook')),
  format        text not null
                  check (format in ('reel','carousel','story','single_post','fb_post','fb_event')),
  beat          text,
  draft_payload jsonb,
  self_check    jsonb,
  gaps          jsonb not null default '[]'::jsonb,
  needs_input   jsonb not null default '[]'::jsonb,
  canon_level   jsonb,
  status        text not null default 'drafted'
                  check (status in ('drafted','needs_input','guard_passed','guard_failed','approved','rejected','returned')),
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (brief_id, version)
);
create index if not exists draft_posts_brief_idx on public.draft_posts (brief_id);
create index if not exists draft_posts_status_idx on public.draft_posts (project_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
--  GUARD_REPORTS — en valideringsrapport per utkast (Brand/Canon Guard-output)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.guard_reports (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  run_id          uuid references public.runs(id) on delete set null,
  draft_id        uuid not null references public.draft_posts(id) on delete cascade,
  report_key      text not null,
  verdict         text check (verdict in ('approved','warning','rejected')),
  score           integer check (score between 0 and 100),
  score_breakdown jsonb,
  violations      jsonb not null default '[]'::jsonb,
  warnings        jsonb not null default '[]'::jsonb,
  gap_flags       jsonb not null default '[]'::jsonb,
  checks          jsonb,
  recommendation  text,
  evaluated_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (draft_id)
);
create index if not exists guard_reports_draft_idx on public.guard_reports (draft_id);
create index if not exists guard_reports_verdict_idx on public.guard_reports (project_id, verdict);

-- ─────────────────────────────────────────────────────────────────────────────
--  APPROVALS (återanvänd befintlig tabell — INGEN ny marketing_approvals)
--  Lägg till discriminator 'kind' + soft-FK-kolumner + marketing-statusar.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.approvals add column if not exists kind            text not null default 'workflow_output';
alter table public.approvals add column if not exists project_id      uuid references public.projects(id) on delete cascade;
alter table public.approvals add column if not exists draft_id        uuid references public.draft_posts(id) on delete cascade;
alter table public.approvals add column if not exists guard_report_id uuid references public.guard_reports(id) on delete set null;
alter table public.approvals add column if not exists fix_patch       jsonb;
alter table public.approvals add column if not exists operator        text;
alter table public.approvals add column if not exists action          text
                   check (action in ('approve','approve_with_fix','reject','return_to_drafter'));
alter table public.approvals add column if not exists decided_at      timestamptz;

-- Relaxa status-CHECK så marketing-flödets statusar ryms (befintliga behålls).
alter table public.approvals drop constraint if exists approvals_status_check;
alter table public.approvals add constraint approvals_status_check
  check (status in ('pending','approved','rejected','revised','returned','needs_input'));

create index if not exists approvals_kind_idx on public.approvals (kind);
create index if not exists approvals_marketing_idx
  on public.approvals (project_id, status) where kind = 'marketing_draft';

-- ─────────────────────────────────────────────────────────────────────────────
--  RLS — service-role-åtkomst (mönster som revenue_snapshots: RLS på, inga policies).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.campaign_plans   enable row level security;
alter table public.campaign_briefs  enable row level security;
alter table public.draft_posts      enable row level security;
alter table public.guard_reports    enable row level security;
