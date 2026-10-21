# Cross-tree migration replay inventory — 21 October 2026

This is a **local diagnostic inventory** at draft PR #504. It is not a
production migration plan, a repaired Supabase ledger, or proof that all SQL
replays. The local runner starts with `packages/db/full_schema_run_in_supabase.sql`,
then applies the canonical `apps/web/supabase/migrations` tree. The second
`supabase/migrations` tree contains 38 SQL files. The table pins their exact
bytes so a reviewer can identify what was considered. SHA-256 is for
provenance, not an endorsement to execute every file.

## Observed dependency edges

| Producer | Consumer | Evidence/status |
| --- | --- | --- |
| web `20260520_media_tables.sql` | web `20260520_media_images.sql` | The named files sort in the wrong dependency order; hash-pinned local exception already tested. |
| root `20260601_media_insights.sql` | web `20260602_atlas_bi_foundation.sql` | PostgreSQL first reported missing `media_insights`; the pinned root file let the isolated replay advance. |
| root `20260528_pg_cron_setup.sql` | web `20260614091000_h1p5_runs_claim_id.sql` | PostgreSQL next reported missing `omnira_cron`; the pinned root file let the isolated replay advance. This root file schedules jobs and needs the runner's isolated cron bootstrap. |
| root `20260609_dream_issues_ledger.sql` | web `20260617160200_backfill_dream_issues.sql` | PostgreSQL had reported missing `public.dream_issues`. The pinned root file and the web backfill both passed in the offline fixture. It also backfills from `public.memories` and references `public.manager_tasks`, both declared in the base schema. |
| root `20260603_cron_heartbeat.sql` | web `20260623_150300_atlas_collector_cron.sql` | Next observed failure: `relation "public.cron_heartbeat" does not exist` at the web migration's seed `INSERT`. The root file creates the table **and schedules a heartbeat job**. This edge is not yet exercised; any test must retain disabled cron launching and network isolation. |

The first four edges have passed in the isolated container. The fifth
is a candidate for separate review and test. The root `manager_task_dream_link`
file adds optional manager task columns; the observed web backfill reads only
`dream_issues`. It is therefore not automatically pulled into this fixture.

## Root file inventory

`fixture` means already exercised in the isolated runner; `candidate` means
identified for review before a possible next diagnostic; `hold` means **not selected for replay**.
Flags are a static text scan for cron registration, network calls, destructive
DML/DDL, or secret/role text; absence of a flag is no safety guarantee.

| Root SQL file | SHA-256 | Status | Static flags |
| --- | --- | --- | --- |
| `20260520_background_music.sql` | `7c82e72f226c901dfc01757d8f87141951019a95b78928d9605abc4da073f0d8` | hold | — |
| `20260520_render_columns.sql` | `d20eea131d22da77ed8d9911c078fd935b13c20bf3afb5ab2fd9477321f38223` | hold | — |
| `20260521_composition_column.sql` | `45697a7d462328e02b83bb3ac3af767478bdeddfeaebe0f3d7cce283089b4b8f` | hold | — |
| `20260522_evaluation_memory.sql` | `4d65ccfbc36f442252fc960064f1d635acd245e746dd8cb0c3602ccae541afb6` | hold | — |
| `20260522_evaluation_memory_fix.sql` | `773e3ff16a641a4b39b48a7c2508035cb7ff04314b9fbef678fd949ed07d2a11` | hold | delete/drop |
| `20260522_instagram_columns.sql` | `5120f86021749a052b5b943137f50aa6b52c7dc73705cb9697911c0782c56958` | hold | — |
| `20260528_pass_a_safeguards.sql` | `4665ac611487c0d833914c2b2e40de11b2e0433e9ed89d172b9b0e463e4c0c04` | hold | — |
| `20260528_pg_cron_setup.sql` | `22569e22cd61cef171ad3be914a02d3e7d013a787304ce6904f09a24218d0967` | fixture | cron, HTTP |
| `20260529_comment_replies.sql` | `b7ca35d9faf4fd8de49462114a9408e1e638de0c875d41dc409e83af224b8e3d` | hold | cron, HTTP |
| `20260530_news_items_dedup.sql` | `03bf61045429c669d65ce71224d683b0092fdae634ac01a1396102cc7976f4d0` | hold | delete/drop |
| `20260531_pg_cron_competitors.sql` | `6bd1378905fe40a8a44cca6404903ce2d9209fd0213193648c6d86fd86d24db9` | hold | cron |
| `20260601_briefing_cron.sql` | `9cac5528028be6a9c804d12e8f9acd0f584dd1e6ca4b8436a9f8e757a8ff24a8` | hold | cron |
| `20260601_business_metrics.sql` | `db527f4a5e1749ff2b5db63a8514c2a44eb201c31badb7cd1ec0360511f8a035` | hold | — |
| `20260601_insights_cron.sql` | `5f955734a29463131853e00b4546eb3df9146259bb5c658d992619f7458f2c9b` | hold | cron |
| `20260601_media_insights.sql` | `b3cad2590764175d104db1f6f62a48b2b63915e95fc3f0ee4020233e2ee941dd` | fixture | — |
| `20260602_atlas_growth_account_snapshots.sql` | `f035e5ff0e1b03d85a61463da8f1f0398445545544abf748d07beeee55617bb9` | hold | — |
| `20260602_atlas_growth_opportunities.sql` | `a1f5c3d0b2246606f40dba90a43c20dd19e43ecd87aa2bcb40e20d1e1c3f40a8` | hold | — |
| `20260602_atlas_growth_script_topic_format.sql` | `0eb5d380aba51e0ecabbe9fa8e2c846c5fd4d553fa634cd973e077bc69504e51` | hold | — |
| `20260602_g1_multitenant_platform_tokens.sql` | `88a3f8e1f95cf3334dbedc11edb924a316d630ea52f7d47458665766db712d98` | hold | — |
| `20260602_stripe_intelligence_revenue_snapshots.sql` | `941d578548f895e5087c201502bcc34c8cf9e8b90f422d7b35dbcffc764e833e` | hold | — |
| `20260603_cron_heartbeat.sql` | `f3c28dcd9bd031098bed10f86817f7e4bb55d5b03193199e102ffeae9bcbd831` | candidate | cron, secret/role |
| `20260603_durable_runs.sql` | `a189659945447189022e96bb8a26a5cb4e0e26fb321c9f56a02d0b6e44da7ee4` | hold | cron, secret/role |
| `20260603_marketing_engine_foundation.sql` | `90ab8c043371e706db0c304dcee1085f184d3779572dc5b94518b2bb16371b60` | hold | — |
| `20260603_pipeline_retry.sql` | `ac9a45ed5fd058d16d9b501822bd4d7b95125dfdcd810bb1db3120f9f6008283` | hold | cron |
| `20260603_token_health.sql` | `df760a6c0675c6294e3762ca68bca31cb4e429992934bfca76e81644d51dd625` | hold | cron, secret/role |
| `20260606_bug_monitoring_foundation.sql` | `a45e337163f1c281778b068969c066adfff91c41e29de4a61afb6e0379dc9460` | hold | secret/role |
| `20260606_killswitch_cancel.sql` | `e8c7a7bb9fb1594f612c4077eb80d6113050d5487f91d56c2b18d921f7f3a111` | hold | secret/role |
| `20260606_pr2_route_webhook_isolation.sql` | `5b6368cb8545e089094540e2d3809de495f54daccb4ff2820a2ef289679cff70` | hold | — |
| `20260608_project_media_settings.sql` | `32f6ed9d38aa58f7768d37d42b15ebfcfaea57ee7f82c3f166ade34467452bb5` | hold | — |
| `20260609_dream_issues_ledger.sql` | `efc2b09e75c60fb8d14bcafdf4bcf2712e7d28e2107336634487d18fb9510089` | fixture | — |
| `20260609_manager_task_dream_link.sql` | `c1fb7723f386343e61f9f81297f6e0eb2622dde1d703d348298e7c57b22a767a` | hold | — |
| `20260611_atlas_actions.sql` | `c2ef6b952f5b84f169fa5ce8836e1ce7382f85553758daaf6fc84758ae7fb7f5` | hold | — |
| `20260614_cron_guardian.sql` | `7e0d85d872c0ac4c94f8c0e88577adf92d54c49d9141bf17c6c4e2f518e4161f` | hold | cron |
| `20260629_120000_atlas_intelligence.sql` | `6c8fc2c33f26a812685e9f401c88c19dfa290b4de28dc550ac826b524750299f` | hold | — |
| `20260629_120100_atlas_entities.sql` | `62ebde75d231bbc6df8187e2db61313b2f853810351d85e142831fd782816006` | hold | — |
| `20260629_200000_atlas_intelligence_cron.sql` | `88e780c416a4b6f283510cd23cbf9897014baa9a1d152f12b7c5a003f4d66090` | hold | cron |
| `20260706_stage1_memory_foundation.sql` | `614082ddfe5d0f33c586d0f79b59a53776a9ae119f5cde99144e7dd6f16d3259` | hold | — |
| `20260707172102_enable_public_rls_for_internal_tables.sql` | `e53cdcff2cc26fa22c19b3d42c180bf20c44596b06b173e6b5bf9308e742f3b5` | hold | secret/role |


## Review boundaries and next gate

Several held root files create tables mentioned by later web SQL (for example
`atlas_actions`, `cron_heartbeat` and `token_health`). Others schedule live jobs,
change permissions, or overlap later canonical migrations (`atlas_entities`,
`atlas_intelligence`, memory foundation). Text references do not prove an
execution dependency: conditional SQL and schema-qualified names require a
PostgreSQL result and object-by-object review. Do not merge all 38 histories
by filename or infer production completeness from this inventory.

The `--mode=legacy-dream-replay` run on Hultgren passed 10/10 ordering tests,
applied the pinned Dream ledger and all canonical SQL through the June 17
backfill, then stopped in `20260623_150300_atlas_collector_cron.sql` at the
missing `public.cron_heartbeat` table. The runner removed its owned container.
This is a real PostgreSQL result, **not a full replay pass**. The next fixture
change needs a review of the heartbeat root's scheduled job and the later
root objects referenced by web migrations before another offline run.

A full replay claim requires the remaining ordering and overlap decisions,
all canonical SQL applied exactly once, and a passing result. Separately,
production's missing May baseline still prevents a fresh Supabase branch from
reconstructing the installed schema. None of these local experiments alters
production, the production migration ledger, or its guard.
