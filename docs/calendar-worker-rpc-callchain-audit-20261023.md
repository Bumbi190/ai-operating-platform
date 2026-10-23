# Calendar scheduled worker: bounded privileged RPC call-chain audit

**23 October 2026 · PR #504 · TEST-ONLY · NOT AUTHORIZED FOR PRODUCTION**

This review follows the 15-trigger/HMAC-source gate audit and checks the
**entry-point → project scope → privileged unchecked body** boundary for the
six scheduled worker operations. It is limited to the closed Docker-backed
PostgreSQL/PostgREST replay; no production roles, migrations, Meta credentials,
HTTP publishing, dispatch flags or account connections were changed.

## Exact privilege boundary

The test-only `scheduled-rpc-only-role-probe.sql` temporarily renames the
**canonical** six scheduler operations to inaccessible `*_unchecked_fixture`
functions, makes their bodies `SECURITY DEFINER` and creates six project-scoped
wrapper functions with the original API names. Three additional
`SECURITY DEFINER` scope guards check a signed subject's administrator-seeded
project mapping before dispatching owner-privileged SQL.

| Public scheduler RPC exposed to fixture worker role | Scope enforcement | Renamed internal body (not directly executable by worker) |
|---|---|---|
| `social_schedule_claim(jsonb)` | `social_schedule_rpc_check_projects_fixture` | `social_schedule_claim_unchecked_fixture` |
| `social_schedule_authorize_write(jsonb,jsonb)` | Job + project array checks | `social_schedule_authorize_unchecked_fixture` |
| `social_schedule_step(jsonb,jsonb)` | Job/project check | `social_schedule_step_unchecked_fixture` |
| `social_schedule_peek(jsonb)` | Project array check | `social_schedule_peek_unchecked_fixture` |
| `social_schedule_receipt(jsonb)` | Job/project check | `social_schedule_receipt_unchecked_fixture` |
| `social_schedule_recover_checkpoint(jsonb)` | Job/project check | `social_schedule_recover_unchecked_fixture` |

The exact helper names/roles are **fixture-only**. The actual scheduled
production worker still uses two broadly privileged admin clients, and this
experimental role is NOT present in the hosted Supabase database.

The new `apps/web/scripts/calendar-worker-rpc-callchain-audit.mjs` checks
an actual `pg_proc`/ACL/owner catalog snapshot for **15** functions:
six externally scoped wrappers, six internally renamed unchecked routines,
and three project guards. It enforces:
- `SECURITY DEFINER`, `supabase_admin` owner in the isolated database,
  `PL/pgSQL`, empty `search_path` and expected volatility;
- no PUBLIC, anon, authenticated, service-role or unrelated broker/operator
  direct EXECUTE rights; precisely six wrapper rights to the scoped worker,
  and **zero direct unchecked helper rights**;
- presence of the appropriate project/job guard on each wrapper;
- SHA-256 of each `pg_get_functiondef` body and exact lists of
  lexically detected schema-qualified SQL calls and references;
- no dynamic `EXECUTE` or broad file/database helper primitives within
  these 15 audited bodies.

The direct reference extractor explicitly distinguishes
`INSERT INTO public.table(column,...)` from
`public.routine(arguments,...)`. Table-write targets remain recorded in
the qualified data-reference list, but they are not falsely counted as
function calls. Any code/ACL/owner/guard/reference change requires an explicit
review and updated source fingerprints. The metadata query itself is
read-only.

## Next-hop functions and write paths still requiring explicit review

The **canonical unchecked** functions call other SQL routines. Relevant
observed function names include `social_schedule_authority`,
`social_schedule_locked_claim`, `social_schedule_fields`,
`social_schedule_now`, `social_schedule_snapshot`,
`social_publication_record`,
`calendar_source_gate_try_begin_probe`, and
`calendar_source_gate_begin_probe`. The canonical `authority`
path checks approval/revocation, stopped project state, due/expiry
window, item binding and monthly release evidence. The
`locked_claim` path checks claim/version/lease with project/job
row locks. The `try_begin` path uses `FOR UPDATE SKIP LOCKED`
and invokes the transaction-bound source HMAC gate. The
`*_unchecked_fixture` bodies can write scheduled job/publication
records and append event rows, which also fire the separately pinned
trigger chain.

**This is not a complete transitive call-graph audit.** In particular,
the downstream helper body definitions and their own indirect calls
must be pinned/reviewed in a subsequent phase. PL/pgSQL functions
can call routines through expressions, dynamic SQL or unqualified
names that a bounded regex catalogue does not fully resolve.
`pg_depend` alone also does not represent every runtime call.
This review checks a narrow *named boundary*, not all privileged
functions in the project and not the provider receipt origin.

## Verification and launch decision

The unit tests inject changes into **in-memory** catalog results:
extra functions, altered wrapper calls, missing guards, direct grants,
wrong owner/language/search path, unexpected SQL references, changed body,
and a table INSERT misidentified as a function. These tests are not
production DDL changes.

The complete fixture should run the exact 151 web and 10 pinned root
migrations, exercise the real scoped PostgREST worker with fake Meta,
and compare the pinned function definitions against the closed
PostgreSQL catalog. The complete run result is reported separately
in the inventory.

**Do not merge PR #504 or enable autonomous publishing on the basis of
this check.** Release gates still include the full downstream helper,
trigger/definer graph, independent provider receipt provenance,
separated media/credential service, reconciled historical May media
migrations, hosted Supabase role feasibility and real-session staging
verification.

## Verified closed replay result — 23 October 2026

The first full cross-tree replay inspected the **actual** isolated
`pg_get_functiondef` and ACL catalogue for all fifteen privileged
functions. The call parser was corrected before pinning: PostgreSQL
`INSERT INTO public.table(columns...)` must count as a table reference,
NOT as a function invocation. A separate regression test confirms
this distinction. The observed hashes, direct qualified calls and
SQL references were pinned in
`apps/web/scripts/calendar-worker-rpc-callchain-audit.mjs`.

The **second full replay**, with strict hash/call/reference checking
enabled, reported
`CROSS-TREE WORKER RPC CHAIN PASS` and
`CROSS-TREE REPLAY PASS`, exit code **0**. It reviewed six permitted
worker RPCs, six private unchecked owner-privileged bodies and three
project scope guards, together with **75 recorded qualified SQL
references** (including repeated references and routine declaration
names). All fifteen bodies had the expected owner, SECURITY DEFINER
mode, locked search path, SQL language, volatility and function grants.
Crucially, the scoped worker role had EXECUTE on the six external
wrappers only, not the six internal unchecked bodies or any scope helper.

The existing eight calendar Vitest suites passed **55/55 targeted
tests**, with the four replay-only conditional checks exercised in the
full isolated PostgreSQL/PostgREST run. The new six Node-native
catalog tests passed, including injected foreign grants, unsafe
function body drift, missing project guard, new qualified references,
and qualified table INSERT falsely parsed as a call. These negative
cases modified in-memory catalogue snapshots only, never live SQL.

The replay used a closed Docker PostgreSQL fixture, RS256-signed
synthetic tokens, PostgREST and a mocked Meta provider. The
at-most-once dispatch intent remained in effect, human audit notes
never became provider proof and no real Meta publication occurred.

**Unresolved second-hop requirements:** the bodies of
`social_schedule_authority`, `social_schedule_locked_claim`,
`social_schedule_fields`, `social_schedule_snapshot`,
`social_schedule_now`, `social_publication_record` and
`calendar_source_gate_try_begin_probe` still need a similarly
bounded, source-backed review (the sibling calendar
`calendar_source_gate_begin_probe` has a separate HMAC/trigger
fingerprint). Their transitive references and all indirect triggers
are not fully proven by this catalogue. Real Supabase Auth/staging,
provider-authenticated receipts, the separated broker and the May
migration baseline remain launch blockers.
