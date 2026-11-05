# Production migration-ledger reconciliation — 2026-11-05

Offline, read-only metadata analysis for existing PR #368 / `codex/atlas-builder-references-20261017`.
**Automatic Dashboard branch migration replay remains unproven.** No Docker, SQL, network, database/ledger writes,
schema/security changes, commit or push were performed. The raw export stays outside the repository.

## Evidence and rules

Input: `C:\Users\Andre\Projects\Omnira\Temp\webbuilder-production-migration-metadata-20261105.json`,
197 `{version: string, name: string}` records in `{source, asOf, count, migrations}`. Its source label describes a
read-only Omnira production main export; this offline run cannot independently authenticate its origin or freshness.
Only metadata, filenames and local content hashes are emitted; SQL bodies, application rows and credentials are excluded.

The [utility](../../../apps/web/scripts/migration-ledger-reconciliation.mjs) preserves version strings exactly.
It splits filenames at the **first** underscore. An `exact_pair` requires an equal version and equal suffix name.
An exact suffix or complete filename stem (without `.sql`) at a different version is only a `name_only` candidate.
No fuzzy matching, substring matching, date stripping, case folding or timestamp padding occurs. Duplicate ledger
versions/names and competing candidates are surfaced as ambiguous; same-version/different-name candidates are conflicts.
Even an exact pair proves metadata correspondence only: the export contains no production SQL/checksums.

| Ledger classification | Count |
| --- | ---: |
| Exact version + suffix name pair | 13 |
| Name-only candidate, identity unverified | 171 |
| No candidate in either source directory | 13 |
| Ambiguous / version conflict | 0 / 0 |
| Total | 197 |

No duplicate ledger names or versions were observed. Of the 171 name-only candidates, 167 match exact suffixes and
four match complete stems: `20260601_business_metrics`, `20260601_media_insights`, `20260601_insights_cron`,
`20260601_briefing_cron` (all legacy sources). These are literal stem matches, not inferred aliases.

| Source directory | SQL files | Exact pairs | Name-only candidates | No ledger candidate |
| --- | ---: | ---: | ---: | ---: |
| `apps/web/supabase/migrations` | 174 | 12 | 155 | 7 |
| `supabase/migrations` | 38 | 1 | 16 | 21 |

Thus 162 canonical files lack an exact version/name pair. For example, production
`20260602045914 / cost_events` has a name-only candidate in canonical `20260602_cost_events.sql`;
`20260602113831 / atlas_bi_foundation` similarly points to `20260602_atlas_bi_foundation.sql`.
The one legacy exact pair is `20260707172102_enable_public_rls_for_internal_tables.sql`.
These counts do not mean any unmatched file is unapplied or safe to apply.

## Ledger entries without candidates

| Version | Production name |
| --- | --- |
| 20260601071917 | media_scripts_updated_at_and_stuck_watchdog |
| 20260601072505 | add_render_input_props_for_edge_render |
| 20260601102516 | add_youtube_columns |
| 20260603055456 | durable_runs_claim_reaper |
| 20260603055620 | durable_runs_claim_public_rpc |
| 20260603084745 | token_health_monitoring |
| 20260603085842 | pipeline_retry_state |
| 20260605071529 | media_insights_multiplatform |
| 20260605213648 | media_insights_retention |
| 20260605232026 | media_scripts_breaking_flag |
| 20260606032600 | schedule_dream_cron |
| 20260609164447 | enable_rls_cost_rates_dream_issues |
| 20260609165615 | harden_set_updated_at_search_path |

In particular, `durable_runs_claim_reaper` / `durable_runs_claim_public_rpc` are **not** equated with
`20260603_durable_runs.sql`; `token_health_monitoring` is not equated with `20260603_token_health.sql`, and
`pipeline_retry_state` is not equated with `20260603_pipeline_retry.sql`. Similar subjects are insufficient evidence.

The seven canonical files without any ledger candidate are `20260520_media_images.sql`, `20260520_media_tables.sql`,
`20260525_media_scripts_facebook.sql`, `20260525_media_scripts_quality_music.sql`, `20260527_platform_tokens.sql`,
`20260528_agent_decisions.sql`, and `20260601_revenue_os.sql`. The CLI reports every source's reverse coverage,
including all 21 legacy files without candidates, without committing the complete 197-record export.

## Replay inputs and missing pre-ledger baseline

The existing [v10 receipt](../../validation/migration-bootstrap-replay-v10-20261105.json) reports completed 184/184,
174 canonical + 10 fixtures. Its completion/coverage fields are internally consistent and all 184 LF-normalized
content pins verify against today's local inputs. No execution was repeated. The canonical path set is fully covered.
The earlier `migration-bootstrap-replay-full-20261105.json` is a failed historical attempt, not the successful receipt.

| Additional local replay input | Ledger evidence under these rules |
| --- | --- |
| `packages/db/full_schema_run_in_supabase.sql` | Outside migration directories; no migration version/name identity |
| legacy `20260528_pg_cron_setup.sql` | No candidate |
| legacy `20260602_stripe_intelligence_revenue_snapshots.sql` | Name-only candidate |
| legacy `20260603_cron_heartbeat.sql` | Name-only candidate |
| legacy `20260603_durable_runs.sql` | No candidate |
| legacy `20260609_dream_issues_ledger.sql` | Name-only candidate |
| legacy `20260609_manager_task_dream_link.sql` | Name-only candidate |
| legacy `20260601_media_insights.sql` | Whole-stem name-only candidate |
| synthetic `platform_config_table_only` | No candidate for source `20260528_pass_a_safeguards.sql` |
| synthetic `platform_tokens_schema_only` | Source `20260602_g1_multitenant_platform_tokens.sql` has a name-only candidate |

Synthetic pins verify the reviewed source and extracted/transformed body through the existing guarded extractors;
their output is not a whole production migration. Six fixture sources have name-only candidates, including one
synthetic source; none establishes fixture/production SQL identity.

The baseline gap is missing **registered bootstrap provenance**, not proof of missing production tables.
The existing offline provenance scan identifies early dependencies on `agents`, `memories`, `outputs`, `projects`,
`run_logs`, `runs`, `workflows`, plus `media_insights` and schema `omnira_cron`.
`packages/db/schema.sql` and `packages/db/full_schema_run_in_supabase.sql` are Git tracked (verified with `git ls-files`),
but neither is a registered canonical migration. Older tools' “untracked fixture” terminology means unregistered
as a migration, not Git-untracked. The full-schema fixture supplies the seven baseline tables; `media_insights`
needs an interleaved legacy fixture after canonical `media_tables`. Other replay prerequisites include
`cron_heartbeat`, `dream_issues`, `manager_tasks` columns, durable runs/revenue snapshots and the two synthetic inputs.
The earliest exported ledger entry is 20260601071917; its metadata cannot reconstruct the pre-ledger state.

The receipt also depends on platform/auth stubs, default privileges, pinned storage prerequisites, disabled cron
launching and a custom dependency order. This comparator verifies its 184 applied-file pins, not the platform image
contents or live catalog. Local replay success therefore does not prove an empty bootstrap, hosted parity, or that
Dashboard automatically applies the canonical directory with this fixture stack and ordering.

## Catalog limits and conservative decision

No production catalog was queried or supplied to this comparator. Name/version metadata cannot establish columns,
types/defaults, constraints/indexes, function bodies/search paths, triggers, extensions, owners, grants/default ACLs,
RLS flags/policies, storage state or cron jobs. It also cannot establish original SQL, historical order, drift,
statement splitting, rollback behavior or the security equivalence of the local stubs/extractions.

1. Keep automatic branch replay/readiness blocked on unresolved provenance; `replayReady`,
   `productionSqlIdentityValidated` and `catalogParityValidated` remain false.
2. Review original deployment artifacts/SQL for the 13 unmatched entries and the 171 name-only candidates.
   Record explicit version/name/content evidence; do not infer aliases from similar names.
3. Separately review a reproducible baseline and complete prerequisite/order contract for an isolated target.
   The existing fixtures are diagnostic inputs, not authorization to run them on a hosted database.
4. A separately authorized future metadata/catalog comparison and isolated Dashboard replay would need to establish
   target identity, actual applied sequence and schema/security parity. None was performed here.
5. Leave the production ledger intact. This report proposes no ledger repair, renaming, marking applied,
   schema change, policy change or production replay.

## Reproduction and verification

```powershell
node apps/web/scripts/migration-ledger-reconciliation.mjs --metadata C:/Users/Andre/Projects/Omnira/Temp/webbuilder-production-migration-metadata-20261105.json
node --test apps/web/scripts/migration-ledger-reconciliation.test.mjs
```

The utility reads local files and prints deterministic JSON to stdout; it writes nothing and reads no environment
credentials. Exit 0 means the report was computed and the historical completion/pin/coverage checks passed;
2 means replay evidence is incomplete or pins drifted; 1 means unavailable/invalid input. None authorizes migration.
If the external metadata file is inaccessible, no ledger counts can be inferred from that failed run.

Validation: **10/10 focused offline Node tests passed** (strict matching, duplicates/conflicts, reverse coverage,
LF pins/drift, path rejection, synthetic pin impersonation, partial receipts, malformed/unreadable input,
repeatability and unchanged input-directory contents). Two real CLI runs exited 0 and produced identical bytes.

Evidence digests (SHA-256):

- External snapshot bytes: `69a7005708993d138ae1d7b5931dcbdbc307251e260501999c66c353849a788e`
- Sorted ledger metadata: `ded16fc09f7d3f91173c54da646a9f144f29d07e76023c3234f6829653680a32`
- Sorted source inventory with LF SQL hashes: `3ccf9ad606cee08997eb770ed0629868c84680a7d17614f0e2113151cf81f091`
- Existing v10 receipt bytes: `03eecea6f66c54e0a15f3a6366da4aa2aa30ac6dddd0eebd195559b34356e1d9`
- Deterministic CLI stdout: `abaab7f4af49335b035a5e428a1db98590d900f83bef10ee188a194792f4b826`
