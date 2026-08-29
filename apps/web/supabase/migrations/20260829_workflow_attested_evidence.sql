-- ═══════════════════════════════════════════════════════════════════════════════
--
--   Attested local evidence (PR5)
--   ─────────────────────────────
--   Most of Familje-Stundens verification is unreachable from a serverless
--   runtime: ffprobe on a hero video, PDF geometry, counting nineteen audio
--   files, `node --test`, `tsc`, a production build. Phase 0 classified those as
--   "attested" work and PR1 shipped `workflow_evidence.source` with exactly two
--   values so the distinction would exist before anything relied on it.
--
--   This migration makes attestation real: an external producer can state what
--   it observed, and Omnira records it as A STATEMENT BY THAT PRODUCER — bound
--   to an exact target, hashed, and never dressed up as something Omnira saw
--   itself. `source` stays the load-bearing column: `automated` means Omnira
--   observed it; `attested` means someone told us. A UI or query that loses that
--   distinction has lost the only thing separating evidence from assertion.
--
--   ── A LATENT MISMATCH THIS FIXES ────────────────────────────────────────────
--   PR4's verification vocabulary is pass / fail / blocked / error, but the
--   `result` CHECK here has only ('pass','fail','skipped'). Nothing had written a
--   verification record to the table yet, so the mismatch was invisible — the
--   first `blocked` insert would have failed at runtime. The CHECK is widened to
--   carry the full vocabulary, keeping `skipped` so nothing existing breaks.
--
--   ── WHAT IS NOT HERE ────────────────────────────────────────────────────────
--   No command execution, no local runner, no Familje-Stunden write path, no
--   transition, no authorization. Ingesting evidence records a fact and nothing
--   else; whether that fact SATISFIES anything is decided later, in code, against
--   a per-check provenance policy.
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. The full result vocabulary ─────────────────────────────────────────────
--
-- `blocked` (could not be produced) and `error` (produced something unusable)
-- are distinct from `fail` (a real negative finding) on purpose: only `fail` is
-- evidence about the world. Collapsing them would let a missing tool read as a
-- broken release, or worse, let an unusable answer pass for a clean one.

alter table public.workflow_evidence drop constraint if exists workflow_evidence_result_check;
alter table public.workflow_evidence add constraint workflow_evidence_result_check
  check (result in ('pass', 'fail', 'blocked', 'error', 'skipped'));

comment on column public.workflow_evidence.source is
  'Provenance. automated = Omnira observed this itself. attested = an external '
  'producer states it observed it. Never collapse the two: an attested PASS is a '
  'different kind of fact from an observed one.';

-- ── 2. The attestation envelope ───────────────────────────────────────────────
--
-- All additive and all nullable, so every row written before PR5 stays valid and
-- an `automated` record carries none of it.

alter table public.workflow_evidence
  -- WHO stated it. A credential name or key prefix — never a secret, and never
  -- an end user's identity.
  add column if not exists producer       text,
  add column if not exists producer_type  text,
  -- WHEN the producer observed it, which is not when we recorded it. A bundle
  -- generated during a build and posted an hour later must keep both.
  add column if not exists observed_at    timestamptz,
  -- sha256 over the canonical evidence payload. Makes a replay recognisable.
  add column if not exists payload_hash   text,
  -- sha256 over the target this evidence was produced AGAINST. When the target
  -- moves, the evidence does not follow it — it goes stale, visibly.
  add column if not exists target_hash    text,
  -- Safe producer metadata: tool, tool version, source commit, artifact manifest
  -- hash. Never credentials, never raw artefacts, never personal data.
  add column if not exists attestation    jsonb not null default '{}'::jsonb;

alter table public.workflow_evidence drop constraint if exists workflow_evidence_producer_type_check;
alter table public.workflow_evidence add constraint workflow_evidence_producer_type_check
  check (producer_type is null or producer_type in ('omnira', 'local_agent', 'ci', 'human'));

alter table public.workflow_evidence drop constraint if exists workflow_evidence_payload_hash_check;
alter table public.workflow_evidence add constraint workflow_evidence_payload_hash_check
  check (payload_hash is null or payload_hash ~ '^[a-f0-9]{64}$');

alter table public.workflow_evidence drop constraint if exists workflow_evidence_target_hash_check;
alter table public.workflow_evidence add constraint workflow_evidence_target_hash_check
  check (target_hash is null or target_hash ~ '^[a-f0-9]{64}$');

-- An attested row must say who produced it. Anonymous attestation is assertion
-- with extra steps.
alter table public.workflow_evidence drop constraint if exists workflow_evidence_attested_has_producer_check;
alter table public.workflow_evidence add constraint workflow_evidence_attested_has_producer_check
  check (source <> 'attested' or (producer is not null and producer_type is not null
                                  and payload_hash is not null and target_hash is not null));

-- ── 3. Replay protection ──────────────────────────────────────────────────────
--
-- The same producer restating the same observation about the same target is one
-- fact, not two. A DIFFERENT payload for the same check is a new observation and
-- is recorded alongside the old one — history, not replacement, because the
-- table is append-only.

create unique index if not exists workflow_evidence_replay_idx
  on public.workflow_evidence (instance_id, check_key, payload_hash)
  where payload_hash is not null;

-- "What is the newest evidence for this check, and is it still bound to the
-- current target?" — the read the consumption rules make on every evaluation.
create index if not exists workflow_evidence_target_idx
  on public.workflow_evidence (instance_id, check_key, target_hash, recorded_at desc)
  where target_hash is not null;

comment on table public.workflow_evidence is
  'Append-only verification records. source distinguishes a check Omnira performed '
  '(automated) from one an external producer states it performed (attested). An '
  'attested row is pinned by target_hash and deduplicated by payload_hash; it '
  'satisfies a check only when a per-check policy permits attested provenance.';
