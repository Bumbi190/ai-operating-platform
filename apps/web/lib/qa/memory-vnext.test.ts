/**
 * Minne vNext — project gate, source truth and rollback contract.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadMemoryView } from '@/lib/os/memory'
import type { MemoryViewModel } from '@/lib/os/memory-shared'
import { filterMemoryRules, MemoryView } from '@/components/platform/vnext/MemoryView'

;(globalThis as unknown as { React: typeof React }).React = React

vi.mock('server-only', () => ({}))

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const WEB_ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(WEB_ROOT, rel), 'utf8')
const sha = (value: string) => createHash('sha256').update(value).digest('hex')
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

const MINE = '11111111-1111-1111-1111-111111111111'
const MINE_2 = '22222222-2222-2222-2222-222222222222'

const projects = [
  { id: MINE, name: 'Projekt Ett', slug: 'projekt-ett', color: '#22d3ee' },
  { id: MINE_2, name: 'Projekt Två', slug: 'projekt-tva', color: '#a78bfa' },
]

const memoryRow = (over: Record<string, unknown> = {}) => ({
  id: 'memory-1',
  category: 'brand_voice' as const,
  key: 'kort_sprak',
  value: { note: 'Kort och tydligt.', source: 'BRAND.md' },
  confidence: 0.82,
  evidenceCount: 7,
  lastSeenAt: '2026-09-16T08:00:00.000Z',
  ...over,
})

const feedbackRow = (over: Record<string, unknown> = {}) => ({
  id: 'feedback-1',
  projectId: MINE_2,
  outputType: 'script',
  decision: 'approved' as const,
  rejectionReason: null,
  revisionNotes: null,
  qualityPatterns: ['specific'],
  contentExcerpt: 'Syntetiskt utdrag',
  evalScore: 8,
  createdAt: '2026-09-16T09:00:00.000Z',
  ...over,
})

function userClient(opts: {
  rows?: typeof projects
  projectError?: boolean
  user?: { id: string } | null
  calls?: string[]
} = {}) {
  const rows = opts.rows ?? projects
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: opts.user === undefined ? { id: 'owner-1' } : opts.user },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      opts.calls?.push(table)
      expect(table).toBe('projects')
      return {
        select: vi.fn(() => ({
          order: vi.fn(async () => ({
            data: opts.projectError ? null : rows,
            error: opts.projectError ? { message: 'read failed' } : null,
          })),
        })),
      }
    }),
  }
}

function deps(opts: {
  client?: ReturnType<typeof userClient>
  rules?: ReturnType<typeof vi.fn>
  feedback?: ReturnType<typeof vi.fn>
} = {}) {
  return {
    createUserClient: vi.fn(async () => opts.client ?? userClient()),
    readRules: opts.rules ?? vi.fn(async () => [memoryRow()]),
    readFeedback: opts.feedback ?? vi.fn(async () => [feedbackRow()]),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Minne vNext · explicit project boundary', () => {
  it('does not read either project-bound source before a project is selected', async () => {
    const d = deps()
    const model = await loadMemoryView({ projectSlug: null }, d as never)

    expect(model?.state).toBe('choose_project')
    expect(model?.projects).toHaveLength(2)
    expect(d.readRules).not.toHaveBeenCalled()
    expect(d.readFeedback).not.toHaveBeenCalled()
  })

  it.each(['unknown', 'foreign-project'])(
    'refuses %s slug identically without reading memory or feedback',
    async (slug) => {
      const d = deps()
      const model = await loadMemoryView({ projectSlug: slug }, d as never)

      expect(model?.state).toBe('project_not_found')
      expect(model?.selectedProject).toBeNull()
      expect(d.readRules).not.toHaveBeenCalled()
      expect(d.readFeedback).not.toHaveBeenCalled()
    },
  )

  it('selects between two owned projects and passes the exact verified id to both reads', async () => {
    const calls: string[] = []
    const rules = vi.fn(async (id: string) => { calls.push(`rules:${id}`); return [memoryRow()] })
    const feedback = vi.fn(async (id: string, limit: number) => {
      calls.push(`feedback:${id}:${limit}`)
      return [feedbackRow()]
    })
    const d = deps({ client: userClient({ calls }), rules, feedback })

    const model = await loadMemoryView({ projectSlug: 'projekt-tva' }, d as never)

    expect(model?.state).toBe('ready')
    expect(model?.selectedProject?.id).toBe(MINE_2)
    expect(calls).toEqual(['projects', `rules:${MINE_2}`, `feedback:${MINE_2}:15`])
  })

  it('distinguishes a project-list failure from an empty project list', async () => {
    const failedDeps = deps({ client: userClient({ projectError: true }) })
    const emptyDeps = deps({ client: userClient({ rows: [] }) })

    const failed = await loadMemoryView({ projectSlug: null }, failedDeps as never)
    const empty = await loadMemoryView({ projectSlug: null }, emptyDeps as never)

    expect(failed?.state).toBe('project_error')
    expect(empty?.state).toBe('choose_project')
    expect(empty?.projects).toEqual([])
  })

  it('keeps successful empty reads distinct from failures, source by source', async () => {
    const empty = await loadMemoryView({ projectSlug: 'projekt-ett' }, deps({
      rules: vi.fn(async () => []),
      feedback: vi.fn(async () => []),
    }) as never)
    const partial = await loadMemoryView({ projectSlug: 'projekt-ett' }, deps({
      rules: vi.fn(async () => { throw new Error('memory down') }),
      feedback: vi.fn(async () => [feedbackRow({ projectId: MINE })]),
    }) as never)

    expect(empty?.rules).toEqual({ state: 'ok', items: [] })
    expect(empty?.feedback).toEqual({ state: 'ok', items: [] })
    expect(partial?.rules.state).toBe('error')
    expect(partial?.feedback.state).toBe('ok')
  })

  it('returns null for an unauthenticated session', async () => {
    const d = deps({ client: userClient({ user: null }) })
    expect(await loadMemoryView({ projectSlug: 'projekt-ett' }, d as never)).toBeNull()
    expect(d.readRules).not.toHaveBeenCalled()
    expect(d.readFeedback).not.toHaveBeenCalled()
  })
})

describe('Minne vNext · presentation truth', () => {
  const model: MemoryViewModel = {
    state: 'ready',
    projects,
    requestedProjectSlug: 'projekt-ett',
    selectedProject: projects[0],
    rules: {
      state: 'ok',
      items: [
        {
          id: 'm1', category: 'brand_voice', categoryLabel: 'Varumärkesröst', key: 'kort_sprak',
          note: 'Kort och tydligt.', details: [{ label: 'Lagrad källa', value: 'BRAND.md' }],
          confidence: 0.82, evidenceCount: 7, lastSeenAt: '2026-09-16T08:00:00.000Z',
        },
        {
          id: 'm2', category: 'hook_patterns', categoryLabel: 'Hook-mönster', key: 'specificitet',
          note: 'Öppna med fakta.', details: [], confidence: 0.61, evidenceCount: 3,
          lastSeenAt: '2026-09-15T08:00:00.000Z',
        },
      ],
    },
    feedback: { state: 'ok', items: [feedbackRow({ projectId: MINE })] },
    feedbackLimit: 15,
  }

  it('filters only the fetched rules by text and category', () => {
    expect(filterMemoryRules(model.rules.state === 'ok' ? model.rules.items : [], 'brand.md', 'all'))
      .toHaveLength(1)
    expect(filterMemoryRules(model.rules.state === 'ok' ? model.rules.items : [], '', 'hook_patterns'))
      .toEqual([expect.objectContaining({ id: 'm2' })])
    expect(filterMemoryRules(model.rules.state === 'ok' ? model.rules.items : [], 'saknas', 'all'))
      .toEqual([])
  })

  it('labels both sources, the bounded feedback sample and the M4 limitation', () => {
    const html = renderToStaticMarkup(React.createElement(MemoryView, { model }))
    expect(html).toContain('public.platform_memory')
    expect(html).toContain('public.content_feedback')
    expect(html).toContain('högst de 15 senaste posterna')
    expect(html).toContain('omfattar inte hela Atlas M4-minnet')
    expect(html).toContain('inte en verifierad sannolikhet')
  })

  it('has no write controls or executable-markup renderer', () => {
    const component = codeOnly(read('components/platform/vnext/MemoryView.tsx'))
    for (const forbidden of [
      '/api/memory/patterns', 'seedBrandMemory', 'tombstoneMemoryItem',
      'dangerouslySetInnerHTML', 'contentEditable',
    ]) expect(component).not.toContain(forbidden)
    expect(component).not.toMatch(/>\s*(Glöm|Redigera|Seed)/)
  })
})

describe('Minne vNext · generation and frozen legacy', () => {
  it('returns the legacy branch before the vNext loader is referenced', () => {
    const page = read('app/(platform)/memory/page.tsx')
    expect(page.indexOf('<MemoryLegacy />')).toBeGreaterThan(-1)
    expect(page.indexOf('<MemoryLegacy />')).toBeLessThan(page.indexOf('loadMemoryView({ projectSlug })'))
  })

  it('pins the mechanically moved legacy body', () => {
    const legacy = read('app/(platform)/memory/MemoryLegacy.tsx')
    const body = legacy.slice(legacy.indexOf('import type'))
    expect(sha(body)).toBe('da41d19120ba32d2f5cc94fc426d8085ddc8043f4db366ce0fdf1e3dab77a3b1')
    expect(legacy).not.toContain("export const dynamic = 'force-dynamic'")
    expect(legacy).toContain('export async function MemoryLegacy()')
  })

  it('keeps the existing API and Memory helpers byte-identical', () => {
    expect(sha(read('app/api/memory/patterns/route.ts')))
      .toBe('c4515b7a4a993b5cd5cd898314e8581b0b30a1e0ef79108d867b9bac07bdca81')
    expect(sha(read('lib/ai/memory/memory-store.ts')))
      .toBe('feea0b3d99c56d7a6736a928b5c4bfbba1e53a739e3e3c86b36a157f3a08d730')
    expect(sha(read('lib/ai/memory/feedback-store.ts')))
      .toBe('c6a6a69b7463a1a173b356a0c14d4cbe35193dad2e5d106a4f1cdc2d79c7a5ca')
  })

  it('contains no Atlas M4 inventory read or new data authority', () => {
    const loader = codeOnly(read('lib/os/memory.ts'))
    expect(loader).not.toMatch(/atlas_recall|atlas\.memory_events|atlas\.memories|public\.memories/)
    expect(loader).not.toContain('createAdminClient')
    expect(loader).toContain(".from('projects')")
  })
})
