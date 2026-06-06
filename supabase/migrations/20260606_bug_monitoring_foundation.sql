-- ─────────────────────────────────────────────────────────────────────────────
--  Buggövervakning — Foundation (PLAN: OMNIRA_BUGSCAN_ORCHESTRATOR_PLAN.md)
--
--  ENBART datamodell. Ingen kod-logik, ingen UI, ingen LLM. Inert tills lib +
--  endpoints kopplas på i senare PR.
--
--  Två källor, en samlad vy i Omnira:
--    • push   — direktfångade fel (source='system') + användarrapporter ('user')
--    • scan   — daglig tyst-fel-scan via varje projekts EGNA bugscanner
--
--  Severitet styr routing: 'critical' → akut-mail; 'warning'/'info' → bara panel.
--
--  Mönster följer kodbasen: public-schema, service-role-åtkomst (RLS PÅ, inga
--  policies), project_id-scopat med ON DELETE CASCADE. Per-projekt-isolering:
--  Omnira korsar aldrig in i annat projekts DB — registret pekar bara på varje
--  projekts egna scanner-URL + env-nyckel för dess secret.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
--  PROJECT_SCANNERS — registret. "Allt om mina projekt samlat i Omnira."
--  En rad per projekt = orchestratorn vet vilka scanners som ska köras.
--  Secreten lagras ALDRIG i DB — bara namnet på env-variabeln som håller den.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.project_scanners (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete cascade,
  label                text not null,
  scanner_url          text not null,
  secret_env_key       text,
  enabled              boolean not null default true,
  expected_check_count int,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (project_id)
);
create index if not exists project_scanners_enabled_idx
  on public.project_scanners (enabled) where enabled = true;

-- ─────────────────────────────────────────────────────────────────────────────
--  BUG_REPORTS — push-källan. Systemfel + användarrapporter.
--  project_id nullbar = plattformsnivå-fel (Omnira själv utan specifikt projekt).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.bug_reports (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references public.projects(id) on delete cascade,
  source       text not null check (source in ('system','user','scan')),
  severity     text not null default 'warning'
                 check (severity in ('critical','warning','info')),
  title        text not null,
  detail       text,
  area         text,          -- misstänkt fil/endpoint/tjänst (om känt)
  repro        text,          -- hur felet återskapas (om känt)
  fix_prompt   text,          -- färdig mall att klistra in i Claude-chatten
  status       text not null default 'open'
                 check (status in ('open','resolved','ignored')),
  dedupe_key   text,          -- för debounce: samma fel inom kort fönster buntas
  emailed_at   timestamptz,   -- satt när akut-mail skickats (null = ej mailat)
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index if not exists bug_reports_open_idx
  on public.bug_reports (status, created_at desc);
create index if not exists bug_reports_project_idx
  on public.bug_reports (project_id, created_at desc);
-- Debounce-stöd: snabb uppslagning av senaste händelse med samma dedupe_key.
create index if not exists bug_reports_dedupe_idx
  on public.bug_reports (dedupe_key, created_at desc) where dedupe_key is not null;

-- ─────────────────────────────────────────────────────────────────────────────
--  BUGSCAN_RUNS — en rad per daglig scan-körning (orchestratorn).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.bugscan_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          int not null default 0,
  warnings    int not null default 0,
  errors      int not null default 0,
  summary     jsonb not null default '{}'::jsonb,  -- per projekt: {ok,warn,error}
  created_at  timestamptz not null default now()
);
create index if not exists bugscan_runs_started_idx
  on public.bugscan_runs (started_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
--  BUGSCAN_FINDINGS — ett fynd per check och körning. is_new = diff mot förra.
--  project_id ON DELETE SET NULL + project_name så historik överlever ett
--  borttaget projekt.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.bugscan_findings (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.bugscan_runs(id) on delete cascade,
  project_id   uuid references public.projects(id) on delete set null,
  project_name text,
  check_name   text not null,
  status       text not null check (status in ('ok','warning','error')),
  message      text,
  is_new       boolean not null default false,  -- nytt/återkommande senaste 24h
  fix_prompt   text,
  created_at   timestamptz not null default now()
);
create index if not exists bugscan_findings_run_idx
  on public.bugscan_findings (run_id);
create index if not exists bugscan_findings_new_idx
  on public.bugscan_findings (created_at desc) where is_new = true;
create index if not exists bugscan_findings_project_idx
  on public.bugscan_findings (project_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
--  RLS: PÅ för alla fyra, inga policies (endast service-role når dem — samma
--  mönster som resten av plattformens bakgrundstabeller).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.project_scanners  enable row level security;
alter table public.bug_reports        enable row level security;
alter table public.bugscan_runs       enable row level security;
alter table public.bugscan_findings   enable row level security;
