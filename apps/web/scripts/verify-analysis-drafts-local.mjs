import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { orderReplayMigrations, orderLegacyMediaReplayMigrations } from './analysis-replay-order.mjs'
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
const legacyMediaReplay = legacyCronReplay || process.argv.includes('--mode=legacy-media-replay')
assert.ok([dependencyReplay,legacyCronReplay,process.argv.includes('--mode=legacy-media-replay'),process.argv.includes('--mode=canonical-replay')].filter(Boolean).length<=1, 'select one replay mode')
const replay = dependencyReplay || legacyMediaReplay || process.argv.includes('--mode=canonical-replay')
const name = legacyCronReplay ? 'omnira-atlas-p1-legacy-cron-replay' : legacyMediaReplay ? 'omnira-atlas-p1-legacy-media-replay' : dependencyReplay ? 'omnira-atlas-p1-dependency-replay' : replay ? 'omnira-atlas-p1-canonical-replay' : 'omnira-atlas-p1-local'
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
    'shared_preload_libraries='+(legacyCronReplay ? 'pg_stat_statements,pg_cron,pg_net' : 'pg_stat_statements'),
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
    if(legacyCronReplay) sql('CREATE EXTENSION IF NOT EXISTS pg_cron; CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(name text);')
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
    const cronEntry=legacyCronReplay ? {name:'20260528_pg_cron_setup.sql',sha256:createHash('sha256').update(reviewedBytes(cronFile)).digest('hex')} : null;
    const ordered=legacyMediaReplay ? orderLegacyMediaReplayMigrations(entries,legacyEntry,cronEntry)
      : dependencyReplay ? orderReplayMigrations(entries) : entries.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    if(dependencyReplay || legacyMediaReplay) console.log('LOCAL REPLAY ORDER: hash-pinned media_tables before media_images; all canonical files retained');
    if(legacyMediaReplay) console.log('LOCAL LEGACY MEDIA: one hash-pinned root media_insights migration included; diagnostic only');
    if(legacyCronReplay) console.log('LOCAL LEGACY CRON: hash-pinned root pg_cron setup included; cron launching disabled and network none');
    const files = [
      resolve(repo, 'packages/db/full_schema_run_in_supabase.sql'),
      ...ordered.map(entry=>entry === legacyEntry ? legacyFile : entry === cronEntry ? cronFile : resolve(migrationDir,entry.name)),
    ]
    for (const file of files) {
      const bytes = reviewedBytes(file)
      console.log(
        'REPLAY ' + file.slice(repo.length + 1) + ' sha256=' + createHash('sha256').update(bytes).digest('hex'),
      )
      sql(bytes.toString('utf8'))
    }
    console.log(legacyCronReplay ? 'LEGACY CRON REPLAY PASS' : legacyMediaReplay ? 'LEGACY MEDIA REPLAY PASS' : dependencyReplay ? 'DEPENDENCY REPLAY PASS' : 'CANONICAL REPLAY PASS')
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
