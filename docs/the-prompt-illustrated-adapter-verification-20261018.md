# The Prompt illustrated adapter — verification, 18 October 2026

## Outcome and scope

Owner's accepted v2 visual direction now has a reusable, story-timed private-preview camera planner and a project-specific illustration brief in the existing governed Ideogram path. This is preparation for fresh daily videos, not activation of the seven-day experiment.

The new profile requires all three explicit env conditions and the actual The Prompt UUID. Step2 checks persisted source/project/original publication time before row claims, failure counters or paid providers. It saves the illustration profile with the existing strict voice receipt. The pure preview adapter takes an explicit ai_illustrated treatment; ordinary editorial photos do not gain an AI label.

Existing governed text/image provider, project context, image tier, spend idempotency and retry/stop boundaries are retained. Exactly three complete, distinct scene briefs are required before image dispatch. No real Ideogram/voice calls were made to validate the new prompt in this pass.

## Final review and decisions

Fresh-context reviewer review_illustrated_adapter reviewed this delta against 2dbf2a8 and found two material issues; no other material findings were reported.

- Fixed P1: new illustrations could enter the undisclosed SimpleNewsReel Lambda path. A saved pilot_image_profile is now held by step3 before claims, even with flags OFF. The central Lambda starter re-reads persisted provenance and rejects illustrated scripts, missing rows or DB errors before importing the provider or dispatching compute. This covers manual, autonomous and retry cloud callers as well as step3.
- Fixed P2: sentence snapping could produce repeated scene anchors for a short ten-word transcript with five images. The fallback anchor is now clamped after the preceding anchor.
- Both findings have observed failing regression tests followed by passing tests. Saved-profile handoff: prior result step3_failed / unexpected Lambda dispatch became illustrated_preview_required / zero dispatches. Short-story camera regression: non-monotonic timeline became strictly increasing.

Ruling: keep the new profile on the disclosed private preview path rather than adding it to a production composition in this change. Production release, rights and exact-output approval remain separate work. Cost if wrong: another adapter/release change is required before live use.

Ruling: re-check raw_output centrally at every Lambda start so a later flag change cannot erase image provenance. Legacy composition selection remains unchanged, but a missing script or unavailable DB now blocks new cloud rendering. Cost: one extra indexed script lookup per cloud render and temporary inability to launch during DB failure.

No minor findings were deferred. No merge, deployment, env/cron changes, production DB writes, social posts or live experiment activation were performed.

## Verification

- Complete Remotion Node/tsx suite: 110/110 PASS, zero failures/skips.
- Editorial-lab and news-preview isolation contracts: PASS.
- Real transpiled generator integration tests stub external gateways only: exact project/execution attribution and fixed image tier retained; malformed plans dispatch no images; dispatch-stop exceptions propagate without an internal second batch.
- Real transpiled step2/step3 route tests: stale sources refuse before claims/counters/provider calls; saved illustration provenance refuses legacy rendering with flags OFF.
- Real transpiled central Lambda starter: illustrated/missing/error cases dispatch zero; ordinary saved row retains its legacy render result.
- Full web TypeScript: PASS. Extended web regression suite: 273/273 PASS across eight files, serial run with 20-second test/hook timeouts.

The first extended web run returned 271/273 passing, with two unrelated legacy Atlas page-import tests hitting their 5-second timeout while full TypeScript was running. The serial rerun with a 20-second test/hook timeout passed all 273 tests; no product behavior was changed to mask those timeouts.

## Actual encoded QA

The automatic planner was used with the same private Replit narration, word timings and three approved local images, with no manually entered Replit cut times. Actual export: H.264/AAC, 720 x 1280, 22.357333 seconds, 7,149,121 bytes. Full video/audio decode and encoded frames at 2/10/17/21 seconds passed inspection for illustration visibility, English captions, persistent AI disclosure and FOLLOW THE PROMPT outro.

Private QA master: C:\Users\Andre\Projects\Omnira\Design\ThePrompt-EditorialPreview-20261017\replit-automatic-illustrated-qa-20261018.mp4
SHA-256: c7a180de2bc6241a1af8c5c02171e1acff3db23c83d9eea8a50a16e0f8821c36

This internal export does not replace the owner's accepted delivered v2 movie or make the old Replit story new. Original article publication: 16 October 2026 12:55 UTC; 48-hour cutoff: 18 October 12:55 UTC / 14:55 Stockholm.

## Remaining live blockers

- Real Ideogram output quality must be checked on a fresh, verified source: approved sample used built-in image_gen, not Ideogram. Similar prompt wording does not prove similar output.
- Trusted server-bound original-source, visual/usage-rights and voice receipts, plus exact encoded-output release approval.
- Disclosed production composition, controlled release, budget/idempotency/rollback integration; private preview output is not publishing authority.
- DST-safe 10/20 Stockholm schedule, reviewed metric snapshot migration and prospective per-platform equal-age 24h/72h capture.
- Standalone local render/upload tools are not a pilot release path. Do not use them to bypass the private-preview handoff.
- Current production publishing health was not fully audited. Read-only Supabase inspection found latest 17 October morning/evening records ready/published in the existing composition; no production state was changed.

The seven-day trial is NOT STARTED.
