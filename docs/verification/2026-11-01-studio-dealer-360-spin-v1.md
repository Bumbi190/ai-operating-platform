# Studio dealer 360 spin v1 — verification

Date: 2026-11-01
Branch: codex/atlas-builder-references-20261017
Scope: fictional Demo Motors only; no customer data, production deploy, billing or Handlarbörsen B2B data.

## What changed
- Added a declarative `spin` behavior to the existing static website artifact/runtime contract.
- The control is a bounded `input[type=range]` with 4–36 verified image targets.
- Artifact validation requires an exact max, first frame visible, all other frames hidden, image-only targets and no target overlap with other behaviors.
- The runtime swaps only the selected frame and exposes `aria-valuetext="Vy X av N"`.
- The premium dealer starter now gives the first fictional concept car a 12-angle 360° sequence.
- Copy explicitly says this is a 360° image sequence, not free 3D or a digital twin.

## Asset provenance
Twelve 320×180 frames were rendered from the existing isolated fictional Claude Opus 5.5 + Blender 5.2.2 LTS concept-car proof in:
`%TEMP%\omnira-opus3d-poc-20261030\showroom.blend`

Curated WebP outputs and hashes:
`apps/web/e2e/website-catalog/assets/premium/spin/provenance.json`

The shipped preview bytes are registered as private built-in fictional demo rasters in:
`apps/web/lib/website-build/assets/demo-spin-rasters-v1.json`

No external image URLs or real vehicle identity are used.

## Verification
Focused suite before provenance assertion:
- 6 test files passed
- 119/119 tests passed
- TypeScript `tsc --noEmit`: PASS

Final focused suite after all runtime, contract, provenance and template changes:
- 6 focused test files: 120/120 PASS
- `premium-dealer.test.ts` includes 21/21 PASS with all twelve provenance hashes
- TypeScript `tsc --noEmit`: PASS

Real Chromium QA against a compiled static artifact:
- First vehicle details opened successfully.
- Spin control visible.
- Initial state: frame 1 visible / frame 6 hidden.
- After setting slider to 5: frame 1 hidden / frame 6 visible.
- `aria-valuetext`: `Vy 6 av 12`.
- Browser console/page errors: none.
- Mobile viewport 390×844: spin component measured 314px wide and stayed inside viewport.
- Desktop and mobile screenshots were inspected locally.

Broad `lib/website-build` baseline was also attempted without the isolated PostgreSQL fixture:
- 351 tests passed
- 41 tests reported the same explicit environment/setup refusal: `WEBSITE_BUILD_TEST_DATABASE_NAME` not set
- 108 skipped
These are fixture-required suites and are not evidence of feature regressions. The proper isolated DB suite remains required before PR merge.

## Permanent browser regression gate
The existing real starter pipeline Playwright suite now treats the spin as part of the approved showroom contract:
- 390px, 768px and 1440px browser viewports: PASS.
- Actual plan -> mockup -> model input -> raster resolution -> artifact pipeline: PASS.
- 5 base visual assets + 12 spin frames = 17 governed assets; raw base64 remains absent from model input.
- Spin disclosure, lazy-loaded first frame, frame 9 selection, `aria-valuetext`, catalog filtering and isolated iframe boundary: PASS.
- Model roundtrip still preserves imagery/catalog while changing only the requested accent: PASS.
- Playwright result: 4/4 tests PASS.

## Deliberate limitations
- This is a frame-based 360° viewer, not a GLB/Three.js free camera.
- It is a fictional proof asset, not a real used-car representation.
- No upload pipeline for real dealership 360 imagery is activated.
- No external publishing or customer delivery is authorized by this feature.
