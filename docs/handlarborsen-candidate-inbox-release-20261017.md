# Handlarborsen inbox release and next operator gate

## Source reconciliation

PR #389 reconciled only the already-applied sales schema to main (`ab8e7c7e1700356bf33fd6c6772dc19e10e68220`). Its SQL SHA256 exactly matches production ledger `20261017130254`; no production SQL or feature flags changed. The normal Preview guard passed 116/116 enforced migrations and 153 known ledger names. Sales PR #386 remains separate.

PR #388 was merged with this main without conflicts. On the synchronized source, 418/418 targeted tests across 29 suites passed and TypeScript passed. These are scoped tests, not a claim that the historical full repository suite is green. CI/Preview and final merge/deployment evidence are recorded in the PR.

## Reproducible real database proof

Run from the repository root with Docker and the locally available PostgreSQL image:

```sh
node apps/web/scripts/test-handlarborsen-inbox-db.mjs
```

The harness creates a uniquely named, network-isolated PostgreSQL 17.6 container, with no host ports or production connection. It applies the existing candidate migration, seeds synthetic identities and an old candidate, then applies the exact proposed inbox SQL and runs fixture/real-role assertions. Its own container is removed in finally, including on failure. Optional `HB_INBOX_TEST_RECEIPT` stores a sanitized JSON receipt; default output is stdout only.

Proof: `docs/verification/2026-10-17-hb-inbox-db.json`. SQL SHA256 after LF normalization: `365934e64309c6c925f873463b1b26e5c8dbca1305b0f7eafd3b5dd89f484992`.

Covered: no historical TradingSolutions backfill, exactly one notice per active recipient, duplicate insertion no-op, separate/idempotent read/unread receipts, revoked collaborator denied/no new notice, RLS+FORCE RLS/no policies, real anon SELECT/authenticated INSERT+RPC/service DELETE+evidence UPDATE denied, actual service-role candidate insert and owner receipt succeed. Four final notices belong only to synthetic fixtures; none are production records.

## Separate production schema approval required

The executable SQL remains the reviewed proposal at `docs/sql/handlarborsen_candidate_inbox_p0_proposed.sql`. No inbox table, trigger or RPC has been installed in production. `HANDLARBORSEN_CANDIDATE_INBOX_ENABLED` remains absent. The requested new approval covers an additive inbox table, two invoker routines, its insert trigger and narrow service privileges, preserving existing candidate/review data and all accounts.

After approval:

1. Recheck main, production ledger and proposal digest. Generate the canonical migration with the installed Supabase CLI's `migration new` command; copy the reviewed executable body. Add the schema classification and advance guard/test counts together. Keep the proposal as historical review evidence.
2. Apply only the approved canonical inbox migration through Supabase's migration operation, never a ledger-only repair or emergency override. Reconcile the returned actual ledger version and SQL digest. Avoid production fixture inserts and synthetic personal notifications.
3. Read-only verify RLS+FORCE RLS, zero client policies/grants, service SELECT/INSERT and column-only UPDATE(read_at), no DELETE, both invoker routines/client EXECUTE revoked, trigger and foreign key. Existing one candidate must remain unchanged, inbox must be empty, and all 154 ledger names must be known. Verify current counts afresh; 154 assumes no intervening migration.
4. Merge/release the canonical schema source with all normal CI/guard checks. Until source reconciliation completes, an unknown/missing migration must continue to fail closed. Never leave the database/repository mismatch unresolved.
5. Enable only the protected Preview branch flags after source reconciliation. Verify signed-in owner UX and receipt authorization with existing identity. Oscar's actual signed-in UX test remains pending; never change his account or manufacture his session. Use isolated fixtures for the new-candidate/receipt proof rather than polluting production candidate evidence.
6. Production activation is a later bounded release decision after protected Preview gates: enable the inbox flag and deploy the verified commit, check runtime and empty/history-correct UI. Disable the flag for runtime rollback; preserve durable notices and review history. If the trigger itself causes candidate-write failures, stop new candidate writes and review a dedicated repair migration; the UI flag alone does not disable database triggers.

No automatic search, paid API, schedule, email, push, account change or agent execution is authorized by this code release. Further recurring discovery requires verified Cost Governance, budget/idempotency/audit/stops and separate approval.
