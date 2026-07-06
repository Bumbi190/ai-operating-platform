# Memory Stage 1 Foundation Plan

Repository: `/Users/andrehultgren/Developer/AI Operating Platform`  
Date: 2026-07-06  
Status: planning only  
Source inputs: `REPOSITORY_HEALTH_AUDIT.md` and approved Memory & Organizational Knowledge 2.0 Version 1.0 architecture.

## Verified Git State

- Repository path: `/Users/andrehultgren/Developer/AI Operating Platform`
- Current branch: `feat/memory-2.0-stage-1`
- Upstream status: no upstream branch is shown for `feat/memory-2.0-stage-1` in `git status --short --branch`.
- Working tree status at setup remediation start: two untracked root documents, `MEMORY_STAGE_1_FOUNDATION_PLAN.md` and `REPOSITORY_HEALTH_AUDIT.md`.
- Confirmation: Stage 1 setup work is on `feat/memory-2.0-stage-1`.

## Verified Architecture Sources

Canonical architecture path:

`/Volumes/2T_SSD_AI/Omnira/📁 Evolution Roadmap'/Evolution Roadmap/architecture/memory-organizational-knowledge/`

Confirmed source presence:

- `README.md`
- `chapters/`
- `book/`
- `appendices/`
- `diagrams/`
- `governance/`
- `review/`
- `implementation/`

Specific architecture documents verified:

- `README.md`
- `implementation/README.md`
- `implementation/STAGE_1_IMPLEMENTATION_PLAN.md`
- `governance/APPROVAL_CHECKLIST.md`
- `governance/VERSION_HISTORY.md`
- `governance/CHANGELOG_V1.0.md`
- `review/ARCHITECTURE_REVIEW_RESOLUTION.md`
- `review/archive/ARCHITECTURE_GAP_ANALYSIS.md`
- `review/archive/ARCHITECTURE_REVIEW.md`
- `review/archive/CHANGELOG_RECOMMENDATIONS.md`
- `review/archive/CHAPTER_SCORECARD.md`
- `review/archive/CONSISTENCY_REVIEW.md`
- `review/archive/DIAGRAM_RECOMMENDATIONS.md`
- `review/archive/IMPLEMENTATION_READINESS.md`
- `review/archive/TERMINOLOGY_REVIEW.md`
- `appendices/APPENDIX_A_TERMINOLOGY.md`
- `appendices/APPENDIX_B_METADATA.md`
- `appendices/APPENDIX_C_CANONICAL_OBJECT_MODEL.md`
- `appendices/APPENDIX_D_LIFECYCLE_STATE_MACHINE.md`
- `appendices/APPENDIX_E_COMPONENT_RESPONSIBILITY_MATRIX.md`
- `appendices/APPENDIX_F_INTEGRATION_CONTRACTS.md`
- `appendices/APPENDIX_G_GOVERNANCE_OPERATING_MODEL.md`
- `appendices/APPENDIX_H_ACCESS_POLICY_MODEL.md`
- `appendices/APPENDIX_I_DIAGRAM_INDEX.md`
- `diagrams/component_responsibility.mmd`
- `diagrams/cross_venture_sharing_flow.mmd`
- `diagrams/governance_access_model.mmd`
- `diagrams/knowledge_lifecycle_state_machine.mmd`
- `diagrams/library_responsibility_map.mmd`
- `diagrams/memory_retrieval_executive_context_sequence.mmd`
- `diagrams/system_context.mmd`
- `diagrams/traceability_lineage.mmd`
- `book/Memory_Organizational_Knowledge_2.0_Volume_I.md`
- `book/Memory_Organizational_Knowledge_2.0_Volume_I.docx`
- `book/Memory_Organizational_Knowledge_2.0_Volume_I.pdf`
- `chapters/Kapitel 1 - Filosofin bakom organisatorisk intelligens.docx`
- `chapters/Kapitel 2 – Kunskapens natur.docx`
- `chapters/Kapitel 3 – Från observation till visdom.docx`
- `chapters/Kapitel 4 – Organisatoriskt lärande.docx`
- `chapters/Kapitel 5 – Memory Architecture.docx`
- `chapters/Kapitel 6 – Memory Objects.docx`
- `chapters/Kapitel 7 – Working Memory.docx`
- `chapters/Kapitel 8 – Episodic Memory.docx`
- `chapters/Kapitel 9 – Semantic Memory.docx`
- `chapters/Kapitel 10 – Organizational Memory.docx`
- `chapters/Kapitel 11 – Knowledge Objects.docx`
- `chapters/Kapitel 12 – Knowledge Lifecycle.docx`
- `chapters/Kapitel 13 – Experience Engine.docx`
- `chapters/Kapitel 14 – Decision Evolution.docx`
- `chapters/Kapitel 15 – Wisdom Layer.docx`
- `chapters/Kapitel 16 – Blueprint Library.docx`
- `chapters/Kapitel 17 – Decision Library.docx`
- `chapters/Kapitel 18 – Experience Library.docx`
- `chapters/Kapitel 19 – Workflow Library.docx`
- `chapters/Kapitel 20 – Analytics Library.docx`
- `chapters/Kapitel 21 – Agent Library.docx`
- `chapters/Kapitel 22 – Project Library.docx`
- `chapters/Kapitel 23 – Customer Library.docx`
- `chapters/Kapitel 24 – Knowledge Validation.docx`
- `chapters/Kapitel 25 – Knowledge Confidence.docx`
- `chapters/Kapitel 26 – Knowledge Compression.docx`
- `chapters/Kapitel 27 – Memory Governance.docx`
- `chapters/Kapitel 28 – Long-term Knowledge Evolution.docx`
- `chapters/Kapitel 29 – Knowledge Retrieval Integration.docx`
- `chapters/Kapitel 30 – Executive Context Integration.docx`
- `chapters/Kapitel 31 – Cross-Venture Knowledge Sharing.docx`
- `chapters/Kapitel 32 – Knowledge Security & Access Governance.docx`
- `chapters/Kapitel 33 – Scalability & Future Evolution.docx`
- `chapters/Kapitel 34 – Memory Architecture Summary.docx`
- `chapters/Kapitel 35 – Final Architecture Principles.docx`

## Stage 1 Approval Status

Candidate implementation plan — pending approval.

Stage 1 is not approved for implementation until André explicitly approves it.

## Deletion / Correction Policy Decision

Stage 1 must not implement silent hard delete for Memory.

Memory deletion/correction must use ownership verification and preserve auditability.

Preferred Stage 1 model:

- lifecycle transition
- correction state
- tombstone or audit event
- owner verification before mutation

Physical purge/hard delete is out of scope for Stage 1 unless explicitly required later by a separate governance/policy decision.

## 1. Stage 1 Objective

Establish a small, coherent, testable foundation for Memory & Organizational Knowledge without changing agent generation, retrieval, ranking, or autonomous behavior.

Stage 1 should make the current memory/evaluation foundation safe to merge by:

- Choosing one canonical Stage 1 schema shape.
- Removing or isolating schema conflicts that can break runtime inserts.
- Making memory write/correction lifecycle APIs ownership-safe.
- Making manual brand/project memory seeding callable without changing generation.
- Keeping the system observable through existing Memory UI/API surfaces.

The goal is not to make agents smarter yet. The goal is to make memory storage and administration reliable enough that Stage 2 can safely add retrieval and prompt injection.

## 2. Strict Scope

Stage 1 includes only foundation work:

- Canonicalize the database contract for `evaluations`, `content_feedback`, and `platform_memory`.
- Update schema documents/migrations so future setup paths agree.
- Fix current code paths that write to the chosen canonical schema.
- Fix `/api/memory/patterns` request handling and authorization boundaries.
- Ensure memory deletion/correction verifies ownership before any lifecycle mutation.
- Ensure seed actions are project-scoped and explicit.
- Preserve existing Memory page read-only visibility, with only minimal changes needed to keep seed and lifecycle/correction paths correct.
- Add focused tests or test scripts for schema mapping, authorization, and request parsing.

## 3. Explicit Out Of Scope

Do not include in Stage 1:

- Injecting memory into `runStep`, workflow prompts, agent prompts, manager prompts, or chat prompts.
- Adding vector search, embeddings, semantic retrieval, ranking, recency decay, or relevance scoring.
- Adding organization-wide inheritance, team memory sync, cross-project memory propagation, or multi-tenant organization roles.
- Adding autonomous memory creation outside the existing approval feedback flow.
- Building a new Memory UI.
- Refactoring duplicate docs/files found in the repository health audit.
- Deleting duplicate implementation files or archived run artifacts.
- Generating new content, running LLM calls, or modifying generation behavior.
- Installing dependencies.
- Committing, staging, or deployment work.

## 4. Current Code Conflicts Found In Audit

### Conflicting `evaluations` schemas

There are two incompatible `evaluations` table contracts:

- New memory/evaluation migration shape:
  - `supabase/migrations/20260522_evaluation_memory.sql`
  - Uses `project_id`, `content_type`, `hook_strength`, `slop_score`, `brand_alignment`, `specificity`, `pacing_quality`, `overall_score`, `passed`, signals, and content preview fields.
- Older manager/full-schema shape:
  - `packages/db/full_schema_run_in_supabase.sql`
  - Uses `approval_id`, `evaluator_name`, `score`, `approved`, `feedback`, and `raw_response`.
- Runtime old-shape writer:
  - `apps/web/app/api/manager/route.ts`
  - Inserts `approval_id`, `evaluator_name`, `score`, `approved`, `issues`, and `feedback`.

### Destructive recovery migration in normal migration path

`supabase/migrations/20260522_evaluation_memory_fix.sql` drops `platform_memory`, `content_feedback`, and `evaluations`. It is useful as a recovery runbook but dangerous as a normal migration artifact.

### Memory seed route request mismatch

`apps/web/app/(platform)/memory/page.tsx` submits a normal HTML form, while `apps/web/app/api/memory/patterns/route.ts` expects JSON via `await req.json()`.

### Memory deletion ownership gap

`DELETE /api/memory/patterns?id=...` authenticates the user but currently performs an unqualified admin-client physical deletion by id only. It does not verify that the memory item belongs to a project owned by the user, and Stage 1 must replace this with an ownership-verified auditable lifecycle/correction mutation.

### Project selection and hard-coded brand rules

The Memory page picks the first project only. `seedBrandMemory` hard-codes The Prompt rules and can seed them into the wrong project.

### Feedback can store rows without producing memory

`saveFeedback` persists `content_feedback`, but `platform_memory` updates only happen when free-text notes match the classifier. This is acceptable for Stage 1 only if documented as an explicit limitation.

### Existing `memories` table versus new `platform_memory`

The original MVP schema includes a `memories` table. The new Memory Stage 1 code uses `platform_memory`. Stage 1 must state that `platform_memory` is the canonical operational memory table for the 2.0 architecture while `memories` remains legacy/unmigrated until a later cleanup.

## 5. Required Decisions Before Implementation

These decisions must be made before writing code or migrations:

1. Canonical `evaluations` schema:
   - Recommended: use the newer detailed evaluation schema from `20260522_evaluation_memory.sql` as canonical for Stage 1.
   - Reason: it supports quality scoring, content previews, and future memory derivation better than the old manager-only table.

2. Manager evaluation behavior:
   - Recommended: update manager evaluation persistence to the canonical schema or defer manager evaluation persistence if it cannot map cleanly.
   - Do not preserve the old `evaluator_name/score/approved/feedback` table shape as the primary contract.

3. Migration strategy:
   - Recommended: create one new non-destructive reconciliation migration during implementation.
   - Do not edit already-applied migrations unless this repo is confirmed not to have any applied migration history.

4. Scope level:
   - Recommended for Stage 1: project-scoped memory only.
   - Organization-level inheritance belongs to Stage 2+.

5. Seed source:
   - Recommended: only allow The Prompt seed rules for explicitly matched The Prompt/media projects, or rename the action to make the project-specific seed source explicit.
   - Do not seed arbitrary first projects.

6. Delete semantics:
   - Required: Stage 1 must not implement silent hard delete for Memory.
   - Required: deletion/correction must verify ownership before mutation and preserve auditability through a lifecycle transition, correction state, tombstone, or audit event.
   - Physical purge/hard delete is out of scope unless a later separate governance/policy decision explicitly requires it.

7. Legacy `memories` table:
   - Recommended: leave untouched in Stage 1.
   - Do not migrate, delete, or merge it until retrieval/generation design is active.

## 6. Proposed Implementation Sequence

### Step 1: Lock the canonical Stage 1 contract

- Document the chosen schema contract in comments and schema files.
- Confirm `platform_memory` is the Stage 1 memory table.
- Confirm `content_feedback` is the Stage 1 evidence table.
- Confirm the detailed `evaluations` schema is canonical.

Exit criteria:

- One clearly documented table contract exists for implementation.
- No code has been changed yet except docs/schema comments if chosen.

### Step 2: Reconcile database setup paths

- Update `packages/db/full_schema_run_in_supabase.sql` to match the canonical Stage 1 schema.
- Decide whether `packages/db/schema.sql` remains MVP legacy or should include Stage 1 tables.
- Move or rename the destructive `20260522_evaluation_memory_fix.sql` out of the normal migration path, or mark it clearly as a manual recovery script.
- During implementation, create one additive/non-destructive reconciliation migration if needed.

Exit criteria:

- Fresh setup and migration setup no longer produce incompatible `evaluations` tables.

### Step 3: Fix old-shape evaluation writers

- Update `apps/web/app/api/manager/route.ts` so it no longer inserts old evaluation columns.
- Either map manager evaluation output to canonical columns or skip DB persistence with an explicit TODO for Stage 2.
- Keep `/api/evaluate` aligned with the canonical schema.

Exit criteria:

- All current evaluation insert paths target the same table shape.

### Step 4: Make memory seed action request-safe

- Fix `/api/memory/patterns` POST to accept the request format sent by the UI, or change the UI to send JSON.
- Prefer one clear contract:
  - JSON API for programmatic use, with a small client component/server action for UI.
  - Or form-data handling for the existing server component form.
- Validate `action` and `projectId` before doing any admin-client write.

Exit criteria:

- Clicking seed does not fail because of content type mismatch.
- Invalid action/project input returns 400/404 without writes.

### Step 5: Add ownership verification before memory lifecycle/correction mutation

- Before mutation, fetch the memory row and verify its `project_id` belongs to the authenticated user.
- Only then apply an auditable lifecycle transition, correction state, tombstone, or audit event.
- Return:
  - 401 for unauthenticated.
  - 400 for missing id.
  - 404 for missing item or item not owned by the user.
  - 200 for successful auditable lifecycle/correction mutation.

Exit criteria:

- A user cannot mark another user's memory item as inactive, corrected, or tombstoned even if they know the id.

### Step 6: Make seed source project-safe

- Stop seeding The Prompt rules into the first arbitrary project.
- Add one of:
  - Explicit project selector in Memory page.
  - Route/page scoped by project.
  - Guard that only permits the The Prompt seed for a known The Prompt/media project.
- Keep seed rules deterministic and transparent.

Exit criteria:

- Seed action cannot silently contaminate another project's memory.

### Step 7: Add focused tests

- Add tests for:
  - Evaluation schema mapping.
  - `saveFeedback` pattern extraction and memory upsert behavior.
  - POST seed request parsing.
  - DELETE ownership checks.
- If no test runner is available, add a minimal implementation-ready test plan and verify manually once dependencies are installed.

Exit criteria:

- Stage 1 behavior is testable without LLM calls.

## 7. Files Expected To Change

Expected implementation files:

- `packages/db/full_schema_run_in_supabase.sql`
- `packages/db/schema.sql` if chosen as current setup path
- `supabase/migrations/<new_stage_1_reconciliation_migration>.sql`
- `supabase/migrations/20260522_evaluation_memory_fix.sql` or a new archive/runbook location for it
- `apps/web/app/api/manager/route.ts`
- `apps/web/app/api/evaluate/route.ts` only if schema mapping needs adjustment
- `apps/web/app/api/memory/patterns/route.ts`
- `apps/web/lib/ai/memory/memory-store.ts`
- `apps/web/lib/ai/memory/feedback-store.ts` only if tests expose Stage 1 issues
- `apps/web/app/(platform)/memory/page.tsx`

Expected test files, exact paths to be chosen based on project conventions:

- `apps/web/lib/ai/memory/*.test.ts`
- `apps/web/app/api/memory/patterns/*.test.ts`
- Or equivalent route/helper tests under the existing test setup.

Files not expected to change in Stage 1:

- `apps/web/lib/ai/workflow-executor.ts`
- `apps/web/lib/ai/runner.ts`
- Agent skill prompts under `packages/agent-skills`
- Chat routes and workflow execution routes except evaluation write compatibility if absolutely necessary

## 8. Database / Migration Approach

Stage 1 should use a conservative database approach:

- Do not generate migrations until the decisions above are approved.
- Prefer one new reconciliation migration rather than editing existing applied migrations.
- Do not use `DROP TABLE` in Stage 1 migration.
- Do not backfill or transform production data unless the current database state is confirmed.
- Make migration idempotent where possible.
- Add missing indexes or constraints only when directly required by Stage 1.
- Keep RLS enabled.
- Ensure ownership policies match project ownership.

Recommended canonical Stage 1 tables:

- `evaluations`
  - Detailed content-evaluation table.
  - Project-scoped.
  - Stores scores and evaluator signals useful for future memory derivation.
- `content_feedback`
  - Human review evidence table.
  - Project-scoped.
  - Stores decision, notes, detected quality patterns, and content excerpt.
- `platform_memory`
  - Project-scoped operational memory table.
  - Keyed by `project_id`, `category`, and `key`.
  - Stores `value`, `confidence`, `evidence_count`, and timestamps.

Legacy table:

- `memories`
  - Leave untouched.
  - Do not route new Stage 1 behavior through it.
  - Revisit in Stage 2+ when retrieval design is active.

## 9. How To Handle The Conflicting Evaluations Schemas

Recommended path:

1. Choose the detailed `evaluations` schema from `20260522_evaluation_memory.sql` as canonical.
2. Update `packages/db/full_schema_run_in_supabase.sql` so fresh installs create that schema.
3. Update `apps/web/app/api/manager/route.ts` so it no longer writes old columns.
4. If manager evaluation must persist in Stage 1, map it conservatively:
   - `project_id`: resolve from approval/run/project.
   - `content_type`: use `text` unless a better type is known.
   - `overall_score`: map old 0-100 score to 0-10.
   - `passed`: map old approved boolean.
   - `issues`: preserve issue details.
   - `suggestion`: store old feedback if it is a short recommendation.
5. If manager evaluation cannot resolve project/content cleanly, do not persist it in Stage 1. Return the evaluation response and defer persistence cleanup to Stage 2.
6. Do not create a second table for old manager evaluations in Stage 1 unless there is confirmed production data that must be preserved separately.

Non-goal:

- Stage 1 should not redesign the whole evaluation system. It only needs one table shape that all current writers can safely target.

## 10. How To Handle Ownership Verification For Memory Deletion / Correction

Required behavior:

- Authenticate with the normal Supabase server client.
- Read the requested memory item before mutation.
- Verify `platform_memory.project_id` belongs to a project where `projects.owner_id = user.id`.
- Only after verification, perform the approved auditable lifecycle/correction/tombstone mutation.
- Do not implement silent physical hard delete in Stage 1.

Implementation-ready flow:

1. Parse `id`.
2. If missing, return 400.
3. Query with the user-scoped client or explicit owner filter:
   - `platform_memory.id = id`
   - `projects.owner_id = user.id`
4. If no row, return 404.
5. Record the approved lifecycle transition, correction state, tombstone, or audit event.
6. Return an explicit mutation result.

Security rule:

- Never trust a bare memory id with an admin client.
- Never silently hard delete Memory in Stage 1.

Stage 2+ improvement:

- Expand correction and retention workflows after Stage 1 governance has real usage data.

## 11. How To Avoid Touching Generation / Retrieval Too Early

Stage 1 must not change outputs generated by agents.

Rules:

- Do not import or call `getContextSummary` from `workflow-executor`, `runner`, chat, manager, or agent routes.
- Do not append memory text to system prompts.
- Do not add retrieval parameters to run APIs.
- Do not rank or filter memories for prompt use.
- Do not add embeddings.
- Do not modify agent skill prompts.
- Do not change workflow execution behavior.

Allowed:

- Keep `getContextSummary` in `memory-store.ts` if already present, but do not wire it into generation.
- Add tests around it only if they do not alter runtime behavior.
- Display memory in the Memory page.

Rationale:

Generation changes make Stage 1 hard to verify because output differences can come from model behavior, prompt changes, or memory quality. Foundation correctness should be proven before retrieval affects production behavior.

## 12. Test Plan

No LLM calls are required for Stage 1 tests.

### Static checks

- `git status --short --untracked-files=all`
- Typecheck once dependencies are installed:
  - `npm run typecheck --workspace=apps/web`
- Lint if configured:
  - `npm run lint --workspace=apps/web`

### Unit/helper tests

Test `feedback-store`:

- Rejected feedback with notes containing "generic" creates a `rejection_triggers` memory update.
- Revised feedback with notes containing "jargon" creates an `avoided_phrases` memory update.
- Approved feedback without classifier patterns stores feedback but does not create memory.
- Repeated feedback increments `evidence_count` and confidence, capped at `0.99`.

Test evaluation mapping:

- Manager old score `85` maps to `overall_score = 8.5`.
- Manager approved maps to `passed = true`.
- Missing project/content resolution does not write malformed rows.

### Route tests

Test `POST /api/memory/patterns`:

- Unauthenticated request returns 401.
- Missing project returns 400.
- Project not owned by user returns 404.
- Valid seed request writes only to the requested project.
- Wrong content type is handled according to the chosen contract.

Test `DELETE /api/memory/patterns`:

- Unauthenticated request returns 401.
- Missing id returns 400.
- Nonexistent id returns 404.
- Other user's memory id returns 404 and does not mutate lifecycle/correction state.
- Own memory id returns 200, marks the memory as deleted/inactive/tombstoned through an auditable lifecycle/correction event, and preserves audit trail.

### Manual verification

Once dependencies/environment are available:

1. Start app locally.
2. Log in.
3. Open Memory page.
4. Select/confirm the target project.
5. Trigger seed.
6. Confirm memory rows appear for the selected project only.
7. Mark one memory row as deleted/inactive/tombstoned through the approved lifecycle/correction action.
8. Confirm it is no longer shown in the active Memory UI, no other project memory is affected, and the underlying audit trail is preserved.

## 13. Rollback Plan

Code rollback:

- Revert the Stage 1 commit/PR if route or UI behavior regresses.
- Because Stage 1 must not touch generation, rollback should not affect workflow output quality.

Database rollback:

- Prefer additive migrations so rollback is not destructive.
- If a reconciliation migration adds nullable columns or indexes, rollback can leave them in place safely.
- If a migration changes constraints, prepare a paired rollback script but do not run it automatically.
- Do not drop `content_feedback` or `platform_memory` as part of rollback.
- If manager evaluation persistence is disabled temporarily, rollback by restoring previous route behavior only after confirming the target DB still has old columns.

Data safety:

- Do not delete existing memory or feedback data during Stage 1.
- Do not run the destructive `20260522_evaluation_memory_fix.sql` in rollback.

## 14. Acceptance Criteria

Stage 1 is complete when:

- There is one documented canonical schema for `evaluations`, `content_feedback`, and `platform_memory`.
- Fresh setup schema and migration path no longer disagree on `evaluations`.
- No runtime route writes the old `evaluations` shape into the canonical table.
- `/api/memory/patterns` POST handles the request format used by the Memory UI.
- Memory seed writes are project-scoped and cannot silently seed the wrong project.
- Memory deletion/correction verifies ownership before any lifecycle transition, correction state, tombstone, or audit event.
- Existing Memory page can display memory and recent feedback without generation changes.
- Tests or documented manual checks cover seed, auditable deletion/correction lifecycle behavior, feedback-derived memory, and evaluation mapping.
- `apps/web/lib/ai/workflow-executor.ts` and generation/retrieval paths remain untouched.
- No dependencies are installed as part of the Stage 1 implementation PR.
- No unrelated repository cleanup is included.

## 15. Deferred To Stage 2+

Defer these until after Stage 1 is merged and verified:

- Prompt injection of memory into workflow execution.
- Retrieval APIs for agent generation.
- `getContextSummary` integration.
- Memory ranking, recency, confidence decay, and evidence weighting.
- Embeddings and vector search.
- Organization-wide knowledge inheritance.
- Cross-project memory sharing.
- Memory provenance graph and decision references.
- Physical purge/hard delete policy, if later required by governance.
- Dedicated Memory admin UI redesign.
- Structured feedback UX with required rejection taxonomies.
- Batch memory extraction from existing approvals/evaluations.
- Migration or retirement of the legacy `memories` table.
- Cleanup of stale repository docs and duplicate implementation files from the health audit.
