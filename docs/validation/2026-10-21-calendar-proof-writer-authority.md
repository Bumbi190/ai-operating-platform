# Calendar and Facebook evidence: writer authority decision

Status: design for review. No migration, credential change, worker deployment or
calendar activation. This follows the isolated findings in PRs #489–#492.

## Verified boundary

The normal reconciliation service calls Meta's published-posts GET, filters
the result, and later GETs the chosen post again before completion. Its SQL
inspector does not make either request. In the owned PostgreSQL fixtures a
service-role caller can pass a well-shaped invented candidate directly to the
inspector, and it stores a proof. A separate permission candidate blocks direct
INSERT while preserving the legitimate RPC, but that does not stop invented
RPC input. The 20 calendar inspector and six publication reconciliation tests
passed in a labeled, disposable local Docker fixture. They are not full
Supabase-schema, live Meta or production tests.

The web app's shared admin client uses SUPABASE_SERVICE_ROLE_KEY for many
routes. The same server process currently resolves Facebook credentials.
A new TypeScript wrapper or a signature generated in that process would not
separate this authority from the broad service key. The key bypasses RLS.
The production migration grants direct UPDATE on social_publications to
service_role. A regression against the original reconciliation migration
successfully marked an uncertain attempt published with a direct UPDATE and
zero provider reads. The receipt constraint accepts provider_id and
confirmation='provider_id'; it does not authenticate them. Thus proof-table
containment alone is not an end-to-end barrier.

## Effective writer inventory from migrations

| Data | Legitimate SQL writers | Current direct grant to service_role |
| --- | --- | --- |
| Reconciliation proofs | `social_publication_reconciliation_inspect` in `20261018070155` | SELECT, INSERT |
| Publication rows and events | Manual `social_publication_prepare/step` in `20261016115402`, later replaced by the scheduled versions in `20261018071209`; scheduled claim/step/recovery; reconciliation complete | Publication SELECT, INSERT, UPDATE; event SELECT, INSERT |
| Schedule jobs and events | Scheduled approval/claim/step/recovery and scheduled reconciliation completion in `20261018071209` and `20261018073425` | Job SELECT, INSERT, UPDATE; event SELECT, INSERT |

The later scheduled migration replaces `social_publication_reconciliation_complete`
and also updates a scheduled job and inserts its event. A role migration cannot
change only the original reconciliation migration. The application store uses
RPCs for these writes; readiness also reads `social_publications`. This is a
source inventory, not proof that no dynamic SQL or operational writer exists.

## Credential and application caller inventory

- `reconciliation/service.ts` resolves the Facebook Page token and performs
  GET for candidate listing and completion re-read. Its store uses the shared
  admin client for both RPCs.
- Manual publication `publication/credentials.ts` and `dispatch.ts` use the
  same token for approved publishing. Scheduled publication workers also
  resolve credentials, so moving the Page token affects those paths.
- Other media routes use Facebook credentials for comment replies, account
  checks and webhook setup. A token move cannot silently break those flows.
- The repository's application stores call the publication and schedule RPCs
  for normal writes; readiness reads publication rows. Direct database grants
  remain broader than these app call sites.

A read-only Vercel project inventory on 2026-10-21 found
`SUPABASE_SERVICE_ROLE_KEY`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID`,
and `META_APP_SECRET` scoped to both Production and Preview on the web
project. No values were retrieved. This establishes environment placement,
not which variables a running route uses. The current Facebook resolver
requires a project-store binding and reads `platform_tokens` through the
shared service-role client; it explicitly has no environment fallback. Thus
removing the legacy-looking Facebook environment key would not remove the
web process's access to the project Page token. The token table and binding
table must be included in the effective-privilege audit, along with the
credential refresh and publishing paths.

The first implementation slice should inventory deployment-level secrets and\nsplit read and write credentials without changing the established publish\npath. Only after parity tests cover the other token consumers should the Page
token leave the broad web process. No extra background service should be
introduced merely to make the proof-table candidate look complete.


## Full-schema grant audit before changing roles

The source inventory above describes migrations. Run the following read-only
queries against a fully migrated staging database as the migration operator
before writing a permission migration. Record the actual role memberships,
object owners, inherited/default grants and function ACLs. The rows are the
review input; the migration files alone do not establish effective permissions.

```sql
select c.oid::regclass as relation,
       pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity as rls_enabled,
       has_table_privilege('service_role', c.oid, 'SELECT') as service_select,
       has_table_privilege('service_role', c.oid, 'INSERT') as service_insert,
       has_table_privilege('service_role', c.oid, 'UPDATE') as service_update,
       has_table_privilege('service_role', c.oid, 'DELETE') as service_delete,
       c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in (
    'social_publications', 'social_publication_events',
    'social_publication_reconciliation_proofs',
    'platform_tokens', 'social_account_bindings',
    'social_schedule_batches', 'social_schedule_decisions',
    'social_schedule_jobs', 'social_schedule_events',
    'social_monthly_release_rules', 'social_monthly_release_evidence'
  )
order by c.relname;

select p.oid::regprocedure as function,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef as security_definer,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
       p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and (p.proname like 'social_publication_%'
       or p.proname like 'social_schedule_%')
order by p.proname, p.oid::regprocedure::text;

select r.rolname as role, r.rolsuper, r.rolbypassrls,
       parent.rolname as inherited_role
from pg_roles r
left join pg_auth_members m on m.member=r.oid
left join pg_roles parent on parent.oid=m.roleid
where r.rolname in ('service_role', 'authenticator')
   or parent.rolname in ('service_role', 'authenticator')
order by r.rolname, parent.rolname;

select n.nspname, d.defaclrole::regrole as grantor, d.defaclobjtype,
       d.defaclacl
from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
where n.nspname='public' or d.defaclnamespace=0;
```

Current source grants include direct publication INSERT/UPDATE, proof INSERT,
job INSERT/UPDATE and event INSERT for `service_role`. The scheduled migration
replaces the completion function and writes a job/event in the same
transaction. A cutover must preserve normal manual and scheduled writers
through reviewed function ownership, while removing the generic role's
ability to forge a receipt. Test both direct DML and every function entry
point with the effective grants after migration. Recheck the catalog output
after rollback as well.

This audit query has not been run against a fully migrated staging database;
it is a review artifact, not evidence that a new role boundary already works.

## Read-only live catalog observation, 2026-10-21

The four catalog queries above were run against the **AI Operating Platform**
Supabase project (PostgreSQL 17) as SELECT only. No publication row, token,
credential value, role, grant or function body was read or changed. This
confirms effective privileges at observation time, not the safety of a future
migration.

| Object | Effective `service_role` privileges |
| --- | --- |
| `social_publications` | SELECT, INSERT, UPDATE |
| `social_publication_events` | SELECT, INSERT |
| `social_publication_reconciliation_proofs` | SELECT, INSERT |
| `social_schedule_jobs` | SELECT, INSERT, UPDATE |
| Other schedule batches, decisions, events and monthly release evidence | SELECT, INSERT |
| `social_monthly_release_rules` | SELECT, INSERT, UPDATE |
| `platform_tokens` | SELECT, INSERT, UPDATE, DELETE |
| `social_account_bindings` | SELECT, INSERT, UPDATE |
| Reconciliation inspect and complete functions | EXECUTE; both SECURITY INVOKER, owned by `postgres` |

All eleven listed tables have RLS enabled, but `service_role` has
`BYPASSRLS`. The inspected publication and schedule functions are also
SECURITY INVOKER and executable by `service_role`. For the three sensitive
tables (`social_publications`, proofs and `platform_tokens`) the `anon` and
`authenticated` roles had no effective INSERT or UPDATE privilege; neither
client role could execute the two reconciliation RPCs. This is a shared
service-key authority problem, not an observed browser-role grant.

Default ACLs in `public` grant broad rights on new relations and EXECUTE
on new functions to `anon`, `authenticated` and `service_role` for objects
created by `postgres` or `supabase_admin`. The current sensitive objects
have narrower explicit ACLs. Any new function/table in a cutover migration
must be created and restricted in one transaction, and its effective grants
must be checked after deployment. The catalog returned no dedicated
reconciliation reader role. This observation does not test whether one could
be added safely, nor does it authenticate a provider candidate.

## Target boundary

1. Keep the user's authenticated operator decision and the exact publication
   selection as separate inputs. A browser never sends provider candidates,
   credential material, candidate hashes or a purported provider read time.
2. A dedicated reader, isolated from the general web service-role key, checks
   the operator's authorization independently, loads the current binding and
   reviewed revision, then GETs the published Facebook post with a credential
   available only to that reader. It does not POST to Facebook during
   reconciliation.
3. That reader writes through a dedicated database identity with only the
   narrow read/inspect/complete functions needed for this flow. The generic
   service_role loses EXECUTE on proof-writing and confirmation RPCs, plus
   direct DML routes that could independently forge a published state. The
   function owner and helper privileges must be audited as a set.
4. The database function keeps source-revision lock first, compares current
   publication/revision/binding/version, records a short-lived proof, and
   commits the revision bump atomically. Completion requires a fresh second
   provider GET, exact candidate hash, explicit operator image confirmation,
   unchanged version and a single state transition.
5. Credentials for the reader and Facebook binding must leave the general
   web process for this to resist compromise of the web service-role key.
   Moving them affects existing publishing flows and needs its own migration.
   Until then the protection is against accidental bypass, not a hostile
   service-role holder.

## Required tests before a migration

- With the effective role grants in a fully migrated Supabase test database:
  generic service_role cannot INSERT proof, execute proof-writing/complete RPCs,
  or directly forge published state; the dedicated reader can perform its
  exact functions and cannot mutate unrelated social/calendar data.
- The reader refuses absent, expired, wrong-project or mismatched operator
  authorization; the UI decision binds to the exact publication, version and
  candidate. Replaying it after a binding/revision change fails.
- Provider failure, timeout, malformed response, token rotation, deleted post,
  changed media and hash mismatch leave publication uncertain and do not create
  a confirmation. No reconciliation call sends a provider POST.
- Concurrent weekly booking, inspection, completion, pause and account
  supersession preserve source-first lock order, rollback and idempotency.
- Test deployment separation by inventorying environment variables and DB
  grants. Verify the general web deployment cannot access the reader's writer
  credential or Facebook token after cutover.
- Dry run with a test Page and a real provider GET, then stage the migration
  with rollback of grants/functions and an explicit production approval.

## Decision for the next slice

Do not promote the two-line SECURITY DEFINER candidate from #492 alone.
Implement the isolated reader and credential boundary as a separate reviewed
workstream. Before choosing hosting, inventory current Facebook token usage
and all direct publication/event/schedule writers, then produce a full-schema
role matrix and migration rollback. Keep existing automation disabled while
that work is incomplete.

References: Supabase's current Row Level Security and Database Functions
guides: https://supabase.com/docs/guides/database/postgres/row-level-security
and https://supabase.com/docs/guides/database/functions.
