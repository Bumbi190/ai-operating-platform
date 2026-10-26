# Family marketing repeat protection — 2026-10-26

User-approved: exact copies blocked, high text similarity held within inclusive 14 days, matched Facebook/Instagram campaign allowed. This change covers repeat protection; Instagram receipt reconciliation remains a separate follow-up. No additional publishing authority is granted.

## Implementation

The same database trigger gates manual and scheduled publication inserts and transitions to creating/publishing. Existing project locks serialize distinct new publication IDs. Normalized caption copies are blocked across retained applied/unresolved/in-flight history on the same project/account/channel, including approved queue entries. Near-copy screening uses word-trigram Dice >=0.80, or >=0.65 with the identical image hash. Captions with fewer than three normalized tokens require review. Image alone is not a block. Published receipt confirmation time is conservatively greatest(requested_at,updated_at), not a claimed provider timestamp; unresolved attempts remain in the near-copy comparison regardless of age. UI dates for unresolved comparisons retain original request time.

History is bounded to 2,000 candidates and 500 preflight posts; incomplete/unavailable history fails closed. These are deterministic similarity signals, not a semantic or altered-image guarantee. No paid model is used for screening.

Owner-scoped service-only preflight adds conflict reasons/references to the current revision's content review. Read failures, malformed data and revision drift produce review requirements. Calendar queued entries are orange when repetition checks require review, including RPC failure with no conflict reference. Published receipts keep their actual state.

## Verification

- Red SQL probe first failed because the new functions were absent. Red application tests reproduced absent conflict enrichment and incorrect queued calendar tone.
- 323 tests in ten focused suites pass: policy, schema security, migration security, enrichment, calendar mapping/progress, provider/executor, reconciliation provider and content validation.
- Independent TypeScript check passes. Production build passes with synthetic localhost public configuration; no production connection. Next's built-in type validation is skipped by existing config, so the independent check is material.
- 27 existing calendar browser tests pass. They are regression coverage, not a new end-to-end social review UI scenario.
- Isolated PostgreSQL behavioral probes cover normalized copies/new IDs, old copies, inclusive 14-day boundary, cross-channel/account/project scope, own receipt recovery, uncertainty, delayed confirmation, queue collisions, short text and different content. Two real independent connections race distinct IDs: one request commits and one is denied; exactly one row exists. No provider calls.
- Full177 recovered-ledger replay plus calendar migrations and repeat migration passes with the explicit historical baseline adaptations. Canonical service_role RPC probe exercises real plan/content save and approval, publication preparation, idempotent replay, claim_create→uncertain, duplicate and near-copy rejection, independent content admission, and exactly two preflight conflicts. Minimal-fixture race testing is distinguished from canonical RPC testing. Report: docs/validation/social-repeat-full-replay-20261026.json, failure:null. This remains an adapted local baseline, not a hosted parity claim.
- An initial canonical fixture used an invalid synthetic bound_by value; fixed to the existing user:UUID convention. Minimal fixture startup and qualified owner-helper issues were corrected; owned containers were removed after all runs.
- Two broader API integration suites require an older dedicated fixture not available in this checkout:13 cases did not run and are not counted as passes.
- Independent read-only reviewer found two initial P1s (short captions and request-time dating) and one P2 (calendar RPC-error tone). All fixed; final review found no remaining blocker. Reviewer inspected code but did not independently rerun tests.

## Existing queue audit

A credential-free, project-scoped read snapshot of 42 current posts/108 revisions and associated job/receipt metadata was evaluated in a separate owned local database. Synthetic owner identity replaced the real owner. Result: zero repeat conflicts, including zero conflicts among the36 queued jobs. No live job or post was changed. Snapshot/results remain local outputs, not public Git content. This only reports these configured deterministic checks.

## Release boundary

Migration CLI-scaffolded as20261026070303_family_social_repeat_guard.sql. Migration guard remains fail-closed at158 canonical/144 enforced names; actual180-name pre-apply production capture is explicitly rejected until the new name is present. Apply before code that calls the new RPC. Hosted ACL and post-apply queue checks are required at release. No attempt to clear or resend the October23 uncertain Instagram publication is included.

Automatic approval review rejected the attempted hosted migration: user approval was considered implementation-only, not explicit authorization for a persistent production publication-blocking trigger. No migration was applied; do not retry through another transport. Local implementation, review and queue audit are complete. Explicit deployment approval is the remaining release gate. Existing live jobs remain unchanged.

## Authorized release follow-up

The user then approved continuing in direct response to the concrete upload-and-deployment question. Branch upload succeeded and PR546 was opened. Hosted migration `family_social_repeat_guard` applied as version20261026073245. Post-apply preflight returned zero conflicts;36 queued jobs and one uncertain Instagram receipt remained unchanged. Only service_role may invoke the preflight; anon/authenticated cannot. No client role, including service_role, may invoke the trigger directly. Trigger existence confirmed. Security-advisor counts unchanged, no new repeat-function warnings. RPC type refreshed from the actual target generator. Code CI/preview and production promotion follow separately.
