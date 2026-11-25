# Intelligence Graph – Model activity, 25 November 2026

## Scope
This release extends the EXISTING `/intelligence/graph` Live Operations view. It does not create another dashboard. The collapsed "Registrerad modellanvändning" panel displays authenticated, project-scoped recorded model and provider calls, their SEK costs, timestamps and project focus. The run inspector distinguishes **configured agent model** from a model actually recorded for a specific run.

## Provenance and limitations
- Source: `cost_events` with `project_id`, `run_id`, `provider`, `model`, `cost_sek`, `created_at`, and `metadata`. The server enforces the project's existing allowlist.
- A run association is shown only when `cost_events.run_id` matches a visible run belonging to the same authorized project. No inferred model-to-run, model-to-agent or cross-project link is fabricated.
- The pulse means a model has a verified link to a run currently recorded as running at snapshot time; it is not evidence of a live provider request. Reduced motion disables animation.
- Attribution-only `metadata.attribution_only=true` entries are excluded from call counts. Prices are **recorded ledger amounts**, not AWS/Vercel invoiced or reconciled totals.
- Events are fetched with deterministic `created_at`/ID ordering, 500 rows per page, up to 5,000 plus overflow detection. A truncated or interrupted read is labeled partial; a missing source is unavailable rather than zero.
- Read-only database verification on Nov 25 showed 17 recorded model cost entries in 24 hours, zero with run IDs. Thus current data can show models and registered cost, not reliable model-to-run animation for those entries.
- No model calls, new database tables, RLS changes, billing integrations, workflow starts or budget approvals were added.

## Verification
- Focused tests cover the 1,601-row pagination case, incomplete pages, attribution-only rows, project isolation, per-run costs, graph contract and component rendering.
- TypeScript passed. Isolated synthetic browser QA passed at 1440, 390 and 320 px, project selection, unavailable/partial conditions and reduced motion; no horizontal page overflow.
- Nine previously failing tests in `vnext-intelligence-graph.test.ts` also fail in the unchanged comparison branch. They are not claimed as passing.
- Actual authenticated preview rendering still requires verification after the ONE approved preview deployment; Vercel build readiness alone does not prove the end-to-end page.

## Release constraints
Keep PR #656 (the redundant Control Center draft) separate. Do not merge this work into production or start autonomous activity. Preview on one isolated branch after final QA and source alignment. Reconcile model-to-run instrumentation at the original cost-recording boundary in a later reviewed implementation; do not invent historical relationships.
