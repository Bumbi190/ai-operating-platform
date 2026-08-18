import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadAndValidateArtifactFiles } from './artifact'
import { chunkKnowledgeSections } from './chunk'
import { validateKnowledgeCitation } from './citations'
import { buildLexicalIndex } from './lexical-index'
import { loadArchitectureKnowledge } from './loader'
import { filterEligibleSources, sourceEligibleBeforeRanking } from './policy'
import { activeKnowledgeSources, loadKnowledgeRegistry, validateKnowledgeRegistry } from './registry'
import { retrieveArchitectureKnowledge } from './retrieval'
import { extractIntelligenceGraphDocx } from './source-adapters/intelligence-graph'
import { findRepositoryRoot, knowledgeArtifactDirectory } from './paths'
import { sha256 } from './hash'
import type { KnowledgeChunk, KnowledgeSection, KnowledgeSource, LoadedKnowledgeArtifact } from './types'
import {
  KNOWLEDGE_BUILDER_VERSION,
  KNOWLEDGE_INDEX_VERSION,
  KNOWLEDGE_RETRIEVER_VERSION,
  KNOWLEDGE_SCHEMA_VERSION,
} from './types'

const repoRoot = findRepositoryRoot()
const policy = {
  principalId: 'internal-test-principal',
  internalAuthorized: true,
  allowedProjectIds: [] as string[],
  classificationCeiling: 'internal' as const,
  runtime: 'cloud' as const,
}

function section(overrides: Partial<KnowledgeSection>): KnowledgeSection {
  const text = overrides.text ?? 'Canonical architecture text.'
  return {
    knowledgeSourceId: 'source-v1', bookId: 'book', title: 'Book', version: 'v1.0', chapterNumber: 1,
    chapterTitle: 'Chapter', canonicalStatus: 'approved', implementationStatus: 'unknown_not_verified',
    canonicalPath: 'docs/book.docx', sourceChecksum: 'a'.repeat(64), effectiveAt: '2026-01-01',
    scope: { kind: 'platform' }, classification: 'internal', sectionId: '1.1', sectionTitle: '1.1 Test',
    anchor: 'section-1-1', ordinal: 0, text, textChecksum: sha256(text),
    recordClass: 'canonical_section', secondarySourceChecksum: null, ...overrides,
  }
}

function source(overrides: Partial<KnowledgeSource> = {}): KnowledgeSource {
  return {
    knowledgeSourceId: 'source-v1', bookId: 'book', title: 'Book', version: 'v1.0', canonicalStatus: 'approved',
    activationStatus: 'active', current: true, canonicalPath: 'docs/book.docx', knowledgePath: 'docs/book',
    adapter: 'intelligence-fabric', manifestPath: 'docs/manifest.json', sourceChecksum: 'a'.repeat(64),
    approvedAt: '2026-01-01', effectiveAt: '2026-01-01', supersedes: null, supersededBy: null,
    deprecatedAt: null, scope: { kind: 'platform' }, classification: 'internal', ...overrides,
  }
}

function syntheticArtifact(sources: KnowledgeSource[], chunks: KnowledgeChunk[]): LoadedKnowledgeArtifact {
  const index = buildLexicalIndex(chunks)
  return {
    manifest: {
      schemaVersion: KNOWLEDGE_SCHEMA_VERSION, builderVersion: KNOWLEDGE_BUILDER_VERSION,
      indexVersion: KNOWLEDGE_INDEX_VERSION, retrievalAlgorithmVersion: KNOWLEDGE_RETRIEVER_VERSION,
      registryChecksum: 'b'.repeat(64), sourceIds: sources.map(item => item.knowledgeSourceId),
      sourceVersions: Object.fromEntries(sources.map(item => [item.knowledgeSourceId, item.version])),
      sourceChecksums: Object.fromEntries(sources.map(item => [item.knowledgeSourceId, item.sourceChecksum])),
      artifactChecksums: { 'sources.json': '', 'sections.jsonl': '', 'chunks.jsonl': '', 'lexical-index.json': '' },
      sourceCount: sources.length, chapterCount: 1, sectionCount: chunks.length,
      canonicalSectionCount: chunks.length, frontMatterCount: 0, chunkCount: chunks.length,
    },
    manifestChecksum: 'c'.repeat(64), sources, sections: [], chunks, index,
  }
}

describe('Architecture Knowledge registry and source eligibility', () => {
  it('activates exactly the four approved/verified canonical sources', () => {
    const registry = loadKnowledgeRegistry(repoRoot)
    const active = activeKnowledgeSources(registry)
    expect(active.map(item => item.adapter)).toEqual([
      'executive-intelligence', 'intelligence-fabric', 'intelligence-graph', 'mobile-intelligence',
    ])
    // Activation is only ever legitimate for an approved/verified current source.
    for (const source of active) {
      expect(['approved', 'verified']).toContain(source.canonicalStatus)
      expect(source.current).toBe(true)
    }
    expect(registry.sources.some(item => item.bookId.includes('gainpilot'))).toBe(false)
  })

  it('fails closed for missing scope/classification and active candidates', () => {
    const raw = source() as unknown as Record<string, unknown>
    delete raw.scope
    expect(() => validateKnowledgeRegistry({ schemaVersion: '1.0', sources: [raw] })).toThrow(/scope/)
    expect(() => validateKnowledgeRegistry({ schemaVersion: '1.0', sources: [{ ...source(), canonicalStatus: 'candidate' }] })).toThrow(/cannot be active/)
  })

  it('enforces platform, project, tenant, local_only and prohibited policy before ranking', () => {
    expect(sourceEligibleBeforeRanking(source(), { ...policy, internalAuthorized: false })).toBe(false)
    const project = source({ scope: { kind: 'project', projectId: 'p1' } })
    expect(sourceEligibleBeforeRanking(project, { ...policy, allowedProjectIds: ['p1'] })).toBe(true)
    expect(sourceEligibleBeforeRanking(project, { ...policy, allowedProjectIds: ['p2'] })).toBe(false)
    const tenant = source({ scope: { kind: 'tenant', tenantId: 't1' } })
    expect(sourceEligibleBeforeRanking(tenant, { ...policy, tenantId: 't1' })).toBe(true)
    expect(sourceEligibleBeforeRanking(tenant, { ...policy, tenantId: 't2' })).toBe(false)
    expect(sourceEligibleBeforeRanking(source({ classification: 'local_only' }), policy)).toBe(false)
    expect(sourceEligibleBeforeRanking(source({ classification: 'prohibited' }), policy)).toBe(false)
    expect(filterEligibleSources([project], { ...policy, allowedProjectIds: ['p2'] })).toHaveLength(0)
  })
})

describe('Deterministic source extraction and section-aware chunking', () => {
  it('extracts exactly 10 chapters and 202 unique Graph sections without dropped blocks', async () => {
    const path = resolve(repoRoot, 'docs/architecture/intelligence-graph/book/OMNIRA_INTELLIGENCE_GRAPH_BOOK_v1.0.docx')
    const first = await extractIntelligenceGraphDocx(path)
    const second = await extractIntelligenceGraphDocx(path)
    expect(first.diagnostics).toEqual(second.diagnostics)
    expect(first.diagnostics.chapterCount).toBe(10)
    expect(first.diagnostics.sectionCount).toBe(202)
    expect(first.diagnostics.consumedBlockCount).toBe(first.diagnostics.sourceBlockCount)
    expect(new Set(first.sections.map(item => item.sectionId)).size).toBe(202)
    expect(first.sections.map(item => item.sectionId)).toEqual(second.sections.map(item => item.sectionId))
  })

  it('never crosses chapters and yields stable IDs/checksums', () => {
    const sections = [
      section({ text: 'A '.repeat(800), textChecksum: sha256('A '.repeat(800)) }),
      section({ sectionId: '1.2', ordinal: 1, text: 'B '.repeat(800), textChecksum: sha256('B '.repeat(800)) }),
      section({ chapterNumber: 2, chapterTitle: 'Second', sectionId: '2.1', ordinal: 2, text: 'C '.repeat(800), textChecksum: sha256('C '.repeat(800)) }),
    ]
    const first = chunkKnowledgeSections(sections)
    const second = chunkKnowledgeSections(sections)
    expect(first).toEqual(second)
    expect(first.every(chunk => !chunk.sectionIds.some(id => id.startsWith('1.')) || chunk.chapterNumber === 1)).toBe(true)
    expect(first.every(chunk => chunk.textChecksum === sha256(chunk.text))).toBe(true)
  })

  it('detects duplicate content while preserving alternate provenance at retrieval', async () => {
    const text = 'Identical canonical policy text about approval authority.'
    const chunks = chunkKnowledgeSections([
      section({ text, textChecksum: sha256(text) }),
      section({ knowledgeSourceId: 'source-two-v1', bookId: 'book-two', title: 'Book Two', canonicalPath: 'docs/two.docx', sectionId: '1.2', ordinal: 1, text, textChecksum: sha256(text) }),
    ])
    const sources = [source(), source({ knowledgeSourceId: 'source-two-v1', bookId: 'book-two', title: 'Book Two' })]
    const artifact = syntheticArtifact(sources, chunks)
    const response = await retrieveArchitectureKnowledge({ query: 'approval authority', policy, tokenBudget: 1200, maxResults: 5 }, { load: () => ({ ok: true, artifact }), disableCache: true })
    expect(response.results).toHaveLength(1)
    expect(response.results[0].alternateSources).toHaveLength(1)
    expect(response.results[0].citation.sources).toHaveLength(2)
  })
})

describe('Immutable artifact and runtime loader', () => {
  it('loads and verifies the committed artifact read-only', () => {
    const loaded = loadArchitectureKnowledge()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    // Derived from the registry and the payloads themselves — never a frozen
    // aggregate that would have to be edited whenever a source is activated.
    const active = activeKnowledgeSources(loadKnowledgeRegistry(repoRoot))
    expect(loaded.artifact.manifest.sourceCount).toBe(active.length)
    expect(loaded.artifact.manifest.sourceIds).toEqual(active.map(item => item.knowledgeSourceId).sort())
    expect(loaded.artifact.manifest.sectionCount).toBe(loaded.artifact.sections.length)
    expect(loaded.artifact.manifest.chunkCount).toBe(loaded.artifact.chunks.length)
    expect(loaded.artifact.manifest.chapterCount).toBe(
      new Set(
        loaded.artifact.sections
          .filter(section => section.recordClass === 'canonical_section')
          .map(section => `${section.knowledgeSourceId}:${section.chapterNumber}`),
      ).size,
    )
    expect(loaded.artifact.manifest.canonicalSectionCount + loaded.artifact.manifest.frontMatterCount)
      .toBe(loaded.artifact.manifest.sectionCount)
  })

  it('fails closed on a corrupt payload', () => {
    const dir = mkdtempSync(join(tmpdir(), 'akr-corrupt-'))
    cpSync(knowledgeArtifactDirectory(repoRoot), dir, { recursive: true })
    const path = join(dir, 'chunks.jsonl')
    writeFileSync(path, `${readFileSync(path, 'utf8')}corrupt\n`)
    expect(() => loadAndValidateArtifactFiles(dir)).toThrow()
  })
})

describe('Golden lexical retrieval and server citations', () => {
  async function retrieve(query: string, extra: Record<string, unknown> = {}) {
    return retrieveArchitectureKnowledge({ query, policy, tokenBudget: 1_600, maxResults: 3, ...extra }, { disableCache: true })
  }

  it.each([
    ['How are Agents, Tools and Execution Resources registered?', [9]],
    ['How are Credentials separated from Agent authority?', [18]],
    ['How does multimodal production work?', [20]],
  ])('routes %s to Intelligence Fabric canonical material', async (query, chapters) => {
    const response = await retrieve(query)
    expect(response.diagnostics.ok).toBe(true)
    expect(response.results[0].source.bookId).toBe('omnira-intelligence-fabric')
    expect(chapters).toContain(response.results[0].source.chapterNumber)
  })

  /**
   * Provider selection is covered by two canonical books: Intelligence Fabric
   * ch8/ch11 and Mobile Intelligence ch25 ("Node Selection, Work Placement and
   * Provider Continuity"). Unscoped, the shared lexical corpus may rank either
   * first — measured during EI-S1.1, adding a fourth source shifted this one
   * query from Fabric to Mobile purely through BM25 corpus statistics. The
   * invariant that matters is that BOTH books stay reachable and correctly
   * attributed, so the routing is asserted per requested book rather than
   * frozen to whichever book happened to win the shared ranking.
   */
  it('reaches provider-selection material in every canonical book that covers it', async () => {
    const unscoped = await retrieve('How are Providers selected?')
    expect(unscoped.diagnostics.ok).toBe(true)
    expect(['omnira-intelligence-fabric', 'omnira-mobile-intelligence'])
      .toContain(unscoped.results[0].source.bookId)

    const fabric = await retrieve('How are Providers selected?', { requestedBookId: 'omnira-intelligence-fabric' })
    expect(fabric.results[0].source.bookId).toBe('omnira-intelligence-fabric')
    expect([8, 11]).toContain(fabric.results[0].source.chapterNumber)

    const mobile = await retrieve('How are Providers selected?', { requestedBookId: 'omnira-mobile-intelligence' })
    expect(mobile.results[0].source.bookId).toBe('omnira-mobile-intelligence')
  })

  it('supports exact section, chapter, book-title and requirement identifiers', async () => {
    const exactSection = await retrieve('Omnira Intelligence Fabric section 9.1', { requestedBookId: 'omnira-intelligence-fabric' })
    expect(exactSection.results[0].source.sectionIds).toContain('9.1')
    const chapter = await retrieve('Omnira Intelligence Fabric Chapter 18', { requestedBookId: 'omnira-intelligence-fabric' })
    expect(chapter.results[0].source.chapterNumber).toBe(18)
    const book = await retrieve('Omnira Intelligence Fabric', { requestedBookId: 'omnira-intelligence-fabric' })
    expect(book.results[0].source.bookId).toBe('omnira-intelligence-fabric')
    const requirement = await retrieve('MI-18-001', { requestedBookId: 'omnira-mobile-intelligence' })
    expect(requirement.results[0].source.bookId).toBe('omnira-mobile-intelligence')
  })

  it('excludes wrong/old versions and returns explicit unavailability', async () => {
    const old = await retrieve('Provider Registry', { requestedVersion: 'v0.9' })
    expect(old.results).toHaveLength(0)
    expect(old.diagnostics.failureCode).toBe('policy_denied')
    const unavailable = await retrieveArchitectureKnowledge({ query: 'Provider Registry', policy, tokenBudget: 500, maxResults: 2 }, {
      load: () => ({ ok: false, reason: 'artifact_missing' }), disableCache: true,
    })
    expect(unavailable.diagnostics.failureCode).toBe('artifact_missing')
  })

  it('mints exact citations and rejects fabricated, stale or mismatched citations', async () => {
    const response = await retrieve('How are Credentials separated from Agent authority?')
    const loaded = loadArchitectureKnowledge()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const result = response.results[0]
    expect(result.source.authorityKind).toBe('canonical_target')
    expect(result.source.implementationStatus).toMatch(/unknown|not_verified/)
    expect(validateKnowledgeCitation(result.citation, loaded.artifact, result)).toBe(true)
    expect(validateKnowledgeCitation({ ...result.citation, citationId: 'akc:fabricated' }, loaded.artifact, result)).toBe(false)
    expect(validateKnowledgeCitation({ ...result.citation, artifactManifestChecksum: '0'.repeat(64) }, loaded.artifact, result)).toBe(false)
    const inventedPath = {
      ...result.citation,
      sources: [{ ...result.citation.sources[0], canonicalPath: 'docs/architecture/invented/never-approved.docx' }, ...result.citation.sources.slice(1)],
    }
    expect(validateKnowledgeCitation(inventedPath, loaded.artifact, result)).toBe(false)
    const inventedSections = {
      ...result.citation,
      sources: [{ ...result.citation.sources[0], sectionIds: ['99.999'] }, ...result.citation.sources.slice(1)],
    }
    expect(validateKnowledgeCitation(inventedSections, loaded.artifact, result)).toBe(false)
  })

  it('keeps telemetry free from raw queries and retrieved text', async () => {
    const secretQuery = 'UNIQUE_RAW_QUERY_MUST_NOT_BE_LOGGED'
    const response = await retrieve(secretQuery)
    const telemetry = JSON.stringify(response.diagnostics)
    expect(telemetry).not.toContain(secretQuery)
    expect(telemetry).not.toContain('canonical text')
  })
})

describe('Atlas shadow-only boundary', () => {
  it('runs knowledge only through runContextShadow and never appends it to the live model prompt', () => {
    const route = readFileSync(resolve(repoRoot, 'apps/web/app/api/chat/route.ts'), 'utf8')
    expect(route).toContain('void runContextShadow({')
    expect(route).toContain('query: lastUserText')
    expect(route).toContain('system: systemPrompt')
    expect(route).not.toContain('systemPrompt += renderKnowledgeContext')
    expect(route).not.toContain('systemPrompt += knowledge')
  })
})
