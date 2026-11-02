# Premium Showroom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Continue same existing Draft PR368; no new branch.

**Goal:** Replace the visually rejected one-shot hero with a coherent premium cinematic tour and documented delivery economics.
**Architecture:** Three authored film chapters with reviewed high-resolution keyframes, a pinned locally served silent movie, genuine playback plus optional scroll scrubbing, and the existing compiled catalog. Retain all owner/CSP/integrity/range boundaries.
**Tech Stack:** Existing Next14/TS, parse5, fixed JS runtime, Higgsfield GPTImage2.5 high2k/Kling3Pro, existing imageio_ffmpeg/sharp, Vitest/Chromium.
**Spec:** Main Notion WebStudio plan40a7b977-c5b8-8101-aae3-c22c8c78b714, latest four-stage proposal accepted by owner's continuation and explicit quality/credit authorization; design companion docs/superpowers/specs/2026-11-02-premium-showroom-design.md.

## Global Constraints
- Reuse worktree atlas-builder-references-20261017, base8a137379075df2a82bc6ffa9e7a08a38fba2dd6f; DraftPR368 only.
- First-pass quote4images*2.75 +3five-second Pro clips*8.75 =37.25credits. Executor limit100 existingcredits including deliberate reviewed retries; no new purchases/subscriptions; no unlimited choices invented. Starting balance1191.
- Fictional marketing only; existing GLB is a different concept, never presented as exact SUV twin.
- Reduced-motion, coarse pointer, mobile and SaveData zero MP4 requests until explicit opt-in.
- No production/DB/flags/outreach changes; protected preview only.
- Margin figures are scenario assumptions, exVAT, contribution after delivery allowance, not net profit or validated market pricing.

## Review Focus
- A tap on Play must actually advance decoded video frames, with pause/resume and end behavior.
- Scroll seeks decoded frames both directions; copy and chapter controls track the film, including keyboard range.
- Mobile/reduced/save-data and failed media keep a usable page without download before choice.
- Switching playback/scroll/static must preserve an understandable position and keep the catalog reachable.
- Source media quality, continuous car identity and copied generated-media bytes must be reviewed independently of green functional tests.

## Task1: Complete premium media and tour
Files: cinematic-assets/{hero.webp,showroom.mp4,manifest.json}; cinematic-demo.ts; cinematic-runtime.ts; cinematic-demo.test.ts; e2e/website-cinematic/cinematic.spec.ts; next.config.mjs only if packaging evidence requires.
- [ ] Generate4keyframes high2k using the previous original image as reference; inspect all. Quote/render3silent5sProclips from approved frames, preserve job/credit history, inspect beginnings/middles/ends. No blind retries.
- [ ] Write failing browser assertions: real Play advances decoded frames without scroll; pause holds currentTime; three chapter states and range seek; explicit mobile opt-in; reduced-motion stop; final CTA/filter reachable.
- [ ] Observe RED against existing pilot.
- [ ] Implement three-chapter HTML composition, Play/Pause button, separately named scroll control, chapter buttons and accessible range. Use loadeddata readiness; handle failed play promise honestly. Never autoplay on mobile.
- [ ] Composite clips into one master with intentional editorial exterior->interior transition; optimize1080pH264, faststart, bounded keyframe interval, no audio, <=16MiB. Pin SHA/bytes and provenance. Preserve previous pilot IDs/history.
- [ ] Run full affected route/asset units, cinematic real Chromium suite, TypeScript; inspect actual desktop/mobile/chapters screenshots.
- [ ] Independent whole-delta review, fix Important findings with RED/GREEN, commit/push samePR, inspect exact-head CI/Preview and report host-auth verification limit honestly.

## Task2: Delivery economics
File: docs/verification/web-studio/2026-11-02-premium-delivery-economics.md.
- [ ] Record exact provider quotes, final consumed balance, Plus official list49USD/1000credit (not owner's80USDreceipt), planning FX10SEK/USD and stressed budget0.08USD/credit.
- [ ] Calculate media cost including rejected attempts, labor at500SEK/h,20percent rework contingency, integration/QA allowance and first-month support; avoid counting allocated subscription credits twice in overhead.
- [ ] Show14900/24900/39900SEK revenue scenarios and hours sensitivity; distinguish customer facts/inventory fidelity and ongoing service costs from fictional portfolio demo.
- [ ] Validate arithmetic with independent calculation; persist in repo and update main Notion plan with results.

## Ledger
Preflight existing clean branch/head confirmed. Latest owner instruction expands prior9credit-only pilot; the previous pause on extra generation is superseded within this new bounded build.
Native execution continues the existing established workflow. Media/browser quality acceptance remains separate from CI. Current hosted signed-in view is blocked by Vercel auth in the control browser.

## Execution checkpoint
- Generated and reviewed five high-resolution image candidates; four selected, one interior rejected and corrected. Original three Kling Pro jobs remain queued and unselected. Three separate completed Wan1080p candidates provide the delivered edit. Exact provider quotes and observed balance1191→1093 reconcile98credits, within100.
- RED observed for four new interaction cases against the old runtime and for the three independently reproduced control regressions. Final repaired-master Chromium suite15/15;19scoped unit cases; full webTypeScript exit0. Additional mobile framing checks passed after CSS adjustment.
- Independent visual/encoding review found mid-opening ghosting and yuv444p output. Excluded the ghosted source interval and used an explicit wide-to-close cut; forced output yuv420p/High100 and verified actual bytes by full FFmpeg decode. Actual MP4 header duration12.625s is pinned.
- Movie12,902,015bytes and poster365,274bytes with renewed hashes; owner gates/CSP/ranges preserved. Next14 config schema and asset include-glob resolution checked. This is not authenticated hosted playback evidence.
- Economics arithmetic independently verified, Swedish working model persisted. Production14h is an assumption; at24,900SEK the10,230SEK delivery allowance leaves58.9percent contribution, before other overhead/tax.
- Same branch/DraftPR368 only. Commit/push and exact-head CI/Preview are the remaining execution step at this checkpoint; use the PR's current check results and main Notion ledger for subsequent hosted status. Owner visual acceptance and physical mobile/Safari validation remain open.
