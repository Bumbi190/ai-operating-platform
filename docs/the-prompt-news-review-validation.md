# The Prompt video review packet: validation and release boundary

Continuation after main advanced: [canonical-source integration and fresh 256-test validation](the-prompt-news-review-continuation-20261018.md). The results below describe the original implementation run; the follow-up does not claim a new green broad run.

Owner approved the spec at 09:40 and continuation of the plan/Native execution at 10:23 Stockholm on 18 October 2026. The approved smooth illustrated direction stays unchanged. This implementation prepares review evidence; it grants no publication authority.

## Resulting behavior

- Explicit operator CLI verifies the authenticated owner, current source-linked manuscript and actual H.264/AAC 720×1280 30fps movie. ffprobe and full A/V decode inspect a private snapshot of the exact bytes admitted. Dry-run is the default; no HTTP receipt-minting endpoint exists.
- Receipt evidence pins original source/time, English text, three ordered images, Victoria audio/timings, QA, attributable usage documents and existing same-project cost/provenance references. Missing or changed evidence refuses preparation.
- One real SQL transaction creates/reuses the approved plan's video destinations in existing social content revisions, attaching immutable evidence before any editorial decision. Changed retries conflict; partial multichannel failures roll back.
- Readiness and existing approval revalidate current inputs. Prepare and approval share ordered row locks and use a captured wall-clock time after locking. The existing project FK protects absent account binding insertion.
- Existing content UI shows exact private video, English caption, source/date, illustration/voice disclosures, destination and separate review/publication blockers. Full private bytes are verified before any Range response. Old JPEG behavior remains.
- `canPublish:false` and `dispatchEnabled:false` persist. No new provider generation, cost events, runs, publication requests, scheduling, CRON or trial activation is performed by this workflow.

## Observed validation

| Check | Actual result |
| --- | --- |
| Post-review news/content/publication regression set | 154/154 PASS, 21 files, no skips |
| New feature suites within that set | 40 tests; zero failures/skips |
| Full web TypeScript | PASS (exit 0) |
| Migration guard | 32/32 PASS |
| Security corpus replay and schema registry | 209/209 PASS; no exception/allowlist widening |
| Latest migration installed on fresh owned SQL fixture; SQL/API/races | 24/24 PASS, 3 files, no skips |
| Review findings reproductions then fixes | 6 intended failures / 5 existing passes before; 11/11 PASS after |
| Complete Remotion Node/tsx suite | 142/142 PASS, no skips |
| Editorial and news isolation contracts | Both PASS |
| Operator CLI --help | PASS; no authentication, storage or provider action |
| Git whitespace/diff checks | PASS |
| Complete broader web command | 13,799 passed / 377 failed / 1,114 skipped / 4 pending, across 665 files; diagnostic, not green |

Commands from `apps/web` used installed Node executables (pnpm unavailable), including:

```text
node ../../node_modules/vitest/vitest.mjs run --no-file-parallelism lib/social-launch/news-review lib/social-launch/content lib/social-launch/publication
node ../../node_modules/typescript/bin/tsc --noEmit
node ../../node_modules/vitest/vitest.mjs run lib/qa/migration-guard-v2.test.ts
```

Remotion used `node --import tsx --test` with all `tests/*.test.ts` and `tests/*.test.mjs`, then both existing isolation scripts.

The broad run caught nine news-store failures during the temporary lifecycle-row-lock iteration and three missing new-table classification failures. The final code removes that invalid lifecycle lock without expanding privileges; the post-review 154/154 and fresh 24/24 runs pass. The table is now classified SERVER_ONLY under created-not-live, and the 209-test security/registry rerun passes. Other broad failures remain unresolved; this is a draft handoff, not a ready-to-merge claim.

The broad diagnostic run began after the main synchronization and before the final reviewer fixes; it is not a clean, immutable-final-SHA release claim. Final scoped tests/typecheck/cold-schema checks ran after the reviewer fixes. Exact broader failures and skipped totals are in [the named-case appendix](the-prompt-news-review-broad-test-failures.md). No unrelated product changes were made to suppress those checks.

## Actual fixture and authority boundaries

Owned container `omnira-website-build-test-20261014`, label `com.omnira.testplan=atlas-live-build-20261014`, loopback only. Initial feature DB: `website_test_1792312538873`. Final cold-schema DB: `website_test_1792317099795`; broad diagnostic DB: `website_test_1792315718839`. Test helpers require owned names and label; no production fallback.

The cold fixture starts from the existing owned platform baseline and adds the canonical prerequisite definitions; it is not a replay of the entire Supabase schema from an empty database.

Tests execute real PostgreSQL tables/functions/constraints/RLS and independent psql sessions. Only external Auth/Storage/provider boundaries are faked. The binary fixture is an explicitly synthetic black/silent 22,656-byte, 11-second MP4, measured and fully decoded by real tools. Synthetic proof/cost rows exist only in these owned fixtures, never as claims about the real film.

The integration uses the real generic canonical admission writer and actual SQL through prepare/read/existing approve/invalidation, including unchanged lost-response retry, source/account change, zero provider network/new paid events/runs/publication requests and an unrelated actual JPEG path.

## Review and exact migration

One fresh independent read-only review of `3dd6942..f3f3a9f` found three Important issues and no Critical findings. The executor made one tested fix pass, committed as `f921354`. [Findings, fixes and all review exclusions](the-prompt-news-review-review-findings.md) are recorded separately. No independent post-fix re-review is claimed.

Exact proposed migration: `apps/web/supabase/migrations/20261018083917_media_news_review_evidence.sql`, **35,199 bytes**, SHA256 **`9cfd8807817878d492814cc29240114c3e3101ac8504651f377f375089b63e52`**. Git attributes preserve these exact bytes. [Forward/rollback review](the-prompt-news-review-migration-review.md) retains guards and audit rows and requires separate production approval.

Canonical main `e2316f1` supplied the owning workstream's exact sales/scheduling reconciliation and was merged into this feature in `507cf80`. No feature merge into main occurred. The new migration remains enforced (146 canonical / 132 enforced; frozen 14 / 30 lists unchanged) and unapplied by this work.

Local CLI advisors refused the non-TLS fixture even with sslmode=disable. No advisor PASS, shared-server reconfiguration or production SQL substitute is claimed. Production advisors/schema parity remain a separate release check.

No new authenticated deployment/browser result is established by these local tests. The normal preview gate requires the new migration; actual post-push deployment status is recorded in the PR/Notion handoff, never bypassed.

## Rulings and practical limits

1. Reused existing installed dependencies through temporary ignored junctions; no installation or shared dependency mutation. Matching package versions and full typecheck reduce dependency-drift risk.
2. Provenance identity follows the real `asset_provenance.asset_id` PK; consumers use asset IDs, not invented provenance UUIDs.
3. Owner FOR ALL provenance policy made an adapter string forgeable. Reserved admission now requires service_role insertion and initial installation refuses pre-existing reserved claims. Other producers remain unchanged.
4. Used the CLI-allocated unique migration timestamp and preserved its exact bytes; release must review/apply this file, not a placeholder filename.
5. Advisors TLS failure is an unavailable check, not a pass. A target-specific warning could remain unseen before separately approved release review.
6. SQL files run serially because fixture initializers replace functions. Actual two-session concurrency tests remain; no concurrency coverage was removed.
7. Global Database bridge stays generated from its canonical target. The feature uses scoped RPC types until an approved canonical schema refresh.
8. Conditional SQL public news projection plus TS byte verification preserves ordinary unmigrated/generic post shape and avoids a new-table read for every unrelated post. App and migration require coordinated release.
9. Incorporated canonical main into the isolated branch to resolve the old source blocker. This does not authorize production deployment, feature merge, CRON or another project's activation.
10. Review fixes preserve existing privileges: absent bindings use the real parent FK mutex; lifecycle changes already cooperate through their narrow project-locking RPC. No global account mutex or lifecycle UPDATE grant was added.

No Minor reviewer findings were deferred.

## Technical sample versus live news

The existing Anthropic source reaches 48 hours on **18 October 2026 at 18:26 Europe/Stockholm**. The approved private movie remains a technical example afterward; ingestion/fetched time does not refresh it. Its separate `pending_review/private_preview` placeholder is not promoted or rewritten.

Real intake still needs a genuine source-linked manuscript, exact canonical video and image/audio identities, attributable usage/QA documents and existing cost provenance. No real movie was admitted in this implementation task.

The seven-day trial is not live. Video transports, a concrete release decision, DST issue #378 and prospective 24h/72h measurement issue #383 remain later work.
