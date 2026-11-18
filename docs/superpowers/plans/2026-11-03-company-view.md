# Företag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver one owner-only company search and contact-history view without business-data mutations.

**Architecture:** A pure projection and identity model consumes strictly read-only paginated contacts, batched timing and existing SCB readers. A separate POST performs ephemeral bounded public discovery through the existing adapter. A client component filters and expands the safe projection; server authorization owns access.

**Tech Stack:** Existing Next 14, React 18, TypeScript, Supabase, Vitest, Playwright; no new dependencies.

**Spec:** docs/superpowers/specs/2026-11-03-company-view-design.md

## Global Constraints

- Exact Handlarbörsen project, owner only; no-store; no raw credentials or mail tokens.
- No writes to contacts, jobs, timing, workers or flags. Do not use sales_read_workspace.
- Contact page size500, cap10000 plus sentinel; timing batches200; existing public query bounds25km/25results.
- No claims of complete dealer coverage, no new subscription, no live provider call in tests.
- Unknown history and snapshot nonmatches cannot confer readiness. No sending controls.

## Review Focus

- Concurrent contact/version changes: mismatched history must disappear behind an explicit gap.
- Same email on two branches: one unique address, two unresolved identities.
- Cross-source provider aliases: one canonical message even when a duplicate links two groups.
- Source failure after successful history: positive observed facts can remain, absence never becomes clearance.
- Mobile filtering and external links: retain source warnings and reject unsafe schemes.

### Task 1: Pure directory projection and read-only source orchestration

**Files:** Create lib/sales/companies/{types,model,read}.ts and lib/qa/sales-companies.test.ts.

**Interfaces:** buildCompanyDirectory(input):CompanyDirectory; searchCompanyDirectory(rows,filters):CompanyRow[]; readCompanyContacts(projectId,fetchPage):ContactsRead; loadCompanyDirectory(deps):Promise<CompanyDirectory>. Fetch functions are injectable and reads return explicit source state.

- [x] Write behavior tests for identity, unique addresses, source gaps, current revisions, event aliases and500+ pagination; run RED.
- [x] Implement minimal projection/read orchestration; run GREEN and related discovery/timing tests.
- [x] Commit coherent data unit.

### Task 2: Owner-only API and source integration

**Files:** Create lib/sales/companies/{api,server}.ts; app/api/sales/companies/route.ts; lib/qa/sales-companies-api.test.ts.

**Interfaces:** createCompaniesApi(deps)(request):Promise<Response>. GET projectId reads directory; POST projectId/query returns ephemeral directory rows, never invokes store/write functions. Server page loader returns denied/unavailable rather than raw errors.

- [x] Write denied project/session/method/invalid query and zero-mutation tests; run RED.
- [x] Implement existing RLS readers, pure timing batches and provider wiring; run GREEN, typecheck.
- [x] Commit coherent API unit.

### Task 3: Företag page, navigation and actual browser behavior

**Files:** Create components/platform/vnext/sales/CompanyDirectory.tsx and CSS module; app/(platform)/projects/[slug]/companies/page.tsx; e2e/sales-companies.spec.ts and fixture. Modify active project Sidebar, Lead Finder link and owner brief where appropriate.

**Interfaces:** CompanyDirectory consumes CompanyDirectory initial projection and projectId; no mutation callbacks. Existing routes remain valid.

- [x] Write browser checks for filters, details, read-only public search, source errors and no unintended POSTs; observe missing view RED.
- [x] Implement responsive view/navigation and run desktop/mobile GREEN.
- [x] Run focused regression tests, TypeScript, whitespace and one independent whole-increment review; fix material findings with regression checks.
- [x] Commit, verify normal fast-forward push to existing Draft PR #386 and update handoff with exact scope/results.

## Execution record

Implemented inline under the existing owner standard. See `../reports/2026-11-03-company-view.md` for RED/GREEN, review fixes and the explicit broad-suite limitation. One coherent final feature commit replaces intermediate commits. No full-suite-green, merge-ready or live-SSR claim.
