# Approved Roadster preset — 4 November 2026

Work ID WEB-STUDIO-ROADSTER-PRESET-20261104. Existing owned branch `codex/atlas-builder-references-20261017`, Draft PR #368. Baseline `b30a202c9892ed3b7dba05f846429c8ae22abf9b`. Author review; no independent-agent review claimed.

## Result and scope

The existing Studio Demo Motors catalog now opens the complete approved Roadster presentation instead of the older five-second inline film. Exterior, cabin, rear, scroll-controlled full launch film and darker 3D are packaged in source control as `roadster-showcase-v1`. The owner preview can download a portable ZIP containing HTML, controls, every image, GLB and the exact approved viewer bundle. The same source-owned factory serves the existing fictional public pilot routes.

This is an authored reusable preset, not a new model-writable behavior or a new AI planning starter. The generic artifact compiler, arbitrary script/media/iframe restrictions, current AI starter schema and project export contract are unchanged. Do not report a successful live-provider build from these tests.

## Approved provenance

Source: https://omniraos.se/bilhandlare/bilhall?view=roadster. Owner accepted film v7 and lighting v8 in the conversation. Files were recovered from the retained v8 static release; every source filename hash was checked against its bytes before copying. Durable original receipts remain under `Assets/WebStudio/Roadster-20261103/showroom-v7` and `showroom-v8`.

| Component | SHA-256 | Bytes |
| --- | --- | ---: |
| Complete film, 15.066667 seconds | b403e13ba6fb651ff1c3175c595b6406b3817f4f85bbd00898dbeaf5f171f3bc | 8777131 |
| Model with fixed windshield | 41ea20c154977eeeb5fc3b8aca8e3548a7809b1ba961ba5c0663ae76f9e01b03 | 4984164 |
| Accepted darker 3D runtime | e84a430421555ea19ed69c3fc34258f6591c36012da03da20cdc297193e5dcf5 | 647951 |
| Exterior/poster | b968f8e33cbabf16433f0725eaa34edf7272491dd00e3f3e142b008bbea1ac37 | 243803 |
| Cabin | 7a358ec076403922303114f42ce7a41487d0969a9670207c25b6619c8156da70 | 177923 |
| Rear | e0c9e1c5bf7e3ec68925c8d9d4c56b50c6e2d82b7283bf86950c53cfa9b1d23c | 126026 |
| Showroom background | e31010825ee8a4d3c559300c2d0824b8694616658ac63102e3fbd7b6a95845f4 | 61440 |

Authoritative bundled descriptors: `apps/web/lib/website-build/studio/cinematic-assets/roadster-v1.json`. Previous `roadster.json` and legacy media remain historical files; the active catalog uses v1 above. The approved viewer binary is preserved exactly, including its reviewed lighting and camera profile. No model, image or film was regenerated.

## Runtime and trust boundaries

- Only fixed studio/pilot/export mounts exist. Media reads use an exact descriptor map, never request-to-disk path resolution, and verify SHA and byte count.
- Owner HTML, 3D, media and ZIP retain the existing owner/project-access gate. Public routes expose only these reviewed fictional files, never a project selector, customer media or provider URL.
- Separate CSPs restrict authored page media/frames to the same origin, prohibit form submission and external connections. The 3D frame allows its own GLB and embedded image blobs. Script SRI binds both controls and the accepted viewer.
- Film/model requests start only after their tab is selected. Mobile and reduced-motion views retain explicit playback controls. Desktop scroll reaches the actual final frame, seeks backwards and can switch to normal playback. A labeled keyboard timeline is available.
- Switching tabs releases the previous film source and handlers. Failed video preserves image navigation; failed WebGL displays the approved poster.
- Export is self-contained under a static HTTP server; it needs no API key or provider service. A browser test serves the ZIP under a different URL prefix and loads its real film and model. Opening with file:// is not the supported 3D delivery mode.
- Local browser harness uses an explicit alternate port because the normal test port was occupied. The existing listener was not stopped or reused.

## Verification

Initial local unit checks: 24/24 (Roadster integrity/export/gates and existing cinematic contracts). Initial Roadster browser checks: 8/8 against real bundled film/model, including full launch, reverse, ordinary playback, keyboard controls at 390/1440, rotation, unavailable-media fallback, public paths and portable export. Visual inspection found a hidden timeline label overridden by inherited CSS; fixed explicitly and added an assertion. Full cinematic regression run is recorded below when complete.

No paid generation, provider call, production schema write, main merge, customer contact or live customer release. The approved standalone public deployment is unchanged by this branch. A hosted Preview and exact-commit CI must be checked after push.

## Next acceptance boundary

Use a signed-in Studio session for one attended Nova build and a narrow edit with an explicitly recorded fixed project budget. Reusing this preset in a model-created site requires a separately reviewed planning/compiler integration; the current work does not silently widen that security boundary. Customer delivery and production release remain separate decisions.

## Local completion

- Unit regressions: **87/87** across strict artifact compiler, Roadster preset, cinematic and owner route contracts. Includes a check that the approved GLB has no external buffer/image URI or required Draco decoder.
- Full cinematic Chromium run: **39/39**, 2.4 minutes, one worker. Eight Roadster cases and all 31 existing tour/listing/reel cases passed.
- Screenshots inspected: the actual rotated darker 3D view and 390 px film controls. The mobile header was subsequently tightened to keep the brand on one line; hosted CI will rerun the same browser suite on that final code.
- `git diff --check` passes. No unrelated listener or process was stopped.

## Static release exporter and first hosted check

The existing `export-dealer-showroom.ts` now includes both Roadster documents, all seven pinned media assets, controls and the two model/poster aliases. A fresh export produced **31 unique files / 35 captured URLs**. Each captured payload matched its SHA; references in both Roadster documents resolved inside the exported route map. This exporter is also exercised in Studio CI. No static production release was performed.

The first hosted head `88b6175` reached Vercel Ready, but Studio typecheck caught an implicit `this` type in the test-only WebGL fallback shim. The shim now explicitly declares `this: HTMLCanvasElement`. This was a test typing repair, not a skipped check. Final exact-head results are recorded in the PR and project journal after rerun.
