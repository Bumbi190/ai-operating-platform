# Hosted Supabase operator access: read-only evidence and alternative route

Date: 2026-10-23. PR #504 remains DRAFT. **No production SQL, grants, auth settings or publish jobs were changed.**

## What the actual hosted project currently supports (READ-ONLY CATALOG QUERIES)

On the existing **AI Operating Platform** Supabase project, three strictly read-only catalog queries confirmed:

- PostgreSQL 17.6 and the standard PostgreSQL roles `anon`, `authenticated`, `authenticator`, `service_role`.
- The hosted `authenticator` role is currently a member of `anon`, `authenticated` and `service_role`. The experimental `social_schedule_rpc_only_fixture` and `social_schedule_operator_review_fixture` roles **do not exist** on the hosted system; no test-only grants or functions have been deployed.
- The real `auth.sessions` catalog includes `id uuid`, `user_id uuid`, `not_after timestamptz` and session timestamps. Only column metadata, never real sessions/tokens/PII, was read.

This supports the availability of a **standard-role operator route** without registering a new external OIDC integration. It **does not** prove that using a shared `authenticated` role to call new privileged RPCs is safe or production-ready. The latest project catalog lists many existing privileged functions; every proposed exposed function must have a fully audited `SECURITY DEFINER` body, grants and transitive calls.

## Current third-party OIDC constraint

Supabase's Custom OIDC documentation requires HTTPS issuer discovery, asymmetric JWTs and `kid`, and documents the `role='authenticated'` claim for ordinary signed-in users:
https://supabase.com/docs/guides/auth/third-party/custom-oidc

Other provider documentation (e.g., Clerk) allows mentioning a different PostgreSQL role for advanced setups, but that is **not proof** that this hosted project's third-party Auth configuration will accept our custom SQL role. No live issuer, remote integration or billable staging project was created. Raw PostgREST accepts the prior synthetic custom-role JWTs locally. Hosted provider acceptance and JWKS refresh remain unverified.

## Alternative under isolated test

`apps/web/lib/calendar/scheduled-authenticated-operator-role-probe.sql` is a **fixture-only** prototype intended to reuse Supabase's native user JWT:

- The actual PostgREST verifies signature, expiry, `role='authenticated'`, audience and issuer. The SQL helper then verifies `sub`, `session_id`, `is_anonymous=false`, an active `auth.sessions` row for that exact user and an active database-maintained project/operator mapping.
- A session that has been removed or passed `not_after` must deny *even while a signed access JWT has not expired*. The synthetic fixture contains a **minimal fake `auth.sessions` table**, not the complete GoTrue schema.
- Only two explicit `SECURITY DEFINER` RPCs would be granted to `authenticated`: a project/job/publication-scoped **read-only history** and an idempotent **human-only observation append**. Direct table/session/token grants and the privileged internal helper remain denied. The functions check the currently held immutable provider dispatch intent and may not write `provider_outcome`, create proofs, retry or publish.
- The existing operator-only, custom-role fixture remains in place in parallel for comparison. Both routes share the *same* test-only append-only audit ledger; neither has a provider-attested write path.
- A caller-supplied project ID, request/body operator ID, user metadata or arbitrary JWT claim must never be treated as authority without an independent session and database membership check.

This candidate may reduce infrastructure cost and avoid a separate human-operator identity provider, **but** the broad function execute grant to all signed-in users means that a single SQL authorization flaw could expose a privileged RPC. The security trade-off must be reviewed by a human before any deployed migration. Never grant the general `authenticated` role the pre-existing scheduler, token, Meta receipt or publisher functions.

## Preferred preliminary split

1. **Human review:** Prefer an existing Supabase Auth user session plus separately gated, purpose-specific operator history/observation RPCs, *only after* an isolated proof, detailed body/trigger audit and a safe hosted staging test. The UI also rechecks the same server-side `getUser`/project/operator controls and requires explicit human confirmation.
2. **Autonomous scheduling and Meta write:** Keep the independent private broker/worker identity, durable at-most-once dispatch intent and provider-credential isolation. Never reuse an ordinary user's `authenticated` session as the autonomous background publisher identity.
3. **Uncertain Meta outcomes:** Keep `provider_outcome='unknown'`, block automatic retries, show the separate review queue and require provider-authenticated evidence / human assessment. Human notes alone do NOT finalize a provider receipt.
4. **Hosted release gate:** Inspect the complete owner/definer/trigger graph and apply only independently reviewed migrations. Real Supabase Auth sessions, full role execution and revocation semantics must be tested in an isolated hosted staging environment after confirming costs. No production settings/role grants without an explicit approval.

**No deployable SQL, app routes or custom OIDC settings are authorized by this document.**

## Verified local result (23 October)

The closed PostgreSQL 17/PostgREST replay has now passed **with exit
code 0**, including `CROSS-TREE HOSTED AUTHENTICATED ACL PASS`,
`CROSS-TREE HOSTED AUTHENTICATED OPERATOR PASS` and
`CROSS-TREE REPLAY PASS`. The proof used a cryptographically signed,
local native-style `role=authenticated` JWT carrying `session_id`
and `is_anonymous=false`, a synthetic `auth.sessions` entry, and
the administrator-seeded active operator/project mapping.

The operator completed an actual PostgREST `history` call and an
idempotent `append` through the **same durable audit ledger** as the
previous custom-role path. Malformed inputs, extra provider-attestation
fields, wrong account/project, nonoperators, anonymous users, missing,
mismatched or expired sessions were refused; direct table and helper
access remained prohibited. Deleting the active synthetic
`auth.sessions` row made further requests fail, even though the JWT
expiry was still in the future. The audit retained **exactly two
human-only notes**; the durable dispatch intent remained one row with
`provider_outcome='unknown'`, and no Meta POST was performed.

The integration did **not** use a real Supabase Auth user or actual
hosted project RPC. This proof demonstrates the *PostgREST +
PostgreSQL policy model*, not actual hosted service readiness.
Strict issuer and session semantics must be adapted to the real
GoTrue issuer, with a checked native session subject, in staging.
Any broad `authenticated` EXECUTE permission on a new
`SECURITY DEFINER` RPC must pass a separate code/trigger/call-graph
audit before release. The cost-conscious split (native sessions for
human review, separate broker for unattended publish) is
recommended for staging evaluation, **not authorized for
production deployment**.
