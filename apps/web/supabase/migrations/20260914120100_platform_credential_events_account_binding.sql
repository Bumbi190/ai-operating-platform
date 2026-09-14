-- Project-scoped social credentials — platform_credential_events becomes
-- project- and account-aware without weakening Settings S0's fail-closed audit.
--
-- WHAT CHANGES. A replacement now proves which external account the new
-- credential belongs to before anything is stored, and the audit records it:
--   external_account_id — the provider-attested account (Instagram professional
--                         account id or Facebook page id). Required on
--                         `replaced`; allowed on `failed` when the failure is
--                         about the account; never on `attempted`, which is
--                         written before any provider is contacted.
--   binding_action      — `matched` (the project's verified binding), `created`
--                         (the project's first binding on the platform) or
--                         `rebound` (an explicit operator account change).
--                         Required on `replaced`, absent otherwise.
--   event_version       — 2 on every row. NOT NULL with no default, so a writer
--                         built before this contract cannot record an attempted
--                         event, and S0's ordering then contacts no provider and
--                         stores nothing. That is what makes applying this
--                         migration ahead of the code that writes it safe: in
--                         between, the previous route refuses every replacement
--                         truthfully (503) instead of replacing without an
--                         account on record.
-- failure_stage gains the account outcomes: provider_verification,
-- account_mismatch, account_bound_to_other_project and binding.
--
-- UNCHANGED. The append-only triggers, the insert guard (a terminal event needs
-- its attempted event), the one-attempt and one-terminal indexes, RLS, grants,
-- the credential-blind detail allowlist and every other constraint. The table is
-- empty (checked before apply), so the NOT NULL column needs no backfill, and no
-- row, trigger or function is rewritten.

alter table public.platform_credential_events
  add column event_version       smallint not null,
  add column external_account_id text,
  add column binding_action      text;

alter table public.platform_credential_events
  add constraint platform_credential_events_event_version_valid
    check (event_version = 2),
  add constraint platform_credential_events_external_account_id_shape
    check (external_account_id is null or external_account_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  add constraint platform_credential_events_binding_action_valid
    check (binding_action is null or binding_action in ('matched', 'created', 'rebound')),
  -- attempted knows no account yet; replaced always names one and how it was bound;
  -- failed never claims a binding.
  add constraint platform_credential_events_account_matches_outcome
    check ((outcome = 'attempted' and external_account_id is null and binding_action is null)
        or (outcome = 'replaced'  and external_account_id is not null and binding_action is not null)
        or (outcome = 'failed'    and binding_action is null));

-- The failure stages, extended with the account outcomes. Rebuilt whole; every
-- branch is still written so it cannot evaluate to NULL.
alter table public.platform_credential_events
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
                                                 'account_mismatch', 'account_bound_to_other_project', 'binding')))
    );

comment on column public.platform_credential_events.external_account_id is
  'Provider-attested account the replacement credential belongs to (Instagram professional account id, Facebook page id). Required on replaced; never on attempted.';
comment on column public.platform_credential_events.binding_action is
  'How the account relates to the project''s binding: matched, created (first binding) or rebound (explicit operator account change). Required on replaced only.';
comment on column public.platform_credential_events.event_version is
  'Audit contract version. 2 = project- and account-aware; a pre-v2 writer cannot record an attempted event and therefore cannot replace a credential.';
