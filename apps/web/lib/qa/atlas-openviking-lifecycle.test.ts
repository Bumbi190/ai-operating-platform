/**
 * Explicit real-service lifecycle acceptance. Synthetic Git vaults only.
 * Existing manual-preview publication and real Obsidian vault are never edited.
 */
import assert from 'node:assert/strict'
import { it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { readClientConfig } from '../atlas/openviking/client'
import { parseCorpus, type PublishedCorpus } from '../atlas/openviking/corpus'
import { synchronizeCorpus } from '../atlas/openviking/publish'
import { findKnowledge } from '../atlas/openviking/retrieve'
import { buildProjectRecall } from '../atlas/context/project-recall'

const PROJECT = '33333333-3333-4333-8333-333333333333'
const OTHER = '44444444-4444-4444-8444-444444444444'
const OLD = 'FROST-1834'
const NEW = 'SOMMAR-9281'
const KEEP = 'LIND-6529'
const FOREIGN = 'OTHER-6235'
it.skipIf(process.env.ATLAS_OPENVIKING_LIFECYCLE_APPLY !== '1')(
  'updates and revokes deployed knowledge while stale remote snapshots remain', async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'atlas-lifecycle-'))
    const runId = randomUUID()
    let step = 'configuration'
    try {
      const url = process.env.ATLAS_OPENVIKING_LIVE_URL
      const credentialsPath = process.env.ATLAS_OPENVIKING_LIVE_CREDENTIALS
      const reportPath = process.env.ATLAS_OPENVIKING_LIFECYCLE_REPORT
      assert(url && credentialsPath && reportPath, 'Explicit private endpoint and paths required')
      const credentials = JSON.parse(readFileSync(resolve(credentialsPath), 'utf8'))
      const operator = credentials['omnira-pilot-probe']?.operator_key
      const reader = credentials['omnira-pilot-probe']?.reader_key
      assert(typeof operator === 'string' && typeof reader === 'string')
      const parsedConfig = readClientConfig({ ATLAS_OPENVIKING_URL: url, ATLAS_OPENVIKING_API_KEY: reader })
      assert(parsedConfig)
      const config = parsedConfig
      const admin = { ...config, apiKey: operator, timeoutMs: 30_000 }
      const processing = process.env.ATLAS_OPENVIKING_LIVE_VECTORS_ONLY === '1'
        ? 'vectors_only' as const : 'semantic_and_vectors' as const
      const map = join(temporary, 'projects.json')
      writeFileSync(map, JSON.stringify({ lifecycle: PROJECT, 'lifecycle-foreign': OTHER }))
      function git(vault: string, args: string[]) {
        execFileSync('git', ['-C', vault, ...args], { stdio: 'pipe', timeout: 20_000 })
      }
      function note(vault: string, path: string, slug: string, title: string, body: string) {
        writeFileSync(join(vault, path), '---\ntype: reference\nstatus: approved\nclassification: public\nscope: project\nproject: ' +
          slug + '\nsource_of_truth: vault\n---\n# ' + title + '\nSynthetic lifecycle fixture ' + runId + '.\n' + body + '\n')
      }
      function prepare(vault: string, slug: string) {
        git(vault, ['add', '-A'])
        git(vault, ['-c', 'user.name=Probe', '-c', 'user.email=probe@example.invalid', 'commit', '-qm', 'synthetic lifecycle revision'])
        const artifact = join(temporary, 'corpus.json')
        execFileSync(process.execPath, ['--import', 'tsx', 'scripts/openviking-prepare.ts',
          '--vault=' + vault, '--project-map=' + map, '--project=' + slug, '--out=' + artifact],
          { cwd: process.cwd(), stdio: 'pipe', timeout: 20_000 })
        const publication = JSON.parse(readFileSync(artifact, 'utf8'))
        const corpus = parseCorpus(publication)
        assert(corpus)
        return { publication, corpus }
      }
      const vault = join(temporary, 'vault')
      mkdirSync(vault)
      git(vault, ['init', '-q'])
      note(vault, 'control.md', 'lifecycle', 'Kontrollkod', 'Minnespilotens kontrollkod är ' + OLD + '.')
      note(vault, 'support.md', 'lifecycle', 'Supporteskalering', 'Betalningstvister går till en människa. Supportens kontrollkod är ' + KEEP + '.')
      const a = prepare(vault, 'lifecycle')
      note(vault, 'control.md', 'lifecycle', 'Kontrollkod', 'Minnespilotens kontrollkod är ' + NEW + '.')
      const b = prepare(vault, 'lifecycle')
      rmSync(join(vault, 'control.md'))
      const c = prepare(vault, 'lifecycle')
      rmSync(join(vault, 'support.md'))
      const empty = prepare(vault, 'lifecycle')
      assert.equal(a.corpus.documents.length, 2)
      assert.equal(b.corpus.documents.length, 2)
      assert.equal(c.corpus.documents.length, 1)
      assert.equal(empty.corpus.documents.length, 0)
      assert.equal(new Set([a, b, c, empty].map(x => x.corpus.snapshotId)).size, 4)
      const otherVault = join(temporary, 'foreign')
      mkdirSync(otherVault)
      git(otherVault, ['init', '-q'])
      note(otherVault, 'control.md', 'lifecycle-foreign', 'Annat projekt', 'Det andra projektets kontrollkod är ' + FOREIGN + '.')
      const other = prepare(otherVault, 'lifecycle-foreign')
      const ingestion: { revision: string; documents: number; durationMs: number }[] = []
      for (const [revision, current] of [['A', a], ['B', b], ['C', c], ['foreign', other]] as const) {
        step = 'ingestion ' + revision
        console.info('[lifecycle] indexing revision ' + revision)
        const started = performance.now()
        const receipt = await synchronizeCorpus({ config: admin, corpus: current.corpus,
          deadlineMs: 240_000, processingMode: processing })
        assert(receipt.ready)
        ingestion.push({ revision, documents: current.corpus.documents.length, durationMs: Math.round(performance.now() - started) })
      }
      step = 'warmup'
      await findKnowledge({ config: { ...config, timeoutMs: 90_000 }, corpus: b.corpus, query: 'Minnespilotens kontrollkod' })
      async function contains(corpus: PublishedCorpus, query: string, code: string) {
        const hits = await findKnowledge({ config, corpus, query })
        assert(hits.some(hit => hit.content.includes(code)), 'Expected original evidence from ' + corpus.projectSlug)
      }
      const env = { ATLAS_RECALL_PROJECT_ID: PROJECT, ATLAS_RECALL_PROJECT_SLUG: 'lifecycle',
        ATLAS_OPENVIKING_MODE: 'on', ATLAS_OPENVIKING_URL: url, ATLAS_OPENVIKING_API_KEY: reader }
      async function prompt(publication: unknown, query: string, viewProjectSlug?: string, allowedProjectIds = [PROJECT]) {
        return buildProjectRecall({ userId: 'probe-owner', allowedProjectIds, viewProjectSlug, query, env, publication })
      }
      step = 'updated publication with stale A retained'
      await contains(a.corpus, 'Minnespilotens kontrollkod', OLD)
      const updated = await prompt(b.publication, 'Minnespilotens kontrollkod')
      assert(updated.includes(NEW) && updated.includes(b.corpus.snapshotId))
      assert(!updated.includes(OLD) && !updated.includes(a.corpus.snapshotId))
      step = 'removed document with stale A and B retained'
      await contains(b.corpus, 'Minnespilotens kontrollkod', NEW)
      const removed = await prompt(c.publication, 'Vilken kontrollkod använder supporten?')
      assert(removed.includes(KEEP) && removed.includes(c.corpus.snapshotId))
      assert(!removed.includes(OLD) && !removed.includes(NEW) && !removed.includes('control.md'))
      step = 'empty publication and project gates before remote deletion'
      assert.equal(await prompt(empty.publication, 'Minnespilotens kontrollkod'), '')
      assert.equal(await prompt(b.publication, 'Minnespilotens kontrollkod', 'lifecycle-foreign'), '')
      assert.equal(await prompt(b.publication, 'Minnespilotens kontrollkod', undefined, []), '')
      step = 'targeted prune of A'
      await synchronizeCorpus({ config: admin, corpus: empty.corpus, previous: a.corpus })
      step = 'pruned A is absent'
      assert.deepEqual(await findKnowledge({ config, corpus: a.corpus, query: 'Minnespilotens kontrollkod' }), [])
      step = 'newer B survives pruning A'
      await contains(b.corpus, 'Minnespilotens kontrollkod', NEW)
      step = 'newer C survives pruning A'
      await contains(c.corpus, 'Supporteskalering', KEEP)
      step = 'other project survives pruning A'
      await contains(other.corpus, 'Det andra projektets kontrollkod', FOREIGN)
      step = 'cleanup remaining own fixtures'
      for (const previous of [b.corpus, c.corpus, other.corpus]) {
        await synchronizeCorpus({ config: admin,
          corpus: { ...empty.corpus, projectId: previous.projectId, projectSlug: previous.projectSlug }, previous })
        assert.deepEqual(await findKnowledge({ config, corpus: previous, query: 'Kontrollkod' }), [])
      }
      const evidence = { passed: true, syntheticOnly: true, processing, ingestion,
        snapshots: { original: a.corpus.snapshotId, updated: b.corpus.snapshotId, removed: c.corpus.snapshotId },
        changedSourceUsesNewOriginal: true, oldSnapshotStillSearchableBeforePrune: true,
        removedSourceExcludedBeforePrune: true, emptyPublicationRevokesBeforePrune: true,
        deniedMembershipEmpty: true, otherViewEmpty: true, targetedPrunePreservesNewerSnapshots: true,
        targetedPrunePreservesOtherProject: true, fixtureSnapshotsPruned: true,
        manualPreviewPublicationEdited: false, actualVaultEdited: false, productionActivated: false }
      writeFileSync(resolve(reportPath), JSON.stringify(evidence, null, 2) + '\n')
      console.info(JSON.stringify(evidence))
    } catch {
      throw new Error('Real OpenViking lifecycle acceptance failed at: ' + step)
    } finally {
      rmSync(temporary, { recursive: true, force: true })
    }
  }, 600_000)
