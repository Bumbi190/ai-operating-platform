# The Prompt – editorial quality pilot (2026-10-17)

**Owner feedback:** Creative lab previews rejected as too basic; The Prompt targets an English-speaking audience. Keep the currently working **two ordinary daily news releases at 10:00 and 20:00 Europe/Stockholm** while the new design is reviewed. Do not connect the new creative lab to automatic publishing, and do not reuse the Swedish creative ad preset.

## Verified production findings (read-only)

- Real Supabase project `AI Operating Platform` has The Prompt / `ai-media-automation` and 282 records with `status=published` since May 25; 58 in the prior 30 days. Publisher destinations presently include Instagram/Facebook and older YouTube paths.
- `media_insights` stores **one historical snapshot per video/platform**. Latest collection 2026-10-16. Snapshot totals (different ages, not fair 24h comparisons): Instagram 11,804 views over 280 videos (~42/video); Facebook 66,447 over 274 (~243/video); YouTube 7,959 over 168 (~47/video). This is evidence of low engagement, not proof of one specific algorithmic cause. Instagram has very sparse positive engagement in these snapshots.
- On 2026-10-17 the morning script was created 07:20 UTC, voice ready 07:25, render started 07:30 UTC (`video_status=rendering` at 09:38 Stockholm), with the existing step4/publish schedule at 07:45/08:00 UTC.
- `cron.job` includes `omnira_step1_morning` at 07:20 UTC, step2 07:25, step3 07:30, step4 07:45 and publish 08:00. Evening equivalent is 17:20/17:25/17:30/17:45/18:00 UTC. **Important DST issue:** after Sweden's switch from CEST to CET on 2026-10-25, fixed 08:00/18:00 UTC triggers would correspond to **09:00/19:00** Sweden, not intended 10:00/20:00. Correct this in a separate reviewed scheduling patch with explicit Europe/Stockholm handling; do not hot-edit active crons in this preview PR.
- Current production auto videos are generated using `SimpleNewsReel` with voice and mainly a small set of AI-generated still images, cross-fades and Ken Burns zoom. It is **not** the independent `ThePromptContentLab` concept (which showed Swedish marketing copy and generic geometry, no integrated voice); do not confuse their publish statuses.
- Quality grading today largely checks the script (not a human-reviewed finished video); the current `quality.ts` returns permissive scores on parse error. A true visual/editorial delivery gate should be evaluated separately without silently blocking today's two daily posts.

## Implemented in draft creative lab only

Branch `codex/the-prompt-creative-v2-20261017` from main, changes only to Remotion creative preview:

- New `ThePromptEditorialLab.tsx` 9:16, 12 seconds, four animated beats: **signal / context / impact / follow**. English-only on-screen copy. Distinct vertical typographic hierarchy, progress marker, staggered scene movement, dynamic information cards, safe-area footer with mandatory `CONCEPT PREVIEW / NOT FOR POSTING`.
- `headline`, `context`, `takeaway`, `sourceName`, and up to three already-approved image URLs passed as props. A blank demo has generic **concept copy**, not fabricated or verified news. No model API, social account, publishing route, provider payments or credentials called.
- `ThePromptContentLab` now points to the English experimental composition. `FamiljeStundenContentLab` and both production compositions (`SimpleNewsReel`, `ShortFormVideo`) remain wired as before.
- Visual QA: real Remotion Chrome renders of frames 35, 135, 225, and 323 passed, stored ONLY in the local worktree `apps/remotion/.qa-output/` (not committed or posted). Targeted TypeScript for the new composition passes. `node tests/editorial-lab-contract.mjs` passes and verifies preview is isolated from release.
- The remotion application's **full TypeScript compile is historically red for unrelated files** (webcodecs conflicting types, Root default prop interface, old SubtitleTrack and render.ts types). Those existing errors must not be described as introduced or fixed by this prototype. Targeted component check passes.

## Definition of a video good enough to show the owner

1. **Fact-checked real news, actual visuals:** 2–4 story-specific, licensed/approved images or actual demonstrable screenshots, not generic fake UI/news graphics. Pass correct image rights, source attribution, and fact verification.
2. **English throughout:** native-sounding English voiceover, captions verified against the voice, full spelling/semantic review of headlines and final CTA, no Swedish words in post-facing content.
3. **Engagement-focused editing:** promise/payoff in the first 1–2 seconds, rapid explanatory context, visually differentiated beats with meaningful movement or cuts (not 3 near-static panels). No exaggerated / unsupported claims. Real motion graphics and legible 9:16 mobile safe areas.
4. **Editorial QA:** inspect real full video with sound and captions, not just stills; check visual/audio mix, hook, facts, pacing and readability; **explicit owner approval required** for new creative pilot. The concept as committed is not approvable yet; it is a technical starting point only.
5. **Measurement:** leave 10/20 schedule fixed and compare outcomes for creative variants after equal 24h/72h observation windows, using views, watch/retention where obtainable, saves, shares, comments, profile visits and followers gained. Keep a content ledger containing version/format/hook/topic/timestamp/account and original source. Do not change the production flow until the creative and billing gates pass.

## Next isolated implementation

Create a production-adjacent **preview-only v2 news composition** that consumes genuine selected `media_scripts` story fields plus licensed images/voice and validated captions, then generate two reviewed examples for A/B evaluation. After approval, gate release by existing project credentials, immutable exact output, publish idempotency and budget controls. Review and correct the DST scheduling separately **before Oct 25** so actual Swedish wall-clock times remain 10:00/20:00.

**No current production video re-render, autopublish, cron, database writes, new channel tokens, bills or Familje-Stunden creative changes are part of this branch.**
