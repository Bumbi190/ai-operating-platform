# Atlas Creative P19 — hard-disabled Next.js review route

Date: 2026-10-21
Worktree: `feat/atlas-creative-p19-guarded-route`
Parent: P18 Draft PR #483

## Purpose

This is the first **real Next.js route file** reserved for the operator
enrollment review HTTP path, while it remains absolutely disabled.

The Next App Router host lives at:

```text
apps/web/app/api/atlas/creative/enrollments/review/route.ts
```

It exports GET and POST and delegates each to a *compile-time disabled*
handler in `review-route-gate.mjs`. Neither method imports the
Supabase service-role client, requests a session, reads a request body,
looks up pending enrollments, calls the P18 SQL review function or
starts media processes while the gate is disabled.

The handler returns JSON 503 `creative_review_unavailable`, with
`Cache-Control: no-store, max-age=0` and `nosniff`; execution,
activation and publishing authorization are always `false`.

The gate is a source-level literal `false`, not an environment flag.
An attacker cannot enable it with cookies, headers, URL parameters,
a forged JWT, a client-supplied approval boolean or model output.
Changing this gate would be a new audited source-code change.
A handler loader cannot be executed in the current disabled path.

**There is intentionally no live approval implementation behind the route
yet.** Even if the literal were changed alone, the current Next route
does not supply a loader and therefore returns 503.

## Tests

- **121/121** creative Node tests passed, including 6 new hard-disabled
  route tests verifying GET, POST, requests with untrusted headers,
  method mismatch, cache-control, and absence of privileged imports and
  enabled UI event handlers.
- **41/41** sequential local PGlite PostgreSQL tests passed for the
  earlier P7–P18 code. They do not test production Next routing.
- Combined **162/162** tests on this isolated P19 worktree.
- Previous P18 PostgreSQL 17 tests validated review and ownership SQL,
  but were not rerun in this turn.

## Strict outstanding requirements before any activation

1. Independent code review of the stacked creative PRs and correct
   deployment of P7, P10, P13, P15 and P18 SQL into a **disposable
   production-like PostgreSQL/Supabase staging environment**.
2. Real authenticated operator session and exact project-ownership
   checks, with a CSRF/same-origin-safe request validated at *write time*.
3. Explicit human verification of the worker's signing-key fingerprint;
   approval is not equivalent to Windows worker activation.
4. Independent, durable enrollment/revocation authority and key rotation.
5. A tested Next.js build and route integration with verified cache,
   deployment origin, transport headers and error behavior.
6. Verified isolation of `omnira-media-worker`: filesystem boundaries,
   inherited child-process limits and network egress denial.
7. Synthetic private preview before any real creative execution;
   separate human publishing permission.

No Supabase migrations were applied, no Next.js code deployed, no
network listener or real enrollment activated, and no cloud costs added.
Keep this and all creative ancestor PRs Draft until reviewed.
