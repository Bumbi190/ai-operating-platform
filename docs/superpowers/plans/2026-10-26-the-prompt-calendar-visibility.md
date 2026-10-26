# The Prompt Calendar Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show The Prompt's current approved publishing queue directly in Omnira's calendar, including pending YouTube after Meta publication, without changing daily production or publication.

**Architecture:** Add a bounded server-side reader and a pure per-channel projection for the existing media_scripts queue. Return a separate current-queue model alongside dated calendar entries and render a compact section with project filtering and native source links. No database migration or scheduled work.

**Tech Stack:** Existing TypeScript, Next.js, React, Supabase client, Vitest and Playwright; no new dependencies.

**Spec:** docs/superpowers/specs/2026-10-26-the-prompt-calendar-visibility-design.md (approved 2026-10-26).

## Global Constraints

- The Prompt keeps its daily current-news generation, approvals and publishers. No Thursday batch gate.
- Only the owned project with slug ai-media-automation is eligible. Server ownership and actor.allowedProjectIds both apply.
- No provider requests, AI calls, render calls, writes, new jobs, approvals, credentials, budgets, cron changes or notifications.
- No invented publication time: generated_at, reviewed_at, published_at and cron windows are not scheduled_at.
- Keep published scripts with pending destinations, especially YouTube; per-channel saved provider IDs are receipts, not live verification.
- Meta's automatic freshness window is four days, YouTube's is48hours; display expiry independently without changing their policies.
- Failures and truncation must be visible independently of other calendar sources. Preserve account-change/request-race protections.
- Familjestunden's week2–8November already has FB+IG November4/8 at20:30Stockholm. No new drafts/jobs or schedule revocations; review Thursday29October. Recurring preparation remains later work after evaluation.

## Review Focus

1. Meta can mark status=published before YouTube finishes; Task1 must retain missing-channel rows.
2. A channel binding may be blocked or unverified after a receipt is saved; Task1 must show the receipt and binding warning together, not retry or claim complete.
3. A forged scope or erroneous foreign row must not leak another project's title; Task2 tests both scope predicates and returned-row filtering.
4. Unknown observation fields and raw provider errors must never reach the client; Tasks1–2 test bounded safe serialization with secret-looking fixture markers.
5. Queue data is current across week navigation; Task3 tests no dated entry, filter/reset isolation, focus reload and late-response cancellation.

### Task1: Pure queue model and channel-state projection

**Files:** create apps/web/lib/calendar/media-queue-types.ts, media-queue-projection.ts, media-queue-projection.test.ts.

**Interfaces:** CalendarMediaChannel='facebook'|'instagram'|'youtube'; CalendarMediaChannelState={channel,tone:'waiting'|'review'|'success'|'error'|'neutral',label:string,bindingWarning:string|null}. CalendarMediaQueueItem={scriptId:string,title:string,channels:CalendarMediaChannelState[],tone:'waiting'|'review'|'error',label:string,href:string}. CalendarMediaQueue={projectId:string|null,available:boolean,truncated:boolean,readAt:string|null,items:CalendarMediaQueueItem[]}. Internal PromptQueueScript contains the explicitly selected fields from Task2; internal PromptQueueBinding contains platform,verification,blocked_at only. Export projectPromptQueue(scripts:PromptQueueScript[],bindings:PromptQueueBinding[]|null,now:string):CalendarMediaQueueItem[]. Null bindings means unavailable, not no destinations.

- [ ] Write tests for approved+ready waiting; approved+none/generating/rendering awaiting production; publishing in progress; published with IG/FB IDs and missing YouTube ID retained; all three IDs removes a completed row. Rejected/draft/pending_review do not enter this approved queue.
- [ ] Pin receipt precedence: published_at or publish_channel_state.ok alone never makes a channel green; saved ID makes only that channel green. A blocked binding adds a readable warning even when a receipt exists, retaining an actionable row. Missing binding is shown as unavailable destination, never as a guaranteed send. Unknown bindings prevent claiming all complete.
- [ ] Pin per-channel freshness at exact boundaries (Meta four days, YouTube48h), archived/failed videos, invalid timestamps, permanent and transient channel failures and needsVerification. Do not infer old failure applies after a later receipt. Raw error/detail/id/url fields must not appear in the result.
- [ ] Run node ../../node_modules/vitest/vitest.mjs run lib/calendar/media-queue-projection.test.ts from apps/web and observe the missing implementation fail.
- [ ] Implement stable script identity, fixed FB/IG/YouTube order, bounded150-character title/fallback, safe copy, and plain status parsing. Emit only the defined DTO, not raw scripts or provider observations. Expired/unknown prerequisites mean review; no assertion that a row passes the publishers' live stop/credential checks. No work is dispatched.
- [ ] Rerun tests green and commit feat(calendar): project The Prompt publishing queue by channel.

### Task2: Owned bounded reader and calendar aggregation

**Files:** create apps/web/lib/calendar/source-media-queue.ts, source-media-queue.test.ts, media-queue-read.test.ts; modify apps/web/lib/calendar/types.ts and read.ts.

**Interfaces:** readCalendarMediaQueue(db:AdminDb,actor:CalendarActor,now?:string):Promise<CalendarMediaQueue>. Add optional mediaQueue?:CalendarMediaQueue to CalendarWeekModel for old fixtures; every production readCalendarWeek response populates it. Keep existing availability/truncated keys unchanged; this source owns its flags in mediaQueue.

- [ ] Write reader tests for no allowed projects (no project-table access), projectScopeAvailable=false (unavailable), matching slug with foreign owner or outside allowed IDs (no scripts), foreign returned project/script rows refused, normal owned queue, thrown/query errors, malformed results and 101rows. A caller cannot supply a different project/slug through calendar query parameters.
- [ ] Write aggregation tests with mocked sources proving a media failure preserves private/social/workflow entries and shows its own unavailable flag; healthy empty source is distinct from failure. No media rows enter dated entries. Frozen injected now makes results independent of selected week. Assert no mutation/RPC/provider calls and no raw secret-looking fixture values in serialized output.
- [ ] Observe tests fail before implementing. Reader discovers project with owner_id=actor.userId AND id in actor.allowedProjectIds AND slug=PLATFORM_SOCIAL_PROJECT_SLUG. Recheck returned identity; reject ambiguous/malformed project results.
- [ ] Read media_scripts for this exact project in two bounded queries: approved/publishing ordered generated_at ascending then id, and published ordered generated_at descending then id. Each limit101, each projects first100; select only id,project_id,hook,status,video_status,generated_at,instagram_media_id,facebook_post_id,youtube_video_id,publish_channel_state. Combine at most200 rows, prioritize approved/publishing before partially published, deduplicate by scriptId and return at most100 visible items. Set truncated if either source exceeded100 or more than100 projected rows remain. Completed history must not crowd approved scripts out of the source read. This is bounded history coverage, not an assertion that every historical pending channel is known; UI links to the full source when capped.
- [ ] Read only platform,verification,blocked_at for active nonsuperseded account bindings of the same project, restricted to FB/IG/YouTube; cap4 to detect impossible duplicates/overflow, validate one binding per platform. No external-account IDs or credential columns are needed. Binding read failure gives unknown channels without leaking database messages; script read failure returns unavailable.
- [ ] Feed Task1 projection; return fixed /projects/ai-media-automation/scripts source href. Refuse observation JSON larger than16KiB per script before interpretation; oversized/malformed source means unavailable rather than forwarding or pretending complete. Never serialize raw publish_channel_state. Run reader/aggregation and existing access tests green, commit feat(calendar): read owned The Prompt queue without writes.

### Task3: Native calendar section and refresh

**Files:** create apps/web/components/calendar/CalendarMediaQueue.tsx and apps/web/lib/calendar/media-queue-ui.test.tsx; modify components/calendar/{CalendarWorkspace.tsx,Calendar.module.css,use-calendar.ts}; extend e2e/{calendar-entry.tsx,calendar-server.mjs}; create e2e/calendar-media-queue.spec.ts and playwright.calendar-media-queue.config.ts.

**Interfaces:** CalendarMediaQueue({queue:CalendarMediaQueue|undefined,projectFilter:string,loading:boolean}):React.ReactNode. Read queue from model; no callbacks to publish/edit. Reuse existing statusDot tones and calendar styles. New focused browser config port54433 with one worker; separate output under this plan's workspace, not another plan's scratch directory.

- [ ] Write static-render tests for the header The Prompt · aktuell publiceringskö, explicit Ingen fast publiceringstid, channel labels/statuses, safe title rendering, source link, healthy empty state, unavailable/truncated state and hidden section for private/another project's filter. Source-unavailable with unknown project may be shown only in All, not another selected project.
- [ ] Write browser test with one synthetic approved ready film, one approved unfinished film and one partial published film awaiting YouTube. Assert status-per-channel and no placement in the time grid; navigate week and confirm current-queue wording persists. Open the source link; no publish controls/request exists.
- [ ] Add focus/visibility refresh test: after fixture queue changes, focus reload removes a fully published row and retains the new correct queue; coalesce duplicate focus/visibility triggers and clean listeners on unmount. Reuse loadWeek's AbortController/sequence/owner generation; logging out or switching account clears mediaQueue, and a late response for the previous account cannot restore it. A fetch failure visibly invalidates prior success as current, with stale data clearly labelled or hidden.
- [ ] Observe tests fail, implement compact section between toolbar/notices and week grid using established responsive calendar design. On week change clear old current queue with the model; after fresh read render it as current, never as a week-specific appointment. Do not change calendar source refs or manual-event editor. No autoplay, new media download or external resource load.
- [ ] Run UI tests and node ../../node_modules/@playwright/test/cli.js test --config playwright.calendar-media-queue.config.ts; run separate tsc. Commit feat(calendar): show current The Prompt publishing queue.

### Task4: Whole-change verification and release preparation

**Files:** create docs/validation/2026-10-26-the-prompt-calendar-visibility.md and prompt-calendar-implementation-ledger.md.

- [ ] Run the new projection/reader/aggregation/UI tests, existing pure calendar progress/layout/access regressions appropriate to touched code and focused browser flow. Use the existing build clone with locked dependencies by copying only changed source/config files; preserve existing node_modules junctions. No dependency install or full SQL replay is warranted for a read-only feature with no migration.
- [ ] Run separate TypeScript check and production build with synthetic localhost Supabase settings. Inspect diff to confirm no changes to publishers, credentials, approval mutations, cron configuration, weekly preparation, budgets or database migrations. Save commands/results and known limitations accurately.
- [ ] Request one independent whole-branch code review. Fix important findings with red-to-green regressions, then rerun only affected checks and the focused green suite. No live provider sends as testing.
- [ ] Prepare the concrete PR/release payload. Follow existing user authorization and automatic approval review for GitHub upload/deployment; do all local work first. No new standing background task is part of release.
- [ ] After authorized deployment, read-only smoke the owned calendar and confirm the current queue/flags/source link. Check Family four Nov4/8 jobs remain unchanged. Do not require a specific live media-row count: the daily pipeline can legitimately change it. Report whether a real browser was used and distinguish fixture verification from live read-only verification.

## Self-review and handoff

Spec sections map to Tasks1–4; partial publication, unknown bindings, bounded status serialization and unchanged daily publisher are explicit. No new review gate replaces The Prompt's approval flow. Family pilot state has already been read and requires no new product code in this plan. Internal module boundaries and queue limits are implementer decisions permitted by the spec. Native execution is preserved from the preceding work, with a whole-branch independent review. Awaiting human review of this plan before implementation.
