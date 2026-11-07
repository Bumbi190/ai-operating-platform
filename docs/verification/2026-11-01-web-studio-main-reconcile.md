# Web Studio — main/source reconciliation, 1 November 2026

Scope: local integration on existing PR368 worktree. Base32dd6b5; incoming mainb2335bc. No update of main, remote push, deploy, production DDL, feature flags or paid model calls.

## Implemented
Two Git conflicts were resolved while retaining both histories. Incoming main includes later project-context routing and advisory router changes; the existing showroom/template/compiler/worker, UI and month-total fix were preserved. The later187table registry from main replaces the outdated absent-at-capture assumption. Fresh read-only checks confirmed RLS,0policies,no anon/auth grants and service SELECT for the two discovery tables.
Exact source-only migration:20261031204433_human_story_exact_claim.sql from8633a3696c96c60d48efae99c037b2d3af92f16a. SHA256a7ffd88a4b1881b3173e4dfe98af5d6d6ea1d7bb47b0c09411954cbd698a32e6. This is the registered version, not the older170000 proposal. No function was executed or reapplied. Live metadata body hashes/ACL match the owning rollout receipt.
Guard168canonical/154enforced; frozen14/30sets and evaluator algorithms byte-identical. The previous190-name snapshot is untouched and correctly incomplete under the later policy. Reconstructed191-name set was verified against read-only count, distinct count and ordered-name MD5. It is a point-in-time snapshot, not continuous synchronization or full schema replay.
Two planning sentences compressed after the merged Studio prompt reached9019characters, above unchanged9000limit. The approval, no-authority-from-references and no-created-folder instructions remain. No model or tool permission was expanded.

## Verification ledger
- New exact-source tests first5/5 RED (missing canonical file and name). Source/guard GREEN63/63 after import.
- First combined merge run:469passed,4failed,5not-run. Obsolete registry expectations and the prompt limit were corrected. One revenue test timed out at its original5s during memory pressure; later unchanged-timeout run passed.
- Follow-up on actual registry/security, chat route, revenue and exact source:224/224passed,0pending.
- Design/compiler/raster/starter/catalog and source/guard regressions:202/202passed,0pending. These overlap source tests above; do not sum as unique cases.
- The five social-launch SQL tool cases were NOT executed: their beforeAll lacked the owned DB fixture. Do not call them successful or intentionally waived.
- Workflow YAML validated; same triggers, permissions, jobs and timeout. Actual anti-skip code accepted the full real report and refused it with the five new exact-source tests removed.
- TypeScript first run was capped at512MiB and terminated with heap OOM, exit134. This is not TypeScript success or evidence of a type error. Further result recorded below.
- Full actual Studio UI/HTTP/PostgreSQL/worker journey: **25/25 passed**, zero skipped, unexpected or flaky cases; no retry. Run675f38b6-b1a1-439e-a4b8-a6b1a74e8997. Includes desktop/mobile showroom build, chat color edit, original images/content/history and unchanged desktop preview-height assertion. Screenshots of edited desktop/mobile views inspected. Auth and model outputs are fixtures, not real GoTrue or paid inference.
- Final full web TypeScript retry with >=2GiB free before launch and1024MiB heap: OOM/exit134 again. No type-error verdict and NO passing typecheck. Stopped escalating; CI with adequate resources must verify it before release.
- Fresh broad npm test -- --bail=1 --maxWorkers=1 --minWorkers=1 stops at unchanged mission-brief-v1.test.ts:384 status-list assertion,2passed/1failed before bail. Full repository is not green.
- Owned SQL container removed with UUID-label verification. Global inventory changed43to42: different fixture omnira-nova-campaign-c95ba1c5 disappeared; attribution is not established. This runner's cleanup is restricted to its own omnira-website-sql UUID, and no command here targeted that Nova fixture. We do NOT assert all other container identities were preserved.

## Review and limits
Manual second-pass diff/invariant review proves protected showroom/worker/revenue paths unchanged, main's later registry preserved, exact SQL source, no new dependencies or security exceptions. This is not independent security certification. Old SQL/Auth/model acceptance numbers are not recast as fresh results. New full Auth CI, Vercel build and actual model generation remain separate gates.
RLS/catalog queries were read-only. Existing original190-name snapshot and prior reports remain historical. No other agent worktree changed. Source provenance and observed191-name digest are in docs/verification/2026-11-01-web-studio-exact-claim-observation.json. Local logs: .superpowers/sdd/2026-11-01-web-studio-reconcile/.

## Local integration checkpoint
The Git merge is only main INTO the owned feature branch, not feature INTO main. Preserve two-parent ancestry and commit locally after final diff inspection; push/CI/preview remains a separate approval. No remote build on the combined version has run. Main may change again after this pinned comparison.
