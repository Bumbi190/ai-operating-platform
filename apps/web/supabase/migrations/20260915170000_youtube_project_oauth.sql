-- Project-scoped YouTube credentials (Y2a) — a project connects its own YouTube
-- channel with Google OAuth, and the connection is stored for that project only.
--
-- THE RELATION (owner lock, 2026-09-14), now for YouTube too:
--   Project → Platform → Verified External Account → Credential
-- Instagram and Facebook already store each project's credential in
-- platform_tokens. YouTube joins them: the credential is the OAuth refresh token
-- Google issues when the project's operator consents for a channel, stored under
-- that project together with the channel YouTube confirmed for it. The OAuth
-- client — the platform's app identity at Google — is not an account credential
-- and stays in the platform environment; the refresh token is one, and it never
-- does.
--
-- WHAT CHANGES
--   platform_tokens            may hold a project's YouTube refresh token
--                              (token_type 'oauth_refresh'), always with the
--                              confirmed channel id and never with an expiry.
--   social_account_bindings    a YouTube binding may use the project's own store
--                              (project_store). The Y1 transitional binding stays
--                              valid, and unique per platform, until Y2b retires it.
--   platform_credential_events the audit covers YouTube connections: credential
--                              type 'oauth_refresh', the OAuth failure stages
--                              (YouTube only) and the binding action 'migrated' —
--                              the same channel moving from the Y1 environment
--                              credential to the project's own (YouTube only).
--   social_oauth_states        new: the single-use, ten-minute state of one
--                              operator's connection of one project, keyed by the
--                              SHA-256 of the state Google echoes back. The state
--                              itself is never stored; the PKCE verifier lives only
--                              until the state is consumed.
--
-- UNCHANGED. Every existing row — The Prompt's Y1 binding and its Vercel
-- credential included — and every Instagram and Facebook rule, trigger, grant and
-- function. Each rebuilt constraint accepts everything it accepted before and adds
-- only YouTube's branch.
--
-- NULL-SAFE. Every CHECK is written so no branch can evaluate to NULL: a CHECK
-- whose expression is NULL passes.
--
-- SERVER-ONLY. social_oauth_states: RLS on with no policy and every client grant
-- revoked. The service role holds SELECT, INSERT and UPDATE — the update guard
-- allows only consuming a live state — and EXECUTE on social_oauth_state_consume.

-- ── platform_tokens ─────────────────────────────────────────────────────────

alter table public.platform_tokens
  drop constraint platform_tokens_platform_valid,
  add constraint platform_tokens_platform_valid
    check (platform in ('instagram', 'facebook', 'youtube')),
  drop constraint platform_tokens_token_type_matches_platform,
  add constraint platform_tokens_token_type_matches_platform
    check ((platform = 'instagram' and token_type = 'user')
        or (platform = 'facebook'  and token_type = 'page')
        or (platform = 'youtube'   and token_type = 'oauth_refresh')),
  -- A YouTube connection always names the channel YouTube confirmed, and a refresh
  -- token has no expiry to record.
  add constraint platform_tokens_youtube_names_its_channel
    check (platform <> 'youtube' or (account_id is not null and expires_at is null));

-- ── social_account_bindings ─────────────────────────────────────────────────

alter table public.social_account_bindings
  drop constraint social_account_bindings_credential_source_matches_platform,
  add constraint social_account_bindings_credential_source_matches_platform
    check ((platform in ('instagram', 'facebook') and credential_source = 'project_store')
        or (platform = 'youtube' and credential_source in ('project_store', 'platform_env_transitional')));

-- ── platform_credential_events ──────────────────────────────────────────────

alter table public.platform_credential_events
  drop constraint platform_credential_events_platform_valid,
  add constraint platform_credential_events_platform_valid
    check (platform in ('instagram', 'facebook', 'youtube')),
  drop constraint platform_credential_events_credential_type_matches_platform,
  add constraint platform_credential_events_credential_type_matches_platform
    check ((platform = 'instagram' and credential_type = 'user')
        or (platform = 'facebook'  and credential_type = 'page')
        or (platform = 'youtube'   and credential_type = 'oauth_refresh')),
  drop constraint platform_credential_events_binding_action_valid,
  add constraint platform_credential_events_binding_action_valid
    check (binding_action is null or binding_action in ('matched', 'created', 'rebound', 'migrated')),
  -- 'migrated' is the Y1 channel moving to the project's own YouTube credential.
  add constraint platform_credential_events_migrated_is_youtube
    check (binding_action is distinct from 'migrated' or platform = 'youtube'),
  -- The failure stages, extended with the OAuth outcomes. Rebuilt whole; every
  -- branch is still written so it cannot evaluate to NULL.
  drop constraint platform_credential_events_detail_types,
  add constraint platform_credential_events_detail_types
    check (
          ((detail -> 'exchanged')        is null or jsonb_typeof(detail -> 'exchanged') = 'boolean')
      and ((detail -> 'page_resolved')    is null or jsonb_typeof(detail -> 'page_resolved') = 'boolean')
      and ((detail -> 'read_insights_ok') is null or jsonb_typeof(detail -> 'read_insights_ok') = 'boolean')
      and ((detail -> 'expires_at')       is null or (jsonb_typeof(detail -> 'expires_at') = 'string'
            and (detail ->> 'expires_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$'))
      and ((detail -> 'failure_stage')    is null or (jsonb_typeof(detail -> 'failure_stage') = 'string'
            and (detail ->> 'failure_stage') in ('store', 'unexpected', 'provider_verification',
                                                 'account_mismatch', 'account_bound_to_other_project', 'binding',
                                                 'authorization_denied', 'code_exchange', 'scope_missing',
                                                 'refresh_token_missing', 'account_ambiguous')))
    ),
  -- The OAuth failure stages belong to YouTube connections only.
  add constraint platform_credential_events_oauth_stages_are_youtube
    check (platform = 'youtube'
        or coalesce(detail ->> 'failure_stage', '') not in
             ('authorization_denied', 'code_exchange', 'scope_missing', 'refresh_token_missing', 'account_ambiguous'));

-- ── social_oauth_states ─────────────────────────────────────────────────────

create table public.social_oauth_states (
  state_hash     text        primary key,
  project_id     uuid        not null references public.projects(id) on delete cascade,
  platform       text        not null,
  actor          text        not null,
  change_account boolean     not null,
  code_verifier  text,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  consumed_at    timestamptz,
  constraint social_oauth_states_state_hash_shape
    check (state_hash ~ '^[0-9a-f]{64}$'),
  constraint social_oauth_states_platform_valid
    check (platform = 'youtube'),
  constraint social_oauth_states_actor_is_a_user
    check (actor ~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  constraint social_oauth_states_code_verifier_shape
    check (code_verifier is null or code_verifier ~ '^[A-Za-z0-9_-]{43,128}$'),
  -- A live state carries its verifier; a consumed one never does.
  constraint social_oauth_states_verifier_until_consumed
    check ((consumed_at is null) = (code_verifier is not null)),
  constraint social_oauth_states_lifetime
    check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
  constraint social_oauth_states_consumed_in_time
    check (consumed_at is null or (consumed_at >= created_at and consumed_at <= expires_at))
);

comment on table public.social_oauth_states is
  'Single-use, ten-minute state of one operator''s YouTube OAuth connection for one project. Keyed by the SHA-256 of the state; the PKCE verifier is cleared when the state is consumed. No token is ever stored here.';

-- Born live, on the database's clock, with its verifier.
create or replace function public.social_oauth_states_guard_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at  := now();
  new.expires_at  := now() + interval '10 minutes';
  new.consumed_at := null;
  if new.code_verifier is null then
    raise exception 'social_oauth_states: a state is created with its PKCE verifier';
  end if;
  return new;
end;
$$;

-- The only change a state allows: consuming it, once, while it is live.
create or replace function public.social_oauth_states_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.consumed_at is not null then
    raise exception 'social_oauth_states: state is already consumed';
  end if;
  if new.state_hash     <> old.state_hash
     or new.project_id     <> old.project_id
     or new.platform       <> old.platform
     or new.actor          <> old.actor
     or new.change_account <> old.change_account
     or new.created_at     <> old.created_at
     or new.expires_at     <> old.expires_at then
    raise exception 'social_oauth_states: the identity of a state is immutable';
  end if;
  if new.consumed_at is null or new.code_verifier is not null then
    raise exception 'social_oauth_states: an update may only consume a state and clear its verifier';
  end if;
  if old.expires_at <= now() then
    raise exception 'social_oauth_states: state has expired';
  end if;
  new.consumed_at := now();
  return new;
end;
$$;

create trigger social_oauth_states_guard_insert
  before insert on public.social_oauth_states
  for each row execute function public.social_oauth_states_guard_insert();

create trigger social_oauth_states_guard_update
  before update on public.social_oauth_states
  for each row execute function public.social_oauth_states_guard_update();

-- Consumes a live state exactly once and hands back what it was issued for. A state
-- that is unknown, expired or already consumed returns no row; two concurrent calls
-- for one state serialise on the row lock, and the second finds nothing.
create or replace function public.social_oauth_state_consume(p_state_hash text)
returns table (project_id uuid, platform text, actor text, change_account boolean, code_verifier text)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_state public.social_oauth_states%rowtype;
begin
  select s.* into v_state
    from public.social_oauth_states s
   where s.state_hash  = p_state_hash
     and s.consumed_at is null
     and s.expires_at  > now()
     for update;
  if not found then
    return;
  end if;

  update public.social_oauth_states s
     set consumed_at = now(), code_verifier = null
   where s.state_hash = p_state_hash;

  project_id     := v_state.project_id;
  platform       := v_state.platform;
  actor          := v_state.actor;
  change_account := v_state.change_account;
  code_verifier  := v_state.code_verifier;
  return next;
end;
$$;

-- The revoke follows CREATE: Supabase's default ACL grants a new public table and
-- function to the client roles.
alter table public.social_oauth_states enable row level security;

revoke all on table public.social_oauth_states from public, anon, authenticated, service_role;
grant select, insert, update on table public.social_oauth_states to service_role;

revoke all on function public.social_oauth_state_consume(text) from public, anon, authenticated;
grant execute on function public.social_oauth_state_consume(text) to service_role;
