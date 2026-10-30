# Calendar responsibility implementation plan

**Goal:** Persist personal versus Atlas planning responsibility without executing work.
**Architecture:** Optional field in the existing owner-scoped calendar draft; existing CAS/idempotent CRUD remains the only write path used by the app.
**Tech stack:** TypeScript, React, PostgreSQL, Vitest, Playwright.
**Spec:** ../specs/2026-10-24-calendar-responsibility-design.md

## Constraints and review focus

Old drafts must remain valid. Private appointments must not carry responsibility. Atlas planning must not grant execution permission or appear as a running flow. Recurrence remains series-scoped. Hosted migration baseline is unresolved; no production changes.

- [x] Add failing parser and browser tests for work-block responsibility and private conversion.
- [x] Extend types, parser, editor state and responsibility display; show scope and planning explanation.
- [x] Add a migration replacing the latest draft validator, preserving recurrence and accepting only the optional enum for work blocks.
- [x] Verify parser/status tests, browser suite and isolated PostgreSQL persistence/ownership/conflict checks.
- [x] Record evidence and remaining deployment limits; commit locally and export patch/bundle.
