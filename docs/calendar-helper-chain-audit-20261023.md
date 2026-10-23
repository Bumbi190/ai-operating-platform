# Kalenderarbetarens nästa SQL-hjälpfunktionsgräns

**23 October 2026 · isolated SQL review only · PR #504 remains DRAFT**

This follow-up extends the earlier 15-function audit of the
scheduler's external RPCs, six privileged unchecked worker
routines, and three project-scoping wrappers. A privileged unchecked
function may still call other SQL helpers; if one of those helpers
changes, the worker's effective data access or authorization
semantics can change even though the external RPC wrapper did not.

## Twelve reviewed next-hop helpers

`apps/web/scripts/calendar-helper-chain-audit.mjs` is a
catalog-backed, bounded static audit. It checks these explicitly
named SQL functions from the pinned cross-tree replay:

| Helper | Responsibility grounded in the code |
|---|---|
| `social_schedule_authority` | Rechecks batch approval, owner, revocation, project stop, due/expiry window and release evidence before permitting a scheduled action |
| `social_schedule_locked_claim` | Locks project/job and checks claim ID, version and lease; the fixture also uses the source/revision gate before project/job row locks |
| `social_schedule_fields` | Enforces the accepted JSON shape for scheduler inputs |
| `social_schedule_snapshot` | Builds the approved batch/revision/publication snapshot with joins constrained to the same project |
| `social_schedule_now` | Supplies the PostgreSQL clock used in due and lease checks |
| `social_publication_record` | Serializes a publication record for responses |
| `calendar_source_gate_try_begin_probe` | **Privileged fixture definer:** SKIP LOCKED source-revision lock and private transaction-bound HMAC gate |
| `media_news_review_requirements` | Verifies existence/consistency of cross-linked media-news review evidence; can require follow-up when a revision derives from the news-review pipeline |
| `social_content_active` | Checks project execution pause, lifecycle state and platform automation stop |
| `social_content_requirements` | Validates content revisions against current plan, account binding, media and scheduled time |
| `social_schedule_item_guard` | Verifies approved content/revision, account binding and active JPEG asset hash and constraints |
| `social_schedule_revision` | Serializes the selected content revision and binding for the approved snapshot |

The audit reads the **actual local PostgreSQL** `pg_proc`,
`pg_namespace`, `pg_language` and ACL catalog. It records
SHA-256 over `pg_get_functiondef`, direct schema-qualified SQL
calls and references, mode (`SECURITY INVOKER` or
`SECURITY DEFINER`), owner, function signature, volatility,
locked empty `search_path`, and effective function grants.
The single elevated helper is
`calendar_source_gate_try_begin_probe`; it must not be
directly callable by `anon`, `authenticated` or the
scoped scheduler role. Ordinary invoker helpers cannot
inherit higher privileges on their own; however, when called
by an elevated `SECURITY DEFINER` outer function they still
execute under the effective owner context and so remain
security-sensitive.

Source checks distinguish `INSERT INTO public.table(columns...)`
from a genuine `public.function(args...)` call; table names
still appear in the qualified reference inventory. A review
fingerprint is a **change-detection gate**, not proof that
arbitrary SQL is secure.

## Limits, staging and production boundaries

The current automated lexical analysis is **not** exhaustive:
nested PL/pgSQL, unqualified function names, functions invoked
through expressions, SQL deparser differences and dynamic SQL
can evade purely static string matching. Body fingerprints and
a human reference-map review are therefore used in combination.
The next layer beyond this bounded inventory may include
`social_content_requirements`' plan/account/asset dependencies and
`media_news_review_requirements`' deeper evidence/caption/snapshot callees,
`social_schedule_authority`'s source/approval checks, and
the special lock/HMAC sequence; none can be treated as fully
certified just because its immediate body is pinned.

All changes in this PR are test scripts and documentation,
not a deployable migration. The live Omnira scheduler still
uses privileged `service_role` clients; the local scoped
scheduler identity, independent Meta-token broker, human
approval log and associated operators are test-only.
The separate historical May media baseline, real hosted
Supabase role/grant behavior, authenticated Meta receipts,
Instagram workflow and complete transitive SQL/trigger
review still block production activation. Do not merge this
draft or grant these experimental functions to new roles.

## Slutlig verifiering — 23 oktober 2026

**12 avgränsade hjälpfunktioner** avlästes från den riktiga isolerade
PostgreSQL-katalogen. Den första kompletta återspelningen användes för
att fastställa de exakta `pg_get_functiondef`-fingeravtrycken,
funktionssignaturerna, kvalificerade anropen, SQL-referenserna och
effektiva EXECUTE-rättigheterna. Kontrollen utökades också till
`media_news_review_requirements` efter att dess indirekta anrop
från `social_content_requirements` upptäcktes.

Därefter kördes hela testkedjan igen med **samtliga låsta värden
aktiverade**. Följande passerade:

- `CROSS-TREE HELPER CHAIN PASS`: 12 hjälpfunktioner, 11
  `SECURITY INVOKER` och 1 test-only `SECURITY DEFINER`,
  56 registrerade kvalificerade referenser och 16 direkta
  kvalificerade funktionsanrop.
- `CROSS-TREE WORKER RPC CHAIN PASS` och
  `CROSS-TREE TRIGGER CHAIN PASS` – de tidigare SQL-grindarna
  kvarstår.
- `CROSS-TREE POSTGREST APPLICATION WORKER PASS` och
  `CROSS-TREE REPLAY PASS` med exitkod **0**. Publiceringen var
  syntetisk och använde ingen riktig Meta-förbindelse.
- **6 av 6** nya native Node-säkerhetstester och **55 av 55**
  befintliga riktade Vitest-tester. De fyra miljöberoende
  integrationstesterna ingick i den isolerade fullkörningen
  i stället för den ordinarie testomgången.

Alla 12 funktioner hade i testdatabasen EXECUTE-rättighet för
`service_role`, men inte för `PUBLIC`, `anon`,
`authenticated` eller den begränsade kalenderarbetarrollen.
Den enda privilegierade hjälpfunktionen,
`calendar_source_gate_try_begin_probe`, har en separat,
låst HMAC-/revisionskontroll. Den genomgångna direkta
kvalificerade referenslistan innehöll ingen
`public.platform_tokens`-referens. Det bevisar **inte**
frånvaro av sådana referenser i alla underliggande hjälpfunktioner.

`media_news_review_requirements` anropar fortsatt
`media_news_canonical_json`,
`media_news_review_caption` och
`media_news_snapshot_requirements`. Dessa tre utgör
nästa avgränsade kontroll och omfattas **inte** av den nu
låsta 12-funktionsmängden.

Resultaten är endast testbevis. Inga produktionsnycklar,
schemaändringar, Meta-konton, driftsättningar eller
riktiga publiceringar påverkades. PR #504 ska fortfarande
vara ett utkast tills både längre SQL-kedjor och
publiceringsbevis är granskade.
