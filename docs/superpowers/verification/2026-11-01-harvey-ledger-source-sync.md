# Harvey: already-applied migration source reconciliation

Date: 2026-11-01. Existing Draft PR #386; this work continues its current branch.

## Scope and source evidence

Two migrations applied by parallel workstreams were absent from Harvey's canonical source inventory. The existing guard correctly rejects unknown production-ledger names. This change includes their exact canonical SQL and reconciles the inventory; it does not rerun either migration or change production data, privileges, feature flags, worker installation or runtime activation.

The source was read from commit `2a8fd87c8fa8b026c14a70291b21fd0799e1a9a5`. The root agent verified each Git blob against the one stored SQL statement in its already-applied production ledger entry. Independent local calculation confirmed the lengths and hashes below. This is source-to-ledger evidence, not a new execution or full-schema replay test.

| Canonical file | Applied ledger version | UTF-8 bytes / characters | SHA-256 |
| --- | --- | --- | --- |
| `20261031204433_human_story_exact_claim.sql` | `20261031204433` | 9,168 / 8,806 | `a7ffd88a4b1881b3173e4dfe98af5d6d6ea1d7bb47b0c09411954cbd698a32e6` |
| `20261101062259_social_campaign_preparation.sql` | `20261101062748` | 27,285 / 27,285 | `1c2606bbb98cb3192b4a240b017fc6452a005e93d81183ae8373e11c97367aa1` |

Statement MD5 values are respectively `d2fd6b4bfcc8048176f75b66ec70b6a7` and `fe48ff121dd9f8b9d1a02b72fa0cd218`. The Social filename and applied version intentionally differ. The guard matches canonical migration names; no duplicate file or ledger rewrite is introduced. Historical `PROPOSED`/`NOT APPLIED` comments remain unchanged to preserve exact source bytes; the applied versions above record their current status.

## Minimal guard reconciliation

`apps/web/scripts/migration-guard-policy.mjs` changes only provenance comments and the explicit corpus tripwires: **167 to 169 canonical files; 153 to 155 enforced migrations**. The corresponding complete expected ledger fixture grows **190 to 192 names**. The 14 grandfathered names, 30 legacy-only names, their hash pins, policy version and complete enforcement algorithm are unchanged. A byte comparison from the beginning of the frozen arrays through the end of the file confirms this; the updated module's `assertMigrationGuardPolicyIntegrity()` passes locally.

The test update starts from Harvey's existing file. It preserves its stronger two-direction `social_owner_crosschat_context` test, both B2B exact-once cases and all historical captures. Only current counts and three explicitly hypothetical complete fixtures are extended. Four parameterized cases add missing/unknown/duplicate checks for the two reconciled names and pin their canonical SQL hashes. Ordinary Windows checkout CRLF is normalized to Git's LF for these content checks.

The parallel test file was not copied wholesale: it would replace existing Harvey assertions and introduce a separate evidence-JSON dependency. No guard bypass, wildcard, new historical exception, skip or weakened negative expectation is added here.

## Four-table scoped security observation

The root agent performed a read-only metadata query in production project `iboepohjwrhtgshrqaol`, limited to the following four public tables. It read no data rows and performed no SQL writes.

| Tables | RLS | FORCE RLS | Policies | Effective anon/authenticated table privileges | Service-role table privileges |
| --- | --- | --- | --- | --- | --- |
| `sales_discovery_batches`, `sales_discovery_candidates` | On | Off | 0 | None | SELECT, INSERT, UPDATE only |
| `social_campaigns`, `social_campaign_items` | On | On | 0 | None | SELECT, INSERT, UPDATE only |

The security registry gains four `SERVER_ONLY` rows, taking its classified row count **185 to 189**. The two already-applied Sales tables leave `created_not_live.tables` and `.classes`; their obsolete planning note is replaced by the dated scoped observation. Two dated notes record the actual privilege breadth and FORCE RLS distinction without changing the existing row contract. `service_role: true` denotes reachability, not unrestricted privileges.

All original 185 table rows, all views and the global capture date **2026-09-25** remain unchanged. This is not a new whole-catalog capture. The final reconciled registry SHA-256 is `fe35cea8c77bc5f938c284a7026a4c9ed60fabf487eb8b5e2050e49425e15419`.

Independent review of the complete `migration-security-gate.test.ts` diff confirms that only the two parameterized Sales classification cases are updated from pending to observed-live. They now require the full SERVER_ONLY/RLS/zero-policy/no-client-grant shape and absence from both pending lists. The `tableClass` check remains. Existing negative grant and final replay tests are unchanged.

## Material release dependencies

`human_story_exact_claim` adds the internal `claim_runs_selected` core and changes ordinary `claim_runs(integer,integer)` to call it. The selector is denied to public, anon, authenticated and service_role; ordinary claim retains service-role execution. The authenticated `approve_and_claim_human_story` entry point combines canonical approval with the exact run claim. This is a platform `runs` dependency, not an exact-job selector for Harvey's `sales_claim_job`. Its predecessor body-hash guard and earlier schema/function dependencies remain intact. Neither source equality nor the name-set guard proves a fresh full database replay.

`social_campaign_preparation` adds the two protected Social tables and 14 service-only invoker functions for bounded preparation, state transitions and evidence. Its callable enqueue function can create campaign runs; the migration itself creates no jobs and makes no provider calls. No Social application feature files, image-generation activation or publication authority are imported by this reconciliation. Future fresh schema builds will include these already-applied database capabilities, so they remain explicit release dependencies.

## Local verification before push

On stationary Hultgren at 2026-11-01 07:07:18 UTC, all **266 tests passed**, with zero failed or skipped tests, and **full TypeScript passed**; both commands exited 0. This run tested the reviewed working-tree changes on base `61ddec2a7f0d4351a60c8a22ce693aa7c9daa763`, including the exact SQL and registry hashes above and the two-case classification correction.

From `apps/web`:

```text
npm exec --no -- vitest run lib/qa/migration-guard-v2.test.ts lib/qa/schema-security-invariant.test.ts lib/qa/migration-security-gate.test.ts --maxWorkers=1 --minWorkers=1
npm run typecheck
```

The first desktop run passed **264 of 266 tests**. Its only two failures were the old parameterized Sales assertions that still required the tables to be `created_not_live`. Only those stale assertions were corrected to the observed-live contract. A subsequent PowerShell wrapper treated a harmless native stderr deprecation warning as terminating; the final Python subprocess runner preserves the actual native exit codes and captures both streams. This was a test-runner correction, with no application or assertion changes.

Evidence on Hultgren: `C:\Users\Andre\Projects\Omnira\Temp\harvey-resume-20261101\verified-checks-result.json`, `schema-tests-verified.json`, `schema-verified.log`, `typecheck-verified.log`, `ledger-source-review.json`, `ledger-sync-applied.json`, `registry-observation.json` and `registry-reconciliation.json`. The earlier failed-run artifacts are preserved separately.

The unchanged policy integrity assertion and the 49 guard test cases pass within this run. The actual deployment guard against the production ledger is a separate post-push check; its exact commit and outcome belong in the current PR handoff. These local results alone do not establish a successful Preview, a production application release or a fresh full database replay. The separate worker correction and its 169 Windows tests are documented in [managed one-shot verification](2026-11-01-harvey-managed-once.md).
