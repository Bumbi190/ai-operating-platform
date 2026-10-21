# Familje-Stunden — Atlas-first UI + approved source review integration

Date: 2026-10-21. Integration branch only, unapproved production release.

This is the intentional three-file conflict resolution between
Draft PR #448 (Atlas-first social UI with manual November import) and
Draft PR #472 (review-only Atlas content planning and owner source gate).

## Combined UI behavior

- Familje-Stunden with a current approved plan opens "Atlas & innehall"
  instead of exposing every manual form.
- Primary view: concise pending review and upcoming content counters,
  Open Atlas action, and an explicit manual-tools expander.
- Owner's pending monthly public-source decision review card is kept
  **in the primary Atlas view**, not hidden behind manual tools. A full
  original-source/hash/copy review and checkbox is required before the
  owner can approve/reject, and the decision must be re-read from DB.
- Manual Social Content editor, publication controls and scheduling
  views remain available after explicit "Visa manuella verktyg".
- Facebook November text and Instagram illustration idea are local
  unsaved prefill controls, only visible for the pinned current approved
  plan and only inside manual tools. They never generate, attach,
  schedule, approve or publish anything automatically.
- No backend publication, cron, account connection, private subscriber
  file or billing capability was added during integration.
- Other projects keep their existing Social Content default controls.

## Tests

- Full Atlas/Familje-Stunden focused 95/95 Vitest tests passed.
- All 15/15 Social Content Playwright tests passed, including a new
  simultaneous Atlas overview + source decision card test.
- All 6/6 Social Launch Playwright tests passed.
- Local TypeScript only reports the three preexisting Remotion Lambda
  errors in unchanged lib/media/lambda-render.ts; no new integration
  diagnostics. In the pre-integration Draft PR #472 CI, full
  typecheck passed in a clean npm ci environment.
- No production DB access or migrations were performed.

## Release discipline

- Integration merges into **Draft PR #472 branch only**, not main.
- PR #448 stays Draft separately until intentionally superseded/closed.
- Neither feature flag is enabled; owner approval does not grant
  live publication or release access.
- Independent security review and authenticated owner preview remain
  required; run the combined GitHub CI before readiness review.
