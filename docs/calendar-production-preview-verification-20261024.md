# Calendar production preview verification — 2026-10-24

Local implementation of the approved calendar/Atlas continuation. Existing isolated clone and branch reused. No schema change, remote write, grant, run, spend, provider call, push or deployment.

## Behavior

A saved Atlas work block linked to an owned flow exposes “Granska produktionsjobb” above its edit form. GET /api/calendar/production-preview accepts exactly projectId and instanceId UUIDs. The authenticated calendar actor must own the project; ownership is reread, and the instance lookup is constrained to that project. Scope failures, unknown instances and source errors fail closed. All responses are private/no-store.

The pinned vendored monthly-release v2 contract supplies month, theme, language, audience and exact cover/content/closing page split. Unsupported versions, hashes, states and months return no invented brief. Current completion evidence is projected through the existing canonical evaluator, without raw details. Missing evidence waits; failed, stale, unbound or wrong-provenance evidence needs attention.

The view states that it is a preview, reports unknown cost and requires separate execution approval and budget verification. It always returns canStart:false. It neither derives a caller-selectable authorization target nor displays a start action. Work-block time does not schedule generation or publication. Changing the unsaved project/link/responsibility/kind hides the old preview; unmount cancels requests. Session transitions clear the selected panel through the existing calendar session handling.

## Validation

- 80 unit tests passed across 8 suites. Includes 24 new summary/API cases and existing flow-link, status and story-entry regressions.
- 25 browser tests passed against the real calendar UI with synthetic session/API fixtures. Two new tests cover mobile summary, initial failure/retry, saved-versus-draft behavior and cancellation of a late response. Both passed again after moving the preview above the editor.
- Mobile390 screenshot inspected: no horizontal overflow, summary readable within scrolling calendar panel. Screenshot saved in the deliverables directory.
- TypeScript: only the three existing lambda-render errors (missing @remotion/lambda/client; region on unknown at lines50 and90). No errors in changed files.
- Existing Docker-backed calendar access/API suites were attempted but could not initialize because sandbox access to Docker was denied. Their nine cases did not run. These are not the new route tests; all eight new route tests passed. No fixture or database changes were made by that attempt.
- Independent code review found no actionable defects; its requested evidence-status coverage was added.

## Remaining

Purpose-scoped preparation, approval and start through Atlas's Decision/license/execution-grant path remain unfinished. A generic raw-target approval HTTP endpoint is inappropriate. A real cost estimate and budget admission must be tied to that concrete job before approval. Media beyond story text, publication timing, deployment and hosted verification remain separate outstanding work.
