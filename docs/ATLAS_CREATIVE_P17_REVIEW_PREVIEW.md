# Atlas Creative P17 — operator-owned, read-only enrollment review preview

Date: 2026-10-21
Branch: `feat/atlas-creative-p17-review-ui`
Parent: P16 Draft PR #479

## Goal

A *foundation* for the Swedish Omnira registration review screen,
with no live buttons, writes, activation or API route.

The view can only be projected after server-controlled proof of:

1. The existing **`resolvePlatformOperator`** authenticated Supabase-session
   operator identity (not HTTP body or a model-generated operator flag).
2. An actual P13 row with state `pending_review`, exact canonical project
   UUID list and 64-character SHA-256 key/proof evidence.
3. The corresponding `projects` database rows **all** have `owner_id`
   matching the authenticated operator user ID, exactly one row per project.
   A partial result, duplicate, foreign owner, missing record or malformed
   project list is refused, never shown.

## Files

- `apps/web/lib/media/creative-queue/review-preview.mjs`:
  pure fail-closed reader with mandatory injected operator and project store,
  producing an immutable, public-safe preview only.
- `review-preview.d.mts`: explicit TypeScript contract. Flags for review
  submission, worker identity activation, execution and publication are
  literal `false`, not configurable UI props.
- `review-preview-server.ts`: server-only adapter importing
  `resolvePlatformOperator` and `createAdminClient`; fetches exact P13
  state and verifies ownership against the existing `projects.owner_id`.
  No route imports or invokes this adapter yet.
- `components/creative/CreativeEnrollmentReviewPreview.tsx`: Swedish
  presentational review preview, renders only enrolled worker ID, canonical
  project UUIDs and safe public key/proof SHA-256 digests. Approve/reject
  buttons are **disabled**, with no onClick, form submit or fetch.
- `scripts/creative-tools/review-preview.test.mjs`: rejects absent
  operator, incorrect project ownership, partial/duplicate ownership
  rows, malformed UUIDs, stale P13 status and unexpected proof hashes.

## Security limits

No live Next.js route or page; the component is not mounted anywhere. No
production HTTP endpoint, operator decision button, privileged mutation,
Supabase migration, key-enrollment or Windows worker activation is created.
The UI cannot transition an enrollment beyond `pending_review`.

Operator role and project ownership are *necessary* but NOT sufficient for
a production approval. Before wiring buttons: reviewed same-origin/CSRF-safe
HTTP boundary, explicit per-decision operator confirmation, exact preview
fingerprint comparison and independent key verification, immutable SQL
decision log (P15), session operator and project authorization, and safe
revocation must all be proved.

The preview display is **not** a source of authorization for SQL writes.

Do not enable `omnira-media-worker`, allow autonomous creative editing,
merge any parent Draft PR or apply the P13/P15 migrations to production on
the basis of this preview.

## Verification

**103/103 local creative Node tests passed**, including 7 new P17
preview-reader and inert UI checks. **36/36 sequential PGlite database tests
passed** from the inherited P7–P15 test suite. Total 139/139 local checks
passed in the P17 worktree. These database tests do not exercise P17's UI.

The full Next.js build/typecheck and a live Supabase staging integration
have not been performed in this worktree; the P17 wrapper will need those
before any route is exposed. Earlier PG17 P16 tests cover P15 SQL
concurrency, not the new P17 UI.
