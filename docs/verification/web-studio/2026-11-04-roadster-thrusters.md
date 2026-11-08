# Four rear thrusters in the Roadster 3D preset

Work WEB-STUDIO-THRUSTERS-20261104, reused owned Draft PR368 and existing branch after explicit PR preflight. Author visual/second-pass review, not independent review.

The approved rear photo and film had four fictional thrusters, but the GLB did not. This additive offline edit installs four real mesh instances on the rear bumper. The mouths have graphite titanium housings, recessed dark chambers and restrained blue idle rings. They follow orbit/zoom because they are model geometry, not an image overlay. No firing animation was added to the interactive viewer.

The source body, fixed windshield, textures, shadow geometry and original binary payload are preserved byte-for-byte. Accepted v8 viewer lighting, camera profile and complete v7 film remain unchanged. No provider or paid generation was used.

Reproduce with Python standard library: python scripts/web-studio/roadster-thrusters.py. The script validates the original model SHA before editing and generates roadster-v2-model.glb deterministically. Active manifest/template/export aliases resolve the new hash. The original GLB remains available as historical source.

- Original GLB: 41ea20c154977eeeb5fc3b8aca8e3548a7809b1ba961ba5c0663ae76f9e01b03, 4,984,164 bytes.
- Revised GLB: 9f81d1357bf061968dab5b3f38957e11f51648751651e4e4b54d9d3cb0d1f77f, 5,077,420 bytes.
- Four shared-mesh instances, added payload 93,256 bytes. No external dependency or decoder.

The first rear screenshot exposed body intersections in the inner two chambers. Their depth was corrected; the chamber back walls now sit outside the original body's rear bound. A regression verifies this clearance and preservation of the original meshes, materials and binary payload.

Browser coverage loads the actual GLB, rotates to the rear, and captures a review image. Existing tests exercise pixel changes on rotation, full-film scroll/reverse/normal playback, 390/1440 keyboard/reduced-motion, fallback, public pilot and self-contained exported assets. The screenshot is an author visual check; no claim of automated recognition of four rendered nozzles.

This branch updates the repo-backed preview. The separate standalone omniraos.se static release is not changed by a branch push. No merge or production site promotion.

## Local result

14/14 focused unit and migration-receipt checks pass. Full cinematic Chromium regression passes 40/40 in 2.9 minutes, one worker. The final rear screenshot was inspected: all four mouths are visible without body intersections. Re-running the offline generator reproduces the exact revised hash. git diff --check passes. Hosted CI/preview results are recorded in PR368 and the project journal after push.
