-- Behavioral verification of public.claim_media_publication against a REAL,
-- ISOLATED PostgreSQL instance (never a shared or production database).
--
-- How to run:
--   1. Start a throwaway PostgreSQL (e.g. `supabase start`, docker, or
--      embedded-postgres) and create stub parent tables:
--        create table public.projects (id uuid primary key);
--        create table public.media_news_items (id uuid primary key);
--        create table public.media_scripts (id uuid primary key);
--   2. Apply, from supabase/migrations/20260707190359_media_semantic_duplicate_guard.sql:
--        - create table public.media_publication_ledger (...)
--        - the two unique indexes on the ledger
--        - create or replace function public.claim_media_publication (...)
--   3. Run this file: `psql -v ON_ERROR_STOP=1 -f claim_media_publication_guard.test.sql`
--      Every DO block raises an exception on failure; a clean exit means pass.
--
-- Covered behaviors (numbering follows the review's required tests):
--   5. retryable_failed + persisted provider-attempt evidence and no external id
--      is NEVER returned as an actionable retry claim — it resolves to
--      reconciliation_required.
--   6. A genuinely pre-provider retryable failure (no provider evidence)
--      remains reclaimable (retry_claimed).
--   7. Channel claims are independent: a reconciliation-required YouTube row
--      does not block Instagram/Facebook claims for the same media asset.
--   +  Instagram semantics preserved: retryable_failed WITH a persisted
--      provider_container_id (container-reusing retry) remains reclaimable.
--   +  unknown_external_outcome resolves to reconciliation_required, never a retry.

begin;

insert into public.projects (id) values ('00000000-0000-0000-0000-000000000001');
insert into public.media_scripts (id) values ('00000000-0000-0000-0000-000000000002');

-- ── 5. retryable_failed + provider attempt evidence, no external id ─────────
insert into public.media_publication_ledger
  (project_id, script_id, media_asset_id, channel, state, idempotency_key,
   provider_attempt_id, provider_container_id, external_publication_id, retry_count)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   'asset-1', 'youtube', 'retryable_failed', 'k-yt-evidence',
   'https://upload.youtube.example/session-1', null, null, 0);

do $t$
declare r record;
begin
  select * into r from public.claim_media_publication(
    '00000000-0000-0000-0000-000000000001', null, '00000000-0000-0000-0000-000000000002',
    'asset-1', 'youtube', now(), 'k-yt-evidence');
  if r.status is distinct from 'reconciliation_required' then
    raise exception 'TEST 5 FAILED: expected reconciliation_required, got %', r.status;
  end if;
  if (select state from public.media_publication_ledger where idempotency_key = 'k-yt-evidence')
     is distinct from 'reconciliation_required' then
    raise exception 'TEST 5 FAILED: row did not transition to reconciliation_required';
  end if;
  -- A second claim must still not hand back a retry.
  select * into r from public.claim_media_publication(
    '00000000-0000-0000-0000-000000000001', null, '00000000-0000-0000-0000-000000000002',
    'asset-1', 'youtube', now(), 'k-yt-evidence');
  if r.status is distinct from 'reconciliation_required' then
    raise exception 'TEST 5 FAILED: second claim returned %, expected reconciliation_required', r.status;
  end if;
end $t$;

-- ── 6. genuinely pre-provider retryable failure remains reclaimable ─────────
insert into public.media_publication_ledger
  (project_id, script_id, media_asset_id, channel, state, idempotency_key,
   provider_attempt_id, provider_container_id, external_publication_id, retry_count)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   'asset-2', 'youtube', 'retryable_failed', 'k-yt-pre-provider', null, null, null, 0);

do $t$
declare r record;
begin
  select * into r from public.claim_media_publication(
    '00000000-0000-0000-0000-000000000001', null, '00000000-0000-0000-0000-000000000002',
    'asset-2', 'youtube', now(), 'k-yt-pre-provider');
  if r.status is distinct from 'retry_claimed' then
    raise exception 'TEST 6 FAILED: expected retry_claimed, got %', r.status;
  end if;
  if (select state from public.media_publication_ledger where idempotency_key = 'k-yt-pre-provider')
     is distinct from 'publishing' then
    raise exception 'TEST 6 FAILED: retry claim did not move the row to publishing';
  end if;
end $t$;

-- ── Instagram semantics preserved: container-carrying retry stays reclaimable ─
insert into public.media_publication_ledger
  (project_id, script_id, media_asset_id, channel, state, idempotency_key,
   provider_attempt_id, provider_container_id, external_publication_id, retry_count)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   'asset-3', 'instagram', 'retryable_failed', 'k-ig-container',
   'attempt-uuid-1', 'container-1', null, 0);

do $t$
declare r record;
begin
  select * into r from public.claim_media_publication(
    '00000000-0000-0000-0000-000000000001', null, '00000000-0000-0000-0000-000000000002',
    'asset-3', 'instagram', now(), 'k-ig-container');
  if r.status is distinct from 'retry_claimed' then
    raise exception 'IG CONTAINER TEST FAILED: expected retry_claimed, got %', r.status;
  end if;
  if r.provider_container_id is distinct from 'container-1' then
    raise exception 'IG CONTAINER TEST FAILED: container id not returned for reuse (got %)', r.provider_container_id;
  end if;
end $t$;

-- ── 7. channel independence for the same media asset ────────────────────────
do $t$
declare r record;
begin
  -- asset-1's YouTube row is reconciliation_required (from test 5); Instagram
  -- and Facebook claims for the SAME asset must still be granted.
  select * into r from public.claim_media_publication(
    '00000000-0000-0000-0000-000000000001', null, '00000000-0000-0000-0000-000000000002',
    'asset-1', 'instagram', now(), 'k-ig-asset1');
  if r.status is distinct from 'claimed' then
    raise exception 'TEST 7 FAILED: instagram claim blocked (%), expected claimed', r.status;
  end if;
  select * into r from public.claim_media_publication(
    '00000000-0000-0000-0000-000000000001', null, '00000000-0000-0000-0000-000000000002',
    'asset-1', 'facebook', now(), 'k-fb-asset1');
  if r.status is distinct from 'claimed' then
    raise exception 'TEST 7 FAILED: facebook claim blocked (%), expected claimed', r.status;
  end if;
end $t$;

-- ── unknown_external_outcome never returns an actionable retry ───────────────
insert into public.media_publication_ledger
  (project_id, script_id, media_asset_id, channel, state, idempotency_key,
   provider_attempt_id, provider_container_id, external_publication_id, retry_count)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   'asset-4', 'youtube', 'unknown_external_outcome', 'k-yt-unknown',
   'https://upload.youtube.example/session-2', null, null, 0);

do $t$
declare r record;
begin
  select * into r from public.claim_media_publication(
    '00000000-0000-0000-0000-000000000001', null, '00000000-0000-0000-0000-000000000002',
    'asset-4', 'youtube', now(), 'k-yt-unknown');
  if r.status is distinct from 'reconciliation_required' then
    raise exception 'UNKNOWN-OUTCOME TEST FAILED: expected reconciliation_required, got %', r.status;
  end if;
end $t$;

rollback;
