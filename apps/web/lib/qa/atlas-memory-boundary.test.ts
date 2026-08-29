/**
 * Atlas Memory M4 — Foundation Slice 1: static boundary contracts.
 *
 * This file locks three boundaries that must hold BEFORE any Memory flag is
 * enabled. It adds NO Memory behaviour and touches NO runtime code.
 *
 *   BOUNDARY A — chat is not wired to Atlas Memory M4.
 *       Proven twice: (1) on the chat route's own source, and (2) across the
 *       whole local module graph reachable from it, so a wrapper module that
 *       re-exports Memory cannot smuggle it in one hop away.
 *
 *   BOUNDARY D — all three Memory flags are strict opt-in ('1' and nothing
 *       else). Absence, '0', 'true', 'yes' and ' 1' are all OFF. The per-module
 *       tests cover their own flag; this pins all three in ONE table so a future
 *       "make it truthy" refactor cannot loosen one of them quietly.
 *
 *   BOUNDARY E — Memory cannot mint authority. The channel separation half
 *       (decision-class memories become CONSTRAINTS, never instructions) is
 *       already proven in atlas-memory-context.test.ts and is NOT duplicated
 *       here. What was missing is the structural half: no authority-minting
 *       surface (authorization / decision / mission / delegation) may reach
 *       Atlas Memory at all — Memory is not an input to authority.
 *
 * SYSTEM SCOPE: only Atlas Memory M4 (atlas.memory_events / atlas.memories,
 * recordMemoryEvent, recallMemories, memory-context). The legacy key/value
 * `public.memories` (get_records) and platform_memory / content_feedback are
 * DIFFERENT systems and are deliberately NOT matched by these guards — chat's
 * buildToolMemory / buildActionMemory must keep passing.
 */

import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { isMemoryEnabled } from '@/lib/atlas/memory/record-event'
import { isRecallEnabled } from '@/lib/atlas/memory/recall-memories'
import { isMemoryInjectEnabled } from '@/lib/atlas/intelligence/memory-context'

// lib/qa/<this file> → apps/web
const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// ── The Atlas Memory M4 surface (and nothing else) ────────────────────────────

/** Module paths that ARE Atlas Memory M4. Matched against import specifiers. */
const MEMORY_MODULE_PATTERNS = [
  /lib\/atlas\/memory\//,
  /atlas\/intelligence\/memory-context/,
  /(^|[\/'"])\.\.?\/memory\/(record-event|recall-memories)/,
  /(^|[\/'"])\.\/memory-context/,
]

/** Identifiers exported by the Atlas Memory M4 surface. */
const MEMORY_IDENTIFIERS = [
  'recordMemoryEvent',
  'recallMemories',
  'assembleMemoryPack',
  'resolveMemoryContext',
  'resolveMemoryItems',
  'applyInjectionGate',
  'splitMemoryPack',
  'isMemoryEnabled',
  'isRecallEnabled',
  'isMemoryInjectEnabled',
  'MemoryPack',
  'MemoryRecallItem',
  'MemoryContext',
]

/**
 * Every import/export/require specifier in a source file: static `from '…'`,
 * bare `import '…'`, dynamic `import('…')` and `require('…')`.
 */
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

/**
 * The guard itself: which Atlas Memory M4 surfaces does this source touch?
 * Returns a list of human-readable findings ([] = clean). Kept as a pure
 * function so it can be exercised against synthetic sources below — a guard
 * that is never shown to fire is not a guard.
 */
function memoryWiringFindings(source: string): string[] {
  const findings: string[] = []

  for (const spec of specifiersOf(source)) {
    if (MEMORY_MODULE_PATTERNS.some((re) => re.test(spec))) {
      findings.push(`imports Atlas Memory module: ${spec}`)
    }
  }

  // Strip line/block comments so a doc comment naming the boundary is not a hit.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  for (const id of MEMORY_IDENTIFIERS) {
    if (new RegExp(`\\b${id}\\b`).test(code)) {
      findings.push(`references Atlas Memory identifier: ${id}`)
    }
  }

  return findings
}

// ── Local module graph ────────────────────────────────────────────────────────

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.jsx']

function resolveLocal(spec: string, fromFile: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = path.join(WEB_ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec)
  else return null // bare package — out of scope

  for (const ext of EXTENSIONS) {
    const p = base + ext
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
  }
  for (const ext of EXTENSIONS) {
    const p = path.join(base, 'index' + ext)
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
  }
  return fs.existsSync(base) && fs.statSync(base).isFile() ? base : null
}

interface Graph {
  /** absolute file → the file that imported it (undefined for the entry). */
  parents: Map<string, string | undefined>
}

/** Walk every local (`@/…` or relative) import reachable from `entry`. */
function moduleGraph(entry: string): Graph {
  const parents = new Map<string, string | undefined>([[entry, undefined]])
  const queue: string[] = [entry]
  while (queue.length) {
    const file = queue.shift()!
    let source: string
    try {
      source = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const spec of specifiersOf(source)) {
      if (!spec.startsWith('@/') && !spec.startsWith('.')) continue
      const resolved = resolveLocal(spec, file)
      if (!resolved || parents.has(resolved)) continue
      parents.set(resolved, file)
      queue.push(resolved)
    }
  }
  return { parents }
}

/** Import chain from the entry down to `file`, for a legible failure message. */
function chainTo(graph: Graph, file: string): string {
  const chain: string[] = []
  let cursor: string | undefined = file
  while (cursor) {
    chain.push(path.relative(WEB_ROOT, cursor))
    cursor = graph.parents.get(cursor)
  }
  return chain.reverse().join('\n    -> ')
}

/** Files in the graph that are part of Atlas Memory M4. */
function memoryModulesIn(graph: Graph): string[] {
  return [...graph.parents.keys()].filter((f) => {
    const rel = path.relative(WEB_ROOT, f)
    return rel.startsWith('lib/atlas/memory/') || rel === 'lib/atlas/intelligence/memory-context.ts'
  })
}

const CHAT_ROUTE = path.join(WEB_ROOT, 'app/api/chat/route.ts')
const CHAT_TTS_ROUTE = path.join(WEB_ROOT, 'app/api/chat/tts/route.ts')

// ─────────────────────────────────────────────────────────────────────────────
// BOUNDARY A — chat remains unwired
// ─────────────────────────────────────────────────────────────────────────────

describe('BOUNDARY A — chat is not wired to Atlas Memory M4', () => {
  it('the chat route source references no Atlas Memory module or identifier', () => {
    const source = fs.readFileSync(CHAT_ROUTE, 'utf8')
    expect(memoryWiringFindings(source)).toEqual([])
  })

  it('the chat TTS route references no Atlas Memory module or identifier', () => {
    const source = fs.readFileSync(CHAT_TTS_ROUTE, 'utf8')
    expect(memoryWiringFindings(source)).toEqual([])
  })

  it('no module reachable from the chat route is Atlas Memory (catches wrapper indirection)', () => {
    const graph = moduleGraph(CHAT_ROUTE)
    const hits = memoryModulesIn(graph)
    expect(
      hits.map((h) => chainTo(graph, h)).join('\n\n'),
      'chat reaches Atlas Memory M4 through an intermediate module',
    ).toBe('')
    // Guard against a vacuous pass: the walk must actually have traversed the app.
    expect(graph.parents.size).toBeGreaterThan(25)
  })

  it('discriminates: chat DOES use the other memory systems and still passes', () => {
    // buildToolMemory (conversation tool rows) and buildActionMemory (atlas_actions)
    // are NOT Atlas Memory M4. If the guard were a naive /memory/i search it would
    // fire on these, and Boundary A would be worthless.
    const source = fs.readFileSync(CHAT_ROUTE, 'utf8')
    expect(source).toContain('buildActionMemory')
    expect(source).toContain('buildToolMemory')
    expect(memoryWiringFindings(source)).toEqual([])
  })

  it('the guard fires on every representative way Memory could be introduced', () => {
    // In-test negative control. Each of these must be caught; if any stops being
    // detected, the Boundary A tests above are silently vacuous.
    const cases: Record<string, string> = {
      'static import':
        `import { recallMemories } from '@/lib/atlas/memory/recall-memories'\n`,
      'static type-only import':
        `import type { MemoryPack } from '@/lib/atlas/memory/recall-memories'\n`,
      'memory-context import':
        `import { resolveMemoryContext } from '@/lib/atlas/intelligence/memory-context'\n`,
      'relative import':
        `import { recordMemoryEvent } from '../../lib/atlas/memory/record-event'\n`,
      'dynamic import':
        `const m = await import('@/lib/atlas/memory/recall-memories')\n`,
      'require':
        `const m = require('@/lib/atlas/memory/record-event')\n`,
      'bare call through a re-export':
        `import { recallMemories } from '@/lib/atlas/wrapper'\nawait recallMemories({})\n`,
      'emit call':
        `void recordMemoryEvent({ scope: 'project' }, db)\n`,
    }
    for (const [label, source] of Object.entries(cases)) {
      expect(memoryWiringFindings(source), `guard missed: ${label}`).not.toEqual([])
    }
  })

  it('does not fire on the legacy memory systems (public.memories / platform_memory)', () => {
    const benign = [
      `const { data } = await db.rpc('get_records', { table: 'memories' })\n`,
      `import { saveFeedback } from '@/lib/ai/memory/feedback-store'\n`,
      `import { recordAction, buildActionMemory } from '@/lib/atlas/action-memory'\n`,
      `await db.from('platform_memory').select('*')\n`,
    ].join('')
    expect(memoryWiringFindings(benign)).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BOUNDARY D — flags remain dark
// ─────────────────────────────────────────────────────────────────────────────

const FLAGS: { name: string; env: string; read: () => boolean }[] = [
  { name: 'ATLAS_MEMORY', env: 'ATLAS_MEMORY', read: isMemoryEnabled },
  { name: 'ATLAS_MEMORY_RECALL', env: 'ATLAS_MEMORY_RECALL', read: isRecallEnabled },
  { name: 'ATLAS_MEMORY_INJECT', env: 'ATLAS_MEMORY_INJECT', read: isMemoryInjectEnabled },
]

describe('BOUNDARY D — all three Memory flags are strict opt-in', () => {
  afterEach(() => {
    for (const f of FLAGS) delete process.env[f.env]
  })

  it.each(FLAGS)('$name is OFF when unset', ({ env, read }) => {
    delete process.env[env]
    expect(read()).toBe(false)
  })

  it.each(FLAGS)('$name is ON for "1" and OFF for every other value', ({ env, read }) => {
    const off = ['', '0', 'true', 'TRUE', 'True', 'yes', 'on', 'enabled', ' 1', '1 ', '01', '2']
    for (const value of off) {
      process.env[env] = value
      expect(read(), `${env}=${JSON.stringify(value)} must be OFF`).toBe(false)
    }
    process.env[env] = '1'
    expect(read()).toBe(true)
  })

  it('the flags are independent — enabling one does not enable another', () => {
    process.env.ATLAS_MEMORY = '1'
    expect(isMemoryEnabled()).toBe(true)
    expect(isRecallEnabled()).toBe(false)
    expect(isMemoryInjectEnabled()).toBe(false)
  })

  it('no build configuration hardcodes a Memory flag', () => {
    // Defaults must come from the environment, never from committed config.
    for (const rel of ['next.config.mjs', 'vercel.json', 'package.json']) {
      const file = path.join(WEB_ROOT, rel)
      if (!fs.existsSync(file)) continue
      expect(fs.readFileSync(file, 'utf8'), `${rel} must not set a Memory flag`).not.toMatch(
        /ATLAS_MEMORY/,
      )
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BOUNDARY E — Memory cannot mint authority
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Channel separation (decision-class memories become CONSTRAINTS, never
 * instructions) is already proven by atlas-memory-context.test.ts:
 *   'splitMemoryPack — channel separation' and
 *   'applyInjectionGate — staged shadow/inject states (C2)'.
 * Those are NOT duplicated here. This adds the structural half: an
 * authority-minting surface must not be able to read Memory at all.
 */
const AUTHORITY_SURFACES = [
  'app/api/atlas/executive/authorization/route.ts',
  'app/api/atlas/executive/decision/route.ts',
  'app/api/atlas/executive/mission/route.ts',
  'lib/atlas/authorization/build.ts',
  'lib/atlas/authorization/derive.ts',
  'lib/atlas/authorization/store.ts',
  'lib/atlas/delegation/attenuate.ts',
  'lib/atlas/delegation/derive.ts',
  'lib/atlas/delegation/store.ts',
]

describe('BOUNDARY E — Memory is not an input to authority', () => {
  it.each(AUTHORITY_SURFACES)('%s cannot reach Atlas Memory', (rel) => {
    const entry = path.join(WEB_ROOT, rel)
    expect(fs.existsSync(entry), `${rel} is missing — update this contract`).toBe(true)
    const graph = moduleGraph(entry)
    const hits = memoryModulesIn(graph)
    expect(hits.map((h) => chainTo(graph, h)).join('\n\n')).toBe('')
  })

  it('Memory has no import edge into authorization or delegation', () => {
    // The mirror direction: Memory must not reach in either, so neither side can
    // grow a dependency that turns recalled content into authority.
    for (const rel of [
      'lib/atlas/memory/record-event.ts',
      'lib/atlas/memory/recall-memories.ts',
      'lib/atlas/intelligence/memory-context.ts',
    ]) {
      const graph = moduleGraph(path.join(WEB_ROOT, rel))
      const authority = [...graph.parents.keys()]
        .map((f) => path.relative(WEB_ROOT, f))
        .filter((f) => f.startsWith('lib/atlas/authorization/') || f.startsWith('lib/atlas/delegation/'))
      expect(authority, `${rel} reaches an authority module`).toEqual([])
    }
  })
})
