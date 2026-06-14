-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill of an already-applied migration.
--
-- Ledger entry: supabase_migrations.schema_migrations
--   version = 20260608110948
--   name    = create_website_content_system_a
-- Applied to production on 2026-06-08 by the introducing commit 9e349f3
-- (feat(content): System A persistence — generate -> website_content
-- pending_review (no publish)) via apply_migration. The matching file was
-- never committed; this file recovers it from the ledger verbatim so the
-- repo is the source of truth.
--
-- DDL body below is byte-equivalent to the live object (verified against
-- information_schema.columns, pg_constraint, pg_indexes.indexdef,
-- pg_class.relrowsecurity, and pg_policy.pg_get_expr at recovery time).
-- The only modification vs. the ledger statement is wrapping the SELECT
-- policy in `drop … if exists` so a fresh/branch DB can apply the recovered
-- set cleanly even if a previous attempt left the policy behind. Every
-- other statement is already idempotent (`create table if not exists`,
-- `create index if not exists`, `enable row level security`).
--
-- This file MUST NOT be re-applied to production: the ledger already has
-- this version. Its purpose is repo↔ledger consistency and reproducibility
-- on fresh environments.
-- ─────────────────────────────────────────────────────────────────────────────

-- System A (Website Content Engine) — editorial system of record.
-- Atlas owns the workflow + status; The Prompt website is a publish DESTINATION only.
-- Deliberately separate from System B (media_scripts / social) and from the
-- marketing `approvals` queue. Only FK is to projects (news_item_id is a soft
-- uuid reference, intentionally NOT a FK to any media_* table).

create table if not exists public.website_content (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  content_type      text not null default 'article'
                      check (content_type in ('article','news','blog','guide','evergreen')),
  source_kind       text,
  news_item_id      uuid,                          -- soft provenance ref (no FK by design)
  external_id       text not null unique,          -- publish idempotency key
  title             text,
  slug              text,
  summary           text,
  payload           jsonb not null,                -- full publish-contract payload (incl. body)
  qa                jsonb,
  meta              jsonb,
  model             text,
  cost_usd          numeric,
  generated_by      text,
  status            text not null default 'pending_review'
                      check (status in ('pending_review','approved','rejected','published','scheduled','failed')),
  status_reason     text,                          -- human-readable workflow explanation
  reviewed_at       timestamptz,
  reviewed_by       text,
  reviewer_notes    text,
  rejection_reason  text,
  destination_key   text not null default 'the-prompt',
  destination_url   text,
  publish_operation text,
  published_at      timestamptz,
  publish_error     text,
  scheduled_at      timestamptz,
  version           int not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_website_content_queue
  on public.website_content (project_id, status, created_at desc);

create index if not exists idx_website_content_pending
  on public.website_content (status) where status = 'pending_review';

alter table public.website_content enable row level security;

-- Owner-scoped read, mirroring comment_replies_owner_read. Writes go through the
-- server-side admin (service-role) client, which bypasses RLS.
-- Defensive drop-then-create so a fresh apply is idempotent even if a previous
-- attempt left the policy behind. The policy definition itself is verbatim from
-- the ledger statement.
drop policy if exists "website_content_owner_read" on public.website_content;
create policy "website_content_owner_read"
  on public.website_content for select to authenticated
  using (project_id in (select id from projects where owner_id = auth.uid()));
