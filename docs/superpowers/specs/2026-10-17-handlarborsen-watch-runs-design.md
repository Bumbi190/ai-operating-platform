# Handlarbörsen watch-run journal P1

## Intent and accepted cadence
Atlas should eventually deliver a source-backed weekly competitor report: what changed, what it means for Handlarbörsen, and1–3 proposed improvements. Known competitors are checked weekly; new discovery monthly. Own-channel daily operations belong to the existing social integration work.

This P1 implements the durable journal prerequisite for the known-source weekly check. It creates no executor, report, social integration, schedule, source request, notification or spend authority.

## Isolation choice
The generic runs queue is already claimed by a minute cron and automatically requeues expired work (supabase/migrations/20260603_durable_runs.sql). Reusing it now could execute or retry unapproved work. Use dedicated project-locked journal tables. Reuse the existing project identity, server-only/admin boundary, canonical stop/budget authorities in future dispatch, and proposed pilot HTTP cap10. Do not alter generic runs.

## Contract
- Fixed project8f673c09-1c8f-4d78-876e-4c14bf1c89b3 and kind known_sources_weekly.
- A period is the Monday calendar date in Europe/Stockholm. UTC, DST, year boundaries and invalid dates are tested.
- Unique project/kind/period prevents duplicate journal entries, including after an acknowledgement is lost.
- queued -> running -> succeeded/failed/uncertain. Only one running or uncertain row per project, across all periods.
- Claim uses a caller-generated UUID token, revision1 and a database-clock lease of1–180seconds (server default180). No takeover, heartbeat, requeue or automatic retry.
- Claim samples database time/week after locking target and active rows; finish samples time after its target row lock. Lock waits cannot reuse stale time.
- Only the current Stockholm week can be claimed. Historical entries remain history.
- Expired running work becomes uncertain and retains the project lockout. P1 has no recovery RPC; later human-reviewed recovery must be designed before execution activation.
- Finish requires the exact token and revision while the lease is live. Identical terminal acknowledgement can be replayed without another event; mismatched completion conflicts.
- Success requires a64hex evidence digest. Failed outcomes are source_unavailable/gate_refused/cancelled; gate_refused and cancelled require0HTTP. HTTP count0–10 is journal metadata, not an implemented dispatch limit.
- Queued/running/uncertain HTTP counts are NULL (unknown), never invented zero.
- Completion metadata contains no source payload, arbitrary text, URL or credential.
- Every transition atomically appends one immutable event, with unique run/revision. Failed transitions append nothing.

## Database boundary
Proposed SQL stays under docs/sql, outside canonical migrations until separate production approval. Two tables use RLS+FORCE RLS, zero policies and zero client privileges. Service has SELECT only; direct mutations are denied. Three tightly scoped SECURITY DEFINER mutation RPCs are necessary because callers have no table writes; each has empty search_path, explicit project check and no client EXECUTE. Private helpers/triggers are INVOKER with empty search_path and no API-role EXECUTE. No roles/accounts/default privileges or existing objects are widened.

Foreign keys use RESTRICT to preserve audit evidence. Immutable identities, monotonic revisions, bounded leases and an exclusive active/uncertain slot are enforced in the database, not only TypeScript.

## Server boundary
A server-only journal adapter defaults disabled through HANDLARBORSEN_WATCH_RUN_JOURNAL_ENABLED=true (exact value). Disabled requests construct no admin client and perform no RPC. No application route imports the adapter. Internal server mutations are not user-authorized endpoints; any future route must separately reuse live project/role authorization.

The adapter fixes the project/kind/period, validates inputs and safe RPC receipts, strips tokens/raw data, treats database/transport/malformed responses as unknown and never retries. Every result has executionAllowed:false. A journal claim never authorizes an external request.

## Verification and release
Write RED tests before implementation. Run pure/server tests and an isolated PostgreSQL17.6 container with no network or host ports. Prove simultaneous enqueue/claim, expired leases including a transaction begun before expiry, wrong tokens/CAS, terminal replay, event immutability, denied real database role calls, project isolation and no automatic retry. Remove only the uniquely owned fixture container.

Code can ship disabled after exact-head CI/Preview; production schema installation is a distinct, concrete human approval gate. Migration Guard, canonical count and live inventory remain unchanged in this code release. No paid provider or automatic source request is approved here.

## Remaining after P1
Approved sources, strict stop/spend dispatch adapter, report evidence/read model, journal read authorization/UI, human recovery, source access and schema/budget/schedule/activation approval. Monthly discovery and own-social operations are separate increments.
