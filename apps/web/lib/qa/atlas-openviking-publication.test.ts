import { createServer, type RequestListener, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'
import { createKnowledgeProjectionSource } from '@/lib/atlas/knowledge/projection/source'
import { buildKnowledgeSnapshot } from '@/lib/atlas/knowledge/projection/snapshot'
import { parseCorpus, knowledgeRoot } from '@/lib/atlas/openviking/corpus'
import { prepareCorpus, synchronizeCorpus } from '@/lib/atlas/openviking/publish'

const PROJECT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const dirs: string[] = []
const servers: Server[] = []
function vault() { const path = mkdtempSync(join(tmpdir(), 'atlas-ov-')); dirs.push(path); return path }
function note(body: string, extra = '') {
  return '---\ntype: project\nstatus: approved\nclassification: internal\nscope: project\nproject: pilot\nsource_of_truth: vault\n' + extra + '---\n# Pilot\n' + body
}
function source(root: string) { return createKnowledgeProjectionSource({ vaultRoot: root, projectScopeMap: { pilot: PROJECT, other: OTHER } }) }
function corpus() {
  const snapshot = buildKnowledgeSnapshot([{
    path: 'pilot.md', title: 'Pilot', type: 'project', classification: 'internal',
    scope: { kind: 'project', projectId: PROJECT }, sourceOfTruth: 'vault', content: '# Pilot\nOriginal knowledge.',
  }])
  return parseCorpus({ projectId: PROJECT, projectSlug: 'pilot', manifest: snapshot.manifest, documentsJsonl: snapshot.documentsJsonl })!
}
async function server(handler: RequestListener) {
  const value = createServer(handler); servers.push(value)
  await new Promise<void>((resolve) => value.listen(0, '127.0.0.1', resolve))
  return 'http://127.0.0.1:' + (value.address() as AddressInfo).port
}
afterEach(async () => {
  for (const value of servers.splice(0)) {
    value.closeAllConnections()
    await new Promise<void>((resolve) => value.close(() => resolve()))
  }
  for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true })
})
describe('publication through existing eligibility policy', () => {
  it('publishes only approved permitted knowledge for the selected project', () => {
    const root = vault()
    writeFileSync(join(root, 'good.md'), note('Useful knowledge.'))
    writeFileSync(join(root, 'draft.md'), note('Draft.').replace('status: approved', 'status: draft'))
    writeFileSync(join(root, 'local.md'), note('Local.').replace('classification: internal', 'classification: local_only'))
    writeFileSync(join(root, 'confidential.md'), note('Confidential.').replace('classification: internal', 'classification: confidential'))
    writeFileSync(join(root, 'other.md'), note('Other project.').replace('project: pilot', 'project: other'))
    const prepared = prepareCorpus(source(root), { projectId: PROJECT, projectSlug: 'pilot' })
    const parsed = parseCorpus(prepared)!
    expect(parsed.documents.map((doc) => doc.path)).toEqual(['good.md'])
    expect(parsed.documents[0].content).toContain('Useful knowledge')
  })
  it('refuses a source changed after eligibility was assessed', () => {
    const root = vault()
    const path = join(root, 'good.md')
    writeFileSync(path, note('Original.'))
    const delegate = source(root)
    expect(() => prepareCorpus({
      ...delegate,
      readDocument(relativePath) { writeFileSync(path, note('Changed.')); return delegate.readDocument(relativePath) },
    }, { projectId: PROJECT, projectSlug: 'pilot' })).toThrow(/changed/)
  })
  it('returns an explicit empty publication when no notes qualify', () => {
    const prepared = prepareCorpus(source(vault()), { projectId: PROJECT, projectSlug: 'pilot' })
    expect(parseCorpus(prepared)?.documents).toEqual([])
  })
})
describe('explicit synchronization over real HTTP', () => {
  it('uploads to exact identifiers, waits for completion, and returns a receipt', async () => {
    const value = corpus()
    const calls: string[] = []
    let destination = ''
    let polls = 0
    const baseUrl = await server(async (req, res) => {
      calls.push(req.method + ' ' + req.url)
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk)
      const raw = Buffer.concat(chunks).toString()
      if (req.url === '/api/v1/resources/temp_upload') {
        expect(req.headers['content-type']).toContain('multipart/form-data')
        expect(raw).toContain('Original knowledge.')
        res.end(JSON.stringify({ status: 'ok', result: { temp_file_id: 'upload-1' } }))
      } else if (req.url === '/api/v1/resources') {
        const body = JSON.parse(raw)
        destination = body.to
        expect(body.reason).toBeUndefined()
        res.end(JSON.stringify({ status: 'ok', result: { root_uri: body.to, task_id: 'task-1' } }))
      } else {
        polls++
        res.end(JSON.stringify({ status: 'ok', result: { status: polls === 1 ? 'running' : 'completed' } }))
      }
    })
    const receipt = await synchronizeCorpus({ config: { baseUrl, apiKey: 'key', timeoutMs: 500 }, corpus: value, pollIntervalMs: 1 })
    expect(destination).toBe(knowledgeRoot(value) + '/' + value.documents[0].id + '.md')
    expect(polls).toBe(2)
    expect(receipt).toMatchObject({ snapshotId: value.snapshotId, documents: 1, ready: true })
    expect(calls).toHaveLength(4)
  })
  it('never treats queue acceptance as completed indexing', async () => {
    const baseUrl = await server(async (req, res) => {
      for await (const _chunk of req) { /* drain */ }
      const result = req.url?.includes('temp_upload') ? { temp_file_id: 'upload' } : { status: 'accepted' }
      res.end(JSON.stringify({ status: 'ok', result }))
    })
    await expect(synchronizeCorpus({ config: { baseUrl, apiKey: 'key', timeoutMs: 500 }, corpus: corpus(), pollIntervalMs: 1 })).rejects.toThrow()
  })
  it('fails when the server changes an explicit destination', async () => {
    const baseUrl = await server(async (req, res) => {
      for await (const _chunk of req) { /* drain */ }
      res.end(JSON.stringify({ status: 'ok', result: req.url?.includes('temp_upload') ?
        { temp_file_id: 'upload' } : { root_uri: 'viking://resources/other', task_id: 'task' } }))
    })
    await expect(synchronizeCorpus({ config: { baseUrl, apiKey: 'key', timeoutMs: 500 }, corpus: corpus() })).rejects.toThrow()
  })
  it('bounds jobs that remain pending and does not expose server error bodies', async () => {
    const value = corpus()
    const baseUrl = await server(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk)
      const result = req.url?.includes('temp_upload') ? { temp_file_id: 'upload' } :
        req.url === '/api/v1/resources' ? { root_uri: JSON.parse(Buffer.concat(chunks).toString()).to, task_id: 'task' } :
        { status: 'running', error: 'PRIVATE SOURCE TEXT' }
      res.end(JSON.stringify({ status: 'ok', result }))
    })
    await expect(synchronizeCorpus({ config: { baseUrl, apiKey: 'key', timeoutMs: 500 }, corpus: value, deadlineMs: 50, pollIntervalMs: 1 })).rejects.toThrow('synchronization failed')
  })
  it('rejects completed tasks whose processing report contains failures', async () => {
    const baseUrl = await server(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk)
      const result = req.url?.includes('temp_upload') ? { temp_file_id: 'upload' } :
        req.url === '/api/v1/resources' ? { root_uri: JSON.parse(Buffer.concat(chunks).toString()).to, task_id: 'task' } :
        { status: 'completed', result: { semantic: { error_count: 1 } } }
      res.end(JSON.stringify({ status: 'ok', result }))
    })
    await expect(synchronizeCorpus({ config: { baseUrl, apiKey: 'key', timeoutMs: 500 }, corpus: corpus() })).rejects.toThrow('synchronization failed')
  })
  it('prunes only the previous snapshot subtree for an explicit same-project receipt', async () => {
    const old = corpus()
    const empty = buildKnowledgeSnapshot([])
    const revoked = parseCorpus({ projectId: PROJECT, projectSlug: 'pilot', manifest: empty.manifest, documentsJsonl: '' })!
    const calls: string[] = []
    const baseUrl = await server((req, res) => {
      calls.push(req.method + ' ' + req.url)
      const uri = new URL(req.url!, 'http://fixture').searchParams.get('uri')
      res.end(JSON.stringify({ status: 'ok', result: { uri } }))
    })
    expect(await synchronizeCorpus({ config: { baseUrl, apiKey: 'key', timeoutMs: 500 }, corpus: revoked, previous: old })).toMatchObject({ ready: true, documents: 0 })
    expect(calls).toEqual(['DELETE /api/v1/fs?uri=' + encodeURIComponent(knowledgeRoot(old)) + '&recursive=true'])
  })
  it('will not prune a different project', async () => {
    const value = corpus()
    let calls = 0
    const baseUrl = await server((_req, res) => { calls++; res.end('{}') })
    await expect(synchronizeCorpus({ config: { baseUrl, apiKey: 'key', timeoutMs: 500 }, corpus: value, previous: { ...value, projectId: OTHER } })).rejects.toThrow()
    expect(calls).toBe(0)
  })
})
