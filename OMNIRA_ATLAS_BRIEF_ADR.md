# Atlas Score · Atlas Signal Platform · Atlas Brief — Architecture Decision Record

**Status:** Approved, implementation pending
**Owner:** Andre Hultgren
**Scope:** The intelligence and distribution layer on top of Omnira's editorial pipeline. Establishes the long-term architecture for Atlas as an analysis / recommendation / decision platform; first deliverable is Atlas Score + Atlas Brief.

---

## Why this exists

Omnira monitors thousands of AI sources daily and publishes editorial articles to The Prompt. Today there is **no analysis layer on top of that data** — no scoring, no signal extraction, no recommendation surface. Atlas is the layer that turns Omnira's raw editorial output into intelligence the reader can use.

Atlas Brief is the first product surface that exposes Atlas-derived intelligence to the public. The newsletter is the distribution channel, not the product — the product is the scored, source-linked, methodology-transparent system that produces the brief.

**Constraint:** Build for 0-100 subscribers without architecting in ways that block 10k subscribers or future signal types beyond scoring.

---

## Three layers — clean separation

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         ATLAS BRIEF (product)                             │
│  Public web (/atlas/brief, /atlas/score/<slug>, /atlas/methodology),      │
│  Sunday email digest, lead capture, KPI instrumentation.                  │
│  Reads structured signal data. Does not know how signals are produced.   │
└────────────────────────────────▲─────────────────────────────────────────┘
                                 │  consumes via Signal Platform's query API
┌────────────────────────────────┴─────────────────────────────────────────┐
│                     ATLAS SIGNAL PLATFORM (long-term centre)              │
│  Append-only signal log. Generic `atlas_signals(kind, payload, version)`. │
│  Score is one producer. Future producers: Opportunity, Prediction,        │
│  Recommendation, Cluster, BI Aggregate. All write same table.            │
└────────────────────────────────▲─────────────────────────────────────────┘
                                 │  signal producers write here
┌────────────────────────────────┴─────────────────────────────────────────┐
│                   SIGNAL PRODUCERS (Score Engine v1 is the first)         │
│  Pure functions. Versioned. Each producer commits to a (kind, version).   │
│  Multiple versions can coexist (Score v1 + Score v2 in parallel).        │
└──────────────────────────────────────────────────────────────────────────┘
```

**What each layer owns:**

- **Signal producers** own algorithms. Pure functions. No DB. No state.
- **Signal Platform** owns the append-only log + query API. No algorithms.
- **Brief** owns the public surfaces. No algorithms, no persistence beyond rendered output.

**What each layer must not touch:**

- Producers know nothing about DB, queries, or readers.
- Signal Platform knows nothing about Atlas Score's formula or Brief's HTML.
- Brief knows nothing about the scoring formula — it reads `{ value, dimensions[], version }` opaquely.

---

## The Signal Platform primitive

The single most important architectural decision: **one generic table** that any future signal producer can write to without schema changes.

```sql
create table atlas_signals (
  id          uuid primary key default gen_random_uuid(),
  content_id  uuid,                                    -- NULLABLE and NO FK — future kinds may reference media_news_items, entities, clusters, or be global
  kind        text not null,                           -- 'impact_score' (v1); 'opportunity', 'prediction', 'recommendation' (future)
  payload     jsonb not null,                          -- shape varies by kind
  version     text not null,                           -- producer version, e.g. 'score-engine-1.0.0'
  produced_at timestamptz not null default now()
);

create index atlas_signals_content_kind_idx
  on atlas_signals(content_id, kind, produced_at desc)
  where content_id is not null;
create index atlas_signals_kind_idx
  on atlas_signals(kind, produced_at desc);

alter table atlas_signals enable row level security;
-- No anon access. Admin-only via service role.
create policy atlas_signals_admin_only on atlas_signals
  for all to authenticated using (false) with check (false);
```

### Why `content_id` is NULLABLE — and has NO foreign key

Critical for forward compatibility. Atlas will emit signals that aren't anchored to a single article:

| Signal kind | Anchored to a `website_content` row? |
|---|---|
| `impact_score` (v1) | Yes — content_id is the article |
| `prediction_outcome` | Sometimes — could be article-level or global |
| `opportunity` | No — spans clusters, entities, or markets |
| `cluster_emerged` | No — a theme, not an article |
| `entity_momentum` | No — about a company/person |
| `weekly_market_summary` | No — global |
| `recommendation` | No — targeted at a reader/segment |

**Forcing `NOT NULL` would either block these signals or require sentinel content rows.** Nullable from start; payload jsonb holds whatever subject reference is needed.

**The foreign key is also removed.** Future signal kinds may reference `media_news_items` (sources not promoted to article), entity ids, cluster ids, or no subject at all. An FK to `website_content(id)` would block all of these. The producer is responsible for `content_id` validity. Atlas is append-only and historical — orphan signals (after a rare article deletion) remain valid track-record entries.

### Why payload is jsonb

Each signal kind has its own shape. We never want a schema migration to add a signal type. Payloads are validated at the producer boundary (TypeScript types), not in the DB.

### Why `version` is a string, not a number

Producers can be semver'd (`score-engine-1.0.0`, `score-engine-1.1.0`, `opportunity-detector-0.1.0`). Lets us run multiple producer versions in parallel and migrate readers gradually.

### Append-only

No UPDATE, no DELETE. Track record falls out for free. "What did we score this in week 23?" becomes a `WHERE produced_at` range. "Were we right last quarter?" is a join between predictions and outcomes.

---

## Signal Platform interfaces

```ts
// lib/atlas/signals.ts

// ── Phase 1 implementations ──────────────────────────────────────────────────

export async function recordSignal(args: {
  contentId: string | null
  kind: string
  payload: Record<string, unknown>
  version: string
}): Promise<SignalRecord>

export async function getLatestSignal(args: {
  contentId: string
  kind: string
}): Promise<SignalRecord | null>

/**
 * Convenience: latest signal per kind for one content row, shaped as
 * { [kind]: payload }. Matches the denormalized articles.atlas_signals
 * jsonb on The Prompt side — used by syncPublishedArticle as a direct
 * pass-through.
 */
export async function getLatestSignalsPerKindForContent(
  contentId: string,
): Promise<Record<string, unknown>>

// ── Phase 4 (added when Brief assembly requires it) ──────────────────────────
//
// querySignals is part of the Signal Platform's long-term query contract but
// is NOT implemented in Phase 1. Adding it when Brief assembly determines the
// exact filter shapes avoids over-designing the filter set on speculation.

export async function querySignals(args: {
  contentId?: string
  kind?: string
  since?: Date
  versions?: string[]
  latestPerKind?: boolean
}): Promise<SignalRecord[]>
```

**Producers call `recordSignal`. Consumers (Brief, Score-page) call `getLatestSignal` / `querySignals`.** The Platform's public interface is these functions, not the table.

---

## Signal Producer v1 — Atlas Score Engine

**Functional core, imperative shell.** `computeScore` is a synchronous pure function. No DB. No I/O. All data fetching happens in the caller. Lives in `lib/atlas/score.ts` as a single file.

```ts
// lib/atlas/score.ts

export const SCORE_ENGINE_VERSION = 'score-engine-1.0.0'

export interface SourceObservation {
  name:       string
  url:        string
  observedAt: string
}

export interface ScoreInput {
  contentId:       string
  publishedAt:     string
  sources:         SourceObservation[]
  category:        string | null
  sourceAuthority: Record<string, number>  // pre-loaded by caller (see source-authority.ts)
}

export type DimensionName = 'source_authority' | 'source_count'
// v1: 2 dimensions. More land as data permits — each addition bumps
// SCORE_ENGINE_VERSION. See "Growth path" below.

export interface ScoreDimension {
  name:    DimensionName
  value:   number                           // 0-100, normalized
  weight:  number                           // renormalized over included dimensions
  rawData: Record<string, unknown>          // audit trail per dimension
}

export interface ScorePayload {
  value:      number                        // 0-100, weighted sum
  dimensions: ScoreDimension[]              // only the ones we could compute
  excluded:   DimensionName[]               // skipped due to missing input
}

export function computeScore(input: ScoreInput): ScorePayload
//                                              ^^^^^^^^^^^
//                                              sync · pure · deterministic
```

### Source authority — separate concern, caller-side preload

Source authority is **not** part of the engine. It lives in `lib/atlas/source-authority.ts`:

```ts
export async function loadAuthorityMap(
  sourceNames: string[],
): Promise<Record<string, number>>
```

**The caller pre-loads** the authority map for the sources at hand, then calls `computeScore`. The engine reads from the map but knows nothing about where the data came from. This means:

- v1: const lookup table wrapped in `Promise.resolve` (forward-safe signature)
- v2: DB-backed table with caching
- v3: multi-source (DB + LLM-rated + citation graph)

The engine is identical across all three. Only `source-authority.ts` evolves.

### Growth path — adding dimensions over time

`computeScore` works with any subset of dimensions. We add them as the data becomes available, never before:

| Dimension | Lands when | Engine version |
|---|---|---|
| `source_authority` | v1 ✅ | 1.0.0 |
| `source_count` | v1 ✅ | 1.0.0 |
| `momentum` | ≥2 weeks of prior `impact_score` snapshots exist | 1.1.0 |
| `novelty` | Embeddings pipeline exists | 1.2.0 |
| `scope` | A defensible algorithm exists | 1.3.0 |

Past records keep their original version. Brief rendering filters by `engine_version` when methodology page shows historical comparisons.

### Producer's contract with the Platform

```ts
// In the orchestrator (e.g. brief assembly cron):
const sourceNames = input.sources.map(s => s.name)
const sourceAuthority = await loadAuthorityMap(sourceNames)  // async data load

const score = computeScore({ ...input, sourceAuthority })    // sync pure computation

await recordSignal({
  contentId: input.contentId,
  kind:      'impact_score',
  payload:   score,
  version:   SCORE_ENGINE_VERSION,
})
```

**Future producers follow the same pattern.** Opportunity Detector receives pre-loaded data from its caller, returns an `OpportunityPayload`, records with `kind='opportunity'`, version `'opportunity-detector-0.1.0'`. Same table, same write path. The functional-core principle scales to every future producer.

---

## How signals reach The Prompt — denormalized read path

Signal data lives on Omnira. The Prompt is the public-facing site and renders score badges in homepage cards without a cross-DB API call.

### Denormalized column on `articles`

```sql
alter table articles add column atlas_signals jsonb;
```

**Shape:** object keyed by signal `kind`, latest payload per kind. **Replace-on-write semantics** (not PATCH-merge like text fields):

```json
{
  "impact_score": {
    "value": 91,
    "dimensions": [
      { "name": "source_authority", "value": 89, "weight": 0.6 },
      { "name": "source_count",     "value": 94, "weight": 0.4 }
    ],
    "excluded": ["momentum", "novelty", "scope"],
    "version": "score-engine-1.0.0",
    "produced_at": "2026-06-15T06:00:00Z"
  }
}
```

**Why latest-only on the Prompt side:**
- Fast read for homepage cards (one jsonb extraction, no joins)
- The full append-only history stays on Omnira for analytics
- Future signal kinds (recommendation, opportunity) slot in as new keys without migration

### PublishPayload v1.1 — extends the publish contract

```ts
export interface PublishPayload {
  version: 1
  external_id: string
  title?: string
  summary?: string | null
  body?: string | null
  hero_image_url?: string | null
  category?: ArticleCategoryInput | null
  tags?: ArticleTagInput[] | null
  source?: ArticleSourceInput | null
  published_at?: string | null

  // NEW in v1.1: latest signals per kind
  atlas_signals?: Record<string, unknown> | null
}
```

**`publish_article(jsonb)` RPC semantics for `atlas_signals`:** replace-on-write (not field-by-field PATCH). When the key is present in payload, overwrite the column. When absent, leave it untouched. Different from text fields where PATCH means "merge if non-null."

### Sync flow

`syncPublishedArticle()` (existing from Hero V2) reads `website_content` and assembles the publish payload. We extend it to also query `atlas_signals` for the article's latest-per-kind and include it in the payload. The existing PATCH RPC routes it through.

```ts
// lib/publishing/sync.ts (extension)
const latestSignals = await getLatestSignalsPerKind(articleId)  // → Record<string, ScorePayload | ...>
const syncPayload = {
  ...frozen,
  // ...existing overlays (title, summary, slug, hero_image_url, published_at)...
  atlas_signals: latestSignals,
}
```

---

## Atlas Brief — product surfaces

Three surfaces, one data model.

### Surfaces

| Surface | Where | Data source |
|---|---|---|
| `/atlas/brief` | The Prompt frontend | `newsletter_issues.content` jsonb (latest sent) |
| `/atlas/brief/[isoWeek]` | The Prompt frontend | `newsletter_issues.content` (historical) |
| `/atlas/score/<slug>` | The Prompt frontend | `articles.atlas_signals.impact_score` |
| `/atlas/methodology` | The Prompt frontend | Static (markdown, version-controlled in git) |
| Sunday email digest | Brevo via Atlas backend | Same `BriefData` jsonb as the web surface |

### Single data model, two render targets

```
              BriefData (jsonb in newsletter_issues.content)
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   <BriefView>             <BriefEmail>
   (Next.js SSR)           (react-email)
        │                       │
   web: /atlas/brief       email: Sunday 08:00
```

Sub-components (`<SignalCard>`, `<ScoreBadge>`, `<IgnoredItem>`, `<StatsFooter>`) are shared. Web and email cannot drift because they render from the same structured document.

### Email tech: react-email

Picked over MJML because:
- JSX matches the existing codebase
- AI-generated content (Sonnet-written "why this matters" sentences) flows naturally into typed JSX props
- Local preview via `npx react-email dev` without sending
- Tailwind adapter reuses the design tokens

---

## Cross-DB ownership

| Data | Lives in | Why |
|---|---|---|
| `website_content` (editorial pipeline) | Omnira | Pre-existing |
| `media_news_items` (source ingestion) | Omnira | Pre-existing |
| **`atlas_signals`** | **Omnira** | Intelligence has same origin as source data |
| `articles` (public mirror) | The Prompt | Pre-existing |
| **`articles.atlas_signals`** (denormalized) | **The Prompt** | Fast public read; synced from Omnira |
| `newsletter_subscribers` | The Prompt | Pre-existing; signup form writes directly |
| **`newsletter_issues`** | **The Prompt** | Lives with subscribers; `/atlas/brief` SSR reads from here |
| Brevo / Anthropic / Ideogram keys | Atlas env vars | Never on The Prompt side |

**Rule:** Atlas is intelligence; The Prompt is delivery. Signals are computed on Omnira; they're served from The Prompt via denormalized columns.

---

## What v1 deliberately does NOT do

- **No `atlas_signal_events` table.** YAGNI — no events to emit yet. Will be added as kinds in `atlas_signals` when needed (`threshold_crossed`, `prediction_outcome`).
- **No `newsletter_sends` table.** Per-recipient tracking is overkill at 0-100 subs; Brevo's dashboard suffices. Added when subscribers > 500 or per-subscriber analytics needed.
- **No Brevo webhook.** Same reason.
- **No watchlist segment in early issues.** Requires 3+ weeks of snapshots; added in issue #4.
- **No KPI dashboard.** Brevo + Supabase Studio sufficient for first months.
- **No embeddable badges.** Defer until external demand.
- **No public `/api/atlas/signals/[id]` route for external consumers.** The denormalized `articles.atlas_signals` covers production rendering; debug-only endpoint suffices.
- **No methodology versioning history.** Static page in v1; versioning added the first time we actually change the formula.
- **No scoring cron separate from brief-assembly cron.** Score on publish + during brief assembly; one cron, not three.
- **No `atlas_actions` table.** Actions (mutations Atlas performs autonomously) are a separate ownership domain. When Atlas starts taking actions, that table lands. Not now.

---

## Implementation phases

Each phase is independently shippable. Stop after any phase if needed.

| Phase | Outcome | Blocked by |
|---|---|---|
| **0 — DNS/Brevo prep** | SPF/DKIM/DMARC on theprompt.nu verified; Brevo sender configured for `signals@theprompt.nu`. No code. | — |
| **1 — Signal Platform + Score Engine** | `atlas_signals` table, `lib/atlas/signals.ts`, `lib/atlas/score.ts`, tests. Signals can be recorded and queried. | 0 |
| **2 — Sync extension** | `articles.atlas_signals` column on The Prompt + publish_article RPC updated + `syncPublishedArticle` carries signals. Score reaches The Prompt. | 1 |
| **3 — Public score surface** | `/atlas/score/<slug>` + `/atlas/methodology` pages live. SSR from `articles.atlas_signals`. | 2 |
| **CHECKPOINT** | Validate score credibility publicly. Iterate dimensions/weights if needed. Decision to proceed to Brief. | — |
| **4 — Brief assembly** | `lib/atlas/brief.ts` + brief-run cron. Persists draft `newsletter_issues`. No email yet. | 3 |
| **5 — Opt-in + lead capture** | Subscribe / confirm / unsubscribe API + react-email confirmation/welcome templates + inline mid-article CTA. List can grow. | — |
| **6 — Brief delivery** | `<AtlasBriefEmail>` react-email template + send loop + manual operator-approval gate for first 2-3 issues. First issue ships. | 4, 5 |

---

## Decision log

- **One generic `atlas_signals` table, not multiple (snapshots + events).** Future signal kinds slot in without schema migration. The price (less type safety per-kind in DB) is paid in producer-side TypeScript, where it belongs.

- **`content_id` is NULLABLE AND has no foreign key.** Future global / entity / cluster signals require nullable. The missing FK lets producers reference `media_news_items`, entity ids, or cluster ids — none of which exist in `website_content`. Producer is responsible for validity.

- **`version` is a string, not a number.** Lets multiple producer versions coexist (Score v1.0 and Score v2.0). Replaces "schema version" thinking with "producer version."

- **Score Engine is synchronous and pure (functional core).** Data fetching (source authority, prior snapshots, embeddings) happens in the caller (imperative shell). Tested without mocks. Future data sources evolve freely without touching the engine. Async-from-engine pattern explicitly rejected.

- **Source authority lives outside the engine** in `lib/atlas/source-authority.ts`. `loadAuthorityMap` is async from start so v2 can swap to DB-backed lookup without changing callers. Engine never reads from DB or const — only from the pre-loaded map in `ScoreInput`.

- **Score Engine v1 ships with 2 dimensions, not 5.** Honest about what we can defend. Each future dimension lands when its data exists and bumps `SCORE_ENGINE_VERSION`. Past records remain interpretable forever via their stamped version.

- **The Prompt holds denormalized latest-per-kind; Omnira holds the append-only history.** Fast reads on the public site, full analytics on the intelligence side.

- **Replace-on-write semantics for `atlas_signals` in the RPC** (not field-by-field PATCH). Different from text fields; documented explicitly in the migration.

- **Brief data model lives in `newsletter_issues.content` as structured jsonb.** Web and email render from the same document. They cannot drift.

- **Manual operator-approval gate for first 2-3 issues.** Catches scoring errors before they're sent to subscribers. Removed once trust in the engine is established.

- **`/atlas/score/<slug>` ships in phase 3, before any email infrastructure.** Score-credibility checkpoint before we build the brief.

---

## What this architecture enables without rework

| Future capability | Mechanism |
|---|---|
| Add 6th score dimension | `ScoreDimension[]` is already array. Bump engine version. Old records remain interpretable. |
| Swap to ML-based scoring | New `lib/atlas/score-v2.ts` + new version string. Both coexist. |
| Opportunity Detector | `kind='opportunity'`, payload holds subject ref. content_id can be null. Same table, same write path. |
| Prediction Tracking | `kind='prediction'` and `kind='prediction_outcome'`. Outcome payload references prediction's signal id. |
| Atlas Recommendations | `kind='recommendation'`, payload carries `target` (subscriber id, segment, global). |
| Per-reader personalisation | Add `subscriber_preferences`; brief-assembly filters BriefData per recipient. Email template takes per-recipient props. |
| Multi-week watchlist | Query `atlas_signals WHERE kind='impact_score' AND produced_at > now() - 8w`. No schema change. |
| Per-subscriber delivery analytics | Add `newsletter_sends` + Brevo webhook. Existing issues unchanged. |
| Public Atlas API | Expose `querySignals` via authenticated route. Schema unchanged. |
| Embeddable score badges | Static SVG renderer reads `articles.atlas_signals.impact_score`. No backend change. |
| Knowledge graph / entity tracking | New signal kinds with entity-shaped payloads. No table change. |
| Atlas takes autonomous actions | New `atlas_actions` table (separate ownership domain). `atlas_signals` remains observational. |

The structural moves that enable all of this: **generic signals table + nullable content_id + producer-versioned payloads + denormalized read path.** Three architectural decisions, made once.

---

## File index for future developers

```
apps/web/  (Atlas backend)
├── lib/atlas/
│   ├── signals.ts            # recordSignal / getLatestSignal / getLatestSignalsPerKindForContent (Phase 1) · querySignals (Phase 4)
│   ├── score.ts              # computeScore — sync pure producer; v1 = 2 dimensions
│   ├── source-authority.ts   # loadAuthorityMap — outside engine, caller-side preload
│   ├── brief.ts              # buildBriefForWeek — Brief data assembly (Phase 4)
│   └── README.md             # → this ADR
│
├── app/api/atlas/
│   └── brief-run/route.ts    # Cron-gated: score + sync + assemble + send
│
├── lib/publishing/sync.ts    # EXTENDED: includes atlas_signals in payload
│
└── supabase/migrations/
    └── 20260622_atlas_signals.sql   # Signal Platform foundation

Theprompt-hemsida/  (The Prompt frontend)
├── src/pages/
│   ├── AtlasBriefPage.tsx          # /atlas/brief
│   ├── AtlasScorePage.tsx          # /atlas/score/[slug]
│   └── MethodologyPage.tsx         # /atlas/methodology
│
├── src/components/atlas/
│   ├── BriefView.tsx               # shared between web + email
│   ├── SignalCard.tsx
│   ├── ScoreBadge.tsx
│   ├── IgnoredItem.tsx
│   └── StatsFooter.tsx
│
├── src/emails/
│   └── AtlasBriefEmail.tsx         # react-email wrapper around BriefView
│
├── src/components/
│   └── InlineNewsletterCTA.tsx     # lead capture on article pages
│
├── api/newsletter/
│   ├── subscribe.ts                # POST: insert + send confirmation
│   ├── confirm/[token].ts          # GET: set confirmed_at
│   └── unsubscribe/[token].ts      # GET: set unsubscribed_at
│
└── supabase/migrations/
    ├── 0003_articles_atlas_signals.sql       # denormalized signal column
    ├── 0004_newsletter_subscribers_extended.sql
    └── 0005_newsletter_issues.sql
```

---

## Production verification — at-launch checklist

Before first Brief ships:

- [ ] DNS: SPF, DKIM, DMARC verified on theprompt.nu
- [ ] Brevo: `signals@theprompt.nu` sender domain verified in console
- [ ] First 5 `impact_score` signals computed and visible at `/atlas/score/<slug>`
- [ ] `/atlas/methodology` reflects current engine version
- [ ] Confirmation email tested end-to-end with a real mailbox
- [ ] Unsubscribe link tested end-to-end
- [ ] First brief assembled as `status='draft'` and reviewed by operator
- [ ] Manual send-approval gate active for issues #1-#3
