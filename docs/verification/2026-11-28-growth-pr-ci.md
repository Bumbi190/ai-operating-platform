# Growth release PR658 — hosted CI follow-up,28November2026

Initial head: fde98120cde05e6da4fafb3468aa23b2b98e514a. PR: https://github.com/Bumbi190/ai-operating-platform/pull/658.

All three required checks (Atlas isolation,MemoryM4 andTrading canon) and the automatic VercelPreview build passed. Eighteen of19Actions workflows passed. SDF1B failed one of13SQL tests because the transition-parity test started196psql processes inside its unchanged5-second deadline; the other12SQL cases passed. Original log: https://github.com/Bumbi190/ai-operating-platform/actions/runs/46119729164/job/140901361206.

The follow-up changes that parity test,a Windows-only canonical-hash check,and this note. It evaluates the same14states x14states matrix in one real PostgreSQL query, orderedbyordinal, and asserts cardinality plus every exact[from,to,canonicalTypeScriptBoolean] tuple. No lifecycle transition, SQL migration, authority policy, concurrency test, timeout or anti-skip floor is changed. The existing migration80 hash pin is unchanged; the hash check normalizes Git text CRLF checkout to its canonical LF bytes, verified against the actual Git blob.

## Local verification

- Actual old/proposed callback ASTs and actual TypeScript lifecycle oracle executed against the exact extracted SQL helper on fresh isolatedPG16.
- Original:196queries,196assertions,39237ms throughWindowsDockerCLI. Batched:1query,197assertions,212ms. These timings describe this scoped local transport,not GitHub runner timings.
- Deliberately returning false from the SQL helper was rejected at proposed->authorized. The mutation was inside the disposable fixture transaction and rolled back; the unchanged helper then passed again.
- Canonical SQL source hash unchanged. The fixture had networknone,no published ports/hostbinds and was removed.
- Separate SDF contracts: 7files,214passed,0failed/pending/todo.
- Independent read-only review: validationGO for the parity optimization; no material finding.

This is parity-callback validation,not a claim of a local full13-case SQL run. Fresh hosted checks on the follow-up commit must still pass. The original complete-build/application proof remains at the initial head; this follow-up modifies no application/dependency inputs. Live dashboard/data wiring,pilot,whole-Web regression and broader security/release decisions remain pending. No merge,production deployment or database activation is authorized here.
