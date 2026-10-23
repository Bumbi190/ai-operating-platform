# Calendar operator JWT issuer: rotation and hosted feasibility (23 October 2026)

**Status:** experimental, isolated-only. **Production decision: NOT AUTHORIZED.**

This note records only what is supported by current Supabase documentation and the local calendar isolation proofs. It is not approval to create a production identity provider, grant SQL privileges, migrate data, change a scheduler or send a Meta request.

## Where we are

PR #504 has verified a *local* scoped operator RPC path with independent synthetic JWTs for review/history and human observation append, actual isolated PostgreSQL/PostgREST, and a permanently reserved synthetic dispatch intent. The production scheduler still uses broad `service_role` clients. The observed internal `published` state does not itself authenticate a Meta receipt. The operator audit records only human assertions; it cannot authorize retransmission or provider confirmation.

The signing key must never be stored in a browser, public Next/Vercel variable, general web route, ordinary Atlas job, or worker. A separate hardened identity service (or supported managed provider) needs an independently authenticated *current* user/project/operator entitlement check before issuing a short-lived, fixed-role token. No arbitrary `role` or `projectId` input can influence the issuer.

## What the local test actually proves

- `apps/web/scripts/calendar-oidc-rotation-fixture.mjs` generates two **ephemeral RSA-2048 private keys in the parent test runner**. The public JWKS contains neither private exponent nor CRT parameters.
- In the `legacy` phase, only the original key is trusted. The `overlap` phase advertises **both** public keys and signs new test tokens with the newer key. In the `retired` phase, only the newer public key is trusted and the signer will not go back to issuing the old one.
- Only the two fixture operator/reviewer roles and one administrator-seeded synthetic subject/project can be signed. Requests for `service_role`, foreign subjects/projects, unreasonable lifetimes, and production-mode construction fail closed.
- `calendar-postgrest-rotation-fixture.mjs` must run inside the closed replay using an **additional, owned PostgREST verifier**, with no published network ports. During overlap both signatures must work against real SQL while invalid `kid` and tampered subjects fail. After restarting this *test-only* verifier with new-key-only JWKS, old JWTs must fail HTTP 401, new JWTs must still pass, and the existing human-audit, dispatch-intent and unverified Meta state must remain unchanged.
- This is *not* an HTTPS OIDC Discovery implementation; it is a proof of raw PostgREST JWKS verification after a deliberate configuration replacement. A test server's instantaneous config change does not imply any particular hosted Supabase JWKS propagation latency.

The results must be recorded from the actual run, not inferred merely because these tests exist.

## Hosted Supabase feasibility: unverified

Supabase's documented [Custom OIDC](https://supabase.com/docs/guides/auth/third-party/custom-oidc) provider requires an **HTTPS issuer**, `/.well-known/openid-configuration`, asymmetric signing and JWT `kid`. It instructs third-party providers to use `role='authenticated'` for signed-in users. Our fixture instead tests custom Postgres roles directly against *raw PostgREST*. **Do not assume** the hosted Data API will honor those custom `role` claims. No custom OIDC was registered in the user's Supabase organization or project.

The [Third-party auth limitations](https://supabase.com/docs/guides/auth/third-party/overview#limitations) say signing key changes may take **up to 30 minutes** to be detected. The [JWT Signing Keys documentation](https://supabase.com/docs/guides/auth/signing-keys) describes overlapping standby/active/previous key lifecycles for Supabase-managed keys, but it does **not** remove third-party provider propagation or client caching considerations.

A safe production rotation runbook therefore needs:
1. Prepare/publish the new public JWK under a distinct `kid`; verify authenticated detection by the actual hosted verifier before issuing with it. Allow for the documented 30-minute third-party sync window, and longer if the observed provider configuration requires it.
2. Switch issuance to the new private key only *after* verifying the new key is accepted. Keep the old key trusted throughout the overlap. No downtime or success should be assumed merely because the key is present in discovery.
3. Wait for maximum old-token lifetime plus verifier synchronization, validate no outstanding old-token dependencies, then revoke the old key. On suspected compromise, fail closed rather than silently falling back to an admin/service key.
4. Probe revocation and caches from multiple client/service paths; log only kid, issuer and redacted status (never a bearer token). The expected test includes valid signature, wrong kid, wrong issuer, altered signature, changed role/project, revoked operator membership and expired token.
5. Ensure outage response leaves scheduled or uncertain Meta dispatches **blocked for operator review**, never automatically retransmitted.

**Hosted proof must occur in a safe staging environment** with explicit acceptance of costs and settings changes. A separate application/broker approach may be needed if managed Custom OIDC does not support private Postgres roles. Do not grant blanket `authenticated` access to privileged scheduled or operator RPCs as a workaround. The separate-broker alternative requires its own session authorization, network isolation, deployment review, least-privilege database admission and audit.

## Remaining release gates

No production-ready operator JWT issuer, independently deployed private broker, real OIDC discovery/JWKS propagation test, managed custom-role permission validation, independent Meta receipt attestation, fully audited SQL `SECURITY DEFINER` transitive surface, Instagram multi-stage finalization, or reconciled May media migration ledger exists in this experimental proof. The draft PR should remain unmerged until those gates are separately reviewed.


## Rotation test outcome (verified 23 October 2026)

Native Node tests: **5/5 PASS**, covering public-only JWKS, activation/overlap,
retirement, role/project/subject/TTL refusal, and production-mode refusal.

The isolated 151-web + 10-pinned-root PostgreSQL/PostgREST replay completed
with **exit code 0**. The additional verifier ran on the owned, internal
Docker network without published ports. In the overlap phase the old and
newly signed operator JWTs both passed actual operator history SQL; the
scoped reviewer JWT saw one queued issue. An unknown `kid` and a
tampered JWT subject were rejected at signature verification (HTTP 401).
After the verifier's public-JWKS configuration was replaced with the
new-key-only set, the *same previously issued old token* was rejected
(HTTP 401), while the new token still succeeded. The runner reported
`CROSS-TREE OPERATOR JWT ROTATION PASS` and `CROSS-TREE REPLAY PASS`.
It confirmed the audit ledger still contained two human-only notes,
the separate dispatch intent still contained one row, and the provider
outcome was still `unknown`. The runner removed the extra verifier
within its own `finally` path and all other owned resources on exit.

Calendar regression: **55/55 targeted Vitest tests passed**; the four
environment-gated replay tests were run in the full isolated replay
rather than the ordinary unit test run. All changed JavaScript files
passed `node --check` and `git diff --check`. No TypeScript source
files or production routes were changed for this rotation; the older
unrelated Remotion type-check issue was not modified.

**Interpretation boundary:** This is proof of RSA/JWKS overlap and
retirement in a **deliberately reconfigured local PostgREST verifier**.
It neither tests HTTPS OIDC discovery nor the actual hosted Supabase
30-minute JWKS refresh window, custom Postgres role acceptance, issuer
deployment, KMS/HSM custody, or revocation across live distributed
caches. Hosted deployment is still barred.
