# Repository Health Audit

Repository: `/Users/andrehultgren/Developer/AI Operating Platform`  
Date: 2026-07-06  
Branch: `main`  
Constraint honored: no files deleted, moved, staged, or committed.

## Executive Summary

The repository was clean before this report was created: `git status --short --untracked-files=all` returned no output. After creating the requested audit, the only untracked file is `REPOSITORY_HEALTH_AUDIT.md`.

The main health risks are tracked repository hygiene issues:

- Several root-level planning and architecture documents are stale or roadmap-like and should probably live in Evolution Roadmap rather than the code repository.
- Several tracked duplicate implementation files with names like `page 2.tsx`, `route 2.ts`, and `render 3.ts` look like abandoned copies.
- Two tracked Remotion render input JSON files contain concrete generated media payloads and public Supabase asset URLs; they look like run artifacts rather than source.
- The Memory Stage 1 implementation exists, but it is not yet fully operational: schema sources conflict, memory context is not injected into generation, the seed form likely fails, and memory deletion lacks an ownership check.

## Git State

Command run:

```bash
git status --short --untracked-files=all
```

Result before creating this report: clean worktree, no untracked files.

Result after creating this report:

```bash
?? REPOSITORY_HEALTH_AUDIT.md
```

## Untracked File Classification

| File | Classification | Why |
| --- | --- | --- |
| `REPOSITORY_HEALTH_AUDIT.md` | KEEP IN REPOSITORY | This is the requested audit artifact. It should remain untracked until a human reviews it, then be staged/committed intentionally if accepted. |

No other untracked files were present.

## Document Sets And Repository Hygiene

### Root MVP Planning Set

Files:

- `MVP_ARCHITECTURE.md`
- `IMPLEMENTATION_CHECKLIST.md`
- `SYSTEM_STATUS.md`

Recommended classification: MOVE TO EVOLUTION ROADMAP

Why: These are valuable planning and historical architecture documents, but they describe the May 2026 MVP shape. The current repo now includes media automation, Remotion, manager/planning features, evaluation/memory work, and an Omnira redesign. Keeping these at repo root makes them look authoritative even where they are stale.

### Familje-Stunden Product Planning Set

Files:

- `FAMILJE_STUNDEN_SPEC.md`
- `MÅNADSPAKET_PLAN.md`

Recommended classification: MOVE TO EVOLUTION ROADMAP

Why: These are product/content strategy documents for Familje-Stunden. They are useful, but they are not code-facing implementation docs. They belong better in Evolution Roadmap or a product knowledge base, with only the runtime contracts kept in the repo if needed.

### The Prompt Brand Set

Files:

- `BRAND.md`
- `brand/assets/*`

Recommended classification: KEEP IN REPOSITORY

Why: `BRAND.md` is directly referenced by the current memory seed logic as the source of initial brand rules, and the brand assets are source assets. If the platform remains multi-brand, this should eventually move under a brand/project-specific directory rather than repo root.

### AI Media Automation Architecture

File:

- `docs/ai-media-automation-mvp.md`

Recommended classification: KEEP IN REPOSITORY

Why: This is closer to implementation documentation for active media automation code. It should remain in the repository, but should be reviewed for freshness and possibly renamed away from `mvp` if it is still canonical.

### Database Schema Set

Files:

- `packages/db/schema.sql`
- `packages/db/full_schema_run_in_supabase.sql`
- `supabase/migrations/20260522_evaluation_memory.sql`
- `supabase/migrations/20260522_evaluation_memory_fix.sql`
- `apps/web/supabase/migrations/*`
- `supabase/migrations/*`

Recommended classification: KEEP IN REPOSITORY, with cleanup required

Why: Schema and migrations belong in the repo. However, there are conflicting schema definitions for `evaluations`, and the `*_fix.sql` file drops tables. The destructive fix script should be archived as a recovery runbook or removed after the canonical migration path is chosen.

### Tracked Duplicate Implementation Files

Files:

- `package-lock 2.json`
- `apps/web/app/(platform)/projects/[slug]/scripts/page 2.tsx`
- `apps/web/app/api/media/render/start/route 2.ts`
- `apps/remotion/src/compositions/ShortFormVideo 2.tsx`
- `apps/remotion/src/render 3.ts`

Recommended classification: DELETE after manual confirmation

Why: These are tracked copy-numbered implementation artifacts. Diffs show they are shorter/divergent versions of canonical siblings, not independently named modules. They increase ambiguity and can mislead future implementation work.

### Tracked Remotion Render Payloads

Files:

- `apps/remotion/render-input.json`
- `apps/remotion/728a8d91-5cee-405d-9695-70dd7d24f6eb.json`

Recommended classification: ARCHIVE or DELETE after confirming they are not fixtures

Why: These contain concrete generated script/audio/timing/image URLs and look like one-off render inputs. If they are needed as fixtures, move them under an explicit test fixture path with sanitized data. Otherwise they should not remain as source files.

### Ignored But Tracked Files

Files:

- `apps/remotion/render-input.json`
- `apps/remotion/728a8d91-5cee-405d-9695-70dd7d24f6eb.json`
- `apps/web/.env.local.example`

Recommended classification: UNKNOWN for JSON payloads, KEEP IN REPOSITORY for `.env.local.example`

Why: `git ls-files -c -i --exclude-standard` shows these tracked files are also ignored by current ignore rules. The `.env.local.example` file should stay, but `.gitignore` includes `.env*`, which will ignore future env examples unless explicitly negated. The JSON payloads are ignored and tracked, which is a strong artifact smell.

## Files That Should Remain In The Repository

- Application source under `apps/web`, except duplicate copy-numbered files after confirmation.
- Remotion source under `apps/remotion/src`, except duplicate copy-numbered files after confirmation.
- Package source under `packages/agent-skills` and `packages/db`.
- Brand assets under `brand/assets` while current runtime/brand seed code references repo-local brand rules.
- Supabase migrations, once the canonical schema path is reconciled.
- `docs/ai-media-automation-mvp.md`, if refreshed and marked as current or historical.

## Memory Stage 1 Implementation Audit

Status: PARTIAL.

Implemented pieces:

- Memory tables are defined in `supabase/migrations/20260522_evaluation_memory.sql`: `evaluations`, `content_feedback`, and `platform_memory`.
- Feedback persistence exists in `apps/web/lib/ai/memory/feedback-store.ts`.
- Memory query and seed helpers exist in `apps/web/lib/ai/memory/memory-store.ts`.
- Approval decisions call `saveFeedback` in `apps/web/app/api/approvals/[id]/route.ts`.
- A Memory page exists at `apps/web/app/(platform)/memory/page.tsx`.
- API access exists at `apps/web/app/api/memory/patterns/route.ts`.

### Finding 1: Conflicting `evaluations` schemas block reliable rollout

Severity: HIGH

Evidence:

- New migration defines `evaluations` with `project_id`, `content_type`, `hook_strength`, `slop_score`, `overall_score`, and `passed` in `supabase/migrations/20260522_evaluation_memory.sql:17`.
- Older full schema defines `evaluations` with `approval_id`, `evaluator_name`, `score`, `approved`, and `feedback` in `packages/db/full_schema_run_in_supabase.sql:156`.
- Manager evaluation still inserts the old shape in `apps/web/app/api/manager/route.ts:58`.

Why it matters: If the DB uses the new migration, manager evaluation inserts can fail because columns like `evaluator_name` and `score` do not exist. If the DB uses the old full schema, `/api/evaluate` and memory-linked evaluation code can fail because the new columns do not exist.

Recommended next step: Choose one canonical `evaluations` schema, update `packages/db/full_schema_run_in_supabase.sql`, manager route, migrations, and any seed/runbook docs to match.

### Finding 2: Memory is not injected into agent generation

Severity: HIGH

Evidence:

- `getContextSummary(projectId)` exists in `apps/web/lib/ai/memory/memory-store.ts:108`.
- The workflow executor still calls `runStep` with `systemPrompt: agent.system_prompt` in `apps/web/lib/ai/workflow-executor.ts:101`.
- Search found no call site for `getContextSummary` outside its own module.

Why it matters: Stage 1 currently records and displays memory, but generated outputs do not learn from it. The core improvement loop is incomplete.

Recommended next step: In `executeWorkflow`, fetch project memory once per run or step and append it to the system prompt with clear delimiters and confidence filtering.

### Finding 3: Seed brand rules button likely fails at runtime

Severity: MEDIUM

Evidence:

- Memory page submits a plain HTML form to `/api/memory/patterns` in `apps/web/app/(platform)/memory/page.tsx:113`.
- The API route reads `await req.json()` in `apps/web/app/api/memory/patterns/route.ts:106`.

Why it matters: Browser form POSTs submit `application/x-www-form-urlencoded` by default, not JSON. Clicking `Seed brand rules` is likely to throw JSON parse errors.

Recommended next step: Replace with a server action or client fetch using JSON, or make the route accept `formData()`.

### Finding 4: Memory deletion lacks per-item ownership verification

Severity: MEDIUM

Evidence:

- DELETE authenticates a user, reads an `id`, then calls `deleteMemoryItem(id)` in `apps/web/app/api/memory/patterns/route.ts:85`.
- `deleteMemoryItem` deletes by id using the admin client in `apps/web/lib/ai/memory/memory-store.ts:193`.

Why it matters: Any authenticated user who can discover or guess a memory id could delete it, because the admin client bypasses RLS and the DELETE route does not verify the memory belongs to one of the user's projects.

Recommended next step: Fetch the memory item joined to project ownership before deleting, or require `projectId` and verify ownership before admin deletion.

### Finding 5: Feedback capture stores rows but often produces no memory

Severity: MEDIUM

Evidence:

- Approval PATCH passes reviewer notes into `saveFeedback` in `apps/web/app/api/approvals/[id]/route.ts:82`.
- Pattern classification only inspects rejection/revision notes in `apps/web/lib/ai/memory/feedback-store.ts:78`.
- `updateMemoryFromFeedback` only writes memory if classifier patterns exist in `apps/web/lib/ai/memory/feedback-store.ts:129`.

Why it matters: Approvals or rejections without notes will create `content_feedback` rows but no `platform_memory`. This may be acceptable for Stage 1, but the product should make the dependency explicit or derive patterns from evaluator signals/content.

Recommended next step: Require structured rejection reasons in the UI, pass evaluation signals into feedback, or store neutral evidence for later batch pattern extraction.

### Finding 6: Brand memory is hard-coded to The Prompt and the page chooses only the first project

Severity: MEDIUM

Evidence:

- `seedBrandMemory` inserts The Prompt rules in `apps/web/lib/ai/memory/memory-store.ts:231`.
- Memory page picks the first project only with `.limit(1)` in `apps/web/app/(platform)/memory/page.tsx`.

Why it matters: This platform also contains Familje-Stunden artifacts. Seeding The Prompt rules into an arbitrary first project could corrupt project-specific memory.

Recommended next step: Add project selection and project-specific seed sources. Only seed The Prompt rules for The Prompt/media projects.

### Finding 7: Destructive recovery migration should not sit beside normal migrations

Severity: MEDIUM

Evidence:

- `supabase/migrations/20260522_evaluation_memory_fix.sql` drops `platform_memory`, `content_feedback`, and `evaluations` before recreating them.

Why it matters: A file named like a migration but containing `DROP TABLE` recovery behavior is risky. It can be run in the wrong context and destroy user feedback/memory.

Recommended next step: Move it to an archive/runbook location with an explicit destructive name, after the canonical schema is reconciled.

## Verification Notes

Commands run:

```bash
git status --short --untracked-files=all
rg --files
find . -type f \( -name '* 2.*' -o -name '* 3.*' -o -name '*copy*' -o -name '*tmp*' -o -name '*temp*' -o -name '*.bak' -o -name '*.old' -o -name '.DS_Store' \)
git ls-files -c -i --exclude-standard
rg -n "getContextSummary|getHighConfidence|getMemory\(|saveFeedback\(|seedBrandMemory|content_feedback|platform_memory|evaluations|evaluation" apps/web packages supabase -S
```

Not run:

- Typecheck/build/test, because no `node_modules` are installed in this repo and installing dependencies would mutate the repository beyond the requested audit.

## Recommended Cleanup Order

1. Reconcile the Memory/evaluation schema before implementing more Memory behavior.
2. Wire `getContextSummary` into workflow execution after the schema is stable.
3. Fix the seed action and memory deletion authorization.
4. Decide whether the tracked duplicate implementation files are safe to delete.
5. Move stale planning/product docs into Evolution Roadmap or archive them as historical references.
6. Sanitize or remove tracked Remotion render payload JSON files if they are not intentional fixtures.
7. Tighten `.gitignore` so `.env.local.example` remains intentionally trackable.
