# Calendar and Facebook evidence: writer authority decision

Status: design for review. No migration, credential change, worker deployment or
calendar activation. This follows the isolated findings in PRs #489–#492.

## Verified boundary

The normal reconciliation service calls Meta's published-posts GET, filters
the result, and later GETs the chosen post again before completion. Its SQL
inspector does not make either request. In the owned PostgreSQL fixtures a
service-role caller can pass a well-shaped invented candidate directly to the
inspector, and it stores a proof. A separate permission candidate blocks direct
INSERT while preserving the legitimate RPC, but that does not stop invented
RPC input. The 20 calendar inspector and six publication reconciliation tests
passed in a labeled, disposable local Docker fixture. They are not full
Supabase-schema, live Meta or production tests.

The web app's shared admin client uses SUPABASE_SERVICE_ROLE_KEY for many
routes. The same server process currently resolves Facebook credentials.
A new TypeScript wrapper or a signature generated in that process would not
separate this authority from the broad service key. The key bypasses RLS.
The production migration grants direct UPDATE on social_publications to
service_role. A regression against the original reconciliation migration
successfully marked an uncertain attempt published with a direct UPDATE and
zero provider reads. The receipt constraint accepts provider_id and
confirmation='provider_id'; it does not authenticate them. Thus proof-table
containment alone is not an end-to-end barrier.

## Effective writer inventory from migrations

| Data | Legitimate SQL writers | Current direct grant to service_role |
| --- | --- | --- |
| Reconciliation proofs | `social_publication_reconciliation_inspect` in `20261018070155` | SELECT, INSERT |
| Publication rows and events | Manual `social_publication_prepare/step` in `20261016115402`, later replaced by the scheduled versions in `20261018071209`; scheduled claim/step/recovery; reconciliation complete | Publication SELECT, INSERT, UPDATE; event SELECT, INSERT |
| Schedule jobs and events | Scheduled approval/claim/step/recovery and scheduled reconciliation completion in `20261018071209` and `20261018073425` | Job SELECT, INSERT, UPDATE; event SELECT, INSERT |

The later scheduled migration replaces `social_publication_reconciliation_complete`
and also updates a scheduled job and inserts its event. A role migration cannot
change only the original reconciliation migration. The application store uses
RPCs for these writes; readiness also reads `social_publications`. This is a
source inventory, not proof that no dynamic SQL or operational writer exists.

## Target boundary

1. Keep the user's authenticated operator decision and the exact publication
   selection as separate inputs. A browser never sends provider candidates,
   credential material, candidate hashes or a purported provider read time.
2. A dedicated reader, isolated from the general web service-role key, checks
   the operator's authorization independently, loads the current binding and
   reviewed revision, then GETs the published Facebook post with a credential
   available only to that reader. It does not POST to Facebook during
   reconciliation.
3. That reader writes through a dedicated database identity with only the
   narrow read/inspect/complete functions needed for this flow. The generic
   service_role loses EXECUTE on proof-writing and confirmation RPCs, plus
   direct DML routes that could independently forge a published state. The
   function owner and helper privileges must be audited as a set.
4. The database function keeps source-revision lock first, compares current
   publication/revision/binding/version, records a short-lived proof, and
   commits the revision bump atomically. Completion requires a fresh second
   provider GET, exact candidate hash, explicit operator image confirmation,
   unchanged version and a single state transition.
5. Credentials for the reader and Facebook binding must leave the general
   web process for this to resist compromise of the web service-role key.
   Moving them affects existing publishing flows and needs its own migration.
   Until then the protection is against accidental bypass, not a hostile
   service-role holder.

## Required tests before a migration

- With the effective role grants in a fully migrated Supabase test database:
  generic service_role cannot INSERT proof, execute proof-writing/complete RPCs,
  or directly forge published state; the dedicated reader can perform its
  exact functions and cannot mutate unrelated social/calendar data.
- The reader refuses absent, expired, wrong-project or mismatched operator
  authorization; the UI decision binds to the exact publication, version and
  candidate. Replaying it after a binding/revision change fails.
- Provider failure, timeout, malformed response, token rotation, deleted post,
  changed media and hash mismatch leave publication uncertain and do not create
  a confirmation. No reconciliation call sends a provider POST.
- Concurrent weekly booking, inspection, completion, pause and account
  supersession preserve source-first lock order, rollback and idempotency.
- Test deployment separation by inventorying environment variables and DB
  grants. Verify the general web deployment cannot access the reader's writer
  credential or Facebook token after cutover.
- Dry run with a test Page and a real provider GET, then stage the migration
  with rollback of grants/functions and an explicit production approval.

## Decision for the next slice

Do not promote the two-line SECURITY DEFINER candidate from #492 alone.
Implement the isolated reader and credential boundary as a separate reviewed
workstream. Before choosing hosting, inventory current Facebook token usage
and all direct publication/event/schedule writers, then produce a full-schema
role matrix and migration rollback. Keep existing automation disabled while
that work is incomplete.

References: Supabase's current Row Level Security and Database Functions
guides: https://supabase.com/docs/guides/database/postgres/row-level-security
and https://supabase.com/docs/guides/database/functions.
