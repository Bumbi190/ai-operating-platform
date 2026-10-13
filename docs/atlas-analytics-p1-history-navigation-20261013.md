# P1 history navigation — 2026-10-13

The Omnira Handlarbörsen overview presents its existing saved-analysis destination as a bordered navigation card with “Öppna historiken”. The card explains that the history contains saved analyses and their supporting evidence. It renders in both the report and report-note branches and retains the encoded project-scoped URL.

No history count or empty-state claim is inferred on the overview. The existing history page owns its empty state. This change adds no database query and does not change proposal rules, saving authorization, feature flags or production data.

## Validation

In the isolated readiness worktree:

- `npx vitest run lib/qa/analysis-draft-ui.test.ts lib/qa/handlarborsen-overview.test.ts` — 25/25 pass.
- `npm run typecheck` — pass, including the subsequent cover addition.
- `git diff --check` — pass.
- Targeted `next lint` — unavailable: this checkout has no configured ESLint setup, so the command prompts for configuration and exits. No lint configuration was added.

The card includes keyboard focus styling and stacks its action below its copy at narrow widths. Browser rendering was inspected at 1440 px and 390 px in the isolated cover fixture described in the cover report.

The same readiness branch also includes the requested decorative project-page cover. See `atlas-project-cover-verification-20261013.md` for scope, visual checks and existing baseline test failures.
