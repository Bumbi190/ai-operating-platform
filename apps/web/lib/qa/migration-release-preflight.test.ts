import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, renameSync, symlinkSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const modulePath = '../../scripts/migration-release-policy.mjs'
const preflightPath = '../../scripts/migration-release-preflight.mjs'
const policy = await import(modulePath).catch(() => null)
const preflight = await import(preflightPath).catch(() => null)
const sha = (value: string) => createHash('sha256').update(value).digest('hex')
const head = '7c3fc0926e5deb4d0f23237bf993921fb28f830f'
const projectId = 'iboepohjwrhtgshrqaol'
const now = Date.parse('2026-11-12T15:49:34.029Z')
const sql = 'select 1;\n'
const file = '20261104104329_project_total_allowance.sql'
function fixture() {
  const observation: any = {
    schemaVersion: 1,
    purpose: 'read-only-audit-not-release-authority',
    repository: 'Bumbi190/ai-operating-platform',
    sourceHead: head,
    observedAt: '2026-11-12T15:49:34.029Z',
    target: { projectId, databaseName: 'postgres' },
    provenance: { method: 'supabase.execute_sql/read-only', projectId, sqlHashFormat: 'sha256-utf8-statements-joined-with-lf' },
    ledger: [{ name: 'project_total_allowance', version: '20261104104329', rawSha256: sha(sql), statementCount: 1 }],
    sourceManifest: [{ file, sha256: sha(sql) }],
    verifiedSqlEquivalences: [],
    approvedPending: [],
  }
  return {
    observation,
    trustedObservationSha256: sha(JSON.stringify(observation)),
    files: [{ file, sql }],
    target: { projectId, databaseName: 'postgres' },
    currentHead: head,
    expectedHead: head,
    now,
    requestedMigrations: [] as any[],
  }
}
// Re-pinning is only for separately trusted synthetic fixtures, never runtime input.
function trustedFixture(change: (input: ReturnType<typeof fixture>) => void) {
  const input = fixture()
  change(input)
  input.trustedObservationSha256 = sha(JSON.stringify(input.observation))
  return input
}
function run(input: ReturnType<typeof fixture>) { return policy?.evaluateMigrationRelease(input) }
function expectIssue(input: ReturnType<typeof fixture>, code: string) {
  const result = run(input)
  expect(result?.ok).toBe(false)
  expect(result?.allowsMutation).toBe(false)
  expect(result?.issues.map((issue: any) => issue.code)).toContain(code)
}
describe('migration release policy', () => {
  it('blocks the same applied name at a different Git version', () => {
    const input = trustedFixture(x => {
      x.files[0].file = '20261104110000_project_total_allowance.sql'
      x.observation.sourceManifest[0].file = x.files[0].file
    })
    expectIssue(input, 'VERSION_MISMATCH')
  })
  it('accepts a fully matching configuration for read-only planning only', () => {
    expect(run(fixture())).toMatchObject({ ok: true, allowsMutation: false, issues: [], pending: [] })
  })
  it('accepts a later independently reviewed checkout when its complete SQL corpus is unchanged', () => {
    const input = fixture()
    input.currentHead = '1'.repeat(40)
    input.expectedHead = input.currentHead
    // sourceHead is capture provenance; requiring it to contain its own pin is circular.
    expect(input.observation.sourceHead).not.toBe(input.currentHead)
    expect(run(input)).toMatchObject({ ok: true, allowsMutation: false })
  })
  it('rejects a missing external checkout HEAD pin', () => {
    const input = fixture(); input.expectedHead = ''
    expectIssue(input, 'HEAD_MISMATCH')
  })
  it('accepts an explicitly reviewed new pending file and exact plan', () => {
    const input = trustedFixture(x => {
      const pending = { name: 'future_addition', version: '20261113100000', sha256: sha('select 2;\n') }
      x.files.push({ file: pending.version + '_' + pending.name + '.sql', sql: 'select 2;\n' })
      x.observation.sourceManifest.push({ file: x.files[1].file, sha256: pending.sha256 })
      x.observation.approvedPending.push(pending)
      x.requestedMigrations.push({ version: pending.version, name: pending.name })
    })
    expect(run(input)).toMatchObject({ ok: true, allowsMutation: false, pending: [{ version: '20261113100000', name: 'future_addition' }] })
  })
  it.each([
    ['duplicate source version', 'DUPLICATE_SOURCE_VERSION', (x: any) => {
      x.files.push({ file: '20261104104329_other_name.sql', sql })
      x.observation.sourceManifest.push({ file: x.files[1].file, sha256: sha(sql) })
    }],
    ['duplicate source name', 'DUPLICATE_SOURCE_NAME', (x: any) => {
      x.files.push({ file: '20261105104329_project_total_allowance.sql', sql })
      x.observation.sourceManifest.push({ file: x.files[1].file, sha256: sha(sql) })
    }],
    ['duplicate ledger version', 'DUPLICATE_LEDGER_VERSION', (x: any) => {
      x.observation.ledger.push({ ...x.observation.ledger[0], name: 'other_name' })
    }],
    ['duplicate ledger name', 'DUPLICATE_LEDGER_NAME', (x: any) => {
      x.observation.ledger.push({ ...x.observation.ledger[0], version: '20261105104329' })
    }],
    ['version belongs to another name', 'VERSION_NAME_COLLISION', (x: any) => { x.observation.ledger[0].name = 'other_name' }],
    ['unknown source migration', 'MISSING_LEDGER_MIGRATION', (x: any) => { x.observation.ledger = [] }],
    ['remote-only migration', 'REMOTE_ONLY_MIGRATION', (x: any) => {
      x.observation.ledger.push({ ...x.observation.ledger[0], name: 'legacy_only', version: '20261001000000' })
    }],
    ['unknown source file', 'SOURCE_UNKNOWN', (x: any) => { x.observation.sourceManifest = [] }],
    ['missing source file', 'SOURCE_MISSING', (x: any) => { x.files = [] }],
    ['short version', 'INVALID_SOURCE_VERSION', (x: any) => {
      x.files[0].file = '20261104_project_total_allowance.sql'; x.observation.sourceManifest[0].file = x.files[0].file
    }],
    ['malformed name', 'INVALID_SOURCE_FILE', (x: any) => {
      x.files[0].file = '20261104104329_bad-name.sql'; x.observation.sourceManifest[0].file = x.files[0].file
    }],
    ['missing SQL hash', 'MISSING_SQL_HASH', (x: any) => { x.observation.ledger[0].rawSha256 = null }],
    ['incorrect SQL hash', 'SQL_HASH_MISMATCH', (x: any) => { x.observation.ledger[0].rawSha256 = '0'.repeat(64) }],
    ['altered source SQL', 'SOURCE_HASH_MISMATCH', (x: any) => { x.files[0].sql = 'select 999;\n' }],
    ['incorrect database', 'TARGET_MISMATCH', (x: any) => { x.target.databaseName = 'another_database' }],
    ['incorrect project', 'TARGET_MISMATCH', (x: any) => { x.target.projectId = 'aaaaaaaaaaaaaaaaaaaa' }],
    ['inconsistent transport project', 'UNTRUSTED_PROVENANCE', (x: any) => { x.observation.provenance.projectId = 'aaaaaaaaaaaaaaaaaaaa' }],
    ['self-declared capture source', 'UNTRUSTED_PROVENANCE', (x: any) => { x.observation.provenance.method = 'manual-unverified' }],
    ['different repository', 'REPOSITORY_MISMATCH', (x: any) => { x.observation.repository = 'someone/else' }],
    ['different HEAD', 'HEAD_MISMATCH', (x: any) => { x.currentHead = '0'.repeat(40) }],
    ['stale observation', 'STALE_OBSERVATION', (x: any) => { x.now += 15 * 60 * 1000 + 1 }],
    ['future observation', 'FUTURE_OBSERVATION', (x: any) => { x.now -= 60 * 1000 }],
    ['invalid capture time', 'INVALID_OBSERVATION_TIME', (x: any) => { x.observation.observedAt = 'yesterday' }],
    ['invalid clock', 'INVALID_CLOCK', (x: any) => { x.now = NaN }],
    ['invalid ledger version', 'INVALID_LEDGER_ROW', (x: any) => { x.observation.ledger[0].version = 'not_a_version' }],
    ['unapproved pending plan', 'UNAPPROVED_PENDING', (x: any) => { x.requestedMigrations.push({ name: 'unknown', version: '20261113100000' }) }],
    ['applied migration in requested plan', 'ALREADY_APPLIED', (x: any) => { x.requestedMigrations.push({ name: 'project_total_allowance', version: '20261104104329' }) }],
    ['applied name with forged new version', 'ALREADY_APPLIED', (x: any) => { x.requestedMigrations.push({ name: 'project_total_allowance', version: '20261113100000' }) }],
  ])('rejects %s', (_name, code, change) => { expectIssue(trustedFixture(change), code) })
  it('rejects changed observation bytes without a reviewed trust pin update', () => {
    const input = fixture()
    input.observation.ledger[0].version = '20261105104329'
    expectIssue(input, 'UNTRUSTED_OBSERVATION')
  })
  it('rejects absent independent trust pin', () => {
    const input = fixture(); input.trustedObservationSha256 = ''
    expectIssue(input, 'UNTRUSTED_OBSERVATION')
  })
  it('rejects a missing or malformed observation without throwing', () => {
    for (const observation of [undefined, null, [], {}, { ledger: 'wrong' }]) {
      const input = fixture(); input.observation = observation
      expect(run(input)?.ok).toBe(false)
    }
  })
  it('rejects malformed collections without throwing', () => {
    for (const key of ['ledger', 'sourceManifest', 'approvedPending', 'verifiedSqlEquivalences']) {
      const input = trustedFixture(x => { x.observation[key] = null })
      expectIssue(input, 'INVALID_OBSERVATION')
    }
  })
  it('does not silently normalize a new SQL difference', () => {
    const input = trustedFixture(x => { x.observation.ledger[0].rawSha256 = sha('select 1;') })
    expectIssue(input, 'SQL_HASH_MISMATCH')
  })
  it('accepts only a specifically hash-pinned reviewed SQL equivalence', () => {
    const input = trustedFixture(x => {
      x.observation.ledger[0].rawSha256 = sha('select 1;')
      x.observation.verifiedSqlEquivalences = [{
        name: 'project_total_allowance', version: '20261104104329',
        ledgerRawSha256: sha('select 1;'), sourceLfSha256: sha(sql),
      }]
    })
    expect(run(input)?.ok).toBe(true)
    input.files[0].sql = 'select 1;\n\n'
    expectIssue(input, 'SQL_HASH_MISMATCH')
  })
  it('never treats grandfathered names as pending database changes', () => {
    const input = trustedFixture(x => {
      x.files[0].file = '20260520000000_media_images.sql'
      x.observation.sourceManifest[0].file = x.files[0].file
      x.observation.ledger = []
    })
    expectIssue(input, 'MISSING_LEDGER_MIGRATION')
  })
  it('rejects an incomplete approved plan', () => {
    const input = trustedFixture(x => {
      x.observation.approvedPending.push({ name: 'future', version: '20261113100000', sha256: sha(sql) })
    })
    expectIssue(input, 'PENDING_SOURCE_MISSING')
    expectIssue(input, 'PENDING_PLAN_MISMATCH')
  })
})

describe('verified historical debt', () => {
  const observation = JSON.parse(readFileSync(resolve('../../docs/verification/web-studio/2026-11-12-migration-version-audit.json'), 'utf8'))
  // Only these three reviewed historical source copies are fixtures. Runtime
  // preflight still reads the actual catalog and never consults this fixture map.
  const captured = new Map<string, { file: string; sha256: string; sql: string }>(
    (observation.historicalSourceFixtures ?? []).map((entry: any) => [entry.file, entry]),
  )
  const files = observation.sourceManifest.map((entry: any) => ({
    file: entry.file,
    sql: captured.get(entry.file)?.sql ?? readFileSync(resolve('supabase/migrations', entry.file), 'utf8'),
  }))
  const capturedHashes = [
    ['20261104110000_project_total_allowance.sql', '3522149a5519af153655c1f7fbb5348063306af13311edfb344ac8db8ed979e2'],
    ['20261104135920_posthog_approved_read.sql', '31610ee2209085726932b5fc5108b3d4967654b8b39bcd5ddfc07bade741b795'],
    ['20261108094559_webbuilder_prospects.sql', '03dfd37e3749030523094dbdbca20b86a54b410b7be4acfa79f2ed6592b6014c'],
  ] as const
  const input = () => ({ observation, files, target: observation.target, currentHead: head, expectedHead: head,
    trustedObservationSha256: policy?.REVIEWED_OBSERVATION_SHA256, now: Date.parse(observation.observedAt), requestedMigrations: [] })
  it('matches the shipping observation to the independently reviewed shipping trust pin', () => {
    expect(sha(JSON.stringify(observation))).toBe(policy?.REVIEWED_OBSERVATION_SHA256)
  })
  it('finds all 156 real name/version mismatches without allowing release', () => {
    const result = policy?.evaluateMigrationRelease(input())
    expect(result?.ok).toBe(false)
    const actual = result?.issues.filter((x: any) => x.code === 'VERSION_MISMATCH').map((x: any) => x.file).sort()
    expect(actual).toEqual(observation.historicalDebt.versionMismatches.map((x: any) => x.file).sort())
    expect(actual).toHaveLength(156)
  })
  it('finds all 12 shared-version groups covering 39 source files', () => {
    const result = policy?.evaluateMigrationRelease(input())
    const groups = result?.issues.filter((x: any) => x.code === 'DUPLICATE_SOURCE_VERSION')
    expect(groups).toHaveLength(12)
    expect(groups?.flatMap((x: any) => x.files)).toHaveLength(39)
  })
  it.each(['project_total_allowance', 'webbuilder_prospects'])('identifies the recorded %s conflict', name => {
    expect(policy?.evaluateMigrationRelease(input()).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'VERSION_MISMATCH', name }),
    ]))
  })
  it('demonstrates the name-only limitation on the explicit historical 175-file test corpus', async () => {
    const guardPath = '../../scripts/migration-guard-policy.mjs'
    const guard = await import(guardPath)
    // These are explicit historical fixture counts, not a change to active
    // Guard defaults. The separate active-catalog test below uses no overrides.
    const state = guard.inspectCanonicalMigrationFiles(files.map((x: any) => x.file), {
      expectedCanonicalCount: 175, expectedEnforcedCount: 161,
    })
    expect(guard.evaluateAppliedMigrationLedger(observation.ledger.map((x: any) => x.name), state))
      .toMatchObject({ canonicalSqlCount: 175, enforcedCount: 161, appliedLedgerCount: 198 })
    expect(policy?.evaluateMigrationRelease(input()).ok).toBe(false)
  })
  it.each(capturedHashes)('pins the reviewed inactive SQL fixture %s', (file, expectedHash) => {
    const fixture = captured.get(file)
    expect(fixture).toBeDefined()
    expect(sha(fixture!.sql)).toBe(expectedHash)
    expect(fixture!.sha256).toBe(expectedHash)
    expect(observation.sourceManifest.find((entry: any) => entry.file === file)?.sha256).toBe(expectedHash)
  })
  it.each(capturedHashes)('rejects missing active %s even when historical fixture SQL exists', (file) => {
    const result = preflight?.runMigrationReleasePreflight({ ...input(), files: files.filter((entry: any) => entry.file !== file) })
    expect(result).toMatchObject({ ok: false, allowsMutation: false })
    expect(result?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SOURCE_MISSING', file })]))
  })
  it('keeps default active Guard policy separate from the recorded historical corpus', async () => {
    const guardPath = '../../scripts/migration-guard-policy.mjs'
    const guard = await import(guardPath)
    const activeFiles = readdirSync(resolve('supabase/migrations')).filter(file => file.endsWith('.sql'))
    const state = guard.inspectCanonicalMigrationFiles(activeFiles)
    const activeResult = preflight?.runMigrationReleasePreflight({ ...input(),
      files: activeFiles.map(file => ({ file, sql: readFileSync(resolve('supabase/migrations', file), 'utf8') })),
    })
    expect(activeResult).toMatchObject({ ok: false, allowsMutation: false })
    const missingCapturedFiles = capturedHashes.filter(([file]) => !activeFiles.includes(file)).map(([file]) => file)
    for (const file of missingCapturedFiles) {
      expect(activeResult?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SOURCE_MISSING', file })]))
    }
    const checkActualNames = () => guard.evaluateAppliedMigrationLedger(observation.ledger.map((entry: any) => entry.name), state)
    if (missingCapturedFiles.length > 0) expect(checkActualNames).toThrow(/unknown migration name/)
    else expect(checkActualNames).not.toThrow()
  })
})

const temporaryDirs: string[] = []
afterEach(() => { for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
describe('read-only preflight boundary', () => {
  it('accepts matching synthetic input without ever granting mutation authority', () => {
    const input = fixture()
    const result = preflight?.runMigrationReleasePreflight(input)
    expect(result).toMatchObject({ ok: true, allowsMutation: false })
  })
  it('propagates failure rather than producing a reusable success token', () => {
    const input = fixture(); input.now += 900001
    expect(preflight?.runMigrationReleasePreflight(input)).toMatchObject({ ok: false, allowsMutation: false })
  })
  it.each([
    ['--execute', 'anything'], ['--include-all'], ['--yes'], ['--repair'], ['--override'],
    ['--now', '2026-11-12T15:49:34.029Z'], ['--trusted-observation-sha256', '0'.repeat(64)],
    ['db', 'push'], ['--target-project', projectId, '--target-project', projectId],
  ])('CLI rejects unsafe or duplicate arguments: %j', (...argv) => {
    const child = spawnSync(process.execPath, [resolve('scripts/migration-release-preflight.mjs'), ...argv.flat() as string[]], {
      cwd: resolve('.'), encoding: 'utf8', env: { ...process.env, MIGRATION_GUARD_OVERRIDE: '1', SUPABASE_YES: 'true' },
    })
    expect(child.status).toBe(2)
    expect(JSON.parse(child.stdout)).toMatchObject({ ok: false, allowsMutation: false, issues: [{ code: 'INVALID_ARGUMENTS' }] })
  })
  it('does not execute a supplied command after rejecting CLI input', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omnira-migration-no-exec-')); temporaryDirs.push(dir)
    const sentinel = resolve(dir, 'must-not-exist')
    const command = resolve(dir, 'sentinel.cjs')
    writeFileSync(command, 'require("fs").writeFileSync(' + JSON.stringify(sentinel) + ',"MUTATED")')
    const child = spawnSync(process.execPath, [resolve('scripts/migration-release-preflight.mjs'),
      '--target-project', projectId, '--target-database', 'postgres', '--execute', process.execPath, command], {
      cwd: resolve('.'), encoding: 'utf8',
    })
    expect(child.status).toBe(2)
    expect(existsSync(sentinel)).toBe(false)
  })
  it('never invokes an extra executor property after either success or failure', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omnira-migration-boundary-')); temporaryDirs.push(dir)
    const sentinel = resolve(dir, 'must-not-exist')
    for (const valid of [true, false]) {
      const input = fixture()
      if (!valid) input.now += 900001
      const result = preflight?.runMigrationReleasePreflight({ ...input,
        execute: () => writeFileSync(sentinel, 'MUTATED'),
      })
      expect(result?.ok).toBe(valid)
      expect(result?.allowsMutation).toBe(false)
      expect(existsSync(sentinel)).toBe(false)
    }
  })
  it('CLI returns nonzero for the actual historical debt even with override environment', () => {
    const child = spawnSync(process.execPath, [resolve('scripts/migration-release-preflight.mjs'),
      '--target-project', projectId, '--target-database', 'postgres', '--expected-head', head], {
      cwd: resolve('.'), encoding: 'utf8', env: { ...process.env, MIGRATION_GUARD_OVERRIDE: '1', SUPABASE_YES: 'true' },
    })
    expect(child.status).toBe(1)
    const result = JSON.parse(child.stdout)
    expect(result).toMatchObject({ ok: false, allowsMutation: false })
    expect(result.issues.some((x: any) => x.code === 'VERSION_MISMATCH')).toBe(true)
    expect(result.issues.some((x: any) => x.code === 'UNTRUSTED_OBSERVATION')).toBe(false)
  })
})

describe('preflight descriptor and path integrity',()=>{
  function readCase(mode:string){
    const dir=mkdtempSync(resolve(tmpdir(),'omnira-preflight-read-'));temporaryDirs.push(dir)
    const dataDir=resolve(dir,'input');mkdirSync(dataDir)
    const victim=resolve(dataDir,'observation.json'),replacement=resolve(dir,'replacement.json')
    const original=readFileSync(resolve('../../docs/verification/web-studio/2026-11-12-migration-version-audit.json'))
    writeFileSync(victim,original);writeFileSync(replacement,original)
    const events=resolve(dir,'events.json'),hook=resolve(dir,'read-hook.cjs')
    if(mode==='symlink') { unlinkSync(victim);symlinkSync(replacement,victim,'file') }
    if(mode==='parent-link'){
      const actual=resolve(dir,'actual');renameSync(dataDir,actual);symlinkSync(actual,dataDir,'junction')
    }
    if(mode==='directory'){unlinkSync(victim);mkdirSync(victim)}
    if(mode==='oversized')writeFileSync(victim,Buffer.alloc(5*1024*1024+1,32))
    writeFileSync(hook,[
      "const fs=require('node:fs'),path=require('node:path'),{syncBuiltinESMExports}=require('node:module');",
      'const victim='+JSON.stringify(victim)+',replacement='+JSON.stringify(replacement)+',events='+JSON.stringify(events)+',mode='+JSON.stringify(mode)+';',
      'const raw={open:fs.openSync,stat:fs.lstatSync,read:fs.readSync,readFile:fs.readFileSync,write:fs.writeFileSync,rename:fs.renameSync,copy:fs.copyFileSync,symlink:fs.symlinkSync,append:fs.appendFileSync};',
      'let targetFd,triggered=false;',
      "const matches=p=>typeof p==='string'&&path.resolve(p)===victim;",
      'const trigger=kind=>{',
      'if(triggered)return;triggered=true;',
      "if(kind==='replace'||kind==='symlink'){raw.rename(victim,victim+'.old');if(kind==='symlink')raw.symlink(replacement,victim,'file');else raw.copy(replacement,victim)}",
      "else if(kind==='grow')raw.append(victim,Buffer.alloc(5*1024*1024+1,32));",
      "else if(kind==='rewrite')raw.write(victim,Buffer.from('CHANGED CONTENT'));",
      'raw.write(events,JSON.stringify({mode,triggered,kind}));};',
      "fs.openSync=(p,...args)=>{const fd=raw.open(p,...args);if(matches(p)){targetFd=fd;if(mode==='replace-after-open')trigger('replace')}return fd;};",
      "fs.lstatSync=(p,...args)=>{const stat=raw.stat(p,...args);if(matches(p)&&mode==='replace-after-stat')trigger('replace');if(matches(p)&&mode==='symlink-after-stat')trigger('symlink');return stat;};",
      "fs.readSync=(fd,...args)=>{const count=raw.read(fd,...args);if(fd===targetFd&&count>0&&mode==='grow-during-read')trigger('grow');if(fd===targetFd&&count>0&&mode==='rewrite-during-read')trigger('rewrite');return count;};",
      "fs.readFileSync=(p,...args)=>{const data=raw.readFile(p,...args);if(matches(p)){if(mode==='replace-after-open')trigger('replace');if(mode==='grow-during-read')trigger('grow');if(mode==='rewrite-during-read')trigger('rewrite')}return data;};",
      'syncBuiltinESMExports();',
    ].join('\n'))
    const child=spawnSync(process.execPath,['--require',hook,resolve('scripts/migration-release-preflight.mjs'),
      '--target-project',projectId,'--target-database','postgres','--expected-head',head,
      '--observation-file',mode==='missing'?resolve(dir,'missing.json'):victim],{
      cwd:resolve('.'),encoding:'utf8',timeout:10000,
    })
    expect(child.error).toBeUndefined()
    return {child,result:JSON.parse(child.stdout),events:existsSync(events)?JSON.parse(readFileSync(events,'utf8')):null}
  }
  it('reads a stable real observation and still blocks historical database release',()=>{
    const {child,result}=readCase('stable')
    expect(child.status).toBe(1)
    expect(result).toMatchObject({ok:false,allowsMutation:false})
    expect(result.issues.filter((x:any)=>x.code==='VERSION_MISMATCH')).toHaveLength(156)
    expect(result.issues.some((x:any)=>['INVALID_INPUT_FILE','INPUT_READ_FAILED'].includes(x.code))).toBe(false)
  })
  it.each(['replace-after-stat','symlink-after-stat','replace-after-open','grow-during-read','rewrite-during-read'])(
    'fails closed after a real filesystem change: %s',mode=>{
      const {child,result,events}=readCase(mode)
      expect(events).toMatchObject({mode,triggered:true})
      expect(child.status).toBe(2)
      expect(result).toMatchObject({ok:false,allowsMutation:false,pending:[]})
      expect(result.issues).toEqual([{code:'INVALID_INPUT_FILE'}])
    })
  it.each(['symlink','parent-link','directory','oversized','missing'])('rejects unsafe or invalid input path: %s',mode=>{
    const {child,result}=readCase(mode)
    expect(child.status).toBe(2)
    expect(result).toMatchObject({ok:false,allowsMutation:false,pending:[]})
    expect(result.issues[0].code).toMatch(/^(INVALID_INPUT_FILE|INPUT_READ_FAILED)$/)
  })
})
