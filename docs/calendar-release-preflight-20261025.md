# Calendar release preparation — 2026-10-25

Release candidate: `codex/calendar-release-20261025`, based on current fetched main `93e21399f10c49fc3433c155680f7839c0324f7b`.

Selected six feature commits from the preserved local review branch: status/attention, responsibility, workflow links, story prerequisites, production preview, human approval/start. Excluded the remaining historical experiment chain. Retained current main's expanded time picker CSS and its browser test when resolving two additive conflicts.

## Read-only hosted evidence

- Vercel project `ai-operating-platform-web`, latest production deployment `dpl_9h72Th3K26X2dV5D8pJaqY3Udjjf`: READY at main `93e2139`.
- Supabase `iboepohjwrhtgshrqaol`: latest migration `20261023100514 atlas_fallback_reservation_locktime`.
- Human story request/approval tables and run binding column absent. Calendar responsibility/link migrations absent from hosted ledger.
- Existing PR #504 remains a draft historical replay PR on another branch. It is not the release candidate.

## Candidate verification

- 119 tests in 12 focused unit/integration suites passed.
- All 27 calendar Playwright tests passed, including current main's time picker sizing regression.
- Full adapted local replay passed on this candidate: 177 original ledger entries, 29 human-story approval cases and 16 owner/provenance cases. Fixture cleanup completed. The resulting report retains `replayReady:false`; this is not hosted schema parity.
- Type checking cannot pass with the shared local dependency installation: missing declared `@modelcontextprotocol/client` and `@remotion/lambda/client` produce six errors in unchanged media code. No changed-file errors were reported. Both packages are already declared/pinned in the current package and lockfile; shared dependencies were not modified.
- Original full-ledger fixture inputs and two SQL probes accompany the selected verification script so reproduction does not require files from the historical branch.

## Remaining release gates

Complete dependency installation in an isolated build environment and verify the production build. Review additive migration compatibility against the target catalog, regenerate target database types, and validate the candidate on an appropriate database before promoting code. Existing recovered-ledger replay is an adapted local schema baseline, not hosted parity. Apply required migrations before deploying code selecting new columns.

No production database writes, deployment, financial flag change or paid provider call occurred during preparation. Live execution still requires a separately reviewed concrete story request and its explicit owner consent.
