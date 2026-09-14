-- Project-scoped social credentials — social_credential_health: the daily
-- verification result of each project's bound social credential.
--
-- REPLACES token_health AS THE SOURCE OF TRUTH. token_health is keyed by platform
-- alone, so it cannot say whose credential it describes, and its last_error
-- column holds provider and exception text. This table is keyed by
-- (project, platform), points at the binding it verified, and records only closed
-- codes and bounded identifiers: no message, no token, no provider text.
-- token_health is left exactly as it is — no row or grant touched — and stops being
-- written. Only the cron heartbeat still reads its last verification TIME, as
-- transitional evidence until the first per-project verification has run.
--
-- WHAT A ROW SAYS. At checked_at, the credential behind binding_id was asked who
-- it is. identity_verified is true only when the provider answered with the
-- binding's account right then (verified_account_id). YouTube under Y1 can be
-- `ok` with identity_verified false: the token works, but its scope does not let
-- the channel be read before an upload.
--
-- SERVER-ONLY. RLS on with no policy, client grants revoked; the service role
-- holds SELECT, INSERT and UPDATE for the daily upsert. Rows are never deleted
-- by the application; the project and binding references restrict deletion.
--
-- ADDITIVE ONLY.

create table if not exists public.social_credential_health (
  project_id            uuid not null references public.projects(id) on delete restrict,
  platform              text not null,
  binding_id            uuid not null references public.social_account_bindings(binding_id) on delete restrict,
  status                text not null,
  identity_verified     boolean not null,
  verified_account_id   text,
  checked_at            timestamptz not null,
  expires_at            timestamptz,
  days_left             integer,
  last_refreshed_at     timestamptz,
  last_warned_threshold integer,

  primary key (project_id, platform),

  constraint social_credential_health_platform_valid
    check (platform in ('instagram', 'facebook', 'youtube')),
  constraint social_credential_health_status_valid
    check (status in ('ok', 'warning', 'expired', 'account_mismatch', 'binding_blocked',
                      'credential_missing', 'verification_failed')),
  constraint social_credential_health_verified_account_id_shape
    check (verified_account_id is null or verified_account_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  constraint social_credential_health_identity_needs_account
    check (not identity_verified or verified_account_id is not null),
  constraint social_credential_health_warned_threshold_valid
    check (last_warned_threshold is null or last_warned_threshold in (0, 3, 7, 14))
);

comment on table public.social_credential_health is
  'Project-scoped social credentials: daily verification of each project''s bound credential, keyed by (project, platform). Closed status codes and bounded identifiers only — never provider text. Supersedes token_health, which is left untouched and unused.';

alter table public.social_credential_health enable row level security;

revoke all on table public.social_credential_health from public, anon, authenticated, service_role;
grant select, insert, update on table public.social_credential_health to service_role;
