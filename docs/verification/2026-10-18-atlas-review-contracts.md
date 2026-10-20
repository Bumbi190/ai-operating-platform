# Atlas review contracts — verification, 2026-10-18

Plan 1 implements pure contracts for independent review and job-scoped agent messages. **No running AI reviewer, authenticated agent messaging, code job, integration authority or production behavior was activated.** The new modules have no operational caller.

## Source

Spec: docs/superpowers/specs/2026-10-18-atlas-independent-review-design.md, written version approved 2026-10-18 19:57 Europe/Stockholm.
Plan: docs/superpowers/plans/2026-10-18-atlas-review-contracts.md, approved 20:06 Europe/Stockholm.
Branch: codex/atlas-code-worker-design-20261018.
Execution BASE: 3bf3400d06078724aca6b72926c59da9dd8b032a (approved plan commit).
Reviewed HEAD: 5af5d304fe613ad416704dc5443e3cc1daa8280b.
Verified source after the single material-fix pass: 486c0ed878c79414488bd08b7f59f25380c43966.
Verification document commit follows that source; the worktree is preserved. No push, merge, deployment, enrollment or grant occurred.

| Task | Commit | Deliverable |
|---|---|---|
| 1 | 57eb23a | Closed types, supplied-context/assignment/admission validation |
| 2 | 757240f | Available artifacts, immutable candidate packet, canonical version pins |
| 3 | 5f201c0 | Separate reviewer report binding and non-authoritative eligibility |
| 4 | b02f800 | Immutable job-scoped message append/replay contracts |
| 5 | 5af5d304fe613ad416704dc5443e3cc1daa8280b | Composition, structural boundaries, early byte bounds and verification |
| Review fixes | 486c0ed878c79414488bd08b7f59f25380c43966 | Pin required test floors and deny single Windows case/NFC aliases |

Source: apps/web/lib/atlas/code-work/review/{types,validation,binding,snapshot,result,eligibility,messages}.ts.
Tests: apps/web/lib/qa/sdf-review-{binding,snapshot,result,messages,contract-flow,boundary}.test.ts and fixtures/sdf-review-fixtures.ts.

## What is implemented

- Closed schemas reject unknown/missing fields, malformed numbers/timestamps, unsupported JSON values, invalid identities and changed admission/policy/budget/base pins.
- Omnira's existing canonical repository ID and current registered command resolver are reused. This does not register another repository or command.
- Coordinator, worker and reviewer actor IDs and session IDs must be pairwise distinct in supplied assignment projections.
- Snapshot content includes the original brief, before/after file text, diff and check output bodies. Every reference resolves to an appropriately typed artifact, unreferenced material is refused, hashes are recomputed, and returned packets are frozen copies.
- Files must stay inside the admitted write/read scopes and lexical Windows path rules, including an additional NFC/case-folded denial check that retains original stored path spelling. This does not prove realpath or filesystem object identity.
- Mandatory check declarations are matched to the command registry, exact argv pin, successful exit/outcome and required test floor. The sorted required-check declarations, including their floors, are bound into reviewSettingsHash so changed requirements invalidate old review. A typecheck has no invented passed-test count.
- Review reports cannot select their own actor or claim. Final passed reports cannot contain blocking findings, gaps or pending questions. Minor findings remain visible.
- Eligibility always includes productionAuthority:false. It grants nothing, changes no lifecycle and authenticates no caller.
- Message identities are derived from supplied assignments; messages bind a candidate, have bounded content and job-wide sequence/count, and can only reference known current artifacts. Answers have a valid preceding question/recipient.
- A matching stored duplicate is an inert replay even after stop. New stopped/stale messages and conflicting id reuse are rejected. History hashes are structural checks, not proof of authenticated storage.
- A bound preliminary assessment is required for discussion-phase messages. This is a protocol constraint, not proof that a real model ran with independent context.
- New modules are unreferenced by operational app/broker code. Existing admission, receipt and lifecycle vocabularies were not extended.

## Test evidence

**380/380 tests passed across 14 files with no skips.** The new contract suites account for 174; existing regression suites account for 206.

| Suite | Passed |
|---|---:|
| sdf-review-binding | 44 |
| sdf-review-snapshot | 56 |
| sdf-review-result | 34 |
| sdf-review-messages | 32 |
| sdf-review-contract-flow | 5 |
| sdf-review-boundary | 3 |
| New review contract subtotal | 174 |
| sdf1a-code-work-contracts | 42 |
| sdf-windows-host | 38 |
| sdf-windows-host-native | 10 |
| sdf-windows-identity | 33 |
| sdf-windows-identity-native | 5 |
| sdf1c-broker-identity-id | 13 |
| sdf1c-trusted-broker | 16 |
| sdf1c2-broker-control-channel | 49 |
| Total | 380 |

Both SDF_WINDOWS_HOST_REQUIRED=1 and SDF_WINDOWS_IDENTITY_REQUIRED=1 were set. The existing native helpers/smokes were used on the real Windows desktop; no install, image pull or paid API probe was needed. The host smoke contains its prior 52 inner assertions, and identity smoke its prior 15; those are not extra Vitest cases.

Both required typechecks passed with observed process exit code 0. Post-fix web typecheck took 84.24 seconds; broker typecheck took 3.98 seconds and broker source was unchanged. The post-fix 14-suite run took 18.07 seconds in Vitest (21.95 seconds process time).

Commands:
```powershell
node node_modules/typescript/bin/tsc -p apps/code-broker/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false
npm exec --workspace=apps/web -- vitest run lib/qa/sdf-review-binding.test.ts lib/qa/sdf-review-snapshot.test.ts lib/qa/sdf-review-result.test.ts lib/qa/sdf-review-messages.test.ts lib/qa/sdf-review-contract-flow.test.ts lib/qa/sdf-review-boundary.test.ts lib/qa/sdf1a-code-work-contracts.test.ts lib/qa/sdf-windows-host.test.ts lib/qa/sdf-windows-host-native.test.ts lib/qa/sdf-windows-identity.test.ts lib/qa/sdf-windows-identity-native.test.ts lib/qa/sdf1c-broker-identity-id.test.ts lib/qa/sdf1c-trusted-broker.test.ts lib/qa/sdf1c2-broker-control-channel.test.ts --maxWorkers=2 --minWorkers=2
```

Observed RED->GREEN:
1. Binding/context suite failed on absent review modules; 43 tests then passed.
2. Snapshot suite failed on absent module. The changed-deadline case subsequently exposed an unbound deadline (94/95); binding the deadline made 95/95 pass.
3. Reviewer-result suite failed on absent result/eligibility; combined 129/129 then passed.
4. Message suite failed on absent reducer; combined 161/161 then passed.
5. Oversize regression returned json_value_required for later invalid content instead of rejecting the already-exceeded byte cap. Incremental byte charging now stops earlier with input_too_large.
6. Composition tests over already implemented modules passed immediately, as expected; no fabricated RED. The import-boundary test first misread the literal property name from as an import. Its test-only extraction now uses the installed TypeScript parser.

7. Independent review found two Important issues. Six new regressions failed before the fix (55 passed in that selected run): floor changes 1->2 and 2->1 must invalidate the old pin even when both test floors pass; four single denied-path aliases cover different case, exact-scope alias, and decomposed Unicode. Both fixes then passed the full approved 380-test suite. No second review was run, following the approved one-review/one-material-fix workflow.

Exact UTF-8 boundary tests cover snapshot context 65536/65537, model output 32768/32769 and message body 4096/4097. The twelfth/thirteenth message boundary spans two candidate versions. Tests also cover case/NFC aliases, path denial, mutation after hashing, missing artifacts, skipped/empty tests, self-selected reviewer, stopped replay, conflicting ids, stale assignment/base and changed policy/budget.

Type-only errors found by early web checks were corrected before the final gate: readonly input limits, artifact spread narrowing and the validated message-history projection. The existing Vite CJS deprecation warning remains baseline; it is not a failed test.

## Independent review

One fresh independent reviewer examined the whole range BASE3bf3400..HEAD5af5d304, the approved spec/plan, verification evidence and ledger. Initial verdict: **0 Critical, 2 Important, 0 Minor**.

1. Important: required minPassedTests was checked against current inputs but omitted from the immutable settings pin. Both raising and lowering the floor could leave an old review eligible. Fixed by hashing canonical command-ID-sorted requiredChecks, including floors.
2. Important: a single Windows path with changed case could bypass a denied scope; the existing duplicate alias guard did not address this case. Fixed by an additional NFC/lowercase path-and-scope check before the existing exact path evaluator.

Both were accepted and fixed in one pass with observed RED->GREEN regressions. Final verification is 380/380 plus web and broker typechecks. The reviewer inspected the pre-review 374-test summary and performed two in-memory reproductions; it did not rerun the suite/typechecks. The root agent performed post-fix verification. No new deferred minor findings.

## Rulings and costs

1. Use explicit BASE/RED/GREEN/commit ledger and review package because remote skill shell scripts are unavailable. Cost if wrong: manual bookkeeping can omit evidence; commits/results are cross-checked.
2. Split structural validation from live progression for inert replay after stop. The explicitly named structural helpers stay execution-free; creation and eligibility use live checks. Cost if wrong: a future caller could mistake a structural result for authority; current production has no importer.
3. Preserve the exact registered repository ID github.com/bumbi190/ai-operating-platform rather than applying slash-free actor-ID syntax to it. Target refs likewise match the admission. Cost if wrong: repo validation must use the actual registry, not the generic identity helper.
4. Include immutable deadlineMs in reviewSettingsHash alongside limits and fixed allocation. This follows the spec's requirement that changed mandate invalidates review. Cost if wrong: consumers must use the shared hash function; earlier contract-only hashes differ.
5. Follow the explicitly approved focused-only gate and keep the branch/worktree local, overriding the generic finishing full-suite/menu. Cost if wrong: the wider repository baseline and other platforms are not established by this phase.
6. The reviewer declined to judge deferred authenticated provenance, storage/delivery/recovery, actual reviewer independence, model dispatch/spend enforcement, OS/Git evidence authenticity, sandbox execution, UI and integration readiness. Ruling: keep these explicit future gates rather than treating pure contract consistency as operational proof. Cost if wrong: no claim of a running secure reviewer or integration readiness is established here.
7. Supplied expected context and self-hashed history are structural projections, not authentication. Ruling: future trusted server/store must derive and protect those facts. Cost if wrong: a fabricated self-consistent projection cannot be detected by these pure functions.
8. The reviewer did not re-review predecessor Windows host/identity phases. Ruling: leave their documented minor findings outside this increment. Cost if wrong: those earlier limitations remain unresolved; no new minors were found here.

## Coverage and remaining gates

| Requirement | Actual result |
|---|---|
| Closed packets, content/hash/version consistency | Implemented and unit-tested |
| Distinct assigned roles and bounded report schemas | Implemented against supplied projections |
| Message append/replay, limits and reference consistency | Pure reducer implemented/tested |
| Authenticated assignment/actor/claim provenance | Deferred: server-authenticated boundary required |
| Durable atomic storage, RLS, delivery/recovery | Deferred: no table, transaction or dispatcher here |
| Real spend reservation and session/model-dispatch caps | Constants and input validation only; runtime enforcement deferred |
| Real independent initial model context | Protocol input constraint only; model execution/evidence deferred |
| Windows protected worktree and sandbox execution | Still a prerequisite; metadata qualification is not this proof |
| Actual Git/source/diff and test execution authenticity | Deferred to broker/sandbox receipts |
| Atlas status/UI and human bound approval | Deferred; no operational caller |
| Integration/PR/merge/deploy | Disabled; separate future capability/mandate |

The wider Omnira suite had known prior failures and was not rerun under the approved focused-only plan. This is not a claim of full-repository health. Native regression coverage is Windows; WSL has no Node runtime and POSIX was not verified. Prior identity minor findings (unsupported CLI stack handling, CNG failure coverage, early-close teardown) and the host blocked-report Docker/failed-backend minor were not bundled into this phase.

The supplied expected context/history are trusted projections in this library, not authenticated facts. A fabricated self-consistent projection is not independently detectable here. Parsed-JSON input is the supported boundary; this is not a malicious JavaScript proxy sandbox. Hashes detect mutation relative to the supplied packet; they do not certify code correctness, actual process execution or reviewer independence.

Next: plan the durable authenticated review/control-plane increment, while completing the protected Windows workspace and real sandbox gate before any operational code job. Then connect registered worker/reviewer dispatch, genuine evidence, Atlas UI and version-bound human review. Nothing in this phase lets Atlas overwrite ordinary project code.
