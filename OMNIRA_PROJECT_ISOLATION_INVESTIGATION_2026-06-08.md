# Omnira — Project Isolation Investigation

**Date:** 2026-06-08
**Trigger:** `/projects/familje-stunden/media` renders The Prompt's branding, pipeline, activity feed, and Instagram token card.
**Status:** Investigation only — no code changed.

---

## TL;DR

The media page does **not** leak The Prompt's *row data* into Familje-Stunden. Its database queries are correctly scoped by `project_id`. What leaks is **presentation**: the media dashboard was built exclusively for The Prompt and **hardcodes** The Prompt's brand, pipeline schedule, and "pipeline active" state. Familje-Stunden gets its own (largely empty) data wrapped in The Prompt's chrome.

A second, real cross-project surface exists: the global **ActivityRail** in the platform layout queries `runs`/`approvals` across **all** projects with no project filter and renders on every page — that is "The Prompt activity feed" showing through.

The deeper issue: **isolation is enforced by convention, not by the database.** RLS is owner-scoped (not project-scoped) and most platform pages use the service-role admin client that bypasses RLS entirely.

---

## 1. Route Investigation — `/projects/familje-stunden/media`

File: `apps/web/app/(platform)/projects/[slug]/media/page.tsx`

- **Project resolution:** correct. `params.slug` → `supabase.from('projects').select('id, name, slug').eq('slug', params.slug).single()` (lines 210–214). 404s if missing. The loaded project ID/slug is genuinely Familje-Stunden's, not a hardcoded or "first row" project.
- **DB queries:** all four are scoped by the resolved `project.id` (lines 222–231):
  - `media_scripts … .eq('project_id', project.id)` (latest 30, week count, month count)
  - `platform_tokens … .eq('platform','instagram').eq('project_id', project.id)`
- **Client used:** `createAdminClient()` — the **service-role** client, which **bypasses RLS** (line 208). Isolation here depends entirely on the explicit `.eq('project_id', …)` filters.
- **React state/store:** none. This is a server component; no Zustand/Redux. The only client context in the shell is `OperatorModeProvider` (UI mode in localStorage) — it carries no project state, so it is not a leak vector.

**Verdict:** the route correctly identifies and scopes Familje-Stunden's data.

## 2. Project Isolation Audit

| Check | Result |
|---|---|
| Context derived from route params | ✅ Yes (`.eq('slug', params.slug)`) |
| Context hardcoded anywhere | ⚠️ **Branding hardcoded** in media page; The Prompt slug `ai-media-automation` and `the-prompt` appear hardcoded in publishing/article/cron code paths |
| "First project in DB" loaded | ✅ No — resolved by slug |
| Cached state leaking between projects | ✅ No — `export const dynamic = 'force-dynamic'`; no client cache holding project data |
| Zustand/Context/Redux shared incorrectly | ✅ No project state in client context |
| Queries ignore current project | ⚠️ Media page queries are scoped, **but** the global ActivityRail and several Atlas/dashboard pages query across all projects |

Correctly isolated for reference (RLS-respecting `createClient()` + `project_id` filter + dynamic `project.name`):
- `projects/[slug]/page.tsx` (landing)
- `projects/[slug]/agents/page.tsx`
- `projects/[slug]/workflows/page.tsx`

## 3. Media Dashboard Audit — why "The Prompt" appears

The visible "leak" is hardcoded chrome, not data:

- **Brand:** `TP` logo block + `<h1>The Prompt</h1>` + tagline "AI news · daily reels · autonomous pipeline" (lines 277–293). Never reads `project.name`.
- **"Pipeline aktiv" badge:** always rendered green/live (lines 296–303), regardless of project.
- **Schedule / pipeline:** `getNextCron()` and the schedule card hardcode The Prompt's cron — 07:20 / 17:20 UTC pipeline, 08:00 / 18:00 publish (lines 151–166, 515–517).
- **Instagram token card:** the *query* is project-scoped, so Familje-Stunden shows its own token or "Token saknas." But the card concept ("Instagram Token") is The Prompt's model. With no Familje IG token, it shows "Token saknas," which reads as The Prompt's token status surfacing.

In short: the media dashboard is a **single-tenant page exposed under a multi-tenant route**. The only dynamic, project-correct elements are the back-link label and the (scoped, likely empty) data lists.

## 4. Data Model Review

Schema (`packages/db/schema.sql`) is structurally multi-tenant: `agents`, `workflows`, `runs`, `outputs`, `memories` all have `project_id UUID NOT NULL REFERENCES projects(id)`. `platform_tokens` was made project-aware in `20260602_g1_multitenant_platform_tokens.sql` (added `project_id`, unique key `(project_id, platform, token_type)`, backfilled existing tokens to The Prompt / `ai-media-automation`).

**But enforcement is weak:**

- **RLS is owner-scoped, not project-scoped.** Policies read `project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())`. Since one operator owns every project, RLS separates *users*, not *projects*. It provides **zero** project-to-project isolation.
- **Service-role admin client bypasses RLS** and is used on ~22 platform pages (media, dashboard, system, manager, action-center, costs, memory, outputs, approvals, revenue, all `atlas/*`, and the layout). On those pages, the *only* thing standing between projects is a hand-written `.eq('project_id', …)` per query.

Answers:

- **Is Omnira multi-project safe?** Partially. Safe *by convention* (correct filters on most project pages), **not by construction** (no DB-level project isolation; RLS doesn't help).
- **Can one project's data appear in another?** Yes, today: (1) the global ActivityRail renders all projects' runs/approvals on every project page; (2) any admin-client query that omits the project filter leaks — the media page demonstrates how easily a page drifts from the per-project contract.
- **Tokens isolated?** ✅ At query level — `platform_tokens.project_id` + scoped query. (Some cron jobs still fall back to env tokens for The Prompt; verify those never write cross-project.)
- **Workflows isolated?** ✅ `project_id` filter + RLS client on the workflows page.
- **Agents isolated?** ✅ Same pattern.

## 5. Findings

### Root cause
The reported symptom has two distinct causes:

1. **Primary (the visible one):** `projects/[slug]/media/page.tsx` is a The Prompt–specific dashboard hardcoded with The Prompt's brand, pipeline, schedule, and live-state, served under the generic `[slug]/media` route. Familje-Stunden's correctly-scoped (empty) data is displayed inside The Prompt's hardcoded shell.
2. **Secondary (a real cross-project surface):** the global `ActivityRail` in `(platform)/layout.tsx` queries `runs` and `approvals` with **no project filter** (admin client) and renders on every route, so The Prompt's activity is visible while on Familje-Stunden.

### Affected files
- `apps/web/app/(platform)/projects/[slug]/media/page.tsx` — hardcoded brand/schedule/state (lines ~277–304, 151–166, 515–517).
- `apps/web/app/(platform)/layout.tsx` — global runs/approvals queries, no project scoping (lines ~22–46), admin client.
- `packages/db/schema.sql` — owner-scoped RLS (lines ~138–181).
- `supabase/migrations/20260602_g1_multitenant_platform_tokens.sql` — backfill assumes The Prompt is the default tenant.
- Broad: ~22 `(platform)` pages use `createAdminClient()` (RLS bypass).

### Architecture risks
- Isolation correctness lives in per-file query filters; one omission leaks across tenants with no DB backstop.
- RLS gives a false sense of safety — it isolates users, not projects.
- Single-tenant pages exposed under multi-tenant routes invite exactly this class of bug.
- "Atlas global" surfaces and "project-scoped" surfaces are not separated at the route/component level, so global widgets render inside project contexts as if they belonged to that project.

### Recommended fix (for the reported bug — not yet implemented)
1. Parameterize the media header from `project` (name, color, initials) instead of hardcoded `TP` / "The Prompt".
2. Drive schedule/pipeline config from the project (or a `project_settings` row), not hardcoded 07:20/17:20.
3. Either scope the ActivityRail to the active project on `/projects/[slug]/*` routes, or explicitly label it as the Atlas global rail and add a project filter/toggle.
4. Add a real empty state for projects with no media pipeline, rather than rendering The Prompt scaffolding.

### Recommended long-term isolation architecture
1. **Make project the RLS boundary.** Add project membership and write policies keyed on the active project / membership, not just `owner_id`. Keep owner as one role within a project.
2. **Stop using the service-role client in user-facing project pages.** Use the RLS-respecting server client so the database enforces isolation as a backstop; reserve the admin client for true system/cron paths.
3. **Single ProjectContext loader per segment.** Add `projects/[slug]/layout.tsx` that resolves the project once (404 on miss) and passes a typed project down; every child query takes `project_id` from it instead of re-deriving.
4. **Typed data-access layer.** Every project-scoped query goes through a repository that *requires* a `projectId` argument — no raw `db.from(...)` in pages — so "forgot the filter" becomes a compile-time error.
5. **Separate Atlas-global from project-scoped surfaces** at the route/component level so a global widget can never render inside a project as if it were that project's.
6. **Per-project config table** (schedule, channels, branding, feature flags like `has_media_pipeline`) so dashboards render from data, not per-brand hardcoded templates.
