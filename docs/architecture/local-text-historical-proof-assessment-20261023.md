# Atlas local model – historical unknown-outcome evidence review (P0)

Date: 2026-10-23
Scope: PURE, read-only structural candidate assessment. No endpoint, migration, incident action, worker enrollment, GPU inference, paid API call or model-router activation.

## Production evidence / historical blocker

- One `reconcile` and one `offline` incident remain OPEN in Omnira Selftest, created 2026-10-17 19:34 UTC.
- One local-text device is revoked/blocked; its admission revoked.
- The old canonical jobs and attempts have expired from retained live tables; their absence does not prove the original worker never dispatched.
- Two expired authority tombstones remain, including one with a quarantined device link. No paid cloud hold is reported.
- `public.local_text_eligible` is currently protected against a quarantined *device*, but not against a new device on a *project* that still has an unresolved reconcile incident. Verified from live production `pg_get_functiondef` and canonical SQL. A brand-new device is not a valid substitute for resolving the original claim.
- A proposed additive SQL repair was blocked by the security control of the authorized tool. **It was not applied, staged or merged. Do NOT route around that control.**
- Security backlog: https://github.com/Bumbi190/ai-operating-platform/issues/533

## New pure module

`apps/web/lib/local-text/recovery-evidence-review.ts` only checks the structural compatibility of an ORIGINAL canonical-attempt tuple with a claimed external receipt:

- Matching project, job, device, attempt, claim, selection and monotonic fence.
- Matching source content hash and model digest, strict UUID and hash shapes.
- Claimed outcome limited to completed, known_failed or not_dispatched. This is a claimed field, not verified fact.
- Declared receipt hash and signer descriptor have no cryptographic authority: no real signature check occurs here.
- Missing canonical job/attempt (the actual production case) is explicitly `CANONICAL_ATTEMPT_NOT_RETAINED`. A receipt cannot resurrect that authority.
- Even exact structural matching is `INDEPENDENT_VERIFICATION_REQUIRED`, never `resolved`.

**Every** result has `cryptographicSignatureVerified=false`, `historicalIncidentResolved=false`, `mayRetry=false`, `mayResume=false`, `mayEnroll=false` and `independentHumanReviewRequired=true`. The module has no I/O, database permissions or execution capability.

## Verification and staging

- Nine tests cover canonical retention loss, malformed evidence, each exact identifier/hash/fence mismatch, all three claimed outcomes, forged approval flags, and no identifiers or secrets returned.
- Existing local-text read-only status and both frozen SQL migration integrity tests are green; 22/22 combined relevant tests passed.
- Scoped strict TypeScript check PASS.
- PR is for advisory evidence-contract code only. It should not be treated as a deployable reconciliation controller.

## Requirements BEFORE a genuine new local pilot

1. Security change #533: project-scoped incident hold at the authoritative service-only admission/eligible/dispatch boundary, with reviewed migration, fail-closed tests across multiple different device IDs and proper production ledger verification.
2. Independently attested origin evidence with exact canonical project/job/attempt/claim/fence/model/input/result binding. Cryptographic verification must occur in a trusted server boundary, not from text fields and never from a self-asserted flag.
3. Historical missing evidence must remain UNKNOWN with reviewable incident record; no automatic completion, refund, quarantine clearance or replacement dispatch.
4. Owner decision for a NEW, synthetic, bounded pilot only after separate registration, proof-of-possession, project admission, reviewer, worker lifecycle and stop-gate checks. The revoked identity must remain revoked.
5. The host requires >=4096 MiB available RAM and actual bounded Qwen inference success. Local Ollama health alone is insufficient; no automatic process termination, driver change or public listener.
