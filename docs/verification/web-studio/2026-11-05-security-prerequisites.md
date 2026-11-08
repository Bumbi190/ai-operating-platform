# Web Studio: local security prerequisites and recovered media SQL — 2026-11-05

Continuation of PR #368 from d94771c. This change affects disposable local diagnostic replay only.
Production received read-only migration-history SELECTs; no hosted schema/data, credentials,
paid resources, preview environments or schedules were changed.

## Implemented and verified

Two content-pinned schema-only security prerequisites now follow the corresponding local table fixture:
- cron_heartbeat: enable RLS, revoke all from anon/authenticated, retain service_role grants.
- platform_config: enable RLS and reproduce authenticated_read_platform_config (SELECT, USING true).
  The original unqualified table references are explicitly qualified to public in the executable body.

Only reviewed statements are extracted from the exact LF-hashed legacy source files. Full source execution
is prohibited by the existing synthetic-fixture executor. The body and extraction have separate hashes.
Execution locks the table, requires a superuser/bypass-RLS role, no rows and no existing policies, and
runs checks plus DDL in a single transaction. No unrelated tables or source-wide data operations are copied.

91/91 tests passed across all migration-*.test.mjs scripts (including 62 focused tests).
The new security test failed for the absent prerequisites before implementation, then passed.

Fresh isolated PostgreSQL replay: 187/187 steps, completed=true, zero cron job runs, cleanup=removed.
No network, mounts or published ports. The earlier runs-dispatch guard cases and real enqueue-idempotency
check passed again. The 14-table metadata comparison now has 15 differences: 14 environment owner
differences and the known media_insights column count. No RLS/policy-count/selected table-grant differences
remain in this limited comparison; full security parity is not established.

Six real database-role cases passed:
1. anon sees no platform_config rows.
2. authenticated can read the fictional config row and cannot update it.
3. anon cannot SELECT cron_heartbeat.
4. authenticated cannot SELECT cron_heartbeat.
5. service_role cannot directly change automation_paused, because the existing stop_guard_platform_config
   requires the dedicated stop function. That protection was preserved.
6. service_role can read config and insert/read a fictional heartbeat row.

All successful data probes rolled back; expected denied transactions rolled back on error.
These checks cover the two selected tables and internal enqueue, not real Supabase Auth or worker/model execution.
The initial test probe incorrectly assumed a direct service_role stop-state UPDATE was allowed;
the existing trigger rejected it. The corrected test requires that rejection; no trigger was weakened.

## Recovered historical source

Read-only production ledger entries recovered:
- 20260605071529 / media_insights_multiplatform: two text columns, script/platform unique index and comments.
- 20260605213648 / media_insights_retention: avg_view_pct numeric and comment.

The raw tool-returned payload is preserved in 2026-11-05-recovered-media-history.json.
An independent database metadata SELECT confirms the stored SQL uses actual LF characters:
756 bytes / 11 LFs / 0 escaped-newline sequences, and 315 bytes / 3 LFs / 0 escaped-newline sequences.
The tool representation's escaped newlines were decoded once, then verified against both returned byte lengths
and MD5 fingerprints before writing the archived .sql copies under recovered-history/. Their SHA-256 digests
are recorded in recovered-history/metadata.json. This is a recovered source snapshot, not a canonical migration,
not a full migration-history reconciliation, and it has not been executed in the local replay.

## Evidence and next step

- docs/validation/migration-bootstrap-replay-security-20261105.json: standard replay receipt.
- 2026-11-05-security-behavior.json: observed guard, role and enqueue results.
- 2026-11-05-security-behavior-probe.mjs: exact attended diagnostic adapter, retained for reproduction.
  It uses the existing local-only runner and the external catalog snapshot in the project Temp directory;
  it is a dated diagnostic script, not a new supported production CLI.
- Next: incorporate the recovered media DDL as separately pinned local-only prerequisites after the BI
  platform column exists, then repeat column/index/security comparison. Keep owner differences explicit.
- Production SQL identity for the wider ledger, complete catalogs, hosted branch replay, real login and
  the whole worker lifecycle remain unverified. replayReady remains false.

The existing showroom/calendar worktree changes were preserved. No push, merge or deployment performed.
