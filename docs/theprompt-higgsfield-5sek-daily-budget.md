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
