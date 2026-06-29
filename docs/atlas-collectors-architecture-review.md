# Atlas Collectors — Architecture Review
**Date:** 2026-06-23  
**Author:** Principal Architect (Claude)  
**Status:** Pre-implementation review — no code written  
**Scope:** Atlas Signals audit + Collectors v1 design  
**Revision:** 2 — project lifecycle modes added (2026-06-23)

---

## Executive Summary

Atlas Memory M4 is complete and production-hardened. The signals infrastructure (table, read/write API, producer contract) is in place but has exactly one producer: the Impact Score Engine computing editorial signal for AI news articles. Zero collectors exist for external data — Stripe, social platforms, Supabase usage, product metrics. The data that Atlas reasons over is almost entirely derived from internal operational tables (runs, cost_events, media_scripts, leads) rather than real-world market signals.

The next step — Collectors v1 — is achievable without schema surgery. The `atlas_signals` table is already designed to absorb collector output. The primary work is building the collector framework and wiring the first 4–6 collectors.

The three Omnira projects are at different lifecycle stages and require different Atlas treatment. **The Prompt** is the proving ground for the full signals-to-execution pipeline. **Familje-Stunden** is an active business entering Observer Mode — collect and analyze now, build history, hold off on automation. **GainPilot** is in Hibernate Mode — architecture-ready but no collector work until reactivation.

The collector framework must be multi-project from day one. Execution-oriented Atlas capabilities (Recommendations → Execution) target The Prompt first and only.

---

## Project Lifecycle Modes

| Project | Mode | Atlas Goal | Collectors | Execution |
|---|---|---|---|---|
| The Prompt | **Active** | Proving ground for full pipeline | Full coverage | Yes — Recommendations → Execution |
| Familje-Stunden | **Observer** | Build historical intelligence now | Data collection only | No automation, no publishing |
| GainPilot | **Hibernate** | Architecture-ready, isolated | None yet | None |

### Active — The Prompt

The Prompt is where Atlas earns its mandate. Every collector that can serve The Prompt should be built. The full signals pipeline — Signals → Analysis → Opportunities → Recommendations → Execution — is the target architecture for this project. The Impact Score Engine, opportunity detection, and any future Growth Agent all target The Prompt first.

### Observer — Familje-Stunden

Familje-Stunden is a live business with real revenue, real subscribers, and real social audiences. Atlas must start collecting data now so it has 6–12 months of history when the project shifts to Active mode. This means:

- Stripe metrics (MRR, subscriber counts, churn)
- Social account metrics (follower counts, growth rate per platform)
- Social post engagement (comments, reach, saves)
- Customer feedback signals (when available)
- Traffic metrics (when connected)

What Observer Mode explicitly excludes: content automation, publishing workflows, campaign scheduling, any execution agent. Atlas watches and learns. It does not act.

### Hibernate — GainPilot

GainPilot remains architecture-isolated. No collectors. No signals. The project and its data model remain ready to activate. The only GainPilot work permitted in Collectors v1 is using it as a framework validation target if needed (e.g. testing that the collector framework correctly handles a project with no external tokens configured).

---

## Part 1: Atlas Signals Audit

### 1.1 Current Schema

**Table: `public.atlas_signals`** (migration `20260622_atlas_signals.sql`)

```
id          uuid PK
content_id  uuid NULLABLE (no FK — intentional)
kind        text NOT NULL
payload     jsonb NOT NULL
version     text NOT NULL
produced_at timestamptz DEFAULT now()
```

**Indexes:**
- `atlas_signals_content_kind_idx` on `(content_id, kind, produced_at desc)` — content-scoped queries, partial WHERE content_id IS NOT NULL
- `atlas_signals_kind_idx` on `(kind, produced_at desc)` — global kind queries

**RLS:** Enabled. Single policy blocks all authenticated access (`USING false`). Service role bypasses RLS entirely (correct for producer/consumer pattern).

**Design assessment:** Sound. The one-table-per-universe append-only design is good for audit trail and avoids schema migration every time a new signal type is added. The key design tradeoffs are:

- ✅ `content_id` nullable: correct — future global signals (market_summary, follower_growth, mrr_change) have no article scope
- ✅ Append-only: the history record falls out for free; trend analysis is `SELECT ... ORDER BY produced_at`
- ✅ Producer versioning via `version`: multiple engine versions coexist; historic signals stay interpretable
- ⚠️ No `project_id` column: today this is fine (signals are either article-scoped or global). When we need per-project collector signals (e.g. "GainPilot follower count") we will either reuse `content_id` as an opaque scope key, or add `entity_id` / `project_id`. This decision should be made now (see §3).
- ⚠️ No `source` column: once we have 10+ collector kinds, filtering signals by their originating system (stripe, instagram, supabase) becomes useful. Today you can infer it from `kind` prefix (e.g. `stripe.mrr`) but explicit source metadata aids observability.
- ⚠️ No TTL / retention policy: atlas_signals is append-only forever. Impact scores for articles that are years old are not useful. A retention strategy is needed before this table grows large.

### 1.2 Signal TypeScript API (`lib/atlas/signals.ts`)

Three functions:

- `recordSignal(args)` — write one signal (producer)
- `getLatestSignal({ contentId, kind })` — read the most recent signal for a content item of a given kind (consumer)
- `getLatestSignalsPerKindForContent(contentId)` — read latest-per-kind as `Record<kind, payload>` (sync cache for The Prompt articles table)

**Assessment:** Clean, minimal, stable. The service boundary is correct — no direct table access from outside this module. No consumer currently calls `getLatestSignal`; only the sync path (`lib/publishing/sync.ts`) calls `getLatestSignalsPerKindForContent`.

**Limitations:**
- No query API for global/kind-scoped signals: "give me all `stripe.mrr` signals for the last 30 days" has no function yet. Collector consumers will need this.
- No `project_id` scoping in the query layer — blocked by the schema gap above.
- Client-side grouping in `getLatestSignalsPerKindForContent` (fetches all rows, groups in JS) — fine at current volume, becomes a concern at 1000+ signals per article.

### 1.3 Current Signal Producer

**Only one producer exists:** `lib/atlas/impact-score.ts` — the Impact Score Engine.

Flow:
```
article approval → syncPublishedArticle() → getLatestSignalsPerKindForContent()
                                                    ↑
                ← recordSignal({ kind: 'impact_score', ... })
                   (called via backfill-impact-scores.ts for existing articles)
```

The engine is entirely pure/synchronous. It reads `source_authority` from a hardcoded const map (async interface, const implementation). No collector exists that feeds external data into signals.

### 1.4 Snapshot Tables (Collector Output Targets Today)

Two tables exist that follow the collector pattern — daily idempotent upsert snapshots:

**`public.account_snapshots`** — social account-level metrics  
Fields: project_id, platform (instagram/facebook/youtube), snapshot_date, followers, following, media_count, reach, profile_views, raw  
Collector: `GET /api/media/cron/account-snapshot` (exists, not scheduled in pg_cron)

**`public.revenue_snapshots`** — Stripe subscription KPIs  
Fields: project_id, snapshot_date, active_subscribers, new_subscribers, trialing, churned_this_month, mrr_sek, revenue_month_sek, raw  
Collector: `GET /api/business/cron/stripe-snapshot` (exists, inactive until `STRIPE_RESTRICTED_KEY` set)

**Critical gap:** Neither snapshot table emits into `atlas_signals`. Atlas reads them directly via `lib/atlas/revenue.ts` and `lib/atlas/social.ts`. This means:

- No signal history for revenue trends — Atlas can only compare today vs. yesterday (two snapshots)
- No signal for "MRR grew 5% this week" — no derived signal, no trend signal
- No opportunity detection from real external data
- The signals table exists but collector output bypasses it

### 1.5 Related Tables Atlas Reads (Not Yet Signal-Producing)

| Table | What Atlas uses it for | Signal potential |
|---|---|---|
| `media_insights` | Social post engagement (per-post) | content_score signals |
| `cost_events` | AI spend tracking | cost_anomaly signals |
| `runs` | Pipeline health | pipeline_health signals |
| `opportunities` | Growth opportunities | driven by signals, not a signal itself |
| `leads` | Lead counts | lead_velocity signals |
| `memories` | Operator decisions | feeds context, not signals |

### 1.6 Current Data Flow (As-Is)

```
External World
  Stripe API ──────────────────→ revenue_snapshots (via /api/business/cron/stripe-snapshot, manual)
  Instagram/FB/YT API ─────────→ account_snapshots (via /api/media/cron/account-snapshot, not in pg_cron)
  Media insights (Meta webhook) → media_insights (via /api/media/cron/insights, scheduled 09:00)

Internal Platform
  cost_events ─────────────────┐
  runs ────────────────────────┤
  leads ───────────────────────┼──→ Atlas Context Brain → Executive Summary → Dashboard
  media_scripts ───────────────┤
  revenue_snapshots ───────────┤
  account_snapshots ───────────┘

  website_content (approval) ──→ Impact Score Engine ──→ atlas_signals ──→ articles.atlas_signals
```

### 1.7 Current Limitations

1. **No collector framework.** Each collector is a bespoke route. Retry, scheduling, error tracking, and rate limiting are reimplemented (or absent) in each.
2. **Snapshot tables are disconnected from signals.** The richest external data (Stripe, social) never becomes a signal. Atlas cannot reason about trends, deltas, or anomalies.
3. **account-snapshot is not scheduled in pg_cron.** It exists as a route but has no cron job.
4. **Stripe inactive by default.** Route exists but requires env var. No indication in Operations dashboard whether it has ever run.
5. **GainPilot and Familje-Stunden product metrics are null.** `getOperations()` returns `betaUsers: null, activeUsers: null` with comment "ingen datakälla ännu."
6. **Impact Score Engine inputs are thin.** Authority is a hardcoded const map. Source count saturates at 10 sources × 10 = 100 but current pipeline produces 1 source/article. Score value is always ~source_authority_of_one_source × 0.6 + 10 × 0.4 = narrow range.
7. **No retention policy on atlas_signals.** Table grows unbounded.
8. **No `project_id` on signals.** Adding per-project collector signals (e.g. follower count per project) requires schema change.

### 1.8 Technical Debt

- `source-authority.ts`: hardcoded const map, async interface but sync implementation. Good placeholder, needs DB-backed table for v2.
- `getLatestSignalsPerKindForContent`: client-side grouping. Fine now, add a DB-side query as volume grows.
- Two parallel social data paths: `media_insights` (per-post) and `account_snapshots` (per-account). Atlas reads both separately. Signals could unify these into a single `social.*` signal namespace.
- `STRIPE_RESTRICTED_KEY` not checked in heartbeat/token-health. If Stripe goes unconfigured, nothing alerts on the gap.

---

## Part 2: Atlas Collectors Architecture Proposal

### 2.1 Design Principles

1. **One framework, many collectors.** A shared TypeScript abstract class handles fetch → validate → normalize → store → emit signal. Each collector implements only the domain-specific parts.
2. **Signals are the output.** Every collector emits into `atlas_signals` after storing into its snapshot table. The snapshot table is the raw archive; the signal is the derived intelligence event.
3. **Idempotent by default.** Every collector run can be re-run safely. Snapshot upserts use `onConflict`. Signal writes are append-only (no dedupe needed — each run is a new data point).
4. **Fail silently, audit loudly.** A collector failure must never block the rest of the system. Every run writes a result to a collector run log. Atlas can see which collectors are healthy.
5. **Schedule via pg_cron, not Vercel cron.** All collectors call `omnira_cron.call_vercel(path)`. Vercel's free cron limit (2/day) is already bypassed by pg_cron.

### 2.2 Shared Collector Interface

```typescript
// lib/atlas/collectors/types.ts

export interface CollectorResult {
  collectorId: string         // e.g. 'stripe.revenue', 'instagram.account'
  projectId: string | null
  status: 'ok' | 'skipped' | 'error'
  signalKind: string | null   // what kind was emitted
  signalId: string | null     // uuid of the emitted atlas_signal
  snapshotDate: string        // YYYY-MM-DD
  durationMs: number
  error: string | null
  metadata: Record<string, unknown>
}

export interface CollectorContext {
  db: SupabaseAdminClient
  projectId: string | null
  snapshotDate: string
  dryRun?: boolean
}

export abstract class BaseCollector {
  abstract readonly id: string              // 'stripe.revenue'
  abstract readonly signalKind: string      // 'stripe.mrr_snapshot'
  abstract readonly version: string         // 'stripe-collector-1.0.0'

  /** Fetch raw data from external source. Throws on unrecoverable errors. */
  abstract fetch(ctx: CollectorContext): Promise<unknown>

  /** Validate that raw data has expected shape. Returns null if unusable. */
  abstract validate(raw: unknown): unknown | null

  /** Normalize to signal payload. Pure function. */
  abstract normalize(valid: unknown, ctx: CollectorContext): Record<string, unknown>

  /** Store snapshot (idempotent upsert). Optional — some collectors skip this. */
  store?(normalized: Record<string, unknown>, ctx: CollectorContext): Promise<void>

  /** Run the full pipeline. */
  async run(ctx: CollectorContext): Promise<CollectorResult> {
    const start = Date.now()
    try {
      const raw = await this.fetch(ctx)
      const valid = this.validate(raw)
      if (!valid) {
        return this.result(ctx, 'skipped', null, null, Date.now() - start, 'validate returned null', {})
      }
      const payload = this.normalize(valid, ctx)
      if (this.store) await this.store(payload, ctx)

      let signalId: string | null = null
      if (!ctx.dryRun) {
        const signal = await recordSignal({
          contentId: null,
          kind: this.signalKind,
          payload: { ...payload, project_id: ctx.projectId },
          version: this.version,
        })
        signalId = signal.id
      }
      return this.result(ctx, 'ok', this.signalKind, signalId, Date.now() - start, null, payload)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return this.result(ctx, 'error', null, null, Date.now() - start, msg, {})
    }
  }

  private result(ctx, status, kind, id, ms, error, meta): CollectorResult {
    return { collectorId: this.id, projectId: ctx.projectId, status, signalKind: kind,
             signalId: id, snapshotDate: ctx.snapshotDate, durationMs: ms, error, metadata: meta }
  }
}
```

### 2.3 Collector Run Log (New Table)

```sql
-- collector_runs: audit log for every collector execution
create table public.collector_runs (
  id             uuid primary key default gen_random_uuid(),
  collector_id   text not null,        -- 'stripe.revenue'
  project_id     uuid references public.projects(id) on delete set null,
  snapshot_date  date not null,
  status         text not null check (status in ('ok','skipped','error')),
  signal_id      uuid,                 -- atlas_signals.id if emitted
  signal_kind    text,
  duration_ms    int,
  error_message  text,
  metadata       jsonb not null default '{}',
  ran_at         timestamptz not null default now()
);

create index collector_runs_id_date_idx on public.collector_runs (collector_id, ran_at desc);
create index collector_runs_project_idx on public.collector_runs (project_id, ran_at desc);
create index collector_runs_status_idx  on public.collector_runs (status, ran_at desc) where status = 'error';
```

### 2.4 Required Schema Changes to `atlas_signals`

Add `project_id` and `source` columns:

```sql
-- Migration: atlas_signals schema extension
alter table public.atlas_signals
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists source     text;

-- New compound index for project-scoped signal queries
create index atlas_signals_project_kind_idx
  on public.atlas_signals (project_id, kind, produced_at desc)
  where project_id is not null;

-- Source index for observability queries
create index atlas_signals_source_idx
  on public.atlas_signals (source, kind, produced_at desc)
  where source is not null;
```

Add `source` to TypeScript interface:

```typescript
export interface RecordSignalArgs<P = Record<string, unknown>> {
  contentId:  string | null
  projectId?: string | null   // NEW
  source?:    string          // NEW — e.g. 'stripe', 'instagram', 'supabase'
  kind:       string
  payload:    P
  version:    string
}
```

### 2.5 Retention Strategy

```sql
-- Add retention policy: purge signals older than 365 days
-- (except 'impact_score' signals which are article-linked and kept indefinitely)
create or replace function atlas.purge_stale_signals(
  p_retention_days integer default 365
) returns integer language plpgsql as $$
declare n integer;
begin
  delete from public.atlas_signals
  where produced_at < now() - (p_retention_days || ' days')::interval
    and kind not like 'impact_%';   -- keep scored content signals forever
  get diagnostics n = row_count;
  return n;
end $$;

-- Schedule weekly (Sunday 04:00 UTC)
select cron.schedule('atlas_signal_purge', '0 4 * * 0',
  'select atlas.purge_stale_signals()');
```

---

## Part 3: Collector Categories — Design & Priority

Each collector is tagged with which projects benefit and the Atlas mode constraint.

Legend: 🟢 Active (The Prompt) · 🔵 Observer (Familje-Stunden) · ⚪ Hibernate (GainPilot)

### 3.1 Stripe Revenue Collector (Priority: P0)

**Projects:** 🔵 Familje-Stunden (primary) · 🟢 The Prompt (if/when Stripe revenue is added)  
**Mode constraint:** Observer — collect, analyze, do not act

**Collector:** `StripeRevenueCollector` — upgrades existing `/api/business/cron/stripe-snapshot`

Signal kinds emitted:
- `stripe.mrr_snapshot` — payload: `{ mrr_sek, active_subscribers, new_subscribers, trialing, churned_this_month, mrr_delta_sek, churn_rate_pct }`
- `stripe.revenue_snapshot` — payload: `{ revenue_month_sek, invoices_paid }`

**Route:** `GET /api/collectors/stripe/revenue` (replaces `/api/business/cron/stripe-snapshot`)  
**Schedule:** Daily 07:00 UTC (after Stripe processes overnight)  
**Rate limit:** Stripe restricts to 25 req/s; collector uses list-with-pagination (already implemented)  
**Activation gate:** `STRIPE_RESTRICTED_KEY` env var (already in place)

**What changes:** After storing into `revenue_snapshots`, emit two signals scoped to Familje-Stunden's `project_id`. The delta between today and yesterday's snapshot is computed and included in the payload — Atlas can then reason about "MRR is down 3% week-over-week" without reading two rows.

**Observer constraint:** The signal feeds Atlas analysis and the Executive Summary. No execution — no auto-cancellation campaigns, no churn intervention workflows, no email triggers from Omnira.

### 3.2 Social Account Collector (Priority: P0)

**Projects:** 🟢 The Prompt (Instagram, YouTube, Facebook) · 🔵 Familje-Stunden (Instagram, Facebook)  
**Mode constraint:** Observer for Familje-Stunden — collect growth data, no publishing decisions from it

**Collector:** `SocialAccountCollector` — upgrades existing `/api/media/cron/account-snapshot`

Signal kinds emitted:
- `social.account_snapshot` — payload: `{ platform, followers, following, media_count, reach, profile_views, follower_delta_7d, follower_growth_rate }`

The delta and growth rate require reading the previous snapshot. The collector fetches `account_snapshots` for the same project/platform from 7 days ago and computes the delta before emitting. Each project × platform combination produces a separate signal scoped by `project_id`.

**Route:** `GET /api/collectors/social/account` (replaces `/api/media/cron/account-snapshot`)  
**Schedule:** Daily 08:00 UTC (after morning content publishes)  
**CRITICAL:** Add to pg_cron — currently completely missing!

**Why this matters for Observer:** Familje-Stunden's follower trajectory will be invisible to Atlas until this collector runs daily. 30 days of data enables growth trend analysis; 90 days enables seasonal pattern detection. Start now.

### 3.3 Social Post Insights Collector (Priority: P0)

**Projects:** 🟢 The Prompt (primary — drives content scoring) · 🔵 Familje-Stunden (engagement intelligence)  
**Mode constraint:** Observer for Familje-Stunden — insights feed analysis only, not publishing decisions

**Collector:** `SocialInsightsCollector` — wraps existing `/api/media/cron/insights`

Signal kinds emitted:
- `social.weekly_performance` — payload: `{ posts, reach, engagement_rate, saves, shares, comments, likes, top_post_id, top_post_score, by_platform }`

**Route:** `GET /api/collectors/social/insights`  
**Schedule:** Daily 09:30 UTC

**Active vs Observer difference:** For The Prompt, this signal feeds the Opportunity Engine which can generate recommendations like "publish more AI policy content." For Familje-Stunden, the same signal feeds analysis only — Atlas learns what resonates with the audience and stores that intelligence for when the project shifts to Active.

### 3.4 Supabase Platform Collector (Priority: P1)

**Projects:** 🟢 The Prompt (platform health) · shared Omnira infrastructure  
**Mode constraint:** Infrastructure signal — no project mode restriction

**Collector:** `SupabasePlatformCollector` — new

Metrics target: Omnira's own Supabase project health.  
**Source:** Direct SQL query within the same DB (zero auth overhead, no external API).

Signal kinds emitted:
- `supabase.db_snapshot` — payload: `{ table_counts, db_size_bytes, active_connections, cache_hit_rate, slow_query_count }`

**Route:** `GET /api/collectors/supabase/platform`  
**Schedule:** Daily 06:00 UTC  
**Complexity:** Low (SQL query, no external API).

### 3.5 Familje-Stunden Product Collector (Priority: P1)

**Projects:** 🔵 Familje-Stunden  
**Mode constraint:** Observer — user/session metrics for intelligence only

**Collector:** `FamiljeProductCollector` — new

Familje-Stunden is a live product with real users. These metrics are the biggest gap in Observer Mode coverage: we know subscriber counts from Stripe but nothing about in-app behavior.

- Target: active user count (DAU, WAU, MAU), session counts, feature usage
- Source: Familje-Stunden's Supabase (requires cross-project service role key stored in `platform_tokens`)
- Signal kind: `product.familje_stunden.snapshot`

**Route:** `GET /api/collectors/product/familje-stunden`  
**Challenge:** Requires Familje-Stunden's service role key in Omnira's `platform_tokens` table. This is a one-time setup step, not an engineering problem. The same pattern is already used for Instagram/Facebook tokens.  
**Note:** GainPilot product collector is explicitly excluded from v1 (Hibernate Mode).

### 3.6 Website Collector (Priority: P2)

**Projects:** 🟢 The Prompt · 🔵 Familje-Stunden  
**Mode constraint:** Observer for Familje-Stunden — traffic intelligence, no SEO execution

Signal kinds:
- `website.sitemap_snapshot` — page count, last modified, blog post frequency
- `website.traffic_snapshot` — sessions, bounce rate, top pages (requires GA4 or similar)

**Route:** `GET /api/collectors/website/[slug]`  
**Source:** Google Search Console API or Ahrefs (requires key)  
**Complexity:** Medium–High. Deprioritize until social/Stripe collectors are running cleanly.

### 3.7 Future Collectors

| Category | Collector | Signal kind | Projects | Requires |
|---|---|---|---|---|
| Email | Klaviyo/Brevo metrics | `email.campaign_snapshot` | 🔵 Familje-Stunden | Klaviyo API key |
| Analytics | GA4 / Amplitude | `analytics.traffic_snapshot` | 🟢🔵 Both | GA4 API key |
| Customer feedback | App store reviews, NPS | `feedback.sentiment_snapshot` | 🔵 Familje-Stunden | Review API / survey tool |
| GitHub | Commits, PRs, velocity | `github.dev_snapshot` | 🟢 The Prompt | GitHub PAT |
| AI Usage | OpenAI / Anthropic spend | `ai_usage.snapshot` | 🟢 The Prompt | Usage endpoints |
| Ads | Meta Ads | `ads.campaign_snapshot` | 🔵 Familje-Stunden | Meta Ads API |
| CRM | HubSpot | `crm.pipeline_snapshot` | ⚪ GainPilot (post-hibernate) | HubSpot API key |

---

## Part 4: API Changes

### 4.1 Collector Route Convention

Move all collector routes under `/api/collectors/`:

```
/api/collectors/stripe/revenue         # was /api/business/cron/stripe-snapshot
/api/collectors/social/account         # was /api/media/cron/account-snapshot
/api/collectors/social/insights        # was /api/media/cron/insights (subset)
/api/collectors/supabase/platform      # new
/api/collectors/product/[slug]         # new
/api/collectors/website/[slug]         # new (P2)
```

Each route:
- Auth: `Authorization: Bearer {CRON_SECRET}` (existing pattern)
- Response: `{ ok, date, results: CollectorResult[] }`
- Errors: never 500 — returns `{ ok: true, results: [{ status: 'error', error: '...' }] }`

### 4.2 Signals Query API Extension

Add to `lib/atlas/signals.ts`:

```typescript
// Query signals by kind + project, with date range and limit
export async function querySignals<P = Record<string, unknown>>(args: {
  kind:        string
  projectId?:  string | null
  since?:      string   // ISO timestamp
  limit?:      number
}): Promise<SignalRecord<P>[]>

// Get latest signal per kind for a project (parallel to getLatestSignalsPerKindForContent)
export async function getLatestProjectSignals(
  projectId: string,
  kinds: string[],
): Promise<Record<string, unknown>>

// Trend: get time series for a scalar metric within a signal payload
export async function getSignalTimeSeries(args: {
  kind:        string
  projectId?:  string | null
  payloadPath: string   // e.g. 'mrr_sek'
  since:       string
  limit?:      number
}): Promise<Array<{ producedAt: string; value: number }>>
```

### 4.3 Collector Registry

```typescript
// lib/atlas/collectors/registry.ts
export const COLLECTOR_REGISTRY: Record<string, BaseCollector> = {
  'stripe.revenue':      new StripeRevenueCollector(),
  'social.account':      new SocialAccountCollector(),
  'social.insights':     new SocialInsightsCollector(),
  'supabase.platform':   new SupabasePlatformCollector(),
  'product.familje':     new FamiljeProductCollector(),
  'product.gainpilot':   new GainpilotProductCollector(),
}
```

---

## Part 5: Scheduling Design

### 5.1 Existing pg_cron Architecture

The `omnira_cron.call_vercel(path)` pattern is established and works well. New collector jobs follow the same pattern:

```sql
-- Add to omnira_cron.ensure_core_schedules() guardian:

select cron.schedule('atlas_collector_stripe',
  '0 7 * * *',
  $$ select omnira_cron.call_vercel('/api/collectors/stripe/revenue') $$);

select cron.schedule('atlas_collector_social_account',
  '0 8 * * *',
  $$ select omnira_cron.call_vercel('/api/collectors/social/account') $$);

select cron.schedule('atlas_collector_social_insights',
  '30 9 * * *',
  $$ select omnira_cron.call_vercel('/api/collectors/social/insights') $$);

select cron.schedule('atlas_collector_supabase',
  '0 6 * * *',
  $$ select omnira_cron.call_vercel('/api/collectors/supabase/platform') $$);
```

### 5.2 Guardian Coverage

Add all collector cron jobs to `omnira_cron.ensure_core_schedules()` so they auto-restore if dropped. Follow the established M4 pattern exactly.

### 5.3 Collector Heartbeat

Add collector cron job names to `cron_heartbeat` monitoring table so they appear in the Operations Center alongside the existing jobs. Each collector entry should show last run status + duration.

---

## Part 6: Collector Roadmap — Priority Ranked by Lifecycle Mode

### Guiding rule

Phase 1 and 2 work must benefit at least two projects. Collectors that only serve one project are deferred to Phase 3+. Execution-oriented Atlas capabilities (Recommendations engine, Growth Agent, workflow authoring) target The Prompt only and start in Phase 3.

---

### Phase 1 — Framework + Dual-Benefit Collectors (Week 1)

Priority: items that serve both The Prompt and Familje-Stunden simultaneously, and infrastructure that every future collector depends on.

| # | Item | Projects | Mode |
|---|---|---|---|
| 1 | **Schema migration** — `project_id` + `source` on `atlas_signals`, `collector_runs` table | All | Infrastructure |
| 2 | **`BaseCollector` abstract class** — `lib/atlas/collectors/` | All | Infrastructure |
| 3 | **Signal API extensions** — `querySignals`, `getLatestProjectSignals`, `getSignalTimeSeries` | All | Infrastructure |
| 4 | **`StripeRevenueCollector`** — upgrade existing route, emit `stripe.mrr_snapshot` + `stripe.revenue_snapshot` | 🔵 Familje-Stunden | Observer |
| 5 | **`SocialAccountCollector`** — upgrade + add to pg_cron, emit `social.account_snapshot` with 7-day delta | 🟢 The Prompt + 🔵 Familje-Stunden | Both |

**Phase 1 output:**  
Atlas has its first real external signals. The Stripe collector gives Familje-Stunden an MRR time series. The social account collector starts building follower history for both projects — history that has zero value if we delay starting it. Operations Center shows "collector: ok/error" per job.

**Why these five:** Stripe addresses the single biggest intelligence gap for Familje-Stunden (null revenue metrics). Social account collector addresses the single biggest gap for The Prompt (unscheduled, no follower growth data). Schema and framework must precede both.

---

### Phase 2 — Coverage + Observer Depth (Week 2)

| # | Item | Projects | Mode |
|---|---|---|---|
| 6 | **`SocialInsightsCollector`** — per-post engagement → `social.weekly_performance` | 🟢 The Prompt + 🔵 Familje-Stunden | Both |
| 7 | **`SupabasePlatformCollector`** — Omnira DB health → `supabase.db_snapshot` | 🟢 The Prompt | Active/infra |
| 8 | **Heartbeat integration** — collector jobs in `cron_heartbeat` table, visible in Operations Center | All | Infrastructure |
| 9 | **`FamiljeProductCollector`** — active users, DAU/WAU → `product.familje_stunden.snapshot` | 🔵 Familje-Stunden | Observer |

**Phase 2 output:**  
Familje-Stunden Observer Mode is now fully populated: MRR signal, follower signal, engagement signal, and in-app user signal are all running daily. Atlas has the raw material to build 30+ days of baseline history. The Prompt has engagement signal feeding the existing content score and opportunity pipeline. Omnira platform health is observable.

**Observer discipline enforced:** All Familje-Stunden signals in Phase 2 are read-only inputs to Atlas analysis. No execution, no campaign triggers, no automation. Atlas watches.

---

### Phase 3 — Active Pipeline for The Prompt (Week 3–4)

From here, new capabilities target The Prompt's Active mode. Familje-Stunden benefits from analysis improvements but not execution.

| # | Item | Projects | Mode |
|---|---|---|---|
| 10 | **Opportunity Engine v2** — drive opportunities from signals, not just `content_score` | 🟢 The Prompt (primary) | Active |
| 11 | **Signal-driven Executive Summary** — `atlasExecutiveSummary` reads signals for trend data | 🟢🔵 Both (analysis) | Active/Observer |
| 12 | **Trend analysis in Atlas chat** — `getSignalTimeSeries` wired into view-context | 🟢🔵 Both | Active/Observer |
| 13 | **Source Authority DB table** — replace hardcoded const map, enables curator-maintained authority scores | 🟢 The Prompt (editorial) | Active |
| 14 | **Recommendations scaffold** — signal → opportunity → recommended action (The Prompt only) | 🟢 The Prompt | Active only |

**Phase 3 output:**  
Atlas graduates from Reporting to Recommendations for The Prompt. "Based on signals from the last 30 days, here are three things you should do this week" — backed by real signal evidence. Familje-Stunden continues accumulating history silently.

**Active constraint enforced:** The Recommendations scaffold is gated to The Prompt's `project_id`. The same signal infrastructure runs for Familje-Stunden but no recommendation output is generated from it.

---

### Phase 4 — External Intelligence + Execution (Month 2)

| # | Item | Projects | Mode |
|---|---|---|---|
| 15 | **`WebsiteCollector`** — sitemap + traffic snapshot | 🟢🔵 Both | Active/Observer |
| 16 | **Email/analytics collector** — Brevo campaign metrics | 🔵 Familje-Stunden | Observer |
| 17 | **Growth Agent scaffold** — signals → opportunities → Growth Agent → workflow proposals | 🟢 The Prompt | Active only |
| 18 | **GainPilot reactivation review** — assess whether Hibernate Mode should end | ⚪ GainPilot | Decision point |

**Phase 4 output:**  
The Prompt has a Growth Agent that can propose and (with approval) execute workflows based on signal evidence. Familje-Stunden has 60–90 days of baseline history and is ready for Active mode when the business decision is made. GainPilot reactivation is a business decision driven by the outcomes of The Prompt proving ground.

---

### Mode Transition Criteria

**Familje-Stunden: Observer → Active**  
Trigger: business decision + ≥90 days of collector history across Stripe, social account, social insights, product.  
Preconditions: Phase 1–2 collectors running cleanly for 3 months, baseline established.  
What changes: Opportunity Engine and Recommendations scaffold enabled for Familje-Stunden.

**GainPilot: Hibernate → Observer or Active**  
Trigger: business decision to re-engage the product.  
What changes: Add `GainpilotProductCollector`, connect social tokens if any, enable signal collection. No framework changes required — the infrastructure is already multi-project.

---

## Part 7: Risks and Technical Debt

### 7.1 Risks

**R1 — External API instability (Medium):** Instagram's Graph API, Stripe, and YouTube Data API all have rate limits and can return errors or change their shape. The `BaseCollector.validate()` boundary must be strict. All raw responses should be stored in the snapshot's `raw` column for debugging. Rate limit headers should be read and respected.

**R2 — Stripe activation latency (High):** The Stripe collector is currently gated on `STRIPE_RESTRICTED_KEY`. Nothing in the dashboards or heartbeat alerts if this is unconfigured. Until Stripe is active, `revenue_snapshots` is empty and Familje-Stunden shows null across Operations. This should be surfaced in the health system.

**R3 — Cross-product data access (Medium):** GainPilot and Familje-Stunden are separate Supabase projects. Atlas running in Omnira cannot directly query their DBs. Requires either: (a) service role keys stored in `platform_tokens`, (b) each product exposes a private metrics endpoint, or (c) metrics are pushed to Omnira on a schedule. Option (b) is cleanest.

**R4 — Signal volume growth (Low now, Medium later):** At 2–3 collectors per day × 3 projects × 365 days = ~3,000 rows/year. Manageable. At 10 collectors × 10 projects this becomes 36,000+/year. The retention strategy (§2.5) handles this, but needs to be in place before collector volume scales.

**R5 — Schema coupling on `content_id` field (Low):** Current code uses `content_id` for article-scoped signals. Adding `project_id` for entity-scoped collector signals means the column semantics are now: `content_id` = article scope, `project_id` = business scope. This is clear but must be documented. Future signals can use `entity_id` + `entity_kind` pattern (already present in `atlas.memory_events`) if needed.

### 7.2 Technical Debt

**TD1 — `source-authority.ts` hardcoded map:** Async interface, const implementation. When source count grows beyond ~50 known sources, curating the file becomes error-prone. Should be a DB table (`source_authority`) with a seed migration and simple admin. Priority: P2.

**TD2 — `/api/business/cron/stripe-snapshot` and `/api/media/cron/account-snapshot` are orphan routes:** They exist but aren't connected to pg_cron (account-snapshot) or active (stripe-snapshot). They will be superseded by collector routes but should not be left as dead code. Clean up in Phase 1.

**TD3 — Opportunity Engine uses `content_score` only:** `detectOpportunities()` in `lib/atlas/opportunities.ts` derives everything from social post engagement. No external signal feeds it. After Phase 1, this function should read `stripe.mrr_snapshot` and `social.account_snapshot` signals to produce richer opportunities.

**TD4 — GainPilot metrics are hardcoded nulls:** `getOperations()` returns `betaUsers: null, activeUsers: null` with a comment saying "ingen datakälla ännu." This has been this way since the Operations Center was built. It is visible to the operator every time they open the page. Phase 3 fixes this.

**TD5 — No query cache for signals:** Every Atlas context assembly re-reads signals from DB. At current scale this is fine. For the chat path (which assembles context per message), consider a short-lived in-memory cache (30s TTL) once signal volume grows.

---

## Part 8: Atlas Future Readiness

### 8.1 Current Position — Per Project

```
The Prompt:       Reporting ──✅── Analysis ──⚡── Recommendations ──○── Execution
Familje-Stunden:  ○──────────────── Observer (collect) ────────────────────────────
GainPilot:        ○──────────────── Hibernate ──────────────────────────────────────
```

Atlas today across all projects: Reporting + early Analysis (content scores on The Prompt, raw snapshot reads everywhere). After Collectors v1, The Prompt moves through Analysis toward Recommendations. Familje-Stunden gets deep Analysis coverage with no Execution surface. GainPilot stays dormant.

### 8.2 What Collectors Enable Per Project

**The Prompt (Active):**

The Prompt's signal coverage after Phase 1–3 enables the full chain:

- Signals → "Instagram follower growth rate dropped 40% this week (signal id: abc)"  
- Analysis → "Content format change on June 15 correlates with engagement decline"  
- Opportunity → "Return to hook-led short-form format — last seen performing at 3.2% engagement"  
- Recommendation → "Publish 3 hook-led posts this week targeting AI policy topic"  
- Execution → Growth Agent proposes a workflow; operator approves; Atlas schedules it  

Without real signals, each of these steps would require the operator to provide the data manually.

**Familje-Stunden (Observer):**

Observer Mode is not passive waiting — it is active intelligence collection. After 90 days of Collector v1 running:

- Atlas knows the MRR trend line, not just today's snapshot
- Atlas knows whether follower growth correlates with post frequency or post format
- Atlas knows the seasonal engagement pattern (summer vs. autumn for a family product)
- Atlas knows the subscriber churn profile (which months have elevated churn)

When the business decision is made to shift Familje-Stunden to Active, Atlas arrives with 90 days of intelligence rather than starting from zero. This is the strategic value of starting Observer collection now.

**GainPilot (Hibernate):**

No collector work. The framework being multi-project means GainPilot can be onboarded in a single sprint once the business decision is made. The Hibernate period costs nothing from an infrastructure perspective.

### 8.3 Growth Agent — Signal Dependency

The Growth Agent (Phase 4) is the first Atlas capability that can propose and execute workflows autonomously (with approval). It has a hard dependency on signals:

- It needs follower delta signals to detect stalled growth
- It needs engagement signals to identify what content resonates
- It needs MRR/churn signals to contextualize content investment

If the Growth Agent were built before Collectors v1, every recommendation would be grounded in assumptions rather than evidence. Building collectors first is not a delay — it is building the evidentiary foundation that makes the Growth Agent trustworthy.

The Growth Agent targets The Prompt only. Familje-Stunden's signals will feed it as input data when the Opportunity Engine generates cross-project patterns, but execution stays scoped to The Prompt.

### 8.4 Architecture Changes Required Before Phase 1

These must happen before implementation begins — changing them later requires expensive backfills or rewrites:

1. **Add `project_id` to `atlas_signals` now.** Non-breaking additive migration. Every collector needs it. Adding it after the first collectors ship requires backfilling all existing and future records.

2. **Add `source` to `atlas_signals` now.** Same reasoning. Enables `SELECT ... WHERE source = 'stripe'` without parsing `kind` prefixes. One migration, zero regret.

3. **Define the `kind` naming convention now.** Proposed: `{source}.{metric_type}` — e.g. `stripe.mrr_snapshot`, `social.account_snapshot`, `supabase.db_snapshot`. Enforce in the collector registry. Changing this later requires rewriting all signal consumers.

4. **Create `collector_runs` table now.** Without it, there is no audit trail. The heartbeat cron only knows if a job fired — not if it produced valid data. Operations Center needs both.

5. **Encode lifecycle mode in `projects` table or config.** Consider adding a `atlas_mode` column (`active` | `observer` | `hibernate`) to `projects`. The Opportunity Engine and Recommendations scaffold check this before generating output. This prevents accidentally enabling execution capabilities for Observer projects.

---

## Recommended Implementation Order

### Immediate prerequisites (before any collector)

1. **Schema migration** — `project_id` + `source` on `atlas_signals`, `atlas_mode` on `projects`, `collector_runs` table
2. **`BaseCollector` abstract class** — `lib/atlas/collectors/`
3. **Signal API extensions** — `querySignals`, `getLatestProjectSignals`, `getSignalTimeSeries`

### Phase 1 (Week 1) — dual-benefit collectors

4. **`StripeRevenueCollector`** — Familje-Stunden MRR/subscriber signal; the most critical Observer gap  
5. **`SocialAccountCollector`** + pg_cron registration — follower history for both The Prompt and Familje-Stunden; starts the historical clock today

### Phase 2 (Week 2) — coverage + Observer depth

6. **`SocialInsightsCollector`** — engagement signal for both projects  
7. **`SupabasePlatformCollector`** — platform health signal  
8. **Heartbeat integration** — collectors visible in Operations Center  
9. **`FamiljeProductCollector`** — in-app usage signal completes Observer coverage for Familje-Stunden  

### Phase 3 (Week 3–4) — Active pipeline for The Prompt

10. **Opportunity Engine v2** — signal-backed opportunities (The Prompt only)  
11. **Signal-driven Executive Summary** — trends from signals, not raw table reads  
12. **Recommendations scaffold** — The Prompt only, gated by `atlas_mode = 'active'`  
13. **Source Authority DB table** — replaces hardcoded const map  

### Phase 4 (Month 2) — external intelligence + Growth Agent

14. **`WebsiteCollector`** — traffic + sitemap for both projects  
15. **Email/analytics collector** — Familje-Stunden campaign intelligence  
16. **Growth Agent scaffold** — The Prompt only, execution-gated  
17. **GainPilot reactivation review** — business decision point  

### Why this order

The first two collectors (Stripe, social account) were chosen because: (a) each serves two projects simultaneously, doubling the return on the framework investment; (b) social account collector history starts accumulating from day one — every day we delay is a day of history we lose forever; (c) Stripe MRR is the most business-critical signal missing from Familje-Stunden's Observer coverage. Getting these two right validates the framework before scaling to 10+ collectors.

Execution capabilities are deliberately deferred to Phase 3 and scoped to The Prompt. The Prompt must prove the Signals → Analysis → Opportunities → Recommendations → Execution chain works before it is extended to other projects. Familje-Stunden's Observer Mode is not a limitation — it is a deliberate strategy to let Atlas earn trust before it acts.

---

*Update this document after Phase 1 completes. Record any deviations from the proposed schema and collector interface.*
