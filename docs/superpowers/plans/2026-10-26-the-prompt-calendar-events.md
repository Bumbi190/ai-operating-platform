# Clickable Calendar Events and Inline Review Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace The Prompt's calendar queue box with dated clickable entries and let the operator inspect the selected image/video, social caption, email draft or other stored review content directly in a detail panel.

**Architecture:** Reuse the existing calendar source model and owned read access, add a narrow on-demand detail endpoint and a shared typed content renderer. The Prompt's stored timestamps place one stable film identity on its real source day; detailed media stays out of the week response. Existing social/calendar and review inspectors use the shared renderer; publication and decision paths remain their existing source-specific paths.

**Tech Stack:** Existing TypeScript, Next.js, React, Supabase, Vitest and Playwright. No new dependencies, AI calls or scheduled jobs.

**Spec:** docs/superpowers/specs/2026-10-26-the-prompt-calendar-events-design.md (approved2026-10-26 with inline-media/email clarification).

## Global Constraints

- Remove the large queue box. Small title/status entries; details in the selected side panel.
- First publication uses published_at and is labelled ”Första publicering” only with at least one saved channel receipt, never every channel's time. A stored published_at without any receipt is only ”Rapporterad publicering · kvitto saknas”, with review state. Otherwise use reviewed_at, else generated_at with an explicit source-date label; no invented publication instant. Pending entries use an untimed top row, not a full-day duration claim.
- The Prompt keeps daily news analysis, approval, freshness windows, publishers and existing receipts. No new schedule, retry, auto-approval or provider write.
- Reuse owner/project isolation, exact social revision/hash, private no-store responses, source error/truncation flags and account/request cancellation. Fetch only selected media, no autoplay or tracking resources.
- Images/video and text render in the panel. Email draft preview displays stored To/Cc/Bcc, subject, complete body and attachment metadata. Unavailable/unsupported material must be identified, not represented as reviewed or sent.
- No live mail approval payloads were found in the bounded owned metadata check. Provide a tested explicit draft contract and existing text-review integration; do not invent an email connection, producer or send flow.
- Family's existing scheduled posts and approvals stay intact. Recurring weekly generation remains separate work.

## Review Focus

1. Published films can still have pending YouTube; retain the per-channel distinctions and show complete receipt history in the selected week (Task1).
2. Old/null timestamps, DST and date-fallback semantics must not put stale failed jobs on today's date or fabricate a time (Task1).
3. Changing selected item/revision/account while media loads must clear the old video/image and ignore late results (Tasks2–3).
4. Untrusted HTML, external images, arbitrary media URLs, foreign/replaced assets and stale pinned social revisions must not be previewed as the selected owned artifact (Task2).
5. Email headers/body and generic content must be inspectable without guessing an unknown schema or clipping away material needed for review; oversized content is explicitly unavailable (Tasks2–4).

### Task1: The Prompt dated read projection

**Files:** modify apps/web/lib/calendar/{media-queue-types.ts,media-queue-projection.ts,source-media-queue.ts,types.ts,read.ts,progress.ts}; create media-events.ts and media-events.test.ts; adapt source-media-queue.test.ts and media-queue-read.test.ts.

**Interfaces:** Extend internal PromptQueueScript with reviewed_at,published_at. Factor projectPromptChannelStates(script,bindings,now) from existing projection, preserving queue wrapper behavior until removed. Add CalendarSourceRef variant {kind:'media';projectId:string;scriptId:string}. Export projectPromptCalendar(projectId,scripts,bindings,range,now):{entries:CalendarEntry[];undated:CalendarUndatedReview[]}, where undated={id,source,title,status}. CalendarEntry gains optional dateBasis:'first_publication'|'reported_publication'|'approval'|'creation' and displayLabel for source-time meaning. New reader readCalendarMediaEvents(db,actor,range,now?) returns entries,undated,available,truncated; no media URLs/body in week DTO.

- [x] Write failing tests for reviewed-day untimed entry, generated-date fallback, first-publication time with pending YouTube, reported publication timestamp without receipts remaining review, fully receipted film retained as calendar history, exact range boundaries, DST, null dates and stable script ID. Old failed rows appear only on their historical day. No duplicate appointment/job from a status change.
- [x] Run new tests and observe RED. Use calendar's validated range and Stockholm midnight UTC bounds. Read the owned canonical project as before, with at most101 matching rows ordered by source timestamp/id, taking100 and flagging truncation. Query disjoint branches: published_at in range; published_at null and reviewed_at in range; both null and generated_at in range. A separately bounded all-three-null query supplies at most20 small undated notices with truncation. Do not bound over all published history before applying the range.
- [x] Project one entry per script, untimed top-row dates for pending work, explicit dateBasis and display copy. Do not call it a full-day reservation. Channel receipt state remains source truth; only complete saved receipts can make the entry green. Partially published stays waiting/review/error according to unresolved channels.
- [x] Merge entries with the existing week read. Source failure never erases private/Family entries. Keep a small unavailable/truncated/undated notice instead of a narrative queue box. Run tests green and commit.

### Task2: Shared safe review payload and selected-detail read API

**Files:** create apps/web/lib/review-content/{types.ts,normalize.ts,normalize.test.ts,owned-media.ts,owned-media.test.ts}; create apps/web/lib/calendar/{detail.ts,detail.test.ts,detail-api.ts,detail-api.test.ts}; create apps/web/app/api/calendar/detail/route.ts. Reuse existing social content/publication media read helpers where their project/revision checks fit.

**Interfaces:** ReviewContent is a discriminated union: {kind:'text';text:string} | {kind:'media';text:string;media:ReviewMedia[]} | {kind:'email';to:string[];cc:string[];bcc:string[];subject:string;bodyText:string;attachments:ReviewAttachment[]} | {kind:'unavailable';reason:string}. ReviewMedia={id:string;kind:'image'|'video';src:string;alt:string}; ReviewAttachment={id:string;name:string;mimeType:string|null;preview:ReviewMedia|null}. CalendarDetail={source:CalendarSourceRef;title:string;content:ReviewContent;channelStates?:CalendarMediaChannelState[];dateBasis?:CalendarEntry['dateBasis'];sourceHref:string|null;revisionHash:string|null}. Export readCalendarDetail(deps,actor,source):Promise<CalendarDetail>. GET /api/calendar/detail accepts only a validated encoded source selector; no client URLs/principal/owner override.

OwnedPreviewRef={assetId:string;sha256:string;name:string;mimeType:string|null}. resolveOwnedPreviewMedia(db,actor,projectId,ref:OwnedPreviewRef):Promise<ReviewMedia|null> lives in owned-media.ts and returns only verified owned image/video sources; absent supported preview returns null while preserving attachment metadata. The saved script producer's canonical asset/provenance reference must be resolved before using the same helper.

- [x] Write failing normalization/API tests for unauthorized/foreign project or asset, changed social revision/hash, arbitrary link disguised as attachment, oversized/invalid payload, malicious HTML/headers and raw provider errors. Identical foreign/missing source refusal avoids revealing private content. GET creates no rows and dispatches no provider calls.
- [x] Implement strict source adapters. Media script lookup intersects actor scope and owned canonical project before selecting only title/script/caption-relevant fields, current status/timestamps, stored video reference and receipt fields. Social lookup pins the requested revision/hash from current or saved batch review; it must not silently substitute a later draft image. Private media reads use existing validated owned-asset/storage paths or attested producer provenance; no URL supplied by the client and no arbitrary redirects/server fetches. Invalid legacy media reference returns unavailable video with readable text and source metadata.
- [x] Normalize text without executing markup. Explicit email contract uses known draft_email/email_draft source kind/outputKey plus JSON {to:string[],cc?:string[],bcc?:string[],subject:string,bodyText:string,attachments?:OwnedPreviewRef[]}. Unknown shape falls back to safely rendered original text, never guessed recipients. Up to20 attachments, each ownership-checked if previewed; at most128KiB content, no silent truncation. HTML-only email without a stored bodyText is marked unavailable for formatted mail preview and retained as safely escaped source text in the existing fallback; never innerHTML/remote iframe.
- [x] Return cache-control private,no-store and generic failures; bound request input to source IDs/hash only. Media URLs are short-lived verified owned previews, not credentials/provider tokens. Runtime opening cannot render/generate/send/approve anything. Run tests green and commit.

### Task3: Calendar inline details and removal of the box

**Files:** create apps/web/components/review-content/{ReviewContentPreview.tsx,ReviewContentPreview.module.css}; create apps/web/components/calendar/CalendarContentDetail.tsx; modify components/calendar/{CalendarWorkspace.tsx,CalendarWeek.tsx,CalendarEventPanel.tsx,use-calendar.ts,Calendar.module.css}; retire CalendarMediaQueue.tsx from calendar render. Create lib/calendar/content-detail-ui.test.tsx and adapt existing queue UI tests to dated-entry/detail behavior.

**Interfaces:** ReviewContentPreview({content:ReviewContent}):React.ReactNode contains no approval/send callbacks. CalendarContentDetail({source:CalendarSourceRef,userId:string}):React.ReactNode loads the Task2 endpoint for media/social sources. Source key includes user,project,script or social revision/hash. CalendarWeek uses displayLabel for untimed media instead of announcing Heldag; ordinary actual all-day entries remain unchanged.

- [x] Write failing tests: queue box absent; compact media card placed in the expected day; click opens exact caption/image/video and channel states in the side panel; missing video readable; no autoplay/preload except none. Existing Family social card previews its pinned image/revision. Cards have no publish/render/move-time controls for media scripts.
- [x] Implement shared media/text renderer with native img/video controls and accessible labels; email view includes every header/body/attachment field, plain text preserves whitespace. Keep event title and tiny status dot in grid, not full channel explanations. Use the existing responsive panel and Escape/focus behavior.
- [x] On source/user/revision changes clear old detail immediately, abort prior fetch and guard late replies with an identity/generation token. Clear private media on logout; refresh must not turn stale panel contents into a different current revision. Detail failure is local to panel and retryable.
- [x] Add native Chromium fixture for dated placement/clicked media, image/video/text/email preview, unknown media, filter/week navigation, private scope, late response and mobile width. Use a new dedicated config playwright.calendar-content-detail.config.ts port54435 and this plan's own output directory. All network responses are synthetic and local. Observe RED then GREEN; commit.

### Task4: Use the same renderer in existing review details

**Files:** modify apps/web/lib/os/review-queue.ts, apps/web/components/platform/vnext/ReviewQueue.tsx; create apps/web/lib/review-content/review-queue-adapter.ts and review-queue-adapter.test.ts; extend lib/qa/review-queue.test.ts and a new lib/review-content/preview.test.tsx (add this focused path to existing Vitest include if needed).

**Interfaces:** deriveStoredReviewContent({kind,outputKey,content}):ReviewContent normalizes the immutable selected ReviewItem content; ReviewItem gains optional preview:ReviewContent. Prefer server normalized preview; text fallback preserves current items. Owned media enrichment, when present, uses Task2's ownership/provenance checks and happens for the selected review only, not every queue row. LocalTextApprovalCard and other specialized decision/review controls remain their current implementation.

- [x] Write failing tests for a normal text approval rendered inline, explicit email draft with all To/Cc/Bcc/subject/body fields and attachments visible, unsafe HTML inert, unsupported schema shown as text, and source/account selection change clearing previous preview. Assert that rendering/clicking preview emits no PATCH/POST/send call and does not replace existing decision behavior.
- [x] Replace generic pre-only content rendering with ReviewContentPreview, preserving reviewer notes, project labels, local-text specialized handling and existing DecisionPanel. Keep source-specific approval controls where they already exist; add no generic approval authority and no mail sending integration. A link may remain for navigation, but cannot be the only way to see the supported content.
- [x] Verify no live email feature is claimed merely because the typed renderer supports email. Test explicit future payloads as synthetic, existing text/social/video as actual adapters. Run focused regression tests green; commit.

### Task5: Verify, review and release

**Files:** docs/validation/2026-10-26-calendar-content-detail.md and calendar-content-detail-implementation-ledger.md.

- [ ] Run all new projection/read/preview/API tests plus affected existing calendar access, media status, review queue and special-review regressions. Run separate TypeScript check, native browser detail flow and production build in existing locked-dependency build copy. Use no live draft creation, external mailbox or provider publishing to test previews.
- [ ] Independently review the whole branch once, including calendar timestamp semantics, pinned image provenance, no unsafe HTML/tracking, no cross-account stale preview and unchanged decision/send authority. Fix important findings with RED→GREEN regressions. Record all deviations and evidence in ledger.
- [ ] Prepare PR against fresh main, attach it and pass CI/preview. Release through normal authorized GitHub/Vercel process; no database schema or budget migration is expected. If a genuine missing safe media primitive requires one, record the issue and finish unaffected preview work rather than silently widening permissions.
- [ ] Live read-only check: big box gone, approved The Prompt card on its source date, exact film/image opens in panel, Family jobs unchanged; inspect current source date meaning, no guaranteed future send time. Email preview is synthetic until an actual owned email-review artifact exists; state that limitation plainly. Record production SHA/deployment and verify aliases before claiming live.

## Self-review and execution handoff

Tasks1–3 deliver the requested calendar experience; Tasks2/4 share the content contract so inline text/media/email previews are consistent rather than a separate mail system. No reviewed-body approval semantics or specialized controls are generalized. Task5 verifies private scope and absence of side effects. Native implementation in this chat is preserved from prior approved work, with one fresh whole-branch review. Awaiting plan review before product code.
