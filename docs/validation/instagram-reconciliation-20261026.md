# Instagram receipt reconciliation — 2026-10-26

Implemented GET-only Instagram IMAGE receipt discovery through the existing owner/operator reconciliation flow. One exact owned-account/caption/time match is required. Any pagination is rejected because the bounded response cannot prove uniqueness. Completion lists again and directly reads the selected media before recording a receipt. Explicit image comparison remains required. Facebook remains available through the existing adapter. No publication retry or provider POST was added.

Validation:
- 58 tests passed: Instagram adapter 9, orchestration 5, existing Facebook adapter 3, API ownership/operator/origin/field-boundary 2, migration guard 39.
- Three Chromium tests passed: Instagram and Facebook image confirmation, ambiguous Instagram result cannot complete.
- Separate TypeScript check passed; production build passed with synthetic local settings (build skips lint and typecheck; typecheck was run separately).
- All 177 recovered historical ledger entries replayed in network-isolated local PostgreSQL, with previously documented clean-install adaptations. Repeat guard canonical probes passed. New Instagram canonical RPC probe exercises approved content -> uncertain -> proof -> confirmed receipt, six unsafe candidate rejections, multiple-candidate refusal, unconfirmed-image refusal, idempotent completion and retained authoritySource metadata. Fixture is rolled back and its container removed. Evidence: instagram-reconciliation-full-replay-20261026.json.
- Independent review found incomplete-pagination uniqueness risk; corrected with fail-closed behavior and regression test.

Limits: no live Meta request, hosted migration, production deployment or receipt update was performed during this implementation. October 23 uncertain attempt remains untouched. Browser tests mock API responses; SQL tests use synthetic assets and do not claim a live scheduled-job propagation test. The existing scheduler-aware completion function and receipt serializer are deliberately not replaced.

Earlier test setup failures were corrected: combined human-story/repeat fixtures reused a synthetic project ID; final run excludes unrelated human-story fixture. Instagram claim-create fixture initially omitted the required capability hash; corrected. Browser test file encoding was corrected to UTF-8. Final results above are the passing reruns.

Primary API contract references: official Meta SDK IGMedia fields/api_get and IGUser get_media:
https://raw.githubusercontent.com/facebook/facebook-python-business-sdk/main/facebook_business/adobjects/igmedia.py
https://raw.githubusercontent.com/facebook/facebook-python-business-sdk/main/facebook_business/adobjects/iguser.py
