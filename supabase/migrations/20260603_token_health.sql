-- Proaktiv token-monitorering: metadata-tabell (hemligheter stannar i env/platform_tokens).
-- token-health-cronen skriver hit dagligen; Operations Center + Action Center läser härifrån.

create table if not exists public.token_health (
  platform              text primary key,           -- 'instagram' | 'facebook' | 'youtube'
  expires_at            timestamptz,                -- null = okänt / ej tillämpligt (youtube)
  days_left             integer,                    -- null = ej tillämpligt
  status                text not null default 'unknown',  -- ok | warning | expired | error | unknown
  last_verified_at      timestamptz,
  last_refreshed_at     timestamptz,
  last_error            text,
  last_warned_threshold integer,                    -- dedupe av larm: 14 | 7 | 3 | 0
  updated_at            timestamptz not null default now()
);
revoke all on public.token_health from anon, authenticated;
grant all on public.token_health to service_role;

insert into public.token_health (platform, status) values
  ('instagram','unknown'), ('facebook','unknown'), ('youtube','unknown')
on conflict (platform) do nothing;

-- IG-refresh: månadsvis → veckovis (måndag 06:00 UTC) — minskar utgångsfönstret.
select cron.schedule('omnira_refresh_tokens', '0 6 * * 1', $$select omnira_cron.call_vercel('/api/media/cron/refresh-tokens')$$);
-- Daglig token-hälsokoll 06:15 UTC.
select cron.schedule('omnira_token_health', '15 6 * * *', $$select omnira_cron.call_vercel('/api/media/cron/token-health')$$);
