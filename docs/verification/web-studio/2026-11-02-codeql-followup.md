# Web Studio CodeQL follow-up — 2 November 2026

Scope: repair three PR #368 CodeQL findings without changing the approved fictional cinematic dealership preview or enabling production. Base 88166f55c84498a42bef9c479ed29334c93e764c. Same worktree/branch/Draft PR.

## Evidence and root causes

All 14 ordinary Actions workflows passed on base, but a separate GitHub Advanced Security CodeQL check125350833007 failed with three annotations. Successful analysis execution is not a clean security result. Analysis2077940146 examined synthetic merge3bef0c50cde9819f10f5ba1c9f43754cfe72c5b9; SARIF confirms actual data flows:
- js/xss-through-dom: DOM JSON config -> resolver -> asset.poster -> img.src. The resolver validated paths but returned the caller's object. Existing string paths were constrained; changing accessors/alias mutation could bypass the validation/use contract. Capture primitive values once, validate types/path, encode only filename segments under fixed assets/3d/, return frozen owned copy.
- js/file-system-race: allowance regular() lstat(path) followed by readFileSync(path), reopening whatever occupied that name. Open once, inspect fstat on the descriptor, reject mismatching/symlink/nonregular named entries, read that descriptor with maximum+1 bound, close in finally. O_NOFOLLOW/O_NONBLOCK are used where supported; Windows fallback tested. This local owner allowance remains supplementary and does not defend against a malicious account controlling the whole directory or grant billing/native execution authority.
- js/client-side-request-forgery: browser test forwarded location.search into fetch. Read fixture state with Playwright page.request against literal http://127.0.0.1:54392/api/website-build/studio; reject unexpected page origins and allowlist query keys as structured URLSearchParams. BrowserContext cookies remain shared.

Four regression cases observed RED before implementation, GREEN afterward: detached asset alias, changing poster getter, replacement after metadata inspection, growth after descriptor inspection. Existing synthetic allowance checks remain intact.

## Pinned runtime

Rebuilt source with existing esbuild0.28.0: bundle=true, format=esm, platform=browser, target=es2020, minify=true, legalComments=none. Updated runtime binary, typed metadata and artifact expectation together. Added exact -text Git attribute to prevent CRLF conversion of hashed bytes.
New SHA256653da4edf27bd493853dc724767544ecb9f3932e874f4a96a3ee57d90ea32595,646228 bytes.

## Verification

-20/20 Node allowance tests.
-95/95 affected Vitest cases across artifact, runtime, preview assets/routes and demo/cinematic routes.
-Full web TypeScript exit0.
-5/5 real Chromium GLB/export/srcdoc/fallback tests.
-7/7 real Chromium cinematic scroll/reverse, mobile, reduced-motion, Save-Data and failure tests.
-Existing Vite CJS deprecation warning remains.
-Independent read-only security review requested; result and isolated Studio SQL journey below.
-The earlier broad Studio directory run had56passing/29failing cases due missing isolated SQL fixture in api,budget,loader,output-allowance,store. No full-platform-green claim.

## Hosted preview

Latest base Vercel deployment dpl_CXhaQ6MLF5qtHvZNSKvLkTxLPUhF failed BEFORE Next build: production migration ledger contains handlarborsen_scb_live_preview_candidates and sales_editorial_only_drafts unknown on this branch. No bypass, production/schema edits, new credits or customer outreach. Hosted preview is not usable merely because local browser checks pass.

Independent read-only review: no Critical, Important or Minor findings in this delta; independently reran20/20 allowance tests on Windows Node22.22.3, optional flags undefined. Scope ruling: malicious directory owner, parent-directory replacement and arbitrary mutation of opened files are excluded from this supplementary local-only allowance; no stronger security claim is made. Final pinned runtime,95units,TypeScript and12browser checks independently verified by executor.

Broader local Studio journey: initial preflight stopped at <2GiB available, no resources started. After TypeScript completed, a fresh isolated PostgreSQL run bootstrapped successfully but stopped at the390px showroom journey with ECONNRESET in new pooled page.request readState after a worker idle step (1failed,24notrun). Owned SQL container removed; receipt d2c2e36d-eee7-4d49-b74c-93376622fc35 cleaned=true. Corrected helper to fresh API context per read with in-memory browser storageState, literal fixture baseURL, connection:close and no retry, dispose finally. Retry was resource-gated (<2GiB), no resources started. Final full journey remains for Linux CI; do not claim it passed locally.
