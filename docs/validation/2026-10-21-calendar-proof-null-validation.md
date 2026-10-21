# Calendar proof inspector: null validation and writer review

Status: isolated review candidate stacked on PR #487. No production migration,
no main merge, no provider requests and no autonomous booking.

## Reproduced failure

Executed the real source-first inspector from
lib/calendar/direct-write-gate-proof-inspect-candidate.sql in a uniquely named,
labeled local PostgreSQL fixture, with schema projections for content and bindings.
Unlike the previous reduced inspector fixture, this runs the complete original
inspector body and its provider, account and media validation expressions.

A candidate with JSON null providerId or createdAt was accepted and inserted.
The mixed valid/invalid batch also succeeded instead of rolling back.
Red run: 3 failing behavioral tests, 2 passing controls.
Ordinary SQL comparisons involving NULL yield unknown; a PL/pgSQL IF does not
reject an unknown condition. Counting nine JSON keys does not enforce types.

## Minimal candidate fix

direct-write-gate-proof-inspect-hardened-candidate.sql preserves the previous
candidate and adds two explicit jsonb_typeof IS DISTINCT FROM 'string' checks.
Original migration and original parity candidate remain unchanged.
This rejects null, numeric, boolean and compound values for those two fields.
It preserves source-first locking, service-role-only invocation, all original
account/media/content checks, atomic source increments and idempotent replay.

## Legitimate writer and trust boundary inventory

Repository search found one non-test proof INSERT: the reconciliation inspector
in migration 20261018070155_social_publication_reconciliation.sql (and isolated
copies). No application code directly inserts proof table rows.

Normal path:
- reconciliation/api.ts resolves project access, same origin and platform operator.
  It accepts the operator's scope/selection, not caller-supplied provider candidates.
- reconciliation/service.ts obtains the credential for the current binding,
  GETs provider candidates and passes filtered candidates to the inspector RPC.
- Completion GETs the selected provider post again, validates it against the
  snapshot, recomputes candidateHash and then invokes completion.
- reconciliation/store.ts invokes the two service-role RPCs.
- The inspector inserts proofs; completion reads proofs and updates publication,
  schedule and audit state. There is no observed legitimate direct app proof INSERT.

The table grants SELECT, INSERT to service_role. The inspector is SECURITY
INVOKER, so simply revoking INSERT would also break that legitimate RPC.
Switching it to a broad SECURITY DEFINER is not an acceptable silent workaround:
the source gate checks service-role identity and its lock/signature helpers,
owner claims and helper EXECUTE grants must be reviewed together.

Even with direct INSERT revoked via a future dedicated writer design, an allowed
caller can still supply fabricated but well-shaped candidates to the inspector.
The database does not itself fetch Facebook or attest the origin of p_input.
A candidate hash is a consistency checksum, not a provider signature.
A compromised service_role can also call completion with fabricated readAt/hash.
Therefore this change does NOT establish authenticity or least-privilege isolation.

Follow-up regression: the real-inspector fixture now includes an explicit
caller-invented, syntactically valid Facebook candidate. The inspector accepts
it and stores a proof despite no provider read in the fixture. This test is a
documented negative security property, not a claim that Facebook published it.
The authoritative provider fetch and its credential boundary must be bound to
the writer before treating such rows as trustworthy. SQL shape checks alone
cannot close this gap.

A second pending regression exercises the original reconciliation migration
through its service-role RPC in the publication fixture. It supplies a distinct
invented candidate and asserts that the proof is stored without any provider
GET or POST. This covers more of the effective social publication schema than
the calendar projection, but it is still a local fixture and has not been run
in this environment. The normal app service does perform provider reads; the
test isolates the authority of the underlying RPC when called directly.

## Permission candidate awaiting execution

`direct-write-gate-proof-permission-candidate.sql` is an isolated review file,
not a migration. It revokes direct `service_role` INSERT on the proof table and
runs the existing inspector as a definer owned by the trusted migration role.
The real-inspector fixture now checks that direct INSERT is denied while its
legitimate RPC still writes and bumps the source version. Existing owner,
candidate, media and source checks remain in the hardened function body.

This is only table privilege containment. A service-role caller still has
EXECUTE on that RPC and can submit invented candidates; the two negative
provenance tests remain relevant. Before considering a migration, verify
function ownership, search path, nested helper permissions, RLS behavior,
trigger execution, full-schema role grants and transaction lock order. Do not
promote this candidate solely on fixture results.

## Verification scope

New real-inspector behavioral tests cover valid insertion, replay, null refusal,
mixed-batch rollback, provider/text/time/URL/hash rejection, account blocking and
supersession, media cardinality, and exact SQL parity except the two type checks.

The schema projection still uses simplified ownership helper and tables.
This is NOT a fully migrated Supabase schema, real RLS integration or live Meta
verification. Existing publication record projection is minimal; no claim is
made about complete response shape or production authority checks.

## Remaining integration blockers

1. Design a dedicated proof registration authority without removing the service
   checks or converting broad public RPCs into privileged definers.
2. Bind evidence registration/completion to a trusted provider reader and
   authenticated operator approval; SQL source signatures alone are insufficient.
3. Run the hardened inspector and completion against the full effective schema,
   including RLS, ownership changes, stop/pause gates and concurrent writers.
4. Finish common versioning for remaining metadata and legit writers before
   enabling any BEFORE triggers. Keep uncertain external results out of retries.
5. Separately decide and review a production migration; this branch adds none.

## Typecheck limitation

Fresh npx tsc --noEmit exits 2 with the same three previously documented errors:
- lib/media/lambda-render.ts:21 TS2307, missing @remotion/lambda/client.
- lib/media/lambda-render.ts:50 TS2339, region on unknown.
- lib/media/lambda-render.ts:90 TS2339, region on unknown.

No calendar file is reported by this run. This is not a clean project typecheck.
No dependency changes were made to work around unrelated errors.

## Final local evidence

- npx vitest run lib/calendar/direct-write --maxWorkers=1 --minWorkers=1:
  146/146 passed in 22 files (193.87 seconds).
- Final rerun of direct-write-gate-proof-real-inspector.test.ts after comment/parity
  cleanup: 18/18 passed (16.74 seconds).
- Original source-first candidate: null providerId, null createdAt and mixed batch
  tests failed because the function did not throw; valid replay/blocked-account
  controls passed. Hardened candidate passes all of these assertions.
- git diff --check is checked before commit.
- These are targeted PostgreSQL/projection and parity checks, not the whole
  repository suite, full Supabase-schema integration or production certification.
- Vite emits its existing CJS Node API deprecation warning.
