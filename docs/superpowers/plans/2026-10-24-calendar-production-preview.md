# Calendar Production Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Review the existing story job from a saved calendar flow link.

**Architecture:** Session-authenticated, owner-scoped GET with a canonical v2 projection; a separate client component renders the summary in the existing event panel.

**Tech Stack:** Existing Next.js, TypeScript, React, Vitest and Playwright.

**Spec:** ../specs/2026-10-24-calendar-production-preview-design.md

## Global Constraints

- Read-only; no grants, runs, provider requests, scheduling or migrations.
- Owner/session scope and private/no-store responses; exact canonical definition.
- Preserve saved-versus-draft distinction and existing calendar status.

## Review Focus

- Foreign instance/project and ownership drift: generic not-found.
- v1, unknown hash or unknown month: no invented story contract.
- Source failure: error/retry; no stale successful result.
- Unsaved link switch and late responses: hide/abort the old preview.
- Unknown cost and unverified execution readiness: no success/start claim.

### Task 1: Owner-scoped production summary and GET

Files: lib/calendar/production-preview.ts, production-preview-api.ts and matching tests; app/api/calendar/production-preview/route.ts.

Interface: readCalendarProductionPreview(db, actor, {projectId,instanceId}) returns a JSON-safe preview with brief, checks and planning-only restrictions. Route accepts exactly these two UUID query parameters.

- [x] Write and run failing tests for canonical brief and owner/instance scope, stale hashes, current evidence and GET validation.
- [x] Implement only reads and existing canonical/evidence helpers.
- [x] Run focused tests and inspect imports for mutation/provider paths.

### Task 2: Review UI

Files: components/calendar/CalendarProductionPreview.tsx, CalendarEventPanel.tsx, e2e/calendar.spec.ts.

- [x] Add browser regression for summary, mobile sizing, retry and changed-link concealment.
- [x] Add explicit review button, cancelable GET, clear loading/error states and accessible summary. Show only for the persisted selected link matching the current form.
- [x] Run browser suite, relevant calendar unit suites and TypeScript; record existing unrelated failures separately.
- [x] Independent review, fix findings, record verification, commit and export patch.
