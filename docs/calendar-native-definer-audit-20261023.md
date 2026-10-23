# Privileged SQL audit — calendar operator review candidate

**23 October 2026 · PR #504 · TEST ONLY · NOT APPROVED FOR DEPLOYMENT**

## What was actually reviewed

1. Read-only catalog queries were executed against the existing **AI Operating Platform** hosted Supabase project's `pg_proc`, `pg_namespace` and `pg_roles`. They found **116** `SECURITY DEFINER` functions in `public`: **8** callable by `authenticated` and **7** callable by `anon`. Seven are named trigger/guard functions. The eighth, `atlas_grant_m4_execution_authorization`, has its own verified-user, project-owner, pending-request, target and M4 action checks in its SQL body. This is **not evidence of a confirmed vulnerability**. It is an existing function whose grants and transitive effects must remain explicitly reviewed.
2. The exact source of the **three new test-only** native-session operator functions in `apps/web/lib/calendar/scheduled-authenticated-operator-role-probe.sql` was reviewed against the *isolated* PostgreSQL catalog, including function owner, SQL language, volatility, locked `search_path`, direct references and grants.
3. Four RLS-protected fixture tables were checked for accidental direct `anon` / `authenticated` DML/SELECT: `auth.sessions`, `public.social_schedule_operator_scope_fixture`, `public.social_schedule_operator_review_events_fixture`, and `public.social_schedule_dispatch_intents_fixture`. The fixture's minimal synthetic `auth.sessions` table now has RLS enabled. This fixture table is NOT the host's real GoTrue schema.

## Privileged call and data-access map

| Exposed routine | Database role with EXECUTE | Privileged SQL references | What it may do |
|---|---|---|---|
| `social_schedule_native_operator_guard_fixture(uuid)` | **No public/API role** | `auth.sessions`, `social_schedule_operator_scope_fixture` | Validate signed JWT claims, live session and active operator+project membership; return verified actor UUID |
| `social_schedule_native_operator_history_fixture(uuid,uuid,uuid)` | `authenticated` | **Guard**, immutable dispatch intents, operator review events | Read at most 25 operator observations for the matching project/job/publication; never attest Meta |
| `social_schedule_native_operator_append_fixture(jsonb)` | `authenticated` | **Guard**, immutable dispatch intents, `social_publications`, operator review events | Append an idempotent *human-only* observation after validating current scope; never update provider outcome |

All three functions are `SECURITY DEFINER` under the isolated fixture owner `supabase_admin`, use `PL/pgSQL`, remain `VOLATILE`, and have a pinned empty `search_path`. No routine in this audited set may execute dynamic SQL or reference credential/token tables. The audit verifies body strings from `pg_get_functiondef` using SHA-256 fingerprints and compares the names and exact direct reference set; any altered definition requires a new explicit review.

**Exact PostgreSQL-17 fixture fingerprints (SHA-256 of `pg_get_functiondef`):**

- Guard: `c2282ee41e58067465267c1809541aeff130d7755837da26554ffc87bba22853`
- History: `3f8b78dc464b27376fd78cec8c88d884bc55f5ad9ac92cb862e7a2cccb7c1834`
- Append: `f5465e22b640a5f1218524ffad947f1bbffba24dfa11a65457b242a863f40ddd`

These are **change-control fingerprints**, not cryptographic proofs that arbitrary privileged PL/pgSQL is safe. They are intentionally version-sensitive. When PostgreSQL changes how it renders function definitions, the new text must be reviewed and re-pinned.

## Security controls and negative tests

`apps/web/scripts/calendar-native-definer-surface.mjs` constructs a read-only `pg_catalog` snapshot. It refuses missing/unexpected functions, unexpected owners, loss of `SECURITY DEFINER`, changed volatility/language/`search_path`, direct PUBLIC/anon/service/worker grants on the audited RPCs, extra SQL references, dynamic SQL keywords, changed function-body fingerprints, loss of table RLS and new direct table rights. `calendar-native-definer-surface.test.mjs` exercises positive and manipulated **in-memory catalog snapshots**, with **4/4 native unit tests**. No deliberate live SQL grant, function alteration or role-change mutation is executed by those negative tests.

The full existing `legacy-cross-tree-replay` still applies 151 canonical web SQL migrations and ten pinned historical root migrations inside owned local Docker; this catalog audit is performed **only** against that fixture after the test-only operator functions are installed. It does not run a DDL probe against the user's hosted project.

## Explicit limits / unresolved risks

**Supabase documents the `authenticated` + `SECURITY DEFINER` pairing as a security warning** ([lint 0029](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable)). Any signed-in account can invoke such a function; correctness depends on its *internal* session, ownership, project and immutable-intent checks. The audited candidate is **not ready to receive this privilege in production**.

- This is a bounded review of **three new functions**, not all 116 existing privileged functions or the complete transitive SQL call/trigger graph. `pg_depend` is insufficient for all PL/pgSQL runtime SQL dependencies; source references and pinned hashes are useful *guards*, not a full proof. Existing scheduled-worker and media/credential definer/trigger calls need their own review.
- Functions with an empty `search_path` still execute with their **owner's privileges**; the owner, RLS, ACLs, references, session lookup and provider-proof boundaries all need independent staging verification.
- The fixture uses `issuer='omnira-schedule-fixture'` and a simplified session table. No real Supabase Auth/GoTrue access token or revoked hosted session was exercised.
- The historical May media baseline, independent privileged Meta credential/broker, authenticated Meta receipt provenance and Instagram state machine remain out of scope.
- Do not merge PR #504, deploy these fixture functions, grant `authenticated` new EXECUTE rights, create extra signing keys or connect live Meta accounts without a separately reviewed migration and safe staging proof.

**Practical recommendation:** Keep native Supabase sessions as the candidate for **human-only observation review** if staging can prove the checked gate. Keep autonomous scheduling and external Meta writes behind the separate privileged broker/at-most-once dispatch path. Do not let Atlas call an operator approval RPC or fabricate provider proof.
