# Atlas Creative P5 – signed offline job-queue contract

Date: 2026-10-20
Feature branch: feat/atlas-creative-queue-p5 (isolated worktree)
Depends on: feat/atlas-creative-tools-p0 / draft PR #450

## Grounded local state

The operator's elevated verification returned a disabled non-admin account
`omnira-media-worker`, with seven intended Windows worker directories
present and their ACL checks passing. PhotoCraft and FilmCraft were staged
under C:\ProgramData\OmniraCreativeWorker by the operator and the staging
script reported success. The editor account remains DISABLED.

Read-only inspection of Windows Defender Firewall profiles found Enabled=true
for Domain/Private/Public, but DefaultOutboundAction=NotConfigured. This is
NOT proof that outbound traffic for an editor or child process is blocked.

## What this implementation DOES

`scripts/creative-tools/signed-queue.mjs` declares a separate creative
queue identity, never reusing the code-work broker's repository authorization.

- The trusted future server must sign a ticket using its separate P-256 key.
- The signature binds work ID, project ID, source AssetId and SHA-256,
  named allowlisted edit operation, editor executable SHA-256, SHA-256 of
  the pre-existing approval receipt, byte cap, creation/expiry and nonce.
- Signed tickets expire after at most 5 minutes.
- A trusted pinned PUBLIC key and a canonical expected job scope are
  required by verification. Neither comes from the untrusted ticket.
- Unknown fields, arbitrary commands, traversal-like IDs, wrong project,
  changed/expired signatures, mismatched approved receipt, or wrong binary
  are rejected.
- Offline filesystem staging is exclusive-create and refuses duplicates.
- Claim re-verifies the signed ticket and exclusive-creates a one-use claim.
- All returned objects say `executionAuthorized=false` and
  `publishAuthorized=false`. No subprocess is started.

A test-only end-to-end sequence uses ephemeral P-256 keys:
operator approval signature -> one-use approval receipt -> server-signed queue
ticket -> verify and single claim. Reuse and tampering tests refuse.

## What is NOT implemented (important)

This module runs only as offline Node.js functions in a test workspace.
There is NO real hosted queue endpoint, no operator-facing authenticated
approval binding, no persisted production server keys, no Windows worker
poller, and no production claim/lease, cancellation or heartbeat system.

The offline claim files are protected only by the caller's filesystem ACLs.
The test fixture is NOT a durable trusted transactional production store.
The future host must enforce replay rejection atomically at a server-backed
boundary and must prevent an untrusted worker or model from altering claims.
These modules do NOT authorize execution; a signature from a test key is not
a live Atlas approval.

## Remaining secure activation plan

1. Verify a dedicated, restricted Windows identity can launch the pinned
   binaries without accessing the owner's profile, cloud credentials or
   other projects. Test junction/reparse handling, process spawning and
   network egress separately; don't assume a non-admin account is a sandbox.
2. Implement a media-specific, authenticated hosted job record/queue with
   immutable project/asset binding, scoped operator approval and durable nonce.
3. Trust a pinned queue signer and project authority from the server,
   not a request body or Atlas-generated text.
4. Have an independently reviewed worker consume a claimed job; only typed
   PhotoCraft/FilmCraft recipes may be executed in restricted staging.
5. Admit derived media as PRIVATE canonical Assets, prove content integrity,
   run independent visual/audio QC and expose source/output preview in Atlas.
6. Require separate explicit permission to publish. Keep legacy Remotion
   and existing creative production available as fallback.

No production permissions, firewall rules, Windows account changes, or
repo merges were made by this P5 implementation.
