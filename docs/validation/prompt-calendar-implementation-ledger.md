# SDD ledger — plan: docs/superpowers/plans/2026-10-26-the-prompt-calendar-visibility.md

2026-10-26: André approved design and native execution plan. Reuse existing isolated clone and dedicated branch codex/prompt-calendar-design-20261026. Baseline27 progress/layout tests passed in existing locked-dependency build copy. No provider calls or writes.

Pre-flight Tasks1→2: pure projection consumes explicit script and binding snapshots; reader owns authentication, bounds and safe DTO. Consistent.
Pre-flight Tasks2→3: optional mediaQueue field for old fixtures, always populated by production aggregation; own available/truncated flags preserve existing source contracts. Consistent.
Pre-flight Tasks3→4: native browser fixture tests current queue independently of dated entries and publishing. No schema changes/full SQL replay required.

Ruling: Existing standalone isolated clone is reused rather than creating another checkout — it was already established for this work, and the new plan explicitly preserves it. No effect on user's original checkout.

Tasks1–4 pending.

Ruling: Git Bash helper failed before executing with Windows NtCreateDirectoryObject access denial. Equivalent per-plan scratch/marker/progress setup uses native PowerShell, while committed ledger retains task ranges and test results; no product consequence. First copy command used an incorrect relative build-copy path and ran no tests; corrected to absolute source path. Actual Task1 RED observed missing projection module.
Task1: complete (5f05bfc..Task1 commit),8 projection tests RED missing module then GREEN. No network or mutation capability in projection.
