# Approved amber dealership design — implementation

> Execute inline in the existing owned PR #368 worktree with test-first changes and final visual review. Baseline d3a03db85be18fae5554f7a204a775a6cbe1cfcf. User approved the generated premium mockup and asked to continue.

**Goal:** Turn the approved dark/amber showroom composition into a real responsive, clickable static preview, retaining catalogue/filter/detail/test-form behavior. Not a screenshot masquerading as a site.
**Spec:** Notion Web Studio v0.6 (40a7b977c5b88101aae3c22c8c78b714), F01–F06 and approved mockup `DEMO_MOTORS_APPROVED_AMBER_2026-10-31.png` SHA256 b9af8a93fd090bacd499bad965eac72c10c93263506bf291d322c289f5dd2433.
**Architecture:** Pure reusable production template `templates/premium-dealer.ts` consumes bounded catalogue data plus provided raster assets; returns the existing WebsiteDraft. Existing compiler, validated filter behavior and sandbox stay unchanged. The existing catalogue acceptance fixture calls this template; it is not proof of autonomous Atlas generation.
**Approaches/ruling:** A full screenshot with click overlays would lose responsive text and semantics, so reject it. New paid generations and 3D models require a separate budget; reuse only photo regions of the approved generated source for this stage. Source was transferred through the existing Higgsfield media upload helper (no generation job), downloaded to the desktop and verified by SHA256. Earlier Drive/Adobe transfer attempts failed; no successful writes there.

## Global constraints
- No new packages, model generations, paid API calls, customer data, public deployment, push, merge or flags.
- One already approved hero crop + four car illustrations. Four images are reused across eight synthetic rows; label them as AI illustrations, not eight unique photographs of actual cars.
- Keep catalogue IDs, facts and filter counts (3 electric/3 hybrid/2 petrol) unchanged. Keep forms inert and truthfully labelled. No fake 360-degree control, booking delivery or 3D claim.
- Only raster data URLs in exported HTML; no external requests or fonts. Compiler byte limit unchanged.
- Amber tokens, full-width scene, real selectable text/CTA, four/two/one-column responsive grid, visible focus, reduced motion and mobile usability.

## Tasks
- [x] Save source provenance/crop recipe; create five compressed WebP assets in existing catalogue assets/premium. Verify geometry, hashes, image-only crop regions and bounds.
- [x] Write new template contract and browser assertions first. Observe failures for missing template/design. Contract: eight cards, real body text, four distinct card rasters, no fake 360, preserved behavior/IDs, reject unsafe metadata/assets/theme and compile below 1MiB.
- [x] Implement reusable typed template and style module. Replace only existing fixture rendering with template call; no business API or approval change.
- [x] Browser tests at 390/768/1440: existing seven interaction/security/export tests plus mobile/desktop design checks, image decode, natural readable text, four desktop columns, no overflow, reduced-motion, correct forms and image provenance notes.
- [x] Inspect real screenshots against approved mockup; fix significant issues and retest. Run full web TypeScript, targeted regressions, reference-browser tests and broad npm test with known baseline failure reported.
- [ ] Manual second-pass review (not independent reviewer). Local commit only; export new preview beside preserved functional version, update handoff and Notion with exact scope, tests and known limits.

## Ledger
Preflight reuse_existing, clean worktree, no other owned-task process. Retain original mockup separately from production assets. Existing generated image is only a design/illustration source, not a geometry source or real vehicle evidence.

## Verified execution
- 192/192 focused regression cases; 10/10 real Chromium catalogue/appearance tests at390/768/1440; 18/18 reference-browser cases; complete web TypeScript exit0; workflow YAML and diff checks passed.
- Actual desktop/mobile screenshots inspected against approved mockup. Restored two exact form-copy strings after unchanged browser tests caught regressions.
- New image-only crops retain original hash/provenance; no generation was invoked. Old catalogue rows and behavior/ID binding remain.
- Manual second-pass review only; no independent reviewer. Broad npm test --bail=1 remains red on unchanged mission-brief-v1 status-list assertion.
- Local commit/export/Notion completion is recorded with the exact final SHA in the external handoff; no push/production authority inferred.
