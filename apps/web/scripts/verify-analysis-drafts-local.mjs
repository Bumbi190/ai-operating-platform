import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { orderReplayMigrations, orderLegacyMediaReplayMigrations, orderCrossTreeReplayMigrations } from './analysis-replay-order.mjs'
const web = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  repo = resolve(web, '../..')
const migrationDir = resolve(web, 'supabase/migrations')
function reviewedBytes(file) {
  const relative = file.slice(repo.length + 1).replaceAll('\\', '/')
  const git = spawnSync('git', ['show', 'HEAD:' + relative], { cwd: repo, maxBuffer: 8 * 1024 * 1024 })
  const working = readFileSync(file)
  if (git.status === 0 && working.toString('utf8').replaceAll('\r\n', '\n') === git.stdout.toString('utf8'))
    return git.stdout
  console.log('LOCAL UNCOMMITTED BYTES ' + relative)
  return Buffer.from(working.toString('utf8').replaceAll('\r\n', '\n'))
}
const migration = readdirSync(migrationDir).filter((n) => /^\d+_atlas_analysis_drafts\.sql$/.test(n))
assert.equal(migration.length, 1, 'exactly one scaffolded P1 migration required')
assert.ok(
  readFileSync(resolve(migrationDir, migration[0]), 'utf8').includes(
    'CREATE FUNCTION public.atlas_save_analysis_draft',
  ),
  'P1 function missing',
)
const dependencyReplay = process.argv.includes('--mode=dependency-replay')
const legacyCronReplay = process.argv.includes('--mode=legacy-cron-replay')
const legacyDreamReplay = process.argv.includes('--mode=legacy-dream-replay')
const crossTreeReplay = process.argv.includes('--mode=legacy-cross-tree-replay')
const legacyMediaReplay = legacyCronReplay || legacyDreamReplay || crossTreeReplay || process.argv.includes('--mode=legacy-media-replay')
assert.ok([dependencyReplay,legacyCronReplay,legacyDreamReplay,crossTreeReplay,process.argv.includes('--mode=legacy-media-replay'),process.argv.includes('--mode=canonical-replay')].filter(Boolean).length<=1, 'select one replay mode')
const replay = dependencyReplay || legacyMediaReplay || process.argv.includes('--mode=canonical-replay')
const name = crossTreeReplay ? 'omnira-atlas-p1-cross-tree-replay' : legacyDreamReplay ? 'omnira-atlas-p1-legacy-dream-replay' : legacyCronReplay ? 'omnira-atlas-p1-legacy-cron-replay' : legacyMediaReplay ? 'omnira-atlas-p1-legacy-media-replay' : dependencyReplay ? 'omnira-atlas-p1-dependency-replay' : replay ? 'omnira-atlas-p1-canonical-replay' : 'omnira-atlas-p1-local'
const image = 'public.ecr.aws/supabase/postgres:17.11.0.004'
const docker = (args, input) =>
  spawnSync('docker', args, { encoding: 'utf8', input, timeout: 60000, maxBuffer: 8 * 1024 * 1024 })
assert.equal(docker(['image', 'inspect', image]).status, 0, 'cached image required; never pulls')
assert.notEqual(docker(['container', 'inspect', name]).status, 0, 'container name exists; refusing to touch it')
let owned = false,
  vite
const quote = (s) => "'" + String(s).replaceAll("'", "''") + "'"
const psqlArgs = [
  'exec',
  '-i',
  name,
  'psql',
  '-X',
  '-q',
  '-A',
  '-t',
  '-v',
  'ON_ERROR_STOP=1',
  '-U',
  'supabase_admin',
  '-d',
  'postgres',
]
function sql(s) {
  const r = docker(psqlArgs, s)
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.trim()
}
function asyncSql(s) {
  return new Promise((res, rej) => {
    const p = spawn('docker', psqlArgs, { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = '',
      err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('error', rej)
    p.on('close', (c) => (c === 0 ? res(out.trim()) : rej(Error(err))))
    p.stdin.end(s)
  })
}
async function until(fn, label, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await fn()) return
    await new Promise((r) => setTimeout(r, 25))
  }
  throw Error('barrier timeout: ' + label)
}
function session(app) {
  const p = spawn('docker', psqlArgs, { stdio: ['pipe', 'pipe', 'pipe'] })
  let out = '',
    err = ''
  p.stdout.on('data', (d) => (out += d))
  p.stderr.on('data', (d) => (err += d))
  p.stdin.write('SET application_name=' + quote(app) + ';\n')
  return {
    p,
    write: (s) => p.stdin.write(s + '\n'),
    output: () => out,
    error: () => err,
    finish: async () => {
      p.stdin.end()
      await new Promise((r) => p.on('close', r))
      assert.equal(err, '')
    },
  }
}
const project = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3',
  actor = '00000000-0000-4000-8000-000000000010'
function denied(s, pattern = /permission denied|immutable|violates/) {
  const r = docker(psqlArgs, s)
  assert.notEqual(r.status, 0, 'expected rejection')
  assert.match(r.stderr, pattern)
}
try {
  const r = docker([
    'run',
    '--pull=never',
    '--detach',
    '--name',
    name,
    '--network',
    'none',
    '--env',
    'POSTGRES_PASSWORD=synthetic-local-only',
    '--env',
    'POSTGRES_DB=postgres',
    image,
    'postgres',
    '-c',
    'shared_preload_libraries='+(legacyCronReplay || legacyDreamReplay || crossTreeReplay ? 'pg_stat_statements,pg_cron,pg_net' : 'pg_stat_statements'),
    '-c',
    'cron.launch_active_jobs=off',
  ])
  assert.equal(r.status, 0, r.stderr)
  owned = true
  await until(
    () =>
      ['postgres', '.postgres-wrapp'].includes(docker(['exec', name, 'cat', '/proc/1/comm']).stdout.trim()) &&
      docker(['exec', name, 'pg_isready', '-U', 'postgres']).status === 0,
    'Postgres ready after entrypoint initialization',
    60000,
  )
  const inspection = JSON.parse(docker(['inspect', name]).stdout)[0]
  assert.equal(inspection.HostConfig.NetworkMode, 'none')
  assert.ok(!Object.keys(inspection.HostConfig.PortBindings ?? {}).length)
  console.log('isolation: cached image, network none, zero port bindings, owned container only')
  if (replay) {
    sql(
      "CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions; CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY); CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF; END $$;",
    )
    if(legacyCronReplay || legacyDreamReplay || crossTreeReplay) sql('CREATE EXTENSION IF NOT EXISTS pg_cron; CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(name text);')
    // Supabase's cached PostgreSQL image has Auth, but Storage schema is installed by Storage API.
    // Use exact upstream SQL bytes; preserve image roles with the upstream install_roles switch.
    for (const [upstream, expected] of [
      ['0002-storage-schema.sql','19562682ff1b77cda9ba096671b873e7e226b10f0b0564bd4823e6c1754393b6'],
      ['0008-add-public-to-buckets.sql','1d881092aea62e83493f1a9c4cb4f101f3035a08d62be84a7e7970ee0c6f0f48'],
    ]) {
      const extracted=docker(['run','--rm','--pull=never','--network','none','--entrypoint','cat',
        'public.ecr.aws/supabase/storage-api:v1.79.36','/app/migrations/tenant/'+upstream]);
      assert.equal(extracted.status,0,'cached Storage API prerequisite unavailable: '+extracted.stderr);
      const digest=createHash('sha256').update(extracted.stdout).digest('hex');
      assert.equal(digest,expected,'unreviewed upstream Storage bootstrap: '+upstream);
      console.log('UPSTREAM STORAGE '+upstream+' sha256='+digest);
      sql("SET storage.install_roles='false';"+extracted.stdout);
    }
    const entries=readdirSync(migrationDir).filter(n=>n.endsWith('.sql')).map(name=>{
      const bytes=reviewedBytes(resolve(migrationDir,name));
      return {name,sha256:createHash('sha256').update(bytes).digest('hex')};
    });
    const legacyFile=resolve(repo,'supabase/migrations/20260601_media_insights.sql');
    const legacyEntry=legacyMediaReplay ? {name:'20260601_media_insights.sql',sha256:createHash('sha256').update(reviewedBytes(legacyFile)).digest('hex')} : null;
    const cronFile=resolve(repo,'supabase/migrations/20260528_pg_cron_setup.sql');
    const cronEntry=legacyCronReplay || legacyDreamReplay || crossTreeReplay ? {name:'20260528_pg_cron_setup.sql',sha256:createHash('sha256').update(reviewedBytes(cronFile)).digest('hex')} : null;
    const dreamFile=resolve(repo,'supabase/migrations/20260609_dream_issues_ledger.sql');
    const dreamEntry=legacyDreamReplay || crossTreeReplay ? {name:'20260609_dream_issues_ledger.sql',sha256:createHash('sha256').update(reviewedBytes(dreamFile)).digest('hex')} : null;
    const extraFiles=crossTreeReplay ? [
      '20260528_pass_a_safeguards.sql',
      '20260602_atlas_growth_account_snapshots.sql',
      '20260602_stripe_intelligence_revenue_snapshots.sql',
      '20260602_g1_multitenant_platform_tokens.sql',
      '20260603_cron_heartbeat.sql',
      '20260603_durable_runs.sql',
      '20260609_manager_task_dream_link.sql',
    ].map(name=>resolve(repo,'supabase/migrations',name)) : [];
    const extraEntries=extraFiles.map(file=>({name:file.split(/[\\/]/).at(-1),sha256:createHash('sha256').update(reviewedBytes(file)).digest('hex')}));
    const ordered=crossTreeReplay ? orderCrossTreeReplayMigrations(entries,legacyEntry,cronEntry,dreamEntry,extraEntries)
      : legacyMediaReplay ? orderLegacyMediaReplayMigrations(entries,legacyEntry,cronEntry,dreamEntry)
      : dependencyReplay ? orderReplayMigrations(entries) : entries.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    if(dependencyReplay || legacyMediaReplay) console.log('LOCAL REPLAY ORDER: hash-pinned media_tables before media_images; all canonical files retained');
    if(legacyMediaReplay) console.log('LOCAL LEGACY MEDIA: one hash-pinned root media_insights migration included; diagnostic only');
    if(legacyCronReplay) console.log('LOCAL LEGACY CRON: hash-pinned root pg_cron setup included; cron launching disabled and network none');
    if(legacyDreamReplay) console.log('LOCAL LEGACY DREAM: hash-pinned cron and dream ledger roots included; cron launching disabled and network none');
    if(crossTreeReplay) console.log('LOCAL CROSS-TREE: ten hash-pinned root files; cron launching disabled and network none; diagnostic only');
    const rootFiles=new Map([[legacyEntry,legacyFile],[cronEntry,cronFile],[dreamEntry,dreamFile],...extraEntries.map((entry,index)=>[entry,extraFiles[index]])]);
    const files = [
      resolve(repo, 'packages/db/full_schema_run_in_supabase.sql'),
      ...ordered.map(entry=>rootFiles.get(entry) ?? resolve(migrationDir,entry.name)),
    ]
    for (const file of files) {
      const bytes = reviewedBytes(file)
      console.log(
        'REPLAY ' + file.slice(repo.length + 1) + ' sha256=' + createHash('sha256').update(bytes).digest('hex'),
      )
      sql(bytes.toString('utf8'))
    }
    if (crossTreeReplay) {
      // A catalog snapshot of the replayed migration history, not a production cutover.
      // Keep the same target list as the read-only live catalog audit.
      const acl = JSON.parse(sql(`
        WITH targets(kind,obj,priv) AS (VALUES
          ('table','public.social_publications','INSERT'),
          ('table','public.social_publications','UPDATE'),
          ('table','public.social_schedule_jobs','INSERT'),
          ('table','public.social_schedule_jobs','UPDATE'),
          ('table','public.social_publication_events','INSERT'),
          ('table','public.social_schedule_events','INSERT'),
          ('table','public.social_publication_reconciliation_proofs','INSERT'),
          ('table','public.platform_tokens','SELECT'),
          ('function','public.social_schedule_step(jsonb,jsonb)','EXECUTE'),
          ('function','public.social_publication_step(jsonb,jsonb)','EXECUTE'),
          ('function','public.social_publication_reconciliation_inspect(jsonb,jsonb)','EXECUTE'),
          ('function','public.social_publication_reconciliation_complete(jsonb,jsonb)','EXECUTE')
        ), grants AS (
          SELECT kind,obj,priv,
            CASE WHEN kind='table' THEN to_regclass(obj)::text ELSE to_regprocedure(obj)::text END AS exists_as,
            CASE WHEN kind='table' THEN has_table_privilege('service_role',obj,priv)
              ELSE has_function_privilege('service_role',obj,priv) END AS service_role,
            CASE WHEN kind='table' THEN has_table_privilege('anon',obj,priv)
              ELSE has_function_privilege('anon',obj,priv) END AS anon,
            CASE WHEN kind='table' THEN has_table_privilege('authenticated',obj,priv)
              ELSE has_function_privilege('authenticated',obj,priv) END AS authenticated
          FROM targets
        )
        SELECT jsonb_agg(to_jsonb(grants) ORDER BY kind,obj,priv) FROM grants;
      `))
      assert.equal(acl.length, 12)
      for (const entry of acl) {
        assert.ok(entry.exists_as, 'missing ACL target: ' + entry.obj)
        assert.equal(entry.service_role, true, 'expected historical service_role grant: ' + entry.obj)
        assert.equal(entry.anon, false, 'unexpected anon grant: ' + entry.obj)
        assert.equal(entry.authenticated, false, 'unexpected authenticated grant: ' + entry.obj)
      }
      console.log('CROSS-TREE ACL BASELINE ' + JSON.stringify(acl))
      const roleCandidate = reviewedBytes(resolve(web, 'lib/calendar/direct-write-gate-scheduled-full-role-candidate.sql'))
      const candidate = JSON.parse(sql(`
        BEGIN;
        ${roleCandidate.toString('utf8')}
        SELECT jsonb_build_object(
          'publisher_jobs_update',has_table_privilege('social_schedule_full_publisher_fixture','public.social_schedule_jobs','UPDATE'),
          'publisher_publications_insert',has_table_privilege('social_schedule_full_publisher_fixture','public.social_publications','INSERT'),
          'publisher_events_insert',has_table_privilege('social_schedule_full_publisher_fixture','public.social_schedule_events','INSERT'),
          'publisher_step_execute',has_function_privilege('social_schedule_full_publisher_fixture','public.social_schedule_step(jsonb,jsonb)','EXECUTE'),
          'publisher_tokens_select',has_table_privilege('social_schedule_full_publisher_fixture','public.platform_tokens','SELECT'),
          'service_jobs_update',has_table_privilege('service_role','public.social_schedule_jobs','UPDATE'),
          'service_publications_insert',has_table_privilege('service_role','public.social_publications','INSERT'),
          'service_events_insert',has_table_privilege('service_role','public.social_schedule_events','INSERT'),
          'service_step_execute',has_function_privilege('service_role','public.social_schedule_step(jsonb,jsonb)','EXECUTE'),
          'service_manual_step_execute',has_function_privilege('service_role','public.social_publication_step(jsonb,jsonb)','EXECUTE'),
          'service_proofs_insert',has_table_privilege('service_role','public.social_publication_reconciliation_proofs','INSERT')
        );
        ROLLBACK;
      `))
      for (const key of ['publisher_jobs_update','publisher_publications_insert','publisher_events_insert','publisher_step_execute','service_manual_step_execute','service_proofs_insert'])
        assert.equal(candidate[key], true, 'expected candidate grant: ' + key)
      for (const key of ['publisher_tokens_select','service_jobs_update','service_publications_insert','service_events_insert','service_step_execute'])
        assert.equal(candidate[key], false, 'unexpected candidate grant: ' + key)
      assert.equal(sql("SELECT count(*) FROM pg_roles WHERE rolname='social_schedule_full_publisher_fixture'"), '0', 'candidate role escaped rollback')
      console.log('CROSS-TREE ROLE CANDIDATE ' + JSON.stringify(candidate) + ' (rolled back)')
      // The source-gate SQL is a test candidate. Adapt only its pgcrypto schema
      // qualifiers to this replay's upstream extension install, then discard it.
      const gateFile = reviewedBytes(resolve(web, 'lib/calendar/direct-write-gate-probe.sql')).toString('utf8')
      assert.equal((gateFile.match(/public\.gen_random_bytes/g) ?? []).length, 1)
      assert.equal((gateFile.match(/public\.hmac/g) ?? []).length, 2)
      const gate = gateFile.replaceAll('public.gen_random_bytes', 'extensions.gen_random_bytes')
        .replaceAll('public.hmac', 'extensions.hmac')
      const recoveryFile = reviewedBytes(resolve(web, 'lib/calendar/direct-write-gate-worker-recovery-integration-probe.sql')).toString('utf8')
      const lockedClaim = recoveryFile.split('create or replace function public.social_schedule_step')[0]
      assert.equal((lockedClaim.match(/create or replace function public\.social_schedule_locked_claim/g) ?? []).length, 1)
      const id = {
        plan: '20000000-0000-4000-8000-000000000011',
        post: '20000000-0000-4000-8000-000000000012',
        revision: '20000000-0000-4000-8000-000000000013',
        batch: '20000000-0000-4000-8000-000000000014',
        approval: '20000000-0000-4000-8000-000000000015',
        job: '20000000-0000-4000-8000-000000000016',
        claim: '20000000-0000-4000-8000-000000000017',
        binding: '20000000-0000-4000-8000-000000000018',
        asset: '20000000-0000-4000-8000-000000000019',
        contentDecision: '20000000-0000-4000-8000-000000000020',
      }
      const roleResult = JSON.parse(sql(`
        BEGIN;
        INSERT INTO auth.users(id) VALUES (${quote(actor)});
        INSERT INTO public.projects(id,owner_id,name,slug)
          VALUES (${quote(project)},${quote(actor)},'Isolated calendar probe','calendar-probe-only');
        INSERT INTO public.social_launch_plans(project_id,created_by) VALUES (${quote(project)},${quote(actor)});
        INSERT INTO public.social_launch_plan_revisions(id,project_id,sequence,sha256,choices,idempotency_key,created_by)
          VALUES (${quote(id.plan)},${quote(project)},1,${quote('a'.repeat(64))},'[{"channel":"facebook","purpose":"test","format":"image","cadence":"manual"}]','probe-plan',${quote(actor)});
        UPDATE public.social_launch_plans SET current_revision_id=${quote(id.plan)} WHERE project_id=${quote(project)};
        INSERT INTO public.social_launch_plan_decisions(project_id,revision_id,sha256,decision,idempotency_key,decided_by)
          VALUES (${quote(project)},${quote(id.plan)},${quote('a'.repeat(64))},'approve','probe-plan-approval',${quote(actor)});
        INSERT INTO public.social_account_bindings(binding_id,project_id,platform,external_account_id,account_label,credential_source,verification,verified_at,bound_by)
          VALUES (${quote(id.binding)},${quote(project)},'facebook','12345','Synthetic page','project_store','provider_attested',now(),${quote('user:'+actor)});
        INSERT INTO public.assets(id,project_id,kind,mime_type,byte_size,checksum_sha256,width,height,storage_bucket,storage_path)
          VALUES (${quote(id.asset)},${quote(project)},'image','image/jpeg',1024,${quote('d'.repeat(64))},600,600,'synthetic-only','role-probe/image.jpg');
        INSERT INTO public.social_content_posts(id,project_id,created_by)
          VALUES (${quote(id.post)},${quote(project)},${quote(actor)});
        INSERT INTO public.social_content_revisions(id,post_id,project_id,sequence,plan_revision_id,sha256,draft,media,binding_id,binding,input_data,idempotency_key,created_by)
          VALUES (${quote(id.revision)},${quote(id.post)},${quote(project)},1,${quote(id.plan)},${quote('b'.repeat(64))},
            jsonb_build_object('channel','facebook','format','image','title','Synthetic','text','Synthetic caption',
              'linkUrl',null,'mediaIds',jsonb_build_array(${quote(id.asset)}),'mediaBrief','',
              'scheduledAt',to_char((now()-interval '1 minute') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
            jsonb_build_array(jsonb_build_object('id',${quote(id.asset)},'kind','image','mimeType','image/jpeg','sha256',${quote('d'.repeat(64))})),
            ${quote(id.binding)},'{"accountId":"12345","label":"Synthetic page"}',
            '{}','probe-revision',${quote(actor)});
        UPDATE public.social_content_posts SET current_revision_id=${quote(id.revision)} WHERE id=${quote(id.post)};
        INSERT INTO public.social_content_decisions(id,project_id,post_id,revision_id,sha256,decision,idempotency_key,decided_by)
          VALUES (${quote(id.contentDecision)},${quote(project)},${quote(id.post)},${quote(id.revision)},${quote('b'.repeat(64))},'approve','probe-content-approval',${quote(actor)});
        INSERT INTO public.social_schedule_batches(id,batch_id,project_id,sequence,manifest,sha256,created_by,idempotency_key,input_data)
          VALUES (${quote(id.batch)},gen_random_uuid(),${quote(project)},1,'{}',${quote('c'.repeat(64))},${quote(actor)},'probe-batch','{}');
        INSERT INTO public.social_schedule_decisions(id,project_id,batch_revision_id,action,actor,idempotency_key,input_data)
          VALUES (${quote(id.approval)},${quote(project)},${quote(id.batch)},'approve',${quote(actor)},'probe-approval','{}');
        INSERT INTO public.social_schedule_jobs(id,project_id,batch_revision_id,approval_id,post_id,revision_id,revision_sha256,channel,occasion_id,scheduled_at,expires_at,item,state,claim_id,worker_id,lease_expires_at)
          VALUES (${quote(id.job)},${quote(project)},${quote(id.batch)},${quote(id.approval)},${quote(id.post)},${quote(id.revision)},${quote('b'.repeat(64))},'facebook',gen_random_uuid(),now()-interval '1 minute',now()+interval '9 minutes',
            jsonb_build_object('postId',${quote(id.post)},'revisionId',${quote(id.revision)},'sha256',${quote('b'.repeat(64))},
              'decisionId',${quote(id.contentDecision)},'planRevisionId',${quote(id.plan)},'bindingId',${quote(id.binding)},
              'accountId','12345','channel','facebook','asset',jsonb_build_object('id',${quote(id.asset)},'sha256',${quote('d'.repeat(64))}),
              'localMinute',to_char((now()-interval '1 minute') at time zone 'Europe/Stockholm','YYYY-MM-DD"T"HH24:MI'),
              'scheduledAt',to_char((now()-interval '1 minute') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'expiresAt',to_char((now()+interval '9 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'occasionId',gen_random_uuid(),'kind','ordinary','releaseCondition',null),
            'claimed',${quote(id.claim)},'probe-worker',now()+interval '90 seconds');
        ${reviewedBytes(resolve(web, 'lib/calendar/source-revision-probe.sql')).toString('utf8')}
        INSERT INTO public.calendar_source_revision_probe(owner_user_id,project_id,revision)
          VALUES (${quote(actor)},${quote(project)},1);
        ${gate}
        ${lockedClaim}
        ${roleCandidate.toString('utf8')}
        GRANT EXECUTE ON FUNCTION public.calendar_source_gate_begin_probe(uuid)
          TO social_schedule_full_publisher_fixture;
        SET LOCAL ROLE service_role;
        DO $deny_service$ BEGIN
          UPDATE public.social_schedule_jobs SET reason='forbidden' WHERE id=${quote(id.job)}::uuid;
          RAISE EXCEPTION 'DIRECT_SERVICE_WRITE_ACCEPTED';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM NOT LIKE '%permission denied%' THEN RAISE; END IF;
        END $deny_service$;
        RESET ROLE;
        SET LOCAL ROLE social_schedule_full_publisher_fixture;
        DO $deny_fixture$ BEGIN
          UPDATE public.social_schedule_jobs SET reason='forbidden' WHERE id=${quote(id.job)}::uuid;
          RAISE EXCEPTION 'DIRECT_FIXTURE_WRITE_ACCEPTED';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM <> 'CALENDAR_WRITE_GATE_REQUIRED' THEN RAISE; END IF;
        END $deny_fixture$;
        RESET ROLE;
        SAVEPOINT revoked_approval_probe;
        INSERT INTO public.social_schedule_decisions(project_id,batch_revision_id,action,actor,approval_id,reason,idempotency_key,input_data)
          VALUES (${quote(project)},${quote(id.batch)},'revoke',${quote(actor)},${quote(id.approval)},'synthetic-revocation','probe-revocation','{}');
        SET LOCAL ROLE social_schedule_full_publisher_fixture;
        DO $deny_revoked$ BEGIN
          PERFORM public.social_schedule_step(
            jsonb_build_object('jobId',${quote(id.job)},'claimId',${quote(id.claim)},'version',1),
            '{"action":"prepare"}'::jsonb
          );
          RAISE EXCEPTION 'REVOKED_APPROVAL_ACCEPTED';
        EXCEPTION WHEN raise_exception THEN
          IF SQLERRM <> 'SOCIAL_SCHEDULE_REVIEW_REQUIRED' THEN RAISE; END IF;
        END $deny_revoked$;
        RESET ROLE;
        ROLLBACK TO SAVEPOINT revoked_approval_probe;
        SET LOCAL ROLE social_schedule_full_publisher_fixture;
        DO $prepare$ BEGIN
          PERFORM public.social_schedule_step(
            jsonb_build_object('jobId',${quote(id.job)},'claimId',${quote(id.claim)},'version',1),
            '{"action":"prepare"}'::jsonb
          );
        END $prepare$;
        DO $checkpoint$ BEGIN
          PERFORM public.social_schedule_step(
            jsonb_build_object('jobId',${quote(id.job)},'claimId',${quote(id.claim)},'version',2),
            '{"action":"checkpoint","reason":"stopped"}'::jsonb
          );
        END $checkpoint$;
        RESET ROLE;
        SELECT jsonb_build_object(
          'state',(SELECT state FROM public.social_schedule_jobs WHERE id=${quote(id.job)}),
          'version',(SELECT version FROM public.social_schedule_jobs WHERE id=${quote(id.job)}),
          'source_revision',(SELECT revision FROM public.calendar_source_revision_probe WHERE project_id=${quote(project)}),
          'prepare_events',(SELECT count(*) FROM public.social_schedule_events WHERE job_id=${quote(id.job)} AND event='prepare'),
          'checkpoint_events',(SELECT count(*) FROM public.social_schedule_events WHERE job_id=${quote(id.job)} AND event='checkpoint'),
          'publications',(SELECT count(*) FROM public.social_publications WHERE project_id=${quote(project)})
        );
        ROLLBACK;
      `))
      assert.deepEqual(roleResult, { state:'blocked', version:3, source_revision:4, prepare_events:1, checkpoint_events:1, publications:1 })
      assert.equal(sql("SELECT count(*) FROM public.projects WHERE id=" + quote(project)), '0', 'synthetic project escaped rollback')
      console.log('CROSS-TREE PREPARE AND CHECKPOINT GATE ' + JSON.stringify(roleResult) + ' (rolled back; no provider call)')
    }
    console.log(crossTreeReplay ? 'CROSS-TREE REPLAY PASS' : legacyDreamReplay ? 'LEGACY DREAM REPLAY PASS' : legacyCronReplay ? 'LEGACY CRON REPLAY PASS' : legacyMediaReplay ? 'LEGACY MEDIA REPLAY PASS' : dependencyReplay ? 'DEPENDENCY REPLAY PASS' : 'CANONICAL REPLAY PASS')
    process.exitCode = 0
  } else {
    sql(readFileSync(resolve(web, 'lib/qa/fixtures/analysis-drafts-local-bootstrap.sql'), 'utf8'))
    assert.equal(
      sql("SELECT has_table_privilege('service_role','public.projects','INSERT')"),
      't',
      'fixture default grants fidelity',
    )
    assert.equal(
      sql(
        "SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto'",
      ),
      'extensions',
    )
    for (const n of [
      '20261010100000_handlarborsen_marketplace_snapshots.sql',
      '20261010130000_handlarborsen_guarded_snapshot_store.sql',
      migration[0],
    ]) {
      const b = reviewedBytes(resolve(migrationDir, n))
      sql(b.toString('utf8'))
      console.log('DEPENDENCY ' + n + ' sha256=' + createHash('sha256').update(b).digest('hex'))
    }
    assert.equal(
      sql(
        "SELECT count(*) FROM pg_policy WHERE polrelid IN ('public.atlas_analysis_drafts'::regclass,'public.atlas_analysis_draft_events'::regclass)",
      ),
      '0',
    )
    assert.equal(
      sql(
        "SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.atlas_analysis_drafts'::regclass,'public.atlas_analysis_draft_events'::regclass)",
      ),
      't',
    )
    for (const table of ['atlas_analysis_drafts', 'atlas_analysis_draft_events'])
      for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.equal(
          sql(
            'SELECT has_table_privilege(' +
              quote(role) +
              ',' +
              quote('public.' + table) +
              ",'INSERT,UPDATE,DELETE,TRUNCATE')",
          ),
          'f',
        )
        if (role !== 'service_role') denied('SET ROLE ' + role + '; SELECT * FROM public.' + table)
        for (const verb of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
          const statement =
            verb === 'INSERT'
              ? 'INSERT INTO public.' + table + ' DEFAULT VALUES'
              : verb === 'UPDATE'
                ? 'UPDATE public.' + table + ' SET id=gen_random_uuid()'
                : verb === 'DELETE'
                  ? 'DELETE FROM public.' + table
                  : 'TRUNCATE public.' + table
          denied('SET ROLE ' + role + '; ' + statement)
        }
      }
    for (const role of ['anon', 'authenticated'])
      denied('SET ROLE ' + role + '; SELECT public.atlas_save_analysis_draft(' + quote(actor) + ",'{}')")
    assert.equal(
      sql("SELECT has_function_privilege('service_role','public.atlas_analysis_source_encoding(uuid)','EXECUTE')"),
      'f',
    )
    assert.equal(
      sql("SELECT has_sequence_privilege('service_role','public.atlas_analysis_draft_events_seq_seq','USAGE')"),
      'f',
    )
    const parity = JSON.parse(readFileSync(resolve(web, 'lib/qa/fixtures/analysis-source-parity.json')))
    const keys = parity[0].source.semantics.map((d) => d.key)
    function persist(source) {
      sql('DELETE FROM public.collector_runs; DELETE FROM public.handlarborsen_marketplace_snapshots;')
      for (const s of source.snapshots) {
        const columns = [
          'id',
          'project_id',
          'snapshot_date',
          'observed_at',
          'captured_at',
          'schema_version',
          'window_hours',
          'completeness',
          'unavailable',
          ...keys,
        ]
        sql(
          'INSERT INTO public.handlarborsen_marketplace_snapshots(' +
            columns.join(',') +
            ') VALUES(' +
            columns
              .map((k) => (s[k] === null ? 'NULL' : quote(k === 'unavailable' ? JSON.stringify(s[k]) : s[k])))
              .join(',') +
            ')',
        )
      }
      for (const a of source.runs)
        sql(
          'INSERT INTO public.collector_runs(id,project_id,collector_id,status,ran_at,snapshot_date,metadata) VALUES(' +
            [
              a.id,
              a.project_id,
              a.collector_id,
              a.status,
              a.ran_at,
              a.snapshot_date,
              JSON.stringify({ storage_outcome: a.storage_outcome }),
            ]
              .map((v) => (v === null ? 'NULL' : quote(v)))
              .join(',') +
            ')',
        )
    }
    for (const f of parity) {
      persist(f.source)
      let source = JSON.parse(sql('SELECT public.atlas_analysis_source_rows(' + quote(project) + ')'))
      if (!f.source.auditReadable) source.auditReadable = false
      assert.deepEqual(source, f.source)
      const bytes = sql('SELECT public.atlas_analysis_encode(' + quote(JSON.stringify(source)) + '::jsonb)')
      assert.equal(bytes, f.encoding, f.name)
      assert.equal(
        sql('SELECT encode(extensions.digest(convert_to(' + quote(bytes) + ",'UTF8'),'sha256'),'hex')"),
        f.hash,
      )
    }
    console.log('parity: 9 exact encodings and SHA-256 from persisted rows')
    const { createServer } = await import('vite')
    vite = await createServer({
      root: web,
      configFile: false,
      server: { middlewareMode: true, watch: { ignored: ['**/*'] } },
      resolve: { alias: { '@': web, 'server-only': resolve(web, 'lib/qa/__stubs__/server-only.ts') } },
      css: { postcss: {} },
    })
    const binding = await vite.ssrLoadModule('/lib/atlas/project-analytics/analysis-source-binding.ts')
    const contract = await vite.ssrLoadModule('/lib/atlas/project-analytics/analysis-review-contract.ts')
    const reports = await vite.ssrLoadModule('/lib/atlas/project-analytics/handlarborsen-marketplace-report.ts')
    globalThis.fetch = () => {
      throw Error('external egress denied')
    }
    function freshSource() {
      const time = JSON.parse(
        sql(
          "SELECT json_build_object('observed',public.atlas_analysis_time(clock_timestamp()-interval '1 second'),'captured',public.atlas_analysis_time(clock_timestamp()),'now',public.atlas_analysis_time(clock_timestamp()))",
        ),
      )
      const src = structuredClone(parity[0].source)
      src.snapshots[0].observed_at = time.observed
      src.snapshots[0].snapshot_date = time.observed.slice(0, 10)
      src.snapshots[0].captured_at = time.captured
      src.runs[0].ran_at = time.captured
      src.runs[0].snapshot_date = time.observed.slice(0, 10)
      return src
    }
    function payload() {
      const src = JSON.parse(sql('SELECT public.atlas_analysis_source_rows(' + quote(project) + ')'))
      const now = new Date(sql('SELECT public.atlas_analysis_time(clock_timestamp())'))
      const report = reports.buildMarketplaceReport(binding.sourceReportRows(src), now, src.runs)
      const built = contract.buildAnalysisReviewDraft(
        src,
        report,
        {
          ruleId: 'company-status',
          ruleVersion: 'handlarborsen-insights-1.0.0',
          expectedEvidenceHash: binding.hashAnalysisSource(src),
        },
        now,
      )
      assert.equal(built.status, 'ok', 'valid internal payload')
      return built.draft
    }
    const rpc = (d, a = actor) =>
      'SELECT public.atlas_save_analysis_draft(' + quote(a) + ',' + quote(JSON.stringify(d)) + '::jsonb);'
    const result = (s) => JSON.parse(sql(s))
    persist(freshSource())
    let d = payload()
    const concurrent = await Promise.all(
      Array.from({ length: 12 }, () => asyncSql('SET ROLE service_role; ' + rpc(d)).then(JSON.parse)),
    )
    assert.equal(new Set(concurrent.map((x) => x.id)).size, 1)
    assert.equal(concurrent.filter((x) => x.created).length, 1)
    assert.equal(sql('SELECT count(*) FROM public.atlas_analysis_drafts'), '1')
    assert.equal(sql("SELECT count(*) FROM public.atlas_analysis_draft_events WHERE kind='created'"), '1')
    console.log('same-evidence: 12 sessions, one created, one UUID, one event')
    const saved = concurrent[0].id
    for (const table of ['atlas_analysis_drafts', 'atlas_analysis_draft_events'])
      for (const s of [
        'UPDATE public.' + table + ' SET id=gen_random_uuid()',
        'DELETE FROM public.' + table,
        'TRUNCATE public.' + table + ' CASCADE',
      ])
        denied(s, /atlas_analysis_immutable/)
    denied(
      "INSERT INTO public.atlas_analysis_draft_events(project_id,draft_id,kind,superseded_by,actor_id) VALUES('00000000-0000-4000-8000-000000000099'," +
        quote(saved) +
        ",'superseded','00000000-0000-4000-8000-000000000030'," +
        quote(actor) +
        ')',
      /foreign key/,
    )
    assert.equal(result(rpc(d, '00000000-0000-4000-8000-000000000011')).status, 'not_found')
    assert.equal(result(rpc({ ...d, sourceEnvelope: { ...d.sourceEnvelope, slug: 'other' } })).status, 'conflict')
    assert.equal(result(rpc({ ...d, contentHash: 'a'.repeat(64) })).status, 'conflict')
    assert.equal(result(rpc({ ...d, insight: { ...d.insight, agentId: 'forbidden' } })).status, 'conflict')
    sql("UPDATE public.handlarborsen_marketplace_snapshots SET captured_at=captured_at+interval '1 microsecond'")
    assert.equal(result(rpc(d)).status, 'conflict', 'refresh before observation')
    let newer = payload()
    const second = result(rpc(newer))
    assert.equal(second.created, true)
    assert.equal(result(rpc(d)).status, 'conflict')
    assert.equal(sql("SELECT count(*) FROM public.atlas_analysis_draft_events WHERE kind='superseded'"), '1')
    // Explicit project-lock barrier: owner and mode are rechecked after waiting.
    for (const [field, value, want] of [
      ['owner_id', '00000000-0000-4000-8000-000000000011', 'not_found'],
      ['atlas_mode', 'archived', 'conflict'],
    ]) {
      const hold = session('p1_holder_' + field)
      hold.write('BEGIN; SELECT id FROM public.projects WHERE id=' + quote(project) + " FOR UPDATE; SELECT 'HELD';")
      await until(() => hold.output().includes('HELD'), 'project lock held')
      const wait = session('p1_wait_' + field)
      wait.write('SET ROLE service_role; ' + rpc(newer) + " SELECT 'DONE';")
      await until(
        () =>
          sql(
            'SELECT count(*) FROM pg_stat_activity WHERE application_name=' +
              quote('p1_wait_' + field) +
              " AND wait_event_type='Lock'",
          ) === '1',
        'save waiting on project',
      )
      hold.write(
        'UPDATE public.projects SET ' + field + '=' + quote(value) + ' WHERE id=' + quote(project) + '; COMMIT;',
      )
      await until(() => wait.output().includes('DONE'), 'owner/mode save result')
      assert.ok(wait.output().includes(want))
      await hold.finish()
      await wait.finish()
      sql('UPDATE public.projects SET owner_id=' + quote(actor) + ",atlas_mode='observer' WHERE id=" + quote(project))
    }
    console.log('project lock barriers: owner revoked -> not_found; archived -> conflict')
    // Freeze selected snapshot until transaction commits; audit writes/inserts remain independent.
    sql("UPDATE public.handlarborsen_marketplace_snapshots SET captured_at=captured_at+interval '1 microsecond'")
    newer = payload()
    sql(
      "WITH t AS MATERIALIZED (SELECT clock_timestamp()-interval '24 hours' AS time) UPDATE public.handlarborsen_marketplace_snapshots SET observed_at=t.time,captured_at=t.time,snapshot_date=(t.time AT TIME ZONE 'UTC')::date FROM t",
    )
    newer = payload()
    const observed = session('p1_observed')
    observed.write('BEGIN; SET ROLE service_role; ' + rpc(newer) + " SELECT 'OBSERVED';")
    await until(() => observed.output().includes('OBSERVED'), 'RPC observation complete')
    const refresh = session('p1_refresh')
    refresh.write(
      "UPDATE public.handlarborsen_marketplace_snapshots SET captured_at=captured_at+interval '1 microsecond'; SELECT 'REFRESHED';",
    )
    await until(
      () =>
        sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='p1_refresh' AND wait_event_type='Lock'") ===
        '1',
      'snapshot refresh blocked by share lock',
    )
    sql("UPDATE public.collector_runs SET metadata=jsonb_build_object('storage_outcome','refreshed')")
    const insertedAudit = asyncSql(
      "SET application_name='p1_insert_audit'; INSERT INTO public.collector_runs(project_id,collector_id,status,ran_at,snapshot_date,metadata) SELECT project_id,collector_id,status,clock_timestamp(),snapshot_date,metadata FROM public.collector_runs LIMIT 1",
    )
    await until(
      () =>
        sql(
          "SELECT count(*) FROM pg_stat_activity WHERE application_name='p1_insert_audit' AND wait_event_type='Lock'",
        ) === '1',
      'audit INSERT waits on FK project lock',
    )
    const insertedSnapshot = asyncSql(
      "SET application_name='p1_insert_snapshot'; WITH t AS MATERIALIZED (SELECT clock_timestamp() AS time) INSERT INTO public.handlarborsen_marketplace_snapshots(project_id,snapshot_date,observed_at,captured_at,schema_version,window_hours,completeness,unavailable,companies_registered_total,companies_verified_total,vehicles_published_active,vehicles_reserved,vehicles_published_last_24h,bids_total,bids_last_24h,interests_last_24h,offers_last_24h,deals_completed_total,deals_completed_last_24h) SELECT project_id,(t.time AT TIME ZONE 'UTC')::date,t.time,t.time,schema_version,window_hours,completeness,unavailable,s.companies_registered_total,s.companies_verified_total,s.vehicles_published_active,s.vehicles_reserved,s.vehicles_published_last_24h,s.bids_total,s.bids_last_24h,s.interests_last_24h,s.offers_last_24h,s.deals_completed_total,s.deals_completed_last_24h FROM public.handlarborsen_marketplace_snapshots s CROSS JOIN t LIMIT 1",
    )
    await until(
      () =>
        sql(
          "SELECT count(*) FROM pg_stat_activity WHERE application_name='p1_insert_snapshot' AND wait_event_type='Lock'",
        ) === '1',
      'snapshot INSERT waits on FK project lock',
    )
    observed.write('COMMIT;')
    await observed.finish()
    await insertedAudit
    await insertedSnapshot
    assert.equal(sql('SELECT count(*) FROM public.handlarborsen_marketplace_snapshots'), '2')
    await until(() => refresh.output().includes('REFRESHED'), 'refresh resumed')
    await refresh.finish()
    assert.notEqual(
      binding.hashAnalysisSource(JSON.parse(sql('SELECT public.atlas_analysis_source_rows(' + quote(project) + ')'))),
      newer.evidenceHash,
    )
    assert.equal(result(rpc(newer)).status, 'conflict', 'old source after audit mutation/insertion')
    console.log(
      'observation barrier: snapshot UPDATE waits; audit UPDATE allowed; audit/snapshot INSERT wait on FK then commit, reload hash differs',
    )
    // Inject rollback after draft INSERT at its created-event insert.
    newer = payload()
    const before = sql('SELECT count(*) FROM public.atlas_analysis_drafts')
    sql(
      "CREATE FUNCTION public.p1_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test_rollback'; END $$; CREATE TRIGGER p1_test_fail BEFORE INSERT ON public.atlas_analysis_draft_events FOR EACH ROW EXECUTE FUNCTION public.p1_test_fail();",
    )
    denied(rpc(newer), /test_rollback/)
    assert.equal(sql('SELECT count(*) FROM public.atlas_analysis_drafts'), before)
    sql('DROP TRIGGER p1_test_fail ON public.atlas_analysis_draft_events; DROP FUNCTION public.p1_test_fail()')
    console.log('rollback: draft insertion and supersession unchanged after injected event failure')
    // Audits and required values are never coerced into usable evidence.
    for (const mutation of [
      "UPDATE public.collector_runs SET status='skipped',metadata='{}'::jsonb",
      'DELETE FROM public.collector_runs',
      "UPDATE public.collector_runs SET status='error'",
      "UPDATE public.handlarborsen_marketplace_snapshots SET companies_verified_total=NULL,completeness='partial',unavailable=jsonb_build_object('companies_verified_total','query_failed')",
      "UPDATE public.handlarborsen_marketplace_snapshots SET observed_at=clock_timestamp()-interval '27 hours',snapshot_date=(clock_timestamp()-interval '27 hours')::date",
    ]) {
      persist(freshSource())
      d = payload()
      sql(mutation)
      d.sourceEnvelope = JSON.parse(sql('SELECT public.atlas_analysis_source_rows(' + quote(project) + ')'))
      d.evidenceHash = binding.hashAnalysisSource(d.sourceEnvelope)
      const observed = d.sourceEnvelope.snapshots[0].observed_at
      d.freshUntil = new Date(Date.parse(observed) + 26 * 3600000).toISOString().slice(0, 19) + observed.slice(19)
      assert.equal(result(rpc(d)).status, 'conflict')
    }
    console.log('quality: unknown/failed audit, required NULL and stale source reject')

    // Exact SQL freshness predicate uses a supplied clock; RPC calls it after waits.
    assert.equal(
      sql("SELECT public.atlas_analysis_fresh('2026-10-11T10:00:00.123456Z','2026-10-12T12:00:00.123456Z')"),
      't',
    )
    assert.equal(
      sql("SELECT public.atlas_analysis_fresh('2026-10-11T10:00:00.123456Z','2026-10-12T12:00:00.123457Z')"),
      'f',
    )
    persist(freshSource())
    sql(
      "UPDATE public.handlarborsen_marketplace_snapshots SET observed_at=clock_timestamp()-interval '26 hours'+interval '4 seconds',snapshot_date=(clock_timestamp()-interval '26 hours'+interval '4 seconds')::date",
    )
    const expiring = payload(),
      expiryCount = sql('SELECT count(*) FROM public.atlas_analysis_drafts')
    const expiryHold = session('p1_expiry_hold')
    expiryHold.write('BEGIN; SELECT id FROM public.projects WHERE id=' + quote(project) + " FOR UPDATE; SELECT 'HELD';")
    await until(() => expiryHold.output().includes('HELD'), 'expiry project held')
    const expirySave = session('p1_expiry_save')
    expirySave.write('SET ROLE service_role; ' + rpc(expiring) + " SELECT 'DONE';")
    await until(
      () =>
        sql(
          "SELECT count(*) FROM pg_stat_activity WHERE application_name='p1_expiry_save' AND wait_event_type='Lock'",
        ) === '1',
      'expiry save blocked',
    )
    await until(
      () => sql('SELECT clock_timestamp()>' + quote(expiring.freshUntil) + '::timestamptz') === 't',
      'source actually expired',
    )
    expiryHold.write('COMMIT;')
    await expiryHold.finish()
    await until(() => expirySave.output().includes('DONE'), 'expiry refusal')
    assert.ok(expirySave.output().includes('conflict'))
    await expirySave.finish()
    assert.equal(sql('SELECT count(*) FROM public.atlas_analysis_drafts'), expiryCount)
    console.log('freshness: exact 26h inclusive; +1us rejected; expired during project-lock wait refuses insert')

    console.log('SQL GATE PASS')
  }
} catch (error) {
  if (owned)
    console.error(
      'OWNED CONTAINER DIAGNOSTIC',
      docker(['exec', name, 'cat', '/proc/1/comm']).stdout,
      docker(['logs', '--tail', '24', name]).stderr,
    )
  throw error
} finally {
  if (vite) await vite.close()
  if (owned) {
    const state = JSON.parse(docker(['inspect', name]).stdout)[0]
    assert.equal(state.Name, '/' + name)
    assert.equal(state.HostConfig.NetworkMode, 'none')
    assert.equal(docker(['rm', '--force', name]).status, 0)
  }
}
