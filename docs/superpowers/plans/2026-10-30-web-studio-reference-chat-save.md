# Studio reference save through chat
Baseline cc595e5, existing PR #368. Implements next step of masterplan v0.5.

Deliver an explicitly SAVE-ONLY reference operation through the authenticated /api/chat route and shared conversation controller. Ordinary text/voice/model paths remain unchanged. Separate ATLAS_REFERENCE_CHAT_SAVE_ENABLED defaults OFF, in addition to existing reference upload flag. No automatic text-only model fallback; no vision/model execution.

Server: authenticated user and verified StudioTurnContext supply owner/project/conversation; raw selection carries only ticketIds + stable idempotencyKey. Require same origin, final string user message and no simultaneous approval/build/voice intent. Call persistReferenceUserTurn and return HTTP 202 JSON with status reference_saved, analysis not_started and exact database receipt. Return before legacy message-save, model, spending or tools.

Client: explicit saveReferenceTurn method, limited to current active Studio conversation. Validate receipt scope/count/shape. Display an informational notice, never assistant-generated analysis. On ambiguous/HTTP failure retain original history and allow same-key retry. A repeated confirmed message ID must not duplicate local history. Clear receipt tracking on signout.

Files: new assets/reference-chat-save.ts and reference-save-contract.ts; route.ts early branch; controller.ts explicit method; new route/controller tests.
Verification: tests first RED; actual POST with injected session/persistence and provider spy, controller retry/SSE isolation tests, reference regression and scoped types. Real SQL tested in prior delivery; no production migration/authentication/vision E2E claim.
Scope limits: this is chat transport support, not a UI image picker or image analysis. Existing provider-key prerequisite remains for /api/chat. Full-app failures from prior session remain.

## Verification and review
- Fresh cc595e5 GitHub checks: 9/9 completed success before this delivery.
- New route/controller tests first observed **17 failing / 1 passing** against old code: unknown referenceSave fell through to normal text model execution; explicit client method absent.
- New signout race reproduced RED: old rejected request could overwrite a new pending turn. Per-operation ownership token fixes it; signout clears ownership.
- Fresh reviewer found one Important navigation issue: response after switching away left an optimistic entry that duplicated on retry. Two real controller regressions observed RED (success and HTTP failure). Fix settles the owned historical conversation cache after navigation while keeping signout invalidation; both GREEN.
- Final relevant regression: **173/173 PASS in 19 files**, exit 0. Includes assets, ordinary controller, design review effects, new save transport, actual POST handler, ownership/latency, OpenAI routing and design-skill wiring.
- Final scoped TypeScript check includes actual chat route, controller, new helpers/tests and imported dependency graph: **PASS**, exit 0, max heap1024MiB.
- Added controller -> actual POST Request/Response round-trip test; Auth, studio resolution and persistence are injected doubles. NOT real Supabase JWT/cookie/Storage/browser E2E. No provider call.
- Existing SQL was not modified or rerun this delivery; previous real PG17 result stays separate evidence.
- Diff check PASS. Full-app/full-repository green not claimed; prior unrelated fixture/memory limits remain.

## Review follow-up
Critical: none. Important navigation finding fixed RED->GREEN as above; no second review claimed.
Deferred minor: route rejects voice:true but accepts inputSource:'voice' as provenance metadata on save-only requests. This cannot reach voice/model execution; align or reject that marker in a later contract pass.

## Rulings
- Keep this explicit save-only operation behind two server flags; do not activate storage schema/flags or dispatch a model. Cost: no image analysis or user-facing picker yet.
- Preserve ordinary sendTurn/SSE behavior; use a distinct saveReferenceTurn method and JSON202 receipt for persistence.
- Keep cached owned operations settling across navigation; invalidate ownership on signout so late results cannot affect a new session. A receipt is display evidence, never provider authority.
- Keep inherited /api/chat provider-configuration prerequisite. Removing it is not necessary for this slice and would change ordinary error-path behavior.
