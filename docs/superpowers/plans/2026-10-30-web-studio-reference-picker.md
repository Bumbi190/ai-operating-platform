# Studio reference selection and save-only chat

Baseline: 26fd06b, existing linked worktree and Draft PR #368. Masterplan v0.5 remains canonical.

## Delivered behavior

The existing Studio Files panel offers 1-4 unique private reference images in selection order, one comment, and an explicit save action through the shared conversation controller. An authenticated, project/conversation-validated capability response must advertise chat-save availability and supply the current account ID. Both server feature flags remain unchanged/off; this delivery does not activate schema or model dispatch.

Before any save request, retain the immutable text/ticket order/idempotency key in sessionStorage, scoped to authenticated user/project/conversation. If retaining fails, make no request. Unconfirmed attempts lock editing and retry the identical intent after connection loss, navigation or reload. A valid receipt clears the retained intent and inputs and shows the existing not-analyzed notice. Missing/invalid capability leaves the picker hidden. Read-only blocks actions.

An active Studio conversation must exactly match the panel project/conversation and have readable state. Otherwise the private subtree unmounts, including on controller signout before page navigation; reactivation rechecks capability/account identity. All selected images stay visible and removable even if new uploads rotate them outside the 40-item library window. Retained attempts can be restored when the library is empty.

## Implementation

- StudioReferenceMessagePicker: accessible native checkboxes, ordered selection, comment, status/error notices, storage-before-request and immutable retry.
- StudioReferenceUploads: authenticated capability, active-snapshot wrapper, existing upload/library/private image routes reused.
- AtlasBuildSurface: current snapshot and scoped saveReferenceTurn callback wired into existing files panel.
- Tickets GET: advertises explicit save capability and authenticated userId only when save is enabled, private/no-store.
- Localhost Vite/Playwright fixture uses real React components and conversation controller. HTTP endpoints are intercepted synthetic data; Supabase client refuses real access. No new dependencies.

## Verification

- Recovered local picker code and seven browser tests; freshly passed 7/7. Their original RED evidence was not available in this resumed turn.
- Added empty-library and account-isolation browser tests: both observed RED, then GREEN. API account-scope assertion observed RED before server implementation.
- Fresh read-only source review: no Critical findings; two Important findings (signout privacy and invisible selected rows) reproduced RED before fixing. Exact active-scope SSR test also RED before fix.
- Final browser suite: **11/11 PASS**, desktop 1440px and mobile 390px, keyboard, selection order/limit, save receipt, lost-response/reload stable key, storage refusal, project/account/signed-out isolation, empty/rotated library.
- Final relevant Vitest regression: **215/215 PASS in 23 files**. Includes reference assets/routes/UI/controller plus ordinary chat ownership, OpenAI and design-skill behavior.
- Scoped TypeScript checks the changed production/UI/test files, actual AtlasBuildSurface and imported dependency graph. Max heap 1024MiB; no full-app typecheck claim.
- Desktop/mobile fixture screenshots inspected; no horizontal overflow. Blank synthetic 1px image fixtures are intentional, not real reference content.
- Diff checks PASS. No SQL change or new database test run; prior disposable PG17 evidence is separate.
- Browser review-fix run first hit a test harness timeout: uncheck() waited on the intentionally removed off-window input. Replaced action with click plus observable checked-row assertion; no extra production change.

## Known blockers and deferred work

- Broad project command `npm test -- --maxWorkers=1 --minWorkers=1 --bail=1` exits1: `lib/qa/mission-brief-v1.test.ts > Canonical vocabulary > supports all sixteen §20.98 statuses in the public type`; 2 pass/1 fail before fail-fast. Its source and test files are unchanged vs baseline. Full suite is NOT green.
- Inherited Vercel preview for 26fd06b (dpl_AVkL7ejkcqDQpZL3wqWGmzw3BmFe) is ERROR: migration-guard reports unknown migration names in production ledger. Read-only inspected; no guard bypass, schema mutation or redeploy.
- Still no real authenticated Supabase browser E2E, model image analysis, schema activation or release readiness.
- Minor deferred: authoritative receipt lookup/reconciliation and safe abandonment for permanently rejected retained intents. An HTTP404/409 alone cannot rule out an earlier commit whose response was lost; keep same-key retry instead of silently permitting duplicate writes.
- Next: reconcile branch/migration baseline before staging activation; verify authenticated image upload -> message/manifest -> receipt end-to-end in isolated environment; separately add budget-governed vision input, then reference-to-mockup flow.

## Rulings

- Complete the recovered matching local implementation; preserve unrelated work. Cost: original RED evidence for those seven tests is unverified.
- Maintain manual progress in ignored scratch because skill shell scripts are unavailable on this Windows host. Cost: manual bookkeeping.
- Keep unknown-outcome submissions immutable until authoritative reconciliation exists. Cost: a permanently rejected intent currently remains locked.
- Save the verified increment to the existing Draft PR despite unrelated whole-project/preview blockers; do not merge, enable flags or claim readiness. Cost: live Studio use remains blocked.
- Actual production flags, real Auth/Storage browser integration and broader historical architecture remain outside this verification. Cost: explicit integration/release work is still required.
