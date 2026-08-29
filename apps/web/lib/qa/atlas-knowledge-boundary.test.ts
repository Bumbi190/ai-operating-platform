/**
 * Knowledge Provider — structural boundaries.
 *
 * The behavioural suite proves the adapter does the right thing. This one proves
 * it *cannot* do the wrong thing, by inspecting the source and the local module
 * graph rather than by exercising behaviour.
 *
 * Four properties, each of which would be expensive to discover later:
 *   • the provider surface is read-only, with no mutation verb and no escape hatch
 *   • Knowledge cannot reach authority, execution or policy-gate surfaces
 *   • Knowledge and Atlas Memory M4 stay separate systems in both directions
 *   • Knowledge has ZERO production consumers in this phase
 *
 * That last one is the Phase-1 contract itself. When a consumer is deliberately
 * added, this test fails and forces the decision to be visible in review.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createVaultKnowledgeProvider } from '@/lib/atlas/knowledge/vault-provider'

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const KNOWLEDGE_DIR = path.join(WEB_ROOT, 'lib/atlas/knowledge')

const KNOWLEDGE_FILES = ['types.ts', 'policy.ts', 'document.ts', 'rank.ts', 'vault-provider.ts']

// ── module graph (local imports only) ────────────────────────────────────────

const SPECIFIER_RE =
  /(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g

function specifiersOf(source: string): string[] {
  const out: string[] = []
  for (const m of source.matchAll(SPECIFIER_RE)) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4]
    if (spec) out.push(spec)
  }
  return out
}

const EXT = ['.ts', '.tsx', '.mts', '.js', '.jsx']

function resolveLocal(spec: string, fromFile: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = path.join(WEB_ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec)
  else return null
  for (const e of EXT) { const p = base + e; if (fs.existsSync(p) && fs.statSync(p).isFile()) return p }
  for (const e of EXT) { const p = path.join(base, 'index' + e); if (fs.existsSync(p)) return p }
  return fs.existsSync(base) && fs.statSync(base).isFile() ? base : null
}

function moduleGraph(entries: string[]): Map<string, string | undefined> {
  const parents = new Map<string, string | undefined>()
  const queue: string[] = []
  for (const e of entries) { parents.set(e, undefined); queue.push(e) }
  while (queue.length) {
    const file = queue.shift()!
    let source: string
    try { source = fs.readFileSync(file, 'utf8') } catch { continue }
    for (const spec of specifiersOf(source)) {
      if (!spec.startsWith('@/') && !spec.startsWith('.')) continue
      const resolved = resolveLocal(spec, file)
      if (!resolved || parents.has(resolved)) continue
      parents.set(resolved, file)
      queue.push(resolved)
    }
  }
  return parents
}

function chainTo(parents: Map<string, string | undefined>, file: string): string {
  const chain: string[] = []
  let cursor: string | undefined = file
  while (cursor) { chain.push(path.relative(WEB_ROOT, cursor)); cursor = parents.get(cursor) }
  return chain.reverse().join('\n    -> ')
}

const knowledgeEntries = KNOWLEDGE_FILES.map((f) => path.join(KNOWLEDGE_DIR, f))

// ─────────────────────────────────────────────────────────────────────────────

describe('READ-ONLY — the provider surface has no mutation verb', () => {
  const MUTATION_VERBS = [
    'create', 'append', 'update', 'delete', 'remove', 'rename', 'move',
    'write', 'put', 'patch', 'insert', 'upsert', 'execute', 'run', 'exec',
  ]

  it('the KnowledgeProvider interface declares exactly id, search and get', () => {
    const source = fs.readFileSync(path.join(KNOWLEDGE_DIR, 'types.ts'), 'utf8')
    const block = source.slice(source.indexOf('export interface KnowledgeProvider'))
    const body = block.slice(block.indexOf('{'), block.indexOf('\n}') + 1)
    const members = [...body.matchAll(/^\s*(?:readonly\s+)?([a-zA-Z][a-zA-Z0-9_]*)\s*[(:]/gm)].map((m) => m[1])
    expect(members.sort()).toEqual(['get', 'id', 'search'])
  })

  it('no mutation verb appears as a member of the provider interface', () => {
    const source = fs.readFileSync(path.join(KNOWLEDGE_DIR, 'types.ts'), 'utf8')
    const block = source.slice(source.indexOf('export interface KnowledgeProvider'))
    const body = block.slice(block.indexOf('{'), block.indexOf('\n}') + 1)
    for (const verb of MUTATION_VERBS) {
      expect(new RegExp(`^\\s*${verb}\\s*[(<:]`, 'm').test(body), `provider exposes ${verb}`).toBe(false)
    }
  })

  it('a constructed provider exposes only the read-only surface at runtime', () => {
    const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'omnira-ro-'))
    try {
      const provider = createVaultKnowledgeProvider({ vaultRoot: dir })
      expect(Object.keys(provider).sort()).toEqual(['get', 'id', 'search'])
      for (const verb of MUTATION_VERBS) {
        expect((provider as unknown as Record<string, unknown>)[verb], `runtime ${verb}`).toBeUndefined()
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('the adapter imports no filesystem write or process-spawning API', () => {
    const source = KNOWLEDGE_FILES
      .map((f) => fs.readFileSync(path.join(KNOWLEDGE_DIR, f), 'utf8')).join('\n')
    for (const banned of [
      'writeFileSync', 'writeFile', 'appendFile', 'appendFileSync', 'unlink', 'unlinkSync',
      'rmSync', 'rmdirSync', 'renameSync', 'mkdirSync', 'createWriteStream',
      'child_process', 'execSync', 'execFileSync', 'spawnSync', 'spawn',
    ]) {
      expect(source.includes(banned), `knowledge module references ${banned}`).toBe(false)
    }
  })

  it('the adapter never invokes Obsidian — no CLI, app or REST dependency', () => {
    const source = KNOWLEDGE_FILES
      .map((f) => fs.readFileSync(path.join(KNOWLEDGE_DIR, f), 'utf8')).join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '') // strip doc comments, which discuss Obsidian
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(/obsidian\s+(?:cli|app)/i.test(source)).toBe(false)
    expect(source.includes('Obsidian.app')).toBe(false)
    expect(source.includes('localhost:27123')).toBe(false) // Local REST API default port
  })
})

describe('AUTHORITY — Knowledge is data, never authority', () => {
  const AUTHORITY_PREFIXES = [
    'lib/atlas/authorization/',
    'lib/atlas/delegation/',
    'lib/atlas/executive/',
    'lib/workflows/authorization',
    'lib/workflows/system-authorization',
    'lib/workflows/gate',
    'lib/ai/policy-gate',
    'lib/ai/fencing',
  ]

  it('no module reachable from Knowledge is an authority or execution surface', () => {
    const parents = moduleGraph(knowledgeEntries)
    const hits = [...parents.keys()]
      .map((f) => path.relative(WEB_ROOT, f))
      .filter((rel) => AUTHORITY_PREFIXES.some((p) => rel.startsWith(p)))
    expect(hits.join(', ')).toBe('')
  })

  it('Knowledge types encode no authorization or execution semantics', () => {
    const source = fs.readFileSync(path.join(KNOWLEDGE_DIR, 'types.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    for (const banned of [
      'authorization', 'authorize', 'permission', 'grant', 'entitlement',
      'autonomy', 'delegation', 'spend', 'execute',
    ]) {
      expect(new RegExp(`\\b${banned}`, 'i').test(source), `types.ts encodes ${banned}`).toBe(false)
    }
  })

  it('the module graph stays small and local (no vacuous pass)', () => {
    const parents = moduleGraph(knowledgeEntries)
    expect(parents.size).toBeGreaterThanOrEqual(KNOWLEDGE_FILES.length)
    expect(parents.size).toBeLessThan(25)
  })
})

describe('SEPARATION — Knowledge and Atlas Memory M4 are different systems', () => {
  it('Knowledge cannot reach Atlas Memory M4', () => {
    const parents = moduleGraph(knowledgeEntries)
    const hits = [...parents.keys()].map((f) => path.relative(WEB_ROOT, f)).filter((rel) =>
      rel.startsWith('lib/atlas/memory/') || rel === 'lib/atlas/intelligence/memory-context.ts')
    expect(hits.map((h) => chainTo(parents, path.join(WEB_ROOT, h))).join('\n')).toBe('')
  })

  it('Atlas Memory M4 cannot reach Knowledge', () => {
    const memoryEntries = [
      'lib/atlas/memory/record-event.ts',
      'lib/atlas/memory/recall-memories.ts',
      'lib/atlas/intelligence/memory-context.ts',
    ].map((r) => path.join(WEB_ROOT, r))
    const parents = moduleGraph(memoryEntries)
    const hits = [...parents.keys()]
      .map((f) => path.relative(WEB_ROOT, f))
      .filter((rel) => rel.startsWith('lib/atlas/knowledge/'))
    expect(hits.join(', ')).toBe('')
  })

  it('Knowledge does not reuse the Memory vocabulary as its own', () => {
    const source = KNOWLEDGE_FILES
      .map((f) => fs.readFileSync(path.join(KNOWLEDGE_DIR, f), 'utf8'))
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    for (const id of ['recordMemoryEvent', 'recallMemories', 'MemoryPack', 'resolveMemoryContext', 'atlas_recall']) {
      expect(source.includes(id), `knowledge references ${id}`).toBe(false)
    }
    // 'memory-note' is the vault's own note TYPE and is expected to remain.
    expect(fs.readFileSync(path.join(KNOWLEDGE_DIR, 'types.ts'), 'utf8')).toContain("'memory-note'")
  })
})

describe('NO PRODUCTION CONSUMER — Phase 1 wires nothing', () => {
  function filesUnder(dir: string): string[] {
    const out: string[] = []
    const walk = (d: string): void => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name)
        if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(p); continue }
        if (/\.(ts|tsx)$/.test(entry.name)) out.push(p)
      }
    }
    if (fs.existsSync(dir)) walk(dir)
    return out
  }

  /** Every file in apps/web that imports anything from lib/atlas/knowledge. */
  function knowledgeImporters(): string[] {
    const roots = ['app', 'lib', 'components', 'scripts'].map((d) => path.join(WEB_ROOT, d))
    const importers: string[] = []
    for (const root of roots) {
      for (const file of filesUnder(root)) {
        const rel = path.relative(WEB_ROOT, file)
        if (rel.startsWith('lib/atlas/knowledge/')) continue // internal imports
        const source = fs.readFileSync(file, 'utf8')
        if (specifiersOf(source).some((s) => s.includes('atlas/knowledge'))) importers.push(rel)
      }
    }
    return importers.sort()
  }

  it('nothing under app/ (routes, pages, API) imports Knowledge', () => {
    const routeImporters = knowledgeImporters().filter((f) => f.startsWith('app/'))
    expect(routeImporters.join(', ')).toBe('')
  })

  it('the only importers are the operator harness and these QA tests', () => {
    expect(knowledgeImporters()).toEqual([
      'lib/qa/atlas-knowledge-boundary.test.ts',
      'lib/qa/atlas-knowledge-provider.test.ts',
      'scripts/knowledge-shadow.ts',
    ])
  })

  it('chat, Executive and Delegation do not reach Knowledge', () => {
    for (const entry of [
      'app/api/chat/route.ts',
      'lib/atlas/intelligence/producers/brief-orchestrator.ts',
      'lib/atlas/context/request.ts',
    ]) {
      const abs = path.join(WEB_ROOT, entry)
      if (!fs.existsSync(abs)) continue
      const parents = moduleGraph([abs])
      const hits = [...parents.keys()]
        .map((f) => path.relative(WEB_ROOT, f))
        .filter((rel) => rel.startsWith('lib/atlas/knowledge/'))
      expect(hits.join(', '), `${entry} reaches Knowledge`).toBe('')
    }
  })
})
