# Atlas Creative P20 — real route-handler smoke + private review GET seam

Date: 2026-10-21
Branch: `feat/atlas-creative-p20-read-smoke`
Base: P19 Draft PR #484

## Delivered safely

### 1. Actual Next route file smoke — still hard OFF

The real `apps/web/app/api/atlas/creative/enrollments/review/route.ts`
has a relative (instead of path-alias) import for its existing P19 compiled
kill-switch. Node 22's built-in TypeScript stripping can now import the
actual route file directly without installing/starting Next.js.

The P20 test imports that real module, invokes both its exported GET and
POST methods using actual `Request` instances, and verifies each returns
**503 `creative_review_unavailable`** with the same never-authorized
flags. The actual Next host remains unmodified in behavior and does NOT
import the read-only preview server or a database client.

This is a **route-handler module smoke test**, NOT a full running
Next.js server/router/typecheck/build test. It cannot establish framework
runtime behavior (middleware, proxy, routing, cookies, build output).

### 2. Private, read-only candidate API contract

`review-read-http.mjs` is a pure, independently tested GET adapter
for the intended future path:

```text
GET /api/atlas/creative/enrollments/review?enrollmentId=<UUID>
```

It requires:
- a server-configured exact HTTPS origin (loopback HTTP only in tests)
  and canonical URL/query; no query aliases or extra parameters;
- same-origin browser fetch metadata, with a foreign `Origin` rejected;
- authenticated `resolvePlatformOperator` session principal;
- a genuine `pending_review` P13 enrollment with exact UUIDs, key/proof
  SHA-256 digests, and **full ownership of every project** as checked by
  the P17 projection. One owned project never grants a foreign project;
- JSON result **allowlisted** to enrollment ID, worker ID, exact projects,
  SHA digests and explicit literal false for submission, activation,
  execution and publishing. Raw PEM, authentication data and admin
  credentials never appear.

All JSON responses are private/no-store with no-sniff and frame-deny.
Unknown or foreign records have indistinguishable not-available responses.

### 3. Server-only composition, not mounted

The existing P17 server projection now offers
`createDormantCreativeReviewDependencies()`, retaining the original
`createDormantCreativeReviewPreviewReader()` behavior. A new server-only
`review-read-http-server.ts` composes those dependencies and the GET
candidate, refusing construction without an explicit configured origin.

No Next route imports this new composition, so a future public caller
cannot reach it. `CREATIVE_REVIEW_READ_DEPLOYED=false` is declared
explicitly. The P19 review POST action and P17 UI decision controls remain
disabled and unmounted.

## Verified on Hultgren

- **9 P20 tests** passed for the pure reader and real route-handler import:
  exact origin/method/query, authentication before lookup, all-project
  ownership, no private-key leakage, and actual GET+POST returning 503.
- **130/130** entire creative Node suite passed.
- **41/41** previous sequential PGlite database checks passed.
- **171/171 total local checks passed** in this worktree.
- Previous P18 PostgreSQL 17 test was NOT rerun here.
- `omnira-media-worker` stayed disabled and no ephemeral Docker DB was
  required for P20.

## Outstanding before enabling any real view

1. Full Next.js install/typecheck/build and actual HTTP integration in an
   isolated, resource-appropriate staging environment; verify the Next
   route and middleware/cookie/security headers.
2. End-to-end Supabase staging schema and typed client testing after review.
3. Independent human verification of signing-key fingerprint and actual
   operator session/project privileges at decision write time.
4. P18 immutable decision auditing and explicit UI consent with CSRF
   protections, outside this read-only step.
5. Enrolled worker key lifecycle and restricted Windows worker sandbox,
   network egress controls, private media output admission and a separate
   publication approval.

**NO GO:** activation, SQL migration to production, media processing or
publishing. This PR and all creative ancestors stay Draft.

No production services, deployed endpoints, real user data, billing,
Windows identities or network listeners were modified by P20.
