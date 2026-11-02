# Protected preview repair: reconcile already applied Harvey source

Base950b9e326f463d5897e0a017b0dab716b5715959, existing DraftPR368. No hosted SQL mutation, no override and no Harvey application code imported.

## Root cause and provenance

Vercel dpl_8ssGu9T2FizFTzTcENhCmU4QW4HV failed before Next build: two unknown ledger names. Existing PR386 head ea01a65f7f08250bcef341728b3fb474590636ec documents their separate owner-approved applications:
-20261102064659_handlarborsen_scb_live_preview_candidates.sql,1293bytes,SHA256cf12468800265c9b54f42fdaa5f27f2eadb9357eb6ede833d95b5f3a0a3f26b7; applied version20261102070352. Stored statement1292bytes omits only the finalLF, SHA2564afd7939f23b79e820a7aca974f0abcab6e44f5244677ed388d0a082f3862efc. Exact remaining text matches.
-20261102090200_sales_editorial_only_drafts.sql,15250LFbytes,SHA256072897c68f1ed2d85b0f84bed1f5214bb56f9290170b58e8d3c284012e5d7ec1; applied version20261102095321. Stored statement15461bytes has CRLF source and exactly two LF-prefixed settings: set local lock_timeout='5s'; and set local statement_timeout='60s';. Read-only SQL verifies exact prefix=true; after stripping only that prefix and convertingCRLF->LF, source15250bytes and SHA match. Raw stored SHA3526aa5c4f066a4c790b8bb23663b766a0aa1469a5f52ebac29e458b2b71ef4d; LF wrapper+source SHA99cab51a2e9f4f1b5e5c3d7830fd6d32aca4310da388319d1448e6b934d34c96.

Observation2026-11-02T15:48:38.302538Z captured194unique names from schema_migrations on AI Operating Platform iboepohjwrhtgshrqaol. Only migration metadata/digests read; no business rows or credentials. Full metadata in2026-11-02-web-studio-harvey-observation.json. This is historical observation, not a continuously refreshed DB monitor.

## Change

Copied exact Git blob bytes and original filenames to this branch, with -text attributes. Canonical/enforced counts169/155->171/157. Frozen14grandfathered/30legacy entries, hashes and all policy algorithms unchanged. No apply_migration, execute-DDL, production config, activation or override. No original workflow flags or worker changes.

Existing historical160/170/190/191/192-name evidence stays byte-identical. Tests distinguish incomplete old evidence from the current194-name observation, and use explicitly hypothetical fixtures where adding later names.

## Verification

New nine-case suite initially6failed/3passed because source files were absent,169inventory rejected171expectation, and older192-name history was still accepted. After import/update, all9pass and missing/duplicate/unknown cases remain enforced.

The full required guard job test command now runs75/75 cases across7files, with zero failed/skipped. Initial broader run71passed/4failed exposed four stale hypothetical/historical inventory assertions in migration-guard-v2.test.ts; corrected while preserving captures and negative checks; final75pass. Full web TypeScript exit0; both guard module syntax checks and git diff --check pass. Existing ViteCJSdeprecation warning remains.

Read-only preflight workID WEBSTUDIO-368-MIGRATION-PARITY-20261102 reported review_required because metadata matched other reconciliation PRs. Scope review selects existingPR368 for its blocked preview; no branch/worktree/PR created, no other active worktree mutated. Plan second-pass performed by author; independent delta review requested separately.

Push triggers normal protected Preview. READY state and real build guard result must be inspected for the exact final SHA; a synthetic local pass does not prove hosted availability. No production release or dealer outreach is authorized by this repair. No extra paid media.

Independent read-only review completed: no Critical/Important/Minor findings. Reviewer reproduced exact SCB final-LF and editorial timeout+CRLF representations/hashes, verified upstream Git blob IDs and frozen policies, compared194-vs192names (only the two target names added), and inspected75/75 test evidence. Exclusions accepted: existing approved Harvey feature semantics are not re-reviewed; hosted readiness/auth await exact-head deployment; no production/merge/flag/credential/paid authorization is inferred. Workflow YAML and embedded verification JavaScript also parse successfully.
