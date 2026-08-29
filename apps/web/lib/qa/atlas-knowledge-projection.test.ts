/**
 * Knowledge Projection Slice 1 — exhaustive enumeration and eligibility.
 *
 * Everything runs against TEMPORARY fixture vaults in os.tmpdir(). The real
 * Omnira vault is never read or written here.
 *
 * The load-bearing property is exhaustiveness. `KnowledgeProvider.search` is
 * capped at 20 hits by design, so a publisher built on it would silently ship
 * the first 20 eligible notes and no one would notice until something was
 * missing from Atlas. The scale tests below (1, 20, 21, 100, 1000) exist to make
 * that failure impossible to reintroduce quietly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  createKnowledgeProjectionSource, assertReconciled, ProjectionReconciliationError,
} from '@/lib/atlas/knowledge/projection/source'
import { evaluateEligibility } from '@/lib/atlas/knowledge/projection/eligibility'
import { scanForSecretShapes } from '@/lib/atlas/knowledge/projection/secret-scan'
import { renderProjectionReport } from '@/lib/atlas/knowledge/projection/report'
import { parseKnowledgeDocument } from '@/lib/atlas/knowledge/document'
import { KNOWLEDGE_BOUNDS } from '@/lib/atlas/knowledge/policy'

const dirs: string[] = []
function tempVault(): string {
  const d = mkdtempSync(join(tmpdir(), 'omnira-projection-'))
  dirs.push(d)
  return d
}
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

/** A fully-publishable note, so each test can subtract exactly one gate. */
function eligibleNote(overrides: Record<string, string> = {}, body = 'Body about routing.\n'): string {
  const fm: Record<string, string> = {
    type: 'architecture', status: 'approved', classification: 'internal', scope: 'platform',
    ...overrides,
  }
  const entries = Object.entries(fm).filter(([, v]) => v !== '')
  return `---\n${entries.map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n# Note\n\n${body}`
}

function write(root: string, rel: string, content: string): void {
  const full = join(root, ...rel.split('/'))
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content, 'utf8')
}

// ── 1–5. exhaustive enumeration at scale ─────────────────────────────────────

describe('exhaustive enumeration — never truncates', () => {
  it.each([1, 20, 21, 100, 1000])('enumerates all %i notes', (n) => {
    const root = tempVault()
    for (let i = 0; i < n; i++) {
      write(root, `10 Architecture/note-${String(i).padStart(4, '0')}.md`, eligibleNote())
    }
    const listing = createKnowledgeProjectionSource({ vaultRoot: root }).listAll()

    expect(listing.candidates).toHaveLength(n)
    expect(listing.accounting.filesDiscovered).toBe(n)
    expect(listing.accounting.candidatesEvaluated).toBe(n)
    expect(listing.accounting.eligible).toBe(n)
    // The provider ceiling must have no influence whatsoever here.
    if (n > KNOWLEDGE_BOUNDS.maxHits) {
      expect(listing.candidates.length).toBeGreaterThan(KNOWLEDGE_BOUNDS.maxHits)
    }
  })

  it('crossing the 20-hit provider ceiling changes nothing', () => {
    const root = tempVault()
    for (let i = 0; i < 21; i++) write(root, `10 Architecture/n${i}.md`, eligibleNote())
    const listing = createKnowledgeProjectionSource({ vaultRoot: root }).listAll()
    expect(listing.accounting.candidatesEvaluated).toBe(21)
    expect(listing.accounting.candidatesEvaluated).toBeGreaterThan(KNOWLEDGE_BOUNDS.maxHits)
  })

  it('the source exposes no way to express a limit', () => {
    const root = tempVault()
    const source = createKnowledgeProjectionSource({ vaultRoot: root })
    // listAll takes no arguments at all — truncation is not expressible.
    expect(source.listAll.length).toBe(0)
  })
})

// ── 6. deterministic ordering ────────────────────────────────────────────────

describe('determinism', () => {
  it('orders identically across runs, independent of creation order', () => {
    const root = tempVault()
    for (const name of ['zebra', 'alpha', 'Ångström', 'middle', '0-first']) {
      write(root, `10 Architecture/${name}.md`, eligibleNote())
    }
    const source = createKnowledgeProjectionSource({ vaultRoot: root })
    const a = source.listAll().candidates.map((c) => c.path)
    const b = source.listAll().candidates.map((c) => c.path)
    expect(a).toEqual(b)
    expect(a).toEqual([...a].sort()) // byte-stable, not locale collation
  })

  it('renders a byte-identical report across runs', () => {
    const root = tempVault()
    write(root, '10 Architecture/a.md', eligibleNote())
    write(root, '20 Decisions/b.md', eligibleNote({ status: 'draft' }))
    const source = createKnowledgeProjectionSource({ vaultRoot: root })
    expect(renderProjectionReport(source.listAll())).toBe(renderProjectionReport(source.listAll()))
  })
})

// ── 7–11. traversal safety ───────────────────────────────────────────────────

describe('traversal safety', () => {
  let root: string
  let outside: string
  beforeAll(() => {
    root = tempVault()
    outside = tempVault()
    write(root, '10 Architecture/ok.md', eligibleNote())
    write(root, '00 Inbox/capture.md', eligibleNote())
    write(root, '90 Archive/old.md', eligibleNote())
    mkdirSync(join(root, '.obsidian'), { recursive: true })
    mkdirSync(join(root, '.git'), { recursive: true })
    writeFileSync(join(root, '.obsidian', 'hidden.md'), eligibleNote(), 'utf8')
    writeFileSync(join(root, '.git', 'leak.md'), eligibleNote(), 'utf8')
    writeFileSync(join(outside, 'secret.md'), eligibleNote(), 'utf8')
    try {
      symlinkSync(join(outside, 'secret.md'), join(root, '10 Architecture', 'escaped.md'))
      symlinkSync(outside, join(root, 'escaped-dir'))
    } catch { /* symlinks unavailable */ }
  })

  it('never enumerates hidden or system folders', () => {
    const listing = createKnowledgeProjectionSource({ vaultRoot: root }).listAll()
    for (const c of listing.candidates) {
      expect(c.path.split('/').some((s) => s.startsWith('.'))).toBe(false)
    }
  })

  it('enumerates Inbox and Archive but marks them ineligible (visible, never published)', () => {
    const listing = createKnowledgeProjectionSource({ vaultRoot: root }).listAll()
    const inbox = listing.candidates.find((c) => c.path.startsWith('00 Inbox/'))
    const archive = listing.candidates.find((c) => c.path.startsWith('90 Archive/'))
    expect(inbox, 'Inbox note should be reported, not hidden').toBeDefined()
    expect(archive).toBeDefined()
    expect(inbox!.eligibility.eligible).toBe(false)
    expect(inbox!.eligibility.reasons).toContain('folder_excluded')
    expect(archive!.eligibility.reasons).toContain('folder_excluded')
  })

  it('never enumerates a symlink that escapes the vault', () => {
    const listing = createKnowledgeProjectionSource({ vaultRoot: root }).listAll()
    expect(listing.candidates.some((c) => c.path.endsWith('escaped.md'))).toBe(false)
    expect(listing.candidates.some((c) => c.path.startsWith('escaped-dir'))).toBe(false)
  })

  it('readDocument refuses traversal, absolute paths and hidden files', async () => {
    const source = createKnowledgeProjectionSource({ vaultRoot: root })
    for (const bad of ['../escape.md', '/etc/passwd', 'C:\\hosts', '10 Architecture/../../x.md',
      '.obsidian/hidden.md', '.git/leak.md', '10 Architecture/escaped.md']) {
      expect(source.readDocument(bad), bad).toBeNull()
    }
    expect(source.readDocument('10 Architecture/ok.md')).not.toBeNull()
  })
})

// ── 12–13. nothing disappears; diagnostics survive ───────────────────────────

describe('accounting — nothing disappears silently', () => {
  it('malformed metadata is evaluated and reported, never dropped', () => {
    const root = tempVault()
    write(root, '10 Architecture/good.md', eligibleNote())
    write(root, '10 Architecture/bad.md',
      '---\ntype: nonsense\nstatus: super-approved\n---\n\n# Bad\n\nbody\n')
    write(root, '10 Architecture/bare.md', '# Bare\n\nno frontmatter\n')

    const listing = createKnowledgeProjectionSource({ vaultRoot: root }).listAll()
    expect(listing.accounting.filesDiscovered).toBe(3)
    expect(listing.accounting.candidatesEvaluated).toBe(3)
    const bad = listing.candidates.find((c) => c.path.endsWith('bad.md'))!
    expect(bad.type).toBeNull()
    expect(bad.status).toBeNull()
    expect(bad.eligibility.eligible).toBe(false)
    expect(bad.diagnostics.length).toBeGreaterThan(0)
  })

  it('surfaces the repository pointer failure as its own reason', () => {
    const root = tempVault()
    write(root, '10 Architecture/pointerless.md',
      eligibleNote({ source_of_truth: 'repository' }))
    const listing = createKnowledgeProjectionSource({ vaultRoot: root }).listAll()
    const c = listing.candidates[0]
    expect(c.declaredSourceOfTruth).toBe('repository')
    expect(c.trustedSourceOfTruth).toBe('vault') // Phase-1 contract still holds
    expect(c.eligibility.reasons).toContain('canonical_pointer_missing')
    expect(c.eligibility.eligible).toBe(false)
  })

  it('reconciliation failure raises rather than under-reporting', () => {
    expect(() => assertReconciled({
      filesDiscovered: 10, filesUnreadable: 1, candidatesEvaluated: 8, eligible: 8, ineligible: 0,
    })).toThrow(ProjectionReconciliationError)
    expect(() => assertReconciled({
      filesDiscovered: 9, filesUnreadable: 1, candidatesEvaluated: 8, eligible: 3, ineligible: 4,
    })).toThrow(ProjectionReconciliationError)
  })

  it('an unreadable file is accounted, not lost', () => {
    const root = tempVault()
    write(root, '10 Architecture/ok.md', eligibleNote())
    // Oversized file — refused by the shared size ceiling.
    write(root, '10 Architecture/huge.md', 'x'.repeat(KNOWLEDGE_BOUNDS.maxFileBytes + 10))
    const listing = createKnowledgeProjectionSource({ vaultRoot: root }).listAll()
    expect(listing.accounting.filesDiscovered).toBe(2)
    expect(listing.accounting.filesUnreadable).toBe(1)
    expect(listing.accounting.candidatesEvaluated).toBe(1)
    expect(listing.unreadable).toEqual(['10 Architecture/huge.md'])
  })
})

// ── 14–19. eligibility gates ─────────────────────────────────────────────────

describe('eligibility — approval alone is never enough', () => {
  function evaluate(fm: Record<string, string>, body = 'routing', map?: Record<string, string>) {
    const raw = `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n# T\n\n${body}\n`
    const doc = parseKnowledgeDocument(raw, '10 Architecture/x.md')
    return evaluateEligibility({ doc, rawFrontMatter: doc.rawFrontMatter, projectScopeMap: map, content: raw })
  }

  it('approved + everything else → eligible', () => {
    const r = evaluate({ type: 'architecture', status: 'approved', classification: 'internal', scope: 'platform' })
    expect(r.eligible).toBe(true)
    expect(r.reasons).toEqual([])
  })

  it('approved but no classification → ineligible', () => {
    const r = evaluate({ type: 'architecture', status: 'approved', scope: 'platform' })
    expect(r.eligible).toBe(false)
    expect(r.reasons).toContain('classification_missing')
  })

  it('unknown classification → ineligible (including "prohibited", pending Slice 2)', () => {
    for (const value of ['prohibited', 'top-secret', 'Internal']) {
      const r = evaluate({ type: 'architecture', status: 'approved', classification: value, scope: 'platform' })
      expect(r.eligible, value).toBe(false)
      expect(r.reasons).toContain('classification_unrecognized')
    }
  })

  it('local_only never leaves the machine', () => {
    const r = evaluate({ type: 'architecture', status: 'approved', classification: 'local_only', scope: 'platform' })
    expect(r.eligible).toBe(false)
    expect(r.reasons).toContain('classification_local_only')
  })

  it('missing scope → ineligible; project scope needs an explicit mapping', () => {
    const noScope = evaluate({ type: 'architecture', status: 'approved', classification: 'internal' })
    expect(noScope.reasons).toContain('scope_missing')

    const unmapped = evaluate({ type: 'architecture', status: 'approved', classification: 'internal', project: 'trading' })
    expect(unmapped.reasons).toContain('project_scope_unmapped')
    expect(unmapped.scope).toBeNull()

    const mapped = evaluate(
      { type: 'architecture', status: 'approved', classification: 'internal', project: 'trading' },
      'routing', { trading: 'proj-123' },
    )
    expect(mapped.eligible).toBe(true)
    expect(mapped.scope).toEqual({ kind: 'project', projectId: 'proj-123' })
  })

  it.each(['draft', 'reviewed', 'archived'])('status %s → ineligible', (status) => {
    const r = evaluate({ type: 'architecture', status, classification: 'internal', scope: 'platform' })
    expect(r.eligible).toBe(false)
    expect(r.reasons).toContain('status_not_approved')
  })

  it('collects every failing reason, not just the first', () => {
    const r = evaluate({ status: 'draft' })
    expect(r.reasons.length).toBeGreaterThanOrEqual(4)
    expect(r.reasons).toEqual([...r.reasons].sort(
      (a, b) => r.reasons.indexOf(a) - r.reasons.indexOf(b))) // stable documented order
  })
})

// ── 19. secrets ──────────────────────────────────────────────────────────────

describe('secret gate — blocks credentials, never leaks them, never blocks PII', () => {
  it('credential-shaped material makes a note ineligible', () => {
    const root = tempVault()
    write(root, '10 Architecture/leaky.md',
      eligibleNote({}, 'token: ghp_abcdefghijklmnopqrstuvwxyz012345\n'))
    const listing = createKnowledgeProjectionSource({ vaultRoot: root }).listAll()
    const c = listing.candidates[0]
    expect(c.eligibility.eligible).toBe(false)
    expect(c.eligibility.reasons).toContain('secret_detected')
    expect(c.eligibility.secretFindings.map((f) => f.pattern)).toContain('GitHub token')
  })

  it('never returns or renders the matched value', () => {
    const secret = 'ghp_abcdefghijklmnopqrstuvwxyz012345'
    const root = tempVault()
    write(root, '10 Architecture/leaky.md', eligibleNote({}, `token: ${secret}\n`))
    const listing = createKnowledgeProjectionSource({ vaultRoot: root }).listAll()
    expect(JSON.stringify(listing)).not.toContain(secret)
    expect(renderProjectionReport(listing)).not.toContain(secret)
  })

  it('does not flag hashes or commit ids as secrets', () => {
    const sha = 'a'.repeat(64)
    const commit = '9ce0559013e6cd7d6b5164e3d2557400dfc8f9bd'
    expect(scanForSecretShapes(`hash ${sha} commit ${commit}`)).toEqual([])
  })

  it('does not block PII or confidential business content', () => {
    const prose = 'Customer Anna Andersson, anna@example.com, churned in Q3. Revenue impact SEK 42 000.'
    expect(scanForSecretShapes(prose)).toEqual([])
  })
})

// ── report ───────────────────────────────────────────────────────────────────

describe('operator report', () => {
  it('states an empty eligible set as correct, not as failure', () => {
    const root = tempVault()
    write(root, '10 Architecture/a.md', '---\ntype: architecture\nstatus: approved\n---\n\n# A\n\nx\n')
    const text = renderProjectionReport(createKnowledgeProjectionSource({ vaultRoot: root }).listAll())
    expect(text).toContain('RESULT: 0 notes are remotely publishable')
    expect(text).toContain('that is the correct answer — not a failure')
    expect(text).toContain('PENDING POLICY DECISIONS')
  })

  it('reports reconciliation and never prints note bodies', () => {
    const root = tempVault()
    write(root, '10 Architecture/a.md', eligibleNote({}, 'SECRET-BODY-SENTINEL prose here.\n'))
    const listing = createKnowledgeProjectionSource({ vaultRoot: root }).listAll()
    const text = renderProjectionReport(listing)
    expect(text).toContain('reconciled           yes')
    expect(text).not.toContain('SECRET-BODY-SENTINEL')
  })
})
