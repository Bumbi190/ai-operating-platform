-- Del 1 (Stripe Intelligence): daglig aggregat-snapshot av prenumerations-KPI:er,
-- beräknad FRÅN Stripe (source of truth). Inga per-prenumeration-rader, ingen
-- lokal billinglogik.
create table if not exists public.revenue_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid references public.projects(id) on delete set null,
  snapshot_date      date not null default (now() at time zone 'utc')::date,
  captured_at        timestamptz not null default now(),
  active_subscribers integer,
  new_subscribers    integer,
  trialing           integer,
  churned_this_month integer,
  mrr_sek            numeric(12,2),
  revenue_month_sek  numeric(12,2),
  currency           text default 'sek',
  raw                jsonb,
  unique (project_id, snapshot_date)
);
create index if not exists revenue_snapshots_proj_date_idx
  on public.revenue_snapshots (project_id, snapshot_date desc);
alter table public.revenue_snapshots enable row level security;
