# Harvey Editorial-only Drafts Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Native execution continues the existing owner-authorized PR #386; do not create another branch/PR.

**Goal:** Produce a clearly marked saved human-review draft without claiming complete historical coverage or changing sending permission.

**Architecture:** Add explicit preparationMode=editorial_only to the existing contract, route only that mode to a new guarded RPC, and revalidate its pinned audit throughout the existing worker lifecycle. The ordinary initial and reply/send contracts remain strict.

**Tech Stack:** Existing Next.js/TypeScript, PostgreSQL, Python worker; no application dependencies.

**Spec:** docs/superpowers/specs/2026-11-02-harvey-editorial-only-design.md

## Global Constraints
One existing PR; no production migration/deploy/send; no invented attestations or changed source coverage; owner/project/conversation and snapshot guards preserved; sources no older than current timing rule (900 seconds maximum).

## Review Focus
Cross-project IDs; explicit mode cannot become a default; failed source must differ from honest gap; new reply/contact/history edits fence running jobs; editorial approval never admits an initial revision to reply sending.

## Tasks
- [x] Add failing parser/store tests and real-PostgreSQL acceptance/negative tests, then record the failures.
- [x] Add the CLI-created migration: sales_editorial_contact_review, sales_prepare_editorial_job, a mode branch in sales_timing_assert_snapshot, and marked sales_job_json; revoke browser/public execution on new helpers.
- [x] Extend PrepareSalesInput, parser, store routing, API/Atlas schema and guide; default remains ordinary initial.
- [x] Add a review-only selector and clear labels to existing SalesWorkspace/FirstDraftReviews; editing/review remain exact-version only.
- [x] Run focused tests, existing Sales/worker regressions, real SQL/API lifecycle, TypeScript and diff checks. Review the complete diff in a second pass.
- [ ] Commit/push only to PR #386 after head/state checks. Record actual results and exact unapplied SQL hash/impact/rollback for release review. No live customer model run until the required schema is approved and applied.
