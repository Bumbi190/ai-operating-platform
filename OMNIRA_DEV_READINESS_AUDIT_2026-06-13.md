# Omnira — Development-Readiness Audit (13 June 2026)

Read-only audit after the SSD migration. Branch: `diag/atlas-context`. Nothing modified.

---

## 1. Runs correctly from the SSD? — Yes, with one cleanup

| Check | Result |
|-------|--------|
| Dependencies | ✅ `node_modules` present (985 MB root + apps/web hoisted) |
| Node version | ✅ v22 available (requires ≥20) |
| Env files | ✅ `.env.local`, `apps/web/.env.local`, remotion, production — **no host paths baked in** |
| Stale paths in source/config | ✅ Clean (excl. build cache) |
| Build cache | ⚠️ `apps/web/.next` has **341 files referencing the old `/Users/.../Development` path** |

**Action:** delete `apps/web/.next` and rebuild from the SSD. It self-heals on `next build` and reclaims ~394 MB. Recommended formal readiness step: `npm install` (clean) → `npm run -w apps/web typecheck` → `npm run -w apps/web build` from the SSD. *(I did not execute a full build in this audit — that's the one confirmation to run locally.)*

## 2–3. Migration issues / broken references

Effectively none beyond the stale `.next` cache above. No broken symlinks, no stale env, no old-path references in source. The migration is clean for development.

---

## 4. Subsystem state (DESIGNED-in-docs vs IMPLEMENTED-in-code)

### Authorization / Tenancy / Project Isolation — ⚠️ **CRITICAL, the #1 gap**
The service-role admin client (bypasses RLS) is imported in ~110 files. A proper guard layer exists (`lib/auth/project-access.ts` + `lib/atlas/isolation.ts`, fail-closed) **but is wired into only 5 of 101 API routes.** Top open risks:

1. **`/api/v1/runs` + `/api/v1/workflows`** — gated by a single shared `AIOPS_API_KEY`, then list/trigger **across all projects** with no project scope. Highest external blast radius.
2. **Global ActivityRail** (`app/(platform)/layout.tsx:44-51`) — admin client reads **all projects' runs & approvals**, rendered on every page, no filter. (The 2026-06-08 isolation doc's "secondary leak" — still open.)
3. **11 tenant tables have RLS enabled but NO policy** → zero DB isolation; all access via the RLS-bypassing admin client: `leads, campaigns, revenue_events, media_insights, campaign_plans, campaign_briefs, draft_posts, guard_reports, account_snapshots, opportunities, revenue_snapshots`.
4. **`/api/leads` POST** writes to an attacker-chosen `project_id` with no ownership check (cross-tenant write).
5. **`/api/migrate` + `/api/seed`** — privileged DDL/seed behind ordinary session auth (any logged-in user).
6. **`fetchBusinessSnapshots`** (`lib/os/business.ts:119`) fetch-all-then-filter-in-JS; **`gatherAtlasContext(db)`** called unscoped at the Atlas home + briefing cron.
7. **Structural:** RLS is **owner-scoped, not project-scoped.** With one owner today these are cross-*project* leaks; they become cross-*customer* leaks the moment a second customer exists.

*Already hardened (H0):* media + approvals route ownership, fail-closed cron auth, the `comment_replies USING(true)` leak, fail-closed isolation primitives, media-page parameterization.

### Workflow / Execution Engine — ✅ core production-ready; ⚠️ unification in-flight
- **Durable `runs` core is solid:** atomic `claim_runs` (`FOR UPDATE SKIP LOCKED`, lease), per-minute drainer (`api/runs/drain`), `reap_stuck_runs` reaper, retries + `error_history`, idempotent finalization, checkpointing (`lib/ai/checkpoint.ts`), and a DB-level kill switch (`execution_paused`). Unit-tested (`h1-checkpoint.test.ts`).
- **H1 unification is mid-flight and partly dormant:**
  - **P2 (rich executor + checkpointed drain) is coded but FLAG-GATED OFF** (`H1_UNIFIED_EXECUTOR`). If the flag is unset in prod, the drain runs the **legacy `runSteps`** — no checkpoint, so **every retry re-runs all steps and re-generates images** (wasted spend, possible double-post), no validation/quality-gate/cost-logging.
  - **P3 (durable resume): not done** — `lib/ai/resume.ts` is still fire-and-forget with no lease; a killed resume strands a run the reaper can't recover.
  - **P4 (side-effect/approval gate): not built.** **P5 (cancel): half-wired** (columns + RPC exist, executor never reads `cancel_requested`).
  - Known approval-email bug unfixed (`workflow-executor.ts:358`, `.eq('id', runId)` should be `workflow_id`).
- **Three divergent step-runners** (`runSteps`, `executeRunSteps`, two `executeWorkflow`s) — the latent confusion the H1 doc itself names.

### Atlas — ✅ advisor layer production-ready; ⚠️ operator autonomy unbuilt
- Context/intel layer is mature, project-scoped, tested, with an honesty guard. Reads operator "decisions" from `memories` and honors them.
- **But only `trigger_workflow` (and media `run_media_step`) actually executes.** `delegate` writes `manager_tasks`/`agent_messages` and **creates no run** — "delegation is theatre" (design gap G1). The O0-O5 operator plan (`OMNIRA_ATLAS_OPERATOR_DESIGN.md`, dated today) is design-only.

### Media — ✅ production-ready
Battle-tested cron state machine over `media_scripts` (step1→4 + publish/youtube), self-healing retry/reaper with backoff + alerting, dual render (local Remotion CLI + Remotion Lambda). The proven model the durable `runs` engine was generalized from.

---

## 5. Vs roadmap (original priority order)

| # | Roadmap priority | Status |
|---|------------------|--------|
| 1 | **Authorization & tenancy hardening** | ⚠️ **Partial** — H0 done; Grundhardning Fas-0 (RLS policies, mandatory guard, fetch-all removal, NOT NULL) **not done**. Still the #1 gap. |
| 2 | Durable workflow/job execution | ✅ Core done; H1 unification in-flight (P2 flag-off, P3-P5 pending) |
| 3 | Database migration cleanup | 🔄 Ongoing (recent type/migration cleanup commits) |
| 4 | Product boundary separation | ⛔ Not started |
| 5 | Production controls & observability | 🔄 Partial (heartbeat, alerts, token-health) |

---

## 6. Recommended next milestone & plan

### Highest-priority next task → **Tenancy Hardening "Fas-0"**
Make project isolation enforced by the **database + a mandatory guard**, not by per-query convention. This is both the documented #1 priority and the top live risk, and it's a hard prerequisite before onboarding any second customer.

### Recommended Claude execution plan (PR sequence, smallest-blast-radius first)
1. **PR-A — Lock down privileged routes (fast, high value):** require `AIOPS_API_KEY`/admin on `/api/migrate` & `/api/seed` (or remove from deployed surface); add ownership check to `/api/leads` POST via `resolveProjectAccess`. *Low risk, immediate.*
2. **PR-B — Scope the external API:** bind `AIOPS_API_KEY` → project(s); scope `/api/v1/runs` & `/api/v1/workflows` to that binding. *Security-critical.*
3. **PR-C — RLS policies** for the 11 policy-less tenant tables (owner-scoped now, project-membership-ready). Ship migration + verify with `get_advisors`. *Security-critical — Codex review.*
4. **PR-D — Scope the ActivityRail + replace fetch-all:** filter `runs`/`approvals` in `layout.tsx` to allowed projects; push `project_id` into SQL in `fetchBusinessSnapshots`; pass `allowedProjectIds` into `gatherAtlasContext` at home/cron.
5. **PR-E — Make the guard mandatory:** adopt `assertProjectAllowed` across remaining admin-client routes; add a lint/CI check that flags raw admin-client use in `app/api/**` without the guard.
6. **PR-F (parallel track) — Resolve the H1.P2 flag:** validate the unified executor, then either enable `H1_UNIFIED_EXECUTOR` in prod or finish P3/P4 first. Don't leave prod silently on the weaker engine.

Each PR should land behind the existing kill switch and be verifiable in isolation.

### Major changes that should get a **Codex review before merge**
- **The current uncommitted H1.P2 diff** — `workflow-executor.ts` (+115 lines), `checkpoint.ts`, and the **new untracked migration `20260613_h1p1_execution_policy_foundation.sql`** + new `h1-executor.test.ts`. Execution-engine + migration = high risk.
- **All RLS / tenancy migrations (PR-C)** — security-critical, must be reviewed.
- **The guard-adoption refactor (PR-E)** — broad surface across many routes.
- ⚠️ **Branch hygiene:** `diag/atlas-context` contains commit `a5bfce7 "diag(atlas): temporary atlas context diagnostics"`. Do **not** merge that diagnostic code to main as-is — drop/revert it (or cherry-pick only the real changes) before any merge.

---

## Risks summary
- **Tenancy:** cross-project leaks today, cross-customer the instant a 2nd customer exists (blocks growth).
- **Execution:** prod may be on the weaker legacy executor (flag-off) → wasted spend / double-post on retries.
- **Data safety:** creator-brain-style single-copy risk doesn't apply here (Omnira has a GitHub remote), but Omnira has **unpushed commits + uncommitted work on a diagnostic branch** — push/clean it.
- **Migrations:** an unapplied new migration is in the working tree — apply deliberately with review.
