# SDD ledger — plan: docs/superpowers/plans/2026-10-26-the-prompt-calendar-visibility.md

2026-10-26: André approved design and native execution plan. Reuse existing isolated clone and dedicated branch codex/prompt-calendar-design-20261026. Baseline27 progress/layout tests passed in existing locked-dependency build copy. No provider calls or writes.

Pre-flight Tasks1→2: pure projection consumes explicit script and binding snapshots; reader owns authentication, bounds and safe DTO. Consistent.
Pre-flight Tasks2→3: optional mediaQueue field for old fixtures, always populated by production aggregation; own available/truncated flags preserve existing source contracts. Consistent.
Pre-flight Tasks3→4: native browser fixture tests current queue independently of dated entries and publishing. No schema changes/full SQL replay required.

Ruling: Existing standalone isolated clone is reused rather than creating another checkout — it was already established for this work, and the new plan explicitly preserves it. No effect on user's original checkout.

Tasks1–3 complete; Task4 local validation and independent review complete, release pending.

Task3 in progress:4 native component tests GREEN after missing-component RED. First browser run could not open loopback sockets in restricted environment; authorized elevated local fixture run reached2/3 passing, third failed from an ambiguous alert selector (decision-history alert plus calendar-read alert). Scoped selector to the calendar read failure. No production defect inferred from that selector failure.

Ruling: Separate fixture helper keeps queue test data isolated from the existing calendar server. Added one module, no runtime product dependency. No material product risk.

Ruling: Meta cron selects only approved while YouTube also selects published. Missing Meta receipt on a global published row is review, not waiting for Meta cron. Added regression observed RED, then mapping corrected; preserves publishers exactly.

Ruling: Git Bash helper failed before executing with Windows NtCreateDirectoryObject access denial. Equivalent per-plan scratch/marker/progress setup uses native PowerShell, while committed ledger retains task ranges and test results; no product consequence. First copy command used an incorrect relative build-copy path and ran no tests; corrected to absolute source path. Actual Task1 RED observed missing projection module.
Task1: complete (5f05bfc..Task1 commit),8 projection tests RED missing module then GREEN. No network or mutation capability in projection.
Task2: complete (6d488f0..Task2 commit). Reader6 and aggregation1 tests observed RED (missing reader/queue), then15 combined tests GREEN; separate tsc passed. Supabase select reference checked; changelog Markdown endpoint unsupported by browser tool, no new Supabase API/schema feature used.
Task3: complete pending commit.20 new-focused tests, separate tsc and4 Chromium fixture flows passed. Expanded70-calendar test suite (including existing real local DB access tests) passed. Browser fixture account switch now clears queue/project labels and updates test cookie. No production source writes. Whole-branch review pending.

Final validation: production build passed with synthetic settings after approved local filesystem access.70 calendar tests and31 Chromium flows green. Reviewer approved range5f05bfc..62b8413 with no findings; independent static review only.

Final: Ruling: Provider's actual current publication state is not rechecked by this read-only calendar feature — show saved channel receipts as saved receipts and unknowns as review, matching approved design — a provider-side change after receipt remains outside this view's guarantee.
Final: Ruling: Live deployed calendar and release correctness are deferred by the static reviewer — deployment and live read-only smoke are separate release checks, not inferred from fixture tests — without those checks the feature must be reported as locally verified only.

Task ranges after tree-preserving rebase onto main547f46c: Task1 b645bb7..900ddd8, Task2 900ddd8..3ff9176, Task3 3ff9176..315b182. Main547f46c tree equals old127e4b0. No source change from rebase.
