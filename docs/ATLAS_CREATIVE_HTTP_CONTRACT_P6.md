# Atlas Creative P6 — authenticated worker claim boundary (prototype)

Date: 2026-10-20
Branch: feat/atlas-creative-queue-p5
Depends on: creative PR #450 and queue PR #457.

## Shipped in this branch

- `scripts/creative-tools/queue-http-contract.mjs`: a **pure Node.js
  Request/Response adapter** for creative-worker claim semantics.
- **No Next.js route has been registered**, no web server was started, no production
  endpoint was added and `CREATIVE_HTTP_PRODUCTION_ENABLED` is hardcoded false.
- Handler accepts POST application/json with a strict 512-byte body limit,
  typed single `workId` DTO, Cache-Control: no-store, and generic refusal codes.
- A future **trusted host** MUST inject `authenticateWorker(request,rawBody)` to
  verify its signed request, timestamp/counter, device enrollment, media-only
  capability and project membership. Browser origin/cookies are not proof.
- A future **trusted transactional store** MUST inject `claimAtomic` to claim
  exactly one immutable creative work item for the authenticated worker and
  return its canonical scope and signed ticket. The public verification key comes
  from a separately pinned trusted configuration, never from the claim itself.
- The boundary checks worker/project binding and verifies the entire signed
  job ticket against that separately-supplied canonical expected scope.
- The trusted server P-256 key must be provided through an independent trusted
  configuration dependency, not supplied by a ticket or database claim result.
- The queue ticket now includes a **signed `workerId` field**, preventing
  transfer to a different media worker when the canonical expected scope binds
  to the authenticated principal.
- Output remains `status:claimed-no-execution`,
  `executionAuthorized:false` and `publishAuthorized:false`.
- Tests reject wrong project/worker, no authentication, invalid method/body,
  incorrect content type, payload over limit, corrupted signatures and retry.
- Windows read-only tests have been adapted to denied read access: a
  non-elevated user cannot inspect administrator-protected worker folders,
  and access-denied must never be treated as proof of an empty/unprotected folder.
- **45/45 local Node tests passed** including Windows planning checks.
  Full application Vitest/typecheck/SQL tests not run in this worktree.

## Architecture diagram

1. Atlas writes non-executable creative draft (already implemented).
2. Operator chooses approve/reject in an AUTHENTICATED Omnira UI (NOT IMPLEMENTED).
3. Trusted server verifies project membership and stores immutable approved work
   and a durable, non-replayable approval transaction (NOT IMPLEMENTED).
4. Trusted server generates a worker-bound signed ticket (prototype only).
5. Low-privilege Windows worker authenticates with separately enrolled identity
   and asks for a transactionally claimed ticket (HTTP contract only).
6. The server verifies ticket and returns a **non-executing** claim response.
7. Separate security review must authorize one permitted media recipe under
   a restricted OS worker and monitor output (NOT IMPLEMENTED).
8. Canonical PRIVATE asset admission, visual QC and preview, separate
   publish approval (NOT IMPLEMENTED).

## Explicit security boundaries

- Never reuse code-work repository ACL or its broker signing authority as a
  creative/edit-media authorization.
- The `pilot:true` dependency value in the pure handler is an **injection
  from trusted caller code for testing**, NOT an HTTP flag. No production route
  exists to expose this prototype.
- The current offline signed filesystem queue is not a durable central store.
  Its exclusive-create one-use behavior is correct in local tests only; a hosted
  queue needs a transaction with job lease/fence and strict RLS/no public grants.
- Claiming a job is not authorizing execution. A signature alone does not prove
  a human approval or isolated Windows process.
- Windows 11 Home and the existing restricted account/ACL plan do not establish
  network or child-process isolation. Do not enable `omnira-media-worker` yet.
- Never store private signing keys in GitHub, the client, or the media model.
- Real media jobs must be tied to canonical source AssetId and content SHA256;
  local file paths and prompts must not become authorization tokens.

## Next real integration

An independently reviewed creative server identity, authenticated enroll/revoke
lifecycle and transaction-backed queue are prerequisites. Then create the guarded
Next server route (default disabled), a restricted Windows poller and one end-to-end
synthetic media edit with signed receipt, quality checks and human review.

No changes to production Supabase, Windows accounts/firewall, existing Atlas code
agent or live media workflow were made in P6.
