# Atlas Creative P21 — isolated localhost HTTP integration tests

Date: 2026-10-21
Branch: `feat/atlas-creative-p21-loopback-http`
Parent: P20 Draft PR #486

## What was tested

`scripts/creative-tools/review-loopback-http.test.mjs` starts a temporary
Node.js `http` server bound **only to 127.0.0.1, on an ephemeral port**.
A true HTTP client sends requests through the operating system's loopback
TCP stack. Every server instance closes in `finally`. The listener uses
no external interface, cloud service, production secrets or Supabase client.

Two distinct test modes are explicitly separate:

1. **Actual P19/P20 Next route module:** The test imports the real
   `apps/web/app/api/atlas/creative/enrollments/review/route.ts` through
   Node 22's TypeScript stripping and dispatches incoming GET/POST requests
   to its real exported handlers. The handlers remain compiled hard OFF.
   All requests return 503 `creative_review_unavailable`, including fake
   cookies, fake JWTs and a made-up approval payload.
   The response always denies account activation, execution and publication.
2. **P20 read-only candidate, NOT deployed:** Another test server dispatches
   only to the pure GET prototype `review-read-http.mjs`, using explicit
   *synthetic* session/operator/project lookup dependencies. A same-origin
   request gets the allowed `pending_review` projection; wrong origin,
   missing Fetch Metadata, a non-operator or a foreign project owner is
   refused. Private-key material and authentication tokens in the fixture
   are not emitted in the response.

These modes are **not** mixed: the actual Next route never invokes the
private preview candidate. P19 remains disabled in the real Next route.

## Verifications

- The listener address is asserted to be exactly `127.0.0.1` and port 0
  instructs the OS to choose a free ephemeral localhost port.
- Six separate real TCP/HTTP tests pass for disabled GET, disabled POST,
  allowed synthetic read, wrong/cross-site origins, foreign project ownership
  and unauthenticated operator.
- The **entire creative Node suite: 136/136 passed**, including six new P21
  loopback tests. Runs serially to minimize memory demands.
- The existing sequential PGlite database suite: **41/41 passed**.
- Total local regression checks in this worktree: **177/177**.
- No new source changes to the review's security policies or feature gate
  are needed; this PR contributes a reproducible integration test fixture.

## Important limits / no-go

This is genuine local network traffic and real Next **handler functions**,
but NOT a Next.js server or Vercel framework test. It does not test Next
middleware, production origin/proxy headers, cookies, SSR, production build,
bundler output or deployment. The P20 reader's operator/session dependencies
are synthetic test doubles, not real Supabase authentication.

On Hultgren the isolated worktree has no root or web `node_modules`,
and free physical memory was only approximately 0.8 GB during P21 work.
A full dependency installation/Next build could disrupt other services.
It was therefore **intentionally not attempted** and remains a blocker.

No migration was applied to Supabase, no paid infrastructure provisioned,
no windows account activated, no actual worker enrolled and no media edit
or publication was performed. `omnira-media-worker` stays disabled.

Next priority after code review: a resource-controlled real Next build in
a disposable CI/staging environment, followed by independent security review
of operator ownership, authenticated review actions, Windows worker isolation
and the very first synthetic private PhotoCraft output test.

All stacked creative PRs remain Draft and should not be merged or deployed
until reviewed.
