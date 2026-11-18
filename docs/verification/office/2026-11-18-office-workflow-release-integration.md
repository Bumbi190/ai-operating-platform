# Office workflow release integration — 2026-11-18

Work ID: OFFICE-WORKFLOW-STATUS-20261118. Same owned worktree `D:\Projekt\Omnira\Worktrees\office-workflow-status-20261118`, branch `feat/office-workflow-status-20261118`. This is a local integration/release candidate, not an applied migration or deployment.

## Result and scope

Reconciles the scoped Office activity/workflow visits, native acknowledgement and installed Pling consumer with verified GitHub main `8f73dfc21be4bb9e3656e3bf53b5c651a9ea66f4`. First merge parent is `e8d5a6529eedcf0f87eb8e3c8b9a8c8f35a2d461`. Current local main is stale and was not merged. Only two files conflicted: Migration Guard policy and its regression tests. Main's Family social migration restoration and all other incoming main changes are preserved.

The candidate contains the seven earlier owned Office commits, not just this day's compatibility fix. It supports explicit owner-selected Familje Pling visits. Idle allows the existing coffee/pingpong/film life; busy interrupts leisure and returns home; unknown holds. It grants no workflow execution, no new avatar mapping and no background workflow scheduling. The ordinary URI registration and the already verified immutable native bundle/map are unchanged.

## Preflight review

The machine preflight returned review_required/matching_open_pr for draft PR #496. Manual metadata/diff review found 1,560 changed paths, zero Office paths and three generic guard paths. Its head is `059efe2137910683fdd6b649ed41b4c10646dc57`, branch `feat/atlas-creative-p26-main-reconciliation`, base `feat/atlas-creative-p25-migration-quarantine`. It is a separate creative stack and is not reused or retargeted. The exact existing owned workflow worktree is reused. No new branch, push, PR, merge to main or deployment was performed. Original machine receipt is retained unchanged; this paragraph is the explicit manual assessment.

## Actual production read-only observation

AI Operating Platform, project ref `iboepohjwrhtgshrqaol`, PostgreSQL 17.6. Only SELECT queries were issued. The ledger contains 200 unique names. `office_visit_sessions` is already applied under ledger version `20261113122811`; the two migrations below are absent. The captured name set and versions are in `2026-11-18-applied-migration-dependency.json`. Sorted name-set SHA256: `610182579e886ac0fdc50e795828861eb569efe8c7404147647f6d050cb9e55f`.

Migration Guard now pins **179 canonical SQL / 165 enforced / 14 frozen grandfathered / 30 frozen legacy**. Both new Office migrations remain enforced. The actual 200-name production ledger is correctly rejected; adding either one alone is insufficient; the strictly hypothetical ledger after both additions passes at 202 names. No emergency override, frozen-name expansion, missing-migration allowlist or history rewrite was added. The older Nov13 198-name evidence and its 175/161 historical corpus remain immutable.

Familje-Stunden has 60 runs, zero pending/running/awaiting_approval rows and one structurally legacy failed workflow from 2026-05-19. That failed row has no finish timestamp, snapshot, instance, kind, claim or lease; cancel/reconciliation flags are false, workflow_id is present. Its 19 old text logs do not prove a finish timestamp. No run/log contents or execution history were changed.

The unapplied workflow SQL now omits only that exact inert failed shape from reservation candidates. Every term is NULL-safe. Unknown/NULL/active statuses, claims, snapshots (including JSON null), instances, kinds, cancellation or reconciliation anomalies still prevent an idle conclusion. Modern contradictory terminal rows retain previous handling. This is a read-only compatibility rule, not a fabricated successful workflow or an execution assertion.

## Exact pending SQL and release order

| Order | Canonical migration | LF SHA256 | State |
| --- | --- | --- | --- |
| 1 | 20261113144053_office_step_activity.sql | 5674b6ded86f3840a0b677d119464de3d272b54c85c54f44ac3ab582fc4d47a5 | Not applied |
| 2 | 20261118093000_office_workflow_state.sql | 499d4286b71955c5611b2411cdbea7f029413fd82b7632bb3cb0fcec133e73f3 | Not applied |

The already-applied identity migration is unchanged (LF SHA256 `a77bbd8837122cf419c271e534b594811217caec5c9142941bd6eecd8a7fb337`) and must not be replayed. Existing grants remain identity/activity scoped. New workflow grants require a fresh explicit owner session, project/agent selection and workflow consent.

After a concrete owner decision:
1. Refresh main/PR/preflight and the live ledger. If another change landed, reconcile and retest before publication. Push the owned candidate and prepare its review without force-push or unrelated stack changes.
2. Apply the two exact Office migrations in order using normal migration tooling, retaining separate exact ledger names. Each migration is transactional. If the second fails, keep the compatible additive activity scope and stop; do not weaken the guard or delete real history.
3. Verify all 202 known ledger names, grants, empty search_path definer functions, old identity/activity scope and the existing visit. Run normal CI and Migration Guard with real service-side configuration. The synthetic local .next output must not be deployed.
4. Merge/release only the reviewed app candidate through normal CI. Workflow flag remains OFF until this coordinated code/schema check passes. Then enable only `OMNIRA_OFFICE_WORKFLOW_STATUS_ENABLED=true` for the owner-reviewed pilot; other flags and credentials retain their existing values.
5. Use the installed explicit foreground workflow launcher and the fixed workflow map. Observe real owner login, session/project/agent checks, upstream HTTPS and native acknowledgement, then idle and expiry/revoke/game-exit behavior. Do not invent a production busy run. Real busy verification needs an actual authorized workflow; no model/voice job or paid provider call is authorized by these tests.

Maximum added paid service/model cost for this release/proof: **0 SEK**; no new account, key, subscription or infrastructure. Existing hosting/database usage remains. A blocking paid step requires a new decision.

Rollback: turn the workflow flag OFF and deploy the previous known application if necessary; revoke the owned test visit using the existing revoke path and stop the foreground workflow game. Retain the additive scope columns/functions and ledger as applied history. Do not drop a live schema, rewrite runs, re-enable an old revoked grant, replace the URI handler or overwrite native acceptance receipts. The initial pilot exposes one Familje Pling only; extension to other avatars is a separate code/mapping change.

## Verification and observed failures

- Migration Guard / release: **52/52 Vitest** including the actual captured ledger, both pending dependencies, duplicates/unknowns and frozen policy integrity.
- Office: **75/75 Node**, **73/73 Python companion**, three actual synthetic HTTP transport suites, scoped strict TypeScript **0 diagnostics**.
- PostgreSQL **17-alpine**, cached image, no published port/network/volume: **3/3** identity/activity/workflow fixtures. Existing scopes, privileges, ownership/session changes, revocation, concurrent revisions and caps remain covered. New legacy test failed against the old SQL, then passed after the filter with 20 near-miss shapes. Initial PG17 harness checks raced its temporary init server; readiness now waits for the final init marker, then pg_isready. All owned containers were removed. Failure logs are retained.
- Main integration: **15/15** organization middleware/calendar tests, including a new owner workflow-route vs collaborator denial check. A temporary config resolves the real cached Supabase modules for Vite; no production module is stubbed beyond the repository's existing test mocks.
- Local optimized **Next 14.2.29 build exits 0**. Cached dependencies only, synthetic invalid-domain configuration, no production secrets or workflow flag. The first build lacked the app-level cached Remotion root; the next hit Next's Windows cross-drive client-path problem. The final build copies only the pinned Next package into this owned ignored node_modules (6,428 files / 86,673,129 bytes), byte-verifies it, and reads the existing dependency caches. No packages were installed. Borrowed local-text-contract package/code/declarations match this worktree after LF normalization.
- Next reports existing Supabase Edge process.version warnings, font retries and a styled-jsx build-cache warning. Its repository config skips global TypeScript and ESLint, so successful Next build is not a claim that global typecheck/lint passed. The Office strict check is separate and passed. No browser/live-owner end-to-end proof is claimed.
- Only this owned worktree's generated design output was restored after build. Its source hash and the foreign worktree's pre-existing dirty design file both remain `f4a4c921a78d721e58f163438cfd69ce45a5546dbff3db0061ce1dc4f2c62c16`. No native map/bundle/installation receipt or URI registration was edited by this integration.

A separate second review pass by the same agent examined NULL semantics, terminal compatibility, data minimization, authorization/row locks, revision ordering, old-scope compatibility, frozen migration evidence and rollback. This is **not independent-agent review**. Local integration checks pass; production activation and real authenticated acceptance are still pending. Raw outcomes are retained in `evidence/2026-11-18-workflow-release`; the earlier failed aggregate is not relabeled as a passing run.

Git text log copies trim trailing whitespace only; exact original bytes remain in the owned Temp evidence directory. Original and Git-copy hashes are recorded in log-normalization.json.
