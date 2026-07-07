/**
 * View → Record bridge (Sprint 1, Task 2).
 *
 * Locks the bridge contract: destination→domain mapping (incl. the approvals
 * state→status key remap), pure query derivation, the [RECORDS IN VIEW] render,
 * and the orchestration's two hard guarantees — project isolation holds and the
 * auto-prefetch path NEVER requests PII.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  deriveRecordQuery,
  renderRecordsBlock,
  isRecordAwarenessEnabled,
  buildRecordsInView,
  DESTINATION_TO_DOMAIN,
} from '@/lib/atlas/view-records'
import type { NormalizedView } from '@/lib/atlas/view-context'

// ── helpers ──────────────────────────────────────────────────────────────────
function view(partial: Partial<NormalizedView> & Pick<NormalizedView, 'destinationId'>): NormalizedView {
  return {
    route: '/x',
    destinationLabel: null,
    project: null,
    filters: {},
    selection: [],
    visible: [],
    ...partial,
  } as NormalizedView
}

interface QueryState {
  table: string
  select?: string
  ins: { col: string; vals: string[] }[]
  eqs: { col: string; val: unknown }[]
  limit?: number
}
function makeDb(seed: Record<string, any[]>) {
  const queries: QueryState[] = []
  function builder(table: string) {
    const st: QueryState = { table, ins: [], eqs: [] }
    const b: any = {
      select(cols: string) { st.select = cols; return b },
      in(col: string, vals: string[]) { st.ins.push({ col, vals }); return b },
      eq(col: string, val: unknown) { st.eqs.push({ col, val }); return b },
      order() { return b },
      limit(n: number) { st.limit = n; return b },
      then(resolve: (v: { data: any[]; error: null }) => void) {
        queries.push(st)
        let rows = (seed[st.table] ?? []).slice()
        for (const { col, vals } of st.ins) rows = rows.filter((r: any) => vals.includes(r[col]))
        for (const { col, val } of st.eqs) rows = rows.filter((r: any) => r[col] === val)
        if (st.limit != null) rows = rows.slice(0, st.limit)
        resolve({ data: rows, error: null })
      },
    }
    return b
  }
  return { db: { from: (t: string) => builder(t) }, queries }
}

const OWNED = ['p-prompt', 'p-gain']
const PROJECTS = [
  { id: 'p-prompt', slug: 'ai-media-automation' },
  { id: 'p-other', slug: 'someone-elses' },
]

// ── deriveRecordQuery (pure) ─────────────────────────────────────────────────
describe('deriveRecordQuery', () => {
  it('maps each known destination to a domain', () => {
    expect(deriveRecordQuery(view({ destinationId: 'approvals' }))?.domain).toBe('approvals')
    expect(deriveRecordQuery(view({ destinationId: 'activity' }))?.domain).toBe('runs')
    expect(deriveRecordQuery(view({ destinationId: 'content_queue' }))?.domain).toBe('website_content')
    expect(deriveRecordQuery(view({ destinationId: 'actions' }))?.domain).toBe('opportunities')
    expect(deriveRecordQuery(view({ destinationId: 'planning' }))?.domain).toBe('manager_tasks')
    expect(deriveRecordQuery(view({ destinationId: 'knowledge' }))?.domain).toBe('memories')
    expect(deriveRecordQuery(view({ destinationId: 'revenue' }))?.domain).toBe('leads')
  })

  it('returns null for unmapped / aggregate / overview destinations', () => {
    expect(deriveRecordQuery(view({ destinationId: 'costs' }))).toBeNull()
    expect(deriveRecordQuery(view({ destinationId: 'money' }))).toBeNull()
    expect(deriveRecordQuery(view({ destinationId: 'dream' }))).toBeNull()
    expect(deriveRecordQuery(view({ destinationId: 'settings' }))).toBeNull()
    expect(deriveRecordQuery(view({ destinationId: null as any }))).toBeNull()
    expect(deriveRecordQuery(null)).toBeNull()
  })

  it('remaps the approvals nav filter key state → table column status', () => {
    const q = deriveRecordQuery(view({ destinationId: 'approvals', filters: { state: 'pending' } }))
    expect(q?.filters).toEqual({ status: 'pending' })
  })

  it('passes through filters that need no remap (activity status)', () => {
    const q = deriveRecordQuery(view({ destinationId: 'activity', filters: { status: 'failed' } }))
    expect(q?.filters).toEqual({ status: 'failed' })
  })

  it('carries the active project slug', () => {
    const q = deriveRecordQuery(view({ destinationId: 'approvals', project: { slug: 'ai-media-automation', name: 'The Prompt' } }))
    expect(q?.project).toBe('ai-media-automation')
  })

  it('pins the open record from a detail route (trailing UUID)', () => {
    const uuid = '11111111-2222-3333-4444-555555555555'
    const q = deriveRecordQuery(view({ destinationId: 'content_queue', route: `/atlas/content/${uuid}` }))
    expect(q?.domain).toBe('website_content')
    expect(q?.selectedIds[0]).toBe(uuid) // open record pinned first
  })

  it('does not treat a list route segment as a record id', () => {
    const q = deriveRecordQuery(view({ destinationId: 'content_queue', route: '/atlas/content' }))
    expect(q?.selectedIds).toEqual([])
  })

  it('collects selected ids for the target domain (and generic refs), capped', () => {
    const q = deriveRecordQuery(view({
      destinationId: 'approvals',
      selection: [
        { domain: 'approvals', id: 'a1', label: '' },
        { domain: 'record', id: 'a2', label: '' },     // untagged page → generic
        { domain: 'leads', id: 'x', label: '' },        // other domain → ignored
        { domain: 'approvals', id: 'a3', label: '' },
        { domain: 'approvals', id: 'a4', label: '' },   // beyond cap of 3
      ],
    }))
    expect(q?.selectedIds).toEqual(['a1', 'a2', 'a3'])
  })
})

// ── mapping invariants ───────────────────────────────────────────────────────
describe('DESTINATION_TO_DOMAIN', () => {
  it('never maps aggregate/dedicated-tool destinations', () => {
    for (const d of ['costs', 'money', 'dream', 'settings', 'atlas', 'chat', 'project_home', 'health'] as const) {
      expect(DESTINATION_TO_DOMAIN[d]).toBeUndefined()
    }
  })
})

// ── renderRecordsBlock (pure) ────────────────────────────────────────────────
describe('renderRecordsBlock', () => {
  it('returns empty string when there are no rows', () => {
    expect(renderRecordsBlock('approvals', [])).toBe('')
  })

  it('renders a compact block with header, domain, rows and guidance', () => {
    const out = renderRecordsBlock(
      'approvals',
      [{ id: 'a1', status: 'pending', reviewer_notes: null, operator: 'Andre' }],
      { project: 'ai-media-automation', truncated: true },
    )
    expect(out).toContain('[RECORDS IN VIEW')
    expect(out).toContain('Domain: approvals')
    expect(out).toContain('project: ai-media-automation')
    expect(out).toContain('(more exist)')
    expect(out).toContain('id=a1')
    expect(out).toContain('status=pending')
    expect(out).not.toContain('reviewer_notes=') // null fields are skipped
    expect(out).toContain('get_records')
  })
})

// ── isRecordAwarenessEnabled (env) ───────────────────────────────────────────
describe('isRecordAwarenessEnabled', () => {
  const prev = process.env.ATLAS_RECORD_AWARENESS
  afterEach(() => { process.env.ATLAS_RECORD_AWARENESS = prev })

  it('is on only for "1" / "true"', () => {
    process.env.ATLAS_RECORD_AWARENESS = '1'; expect(isRecordAwarenessEnabled()).toBe(true)
    process.env.ATLAS_RECORD_AWARENESS = 'true'; expect(isRecordAwarenessEnabled()).toBe(true)
    process.env.ATLAS_RECORD_AWARENESS = '0'; expect(isRecordAwarenessEnabled()).toBe(false)
    delete process.env.ATLAS_RECORD_AWARENESS; expect(isRecordAwarenessEnabled()).toBe(false)
  })
})

// ── buildRecordsInView (orchestration) ───────────────────────────────────────
describe('buildRecordsInView', () => {
  it('returns empty for an unmapped destination (no query run)', async () => {
    const { db, queries } = makeDb({ projects: PROJECTS })
    const out = await buildRecordsInView(db, view({ destinationId: 'settings' }), OWNED)
    expect(out).toBe('')
    expect(queries.length).toBe(0)
  })

  it('prefetches on-screen rows, scoped to owned projects, and pins nothing outside scope', async () => {
    const { db } = makeDb({
      projects: PROJECTS,
      approvals: [
        { id: 'a1', project_id: 'p-prompt', kind: 'article', status: 'pending', output_key: 'k', operator: 'Andre', reviewer_notes: null, run_id: null, created_at: '2026-06-01', reviewed_at: null, decided_at: null },
        { id: 'a2', project_id: 'p-other',  kind: 'article', status: 'pending', output_key: 'k', operator: 'X',     reviewer_notes: null, run_id: null, created_at: '2026-06-02', reviewed_at: null, decided_at: null },
      ],
    })
    const out = await buildRecordsInView(
      db,
      view({
        destinationId: 'approvals',
        project: { slug: 'ai-media-automation', name: 'The Prompt' },
        filters: { state: 'pending' },
        selection: [{ domain: 'approvals', id: 'a2', label: '' }], // a2 belongs to an unowned project
      }),
      OWNED,
    )
    expect(out).toContain('id=a1')      // owned row shown
    expect(out).not.toContain('id=a2')  // unowned + selected row never leaks (scope holds)
  })

  it('auto-prefetch NEVER selects PII columns', async () => {
    const { db, queries } = makeDb({
      projects: PROJECTS,
      leads: [{ id: 'l1', project_id: 'p-prompt', name: 'Lead', source: 'web', status: 'qualified', value_sek: 1, created_at: '2026-06-01', email: 'a@b.c', phone: '070' }],
    })
    await buildRecordsInView(db, view({ destinationId: 'revenue' }), OWNED)
    const leadSelect = queries.find(q => q.table === 'leads')?.select ?? ''
    expect(leadSelect).not.toContain('email')
    expect(leadSelect).not.toContain('phone')
    expect(leadSelect).not.toContain('*')
  })
})
