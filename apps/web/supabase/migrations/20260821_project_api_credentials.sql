-- ═══════════════════════════════════════════════════════════════════════════════
--
--   project_api_credentials — least-privilege machine credential primitive
--   ─────────────────────────────────────────────────────────────────────
--   SECURITY CREDENTIAL PHASE 1. This table is INERT on arrival: no route reads
--   it, `AIOPS_API_KEY` is untouched, and `requireApiKey` / `requireUserOrApiKey`
--   are unchanged. It exists so that a later phase can move an integration off
--   the single global key without inventing the primitive under deadline.
--
--   ── WHY A PRIMITIVE AT ALL ───────────────────────────────────────────────────
--
--   `AIOPS_API_KEY` is one shared secret compared against `process.env` by
--   `requireApiKey`, which returns `{ ok: true }`. Possession is proven; no
--   principal is established. There is no subject, so there is nothing to scope,
--   which is why the deleted `/api/v1` surface had no project scoping rather than
--   having merely forgotten it. A credential row, by contrast, IS a subject: it
--   names its project and its permitted actions, so scoping becomes possible
--   instead of aspirational.
--
--   ── FK SEMANTICS: `on delete restrict`, following atlas_authorizations ────────
--
--   The repository draws a consistent line. Institutional and authority records
--   RESTRICT: atlas_authorizations, atlas_decision_ledger, atlas_mission_ledger,
--   atlas_delegation_ledger, atlas_intelligence — five of five. Derived lookups
--   CASCADE: atlas_entities (whose own header says discarding it "loses a
--   convenience index, never evidence") and website_content.
--
--   A credential is not a derived lookup. It is the record of what machine access
--   a project granted, to whom, with what permissions, and when it was last
--   exercised. CASCADE would silently erase that history at the exact moment a
--   project is removed — the moment it is most worth having. RESTRICT instead
--   forces the operator to revoke and delete credentials deliberately before the
--   project can go, which is the correct security workflow rather than friction.
--
--   This is a judgement call and is recorded as one: a credential is mutable
--   operational state (enabled, revoked_at, last_used_at), not append-only
--   history, so it is not a perfect twin of the ledgers. The tie is broken toward
--   preserving security evidence, consistent with how this codebase resolves
--   every other fail-closed/fail-open question.
--
--   ── NO PLAINTEXT, EVER ───────────────────────────────────────────────────────
--
--   `secret_hash` stores the SHA-256 of the token's secret component and nothing
--   else. The plaintext credential is returned once, by the generator, at
--   creation time; it is never written here and therefore cannot be read back.
--   `key_prefix` is deliberately NOT secret — it is the lookup handle, which is
--   what lets verification find one row instead of scanning and comparing every
--   hash in the table.
--
--   ── ACCESS: service-role only ────────────────────────────────────────────────
--
--   RLS is enabled with NO policies and all privileges revoked from anon and
--   authenticated. Zero policies under RLS is deny-all; service_role bypasses RLS
--   by design. A browser session therefore cannot list hashes, prefixes or scopes
--   from this table by any query — the same shape used by every atlas_* table.
--
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.project_api_credentials (
  -- Identity
  id            uuid primary key default gen_random_uuid(),

  -- Scope. A credential authorizes exactly one project; cross-project machine
  -- access is not expressible in V1 and is not meant to be. See the FK note above.
  project_id    uuid not null references public.projects(id) on delete restrict,

  -- Operator-facing label ("Familje-Stunden send-pyssel-lead"). Never a secret,
  -- never used for lookup or authorization.
  name          text not null
    constraint project_api_credentials_name_not_blank
      check (length(btrim(name)) > 0),

  -- PUBLIC lookup handle — the `omn_<prefix>` head of the token. Unique because
  -- verification resolves exactly one row from it; a collision would make
  -- credential identity ambiguous. Format is pinned so a malformed or truncated
  -- value cannot be stored and later fail to match anything.
  key_prefix    text not null unique
    constraint project_api_credentials_key_prefix_format
      check (key_prefix ~ '^omn_[0-9a-f]{16}$'),

  -- SHA-256 of the token's secret component, lowercase hex. Never the secret.
  -- The check makes "someone stored a plaintext here" a write-time failure
  -- rather than a silent corruption discovered at authentication time.
  secret_hash   text not null
    constraint project_api_credentials_secret_hash_format
      check (secret_hash ~ '^[a-f0-9]{64}$'),

  -- Permitted actions, exact strings. The DATABASE gives unknown scopes no
  -- meaning; `requireProjectApiScope` is the enforcement boundary. Stored as a
  -- plain text[] so a future scope needs no migration.
  scopes        text[] not null default '{}',

  -- Lifecycle. All three are checked independently at verification and each one
  -- alone is sufficient to deny.
  enabled       boolean not null default true,
  revoked_at    timestamptz,
  expires_at    timestamptz,

  -- Observability. Written only after a SUCCESSFUL authentication, so a failed
  -- credential cannot use it as a side channel. Never carries request data.
  last_used_at  timestamptz,

  -- Provenance
  created_at    timestamptz not null default now(),
  created_by    uuid
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- `key_prefix` already has a unique index from the constraint above; that index
-- is what the verification lookup uses.

-- Operator queries ("what credentials does this project have"), and the join a
-- future revocation flow needs.
create index if not exists project_api_credentials_project_idx
  on public.project_api_credentials (project_id);

-- Partial index over the only rows verification can ever accept. Keeps the hot
-- path small as revoked and disabled credentials accumulate.
create index if not exists project_api_credentials_live_idx
  on public.project_api_credentials (project_id)
  where enabled and revoked_at is null;

-- ── Row-level security ────────────────────────────────────────────────────────

alter table public.project_api_credentials enable row level security;
revoke all on public.project_api_credentials from anon, authenticated;

comment on table public.project_api_credentials is
  'Least-privilege machine credentials, one project per credential. '
  'secret_hash is SHA-256 of the token secret; plaintext is returned once at '
  'creation and is never stored. key_prefix is a public lookup handle, not a '
  'secret. Service-role only: RLS is enabled with no policies and anon/'
  'authenticated are revoked. Enforcement of scopes lives in application code '
  '(requireProjectApiScope), never in this table.';
