# Company website evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Explicit owner-scoped company website discovery and source evidence, ready for a separately approved credit-consuming Preview activation.
**Architecture:** Refresh SCB legal identity; reuse existing fixed-endpoint Tavily verified adapter with a generic internal query override; project/Preview/new-flag gates; card-local evidence UI.
**Tech Stack:** Existing Next14/TypeScript/React, Vitest and Playwright, no new dependencies or schema.
**Spec:** docs/superpowers/specs/2026-11-04-company-websites-design.md

## Global Constraints

Default disabled, no environment or provider-spend activation. One company, one JE lookup, at most1basic search+1basic extract,25s deadline, no retries/direct site fetches. Owner/project/origin/unpaused and legal-form gates, no contact/extracted-HTML disclosure, no saves/sends or global-budget claims. Same386/base7d9ebc0; preserve all other work.

## Review Focus

- Client-supplied identity text must not become provider queries: JE legal name only.
- A plausible domain/search snippet must not be upgraded into extracted legal identity evidence.
- Different project/CFAR results or a stopped project must never be displayed/queried.
- Request cancellation, failures and source limits must not trigger automatic credit-consuming retries.
- Existing old Tavily car-only pilot behavior and old directory fixtures must remain unchanged.

### Task1: Source evidence and API

Files: create lib/sales/companies/website-types.ts,website.ts,website-api.ts under apps/web; modify existing tavily-research-adapter.ts internal query option; route app/api/sales/companies/website/route.ts and companies/server.ts. Tests QA sales-companies-website.test.ts and sales-companies-website-api.test.ts.
Interfaces: researchCompanyWebsite(orgnr,cfar,deps)->CompanyWebsiteResult; createCompanyWebsiteApi(deps)->Request handler; companyWebsiteResearchConfigured(env)->boolean; directory input/output websiteResearchConfigured optional boolean.
- [x] Write all source/API tests for listed spec gates/evidence/transport/deadline cases; run and observe RED.
- [x] Implement source and API with dependency injection; old adapter defaults untouched.
- [x] Run both suites plus old Tavily/companies API; expect zero failures. Commit together with integrated UI after final review to avoid publishing an incomplete API-only increment (owner continuous-cycle ruling).

### Task2: Integrated card-local UI

Files: create components/platform/vnext/sales/CompanyWebsitePanel.tsx; modify CompanyDirectory.tsx and module CSS, types/model/server metadata; append e2e/sales-companies.spec.ts and model regression as needed.
Consumes website API response; sends only projectId/orgnr/CFAR/confirmation. No input name/private contact data. Produces explicit loading/identity_match/no_match/error/disabled UI with source+time and disclaimer.
- [x] Add desktop/mobile explicit-only, disabled, scope-rejection, failure/no-retry and safe source-link cases; observe RED.
- [x] Integrate panel, legal-id gating, response validation, abort/unmount and source-availability metadata; no state persistence.
- [x] Run affected unit/source/API/model regression suites, tsc and complete company desktop/mobile tests; expect all pass. Inspect screenshots, no horizontal overflow.

### Task3: Review and delivery

- [x] Fresh independent code review of this delta and shared adapter; fix important findings with RED/GREEN tests.
- [ ] Write report with official pricing/contract references, exact tests and unactivated paid-live boundary; validate diff/clean scope.
- [ ] Normal guarded fast-forward commit/push to same PR386, exact-head CI and READY Preview. Do not set environment flags, activate spending or merge production.
- [ ] Browser verify new Preview disabled readiness state without paid calls, update PR/Notion handoff, present concrete activation decision and known account/quota limits.
