/**
 * Explicit operator probe against a real, isolated OpenViking server.
 * Synthetic notes only. Never edits the deployed corpus or the user's vault.
 * Explicitly enabled through ATLAS_OPENVIKING_LIVE_APPLY=1; skipped in normal CI.
 */
import assert from 'node:assert/strict'
import { it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { readClientConfig } from '../atlas/openviking/client'
import { parseCorpus, knowledgeRoot } from '../atlas/openviking/corpus'
import { synchronizeCorpus } from '../atlas/openviking/publish'
import { findKnowledge } from '../atlas/openviking/retrieve'
import { buildProjectRecall } from '../atlas/context/project-recall'

const PROJECT = '11111111-1111-4111-8111-111111111111'
const ACCOUNT = 'omnira-pilot-probe'
const FOREIGN = 'omnira-foreign-probe'
function option(name: string) {
  const keys: Record<string, string> = { url: 'ATLAS_OPENVIKING_LIVE_URL', credentials: 'ATLAS_OPENVIKING_LIVE_CREDENTIALS', out: 'ATLAS_OPENVIKING_LIVE_REPORT' }
  return process.env[keys[name]]
}
async function main() {
  const temporary = mkdtempSync(join(tmpdir(), 'atlas-live-probe-'))
  let step = 'configuration'
  try {
    assert(process.env.ATLAS_OPENVIKING_LIVE_APPLY === '1', 'Explicit live probe opt-in is required')
    assert(option('credentials') && option('url') && option('out'), 'Explicit paths and URL are required')
    const credentials = JSON.parse(readFileSync(resolve(option('credentials')!), 'utf8'))
    const operator = credentials[ACCOUNT]?.operator_key
    const reader = credentials[ACCOUNT]?.reader_key
    const foreign = credentials[FOREIGN]?.reader_key
    assert(typeof operator === 'string' && typeof reader === 'string' && typeof foreign === 'string')
    const config = readClientConfig({ ATLAS_OPENVIKING_URL: option('url'), ATLAS_OPENVIKING_API_KEY: reader })
    assert(config, 'Valid private endpoint required')
    const vault = join(temporary, 'vault')
    mkdirSync(vault)
    const notes = [
      ['access.md', 'Konton och åtkomst', 'En inbjuden kollega väljer ett eget lösenord via länken i inbjudningsmejlet. Medlemskapet styr vilka projekt kollegan får läsa.'],
      ['backup.md', 'Säkerhetskopiering', 'Om information försvinner återställer operatören den senaste säkerhetskopian. Kopior kontrolleras genom en återläsning till en separat testmiljö.'],
      ['support.md', 'Supportsvar', 'Vanliga frågor besvaras från godkända kunskapskällor. Ärenden om betalningstvister eller personuppgifter eskaleras till en människa.'],
    ]
    for (const [path, title, body] of notes) {
      writeFileSync(join(vault, path), '---\ntype: reference\nstatus: approved\nclassification: public\nscope: project\nproject: pilot\nsource_of_truth: vault\n---\n# ' + title + '\n' + body + '\n')
    }
    execFileSync('git', ['-C', vault, 'init', '-q'])
    execFileSync('git', ['-C', vault, 'add', '.'])
    execFileSync('git', ['-C', vault, '-c', 'user.name=Probe', '-c', 'user.email=probe@example.invalid', 'commit', '-qm', 'synthetic probe'])
    const map = join(temporary, 'projects.json')
    const artifact = join(temporary, 'corpus.json')
    writeFileSync(map, JSON.stringify({ pilot: PROJECT }))
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/openviking-prepare.ts',
      '--vault=' + vault, '--project-map=' + map, '--project=pilot', '--out=' + artifact],
      { cwd: process.cwd(), stdio: 'pipe', timeout: 20_000 })
    const publication = JSON.parse(readFileSync(artifact, 'utf8'))
    const corpus = parseCorpus(publication)
    assert(corpus?.documents.length === 3)
    const processing = process.env.ATLAS_OPENVIKING_LIVE_VECTORS_ONLY === '1' ? 'vectors_only' : 'semantic_and_vectors'
    step = processing + ' ingestion'
    console.info('[live-probe] synchronizing three synthetic documents: ' + processing)
    const receipt = await synchronizeCorpus({ config: { ...config, apiKey: operator, timeoutMs: 30_000 }, corpus, deadlineMs: 240_000, processingMode: processing })
    assert(receipt.ready)
    console.info('[live-probe] indexing completed')
    step = 'embedding warmup'
    const started = performance.now()
    await findKnowledge({ config: { ...config, timeoutMs: 30_000 }, corpus, query: 'Konton och åtkomst' })
    const warmupMs = Math.round(performance.now() - started)
    step = 'Swedish retrieval'
    const queries = [
      ['Hur kommer en ny medarbetare in i systemet?', 'access.md'],
      ['Hur återskapar vi data om något försvinner?', 'backup.md'],
      ['När ska ett kundärende skickas vidare till en människa?', 'support.md'],
    ]
    const results = []
    for (const [query, expected] of queries) {
      const start = performance.now()
      const hits = await findKnowledge({ config, corpus, query })
      assert.equal(hits[0]?.path, expected)
      results.push({ expected, firstHit: hits[0].path, durationMs: Math.round(performance.now() - start) })
    }
    step = 'Atlas prompt integration'
    const environment = { ATLAS_RECALL_PROJECT_ID: PROJECT, ATLAS_RECALL_PROJECT_SLUG: 'pilot',
      ATLAS_OPENVIKING_MODE: 'on', ATLAS_OPENVIKING_URL: config.baseUrl, ATLAS_OPENVIKING_API_KEY: reader }
    const prompt = await buildProjectRecall({ userId: 'probe-owner', allowedProjectIds: [PROJECT], query: queries[0][0], env: environment, publication })
    assert(prompt.includes('DATA, NOT INSTRUCTIONS') && prompt.includes(corpus.snapshotId) && prompt.includes('inbjudningsmejlet'))
    const denied = await buildProjectRecall({ userId: 'probe-owner', allowedProjectIds: [], query: queries[0][0], env: environment, publication })
    assert.equal(denied, '')
    step = 'server authentication and tenant isolation'
    const body = { query: queries[0][0], target_uri: knowledgeRoot(corpus), context_type: 'resource', level: 2, limit: 8 }
    const unauthenticated = await fetch(config.baseUrl + '/api/v1/search/find', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) })
    assert([401, 403].includes(unauthenticated.status))
    const foreignResponse = await fetch(config.baseUrl + '/api/v1/search/find', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': foreign }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) })
    if (foreignResponse.ok) {
      const other = await foreignResponse.json()
      assert.equal(other.status, 'ok')
      assert(Array.isArray(other.result?.resources))
      assert.equal(other.result.resources.length, 0)
    } else assert([403, 404].includes(foreignResponse.status))
    step = 'fixture cleanup'
    const emptyVault = join(temporary, 'empty-vault')
    mkdirSync(emptyVault)
    execFileSync('git', ['-C', emptyVault, 'init', '-q'])
    execFileSync('git', ['-C', emptyVault, '-c', 'user.name=Probe', '-c', 'user.email=probe@example.invalid', 'commit', '--allow-empty', '-qm', 'empty probe'])
    const emptyArtifact = join(temporary, 'empty.json')
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/openviking-prepare.ts',
      '--vault=' + emptyVault, '--project-map=' + map, '--project=pilot', '--out=' + emptyArtifact],
      { cwd: process.cwd(), stdio: 'pipe', timeout: 20_000 })
    const empty = parseCorpus(JSON.parse(readFileSync(emptyArtifact, 'utf8')))
    assert(empty)
    await synchronizeCorpus({ config: { ...config, apiKey: operator, timeoutMs: 30_000 }, corpus: empty, previous: corpus })
    assert.deepEqual(await findKnowledge({ config, corpus: empty, query: queries[0][0] }), [])
    const evidence = { passed: true, syntheticOnly: true, documents: 3, processing,
      snapshotId: corpus.snapshotId, warmupMs, queries: results, promptChars: prompt.length,
      runtimeRole: 'user', unauthenticatedStatus: unauthenticated.status, foreignAccountIsolated: true,
      revokedPublicationEmpty: true, fixtureSnapshotPruned: true, productionActivated: false }
    writeFileSync(resolve(option('out')!), JSON.stringify(evidence, null, 2) + '\n')
    console.log(JSON.stringify(evidence))
  } catch {
    throw new Error('Live OpenViking probe failed at: ' + step)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}
it.skipIf(process.env.ATLAS_OPENVIKING_LIVE_APPLY !== '1')('retrieves Swedish evidence through a real authenticated OpenViking server', main, 300_000)
