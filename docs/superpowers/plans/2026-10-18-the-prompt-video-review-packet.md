# The Prompt Video Review Packet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare an immutable, owner-scoped illustrated-news review packet in the existing social content workspace, without publication authority.

**Architecture:** A trusted local admission path measures the actual MP4 and records source-bound render/usage evidence in existing append-only asset provenance. A server-only verifier resolves canonical inputs; one database transaction reuses social content revisions/decisions and attaches immutable news evidence before review. Existing review UI shows the exact private movie and explicit readiness/publication blockers.

**Tech Stack:** TypeScript, Next.js 14, React 18, Supabase/PostgreSQL, Vitest, existing canonical asset admission, local ffprobe/ffmpeg; no new package dependency.

**Spec:** `docs/superpowers/specs/2026-10-18-the-prompt-video-release-design.md`, approved by André on 18 October 2026, 09:40 Stockholm ("Jag godkännner"). This plan awaits owner review and execution-method selection.

## Global Constraints

- "Det får inga utskicksrättigheter."
- "Den privata leverantörsprovets rad är en separat `pending_review/private_preview` med platshållarmanus. Den ska bevaras."
- "Förberedelseadaptern tar endast projekt, manus-ID, video-asset-ID och en återanvändbar idempotensnyckel."
- "Signerade länkar är tillfällig leverans och ingår inte i identitetsfingeravtrycket."
- Creative version is `the-prompt-illustrated-smooth-v1`; composition is `ThePromptIllustratedNews`; three ordered, distinct illustrations; Victoria `qSeXEcewz7tA0Q0qk9fH`, model `eleven_turbo_v2_5`; English narration and captions.
- "Inga vanliga GET-anrop genererar, laddar upp till sociala medier eller skapar publiceringsbegäran."
- "SQL testas lokalt inklusive behörighet/append-only/konkurrens, och migration/rollback granskas separat före produktion."
- Preserve legacy publication holds, ordinary JPEG behavior and project isolation. No main merge, live SQL, guard override, paid generation/render, social dispatch, CRON change or trial activation.
- DST #378, prospective 24h/72h measurements #383, video transports and a concrete release decision remain later work. No automatic authority over fourteen future movies.

## Review Focus

1. Source timestamp at 48 hours / fifteen minutes in the future: consistent boundaries on prepare, read and approve; fetched time never refreshes news (Tasks 1, 3).
2. Lost response followed by a retry after script/asset/account changes: return the same IDs only for an unchanged snapshot; conflict otherwise (Tasks 2, 3).
3. Plausible but forged uploaded provenance or JSONB-reordered word timings: reject forgery, preserve canonical legitimate voice hashes (Tasks 1, 2).
4. Truncated private media or malformed/multiple byte ranges: never show unverified bytes or leak storage credentials (Task 4).
5. Two sessions editing/approving or attaching evidence after a decision: approve only the locked current revision with pre-existing evidence (Task 3).

---

## File map and execution setup

Use the existing isolated branch `codex/the-prompt-creative-v2-20261017`; inspect current status and applicable instructions before implementation. Do not overwrite unrelated changes. All paths below are repository-relative. Run web commands from `apps/web`.

- New `apps/web/lib/social-launch/news-review/{types,contract,admission,verify,store,api,readiness}.ts`: respectively shared shapes, pure canonical validation, trusted local media intake, server evidence resolution, transactional RPC wrapper, authenticated HTTP boundary, read-only readiness.
- New tests alongside them: `contract.test.ts`, `admission.test.ts`, `verify.test.ts`, `store.test.ts`, `api.test.ts`, `integration.test.ts`, plus `test-db.ts` and `fixtures.test-utils.ts`.
- New `apps/web/scripts/the-prompt-admit-review-video.ts`: explicit local operator entry point, dry-run by default; no public upload/receipt-minting endpoint.
- New `apps/web/supabase/migrations/20261018100000_media_news_review_evidence.sql`: new relation, functions and replacement definitions of existing content functions. If that version becomes occupied, stop and allocate the next unique version before committing; never edit an applied migration.
- New `apps/web/app/api/media/news-review/route.ts`: GET readiness / POST prepare only.
- Modify `apps/web/lib/social-launch/content/{types,store,api}.ts`: optional news review projection and post-read enrichment; keep existing decisions.
- New `apps/web/components/social-launch/NewsReviewEvidence.tsx`; modify `SocialContentPanel.tsx` and its CSS for the review card and blockers.
- New `apps/web/lib/social-launch/news-review/panel.test.ts`; modify `apps/web/lib/social-launch/content/api.test.ts` for private playback.
- New `docs/the-prompt-news-review-validation.md` and `docs/the-prompt-news-review-migration-review.md`: actual evidence and separately reviewable migration/rollback procedure.

Tests use the existing owned Docker fixture via `lib/website-build/test-db.ts` and `social-launch/content/test-db.ts`. Before SQL tests, verify container label `com.omnira.testplan` and `WEBSITE_BUILD_TEST_DATABASE_NAME` matching `^website_test_[0-9]+$`. No production DB fallback. Install no new dependencies. If dependencies are unavailable, report the exact check blocked rather than claiming PASS.

### Task 1: Define the immutable evidence contract

**Files:** Create `news-review/types.ts`, `contract.ts`, `contract.test.ts` under the web lib path above.

**Interfaces:**
- `PrepareNewsReviewInput = {projectId:string; scriptId:string; videoAssetId:string; idempotencyKey:string}`.
- `AssetIdentity = {id:string; sha256:string; byteSize:number}`; `WordTiming = {word:string; startMs:number; endMs:number}`.
- `UsageEvidence = {documentUrl:string; documentSha256:string; documentText:string; scope:'public_social_editorial'; reviewedBy:string; reviewedAt:string}`. This is an attributable operator review of archived terms/permission, not a boolean rights flag or a guarantee of legal ownership.
- `RenderReceipt`: kind `the-prompt-review-render-v1`; projectId, scriptId, scriptSha256, hookSha256, captionSha256; language 'en'; source {newsItemId,url,key,publishedAt}; video {sha256,byteSize} (asset ID comes from its enclosing provenance row after admission); image identities as an ordered three-tuple; audio identity, `PilotVoiceReceipt`, words, transcript and narrationDurationMs; creativeVersion, compositionId, sourceSha; profile {width,height,fps,frames,durationMs,videoCodec,audioCodec}; QA {reportSha256,reportText,reviewedBy,reviewedAt}; usage evidence per image; existing asset-provenance IDs and cost-event IDs. Every reference must later resolve in the same project.
- `NewsEvidenceSnapshot = {video:AssetIdentity; receipt:RenderReceipt; receiptSha256:string; provenanceId:string; planRevisionId:string; destinations:Array<{channel:'facebook'|'instagram'|'youtube'; bindingId:string|null; accountId:string|null}>}`.
- `NewsReviewView = {projectId:string; postId:string|null; revisionId:string|null; evidenceSha256:string|null; review_packet_ready:boolean; blockers:string[]; publicationBlockers:string[]; canPublish:false; dispatchEnabled:false}`.
- Export `parsePrepareNewsReview(input:unknown):PrepareNewsReviewInput`, `parseRenderReceipt(input:unknown):RenderReceipt`, `newsEvidenceSha256(snapshot:NewsEvidenceSnapshot):string`. Reject unknown fields, malformed UUID/hash/date/size, private signed URLs and non-finite/fractional numeric fields or NUL-containing strings. Hash explicit schema projections, not arbitrary input objects; reuse `pilotVoiceTimingsSha256`.

- [ ] Write RED tests `strict_input_and_receipt_identity`, `word_key_order_is_canonical_but_image_order_is_not`, `freshness_boundaries`: assertions include `expect(()=>parsePrepareNewsReview({...valid,rightsVerified:true})).toThrow()`, `expect(newsEvidenceSha256(reorderedWordKeys)).toBe(newsEvidenceSha256(original))`, `expect(newsEvidenceSha256(reversedImages)).not.toBe(newsEvidenceSha256(original))`. Reuse `checkFreshRelevantNews`: 48h eligible, 48h+1ms ineligible, future 15m eligible / 15m+1ms ineligible.
- [ ] Run `pnpm exec vitest run lib/social-launch/news-review/contract.test.ts`; expected RED for missing exports, then intended assertions after stubs exist.
- [ ] Implement the interfaces and pure validators; require exact version/voice/model, full source identity, distinct image IDs, transcript/timing/audio receipt matches, sane ordered timings, and measured video duration = narration frames plus 90 outro frames at 30fps (one frame tolerance).
- [ ] Rerun the same command; expected all PASS, no skipped cases.
- [ ] Commit only these files: `git commit -m "feat(the-prompt): define review evidence contract"`.

### Task 2: Admit measured video and resolve trusted canonical inputs

**Files:** Create `news-review/{admission,verify}.ts`, their tests, and `scripts/the-prompt-admit-review-video.ts`.

**Interfaces:**
- `admitReviewVideo(principal:SocialContentPrincipal,input:{projectId:string;scriptId:string;videoPath:string;manifestPath:string;apply:boolean}):Promise<{dryRun:boolean;videoAssetId:string|null;receiptSha256:string;blockers:string[]}>`.
- `resolveNewsEvidence(db:SupabaseClient<Database>,principal:SocialContentPrincipal,input:PrepareNewsReviewInput,nowMs:number):Promise<NewsEvidenceSnapshot>`; throw typed `NewsReviewError` with code `NOT_FOUND|INVALID_BODY|MISSING_SOURCE|SOURCE_EXPIRED|MISSING_RENDER_EVIDENCE|MISSING_USAGE_EVIDENCE|MISSING_COST_PROVENANCE|MEDIA_CHANGED|PLAN_REQUIRED|STOPPED|UNAVAILABLE`. Define/export the class in `types.ts`.
- Resolve `media_scripts.news_item_id` → `media_news_items`; source URL/title and raw_output.source_key/source_published_at. Read actual script/hook/captions/hashtags/CTA; do not substitute fixed candidate text, timing_url or video_url as evidence.
- Resolve active internal canonical assets and their immutable `asset_provenance`; use private storage download, actual byte length/SHA256, source/project and cost references in public.cost_events, matched by recorded IDs and project_id; absent links block rather than manufacturing new cost events. Original private QA provenance is preserved; it is not rewritten as release approval.

- [ ] Write RED tests `uploaded_receipt_cannot_impersonate_operator_intake`, `private_placeholder_and_missing_news_refused`, `actual_bytes_voice_source_and_cost_refs_required`, `approved_plan_video_destinations_only`. Assert uploaded/imported/simulated provenance cannot satisfy the trusted derived adapter; any foreign ID or failed DB read produces no writes/signing; a one-byte asset change rejects; missing real cost links blocks; non-video choices are excluded and an empty eligible plan returns PLAN_REQUIRED.
- [ ] Run `pnpm exec vitest run lib/social-launch/news-review/admission.test.ts lib/social-launch/news-review/verify.test.ts`; expected RED for missing interfaces, then evidence assertions.
- [ ] Implement dry-run intake. Authenticate actual project owner and current execution stops; read real script/news and actual local MP4; ffprobe H.264/AAC, 720×1280, 30fps, bounded 50MiB and 8–93 seconds, then ffmpeg full A/V decode. Validate all manifest references against canonical bytes; reject missing usage-document text/hash/URL/scope, actual QA report/reviewer/time and real cost refs. Do not mint these from successful decode alone. Only `apply:true` admits through `admitAssetBytes` as internal video, source derived, adapterVersion `the-prompt-review-admission-v1`, immutable metadata receipt and image/audio reference IDs. The operator-only CLI takes an explicit local operator-JWT file, verifies the token through Supabase auth.getUser(jwt), derives allowedProjectIds with existing getAllowedProjectIds and compares current projects.owner_id; it never trusts an actor ID from the manifest. Read the token only for authentication, never persist/log it; expose no HTTP receipt-minting route. Inspect generic upload entry points to prove they cannot select source/adapterVersion.
- [ ] Implement resolver with the Task 1 contract. Require trusted derived non-simulated admission, actual receipt hash and same-project referenced provenance/cost rows. Compare current script/hook/source/media and the caption text SHA256 against receipt; caption projection is captions joined with newline, then hashtags joined with spaces, then CTA, with empty sections omitted and sections joined with newline. Require a currently approved launch plan and derive only its FB/IG/YT video choices plus current bindings, sorted by channel. Null binding is visible as a publication blocker, not invented. No provider calls and no writes here.
- [ ] Rerun Task 2 tests plus contract tests; expected PASS. CLI fixture dry-run must create zero assets/storage objects. Test `apply:true` only with local/fake storage and owned local SQL fixtures; never apply the real private movie in this task.
- [ ] Commit: `git commit -m "feat(the-prompt): verify measured news video provenance"`.

### Task 3: Atomically attach evidence before existing content decisions

**Files:** Create the migration, `news-review/{store,test-db,fixtures.test-utils}.ts`, `store.test.ts`; update generated/manual database RPC types in `apps/web/lib/supabase/types.ts` following repository conventions; create migration review document.

**Interfaces:**
- SQL `media_news_review_prepare(p_principal jsonb,p_input jsonb,p_snapshot jsonb) returns jsonb`; service_role only. Server wrapper `prepareNewsReview(db,principal,input:PrepareNewsReviewInput,nowMs:number):Promise<NewsReviewView[]>` calls resolver then this RPC.
- `media_news_review_evidence`: UUID PK; project_id, post_id, revision_id, revision_sha256; script_id, video_asset_id; snapshot JSONB, snapshot_sha256; root_idempotency_key, request JSONB, created_by, created_at. Unique revision; unique(project_id,root_idempotency_key,channel), where channel is an explicit constrained column. Composite FK(revision_id,post_id,project_id,revision_sha256) → existing revision tuple; project-scoped script/video references enforced by constraint trigger. No new editorial approval table.
- SQL `media_news_review_requirements(revision uuid) returns text[]` supplements existing requirements. SQL functions must have explicit search_path, grants/revokes matching existing content functions. Add SQL media_news_canonical_json(v jsonb) returning compact JSON recursively with C-collated object keys, preserved array order and JSON-escaped strings; numbers are validated integers. SHA256 of its UTF-8 output must match Task 1's sorted explicit projection. Test Unicode, escaped quotes/newlines, JSONB key order and timing arrays against the TypeScript digest.

- [ ] Write actual SQL RED tests `evidence_rls_append_only_and_composite_scope`, `atomic_multichannel_retry_and_changed_snapshot_conflict`, `concurrent_prepare_has_one_result_per_channel`, `late_evidence_cannot_retrofit_old_decision`, `concurrent_review_vs_changed_revision`, `expired_or_stopped_cannot_approve`. Assert anon/authenticated cannot read/insert; update/delete/truncate denied; foreign tuple fails; identical retry same IDs; changed input/source/account hashes conflict; two independent psql sessions produce one revision/evidence per channel; old decisions never acquire evidence; no decision approves a superseded revision. Retry just after 48h must not report readiness even if original prepare succeeded.
- [ ] Extend local fixture initialization to apply the new migration after existing content schema and create the real media/cost/asset schemas needed by these functions. Reuse owned Docker harness, not production credentials or an in-memory SQL substitute. Run `pnpm exec vitest run lib/social-launch/news-review/store.test.ts`; expected RED missing table/RPC/constraints.
- [ ] Implement the transaction: owner assertion, project FOR UPDATE, reassert owner/stops; lock script/news/assets/current plan/bindings and compare current pinned projection to resolver snapshot before writing. Derive each channel's draft from hook, captions+hashtags+CTA (joined with newlines), source URL, exact video ID, scheduledAt null. Reject existing content-limit/field-length failures atomically. Call existing `social_content_save` under that same transaction with server UUIDs, expected current revision and derived per-channel idempotency key (SHA256(root key + channel)); then attach evidence before any decision. All channels succeed or roll back. For an unchanged retry reuse original IDs; any pinned input change returns REVISION_CONFLICT, never silently creates another packet.
- [ ] Extend `social_content_requirements/read/decide` by replacing definitions in the new migration, preserving legacy behavior. Require evidence for videos bearing trusted review-render provenance; reject attach if a decision already exists. Recheck actual current source/script/caption/media/plan/account/stops at read and approval. Evidence hashing is validated in SQL against the stored explicit JSON projection; do not accept a caller's checksum without recomputation. New captions/media edits create a revision without inherited evidence and require re-preparation. Old approved decisions remain historical, never live readiness.
- [ ] Rerun SQL suite plus existing content and manual publication store tests: `pnpm exec vitest run lib/social-launch/news-review/store.test.ts lib/social-launch/content/store.test.ts lib/social-launch/publication/store.test.ts`; expected PASS. Include separate concurrent connections as existing content test does, not merely Promise.all through a synchronous fake.
- [ ] Document forward/rollback review: production application remains separately gated; rollback disables new prepare route, retains append-only evidence/decisions, restores prior function definitions only after confirming no new packets can be approved through old rules; never drop audit rows to make rollback pass. Demonstrate migration on clean and already-initialized owned fixtures; record exact results.
- [ ] Commit: `git commit -m "feat(the-prompt): persist atomic revision-bound review evidence"`.

### Task 4: Authenticated readiness and exact private playback in existing workspace

**Files:** Create `news-review/{readiness,api}.ts`, `api.test.ts`, `panel.test.ts`, route, `NewsReviewEvidence.tsx`; modify existing content types/store/API/tests and SocialContentPanel/CSS.

**Interfaces:**
- `readNewsReview(db,principal,input:{projectId:string;postId:string},nowMs:number):Promise<NewsReviewView>`; compute current facts without writing.
- `newsReviewApi(request:Request):Promise<Response>`; GET exact query projectId/postId, POST exact four-field Task 1 input. Use existing project access, same-origin POST, bounded 32KiB JSON and private/no-store/nosniff/no-referrer response conventions. Fail closed on dependencies; do not log raw proof documents or private paths.
- Extend `SocialContentPost` with optional `newsReview:NewsReviewView & {source:{url:string;publishedAt:string};creativeVersion:string;video:AssetIdentity;imageCount:3;voiceLabel:'Victoria';aiDisclosure:string}`. No private storage paths, signed URLs, raw terms, or service credentials in this projection.
- `NewsReviewEvidence({review}:{review:NonNullable<SocialContentPost['newsReview']>}):JSX.Element`; existing content API enriches owned read/propose/decide responses using persisted news evidence.

- [ ] Write RED tests `strict_auth_origin_and_prepare_fields`, `get_never_writes_or_dispatches`, `stale_news_and_missing_evidence_visible`, `private_range_bytes_match_full_verified_movie`. Assert 401/404/403 boundaries, unknown rights flags rejected, no provider/storage writes from GET, canPublish/dispatchEnabled always false. Range cases: absent=200; bytes=0-99, bytes=100-, bytes=-100 produce exact 206 lengths/content-range; invalid, multiple or unsatisfiable ranges=416; corrupted bytes never returned.
- [ ] Run `pnpm exec vitest run lib/social-launch/news-review/api.test.ts lib/social-launch/news-review/panel.test.ts lib/social-launch/content/api.test.ts`; expected RED on missing API/card/range behavior.
- [ ] Implement readiness: review_packet_ready means complete currently valid stored evidence, not editorial approval. publicationBlockers always include `video_transport_unavailable`, `release_authority_missing`, `schedule_not_activated`; add missing/current decision, account and project/freshness reasons from real state. Missing evidence returns explicit blocker; DB errors return unavailable without false success.
- [ ] Implement route and content enrichment. Extend only existing authenticated `socialContentMedia` private playback with single Range after entire bounded object's size/hash verification; use existing 50MiB cap. No external publication-delivery URL or MP4 publisher activation. Keep JPEG response unchanged.
- [ ] Implement card in current review article: exact video, English caption, original source/date/freshness, three illustrations/AI labels, Victoria, destination and separate review/publication state. Disable approval when required evidence is missing/stale. Keep server decision authoritative, preserve existing stale-response guards and media-load gating; add video onError handling that clears the loaded key. Suppress new video publication actions; existing JPEG publication panel remains.
- [ ] Add server-rendered card tests for source/date/disclosure/destination/blocker text and private-data absence. Rerun Task 4 command plus existing publication API/media tests; expected PASS.
- [ ] Commit: `git commit -m "feat(the-prompt): expose private news review readiness"`.

### Task 5: End-to-end local proof, isolation and handoff

**Files:** Create `news-review/integration.test.ts`, `docs/the-prompt-news-review-validation.md`; update migration review with observed results.

**Interfaces:** Consume Tasks 1–4 unchanged. Use synthetic current news/script, private MP4 fixture and attributable test-only proof documents in owned local fixtures; do not forge receipts for real production assets.

- [ ] Write RED integration `prepare_read_review_and_invalidate_without_dispatch`: start with missing usage evidence → blocker/zero content rows; admit complete local fixture → prepare per approved video destination → read exact packet → existing approve decision → modify source/media/account → readiness false/new review required. Assert no runs, social publication requests, provider calls, new paid events or legacy queue eligibility at every stage. Ordinary unrelated project/JPEG path remains successful. Include retry after simulated lost HTTP response.
- [ ] Run `pnpm exec vitest run lib/social-launch/news-review/integration.test.ts`; expected RED for any unconnected boundary; fix only missing integration behavior within prior interfaces.
- [ ] Run `pnpm exec vitest run lib/social-launch/news-review lib/social-launch/content lib/social-launch/publication` and `pnpm exec tsc --noEmit`; expected zero failures/skips in new suites and full web typecheck PASS. Run existing Remotion tests with the repository's established Node/tsx test command from `apps/remotion`; preserve both editorial/news isolation checks. Record actual counts, not historical numbers.
- [ ] Review complete diff for secret/private URL leakage, provider imports, dispatch/cost side effects, circular dependencies and ordinary-project changes. Confirm exact source-derived schemas and no generic uploaded receipt spoofing. Record independent review only if it actually occurred.
- [ ] Document technical sample vs live news: the existing Anthropic source expires 18 October 18:26 Stockholm; its approved private movie remains a technical example afterward. Real intake cannot succeed until a genuine source-linked manuscript, exact canonical video, usage/QA documents and cost provenance exist. No placeholder replacement or freshness resetting.
- [ ] If canonical migration reconciliation is unresolved, record build as blocked at `sales_reply_preparation`; do not bypass guard or claim deployed verification. If resolved by its owner, run the normal preview build and authenticated browser review of exact source/date/movie/destination, without dispatch. Report a login wall or unavailable preview honestly.
- [ ] Commit: `git commit -m "test(the-prompt): prove review packet isolation and readiness"`; push existing draft PR, record exact SHA and validation, leave release/migration/paid/live gates unchanged.

## Self-review and handoff

Spec acceptance 1–3 and 6 map to Tasks 1–2/4; freshness 4 to Tasks 1/3/4; idempotence/concurrency/late attachment 5/7 to Task 3; no dispatch and backward compatibility 8–9 to Tasks 3–5; SQL and migration review 10 to Tasks 3/5. All five Review Focus items have named tests. No trusted render/usage store is assumed to exist: Task 2 creates its narrow local provenance writer and rejects missing evidence. No production facts or paid receipts are invented.

The five tasks share evidence interfaces and one content transaction. Recommend **Native** execution to retain this context, followed by one fresh whole-branch review; Subagent-driven is available if the owner prefers task-by-task independent review. Await plan review and execution-method selection before implementation.
