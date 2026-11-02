# Atlas Model Router V1A – release candidate (advisory only)

**Release intent:** code review, safe diagnostics and operator-only preview.
This is **NOT** the runnable Windows Code Broker V1B.

## Included features

1. Deterministic, versioned worker **candidate selection**, not dispatch.
   Candidate list contains local Ollama, Codex CLI and experimental Prime
   Agent; default uncertainty, task sensitivity, quality, independence and
   cost checks fail closed. The returned `dispatchAuthorized` is ALWAYS false.
2. Local desktop readiness report: the existing read-only
   `scripts/atlas-model-router/preflight.ps1` feeds the untrusted
   `desktop-snapshot.ps1`; its JSON is validated by
   `desktop-evidence.ts` and `preview-desktop-snapshot.mts`.
   The diagnostics must NEVER be promoted to trusted WorkPackage or SDF1
   model evidence. Local resource checks do not run models or guarantee
   any subscription balance.
3. The existing Code Broker settings page displays a new
   `OwnerSigningReview` section with read-only registration context.
   It hides host details from unauthorized/unreadable settings sessions,
   never displays challenge/pairing secrets, and has no approval or
   signing button. Existing enrollment/activation routes remain separate.
4. Small, scoped unit and UI regression suites. No new public API or DB
   migration is added by this V1A candidate.

## Deliberately DEFERRED from V1A

- Local TPM pilot key provisioning, signer executable, client registration,
  real KMS/HSM issuer, trusted enrollment or binary attestation.
- Synthetic owner-consent issuers, signed keyring rotation and their
  disposable PostgreSQL lab scripts. Keep them in the existing LOCAL
  worktree/checkpoint for separate security review and future V1B.
- Signed desktop broker evidence as an execution authority.
- Agent dispatch, autonomous Codex invocation, unattended API spending,
  automatic Git changes or broad repository access.

These extra experiments may be copied into a separate reviewed V1B
change set LATER. They are NOT prerequisites for this **read-only** V1A.

## Approval and deployment

No commit/push/PR/merge/deploy happens automatically. The existing branch
`codex/atlas-model-agent-router-20261022` must be reused. Run
`scripts/atlas-model-router/v1a-release-audit.mts` for a fixed file
inventory, verify manual security review, scoped typechecks and Vitest,
then request a distinct owner decision before Git staging/commit/push.

The full Next.js app build was NOT confirmed during the first pause
checkpoint because the Windows host has limited free RAM; V1A needs a
verified build/CI result before any production release. Do not claim the
site is already deployed.

## Important future safety dependency

Before V1B is allowed to act across Omnira projects, verify that every
code-work request and resulting evidence is scoped to a single
**server-authorized project and repository**, with non-overlapping
permissions, data access and spend ledgers. A global Atlas view does
not itself confer cross-project execution authority.
