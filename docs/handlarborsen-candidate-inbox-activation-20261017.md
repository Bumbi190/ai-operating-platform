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

Normal GitHub CI and Vercel guard must reconcile the exact canonical name/digest before merge. No override, grandfathering or ledger rewrite. Protected Preview flags must be scoped only to `codex/hb-inbox-activation-20261017`; production inbox flag remains absent.

The available cloud browser reaches Omnira's normal sign-in screen. No signed-in owner test is claimed and no synthetic authentication/session will be manufactured. Complete the real owner Preview read/empty-inbox UI check before production activation; isolated fixtures cover new-event/receipt mutations without polluting production evidence. Oscar's actual session test stays pending for later, without account or role changes.

After authenticated Preview and release gates pass, the existing operator approval permits the bounded production flag activation and exact-commit deploy. No new recurring search, paid API, cron, email, push or agent execution is included.
