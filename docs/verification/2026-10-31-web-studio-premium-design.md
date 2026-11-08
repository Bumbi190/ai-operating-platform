# Approved amber dealership — local implementation and verification

Date: 2026-10-31. Existing PR #368 worktree `atlas-builder-references-20261017`; baseline `d3a03db85be18fae5554f7a204a775a6cbe1cfcf`. Local continuation of the approved mockup and Notion Web Studio v0.6. No push/merge/deployment implied.

## What changed
`templates/premium-dealer.ts` and `premium-dealer-style.ts` implement a reusable, typed static WebsiteDraft template. They use actual semantic HTML, supplied raster images, a fixed responsive style vocabulary and the existing bounded catalogue behavior. The existing static compiler and opaque preview sandbox are unchanged. The acceptance fixture now calls this template rather than embedding its own design.

Desktop: full-width showroom scene, readable HTML headline, warm amber theme, separate navigation/CTA and four-column catalogue. Tablet/mobile: two/one catalogue columns, stacked hero image, visible focus and reduced-motion alternative. Existing eight sample cars, prices, IDs and drivetrain counts stay unchanged. Details and disconnected test forms still bind to the selected car. No fake 360-degree control or claim that a request was delivered.

Only the acceptance fixture currently invokes this reusable template. Its mere existence does NOT prove automatic selection or generation through Atlas chat, production integration, customer publishing or a new end-to-end model run.

## Assets and provenance
The user-approved generated mockup was transferred through the connected Higgsfield media-upload helper only, then downloaded to the desktop and verified with SHA256. No generation job was submitted. Earlier upload attempts through other connectors did not establish successful storage and are not claimed as delivered.
Source retained in Omnira/Design/references/web-studio/DEMO_MOTORS_APPROVED_AMBER_2026-10-31.png, SHA256 `b9af8a93fd090bacd499bad965eac72c10c93263506bf291d322c289f5dd2433`, 1672x941.
Five image-only regions were cropped and compressed: one showroom hero and four vehicle illustrations. Exact rectangles, dimensions and hashes are in assets/premium/provenance.json. They exclude screenshot navigation, copy, buttons and the nonfunctional 360 control. All text/controls in the output are real HTML, not screenshot overlays.
Four car illustrations are intentionally reused across eight fictional rows. They are not eight newly generated assets, actual vehicle photographs, or geometry for interactive 3D. Card-source resolution is only about330x140; separately approved high-resolution assets and visual/rights review remain necessary for production sales material.

## Verification
- Test-first new contract suite initially failed because the template module was absent. The new browser acceptance tests failed at all three widths on the previous mint theme rather than approved amber.
- New template suite: 18 cases for real composition/data/imagery, source hashes, compiler budget, escaping and rejected unsafe inputs. With existing catalogue/compiler tests: 98/98 passed.
- Final focused regression run: **192/192 tests in14 files passed**, including planning/reference/compiler/chat-route contracts.
- Final Chromium catalogue suite: **10/10 passed** at390/768/1440. Includes filter/reset/empty state, keyboard focus, correct read-only car identity, disconnected test submit with no network request, independent catalogues, parent/cookie/network isolation, disk export, colour-only revision, image decoding, responsive grid and reduced-motion behavior.
- Existing reference-browser regression: **18/18 passed**.
- Full web TypeScript: **passed, exit0**.
- Workflow YAML parsed with the already installed js-yaml; no package installation. Existing workflow has template path and test coverage prepared locally, not remotely run.
- Broad project command `npm test -- --bail=1 --maxWorkers=1 --minWorkers=1`: exit1 at the unchanged `lib/qa/mission-brief-v1.test.ts:384` public-status-list assertion, 2passed/1failed before stopping. No all-repository-green claim.

The first browser iteration caught two exact-copy regressions: the selected-car separator and the submit-button dash. Restored production markup to the existing accepted strings; tests were not weakened. Actual desktop/mobile screenshots were inspected against the approved direction. The earlier image-only mockup is not represented as a browser screenshot.

## Evidence and reproduction
Task evidence: `.superpowers/sdd/2026-10-31-web-studio-premium-design/` contains preflight, RED logs, final192-case log, ten-case browser log/screenshots, existing reference-browser log and typecheck/broad logs. Exported artifacts are emitted by the existing fixture server under `.superpowers/sdd/2026-10-31-web-studio-catalog-preview/preview/` and copied to a separate stable premium-preview folder, preserving the prior functional export.

Run from apps/web with installed dependencies:
- `node ../../node_modules/vitest/vitest.mjs run lib/website-build/templates lib/website-build/catalog-filter.test.ts lib/website-build/artifact.test.ts --maxWorkers=1 --minWorkers=1`
- `node ../../node_modules/@playwright/test/cli.js test --config playwright.website-catalog.config.ts`
- `node ../../node_modules/@playwright/test/cli.js test --config playwright.reference-picker.config.ts`
- `node ../../node_modules/typescript/bin/tsc --noEmit --incremental false`

## Review and remaining scope
Manual second-pass review checked escaping, literal image/style restrictions, unique IDs, preserved form bindings, immutable data, asset provenance and compiler/sandbox reuse. No independent reviewer or security certification is claimed.
No new model/image/video/3D generation, paid inference, package, customer data, hosted schema, production flag or public release. No automatic Atlas template invocation, real inquiry delivery, booking, payment, inventory integration, 360 photo-spin or interactive 3D was enabled. The accepted next milestone is connecting this visual direction and supplied assets to the controlled Atlas build/review flow, not claiming that a manual template demonstrates autonomous generation.
