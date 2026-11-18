# Controlled First Outreach Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline; one fresh whole-increment review. Continue owned PR #386, no new branch/worktree.

**Goal:** One explicit, exact, history-aware first-message send with durable duplicate/uncertainty protection.
**Architecture:** Separate default-disabled initial authority/queue and v2 envelope; reuse existing receipt-first transport/worker. Existing replies and editorial jobs remain isolated.
**Tech Stack:** Existing Next.js/TypeScript, PostgreSQL and Python stdlib; no new application dependency.
**Spec:** docs/superpowers/specs/2026-11-03-sales-initial-sending-design.md

## Global Constraints
No live migration, policy, worker activation, model call, customer send, merge or production release. Three-channel evidence <=900s, gaps stay gaps. Same owned continuation; no other worktree changed. Native execution already selected by project standard and continuation.

## Review Focus
1. Two keys/tabs/drafts/addresses for one verified entity: one dispatch lineage.
2. New incoming/history/contact/policy/offer races confirmation and dispatch: stale authority refuses.
3. Lost250/receipt or restart: zero further DATA and honest uncertainty.
4. Initial envelope masquerades as reply or carries reply headers: refuse before secrets/network.
5. Stale UI response changes recipient/revision/history: no borrowed acknowledgement.

### Task 1: Authority and real SQL tests
**Files:** CLI-created sales_initial_sending migration; supabase/tests/sales_initial_sending.sql; scripts/test-sales-db.mjs and race runner; additive registry/count inventory.
**Interfaces:** sales_initial_send_{preview,confirm,read,cancel}; worker {claim,heartbeat,begin_dispatch,complete,read_receipt,report_uncertain}. Confirmation pins revision hash, mailbox generation, history/rule/policy version and acceptHistoryGap:boolean; no body/address input. Preview returns version identities, requiresHistoryGapAcceptance, canConfirm, blockedReason and existing job.
- [x] Write SQL fixtures; observe missing-function RED.
- [x] Implement service-only/RLS/invoker authority, exact replay, recipient/entity uniqueness and source fences.
- [x] Real PostgreSQL positive/foreign-owner/no-approval/failed-stale-missing source/gap acknowledgement/changed-source/duplicate/concurrent-dispatch tests; commit.

### Task 2: API, transport and worker
**Files:** lib/sales/initial-sending modules/tests and API routes; workers/sales/sending/transport.py, protocol.py, managed_connection.py, host.py and tests.
**Interfaces:** purpose initial_send; v2 sealed envelope has contact/history/rule identities instead of sourceMessageId. run_send_once unchanged, separate journals/flag.
- [x] Parser/API/v2-exact-envelope/no-reply-headers/no-retry RED tests.
- [x] Implement same-origin owner path, worker project checks and default-off server/local flags. No Atlas send/policy tool.
- [x] Affected web tests and full worker suite plus synthetic accepted/uncertain recovery; commit.

### Task 3: Owner UI and qualification
**Files:** SalesInitialSend.tsx, SalesFirstDraftReviews.tsx, sales-pilot.spec.ts, verification report.
**Interfaces:** separately fetched preview, acknowledgement bound to revision/history/policy, exact confirm input, honest status.
- [x] Browser RED: approval/GET never queue, explicit acknowledgement, source changes clear acceptance, double click one request, mobile overflow.
- [x] Implement; run Sales/browser/typecheck/worker/real SQL integration checks.
- [x] One fresh whole-increment review and one RED-GREEN Important-finding fix pass.
- [x] Normal push only same PR after remote-head check; leave migration unapplied and activation off. Record exact SQL hash/impact/rollback and real CI/Preview limits in Notion.

## Ledger
Preflight: clean owned continuation/head469bec9 matches PR386; review_required finds older Harvey worktree, left untouched. No branch created.
Ruling: separate initial queue/policy avoids forged reply sources and broader reply authority; costs an additive typed queue/migration.
Ruling: trusted entity key is operator-installed, never inferred from free text/model output; wrong provenance can require manual branch/policy correction before activation.

Ruling: implement inline and deliver one atomic code/test/documentation increment in the existing PR, rather than intermediate task commits. Source transfer used SHA-256 guards; unrelated worktrees were not changed.
TDD evidence: SQL/API/worker/API/browser failures observed before implementations; central-timing regression failed before additive integration.
Verification: 822 affected web/security tests; 192 workers; 42 desktop/mobile browser tests; full TypeScript and whitespace pass. Nine real SQL/API/fresh-Python suites passed again with all13 initial-transport modes including rotation after acceptance; exit0.
Whole-increment review: zero Critical, one Important (rendered history identity could lag send-preview identity), one Minor (missing rotateAccepted test mode). Single fix pass binds evidence and acknowledgement to displayed history/rule/contact version and adds the mode. Browser regression reproduced the Important defect then passed with all42. No second independent review is claimed.
Declined-to-judge rulings: live activation/provider delivery are outside development scope; real source completeness and trusted entity provenance need their own operational evidence; reviewer did source review, root executed remote checks.

Release receipt is recorded in PR386/Notion after the ordinary guarded push. No schema application, activation or merge is authorized by this source checklist.

Owner subsequently approved the exact schema-only proposal. Applied once as ledger20261103082558; all15 bodies/ACLs/RLS, immutable trigger and dedup indexes verified. All25 existing Sales-table fingerprints unchanged; new policy/job/event rows0. No new WARN advisor findings. Runtime activation remains outside this approval. See committed schema receipt and current report introduction.
