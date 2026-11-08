# Cinematic dealership preview pilot

> Use superpowers:executing-plans. Continue existing PR #368; do not create a new branch.

Goal: give car dealers a fictional sales preview with a scroll-controlled original dealership film and the existing working catalog.
Approved direction: user selected Instagram DfK1fpCyWDs and accepted the proposal for a first short transition from forecourt to one car. Existing Notion Web Studio plan, section "Visuell referens – scrollstyrd bilhall", is the design source. This is a bounded prototype, not production or a real dealer website.

## Design and decisions
- Reuse the existing authored Demo Motors page/catalog, compiler and 3D fallback.
- Add a separate protected /build/demo-motors/cinematic variant. The current demo remains available.
- Replace only its hero with a full-height, sticky scene and real HTML copy, catalog link, motion toggle and fictional-media label.
- Use one original Higgsfield image and one 5s silent clip: image quote 1.5 + video quote 7.5 = 9 credits. No retries or additional generation in this pilot without a new decision. Existing 1200-credit balance; no new purchase.
- Initially render a real poster. On ordinary connections scroll seeks a muted, paused local video. Reduced motion, Save-Data, JS failure or video failure retain a usable poster. The catalog stays reachable by a normal anchor.
- Keep media and a vetted authored runtime behind the same owner gate. Exact named SHA-verified assets only; support byte ranges for video seeking.
- Add media-src self ONLY to this fixed authored demo's CSP. Preserve existing script hashes, model/runtime rules, form-action none and other protections. Never change compiler/sandbox or user-generated artifact policy.
- Image/clip are fictional marketing imagery; not photos or exact twins of any listed car.
- No Handlarborsen DB, CRM, mail, registration, public link/production activation or hosted SQL.

## Alternatives considered
Selected: short pre-rendered video for cinematic scroll, existing GLB for free rotation.
Image sequence remains a fallback if measured seeking is poor; do not preload a large decoded sequence.
New real-time 3D scene is deferred: unnecessary for the approved first camera-transition test.

## Files
- New studio/cinematic-runtime.ts: fixed browser behavior.
- New studio/cinematic-demo.ts: transform only the authored hero using parse5; leave catalog behaviors intact.
- New studio/cinematic-assets.ts + cinematic-assets/manifest.json and generated poster/video: pinned local asset reader and range responder.
- New protected cinematic/route.ts and cinematic/assets/[name]/route.ts.
- Unit tests for preserved catalog/CSP, unknown assets, byte/hash validation, 401/403 and ranges.
- Local Playwright harness/tests for real forward/back scroll, motion controls, reduced-motion no-video-request, video-failure poster, mobile layout and catalog filtering.

## Task 1: Media, typed assets, authored hero/runtime and protected routes
1. Generate one image, inspect, generate one 5s video from that frame. Record job IDs, prompts, quotes and SHA256.
2. Write tests first and observe missing behavior fail.
3. Implement fixed assets/ranges and authored hero/runtime; retain existing catalog and 3D.
4. Run unit tests, full web TypeScript and actual Chromium checks.
5. Independent review of delta; fix Important findings with reproducing tests.
6. Commit/push same draft PR, document actual CI and hosted-preview blocker in Notion.

## Acceptance / review focus
- Unauthenticated/no-project requests never disclose HTML, media or runtime.
- No arbitrary file or generated script loads; corrupt bytes fail closed.
- Scroll reverses the real clip, does not autoplay, and works at 390 and 1440px.
- Reduced motion and Save-Data make zero MP4 requests until explicit opt-in.
- Failed decode/metadata retains poster and catalog navigation.
- Existing filters, details/test forms and truth labels remain intact.
- Report generation quality separately from functional success; do not promise car identity fidelity.

## Ledger
Preflight: same clean linked worktree, branch codex/atlas-builder-references-20261017, HEAD 5c93452. Its 14 workflows now all pass. Existing draft PR owns this scope; no new branch/PR.
Ruling: follow the user's already accepted cinematic direction and bounded first-transition prototype, without reopening visual selection. Cost if wrong: the owner may prefer another shot and this pilot can be replaced.
Ruling: verify the complete affected demo suites and web TypeScript, not repeat the huge previously red platform suite on a RAM-constrained desktop. Cost if wrong: unrelated platform regressions can remain unseen.
Media image job: 3a820ee0-88e2-4f70-a27c-964666420923, nano_banana_2_1, 1.5 credits quoted, completed and visually inspected.
Media video job: 71441e43-4fd2-4f2f-b8b5-2b293eb64fbb, kling3_0 std 16:9 5s sound off, 7.5 credits quoted, submitted once.

Task 1: complete locally. One image and one video completed; balance 1200 ->1191 (9 credits). Pinned poster215304bytes/video1800939bytes, video optimized from6354637bytes using existing local encoder, no new package.
Independent review: landscape touch auto-fetch reproduced RED and fixed by coarse-pointer opt-in; still-stage overlap reproduced RED (952.5 bottom vs884.97 scene) and fixed by matching stage height. Final7/7 Chromium checks,55/55 targeted units and full web TypeScript PASS. Actual desktop/mobile screenshots inspected. Workflow YAML parses.
Final: minor (deferred): decoded-frame/seeked assertions beyond currentTime and more precise template-structure test-title wording. Helper provenance is trusted server composition, not structural validation.
Initial broader directory run:56pass/29fail across studio api,budget,loader,output-allowance,store; missing WEBSITE_BUILD_TEST_DATABASE_NAME isolated SQL fixture. No all-platform-green claim.
Preflight receipt returned review_required with Creative Tools#450 metadata candidate and same local WebStudio branch; actual file scope confirms reuse PR368 for authored website demo, no branch/PR created. Two new route files match historical build/ ignore rule; force-add only exact reviewed source paths.
CI now includes cinematic media/runtime path triggers, new13unitcases and7browsercases. Hosted preview remains separately gated; no production activation.
