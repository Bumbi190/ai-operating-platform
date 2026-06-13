import { describe, it, expect } from 'vitest'
import { computeCheckpoint, mergeRunContext } from '@/lib/ai/checkpoint'
import type { WorkflowStep } from '@/lib/supabase/types'

const steps: WorkflowStep[] = [
  { order: 0, name: 's0', agent_id: 'a', input_template: '', output_key: 'k0' },
  { order: 1, name: 's1', agent_id: 'a', input_template: '', output_key: 'k1' },
  { order: 2, name: 's2', agent_id: 'a', input_template: '', output_key: 'k2' },
]

/** Minimal chainable Supabase mock: resolves the run_logs query to `loggedOrders`. */
function mockDb(loggedOrders: number[]) {
  const result = Promise.resolve({ data: loggedOrders.map(o => ({ step_order: o })) })
  const chain: any = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    not: () => result, // computeCheckpoint awaits the final .not(...)
  }
  return chain
}

/** Mock whose run_logs query resolves to a DB error (transient read failure). */
function mockDbError(message: string) {
  const result = Promise.resolve({ data: null, error: { message } })
  const chain: any = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    not: () => result,
  }
  return chain
}

describe('computeCheckpoint — H1 step resume', () => {
  it('first attempt (no logs) runs from the first step', async () => {
    const cp = await computeCheckpoint(mockDb([]), { id: 'r', context: {} }, steps)
    expect(cp.startFromOrder).toBe(0)
    expect(cp.existingContext).toEqual({})
  })

  it('resumes from the first incomplete step, reusing earlier context', async () => {
    const run = { id: 'r', context: { k0: 'out0', k1: 'out1' } }
    const cp = await computeCheckpoint(mockDb([0, 1]), run, steps)
    expect(cp.startFromOrder).toBe(2) // 0 and 1 done → resume at 2
    expect(cp.existingContext).toEqual({ k0: 'out0', k1: 'out1' })
  })

  it('re-runs a logged step whose output is MISSING from context (no resuming into a hole)', async () => {
    // step 1 logged but k1 absent from context → must re-run step 1
    const run = { id: 'r', context: { k0: 'out0' } }
    const cp = await computeCheckpoint(mockDb([0, 1]), run, steps)
    expect(cp.startFromOrder).toBe(1)
  })

  it('all steps complete → startFromOrder past the last step (runs nothing)', async () => {
    const run = { id: 'r', context: { k0: 'a', k1: 'b', k2: 'c' } }
    const cp = await computeCheckpoint(mockDb([0, 1, 2]), run, steps)
    expect(cp.startFromOrder).toBe(3)
  })
})

describe('computeCheckpoint — DB read error is fatal (#8)', () => {
  it('throws instead of silently restarting from step 0 on a run_logs read error', async () => {
    await expect(
      computeCheckpoint(mockDbError('connection reset by peer'), { id: 'r', context: {} }, steps),
    ).rejects.toThrow(/run_logs read failed/)
  })
})

describe('mergeRunContext — completed outputs win over initial input (#8 merge)', () => {
  it('first run (no existing context) = just the input', () => {
    expect(mergeRunContext({ topic: 'AI' }, {})).toEqual({ topic: 'AI' })
  })

  it('on collision, the completed step output overrides the original input', () => {
    // input had `summary` (e.g. a user-supplied seed); step 1 later produced its
    // own `summary` output — the persisted output must win on resume.
    const merged = mergeRunContext({ summary: 'USER_SEED', topic: 'AI' }, { summary: 'STEP_OUTPUT' })
    expect(merged.summary).toBe('STEP_OUTPUT')
    expect(merged.topic).toBe('AI') // non-colliding input still available
  })
})
