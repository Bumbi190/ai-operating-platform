# Web Studio campaign/main integration plan

> Execute inline with superpowers:executing-plans and TDD. Continue existing PR368 only.

**Goal:** Reconcile the current main campaign release with Web Studio, preserve showroom/reference/budget boundaries and prove the combined revision locally before any separately authorized remote release.
**Spec:** Notion Web Studio v0.6 and approved continuation; local masterplan v0.5; prior integration ledger. This is dependency reconciliation, not a product redesign.
**Architecture:** Integrate pinned main cb909318ea820a92aa30324caa09d9ab42041d75 INTO the owned feature worktree at7601f9e using no-commit merge. Keep the exact upstream migration policy/test representation and reviewed campaign source. Preserve all Studio-only changes. No rewriting shared history.
**Tech:** Existing Git, Vitest, TypeScript and bounded PostgreSQL/Playwright fixture. No dependency installation.

## Constraints and rulings
- Existing clean isolated branch codex/atlas-builder-references-20261017; preflight reuse_existing. Other worktrees, main, remote and services untouched.
- Local integration authorized by continuation; this does not authorize production/flag/secret changes, migration apply, paid AI or a main merge. A later push must have the requisite preview/CI authority.
- Exact upstream campaign code remains default-off in unconfigured environments. We never invoke an enabled hosted campaign or configure its credentials.
- Preserve reference-only saves (zero paid turn), original operator approvals, showdown assets, active build versions, monthly revenue fix and existing test limits.
- Snapshot proof is point-in-time: source169/enforced155, live192 distinct names. Frozen grandfather14/legacy30 sets unchanged. Prior snapshots stay immutable and must be rejected as incomplete by the newer guard.
- Main includes PR610 and its PR611 follow-up. Review inherited chat, drain and checkpoint changes; do not silently drop either side of automatic merges.
- Host memory fluctuates; all test runners keep their existing resource/ownership guards. Do not stop other programs, reinstall packages or spin up cloud DB branches.

## Review focus
Missing/duplicated/unknown migrations must fail; source hash drift must fail; a reference save must never fall into paid chat; campaign config must remain off without explicit scope; snapshot reconciliation is not SQL apply or proof of deployment.

## Tasks
- [x] Add integration regressions and observe missing campaign source/history RED.
- [x] Merge pinned main locally, resolve only the two known conflicts, inspect auto-merges, preserve protected files by hash and update historical-vs-current assertions.
- [ ] Run targeted source/security/chat/design/campaign regressions, real SQL/worker and full Studio browser journeys sequentially when resource gate permits. Run typecheck once only with adequate RAM and report blocked status otherwise.
- [ ] Review whole delta manually (not independent review), record all results, commit locally and update Notion/handoff. Check main/ledger drift again immediately before any subsequent push.

## Progress
Initial live query:192 rows/distinct; ordered-name MD5540830b1a6f3dadca18bbd1e8abd0392. Prior191+campaign exactly reproduces this digest; no data rows read or changed. Exact reviewed SQL hash matches upstream. Prior automatic preview failure is historical, not a new run.

Ruling: Merged chat prompt measured9039 against unchanged9000 gate. Shorten three descriptive planning sentences only; retain every authority/credential/staleness boundary and exact test limit. RED observed before correction.

## Scope ruling and current verification
The owner's latest continuation follows the proposed combined integration and full CI/preview round. Interpret it as authority to complete this bounded reconciliation and push the resulting tested feature commit to the SAME draft PR for existing protected CI/preview only, provided pinned-main/ledger preflight stays consistent. No main merge, production flags/schema, provider call, permission expansion or forced push. Do not stop for another routine per-commit microapproval; report any genuinely new risk before action.
Manual second pass: exact upstream campaign/drain/checkpoint/guard/registry sources; protected Studio/assets/worker/compiler/month totals and package files unchanged. Historical snapshots immutable. Existing reference-save early no-inference path retained. Campaign enablement still explicit flag + enforced spend gate + target allowlist. This is not independent review or deployment proof.
504/504 campaign/Studio contracts and185/185 references/guard cases passed with no pending. Actual existing CI anti-skip script accepts full report and rejects removal of the four new cases. Studio integration still pending at this entry.

Full Studio completed25/25, no skipped/flaky/retries; own fixture removed and evidence inspected. Local TSC deliberately deferred under RAM pressure to exacthead Linux CI; no local typecheck success claim. Final source review and successful test receipts permit a local integration checkpoint, not a production release.
