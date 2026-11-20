# The Prompt V3 – privately mixing local Wan 2.2 clips with the cinematic montage

**20 November 2026 · draft PR #558 · code-only continuation · NOT published.**

## What changed

The FilmCraft-inspired V3 montage was previously image-only when a V3
storyboard was supplied: the optional sceneVideos clips were ignored.
The ordinary legacy hybrid was separate.
This change allows the V3 composition to render an admitted,
canonical project-owned MP4 on one shot per image slot while retaining
the original image on all other shots.

- New pure plan: apps/remotion/src/lib/v3-hybrid-scenes.ts.
- V3 image montage: apps/remotion/src/components/V3ImageMontageBackground.tsx.
- Existing Remotion composition: SimpleNewsReel forwards sceneVideos
  alongside v3Storyboard ONLY when explicitly supplied by a trusted producer.
- Existing owner-only read endpoint can optionally select project-owned MP4
  source UUIDs:
  GET /api/media/v3-private-storyboard/[scriptId]?video_asset_id=UUID&video_asset_id=-&video_asset_id=UUID
  The number of video_asset_id parameters MUST match the number of the
  script's saved images. A dash means intentional still fallback.
  Omitting the entire parameter retains original image-only V3 behavior.

## Authorization and fact safety

1. Operator and project authorization occurs BEFORE reading or signing
   project assets, always scoped to The Prompt's canonical project.
2. The script must be unpublished with ready voice/timing and validated
   project-owned image URLs. Previously published content is blocked.
3. Only canonical media asset UUIDs are accepted: no caller MP4 URL,
   local path, provider action, voice generation or publish toggle.
4. The existing canonical selector verifies project ownership, MP4 type,
   duration, 9:16 metadata, byte size, SHA-256 and safe storage. Private
   links are signed only after all assets are verified. Temporary signed
   URLs are for private previews, never permanent identities or logs.
5. Importing a video or selecting its UUID is NOT proof of source-specific
   editorial suitability. All previews retain editorialHold.required=true;
   selecting an MP4 adds a video_sources_not_checked_against_current_script
   reason, while canGenerate/canPublish/canSchedule remain false.
   No MP4 is attached to the live cron, render/start or publisher.
6. A clip appears ONCE, at its original still's first V3 shot. Later
   repeats of that image use its original still, never a replay of the
   3–4-second AI video. Rate is limited to 0.25–2×; unsuitable durations
   fall back to still. No video extends into the branded 75-frame outro.

## Earlier local evidence and limits

Hultgren's separate local test directory is:
D:\Projekt\The-Prompt\Arbetsyta\LocalVideo\Portrait-V3-20261119

It holds the 416×736 Wan 2.2 processor illustration; the isolated
Remotion folder contains a verified 720×1280 private MP4 test movie.
These are synthetic illustrations, NOT a picture of any actual named
vendor's hardware or evidence for factual news reporting.

The earlier tests proved local decoding and vertical composition.
They did NOT test the new owner API's canonical signed asset selection
nor the new V3 hybrid composition with that signed asset. Hultgren's
Desktop Commander is offline at this checkpoint. No new workstation
render has been claimed.

## Tests and release gate

- New DB-free suite: eight tests in
  apps/remotion/src/lib/v3-hybrid-scenes.node-check.mjs.
- Existing source-free anti-skip contract updated from 78 total / 75
  pass / 3 intentionally skipped, to 86 total / 83 pass / 3 skipped.
- Remotion source build must succeed with OffthreadVideo.
- CI and an owner-authenticated private API test are still required.
- After source-specific assets have been approved against an unpublished
  fact-checked script revision, make a private 9:16 MP4 render on Hultgren.
  Inspect the captions and frames at 0/25/50/75/100 percent.
- Preserve existing ElevenLabs narrator Victoria (eleven_turbo_v2_5)
  from the governed Step 2 voice and timestamps.
- Separate editorial, provenance, budget and publishing tests are
  required before V3 can be considered for production. Existing
  SimpleNewsReel social publication is unaffected.
