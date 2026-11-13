# Office saved v2 staging verification

Spec: ../specs/2026-11-13-office-step-activity-design.md

Continue local commit 062668e on the owned Office branch. No new branch, PR,
push, deployment, database change or installed-launcher update.

1. Add and prove a pure evidence gate: reject drift in any artifact, incomplete
   independent actor/material checks, old runs, same-process proofs, cleanup
   failures and any installed/live claim.
2. Build a distinct saved Blueprint and duplicated lab map. Preserve the canonical
   map, old receiver, project descriptor, material and old receipts byte for byte.
   Journal exact newly owned files and support guarded rollback. Refuse overwrite.
3. In a separate Unreal process reload saved artifacts, verify exact Familje-Pling
   binding and all original actors, material/font dependencies, compiled graph
   behavior. In another process prove actual paused PIE expiry with stopped writer.
4. Finalize only a non-activating staging receipt after matching every artifact
   and proof. Fresh-context whole-change review, targeted fixes, regression,
   local commit and concise result.

Review focus: scope escape, dependency completeness, stale evidence, saved actor
versus transient substitute, cleanup/rollback drift, ordinary launcher activation.

Pre-flight: tasks 2–4 share exact artifact set and run_id; evidence gate compares
the full key set and hashes. Map and Blueprint use distinct staging packages;
fixture is isolated and never points to the ordinary relay directory.

Ruling: finalize staging evidence only; leave production v2 OFF — an installed
receipt requires a later explicitly authorized live transaction — cost: another
installation verification is necessary before real owner acceptance.

## Execution ledger

- Base: 062668ec9de80aff09241f7c0bc1f0d05d3700bd. Existing owned branch
  reused after preflight review_required/matching_local_branch; no new branch/PR.
- Task 1: complete. Eight evidence tests failed on missing implementation, then
  passed. Cover full artifact drift, incomplete evidence, process/run mismatch,
  wrong scope and cleanup failure.
- Task 2: complete. Actual Unreal save/reload successful. Canonical Office map,
  old Blueprint, project, material and three existing receipts remained exact.
  Guarded committed-stage rollback succeeded; independent rebuild succeeded.
  Early wrong-world/map guards failed before acceptance and rolled back their
  owned writes; corrected by explicit stage reload after save-as.
- Task 3: initial separate process audit passed 20 behavior checks against saved
  class, exact actor binding, 1420 original scene actors and material/font.
  Separate PIE process passed stopped-writer/paused expiry on saved level actor.
- Task 4: initial finalizer passed with installed:false and live_launcher_enabled:false.
  Fresh-context review: 0 Critical, 4 Important, no deferred Minor findings.
- Final: fixed cleanup exception before quit —
  RuntimeCleanupTests.test_dependency_failure_still_records_failure_and_quits
  RED→GREEN. Artifact hashing and callback removal are independent cleanup
  actions, proof persistence uses finally to guarantee editor quit.
- Final: fixed old successful evidence surviving failed rechecks —
  test_failed_candidate_check_revokes_acceptance_and_previous_operation_proof
  and test_rollback_failure_first_revokes_acceptance RED→GREEN.
  Scope/exclusivity checks now precede invalidation, which precedes candidate
  reads and rollback.
- Final: fixed missing actual-font dependency coverage —
  test_font_and_external_texture_are_explicit_dependency_roots RED→GREEN.
  Actual component font and every font texture package are explicit roots;
  absent dependency registry results fail. Actor font overrides are rejected.
- Final: fixed PIE identity/pause certification —
  test_pie_rejects_replaced_actor_or_resumed_world and missing runtime acceptance
  claim subtests RED→GREEN. Verify name/class/parent, retain same PIE actor,
  observe pause on every expiry-phase tick and require both observed-pause facts.
- Post-review targeted suite: initially 13/13. Full Windows regression and new actual Unreal
  rollback→build→audit→PIE→finalize rerun are required before local commit.

Ruling: assert deadline behavior only after an observed native actor tick has
crossed that deadline, while still requiring pause, same actor and the existing
45-second overall timeout — a measured 1.37-second Slate/native sampling lag
made the former fixed 0.3-second observation margin fail before native time had
reached expiry. Diagnostic native-frame sampling proved both expirations while
paused. Cost: a stalled renderer can delay failure until the 45-second bound;
this proves per-tick expiry, not a new wall-clock rendering-latency guarantee.

The native-tick observation regression was RED→GREEN; targeted suite now 14/14.
Diagnostic wrappers write separate debug files and are NOT acceptance evidence.
Only a full rebuild/audit/unmodified final runtime/finalizer can pass acceptance.
No reviewer finding was declined. No deferred minors.

Final: Ruling: the review's remaining boundaries stay scoped to staging: whole
room asset-byte integrity, malicious-administrator attestation, real owner auth
and actual agent/model/voice execution are outside this visual receiver test.
The saved-class behavior test may use transient instances because a separate
PIE proof must exercise the exact saved level actor. Cost: none of those excluded
systems may be claimed verified or activated by this receipt; actual installation
and owner/workflow acceptance still need their own evidence.

- Final-source full Windows Python regression: 148/148, exit 0 (39.493 seconds).
- Final-source rollback, build and separate audit: all exit 0. Run
  `2bdeb3c2936d45bc9565276f7724e614`; saved map hash
  `bf375f89827f21153bec5cbc243486861f43c7d7442c8b60d3a71e838d6b0020`,
  saved Blueprint hash
  `5efcbe91f322061d9c1b2a564b0b075414b239b287a887085865678895467293`.
  Fresh audit PID 48684, 20/20 graph checks, exact actor/presentation/baseline.
- Final-source saved-actor PIE: passed, PID 41408, same run ID, actor identity
  checked every tick, pause observed at both expirations, stopped projection bytes
  unchanged, all protected Office files unchanged, no cleanup errors.
- Final-source finalizer: exit 0, PID 47004, same run ID, all 13 artifacts matched,
  staging acceptance passed with installed:false and live_launcher_enabled:false.
  Final tests: 148/148 Python plus 20/20 saved graph checks and real saved-actor PIE.
  All four review findings fixed; final runtime timing regression also passed.
  Tasks 1–4 complete; local commit only, no push/PR/release/native live activation.
