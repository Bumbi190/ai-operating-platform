/**
 * Knowledge Provider — local vault adapter behaviour.
 *
 * Everything runs against a TEMPORARY fixture vault built in os.tmpdir() and
 * removed afterwards. The real Omnira vault is never read or written by these
 * tests: a test suite that touches the owner's knowledge is not a test suite.
 *
 * The guarantees under test are the ones a future Atlas consumer would depend
 * on: determinism, folder policy, fail-closed metadata, path containment, and
 * bounds that hold whatever the caller asks for.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createVaultKnowledgeProvider, VaultRootError } from '@/lib/atlas/knowledge/vault-provider'
import { KNOWLEDGE_BOUNDS } from '@/lib/atlas/knowledge/policy'
import type { KnowledgeProvider } from '@/lib/atlas/knowledge/types'

let root: string
let outside: string
let provider: KnowledgeProvider

function note(relative: string, frontMatter: Record<string, string> | null, body: string): void {
  const full = join(root, ...relative.split('/'))
  mkdirSync(join(full, '..'), { recursive: true })
  const fm = frontMatter
    ? `---\n${Object.entries(frontMatter).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n`
    : ''
  writeFileSync(full, fm + body, 'utf8')
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'omnira-vault-fixture-'))
  outside = mkdtempSync(join(tmpdir(), 'omnira-outside-'))

  for (const dir of ['00 Inbox', '10 Architecture', '20 Decisions', '60 Memory', '90 Archive', '.obsidian', '.git']) {
    mkdirSync(join(root, dir), { recursive: true })
  }

  note('10 Architecture/context-boundary.md',
    { type: 'architecture', status: 'approved', project: 'omnira', source_of_truth: 'vault' },
    '# Context Boundary\n\nThe context boundary describes how Atlas assembles a request.\n')

  note('10 Architecture/canonical-pointer.md',
    { type: 'architecture', status: 'approved', project: 'omnira',
      source_of_truth: 'repository', canonical_path: 'docs/architecture/intelligence-fabric/README.md' },
    '# Fabric Pointer\n\nDescribes the fabric. The repository is authoritative.\n')

  // Same subject as the approved note above, but only a draft.
  note('20 Decisions/context-boundary-draft.md',
    { type: 'decision', status: 'draft', project: 'omnira', source_of_truth: 'vault' },
    '# Context Boundary Draft\n\nThe context boundary might change.\n')

  note('20 Decisions/reviewed-decision.md',
    { type: 'decision', status: 'reviewed', project: 'trading', source_of_truth: 'vault' },
    '# Reviewed Decision\n\nA reviewed trading decision about routing.\n')

  // Metadata outside the documented vocabulary — must not become approved.
  note('60 Memory/malformed.md',
    { type: 'not-a-real-type', status: 'super-approved', source_of_truth: 'wherever' },
    '# Malformed Memory Note\n\nThis note declares nonsense metadata about routing.\n')

  // No frontmatter at all.
  note('60 Memory/bare.md', null, '# Bare Note\n\nNo frontmatter here, mentions routing.\n')

  // repository source-of-truth WITHOUT a canonical_path.
  note('60 Memory/pointerless.md',
    { type: 'reference', status: 'approved', source_of_truth: 'repository' },
    '# Pointerless\n\nClaims the repository is authoritative but names no file. Routing.\n')

  // Excluded folders.
  note('00 Inbox/inbox-capture.md',
    { type: 'research', status: 'draft' }, '# Inbox Capture\n\nUnsorted note about routing.\n')
  note('90 Archive/archived.md',
    { type: 'reference', status: 'archived' }, '# Archived\n\nSuperseded note about routing.\n')

  // Hidden/system material that must never be searchable.
  writeFileSync(join(root, '.obsidian', 'workspace.json'), '{"routing":"ui state"}', 'utf8')
  writeFileSync(join(root, '.obsidian', 'notes.md'), '# Hidden\n\nrouting inside .obsidian\n', 'utf8')
  writeFileSync(join(root, '.git', 'COMMIT_EDITMSG'), 'routing commit message', 'utf8')
  writeFileSync(join(root, '.git', 'leak.md'), '# Git Leak\n\nrouting inside .git\n', 'utf8')

  // A note that lives outside the vault, symlinked in.
  writeFileSync(join(outside, 'secret-outside.md'), '# Outside\n\nrouting outside the vault\n', 'utf8')
  try {
    symlinkSync(join(outside, 'secret-outside.md'), join(root, '10 Architecture', 'escaped.md'))
    symlinkSync(outside, join(root, 'escaped-dir'))
  } catch { /* symlinks unavailable — the containment tests below still assert */ }

  provider = createVaultKnowledgeProvider({ vaultRoot: root })
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

describe('search — determinism', () => {
  it('returns byte-identical results across repeated runs', async () => {
    const a = await provider.search({ query: 'context boundary' })
    const b = await provider.search({ query: 'context boundary' })
    const c = await provider.search({ query: 'context boundary' })
    expect(JSON.stringify(a.hits.map((h) => [h.path, h.score]))).toBe(
      JSON.stringify(b.hits.map((h) => [h.path, h.score])))
    expect(JSON.stringify(b.hits)).toBe(JSON.stringify(c.hits))
  })

  it('orders ties deterministically by authority rank then path', async () => {
    const result = await provider.search({ query: 'routing' })
    const scores = result.hits.map((h) => h.score)
    expect([...scores].sort((x, y) => y - x)).toEqual(scores)
    for (let i = 1; i < result.hits.length; i++) {
      const prev = result.hits[i - 1], cur = result.hits[i]
      if (prev.score !== cur.score) continue
      if (prev.authorityRank !== cur.authorityRank) {
        expect(prev.authorityRank).toBeLessThan(cur.authorityRank)
      } else {
        expect(prev.path.localeCompare(cur.path, 'sv-SE')).toBeLessThanOrEqual(0)
      }
    }
  })
})

describe('search — ranking', () => {
  it('a title match outranks an incidental body mention', async () => {
    const result = await provider.search({ query: 'context boundary' })
    expect(result.hits[0].path).toBe('10 Architecture/context-boundary.md')
  })

  it('an approved note outranks an equivalent draft on the same subject', async () => {
    const result = await provider.search({ query: 'context boundary' })
    const approved = result.hits.findIndex((h) => h.status === 'approved')
    const draft = result.hits.findIndex((h) => h.status === 'draft')
    expect(approved).toBeGreaterThanOrEqual(0)
    expect(draft).toBeGreaterThan(approved)
  })

  it('a path token contributes to relevance', async () => {
    const result = await provider.search({ query: 'decisions' })
    expect(result.hits.some((h) => h.path.startsWith('20 Decisions/'))).toBe(true)
  })

  it('a query matching nothing returns no hits', async () => {
    const result = await provider.search({ query: 'zzzznonexistenttoken' })
    expect(result.hits).toEqual([])
    expect(result.totalMatched).toBe(0)
  })
})

describe('folder policy', () => {
  it('excludes 00 Inbox by default', async () => {
    const result = await provider.search({ query: 'routing' })
    expect(result.hits.some((h) => h.path.startsWith('00 Inbox/'))).toBe(false)
  })

  it('excludes 90 Archive by default', async () => {
    const result = await provider.search({ query: 'routing' })
    expect(result.hits.some((h) => h.path.startsWith('90 Archive/'))).toBe(false)
  })

  it('surfaces them only under an explicit opt-in', async () => {
    const result = await provider.search({ query: 'routing', includeExcludedFolders: true, limit: 20 })
    expect(result.hits.some((h) => h.path.startsWith('00 Inbox/'))).toBe(true)
    expect(result.hits.some((h) => h.path.startsWith('90 Archive/'))).toBe(true)
  })

  it('never surfaces .obsidian, .git or other hidden paths — even opted in', async () => {
    const result = await provider.search({ query: 'routing', includeExcludedFolders: true, limit: 20 })
    for (const hit of result.hits) {
      expect(hit.path.split('/').some((s) => s.startsWith('.'))).toBe(false)
    }
    expect(result.hits.some((h) => h.path.includes('.obsidian'))).toBe(false)
    expect(result.hits.some((h) => h.path.includes('.git'))).toBe(false)
  })
})

describe('frontmatter — fail closed', () => {
  it('unrecognized type and status become null, never approved', async () => {
    const doc = await provider.get('60 Memory/malformed.md')
    expect(doc).not.toBeNull()
    expect(doc!.type).toBeNull()
    expect(doc!.status).toBeNull()
    expect(doc!.authorityRank).toBe(5) // ranked as draft
    expect(doc!.diagnostics.map((d) => d.field).sort()).toEqual(['source_of_truth', 'status', 'type'])
    expect(doc!.diagnostics.every((d) => d.issue === 'field_unrecognized')).toBe(true)
  })

  it('a note with no frontmatter is findable but never authoritative', async () => {
    const doc = await provider.get('60 Memory/bare.md')
    expect(doc!.status).toBeNull()
    expect(doc!.authorityRank).toBe(5)
    expect(doc!.provenance.sourceOfTruth).toBe('vault') // never defaults to repository
    expect(doc!.diagnostics[0].issue).toBe('frontmatter_missing')
  })

  it('repository source-of-truth without canonical_path is flagged', async () => {
    const doc = await provider.get('60 Memory/pointerless.md')
    expect(doc!.provenance.sourceOfTruth).toBe('repository')
    expect(doc!.provenance.canonicalPath).toBeNull()
    expect(doc!.diagnostics.some((d) => d.issue === 'canonical_pointer_missing')).toBe(true)
  })
})

describe('provenance', () => {
  it('preserves canonical_path as a pointer and ranks the repository first', async () => {
    const doc = await provider.get('10 Architecture/canonical-pointer.md')
    expect(doc!.provenance.sourceOfTruth).toBe('repository')
    expect(doc!.provenance.canonicalPath).toBe('docs/architecture/intelligence-fabric/README.md')
    expect(doc!.authorityRank).toBe(1)
  })

  it('never leaks the absolute vault root in a hit path or provenance', async () => {
    const result = await provider.search({ query: 'routing', limit: 20 })
    for (const hit of result.hits) {
      expect(hit.path.startsWith('/')).toBe(false)
      expect(hit.provenance.sourcePath).not.toContain(root)
    }
  })

  it('content hash is stable across calls and content-derived', async () => {
    const a = await provider.get('10 Architecture/context-boundary.md')
    const b = await provider.get('10 Architecture/context-boundary.md')
    expect(a!.provenance.contentHash).toBe(b!.provenance.contentHash)
    expect(a!.provenance.contentHash).toMatch(/^[0-9a-f]{64}$/)
    const other = await provider.get('20 Decisions/reviewed-decision.md')
    expect(other!.provenance.contentHash).not.toBe(a!.provenance.contentHash)
  })

  it('id is stable and path-derived, not content-derived', async () => {
    const a = await provider.get('10 Architecture/context-boundary.md')
    const b = await provider.get('10 Architecture/context-boundary.md')
    expect(a!.id).toBe(b!.id)
    expect(a!.id).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('path safety — fails closed', () => {
  it.each([
    '../escape.md',
    '../../etc/passwd',
    '10 Architecture/../../outside.md',
    '/etc/passwd',
    '/Users/someone/Projects/Omnira/Knowledge/Books/BOOKS_INDEX.md',
    'C:\\Windows\\system32\\drivers\\etc\\hosts',
    '..\\..\\escape.md',
  ])('rejects %s', async (bad) => {
    expect(await provider.get(bad)).toBeNull()
  })

  it('rejects hidden/system paths by exact request', async () => {
    expect(await provider.get('.obsidian/notes.md')).toBeNull()
    expect(await provider.get('.git/leak.md')).toBeNull()
  })

  it('a symlink escaping the vault is never returned by search', async () => {
    const result = await provider.search({ query: 'routing', includeExcludedFolders: true, limit: 20 })
    expect(result.hits.some((h) => h.path.endsWith('escaped.md'))).toBe(false)
    expect(result.hits.some((h) => h.path.startsWith('escaped-dir'))).toBe(false)
  })

  it('a symlink escaping the vault is not readable by exact path either', async () => {
    expect(await provider.get('10 Architecture/escaped.md')).toBeNull()
    expect(await provider.get('escaped-dir/secret-outside.md')).toBeNull()
  })

  it('an unreadable vault root fails loudly at construction, not per query', () => {
    expect(() => createVaultKnowledgeProvider({ vaultRoot: join(tmpdir(), 'no-such-vault-xyz') }))
      .toThrow(VaultRootError)
    expect(() => createVaultKnowledgeProvider({ vaultRoot: '' })).toThrow(VaultRootError)
  })
})

describe('bounds', () => {
  it('clamps the hit count to the provider ceiling regardless of the request', async () => {
    const result = await provider.search({ query: 'routing', limit: 9999, includeExcludedFolders: true })
    expect(result.hits.length).toBeLessThanOrEqual(KNOWLEDGE_BOUNDS.maxHits)
    expect(result.bounds.maxHits).toBe(KNOWLEDGE_BOUNDS.maxHits)
  })

  it('reports when more documents matched than were returned', async () => {
    const result = await provider.search({ query: 'routing', limit: 1, includeExcludedFolders: true })
    expect(result.hits).toHaveLength(1)
    expect(result.totalMatched).toBeGreaterThan(1)
    expect(result.truncated.hits).toBe(true)
  })

  it('holds the aggregate excerpt budget across all hits', async () => {
    const result = await provider.search({ query: 'routing', limit: 20, includeExcludedFolders: true })
    const total = result.hits.reduce((sum, h) => sum + h.excerpt.length, 0)
    expect(total).toBeLessThanOrEqual(KNOWLEDGE_BOUNDS.maxAggregateChars)
  })

  it('no single excerpt exceeds the per-hit budget', async () => {
    const result = await provider.search({ query: 'routing', limit: 20, includeExcludedFolders: true })
    for (const hit of result.hits) {
      expect(hit.excerpt.length).toBeLessThanOrEqual(KNOWLEDGE_BOUNDS.maxExcerptChars)
    }
  })
})

describe('truncation', () => {
  const bigRoot = () => join(tmpdir(), 'omnira-vault-big')

  it('truncates deterministically and reports it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnira-vault-big-'))
    try {
      mkdirSync(join(dir, '10 Architecture'), { recursive: true })
      const body = 'boundary '.repeat(400) // well past the excerpt budget
      writeFileSync(join(dir, '10 Architecture', 'long.md'),
        `---\ntype: architecture\nstatus: approved\n---\n\n# Long\n\n${body}`, 'utf8')
      const p = createVaultKnowledgeProvider({ vaultRoot: dir })

      const a = await p.search({ query: 'boundary' })
      const b = await p.search({ query: 'boundary' })
      expect(a.hits[0].excerpt).toBe(b.hits[0].excerpt) // same cut every run
      expect(a.hits[0].excerpt.length).toBe(KNOWLEDGE_BOUNDS.maxExcerptChars)
      expect(a.hits[0].excerptTruncated).toBe(true)
      expect(a.truncated.excerpt).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('bounds a single document returned by get', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnira-vault-doc-'))
    try {
      mkdirSync(join(dir, '10 Architecture'), { recursive: true })
      writeFileSync(join(dir, '10 Architecture', 'huge.md'),
        `---\ntype: architecture\nstatus: approved\n---\n\n# Huge\n\n${'x'.repeat(60_000)}`, 'utf8')
      const p = createVaultKnowledgeProvider({ vaultRoot: dir })
      const doc = await p.get('10 Architecture/huge.md')
      expect(doc!.content.length).toBe(KNOWLEDGE_BOUNDS.maxDocumentChars)
      expect(doc!.contentTruncated).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  void bigRoot
})

describe('filters', () => {
  it('project filter restricts results to that project', async () => {
    const result = await provider.search({ query: 'decision', project: 'trading' })
    expect(result.hits.length).toBeGreaterThan(0)
    expect(result.hits.every((h) => h.project === 'trading')).toBe(true)
  })

  it('type filter excludes notes whose type could not be trusted', async () => {
    const result = await provider.search({ query: 'routing', types: ['architecture'], includeExcludedFolders: true })
    expect(result.hits.every((h) => h.type === 'architecture')).toBe(true)
    expect(result.hits.some((h) => h.path === '60 Memory/malformed.md')).toBe(false)
  })
})
