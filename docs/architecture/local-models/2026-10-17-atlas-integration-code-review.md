# Atlas local-text integration — final independent code review

Review range: `3349c8a421b42c95408439c99ba5fb75722a7b6e` → `5867b62cddb087340df8d3ebdfe1ce030d74f73e`, branch `codex/atlas-local-text-integration-20261017`, repository `Bumbi190/ai-operating-platform`.

I applied the requesting-code-review Senior Code Reviewer template myself, with no further reviewers or subagents. I verified the authoritative Windows worktree HEAD and clean status, read its source without modifying checkout/index/branches, and reviewed an external scratch snapshot. The first migration was fetched at the exact head after Windows temporarily denied a file read. I read the binding design, implementation plan, final package, verification record, and all ledger Ruling lines. Review covered actual contracts, both migrations and their final function definitions, signed API/owner boundaries, worker/runtime/context proof, continuation/budget/provider integration, receipt/review UI, startup supervision, and relevant tests. No production, paid-provider, GPU, installation, or full-suite calls were made. One isolated, mocked Node probe confirmed that runtime initialization failure prevents journal expiry cleanup; it performed no network or inference.

## Strengths

- The signature domain binds HTTPS origin, raw-body hash, operation, device/key/build, nonce, and counter. The SQL operation rechecks device authority while consuming replay state atomically, rather than treating signature verification as authorization.
- The bounded inference path counts the actual escaped raw prompt and schema, reserves 384 output tokens within 4096, requires artifact-backed byte-token coverage, and fails closed on missing proof. The runtime checks exact identity and observed GPU residency around inference.
- Unknown inference preserves the local lease and encrypted journal. The supervisor uses an owned Windows Job Object and does not turn a missing PID or local kernel proof into remote dispatch permission.
- Cloud requests reuse the governed run/spend boundary and private, payload-bound input-ceiling grants. Explicit cloud authorization is separate from monetary caps. Unique cloud stages and metadata-only canonical run inputs are useful safeguards.
- Durable chat tool data excludes raw source/results; current owned reads and expiry gates control display. Human approval uses source/result hashes and a versioned canonical approval transition, and cannot authorize business side effects.
- Evidence documentation distinguishes mocked providers, historical GPU results, current qualification, fixture UI, missing live admission, and inherited failures. Default-disabled routing and the empty reviewed-head catalog/cloud profile prevent unqualified activation.

## Issues

### Critical (must fix)

None identified at Critical severity. The Important findings below violate required lifecycle, authority, privacy, or integration behavior and should be fixed before merge. Their severity reflects suggestion-only output and the bounded pilot, rather than treating every defect as catastrophic.

### Important (should fix before merge)

#### I1 — A finalized cloud receipt can publish after admission/device revocation or evidence drift

- **Files:** `apps/web/supabase/migrations/20261017115403_atlas_local_text_lifecycle.sql:206,239–249`; related `20261017090351_atlas_local_text.sql:680–690` (`local_text_cancel_cloud_runs`); `apps/web/lib/local-text/cloud-runs.ts:81–82`.
- **Trigger:** The review response is saved and its canonical run is finalized `done`; before the separate `apply` transaction, the owner revokes its admission/device, or a heartbeat changes the admitted runtime evidence. Then `apply` runs.
- **Finding:** Application checks the old run/claim, `cancel_requested`, source expiry and hashes, but never current device/admission/evidence authority. Revocation delegates to canonical `request_run_cancel`, which deliberately does nothing to `done` runs (also present verbatim in the fixture at `local_text_base.sql:65–77`). Thus revocation can complete before `apply`, while the old approved receipt still changes the job to `succeeded`. This is a sequential counterexample, not merely a speculative race. The human approval function also checks device/admission evidence without locking those rows (`lifecycle.sql:103–113`); the separate human run created for a completed unknown review is not included in `local_text_cancel_cloud_runs`, leaving a corresponding concurrency gap.
- **Impact:** A user who revoked an old device/model can receive a newly successful result from that invalid authority. This directly violates Review Focus 4.
- **Fix:** Revalidate current publication authority at the final state change, under an explicit consistent RUN → DEVICE/ADMISSION → JOB lock order, including the human-review path. Include standalone human runs in revocation. Preserve historical receipts without granting fresh success. Add sequential finalized-run-then-revoke-then-apply and concurrent drift/revoke-versus-human-approval SQL cases.

#### I2 — Metadata retention deletes unresolved fences and unknown-spend holds

- **File:** `apps/web/supabase/migrations/20261017115403_atlas_local_text_lifecycle.sql:322–336`, particularly deletion of reservations/stages/attempts at 331–333; retention limits at 34–37.
- **Trigger:** A local attempt is `reconciling`, or a cloud stage is `unknown`, when the job metadata deadline arrives. This can occur after a one-day project policy, or at a short admission expiry, while the device and another/new admission remain usable.
- **Finding:** Metadata purge deletes every reservation, stage, attempt, and job regardless of unresolved physical outcome. It neither quarantines/revokes the still-valid device nor transfers its uncertainty hold to an independent tombstone. The attempt row is what enforces `local_text_one_device_flight`; deleting it removes that server fence. Removing the job also removes its idempotency identity; removing an unknown reservation releases the conservative financial hold without settlement.
- **Impact:** Retention itself becomes an unverified reconciliation operation. A later request can be treated as new while prior physical work/spend remains unknown, contrary to Review Focus 2 and 5 and the explicit unknown-hold Rulings. The local disk lock is useful defense but does not preserve the lost server authority or cloud reservation.
- **Fix:** Erase raw data on schedule, but atomically preserve a minimal non-content uncertainty/quarantine state outside expiring job lineage, or revoke/quarantine the device before deleting that lineage. Unknown cloud liabilities need an independent accounting hold until settled. Maintain a defined expired-request replay policy. Test purge of unknown local/cloud attempts with a still-valid device, another admission, and replay of the old key; no new physical authority or budget headroom may appear.

#### I3 — A known failed local inference never reaches fallback or the human terminal path

- **Files:** `apps/web/supabase/migrations/20261017090351_atlas_local_text.sql:195–198`; `apps/web/lib/local-text/cloud-runs.ts:32`; `apps/web/supabase/migrations/20261017115403_atlas_local_text_lifecycle.sql:126–179,260–271`.
- **Trigger:** A started local inference terminates definitively but returns invalid schema, or another permitted `known_failed` outcome is acknowledged.
- **Finding:** The transition only writes `escalation_pending`. Unlike successful completion, it creates no canonical continuation. The only production call to `advanceLocalText` is after applying an existing cloud stage; no cloud stage exists for this failure. Maintenance does not sweep `escalation_pending`, and status reads do not advance it. The worker clears its acknowledged journal and moves on.
- **Impact:** The user sees “preparing fallback” until payload expiry, with neither the allowed cloud fallback nor the human-mode `needs_input` transition. This breaks an ordinary promised failure path, not only a crash edge case.
- **Fix:** Make known-terminal local failure create durable bounded continuation work in the same transaction, or provide an idempotent scheduled advancement sweep. Respect the different pre-dispatch/started certainty cases and all existing budgets. Test a real failed local SQL transition followed only by the normal drain path, with both governed and human admissions, without calling `advance` manually from the test.

#### I4 — Finalization and job application have an unrecoverable crash window

- **Files:** `apps/web/lib/local-text/cloud-runs.ts:32–43,67–68,79–83`; `apps/web/app/api/runs/drain/route.ts:162–163,249–254`; `apps/web/supabase/migrations/20261017115403_atlas_local_text_lifecycle.sql:126–179`.
- **Trigger:** The process dies, the RPC fails, or the response is lost after canonical finalization to `done`/`awaiting_approval` but before the corresponding stage `apply`; similarly, a local review is applied as rejected but the following `advanceLocalText` call fails.
- **Finding:** The saved-response recovery branch is only reachable for an owned `running` run; its checkpoint/snapshot reject an already finalized run. Normal drain claims runnable runs, not completed/awaiting-approval ones. Maintenance has no scan for these staged-but-unapplied terminal runs or stranded escalation states. Calling the SQL apply RPC directly is idempotent, but no durable production driver will call it after this interruption. The return value of `advanceLocalText` is also ignored.
- **Impact:** A valid result or human review can remain permanently hidden/unqueued until expiration, while Activity shows a completed run. The split transaction protocol does not yet provide the promised durable receipt/recovery semantics.
- **Fix:** Add an idempotent finalization/application recovery driver, or atomically integrate the local stage application with canonical finalization through an authorized SQL boundary. Never redispatch the provider during recovery. Fault-inject after each committed boundary and verify a fresh normal drain invocation completes bookkeeping exactly once.

#### I5 — Creating a local job prevents the user from deleting its conversation

- **File:** `apps/web/supabase/migrations/20261017090351_atlas_local_text.sql:27` (`conversation_id ... references public.conversations(id)` with default NO ACTION).
- **Trigger:** The owner uses the existing conversation DELETE endpoint after any local-text job has been created, including a completed job whose raw payload has already expired.
- **Finding:** The unchanged `apps/web/app/api/conversations/[id]/route.ts` deletes the conversation directly and reports DB errors as HTTP 500. The new non-null FK blocks that delete until the local job's metadata is physically removed. There is no deletion integration or tombstoning path in this change.
- **Impact:** An existing user operation regresses, potentially for up to 90 days, and source deletion is not actually exercised by merely setting the local job payload to null in tests. Users cannot remove the original conversation through the normal UI/API.
- **Fix:** Integrate conversation deletion with immediate raw-content withdrawal, cancellation and expired-approval handling, while preserving unresolved fences and financial truth. Do not blindly cascade away unknown-attempt protection. Test the real owned conversation DELETE operation with queued, reviewing, succeeded, and uncertain local jobs.

#### I6 — Crash/uncertainty prevents the worker's raw journal from ever expiring

- **Files:** `workers/local-text/worker.mjs:66–83`; `workers/local-text/runtime.mjs:24`; `workers/local-text/scripts/start-worker.ps1:20–21`.
- **Trigger:** A worker leaves a raw DPAPI attempt journal and uncertainty lock, then crashes or stops. The journal deadline passes and the supervised service is started again.
- **Finding:** Raw erasure exists only in `reconcilePending`. Supervised startup refuses to start the worker whenever any journal/lock exists. Even direct `runWorker` performs `runtime.initialize` before journal reconciliation, and initialization requires the blocked runtime lease. Therefore the expiry branch is unreachable in exactly this recovery case. An isolated mocked probe returned `LOCAL_BUSY` with zero journal reads/writes. Current tests invoke `reconcilePending` directly and do not cover the real startup ordering.
- **Impact:** Recoverable source/result ciphertext remains indefinitely under the same Windows account instead of being removed by the promised retention deadline. Preserving an uncertainty hold does not require retaining its raw payload. This is separate from the deliberate manual-unlock policy.
- **Fix:** Run a content-erasure-only journal maintenance step before runtime initialization/start refusal, preserving the metadata hold and never clearing the physical lock or acknowledging success. Provide periodic expiry while the supervisor is paused if retention must continue during that state. Test the actual paused/restart flow with an expired journal and a byte-preserved uncertainty lock.

#### I7 — The explicit changed-project idempotency requirement is not implemented

- **Files:** `apps/web/supabase/migrations/20261017090351_atlas_local_text.sql:37,94–99,743–745`; `packages/local-text-contract/index.mjs:34` (`hashTask`).
- **Trigger:** The same owner reuses the same UUID key and task in the same conversation but changes to another owned, admitted project.
- **Finding:** The lookup, advisory lock, and uniqueness constraint all include project ID. The old request is consequently reported absent, and the second project can enqueue another job. The task hash binds schema/source but not request scope. Cross-owner refusal tests do not test this case.
- **Impact:** Review Focus 1 explicitly says changed source/project/schema under the same key must fail; this implementation can create another execution for an accidentally changed project. The plan's scoped unique-key bullet conflicts with that stronger review requirement, so this is also a plan inconsistency requiring an explicit ruling rather than silent acceptance.
- **Fix:** Establish an owner-scoped request-key identity with immutable project/conversation/task-schema binding, and reject changed scope before enqueue; preserve legitimate distinct requests using distinct UUIDs. If the intended contract is instead independent project-scoped keys, explicitly resolve the requirement conflict and document/test that product behavior. Add a same-owner/two-owned-projects regression.

#### I8 — The prepared “complete-path” E2E bypasses the continuation boundary it needs to prove

- **File:** `apps/web/lib/local-text/__tests__/integration.test.ts:58–59`.
- **Trigger:** The current opt-in hardware test reaches a real local completion.
- **Finding:** The harness manually updates `runs` to `running` and `awaiting_approval`, and calls `local_text_cloud_operation` directly. It never invokes canonical claiming or `executeLocalTextCloudRun`/canonical finalization for the human-review continuation. Separate unit tests mock those canonical functions. This allows the test to pass while I3/I4 remain broken.
- **Impact:** Even a successful current hardware run establishes transport/GPU/SQL/approval fragments, not the specified complete normal Atlas-to-reviewed-receipt path. This is material because this is the only final code review and the remaining E2E is meant to close readiness.
- **Fix:** Drive the actual canonical continuation executor against the isolated SQL fixture and real canonical lifecycle functions, without manual terminal-state fabrication. It can use the explicit human mode with zero paid calls. Add boundary interruption cases without repeating expensive GPU evaluation. Continue labeling the existing test accurately until that seam is covered.

### Minor (nice to have)

#### M1 — Receipt polling stops while a human decision can still change the job

- **Files:** `apps/web/lib/local-text/receipt.ts:17`; `apps/web/lib/local-text/receipt-poll.ts:26`.
- **Trigger:** The receipt first reaches `needs_input`; the owner subsequently approves it in another tab/view while the conversation stays mounted.
- **Finding/impact:** `needs_input` is not active for polling, so the mounted receipt continues asking for review and never displays the newly approved result until reload/remount. A pending human review is not a terminal lifecycle state from the user's perspective.
- **Fix:** Poll bounded pending human-review states, revalidate on focus, or explicitly refresh affected receipt subscriptions after a review decision. Distinguish a terminal rejected/no-further-action `needs_input` from an outstanding review where necessary.

## Recommendations and verification expectations

Use the one authorized blocker-fix pass to add genuine transition/race regressions, especially revocation after canonical finalization, unknown retention with a still-active device, normal fallback after known failure, and process restart between finalization/application. Preserve all default-off/qualification/price/unknown-dispatch gates. Do not resolve these by making old signatures, stale admissions, unknown outcomes, or missing qualification acceptable.

Fixes touching any file included by `computeAdapterHash` invalidate the current release identity. Recompute exact identity and obtain the relevant new empirical/independent evidence before populating an admitted catalog; an earlier quality pass cannot silently transfer. SQL/UI-only fixes still need their affected real SQL/browser checks. No second review seat is requested by this report.

The executor reports focused 343 PASS + 3 opt-in skips, security/schema/migration/authority 295 PASS, Windows 132 PASS + 1 existing skip, fixture-browser 4 PASS, typecheck/build exit 0 with the documented nonlive public fixture settings, and full-web 12,776 PASS / 399 inherited FAIL / 1,329 skip with no new failure names/files. I did not rerun or independently certify those logs. These totals do not cover the concrete counterexamples above. Native build without public configuration and actual production configuration remain distinct claims.

## Declined to judge

Every considered behavior set aside is listed here so the executor can rule explicitly:

- **Current release model quality and the newly added static catalog:** the executor reports a fresh 9B/classify 25/25 pass after this review snapshot. I did not inspect that full independent evidence or the later catalog diff; no eligibility approval is conveyed by this code report.
- **Actual final tool → signed HTTPS → SQL → GPU → independent review run:** at report delivery, the executor reported both signed-GPU phase 1 and independent exact-pair → owner approval → receipt → expiry phase 2 passing at zero cost, while explicitly retaining the manual canonical-run-state bridge. I did not independently observe those runs. This is useful fragment-level evidence; the concrete continuation omission in I8 remains.
- **Live cloud quality, provider token-envelope proof, prices at actual activation, and metered costs:** the reviewed cloud profile is null and paid calls were prohibited. Static fail-closed routing was reviewed; real provider eligibility was not.
- **Production/full historical schema replay:** only the stated isolated parent-contract fixture evidence exists here. I inspected the new SQL and schema-guard deltas, but cannot infer production migration compatibility from that fixture. Conversation deletion is not set aside; it is I5.
- **Installation, reboot/login behavior, persistent identity provisioning, and production admission:** explicitly gated and unperformed; current-user AtLogOn is correctly limited to after login, not pre-login service.
- **Automatic unlock after unknown physical dispatch:** the ledger explicitly chooses operator action. I accept that conservative availability limitation; I do not accept retaining raw content forever (I6) or losing server uncertainty via retention (I2).
- **Automatic replay of known terminal journals after supervised restart:** startup currently pauses on any journal, even a complete saved payload. I set the extra manual recovery inconvenience aside as consistent with the conservative startup posture, provided it is documented and raw erasure is fixed. I did not treat it as evidence of automatic recovery.
- **Resistance to a malicious process with the same Windows user, hardware attestation, or a general filesystem sandbox:** neither the CNG/DPAPI mechanism nor observed runtime checks claim those guarantees. They are not prerequisites for the approved current-user pilot threat model.
- **Generic arbitrary-text admission and raw result delivery back into the general chat model:** explicit Rulings restrict this pilot to exact approved task hashes and metadata-only tool history. Those usability limitations are deliberate and preserve the stated retention boundary.
- **Human rejection automatically counting toward the three-in-twenty quality pause:** current human decisions have only a generic reject reason, whereas the pause deliberately counts metered, reason-coded semantic quality verdicts. I did not equate a generic owner rejection with verified model-quality failure; this narrower behavior should remain explicit when describing human-only operation.
- **Warm-model optimization:** `current_model_digest` is read by selection but not maintained by heartbeat in this slice, so normal selection cannot benefit from warm reuse. I set this optional optimization aside; required eligibility checks remain independent of it.
- **Conservative byte-budget refusals and duplicated schema charging:** these can reject valid longer text but safely enforce the bound; the specification permits explicit refusal and forbids silent truncation.
- **Three-second Windows health-probe reliability and daily cold-start latency on this machine:** the helper path was inspected, but I made no GPU/process probes or new timing measurements. Historical benchmarks are not fresh daily-latency evidence.
- **Inherited unrelated web failures and the two no-public-env auth prerenders:** reported baseline comparison attributes them to existing conditions. I did not repair or independently reproduce unrelated suites; the branch must not be described as all-green.
- **External notifications, Codex code-worker dispatch, voice/studio expansion, general local conversation, or business actions:** explicitly excluded from this narrow integration. No support for them is inferred from labels or model names.

## Assessment

**Ready to merge? No.**

The implementation has strong fail-closed foundations, but unresolved retention can erase authority holds, publication can outlive revocation, and several ordinary/crash continuations have no durable driver. Fix the Important findings and finish accurately scoped current-identity development evidence before claiming completion. Starting this single review while immutable empirical evidence finishes is a defensible scheduling change; it is not evidence that Task 12 is complete, and later catalog/evidence changes or source fixes do not inherit an unqualified approval from this report.
