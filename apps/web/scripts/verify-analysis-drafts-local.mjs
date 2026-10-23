import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, generateKeyPairSync, randomBytes, sign as signJwt } from 'node:crypto'
import assert from 'node:assert/strict'
import { orderReplayMigrations, orderLegacyMediaReplayMigrations, orderCrossTreeReplayMigrations } from './analysis-replay-order.mjs'
import {runClosedCalendarRotationProbe} from './calendar-postgrest-rotation-fixture.mjs'
import {auditNativeDefinerSurface,buildNativeDefinerCatalogQuery,reviewedNativeDefinerFingerprints} from './calendar-native-definer-surface.mjs'
import {auditCalendarTriggerChain,buildCalendarTriggerChainQuery,triggerChainFingerprints} from './calendar-trigger-chain-audit.mjs'
import {auditSchedulerRpcChain,buildSchedulerRpcChainCatalogQuery,reviewedRpcChainPins} from './calendar-worker-rpc-callchain-audit.mjs'
import {auditCalendarHelperChain,buildCalendarHelperCatalogQuery,reviewedHelperPins} from './calendar-helper-chain-audit.mjs'
import {auditMediaNewsCallees,buildMediaNewsCalleeCatalogQuery,reviewedMediaNewsPins} from './calendar-media-news-callees-audit.mjs'
import {auditMediaProvenanceTriggers,mediaProvenanceCatalogSql,mediaProvenancePins} from './calendar-media-provenance-trigger-audit.mjs'
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
const scheduleWorkerReplay = process.argv.includes('--with-schedule-worker-replay')
assert.ok(!scheduleWorkerReplay || crossTreeReplay, 'worker replay requires the cross-tree mode')
const scheduleHttpRoleReplay = process.argv.includes('--with-schedule-http-role-replay')
assert.ok(!scheduleHttpRoleReplay || crossTreeReplay, 'HTTP role replay requires the cross-tree mode')
assert.ok(!scheduleHttpRoleReplay || !scheduleWorkerReplay, 'run worker and HTTP role replays separately')
const scheduleHttpWorkerReplay = process.argv.includes('--with-schedule-http-worker-replay')
assert.ok(!scheduleHttpWorkerReplay || scheduleHttpRoleReplay, 'HTTP worker requires HTTP role replay')
const legacyMediaReplay = legacyCronReplay || legacyDreamReplay || crossTreeReplay || process.argv.includes('--mode=legacy-media-replay')
assert.ok([dependencyReplay,legacyCronReplay,legacyDreamReplay,crossTreeReplay,process.argv.includes('--mode=legacy-media-replay'),process.argv.includes('--mode=canonical-replay')].filter(Boolean).length<=1, 'select one replay mode')
const replay = dependencyReplay || legacyMediaReplay || process.argv.includes('--mode=canonical-replay')
const name = crossTreeReplay ? 'omnira-atlas-p1-cross-tree-replay' : legacyDreamReplay ? 'omnira-atlas-p1-legacy-dream-replay' : legacyCronReplay ? 'omnira-atlas-p1-legacy-cron-replay' : legacyMediaReplay ? 'omnira-atlas-p1-legacy-media-replay' : dependencyReplay ? 'omnira-atlas-p1-dependency-replay' : replay ? 'omnira-atlas-p1-canonical-replay' : 'omnira-atlas-p1-local'
const image = 'public.ecr.aws/supabase/postgres:17.11.0.004'
const restImage = 'public.ecr.aws/supabase/postgrest:v16.4'
const gatewayImage = 'node:22-bookworm'
const httpNetwork = name + '-http-net', restName = name + '-rest', gatewayName = name + '-gateway'
const docker = (args, input) =>
  spawnSync('docker', args, { encoding: 'utf8', input, timeout: 60000, maxBuffer: 8 * 1024 * 1024 })
assert.equal(docker(['image', 'inspect', image]).status, 0, 'cached image required; never pulls')
assert.notEqual(docker(['container', 'inspect', name]).status, 0, 'container name exists; refusing to touch it')
let owned = false,
  vite, networkOwned = false, restOwned = false, gatewayOwned = false
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
  if (scheduleHttpRoleReplay) {
    for (const cached of [restImage,gatewayImage])
      assert.equal(docker(['image','inspect',cached]).status,0,'cached HTTP image required: '+cached)
    for (const container of [restName,gatewayName])
      assert.notEqual(docker(['container','inspect',container]).status,0,'refusing existing container: '+container)
    assert.notEqual(docker(['network','inspect',httpNetwork]).status,0,'refusing existing network')
    const networkResult=docker(['network','create','--internal',httpNetwork])
    assert.equal(networkResult.status,0,networkResult.stderr)
    networkOwned=true
    assert.equal(JSON.parse(docker(['network','inspect',httpNetwork]).stdout)[0].Internal,true)
  }
  const r = docker([
    'run',
    '--pull=never',
    '--detach',
    '--name',
    name,
    '--network',
    scheduleHttpRoleReplay ? httpNetwork : 'none',
    ...(scheduleHttpRoleReplay ? ['--network-alias','db'] : []),
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
    ...(scheduleHttpRoleReplay ? ['-c','listen_addresses=*'] : []),
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
  assert.equal(inspection.HostConfig.NetworkMode, scheduleHttpRoleReplay ? httpNetwork : 'none')
  assert.ok(!Object.keys(inspection.HostConfig.PortBindings ?? {}).length)
  console.log(scheduleHttpRoleReplay ? 'isolation: cached images, private internal network, zero port bindings, owned containers only' : 'isolation: cached image, network none, zero port bindings, owned container only')
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
    if(crossTreeReplay) console.log('LOCAL CROSS-TREE: ten hash-pinned root files; cron launching disabled; '+(scheduleHttpRoleReplay?'private internal network':'network none')+'; diagnostic only');
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
          'publisher_claim_execute',has_function_privilege('social_schedule_full_publisher_fixture','public.social_schedule_claim(jsonb)','EXECUTE'),
          'publisher_authorize_execute',has_function_privilege('social_schedule_full_publisher_fixture','public.social_schedule_authorize_write(jsonb,jsonb)','EXECUTE'),
          'publisher_peek_execute',has_function_privilege('social_schedule_full_publisher_fixture','public.social_schedule_peek(jsonb)','EXECUTE'),
          'publisher_receipt_execute',has_function_privilege('social_schedule_full_publisher_fixture','public.social_schedule_receipt(jsonb)','EXECUTE'),
          'publisher_recover_execute',has_function_privilege('social_schedule_full_publisher_fixture','public.social_schedule_recover_checkpoint(jsonb)','EXECUTE'),
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
      for (const key of ['publisher_jobs_update','publisher_publications_insert','publisher_events_insert',
        'publisher_step_execute','publisher_claim_execute','publisher_authorize_execute',
        'publisher_peek_execute','publisher_receipt_execute','publisher_recover_execute',
        'service_manual_step_execute','service_proofs_insert'])
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
      const claimFile = reviewedBytes(resolve(web, 'lib/calendar/direct-write-gate-worker-integration-probe.sql')).toString('utf8')
      const recoveryCheckpoint = recoveryFile.slice(recoveryFile.indexOf('create or replace function public.social_schedule_recover_checkpoint'))
      assert.equal((claimFile.match(/create or replace function public\.social_schedule_claim\(/g) ?? []).length, 1)
      assert.ok(recoveryCheckpoint.startsWith('create or replace function public.social_schedule_recover_checkpoint'))
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
        unreferencedProject: '20000000-0000-4000-8000-000000000021',
        foreignPrincipal: '20000000-0000-4000-8000-000000000022',
      }
      const roleSql = `
        BEGIN;
        -- SCHEDULE_WORKER_SEED_BEGIN
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
        -- SCHEDULE_WORKER_SEED_END
        ${reviewedBytes(resolve(web, 'lib/calendar/source-revision-probe.sql')).toString('utf8')}
        INSERT INTO public.calendar_source_revision_probe(owner_user_id,project_id,revision)
          VALUES (${quote(actor)},${quote(project)},1);
        ${gate}
        ${lockedClaim}
        ${claimFile}
        ${recoveryCheckpoint}
        ${roleCandidate.toString('utf8')}
        ${reviewedBytes(resolve(web, 'lib/calendar/direct-write-gate-proof-trigger-probe.sql')).toString('utf8')}
        ${reviewedBytes(resolve(web, 'lib/calendar/direct-write-gate-proof-inspect-hardened-candidate.sql')).toString('utf8')}
        ${reviewedBytes(resolve(web, 'lib/calendar/direct-write-gate-proof-permission-candidate.sql')).toString('utf8')}
        DO $worker_grants$ BEGIN
          IF NOT has_function_privilege('social_schedule_full_publisher_fixture',
            'public.calendar_source_gate_try_begin_probe(uuid)','EXECUTE') THEN
            RAISE EXCEPTION 'WORKER_GATE_GRANT_MISSING';
          END IF;
          IF NOT has_function_privilege('social_schedule_full_publisher_fixture',
            'public.calendar_source_gate_begin_probe(uuid)','EXECUTE') THEN
            RAISE EXCEPTION 'WORKER_LOCK_GATE_GRANT_MISSING';
          END IF;
          IF has_column_privilege('social_schedule_full_publisher_fixture',
            'public.projects','name','UPDATE') THEN
            RAISE EXCEPTION 'WORKER_PROJECT_NAME_GRANT_TOO_BROAD';
          END IF;
        END $worker_grants$;
        INSERT INTO public.projects(id,owner_id,name,slug)
          VALUES (${quote(id.unreferencedProject)},${quote(actor)},'Unreferenced key probe','calendar-key-probe-only');
        SET LOCAL ROLE social_schedule_full_publisher_fixture;
        DO $project_key_guard$ BEGIN
          UPDATE public.projects SET id=gen_random_uuid() WHERE id=${quote(id.unreferencedProject)}::uuid;
          RAISE EXCEPTION 'WORKER_PROJECT_KEY_WRITE_ACCEPTED';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM IS DISTINCT FROM 'SOCIAL_SCHEDULE_PROJECT_KEY_WRITE_DENIED' THEN RAISE; END IF;
        END $project_key_guard$;
        RESET ROLE;
        GRANT EXECUTE ON FUNCTION public.calendar_source_gate_begin_probe(uuid)
          TO social_schedule_full_publisher_fixture;
        SAVEPOINT synthetic_claim_probe;
        DO $seed_claim$ BEGIN
          PERFORM public.calendar_source_gate_begin_probe(${quote(project)}::uuid);
        END $seed_claim$;
        UPDATE public.social_schedule_jobs SET state='queued',claim_id=null,worker_id=null,lease_expires_at=null
          WHERE id=${quote(id.job)}::uuid;
        SET LOCAL ROLE social_schedule_full_publisher_fixture;
        DO $read_worker_path$ DECLARE peeked jsonb; receipt jsonb; BEGIN
          peeked=public.social_schedule_peek(jsonb_build_object('projectIds',jsonb_build_array(${quote(project)})));
          receipt=public.social_schedule_receipt(jsonb_build_object('jobId',${quote(id.job)}));
          IF receipt->>'jobState' IS DISTINCT FROM 'queued' THEN
            RAISE EXCEPTION 'SYNTHETIC_RECEIPT_NOT_QUEUED: %',receipt;
          END IF;
          IF peeked IS NULL THEN RAISE EXCEPTION 'SYNTHETIC_PEEK_UNAVAILABLE'; END IF;
        END $read_worker_path$;
        RESET ROLE;
        REVOKE EXECUTE ON FUNCTION public.calendar_source_gate_try_begin_probe(uuid)
          FROM social_schedule_full_publisher_fixture;
        SET LOCAL ROLE social_schedule_full_publisher_fixture;
        DO $claim_missing_gate$ BEGIN
          PERFORM public.social_schedule_claim(jsonb_build_object(
            'workerId','probe-worker','now',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'dryRun',false,'projectIds',jsonb_build_array(${quote(project)})));
          RAISE EXCEPTION 'CLAIM_WITHOUT_GATE_GRANT_ACCEPTED';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM NOT LIKE '%permission denied for function calendar_source_gate_try_begin_probe%' THEN RAISE; END IF;
        END $claim_missing_gate$;
        RESET ROLE;
        GRANT EXECUTE ON FUNCTION public.calendar_source_gate_try_begin_probe(uuid)
          TO social_schedule_full_publisher_fixture;
        REVOKE EXECUTE ON FUNCTION public.social_schedule_authorize_write(jsonb,jsonb)
          FROM social_schedule_full_publisher_fixture;
        SET LOCAL ROLE social_schedule_full_publisher_fixture;
        DO $authorize_missing_grant$ BEGIN
          PERFORM public.social_schedule_authorize_write(
            jsonb_build_object('jobId',${quote(id.job)},'claimId',${quote(id.claim)},'version',1),
            jsonb_build_array(${quote(project)}));
          RAISE EXCEPTION 'AUTHORIZE_WITHOUT_GRANT_ACCEPTED';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM NOT LIKE '%permission denied for function social_schedule_authorize_write%' THEN RAISE; END IF;
        END $authorize_missing_grant$;
        RESET ROLE;
        GRANT EXECUTE ON FUNCTION public.social_schedule_authorize_write(jsonb,jsonb)
          TO social_schedule_full_publisher_fixture;
        SET LOCAL ROLE social_schedule_full_publisher_fixture;
        DO $claim_to_recovery$ DECLARE result jsonb; BEGIN
          result=public.social_schedule_claim(jsonb_build_object(
            'workerId','probe-worker','now',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'dryRun',false,'projectIds',jsonb_build_array(${quote(project)})));
          IF result->>'jobId' IS DISTINCT FROM ${quote(id.job)} OR result->>'version' IS DISTINCT FROM '2'
            THEN RAISE EXCEPTION 'SYNTHETIC_CLAIM_NOT_RECORDED: %',result; END IF;
          PERFORM public.social_schedule_authorize_write(
            jsonb_build_object('jobId',result->>'jobId','claimId',result->>'claimId','version',2),
            jsonb_build_array(${quote(project)}));
          PERFORM public.social_schedule_step(
            jsonb_build_object('jobId',result->>'jobId','claimId',result->>'claimId','version',2),
            '{"action":"prepare"}'::jsonb
          );
          PERFORM public.social_schedule_step(
            jsonb_build_object('jobId',result->>'jobId','claimId',result->>'claimId','version',3),
            jsonb_build_object('action','claim_create','expectedVersion',1,'capabilityHash',${quote('e'.repeat(64))})
          );
          PERFORM public.social_schedule_authorize_write(
            jsonb_build_object('jobId',result->>'jobId','claimId',result->>'claimId','version',4),
            jsonb_build_array(${quote(project)}));
          PERFORM public.social_schedule_recover_checkpoint(
            jsonb_build_object('jobId',result->>'jobId','claimId',result->>'claimId','version',4)
          );
          IF NOT EXISTS (
            SELECT 1 FROM public.social_schedule_jobs j JOIN public.social_publications p ON p.id=j.publication_id
            WHERE j.id=${quote(id.job)}::uuid AND j.state='uncertain' AND j.version=5
              AND p.state='uncertain' AND p.failure_code='receipt_unavailable' AND p.version=3
              AND j.claim_id::text=result->>'claimId'
          ) THEN RAISE EXCEPTION 'CLAIM_TO_RECOVERY_NOT_RECORDED'; END IF;
        END $claim_to_recovery$;
        RESET ROLE;
        DO $claim_source_revision$ BEGIN
          IF (SELECT revision FROM public.calendar_source_revision_probe WHERE project_id=${quote(project)}::uuid)<>9
            THEN RAISE EXCEPTION 'CLAIM_TO_RECOVERY_SOURCE_REVISION_NOT_BUMPED'; END IF;
        END $claim_source_revision$;
        ROLLBACK TO SAVEPOINT synthetic_claim_probe;
        SET LOCAL ROLE service_role;
        DO $deny_service$ BEGIN
          UPDATE public.social_schedule_jobs SET reason='forbidden' WHERE id=${quote(id.job)}::uuid;
          RAISE EXCEPTION 'DIRECT_SERVICE_WRITE_ACCEPTED';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM NOT LIKE '%permission denied%' THEN RAISE; END IF;
        END $deny_service$;
        RESET ROLE;
        SET LOCAL ROLE social_schedule_full_publisher_fixture;
        DO $deny_project_edit$ BEGIN
          UPDATE public.projects SET name='forbidden' WHERE id=${quote(project)}::uuid;
          RAISE EXCEPTION 'PROJECT_NAME_WRITE_ACCEPTED';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM NOT LIKE '%permission denied for table projects%' THEN RAISE; END IF;
        END $deny_project_edit$;
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
        SAVEPOINT synthetic_receipt_probe;
        DO $receipt$ BEGIN
          PERFORM public.social_schedule_step(
            jsonb_build_object('jobId',${quote(id.job)},'claimId',${quote(id.claim)},'version',2),
            jsonb_build_object('action','claim_create','expectedVersion',1,'capabilityHash',${quote('e'.repeat(64))})
          );
          BEGIN
            PERFORM public.social_schedule_step(
              jsonb_build_object('jobId',${quote(id.job)},'claimId',${quote(id.claim)},'version',3),
              '{"action":"complete","expectedVersion":2,"providerId":"invalid"}'::jsonb
            );
            RAISE EXCEPTION 'INVALID_RECEIPT_ACCEPTED';
          EXCEPTION WHEN raise_exception THEN
            IF SQLERRM <> 'SOCIAL_SCHEDULE_INVALID_BODY' THEN RAISE; END IF;
          END;
          PERFORM public.social_schedule_step(
            jsonb_build_object('jobId',${quote(id.job)},'claimId',${quote(id.claim)},'version',3),
            '{"action":"complete","expectedVersion":2,"providerId":"12345_99999","permalink":"https://www.facebook.com/12345/posts/99999"}'::jsonb
          );
          IF NOT EXISTS (
            SELECT 1 FROM public.social_schedule_jobs j
            JOIN public.social_publications p ON p.id=j.publication_id
            WHERE j.id=${quote(id.job)}::uuid AND j.state='published' AND j.version=4
              AND p.state='published' AND p.provider_id='12345_99999' AND p.version=3
          ) THEN RAISE EXCEPTION 'SYNTHETIC_RECEIPT_NOT_RECORDED'; END IF;
        END $receipt$;
        ROLLBACK TO SAVEPOINT synthetic_receipt_probe;
        SAVEPOINT synthetic_recovery_probe;
        DO $recover$ BEGIN
          PERFORM public.social_schedule_step(
            jsonb_build_object('jobId',${quote(id.job)},'claimId',${quote(id.claim)},'version',2),
            jsonb_build_object('action','claim_create','expectedVersion',1,'capabilityHash',${quote('e'.repeat(64))})
          );
          PERFORM public.social_schedule_recover_checkpoint(
            jsonb_build_object('jobId',${quote(id.job)},'claimId',${quote(id.claim)},'version',3)
          );
          IF NOT EXISTS (
            SELECT 1 FROM public.social_schedule_jobs j JOIN public.social_publications p ON p.id=j.publication_id
            WHERE j.id=${quote(id.job)}::uuid AND j.state='uncertain' AND j.version=4
              AND p.state='uncertain' AND p.failure_code='receipt_unavailable' AND p.version=3
          ) THEN RAISE EXCEPTION 'SYNTHETIC_RECOVERY_NOT_RECORDED'; END IF;
        END $recover$;
        ROLLBACK TO SAVEPOINT synthetic_recovery_probe;
        SAVEPOINT synthetic_reconciliation_probe;
        DO $uncertain$ BEGIN
          PERFORM public.social_schedule_step(
            jsonb_build_object('jobId',${quote(id.job)},'claimId',${quote(id.claim)},'version',2),
            jsonb_build_object('action','claim_create','expectedVersion',1,'capabilityHash',${quote('e'.repeat(64))})
          );
          PERFORM public.social_schedule_step(
            jsonb_build_object('jobId',${quote(id.job)},'claimId',${quote(id.claim)},'version',3),
            '{"action":"uncertain","expectedVersion":2,"failureCode":"receipt_unavailable"}'::jsonb
          );
        END $uncertain$;
        RESET ROLE;
        SET LOCAL ROLE service_role;
        DO $deny_proof$ BEGIN
          INSERT INTO public.social_publication_reconciliation_proofs(
            publication_id,project_id,revision_id,revision_sha256,reviewed_asset_sha256,candidate,candidate_hash,version
          ) VALUES ((SELECT publication_id FROM public.social_schedule_jobs WHERE id=${quote(id.job)}::uuid),
            ${quote(project)},${quote(id.revision)},${quote('b'.repeat(64))},${quote('d'.repeat(64))},'{}',${quote('f'.repeat(64))},3);
          RAISE EXCEPTION 'DIRECT_PROOF_WRITE_ACCEPTED';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM NOT LIKE '%permission denied%' THEN RAISE; END IF;
        END $deny_proof$;
        DO $inspect$ DECLARE result jsonb; BEGIN
          result=public.social_publication_reconciliation_inspect(
            jsonb_build_object('userId',${quote(actor)},'allowedProjectIds',jsonb_build_array(${quote(project)})),
            jsonb_build_object('projectId',${quote(project)},'postId',${quote(id.post)},
              'publicationId',(SELECT publication_id FROM public.social_schedule_jobs WHERE id=${quote(id.job)}::uuid),
              'candidates',jsonb_build_array(jsonb_build_object(
                'id','12345_99999','providerId','12345_99999','accountId','12345',
                'createdAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                'text','Synthetic caption','permalink','https://www.facebook.com/12345/posts/99999',
                'photoId','888','imageUrl','https://scontent.fna.fbcdn.net/fixture.jpg',
                'candidateHash',${quote('f'.repeat(64))})))
          );
          IF jsonb_array_length(result->'proofs')<>1 THEN RAISE EXCEPTION 'SYNTHETIC_PROOF_MISSING'; END IF;
        END $inspect$;
        RESET ROLE;
        DO $proof_revision$ BEGIN
          IF (SELECT revision FROM public.calendar_source_revision_probe WHERE project_id=${quote(project)}::uuid)<>8
            THEN RAISE EXCEPTION 'PROOF_SOURCE_REVISION_NOT_BUMPED'; END IF;
        END $proof_revision$;
        ROLLBACK TO SAVEPOINT synthetic_reconciliation_probe;
        SET LOCAL ROLE social_schedule_full_publisher_fixture;
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
      `
      const roleResult = JSON.parse(sql(roleSql))
      assert.deepEqual(roleResult, { state:'blocked', version:3, source_revision:4, prepare_events:1, checkpoint_events:1, publications:1 })
      assert.equal(sql("SELECT count(*) FROM public.projects WHERE id=" + quote(project)), '0', 'synthetic project escaped rollback')
      console.log('CROSS-TREE SCHEDULE GATE ' + JSON.stringify(roleResult) + ' (continuous synthetic claim-to-recovery, revocation, receipt and fabricated reconciliation proof branches rolled back; no provider call)')
      const seedStart = '-- SCHEDULE_WORKER_SEED_BEGIN'
      const seedEnd = '-- SCHEDULE_WORKER_SEED_END'
      assert.equal(roleSql.split(seedStart).length, 2)
      assert.equal(roleSql.split(seedEnd).length, 2)
      const seed = roleSql.split(seedStart)[1].split(seedEnd)[0]
      const rpcOnlyCandidate = reviewedBytes(resolve(web, 'lib/calendar/scheduled-rpc-only-role-probe.sql')).toString('utf8')
      const rpcOnly = JSON.parse(sql(`
        BEGIN;
        ${seed}
        ${reviewedBytes(resolve(web, 'lib/calendar/source-revision-probe.sql')).toString('utf8')}
        INSERT INTO public.calendar_source_revision_probe(owner_user_id,project_id,revision)
          VALUES (${quote(actor)},${quote(project)},1);
        ${gate}
        ${lockedClaim}
        ${claimFile}
        ${recoveryCheckpoint}
        ${rpcOnlyCandidate}
        INSERT INTO public.social_schedule_rpc_scope_fixture(principal_id,project_id)
          VALUES (${quote(actor)},${quote(project)}),(${quote(id.foreignPrincipal)},${quote(id.unreferencedProject)});
        INSERT INTO public.projects(id,owner_id,name,slug)
          VALUES (${quote(id.unreferencedProject)},${quote(actor)},'Out-of-scope project','rpc-scope-denial');
        DO $queue_rpc$ BEGIN
          PERFORM public.calendar_source_gate_begin_probe(${quote(project)}::uuid);
        END $queue_rpc$;
        UPDATE public.social_schedule_jobs
          SET state='queued',claim_id=null,worker_id=null,lease_expires_at=null
          WHERE id=${quote(id.job)}::uuid;
        DO $claims$ BEGIN
          PERFORM set_config('request.jwt.claims',${quote(JSON.stringify({sub:actor,iss:'omnira-schedule-fixture',aud:'authenticated'}))},true);
        END $claims$;
        DO $assert_privileges$ DECLARE privilege text; relation text; BEGIN
          IF (SELECT rolbypassrls OR rolcanlogin FROM pg_roles WHERE rolname='social_schedule_rpc_only_fixture')
            THEN RAISE EXCEPTION 'RPC_ROLE_NOT_ISOLATED'; END IF;
          FOREACH relation IN ARRAY ARRAY['social_schedule_jobs','social_publications',
            'social_schedule_events','social_publication_events','projects','platform_tokens'] LOOP
            FOREACH privilege IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
              IF has_table_privilege('social_schedule_rpc_only_fixture','public.'||relation,privilege)
                THEN RAISE EXCEPTION 'RPC_DIRECT_DML_GRANT: %.%',relation,privilege; END IF;
            END LOOP;
          END LOOP;
          -- The callable scheduler role must learn job/account state only
          -- through scoped RPCs, never through a direct table GET.
          FOREACH relation IN ARRAY ARRAY[
            'projects','social_schedule_jobs','social_publications',
            'social_schedule_events','social_publication_events',
            'social_schedule_batches','social_schedule_decisions',
            'social_publication_reconciliation_proofs','social_content_posts',
            'social_content_revisions'
          ] LOOP
            IF has_table_privilege('social_schedule_rpc_only_fixture','public.'||relation,'SELECT')
              THEN RAISE EXCEPTION 'RPC_DIRECT_READ_GRANT: %',relation; END IF;
          END LOOP;
          IF has_table_privilege('social_schedule_rpc_only_fixture','public.platform_tokens','SELECT')
            THEN RAISE EXCEPTION 'RPC_TOKEN_READ_GRANT'; END IF;
          IF has_table_privilege('social_schedule_rpc_only_fixture','public.assets','SELECT')
            THEN RAISE EXCEPTION 'RPC_ASSET_READ_GRANT'; END IF;
          IF has_table_privilege('social_schedule_rpc_only_fixture','public.social_schedule_rpc_scope_fixture','SELECT')
            OR has_table_privilege('social_schedule_rpc_only_fixture','public.social_schedule_rpc_scope_fixture','INSERT')
            THEN RAISE EXCEPTION 'RPC_SCOPE_TABLE_GRANT'; END IF;
          IF has_function_privilege('social_schedule_rpc_only_fixture',
            'public.social_schedule_claim_unchecked_fixture(jsonb)','EXECUTE')
            THEN RAISE EXCEPTION 'RPC_UNCHECKED_FUNCTION_GRANT'; END IF;
        END $assert_privileges$;
        SET LOCAL ROLE social_schedule_rpc_only_fixture;
        DO $deny_missing_subject$ BEGIN
          PERFORM set_config('request.jwt.claims','{}',true);
          PERFORM public.social_schedule_peek(jsonb_build_object('projectIds',jsonb_build_array(${quote(project)})));
          RAISE EXCEPTION 'RPC_MISSING_SUBJECT_ACCEPTED';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM <> 'SOCIAL_SCHEDULE_PROJECT_SCOPE_DENIED' THEN RAISE; END IF;
        END $deny_missing_subject$;
        DO $deny_wrong_issuer$ BEGIN
          PERFORM set_config('request.jwt.claims',${quote(JSON.stringify({sub:actor,iss:'unexpected-issuer',aud:'authenticated'}))},true);
          PERFORM public.social_schedule_peek(jsonb_build_object('projectIds',jsonb_build_array(${quote(project)})));
          RAISE EXCEPTION 'RPC_WRONG_ISSUER_ACCEPTED';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM <> 'SOCIAL_SCHEDULE_PROJECT_SCOPE_DENIED' THEN RAISE; END IF;
        END $deny_wrong_issuer$;
        DO $deny_invalid_sub$ BEGIN
          PERFORM set_config('request.jwt.claims',${quote(JSON.stringify({sub:'not-a-uuid',iss:'omnira-schedule-fixture',aud:'authenticated'}))},true);
          PERFORM public.social_schedule_peek(jsonb_build_object('projectIds',jsonb_build_array(${quote(project)})));
          RAISE EXCEPTION 'RPC_INVALID_SUB_ACCEPTED';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM <> 'SOCIAL_SCHEDULE_PROJECT_SCOPE_DENIED' THEN RAISE; END IF;
        END $deny_invalid_sub$;
        DO $claims_again$ BEGIN
          PERFORM set_config('request.jwt.claims',${quote(JSON.stringify({sub:id.foreignPrincipal,iss:'omnira-schedule-fixture',aud:'authenticated'}))},true);
        END $claims_again$;
        DO $deny_other_subject$ BEGIN
          PERFORM public.social_schedule_receipt(jsonb_build_object('jobId',${quote(id.job)}));
          RAISE EXCEPTION 'RPC_OTHER_SUBJECT_RECEIPT_ACCEPTED';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM <> 'SOCIAL_SCHEDULE_PROJECT_SCOPE_DENIED' THEN RAISE; END IF;
        END $deny_other_subject$;
        DO $foreign_scope$ BEGIN
          IF public.social_schedule_peek(jsonb_build_object('projectIds',jsonb_build_array(${quote(id.unreferencedProject)}))) IS NULL
            THEN RAISE EXCEPTION 'RPC_FOREIGN_SUBJECT_SCOPE_FAILED'; END IF;
          PERFORM set_config('request.jwt.claims',${quote(JSON.stringify({sub:actor,iss:'omnira-schedule-fixture',aud:'authenticated'}))},true);
        END $foreign_scope$;
        DO $deny_other_project$ BEGIN
          PERFORM public.social_schedule_claim(jsonb_build_object(
            'workerId','probe-worker','now',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'dryRun',false,'projectIds',jsonb_build_array(${quote(id.unreferencedProject)})));
          RAISE EXCEPTION 'RPC_OTHER_PROJECT_CLAIM_ACCEPTED';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM <> 'SOCIAL_SCHEDULE_PROJECT_SCOPE_DENIED' THEN RAISE; END IF;
        END $deny_other_project$;
        DO $deny_other_peek$ BEGIN
          PERFORM public.social_schedule_peek(jsonb_build_object('projectIds',jsonb_build_array(${quote(id.unreferencedProject)})));
          RAISE EXCEPTION 'RPC_OTHER_PROJECT_PEEK_ACCEPTED';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM <> 'SOCIAL_SCHEDULE_PROJECT_SCOPE_DENIED' THEN RAISE; END IF;
        END $deny_other_peek$;
        DO $deny_direct$ BEGIN
          UPDATE public.social_schedule_jobs SET reason='forbidden' WHERE id=${quote(id.job)}::uuid;
          RAISE EXCEPTION 'RPC_DIRECT_WRITE_ACCEPTED';
        EXCEPTION WHEN insufficient_privilege THEN
          IF SQLERRM NOT LIKE '%permission denied%' THEN RAISE; END IF;
        END $deny_direct$;
        DO $rpc_flow$ DECLARE result jsonb; receipt jsonb; BEGIN
          receipt=public.social_schedule_receipt(jsonb_build_object('jobId',${quote(id.job)}));
          IF receipt->>'jobState' IS DISTINCT FROM 'queued' THEN RAISE EXCEPTION 'RPC_RECEIPT_FAILED: %',receipt; END IF;
          IF public.social_schedule_peek(jsonb_build_object('projectIds',jsonb_build_array(${quote(project)}))) IS NULL
            THEN RAISE EXCEPTION 'RPC_PEEK_FAILED'; END IF;
          result=public.social_schedule_claim(jsonb_build_object(
            'workerId','probe-worker','now',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'dryRun',false,'projectIds',jsonb_build_array(${quote(project)})));
          IF result->>'jobId' IS DISTINCT FROM ${quote(id.job)} OR result->>'version' IS DISTINCT FROM '2'
            THEN RAISE EXCEPTION 'RPC_CLAIM_FAILED: %',result; END IF;
          PERFORM public.social_schedule_authorize_write(
            jsonb_build_object('jobId',result->>'jobId','claimId',result->>'claimId','version',2),
            jsonb_build_array(${quote(project)}));
          PERFORM public.social_schedule_step(
            jsonb_build_object('jobId',result->>'jobId','claimId',result->>'claimId','version',2),
            '{"action":"prepare"}'::jsonb);
          PERFORM public.social_schedule_step(
            jsonb_build_object('jobId',result->>'jobId','claimId',result->>'claimId','version',3),
            jsonb_build_object('action','claim_create','expectedVersion',1,'capabilityHash',${quote('e'.repeat(64))}));
          PERFORM public.social_schedule_recover_checkpoint(
            jsonb_build_object('jobId',result->>'jobId','claimId',result->>'claimId','version',4));
        END $rpc_flow$;
        RESET ROLE;
        SELECT jsonb_build_object(
          'state',(SELECT state FROM public.social_schedule_jobs WHERE id=${quote(id.job)}),
          'version',(SELECT version FROM public.social_schedule_jobs WHERE id=${quote(id.job)}),
          'publications',(SELECT count(*) FROM public.social_publications WHERE project_id=${quote(project)}));
        ROLLBACK;
      `))
      assert.deepEqual(rpcOnly, {state:'uncertain',version:5,publications:1})
      assert.equal(sql("SELECT count(*) FROM pg_roles WHERE rolname='social_schedule_rpc_only_fixture'"), '0', 'RPC role escaped rollback')
      console.log('CROSS-TREE RPC-ONLY ROLE PASS ' + JSON.stringify(rpcOnly) + ' (rolled back)')
      if (scheduleHttpRoleReplay) {
        const password='Synthetic-'+randomBytes(12).toString('hex')
        // A private signing key lives ONLY in this local replay runner's memory.
        // PostgREST receives a public JWKS; the worker receives short-lived tokens.
        const keys=generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:0x10001})
        const fixtureKid='calendar-rpc-ephemeral-v1'
        const publicJwk={...keys.publicKey.export({format:'jwk'}),alg:'RS256',kid:fixtureKid,use:'sig',key_ops:['verify']}
        const publicJwks=JSON.stringify({keys:[publicJwk]})
        // A distinct, administrator-bound synthetic platform operator.
        // The scheduler/broker/reviewer principals never inherit this mapping.
        const operatorSubject='b6718615-5cf3-4833-bceb-2fb79cb53d9b'
        const nativeOperatorSession='a3226219-64b1-4c69-a6f9-781ed5f45a80'
        const nativeNonOperatorSession='a3226219-64b1-4c69-a6f9-781ed5f45a81'
        const nativeExpiredSession='a3226219-64b1-4c69-a6f9-781ed5f45a82'
        sql(`BEGIN;
          ${seed}
          ${reviewedBytes(resolve(web, 'lib/calendar/source-revision-probe.sql')).toString('utf8')}
          INSERT INTO public.calendar_source_revision_probe(owner_user_id,project_id,revision)
            VALUES (${quote(actor)},${quote(project)},1);
          ${gate}
          ${lockedClaim}
          ${claimFile}
          ${recoveryCheckpoint}
          ${rpcOnlyCandidate}
          ${reviewedBytes(resolve(web,'lib/calendar/scheduled-broker-durable-intent-probe.sql')).toString('utf8')}
          ${reviewedBytes(resolve(web,'lib/calendar/scheduled-broker-review-queue-probe.sql')).toString('utf8')}
          ${reviewedBytes(resolve(web,'lib/calendar/scheduled-operator-review-audit-probe.sql')).toString('utf8')}
          ${reviewedBytes(resolve(web,'lib/calendar/scheduled-operator-review-history-probe.sql')).toString('utf8')}
          ${reviewedBytes(resolve(web,'lib/calendar/scheduled-authenticated-operator-role-probe.sql')).toString('utf8')}
          INSERT INTO public.social_schedule_rpc_scope_fixture(principal_id,project_id)
            VALUES (${quote(actor)},${quote(project)}),(${quote(id.foreignPrincipal)},${quote(id.unreferencedProject)}),
              (${quote(operatorSubject)},${quote(project)});
          INSERT INTO public.social_schedule_operator_scope_fixture(operator_id,project_id,active)
            VALUES (${quote(operatorSubject)},${quote(project)},true);
          -- Synthetic native GoTrue session proof, no real Auth user/session.
          INSERT INTO auth.users(id) VALUES
            (${quote(operatorSubject)}::uuid) ON CONFLICT(id) DO NOTHING;
          INSERT INTO auth.sessions(id,user_id,not_after) VALUES
            (${quote(nativeOperatorSession)}::uuid,${quote(operatorSubject)}::uuid,now()+interval '1 hour'),
            (${quote(nativeNonOperatorSession)}::uuid,${quote(actor)}::uuid,now()+interval '1 hour'),
            (${quote(nativeExpiredSession)}::uuid,${quote(operatorSubject)}::uuid,now()-interval '5 minutes')
          ON CONFLICT(id) DO NOTHING;
          INSERT INTO public.projects(id,owner_id,name,slug)
            VALUES (${quote(id.unreferencedProject)},${quote(actor)},'HTTP foreign project','http-scope-denial');
          DO $queue_http$ BEGIN PERFORM public.calendar_source_gate_begin_probe(${quote(project)}::uuid); END $queue_http$;
          UPDATE public.social_schedule_jobs
            SET state='queued',claim_id=null,worker_id=null,lease_expires_at=null
            WHERE id=${quote(id.job)}::uuid;
          ALTER ROLE authenticator PASSWORD ${quote(password)};
          GRANT social_schedule_rpc_only_fixture TO authenticator;
          GRANT social_schedule_broker_intent_fixture TO authenticator;
          GRANT social_schedule_broker_review_fixture TO authenticator;
          GRANT social_schedule_operator_review_fixture TO authenticator;
          COMMIT;`)
        // This is a strict, review-scoped catalog audit. PL/pgSQL body
        // dependencies are not exhaustively represented by pg_depend; compare
        // visible source references, object privileges, owner and body hashes.
        const nativeAuditQuery=buildNativeDefinerCatalogQuery()
        const nativeAuditSnapshot=JSON.parse(sql(nativeAuditQuery))
        const nativeAudit=auditNativeDefinerSurface(nativeAuditSnapshot,{fingerprints:reviewedNativeDefinerFingerprints,requireFingerprints:true})
        console.log('CROSS-TREE NATIVE OPERATOR DEFINER SNAPSHOT '+JSON.stringify(nativeAudit))
        const callableSurface=JSON.parse(sql(`WITH executable AS (
          SELECT p.oid,p.prosecdef,pg_get_function_result(p.oid) AS result_type
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public'
            AND has_schema_privilege('social_schedule_rpc_only_fixture',n.oid,'USAGE')
            AND has_function_privilege('social_schedule_rpc_only_fixture',p.oid,'EXECUTE')
        ) SELECT jsonb_build_object(
          'publicFunctions',(SELECT count(*) FROM executable),
          'securityDefiners',(SELECT count(*) FROM executable WHERE prosecdef),
          'triggerFunctions',(SELECT count(*) FROM executable WHERE result_type='trigger'),
          'rpcDefiners',(SELECT coalesce(jsonb_agg(signature ORDER BY signature),'[]'::jsonb) FROM (
            SELECT oid::regprocedure::text AS signature FROM executable
              WHERE prosecdef AND result_type<>'trigger') callable),
          'otherCallable',(SELECT coalesce(jsonb_agg(entry ORDER BY entry->>'signature'),'[]'::jsonb) FROM (
            SELECT jsonb_build_object('signature',oid::regprocedure::text,'result',result_type) AS entry
              FROM executable WHERE NOT prosecdef AND result_type<>'trigger') others),
          'definerSample',(SELECT coalesce(jsonb_agg(signature),'[]'::jsonb) FROM (
            SELECT oid::regprocedure::text AS signature FROM executable WHERE prosecdef
              ORDER BY oid::regprocedure::text LIMIT 25) sample)
        );`))
        assert.deepEqual(callableSurface.rpcDefiners,[
          'social_schedule_authorize_write(jsonb,jsonb)','social_schedule_claim(jsonb)',
          'social_schedule_peek(jsonb)','social_schedule_receipt(jsonb)',
          'social_schedule_recover_checkpoint(jsonb)','social_schedule_step(jsonb,jsonb)',
        ],'unexpected callable SECURITY DEFINER function under schedule role')
        assert.deepEqual(callableSurface.otherCallable,[
          {signature:'action_phase_rank(text)',result:'integer'},
          {signature:'media_job_state_rank(text)',result:'integer'},
        ],'unexpected callable SECURITY INVOKER function under schedule role')
        assert.equal(callableSurface.triggerFunctions,32,'trigger-function surface changed; inspect the callable inventory')
        console.log('CROSS-TREE RPC ROLE CALLABLE SURFACE '+JSON.stringify(callableSurface)+' (catalog diagnostic; does not review function bodies)')
        const triggerSurface=JSON.parse(sql(`SELECT coalesce(jsonb_agg(jsonb_build_object(
          'table',c.relname,'trigger',t.tgname,'enabled',t.tgenabled,'eventBits',t.tgtype,
          'function',p.oid::regprocedure::text,'definer',p.prosecdef,
          'owner',pg_get_userbyid(p.proowner),'searchPath',coalesce(to_jsonb(p.proconfig),'[]'::jsonb))
          ORDER BY c.relname,t.tgname),'[]'::jsonb)
          FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            JOIN pg_proc p ON p.oid=t.tgfoid
          WHERE n.nspname='public' AND NOT t.tgisinternal
            AND c.relname=ANY(ARRAY[
              'projects','social_schedule_jobs','social_publications',
              'social_schedule_events','social_publication_events',
              'social_publication_reconciliation_proofs','calendar_source_revision_probe'
            ]);`))
        console.log('CROSS-TREE RPC TRIGGER SURFACE '+JSON.stringify(triggerSurface)+' (diagnostic; code not yet reviewed)')
        // Snapshot the actual trigger graph at the privileged worker's write tables.
        // New/retargeted triggers must be reviewed before any role or credential cutover.
        assert.deepEqual(triggerSurface.map(({table,trigger,function:fn,definer})=>[table,trigger,fn,definer]),[
          ['projects','project_lifecycle_resume_guard','project_lifecycle_resume_guard()',true],
          ['projects','stop_guard_projects','stop_guard_projects()',false],
          ['projects','survival_input_epoch_bump','survival_input_epoch_bump()',true],
          ['projects','survival_input_epoch_bump_population','survival_input_epoch_bump()',true],
          ['projects','survival_input_truncate_refused','survival_input_truncate_refused()',true],
          ['social_publication_events','social_publication_events_immutable','social_launch_immutable()',false],
          ['social_publication_events','social_publication_events_no_truncate','social_launch_immutable()',false],
          ['social_publications','calendar_gate_publications_after_probe','calendar_source_gate_bump_probe()',true],
          ['social_publications','calendar_gate_publications_before_probe','calendar_source_gate_assert_probe()',true],
          ['social_schedule_events','social_schedule_events_immutable','social_launch_immutable()',false],
          ['social_schedule_events','social_schedule_events_no_truncate','social_launch_immutable()',false],
          ['social_schedule_jobs','calendar_gate_jobs_after_probe','calendar_source_gate_bump_probe()',true],
          ['social_schedule_jobs','calendar_gate_jobs_before_probe','calendar_source_gate_assert_probe()',true],
        ],'scheduled RPC trigger map changed: review all trigger events and bodies before cutover')
        assert.ok(triggerSurface.every(t=>t.enabled==='O' &&
          t.owner==='supabase_admin' && t.searchPath.length===1 &&
          t.searchPath[0]==='search_path=""'),
          'scheduled RPC trigger execution mode, owner or search_path changed')
        // pg_trigger bitmask: ROW=1, BEFORE=2, INSERT=4, DELETE=8,
        // UPDATE=16, TRUNCATE=32. Verify that protected writes still fire
        // the signed gate and that append-only events cannot be rewritten.
        assert.deepEqual(triggerSurface.filter(t=>t.table!=='projects')
          .map(t=>[t.table,t.trigger,t.eventBits]),[
          ['social_publication_events','social_publication_events_immutable',27],
          ['social_publication_events','social_publication_events_no_truncate',34],
          ['social_publications','calendar_gate_publications_after_probe',29],
          ['social_publications','calendar_gate_publications_before_probe',31],
          ['social_schedule_events','social_schedule_events_immutable',27],
          ['social_schedule_events','social_schedule_events_no_truncate',34],
          ['social_schedule_jobs','calendar_gate_jobs_after_probe',29],
          ['social_schedule_jobs','calendar_gate_jobs_before_probe',31],
        ],'scheduled RPC trigger events/timing changed')
        const triggerChainSnapshot=JSON.parse(sql(buildCalendarTriggerChainQuery()))
        const triggerChain=auditCalendarTriggerChain(triggerChainSnapshot,{expected:triggerChainFingerprints,requireFingerprints:true})
        console.log('CROSS-TREE TRIGGER CHAIN PASS '+JSON.stringify({triggerCount:triggerChain.triggers.length,callbackCount:triggerChain.functions.length,gate:triggerChain.gate.sha256,boundedStaticAudit:true})+' (15 trigger definitions, 8 callback bodies, 1 source revision/HMAC gate pinned; static only)')
        const workerRpcCatalog=JSON.parse(sql(buildSchedulerRpcChainCatalogQuery()))
        const workerRpcAudit=auditSchedulerRpcChain(workerRpcCatalog,{pins:reviewedRpcChainPins,requirePins:true})
        console.log('CROSS-TREE WORKER RPC CHAIN PASS '+JSON.stringify({reviewedFunctions:workerRpcAudit.reviewedPrivilegedBodies.length,exposedRpcs:workerRpcAudit.exposedWorkerRpcs.length,uncheckedFunctions:workerRpcAudit.privilegedUncheckedBodies,scopeGuards:workerRpcAudit.scopeGuards,reviewedStaticReferences:workerRpcAudit.reviewedPrivilegedBodies.reduce((n,x)=>n+x.references.length,0)})+' (pinned body hashes, exact direct calls/references, definer owner and grants)')
        const nextHopCatalog=JSON.parse(sql(buildCalendarHelperCatalogQuery()))
        const nextHopAudit=auditCalendarHelperChain(nextHopCatalog,{pins:reviewedHelperPins,requirePins:true})
        console.log('CROSS-TREE HELPER CHAIN PASS '+JSON.stringify({helperCount:nextHopAudit.functions.length,invokerHelpers:nextHopAudit.invokerHelpers,privilegedHelpers:nextHopAudit.privilegedHelpers,referenceCount:nextHopAudit.functions.reduce((sum,x)=>sum+x.references.length,0),directCallCount:nextHopAudit.functions.reduce((sum,x)=>sum+x.calls.length,0)})+' (pinned helper source, SQL references, direct qualified calls, signatures and effective grants)')
        const mediaNewsCatalog=JSON.parse(sql(buildMediaNewsCalleeCatalogQuery()))
        const mediaNewsReview=auditMediaNewsCallees(mediaNewsCatalog,{pins:reviewedMediaNewsPins,requirePins:true})
        // Exercise two SQL helpers with actual Postgres semantics, without
        // a real asset or a provider. This is NOT a Meta delivery receipt.
        const canon=sql(`SELECT public.media_news_canonical_json(
          '{"z":1,"a":[{"b":2,"a":1},3]}'::jsonb)`)
        assert.equal(canon,'{"a":[{"a":1,"b":2},3],"z":1}',
          'canonical hash input changed or JSON ordering became unstable')
        const invalidMedia=sql(`SELECT to_jsonb(public.media_news_snapshot_requirements(
          ${quote(project)}::uuid,'{}'::jsonb))`)
        assert.equal(invalidMedia,'["news_evidence_invalid"]',
          'invalid media admission snapshot was incorrectly allowed')
        const mediaProvInventory=auditMediaProvenanceTriggers(JSON.parse(sql(mediaProvenanceCatalogSql())),{pins:mediaProvenancePins,enforce:true})
        console.log('CROSS-TREE MEDIA PROVENANCE TRIGGER PASS '+JSON.stringify({triggers:mediaProvInventory.triggers.length,functions:mediaProvInventory.functions.length})+' (pinned source/trigger definitions; news guard ACL strict; legacy ACL to review)')
        console.log('CROSS-TREE MEDIA NEWS CALLEE PASS '+JSON.stringify({
          functions:mediaNewsReview.reviewedFunctions,
          directCalls:mediaNewsReview.functions.reduce((n,x)=>n+x.calls.length,0),
          sqlReferences:mediaNewsReview.functions.reduce((n,x)=>n+x.references.length,0),
          invokerOnly:mediaNewsReview.functions.every(x=>x.invoker),
          canonicalJsonValidated:true,invalidMediaRejected:true,
        })+' (pinned source, signed roles, private creative evidence; no provider publishing proof)')
        const startedRest=docker(['run','--pull=never','--detach','--name',restName,'--network',httpNetwork,'--network-alias','rest',
          '--env','PGRST_DB_URI=postgres://authenticator:'+password+'@db:5432/postgres',
          '--env','PGRST_DB_SCHEMAS=public','--env','PGRST_DB_ANON_ROLE=anon',
          '--env','PGRST_JWT_SECRET='+publicJwks,'--env','PGRST_JWT_AUD=authenticated',restImage])
        assert.equal(startedRest.status,0,startedRest.stderr);restOwned=true
        const startedGateway=docker(['run','--pull=never','--detach','--name',gatewayName,'--network',httpNetwork,
          gatewayImage,'node','-e','setInterval(()=>{},10000)'])
        assert.equal(startedGateway.status,0,startedGateway.stderr);gatewayOwned=true
        const now=Math.floor(Date.now()/1000)
        const signedToken=(sub,override={},headerOverride={})=>{
          const body=[{alg:'RS256',typ:'JWT',kid:fixtureKid,...headerOverride}, {role:'social_schedule_rpc_only_fixture',iss:'omnira-schedule-fixture',aud:'authenticated',...(sub?{sub}:{}),iat:now,exp:now+600,...override}]
            .map(part=>Buffer.from(JSON.stringify(part)).toString('base64url')).join('.')
          return body+'.'+signJwt('RSA-SHA256',Buffer.from(body),keys.privateKey).toString('base64url')
        }
        const token=signedToken(actor),foreignToken=signedToken(id.foreignPrincipal),missingSubjectToken=signedToken(null)
        const brokerToken=signedToken(actor,{role:'social_schedule_broker_intent_fixture'})
        const foreignBrokerToken=signedToken(id.foreignPrincipal,{role:'social_schedule_broker_intent_fixture'})
        const reviewToken=signedToken(actor,{role:'social_schedule_broker_review_fixture'})
        const foreignReviewToken=signedToken(id.foreignPrincipal,{role:'social_schedule_broker_review_fixture'})
        const operatorToken=signedToken(operatorSubject,{role:'social_schedule_operator_review_fixture'})
        // Supabase-native-style authenticated JWTs. A real session_id MUST
        // match the active auth.sessions row; user-supplied fields cannot
        // self-select the operator/project privilege.
        const nativeClaims=(sub,sessionId,extra={})=>({
          role:'authenticated',session_id:sessionId,is_anonymous:false,...extra,
        })
        const nativeOperatorToken=signedToken(operatorSubject,
          nativeClaims(operatorSubject,nativeOperatorSession))
        const nativeNonOperatorToken=signedToken(actor,
          nativeClaims(actor,nativeNonOperatorSession))
        const nativeWrongSessionToken=signedToken(operatorSubject,
          nativeClaims(operatorSubject,nativeNonOperatorSession))
        const nativeExpiredSessionToken=signedToken(operatorSubject,
          nativeClaims(operatorSubject,nativeExpiredSession))
        const nativeMissingSessionToken=signedToken(operatorSubject,
          {role:'authenticated',is_anonymous:false})
        const nativeAnonymousToken=signedToken(operatorSubject,
          nativeClaims(operatorSubject,nativeOperatorSession,{is_anonymous:true}))
        // Operator/reader-only scoped short-lived JWTs. Their RSA signing
        // key never leaves this parent replay runner process. The bridge
        // test process receives only these tokens and a fixed RPC gateway.
        const bridgeOperatorToken=signedToken(operatorSubject,{
          role:'social_schedule_operator_review_fixture',
          omnira_project:project,exp:now+240})
        const bridgeReviewToken=signedToken(operatorSubject,{
          role:'social_schedule_broker_review_fixture',
          omnira_project:project,exp:now+240})
        const nonOperatorToken=signedToken(actor,{role:'social_schedule_operator_review_fixture'})
        const foreignOperatorToken=signedToken(id.foreignPrincipal,{role:'social_schedule_operator_review_fixture'})
        const requestScript=`const q=JSON.parse(Buffer.from(process.argv[1],'base64').toString());fetch('http://rest:3000'+q.path,{method:q.method,headers:{Authorization:'Bearer '+q.token,'Content-Type':'application/json'},body:q.body?JSON.stringify(q.body):undefined}).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.text()}))).catch(e=>{console.error(e.message);process.exitCode=1})`
        function httpRole(path,body,method='POST',bearer=token) {
          const input=Buffer.from(JSON.stringify({path,body,method,token:bearer})).toString('base64')
          const response=docker(['exec',gatewayName,'node','-e',requestScript,input])
          assert.equal(response.status,0,response.stderr)
          return JSON.parse(response.stdout.trim())
        }
        await until(()=>{
          const response=docker(['exec',gatewayName,'node','-e',"fetch('http://rest:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"])
          return response.status===0
        },'PostgREST ready',60000)
        // Separate no-OIDC candidate: use the already-hosted 'authenticated'
        // PostgREST role with a cryptographically verified native-style JWT.
        // No database schema/grant change is ever sent to hosted Supabase.
        const nativeAcl=JSON.parse(sql(`SELECT jsonb_build_object(
          'member',pg_has_role('authenticator','authenticated','MEMBER'),
          'nativeHistory',has_function_privilege('authenticated',
            'public.social_schedule_native_operator_history_fixture(uuid,uuid,uuid)','EXECUTE'),
          'nativeAppend',has_function_privilege('authenticated',
            'public.social_schedule_native_operator_append_fixture(jsonb)','EXECUTE'),
          'anonHistory',has_function_privilege('anon',
            'public.social_schedule_native_operator_history_fixture(uuid,uuid,uuid)','EXECUTE'),
          'anonAppend',has_function_privilege('anon',
            'public.social_schedule_native_operator_append_fixture(jsonb)','EXECUTE'),
          'serviceAppend',has_function_privilege('service_role',
            'public.social_schedule_native_operator_append_fixture(jsonb)','EXECUTE'),
          'schedulerAppend',has_function_privilege('social_schedule_rpc_only_fixture',
            'public.social_schedule_native_operator_append_fixture(jsonb)','EXECUTE'),
          'helper',has_function_privilege('authenticated',
            'public.social_schedule_native_operator_guard_fixture(uuid)','EXECUTE'),
          'sessionRead',has_table_privilege('authenticated',
            'auth.sessions','SELECT'),
          'membershipRead',has_table_privilege('authenticated',
            'public.social_schedule_operator_scope_fixture','SELECT'),
          'auditInsert',has_table_privilege('authenticated',
            'public.social_schedule_operator_review_events_fixture','INSERT'),
          'providerProof',has_table_privilege('authenticated',
            'public.social_publication_reconciliation_proofs','INSERT')
        );`))
        assert.deepEqual(nativeAcl,{
          member:true,nativeHistory:true,nativeAppend:true,
          anonHistory:false,anonAppend:false,serviceAppend:false,
          schedulerAppend:false,helper:false,sessionRead:false,
          membershipRead:false,auditInsert:false,providerProof:false,
        },'native authenticated-role compatibility proof has excessive permissions')
        const nativePath='/rpc/social_schedule_native_operator_append_fixture'
        const nativeHistoryPath='/rpc/social_schedule_native_operator_history_fixture'
        const prematureNative=httpRole(nativePath,{p_input:{
          projectId:project,jobId:id.job,publicationId:id.post,
          requestId:'42937e29-d6e8-41df-bb9b-e58291603b3c',
          observation:'review_deferred',candidateId:null,
        }},'POST',nativeOperatorToken)
        assert.equal(prematureNative.status,403,prematureNative.body)
        for(const jwt of [nativeNonOperatorToken,nativeWrongSessionToken,
          nativeExpiredSessionToken,nativeMissingSessionToken,nativeAnonymousToken]){
          const denied=httpRole(nativeHistoryPath,{
            p_project_id:project,p_job_id:id.job,p_publication_id:id.post,
          },'POST',jwt)
          assert.equal(denied.status,403,denied.body)
        }
        const nativeDirect=httpRole('/social_schedule_operator_review_events_fixture?select=*',
          undefined,'GET',nativeOperatorToken)
        assert.ok(nativeDirect.status>=400,nativeDirect.body)
        console.log('CROSS-TREE HOSTED AUTHENTICATED ACL PASS (shared role has only gated RPC; active session/operator mapping required; no token/ledger/grants)')
        // Separate broker identity: no direct table reads and only the
        // atomic dispatch-intent RPC. This is an isolated probe role.
        const brokerAcl=JSON.parse(sql(`SELECT jsonb_build_object(
          'brokerBegin',has_function_privilege('social_schedule_broker_intent_fixture',
            'public.social_schedule_dispatch_try_begin_fixture(jsonb,uuid)','EXECUTE'),
          'workerBegin',has_function_privilege('social_schedule_rpc_only_fixture',
            'public.social_schedule_dispatch_try_begin_fixture(jsonb,uuid)','EXECUTE'),
          'serviceBegin',has_function_privilege('service_role',
            'public.social_schedule_dispatch_try_begin_fixture(jsonb,uuid)','EXECUTE'),
          'brokerStep',has_function_privilege('social_schedule_broker_intent_fixture',
            'public.social_schedule_step(jsonb,jsonb)','EXECUTE'),
          'brokerRead',has_table_privilege('social_schedule_broker_intent_fixture',
            'public.social_schedule_dispatch_intents_fixture','SELECT'),
          'brokerInsert',has_table_privilege('social_schedule_broker_intent_fixture',
            'public.social_schedule_dispatch_intents_fixture','INSERT')
        );`))
        assert.deepEqual(brokerAcl,{brokerBegin:true,workerBegin:false,serviceBegin:false,
          brokerStep:false,brokerRead:false,brokerInsert:false})
        const reviewAcl=JSON.parse(sql(`SELECT jsonb_build_object(
          'reviewQuery',has_function_privilege('social_schedule_broker_review_fixture',
            'public.social_schedule_dispatch_review_fixture(uuid)','EXECUTE'),
          'workerQuery',has_function_privilege('social_schedule_rpc_only_fixture',
            'public.social_schedule_dispatch_review_fixture(uuid)','EXECUTE'),
          'brokerQuery',has_function_privilege('social_schedule_broker_intent_fixture',
            'public.social_schedule_dispatch_review_fixture(uuid)','EXECUTE'),
          'serviceQuery',has_function_privilege('service_role',
            'public.social_schedule_dispatch_review_fixture(uuid)','EXECUTE'),
          'reviewReserve',has_function_privilege('social_schedule_broker_review_fixture',
            'public.social_schedule_dispatch_try_begin_fixture(jsonb,uuid)','EXECUTE'),
          'reviewComplete',has_function_privilege('social_schedule_broker_review_fixture',
            'public.social_publication_reconciliation_complete(jsonb,jsonb)','EXECUTE'),
          'reviewTableRead',has_table_privilege('social_schedule_broker_review_fixture',
            'public.social_schedule_dispatch_intents_fixture','SELECT'),
          'reviewTableWrite',has_table_privilege('social_schedule_broker_review_fixture',
            'public.social_schedule_dispatch_intents_fixture','UPDATE'),
          'reviewTokens',has_table_privilege('social_schedule_broker_review_fixture',
            'public.platform_tokens','SELECT')
        );`))
        assert.deepEqual(reviewAcl,{reviewQuery:true,workerQuery:false,
          brokerQuery:false,serviceQuery:false,reviewReserve:false,
          reviewComplete:false,reviewTableRead:false,reviewTableWrite:false,
          reviewTokens:false},'read-only review role has excessive privileges')
        const reviewInput={p_project_id:project}
        for(const identity of [token,brokerToken]){
          const denied=httpRole('/rpc/social_schedule_dispatch_review_fixture',
            reviewInput,'POST',identity)
          assert.equal(denied.status,403,denied.body)
        }
        const reviewAsBrokerCannotReserve=httpRole(
          '/rpc/social_schedule_dispatch_try_begin_fixture',
          {p_claim:{jobId:id.job,claimId:id.claim,version:1},p_publication_id:id.post},
          'POST',reviewToken)
        assert.equal(reviewAsBrokerCannotReserve.status,403,reviewAsBrokerCannotReserve.body)
        const reviewDirect=httpRole('/social_schedule_dispatch_intents_fixture?select=*',
          undefined,'GET',reviewToken)
        assert.ok(reviewDirect.status>=400,reviewDirect.body)
        const reviewForeign=httpRole('/rpc/social_schedule_dispatch_review_fixture',
          reviewInput,'POST',foreignReviewToken)
        assert.equal(reviewForeign.status,403,reviewForeign.body)
        const ownReview=httpRole('/rpc/social_schedule_dispatch_review_fixture',
          reviewInput,'POST',reviewToken)
        assert.equal(ownReview.status,200,ownReview.body)
        const emptyReview=JSON.parse(ownReview.body)
        assert.deepEqual(emptyReview.items,[],'no provider dispatch has been reserved')
        assert.equal(emptyReview.automaticRetryAllowed,false)
        const foreignOwnReview=httpRole('/rpc/social_schedule_dispatch_review_fixture',
          {p_project_id:id.unreferencedProject},'POST',foreignReviewToken)
        assert.equal(foreignOwnReview.status,200,foreignOwnReview.body)
        assert.deepEqual(JSON.parse(foreignOwnReview.body).items,[])
        assert.equal(sql('SELECT count(*) FROM public.social_schedule_dispatch_intents_fixture'),'0')
        console.log('CROSS-TREE BROKER REVIEW ACL PASS (separate RS256 role; no table DML, no finalization, no cross-project inbox)')
        // The operator has a DIFFERENT RS256 role and an admin-seeded
        // subject/project/active mapping. No Atlas, scheduler, broker or
        // passive reviewer identity can append human observations.
        const operatorAcl=JSON.parse(sql(`SELECT jsonb_build_object(
          'operatorAppend',has_function_privilege('social_schedule_operator_review_fixture',
            'public.social_schedule_operator_review_append_fixture(jsonb)','EXECUTE'),
          'workerAppend',has_function_privilege('social_schedule_rpc_only_fixture',
            'public.social_schedule_operator_review_append_fixture(jsonb)','EXECUTE'),
          'brokerAppend',has_function_privilege('social_schedule_broker_intent_fixture',
            'public.social_schedule_operator_review_append_fixture(jsonb)','EXECUTE'),
          'reviewerAppend',has_function_privilege('social_schedule_broker_review_fixture',
            'public.social_schedule_operator_review_append_fixture(jsonb)','EXECUTE'),
          'serviceAppend',has_function_privilege('service_role',
            'public.social_schedule_operator_review_append_fixture(jsonb)','EXECUTE'),
          'operatorComplete',has_function_privilege('social_schedule_operator_review_fixture',
            'public.social_publication_reconciliation_complete(jsonb,jsonb)','EXECUTE'),
          'operatorReserve',has_function_privilege('social_schedule_operator_review_fixture',
            'public.social_schedule_dispatch_try_begin_fixture(jsonb,uuid)','EXECUTE'),
          'operatorReadTokens',has_table_privilege('social_schedule_operator_review_fixture',
            'public.platform_tokens','SELECT'),
          'operatorReadAudit',has_table_privilege('social_schedule_operator_review_fixture',
            'public.social_schedule_operator_review_events_fixture','SELECT'),
          'operatorWriteAudit',has_table_privilege('social_schedule_operator_review_fixture',
            'public.social_schedule_operator_review_events_fixture','INSERT'),
          'operatorEditMembership',has_table_privilege('social_schedule_operator_review_fixture',
            'public.social_schedule_operator_scope_fixture','UPDATE')
        );`))
        assert.deepEqual(operatorAcl,{
          operatorAppend:true,workerAppend:false,brokerAppend:false,
          reviewerAppend:false,serviceAppend:false,operatorComplete:false,
          operatorReserve:false,operatorReadTokens:false,operatorReadAudit:false,
          operatorWriteAudit:false,operatorEditMembership:false,
        },'operator review role has excessive privileges')
        const historyAcl=JSON.parse(sql(`SELECT jsonb_build_object(
          'operatorHistory',has_function_privilege('social_schedule_operator_review_fixture',
            'public.social_schedule_operator_review_history_fixture(uuid,uuid,uuid)','EXECUTE'),
          'workerHistory',has_function_privilege('social_schedule_rpc_only_fixture',
            'public.social_schedule_operator_review_history_fixture(uuid,uuid,uuid)','EXECUTE'),
          'brokerHistory',has_function_privilege('social_schedule_broker_intent_fixture',
            'public.social_schedule_operator_review_history_fixture(uuid,uuid,uuid)','EXECUTE'),
          'reviewHistory',has_function_privilege('social_schedule_broker_review_fixture',
            'public.social_schedule_operator_review_history_fixture(uuid,uuid,uuid)','EXECUTE'),
          'serviceHistory',has_function_privilege('service_role',
            'public.social_schedule_operator_review_history_fixture(uuid,uuid,uuid)','EXECUTE'),
          'operatorDirectRead',has_table_privilege('social_schedule_operator_review_fixture',
            'public.social_schedule_operator_review_events_fixture','SELECT')
        );`))
        assert.deepEqual(historyAcl,{operatorHistory:true,workerHistory:false,
          brokerHistory:false,reviewHistory:false,serviceHistory:false,
          operatorDirectRead:false})
        const operatorReviewInput={
          projectId:project,jobId:id.job,publicationId:id.post,
          requestId:'492a21ae-b593-4bc2-baf6-b25fa075d9cc',
          observation:'review_deferred',candidateId:null,
        }
        const operatorPath='/rpc/social_schedule_operator_review_append_fixture'
        for(const identity of [token,brokerToken,reviewToken,nonOperatorToken,foreignOperatorToken]){
          const denied=httpRole(operatorPath,{p_input:operatorReviewInput},'POST',identity)
          assert.equal(denied.status,403,'unauthorized operator audit append: '+denied.body)
        }
        const beforeIntent=httpRole(operatorPath,
          {p_input:operatorReviewInput},'POST',operatorToken)
        assert.equal(beforeIntent.status,403,beforeIntent.body)
        assert.equal(sql('SELECT count(*) FROM public.social_schedule_operator_review_events_fixture'),'0')
        const historyPath='/rpc/social_schedule_operator_review_history_fixture'
        const absentHistory=httpRole(historyPath,{p_project_id:project,
          p_job_id:id.job,p_publication_id:id.post},'POST',operatorToken)
        assert.equal(absentHistory.status,403,absentHistory.body)
        const workerHistory=httpRole(historyPath,{p_project_id:project,
          p_job_id:id.job,p_publication_id:id.post},'POST',token)
        assert.equal(workerHistory.status,403,workerHistory.body)
        const auditTableRead=httpRole('/social_schedule_operator_review_events_fixture?select=*',
          undefined,'GET',operatorToken)
        assert.ok(auditTableRead.status>=400,auditTableRead.body)
        const auditDirectInsert=httpRole('/social_schedule_operator_review_events_fixture',
          {job_id:id.job},'POST',operatorToken)
        assert.ok(auditDirectInsert.status>=400,auditDirectInsert.body)
        console.log('CROSS-TREE OPERATOR AUDIT ACL PASS (distinct operator JWT and admin mapping; no direct DML, no ledger read, no finalization/dispatch)')
        const queuedClaim={jobId:id.job,claimId:id.claim,version:1}
        const brokerInput={p_claim:queuedClaim,p_publication_id:id.post}
        const workerCannotReserve=httpRole('/rpc/social_schedule_dispatch_try_begin_fixture',
          brokerInput,'POST',token)
        assert.equal(workerCannotReserve.status,403,workerCannotReserve.body)
        const brokerCannotSchedule=httpRole('/rpc/social_schedule_step',
          {p_claim:queuedClaim,p_step:{action:'prepare'}},'POST',brokerToken)
        assert.equal(brokerCannotSchedule.status,403,brokerCannotSchedule.body)
        const brokerCannotRead=httpRole('/social_schedule_dispatch_intents_fixture?select=*',
          undefined,'GET',brokerToken)
        assert.ok(brokerCannotRead.status>=400,brokerCannotRead.body)
        const foreignCannotReserve=httpRole('/rpc/social_schedule_dispatch_try_begin_fixture',
          brokerInput,'POST',foreignBrokerToken)
        assert.equal(foreignCannotReserve.status,403,foreignCannotReserve.body)
        const prematureReserve=httpRole('/rpc/social_schedule_dispatch_try_begin_fixture',
          brokerInput,'POST',brokerToken)
        assert.equal(prematureReserve.status,400,prematureReserve.body)
        assert.equal(JSON.parse(prematureReserve.body).message,'SOCIAL_SCHEDULE_CONFLICT')
        assert.equal(sql('SELECT count(*) FROM public.social_schedule_dispatch_intents_fixture'),'0')
        console.log('CROSS-TREE BROKER INTENT ACL PASS (distinct scoped JWT role; no DML, no worker reservation, no pre-publication reserve)')
        const foreign={workerId:'probe-worker',now:new Date().toISOString(),dryRun:false,projectIds:[id.unreferencedProject]}
        const missingSubject=httpRole('/rpc/social_schedule_peek',{p_input:{projectIds:[project]}},'POST',missingSubjectToken)
        assert.equal(missingSubject.status,403,missingSubject.body)
        assert.equal(JSON.parse(missingSubject.body).code,'42501')
        const wrongIssuer=httpRole('/rpc/social_schedule_peek',{p_input:{projectIds:[project]}},'POST',signedToken(actor,{iss:'unexpected-issuer'}))
        assert.equal(wrongIssuer.status,403,wrongIssuer.body)
        assert.equal(JSON.parse(wrongIssuer.body).code,'42501')
        const parts=token.split('.')
        const forgedRole=Buffer.from(JSON.stringify({role:'service_role',sub:actor,iss:'omnira-schedule-fixture',aud:'authenticated',iat:now,exp:now+600})).toString('base64url')
        const tamperedToken=parts[0]+'.'+forgedRole+'.'+parts[2]
        const tampered=httpRole('/rpc/social_schedule_peek',{p_input:{projectIds:[project]}},'POST',tamperedToken)
        assert.equal(tampered.status,401,'JWT signature must be verified by PostgREST: '+tampered.body)
        // A valid signature with the wrong key ID must fail before SQL.
        const wrongKid=httpRole('/rpc/social_schedule_peek',{p_input:{projectIds:[project]}},'POST',signedToken(actor,{}, {kid:'untrusted-key'}))
        assert.equal(wrongKid.status,401,'unknown kid must be refused: '+wrongKid.body)
        // A signature by an untrusted private key is never accepted even when
        // it advertises the known key ID.
        const attackerKeys=generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:0x10001})
        const forgedSignature=signJwt('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),attackerKeys.privateKey).toString('base64url')
        const wrongKey=httpRole('/rpc/social_schedule_peek',{p_input:{projectIds:[project]}},'POST',parts[0]+'.'+parts[1]+'.'+forgedSignature)
        assert.equal(wrongKey.status,401,'untrusted signature must be refused: '+wrongKey.body)
        const foreignReceipt=httpRole('/rpc/social_schedule_receipt',{p_input:{jobId:id.job}},'POST',foreignToken)
        assert.equal(foreignReceipt.status,403,foreignReceipt.body)
        assert.equal(JSON.parse(foreignReceipt.body).code,'42501')
        const foreignOwnPeek=httpRole('/rpc/social_schedule_peek',{p_input:{projectIds:[id.unreferencedProject]}},'POST',foreignToken)
        assert.equal(foreignOwnPeek.status,200,foreignOwnPeek.body)
        const deniedClaim=httpRole('/rpc/social_schedule_claim',{p_input:foreign})
        assert.equal(deniedClaim.status,403,deniedClaim.body)
        assert.equal(JSON.parse(deniedClaim.body).code,'42501')
        const deniedPeek=httpRole('/rpc/social_schedule_peek',{p_input:{projectIds:[id.unreferencedProject]}})
        assert.equal(deniedPeek.status,403,deniedPeek.body)
        const direct=httpRole('/social_schedule_jobs',{reason:'forbidden'})
        assert.ok(direct.status>=400,direct.body)
        for (const table of [
          'platform_tokens','assets','projects','social_schedule_jobs',
          'social_publications','social_schedule_events',
          'social_publication_events','social_schedule_batches',
          'social_schedule_decisions','social_publication_reconciliation_proofs',
          'social_content_posts','social_content_revisions',
        ]) {
          const read=httpRole('/'+table+'?select=*',undefined,'GET')
          assert.ok(read.status>=400,table+': '+read.body)
        }
        const unchecked=httpRole('/rpc/social_schedule_claim_unchecked_fixture',{p_input:foreign})
        assert.ok(unchecked.status>=400,unchecked.body)
        const peek=httpRole('/rpc/social_schedule_peek',{p_input:{projectIds:[project]}})
        assert.equal(peek.status,200,peek.body)
        const claim=httpRole('/rpc/social_schedule_claim',{p_input:{...foreign,projectIds:[project],now:new Date().toISOString()}})
        assert.equal(claim.status,200,claim.body)
        const claimed=JSON.parse(claim.body)
        assert.equal(claimed.jobId,id.job)
        assert.equal(claimed.version,2)
        const foreignClaim={jobId:id.job,claimId:claimed.claimId,version:claimed.version}
        for (const [rpc,body] of [
          ['social_schedule_authorize_write',{p_claim:foreignClaim,p_project_ids:[project]}],
          ['social_schedule_step',{p_claim:foreignClaim,p_step:{action:'prepare'}}],
          ['social_schedule_recover_checkpoint',{p_claim:foreignClaim}],
        ]) {
          const denied=httpRole('/rpc/'+rpc,body,'POST',foreignToken)
          assert.equal(denied.status,403,rpc+': '+denied.body)
          assert.equal(JSON.parse(denied.body).code,'42501',rpc)
          assert.equal(JSON.parse(denied.body).message,'SOCIAL_SCHEDULE_PROJECT_SCOPE_DENIED',rpc)
        }
        const receipt=httpRole('/rpc/social_schedule_receipt',{p_input:{jobId:id.job}})
        assert.equal(receipt.status,200,receipt.body)
        assert.equal(JSON.parse(receipt.body).jobState,'claimed')
        assert.equal(sql('SELECT state FROM public.social_schedule_jobs WHERE id='+quote(id.job)),'claimed')
        console.log('CROSS-TREE POSTGREST ROLE PASS (subject-bound synthetic JWTs; foreign project and job-scoped RPCs, missing subject, direct writes and 12 sensitive table GETs denied; allowed claim and receipt; owned network only)')
        if (scheduleHttpWorkerReplay) {
          sql(`BEGIN;
            DO $queue_again$ BEGIN PERFORM public.calendar_source_gate_begin_probe(${quote(project)}::uuid); END $queue_again$;
            UPDATE public.social_schedule_jobs
              SET state='queued',claim_id=null,worker_id=null,lease_expires_at=null
              WHERE id=${quote(id.job)}::uuid;
            COMMIT;`)
          assert.equal(sql('SELECT state FROM public.social_schedule_jobs WHERE id='+quote(id.job)),'queued')
          const worker=spawnSync(process.execPath,[resolve(repo,'node_modules/vitest/vitest.mjs'),
            'run','lib/social-launch/scheduling/isolated-worker-replay.test.ts','--maxWorkers=1','--minWorkers=1'],{
            cwd:web,encoding:'utf8',timeout:90000,maxBuffer:1024*1024,
            env:{...process.env,OMNIRA_SCHEDULE_REPLAY_CONTAINER:name,
              OMNIRA_SCHEDULE_REPLAY_PROJECT:project,OMNIRA_SCHEDULE_REPLAY_JOB:id.job,
              OMNIRA_SCHEDULE_REPLAY_HTTP_GATEWAY:gatewayName,OMNIRA_SCHEDULE_REPLAY_HTTP_TOKEN:token,
              OMNIRA_SCHEDULE_REPLAY_SUBJECT:actor,
              OMNIRA_SCHEDULE_REPLAY_BROKER_HTTP_TOKEN:brokerToken},
          })
          assert.equal(worker.status,0,worker.stderr+'\n'+worker.stdout)
          assert.equal(sql('SELECT state FROM public.social_schedule_jobs WHERE id='+quote(id.job)),'published')
          assert.equal(sql('SELECT count(*) FROM public.social_schedule_dispatch_intents_fixture'), '1',
            'durable broker dispatch intent not committed')
          assert.equal(sql('SELECT provider_outcome FROM public.social_schedule_dispatch_intents_fixture'), 'unknown',
            'unknown Meta outcome must remain awaiting independent reconciliation')
          // The database may say "published" after a fake provider response,
          // but the broker intent STILL lacks authenticated Meta evidence.
          const review=httpRole('/rpc/social_schedule_dispatch_review_fixture',
            {p_project_id:project},'POST',reviewToken)
          assert.equal(review.status,200,review.body)
          const queue=JSON.parse(review.body)
          assert.equal(queue.projectId,project)
          assert.equal(queue.automaticRetryAllowed,false)
          assert.equal(queue.reviewAction,'operator_review_provider_evidence')
          assert.equal(queue.items.length,1,JSON.stringify(queue))
          assert.deepEqual(Object.keys(queue.items[0]).sort(),[
            'automaticRetryAllowed','databaseJobState','jobId','postId',
            'providerOutcome','publicationId','publicationState','reservedAt','reviewStatus',
          ])
          assert.equal(queue.items[0].jobId,id.job)
          assert.equal(queue.items[0].databaseJobState,'published')
          assert.equal(queue.items[0].postId,id.post)
          assert.equal(queue.items[0].publicationState,'published')
          assert.equal(queue.items[0].providerOutcome,'unknown')
          assert.equal(queue.items[0].reviewStatus,'needs_authenticated_meta_evidence')
          assert.equal(queue.items[0].automaticRetryAllowed,false)
          assert.equal(JSON.stringify(queue).includes('12345_99999'),false,
            'untrusted/synthetic provider receipt leaked into review inbox')
          // A second HTTP/database transaction sees precisely the same
          // pending review; trying to supply a fake provider receipt to the
          // read-only RPC is not a valid function argument.
          const reread=httpRole('/rpc/social_schedule_dispatch_review_fixture',
            {p_project_id:project},'POST',reviewToken)
          assert.equal(reread.status,200,reread.body)
          assert.deepEqual(JSON.parse(reread.body).items,queue.items)
          const fakeProof=httpRole('/rpc/social_schedule_dispatch_review_fixture',
            {p_project_id:project,providerId:'12345_99999',confirmed:true},
            'POST',reviewToken)
          assert.ok(fakeProof.status>=400,fakeProof.body)
          const cannotFinalize=httpRole('/rpc/social_publication_reconciliation_complete',
            {p_principal:{},p_input:{}},'POST',reviewToken)
          assert.ok(cannotFinalize.status>=400,cannotFinalize.body)
          assert.equal(sql('SELECT provider_outcome FROM public.social_schedule_dispatch_intents_fixture'),'unknown')
          assert.equal(sql('SELECT count(*) FROM public.social_schedule_dispatch_intents_fixture'),'1')
          // Feed the actual PostgREST projection to the passive Swedish
          // review panel contract. No browser route or provider request.
          const handoff=spawnSync(process.execPath,[resolve(repo,'node_modules/vitest/vitest.mjs'),
            'run','lib/social-launch/scheduling/review-handoff-fixture.test.ts',
            '--maxWorkers=1','--minWorkers=1'],{
            cwd:web,encoding:'utf8',timeout:45000,maxBuffer:1024*1024,
            env:{...process.env,
              OMNIRA_SCHEDULE_REPLAY_REVIEW_B64:Buffer.from(review.body,'utf8').toString('base64'),
              OMNIRA_SCHEDULE_REPLAY_REVIEW_PROJECT:project},
          })
          assert.equal(handoff.status,0,handoff.stderr+'\n'+handoff.stdout)
          console.log('CROSS-TREE REVIEW HANDOFF UI PASS (actual PostgREST result rendered read-only, without operator actions)')
          // Separate operator-only read: real scoped SQL inbox, synthetic
          // attempted-publication snapshot and mocked private Facebook GET.
          // Does not register provider proof or enable the legacy completed path.
          const evidence=spawnSync(process.execPath,[resolve(repo,'node_modules/vitest/vitest.mjs'),
            'run','lib/social-launch/scheduling/operator-meta-evidence-fixture.test.ts',
            '--maxWorkers=1','--minWorkers=1'],{
            cwd:web,encoding:'utf8',timeout:45000,maxBuffer:1024*1024,
            env:{...process.env,
              OMNIRA_SCHEDULE_REPLAY_REVIEW_B64:Buffer.from(review.body,'utf8').toString('base64'),
              OMNIRA_SCHEDULE_REPLAY_REVIEW_PROJECT:project},
          })
          assert.equal(evidence.status,0,evidence.stderr+'\n'+evidence.stdout)
          assert.equal(sql('SELECT provider_outcome FROM public.social_schedule_dispatch_intents_fixture'),'unknown')
          assert.equal(sql('SELECT count(*) FROM public.social_schedule_dispatch_intents_fixture'),'1')
          // A human may log an observation, NOT grant a Meta receipt.
          // Distinct signed JWT, separate PostgREST transaction, committed
          // append-only audit. Provider outcome and replay lock stay unknown.
          const reviewNote={projectId:project,jobId:id.job,
            publicationId:queue.items[0].publicationId,
            requestId:'492a21ae-b593-4bc2-baf6-b25fa075d9cc',
            observation:'possible_match_observed',candidateId:'12345_24680'}
          const noteCall=(body,bearer=operatorToken)=>
            httpRole(operatorPath,{p_input:body},'POST',bearer)
          // The first human note uses ONLY the standard authenticated JWT;
          // the second invocation uses the older custom-operator route.
          // Both share the same durable append-only, actor-bound ledger.
          const noteOne=httpRole(nativePath,{p_input:reviewNote},'POST',nativeOperatorToken)
          assert.equal(noteOne.status,200,noteOne.body)
          const recorded=JSON.parse(noteOne.body)
          assert.equal(recorded.observation,'possible_match_observed')
          assert.equal(recorded.evidenceClass,'human_observation_only')
          assert.equal(recorded.providerOutcome,'unknown')
          assert.equal(recorded.providerAttested,false)
          assert.equal(recorded.automaticRetryAllowed,false)
          assert.equal(recorded.canFinalize,false)
          assert.equal(recorded.canPublish,false)
          assert.ok(Number.isSafeInteger(recorded.eventId),noteOne.body)
          const sameRequest=noteCall(reviewNote)
          assert.equal(sameRequest.status,200,sameRequest.body)
          assert.deepEqual(JSON.parse(sameRequest.body),recorded,
            'idempotent operator note returned different event')
          const conflict=noteCall({...reviewNote,observation:'review_deferred',candidateId:null})
          assert.equal(conflict.status,403,conflict.body)
          assert.equal(JSON.parse(conflict.body).message,'OPERATOR_REVIEW_IDEMPOTENCY_CONFLICT')
          const forgedStatus=noteCall({...reviewNote,
            requestId:'327e20cf-0c3c-4ec1-8a32-b816254b707e',
            observation:'provider_confirmed'})
          assert.equal(forgedStatus.status,403,forgedStatus.body)
          const forgedExtra=noteCall({...reviewNote,
            requestId:'487a9237-22e2-4c5b-b59a-a7b86bc98fbf',providerAttested:true})
          assert.equal(forgedExtra.status,403,forgedExtra.body)
          const wrongAccount=noteCall({...reviewNote,
            requestId:'2f787508-a5aa-4edf-8c2d-de0a44eae714',candidateId:'99999_11111'})
          assert.equal(wrongAccount.status,403,wrongAccount.body)
          const noMatchNote={...reviewNote,
            requestId:'590354a8-49db-4311-8d76-fc21caf5e954',
            observation:'no_match_observed',candidateId:null}
          const noMatch=noteCall(noMatchNote)
          assert.equal(noMatch.status,200,noMatch.body)
          assert.equal(JSON.parse(noMatch.body).evidenceClass,'human_observation_only')
          const nativeHistoryInput={p_project_id:project,p_job_id:id.job,
            p_publication_id:reviewNote.publicationId}
          const nativeHistory=httpRole(nativeHistoryPath,nativeHistoryInput,
            'POST',nativeOperatorToken)
          assert.equal(nativeHistory.status,200,nativeHistory.body)
          const nativeHistoryData=JSON.parse(nativeHistory.body)
          assert.equal(nativeHistoryData.items.length,2)
          assert.equal(nativeHistoryData.providerOutcome,'unknown')
          assert.equal(nativeHistoryData.automaticRetryAllowed,false)
          assert.equal(nativeHistoryData.canFinalize,false)
          assert.equal(nativeHistoryData.canPublish,false)
          assert.ok(nativeHistoryData.items.every(item=>
            item.operatorId===operatorSubject&&
            item.providerAttested===false&&
            item.evidenceClass==='human_observation_only'))
          const sameNative=httpRole(nativePath,{p_input:noMatchNote},
            'POST',nativeOperatorToken)
          assert.equal(sameNative.status,200,sameNative.body)
          assert.equal(JSON.parse(sameNative.body).eventId,JSON.parse(noMatch.body).eventId)
          const nativeSpoof=httpRole(nativePath,{p_input:{
            ...noMatchNote,requestId:'c2717b18-7a6c-46d5-bc7c-4b888282db12',
            providerAttested:true,
          }},'POST',nativeOperatorToken)
          assert.equal(nativeSpoof.status,403,nativeSpoof.body)
          const nativeBadCandidate=httpRole(nativePath,{p_input:{
            ...reviewNote,requestId:'c2717b18-7a6c-46d5-bc7c-4b888282db13',
            candidateId:'99999_12345',
          }},'POST',nativeOperatorToken)
          assert.equal(nativeBadCandidate.status,403,nativeBadCandidate.body)
          const nativeWrongProject=httpRole(nativeHistoryPath,{
            ...nativeHistoryInput,p_project_id:id.unreferencedProject,
          },'POST',nativeOperatorToken)
          assert.equal(nativeWrongProject.status,403,nativeWrongProject.body)
          console.log('CROSS-TREE HOSTED AUTHENTICATED OPERATOR PASS (signed native-style JWT, real session+operator mapping, append/read allowed, no proof/retry, shared immutable audit)')
          assert.equal(sql('SELECT count(*) FROM public.social_schedule_operator_review_events_fixture'),'2',
            'operator review audit is not durably append-only/idempotent')
          assert.equal(sql('SELECT count(*) FROM public.social_schedule_operator_review_events_fixture WHERE provider_attested OR automatic_retry_allowed'),'0')
          assert.equal(sql('SELECT count(*) FROM public.social_schedule_operator_review_events_fixture WHERE operator_id='+quote(operatorSubject)),'2')
          const historyInput={p_project_id:project,p_job_id:id.job,
            p_publication_id:reviewNote.publicationId}
          for(const jwt of [token,brokerToken,reviewToken,nonOperatorToken,foreignOperatorToken]){
            const denied=httpRole(historyPath,historyInput,'POST',jwt)
            assert.equal(denied.status,403,denied.body)
          }
          const signedHistory=httpRole(historyPath,historyInput,'POST',operatorToken)
          assert.equal(signedHistory.status,200,signedHistory.body)
          const history=JSON.parse(signedHistory.body)
          assert.equal(history.projectId,project)
          assert.equal(history.jobId,id.job)
          assert.equal(history.publicationId,reviewNote.publicationId)
          assert.equal(history.providerOutcome,'unknown')
          assert.equal(history.automaticRetryAllowed,false)
          assert.equal(history.canFinalize,false)
          assert.equal(history.canPublish,false)
          assert.equal(history.limitReached,false)
          assert.equal(history.items.length,2)
          assert.deepEqual(history.items.map(v=>v.observation),[
            'no_match_observed','possible_match_observed'])
          assert.ok(history.items.every(v=>v.operatorId===operatorSubject&&
            v.evidenceClass==='human_observation_only'&&v.providerAttested===false))
          const uiProof=spawnSync(process.execPath,[resolve(repo,'node_modules/vitest/vitest.mjs'),
            'run','lib/social-launch/scheduling/operator-review-ui-fixture.test.ts',
            '--maxWorkers=1','--minWorkers=1'],{
            cwd:web,encoding:'utf8',timeout:45000,maxBuffer:1024*1024,
            env:{...process.env,
              OMNIRA_SCHEDULE_REPLAY_OPERATOR_HISTORY_B64:Buffer.from(signedHistory.body,'utf8').toString('base64'),
              OMNIRA_SCHEDULE_REPLAY_OPERATOR_SCOPE_B64:Buffer.from(JSON.stringify({
                projectId:project,jobId:id.job,publicationId:reviewNote.publicationId,
              }),'utf8').toString('base64')},
          })
          assert.equal(uiProof.status,0,uiProof.stderr+'\n'+uiProof.stdout)
          console.log('CROSS-TREE OPERATOR REVIEW UI PASS (real scoped SQL observation history; login/operator checks; confirm-only note form)')
          // Bridge proves that the existing app session gate can reach the
          // three precise PostgREST RPCs using two separate issuer-signed
          // role tokens WITHOUT placing the private issuer key in the app.
          const bridgeProof=spawnSync(process.execPath,[resolve(repo,'node_modules/vitest/vitest.mjs'),
            'run','lib/social-launch/scheduling/operator-session-rpc-bridge-fixture.test.ts',
            '--maxWorkers=1','--minWorkers=1'],{
            cwd:web,encoding:'utf8',timeout:60000,maxBuffer:1024*1024,
            env:{...process.env,
              OMNIRA_SCHEDULE_REPLAY_GATEWAY:gatewayName,
              OMNIRA_SCHEDULE_REPLAY_BRIDGE_REVIEW_TOKEN:bridgeReviewToken,
              OMNIRA_SCHEDULE_REPLAY_BRIDGE_OPERATOR_TOKEN:bridgeOperatorToken,
              OMNIRA_SCHEDULE_REPLAY_BRIDGE_SUBJECT:operatorSubject,
              OMNIRA_SCHEDULE_REPLAY_BRIDGE_SCOPE_B64:Buffer.from(JSON.stringify({
                projectId:project,jobId:id.job,publicationId:reviewNote.publicationId,
              }),'utf8').toString('base64')},
          })
          assert.equal(bridgeProof.status,0,bridgeProof.stderr+'\n'+bridgeProof.stdout)
          assert.equal(sql('SELECT count(*) FROM public.social_schedule_operator_review_events_fixture'),'2')
          assert.equal(sql('SELECT provider_outcome FROM public.social_schedule_dispatch_intents_fixture'),'unknown')
          console.log('CROSS-TREE OPERATOR SESSION RPC BRIDGE PASS (signed short-lived JWTs, real operator+reviewer SQL roles; no signer or proof leak)')
          // A second disposable verifier receives only the public JWKS.
          // Test overlap, retirement, and signed-token refusal through real
          // PostgREST; keep private RSA keys in this parent runner.
          const rotated=await runClosedCalendarRotationProbe({
            docker,dbContainerName:name,httpNetwork,gatewayName,restImage,
            password,operatorSubject,projectId:project,
            jobId:id.job,publicationId:reviewNote.publicationId,sql,
          })
          assert.equal(rotated.oldKeyAcceptedDuringOverlap,true)
          assert.equal(rotated.retiredOldRejected,true)
          assert.equal(rotated.newKeyContinues,true)
          console.log('CROSS-TREE OPERATOR JWT ROTATION PASS '+JSON.stringify(rotated)+' (owned public-JWKS verifier reconfigured with new-only key; no hosted OIDC assertion)')
          const immutability=sql(`
            DO $operator_note_guard$ BEGIN
              UPDATE public.social_schedule_operator_review_events_fixture
                SET observation='review_deferred' WHERE request_id=${quote(reviewNote.requestId)}::uuid;
              RAISE EXCEPTION 'OPERATOR_AUDIT_UPDATE_ACCEPTED';
            EXCEPTION WHEN insufficient_privilege THEN
              IF SQLERRM<>'OPERATOR_REVIEW_APPEND_ONLY' THEN RAISE; END IF;
            END $operator_note_guard$;
            DO $operator_delete_guard$ BEGIN
              DELETE FROM public.social_schedule_operator_review_events_fixture;
              RAISE EXCEPTION 'OPERATOR_AUDIT_DELETE_ACCEPTED';
            EXCEPTION WHEN insufficient_privilege THEN
              IF SQLERRM<>'OPERATOR_REVIEW_APPEND_ONLY' THEN RAISE; END IF;
            END $operator_delete_guard$;
            DO $operator_truncate_guard$ BEGIN
              TRUNCATE public.social_schedule_operator_review_events_fixture;
              RAISE EXCEPTION 'OPERATOR_AUDIT_TRUNCATE_ACCEPTED';
            EXCEPTION WHEN insufficient_privilege THEN
              IF SQLERRM<>'OPERATOR_REVIEW_APPEND_ONLY' THEN RAISE; END IF;
            END $operator_truncate_guard$;
            SELECT count(*) FROM public.social_schedule_operator_review_events_fixture;
          `)
          assert.equal(immutability,'2','an audit event was changed or deleted')
          // Revoked native session is denied even while operator membership
          // remains active and the signed JWT has not yet expired.
          assert.equal(sql(`DELETE FROM auth.sessions
            WHERE id=${quote(nativeOperatorSession)}::uuid;
            SELECT count(*) FROM auth.sessions
            WHERE id=${quote(nativeOperatorSession)}::uuid;`),'0')
          const nativeRevoked=httpRole(nativeHistoryPath,nativeHistoryInput,
            'POST',nativeOperatorToken)
          assert.equal(nativeRevoked.status,403,nativeRevoked.body)
          const activeRevocation=sql(`UPDATE public.social_schedule_operator_scope_fixture SET active=false
            WHERE operator_id=${quote(operatorSubject)}::uuid AND project_id=${quote(project)}::uuid;
            SELECT active FROM public.social_schedule_operator_scope_fixture
            WHERE operator_id=${quote(operatorSubject)}::uuid AND project_id=${quote(project)}::uuid;`)
          assert.equal(activeRevocation,'f')
          const afterRevocation=noteCall({...reviewNote,
            requestId:'8ad4eb82-ef95-4142-9706-0cce8b4a3886',
            observation:'review_deferred',candidateId:null})
          assert.equal(afterRevocation.status,403,afterRevocation.body)
          const afterRevokedRead=httpRole(historyPath,historyInput,'POST',operatorToken)
          assert.equal(afterRevokedRead.status,403,afterRevokedRead.body)
          assert.equal(sql('SELECT count(*) FROM public.social_schedule_operator_review_events_fixture'),'2')
          assert.equal(sql('SELECT provider_outcome FROM public.social_schedule_dispatch_intents_fixture'),'unknown',
            'operator observation must not become Meta confirmation')
          assert.equal(sql('SELECT count(*) FROM public.social_schedule_dispatch_intents_fixture'),'1',
            'operator observation must never release/duplicate dispatch intent')
          const unchangedQueue=httpRole('/rpc/social_schedule_dispatch_review_fixture',
            {p_project_id:project},'POST',reviewToken)
          assert.equal(unchangedQueue.status,200,unchangedQueue.body)
          assert.equal(JSON.parse(unchangedQueue.body).items[0].providerOutcome,'unknown')
          assert.equal(JSON.parse(unchangedQueue.body).automaticRetryAllowed,false)
          console.log('CROSS-TREE OPERATOR AUDIT PASS (signed operator identity; two immutable human-only notes; idempotency/revocation/forgery denied; no Meta attestation or dispatch)')
          console.log('CROSS-TREE OPERATOR FACEBOOK EVIDENCE PASS (real scoped SQL inbox; private mocked Meta GET; no proof/write/retry)')
          console.log('CROSS-TREE BROKER REVIEW QUEUE PASS (committed unknown intent visible only to scoped reviewer; published SQL state is NOT Meta proof; no retry/finalize)')
          console.log('CROSS-TREE POSTGREST APPLICATION WORKER PASS (actual TypeScript worker, fake Meta, scoped RPC role)')
        }
      }
      if (scheduleWorkerReplay) {
        sql(`BEGIN;
          ${seed}
          ${reviewedBytes(resolve(web, 'lib/calendar/source-revision-probe.sql')).toString('utf8')}
          INSERT INTO public.calendar_source_revision_probe(owner_user_id,project_id,revision)
            VALUES (${quote(actor)},${quote(project)},1);
          ${gate}
          ${lockedClaim}
          ${claimFile}
          ${recoveryCheckpoint}
          ${roleCandidate.toString('utf8')}
          DO $queue$ BEGIN
            PERFORM public.calendar_source_gate_begin_probe(${quote(project)}::uuid);
          END $queue$;
          UPDATE public.social_schedule_jobs
            SET state='queued',claim_id=null,worker_id=null,lease_expires_at=null
            WHERE id=${quote(id.job)}::uuid;
          COMMIT;`)
        assert.equal(sql('SELECT state FROM public.social_schedule_jobs WHERE id='+quote(id.job)), 'queued')
        const test = spawnSync(process.execPath, [resolve(repo, 'node_modules/vitest/vitest.mjs'),
          'run', 'lib/social-launch/scheduling/isolated-worker-replay.test.ts', '--maxWorkers=1', '--minWorkers=1'], {
          cwd:web, encoding:'utf8', timeout:90000, maxBuffer:1024*1024,
          env:{...process.env,OMNIRA_SCHEDULE_REPLAY_CONTAINER:name,
            OMNIRA_SCHEDULE_REPLAY_PROJECT:project,OMNIRA_SCHEDULE_REPLAY_JOB:id.job},
        })
        assert.equal(test.status, 0, test.stderr+'\n'+test.stdout)
        assert.equal(sql('SELECT state FROM public.social_schedule_jobs WHERE id='+quote(id.job)), 'published')
        console.log('CROSS-TREE APPLICATION WORKER PASS (fake provider response, owned container removed)')
      }
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
  for (const [container,isOwned] of [[gatewayName,gatewayOwned],[restName,restOwned]])
    if (isOwned) assert.equal(docker(['rm','--force',container]).status,0,'owned HTTP container cleanup: '+container)
  if (owned) {
    const state = JSON.parse(docker(['inspect', name]).stdout)[0]
    assert.equal(state.Name, '/' + name)
    assert.equal(state.HostConfig.NetworkMode, scheduleHttpRoleReplay ? httpNetwork : 'none')
    assert.equal(docker(['rm', '--force', name]).status, 0)
  }
  if (networkOwned) assert.equal(docker(['network','rm',httpNetwork]).status,0,'owned HTTP network cleanup')
}
