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

The first implementation slice should inventory deployment-level secrets and
split read and write credentials without changing the established publish
path. Only after parity tests cover the other token consumers should the Page
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
Supabase project (PostgreSQL 17) as SELECT only. Only catalog metadata was read; no publication row, token
value or function body was read, and nothing was changed. This confirms
effective privileges at observation time, not the safety of a future migration.

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
must be checked after deployment. The query covered `service_role` and
`authenticator` membership only; it did not inventory every custom role.
This observation does not authenticate a provider candidate.

### Publication step entry points also accept provider receipts

A second SELECT-only catalog check on 2026-10-21 confirmed that
`service_role` can EXECUTE `social_publication_step(jsonb,jsonb)`,
`social_schedule_claim(jsonb)` and `social_schedule_step(jsonb,jsonb)`.
All three are SECURITY INVOKER; `anon` and `authenticated` cannot EXECUTE
them. The repository SQL shows that a manual publication in `publishing`
can move to `published` through `social_publication_step` with a
syntactically valid caller-supplied `providerId`. The function verifies the
owner-shaped `p_principal` against project rows but does not authenticate that
JSON against the database caller, and its `complete` branch does not GET the
provider. The canonical manual step function was then exercised in an owned disposable
PostgreSQL fixture: after seeding an already claimed `publishing` state, the
service-role call marked it `published` with a fabricated provider ID and
zero provider reads. The targeted GitHub Actions run 39584762802 passed
**22/22, 0 skipped** and removed its container. This is reduced-schema
verification, not a live exploit test or full Supabase-schema proof. The
application dispatch normally obtains the provider receipt before calling
this RPC, but a holder of the service key can bypass that application path.
The scheduled step also accepts caller-supplied `providerId` on `complete`
after a valid claim. The isolated worker fixture exercised this path through
an approved job, claim ID, lease and version sequence: a synthetic ID marked
both publication and job `published` with no provider client. The targeted
run 39585278572 passed **22/22 inspector plus 12/12 worker tests, 0 skipped**
and removed its container. That worker fixture uses the reviewed source-gate
integration projection, not the full Supabase schema or live provider. Its
claim and authorization guards must be retained for the existing queue. Removing only the reconciliation RPC grant and direct
table UPDATE would therefore leave an alternate route to a forged published
state.

The cutover inventory must include every `published` transition and its
database EXECUTE grant, especially both step RPCs and the worker that calls
them. The generic service key cannot be treated as a read-only principal
merely because the app normally calls these methods through its dispatcher.

A rollback-only SQL candidate now models a separate manual publisher role in
the disposable fixture. Inside a savepoint it removes generic-role
INSERT/UPDATE on publications, event INSERT and EXECUTE on the manual step;
the generic role's direct step call is denied. A narrowly granted fixture
publisher completes the already claimed manual attempt, then the savepoint
restores the original grants, publication state and temporary role. GitHub
Actions run 39587747422 passed **23/23 inspector and 12/12 worker tests,
0 skipped**. This confirms only the reduced manual-role slice. The candidate
is under `lib/calendar`, not `supabase/migrations`; applying it as-is would
break other manual/scheduled writers and would leave reconciliation, scheduled
step and direct job paths accessible through the shared role. It does not
isolate the Facebook token or create a production credential.
A separate rollback-only scheduled publisher candidate exercises an approved,
claimed Facebook job with a real fixture claim ID, lease and job version.
Within a savepoint the generic role loses publication/job INSERT and UPDATE,
event INSERT and scheduled step EXECUTE; its direct scheduled step call is
denied. The fixture publisher completes the claimed job, then rollback
restores grants, role, publication/job state and source revision. Isolated run
39588629251 passed **23/23 inspector and 13/13 worker tests, 0 skipped** and
removed its container. This tests the completion slice in a reduced schema;
it does not cover prepare, recovery, the full queue, provider verification or
other generic-role RPCs. The isolated publisher itself can still submit an
invented provider ID, so a production boundary also needs provider credential
separation and an authenticated receipt path. The file is a test candidate,
not a migration, and must not be applied to the live schedule.

A full-schema test must show that the generic identity cannot submit a fake
provider receipt through manual or scheduled RPCs, while the dedicated
publish worker still completes approved real posts and the queued jobs.

### Canonical scheduled-step role probe in the owned SQL fixture

A further rollback-only candidate, `direct-write-gate-scheduled-full-role-candidate.sql`, now exercises the canonical `social_schedule_step` function in the larger scheduled-worker PostgreSQL fixture. The test starts from an approved job already prepared and claimed by the existing role. Within one transaction it revokes the shared role's direct publication/job writes and scheduled-step EXECUTE, confirms the shared role cannot complete the job, and grants the separate fixture role the table and helper-function access needed for completion. The separate role completes the claimed job; rollback restores the data and removes the test role. GitHub Actions run [39594043070](https://github.com/Bumbi190/ai-operating-platform/actions/runs/39594043070) passed **23/23 inspector, 13/13 SQL worker, 11/11 provider and 12/12 scheduled application worker tests, 0 failed or skipped**. The owned database and container were removed.

Run [39595969213](https://github.com/Bumbi190/ai-operating-platform/actions/runs/39595969213) extended the same rollback-only role to `prepare` on an approved claim. The generic role's INSERT and step EXECUTE were denied; the fixture role created a requested publication, and rollback removed it. The run passed **23/23 inspector, 13/13 SQL worker, 11/11 provider and 13/13 scheduled application worker tests, 0 failed or skipped**; the database and container were removed. The owned fixture does not contain later news-review tables/functions, so those grants and any further migrated-schema dependencies remain unverified.

Run [39596446716](https://github.com/Bumbi190/ai-operating-platform/actions/runs/39596446716) also exercised the canonical expired-claim recovery path. After a claimed Facebook attempt entered `publishing` and its lease expired, the shared role retained claim EXECUTE but lacked the revoked UPDATE permission. The fixture role advanced the job and publication to `uncertain` with `receipt_unavailable`; rollback restored the prior claimed/publishing state. **23/23 inspector, 13/13 SQL worker, 11/11 provider and 14/14 application worker tests passed, 0 failed or skipped**; owned database and container removed. This tests one lost-receipt recovery path, not every claim, checkpoint or future news-review dependency.

This verifies the tested preparation and completion paths and the tested grant dependencies in the larger owned fixture. It does not establish effective grants in a fully migrated Supabase staging database, cover all preparation/recovery paths, or authenticate the caller-supplied provider ID. The separate role can still submit a synthetic receipt in this test. The candidate must remain test-only until credential isolation, full-schema grant review, worker parity and queue-preserving rollback are ready.

### Application worker response boundary

The scheduled application worker normally obtains the Facebook receipt through
`MetaManualProvider.facebook` before calling `social_schedule_step` with
`action='complete'`. An owned full SQL fixture now covers a malformed Facebook
response with an invalid post ID: the provider rejects it, the worker makes
**zero completion RPC calls**, leaves the publication `uncertain`, and the next
tick does not send another POST. GitHub Actions run 39589718860 passed
**23/23 inspector, 13/13 SQL worker and 10/10 application worker tests,
0 skipped**. Its separately created `website_test_*` database and labeled
PostgreSQL container were removed. This validates the ordinary application
path for this failure mode, not the trustworthiness of a direct SQL caller.
The subsequent provider hardening binds a composite Facebook post ID to
the Page ID addressed by the POST. It still accepts a standalone numeric photo
ID returned by the photo endpoint. The scheduled integration fixture now
returns the approved job's Page ID instead of a hard-coded unrelated Page; its
negative case uses a syntactically valid composite ID from another Page.
Isolated run 39591054864 passed **23/23 inspector, 13/13 SQL worker,
11/11 provider and 10/10 application worker tests, 0 skipped**. The earlier full-fixture recovery failure was caused by the old hard-coded
wrong-Page success receipt. The provider rejected it before the test advanced
its fake SQL clock; the next claim carried a timestamp 91 seconds ahead while
the canonical claim function allows only five seconds of drift. The fixture
now derives the receipt from the approved Page, and the recovery test asserts
that its completion hook was reached. Run 39593256359 passed **23/23
inspector, 13/13 SQL worker, 11/11 provider and 11/11 application worker
tests, 0 skipped**. The full SQL fixture's catalog regression confirms the
shared role still has direct publication UPDATE, job UPDATE, proof INSERT and
EXECUTE on manual step, scheduled step, reconciliation inspect and completion;
the browser role cannot execute the inspected completion function. The
test database and labeled container were removed. This check rejects an inconsistent
provider response; it is not a cryptographic receipt or a defense against a
caller with direct SQL writer privileges.


Anyone retaining the broad `service_role` permission can still bypass the
provider client and submit a syntactically valid fake receipt. The dedicated
role and credential boundary remains the required production work.

## Live schedule continuity, read-only observation

On 2026-10-21, the Vercel Production configuration had
`SOCIAL_SCHEDULE_DISPATCH_ENABLED=true` and one project in
`SOCIAL_SCHEDULE_PROJECT_IDS`. The deployed source configures
`/api/social-schedule-tick` every minute and gates claims on that
project list. A read-only aggregate in the AI Operating Platform database
found two historical published jobs and four future queued jobs for the
enabled project; the next queued time was 2026-10-23 20:30 Europe/Stockholm
and the last was 2026-12-01 20:30. These are queue facts, not a guarantee
that an individual job will pass review, credential, release and stop gates.

A second read-only check of those four future jobs found two Facebook and two
Instagram jobs, all still queued and none overdue. Each has an approval from
the current project owner, points to the current content revision, and has no
recorded revocation or newer batch revision. The project execution pause,
non-active lifecycle check and platform automation pause were all false at
observation time. Two jobs have a monthly release condition. This check did
not resolve current provider credentials or establish that time-limited
monthly release evidence will exist when each job is due; the runtime item
and release guards must still pass then. These observations can change before
2026-10-23 and do not authorize a grant or credential cutover.

A grant cutover or secret move can interrupt these already approved jobs.
Do not silently turn off dispatch or migrate credentials out of the shared
web process. Before any activation, run parity and rollback against the
manual and scheduled workers, confirm the exact queued jobs remain
processable, then schedule the operational change with the owner.

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
  directly forge published state, or submit fabricated provider receipts through
  manual/scheduled step RPCs; the dedicated reader can perform its exact
  functions and cannot mutate unrelated social/calendar data. The legitimate
  publish worker retains its reviewed completion path for approved jobs.
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
role matrix and migration rollback. Preserve the existing approved schedule while this work is incomplete; do
not change the live dispatch flag or revoke privileges until an isolated reader,
writer parity and a cutover/rollback for queued jobs have been verified.

References: Supabase's current Row Level Security and Database Functions
guides: https://supabase.com/docs/guides/database/postgres/row-level-security
and https://supabase.com/docs/guides/database/functions.
