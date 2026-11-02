# Cinematic dealership pilot — 2026-11-02

User accepted the selected cinematic dealership reference and a first short transition. Work continues in existing Draft PR #368, branch codex/atlas-builder-references-20261017, base 5c93452 (14/14 GitHub workflows now successful).

## What is implemented
A separate owner-protected /build/demo-motors/cinematic page replaces only the trusted authored showroom's hero. It retains the real compiled catalog, filters, details, demo forms and existing separate GLB/360 functionality. No existing customer-authored artifact/compiler/sandbox policy is expanded.

The new hero contains real HTML text, catalog anchor, motion control, static poster and a paused muted video. Scrolling maps to media time in both directions. Mobile width, coarse primary pointer, reduced motion and Save-Data start in poster mode without requesting MP4; explicit opt-in enables the film. JS/video failure leaves poster and catalog available. Video errors do not trigger a new generation or paid retry.

A private asset route applies the same existing owner-access gate to poster/video/runtime. Exact generated names only; source bytes and SHA256 verified before response. Valid single byte ranges get 206; malformed/unsatisfiable ones get empty 416. Media CSP is added only to this fixed document; existing script hashes/form/connect restrictions remain.

## Media and cost
- Original image: Higgsfield nano_banana_2_1 job 3a820ee0-88e2-4f70-a27c-964666420923, 1.5 credits.
- Single video: kling3_0 job 71441e43-4fd2-4f2f-b8b5-2b293eb64fbb, 5s, standard, 16:9, no sound, 7.5 credits.
- Both completed; image and representative video frames visually inspected. The shot moves toward one fictional blue SUV in an invented Scandinavian forecourt. It is a modest camera dolly, not the entire multi-scene reference reel.
- Balance before 1200 and after 1191 confirms 9-credit difference; no additional generation or purchase.
- Poster WebP: 215304 bytes. Original video 6354637 bytes optimized locally to 1800939 bytes, H264 720p24, six-frame GOP, CRF23, faststart, no audio. SHA256/provenance/prompts stored in cinematic-assets/manifest.json. Two-thread local encoding used an already installed imageio_ffmpeg binary.

## Verification
New asset/route/HTML tests were written before implementation. Missing behavior produced RED. Initial test table expected HTML entities where parse5 correctly serializes raw apostrophes; expectation corrected after observing actual CSP. No CSP weakened to satisfy the test.

55/55 targeted unit cases pass: new cinematic contract (13), existing readonly showroom/route, page query/cost and premium dealer template suites. Full web TypeScript passes. Chromium validates real video timeline seeking forward and backward, catalog filtering, opt-in, errors, mobile layout and JavaScript-disabled fallback.

An overbroad initial studio directory run yielded 56 passing/29 failing cases: api.test.ts, budget.test.ts, loader.test.ts, output-allowance.test.ts and store.test.ts require an isolated SQL fixture (WEBSITE_BUILD_TEST_DATABASE_NAME). This local run did not create that fixture. These 29 failures are not hidden or counted as passing. The existing CI studio-journey job runs its isolated SQL workflow; the new cinematic tests use no database. Full-platform suite not rerun.

Browser harness uses the real compiled authored template, pinned media and runtime, with a local-only server and test server-only marker alias. It does not prove a signed-in hosted Next.js/browser session. Unit route tests mock the access resolver to exercise 401/403/owner outcomes.

## Independent review
One independent read-only reviewer examined source, assets, routes, tests and document scope.
Important: landscape touch phones could auto-load despite width-based mobile handling. Reproduced RED in Chromium; fixed with coarse-pointer guard.
Important: still-mode stage exceeded scene height and overlapped catalog content. Reproduced with a geometric browser assertion; corrected stage-to-scene sizing.
Final outcomes and counts are in the execution ledger.

Deferred minor verification improvements: complete seeked/decoded-frame assertions beyond currentTime checks; template-structure test title should not be interpreted as cryptographic provenance checking. The transformation accepts only trusted server composition in the actual route, not user HTML. Physical iOS/Android and Safari frame smoothness are unverified.

## Delivery limits
Internal fictional pilot, not public sales/customer activation. No production SQL, Handlarborsen data, registration, mail, lead outreach or payment changes. Current Vercel preview has the previously verified independent migration-ledger blocker (handlarborsen_scb_live_preview_candidates and sales_editorial_only_drafts); guard not bypassed. Hosted route/media delivery must be verified after that is reconciled by its own workstream.

New tests are wired into the existing Studio UI workflow including media/runtime path triggers. Exact existing Git ignore pattern build/ hides newly created app route files; only these two explicit source files are force-added to this existing branch. No global ignore rule changed.
