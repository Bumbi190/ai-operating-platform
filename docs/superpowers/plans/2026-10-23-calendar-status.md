# Calendar status implementation plan

Goal: show the agreed status colors and actionable calendar attention entries.
Architecture: pure source-aware projection, reused by event rendering and a
week-local attention component. Existing authorization/read sources unchanged.
Stack: existing TypeScript, React, CSS modules, Vitest and Playwright.
Spec: docs/superpowers/specs/2026-10-23-calendar-status-design.md.

- [x] Write and run failing behavioral tests for status, uncertain publication,
  unscheduled proposals, cancellation, unknown states and attention deduplication.
- [x] Implement projection, dots, source responsibility labels and attention list.
- [x] Verify rendered status meaning and browser navigation at mobile/desktop.
- [x] Review diff, record limitations and commit locally without deployment.

Do not add mutation/notification transports, label unverified publication green,
change scheduling permissions or infer delegation from an unapproved proposal.
