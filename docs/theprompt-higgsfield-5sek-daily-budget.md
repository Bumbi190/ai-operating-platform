# The Prompt + Familje-Stunden — 5 kr/day Higgsfield allowance

**Date:** 2026-10-26. **Status:** unmerged feature development. **Paid Higgsfield generation remains OFF.** No provider job was created and no credits were spent by these checks.

## User's instruction
Cap the Omnira-managed Higgsfield media generation usage to **SEK 5 per Swedish calendar day**. The limit is **shared globally**, rather than five kronor for *each* project. Authorized projects are `ai-media-automation` (The Prompt) and `familje-stunden`.

## Price conversion and an important caveat

Higgsfield's MCP charges **credits**, not SEK. The currently connected Higgsfield Plus workspace showed **1,170 credits**, and an exact read-only quote for one Grok Imagine Video 1.5 Lite clip, **4 s, 720p, 9:16, count=1**, was **4 credits** on 26 Oct; nothing was generated.

The current official Higgsfield Plus examples are about **USD 0.049/credit** and an Oct-26 USD/SEK mid-market rate was about **9.925**, yielding *roughly* **0.49 kr per credit excluding tax, fees or offers**. This is context, NOT a live effective price bound for the user's contract.

To conservatively avoid using too many credits, the policy counts **at least 1 SEK per credit** against the user's five-kronor allowance. One 4-credit quote reserves **4.00 kr** for that day, leaving only 1.00 kr. It therefore allows **at most one 4-credit clip per day**, even if the plan's effective unit cost would permit two. Credit pricing and FX may change: this controls a *conservative allowance equivalent*, **not Higgsfield's actual cash invoice**. The pre-existing subscription, any outside-app use, credit packs and account Auto-Refill are **outside Omnira's control**. For a literal total-card-charge limit, review or disable provider auto-refill and obtain a confirmed SEK-denominated per-credit price from the account's billing records. Unknown effective price must not authorize paid generation automatically.

## Structural implementation (pre-activation)

- New canonical migration: `apps/web/supabase/migrations/20261026200752_higgsfield_daily_budget.sql`.
- `public.higgsfield_daily_reservations` is DB_INTERNAL: RLS + FORCE RLS, **zero policies**, direct privileges REVOKED from `PUBLIC`, `anon`, `authenticated` **and** `service_role`. Only two service-role EXECUTE RPC grants are exposed. The immutable accounting ledger cannot be edited through the Supabase JS service-role client.
- `higgsfield_daily_budget_reserve(request,project,credits)`: validates the project against the two slugs; rejects non-positive/NaN/>5 credit requests; enforces a single **globally serialized** budget via `pg_advisory_xact_lock`; refuses replay of the same request ID; rounds charges **up** to cents; holds ambiguous charges through the end of the Swedish day; never refunds or auto-retries an uncertain request.
- `higgsfield_daily_budget_status()`: service-only, read-only, returns the shared allowance consumed and remaining for the current Europe/Stockholm date, including DST.
- `lib/media/higgsfield/daily-budget.ts`: a safe runtime reservation wrapper that **requires both** `HIGGSFIELD_PAID_VIDEO_ENABLED=true` **and** Omnira's global `H1_SPEND_GATE=1`; a missing toggle, missing/invalid provider quote, DB outage, replay or any unexpected result **always refuses**. Both new flags are **OFF by default** on this branch and no existing media or cron code calls the reservation or generation tool.
- New project-and-operator-authorized read-only GET endpoint `/api/media/higgsfield/budget?project_id=...`; the settings card shows 5 kr, the shared reserved amount, remaining headroom or a fail-closed unavailable notice. Existing balance/quote read-only operations are unaffected.
- The provider client's allowed tool set still only contains `balance`, `models_get`, `estimate_video_cost`. **No generate tool**, no media cron wiring, no payment/top-up, no publish alteration.

## Verified before merge

- Isolated disposable PostgreSQL 17 fixture, including Supabase-like default public ALL grants, required client/service role refusal, both SQL RPCs, replay, cross-project shared five-kronor sum and Europe/Stockholm spring/autumn DST (23/25-hour days): **PASS**, transaction ROLLBACK, container removed.
- Vitest: daily-budget refusal and grant tests, authorized budget GET, existing Higgsfield OAuth route isolation, migration-guard integrity and public-schema security invariants.
- TypeScript and build must be run on this exact branch commit. These checks do not prove a live paid Higgsfield dispatch is safe.
- Production Omnira's existing Higgsfield OAuth connections and other projects remain unchanged.

## Coordinated release and future use

The migration guard fails if repo migrations are not represented in the production ledger. Because the new canonical SQL is unapplied, **do not merge into main or apply to production without a coordinated review/release window**. Pre-apply `main` accepts the current ledger; the new code needs its new ledger row. Production migration must be applied through the authorized migration workflow, post-applied catalog audited, then deployed with the paid feature flag **OFF**.

A subsequent independent work package must implement a narrow video-job adapter with authenticated provider quote, explicit model/asset constraints, one atomically reserved credit envelope **before** any paid dispatch, no retries after ambiguous dispatch, durable job receipt and asset storage, editorial review and old-image fallback. Only after that work is reviewed and explicitly authorized can `HIGGSFIELD_PAID_VIDEO_ENABLED` be switched on with the hard spend gate. The separate Atlas text fallback limit of 10 kr/day + 100 kr/month is unchanged by this project-specific allowance.

## Verified build and release-order proof — 2026-10-26

- Fresh isolated `npm ci --ignore-scripts --no-audit --no-fund`: **949 packages**, exit 0. Separate `npm run typecheck` **PASS**.
- 13 relevant Vitest suites **374/374 PASS** on the edited branch. A four-state regression test was subsequently added to pin the deployment guard (rerun on its final commit).
- Local Next.js production-mode build with nonsecret temporary localhost Supabase public placeholders: **PASS** (exit 0). This is not a Vercel-hosted build and does not circumvent Vercel's production migration guard.
- Actual pre-release Supabase ledger read-only check: **184 migrations**, `higgsfield_daily_budget` not present, budget table and RPCs absent, and two existing Higgsfield OAuth connections unchanged.
- Executed the actual `evaluateAppliedMigrationLedger` implementation against 184 genuine production ledger names and current/PR canonical migration sets: **4/4 PASS or fail closed as intended**. Old main (161 canonical) + actual ledger PASSES; new PR (162) + actual ledger BLOCKED missing budget; old main + hypothetical extra budget migration BLOCKED unknown name; new PR + hypothetical applied budget PASSES. Keep the PR as draft and do not merge/apply in isolation.
- The existing global Atlas fallback `10 kr/day / 100 kr/month` policy is a **separate text-inference allowance**. The Higgsfield credit allowance is not a replacement for it. Paid video generation remains OFF; no paid Higgsfield API method is reachable through this PR.

## Independent concurrent admission proof — 2026-10-27

Verified **six simultaneous, separate PostgreSQL 17 transactions** calling the actual `higgsfield_daily_budget_reserve` SECURITY DEFINER RPC for a 4-credit request, with six distinct request UUIDs. Exactly **1/6** requests received `allowed=true`; the other **5/6** returned `daily_limit`. The final SQL budget status was **4.00 SEK reserved**, **1.00 SEK remaining**. Thus concurrent admission attempts did not produce an over-budget journal or bypass the shared cross-project advisory transaction lock.

The proof is reproducible on Hultgren from the repository root:

```powershell
powershell.exe -NoProfile -File .\scripts\higgsfield\verify-budget-concurrency.ps1
```

The harness uses a uniquely named **disposable** `postgres:17-alpine` Docker container, locally cached image, synthetic roles/projects and six independent `psql` workers. It does not connect to Omnira production, does not use Supabase environment secrets, does not spend Higgsfield credits, and **removes the container even if the test fails**. It is an additional isolated concurrency test, not a full live generation test or proof of provider billing prices.

A separate Codex CLI review attempt on 27 October was **blocked by the account's current usage limit** before any findings were returned; therefore do **not** describe this PR as independently model-reviewed. The repository's existing 7/7 GitHub workflows had passed at `4c4021d`, but the checks must run again on any new commit. The production DB still had **184 migrations** at the last read, with no `higgsfield_daily_budget` table or RPC. This PR remains draft until a coordinated migration/release and approved independent review. No paid generation is enabled.

## Hard spend gate cannot be bypassed by callers — 2026-10-27

A further review identified that the exported server-only `reserveHiggsfieldDailyBudget` accepted injectable `paidEnabled` and `hardGate` booleans. They were intended as test seams, but a future internal adapter could accidentally pass `true` even when both deployment environment flags were OFF. A **failing-first test** set `HIGGSFIELD_PAID_VIDEO_ENABLED=false` and `H1_SPEND_GATE=0`, then passed both injected booleans as `true`: before the repair, the RPC returned a permitted reservation.

The runtime now ALWAYS reads `HIGGSFIELD_PAID_VIDEO_ENABLED` from the actual server environment and `H1_SPEND_GATE` through the central `isSpendGateEnforced()` predicate. The optional `deps` parameter contains only non-authority test plumbing (`db` and request-ID factory). Tests set isolated process environment flags rather than overriding these safety decisions. A JavaScript-like caller with extra override properties is also explicitly tested to **remain denied** when the real flags are OFF.

The new red-to-green focused test set is **21/21 PASS**. This repair does **not** turn paid generation on, call any provider generation tool, set deployment secrets or migrate production. The allowlisted project checks, global serialized SQL cap and no-refund uncertainty policy are unchanged.

After the non-overridable-flag repair on the same 27 October branch: **373/373 PASS** across 12 selected Higgsfield/OAuth/schema/migration/Atlas-fallback security test suites; full web TypeScript check **PASS**; optimized Next.js local build **PASS** (96.04 s, exit 0) with process-local synthetic public Supabase placeholders. The actual Vercel production migration guard is still correctly blocked until the SQL is applied in an approved coordinated release.

## Canonical decimal rounding and SQL parity fix — 27 October 2026

A separate continuation review uncovered a precision mismatch in the **disabled-by-default** admission wrapper. Its original `Math.ceil(quoteCredits * 100) / 100` can turn a JSON 0.28-credit quote into **SEK 0.29**, because JavaScript computes `0.28 * 100` as `28.000000000000004`. The PostgreSQL numeric RPC correctly reserves **SEK 0.28**. The original JS then rejects the already-committed reservation as `database_unavailable` and cannot safely retry: an avoidable lost portion of the daily headroom. This is a **false refusal, not an overspend**, and no paid generator is connected.

Failing-first Vitest coverage reproduced (1) the incorrect 0.29 calculation, (2) rejection of a committed 0.28 reservation, and (3) an invalid sub-precision quote reaching the DB instead of being refused. The replacement converts the **canonical decimal number string** sent in the JSON RPC into an integer number of öre using `BigInt(...)` arithmetic. It rounds up truly fractional cents (e.g. 0.2800000000000001 -> SEK 0.29) while preserving exact 0.28 -> SEK 0.28. No BigInt numeric literals or project-wide TS-target changes are required. It also rejects quotes smaller than the `numeric(12,4)` column's four-decimal precision before any RPC.

The rolled-back PostgreSQL fixture tests independently prove 0.28 -> 0.28, 0.2800000000000001 -> 0.29 and a 0.57 total. The same disposable PostgreSQL17 harness was re-run end-to-end with the unchanged six-concurrent-request proof: **one** 4-credit reservation admitted, **five** refused with `daily_limit`, SEK 4 reserved, SEK 1 remaining. Fixture cleaned up. The reusable harness now executes both rollback SQL tests and concurrency proof in that order.

Verification on the isolated Hultgren PR worktree: 12 selected Higgsfield/Atlas-budget/migration/security Vitest suites **376/376 PASS**; `npm run typecheck` **PASS**. This does not mean the entire web suite is green or that actual Higgsfield spending is possible. The PR remains draft, its new migration remains **unapplied** in production, and paid generation is **OFF**. This conservative 1 SEK/credit equivalent is not the provider's actual invoice cap, and no model/quote has been converted into paid generation.

The optimized Next.js local production build also **PASSed (exit 0, 84.44 seconds)** after the fix, using only process-local nonsecret `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and a build-only placeholder public anon key. The build correctly skipped the Vercel-only migration guard **because this was not a deployment**. The guarded real Vercel preview must remain fail-closed until the new budget migration is applied in a coordinated approved release; no guard bypass was made.
