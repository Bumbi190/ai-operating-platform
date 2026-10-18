# The Prompt illustrated daily adapter implementation plan

**Goal:** Carry the owner's accepted illustrated visual direction into the existing story-image planner and fresh daily-preview adapter, without enabling any live pilot or adding paid calls.
**Spec:** docs/the-prompt-illustrated-review-20261018.md (owner acceptance recorded).
**Scope ruling:** This is a bounded extension of existing generateNewsImages + prepareDailyPilotPreview, not a new image service, publisher or DB schema. Execution continues inline under existing owner authorization.

## Constraints
- Existing production behavior remains unchanged with new flag absent.
- New illustration profile requires THE_PROMPT_ILLUSTRATED_PILOT=true, THE_PROMPT_FRESH_NEWS_PILOT=true AND THE_PROMPT_PILOT_PROJECT_ID matching actual The Prompt UUID a8a1b1f6-c222-4893-9399-b1fb3bc2fa52 AND current row project.
- Same Ideogram v3 TURBO image gateway, same project/stop/budget/retry authority. Exactly three images in new profile; malformed model plans cause zero image calls.
- Do not change public render/publish choice, deploy, model credentials, budget, DB or schedules. Provider quality is not proven equivalent to the built-in imagegen sample.
- AI illustrations remain disclosed and do not auto-satisfy documentary story_visual rights evidence.

## Tasks

1. Dynamic illustrated-preview shot planning:
   - Create apps/web/lib/media/illustrated-news-shots.ts.
   - Extend prepareDailyPilotPreview props with illustratedShots; derive cuts from actual word timestamps, image count and duration, never Replit-specific cues.
   - RED/GREEN tests: two unrelated transcripts/durations, all 2-5 images used, monotonic zero-first cuts before outro, bounded crops, invalid/duplicate/out-of-order/out-of-duration timing refused.
2. Governed illustration profile:
   - Create apps/web/lib/media/illustrated-news-profile.ts for exact-project flags, scene brief parsing, planner instruction and fixed provider request derivation.
   - Add optional profile to generateNewsImages. In new profile demand exactly three valid ordinal, distinct story-specific scenes before any image gateway dispatch; use brighter editorial 3D illustration style and safe no-fake-photo instructions. Legacy prompt path unchanged.
   - Wire optional profile into step2 and step3 fallback with existing count/call paths unchanged while OFF. New-mode fallback is three images rather than eight.
   - RED/GREEN tests: OFF/wrong-project/freshness flag boundaries; strict scene count, malformed model output and long/duplicate scenes; illustration request shape and no external spend from pure helpers; legacy source contracts.
3. Integration verification and handoff:
   - Run complete Remotion Node/tsx tests plus isolation contracts and focused TypeScript.
   - Render the existing authorized local Replit assets using the actual dynamic preview adapter/shot function, verify encoded output and image/audio/outro preservation. No new paid providers.
   - Review diff, persist evidence, push draft PR and update Notion. Keep actual remaining release/provider-QA blockers explicit.

## Review focus
- Same source data for the film and derived cut plan; no invented timestamps.
- No project flag alone can change another brand's images.
- Unsafe scene JSON must be rejected before image calls.
- First/last caption times and outro stay within the real duration.
- Provider switch changes prompt style, not the existing governed spend boundary.

## Final review amendment

- Step3 illustrated fallback was replaced with a fail-closed private-preview handoff: generating new illustrated assets and then launching SimpleNewsReel would lose AI disclosure. Legacy fallback remains eight images.
- A central persisted-profile check protects all Lambda starter callers independently of current flags. Missing rows or DB errors block new cloud compute. This adds one indexed read to legacy cloud rendering.
- Sentence-shifted anchors are clamped to remain strictly ordered in short transcripts.
- Observed RED/GREEN regressions and remaining activation blockers are recorded in docs/the-prompt-illustrated-adapter-verification-20261018.md.
