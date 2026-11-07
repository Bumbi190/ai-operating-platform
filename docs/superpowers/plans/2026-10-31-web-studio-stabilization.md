# Web Studio CI stabilization

> Execute inline with RED/GREEN on existing PR #368. Baseline b3a607d. No new branch or production operation.

**Goal:** Repair the three observed CI/preview blockers without weakening tests, migration integrity or project boundaries.
**Architecture:** Align RevenueLegacy month-to-date query bounds with its calendar aggregation; bound the actual desktop Studio header; reconcile exact canonical source history and required table classifications.
**Tech stack:** Existing TypeScript, Vitest, Playwright, CSS and migration-guard Node code. No dependencies added.
**Spec:** Notion Web Studio v0.6 (40a7b977c5b88101aae3c22c8c78b714) and Docs/OMNIRA_WEB_STUDIO_CI_B3A607D_2026-10-31.md. The owner accepted this local stabilization round.

## Global constraints
- Owned linked worktree atlas-builder-references-20261017; reuse_existing preflight recorded.
- No remote SQL writes, schema apply, model cost, production, push, merge or new services.
- Frozen grandfather/legacy sets, missing/unknown-name gates, ownership filters and >=300px full-preview requirement remain unchanged.
- Respect the2GiB SQL-runner RAM floor; never stop another task to free memory.
- Preserve exact migration filenames/bytes from original sources. No invented ledger entries or security exceptions.

## Tasks and completion evidence
- [x] Revenue RED/GREEN:8 new calendar-boundary cases; all47 existing/new cases pass,100 combined guard/revenue cases pass in UTC and Stockholm.
- [x] Header RED/GREEN:3 long-native-option cases fail before the fix; lightweight22/22 and real SQL-backed Studio25/25 pass afterwards, including original >=300px assertion.
- [x] Source reconciliation: exact3 files, count167/153, original hashes and read-only190-name snapshot validated; frozen guard logic unchanged.
- [x] Security dependency follow-up: reuse2 intended SERVER_ONLY classifications and7 original security regressions; preserve historical185-table map, no new allowlist exception. Combined317/317 focused cases pass.
- [x] Verify full web TypeScript, exact guard CI command54/54, actual anti-skip positive/negative tests, local full isolation and broad-bail; preserve/report the remaining failures.
- [x] Second manual review and verification report. No independent reviewer available or claimed.

## Rulings and boundaries
Ruling: Copy only canonical history from PR386/609, not feature branches or hosted changes. Source files equal original and observed latest owning versions.
Ruling: Registry classification is an intended source-policy dependency; its historical capture is NOT re-labelled as a fresh live table audit. Current ledger-name observation is separate.
Ruling: Include5 new source/ledger cases in the existing Migration Guard Integrity job and anti-skip check. No new job, credentials, permissions, timeout or deployment action. Future execution still needs authorized push.
Ruling: Windows-only remaining failures are recorded, not hidden. Full isolation:1219/1223 passed;3 unchanged CRLF comment-parsing failures and1 unchanged path-separator failure. Direct in-memory CRLF/LF diagnostics reproduce the cause without modifying those files. Broad npm test still stops at the known mission-brief-v1 status-list failure.
Ruling: Prior approval named4 specific commits; this new local commit is not pushed under that old approval. Existing branch/worktree stays in place, no merge-ready claim.

## Final ledger
Fresh results, test scope, failed experiments, resource cleanup, source provenance and release gates are in docs/verification/2026-10-31-web-studio-stabilization.md. The real Studio run used one owned ephemeral database, cleaned it and preserved42 existing container identities. Auth/model responses remain fixtures. No paid call or public release occurred.
