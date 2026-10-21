# Handlarbörsen — Analytics Foundation: integration plan (read-only mapping)

Status: proposal for architecture review. Nothing here is implemented. No production database or environment was changed.
Basis: code inspection of `Bumbi190/ai-operating-platform` @ `857471b` and `Bumbi190/handlarborsen` (local checkout), 2026-10-10.
Verified project row (Omnira prod, read-only SELECT): `8f673c09-…`, slug `handlarborsen`, `atlas_mode = observer`, `#2563EB`.

## 1. What already exists in Omnira (reuse)

| Capability | Where | Fit |
|---|---|---|
| Collector framework (`BaseCollector`: fetch → validate → normalize → store → `recordSignal`; `collector_runs` audit) | `apps/web/lib/atlas/collectors/{types,registry}.ts` | Direct fit. Only `stripe.revenue` and `social.account` are registered. |
| Collector routes (`GET`, `Bearer CRON_SECRET`, `?dry_run=1`, filter `atlas_mode IN (active, observer)`) | `app/api/collectors/*` | Template for a new route. |
| Scheduling (pg_cron → `omnira_cron.call_vercel`, guardian `ensure_core_schedules`, `cron_heartbeat`) | `migrations/20260623_150300_atlas_collector_cron.sql` | Add one schedule the same way. pg_cron runs in GMT. |
| Signals / snapshots (`atlas_signals` with `project_id`+`source`, `revenue_snapshots` unique `(project_id, snapshot_date)`, service-role only) | `lib/atlas/signals.ts`, migrations | Reuse. |
| Project scoping (`getAllowedProjectIds`, `applyProjectScope`, fail-closed empty list) | `lib/atlas/isolation.ts` | Reuse for every read. |
| Observer semantics (`isCollectable` = active\|observer, `isExecutable` = active only) | `lib/atlas/lifecycle.ts`, `mission/operational-authority.ts` | Observer already cannot execute. |
| Per-project credential pattern, closed refusal, no cross-project fallback | `platform_tokens` (unique `project_id,platform,token_type`), `lib/media/social-credentials.ts` | Model for the Handlarbörsen secrets. |
| Read-only external adapter pattern (scoped verify key, no service_role, "blocked: credential_missing") | `lib/workflows/adapters/familje-stunden/*` | Model for the cross-system read. |
| Cost ledger (`cost_events` with `project_id`, `infra_costs`, budgets) | `lib/cost/*` | Destination for Omnira-side cost; external provider costs go to `infra_costs`. |

## 2. What exists in Handlarbörsen (source of truth)

Separate Supabase project (`handlarbörsen`, eu-central-1), separate Stripe, separate Vercel project. All tables RLS-enabled and tenant-scoped; there are **no platform-wide aggregate RPCs or views**.

| Metric | Source in Handlarbörsen | State |
|---|---|---|
| Registered dealers | `organizations` (count, `created_at`) | Data exists, no aggregate |
| Verified dealers | `organizations.status='verified'`, `verified_at` | Data exists, no aggregate |
| Published/active vehicles | `vehicles.status IN ('published','reserved')` | Data exists, no aggregate |
| Bids / interest / deals | `bids`, `interests`, `offers`, `deals` (+ `audit_logs` for time series) | Data exists, dealer-scoped dashboards only |
| Stripe revenue / MRR | `subscriptions` holds state + seat counts only; **no invoice amounts stored**. Pricing 995 SEK + 59 SEK/extra user, ex VAT. | Must come from the Stripe API. Whether live billing is on is **unverified** (`STRIPE_BILLING_ENABLED` defaults off). |
| Web statistics | **None.** No Vercel Analytics/GA/Plausible/PostHog; cookie policy states no analytics. PostHog is documented as deferred. | Missing |
| Operating costs | **No ledger.** Biluppgifter lookups countable from `private.vehicle_lookup_quota_events` / `vehicle_equipment_report_requests` (no per-call price stored); Resend counts in `private.admin_email_*`; no AI usage in the app; Vercel/Supabase cost only via their APIs. | Partial |

Existing pattern to copy: `app/api/internal/*` routes (Bearer `CRON_SECRET`, constant-time compare, `Cache-Control: private, no-store`).

## 3. Recommended minimal safe integration

**Pull model, aggregates only, no new access for Omnira to Handlarbörsen's database.**

```
Omnira pg_cron ──GET──> /api/collectors/handlarborsen/marketplace (Omnira, CRON_SECRET)
                          └─ HandlarborsenMarketplaceCollector (BaseCollector)
                               └─ HTTPS GET + scoped metrics token ──> Handlarbörsen /api/internal/atlas-metrics
                                                                         └─ SECURITY DEFINER RPC → counts only
                          └─ store(): handlarborsen_marketplace_snapshots (project_id, snapshot_date)
                          └─ recordSignal(source='handlarborsen.marketplace', project_id)
```

1. **Handlarbörsen side (one new endpoint + one RPC, separate PR in that repo).** `GET /api/internal/atlas-metrics` using the existing internal-route pattern, with its **own** secret (`ATLAS_METRICS_TOKEN`, not `CRON_SECRET`). It calls one `SECURITY DEFINER` function in the `private` schema, executable only by a dedicated role, returning a fixed JSON of **counts**: registered/verified dealers, vehicles by status bucket, bids/interests/offers/deals created in the last 24 h and totals, active paying orgs and active seats. No names, org numbers, emails, prices per deal or free text. Versioned payload (`schema_version`). No service-role key leaves Handlarbörsen.
2. **Omnira side.** New collector + route + one migration (snapshot table, service-role-only RLS, pg_cron entry, `ensure_core_schedules` update, heartbeat seed). Token stored per project (`platform_tokens`, platform `handlarborsen`, type `metrics`), resolved through a closed-refusal resolver with no env or cross-project fallback. Route filters `atlas_mode IN (active, observer)`; a project without the credential reports `skipped: credential_missing` (never zeros, never guessed values).
3. **Stripe, isolated.** Do **not** reuse `STRIPE_RESTRICTED_KEY` (global, bound to `familje-stunden`). Add a per-project read-only restricted key for Handlarbörsen, read through the same per-project resolver, and generalise `STRIPE_PROJECT_SLUGS` so each project resolves its own key. Handlarbörsen's key never sits in the same record as, or is tried for, another project. Daily aggregates only (MRR, active/trialing/past_due, period revenue), as already specified for Familje. Blocked until live billing status is confirmed.
4. **Costs.** Omnira-side AI spend already goes through `cost_events`. External costs (Vercel, Supabase, Biluppgifter, Resend) go in as `infra_costs` rows with `project_id` from a daily collector that uses provider billing APIs; Biluppgifter/Resend use counts from the metrics endpoint multiplied by a **configured** unit price. If a price is not configured the figure is shown as unknown.
5. **Web statistics (last).** Nothing exists to collect. Needs a product/legal decision first (see §6), then enabling cookieless Vercel Web Analytics on the Handlarbörsen Vercel project and reading it through a project-scoped Vercel token. Until then Atlas must display "no web data", not a number.
6. **Atlas read side.** Surface through the existing signals/snapshots and `revenueIntel`-style readers using `applyProjectScope`; add no new rights. Intelligence producers consume the new signal type; nothing writes back.

## 4. Security requirements → how the plan meets them

| Requirement | Mechanism |
|---|---|
| Observer, no autonomous changes | Collectors are read-only GETs; `isExecutable('observer') = false` already blocks missions. Plan adds no write path into Handlarbörsen. Known gap: no DB-level trigger blocks observer writes (application-level only); out of scope, noted. |
| No direct client access to sensitive tables | Browser never talks to either source; only server-side collectors. Snapshot table is service-role only (same as `revenue_snapshots`). |
| No service-role key in frontend / none given to Omnira | Omnira holds only a metrics token and a Stripe restricted read key. |
| Only explicit, aggregated data crosses | Fixed-field RPC; schema validated in `BaseCollector.validate` (unknown fields rejected). |
| Stripe separate | Per-project restricted key and resolver; no shared env key. |
| No access for Oscar | No new principals, scopes or UI; nothing here touches Oscar. |
| No prod DB/env changes in this phase | This PR is docs plus identity only. |
| No invented numbers | `skipped`/`unknown` states; zero is only emitted when the source returned zero. |

## 5. Phased delivery

- **P1 — marketplace counts** (smallest useful slice): metrics RPC + endpoint in Handlarbörsen; collector, snapshot table, cron in Omnira; dry-run first. Covers dealers, vehicles, bids/interest/deals.
- **P2 — Stripe revenue**: per-project key + resolver generalisation. Gate: confirm live billing and create the restricted key.
- **P3 — costs**: `infra_costs` collector; unit prices configured explicitly.
- **P4 — web analytics**: after legal/product sign-off.

Each phase: dry-run against real source, review the payload, then enable the schedule. Preview deployments hit the production Supabase, so verify with `?dry_run=1` and local runs, not preview smokes.

## 6. Open decisions for the owner

1. Approve the pull + aggregate-endpoint model (vs. Handlarbörsen pushing to Omnira).
2. Is live billing active in Handlarbörsen's Stripe? Who creates the restricted key?
3. Web analytics: `LEGAL-PILOT.md` and the cookie page promise no analytics. Cookieless Vercel Web Analytics needs an explicit decision and a policy update before enabling.
4. Unit prices for Biluppgifter and Resend cost estimates.
5. Whether the new collector snapshot should live in a generic `project_metric_snapshots` table or a Handlarbörsen-specific one (recommend specific for P1; generalise when a second consumer exists).

## 7. Not verified

- Handlarbörsen production data volumes and whether any dealers beyond pilot exist (no production data was read).
- Whether Vercel platform analytics is already toggled on for the Handlarbörsen project.
- Allowed values of `subscriptions.status` beyond non-blank.
