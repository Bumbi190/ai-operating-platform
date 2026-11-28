import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const NAME = 'omnira-website-build-test-20261014'
const PLAN = 'atlas-live-build-20261014'
const RUN_LABEL = 'com.omnira.full-web-run'
const DATABASE = /^website_test_[0-9]+$/
export function makeFixtureRunner({ env = process.env, execute } = {}) {
  if (env.CI !== 'true' || !/^[0-9]+$/.test(env.GITHUB_RUN_ID ?? '') || !/^[0-9]+$/.test(env.GITHUB_RUN_ATTEMPT ?? '')) throw Error('GitHub CI run identity required')
  if (env.DOCKER_HOST || env.DOCKER_CONTEXT) throw Error('Docker endpoint override refused')
  const root = fs.realpathSync(env.RUNNER_TEMP)
  const run = env.GITHUB_RUN_ID + '-' + env.GITHUB_RUN_ATTEMPT
  const recordPath = path.join(root, 'full-web-fixture.json')
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const docker = execute ?? (args => spawnSync('docker', args, { cwd: repo, env, encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024 }))
  function checked(args) {
    const r = docker(args)
    if (r.status !== 0) throw Error('Fixture Docker command failed: ' + (r.stderr || r.error?.message || args[0]))
    return String(r.stdout ?? '').trim()
  }
  function inspect(id) { return JSON.parse(checked(['inspect', '--type', 'container', id]))[0] }
  function owned(info, record, protections = false) {
    if (!/^[a-f0-9]{64}$/.test(record.id ?? '') || record.run !== run || info?.Id !== record.id || info?.Image !== record.image || info?.Config?.Labels?.[RUN_LABEL] !== run || info?.Config?.Labels?.['com.omnira.testplan'] !== PLAN) throw Error('Fixture ownership mismatch')
    if (protections && (info.HostConfig.NetworkMode !== 'none' || info.HostConfig.Privileged || (info.HostConfig.Binds ?? []).length || Object.keys(info.HostConfig.PortBindings ?? {}).length || info.Mounts.some(m => m.Type !== 'tmpfs') || info.Config.User !== 'postgres' || !info.HostConfig.CapDrop.includes('ALL') || !info.HostConfig.SecurityOpt.some(x => x.startsWith('no-new-privileges')))) throw Error('Unsafe temporary fixture configuration')
  }
  function save(record) { fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n') }
  function prepare() {
    if (docker(['inspect', '--type', 'container', NAME]).status === 0) throw Error('Existing fixture name refused; never reuse or restart it')
    if (fs.existsSync(recordPath)) throw Error('Existing fixture record requires cleanup before preparation')
    const context = checked(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
    if (!/^(unix:\/\/|npipe:\/\/)/.test(context)) throw Error('Remote Docker context refused')
    const image = checked(['image', 'inspect', 'postgres:17', '--format', '{{.Id}}'])
    if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw Error('Pinned local PostgreSQL image missing')
    const id = checked(['create', '--name', NAME, '--label', 'com.omnira.testplan=' + PLAN, '--label', RUN_LABEL + '=' + run, '--pull', 'never', '--network', 'none', '--user', 'postgres', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '2g', '--cpus', '2', '--pids-limit', '256', '--restart', 'no', '--tmpfs', '/var/lib/postgresql/data:rw,size=2147483648,mode=1777', '--env', 'PGDATA=/var/lib/postgresql/data/fixture', '--env', 'POSTGRES_PASSWORD=fixture-only', image])
    if (!/^[a-f0-9]{64}$/.test(id)) throw Error('Invalid created fixture identity')
    const record = { id, image, run, stage: 'created' }; save(record)
    owned(inspect(id), record, true)
    checked(['start', id])
    return finish(record)
  }
  async function finish(record) {
    let ready = false
    for (let i = 0; i < 60; i++) {
      if (docker(['exec', record.id, 'pg_isready', '-U', 'postgres']).status === 0) { ready = true; break }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    if (!ready) throw Error('Temporary PostgreSQL did not become ready')
    owned(inspect(record.id), record, true)
    const version = Number(checked(['exec', record.id, 'psql', '-X', '-t', '-A', '-U', 'postgres', '-c', 'show server_version_num']))
    if (Math.floor(version / 10000) !== 17) throw Error('Temporary fixture must use PostgreSQL 17')
    const result = spawnSync(process.execPath, [path.join(repo, 'apps/web/scripts/test-website-build-db.mjs')], { cwd: repo, env: { ...env, WEBSITE_BUILD_TEST_DATABASE_URL: 'postgresql://fixture-only:fixture-only@127.0.0.1:54389/omnira_website_test', WEBSITE_BUILD_TEST_KEEP_DATABASE: '1' }, encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024 })
    fs.writeFileSync(path.join(root, 'website-fixture-bootstrap.stdout.txt'), result.stdout ?? '')
    fs.writeFileSync(path.join(root, 'website-fixture-bootstrap.stderr.txt'), result.stderr ?? '')
    if (result.status !== 0) throw Error('Canonical WebsiteBuild bootstrap failed: ' + (result.stderr || result.error?.message || result.status))
    const database = result.stdout?.match(/^KEEP_DB=(website_test_[0-9]+)$/m)?.[1]
    if (!DATABASE.test(database ?? '')) throw Error('Canonical fixture did not return a safe template name')
    const envFile = path.resolve(env.GITHUB_ENV)
    if (!fs.realpathSync(path.dirname(envFile)).startsWith(root + path.sep) && fs.realpathSync(path.dirname(envFile)) !== root) throw Error('Unsafe GitHub environment file')
    fs.appendFileSync(envFile, 'WEBSITE_BUILD_TEST_TEMPLATE_DATABASE_NAME=' + database + '\n')
    save({ ...record, stage: 'ready', template: database, postgresVersion: version })
    console.log('Canonical temporary WebsiteBuild fixture ready; no host ports or binds')
  }
  function cleanup() {
    if (!fs.existsSync(recordPath)) return
    const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
    if (record.stage === 'removed') return
    if (!/^[a-f0-9]{64}$/.test(record.id ?? '') || record.run !== run) throw Error('Fixture ownership record mismatch')
    owned(inspect(record.id), record)
    checked(['rm', '--force', record.id])
    save({ ...record, stage: 'removed' })
  }
  return { prepare, cleanup }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2]
  Promise.resolve().then(() => {
    const runner = makeFixtureRunner()
    if (mode === 'prepare') return runner.prepare()
    if (mode === 'cleanup') return runner.cleanup()
    throw Error('Expected prepare or cleanup')
  }).catch(error => { console.error(error.message); process.exitCode = 1 })
}
