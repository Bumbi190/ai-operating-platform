# Calendar workflow link implementation plan

Goal: Persist an owner-scoped link to an existing product planning flow and show its source status.
Spec: ../specs/2026-10-24-calendar-workflow-link-design.md
Architecture: optional draft ID, private read-only validation helper, scoped live projection, existing save path. Never call instantiate, schedule, tick or provider APIs.

- [x] Add failing parser and workflow projection tests covering scope, unavailable/stale definitions and manual-status precedence.
- [x] Add schema/type validation and scoped workflow snapshots/options; preserve existing source wake entries.
- [x] Add editor selection/reset behavior, source status and source link with planning disclosure.
- [x] Add migration and full-history SQL probe; verify cross-project/direct writes and zero workflow mutations.
- [x] Run focused unit and browser suites, full local database replay, record evidence, commit/export locally.
