# Web Studio: wider catalog and API privilege comparison — 2026-11-05

Continues PR #368 from 348aaae. Production access was metadata-only SQL (including a transaction-local
search_path setting); no application rows, credentials, hosted schema/data, schedules or paid resources changed.

## Scope and result

The fixed catalog query uses SET LOCAL search_path=pg_catalog in both environments. Scope:
28 public tables (the earlier 14 prerequisites plus website-prefixed tables), their columns, constraints,
indexes, policies and noninternal triggers; public website functions and public functions directly called
by these triggers; selected API-role access, role attributes/memberships and default ACLs.

| Object category | Production count | Comparison result after local fix |
| --- | ---: | --- |
| Columns | 382 | Selected types/nullability/default hashes/identity/generated fields match |
| Constraints | 206 | Type, validity, deferral flags and definition fingerprints match |
| Indexes | 106 | Definition fingerprints and unique/primary/valid flags match |
| Policies | 21 | Command, roles, permissiveness and expression fingerprints match |
| Triggers | 29 | Enabled flags and definition fingerprints match |
| Functions | 53 | 49 exact definition fingerprints; four reviewed textual differences below |
| Table API access records | 84 | All seven queried privilege flags match |
| Function API access records | 159 | EXECUTE flags match |
| Schema API access records | 9 | USAGE/CREATE flags now match |
| Selected role attributes / memberships | 5 / 9 | Queried flags match |
| Default ACL entries | 9 | Six postgres default entries absent locally |

No non-null per-column ACLs were returned in this scope. Function security-definer flags and configuration
settings match. Metadata fingerprints are equality evidence, not an independent proof of behavior or provenance.

Production has 1100 records, local 1094: six missing default-ACL records, no extra records,
1013 identical records and 81 changed table/function records. All 28 tables and 53 functions have
owner/raw ACL differences (production postgres versus local supabase_admin and associated grantors).
Effective API privilege comparisons remain explicit; no owner/ACL differences were erased or normalized away.

Missing local defaults concern postgres-created sequences/functions/tables in public and storage.
The replay creates objects as supabase_admin and already reproduces defaults for that role.
No postgres defaults or owners were changed. Existing-object access matching does not establish
future-object or owner-dependent SECURITY DEFINER equivalence.

## Local fix

The wider query exposed missing storage schema USAGE for anon, authenticated and service_role.
The pinned storage migrations are run with install_roles=false in the local executor, which omits
managed role setup. A local prerequisite now grants exactly schema USAGE to those three roles,
after storage creation and before the replay sequence. It is hashed in the receipt.
This does not grant table access, create policies, operate Storage HTTP APIs or alter hosted permissions.

Two behavior tests failed before implementation: the prerequisite was absent, and its failure could not
stop the sequence. Both now pass. All migration-*.test.mjs tests passed: 96/96.
Fresh real local replay after the fix: 189/189 applied, completed=true, zero cron job runs,
cleanup=removed, no network/mounts/published ports. The new catalog confirms all nine schema-role
USAGE/CREATE records match production. replayReady remains false.

## Four function text differences investigated

- runs_action_binding_guard and runs_action_outcome_guard: comments/whitespace differ.
- runs_human_story_binding_guard and runs_require_bind_provenance: CRLF versus LF differs.

The production definitions were fetched read-only. The latest repository source bodies were extracted
from the three specific canonical files, and reconstructing pg_get_functiondef with these bodies
reproduced every corresponding local definition MD5. For these reviewed bodies, code tokens match
after ignoring comments and whitespace outside quoted literals; string/identifier tokens are preserved.
The raw differences remain recorded. The dated diagnostic tokenizer is not a general SQL parser and
does not establish universal semantic equivalence or historical migration identity.

## Evidence

- docs/validation/migration-bootstrap-replay-wide-catalog-20261105.json: successful standard receipt.
- 2026-11-05-wide-catalog-diff.json: complete object-level differences.
- 2026-11-05-guard-source-comparison.json: the four source comparisons.
- 2026-11-05-wide-catalog.sql, 2026-11-05-wide-catalog-probe.mjs,
  2026-11-05-wide-catalog-diff.mjs and 2026-11-05-guard-source-probe.mjs: exact diagnostic reproduction files.
  The dated adapters use the known local worktree and external Temp snapshots, not a production CLI.
- Raw production/local metadata and production guard definitions remain outside Git in the project Temp directory.
  Snapshot digests are recorded in 2026-11-05-wide-catalog-sources.json.

## Remaining boundary

This is a wider scoped comparison, not the complete database catalog. Unchecked areas include views,
sequences, all recursively called helper functions, extension/platform objects, Storage object/table policies,
Auth internals, service HTTP behavior and complete cron configuration. Default ACL/ownership differences,
the broader historical ledger/provenance gaps, real Supabase login and the full worker/model flow remain.
The next acceptance target still needs an explicit isolated baseline/environment contract and cost authorization
before creating paid hosted resources. No push, merge or deploy performed. Existing showroom/calendar edits preserved.
