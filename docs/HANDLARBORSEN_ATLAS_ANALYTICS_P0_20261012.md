# Atlas Analytics P0: evidence and proposals

Implemented locally in the isolated `codex/omnira-atlas-analytics-p0-20261012`
worktree. This is code completion, not deployment or production verification.

`deriveHandlarborsenInsights(report, now)` consumes the existing validated
`MarketplaceReport`. Its closed rules are versioned `handlarborsen-insights-1.0.0`:
quality notice; registered/verified status review with the closed-company caveat;
separate total/rolling24h bid observations and a manual next check for zero; and
published stock change only between consecutive observed UTC dates with known
counts. Zero is known; null/missing is unknown. No interpolation, conversion,
demand or causal inference. Partial permits known levels with quality attached;
stale (>26h), unavailable or failed collection audit permits only quality notices.
Unknown audit is explicitly unknown. UTC dates must match observation timestamps.

Every insight carries its rule, version, priority, full report quality and exact
metric evidence: source, project, actual value, observation/capture time, snapshot
reference/date, schema, completeness and UTC window. Stock windows are point
observations. Rolling-window coverage and historical collector version are unknown
because the existing report does not preserve verification of them. IDs encode
the rule and evidence, retaining identity within a freshness category; no storage
or deduplication workflow is created.

The server-rendered `HandlarborsenInsights` panel sits after Marknadspuls inside
`HandlarborsenOverview`, behind the existing project and report authorization gate.
It reuses the same report prop and shows at most three insights with expandable
evidence, quality, source and rule version. Existing KPIs, graphs, Marknadspuls and
traffic remain composed as before. Invalid/unavailable reports do not render the
panel. Review checks are text, never executable controls. The server composition
supplies the clock; the pure engine has no ambient clock.

P0 adds no fetch, database read/write, provider, LLM, action, dependency or scheduler.
No workflow automation, approvals or persistence are activated. Focused fixtures
cover semantic and quality boundaries; page tests cover inaccessible, mismatched,
refused and invalid reports, shared report identity and unchanged read counts.
The existing fake database test checks that derivation adds no storage requests.
Deployment and any external verification remain separate orchestrator steps.

Local verification: web `npm run typecheck --workspace=apps/web` PASS (exit 0).
Installed Prettier check for the new engine, panel, CSS, tests and this document
PASS (exit 0).
Focused Vitest command FAIL at startup (exit 1): esbuild cannot read an ancestor
directory under the managed sandbox; no test results were produced. Scoped
`next lint --file ...` FAIL before linting (exit 1): no ESLint configuration exists,
so Next requested interactive setup. No configuration or safety gate was changed.
Git status/diff also remain unavailable due to the sandbox ownership check;
the worktree HEAD file identifies the requested branch. Browser preview and
screen-reader checks have not been run; deployment is outside this task.
