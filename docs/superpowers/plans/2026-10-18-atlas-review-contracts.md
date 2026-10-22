# Atlas Review Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and test the execution-free contracts for version-bound independent review and job-scoped agent messages, without activating a reviewer, model call, write permission or production gate.

**Architecture:** Add focused pure modules under code-work/review, following the existing CodeWorkValidation pattern. Canonical hashes bind validated, available artifacts to one candidate; a separate reviewer result and message reducer are checked against explicitly supplied observations. This is foundation software with no production caller, not proof of authenticated provenance, durable delivery or a working autonomous code job.

**Tech Stack:** Existing TypeScript, node:crypto hashing via canonicalTargetVersionHash, Vitest. No new package, service, database migration or CI workflow.

**Spec:** docs/superpowers/specs/2026-10-18-atlas-independent-review-design.md (written version approved 2026-10-18 19:57 Europe/Stockholm), plus docs/superpowers/specs/2026-10-18-atlas-first-code-job-design.md.

## Global Constraints

- Preserve the selected Native execution method: inline implementation, one fresh independent whole-range review at the end. Do not ask to reselect a method.
- Start from codex/atlas-code-worker-design-20261018 at 2eff40d8a6091d25ac5be632c6a139ca95489295 in the existing isolated worktree. Commit locally; do not push, merge, deploy, register a host or grant production authority.
- This is Plan 1 of the approved review design. It implements contracts and deterministic decisions only. Protected Windows workspace/real sandbox execution remains a prerequisite to any future operational code job.
- First scope: Omnira only, one work item, one worker, one separately assigned reviewer. No generic agent framework or recursive spawning.
- Existing maxima: maxWorkerIterations 2, maxChangedFiles 8, maxDiffBytes 131072, maxTotalRuntimeSeconds 1200. New maxima: 2 review sessions, 3 model dispatches per session, 12 internal messages per job, 4096 UTF-8 bytes per message body, 65536 UTF-8 bytes per review context, 32768 UTF-8 bytes per result.
- Validation may tighten limits, never raise them. All counters are finite nonnegative safe integers; zero cost allocation cannot permit a paid dispatch. No actual model/paid probe is included.
- Reuse CodeWorkValidation<T>, CodeWorkPolicyViolation, evaluateRepoPath, SDF1_LIMITS and canonicalTargetVersionHash. Do not alter existing admission, receipt-class or lifecycle vocabularies to imply review is wired in.
- No subprocess, filesystem, HTTP, database, model SDK, clock, random-id generation, tool execution or authorization grant inside the new pure modules. Explicit observations/time/ids enter through parameters.
- Distinguish untrusted model/message data from supplied trusted-context projections in types and comments. Those projections are not authenticated by this library. Later server/storage boundaries must derive them independently, not deserialize them from a client.
- No full-repository run or paid CI. Focused suites and both existing typechecks are the verification gate; broader known baseline and Windows-only native coverage remain explicit limitations.
- No source refactoring or repairs to the prior phase's deferred minors.

## Scope split and dependencies

| Plan | Deliverable | Status in this plan |
|---|---|---|
| 1: this document | Frozen review packet contract, review validation/eligibility, bounded message reducer | Implement |
| 2: durable control plane | Database transactions/RLS, authenticated assignment and artifacts, delivery/recovery, operator read projection | Deferred; needs its own inspected plan |
| 3: worker/reviewer execution | Sandbox-backed source/test proof, reserved spend, bounded dispatch/session state and first-assessment isolation | Deferred; needs Windows execution proof first |
| 4: Atlas and integration boundary | UI/status and exact human review; later separately authorized integration/PR/publish | Deferred; no integration authority here |

The code can demonstrate rejection of conflicting supplied evidence. It cannot authenticate a claimed actor, prove an OS file came from Git, make an in-memory replay durable, reserve real money, or prevent an existing runtime path from bypassing a gate that is not yet installed. Reports must name these gaps.

## Review Focus

1. Two candidates can have identical diff text but different test results, base, authority or policy. Every material change must invalidate review; Task 2 tests each.
2. A model may claim another reviewer or insert an informal approval in a message. Identity matching and message text must never create authority; Tasks 3/4 test this.
3. Missing artifacts, case-alias paths and empty/skipped required tests can look green. They must block rather than truncate/normalize away ambiguity; Tasks 1/2/3 test this.
4. A duplicate message can arrive after the job has stopped, or its id can be reused with different text. Only an identical stored duplicate is an inert replay; conflicting or new stale input is rejected; Task 4 owns this.
5. A future caller could mistake pure eligibility for production permission or let caller-supplied observations authorize themselves. New modules must remain unreferenced by operational code, with explicit non-authority outputs; Task 5 verifies this boundary.

---

## File map and shared contracts

Create under apps/web/lib/atlas/code-work/review/:
- types.ts: closed DTO/types and constants only.
- validation.ts: common exact-key, primitive, hash, byte and immutable-copy checks.
- binding.ts: work/assignment/context validation against supplied expected admission.
- snapshot.ts: artifact closure, canonical packet construction and size/hash validation.
- result.ts: bounded model report parsing and separate-actor/result-version checks.
- eligibility.ts: pure review-eligibility decision, never runtime authority.
- messages.ts: closed message DTO and immutable append/replay decisions.

Create tests:
- apps/web/lib/qa/fixtures/sdf-review-fixtures.ts: deterministic synthetic admission, assignments, candidate/artifact and time fixtures; no I/O or random ids.
- apps/web/lib/qa/sdf-review-binding.test.ts
- apps/web/lib/qa/sdf-review-snapshot.test.ts
- apps/web/lib/qa/sdf-review-result.test.ts
- apps/web/lib/qa/sdf-review-messages.test.ts
- apps/web/lib/qa/sdf-review-contract-flow.test.ts
- apps/web/lib/qa/sdf-review-boundary.test.ts
- docs/verification/2026-10-18-atlas-review-contracts.md

Do not create an index barrel, app/API route, production importer, table, provider registration or migration. Later plans own wiring.

**Common exact values:** SHA256 lowercase 64 hex; Git SHA lowercase 40 hex. Ids match [A-Za-z0-9_.:-]{1,128}. Timestamps are exact UTC yyyy-MM-ddTHH:mm:ss.sssZ with real calendar validation. Paths use existing lexical policy, plus reject colon, trailing-dot/space segments, tilde aliases and duplicates under NFC plus lower-case comparison. This is lexical Windows ambiguity rejection, not realpath proof.

**Data shapes** (all nested DTOs use exact keys; no extra fields):
- ReviewBindingV1: schema='atlas.code_review_binding.v1', workId, projectId, repositoryId, missionId, missionVersion, missionHash, admissionHash, delegationHash, workPackageHash, baseSha, targetRef, targetHeadSha, policyHash, reviewSettingsHash.
- ReviewAssignmentV1: workId, projectId, coordinator={actorId,sessionId}, worker={actorId,sessionId}, reviewer={actorId,sessionId}, claim={id,fence,expiresAt}, policyHash. All three actor ids and all three session ids must be pairwise distinct. fence and missionVersion are positive safe integers.
- ReviewArtifactV1: id, kind ('brief'|'source_before'|'source_after'|'diff'|'stdout'|'stderr'), body. Input carries content, not a trusted hash. Built artifacts add server-computed sha256 and byteLength.
- ReviewFileV1: path, beforeArtifactId:string|null, afterArtifactId:string|null. Both null is invalid; create/delete have exactly one null. Source artifacts must have the corresponding kind; no links/binary/NUL content. Require 1–8 genuinely changed file pairs and a nonempty diff; before/after bodies must differ when both exist. An empty source file and empty stdout/stderr are valid text.
- ReviewCheckV1: commandId, registryHash, argvHash, exitCode:number|null, outcome:'passed'|'failed'|'skipped', passedTestCount:number|null, durationMs, stdoutArtifactId, stderrArtifactId. Counts, outcome and required minimum are compared to ExpectedReviewContext; do not assume a typecheck is a counted test suite.
- ReviewSnapshotInputV1: schema='atlas.code_review_snapshot.v1', binding, assignment, candidateVersion (1|2), briefArtifactId, files, diffArtifactId, diffBytes, checks, artifacts.
- ReviewSnapshotV1: normalized packet plus snapshotHash. Compute rather than trust diffBytes and artifact hashes. Sort files by exact path, checks by commandId and artifacts by id (ordinal string comparison, not locale-dependent sorting); preserve body bytes. Reject duplicates before sorting.
- ExpectedReviewContext: admission:CodeWorkAdmissionV1, assignment:ReviewAssignmentV1, policyHash, targetHeadSha, nowMs, cancelled:boolean, claimValid:boolean, requiredChecks:{commandId,commandVersion:1,arguments:Record<string,string>,registryHash,argvHash,minPassedTests:number|null}[], limits:{maxReviewSessions,maxModelDispatchesPerSession,maxMessages,maxMessageBodyBytes,maxContextBytes,maxResultBytes}, budget:{totalMicrousd,reviewerAllocationMicrousd,spentMicrousd,reservedReviewerMicrousd}, deadlineMs. Review limits are positive safe integers <= their fixed maxima. reviewSettingsHash is canonicalTargetVersionHash({limits:context.limits,totalMicrousd:context.budget.totalMicrousd,reviewerAllocationMicrousd:context.budget.reviewerAllocationMicrousd}); changing allocation/limits invalidates the packet, while ordinary spent/reserved counters and observation time do not form its identity. All supplied projections are testable expectations, not independently verified evidence.
- ReviewFindingV1: id, severity:'critical'|'important'|'minor', artifactId, path:string|null, line:number|null, trigger, impact, evidence, suggestedCorrection. path must refer to a snapshot file and line is positive when present; null is allowed for non-file artifacts.
- ReviewModelResultV1: schema='atlas.code_review_result.v1', snapshotHash, phase:'preliminary'|'final', decision:'passed'|'changes_requested'|'inconclusive', findings, gaps:string[], pendingQuestionIds:string[]. Identity/claim fields are deliberately absent from model output.
- BoundReviewResultV1: model result plus assignment and resultHash constructed from supplied assigned context; no caller-selected identity in the model body. This is a bound contract, not a signed/authenticated runtime receipt.
- ReviewEligibilityDecision: {eligible:boolean,productionAuthority:false,reasons:string[],minorFindingIds:string[]}. No human authorization, lifecycle transition or write permission is returned.

Before hash/copy, reject undefined, sparse arrays, non-finite numbers, unsupported values and oversized input; return normalized fresh objects deeply frozen so later mutation cannot silently preserve a pin. Plain parsed-JSON data is the supported boundary; this is not a hostile JavaScript object/proxy sandbox.

## Task 1: Policy, binding and supplied-context validation

**Interfaces**
- Produces REVIEW_CONTRACT_LIMITS, ReviewBindingV1, ReviewAssignmentV1, ExpectedReviewContext and types above.
- validateReviewContext(input:unknown):CodeWorkValidation<ExpectedReviewContext> (shape and cross-field consistency only; stopped observations remain representable)
- validateLiveReviewContext(context:ExpectedReviewContext):CodeWorkValidation<ExpectedReviewContext> (cancel/claim/expiry/deadline checks)
- reviewPolicyHash():string, computed from the fixed schema/version and REVIEW_CONTRACT_LIMITS
- validateReviewBinding(input:unknown,context:ExpectedReviewContext):CodeWorkValidation<ReviewBindingV1>
- validateReviewAssignment(input:unknown,context:ExpectedReviewContext):CodeWorkValidation<ReviewAssignmentV1>
- Binding/assignment validation compares exact admission/governance/repository pins, admission canonical hash, targetRef, policy, reviewSettingsHash and current assignment. Binding/snapshot creation requires validateLiveReviewContext to pass; duplicate message replay does not renew liveness. Validate expected admission through existing validateCodeWorkAdmission, not a new looser admission parser.

- [ ] Write fixture builders makeReviewContext(), makeReviewBinding() and makeReviewAssignment(), returning fresh deterministic data; tests valid_binding_matches_admission, foreign_project_rejected, authority_pin_changed_rejected, same_actor_or_session_rejected, expired_claim_and_cancel_rejected, nonfinite_or_raised_limits_rejected.
- [ ] Test exact constants 2/3/12/4096/65536/32768 against spec and existing 2/8/131072/1200 limits. totalMicrousd and reviewerAllocationMicrousd must be positive, allocation <= total; spent/reserved are nonnegative, reserved <= allocation and spent+reserved <= total. Negative/unsafe numbers reject; a zero reservation is representable after a finished review, not permission for another paid dispatch. deadline <= now, expired claim, cancelled and claimValid=false fail validateLiveReviewContext. Strictness must not treat a caller flag as a cryptographic proof.
- [ ] Run: npm exec --workspace=apps/web -- vitest run lib/qa/sdf-review-binding.test.ts --maxWorkers=2 --minWorkers=2. Expected: RED absent modules/exports; inspect real output.
- [ ] Implement types.ts, validation.ts and binding.ts with exact signatures and closed DTOs; reject unknown and missing keys recursively. Use existing validation errors, no raw input in error detail. Check command ids/version/typed arguments using lookupCodeWorkCommand and resolveCommandInvocation; registryHash must equal codeWorkCommandRegistryHash(), admission registry pins must match, and argvHash is canonicalTargetVersionHash(resolved.value.argv). minPassedTests is a positive integer for sdf1.proof.fixture_test and null for sdf1.proof.typecheck. policyHash must equal reviewPolicyHash().
- [ ] Run the same command. Expected: all Task 1 tests pass, no skips.
- [ ] Commit: feat(atlas): define bounded independent review contracts.

## Task 2: Freeze accessible version-bound review packets

**Interfaces**
- Consumes Task 1 types/context and canonicalTargetVersionHash.
- buildReviewSnapshot(input:unknown,context:ExpectedReviewContext):CodeWorkValidation<ReviewSnapshotV1>
- verifyReviewSnapshot(input:unknown,context:ExpectedReviewContext):CodeWorkValidation<ReviewSnapshotV1>; rederive hash, never accept a supplied pin alone.
- Inputs model existing observed bytes; pure code does not prove those bytes came from Git, a sandbox or a credential-redaction scan.

- [ ] Write tests packet_hash_is_key_order_independent, each_material_change_changes_or_rejects_pin (base/target, every authority pin, candidate, source content, diff, checks, output, policy, job review limits and fixed budget allocations), missing_or_wrong_kind_artifact_rejected, no_unreferenced_artifact_smuggling, duplicate_case_or_unicode_alias_rejected and returned_packet_cannot_mutate.
- [ ] Add path tests for traversal, backslash, ADS, tilde, trailing dot/space; count unique affected files <=8; check write paths with evaluateRepoPath, not just read scopes. Every source pair, diff and stdout/stderr reference must resolve in the packet; unknown checks or registry/argv mismatches reject.
- [ ] Test exact UTF-8 caps: 65536 canonical context bytes accepted if complete, 65537 rejected; diff >131072 rejected; no silent truncation. Required passed test check must meet its minimum; skipped, failed, zero counted tests and absent checks reject. For a non-test command minPassedTests=null accepts passedTestCount=null with exit 0.
- [ ] Run snapshot suite RED before implementation. Expected: missing exports or absent packet rules fail, not a fixture setup failure.
- [ ] Implement snapshot.ts. Hash a domain-separated object {domain:'atlas.code_review_snapshot.v1',packet:...}; artifact hashes cover exact UTF-8 bodies. Canonical context byte limit includes the entire normalized packet before snapshotHash. Refuse missing mandatory material; do not silently drop it.
- [ ] Run binding+snapshot suites GREEN. Expected: all pass, no skips; verify failure assertions name the intended violation.
- [ ] Commit: feat(atlas): freeze version-bound review evidence packets.

## Task 3: Separate reviewer reports and eligibility

**Interfaces**
- parseReviewModelResult(input:unknown,snapshot:ReviewSnapshotV1,context:ExpectedReviewContext):CodeWorkValidation<ReviewModelResultV1>
- bindReviewResult(result:ReviewModelResultV1,snapshot:ReviewSnapshotV1,context:ExpectedReviewContext):CodeWorkValidation<BoundReviewResultV1>
- evaluateReviewEligibility(snapshot:ReviewSnapshotV1,result:BoundReviewResultV1,context:ExpectedReviewContext):ReviewEligibilityDecision
- Bound resultHash uses canonicalTargetVersionHash over {domain:'atlas.bound_code_review_result.v1',result,assignment}; functions revalidate their structured inputs, including hashes.

- [ ] Write tests model_cannot_select_reviewer_or_claim, wrong_snapshot_or_assignment_rejected, mutated_result_hash_rejected, preliminary_never_eligible, final_passed_with_blocking_finding_or_gap_rejected, only_minors_remain_visible and changed_live_target_or_authority_invalidates_result.
- [ ] Test 32768 result UTF-8 bytes accepted at the exact closed boundary, 32769 rejected; duplicate finding/question ids, references to absent artifacts or files, negative/fractional line, whitespace-only findings, unknown enum/extra keys and pending questions on a final passed report reject. Each free-text field <=4096 UTF-8 bytes; max32 findings/gaps/questions, total cap still applies.
- [ ] Run result suite RED. Expected: absent report/eligibility exports or missing rejection fails.
- [ ] Implement result.ts and eligibility.ts. Bind actor/session only from the expected assignment; eligibility requires final passed, current matching packet/pins/claim/time/budget, mandatory checks passed, no pending questions/gaps/critical/important findings. Minor ids are retained. Require the supplied budget ledger to remain valid within its cap; no further dispatch is allocated by eligibility. Report productionAuthority:false unconditionally. Reasons are sorted unique validation violation codes plus stable predicate tokens preliminary, changes_requested, inconclusive, blocking_findings, review_gaps and pending_questions. Result eligibility does not enact a lifecycle transition.
- [ ] Run Tasks 1–3 GREEN; assert changes_requested/inconclusive and all malformed cases are ineligible. Expected: all pass, no skips.
- [ ] Commit: feat(atlas): validate separate reviewer decisions without granting authority.

## Task 4: Bounded job-scoped message reducer

**Interfaces**
- AgentMessageBodyV1: schema='atlas.code_review_message.v1', id, snapshotHash, kind:'question'|'answer'|'finding_reference'|'correction_request'|'blocker', body, replyTo:string|null, artifactIds:string[].
- AgentMessageContext: expected:ExpectedReviewContext, snapshot:ReviewSnapshotV1, senderRole:'atlas'|'worker'|'reviewer', recipientRole:'atlas'|'worker'|'reviewer', phase:'initial'|'discussion'|'closed', firstAssessment:BoundReviewResultV1|null, senderActorId, senderSessionId. These are supplied server projections, not body fields.
- AgentMessageV1 adds sequence, workId,projectId,from/to role+actor+session, assignmentHash, observedAt and messageHash; all derived from context/time.
- AgentMessageLedgerV1: workId,projectId,entries:readonly AgentMessageV1[]. Keeps both candidate versions for the job so a new candidate does not reset its message count.
- appendReviewMessage(history:AgentMessageLedgerV1,input:unknown,context:AgentMessageContext):CodeWorkValidation<{outcome:'appended'|'replayed';ledger:AgentMessageLedgerV1}>

- [ ] Write tests worker_forged_sender_rejected, cross_project_or_candidate_rejected, no_self_address, worker_discussion_hidden_before_assessment, body_approval_never_grants_authority, utf8_4096_allowed_4097_rejected, thirteenth_message_rejected_across_two_candidates and immutable_append_order.
- [ ] Test identical existing id returns replayed with unchanged sequence/count, including after stop when the sender/assignment and body still match. Comparison ignores the new observed time but includes original body fields, roles, derived identities and assignmentHash. messageHash covers a domain-separated projection of every stored field except messageHash itself. Reused id with changed body/recipient/snapshot fails before state progression. New input on closed/cancelled/expired/old-claim context fails. Invalid history hashes/order/role or actor formats/project/duplicate ids fail; never sort/rewrite history to repair it. Older entries can refer to an older candidate/assignment and are not asserted to be authenticated by self-hashing. Current new/replayed requests must match current supplied sender assignment. Validate history structurally; future trusted storage owns its authenticated provenance.
- [ ] Test replyTo must refer to a preceding message in the same candidate; artifactIds must exist in that snapshot; finding_reference/correction_request are reviewer-to-atlas/worker only, answer requires replyTo of a prior question addressed to the current sender, question/blocker allow distinct assigned roles. Recipient and sender cannot be supplied inside body.
- [ ] Run message suite RED. Expected: absent reducer or missing rule fails.
- [ ] Implement messages.ts. Derive all sender/recipient identities from the assignment (atlas maps to coordinator); supplied sender id/session must match that derivation. Derive assignmentHash canonically. For discussion revalidate and recompute the supplied firstAssessment binding, not a bare boolean/hash; it must be preliminary for this candidate. Initial phase accepts no worker-authored message into reviewer context; closed accepts only inert existing replay. Results and snapshots are independently immutable.
- [ ] Run Tasks 1–4 GREEN. Expected: all pass, no skips. Reducer purity/idempotence is not a durable exactly-once guarantee.
- [ ] Commit: feat(atlas): define bounded agent message exchange contracts.

## Task 5: Contract-flow regression, boundaries and handoff

**Interfaces**
- Consumes all previous pure APIs; adds no operational adapter.
- Produces docs/verification/2026-10-18-atlas-review-contracts.md with exact commits, measured test counts, limitations, review findings and next gate.

- [ ] Add flow fixtures: candidate1 -> final changes_requested -> candidate2 -> fresh checks/review -> eligible metadata with productionAuthority:false. Replaying candidate1 passed, swapping target head, reusing old assignment, missing mandatory source and a cancelled candidate2 must never become eligible. No actual worker/model/OS operation occurs in this simulation.
- [ ] Add structural tests: code outside the review directory and QA fixtures/tests has zero imports of the new review modules; no new routes, receipt classes, lifecycle states, grants or native/host launchers. Scan the review directory for subprocess/fs/network/DB/provider SDK imports and ambient clock/random generation; allow only existing pure contract/hash imports.
- [ ] Run the new flow/boundary suites and read every result. These are composition/negative-boundary tests over Tasks 1–4 and can already pass; record that honestly instead of fabricating RED or introducing a bypass. Any newly exposed behavior defect follows a specific RED->GREEN fix before proceeding.
- [ ] Run focused new suites plus the existing sdf1a-code-work-contracts, identity/control and Windows host suites. Required flags SDF_WINDOWS_IDENTITY_REQUIRED=1 and SDF_WINDOWS_HOST_REQUIRED=1. Native helper/smoke prerequisites from the prior verification report must exist; no installs or image pulls. Expected: all named suites pass with actual counts and no required skips.
- [ ] Run broker and web TypeScript checks; inspect exit codes. Expected: both 0. Verify git diff --check and no changes outside planned files. No full-repository/paid CI job.
- [ ] Commission one fresh independent review of the complete execution range on the most capable available model, using preserved Native method; provide spec, this plan, actual evidence, limitations and all ledger rulings. Fix material findings RED->GREEN and rerun the focused suite; document minors. No repeated review merely to reconfirm covered fixes.
- [ ] Write verification report with actual source/counts/review and a coverage table: contracts covered; auth, persistence, durable delivery, session/dispatch/spend, real first-assessment isolation, sandbox, UI and integration deferred. Prior 164 tests are a predecessor fact, not the new test total.
- [ ] Commit source/tests/report locally; preserve branch/worktree. Expected: clean tracked tree and no live behavior changes.

## Verification commands

New suites use:
npm exec --workspace=apps/web -- vitest run lib/qa/sdf-review-binding.test.ts lib/qa/sdf-review-snapshot.test.ts lib/qa/sdf-review-result.test.ts lib/qa/sdf-review-messages.test.ts lib/qa/sdf-review-contract-flow.test.ts lib/qa/sdf-review-boundary.test.ts --maxWorkers=2 --minWorkers=2

Add regressions:
lib/qa/sdf1a-code-work-contracts.test.ts, lib/qa/sdf-windows-host.test.ts, lib/qa/sdf-windows-host-native.test.ts, lib/qa/sdf-windows-identity.test.ts, lib/qa/sdf-windows-identity-native.test.ts, lib/qa/sdf1c-broker-identity-id.test.ts, lib/qa/sdf1c-trusted-broker.test.ts, lib/qa/sdf1c2-broker-control-channel.test.ts.

Typechecks:
node node_modules/typescript/bin/tsc -p apps/code-broker/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false

## Self-review and completion boundary

The full approved spec is larger than one safe implementation increment. Tasks 1–4 cover closed input/limits, immutable version pins, separate-role report validation, non-authoritative eligibility and message reduction. Task 5 proves their composition and no operational caller. Durable storage/provenance, atomic integration, paid dispatcher reservation/iterations, actual fresh reviewer context, runtime restart/cancellation, UI and real job proof explicitly belong to later plans. No contracts-only result may be presented as Atlas already reviewing code or delivering agent messages.

Self-review completed: coordinator identities and firstAssessment are defined once in shared contracts; Task 1 owns all foundational types and fixtures. Shape validation is distinct from live validation, allowing inert duplicate replay after stop without authorizing a new action. Current-actor checks are not confused with historic message authentication. The focused verification targets and native prerequisites were found in the current checkout.

Plan review and approval precede product edits; the already selected inline method remains selected. No implementation has been started by writing this document.
