/**
 * Executive Intelligence knowledge activation — EI-S1.1.
 *
 * Covers the Executive source adapter's deterministic validation, canonical
 * front-matter ingestion, the strong (repository-resolvable) provenance model,
 * the generic artifact-eligibility invariant that replaced the Executive-specific
 * verifier tripwire, and Executive retrieval / citation / policy behaviour.
 *
 * Everything here is filesystem-local: no database, no network, no credentials.
 *
 * Aggregate artifact counts are never hardcoded — they are derived from the
 * validated source material. The only literal counts asserted are the canonical
 * v1.0 contract itself (32 chapters · 6,705 numbered sections · 4 front-matter
 * records), which is what the adapter exists to enforce.
 */

import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifyArchitectureKnowledge } from './build'
import { validateKnowledgeCitation } from './citations'
import { sha256, sha256File, stableJson } from './hash'
import { loadArchitectureKnowledge } from './loader'
import { findRepositoryRoot, knowledgeArtifactDirectory } from './paths'
import { filterEligibleSources, sourceEligibleBeforeRanking } from './policy'
import { artifactEligibilityFailure, loadKnowledgeRegistry } from './registry'
import { retrieveArchitectureKnowledge } from './retrieval'
import {
  EXECUTIVE_EXPECTED_CANONICAL_SECTIONS,
  EXECUTIVE_EXPECTED_CHAPTERS,
  EXECUTIVE_EXPECTED_FRONT_MATTER,
  EXECUTIVE_EXPECTED_FRONT_MATTER_IDS,
  FRONT_MATTER_CHAPTER_NUMBER,
  executiveIntelligenceAdapter,
} from './source-adapters/executive-intelligence'
import type { KnowledgeSource } from './types'

const repoRoot = findRepositoryRoot()
const EXECUTIVE_SOURCE_ID = 'omnira-executive-intelligence-v1.0'
const EXECUTIVE_BOOK_ID = 'omnira-executive-intelligence'

const policy = {
  principalId: 'executive-knowledge-test-principal',
  internalAuthorized: true,
  allowedProjectIds: [] as string[],
  classificationCeiling: 'internal' as const,
  runtime: 'cloud' as const,
}

function executiveSource(): KnowledgeSource {
  const registry = loadKnowledgeRegistry(repoRoot)
  const source = registry.sources.find(item => item.knowledgeSourceId === EXECUTIVE_SOURCE_ID)
  if (!source) throw new Error('Executive Intelligence is absent from the knowledge registry')
  return source
}

// ── Synthetic package fixture ──────────────────────────────────────────────────
//
// Failure modes are exercised against a generated package that satisfies the
// canonical contract exactly, then breaks one invariant at a time. This keeps the
// negative tests fast and makes the broken invariant unambiguous.

interface SyntheticOverrides {
  canonicalChecksumMismatch?: boolean
  mutateSections?: (records: Record<string, unknown>[]) => Record<string, unknown>[]
  mutateFrontMatter?: (records: Record<string, unknown>[]) => Record<string, unknown>[]
  canonicalStatus?: KnowledgeSource['canonicalStatus']
}

function syntheticPackage(overrides: SyntheticOverrides = {}): { root: string; source: KnowledgeSource } {
  const root = mkdtempSync(join(tmpdir(), 'executive-synthetic-'))
  const bookBytes = 'canonical-executive-book-bytes'
  writeFileSync(join(root, 'book.docx'), bookBytes)
  const bookSha = sha256(bookBytes)

  const perChapter = EXECUTIVE_EXPECTED_CANONICAL_SECTIONS / EXECUTIVE_EXPECTED_CHAPTERS
  let sections: Record<string, unknown>[] = []
  for (let index = 0; index < EXECUTIVE_EXPECTED_CANONICAL_SECTIONS; index += 1) {
    const chapter = Math.min(EXECUTIVE_EXPECTED_CHAPTERS, Math.floor(index / perChapter) + 1)
    const text = `Canonical body for record ${index}.`
    sections.push({
      chapter_number: chapter,
      chapter_title: `Chapter ${chapter}`,
      section_id: `${chapter}.${index}`,
      section_title: `Section ${index}`,
      canonical_text: text,
      canonical_book_sha256: bookSha,
      canonical_source_file_sha256: sha256(`chapter-${chapter}`),
      section_text_sha256: sha256(text),
      implementation_status: 'unknown_not_verified_in_this_package',
    })
  }
  // Guarantee every chapter 1..32 is represented regardless of rounding.
  sections.sort((a, b) => (a.chapter_number as number) - (b.chapter_number as number))

  let frontMatter: Record<string, unknown>[] = EXECUTIVE_EXPECTED_FRONT_MATTER_IDS.map((id, index) => {
    const text = `Front matter body ${id}.`
    return {
      front_matter_section: index + 1,
      section_id: id,
      heading: `Heading ${id}`,
      canonical_text: text,
      canonical_book_sha256: bookSha,
      record_text_sha256: sha256(text),
      section_text_sha256: sha256(text),
      source_type: 'canonical_front_matter',
    }
  })

  if (overrides.mutateSections) sections = overrides.mutateSections(sections)
  if (overrides.mutateFrontMatter) frontMatter = overrides.mutateFrontMatter(frontMatter)

  const knowledgeDir = join(root, 'package', '01_Canonical_Knowledge')
  mkdirSync(knowledgeDir, { recursive: true })
  writeFileSync(join(knowledgeDir, 'executive-intelligence-sections.jsonl'), sections.map(r => JSON.stringify(r)).join('\n') + '\n')
  writeFileSync(join(knowledgeDir, 'front-matter.jsonl'), frontMatter.map(r => JSON.stringify(r)).join('\n') + '\n')

  const real = executiveSource()
  return {
    root,
    source: {
      ...real,
      canonicalPath: 'book.docx',
      knowledgePath: 'package',
      sourceChecksum: overrides.canonicalChecksumMismatch ? 'f'.repeat(64) : bookSha,
      canonicalStatus: overrides.canonicalStatus ?? real.canonicalStatus,
    },
  }
}

async function loadSynthetic(overrides: SyntheticOverrides = {}) {
  const { root, source } = syntheticPackage(overrides)
  return executiveIntelligenceAdapter.load(source, root)
}

// ── B — adapter deterministic validation ───────────────────────────────────────

describe('Executive adapter — canonical v1.0 contract', () => {
  it('validates the known-good repository package and separates record classes', async () => {
    const result = await executiveIntelligenceAdapter.load(executiveSource(), repoRoot)
    const canonical = result.sections.filter(section => section.recordClass === 'canonical_section')
    const frontMatter = result.sections.filter(section => section.recordClass === 'canonical_front_matter')

    expect(canonical).toHaveLength(EXECUTIVE_EXPECTED_CANONICAL_SECTIONS)
    expect(frontMatter).toHaveLength(EXECUTIVE_EXPECTED_FRONT_MATTER)
    // The two classes are never conflated into a single "6,709 sections" count.
    expect(result.sections).toHaveLength(EXECUTIVE_EXPECTED_CANONICAL_SECTIONS + EXECUTIVE_EXPECTED_FRONT_MATTER)
    expect(new Set(canonical.map(section => section.chapterNumber)).size).toBe(EXECUTIVE_EXPECTED_CHAPTERS)
    expect(new Set(canonical.map(section => section.sectionId)).size).toBe(EXECUTIVE_EXPECTED_CANONICAL_SECTIONS)
    expect(result.diagnostics.chapterCount).toBe(EXECUTIVE_EXPECTED_CHAPTERS)
    expect(result.diagnostics.deterministicChecks).toContain('canonical-record-text-checksum')
  }, 60_000)

  it('is deterministic across repeat loads', async () => {
    const [first, second] = await Promise.all([
      executiveIntelligenceAdapter.load(executiveSource(), repoRoot),
      executiveIntelligenceAdapter.load(executiveSource(), repoRoot),
    ])
    expect(first.sections.map(s => `${s.sectionId}:${s.ordinal}:${s.textChecksum}`))
      .toEqual(second.sections.map(s => `${s.sectionId}:${s.ordinal}:${s.textChecksum}`))
  }, 60_000)

  it('accepts the generated contract-conformant package', async () => {
    const result = await loadSynthetic()
    expect(result.sections).toHaveLength(EXECUTIVE_EXPECTED_CANONICAL_SECTIONS + EXECUTIVE_EXPECTED_FRONT_MATTER)
  }, 30_000)

  it('fails closed on a wrong canonical book checksum', async () => {
    await expect(loadSynthetic({ canonicalChecksumMismatch: true })).rejects.toThrow(/canonical-book-checksum/)
  }, 30_000)

  it('fails closed when a record text checksum does not match its canonical text', async () => {
    await expect(loadSynthetic({
      mutateSections: records => records.map((record, index) =>
        index === 10 ? { ...record, section_text_sha256: 'a'.repeat(64) } : record),
    })).rejects.toThrow(/canonical-record-text-checksum/)
  }, 30_000)

  it('fails closed when the canonical book SHA is inconsistent across records', async () => {
    await expect(loadSynthetic({
      mutateSections: records => records.map((record, index) =>
        index === 5 ? { ...record, canonical_book_sha256: 'b'.repeat(64) } : record),
    })).rejects.toThrow(/canonical-book-sha-consistent/)
  }, 30_000)

  it('fails closed on the wrong numbered section count', async () => {
    await expect(loadSynthetic({ mutateSections: records => records.slice(0, -1) }))
      .rejects.toThrow(/canonical-section-count-6705/)
  }, 30_000)

  it('fails closed on the wrong chapter count', async () => {
    await expect(loadSynthetic({
      mutateSections: records => records.map(record =>
        record.chapter_number === EXECUTIVE_EXPECTED_CHAPTERS
          ? { ...record, chapter_number: EXECUTIVE_EXPECTED_CHAPTERS - 1, chapter_title: `Chapter ${EXECUTIVE_EXPECTED_CHAPTERS - 1}` }
          : record),
    })).rejects.toThrow(/canonical-chapter-count-32/)
  }, 30_000)

  it('fails closed on a chapter outside the canonical 1–32 range', async () => {
    await expect(loadSynthetic({
      mutateSections: records => records.map((record, index) =>
        index === 0 ? { ...record, chapter_number: 33 } : record),
    })).rejects.toThrow(/canonical-chapter-range-1-32/)
  }, 30_000)

  it('fails closed on a duplicate canonical section id', async () => {
    await expect(loadSynthetic({
      mutateSections: records => records.map((record, index) =>
        index === 2 ? { ...record, section_id: (records[1] as { section_id: string }).section_id } : record),
    })).rejects.toThrow(/canonical-unique-section-ids/)
  }, 30_000)

  it('fails closed on a missing required provenance field', async () => {
    await expect(loadSynthetic({
      mutateSections: records => records.map((record, index) =>
        index === 3 ? { ...record, canonical_source_file_sha256: '' } : record),
    })).rejects.toThrow(/canonical-required-fields/)
  }, 30_000)

  it('refuses a candidate or superseded source even when the package is intact', async () => {
    await expect(loadSynthetic({ canonicalStatus: 'candidate' })).rejects.toThrow(/canonical-status-eligible/)
    await expect(loadSynthetic({ canonicalStatus: 'superseded' })).rejects.toThrow(/canonical-status-eligible/)
  }, 30_000)
})

// ── C — canonical front matter ─────────────────────────────────────────────────

describe('Executive front matter FM.1–FM.4', () => {
  it('ingests all four records with stable ids, ordering and authority labelling', async () => {
    const result = await executiveIntelligenceAdapter.load(executiveSource(), repoRoot)
    const frontMatter = result.sections.filter(section => section.recordClass === 'canonical_front_matter')

    expect(frontMatter.map(section => section.sectionId)).toEqual([...EXECUTIVE_EXPECTED_FRONT_MATTER_IDS])
    expect(frontMatter.map(section => section.ordinal)).toEqual([0, 1, 2, 3])
    for (const section of frontMatter) {
      expect(section.chapterNumber).toBe(FRONT_MATTER_CHAPTER_NUMBER)
      expect(section.implementationStatus).toMatch(/unknown|not_verified/)
      // Front matter carries no separate source file in the package hash schema.
      expect(section.secondarySourceChecksum).toBeNull()
    }
    // FM.2 is the canonical Stage 1 boundary; its wording must survive verbatim.
    const fm2 = frontMatter.find(section => section.sectionId === 'FM.2')
    expect(fm2?.text).toContain('Stage 1 should be recommendation-first and human-authorized')
    expect(fm2?.text).toContain('Stage 1 should not fully implement')
  }, 60_000)

  it('never duplicates front-matter text into numbered canonical sections', async () => {
    const result = await executiveIntelligenceAdapter.load(executiveSource(), repoRoot)
    const canonical = result.sections.filter(section => section.recordClass === 'canonical_section')
    const frontMatterChecksums = new Set(
      result.sections.filter(s => s.recordClass === 'canonical_front_matter').map(s => s.textChecksum),
    )
    expect(canonical.some(section => frontMatterChecksums.has(section.textChecksum))).toBe(false)
    expect(canonical.some(section => section.sectionId.startsWith('FM.'))).toBe(false)
  }, 60_000)

  it('fails closed when a front-matter record is missing', async () => {
    await expect(loadSynthetic({ mutateFrontMatter: records => records.slice(0, 3) }))
      .rejects.toThrow(/front-matter-count-4/)
  }, 30_000)

  it('fails closed on a duplicate front-matter id', async () => {
    await expect(loadSynthetic({
      mutateFrontMatter: records => [records[0], records[1], { ...records[2], section_id: 'FM.2' }, records[3]],
    })).rejects.toThrow(/front-matter-unique-ids/)
  }, 30_000)

  it('fails closed when a front-matter text checksum does not match', async () => {
    await expect(loadSynthetic({
      mutateFrontMatter: records => records.map((record, index) =>
        index === 1 ? { ...record, section_text_sha256: 'c'.repeat(64) } : record),
    })).rejects.toThrow(/front-matter-record-text-checksum/)
  }, 30_000)
})

// ── F — strong canonical provenance ────────────────────────────────────────────

describe('Executive canonical provenance', () => {
  it('binds every record to the repository-resolvable canonical v1.0 book', async () => {
    const source = executiveSource()
    const onDisk = sha256File(resolve(repoRoot, source.canonicalPath))

    // The registered checksum IS the checksum of the registered file.
    expect(onDisk).toBe(source.sourceChecksum)

    const result = await executiveIntelligenceAdapter.load(source, repoRoot)
    const primary = new Set(result.sections.map(section => section.sourceChecksum))
    expect([...primary]).toEqual([onDisk])
    for (const section of result.sections) expect(section.canonicalPath).toBe(source.canonicalPath)

    // Secondary per-chapter provenance is preserved, but never as the identity.
    const secondary = new Set(
      result.sections
        .filter(section => section.recordClass === 'canonical_section')
        .map(section => section.secondarySourceChecksum),
    )
    expect(secondary.size).toBe(EXECUTIVE_EXPECTED_CHAPTERS)
    expect(secondary.has(onDisk)).toBe(false)
  }, 60_000)

  it('fails closed when the canonical file and its registered checksum disagree', async () => {
    const { root, source } = syntheticPackage()
    writeFileSync(join(root, 'book.docx'), 'tampered-canonical-book-bytes')
    await expect(executiveIntelligenceAdapter.load(source, root)).rejects.toThrow(/canonical-book-checksum/)
  }, 30_000)

  it('fails closed with a named invariant when the package files are unreadable (AK-ADAPTER-02)', async () => {
    const { root, source } = syntheticPackage()
    // Point the package at a directory that carries no Executive package files.
    const broken = { ...source, knowledgePath: 'package/01_Canonical_Knowledge/absent' }
    await expect(executiveIntelligenceAdapter.load(broken, root)).rejects.toThrow(/front-matter-present/)
    await expect(executiveIntelligenceAdapter.load(broken, root)).rejects.toThrow(/not readable in this repository/)
    // The failure must never carry a machine-specific absolute path.
    await expect(executiveIntelligenceAdapter.load(broken, root)).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(root) }),
    )
  }, 30_000)

  it('fails closed when the registered canonical book is not present in the repository', async () => {
    const { root, source } = syntheticPackage()
    await expect(executiveIntelligenceAdapter.load({ ...source, canonicalPath: 'absent-book.docx' }, root))
      .rejects.toThrow(/canonical-source-resolvable/)
  }, 30_000)
})

// ── D — generic artifact eligibility invariant ─────────────────────────────────

describe('Generic artifact eligibility invariant', () => {
  const artifactDirectory = knowledgeArtifactDirectory(repoRoot)

  function patchedArtifact(mutate: (sources: KnowledgeSource[]) => KnowledgeSource[]): string {
    const directory = mkdtempSync(join(tmpdir(), 'artifact-eligibility-'))
    cpSync(artifactDirectory, directory, { recursive: true })
    const sources = mutate(JSON.parse(readFileSync(join(directory, 'sources.json'), 'utf8')) as KnowledgeSource[])
    const payload = stableJson(sources)
    writeFileSync(join(directory, 'sources.json'), payload)
    const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')) as Record<string, unknown>
    ;(manifest.artifactChecksums as Record<string, string>)['sources.json'] = sha256(payload)
    manifest.sourceCount = sources.length
    writeFileSync(join(directory, 'manifest.json'), stableJson(manifest))
    return directory
  }

  it('names every ineligible registry state without naming a book', () => {
    const source = executiveSource()
    expect(artifactEligibilityFailure(source)).toBeNull()
    expect(artifactEligibilityFailure({ ...source, activationStatus: 'inactive' })).toMatch(/activationStatus=inactive/)
    expect(artifactEligibilityFailure({ ...source, current: false })).toMatch(/current=false/)
    for (const canonicalStatus of ['candidate', 'draft', 'deprecated', 'superseded'] as const) {
      expect(artifactEligibilityFailure({ ...source, canonicalStatus })).toMatch(new RegExp(canonicalStatus))
    }
    for (const classification of ['local_only', 'prohibited'] as const) {
      expect(artifactEligibilityFailure({ ...source, classification })).toMatch(new RegExp(classification))
    }
  })

  it('accepts the committed artifact while Executive is active and approved', () => {
    const report = verifyArchitectureKnowledge(repoRoot, artifactDirectory)
    expect(report.manifest.sourceIds).toContain(EXECUTIVE_SOURCE_ID)
    expect(report.manifest.frontMatterCount).toBe(EXECUTIVE_EXPECTED_FRONT_MATTER)
    expect(report.manifest.canonicalSectionCount + report.manifest.frontMatterCount).toBe(report.manifest.sectionCount)
  }, 60_000)

  it('rejects an inactive source that reached the artifact', () => {
    const directory = patchedArtifact(sources =>
      sources.map(source => source.knowledgeSourceId === EXECUTIVE_SOURCE_ID
        ? { ...source, activationStatus: 'inactive' as const }
        : source))
    expect(() => verifyArchitectureKnowledge(repoRoot, directory)).toThrow(/Ineligible source entered artifact/)
  }, 60_000)

  it('rejects an artifact source row that diverged from the registry', () => {
    const directory = patchedArtifact(sources =>
      sources.map(source => source.knowledgeSourceId === EXECUTIVE_SOURCE_ID
        ? { ...source, classification: 'confidential' as const }
        : source))
    expect(() => verifyArchitectureKnowledge(repoRoot, directory)).toThrow(/divergence/)
  }, 60_000)

  it('rejects an artifact source that is not registered at all', () => {
    const directory = patchedArtifact(sources => [
      ...sources,
      { ...sources[0], knowledgeSourceId: 'omnira-unregistered-v1.0', bookId: 'omnira-unregistered' },
    ])
    expect(() => verifyArchitectureKnowledge(repoRoot, directory)).toThrow(/unregistered source/)
  }, 60_000)

  it('refuses to load an artifact whose active source is not canonically approved', () => {
    const directory = patchedArtifact(sources =>
      sources.map(source => source.knowledgeSourceId === EXECUTIVE_SOURCE_ID
        ? { ...source, canonicalStatus: 'candidate' as const }
        : source))
    expect(() => verifyArchitectureKnowledge(repoRoot, directory)).toThrow(/cannot be active|Ineligible source/)
  }, 60_000)
})

// ── E — Executive retrieval, citations and policy ──────────────────────────────

describe('Executive retrieval, citations and policy', () => {
  async function retrieve(query: string, extra: Record<string, unknown> = {}) {
    return retrieveArchitectureKnowledge(
      { query, policy, tokenBudget: 1_600, maxResults: 5, ...extra },
      { disableCache: true },
    )
  }

  it('is an active knowledge source in the committed artifact', () => {
    const loaded = loadArchitectureKnowledge()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const executive = loaded.artifact.sources.find(source => source.knowledgeSourceId === EXECUTIVE_SOURCE_ID)
    expect(executive?.activationStatus).toBe('active')

    // Counts derive from the artifact, and the two record classes stay distinct.
    const executiveSections = loaded.artifact.sections.filter(s => s.knowledgeSourceId === EXECUTIVE_SOURCE_ID)
    expect(executiveSections.filter(s => s.recordClass === 'canonical_section')).toHaveLength(EXECUTIVE_EXPECTED_CANONICAL_SECTIONS)
    expect(executiveSections.filter(s => s.recordClass === 'canonical_front_matter')).toHaveLength(EXECUTIVE_EXPECTED_FRONT_MATTER)
  }, 60_000)

  it('resolves FM.2 by exact front-matter identifier', async () => {
    const response = await retrieve('FM.2')
    expect(response.results[0].source.bookId).toBe(EXECUTIVE_BOOK_ID)
    expect(response.results[0].source.recordClass).toBe('canonical_front_matter')
    expect(response.results[0].source.sectionIds).toEqual(['FM.2'])
  }, 60_000)

  it('resolves FM.2 from an implementation-scope query and a canonical Stage 1 query', async () => {
    const scope = await retrieve('implementation scope and maturity')
    expect(scope.results[0].source.sectionIds).toContain('FM.2')

    const stageOne = await retrieve('stage 1 should be recommendation-first and human-authorized')
    expect(stageOne.results[0].source.sectionIds).toContain('FM.2')
    expect(stageOne.results[0].text).toContain('Stage 1 should not fully implement')
  }, 60_000)

  it('resolves exact Executive chapter and section identifiers', async () => {
    const chapter = await retrieve('chapter 11 decision ledger', { requestedBookId: EXECUTIVE_BOOK_ID })
    expect(chapter.results[0].source.chapterNumber).toBe(11)

    const section = await retrieve('section 8.11', { requestedBookId: EXECUTIVE_BOOK_ID })
    expect(section.results[0].source.sectionIds).toContain('8.11')
    expect(section.results[0].source.recordClass).toBe('canonical_section')
  }, 60_000)

  it('answers a governance and authority query from Executive doctrine', async () => {
    const response = await retrieve('human authority approval gate executive decision', { requestedBookId: EXECUTIVE_BOOK_ID })
    expect(response.diagnostics.ok).toBe(true)
    expect(response.results[0].source.bookId).toBe(EXECUTIVE_BOOK_ID)
  }, 60_000)

  it('labels canonical target architecture distinctly from implementation status', async () => {
    const response = await retrieve('executive intelligence portfolio architecture', { requestedBookId: EXECUTIVE_BOOK_ID })
    for (const result of response.results) {
      expect(result.source.authorityKind).toBe('canonical_target')
      expect(result.source.implementationStatus).toBe('unknown_not_verified_in_this_package')
    }
  }, 60_000)

  it('mints a valid Executive citation and rejects every tampered variant', async () => {
    const response = await retrieve('decision ledger', { requestedBookId: EXECUTIVE_BOOK_ID })
    const loaded = loadArchitectureKnowledge()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const result = response.results[0]

    expect(validateKnowledgeCitation(result.citation, loaded.artifact, result)).toBe(true)
    expect(result.citation.sources[0].sourceChecksum).toBe(executiveSource().sourceChecksum)

    const swappedPrimary = {
      ...result.citation,
      sources: [{ ...result.citation.sources[0], sourceChecksum: 'e'.repeat(64) }, ...result.citation.sources.slice(1)],
    }
    expect(validateKnowledgeCitation(swappedPrimary, loaded.artifact, result)).toBe(false)

    const forgedSecondary = {
      ...result.citation,
      sources: [{ ...result.citation.sources[0], secondarySourceChecksum: 'd'.repeat(64) }, ...result.citation.sources.slice(1)],
    }
    expect(validateKnowledgeCitation(forgedSecondary, loaded.artifact, result)).toBe(false)

    const forgedClass = {
      ...result.citation,
      sources: [{ ...result.citation.sources[0], recordClass: 'canonical_front_matter' as const }, ...result.citation.sources.slice(1)],
    }
    expect(validateKnowledgeCitation(forgedClass, loaded.artifact, result)).toBe(false)
    expect(validateKnowledgeCitation({ ...result.citation, citationId: 'akc:forged' }, loaded.artifact, result)).toBe(false)
  }, 60_000)

  it('denies internal Executive knowledge to an unauthorized principal and allows an authorized one', async () => {
    const source = executiveSource()
    expect(sourceEligibleBeforeRanking(source, { ...policy, internalAuthorized: false })).toBe(false)
    expect(sourceEligibleBeforeRanking(source, policy)).toBe(true)

    const denied = await retrieveArchitectureKnowledge(
      { query: 'decision ledger', policy: { ...policy, internalAuthorized: false }, tokenBudget: 800, maxResults: 3 },
      { disableCache: true },
    )
    expect(denied.results).toHaveLength(0)
    expect(denied.diagnostics.failureCode).toBe('policy_denied')

    const allowed = await retrieve('decision ledger', { requestedBookId: EXECUTIVE_BOOK_ID })
    expect(allowed.diagnostics.sourceIds).toContain(EXECUTIVE_SOURCE_ID)
  }, 60_000)

  it('keeps Executive inside project, tenant and classification boundaries', () => {
    const source = executiveSource()
    const projectScoped = { ...source, scope: { kind: 'project' as const, projectId: 'p1' } }
    expect(sourceEligibleBeforeRanking(projectScoped, { ...policy, allowedProjectIds: ['p1'] })).toBe(true)
    expect(sourceEligibleBeforeRanking(projectScoped, { ...policy, allowedProjectIds: ['p2'] })).toBe(false)

    const tenantScoped = { ...source, scope: { kind: 'tenant' as const, tenantId: 't1' } }
    expect(sourceEligibleBeforeRanking(tenantScoped, { ...policy, tenantId: 't1' })).toBe(true)
    expect(sourceEligibleBeforeRanking(tenantScoped, { ...policy, tenantId: 't2' })).toBe(false)

    expect(sourceEligibleBeforeRanking({ ...source, classification: 'local_only' }, policy)).toBe(false)
    expect(sourceEligibleBeforeRanking({ ...source, classification: 'prohibited' }, policy)).toBe(false)
    expect(filterEligibleSources([projectScoped], { ...policy, allowedProjectIds: ['p2'] })).toHaveLength(0)
  })

  it('excludes an inactive, superseded or wrong-version Executive source before ranking', async () => {
    const source = executiveSource()
    expect(sourceEligibleBeforeRanking({ ...source, activationStatus: 'inactive' }, policy)).toBe(false)
    expect(sourceEligibleBeforeRanking({ ...source, canonicalStatus: 'superseded' }, policy)).toBe(false)
    expect(sourceEligibleBeforeRanking({ ...source, canonicalStatus: 'candidate' }, policy)).toBe(false)
    expect(sourceEligibleBeforeRanking({ ...source, current: false }, policy)).toBe(false)

    const wrongVersion = await retrieve('decision ledger', { requestedBookId: EXECUTIVE_BOOK_ID, requestedVersion: 'v0.9' })
    expect(wrongVersion.results).toHaveLength(0)
    expect(wrongVersion.diagnostics.failureCode).toBe('policy_denied')
  }, 60_000)
})

// ── Shadow boundary is unchanged by activation ─────────────────────────────────

describe('Executive activation does not widen the Atlas runtime boundary', () => {
  it('keeps architecture knowledge shadow-only in the chat route', () => {
    const route = readFileSync(resolve(repoRoot, 'apps/web/app/api/chat/route.ts'), 'utf8')
    expect(route).toContain('void runContextShadow({')
    expect(route).not.toContain('renderKnowledgeContext')
    expect(route).not.toContain('retrieveArchitectureKnowledge')
    expect(route).not.toContain(EXECUTIVE_BOOK_ID)
  })

  it('exposes no Executive execution authority through the knowledge runtime', () => {
    const adapter = readFileSync(resolve(repoRoot, 'apps/web/lib/architecture-knowledge/source-adapters/executive-intelligence.ts'), 'utf8')
    expect(adapter).not.toContain('createAdminClient')
    expect(adapter).not.toContain('supabase')
    expect(adapter).not.toContain('fetch(')
  })
})
