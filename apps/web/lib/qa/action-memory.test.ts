/**
 * Atlas Actions — episodic action memory (Phase 1).
 *
 * Locks the contract that lets Atlas recall actions without re-fetching:
 * recordAction inserts a project-scoped row, and buildActionMemory renders a
 * compact, isolated [SENASTE ÅTGÄRDER] block (empty allow-list → no rows).
 */
import { describe, it, expect } from 'vitest'
import { recordAction, buildActionMemory, renderActionMemory } from '@/lib/atlas/action-memory'
import { IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'

interface Q { table: string; select?: string; ins: { c: string; v: string[] }[]; eqs: { c: string; v: unknown }[]; inserted?: any }
function makeDb(seed: Record<string, any[]> = {}) {
  const queries: Q[] = []
  function builder(table: string) {
    const st: Q = { table, ins: [], eqs: [] }
    const b: any = {
      select(c: string) { st.select = c; return b },
      insert(row: any) { st.inserted = row; queries.push(st); return Promise.resolve({ data: row, error: null }) },
      in(c: string, v: string[]) { st.ins.push({ c, v }); return b },
      eq(c: string, v: unknown) { st.eqs.push({ c, v }); return b },
      order() { return b },
      limit() { return b },
      then(resolve: (x: { data: any[]; error: null }) => void) {
        queries.push(st)
        let rows = (seed[st.table] ?? []).slice()
        for (const { c, v } of st.ins) rows = rows.filter((r: any) => v.includes(r[c]))
        for (const { c, v } of st.eqs) rows = rows.filter((r: any) => r[c] === v)
        resolve({ data: rows, error: null })
      },
    }
    return b
  }
  return { db: { from: (t: string) => builder(t) }, queries }
}

const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60000).toISOString()

describe('recordAction', () => {
  it('inserts a normalized, project-scoped ledger row', async () => {
    const { db, queries } = makeDb()
    await recordAction(db, {
      projectId: 'p-prompt', conversationId: 'c1', actionType: 'dream_delegation',
      toolName: 'delegate_dream_finding', targetKind: 'manager_task', targetId: 't1',
      status: 'pending', summary: 'Delegerade X → task t1', detail: { issue_id: 'x' },
    })
    const row = queries.find(q => q.table === 'atlas_actions')?.inserted
    expect(row.action_type).toBe('dream_delegation')
    expect(row.project_id).toBe('p-prompt')
    expect(row.conversation_id).toBe('c1')
    expect(row.target_id).toBe('t1')
    expect(row.actor).toBe('Atlas')
  })

  it('never throws (non-blocking) even if the insert rejects', async () => {
    const db = { from: () => ({ insert: () => Promise.reject(new Error('boom')) }) } as any
    await expect(recordAction(db, { actionType: 'workflow_run', toolName: 'trigger_workflow', summary: 's' })).resolves.toBeUndefined()
  })
})

describe('renderActionMemory', () => {
  it('returns empty string with no rows', () => {
    expect(renderActionMemory([])).toBe('')
  })
  it('renders header + rows with action_type, summary and age', () => {
    const out = renderActionMemory([
      { action_type: 'dream_delegation', summary: 'Delegerade Dream-fynd open_actions → task 4bc5', target_id: '4bc5', status: 'pending', created_at: iso(2) },
      { action_type: 'workflow_run', summary: 'Köade workflow "Daily" → körning r9', target_id: 'r9', status: 'queued', created_at: iso(90) },
    ])
    expect(out).toContain('[SENASTE ÅTGÄRDER')
    expect(out).toContain('[dream_delegation] Delegerade Dream-fynd open_actions → task 4bc5')
    expect(out).toContain('status=pending')
    expect(out).toContain('min sedan')
    expect(out).toContain('[workflow_run]')
  })
})

describe('buildActionMemory — project-scoped (cross-conversation) + corroboration flag', () => {
  it('scopes by project, does NOT narrow to conversation, flags recent delegation', async () => {
    const { db, queries } = makeDb({
      atlas_actions: [
        { action_type: 'dream_delegation', summary: 'a', target_id: 't', status: 'pending', created_at: iso(1), project_id: 'p-prompt', conversation_id: 'c1' },
        { action_type: 'workflow_run', summary: 'b', target_id: 'r', status: 'queued', created_at: iso(3), project_id: 'p-prompt', conversation_id: 'c2' },
      ],
    })
    const am = await buildActionMemory(db, ['p-prompt'])
    const q = queries.find(x => x.table === 'atlas_actions')!
    expect(q.ins.find(i => i.c === 'project_id')?.v).toEqual(['p-prompt'])
    expect(q.eqs.find(e => e.c === 'conversation_id')).toBeUndefined() // recall works across chats
    expect(am.text).toContain('[dream_delegation]') // row from c1
    expect(am.text).toContain('[workflow_run]')     // row from c2 — both returned (cross-conversation)
    expect(am.hasRecentDelegation).toBe(true)
  })

  it('hasRecentDelegation is false when there is no delegation in the window', async () => {
    const { db } = makeDb({
      atlas_actions: [
        { action_type: 'workflow_run', summary: 'b', target_id: 'r', status: 'queued', created_at: iso(1), project_id: 'p-prompt', conversation_id: 'c2' },
      ],
    })
    const am = await buildActionMemory(db, ['p-prompt'])
    expect(am.hasRecentDelegation).toBe(false)
  })

  it('empty allow-list → impossible id → no leakage', async () => {
    const { db, queries } = makeDb({ atlas_actions: [] })
    const am = await buildActionMemory(db, [])
    const q = queries.find(x => x.table === 'atlas_actions')!
    expect(q.ins.find(i => i.c === 'project_id')?.v).toEqual([IMPOSSIBLE_PROJECT_ID])
    expect(am.text).toBe('')
  })
})
