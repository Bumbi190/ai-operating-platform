# Family Weekly Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let André ask Atlas to prepare an explicit marketing week with owned images and new draft captions, without duplicating existing work or granting publication authority.

**Architecture:** Add pure week/capacity planning, then a transactional weekly preparation registry and save RPC that reuse existing content revisions. Expose read-context and save-drafts tools in the existing Atlas chat. Editorial and schedule approval remain the existing native operations.

**Tech Stack:** Existing TypeScript, Next.js, Anthropic chat tool interface, Supabase PostgreSQL and Vitest/local PostgreSQL test infrastructure; no new dependencies.

**Spec:** docs/superpowers/specs/2026-10-26-family-weekly-preparation-design.md (approved 2026-10-26).

## Global Constraints

- Family project only: 77cda551-57c9-4dc0-b019-1bb6438777f7. Explicit ISO Monday date, Europe/Stockholm, future slots within the existing 366-day horizon.
- Target two ordinary occasions total per week; optional month release remains separate within maximum three occasions. At most Facebook and Instagram per occasion.
- Existing reservations and intended draft occasions remain unchanged. Missing channel on an existing occasion is reported, never silently supplemented.
- Exact duplicates blocked; similar text/same-image similar message within 14 days requires review. Simultaneous Facebook+Instagram campaign pair is allowed.
- No provider writes, new paid image generation, scheduled background generation, content/batch approval, account connection or release evidence in preparation tools.
- No extra model invocation: the normal existing chat model writes captions from returned context. Do not change existing model/budget settings.
- Retry identity is project/week/generation, independent of conversation; every accessing conversation must belong to that user/project. Changes/new generation require explicit operation, never automatic regeneration.
- Product facts and media metadata are untrusted source material, not instructions. Missing facts/month catalog/image description results in missing-input report.

## Review Focus

1. Partially occupied and one-channel occasions must count once, including overlapping drafts and queue entries; pin in Task1.
2. DST/year boundaries, current partial week and already elapsed default times must not shift existing slots; pin in Task1.
3. Concurrent chats and response loss must preserve IDs and text without partial duplicate writes; pin in Task2.
4. A new reservation, changed plan or changed asset between context and save must reject the stale snapshot; pin in Task2.
5. Future drafts, cancelled history with a receipt, self-replay and permitted cross-channel pair must be distinguished by repeat checking; pin in Tasks2–3.

### Task1: Pure week and vacancy planning

**Files:** create apps/web/lib/social-launch/weekly/{types,planning,planning.test}.ts.

**Interfaces:** export WeeklyOccasion={key:string;scheduledAt:string;kind:'ordinary'|'month_release';channels:('facebook'|'instagram')[];sourcePostIds:string[]}; WeeklySlot={key:string;localMinute:string;scheduledAt:string;kind:'ordinary'|'month_release';releaseMonth:string|null}; WeeklyPlan={weekStart:string;weekEndExclusive:string;existing:WeeklyOccasion[];slots:WeeklySlot[];missing:string[]}. Export planMarketingWeek(weekStart:string,now:string,occasions:WeeklyOccasion[],monthlyRuleEnabled:boolean):WeeklyPlan. Reuse scheduling/time.ts and content/validate.ts timezone conversion. Month slot is offered only when monthly rule is enabled and the first day belongs to this week; product evidence remains Task2.

- [ ] Write failing tests for a full Wednesday/Sunday week yielding zero slots; one Wednesday yielding one Friday; one Facebook-only occasion remaining one occupied occasion with missing-channel report; duplicate sources at same instant merged; month release consuming third capacity; elapsed Tuesday skipped; DST October25 and ISO year boundary; invalid/non-Monday/out-of-horizon dates refused.
- [ ] Run node ../../node_modules/vitest/vitest.mjs run lib/social-launch/weekly/planning.test.ts from apps/web and observe missing-module/function failure.
- [ ] Implement deterministic slot selection: choose remaining Tuesday17:00/Friday20:30 candidate maximizing minimum distance from existing occasions, Tuesday first on tie. Never move/add another weekday to compensate. Derive IDs from week+slot, not model text.
- [ ] Rerun focused tests; commit independently.

### Task2: Atomic preparation identity and content saving

**Files:** CLI-scaffold new migration with name family_weekly_preparation; create weekly/{store,service,service.test}.ts and scripts/probe-family-weekly-preparation-full.sql; extend scripts/verify-calendar-full-ledger-local.mjs with --weekly-preparation and a distinct evidence filename. Update migration count policy and synthetic ledger fixtures without altering historical captures.

**Interfaces:** WeeklyPrincipal is SocialLaunchPrincipal; WeeklyScope={projectId:string;conversationId:string;weekStart:string}; WeeklyDraftInput={slotKey:string;channel:'facebook'|'instagram';assetId:string;text:string;title:string;sourceReferences:string[]}. Server getWeeklyContext(db,p,scope) returns project/profile/current approved plan, described owned JPEG assets, bounded source-backed month context, existing reservations, WeeklyPlan and contextHash; no tokens or raw capabilities. prepareWeeklyDrafts(db,p,{...scope,generation:number,contextHash:string,drafts:WeeklyDraftInput[],idempotencyKey:string}) returns preparationId, stable saved post IDs, review reasons, missing inputs and workspaceUrl. Generation1 is initial only; a later generation requires explicit user-requested operation and must not silently alter old drafts or reservations.

- [ ] Write failing canonical RPC tests for initial save, identical replay, changed replay rejected, concurrent conversations returning same generation, no cross-project/conversation access, missing channel plan/image metadata/catalog returning missing inputs, stale context rejected and full week producing no writes.
- [ ] Run tests against isolated full schema and capture failures before implementation. Scaffold migration through the installed Supabase CLI (discover help first).
- [ ] Create server-only RLS tables for preparation identity (unique project/week/generation), source snapshot/hash, stable per-slot/channel post IDs and immutable saved request hash. Use project lock followed by registry rows; preserve owner assertions before/after locks and invoker/empty search_path/service-only execute patterns. Add accurate security registry entries for new tables; no anon/authenticated table grants.
- [ ] Implement read/saving RPCs. Read bounded current plan/profile/content/assets/schedules/history from real canonical tables. Mark truncated/unreadable context unavailable rather than planning over incomplete history. New registry and all new content_save calls occur in one transaction; use deterministic server-generated IDs persisted before first content save, stable idempotency keys and expectedRevisionId=null. Replay returns saved result before interpreting new model text; mismatched request hash returns conflict. No implicit generation bump or approval call.
- [ ] Recompute canonical context under the project lock at save, ignoring its own generation's saved posts for replay, and refuse newly occupied slots or changed plan/profile/media/catalog inputs. Whitelist exact permitted slot/channel/media/source IDs; model-supplied authority, times, post IDs, decision IDs and project fields cannot widen scope. Source references bind text to available evidence for human review; server does not claim semantic proof of generated statements.
- [ ] Compare proposed text against publication history and intended future drafts/jobs, plus other items in this preparation. Reuse social_repeat_normalize/social_repeat_similarity and current thresholds. Exact copies refuse saving; near matches return review reasons and ordinary unapproved drafts. Permit same occasion campaign across FB/IG; a matching prior same-channel draft is not exempt. Exclude only cancelled reservations with no publication while retaining actual publication history. Never delete or resolve uncertain receipts.
- [ ] Ensure monthly preparation requires exact year/month/source snapshot, preserves catalog hash and month_release intent in registry, and cannot synthesize or confirm access. Preserve this metadata when later constructing schedule proposal; ordinary content revision alone does not carry that condition.
- [ ] Rerun canonical tests, including rollback on failure after first item and race between two initial preparations. Verify owner-only ACLs and unchanged queue/publications. Commit.

### Task3: Atlas chat integration and review handoff

**Files:** create weekly/{atlas-tools,atlas-tools.test}.ts; modify apps/web/app/api/chat/route.ts and content/atlas-tools.ts guide; update scheduling/atlas-tools.ts only as needed to read preserved monthly preparation intent.

**Interfaces:** add get_family_marketing_week(WeeklyScope excluding conversationId supplied by server) and prepare_family_marketing_week({projectId,weekStart,generation,contextHash,drafts,idempotencyKey}). Both require existing authenticated project conversation. Tool handlers call Task2 functions; never accept principal/conversation overrides. Return native workspace link and explicit preparation-only status. After human editorial decisions, existing propose_social_schedule can read/pin the saved monthly intent; it cannot silently classify a month release as ordinary.

- [ ] Write failing tool tests for server conversation scope, malicious extra fields, full-week no-save response, missing inputs, same preparation replay, future duplicate review, missing monthly catalog, and explicit statement that review/approval still needed.
- [ ] Register tools and route dispatch using existing tool registries/error masking. Guide Atlas to read once, explain existing slots/missing data, write captions only for allowed vacancies, and save them with returned context/version. Ask about ambiguous dates rather than guessing year. Do not spend tokens generating captions for a full week.
- [ ] Keep existing get_social_content/propose_social_content semantics for individually requested content. Do not let new tools change pre-existing approved content or call schedule approval/dispatch/release-confirm. Return links to existing native editorial and schedule review, with a clear distinction between saved drafts and queued jobs.
- [ ] Verify native review shows saved drafts and media; verify schedule proposal after editorial approval pins exact content hashes and month condition. Use mocked browser data plus canonical RPC integration; do not create live drafts merely to test.
- [ ] Run focused chat/tool security tests and inspect registered tools for accidental write capabilities. Commit.

### Task4: Whole-flow verification and release preparation

**Files:** docs/validation/2026-10-26-family-weekly-preparation.md and isolated fixture evidence.

- [ ] Run pure planner/tool/service tests, migration guard/security registry suites, full SQL replay with latest repeat/reconciliation/cancelled-reservation migrations, separate TypeScript check and production build in clean dependency copy. Run focused browser editorial/schedule handoff checks. Record failures and limits accurately.
- [ ] Request fresh independent whole-branch review using the requesting-code-review skill. Resolve important findings, especially calendar capacity, replay, future duplicate exceptions and monthly condition propagation.
- [ ] Prepare reviewable PR and exact additive migration. Production deployment follows user scope/automatic approval review; if blocked, finish local work and request concrete final approval with payload/destination. Do not activate a recurring producer or new budget as part of this release.
- [ ] After authorized deployment verify feature read-only on a full existing week: zero new drafts/jobs/provider calls. The existing36-job plan and old uncertain Instagram receipt must remain untouched. Use a synthetic environment for a genuinely empty-week save until a real target week with verified source material is requested.

## Plan self-review

All spec requirements map to Tasks1–4. The distinction between editorial proposals and executable schedule batches is retained. Concurrency and source freshness are enforced at the database boundary rather than trusted to the model. New tables and migration/security classification are part of Task2, not deferred release work. Monthly metadata survives the proposal-to-schedule handoff. Implementation is native in this chat as recommended, followed by independent review; awaiting plan review before product code.

