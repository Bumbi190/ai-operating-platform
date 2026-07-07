import { describe, it, expect } from 'vitest'
import { resumeRun } from '@/lib/ai/resume'
import { buildAgentRunInsert } from '@/lib/ai/run-create'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Fake Supabase admin client for resumeRun. Resolves:
 *   from('runs').select(...).eq(...).single()              → opts.run
 *   from('runs').update(payload).eq().eq().select('id')    → opts.updateRows
 * and records the update payload(s) for assertions.
 */
function fakeAdmin(opts: { run: unknown; updateRows?: { id: string }[] }) {
  const updates: Record<string, unknown>[] = []
  const from = () => {
    const readChain: any = {
      select: () => readChain,
      eq: () => readChain,
      single: () => Promise.resolve({ data: opts.run, error: null }),
      update: (payload: Record<string, unknown>) => {
        updates.push(payload)
        const u: any = {
          eq: () => u,
          select: () => Promise.resolve({ data: opts.updateRows ?? [{ id: 'r1' }], error: null }),
        }
        return u
      },
    }
    return readChain
  }
  return { client: { from } as unknown as SupabaseClient, updates }
}

const stepsJson = [{ order: 0, name: 's0', agent_id: 'a', input_template: '', output_key: 'k0' }]

describe('resumeRun — durable requeue (#H1.P3)', () => {
  it('requeues a failed run to pending with a fresh attempt budget and cleared lease fields', async () => {
    const { client, updates } = fakeAdmin({
      run: { id: 'r', status: 'failed', steps_snapshot: null, policy_class: null, workflow_id: 'w', workflows: { steps: stepsJson, side_effect_class: 'approval_required' } },
      updateRows: [{ id: 'r' }],
    })
    const res = await resumeRun(client, 'r')
    expect(res).toEqual({ ok: true, runId: 'r', status: 'queued' })
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      status: 'pending',
      attempts: 0,
      error: null,
      last_error: null,
      finished_at: null,
      claimed_at: null,
      lease_until: null,
    })
    // max_attempts must NOT be touched (fresh budget = reset attempts only)
    expect('max_attempts' in updates[0]).toBe(false)
    // backfills the snapshot from the workflow when the run had none
    expect(updates[0].steps_snapshot).toEqual(stepsJson)
    // H1.P4 (PR1): backfills policy_class from the workflow's side_effect_class
    expect(updates[0].policy_class).toBe('approval_required')
  })

  it('rejects resuming a done run (no requeue, no execution)', async () => {
    const { client, updates } = fakeAdmin({ run: { id: 'r', status: 'done', steps_snapshot: null, workflow_id: 'w', workflows: null } })
    const res = await resumeRun(client, 'r')
    expect(res.ok).toBe(false)
    expect(updates).toHaveLength(0)
  })

  it('rejects resuming a non-failed (running) run', async () => {
    const { client, updates } = fakeAdmin({ run: { id: 'r', status: 'running', steps_snapshot: null, workflow_id: 'w', workflows: null } })
    const res = await resumeRun(client, 'r')
    expect(res.ok).toBe(false)
    expect(updates).toHaveLength(0)
  })

  it('is a no-op when the conditional update affects zero rows (concurrent resume)', async () => {
    const { client } = fakeAdmin({
      run: { id: 'r', status: 'failed', steps_snapshot: null, workflow_id: 'w', workflows: { steps: stepsJson } },
      updateRows: [], // second concurrent resume: status already pending → 0 rows
    })
    const res = await resumeRun(client, 'r')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/inte längre i failed/)
  })

  it('keeps an existing snapshot rather than re-reading live workflow steps', async () => {
    const existing = [{ order: 0, name: 'pinned', agent_id: 'a', input_template: '', output_key: 'k0' }]
    const { client, updates } = fakeAdmin({
      run: { id: 'r', status: 'failed', steps_snapshot: existing, workflow_id: 'w', workflows: { steps: stepsJson } },
      updateRows: [{ id: 'r' }],
    })
    await resumeRun(client, 'r')
    expect(updates[0].steps_snapshot).toEqual(existing) // pinned, not the live stepsJson
  })

  it('returns not-found when the run does not exist', async () => {
    const { client } = fakeAdmin({ run: null })
    const res = await resumeRun(client, 'missing')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/hittades/)
  })
})

describe('buildAgentRunInsert — snapshot at enqueue (#H1.P3)', () => {
  it('captures steps_snapshot + policy_class and enqueues as pending', () => {
    const payload = buildAgentRunInsert(
      { id: 'w', project_id: 'p', steps: stepsJson, side_effect_class: 'non_destructive' },
      { topic: 'AI' },
    )
    expect(payload).toEqual({
      workflow_id: 'w',
      project_id: 'p',
      status: 'pending',
      input: { topic: 'AI' },
      context: {},
      steps_snapshot: stepsJson,
      policy_class: 'non_destructive',
    })
  })

  it('stores null snapshot + null policy_class when the workflow has neither', () => {
    const payload = buildAgentRunInsert({ id: 'w', project_id: 'p', steps: null }, {})
    expect(payload.steps_snapshot).toBeNull()
    expect(payload.policy_class).toBeNull()
    expect(payload.status).toBe('pending')
  })
})
