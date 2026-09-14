-- Project-scoped social credentials — social_account_bindings: the verified
-- external account behind a project's social credential.
--
-- THE RELATION (owner lock, 2026-09-14):
--   Project → Platform → Verified External Account → Credential
-- A social credential is usable only through the ACTIVE binding of the project
-- that owns the content, run or resource being acted on
-- (lib/media/social-credentials.ts). No default project, first project,
-- platform-only choice or global environment token resolves a credential.
--
-- ONE ACCOUNT, ONE PROJECT (owner decision O1). An external account is actively
-- bound to at most one project per platform, and a project holds at most one
-- active account per platform. Both are partial unique indexes below, not
-- conventions. Changing a project's account is an explicit operator action:
-- social_account_rebind() supersedes the old binding and inserts the new one in
-- one transaction, so a refused change (for example, the account already belongs
-- to another project) leaves the old binding exactly as it was.
--
-- YOUTUBE Y1 (owner decision, TRANSITIONAL). Until project-scoped YouTube
-- credentials exist, YouTube's only credential is the platform's Vercel OAuth
-- credential. It may serve exactly ONE active binding (credential_source
-- 'platform_env_transitional', unique per platform); every other project's
-- YouTube resolves to nothing and fails closed. This is not the end state: the
-- end state is project-scoped YouTube credentials with a verified channel binding
-- (ATLAS_ROADMAP_SV.md).
--
-- IDENTITY IS IMMUTABLE. A binding's project, platform, external account,
-- credential source and provenance never change after insert. Only its
-- verification (label, level, time), its supersession and a block can be
-- recorded, each one-way. A wrong or changed account is a new binding, never an
-- edit, and no row is ever deleted.
--
-- CREDENTIAL-BLIND. No column can hold a token, hash, header, provider message or
-- secret: the account id is a bounded identifier, the label a bounded display name
-- without control characters, and everything else a closed vocabulary.
--
-- SERVER-ONLY. RLS on with no policy and every client grant revoked. The service
-- role holds SELECT, INSERT and UPDATE — the update guard bounds what UPDATE may
-- change — and EXECUTE on the rebind function.
--
-- ADDITIVE ONLY. No existing table, row, grant or credential is touched.

create table if not exists public.social_account_bindings (
  binding_id           uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete restrict,
  platform             text not null,
  external_account_id  text not null,
  account_label        text,
  credential_source    text not null,
  verification         text not null,
  verified_at          timestamptz not null,
  bound_by             text not null,
  bound_at             timestamptz not null default now(),
  superseded_at        timestamptz,
  blocked_at           timestamptz,
  blocked_reason       text,

  constraint social_account_bindings_platform_valid
    check (platform in ('instagram', 'facebook', 'youtube')),

  -- Instagram professional account id, Facebook page id, YouTube channel id.
  constraint social_account_bindings_external_account_id_shape
    check (external_account_id ~ '^[A-Za-z0-9_-]{1,64}$'),

  -- What a provider called the account, sanitised: never a message or a URL.
  constraint social_account_bindings_account_label_shape
    check (account_label is null
        or (char_length(account_label) between 1 and 200 and account_label !~ '[[:cntrl:]]')),

  -- Instagram and Facebook credentials are stored per project; YouTube's only
  -- credential during Y1 is the platform's Vercel credential.
  constraint social_account_bindings_credential_source_matches_platform
    check ((platform in ('instagram', 'facebook') and credential_source = 'project_store')
        or (platform = 'youtube' and credential_source = 'platform_env_transitional')),

  constraint social_account_bindings_verification_valid
    check (verification in ('provider_attested', 'runtime_evidence')),

  -- The server-authenticated operator, or the migration that bound from evidence.
  constraint social_account_bindings_bound_by_shape
    check (bound_by ~ '^(user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|migration:[a-z0-9_]{1,80})$'),

  -- Every branch is written so it cannot evaluate to NULL: a CHECK that yields NULL
  -- passes, and a block without its reason must not.
  constraint social_account_bindings_block_is_complete
    check ((blocked_at is null and blocked_reason is null)
        or (blocked_at is not null and blocked_reason is not null and blocked_reason = 'account_mismatch'))
);

comment on table public.social_account_bindings is
  'Project-scoped social credentials: Project → Platform → Verified External Account. The only relation through which a social credential is usable. One active account per project and platform, one project per external account (O1). Identity immutable; verification, supersession and blocks one-way; rows never deleted. Credential-blind.';
comment on column public.social_account_bindings.external_account_id is
  'Provider identifier of the account: Instagram professional account id (user_id), Facebook page id, YouTube channel id.';
comment on column public.social_account_bindings.account_label is
  'Display name a provider attested (Instagram username, Facebook page name, YouTube channel title). Empty until a provider has said it.';
comment on column public.social_account_bindings.credential_source is
  'project_store: the project''s own credential in platform_tokens. platform_env_transitional: YouTube Y1 only — the platform Vercel OAuth credential, attachable to one binding at a time. Transitional, not the end state.';
comment on column public.social_account_bindings.verification is
  'provider_attested: a live provider answer with the credential matched the account. runtime_evidence: bound from stored runtime observations (owner decision 1A) until a live verification upgrades it.';

-- One active account per project and platform.
create unique index if not exists social_account_bindings_one_active_per_project_platform
  on public.social_account_bindings (project_id, platform) where superseded_at is null;

-- O1: an external account belongs to at most one project per platform.
create unique index if not exists social_account_bindings_account_single_project
  on public.social_account_bindings (platform, external_account_id) where superseded_at is null;

-- Y1: the platform's Vercel YouTube credential serves at most one binding.
create unique index if not exists social_account_bindings_one_platform_env_credential
  on public.social_account_bindings (platform)
  where superseded_at is null and credential_source = 'platform_env_transitional';

-- ── Insert guard ────────────────────────────────────────────────────────────
-- The clock is the database's, and a binding is born active and unblocked.
create or replace function public.social_account_bindings_guard_insert()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.bound_at := now();
  if new.superseded_at is not null or new.blocked_at is not null or new.blocked_reason is not null then
    raise exception 'social_account_bindings: a binding is inserted active and unblocked';
  end if;
  return new;
end;
$$;

drop trigger if exists social_account_bindings_guard_insert on public.social_account_bindings;
create trigger social_account_bindings_guard_insert
  before insert on public.social_account_bindings
  for each row execute function public.social_account_bindings_guard_insert();

-- ── Update guard ────────────────────────────────────────────────────────────
-- Identity never changes; a superseded binding never changes at all; a block is
-- never lifted or rewritten; verification never moves backwards.
create or replace function public.social_account_bindings_guard_update()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if old.superseded_at is not null then
    raise exception 'social_account_bindings: binding % is superseded and cannot change', old.binding_id;
  end if;
  if new.binding_id          <> old.binding_id
     or new.project_id          <> old.project_id
     or new.platform            <> old.platform
     or new.external_account_id <> old.external_account_id
     or new.credential_source   <> old.credential_source
     or new.bound_by            <> old.bound_by
     or new.bound_at            <> old.bound_at then
    raise exception 'social_account_bindings: the identity of binding % is immutable', old.binding_id;
  end if;
  if old.blocked_at is not null
     and (new.blocked_at is distinct from old.blocked_at or new.blocked_reason is distinct from old.blocked_reason) then
    raise exception 'social_account_bindings: the block on binding % cannot be lifted or changed', old.binding_id;
  end if;
  if old.verification = 'provider_attested' and new.verification <> 'provider_attested' then
    raise exception 'social_account_bindings: verification of binding % cannot be downgraded', old.binding_id;
  end if;
  if new.verified_at < old.verified_at then
    raise exception 'social_account_bindings: verified_at of binding % cannot move backwards', old.binding_id;
  end if;
  return new;
end;
$$;

drop trigger if exists social_account_bindings_guard_update on public.social_account_bindings;
create trigger social_account_bindings_guard_update
  before update on public.social_account_bindings
  for each row execute function public.social_account_bindings_guard_update();

-- ── Never deleted ───────────────────────────────────────────────────────────
create or replace function public.social_account_bindings_no_delete()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  raise exception 'social_account_bindings rows are never deleted (attempted %)', tg_op;
end;
$$;

drop trigger if exists social_account_bindings_no_delete on public.social_account_bindings;
create trigger social_account_bindings_no_delete
  before delete on public.social_account_bindings
  for each row execute function public.social_account_bindings_no_delete();

drop trigger if exists social_account_bindings_no_truncate on public.social_account_bindings;
create trigger social_account_bindings_no_truncate
  before truncate on public.social_account_bindings
  for each statement execute function public.social_account_bindings_no_delete();

-- ── Explicit account change ─────────────────────────────────────────────────
-- Supersedes the project's active binding and binds the new, provider-attested
-- account in ONE transaction. The expected binding id makes a concurrent change
-- a refusal (no_data_found) instead of a silent overwrite; an account already
-- bound to another project raises unique_violation and rolls the supersession
-- back with it. Instagram and Facebook only: the credential_source constraint
-- refuses a YouTube rebind during Y1.
create or replace function public.social_account_rebind(
  p_project_id          uuid,
  p_platform            text,
  p_expected_binding_id uuid,
  p_external_account_id text,
  p_account_label       text,
  p_bound_by            text
)
returns uuid
language plpgsql
set search_path to ''
as $$
declare
  v_binding uuid;
begin
  update public.social_account_bindings
     set superseded_at = now()
   where binding_id    = p_expected_binding_id
     and project_id    = p_project_id
     and platform      = p_platform
     and superseded_at is null;
  if not found then
    raise exception 'social_account_rebind: binding % is not the active % binding of project %',
      p_expected_binding_id, p_platform, p_project_id
      using errcode = 'no_data_found';
  end if;

  insert into public.social_account_bindings
    (project_id, platform, external_account_id, account_label, credential_source, verification, verified_at, bound_by)
  values
    (p_project_id, p_platform, p_external_account_id, p_account_label, 'project_store', 'provider_attested', now(), p_bound_by)
  returning binding_id into v_binding;

  return v_binding;
end;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────
-- The revoke follows CREATE: Supabase's default ACL grants a new public table and
-- function to anon and authenticated.
alter table public.social_account_bindings enable row level security;

revoke all on table public.social_account_bindings from public, anon, authenticated, service_role;
grant select, insert, update on table public.social_account_bindings to service_role;

revoke all on function public.social_account_rebind(uuid, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.social_account_rebind(uuid, text, uuid, text, text, text) to service_role;
