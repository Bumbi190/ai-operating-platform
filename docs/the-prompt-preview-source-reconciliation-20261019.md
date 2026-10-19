# The Prompt: exact source reconciliation for the preview build

Continuation authorized by André on 19 October 2026 at 10:14 Stockholm. Goal: remove the documented preview build blocker and verify the already-approved read-only app control through ordinary authentication. No new schema installation, production promotion, sales application import or main merge.

## Root cause and verified boundary

The previous automatic deployment of `793db3625f265c3761a21e11ab365f3803ce3417` failed before Next compilation because the unchanged migration guard found `sales_contact_timing` in the live ledger but no canonical source in the feature branch. Origin/main remained `d3f9fcc1045026042f6bb9c0cd302ed0b7283127`.

The separately reviewed sales work in PR #386 now provides canonical source at commit `c85c413d30773a4b21da5aca60a1fb3661a4fc8d`:

- Source: `apps/web/supabase/migrations/20261019065056_sales_contact_timing.sql`.
- Live applied ledger: `20261019073559 / sales_contact_timing`, exactly one statement.
- Canonical source and live statement: **36,997 UTF-8 bytes**, SHA256 **8c651b4962445328991f837ff509b7146139921f8437ac2bfd7afbff0af27476**.
- Identical source Git blob: `381979c9d9ab806a5a0bbb9213b651ce63d92705`.
- Live read-only catalog confirms both timing tables: RLS enabled, zero policies, no anon/authenticated privileges, service_role SELECT/INSERT and no UPDATE/DELETE/TRUNCATE.
- A fresh read-only capture contains **171 unique migration names**. Compared with the preserved 170-name news-review capture, only `sales_contact_timing` was added.

These are observations of already-installed objects. **Do not apply or replay the imported migration.**

## Change

Only exact SQL source, two server-only classifications and necessary guard/test/CI metadata are reconciled. Canonical count is148 and enforced count134; frozen grandfathered14 and legacy-only30 sets, guard implementation and evaluator behavior are unchanged. Existing173 registry table entries remain semantically identical; metadata and the two observed additions give175.

Historical160/170-name captures are preserved. Historical tests now correctly reject their missing later timing migration; the new actual171-name capture passes. Four new cases pin the source identity, test real-ledger acceptance plus missing/duplicate/unknown refusals, check complete table classifications and invoke the actual unchanged Vercel guard with its external fetch boundary replaced. CI runs those four cases with an anti-skip proof while retaining every previous check.

No sales routes, Atlas tools, worker, customer-send authority, UI or application behavior were imported. No SQL, table data, account, paid provider, generation, rendering, film intake, publication or schedule was changed. PR #377 remains draft/unmerged.

## Verification and review

- Before source reconciliation, the four new behavioral cases were **4/4 RED**: missing SQL, unknown ledger name, absent registry classes and actual runtime guard refusal.
- After reconciliation, nine complete affected suites were **320/320 PASS**, no skips: guard34, new reconciliation4, inbox3, journal4, schema76, migration security133, film adapter31, API24 and real-process CLI11.
- Full web TypeScript **PASS**. Initial typecheck found only test-boundary typing omissions (NODE_ENV, complete Console shape, fetch input/optional init); those were corrected and both scoped suites/typecheck rerun.
- The actual CI anti-skip script extracted from the modified workflow passes against the final nine-suite JSON report.
- One fresh independent read-only review covered exactly `793db362..9bc48d61e88ce0b9247c6adb94834c3f930dc157`, all seven files: **no Critical/Important/Minor findings**. The reviewer did not run tests, SQL, providers or authenticated UI.
- After review, the source-fingerprint test was made portable to Git's Windows CRLF checkout convention by hashing canonical LF bytes, matching the established reconciliation convention. A real CRLF working-file test passes4/4 and restores the original SQL bytes; full web TypeScript passes again. No migration content or runtime changed.
- No new broad web or Remotion run was needed for this source-only reconciliation. Previously documented331 main-reproduced web failures and22 shared Remotion compiler diagnostics remain unresolved. This is not a whole-PR green or release claim.

Raw owned logs are in `.superpowers/sdd/2026-10-19-film-preview-reconcile`. The evidence manifest records checksums. Exact-head CI/build and signed-in UI observations are recorded in PR #377 and the project Notion page after push; local captured-ledger tests do not alone establish a deployed request.

## Next verification

The new preview must pass the ordinary live migration guard and Next build, then show **Kontrollera filmunderlag** for the actual saved draft through normal Omnira authentication. The result must still deny generation/publication, identify the current version and show concrete blockers. No session token extraction or manufactured identity is permitted.

A successful read-only check still does not create canonical news/script or a durable paid generation claim. Original source expiry stays **2026-10-20T16:49:35.513Z** (20 October18:49 Stockholm). Budget, usage evidence, actual images/Victoria/timings, render/QA, intake and eventual exact-version review remain separate stages. Existing ordinary publication schedules are unchanged.
