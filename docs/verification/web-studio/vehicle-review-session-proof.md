# Vehicle reviewer session binding — 2 November 2026

Scope: existing Draft PR #368 / codex/atlas-builder-references-20261017, continuing base 7bb502d. Unrouted, pre-production code only.

## Implemented
- server-review-audit.ts independently verifies resolveProjectAccess and auth.getUser. Owner scope is copied and the reviewer must separately be assigned to the listing.
- Input is copied before the first await. The receipt is bound to the generated event's project, not caller-mutable submission data.
- Session and current project ownership are rechecked immediately before append and before disclosing a successful receipt.
- session-bound-audit-writer.ts binds reviewerId to that server identity and calls website_review_private.append_pending with 15 typed SQL parameters. No event data is interpolated into SQL.
- The private SQL proposal already rechecks ownership, listing state, current evidence revision and assignment under transaction locks. Its invocation remains server-only; this adapter is not a public Supabase RPC.
- Invalid/ambiguous SQL responses return storage_unavailable without retries or internal error disclosure. A withheld receipt does not roll back a write that already committed.
- No backend is configured by default. Trusted assignment lookup, immutable photo/render evidence loader and parameterized database transport must be supplied by future reviewed server composition.
- Success means review_recorded_not_approved, never approved, verified or publishable.

## Local verification
- RED: missing implementation, then inert server stub produced 20 failures / 21 tests.
- Initial GREEN: 95/95 vehicle-verification tests; test-case table typing corrected to pass each rows array as one named case.
- Independent reviewer identified a real input-alias authorization problem. RED tests reproduced receipt retargeting and photo-array substitution during awaits (2 failures / 23 new tests). Owned input snapshot plus event-bound receipt fixed both.
- Final GREEN: 97/97 tests across all 11 vehicle-verification files, including 23 new session/writer cases; single worker, no model calls, customer data or hosted database access.
- Existing Vite CJS deprecation warning appears in test runner; no failing tests.
- Full web TypeScript initially failed on malformed new test table and five existing model3d-runtime errors from missing locally installed @types/three. Test table fixed; exact pinned @types/three 0.187.0 archive downloaded and SHA512 verified against the existing package-lock before restoring the previously absent ignored dependency directory. No manifest or lockfile changed. Final typecheck result is recorded in the execution ledger.
- Entire platform suite was not rerun: previous documented full run is known red and broad repetition on the resource-constrained desktop is not appropriate to this isolated change. This is not an all-repository-tests-green claim.

## Independent review and disposition
One independent read-only reviewer checked the new adapters, tests, existing contract and SQL proposal.
Important: mutable input could retarget receipt authorization and alter photo comparison after validation. Fixed with two RED-to-GREEN regressions.
Deferred minor test precision: scope-copy test does not independently test project-list copying; auth-denial tests do not independently count assignment/evidence reads. Implementation snapshots scope and gates backend access; these test-strength suggestions remain deferred.

## Limits / next integration
This proves the real audit contract plus new server adapter against mocked external session/project-access and parameterized database boundaries. It does NOT prove an actual authenticated HTTP-to-PostgreSQL roundtrip or real source-photo/GLB matching. A trusted evidence loader, reviewed database bridge, real Auth/SQL integration, source rights and pilot materials remain.

The receipt refresh covers session and ownership. Reviewer assignment is checked atomically at insertion by the proposed SQL; this change does not promise fresh reviewer-assignment checks after commit. Session revocation occurring after the last check is outside this non-atomic Auth/database boundary.

No route, credentials, production schema, bucket, flag, customer image, approval, publication, paid AI, main merge or migration-guard bypass. Hosted preview remains separately blocked by the documented handlarborsen_scb_live_preview_candidates migration-ledger issue; verify exact-head preview separately.
