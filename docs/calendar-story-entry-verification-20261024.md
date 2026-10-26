# Calendar to story production: action entry repair, 2026-10-24

Local change only. No provider request, spend, remote schema write, push or deployment.

## Findings and repair

The existing `generate_monthly_story` governed effect is implemented. Its action-entry evidence gate nevertheless required structural validation and storyboard page-count evidence before generation. Validation itself also required the storyboard attestation. This created a circular prerequisite.

A server-owned policy now defers only downstream outputs when entering these two actions. It is restricted to the exact vendored monthly-release v2 definition, canonical stored and recomputed definition hashes, and content_generation state. Generation defers page count and structural validation in addition to its existing own-output exemption. Validation defers page count in addition to its own output, and still requires current, automated, passing generation evidence. All other actions and versions retain existing behavior. Unknown checks remain blockers.

Readiness also omitted attempt_group from its database projection, then passed an empty group to effect authorization. The projection now preserves the approved attempt identity.

No required check was removed, no pass fabricated, no transition changed, and no grant, licensed bind, spend, pause, fencing or financial rollout requirement relaxed. Existing v1 instances remain unchanged and cannot use the v2 generation contract.

## Verification

- 295 distinct tests passed across 11 relevant suites: story action entry (8), prerequisites (13), self-answered exemptions (33), spend/financial separation (27), story validation producer (41), provider wiring (31), story approval binding (24), action boundary behavior (27), gate advance (25), workflow machine (31), workflow action binding (35).
- The spend suite initially had two Windows tool failures. All 27 passed when run with the installed Git shell outside the sandbox; no source workaround was needed.
- TypeScript reports only the same three pre-existing lambda-render errors (missing @remotion/lambda/client and two unknown region properties).
- Independent code review found no blocking issues.
- Entry tests use a simulated authorization boundary and database. They prove evidence ordering, refusal behavior and projected attempt identity, not a real licensed bind or paid execution. Provider wiring is tested offline. The unchanged catalogue/evidence evaluator plus existing gate/transition suites verify completion requirements; no new end-to-end hosted execution proof is claimed.

## Remaining work

Calendar links are still planning. A purpose-scoped production preview and explicit authorization/start flow must derive the canonical job, show requirements/cost and preserve the execution grant boundary. Do not expose arbitrary authorization targets through HTTP. Media production beyond story generation and scheduled platform publication remain separate unfinished capabilities. Deployment and hosted verification remain outstanding.
