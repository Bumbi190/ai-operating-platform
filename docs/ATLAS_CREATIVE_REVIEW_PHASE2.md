# Atlas Creative – Local Review and Approval Proof Phase 2

Date: 2026-10-20
Branch: feat/atlas-creative-tools-p0
PR: https://github.com/Bumbi190/ai-operating-platform/pull/450

## Delivered on Hultgren workstation

1. **Local demo review page** created at:
   C:\Users\Andre\Projects\Omnira\External\ArtCraft\_atlas_test_only\reviews\artcraft-fixture-001\index.html
   It compares the original PNG and PhotoCraft WebP, plus the FilmCraft demo MP4.
   The page is static HTML with no app server, login, publish control, or JavaScript.
   This is only a sample demonstration, not a signed Atlas production review.

2. **Read-only receipt verification**:
   scripts/creative-tools/receipt-review.mjs can build an unapproved PhotoCraft
   review manifest by cross-checking local request, one-time claim, audit receipt,
   pinned binary identity, input SHA-256, output SHA-256 and media dimensions.
   It does not trust status strings as publish or execution permission.
   The request/receipt files themselves are not authenticated; treat them as
   untrusted local pilot evidence until the signed server queue is implemented.

3. **Media verifier**:
   scripts/creative-tools/media-verify.mjs examines PNG/WebP dimensions,
   RIFF container length, MP4 top-level box sizes, file type, and size limits.
   This is structural inspection, NOT complete codec/visual quality validation.

4. **Workstation preflight**:
   scripts/creative-tools/worker-preflight.mjs reports whether independent
   protection prerequisites have been proven.
   Actual result on Hultgren (20 Oct 2026):
   - Windows: true (Windows 11 Home)
   - Pinned program hashes: true
   - Dedicated non-admin worker: false
   - Verified worker staging ACL: false
   - Network egress restriction: false
   - Durable signed authorization and anti-replay: false
   - Authenticated creative queue: false
   Overall readiness: FALSE. Script makes no system changes.

5. **Cryptographic approval proof verifier**:
   scripts/creative-tools/approval-proof.mjs verifies P-256 ECDSA signatures
   over an exact creative-job scope and 5-minute maximum validity.
   It requires a public key supplied OUT OF BAND by a trusted host and checks
   operator identity, work, project, asset id + hash, recipe, pinned binary hash,
   output limit and timestamps. No private keys are stored in the repo.

   IMPORTANT: A valid signature is insufficient for execution. The trusted
   server must verify actual operator authority, bind proof to its stored job,
   atomically consume the nonce, and grant short-lived worker execution scope.
   The verifier intentionally returns executionAuthorized=false,
   operatorAuthorityVerified=false, nonceConsumed=false.

## Manual review

Open the local demo HTML path in a browser on Hultgren to examine actual images
and video. No click on the review page can approve or publish anything.
No production data is involved.

## What remains before a real Atlas edit

- Provision a restricted Windows worker identity with dedicated NTFS ACLs and
  deny-by-default access to unrelated files/secrets.
- Build a creative-specific authenticated queue; existing code-work broker
  repository authorizations must NOT be reused as media-edit permissions.
- Have an authenticated human approval event stored by the trusted server.
- Consume approved nonce atomically, bind it to exact project/asset/recipe.
- Use the approved local worker to execute one PhotoCraft synthetic test job;
  prior attempt at remote broker execution was blocked, not end-to-end verified.
- Admission of resulting private derived asset with immutable provenance.
- Show results through Atlas app and require separate publish approval.
- Verify visual media quality and run complete product test suite.
