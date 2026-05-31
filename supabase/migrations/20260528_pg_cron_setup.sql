-- ═══════════════════════════════════════════════════════════════════════════════
--
--   OMNIRA · pg_cron schemaläggare för media-pipeline
--   ──────────────────────────────────────────────────
--   Ersätter Vercel Hobby-planens cron-jobs (max 2/dag, daglig granularitet)
--   med Supabase pg_cron som klarar vilket schema som helst.
--
--   Replikerar exakt samma 12 jobs som vercel.json definierade:
--
--     Morgon UTC:  06:30 news → 07:20 step1 → 07:25 step2 → 07:30 step3
--                  → 07:45 step4 → 08:00 publish
--     Kväll UTC:   17:20 step1 → 17:25 step2 → 17:30 step3 → 17:45 step4
--                  → 18:00 publish
--     Månadsvis:   1:a kl 06:00 UTC token refresh
--
--   Kör hela filen som en transaktion i Supabase SQL Editor.
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Aktivera extensions ─────────────────────────────────────────────────────
create extension if not exists pg_cron with schema cron;
create extension if not exists pg_net with schema extensions;

-- ── 2. Config-tabell för CRON_SECRET + base URL ────────────────────────────────
--
--   OBS: Detta är en privat tabell (RLS aktiv, inga policies) så bara service-role
--   kan läsa den. pg_cron körs som superuser internt och kommer alltid åt den.

create schema if not exists omnira_cron;

create table if not exists omnira_cron.config (
  id          int primary key default 1,
  base_url    text not null,
  cron_secret text not null,
  updated_at  timestamptz not null default now(),
  constraint single_row check (id = 1)
);

alter table omnira_cron.config enable row level security;
revoke all on omnira_cron.config from anon, authenticated;

-- ── 3. Sätt din production-URL och CRON_SECRET ─────────────────────────────────
--
--   ★ DU MÅSTE ÄNDRA DESSA TVÅ VÄRDEN INNAN DU KÖR FILEN ★
--
--   base_url    = Din Vercel production-URL utan trailing slash
--                 t.ex. https://ai-operating-platform-web.vercel.app
--                 (eller din custom domain om du har en)
--
--   cron_secret = Samma värde som CRON_SECRET i Vercel → Project → Settings
--                 → Environment Variables. Kopiera exakt värdet därifrån.

insert into omnira_cron.config (id, base_url, cron_secret)
values (
  1,
  'https://CHANGE_ME.vercel.app',            -- ⚠️ byt ut
  'CHANGE_ME_TO_VERCEL_CRON_SECRET'          -- ⚠️ byt ut
)
on conflict (id) do update
  set base_url    = excluded.base_url,
      cron_secret = excluded.cron_secret,
      updated_at  = now();

-- ── 4. Helper-funktion som anropar Vercel-endpoints ────────────────────────────
--
--   Skickar GET-anrop till {base_url}/{path} med korrekt Authorization-header.
--   pg_net kör asynkront — den returnerar ett request_id direkt och svaret lagras
--   i extensions.net._http_response (queryable i ~24h för felsökning).

create or replace function omnira_cron.call_vercel(p_path text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
  v_req_id bigint;
begin
  select base_url, cron_secret
    into v_url, v_secret
    from omnira_cron.config
   where id = 1;

  if v_url is null or v_secret is null then
    raise exception 'omnira_cron.config saknas eller är ofullständig';
  end if;

  -- Strip trailing slash from base, ensure path starts with slash
  v_url := rtrim(v_url, '/');
  if left(p_path, 1) <> '/' then
    p_path := '/' || p_path;
  end if;

  select net.http_get(
    url     := v_url || p_path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type',  'application/json'
    )
  ) into v_req_id;

  return v_req_id;
end;
$$;

-- ── 5. Rensa eventuella tidigare scheman (idempotent) ──────────────────────────

do $$
declare
  job_names text[] := array[
    'omnira_news_morning',
    'omnira_step1_morning', 'omnira_step2_morning',
    'omnira_step3_morning', 'omnira_step4_morning',
    'omnira_publish_morning',
    'omnira_step1_evening', 'omnira_step2_evening',
    'omnira_step3_evening', 'omnira_step4_evening',
    'omnira_publish_evening',
    'omnira_refresh_tokens'
  ];
  n text;
begin
  foreach n in array job_names loop
    perform cron.unschedule(n) where exists (
      select 1 from cron.job where jobname = n
    );
  end loop;
end $$;

-- ── 6. Schemalägg 12 jobs ──────────────────────────────────────────────────────
--
--   Identisk timing med tidigare vercel.json — bara flyttat till Supabase.

select cron.schedule('omnira_news_morning',     '30 6 * * *',  $$select omnira_cron.call_vercel('/api/media/news/cron');$$);

select cron.schedule('omnira_step1_morning',    '20 7 * * *',  $$select omnira_cron.call_vercel('/api/media/cron/step1');$$);
select cron.schedule('omnira_step2_morning',    '25 7 * * *',  $$select omnira_cron.call_vercel('/api/media/cron/step2');$$);
select cron.schedule('omnira_step3_morning',    '30 7 * * *',  $$select omnira_cron.call_vercel('/api/media/cron/step3');$$);
select cron.schedule('omnira_step4_morning',    '45 7 * * *',  $$select omnira_cron.call_vercel('/api/media/cron/step4');$$);
select cron.schedule('omnira_publish_morning',  '0 8 * * *',   $$select omnira_cron.call_vercel('/api/media/cron/publish');$$);

select cron.schedule('omnira_step1_evening',    '20 17 * * *', $$select omnira_cron.call_vercel('/api/media/cron/step1');$$);
select cron.schedule('omnira_step2_evening',    '25 17 * * *', $$select omnira_cron.call_vercel('/api/media/cron/step2');$$);
select cron.schedule('omnira_step3_evening',    '30 17 * * *', $$select omnira_cron.call_vercel('/api/media/cron/step3');$$);
select cron.schedule('omnira_step4_evening',    '45 17 * * *', $$select omnira_cron.call_vercel('/api/media/cron/step4');$$);
select cron.schedule('omnira_publish_evening',  '0 18 * * *',  $$select omnira_cron.call_vercel('/api/media/cron/publish');$$);

select cron.schedule('omnira_refresh_tokens',   '0 6 1 * *',   $$select omnira_cron.call_vercel('/api/media/cron/refresh-tokens');$$);

-- ── 7. Verifiera att allt är på plats ──────────────────────────────────────────
--
--   När du kört filen, kör denna query separat för att se att alla 12 jobs är
--   schemalagda:
--
--     select jobname, schedule, active from cron.job order by jobname;
--
--   För att se senaste körningar (efter att första cron har triggat):
--
--     select * from cron.job_run_details
--      order by start_time desc
--      limit 20;
--
--   För att se HTTP-svaren från Vercel:
--
--     select id, status_code, content::text, created
--       from extensions.net._http_response
--      order by created desc
--      limit 20;
