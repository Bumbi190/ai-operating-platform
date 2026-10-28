-- ─────────────────────────────────────────────────────────────────────────────
-- PROPOSED — NOT APPLIED. Do not move into apps/web/supabase/migrations or run
-- apply_migration until the owner has reviewed cost and security (see
-- docs/workflows/the-prompt-article-factcheck-v1.md, "Activation").
--
-- Durable queue for The Prompt website articles (Workflow B). One row per
-- (project, news item). It references website_content (System A) and projects
-- only; media_scripts / social tables are deliberately NOT referenced, so the
-- social pipeline (Workflow A) cannot be blocked or altered by this table.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.website_article_jobs (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  news_item_id       uuid not null,                 -- soft ref, same convention as website_content
  media_script_id    uuid,                          -- soft provenance: the social selection that triggered it
  external_id        text not null unique,          -- = publish contract external_id (omnira_<news_item_id>)
  state              text not null default 'queued'
                       check (state in ('queued','running','saved','blocked','failed','cancelled')),
  attempts           int  not null default 0 check (attempts >= 0),
  max_attempts       int  not null default 3 check (max_attempts between 1 and 5),
  lease_token        uuid,
  lease_expires_at   timestamptz,
  next_attempt_at    timestamptz not null default now(),
  checkpoint         jsonb not null default '{}'::jsonb,
  website_content_id uuid references public.website_content(id) on delete set null,
  last_error         text,
  cost_usd           numeric not null default 0 check (cost_usd >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  finished_at        timestamptz,
  unique (project_id, news_item_id)
);

create index if not exists idx_website_article_jobs_due
  on public.website_article_jobs (next_attempt_at)
  where state in ('queued','running');

create index if not exists idx_website_article_jobs_recent
  on public.website_article_jobs (project_id, created_at desc);

alter table public.website_article_jobs enable row level security;
revoke all on public.website_article_jobs from anon, authenticated;
grant select on public.website_article_jobs to authenticated;

drop policy if exists "website_article_jobs_owner_read" on public.website_article_jobs;
create policy "website_article_jobs_owner_read"
  on public.website_article_jobs for select to authenticated
  using (project_id in (select id from projects where owner_id = auth.uid()));

-- Enqueue: idempotent per news item, with a rolling-24h cap enforced under a
-- per-project advisory lock so concurrent cron runs cannot both pass the cap.
create or replace function public.website_article_job_enqueue(
  p_project_id uuid, p_news_item_id uuid, p_media_script_id uuid,
  p_external_id text, p_daily_max int, p_max_attempts int
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtext('website_article_job_enqueue:' || p_project_id::text));
  if exists (select 1 from website_article_jobs
             where project_id = p_project_id and news_item_id = p_news_item_id) then
    return 'exists';
  end if;
  select count(*) into v_count from website_article_jobs
   where project_id = p_project_id and created_at > now() - interval '24 hours';
  if v_count >= p_daily_max then
    return 'daily_cap';
  end if;
  insert into website_article_jobs (project_id, news_item_id, media_script_id, external_id, max_attempts)
  values (p_project_id, p_news_item_id, p_media_script_id, p_external_id, p_max_attempts)
  on conflict do nothing;
  return case when found then 'enqueued' else 'exists' end;
end $$;

-- Claim one due job. SKIP LOCKED + a fresh lease token: two concurrent workers
-- can never hold the same job, and a worker whose lease expired is fenced out
-- of every later write (all writes match on lease_token).
create or replace function public.website_article_job_claim(p_lease_seconds int)
returns setof public.website_article_jobs
language plpgsql security definer set search_path = public as $$
begin
  -- A job whose worker died after its last permitted attempt is failed, not retried forever.
  update website_article_jobs
     set state = 'failed', lease_token = null, finished_at = now(), updated_at = now(),
         last_error = coalesce(last_error || ' | ', '') || 'lease_expired_after_max_attempts'
   where state = 'running' and lease_expires_at < now() and attempts >= max_attempts;

  return query
  with c as (
    select id from website_article_jobs
     where ((state = 'queued' and next_attempt_at <= now())
         or (state = 'running' and lease_expires_at < now()))
       and attempts < max_attempts
     order by next_attempt_at
     limit 1
     for update skip locked
  )
  update website_article_jobs j
     set state = 'running',
         lease_token = gen_random_uuid(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         attempts = j.attempts + 1,
         updated_at = now()
    from c
   where j.id = c.id
  returning j.*;
end $$;

-- Finish a run. Fenced on lease_token; returns false when the lease was lost.
--   p_outcome: saved | blocked | failed | retry | deferred
--   retry    → queued again with back-off, or failed once attempts are exhausted
--   deferred → queued again later and the attempt is NOT counted (cost gate / stop)
create or replace function public.website_article_job_finish(
  p_id uuid, p_lease_token uuid, p_outcome text, p_reason text,
  p_website_content_id uuid, p_checkpoint jsonb, p_cost_usd numeric, p_delay_seconds int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_job website_article_jobs;
begin
  select * into v_job from website_article_jobs
   where id = p_id and lease_token = p_lease_token and state = 'running'
   for update;
  if not found then
    return false;
  end if;

  update website_article_jobs set
    state = case
      when p_outcome in ('saved','blocked','failed') then p_outcome
      when p_outcome = 'retry' and v_job.attempts >= v_job.max_attempts then 'failed'
      else 'queued' end,
    attempts = case when p_outcome = 'deferred' then greatest(v_job.attempts - 1, 0) else v_job.attempts end,
    next_attempt_at = now() + make_interval(secs => greatest(coalesce(p_delay_seconds, 0), 0)),
    lease_token = null,
    lease_expires_at = null,
    last_error = left(p_reason, 4000),
    website_content_id = coalesce(p_website_content_id, v_job.website_content_id),
    checkpoint = coalesce(p_checkpoint, v_job.checkpoint),
    cost_usd = greatest(coalesce(p_cost_usd, v_job.cost_usd), v_job.cost_usd),
    finished_at = case when p_outcome in ('saved','blocked','failed')
                         or (p_outcome = 'retry' and v_job.attempts >= v_job.max_attempts)
                       then now() else null end,
    updated_at = now()
  where id = p_id;
  return true;
end $$;

revoke all on function public.website_article_job_enqueue(uuid, uuid, uuid, text, int, int) from public, anon, authenticated;
revoke all on function public.website_article_job_claim(int) from public, anon, authenticated;
revoke all on function public.website_article_job_finish(uuid, uuid, text, text, uuid, jsonb, numeric, int) from public, anon, authenticated;
grant execute on function public.website_article_job_enqueue(uuid, uuid, uuid, text, int, int) to service_role;
grant execute on function public.website_article_job_claim(int) to service_role;
grant execute on function public.website_article_job_finish(uuid, uuid, text, text, uuid, jsonb, numeric, int) to service_role;
