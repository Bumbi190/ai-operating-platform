# B3 reply preparation qualification

Approved implementation start: André2026-10-18 06:01 Europe/Stockholm, continuing the concrete B3 plan. Base f28f83f1f49831fff3315f154f96df4af9da0bdd. The existing active B2 client/server, six headers and empty body selection remain unchanged. No B3 production DDL, model job, SMTP operation or sender permission is activated.

## Task1 — durable contracts

SQL tests first failed42883 for missing reply RPCs. Actual reply-only Vitest configuration then failed on missing store/validate modules; the initial default config had excluded the directory and was not valid RED. Added the replies-only include to the ordinary web test command. Windows generated migration20261018040242_sales_reply_preparation.sql; its CLI held the empty file until the verified ownCLI process was stopped. Two raw baseline attempts with the extra empty file were invalid and are retained separately; no guard bypass.

The real PostgreSQL fixture proves selected complete text, exact shared-address branch, contacted history acceptance, owner/foreign refusal, source/contact/config fences, canonical review and stale approval refusal, new immutable draft revision, invalidated previous editorial decision, newer sender-mail signal, cancelled-job behavior and three service-only RLS tables/invoker RPCs. Revoked-worker preparation was observed RED(expected55000 gotSUCCESS), then fixed and reverified. Concurrent three identical requests create one job; fifteen simultaneous reservations accept exactly ten and refuse five. Completion binds an attempt ID and returns an immutable replay receipt.

Windows Task1 final SQL and concurrency runner PASS. Scoped Vitest175/175 including18 new reply tests,27 migration-guard,76 schema-security,1 sales-migration and53 platform-authority tests PASS; typecheck0. Proposed registry159 includes3 staged live=false rows, last observed live catalog156. Canonical138/enforced124, frozen14/30 unchanged; actual B3 migration not yet applied.

Fresh broad base:15013 total/13276pass/403fail/1330pending. All previous401 failed identities remain. Two explicit extras: platform-authority-closure.test.ts :: A6-2 unauthenticated legacy bug digest timeout5000ms (later full53/53 passed without timeout/source change); sales-migration.test.ts :: canonical count still pinned134/120 after the prior exact live-schema reconciliation137/123 (reproduced, now updated to138/124 and new reply enforced-presence assertion; PASS). This is not a green whole repository. Final current/baseline identity comparison remains Task4 work; raw counts and identities are preserved in the plan workspace.

Task1 contract rulings: fixed read_receipt and completion attemptId for uncertain execution; explicit cancel and canonical approval trigger preserve human review/old-version refusal; immutable explicitly selected offer remains bound rather than inferring a global latest offer across different12/6/2-month tiers. NewerIncoming conservatively means another saved message from the same sender/mailbox arriving after job creation; it neither proves a thread nor silently changes model input.

## Remaining

Task2 specialist/worker API, Task3 Atlas/UI and Task4 real integration/broad comparison/one independent whole-increment review remain. First real model trial needs one explicitly selected complete message, verified branch/history/email and offer, plus review of its exact provider/input bounds. Contacts currently0 and selected bodies0, so no real reply trial or relevance proof can yet be claimed.
