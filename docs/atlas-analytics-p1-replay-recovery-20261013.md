# Atlas P1 local replay repair — 13 October 2026

## Result and boundaries

The local Storage bootstrap and same-date media ordering issue are repaired in a separate branch above PR #323's exact head `2dd5c0fd50fc18a203f1866a4b1cc5f21816b740`. The change affects local verification scripts only. Historical SQL bytes, migration filenames, production migration guard/ledger policy and P1 runtime code are unchanged.

`--mode=canonical-replay` retains lexical canonical-file order.
`--mode=dependency-replay` explicitly moves the hash-pinned `20260520_media_tables.sql` before `20260520_media_images.sql`, retaining every canonical SQL file exactly once. Missing prerequisite, duplicates or changed exception bytes refuse verification. This mode does not establish lexical replay success.

Replay bootstrap reads upstream `0002-storage-schema.sql` and `0008-add-public-to-buckets.sql` from cached `public.ecr.aws/supabase/storage-api:v1.79.36` using `--pull=never --network none --rm --entrypoint cat`. Exact SHA-256 pins are checked before applying SQL. The upstream `storage.install_roles=false` switch preserves the PostgreSQL image's existing roles. This is the Storage prerequisite needed by the baseline; it is not a full Storage service fidelity claim.

## Fresh verification

- Six native Node regression tests pass, including all actual canonical SQL filenames retained once, required ordering, changed bytes, missing prerequisites and duplicate rejection.
- Migration guard and migration security suites: 157/157 pass.
- Updated runner's unchanged P1 dependency path: real isolated SQL gate passes (49.84 seconds), including 12-session dedup, nine exact encoding/hash fixtures, privileges, immutable triggers, source/owner/mode locking, freshness and rollback.
- Earlier exact PR #323 verification on 13 October: 355/355 targeted tests and TypeScript pass, plus its separate real SQL gate (51.05 seconds).
- Fresh independent whole-branch review of PR #323 against approved base `22923263a09500ebb601a6c38a53e7f91ce808d8`: no new Critical, Important or Minor findings. Reviewer inspected code and evidence, did not independently run tests.
- Separate read-only review of the replay repair: no Critical, Important or Minor findings.
- Node syntax and git diff whitespace checks pass. The broad repository suite remains historically red as documented in the original P1 report; it was not rerun for this verification-only repair.

## Remaining full replay blocker

Dependency replay passes the full baseline and seven canonical migrations, then stops in `apps/web/supabase/migrations/20260602_atlas_bi_foundation.sql` at:

`ALTER TABLE media_insights ADD COLUMN IF NOT EXISTS platform ...`

PostgreSQL reports `relation "media_insights" does not exist`. Its CREATE TABLE is in `supabase/migrations/20260601_media_insights.sql`, the separate root history explicitly excluded by the approved P1 replay plan. No root migration is injected, skipped or rewritten. A complete baseline for that legacy history remains unresolved. **Full replay is BLOCKED, not PASS.**

Logs are retained in the separate recovery evidence directory. P1 migration SHA-256 remains `0582d94689b34e6704c26a830b879741d233ff81a7139bf28ce3642e83000738`.

### Follow-up diagnostic mode (21 October)

`node apps/web/scripts/verify-analysis-drafts-local.mjs --mode=legacy-media-replay`
adds only the hash-pinned root `20260601_media_insights.sql` to the local
dependency replay order before `20260602_atlas_bi_foundation.sql`. It checks
the root SQL bytes, retains every canonical web migration, and refuses a
missing BI migration or a duplicate filename. The canonical and dependency
modes keep their previous order and scope. The initial ordering tests passed
(8/8) in scratch and CI; scratch itself has no Docker.
This diagnostic exposes the next dependency; it does not establish complete
historical replay or working Supabase branch creation. It also does not repair
the production migration registry's earlier missing `media_scripts` baseline,
change any migration ledger, or apply SQL to production.

An attempted isolated GitHub Actions run on 21 October
([39619027578](https://github.com/Bumbi190/ai-operating-platform/actions/runs/39619027578))
passed the eight ordering tests, but its first image download failed with
`toomanyrequests: Data limit exceeded` from public ECR. The SQL step was
skipped. The temporary automatic workflow was removed to avoid repeating the
same blocked pull. No PostgreSQL replay result can be inferred from this run;
use a machine with the exact required images already cached to run the command
above. Do not substitute a different image version without reviewing its
extension and bootstrap parity.

On the connected Hultgren workstation, both exact image versions were already
cached. A fresh detached worktree at the PR head ran the diagnostic in its
owned container with network disabled and zero port bindings. The replay
passed `media_insights`, `atlas_bi_foundation`, `cost_events` and later
canonical files, then stopped in `20260614091000_h1p5_runs_claim_id.sql`:
`schema "omnira_cron" does not exist` while replacing
`omnira_cron.reap_stuck_runs()`. The runner removed the owned container on
failure, and the worktree remained clean. This is the next observed local
dependency, not a full replay result.

`--mode=legacy-cron-replay` adds the exact hash-pinned root
`supabase/migrations/20260528_pg_cron_setup.sql` before the later watchdog,
alongside the media insights root file. It runs only in the isolated offline
container with `cron.launch_active_jobs=off`. The SQL file contains placeholder
URL and secret values; the diagnostic does not point at live services. The
earlier `--mode=legacy-media-replay` remains available to reproduce the
missing-schema failure.

## Production installation decision

The preview's exact Vercel build stops before Next.js compilation because production lacks the enforced `atlas_analysis_drafts` migration. This repair intentionally does not make that deployment green.

The approved implementation plan's Task 7 accepts either a full replay transcript or an explicit replay blocker. The legacy gap blocks a full historical replay claim; it is not by itself a failed isolated P1 acceptance gate. Storage activation still requires a read-only inventory of the real target's P1 prerequisites and privileges, human code review and separate operator approval. Apply only the reviewed migration in an atomic transaction, verify resulting catalog/ledger/hash, then rebuild with Save off. Feature enablement needs live authenticated save/history verification. No production installation, feature/environment/secret change, merge, collection or workflow activation is performed by this repair.
