# Approved Handlarborsen inbox schema activation, 2026-10-17

The operator explicitly approved the reviewed inbox schema and activation only after protected Preview/security gates. This phase preserves the source-only inbox release in PR #388 and uses a new isolated branch.

## Canonical schema and real production observation

- Supabase CLI 2.121.0 generated `20261017150717_handlarborsen_candidate_inbox_v1.sql`.
- Every byte after its first promotion comment is identical to the previously approved proposal. Canonical LF SHA256: `e7f3efe782086aa8f818ab071dab7c96ccadde95ec58320e30048bd487fe663c`.
- Applied through the migration API to project `iboepohjwrhtgshrqaol`, returned ledger version `20261017151021`; live ledger source SHA256 matches exactly. Ledger now 154 names; canonical/enforced counts 131/117.
- Live inbox RLS and FORCE RLS ON, zero policies; anon/authenticated table reads/writes and routine EXECUTE denied. Service role SELECT/INSERT and column-only UPDATE(read_at); full UPDATE, evidence UPDATE and DELETE denied.
- Both new routines SECURITY INVOKER with fixed `pg_catalog, public` search_path; only service EXECUTE. AFTER INSERT trigger enabled on immutable verified candidates.
- No historical backfill: inbox zero, existing candidate one, reviews zero, observations six. No account, membership, candidate evidence or existing review/history changes.
- Installing the trigger is active for future candidate INSERTs even while inbox UI flag is off. A UI flag rollback does not disable the trigger; candidate-write failures require a dedicated reviewed repair or paused candidate writes.

## Verification

420/420 targeted tests in 30 suites and TypeScript PASS. Two promotion tests were observed failing before canonical implementation, then green. Independent review found no Critical/Important issues. The repeatable Docker proof now applies the canonical migration, not the historical proposal, on PostgreSQL 17.6 with actual service-role trigger/receipt calls, negative direct-role calls, recipient isolation, revocation, idempotence and zero backfill. Sanitized receipt: `docs/verification/2026-10-17-hb-inbox-canonical-db.json`; owned test container removed.

## Remaining release gates

Fresh final-source GitHub CI and Vercel guard must reconcile the exact canonical names/digests before merge. No override, grandfathering or ledger rewrite. Protected Preview flags must be scoped only to `codex/hb-inbox-activation-20261017`; production inbox flag remains absent.

The owner completed secure sign-in and the protected Preview read/empty-inbox UI check, as recorded below. Isolated fixtures cover new-event/receipt mutations without polluting production evidence. No synthetic session was manufactured. Oscar's actual session test stays pending for later, without account or role changes.

After authenticated Preview and release gates pass, the existing operator approval permits the bounded production flag activation and exact-commit deploy. No new recurring search, paid API, cron, email, push or agent execution is included.

## Signed-in owner proof and parallel-schema reconciliation

At 2026-10-17 around 16:01 UTC, the owner completed secure browser authentication in the protected Preview `dpl_2i1RkGi9YGMRH9J6uA3BazobGrsw` (application source `27025a2`). Fresh visible state showed Andre's signed-in account, Handlarborsen Konkurrentspanaren, the personal inbox status `0 olästa av 0 sparade notiser`, the explicit empty-account message and the existing TradingSolutions D2D candidate. No source-check, candidate-save or review button was clicked and no production evidence was fabricated.

During the sign-in wait, the separately approved sales work applied `sales_managed_host` and `sales_strato_connection`. This branch now reconciles only their exact already-applied SQL and three catalog classifications from frozen sales commit `2527a937dc62d876780c3ed6747dac7e801a7805`; no sales app code, SQL apply, account or sales flag changes are included. Live ledger versions and hashes match tests; ledger156, canonical133/enforced119, public inventory135. Scoped live grants and29 relevant routines were independently reviewed with no Critical/Important finding. Only the narrow cleanup-ready predicate is DEFINER, with client EXECUTE denied.

To prevent a duplicate inbox migration name on a future sales merge, the published canonical inbox path is aligned to that branch's already-reconciled `20261017151021_handlarborsen_candidate_inbox_v1.sql`. Its e7f3ef SHA256 and every SQL byte are unchanged from the CLI-generated source; this is a filename/source reconciliation, not another migration application.

The owner test ran against the live156-migration database. Reconciliation changes only SQL, security inventory, guard, tests and documentation. Application pages, inbox component/service/routes, middleware and auth code remain byte-identical to the authenticated Preview. A fresh exact-head Preview and normal CI are still required for the133/119/156 source before final release; the former117/154 build is historical evidence, not current ledger validation.

Final local reconciliation validation:422/422 targeted tests in31 suites, including exact live-ledger hashes for both parallel migrations. No runtime app/auth/inbox code changed after the signed-in owner test.
