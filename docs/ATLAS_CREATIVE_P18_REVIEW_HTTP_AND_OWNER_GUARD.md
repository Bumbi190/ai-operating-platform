# Atlas Creative P18 — guarded creative review HTTP contract + atomic owner proof

Date: 2026-10-21
Branch: `feat/atlas-creative-p18-review-http`
Parent: P17 Draft PR #480

## Completed code (not deployed)

The review decision surface is a **pure, dependency-injected HTTP contract**,
not a deployed Next.js endpoint. `CREATIVE_REVIEW_HTTP_LIVE=false`; no file
under `app/api` imports the handler. P17's Swedish approve/reject buttons
remain disabled.

`review-http.mjs` refuses any request unless all requirements pass:

- POST to exactly `/api/atlas/creative/enrollments/review`;
- `Origin` equals the **server-configured** HTTPS origin (loopback HTTP
  only permitted for local tests); rejects cross-site `Sec-Fetch-Site`;
- JSON content type, strict 2 KiB body limit, fatal UTF-8 validation;
- required custom review header, allowlisted request fields ONLY;
- an explicit, decision-specific Swedish confirmation phrase;
- independently resolved `resolvePlatformOperator` session identity;
- **every** project UUID in the requested scope is owned by that principal;
- P15 status and signed key/proof SHA verification rechecked in the database.

The server wrapper `review-http-server.ts` requires the explicit
`CREATIVE_REVIEW_CANONICAL_ORIGIN` setting, the existing server-only
Supabase admin client, and the existing operator identity resolver.
It is inert until an independently reviewed route explicitly imports it.
No client has a way to set the trusted operator identity or the server
database dependencies.

## P18 DB hardening

The **unapplied** migration
`20261021120000_atlas_creative_review_owner_guard_p18.sql` introduces
a new SQL function that re-checks **every exact project owner ID against
the server-authenticated reviewer** while locking the project rows with
`FOR SHARE` in the same transaction as the immutable P15 decision.
The P15 proof hash, project scope and uniqueness guards still apply.

The new migration REVOKES the service-role EXECUTE grant to the
older P15 review RPC; the P18 store calls only the P18 RPC.
This prevents bypassing P18's project ownership verification via the
previous, weaker server-exposed SQL function.

These checks protect against concurrent ownership changes but do NOT
establish human operator identity independently. That identity still
must be session-derived, and the operator must explicitly confirm the
exact decision before a future live HTTP route invokes the store.
A compromised service-role credential remains highly privileged.

## Verified

- **115/115** creative Node tests passed, including 12 new P18 HTTP
  boundary and guarded-store tests.
- **41/41** sequential real PGlite PostgreSQL 18.6 database tests passed,
  including 5 new P18 SQL ownership/grants/one-decision tests.
- **27/27** isolated PostgreSQL 17.11 Docker checks passed, including
  P18 revocation of P15 EXECUTE, project ownership change refusal and
  two-session conflicting approve/reject decisions. Exactly one
  immutable decision committed.
- Total checks across independently run local suites: **183/183**.
- Disposable PostgreSQL container automatically deleted; Windows
  media-worker account remains disabled.

## Still NOT ready to enable

No production SQL migration, exposed Next route, functional UI buttons,
worker registration, OS account enablement, autonomous editing, or publishing.
P18 was tested in local fixture databases, not against a complete Supabase
staging clone with all policies/extensions. Full application Next.js
typecheck/build has not run here.

Required future gates: independent security review and tested real operator
session, key-fingerprint confirmation and session/CSRF handling; atomic
review preconditions on production-matching database; protected key
enrollment and revocation; verified network/process/filesystem isolation
of the Windows media worker; human media preview and separate publish gate.

All stacked creative PRs must stay **Draft** until reviewed. No new paid
service or cloud infrastructure was provisioned.
