# Company industries and project context implementation plan

> **For agentic workers:** Use superpowers:executing-plans. The owner's autonomous standard chooses continuous implementation, with one fresh review at completion.

**Goal:** Search several registered industries in any verified owned project without mixing project history or enabling outreach.
**Architecture:** Extend the current directory/query/provider, add a strict owner-project context projection and reload on project navigation.
**Tech Stack:** Existing Next14, React18, TypeScript, Supabase SSR, Vitest and Playwright; no dependencies/migrations.
**Spec:** docs/superpowers/specs/2026-11-04-company-industries-design.md

## Global Constraints
Four exact SNI choices; five reviewed workplaces; 290 municipalities; two source pages/10,000 rows; no contact writes or sending activation. No invented Webbuilder identity. Owner scope before all reads; no cross-project message bodies.

## Review Focus
- Prototype/unknown category values must not select arbitrary API paths.
- Non-HB registered-account snapshot and named pilot context must not leak into another project.
- Category/geography changes must clear old page cursors/results without automatic source calls.
- Foreign/duplicate/oversized project catalogue rows must fail closed.
- Late or mismatched API responses must never place another project's records in this view.

### Task 1: Industry source and validation
Files: companies/industries.ts, query.ts, source.ts, types.ts, api.ts; QA source/query/API tests.
- [x] Add failing allowed-category, invalid-input, raw request-path and municipality-filter tests.
- [x] Observe failures; implement strict industry catalogue and provider mapping; preserve legacy discovery schema.
- [x] Run all company/source tests and commit.

### Task 2: Owner project context
Files: companies/projects.ts, server.ts, model.ts, types.ts, page.tsx; project/model/API QA tests.
- [x] Add failing real-owner project projection, wrong owner/project, generic-project API and non-HB context tests.
- [x] Observe failures; implement strict projection, separate read-only availability and scoped project reader; preserve HB-only readers and source annotations.
- [x] Run tests/typecheck and commit.

### Task 3: UI and final verification
Files: CompanySearchPanel.tsx, CompanyDirectory.tsx, CSS, e2e/sales-companies.spec.ts.
- [x] Add failing desktop/mobile category selection/reset and project navigation tests.
- [x] Observe failures; implement branch selector, project navigation, honest labels and missing-Webbuilder note.
- [x] Run focused regressions, desktop/mobile tests, typecheck and whitespace; fresh reviewer reads increment/spec.
- [x] Fix important findings with red/green tests. Update report, same PR and operational handoff; verify exact-head CI and Preview. Distinguish synthetic tests from live-source proof.

## Execution record
Industry/API/project regressions observed RED then GREEN. UI observed four new failing cases then18/18 passing. Final regression179/179;77 focused tests included. Final TypeScript exit0 including the additional server test. Separate reviewer found no important issue. Browser HTTP401 blocks live verification; no guessed project identity or credential bypass.
