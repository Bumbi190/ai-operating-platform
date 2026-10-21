# Atlas Creative P23 — production UUID chain parity and PR-stack review

Date: 2026-10-21
Branch: `feat/atlas-creative-p23-uuid-integration`
Base: P22 Draft PR #490

## Concrete integration gap repaired

The P5 signed queue proposal and P7 SQL adapter accept actual Supabase
UUID project IDs, but the original P0 creative **human approval**
(`approval-proof.mjs`) accepted only project slugs. Likewise, the
P0 approval-receipt staging registry accepted operator slugs only.
A legitimate UUID-shaped production project/actor was therefore rejected
BEFORE it could create an approval receipt, while the later database
stage REQUIRED a UUID.

P23 supports *both* original synthetic slug fixtures and canonical UUIDs
at those two scoped boundaries:

- `approval-proof.mjs`: UUID or old pilot slug for **approverId** and
  **projectId** only. Work IDs, signature domain, canonical field order,
  TTL, operation allowlist and all other checks remain unchanged.
- `approval-receipt.mjs`: UUID or pilot slug for the trusted **operatorId**,
  with exact registry/operator matching and original project scope checks.
- Legacy slug-based canonical signatures keep the exact same signed bytes;
  no previously signed ticket or receipt needs to be rewritten.
- The **production SQL adapter remains UUID-only**. Allowing old pilot
  slugs into SQL would loosen tenant scoping and is expressly disallowed.

## Actual tested offline chain

The new `queue-integration-uuid.test.mjs` exercises:

1. Synthetic P-256 signed approval scoped to UUID operator, project
   and source asset; trusted-looking *test-only injected* operator registry.
2. One-use local approval receipt, with `executionAuthorized=false`.
3. Signed, short-lived P-256 creative queue ticket using the **same** UUID
   project and approval-receipt SHA256.
4. One-use non-executing queue stage and claim with verified ticket hashes.
5. Pure `deriveCreativeSqlClaim` and `claimCreativePreviewOnly` TypeScript
   adapter with **mock** DB response, validating exact project UUID and
   unchanged ticket/approval hashes. The mock is NOT real PostgreSQL.
6. Explicit final execution, creative HTTP production and public
   review-route gate flags all remain `false`.

Additional negative tests reject path injection, malformed UUIDs and
cross-project pilot slug SQL claims. A legacy pilot slug signature remains
byte-for-byte canonical and its original offline tests still pass.

## Local tests (Hultgren)

- **4 new** P23 UUID scope/integration tests: passed, including
  cross-project/cross-operator source-hash and key forgery refusal.
- **147/147** full serial Node creative tests: passed.
- **41/41** existing serial PGlite database tests: passed.
- Total **188/188** local tests passed on this branch.
- No new SQL migration or Windows worker changes. Full Next.js build,
  actual Supabase staging and independent artifact quality audit NOT done.

## Stacked Draft PR status checked through GitHub

As of this review, these **18 Draft PRs** were all open, unmerged,
and based on preceding creative development branches (not `main`):

`#450 → #457 → #460 → #462 → #464 → #466 → #468 → #470 →
#474 → #476 → #477 → #479 → #480 → #483 → #484 → #486 → #488 → #490`.

**Do not mass-merge this chain.** Even green individual tests do not
establish build/migration compatibility across the full app.
The early P0 branch is concurrently being developed by another task:
a local `git merge-base --is-ancestor feat/atlas-creative-tools-p0
feat/atlas-creative-queue-p5` check returned **false** on this date.
This is an integration/rebase gate, **not** permission to rewrite P0
or the other chat's worktree. Check current remote parent heads and
reconcile P0/P5 after the owner of P0 has finished work.

## Remaining integration and security gates

1. Coordinate P0/P5 branch ancestry, audit stacked diffs and CI checks,
   and run a full Next.js build in a resource-appropriate isolated
   environment. Do not perturb the main worktree.
2. Review unapplied P7/P10/P13/P15/P18 migrations against the complete
   Supabase PostgreSQL 17 schema and operator/project privilege model.
3. Bind proof-of-possession, genuine human operator approval and
   signed worker requests to independently audited, minimally
   privileged server endpoints. Signed file receipts alone do not
   prove human authority or permit worker execution.
4. Verify that Windows media worker account has restricted process tree,
   filesystem junction handling and deny-by-default network egress.
   It remains DISABLED pending OS isolation review.
5. Perform a single approved, synthetic PhotoCraft job in a controlled
   sandbox, verify actual editor output provenance and private image QC.
   This **requires** a fresh explicit operator approval to proceed.
6. Keep all media private; review and separate human publication approval
   before any release.

P23 does not create a creative execution route, unlock the P19 route,
enroll any device, invoke editor CLIs, change production or incur
additional cloud services. All ancestor Draft PRs remain open.
