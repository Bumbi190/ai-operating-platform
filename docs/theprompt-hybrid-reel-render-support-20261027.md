# The Prompt — hybrid reel renderer (27 October 2026)

**Scope: local code only. No production deploy, paid generation, database changes or social scheduling.**

## Implemented in this isolated branch

- `SimpleNewsReel` accepts optional, index-aligned `sceneVideos` with HTTPS source and source-frame duration. Every video must already be admitted to **the correct project-owned asset store** by a future vetted ingestion step. The renderer itself does **not** certify an asset's ownership merely because an HTTPS URL is present.
- The existing `images` array remains mandatory for editorial fallback. With no `sceneVideos`, original still-image visuals, continuous Ken Burns zoom, crossfades, voice, captions, watermark and outro remain unchanged.
- Video metadata is checked deterministically: image/video alignment, absolute HTTPS source, bounded positive source duration, valid total timeline and playback rate within 0.25–2. Invalid/missing video is treated as **still-image mode for that scene** without initiating any provider call. The planner never loops or replays video clips.
- A valid MP4 is rendered muted at a constant scene-fitting playback rate via Remotion `OffthreadVideo`; the original image remains beneath it. A broken video decode still fails the render instead of silently publishing an incomplete video.
- The web-side `buildVideoInputProps` forwards optional `sceneVideos` when a future **server-owned** producer provides them. The existing `render/start` route does not load MP4 assets yet and has not been modified.

## Local evidence on Hultgren

- `node --experimental-strip-types --test apps/remotion/src/lib/hybrid-scenes.node-check.mjs`: **8/8 PASS** before integrating.
- `node --experimental-strip-types --test apps/web/lib/media/video-props-hybrid.node-check.mjs`: **2/2 PASS** for legacy image-only props and explicit video props. Combined tests: **10/10 PASS**.
- TypeScript `transpileModule` syntax diagnostics: PASS for 4 changed/new TypeScript/TSX source files. This is **syntax**, not a full project typecheck or rendered video proof.
- `git diff --check`: clean (after patch completion).

## Hold before enabling or releasing

1. Keep `HIGGSFIELD_PAID_VIDEO_ENABLED` OFF. PR #552 is a **separate draft** for the shared 5 kr/day allowance and requires independently reviewed, coordinated SQL/source release. Never bypass the live migration guard.
2. Build a strictly scoped Higgsfield producer with live quote, durable **pre-dispatch budget reservation**, one authorized provider dispatch, durable usage/reconciliation receipt and no retries on uncertain outcomes. Today's read-only Higgsfield client deliberately has no generate capability.
3. Validate and ingest the returned MP4 to a canonical project-owned asset and record content hash, ownership and rights metadata. Only the canonical, verified asset URL may be placed in `sceneVideos`.
4. Connect the server-side saved asset to `render/start` with project ownership checked before render, then complete one **offline full Remotion render** using already-approved footage. Verify audio, captions, first-frame motion, no loop, no undesirable logos and mobile 9:16 layout.
5. Independently review, then activate a small bounded production trial with old still-image reel fallback and separate human review of the first post. Existing schedules remain untouched until explicit production rollout.

**Cost note:** The conservative allowance maps one Higgsfield credit to at least one SEK and currently allows only one quoted 4-credit clip per Swedish day; it does not cap provider subscription charges or Auto-Refill. Two full AI-video reels per day therefore cannot be promised under this policy. Still-image fallback remains the default.
