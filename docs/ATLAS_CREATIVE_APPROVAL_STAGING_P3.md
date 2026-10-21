# Atlas Creative – approval receipt staging (P3)

Date: 2026-10-20. Branch: `feat/atlas-creative-tools-p0`.

## What has been implemented

`scripts/creative-tools/approval-receipt.mjs` composes:
- The existing P-256 approval signature verifier;
- An exact canonical job scope from a hypothetical trusted server-side record;
- Operator/project eligibility supplied by a trusted registry;
- Atomic nonce consumption using an exclusive-create local receipt file.

Tests exercise: a valid proof, the same nonce submitted twice, cross-project
claims, revoked/unauthorized operator, tampering and expired signatures.

This is **staging only**. The receipt explicitly records
`executionAuthorized=false` and `publishAuthorized=false`.
Neither public keys nor secret signing material are provisioned here.

## Safety improvement

The earlier `local-broker.mjs --pilot-approve` command previously depended on
a manual flag with no verified authorization. Now `runPilotJob()` also contains
a hard fail-closed `AUTONOMOUS_CREATIVE_EXECUTION_ENABLED=false` barrier.
No CLI flag or environment variable bypasses this barrier. Direct editor CLI
fixtures from previous steps remain unaffected.

## Remaining trust boundaries

1. The trusted Omnira server must authenticate the real human and own the
   operator registry plus exact job scope. A local JSON field claiming to be
   an operator is NOT proof of operator authorization.
2. The durable nonce store must live in a trusted service / strongly protected
   filesystem, survive restarts, and be keyed to one server-side approval.
   A writable file on the founder's main Windows account is NOT a security
   perimeter, even with atomic create.
3. A distinct low-privilege Windows worker identity must be provisioned with
   isolated binaries, staging ACLs and verified network restrictions.
4. The creative work queue needs a separate media authorization domain from the
   code-work broker. Signed and single-use claim/lease handling is still missing.
5. Canonical input and output Asset identity, provenance, independent QC and
   operator-preview action must be integrated into the live Omnira UI.
6. Do not enable creative execution in production merely because a signature
   check or local demo succeeds. Avoid self-granting by Atlas.

## State of verification

- Local P-256 receipt/replay tests pass with test-only ephemeral keys.
- Two editor applications installed, pinned and directly tested.
- No live Atlas -> isolated workstation execution; not production-ready.
