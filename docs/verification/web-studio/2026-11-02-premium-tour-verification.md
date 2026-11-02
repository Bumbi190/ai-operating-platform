# Premium showroom: implementation verification
Date: 2 November 2026. Existing Draft PR #368, branch codex/atlas-builder-references-20261017, base 8a137379075df2a82bc6ffa9e7a08a38fba2dd6f.

## What this change delivers
The rejected five-second one-shot pilot is replaced by a three-chapter 1080p film and separate Play/Pause and scroll controls. Chapters select actual movie positions: Hallen at 0s, Bilen at 5s, Interiören at 9s. The existing compiled eight-car fictional inventory, filtering and test-only inquiry flow are retained.

This is a pre-rendered fictional marketing concept with HTML controls. It is not a freely navigable 3D showroom, a real dealer's stock, or an exact vehicle digital twin. The existing separate GLB does not become this SUV's model.

## Asset evidence
- Poster: original approved high-resolution keyframe, resized to 2048×1152 WebP, 365,274 bytes. SHA-256 52a0d9fe30e62bde49fb5cb7eb12bc30baed405522d927fbcc9c3638143fdc8a.
- Canonical movie: 1920×1080, 24fps, H.264 High profile100, actual decoded yuv420p, silent, faststart index before media data, maximum keyframe interval6. 12,902,015 bytes. SHA-256 aacb55af0698294c941ba0e59ae12ef3d86993b818c4a7e0bcb0f1393813ef6c.
- Duration read from the actual MP4 movie header: 12.625 seconds, rather than a sum-of-shots estimate.
- Full FFmpeg decode returned exit0 and no error output. Native source clips are 1920×1080 at30fps, respectively5/4/4 seconds; no upscale to claim native resolution.
- Movie stays below the existing16MiB integrity ceiling. Poster stays below512KiB.
- Manifest records all selected job IDs and source byte hashes, the rejected interior and correction, pending unselected Kling jobs, previous9-credit pilot history and this stage's98-credit expenditure.
- Existing owner gate, private/no-store responses, same-origin CSP, byte hashes, single-range206 support and invalid-range416 behavior remain enforced.
- Next14 experimental.outputFileTracingIncludes explicitly includes only the poster and MP4 for the protected cinematic asset route. Installed Next14 schema and its actual picomatch/glob resolution were checked. This is packaging evidence, not a hosted authenticated playback check.

## Visual review and repair
Source beginnings, middles and ends and the assembled chapter views were inspected. The first interior was rejected for ambiguous driving-side composition; its replacement and selected cabin film clearly place the wheel on the left. The exterior join around5s is coherent.

Independent review identified a double-exposed roofline/trees in the opening source's middle. The source interval1.25–3.75s is excluded from the delivered edit. Clean0–1.25s and3.75–5s are each retimed at half speed, creating an explicit editorial cut at2.5s. The opening is therefore an edited wide-to-close sequence; it is not claimed to be an uninterrupted camera flight. Re-extracted frames at1.5,2.4,2.5,2.6 and3.5s were inspected after the repair.

An intentional0.35s editorial dissolve enters the invented cabin at8.65s. The chapter button selects9s after that dissolve. There is no claim that the camera physically passes through a real car door.

The initial composite also became yuv444p through the transition filter. Final output explicitly forces yuv420p and High profile; actual encoded bytes were checked after the repair. Chromium software playback alone was not treated as proof of that format.

Desktop chapter screenshots and mobile poster framing were reviewed. This preserves a widescreen film and crops it for portrait viewing; a separately filmed portrait campaign is not included.

## Functional evidence
The complete cinematic Chromium suite passed15/15 after the repaired master was pinned. It exercises decoded-frame changes forward/backward under scroll, actual mobile Play and Pause, chapters and keyboard timeline, zero initial MP4 requests for mobile/coarse-pointer/reduced-motion/SaveData, failed requests and play rejection, no-JavaScript inventory, catalog filtering and inventory CTA.

Independent review found three control defects, each reproduced with failing tests before repair: stopping scroll halfway lost the viewport, keyboard-focused range stopped tracking playback, and landscape-touch controls fell below the viewport. Their regressions passed after repair. Short portrait geometry also passed.

The19 affected cinematic/demo-route/read-only unit cases passed. Full repository TypeScript check with --noEmit --incremental false returned0. The larger unrelated platform suite is not claimed green. The large ranged-byte assertion now uses Buffer.equals to preserve exact equality without expensive recursive traversal of a13MB payload.

Browser tests use real Chromium against the local authored compiler/media harness. They do not establish physical-device Safari/Android decoder or network performance, and they do not establish a signed-in hosted session.

## Cost and remaining acceptance
Observed Higgsfield balance1191→1093 reconciles98credits, including unused queued jobs and the rejected image. No credits were purchased or subscription changed. Detailed assumptions and contribution sensitivity are in 2026-11-02-premium-delivery-economics.md.

The previous Vercel deployment was READY but the control browser reached its sign-in wall. The new exact-head deployment and CI must be recorded after push. Authenticated hosted playback and the owner's visual acceptance remain open; green tests do not close either item. No main merge, production database change, customer publication or paid subscription change is part of this work.
