# Calendar privileged trigger-chain review — 23 October 2026

**Status: isolated test evidence only · PR #504 must remain DRAFT · no production grants, migrations or Meta writes**

## Why this follow-up matters

Reviewing a narrowly granted `SECURITY DEFINER` RPC is not enough.
Writing to `social_schedule_jobs`, `social_publications`, immutable
event ledgers or `projects` can fire additional database triggers. Some
of those callbacks run as their **privileged SQL function owner**, and
their body can read or modify tables the original caller could not.
The original calendar replay pinned the trigger names/event bits but
had not pinned the underlying PL/pgSQL body definitions or the HMAC
source gate. This is a limited second-hop review, **not** a complete
transitive proof across all application SQL.

The new `apps/web/scripts/calendar-trigger-chain-audit.mjs` inspects
actual `pg_trigger`, `pg_proc`, `pg_class`, `pg_namespace` and
`pg_language` metadata through a **read-only** catalog query.
It checks 15 attached triggers on six tables:
`projects`, `social_schedule_jobs`, `social_publications`,
`social_schedule_events`, `social_publication_events` and
`social_schedule_operator_review_events_fixture`.
The 15 triggers share **eight callback function bodies**. The catalog
checker also reviews the separate
`calendar_source_gate_begin_probe(uuid)` HMAC/source-revision
function, giving **nine** reviewed function bodies in total.
The test's expected table, trigger, callback, SECURITY DEFINER/INVOKER
mode and event-bit list is explicit; any added, removed, retargeted,
disabled or retimed trigger fails the audit.

The audit pins SHA-256 of PostgreSQL's `pg_get_triggerdef` for every
trigger and `pg_get_functiondef` for every callback and the source
gate. Each callback's owner must be `supabase_admin` in this
particular isolated PostgreSQL bootstrap, its language must be
`plpgsql`, and the `search_path` must be empty. **Owner and code
fingerprints are environment-specific change-control checks, not
proof of general privilege safety.** The implementation also emits
static qualified references for a human reviewer. PL/pgSQL's dynamic
SQL, unqualified function calls, extension routines and nested
invocations cannot be exhaustively derived by simple regex or
`pg_depend`; the operator/calendar RPC-to-trigger body graph
still needs human review before rollout.

## Immediate callback / state map

| Source | Trigger / callback | Privileged outcome or invariant |
|---|---|---|
| `social_publications` and `social_schedule_jobs` | `calendar_source_gate_assert_probe` BEFORE write | Rejects direct writes without the transaction-bound HMAC source proof; reads project owner and private HMAC secret |
| Same tables | `calendar_source_gate_bump_probe` AFTER write | Updates the owner/project source-revision counter after the source lock was taken |
| `projects` | `project_lifecycle_resume_guard` | Refuses resuming execution for inactive project lifecycle state |
| `projects` | `stop_guard_projects` | Protects stop/pause state from unauthorized direct modification |
| `projects` | `survival_input_epoch_bump` / `survival_input_truncate_refused` | Advances survival input epoch when project membership changes and rejects TRUNCATE |
| `social_schedule_events` and `social_publication_events` | `social_launch_immutable` | Rejects edits, deletes and truncation of recorded events |
| `social_schedule_operator_review_events_fixture` | `social_schedule_operator_review_immutable_fixture` | Rejects edits, deletes and truncation of recorded human-only observations |

The BEFORE source gate is separate from the independently reviewed
operator RPC's session/role/project authorization. The source gate
**does not** itself authorize a human review or an autonomous
publication. The source/privileged callbacks run in the closed
test-only database, and the current production scheduler uses
broader `service_role` clients.

## Testing and boundaries

The new native Node test file
`apps/web/scripts/calendar-trigger-chain-audit.test.mjs`
contains negative cases for extra or missing triggers, different
callback, modified timing/event bits, disabled triggers, altered
owner/language/security mode/search path, missing HMAC/revision
checks, unexpected callback body and additional SQL in a trigger
definition. All of these mutations are applied only to *in-memory
mock catalog snapshots*, not to a live database. A separate isolated
PostgreSQL replay is required to check the exact pinned hashes
against the actual trigger SQL.

The real hosted AI Operating Platform Supabase project's
**read-only** trigger catalog showed existing project lifecycle,
survival and immutable-event triggers, but did **not** include
the experiment-only calendar direct-write gate or operator review
ledger triggers. Hosted callbacks are currently owned by
`postgres`, not the isolated replay's `supabase_admin`.
Therefore the isolated fingerprints and owner assumptions
**must not be applied to production** as-is. They test a future
candidate, not current production safety.

### Limitations and release prerequisites

This audit does **not** cover every reachable canonical scheduled
RPC, complex PL/pgSQL statements in all privileged callees, the full
trigger graph on every indirectly modified table, a hosted
Supabase/GoTrue session, the missing May media migration baseline,
provider-authenticated Meta receipt provenance, provider-token storage,
or Instagram multi-stage publishing. A change in PostgreSQL version
or function deparser may change fingerprints and should trigger
reinspection rather than silent replacement. This cannot serve
as authority to grant `authenticated` EXECUTE, migrate schema or
release Atlas's autonomous Meta posting.

**Evidence:** The review inventory and test results are also tracked
in `docs/atlas-cross-tree-replay-inventory-20261021.md`.

## Verified isolated result — 23 October 2026

The first full replay produced an actual SQL catalog inventory of **15
trigger definitions**, **eight unique trigger callback bodies**, and
**one separately callable calendar-source HMAC/revision gate**. Its
source/trigger fingerprints were compared to the original migration
and local probe SQL, then pinned in the test-only
`calendar-trigger-chain-audit.mjs`. A second full replay with all
fingerprints **enforced** completed with **exit code 0**, reporting
`CROSS-TREE TRIGGER CHAIN PASS` and `CROSS-TREE REPLAY PASS`.

Five Node native trigger-chain tests passed, including rejection of
altered trigger events/timing, disabled/extra triggers, retargeted
callbacks, changed function bodies, owners, language, search path,
and modified source-HMAC/revision gate. These attacks were modelled
**only as in-memory catalog changes**; the runner did **not** alter
SQL functions/triggers or grants even temporarily in production.
The existing eight calendar Vitest suites also passed **55 tests**;
four conditional suites run as part of the isolated replay instead.
No application TypeScript files changed, so the unrelated Remotion
TypeScript dependency errors were not re-investigated in this phase.

The hosted AI Operating Platform project's trigger inventory was
checked by read-only catalog SQL and contains the existing project
lifecycle/survival/event-immutability callbacks, but **not** our
experiment-only calendar source gate or operator review triggers.
No hosted session data, token, API key, or untrusted provider request
was inspected. The existing draft PR remains a nondeployable proposal.

**Next necessary work:** Audit the canonical scheduled-RPC function
bodies and all of their transitive qualified/dynamic calls (including
source revision, privilege/role ownership, and media/migration
interactions); reconcile the historical media baseline and independently
attest Meta receipts before proposing any production privilege cutover.
