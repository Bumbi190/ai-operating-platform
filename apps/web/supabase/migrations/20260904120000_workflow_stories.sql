-- Phase 2B-2 — the immutable story store.
--
-- WHY A TABLE AND NOT SOMETHING THAT ALREADY EXISTS. Every existing candidate
-- fails on its own contract: `assets` is bytes with a mime type and a checksum of
-- those bytes; `workflow_evidence.detail` carries scalars from a handler that has
-- no database handle; `runs.context` is mutable, untyped, and belongs to the
-- legacy pipeline. An Editor's approval must bind something that cannot be edited
-- after it was approved.
--
-- APPEND-ONLY BY CONSTRUCTION. Content is never updated in place: regeneration
-- inserts a new row with a new content hash, and the old row stays readable so an
-- approval that named it stays auditable. Only `status` may move, and only from
-- 'candidate' to 'superseded' — a trigger enforces both halves.

create table if not exists public.workflow_stories (
  id                        uuid primary key default gen_random_uuid(),
  workflow_instance_id      uuid not null references public.workflow_instances(id) on delete restrict,
  month_key                 text not null,

  -- Identity. sha256 over the SEMANTIC payload only: provenance below is excluded
  -- so that a model change cannot invalidate an approval of unchanged words.
  story_content_hash        text not null,

  -- What it was written against, and judged by.
  generated_from_brief_hash text not null,
  story_contract_version    text not null,

  -- The story itself.
  story                     jsonb not null,

  -- Provenance. Deliberately NOT part of the identity.
  provider                  text not null,
  model                     text not null,
  prompt_contract_version   text not null,
  run_id                    uuid null references public.runs(id) on delete set null,
  revision_number           integer not null default 1,

  status                    text not null default 'candidate',
  created_at                timestamptz not null default now(),

  constraint workflow_stories_hash_format
    check (story_content_hash ~ '^[a-f0-9]{64}$'),
  constraint workflow_stories_brief_hash_format
    check (generated_from_brief_hash ~ '^[a-f0-9]{64}$'),
  constraint workflow_stories_status_check
    check (status in ('candidate', 'superseded')),
  constraint workflow_stories_revision_positive
    check (revision_number >= 1)
);

-- One story per (instance, content). Regenerating IDENTICAL text is the same
-- story, not a second one — so this is a dedupe, not a conflict.
create unique index if not exists workflow_stories_identity_idx
  on public.workflow_stories (workflow_instance_id, story_content_hash);

create index if not exists workflow_stories_instance_idx
  on public.workflow_stories (workflow_instance_id, created_at desc);

comment on table public.workflow_stories is
  'Immutable, content-addressed generated stories. Append-only: content is never '
  'updated in place, and superseded rows are retained so a prior approval stays auditable.';

-- ── Append-only enforcement ────────────────────────────────────────────────
-- The application already declines to edit content. This is the half that holds
-- when the application is wrong: a later bug, a manual fix, or a well-meant
-- migration cannot rewrite what an Editor approved.
create or replace function public.workflow_stories_append_only()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if new.story_content_hash is distinct from old.story_content_hash
     or new.story is distinct from old.story
     or new.workflow_instance_id is distinct from old.workflow_instance_id
     or new.month_key is distinct from old.month_key
     or new.generated_from_brief_hash is distinct from old.generated_from_brief_hash
     or new.story_contract_version is distinct from old.story_contract_version
     or new.provider is distinct from old.provider
     or new.model is distinct from old.model
     or new.prompt_contract_version is distinct from old.prompt_contract_version
     or new.revision_number is distinct from old.revision_number
     or new.created_at is distinct from old.created_at then
    raise exception 'workflow_stories is append-only: story content and provenance are immutable'
      using errcode = 'check_violation';
  end if;

  -- Status may only move forward, and only to superseded.
  if old.status = 'superseded' and new.status <> 'superseded' then
    raise exception 'workflow_stories: a superseded story cannot be reinstated'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists workflow_stories_append_only_trg on public.workflow_stories;
create trigger workflow_stories_append_only_trg
  before update on public.workflow_stories
  for each row execute function public.workflow_stories_append_only();

-- Deletion is not a lifecycle. A story an approval may have named must remain.
create or replace function public.workflow_stories_no_delete()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  raise exception 'workflow_stories rows are never deleted; supersede instead'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists workflow_stories_no_delete_trg on public.workflow_stories;
create trigger workflow_stories_no_delete_trg
  before delete on public.workflow_stories
  for each row execute function public.workflow_stories_no_delete();
