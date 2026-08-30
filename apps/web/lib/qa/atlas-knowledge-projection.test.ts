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
import {
  evaluateEligibility, PUBLICATION_CLASSIFICATIONS,
  REMOTELY_PUBLISHABLE_CLASSIFICATIONS, PUBLICATION_SCOPES,
} from '@/lib/atlas/knowledge/projection/eligibility'
import {
  scanForSecretShapes, redactSecretShapes, containsSecretShape, SECRET_PLACEHOLDER,
} from '@/lib/atlas/knowledge/projection/secret-scan'
import {
  renderProjectionReport, toSafeProjectionReportJson,
} from '@/lib/atlas/knowledge/projection/report'
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

  it('missing scope → ineligible, even with a mapped project (policy v1: no inference)', () => {
    const noScope = evaluate({ type: 'architecture', status: 'approved', classification: 'internal' })
    expect(noScope.reasons).toContain('scope_missing')

    const mappedButNoScope = evaluate(
      { type: 'architecture', status: 'approved', classification: 'internal', project: 'trading' },
      'routing', { trading: '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b' },
    )
    expect(mappedButNoScope.eligible).toBe(false)
    expect(mappedButNoScope.reasons).toContain('scope_missing')
    expect(mappedButNoScope.scope).toBeNull()
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
    expect(text).toContain('curate notes rather than widening the policy')
    expect(text).toContain('Publication Policy v1 is LOCKED')
    expect(text).not.toContain('PENDING POLICY DECISIONS')
    expect(text).not.toContain('lands in Slice 2')
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

// ─────────────────────────────────────────────────────────────────────────────
// FAIL-CLOSED CORRECTIONS (pre-merge review of PR #121)
//
// Three defects, all of the same family: the detector was right and something
// downstream was wrong. Detecting a secret while echoing it, and refusing to
// understand metadata while publishing from it anyway, are both "we knew and
// shipped it regardless".
// ─────────────────────────────────────────────────────────────────────────────

const SECRET = 'ghp_abcdefghijklmnopqrstuvwxyz012345'

describe('secret safety — the REPORT must not echo what the scanner caught', () => {
  function reportFor(files: Record<string, string>, map?: Record<string, string>) {
    const root = tempVault()
    for (const [rel, content] of Object.entries(files)) write(root, rel, content)
    const listing = createKnowledgeProjectionSource({ vaultRoot: root, projectScopeMap: map }).listAll()
    return { listing, text: renderProjectionReport(listing) }
  }

  it('1. secret in the note body', () => {
    const { listing, text } = reportFor({
      '10 Architecture/a.md': eligibleNote({}, `token: ${SECRET}\n`),
    })
    expect(listing.candidates[0].eligibility.reasons).toContain('secret_detected')
    expect(text).not.toContain(SECRET)
    expect(text).toContain('GitHub token')
    expect(text).toContain(listing.candidates[0].id) // still locatable
  })

  it('2. secret in the H1 title', () => {
    const { listing, text } = reportFor({
      '10 Architecture/b.md':
        `---\ntype: architecture\nstatus: approved\nclassification: internal\nscope: platform\n---\n\n# ${SECRET}\n\nbody\n`,
    })
    expect(listing.candidates[0].eligibility.reasons).toContain('secret_detected')
    expect(text).not.toContain(SECRET)
    expect(text).toContain(SECRET_PLACEHOLDER)
    expect(text).toContain(listing.candidates[0].contentHash.slice(0, 16))
  })

  it('3. secret in the project field', () => {
    const { listing, text } = reportFor({
      '10 Architecture/c.md': eligibleNote({ project: SECRET, scope: '' }),
    }, { [SECRET]: 'proj-1' })
    expect(listing.candidates[0].eligibility.reasons).toContain('secret_detected')
    expect(text).not.toContain(SECRET)
  })

  it('4. secret in canonical_path', () => {
    const { listing, text } = reportFor({
      '10 Architecture/d.md': eligibleNote({ source_of_truth: 'repository', canonical_path: `docs/${SECRET}.md` }),
    })
    expect(listing.candidates[0].eligibility.reasons).toContain('secret_detected')
    expect(text).not.toContain(SECRET)
  })

  it('5. secret in an invalid source_of_truth, echoed via diagnostic.detail', () => {
    // The original leak: document.ts quotes the rejected value verbatim.
    const { listing, text } = reportFor({
      '10 Architecture/e.md': eligibleNote({ source_of_truth: SECRET }),
    })
    const c = listing.candidates[0]
    expect(c.diagnostics.some((d) => d.detail.includes(SECRET))).toBe(true) // still in the object…
    expect(text).not.toContain(SECRET)                                       // …never in the report
    expect(c.eligibility.reasons).toContain('secret_detected')
    expect(c.eligibility.reasons).toContain('source_of_truth_unrecognized')
  })

  it('6. secret in the filename/path — redacted AND ineligible', () => {
    // Redaction governs what an operator SEES; eligibility governs what LEAVES
    // THE MACHINE. The path is projection metadata, so a credential-shaped
    // filename must fail the hard gate, not merely render safely.
    const { listing, text } = reportFor({
      [`10 Architecture/${SECRET}.md`]: eligibleNote({}, 'clean body\n'),
    })
    const c = listing.candidates[0]
    expect(c, 'candidate still exists locally for operator inspection').toBeDefined()
    expect(c.eligibility.reasons).toContain('secret_detected')
    expect(c.eligibility.eligible).toBe(false)
    expect(c.eligibility.secretFindings.map((f) => f.pattern)).toContain('GitHub token')
    expect(text).not.toContain(SECRET)
    expect(text).toContain('[REDACTED PATH — SECRET SHAPE DETECTED]')
    expect(text).toContain(c.id)                              // stable id visible
    expect(text).toContain(c.contentHash.slice(0, 16))        // stable hash visible
  })

  it('an ordinary safe path stays eligible when every other gate passes', () => {
    const { listing } = reportFor({ '10 Architecture/ordinary-note.md': eligibleNote() })
    expect(listing.candidates[0].eligibility.eligible).toBe(true)
    expect(listing.candidates[0].eligibility.secretFindings).toEqual([])
  })

  it('scanForSecretShapes still returns pattern names only, never values', () => {
    const findings = scanForSecretShapes(`x ${SECRET} y`)
    expect(JSON.stringify(findings)).not.toContain(SECRET)
    expect(findings.map((f) => f.pattern)).toContain('GitHub token')
  })

  it('redaction shares the detector rules — hashes survive, secrets do not', () => {
    const sha = 'a'.repeat(64)
    expect(redactSecretShapes(`hash ${sha}`)).toContain(sha)      // not a secret shape
    expect(containsSecretShape(`hash ${sha}`)).toBe(false)
    expect(redactSecretShapes(`t ${SECRET}`)).not.toContain(SECRET)
    expect(redactSecretShapes(`t ${SECRET}`)).toContain(SECRET_PLACEHOLDER)
  })
})

describe('source_of_truth — declared but unrecognized fails closed', () => {
  function evalNote(fm: Record<string, string>) {
    const raw = `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n# T\n\nbody\n`
    const doc = parseKnowledgeDocument(raw, '10 Architecture/x.md')
    return { doc, result: evaluateEligibility({ doc, rawFrontMatter: doc.rawFrontMatter, content: raw }) }
  }
  const base = { type: 'architecture', status: 'approved', classification: 'internal', scope: 'platform' }

  it('VALID: vault / external / repository+pointer remain eligible', () => {
    expect(evalNote({ ...base, source_of_truth: 'vault' }).result.eligible).toBe(true)
    expect(evalNote({ ...base, source_of_truth: 'external' }).result.eligible).toBe(true)
    expect(evalNote({ ...base, source_of_truth: 'repository', canonical_path: 'docs/x.md' }).result.eligible).toBe(true)
  })

  it('VALID: omitting source_of_truth entirely is still fine — absence ≠ garbage', () => {
    expect(evalNote(base).result.eligible).toBe(true)
  })

  it('INVALID: an unrecognized declared value is ineligible with its own reason', () => {
    const { doc, result } = evalNote({ ...base, source_of_truth: 'bananas' })
    expect(doc.diagnostics.some((d) => d.field === 'source_of_truth')).toBe(true)
    expect(result.eligible).toBe(false)
    expect(result.reasons).toContain('source_of_truth_unrecognized')
  })

  it('Phase-1 trusted-source semantics are untouched', () => {
    const { doc } = evalNote({ ...base, source_of_truth: 'bananas' })
    expect(doc.declaredSourceOfTruth).toBeNull()
    expect(doc.sourceOfTruth).toBe('vault') // degraded, not inferred as repository
  })
})

describe('scope — an explicit unknown value never falls through to project', () => {
  function evalNote(fm: Record<string, string>, map?: Record<string, string>) {
    const raw = `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n# T\n\nbody\n`
    const doc = parseKnowledgeDocument(raw, '10 Architecture/x.md')
    return evaluateEligibility({ doc, rawFrontMatter: doc.rawFrontMatter, projectScopeMap: map, content: raw })
  }
  const base = { type: 'architecture', status: 'approved', classification: 'internal' }

  it('scope: platform still resolves', () => {
    expect(evalNote({ ...base, scope: 'platform' }).eligible).toBe(true)
  })

  it('absent scope + mapped project is NOW ineligible — inference removed by policy v1', () => {
    const r = evalNote({ ...base, project: 'trading' }, { trading: '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b' })
    expect(r.eligible).toBe(false)
    expect(r.reasons).toContain('scope_missing')
    expect(r.scope).toBeNull()
  })

  it('INVALID: scope: bananas + mapped project is STILL ineligible', () => {
    const r = evalNote({ ...base, scope: 'bananas', project: 'trading' }, { trading: '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b' })
    expect(r.eligible).toBe(false)
    expect(r.reasons).toContain('scope_unrecognized')
    expect(r.reasons).not.toContain('project_scope_unmapped') // refused on its own terms
    expect(r.scope).toBeNull()
  })

  it('VALID: scope: project + mapped slug resolves (policy v1 vocabulary)', () => {
    const r = evalNote({ ...base, scope: 'project', project: 'trading' }, { trading: '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b' })
    expect(r.eligible).toBe(true)
    expect(r.scope).toEqual({ kind: 'project', projectId: '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PUBLICATION POLICY v1 — the locked owner contract (VAULT_POLICY.md §6)
//
// The policy lives in the vault; this suite is where the code is held to it.
// Every case below is a sentence from §6 turned into an assertion.
// ─────────────────────────────────────────────────────────────────────────────

describe('Publication Policy v1 — vocabulary', () => {
  it('classification is exactly the four owner-approved values', () => {
    expect([...PUBLICATION_CLASSIFICATIONS]).toEqual(
      ['public', 'internal', 'confidential', 'local_only'])
    expect(PUBLICATION_CLASSIFICATIONS as readonly string[]).not.toContain('prohibited')
  })

  it('only public and internal may leave the machine in transport v1', () => {
    expect([...REMOTELY_PUBLISHABLE_CLASSIFICATIONS]).toEqual(['public', 'internal'])
  })

  it('scope is exactly platform and project', () => {
    expect([...PUBLICATION_SCOPES]).toEqual(['platform', 'project'])
  })
})

describe('Publication Policy v1 — classification enforcement', () => {
  function evalNote(fm: Record<string, string>, map?: Record<string, string>) {
    const raw = `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n# T\n\nbody\n`
    const doc = parseKnowledgeDocument(raw, '10 Architecture/x.md')
    return evaluateEligibility({ doc, rawFrontMatter: doc.rawFrontMatter, projectScopeMap: map, content: raw })
  }
  const gates = { type: 'architecture', status: 'approved', scope: 'platform' }

  it('public + all gates → eligible', () => {
    const r = evalNote({ ...gates, classification: 'public' })
    expect(r.eligible).toBe(true)
    expect(r.classification).toBe('public')
  })

  it('internal + all gates → eligible', () => {
    const r = evalNote({ ...gates, classification: 'internal' })
    expect(r.eligible).toBe(true)
  })

  it('confidential → RECOGNIZED but remote-blocked, with its own reason', () => {
    const r = evalNote({ ...gates, classification: 'confidential' })
    expect(r.eligible).toBe(false)
    // Recognized: the classification is parsed and reported, not discarded.
    expect(r.classification).toBe('confidential')
    expect(r.reasons).toContain('classification_confidential_remote_blocked')
    // Policy staging is NOT bad metadata — the operator must be able to tell them apart.
    expect(r.reasons).not.toContain('classification_unrecognized')
    expect(r.reasons).not.toContain('classification_local_only')
  })

  it('local_only → never remote, distinct from confidential', () => {
    const r = evalNote({ ...gates, classification: 'local_only' })
    expect(r.eligible).toBe(false)
    expect(r.classification).toBe('local_only')
    expect(r.reasons).toContain('classification_local_only')
    expect(r.reasons).not.toContain('classification_confidential_remote_blocked')
  })

  it('prohibited → unrecognized, never a classification', () => {
    const r = evalNote({ ...gates, classification: 'prohibited' })
    expect(r.eligible).toBe(false)
    expect(r.classification).toBeNull()
    expect(r.reasons).toContain('classification_unrecognized')
  })

  it('missing classification → ineligible', () => {
    const r = evalNote(gates)
    expect(r.eligible).toBe(false)
    expect(r.reasons).toContain('classification_missing')
  })

  it.each(['Internal', 'PUBLIC', 'secret', 'restricted'])('unknown %s → ineligible', (value) => {
    const r = evalNote({ ...gates, classification: value })
    expect(r.eligible).toBe(false)
    expect(r.reasons).toContain('classification_unrecognized')
  })

  it('a classification never rescues a secret', () => {
    const r = evalNote({ ...gates, classification: 'public', canonical_path: 'ghp_abcdefghijklmnopqrstuvwxyz012345' })
    expect(r.eligible).toBe(false)
    expect(r.reasons).toContain('secret_detected')
  })
})

describe('Publication Policy v1 — scope enforcement', () => {
  function evalNote(fm: Record<string, string>, map?: Record<string, string>) {
    const raw = `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n# T\n\nbody\n`
    const doc = parseKnowledgeDocument(raw, '10 Architecture/x.md')
    return evaluateEligibility({ doc, rawFrontMatter: doc.rawFrontMatter, projectScopeMap: map, content: raw })
  }
  const gates = { type: 'architecture', status: 'approved', classification: 'internal' }
  const MAP = { trading: '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b' }

  it('scope: platform + no project → valid platform scope', () => {
    const r = evalNote({ ...gates, scope: 'platform' })
    expect(r.eligible).toBe(true)
    expect(r.scope).toEqual({ kind: 'platform' })
  })

  it('scope: platform + project present → CONFLICT, never silently ignored', () => {
    const r = evalNote({ ...gates, scope: 'platform', project: 'trading' }, MAP)
    expect(r.eligible).toBe(false)
    expect(r.reasons).toContain('platform_scope_project_conflict')
    expect(r.scope).toBeNull()
  })

  it('scope: project + mapped slug → resolved project scope', () => {
    const r = evalNote({ ...gates, scope: 'project', project: 'trading' }, MAP)
    expect(r.eligible).toBe(true)
    expect(r.scope).toEqual({ kind: 'project', projectId: '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b' })
  })

  it('scope: project + no project slug → ineligible', () => {
    const r = evalNote({ ...gates, scope: 'project' }, MAP)
    expect(r.eligible).toBe(false)
    expect(r.reasons).toContain('project_scope_missing')
  })

  it('scope: project + unmapped slug → ineligible, no invented id', () => {
    const r = evalNote({ ...gates, scope: 'project', project: 'not-a-real-project' }, MAP)
    expect(r.eligible).toBe(false)
    expect(r.reasons).toContain('project_scope_unmapped')
    expect(r.scope).toBeNull()
  })

  it('no fuzzy matching — a near-miss slug does not resolve', () => {
    // Case, truncation and suffixes are all genuine misses. Lookup is exact.
    for (const slug of ['Trading', 'tradin', 'trading-v2', 'trading_v2']) {
      const r = evalNote({ ...gates, scope: 'project', project: slug }, MAP)
      expect(r.eligible, slug).toBe(false)
      expect(r.reasons).toContain('project_scope_unmapped')
    }
  })

  it('surrounding whitespace is trimmed, which is not fuzzy matching', () => {
    // Phase-1 trims every frontmatter value, so `project: trading ` IS the slug
    // `trading` — an exact match after normalisation, not a near-miss that the
    // resolver decided to forgive.
    const r = evalNote({ ...gates, scope: 'project', project: 'trading ' }, MAP)
    expect(r.eligible).toBe(true)
    expect(r.scope).toEqual({ kind: 'project', projectId: '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b' })
  })

  it('missing scope + mapped project → STILL ineligible via scope_missing', () => {
    const r = evalNote({ ...gates, project: 'trading' }, MAP)
    expect(r.eligible).toBe(false)
    expect(r.reasons).toContain('scope_missing')
    expect(r.reasons).not.toContain('project_scope_unmapped')
    expect(r.scope).toBeNull()
  })

  it('unknown explicit scope + mapped project → STILL ineligible via scope_unrecognized', () => {
    const r = evalNote({ ...gates, scope: 'bananas', project: 'trading' }, MAP)
    expect(r.eligible).toBe(false)
    expect(r.reasons).toContain('scope_unrecognized')
    expect(r.reasons).not.toContain('project_scope_unmapped')
  })

  it('a resolved project scope always carries a projectId', () => {
    const r = evalNote({ ...gates, scope: 'project', project: 'trading' }, MAP)
    expect(r.scope?.kind).toBe('project')
    if (r.scope?.kind === 'project') expect(typeof r.scope.projectId).toBe('string')
  })
})

describe('operator guidance reflects a LOCKED policy', () => {
  it('no longer implies anything is pending or provisional', () => {
    const root = tempVault()
    write(root, '10 Architecture/a.md', '---\ntype: architecture\nstatus: approved\n---\n\n# A\n\nx\n')
    const text = renderProjectionReport(createKnowledgeProjectionSource({ vaultRoot: root }).listAll())
    for (const stale of ['vocabulary lands in Slice 2', 'PENDING POLICY DECISIONS',
      'Slice 2)', 'PROVISIONAL', 'provisional']) {
      expect(text, `stale wording: ${stale}`).not.toContain(stale)
    }
    expect(text).toContain('Publication Policy v1 is LOCKED')
    expect(text).toContain('explicit classification required by Publication Policy v1')
  })

  it('explains confidential as policy staging, not as an error', () => {
    const root = tempVault()
    write(root, '10 Architecture/c.md',
      '---\ntype: architecture\nstatus: approved\nclassification: confidential\nscope: platform\n---\n\n# C\n\nx\n')
    const text = renderProjectionReport(createKnowledgeProjectionSource({ vaultRoot: root }).listAll())
    expect(text).toContain('confidential is recognized but remote-blocked')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT MAPPING — identity comes from an entry someone put there
// ─────────────────────────────────────────────────────────────────────────────

describe('project mapping — own-property lookup and id validation', () => {
  const VALID_ID = '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b'
  function evalProject(slug: string, map?: Record<string, string>) {
    const raw = `---\ntype: architecture\nstatus: approved\nclassification: internal\n` +
      `scope: project\nproject: ${slug}\n---\n\n# T\n\nbody\n`
    const doc = parseKnowledgeDocument(raw, '10 Architecture/x.md')
    return evaluateEligibility({ doc, rawFrontMatter: doc.rawFrontMatter, projectScopeMap: map, content: raw })
  }

  // A plain object inherits these, and every one of them is truthy. `map[slug]`
  // handed back Object.prototype / Object / a function and resolved a scope out
  // of thin air — twice producing a "project scope" with no projectId at all.
  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'])(
    'inherited name %s never resolves against an empty map', (slug) => {
      const r = evalProject(slug, {})
      expect(r.eligible, slug).toBe(false)
      expect(r.scope).toBeNull()
      expect(r.reasons).toContain('project_scope_unmapped')
    })

  it('an own mapping to a valid canonical uuid resolves', () => {
    const r = evalProject('trading', { trading: VALID_ID })
    expect(r.eligible).toBe(true)
    expect(r.scope).toEqual({ kind: 'project', projectId: VALID_ID })
  })

  it.each([['not-a-uuid'], [''], ['   '], ['3f2a1b4c-5d6e-4f70-8a9b'], ['proj-trading']])(
    'an own mapping to a malformed id %s is refused, never repaired', (bad) => {
      const r = evalProject('trading', { trading: bad })
      expect(r.eligible).toBe(false)
      expect(r.scope).toBeNull()
      expect(r.reasons).toContain(bad.trim() === '' ? 'project_scope_mapping_invalid' : 'project_scope_mapping_invalid')
    })

  it('distinguishes "no map consulted" from "slug absent from the map"', () => {
    expect(evalProject('trading').reasons).toContain('project_scope_mapping_unavailable')
    expect(evalProject('trading', {}).reasons).toContain('project_scope_unmapped')
    // The two must never be conflated — one is an operator setup gap, the other
    // is a statement about the slug.
    expect(evalProject('trading').reasons).not.toContain('project_scope_unmapped')
    expect(evalProject('trading', {}).reasons).not.toContain('project_scope_mapping_unavailable')
  })

  it('a null-prototype map behaves identically', () => {
    const map = Object.create(null) as Record<string, string>
    map.trading = VALID_ID
    expect(evalProject('trading', map).eligible).toBe(true)
    expect(evalProject('__proto__', map).eligible).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SAFE OPERATOR JSON — machine output obeys the same redaction as text
// ─────────────────────────────────────────────────────────────────────────────

describe('safe operator JSON — --json cannot leak what the gate blocked', () => {
  const S = 'ghp_abcdefghijklmnopqrstuvwxyz012345'
  function jsonFor(files: Record<string, string>) {
    const root = tempVault()
    for (const [rel, content] of Object.entries(files)) write(root, rel, content)
    const listing = createKnowledgeProjectionSource({ vaultRoot: root }).listAll()
    return { listing, json: JSON.stringify(toSafeProjectionReportJson(listing), null, 2) }
  }

  const cases: [string, Record<string, string>][] = [
    ['1. body', { '10 Architecture/a.md': eligibleNote({}, `token: ${S}\n`) }],
    ['2. H1 title', { '10 Architecture/b.md':
      `---\ntype: architecture\nstatus: approved\nclassification: internal\nscope: platform\n---\n\n# ${S}\n\nx\n` }],
    ['3. project', { '10 Architecture/c.md': eligibleNote({ scope: 'project', project: S }) }],
    ['4. canonical_path', { '10 Architecture/d.md':
      eligibleNote({ source_of_truth: 'repository', canonical_path: `docs/${S}.md` }) }],
    ['5. diagnostic detail', { '10 Architecture/e.md': eligibleNote({ source_of_truth: S }) }],
    ['6. filename/path', { [`10 Architecture/${S}.md`]: eligibleNote({}, 'clean\n') }],
  ]

  it.each(cases)('%s — ineligible, detected, and absent from safe JSON', (_label, files) => {
    const { listing, json } = jsonFor(files)
    const c = listing.candidates[0]
    expect(c.eligibility.eligible).toBe(false)
    expect(c.eligibility.reasons).toContain('secret_detected')
    expect(json).not.toContain(S)
    // Still identifiable without the secret.
    expect(json).toContain(c.id)
    expect(json).toContain(c.contentHash)
  })

  it('the raw listing DOES still contain source text — the safe shape is what protects', () => {
    // Stating the true contract rather than the overreaching one.
    const { listing, json } = jsonFor({ '10 Architecture/e.md': eligibleNote({ source_of_truth: S }) })
    expect(JSON.stringify(listing)).toContain(S)
    expect(json).not.toContain(S)
  })

  it('safe JSON carries no bodies, no rawFrontMatter and no diagnostic details', () => {
    const { json } = jsonFor({ '10 Architecture/a.md': eligibleNote({}, 'BODY-SENTINEL prose\n') })
    expect(json).not.toContain('BODY-SENTINEL')
    expect(json).not.toContain('rawFrontMatter')
    expect(json).not.toContain('"detail"')
  })

  it('keeps reason codes and secret pattern names with counts', () => {
    const { json } = jsonFor({ '10 Architecture/a.md': eligibleNote({}, `t: ${S}\n`) })
    const parsed = JSON.parse(json)
    expect(parsed.candidates[0].reasons).toContain('secret_detected')
    expect(parsed.candidates[0].secretFindings[0]).toEqual({ pattern: 'GitHub token', count: 1 })
  })

  it('is deterministic and preserves ordering', () => {
    const root = tempVault()
    for (const n of ['c', 'a', 'b']) write(root, `10 Architecture/${n}.md`, eligibleNote())
    const src = createKnowledgeProjectionSource({ vaultRoot: root })
    const a = JSON.stringify(toSafeProjectionReportJson(src.listAll()))
    const b = JSON.stringify(toSafeProjectionReportJson(src.listAll()))
    expect(a).toBe(b)
    expect(JSON.parse(a).candidates.map((c: { path: string }) => c.path))
      .toEqual(['10 Architecture/a.md', '10 Architecture/b.md', '10 Architecture/c.md'])
  })
})
