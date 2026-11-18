# Harvey: ordinary main merge and final local qualification

Date: 2026-11-01. Continue existing Draft PR #386 and remote branch `codex/atlas-harvey-sales-20261017`. This is an ordinary merge preserving both histories, with no force push or replacement branch.

## Why the merge was necessary

GitHub reported the existing PR as conflicting after 20 main commits since the previous common base. Main `cb909318ea820a92aa30324caa09d9ab42041d75` was fetched and reviewed. Harvey's two newly committed changes were preserved as `35d83bc0d79e334a366ad59487ac6d3b3f3b843d` (managed worker one-shot) and `66cc17ab6a14e18c0655c9f87360ce007f4c138a` (already-applied source reconciliation) before the merge.

The merge includes main's Social campaign, project-context and associated changes as ordinary upstream history. Unlike the earlier isolated source-sync step, this merge therefore includes application changes from main. The older statement that all application runtime bytes match 19d363d is historical and does not describe this combined version.

## Six conflict resolutions

- **Chat route:** combine both `!needsStoredContext(lastUserText)` and `!socialPreparationIntent` as AND conditions before the content fast path. Preserve main's social intent declaration and all other automatically merged route logic. The main prompt retains the feature-gated Harvey `SALES_GUIDE` plus main's `PROJECT_TASK_GUIDE` and `SOCIAL_CAMPAIGN_GUIDE`.
- **Lifecycle test:** retain the anchored whole-declaration match, rejection of OR branches and individual conjunct checks; add the social-preparation conjunct alongside lifecycle and stored-context checks.
- **Revenue fixture:** use main's parameterized `max(monthStart, now - 24 hours)` date helper. Keep both Harvey boundary cases (late 31 October and early 1 November), real rendered amount/token checks and foreign-project exclusions. This changes no product calculation or query window.
- **Migration policy:** preserve both provenance comment histories. All non-comment source, every export, frozen array and function body are identical to both parents. Counts remain 169 canonical files, 155 enforced names and 192 expected ledger names.
- **Guard tests:** preserve the complete Harvey test file and main's three additional rollout/evidence cases, using equivalent existing constants. The imported actual Nov1 ledger artifact is included by the main merge. No tests are dropped or skipped.
- **Security registry:** take a semantic union with 189 unique table keys and no duplicate JSON keys. Preserve all parent table values, both parents' dated observations and Social's migration-provenance fields. Sales leaves the pending lists; client access remains denied. Views and the original global capture date are unchanged.

Two independent scratch reviews covered the route/date/lifecycle resolution and the policy/tests/registry resolution. Root reviewed and applied their exact outputs on stationary Hultgren. Neither review made database writes or runtime calls.

## Final local verification

Completed on Hultgren at **2026-11-01 07:14:26 UTC**:

| Check | Result |
| --- | --- |
| 12 targeted Vitest files after the merge | **471 passed**, zero failed or skipped, exit 0 |
| Strict migration-guard cases within that run | **52 passed** |
| Full application TypeScript | Exit 0 |
| Conflict markers / unresolved index entries | None |
| Staged whitespace check | Passed |
| Windows worker suite before the merge | **169 passed**, exit 0; worker source tree unchanged by main merge |

The 12 files cover migration policy/security, schema invariants, reply lifecycle, Revenue isolation and calendar boundaries, project task context, status honesty at the actual mocked chat route, Nova canonical ledger reconciliation, discovery adapter/API, Social campaign capability and memory context.

Exact tested index tree: `67f12fab621134ca047980bf6e7ac1e5062980ab`.
Application subtree: `6671352538c31d60e1b46ca8959a7adb52726597`.
Worker subtree: `dca148852ebcea1ef1264703d31e348b88f8946e`.
Only verification documents are added after that test run; these application/worker subtree identities are checked again before commit.

Commands are captured in `run_merge_checks.py`: Vitest with one worker and JSON/default reporters, followed by `npm run typecheck`. Evidence directory: `C:\Users\Andre\Projects\Omnira\Temp\harvey-resume-20261101`. Key receipts: `merge-checks-result.json`, `merge-tests.json`, `merge-targeted.log`, `merge-typecheck.log`, `main-merge-resolved.json`, `main-merge-schema-review.json` and `main-merge-chat-applied.json`.

Final merged registry SHA-256: `3978603f7c8fdb6fbf2a4bdd11ccb7e14a7749a63b37dba4684bf284e6dc13bf`. Both canonical SQL files retain their exact previously verified hashes. The tests used synthetic boundaries; no real job, provider lookup, model inference, inbox or sending action was run.

## Deployment and operational limits

Automatic CI and the exact-head Preview build are post-push checks recorded in the current PR description and Harvey handoff. The local test run does not itself prove a live source request or a new persisted customer draft. The older broad full-suite comparison with 120 baseline failures is historical and is not relabeled green.

The new 64-file worker package must be built from the committed source and verified before selection. The previously active 61d package is not edited in place. Package preparation alone does not change the active configuration, renew credentials, start the scheduled host or enable mailbox/reply/send loops. Current account, source-cost and WebBuilder sender decisions remain separate.
