# Omnira → The Prompt — Publishing Implementation Plan (CTO-level, design only)

**Status:** Plan only. No code, no migrations, no implementation in this document. Produced after an audit of the Omnira codebase (`apps/web`). Companion to `docs/omnira-publish-contract-v1.md` and `0002_omnira_publishing.spec.md` (both in the website repo).

---

## Part A — Audit findings (current state)

### A.1 Repo shape
Single Next.js app at `apps/web` (the `packages/` dir is effectively empty — not a real monorepo yet). All server logic lives under `apps/web/lib/*` and `apps/web/app/api/*`. The Prompt is the existing project **`ai-media-automation`** (slug unchanged; display name now "The Prompt").

### A.2 Supabase access layer — `lib/supabase/`
- `admin.ts` → `createAdminClient()`: service-role client, bypasses RLS, forces `cache:'no-store'`. **Hardwired to Omnira's project** via `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- `server.ts` (cookie/RLS), `client.ts` (browser), `types.ts` (typed `Database`).
- **Gap:** there is exactly one Supabase project wired in. The Prompt is a *separate* project (`shtffzmmcqdmundfuvda`, different org). Nothing today can talk to a second database. The connector must introduce a *second, independently-configured* client — and must **not** reuse `createAdminClient()`.

### A.3 Content generation (The Prompt brand) — `lib/media/`
- `news-hunter.ts`: autonomous AI-news discovery (HN + Reddit + RSS → dedupe against `media_news_items` → virality scoring → Claude editorial pick). This is the real content engine.
- `agents.ts`: `NEWS_HUNTER_PROMPT`, `SCRIPT_WRITER_PROMPT` (runtime reads prompts from the `agents` table).
- Content model (`supabase/migrations/20260520_media_tables.sql`):
  - `media_news_items`: `title, summary, key_insight, url, source_name, content_angle, virality_score, status (new|approved|rejected|scripted)`.
  - `media_scripts`: `hook, script, captions, hashtags, cta, video_url, video_status, status (pending_review|approved|rejected|published), published_at`.
- **Critical finding:** the pipeline produces **short-form video scripts**, not website articles. There is **no article-body (markdown) generator** today. The website's `body` field has no upstream source yet. `media_news_items` (title + summary + key_insight + source url/name) is the closest article-shaped data, but it's a 2–3 sentence brief, not a post.

### A.4 Approval / workflow systems (three, overlapping)
1. **Generic** `approvals` table + `/api/approvals` (+ `/[id]` PATCH approve/reject/revise, writes feedback to memory). Bound to `runs`/`workflows`/`agents`. This is the platform-wide human-in-the-loop primitive.
2. **Marketing** `draft_posts` + `guard_reports` + `lib/marketing/review.ts` + `/api/marketing/approvals` — **Familje-Stunden only**, and explicitly "no publishing/scheduling here."
3. **Media inline status**: `media_news_items.status` (new→approved) and `media_scripts.status` (pending_review→approved→published) — the autonomous video path's own gating.
- **Implication:** website publishing should hang off either the generic `approvals` primitive or a dedicated state on the source row — **not** the marketing system (wrong project).

### A.5 Publishing precedent — `lib/media/` + `app/api/media/cron/publish`
- Platform connectors already exist: `instagram.ts`, `facebook.ts`, `youtube.ts` (create → poll → publish patterns), with `token-store.ts`.
- `app/api/media/cron/publish/route.ts`: the autonomous publisher. Finds approved+rendered scripts, publishes, stamps `published_at`. Protected by `CRON_SECRET` bearer. Uses `safeguards.ts` (`checkAutomationPaused`, `handlePublishFailure`), `alert.ts` (`sendPipelineAlert`/`sendRunReport`), `run-log.ts` (`logRun` → `runs`/`workflows`).
- **This is the exact shape to mirror**: a destination connector + a cron/endpoint that drains approved items, with safeguards, alerting, and run-logging already available for reuse.

### A.6 Reliability & observability primitives (reusable as-is)
- `lib/media/retry.ts`: `withRetry()` (bounded exponential backoff; `isPermanent()` treats 4xx-except-429 as non-retryable — which already matches contract validation errors returning HTTP 400) and `nextRetryDelayMs()` for a cross-cycle drainer.
- `lib/media/run-log.ts`, `alert.ts`, `safeguards.ts` — logging, alerting, global pause.

### A.7 Cron + secrets
- `vercel.json` crons are sparse (heartbeat, bugscanner); media crons are driven via the route + (per prior work) pg_cron `omnira_cron.call_vercel`. Auth pattern is `Authorization: Bearer ${CRON_SECRET}`.
- Secrets live in Vercel env / `.env.local`. Omnira's own DB uses `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. The Prompt will need **new, distinctly-named** vars (it is a different project).

---

## Part B — Where the connector belongs

**Recommendation: a new, destination-agnostic module `apps/web/lib/publishing/`.**

```
apps/web/lib/publishing/
  contract.ts        # v1 payload + response TS types (mirror of the contract doc)
  destinations.ts    # registry: destination key → { urlEnv, keyEnv, baseUrl }
  client.ts          # per-destination service client factory (NOT createAdminClient)
  publish.ts         # generic publishArticle(dest, payload) / unpublishArticle(dest, extId): retry + idempotency + error parsing
  the-prompt.ts      # publishToThePrompt(...) wrapper + Omnira→contract mapping
  map.ts             # category/tag/source mapping helpers (content_angle/source_name → site taxonomy)
```

**Why here, not elsewhere:**
- *Not `lib/media/`* — the website is, in the federation vision, a destination shared across projects; binding it under the video pipeline couples it to one producer and blocks Phase 3.
- *Not `packages/`* — `packages/` is unused and there is only one consuming app; a shared package adds build/release overhead for zero present benefit. Note for later: graduate to `packages/publishing` only when a second app consumes it.
- *Mirrors the proven `lib/media/<connector>.ts` pattern* but one tier up: the destination is another Postgres/Supabase project reached via an RPC, not a social API. Keeping it isolated makes "add a second website" a registry entry, not a refactor (Phase 3).

**Transport:** call the RPC with supabase-js `.rpc('publish_article', { payload })` using a client built from the destination's URL + service-role key. Simpler and safer than hand-rolled PostgREST fetch.

---

## Part C — Systems that must integrate

| Omnira system | Role in publishing | Integration point |
|---|---|---|
| `lib/media/news-hunter.ts` + `media_news_items` | Source of story selection & metadata | Provides `external_id` (the row id), `title`, `summary`, `source{url,name}` |
| **(missing) article-body generator** | Produces the website `body` (markdown) | **New** agent/step — see Risk R1 |
| `approvals` (generic) **or** a source-row state | Human gate before publish | Approve → enqueue publish |
| `lib/publishing/*` (new) | The connector | Owns the contract call |
| `lib/media/retry.ts` | Transient retry + drainer backoff | Reuse directly |
| `run-log.ts` / `alert.ts` / `safeguards.ts` | Observability, alerting, global pause | Reuse directly; add a "Publish to Website" workflow row |
| `lib/media/storage.ts` / `ideogram.ts` | Hero image hosting (https) | Source of `hero_image_url` |
| pg_cron `omnira_cron.call_vercel` + `CRON_SECRET` | Drives the publish drainer | New cron route |

---

## Part D — Phase 1: make publishing work end-to-end (one destination)

**Goal:** Omnira can reliably, idempotently create/update one article on The Prompt from an approved source.

1. **Apply `0002` to The Prompt.** Move the approved spec SQL into `supabase/migrations/0002_omnira_publishing.sql`, set the real `site.url`, `supabase db reset` locally to validate, `supabase db push` to `shtffzmmcqdmundfuvda` via CLI. Capture the migration in the website repo's ledger. (This is the only DB change in Phase 1; it lands in the *website* project, not Omnira.)

2. **Connector layer** (`lib/publishing/`):
   - `contract.ts`: TS types for the v1 payload and the success/error responses (incl. `operation`, `published_url`, and the error-code union).
   - `destinations.ts`: registry with one entry, `the-prompt`, reading its env vars; throws loudly if missing.
   - `client.ts`: builds a service client per destination with `persistSession:false`, `cache:'no-store'`; guards against accidentally pointing at Omnira's own URL.
   - `publish.ts`: `publishArticle(dest, payload)` / `unpublishArticle(dest, extId)` → `.rpc(...)`, wrapped in `withRetry` for transient faults, parsing the contract `code` to mark validation errors non-retryable.

3. **`publishToThePrompt(input)` wrapper** (`the-prompt.ts`): accepts an Omnira-native input (e.g., a `media_news_items` row + optional body/hero/category/tags/published_at), maps it to the v1 payload (Section E mapping), sets `external_id` deterministically, calls `publishArticle('the-prompt', …)`, returns `{ id, slug, status, published_url, operation }`.

4. **Environment variables** (new, Omnira-side, server-only):
   - `THE_PROMPT_SUPABASE_URL` — The Prompt project URL.
   - `THE_PROMPT_SERVICE_ROLE_KEY` — service-role key for `shtffzmmcqdmundfuvda` (Phase 2 swaps to a scoped `omnira_publisher` key).
   - `THE_PROMPT_PUBLIC_BASE_URL` — optional override; the RPC already returns `published_url`, so this is only a fallback.
   - Distinct names prevent any collision with Omnira's own `SUPABASE_*`. Never `NEXT_PUBLIC_*`.

5. **Idempotency** via `external_id`: derive deterministically from the source — recommended `omnira_<media_news_items.id>`. Re-publish = update (PATCH); retries are safe because the RPC is keyed on `external_id`. Omnira does not need to remember the returned `id`.

6. **Error handling & retry strategy:**
   - *Transient* (network/5xx/timeout): `withRetry` in-call, then a cross-cycle drainer using `nextRetryDelayMs` (mirror `pipeline-retry`).
   - *Permanent* (contract `code`: `category_not_found`, `missing_title`, `invalid_url`, `slug_conflict`, …): do **not** retry; surface via `alert.ts` and mark the source row needs-attention.
   - All publish attempts go through `logRun({ workflow: 'Publish to Website' })`; failures also `sendPipelineAlert`. Respect `checkAutomationPaused` before any write.

**Phase 1 exit:** a manual/triggered call publishes a real approved item to The Prompt, returns a canonical slug + `published_url`, and a re-run updates the same row with no duplicate.

---

## Part E — Phase 2: workflow integration, states, taxonomy, images, observability

1. **Approval → publish.** Bind to the **generic `approvals`** primitive (not marketing). On approve of a website item, enqueue a publish (status on the source row, e.g., `publish_status: queued|published|failed`). Decision flagged in Risk R6.

2. **Draft / scheduled / published.** Drive entirely via `published_at` in the payload: `null` = draft, future = scheduled, past/now = published. Omnira owns the scheduled instant; the website has no cron (RLS reveals scheduled posts at read time). Unpublish = `unpublish_article(external_id)` or PATCH `published_at:null`.

3. **Category & tag mapping** (`map.ts`):
   - Categories must pre-exist (the 6 seeded slugs: news, models, tools, research, business, policy). Omnira's `content_angle` (educational/controversial/…) and `source_name` do **not** map 1:1 → define an explicit mapping with a safe default (`news`). Sending an unmapped slug now fails with `category_not_found` (by design).
   - Tags are open vocabulary → derive from source/topic; get-or-create handled by the RPC. Cap and normalize slugs before sending.

4. **Hero images.** Produce a public **https** URL per article: reuse `lib/media/storage.ts` (Supabase Storage public URL) or generate via `ideogram.ts`; fallback to source `og:image`. The video pipeline doesn't yield article heroes today, so this is a real new step (see R7).

5. **Publish-state mapping table.** Add an Omnira-side `publications` table (or columns on the source) recording `external_id`, destination, returned `slug`, `published_url`, last status, last attempt. Gives the dashboard a source-of-truth without round-tripping the website DB.

6. **Logging & observability.** Add a "Publish to Website" workflow row under the project; every attempt `logRun` + on failure `sendPipelineAlert`/`sendRunReport`. Surface publish state in the project dashboard. Consider a lightweight live artifact later.

7. **Security hardening.** Replace the service-role key with a scoped **`omnira_publisher`** role on the website DB that can `execute` only the two RPCs (the contract already revokes them from anon/authenticated). Shrinks blast radius (R3).

---

## Part F — Phase 3: federation (many destinations)

1. **Same contract, many DBs.** Every Omnira-managed site implements the identical `publish_article(payload jsonb)` v1. Federation is "one connector config per site," not new code.

2. **Destination registry becomes the unit of scale.** `destinations.ts` grows from one entry to N; each carries `{ urlEnv, keyEnv, baseUrl, contractVersion }`. `publishToThePrompt` becomes `publishTo(destinationKey, input)`; per-site wrappers are thin.

3. **Per-site env + per-site role.** Each site contributes `<<SITE>>_SUPABASE_URL` + `<<SITE>>_PUBLISHER_KEY` (scoped role). Omnira's site registry records each site's supported contract version and routes accordingly (v1 today; dual-support window when v2 lands).

4. **Routing & fan-out.** A piece of content can target one or many destinations; the drainer iterates the destination list, each call idempotent by `external_id` *within that site*. No `site_id` in the payload — isolation is one connector per DB.

5. **Governance.** Central place to enforce per-site taxonomy maps, rate limits, and a global pause (`checkAutomationPaused`) across all destinations.

---

## Part G — Risks, blockers, assumptions challenged

- **R1 — BLOCKER: no article-body generator.** The pipeline writes *video scripts*, not blog posts. Without an article-writer step (or an explicit decision to publish `media_news_items` briefs as short posts), the federation plumbing has nothing meaningful to send. **Resolve before Phase 1 has business value.** This is the single most important gap, and it's a content/product decision, not plumbing.
- **R2 — Two service-role keys in one runtime.** Easy to write to the wrong DB. Mitigate: dedicated registry + client factory that refuses Omnira's own URL; never reuse `createAdminClient()`.
- **R3 — External project's service-role key in Omnira's env = broad blast radius.** The contract limits the *surface* (RPC-only) but the key still grants full DB. Move to the scoped `omnira_publisher` role early (Phase 2, not "later").
- **R4 — Publish-state ownership.** Don't overload `media_scripts.published_at` (that's the video path). Stand up `publications` (Phase 2); Phase 1 can fire-and-log.
- **R5 — Taxonomy mismatch.** `content_angle`/`source_name` ≠ site categories; unmapped → `category_not_found`. Ship the mapping + default before autonomous publishing.
- **R6 — Which approval gate?** Recommend the generic `approvals` primitive; the marketing system is Familje-only. Needs your confirmation.
- **R7 — Hero images.** No article-hero source today; needs a storage/generation step or og:image fallback.
- **R8 — Cross-org CLI access.** The Prompt DB is in a different org; Omnira's Supabase MCP cannot reach it. All `0002` apply steps are CLI/user-driven (as before).
- **Assumption challenged — "publishing is the next bottleneck":** it isn't; **content shape (R1) is.** The connector is ~1–2 days of well-understood work; producing publishable article bodies is the real path to a live site.

---

## Part H — Recommended order of execution

1. **Decide R1 (content shape)** and **R6 (approval gate)** — product/architecture decisions that gate everything.
2. **Apply `0002`** to The Prompt (CLI) and smoke-test the RPC with the contract examples — proves the destination before writing connector code.
3. **Build `lib/publishing/`** (contract types → destinations → client → publish) + `publishToThePrompt` + env vars. Manual one-shot publish of a real approved item (Phase 1 exit).
4. **Add the drainer + safeguards/alerts/run-log + `publications` table** (Phase 2 reliability).
5. **Taxonomy mapping + hero images + scheduled/draft states wired to approvals** (Phase 2 completeness).
6. **Swap to scoped `omnira_publisher` role** (Phase 2 hardening).
7. **Generalize to a destination registry** (Phase 3) only when a second site is real.

**Do not start coding until R1 and R6 are decided.**
