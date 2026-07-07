import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the side-effectful / network deps so executeRunSteps can be unit-tested.
// interpolate (utils) and mergeRunContext (checkpoint) are pure and kept real.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/ai/runner', () => ({ runStep: vi.fn() }))
vi.mock('@/lib/ai/validators/output-validator', () => ({ validateStepOutput: vi.fn(() => ({ valid: true, issues: [] })) }))
vi.mock('@/lib/email/brevo', () => ({ sendAdminNotification: vi.fn() }))
vi.mock('@/lib/email/templates', () => ({ getApprovalPendingEmail: vi.fn(() => ({ subject: 's', html: 'h' })) }))
vi.mock('@/lib/bugs/report', () => ({ reportBug: vi.fn() }))

import { executeRunSteps } from '@/lib/ai/workflow-executor'
import { runStep } from '@/lib/ai/runner'
import { validateStepOutput } from '@/lib/ai/validators/output-validator'
import type { WorkflowStep } from '@/lib/supabase/types'

const mockedRunStep = vi.mocked(runStep)
const mockedValidate = vi.mocked(validateStepOutput)

type FakeOpts = {
  agents: Record<string, unknown>   // agent id -> config object
  existingOutput?: boolean
  existingApproval?: boolean
  lookupErrorTables?: string[]      // tables whose select resolves to a DB error
  insertErrorTables?: string[]      // tables whose insert resolves to a DB error
  uniqueViolationTables?: string[]  // tables whose insert resolves to a 23505 unique violation
}

/**
 * Configurable fake Supabase client. Records inserts/updates and returns canned
 * rows per table. Supports the call shapes executeRunSteps uses:
 *   agents .select().eq().single()        → one agent
 *   agents .select('id, config').in(...)  → list (the #5 hydration query)
 *   outputs .select('id').eq().limit().maybeSingle()   → existence guard (#1)
 *   run_logs/outputs/approvals .insert()  → recorded
 *   runs .update().eq()                   → recorded
 */
function makeFakeDb(opts: FakeOpts) {
  const inserts: Record<string, unknown[]> = { run_logs: [], outputs: [], approvals: [] }
  const updates: Record<string, unknown[]> = { runs: [] }

  function resolve(state: { table: string; filters: Record<string, unknown> }) {
    const { table, filters } = state
    if (opts.lookupErrorTables?.includes(table)) {
      return { data: null, error: { message: `simulated ${table} read failure` } }
    }
    if (table === 'agents') {
      if (Array.isArray(filters.id)) {
        return { data: (filters.id as string[]).map(id => ({ id, config: opts.agents[id] ?? null })), error: null }
      }
      const id = filters.id as string
      return {
        data: { id, name: `agent-${id}`, system_prompt: 'sp', model: 'gpt', config: opts.agents[id] ?? null },
        error: null,
      }
    }
    if (table === 'outputs')   return { data: opts.existingOutput ? { id: 'out-existing' } : null, error: null }
    if (table === 'approvals') return { data: opts.existingApproval ? { id: 'appr-existing' } : null, error: null }
    if (table === 'workflows') return { data: { name: 'wf', project_id: 'p', projects: { name: 'proj' } }, error: null }
    return { data: null, error: null }
  }

  function builder(table: string) {
    const state = { table, filters: {} as Record<string, unknown> }
    const b: any = {
      select: () => b,
      eq: (c: string, v: unknown) => { state.filters[c] = v; return b },
      in: (c: string, v: unknown) => { state.filters[c] = v; return b },
      not: () => b,
      limit: () => b,
      order: () => b,
      single: () => Promise.resolve(resolve(state)),
      maybeSingle: () => Promise.resolve(resolve(state)),
      insert: (row: unknown) => {
        (inserts[table] ??= []).push(row)
        const error = opts.uniqueViolationTables?.includes(table)
          ? { code: '23505', message: `duplicate key value violates unique constraint on ${table}` }
          : opts.insertErrorTables?.includes(table)
            ? { message: `simulated ${table} insert failure` }
            : null
        return Promise.resolve({ data: null, error })
      },
      update: (row: unknown) => { (updates[table] ??= []).push(row); return { eq: () => Promise.resolve({ data: null, error: null }) } },
      then: (onF: any, onR: any) => Promise.resolve(resolve(state)).then(onF, onR),
    }
    return b
  }

  return { from: (t: string) => builder(t), _inserts: inserts, _updates: updates }
}

function step(order: number, agent_id: string, output_key: string): WorkflowStep {
  return { order, name: `s${order}`, agent_id, input_template: '', output_key }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedValidate.mockReturnValue({ valid: true, issues: [] } as any)
  mockedRunStep.mockResolvedValue({ content: 'plain text', tokensIn: 1, tokensOut: 1, durationMs: 1 } as any)
})

describe('executeRunSteps — idempotent finalization (#1)', () => {
  it('inserts the output exactly once on a normal completion', async () => {
    const db = makeFakeDb({ agents: { a1: {} } })
    await executeRunSteps(db as any, 'run1', 'proj1', [step(0, 'a1', 'k0')], {})
    expect(db._inserts.outputs).toHaveLength(1)
  })

  it('tolerates a 23505 unique-violation on re-entry (DB-enforced idempotency)', async () => {
    // Simulates: output already written, function died before drain set done, reaper
    // requeued, re-claim sees all steps complete (startFromOrder past the last step).
    // The re-insert now hits the outputs(run_id) partial unique index → 23505, the
    // idempotent no-op: executeRunSteps must NOT throw and must not re-run steps.
    const db = makeFakeDb({ agents: { a1: {} }, uniqueViolationTables: ['outputs'] })
    await expect(
      executeRunSteps(db as any, 'run1', 'proj1', [step(0, 'a1', 'k0')], {
        existingContext: { k0: 'already-done' },
        startFromOrder: 1,
      }),
    ).resolves.toBeDefined()
    expect(mockedRunStep).not.toHaveBeenCalled() // no steps re-run
  })

  it('throws when the output insert errors (so the run is not finalized empty)', async () => {
    const db = makeFakeDb({ agents: { a1: {} }, insertErrorTables: ['outputs'] })
    await expect(
      executeRunSteps(db as any, 'run1', 'proj1', [step(0, 'a1', 'k0')], {}),
    ).rejects.toThrow(/outputs insert failed/)
  })
})

describe('executeRunSteps — maxImages preserved on validation retry (#4)', () => {
  it('passes the configured maxImages on BOTH the first attempt and the retry', async () => {
    const db = makeFakeDb({ agents: { aimg: { max_images: 1 } } })
    mockedValidate
      .mockReturnValueOnce({ valid: false, issues: ['bad'], correctionHint: 'fix it' } as any)
      .mockReturnValueOnce({ valid: true, issues: [] } as any)

    await executeRunSteps(db as any, 'run1', 'proj1', [step(0, 'aimg', 'k0')], {})

    expect(mockedRunStep).toHaveBeenCalledTimes(2)
    expect(mockedRunStep.mock.calls[0][0]).toMatchObject({ maxImages: 1 })
    expect(mockedRunStep.mock.calls[1][0]).toMatchObject({ maxImages: 1 }) // retry must keep the cap
  })
})

describe('executeRunSteps — quality metadata for skipped steps (#5)', () => {
  it('does NOT fail a skipped max_images=1 image step against FALLBACK_MAX on resume', async () => {
    // Resume: step 0 (image, max_images=1) already produced 1 url and is skipped;
    // only step 1 runs. Without the all-step hydration the gate would compare 1 url
    // against FALLBACK_MAX sagabilder=16 (required 14) and throw.
    const db = makeFakeDb({ agents: { aimg: { max_images: 1 }, atxt: {} } })
    const steps = [step(0, 'aimg', 'sagabilder'), step(1, 'atxt', 'k1')]
    const existingContext = { sagabilder: JSON.stringify({ urls: ['u1'], errors: [] }) }

    await expect(
      executeRunSteps(db as any, 'run1', 'proj1', steps, { existingContext, startFromOrder: 1 }),
    ).resolves.toBeDefined()
    expect(db._inserts.outputs).toHaveLength(1)
  })

  it('regression: a fresh max_images=1 image run still passes the gate', async () => {
    const db = makeFakeDb({ agents: { aimg: { max_images: 1 } } })
    mockedRunStep.mockResolvedValue(
      { content: JSON.stringify({ urls: ['u1'], errors: [] }), tokensIn: 1, tokensOut: 1, durationMs: 1 } as any,
    )
    await expect(
      executeRunSteps(db as any, 'run1', 'proj1', [step(0, 'aimg', 'sagabilder')], {}),
    ).resolves.toBeDefined()
    expect(db._inserts.outputs).toHaveLength(1)
  })

  it('throws (not silently empty) when the agent hydration query errors', async () => {
    const db = makeFakeDb({ agents: { aimg: { max_images: 1 } }, lookupErrorTables: ['agents'] })
    await expect(
      executeRunSteps(db as any, 'run1', 'proj1', [step(0, 'aimg', 'sagabilder')], {}),
    ).rejects.toThrow(/agent config hydration failed/)
  })
})
