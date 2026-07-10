-- Semantic duplicate guard and publication idempotency for The Prompt media pipeline.
--
-- Deployment notes:
-- 1. Pause media intake, production, and publication before applying this migration.
-- 2. Review the audit rows produced by this migration before deploying app code.
-- 3. Apply this migration before the app deploy; database triggers fail closed while
--    the previous app version is still running.
-- 4. Rollback is forward-only for data state: drop the new indexes/functions only after
--    confirming no app version still calls them.

begin;

create table if not exists public.media_duplicate_guard_migration_audit (
  id uuid primary key default gen_random_uuid(),
  audit_type text not null,
  project_id uuid,
  kept_id uuid,
  affected_id uuid,
  table_name text not null,
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.media_duplicate_guard_migration_audit enable row level security;
revoke all on public.media_duplicate_guard_migration_audit from anon, authenticated;
grant all on public.media_duplicate_guard_migration_audit to service_role;

alter table public.media_news_items
  add column if not exists canonical_url text,
  add column if not exists normalized_title text,
  add column if not exists event_fingerprint text,
  add column if not exists novelty_verdict text
    check (novelty_verdict is null or novelty_verdict in ('new','duplicate','material_update','uncertain')),
  add column if not exists novelty_confidence numeric
    check (novelty_confidence is null or (novelty_confidence >= 0 and novelty_confidence <= 1)),
  add column if not exists novelty_matched_item_ids uuid[] not null default '{}',
  add column if not exists novelty_reasoning text,
  add column if not exists novelty_new_facts jsonb not null default '[]'::jsonb,
  add column if not exists novelty_reviewer text,
  add column if not exists novelty_reviewed_at timestamptz,
  add column if not exists novelty_workflow_run_id uuid references public.runs(id) on delete set null,
  add column if not exists novelty_input_evidence jsonb,
  add column if not exists novelty_policy_outcome text
    check (novelty_policy_outcome is null or novelty_policy_outcome in (
      'novelty_passed',
      'duplicate_blocked',
      'material_update_pending',
      'uncertain_requires_review',
      'duplicate_race_prevented'
    )),
  add column if not exists novelty_claim_id uuid,
  add column if not exists novelty_claimed_at timestamptz,
  add column if not exists superseded_by_news_item_id uuid references public.media_news_items(id) on delete set null,
  add column if not exists candidate_idempotency_key text,
  add column if not exists candidate_identity text,
  add column if not exists candidate_source_id text,
  add column if not exists candidate_published_at timestamptz,
  add column if not exists editorial_approved_at timestamptz,
  add column if not exists editorial_approved_by jsonb;

alter table public.media_scripts
  add column if not exists voice_claim_id uuid,
  add column if not exists voice_claimed_at timestamptz,
  add column if not exists render_claim_id uuid,
  add column if not exists render_claimed_at timestamptz,
  add column if not exists production_claimed_by_run_id uuid references public.runs(id) on delete set null;

create or replace function public.media_guard_canonical_url(p_url text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(trim(coalesce(p_url, ''))), '^https?://www\.', 'https://'),
        '([?&](utm_[^=&]+|fbclid|gclid|igshid|mc_cid|mc_eid|ref|ref_src)=[^&]*)',
        '',
        'g'
      ),
      '/+$',
      ''
    ),
    ''
  )
$$;

create or replace function public.media_guard_normalized_title(p_title text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(regexp_replace(regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9.+-]+', ' ', 'g'), '\s+', ' ', 'g')),
    ''
  )
$$;

create or replace function public.media_guard_event_fingerprint(p_title text, p_summary text, p_key_insight text)
returns text
language sql
immutable
as $$
  select nullif(array_to_string((regexp_split_to_array(public.media_guard_normalized_title(concat_ws(' ', p_title, p_summary, p_key_insight)), '\s+'))[1:14], '|'), '')
$$;

update public.media_news_items
set canonical_url = coalesce(canonical_url, public.media_guard_canonical_url(url)),
    normalized_title = coalesce(normalized_title, public.media_guard_normalized_title(title)),
    event_fingerprint = coalesce(event_fingerprint, public.media_guard_event_fingerprint(title, summary, key_insight))
where canonical_url is null
   or normalized_title is null
   or event_fingerprint is null;

-- Legacy rows predate the reviewer. Audit and quarantine active production
-- candidates before triggers are enabled. Published history remains immutable
-- history and is not treated as fresh eligibility evidence.
insert into public.media_duplicate_guard_migration_audit(
  audit_type, project_id, affected_id, table_name, reason, details
)
select
  'legacy_news_quarantined',
  n.project_id,
  n.id,
  'media_news_items',
  'Active legacy news lacked complete novelty and editorial evidence.',
  jsonb_build_object('previous_status', n.status)
from public.media_news_items n
left join public.runs r on r.id = n.novelty_workflow_run_id
where n.status in ('approved', 'scripted')
  and (
    n.novelty_verdict is distinct from 'new'
    or n.novelty_policy_outcome is distinct from 'novelty_passed'
    or n.novelty_reviewed_at is null
    or n.novelty_workflow_run_id is null
    or n.novelty_input_evidence is null
    or n.editorial_approved_at is null
    or r.id is null
    or r.project_id is distinct from n.project_id
    or r.kind is distinct from 'media_novelty_review'
    or r.status is distinct from 'done'
  );

update public.media_news_items
set novelty_verdict = coalesce(novelty_verdict, 'uncertain'),
    novelty_confidence = coalesce(novelty_confidence, 0),
    novelty_reasoning = coalesce(novelty_reasoning, 'Legacy row predates semantic duplicate guard; human review required before new production.'),
    novelty_reviewer = coalesce(novelty_reviewer, 'migration:semantic_duplicate_guard'),
    novelty_reviewed_at = coalesce(novelty_reviewed_at, now()),
    novelty_policy_outcome = case
      when novelty_policy_outcome = 'novelty_passed' then 'uncertain_requires_review'
      else coalesce(novelty_policy_outcome, 'uncertain_requires_review')
    end,
    status = 'uncertain_requires_review'
where id in (
  select n.id
  from public.media_news_items n
  left join public.runs r on r.id = n.novelty_workflow_run_id
  where n.status in ('approved', 'scripted')
    and (
      n.novelty_verdict is distinct from 'new'
      or n.novelty_policy_outcome is distinct from 'novelty_passed'
      or n.novelty_reviewed_at is null
      or n.novelty_workflow_run_id is null
      or n.novelty_input_evidence is null
      or n.editorial_approved_at is null
      or r.id is null
      or r.project_id is distinct from n.project_id
      or r.kind is distinct from 'media_novelty_review'
      or r.status is distinct from 'done'
    )
);

update public.media_news_items
set novelty_verdict = coalesce(novelty_verdict, 'uncertain'),
    novelty_confidence = coalesce(novelty_confidence, 0),
    novelty_reasoning = coalesce(novelty_reasoning, 'Published legacy row predates semantic duplicate guard.'),
    novelty_reviewer = coalesce(novelty_reviewer, 'migration:semantic_duplicate_guard'),
    novelty_reviewed_at = coalesce(novelty_reviewed_at, now()),
    novelty_policy_outcome = coalesce(novelty_policy_outcome, 'uncertain_requires_review')
where status = 'published'
  and novelty_verdict is null;

insert into public.media_duplicate_guard_migration_audit(
  audit_type, project_id, affected_id, table_name, reason, details
)
select
  'legacy_script_quarantined',
  s.project_id,
  s.id,
  'media_scripts',
  'Active legacy script was linked to news without complete production eligibility.',
  jsonb_build_object('previous_status', s.status, 'news_item_id', s.news_item_id)
from public.media_scripts s
left join public.media_news_items n
  on n.id = s.news_item_id
 and n.project_id = s.project_id
where s.status in ('approved', 'publishing')
  and (
    n.id is null
    or n.status not in ('approved', 'scripted')
    or n.novelty_verdict is distinct from 'new'
    or n.novelty_policy_outcome is distinct from 'novelty_passed'
    or n.novelty_reviewed_at is null
    or n.novelty_workflow_run_id is null
    or n.editorial_approved_at is null
  );

update public.media_scripts s
set status = 'pending_review',
    feedback = coalesce(s.feedback, 'Migration paused production: linked news requires novelty/editorial review.'),
    reviewed_at = null
from public.media_news_items n
where s.news_item_id = n.id
  and s.status in ('approved', 'publishing')
  and (
    n.project_id is distinct from s.project_id
    or n.status not in ('approved', 'scripted')
    or n.novelty_verdict is distinct from 'new'
    or n.novelty_policy_outcome is distinct from 'novelty_passed'
    or n.novelty_reviewed_at is null
    or n.novelty_workflow_run_id is null
    or n.editorial_approved_at is null
  );

update public.media_scripts s
set status = 'pending_review',
    feedback = coalesce(s.feedback, 'Migration paused production: linked news item is missing.'),
    reviewed_at = null
where s.status in ('approved', 'publishing')
  and not exists (
    select 1
    from public.media_news_items n
    where n.id = s.news_item_id
      and n.project_id = s.project_id
  );

with ranked as (
  select id, project_id, url,
         first_value(id) over (partition by project_id, url order by created_at asc, id asc) as kept_id,
         row_number() over (partition by project_id, url order by created_at asc, id asc) as rn
  from public.media_news_items
  where url is not null
    and status in ('approved', 'scripted', 'pending_editorial_review', 'novelty_passed')
),
conflicts as (
  select * from ranked where rn > 1
)
insert into public.media_duplicate_guard_migration_audit(audit_type, project_id, kept_id, affected_id, table_name, reason, details)
select 'news_url_conflict', project_id, kept_id, id, 'media_news_items', 'Quarantined active duplicate URL before unique index', jsonb_build_object('url', url)
from conflicts;

with ranked as (
  select id, project_id, url,
         first_value(id) over (partition by project_id, url order by created_at asc, id asc) as kept_id,
         row_number() over (partition by project_id, url order by created_at asc, id asc) as rn
  from public.media_news_items
  where url is not null
    and status in ('approved', 'scripted', 'pending_editorial_review', 'novelty_passed')
)
update public.media_news_items m
set status = 'duplicate_blocked',
    novelty_verdict = 'duplicate',
    novelty_confidence = 1,
    novelty_matched_item_ids = array[ranked.kept_id],
    novelty_reasoning = 'Migration quarantined active duplicate URL before enforcing uniqueness.',
    novelty_policy_outcome = 'duplicate_blocked',
    novelty_reviewed_at = now(),
    superseded_by_news_item_id = ranked.kept_id
from ranked
where m.id = ranked.id
  and ranked.rn > 1;

with ranked as (
  select id, project_id, canonical_url,
         first_value(id) over (partition by project_id, canonical_url order by created_at asc, id asc) as kept_id,
         row_number() over (partition by project_id, canonical_url order by created_at asc, id asc) as rn
  from public.media_news_items
  where canonical_url is not null
    and status in ('approved', 'scripted', 'pending_editorial_review', 'novelty_passed')
),
conflicts as (
  select * from ranked where rn > 1
)
insert into public.media_duplicate_guard_migration_audit(audit_type, project_id, kept_id, affected_id, table_name, reason, details)
select 'news_canonical_conflict', project_id, kept_id, id, 'media_news_items', 'Quarantined active duplicate canonical URL before unique index', jsonb_build_object('canonical_url', canonical_url)
from conflicts;

with ranked as (
  select id, project_id, canonical_url,
         first_value(id) over (partition by project_id, canonical_url order by created_at asc, id asc) as kept_id,
         row_number() over (partition by project_id, canonical_url order by created_at asc, id asc) as rn
  from public.media_news_items
  where canonical_url is not null
    and status in ('approved', 'scripted', 'pending_editorial_review', 'novelty_passed')
)
update public.media_news_items m
set status = 'duplicate_blocked',
    novelty_verdict = 'duplicate',
    novelty_confidence = 1,
    novelty_matched_item_ids = array[ranked.kept_id],
    novelty_reasoning = 'Migration quarantined active duplicate canonical URL before enforcing uniqueness.',
    novelty_policy_outcome = 'duplicate_blocked',
    novelty_reviewed_at = now(),
    superseded_by_news_item_id = ranked.kept_id
from ranked
where m.id = ranked.id
  and ranked.rn > 1;

with ranked as (
  select id, project_id, news_item_id,
         first_value(id) over (partition by project_id, news_item_id order by generated_at asc, id asc) as kept_id,
         row_number() over (partition by project_id, news_item_id order by generated_at asc, id asc) as rn
  from public.media_scripts
  where news_item_id is not null
    and status in ('pending_review', 'approved', 'publishing', 'published')
),
conflicts as (
  select * from ranked where rn > 1
)
insert into public.media_duplicate_guard_migration_audit(audit_type, project_id, kept_id, affected_id, table_name, reason, details)
select 'script_news_conflict', project_id, kept_id, id, 'media_scripts', 'Rejected duplicate active/published script for same news item before unique index', jsonb_build_object('news_item_id', news_item_id)
from conflicts;

with ranked as (
  select id, project_id, news_item_id,
         first_value(id) over (partition by project_id, news_item_id order by generated_at asc, id asc) as kept_id,
         row_number() over (partition by project_id, news_item_id order by generated_at asc, id asc) as rn
  from public.media_scripts
  where news_item_id is not null
    and status in ('pending_review', 'approved', 'publishing', 'published')
)
update public.media_scripts s
set status = 'rejected',
    feedback = coalesce(feedback, 'Migration rejected duplicate active/published script for the same news item. Kept script: ' || ranked.kept_id::text),
    reviewed_at = coalesce(reviewed_at, now())
from ranked
where s.id = ranked.id
  and ranked.rn > 1;

create index if not exists idx_media_news_project_canonical_url
  on public.media_news_items(project_id, canonical_url)
  where canonical_url is not null;

create index if not exists idx_media_news_project_event_fingerprint
  on public.media_news_items(project_id, event_fingerprint)
  where event_fingerprint is not null;

create index if not exists idx_media_news_novelty_queue
  on public.media_news_items(project_id, status, created_at)
  where status in ('pending_novelty_review', 'pending_editorial_review', 'novelty_passed', 'material_update_pending', 'uncertain_requires_review', 'duplicate_blocked');

alter table public.media_news_items
  drop constraint if exists unique_project_news_url;

create unique index if not exists unique_project_active_news_url
  on public.media_news_items(project_id, url)
  where url is not null
    and status in ('approved', 'scripted', 'pending_editorial_review', 'novelty_passed');

create unique index if not exists unique_project_active_canonical_news_url
  on public.media_news_items(project_id, canonical_url)
  where canonical_url is not null
    and status in ('approved', 'scripted', 'pending_editorial_review', 'novelty_passed');

create unique index if not exists unique_project_candidate_idempotency
  on public.media_news_items(project_id, candidate_idempotency_key)
  where candidate_idempotency_key is not null;

create unique index if not exists unique_active_script_per_news_item
  on public.media_scripts(project_id, news_item_id)
  where news_item_id is not null
    and status in ('pending_review', 'approved', 'publishing', 'published');

create table if not exists public.media_publication_ledger (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  news_item_id uuid references public.media_news_items(id) on delete set null,
  script_id uuid not null references public.media_scripts(id) on delete cascade,
  media_asset_id text not null,
  channel text not null check (channel in ('youtube', 'instagram', 'facebook')),
  external_publication_id text,
  state text not null default 'pending'
    check (state in (
      'pending',
      'publishing',
      'published',
      'retryable_failed',
      'unknown_external_outcome',
      'reconciliation_required',
      'skipped',
      'permanently_failed'
    )),
  scheduled_time timestamptz,
  published_time timestamptz,
  claim_id uuid,
  claimed_at timestamptz,
  stale_after timestamptz,
  provider_attempt_id text,
  provider_container_id text,
  provider_upload_url text,
  last_reconciliation_at timestamptz,
  idempotency_key text not null,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  error_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.media_publication_ledger enable row level security;
revoke all on public.media_publication_ledger from anon, authenticated;
grant all on public.media_publication_ledger to service_role;

create unique index if not exists unique_media_asset_channel_publication
  on public.media_publication_ledger(project_id, media_asset_id, channel);

create unique index if not exists unique_publication_idempotency_key
  on public.media_publication_ledger(idempotency_key);

create index if not exists idx_media_publication_ledger_project_state
  on public.media_publication_ledger(project_id, state, scheduled_time);

create or replace function public.enforce_media_news_production_eligibility()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  durable_run public.runs;
  entering_protected_state boolean;
begin
  if tg_op = 'INSERT' then
    entering_protected_state := new.status in ('approved', 'scripted', 'published');
  else
    entering_protected_state := new.status in ('approved', 'scripted', 'published');
  end if;

  if not entering_protected_state then
    return new;
  end if;

  if new.project_id is null then
    raise exception using
      errcode = '23514',
      message = 'media production eligibility: news project_id is required';
  end if;
  if new.candidate_idempotency_key is null or new.candidate_identity is null then
    raise exception using
      errcode = '23514',
      message = 'media production eligibility: atomic candidate intake evidence is required';
  end if;
  if new.novelty_verdict is distinct from 'new'
     or new.novelty_policy_outcome is distinct from 'novelty_passed'
     or new.novelty_reviewed_at is null
     or new.novelty_workflow_run_id is null
     or new.novelty_input_evidence is null then
    raise exception using
      errcode = '23514',
      message = 'media production eligibility: completed novelty evidence is required';
  end if;
  if new.editorial_approved_at is null then
    raise exception using
      errcode = '23514',
      message = 'media production eligibility: editorial approval is required';
  end if;

  select r.*
  into durable_run
  from public.runs r
  where r.id = new.novelty_workflow_run_id;

  if durable_run.id is null
     or durable_run.project_id is distinct from new.project_id
     or durable_run.kind is distinct from 'media_novelty_review'
     or durable_run.status is distinct from 'done' then
    raise exception using
      errcode = '23514',
      message = 'media production eligibility: novelty run must be durable, completed, and project-scoped';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_media_script_production_eligibility()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  linked_news public.media_news_items;
  durable_run public.runs;
  entering_protected_state boolean;
begin
  if tg_op = 'INSERT' then
    entering_protected_state := new.status in ('approved', 'publishing', 'published');
  else
    entering_protected_state := new.status in ('approved', 'publishing', 'published');
  end if;

  if not entering_protected_state then
    return new;
  end if;

  if new.project_id is null or new.news_item_id is null then
    raise exception using
      errcode = '23514',
      message = 'media production eligibility: script project_id and news_item_id are required';
  end if;

  select n.*
  into linked_news
  from public.media_news_items n
  where n.id = new.news_item_id;

  if linked_news.id is null then
    raise exception using
      errcode = '23514',
      message = 'media production eligibility: linked news item was not found';
  end if;
  if linked_news.project_id is distinct from new.project_id then
    raise exception using
      errcode = '23514',
      message = 'media production eligibility: script and news projects must match';
  end if;
  if linked_news.status not in ('approved', 'scripted', 'published')
     or linked_news.novelty_verdict is distinct from 'new'
     or linked_news.novelty_policy_outcome is distinct from 'novelty_passed'
     or linked_news.novelty_reviewed_at is null
     or linked_news.novelty_workflow_run_id is null
     or linked_news.novelty_input_evidence is null
     or linked_news.editorial_approved_at is null
     or linked_news.superseded_by_news_item_id is not null then
    raise exception using
      errcode = '23514',
      message = 'media production eligibility: linked news is not novelty-reviewed and editorially approved';
  end if;

  select r.*
  into durable_run
  from public.runs r
  where r.id = linked_news.novelty_workflow_run_id;

  if durable_run.id is null
     or durable_run.project_id is distinct from linked_news.project_id
     or durable_run.kind is distinct from 'media_novelty_review'
     or durable_run.status is distinct from 'done' then
    raise exception using
      errcode = '23514',
      message = 'media production eligibility: linked novelty run is not completed for this project';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_media_news_production_eligibility on public.media_news_items;
create trigger enforce_media_news_production_eligibility
before insert or update on public.media_news_items
for each row execute function public.enforce_media_news_production_eligibility();

drop trigger if exists enforce_media_script_production_eligibility on public.media_scripts;
create trigger enforce_media_script_production_eligibility
before insert or update on public.media_scripts
for each row execute function public.enforce_media_script_production_eligibility();

revoke all on function public.enforce_media_news_production_eligibility() from public, anon, authenticated;
revoke all on function public.enforce_media_script_production_eligibility() from public, anon, authenticated;

create or replace function public.claim_media_news_candidate(
  p_project_id uuid,
  p_run_id uuid,
  p_title text,
  p_summary text,
  p_url text,
  p_source_name text,
  p_virality_score integer,
  p_content_angle text,
  p_target_audience text,
  p_key_insight text,
  p_raw_output jsonb,
  p_canonical_url text,
  p_normalized_title text,
  p_event_fingerprint text,
  p_candidate_idempotency_key text,
  p_candidate_identity text,
  p_candidate_source_id text,
  p_candidate_published_at timestamptz,
  p_stale_after interval default interval '15 minutes'
)
returns table(
  news_item_id uuid,
  status text,
  novelty_claim_id uuid,
  novelty_claim_acquired boolean,
  novelty_verdict text,
  novelty_confidence numeric,
  novelty_matched_item_ids uuid[],
  novelty_reasoning text,
  novelty_new_facts jsonb,
  novelty_policy_outcome text,
  novelty_workflow_run_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  candidate public.media_news_items;
  acquired boolean := false;
begin
  if p_project_id is null
     or nullif(trim(p_title), '') is null
     or nullif(trim(p_candidate_idempotency_key), '') is null
     or nullif(trim(p_candidate_identity), '') is null then
    raise exception using
      errcode = '22023',
      message = 'candidate intake requires project, title, idempotency key, and identity';
  end if;

  insert into public.media_news_items(
    project_id, run_id, title, summary, url, source_name, virality_score,
    content_angle, target_audience, key_insight, status, raw_output,
    canonical_url, normalized_title, event_fingerprint,
    candidate_idempotency_key, candidate_identity, candidate_source_id,
    candidate_published_at, novelty_claim_id, novelty_claimed_at
  )
  values (
    p_project_id, p_run_id, p_title, p_summary, p_url, p_source_name,
    coalesce(p_virality_score, 0), p_content_angle, p_target_audience,
    p_key_insight, 'pending_novelty_review', p_raw_output,
    p_canonical_url, p_normalized_title, p_event_fingerprint,
    p_candidate_idempotency_key, p_candidate_identity, p_candidate_source_id,
    p_candidate_published_at, gen_random_uuid(), now()
  )
  on conflict (project_id, candidate_idempotency_key)
    where candidate_idempotency_key is not null
  do nothing
  returning * into candidate;

  if candidate.id is not null then
    acquired := true;
  else
    select n.*
    into candidate
    from public.media_news_items n
    where n.project_id = p_project_id
      and n.candidate_idempotency_key = p_candidate_idempotency_key
    for update;

    if candidate.id is null then
      raise exception using
        errcode = '40001',
        message = 'candidate intake conflict could not be resolved';
    end if;
    if candidate.candidate_identity is distinct from p_candidate_identity then
      raise exception using
        errcode = '23505',
        message = 'candidate idempotency key collision with a different source identity';
    end if;

    if candidate.status = 'pending_novelty_review'
       and (
         candidate.novelty_claim_id is null
         or candidate.novelty_claimed_at is null
         or candidate.novelty_claimed_at < now() - p_stale_after
       ) then
      update public.media_news_items n
      set novelty_claim_id = gen_random_uuid(),
          novelty_claimed_at = now()
      where n.id = candidate.id
      returning * into candidate;
      acquired := true;
    end if;
  end if;

  return query select
    candidate.id,
    candidate.status,
    candidate.novelty_claim_id,
    acquired,
    candidate.novelty_verdict,
    candidate.novelty_confidence,
    candidate.novelty_matched_item_ids,
    candidate.novelty_reasoning,
    candidate.novelty_new_facts,
    candidate.novelty_policy_outcome,
    candidate.novelty_workflow_run_id;
end;
$$;

revoke all on function public.claim_media_news_candidate(
  uuid, uuid, text, text, text, text, integer, text, text, text, jsonb,
  text, text, text, text, text, text, timestamptz, interval
) from public, anon, authenticated;
grant execute on function public.claim_media_news_candidate(
  uuid, uuid, text, text, text, text, integer, text, text, text, jsonb,
  text, text, text, text, text, text, timestamptz, interval
) to service_role;

create or replace function public.claim_pending_novelty_review(p_project_id uuid, p_limit integer default 1)
returns setof public.media_news_items
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id
    from public.media_news_items
    where project_id = p_project_id
      and status = 'pending_novelty_review'
      and (novelty_claim_id is null or novelty_claimed_at < now() - interval '15 minutes')
    order by created_at asc
    limit p_limit
    for update skip locked
  )
  update public.media_news_items m
  set novelty_claim_id = gen_random_uuid(),
      novelty_claimed_at = now()
  from candidates
  where m.id = candidates.id
  returning m.*;
$$;

revoke all on function public.claim_pending_novelty_review(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_pending_novelty_review(uuid, integer) to service_role;

create or replace function public.claim_media_script_for_voice(
  p_project_id uuid,
  p_script_id uuid default null,
  p_stale_after interval default interval '15 minutes',
  p_claimed_by_run_id uuid default null
)
returns table(status text, script_id uuid, project_id uuid, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.media_scripts;
  existing public.media_scripts;
  explicit_stale boolean := false;
begin
  if p_project_id is null then
    return query select 'blocked'::text, null::uuid, null::uuid, 'project_id is required'::text;
    return;
  end if;

  if p_script_id is not null then
    select * into existing from public.media_scripts where id = p_script_id;
    if existing.id is null then
      return query select 'nothing_eligible'::text, null::uuid, p_project_id, 'script not found'::text;
      return;
    end if;
    if existing.project_id <> p_project_id then
      return query select 'project_mismatch'::text, existing.id, existing.project_id, 'script project does not match requested project'::text;
      return;
    end if;
    if existing.voice_status = 'generating' and coalesce(existing.voice_claimed_at, now()) >= now() - p_stale_after then
      return query select 'in_progress'::text, existing.id, existing.project_id, null::text;
      return;
    end if;
    explicit_stale := existing.voice_status = 'generating' and existing.voice_claimed_at < now() - p_stale_after;
  end if;

  with candidate as (
    select s.id,
           case when s.voice_status = 'generating' then 'stale_claim_recovered' else 'claimed' end as claim_status
    from public.media_scripts s
    join public.media_news_items n
      on n.id = s.news_item_id
     and n.project_id = s.project_id
    where s.status = 'approved'
      and s.project_id = p_project_id
      and (p_script_id is null or s.id = p_script_id)
      and n.status in ('approved', 'scripted')
      and n.novelty_verdict = 'new'
      and n.novelty_policy_outcome = 'novelty_passed'
      and n.novelty_reviewed_at is not null
      and n.novelty_workflow_run_id is not null
      and (
        s.voice_status is null
        or s.voice_status in ('none', 'failed')
        or (s.voice_status = 'generating' and s.voice_claimed_at < now() - p_stale_after)
      )
    order by s.generated_at asc
    limit 1
    for update skip locked
  )
  update public.media_scripts s
  set voice_status = 'generating',
      voice_claim_id = gen_random_uuid(),
      voice_claimed_at = now(),
      production_claimed_by_run_id = p_claimed_by_run_id
  from candidate
  where s.id = candidate.id
  returning s.* into claimed;

  if claimed.id is null then
    return query select 'nothing_eligible'::text, null::uuid, p_project_id, 'No eligible script available for voice'::text;
    return;
  end if;

  return query select
    case when explicit_stale then 'stale_claim_recovered'::text else 'claimed'::text end,
    claimed.id,
    claimed.project_id,
    null::text;
end;
$$;

revoke all on function public.claim_media_script_for_voice(uuid, uuid, interval, uuid) from public, anon, authenticated;
grant execute on function public.claim_media_script_for_voice(uuid, uuid, interval, uuid) to service_role;

create or replace function public.claim_media_script_for_render(
  p_project_id uuid,
  p_script_id uuid default null,
  p_stale_after interval default interval '20 minutes',
  p_claimed_by_run_id uuid default null
)
returns table(status text, script_id uuid, project_id uuid, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.media_scripts;
  existing public.media_scripts;
  explicit_stale boolean := false;
begin
  if p_project_id is null then
    return query select 'blocked'::text, null::uuid, null::uuid, 'project_id is required'::text;
    return;
  end if;

  if p_script_id is not null then
    select * into existing from public.media_scripts where id = p_script_id;
    if existing.id is null then
      return query select 'nothing_eligible'::text, null::uuid, p_project_id, 'script not found'::text;
      return;
    end if;
    if existing.project_id <> p_project_id then
      return query select 'project_mismatch'::text, existing.id, existing.project_id, 'script project does not match requested project'::text;
      return;
    end if;
    if existing.video_status = 'generating_images' and coalesce(existing.render_claimed_at, now()) >= now() - p_stale_after then
      return query select 'in_progress'::text, existing.id, existing.project_id, null::text;
      return;
    end if;
    explicit_stale := existing.video_status = 'generating_images' and existing.render_claimed_at < now() - p_stale_after;
  end if;

  with candidate as (
    select s.id
    from public.media_scripts s
    join public.media_news_items n
      on n.id = s.news_item_id
     and n.project_id = s.project_id
    where s.status = 'approved'
      and s.voice_status = 'ready'
      and s.project_id = p_project_id
      and (p_script_id is null or s.id = p_script_id)
      and n.status in ('approved', 'scripted')
      and n.novelty_verdict = 'new'
      and n.novelty_policy_outcome = 'novelty_passed'
      and n.novelty_reviewed_at is not null
      and n.novelty_workflow_run_id is not null
      and (
        s.video_status is null
        or s.video_status in ('none', 'failed')
        or (s.video_status = 'generating_images' and s.render_claimed_at < now() - p_stale_after)
      )
    order by s.generated_at asc
    limit 1
    for update skip locked
  )
  update public.media_scripts s
  set video_status = 'generating_images',
      render_claim_id = gen_random_uuid(),
      render_claimed_at = now(),
      production_claimed_by_run_id = p_claimed_by_run_id
  from candidate
  where s.id = candidate.id
  returning s.* into claimed;

  if claimed.id is null then
    return query select 'nothing_eligible'::text, null::uuid, p_project_id, 'No eligible script available for render'::text;
    return;
  end if;

  return query select case when explicit_stale then 'stale_claim_recovered'::text else 'claimed'::text end, claimed.id, claimed.project_id, null::text;
end;
$$;

revoke all on function public.claim_media_script_for_render(uuid, uuid, interval, uuid) from public, anon, authenticated;
grant execute on function public.claim_media_script_for_render(uuid, uuid, interval, uuid) to service_role;

create or replace function public.claim_media_publication(
  p_project_id uuid,
  p_news_item_id uuid,
  p_script_id uuid,
  p_media_asset_id text,
  p_channel text,
  p_scheduled_time timestamptz,
  p_idempotency_key text,
  p_stale_after interval default interval '30 minutes'
)
returns table(
  status text,
  ledger_id uuid,
  external_publication_id text,
  provider_attempt_id text,
  provider_container_id text,
  provider_upload_url text,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.media_publication_ledger;
begin
  if p_project_id is null or p_script_id is null or p_media_asset_id is null or p_channel not in ('youtube','instagram','facebook') then
    return query select 'blocked'::text, null::uuid, null::text, null::text, null::text, null::text, 'invalid claim input'::text;
    return;
  end if;

  insert into public.media_publication_ledger (
    project_id, news_item_id, script_id, media_asset_id, channel, state,
    scheduled_time, idempotency_key, claim_id, claimed_at, stale_after
  )
  values (
    p_project_id, p_news_item_id, p_script_id, p_media_asset_id, p_channel, 'publishing',
    p_scheduled_time, p_idempotency_key, gen_random_uuid(), now(), now() + p_stale_after
  )
  on conflict (idempotency_key) do nothing
  returning * into row;

  if row.id is not null then
    return query select 'claimed'::text, row.id, row.external_publication_id, row.provider_attempt_id, row.provider_container_id, row.provider_upload_url, null::text;
    return;
  end if;

  select *
  into row
  from public.media_publication_ledger
  where idempotency_key = p_idempotency_key
  for update;

  if row.project_id <> p_project_id or row.script_id <> p_script_id or row.media_asset_id <> p_media_asset_id or row.channel <> p_channel then
    return query select 'blocked'::text, row.id, row.external_publication_id, row.provider_attempt_id, row.provider_container_id, row.provider_upload_url, 'idempotency key collision with different publication target'::text;
    return;
  end if;

  if row.state = 'published' then
    return query select 'already_published'::text, row.id, row.external_publication_id, row.provider_attempt_id, row.provider_container_id, row.provider_upload_url, null::text;
    return;
  end if;

  if row.state in ('unknown_external_outcome', 'reconciliation_required') then
    update public.media_publication_ledger
    set state = 'reconciliation_required',
        updated_at = now()
    where id = row.id
    returning * into row;
    return query select 'reconciliation_required'::text, row.id, row.external_publication_id, row.provider_attempt_id, row.provider_container_id, row.provider_upload_url, 'external outcome must be reconciled before retry'::text;
    return;
  end if;

  if row.state = 'publishing' and coalesce(row.stale_after, row.claimed_at + p_stale_after) > now() then
    return query select 'in_progress'::text, row.id, row.external_publication_id, row.provider_attempt_id, row.provider_container_id, row.provider_upload_url, null::text;
    return;
  end if;

  if row.state = 'publishing'
     and coalesce(row.stale_after, row.claimed_at + p_stale_after) <= now()
     and row.provider_attempt_id is not null
     and row.provider_container_id is null then
    update public.media_publication_ledger
    set state = 'reconciliation_required',
        error_state = 'Provider attempt started without a persisted provider container id.',
        last_reconciliation_at = now(),
        updated_at = now()
    where id = row.id
    returning * into row;
    return query select 'reconciliation_required'::text, row.id, row.external_publication_id, row.provider_attempt_id, row.provider_container_id, row.provider_upload_url, 'provider attempt started without a persisted container id'::text;
    return;
  end if;

  if row.state = 'permanently_failed' or row.retry_count >= row.max_retries then
    update public.media_publication_ledger
    set state = 'permanently_failed',
        updated_at = now()
    where id = row.id;
    return query select 'blocked'::text, row.id, row.external_publication_id, row.provider_attempt_id, row.provider_container_id, row.provider_upload_url, 'max retries reached'::text;
    return;
  end if;

  update public.media_publication_ledger
  set state = 'publishing',
      retry_count = case when row.state = 'retryable_failed' then row.retry_count + 1 else row.retry_count end,
      claim_id = gen_random_uuid(),
      claimed_at = now(),
      stale_after = now() + p_stale_after,
      error_state = null,
      updated_at = now()
  where id = row.id
  returning * into row;

  if row.retry_count > 0 then
    return query select 'retry_claimed'::text, row.id, row.external_publication_id, row.provider_attempt_id, row.provider_container_id, row.provider_upload_url, null::text;
  else
    return query select 'stale_claim_recovered'::text, row.id, row.external_publication_id, row.provider_attempt_id, row.provider_container_id, row.provider_upload_url, null::text;
  end if;
end;
$$;

revoke all on function public.claim_media_publication(uuid, uuid, uuid, text, text, timestamptz, text, interval) from public, anon, authenticated;
grant execute on function public.claim_media_publication(uuid, uuid, uuid, text, text, timestamptz, text, interval) to service_role;

commit;