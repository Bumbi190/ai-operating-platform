# Atlas Model/Agent Router (P2-P3, advisory only)

This directory is a zero-I/O, deterministic **candidate selector**. It is not
a new authority boundary and cannot cause an AI call, file edit, merge, deployment,
API spend, credential access or network request. Its `dispatchAuthorized`
field is always `false`.

## Architecture

- `catalog.ts`: reviewed allowlist of worker **identities** and provisional task suitability.
  Provider and harness are different: Abacus is a coding harness, not a model.
- `route.ts`: versioned decision + rejection reasons. Requires independently
  refreshed evidence, validated request, sensitivity guard and spend policy.
- `routeIndependentReviewer()`: excludes both the author's provider and
  underlying model lineage; an Abacus wrapper that may itself use Codex is
  therefore **not** automatically an independent reviewer.
- Existing SDF-1A `CLAUDE_PATCH_V1` and its admission/authorization contracts
  are **unchanged**. Do not change this module into SDF1 admission without an
  approved new-version worker contract and test audit.

## Readiness from the actual desktop host

The Windows read-only preflight is
`scripts/atlas-model-router/preflight.ps1` in the repo root.
A running local Ollama server is NOT enough: it must return a successful
inference with GPU/RAM within limits before its `inferenceSmokePassed`
can be set true.

Codex login alone does NOT prove available quota. 2026-10-22: a one-time
`codex exec --ephemeral --ignore-user-config --sandbox read-only` in a
temporary directory succeeded via ChatGPT authentication. Evidence expires.
Abacus CLI requires login, and commercial terms and model lineage are
not yet attested on this computer.

## Routing policy

Select cheapest *qualified* candidate only, not cheapest advertised model.
`qualityTier` is a conservative provisional policy value, **not** a
measured benchmark. Calibrate against evaluation tasks before allowing
automatic production work.

Metered providers require the trusted caller to report a positive
per-task estimate, an actual previously approved budget and hard spend
enforcement. Even if selection passes, authoritative `reserveSpend`,
project scoping, human consent and independent review MUST be enforced
again at dispatch time by the trusted broker.

Unknown cost, entitlement, local smoke, stale observation, conflicting
readiness evidence, invalid runtime inputs or restricted remote data
always blocks selection. No silent paid fallback.

## Next work to activate

1. Diagnose Ollama CUDA JIT memory allocation failure while other desktop
   work is active; don't stop Docker/WSL/Brave/other agents automatically.
2. Have the owner log in to Abacus without copying tokens into Omnira.
3. Supply signed/attested host evidence through existing authenticated
   desktop broker; Vercel cannot reach 127.0.0.1 on the user's PC.
4. Extend SDF-1A with a separately reviewed worker-adapter version,
   entitlement checks and hard budget gate; no bypass of existing authority.
5. Add one independent review worker with attested actual underlying model,
   then verify complete flow in staging with reviewer and human gate.

## Testing

From `apps/web`:
```powershell
node ../../node_modules/vitest/vitest.mjs run lib/qa/atlas-model-router.test.ts lib/qa/sdf1a-code-work-contracts.test.ts lib/qa/spend-budget-gate.test.ts
```
