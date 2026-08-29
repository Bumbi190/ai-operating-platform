/**
 * Workflow definition parser — what it must REFUSE.
 *
 * A definition is data that governs production: it decides that the release gate
 * is applied before anything is uploaded, and that no newsletter goes out before
 * two QA passes. A malformed one is a governance failure, so every case below is
 * a rejection the parser must make rather than a warning it may emit.
 */

import { describe, expect, it } from 'vitest'
import { computeDefHash, parseWorkflowSpec } from '@/lib/workflows/spec'

type Bag = Record<string, unknown>

/** Minimal valid definition: a → b → c, with c terminal. */
function validDoc(): Bag {
  return {
    ID: 'test.workflow',
    version: 1,
    status: 'draft',
    purpose: 'A fixture.',
    source_of_truth: 'docs/NONE.md',
    derived_from: [],
    canonical: { note: 'opaque' },
    hard_gates: [
      { id: 'the_gate', rule: 'Never skip.', enforced_at: ['b'], consumers: [] },
    ],
    retry_policies: {
      none: { max_attempts: 1 },
      transient: { max_attempts: 3, backoff: 'exponential', initial_delay_s: 5 },
      network: { max_attempts: 5, backoff: 'exponential', initial_delay_s: 10 },
      never_auto: { max_attempts: 1, note: 'Human decision required.' },
    },
    states: [
      state('a', { next_state: 'b', failure_transition: 'a' }),
      state('b', {
        next_state: 'c',
        failure_transition: 'a',
        prerequisites: ['a'],
        human_gate: { required: true, approver: 'editor', decision: 'Go', gate_ref: 'the_gate' },
      }),
      state('c', { next_state: null, failure_transition: null, prerequisites: ['b'] }),
    ],
    escalation: [
      { condition: 'boom', detail: 'It broke.', severity: 'critical', reason: 'Because.' },
    ],
  }
}

function state(id: string, over: Bag = {}): Bag {
  return {
    id,
    description: `state ${id}`,
    prerequisites: [],
    inputs: [],
    outputs: [],
    automated_actions: [],
    human_gate: { required: false },
    verification: [],
    failure_transition: id,
    retry_policy: 'none',
    next_state: null,
    notes: null,
    ...over,
  }
}

/** Apply an edit to a fresh valid doc and parse it. */
function parseWith(edit: (d: Bag) => void) {
  const doc = validDoc()
  edit(doc)
  return parseWorkflowSpec(doc)
}

const states = (d: Bag) => d.states as Bag[]
const byId = (d: Bag, id: string) => states(d).find(s => s.id === id)!

function expectRejected(result: ReturnType<typeof parseWorkflowSpec>, matching: RegExp) {
  expect(result.ok).toBe(false)
  expect(result.errors.join('\n')).toMatch(matching)
}

describe('parser — accepts a well-formed definition', () => {
  it('parses the fixture', () => {
    const r = parseWorkflowSpec(validDoc())
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.spec.initial_state).toBe('a')
    expect(r.spec.terminal_states).toEqual(['c'])
  })

  it('normalizes absent optionals to explicit null so the hash is total', () => {
    const r = parseWorkflowSpec(validDoc())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const a = r.spec.states[0]
    expect(a.notes).toBeNull()
    expect(a.human_gate.approver).toBeNull()
    expect(a.human_gate.decision).toBeNull()
    expect(a.human_gate.gate_ref).toBeNull()
  })

  it('an absent optional and an explicit null hash identically', () => {
    const withNulls = validDoc()
    ;(byId(withNulls, 'a').human_gate as Bag).approver = null
    const a = parseWorkflowSpec(validDoc())
    const b = parseWorkflowSpec(withNulls)
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(computeDefHash(b.spec)).toBe(computeDefHash(a.spec))
  })
})

describe('parser — structural rejections', () => {
  it('rejects a non-object document', () => {
    expectRejected(parseWorkflowSpec('nope'), /required object/)
    expectRejected(parseWorkflowSpec(null), /required object/)
    expectRejected(parseWorkflowSpec([]), /required object/)
  })

  it('rejects an unknown top-level key', () => {
    expectRejected(parseWith(d => { d.surprise = true }), /unknown key "surprise"/)
  })

  it('rejects an unknown key inside a state', () => {
    expectRejected(parseWith(d => { byId(d, 'a').cost_ceiling = 100 }), /unknown key "cost_ceiling"/)
  })

  it('rejects an unknown key inside a human gate', () => {
    expectRejected(
      parseWith(d => { (byId(d, 'b').human_gate as Bag).auto_approve = true }),
      /unknown key "auto_approve"/,
    )
  })

  it('rejects a missing version', () => {
    expectRejected(parseWith(d => { delete d.version }), /definition\.version: required integer/)
  })

  it('rejects an empty states array', () => {
    expectRejected(parseWith(d => { d.states = [] }), /required non-empty array/)
  })

  it('surfaces top-level scalar problems rather than swallowing them', () => {
    // Regression: these fields were once read after the error gate, so their
    // validation errors were computed and then thrown away.
    expectRejected(parseWith(d => { d.status = 42 }), /definition\.status: required non-empty string/)
    expectRejected(parseWith(d => { d.purpose = '' }), /definition\.purpose: required non-empty string/)
  })
})

describe('parser — state identity and references', () => {
  it('rejects duplicate state ids', () => {
    expectRejected(
      parseWith(d => { states(d).push(state('b', { next_state: 'c', failure_transition: 'a' })) }),
      /duplicate state id "b"/,
    )
  })

  it('rejects an unknown next_state', () => {
    expectRejected(parseWith(d => { byId(d, 'a').next_state = 'ghost' }), /next_state: unknown state "ghost"/)
  })

  it('rejects an unknown failure_transition', () => {
    expectRejected(
      parseWith(d => { byId(d, 'b').failure_transition = 'ghost' }),
      /failure_transition: unknown state "ghost"/,
    )
  })

  it('rejects an unknown prerequisite', () => {
    expectRejected(parseWith(d => { byId(d, 'b').prerequisites = ['ghost'] }), /unknown state "ghost"/)
  })

  it('rejects a self-prerequisite', () => {
    expectRejected(
      parseWith(d => { byId(d, 'b').prerequisites = ['b'] }),
      /cannot be its own prerequisite/,
    )
  })
})

describe('parser — the success path must be a single acyclic chain', () => {
  it('rejects a next_state cycle on the success path', () => {
    // a -> b -> c -> b. `a` is still the only entry, so the cycle rule is what
    // must fire — not the entry-count rule standing in for it.
    const r = parseWith(d => { byId(d, 'c').next_state = 'b' })
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toMatch(/cycle detected at "b"/)
    expect(r.errors.join('\n')).not.toMatch(/exactly one entry state/)
    // A cycle also consumes the terminal state; both facts are reported.
    expect(r.errors.join('\n')).toMatch(/at least one terminal state/)
  })

  it('rejects two entry states', () => {
    expectRejected(
      parseWith(d => { states(d).push(state('orphan', { next_state: 'c', failure_transition: 'orphan' })) }),
      /exactly one entry state is required/,
    )
  })

  it('rejects an unreachable state', () => {
    // An unreachable component in a graph where every state has at most one
    // successor must contain its own cycle — otherwise its head would have no
    // predecessor and be reported as a second entry instead. island1 <-> island2
    // is therefore the only shape that isolates this rule.
    const r = parseWith(d => {
      states(d).push(state('island1', { next_state: 'island2', failure_transition: 'island1' }))
      states(d).push(state('island2', { next_state: 'island1', failure_transition: 'island2' }))
    })
    expect(r.ok).toBe(false)
    const joined = r.errors.join('\n')
    expect(joined).toMatch(/states\."island1": unreachable/)
    expect(joined).toMatch(/states\."island2": unreachable/)
    expect(joined).not.toMatch(/exactly one entry state/)
    expect(joined).not.toMatch(/cycle detected/)
  })
})

describe('parser — failure transitions may never skip work', () => {
  it('accepts a backward failure transition', () => {
    const r = parseWith(d => { byId(d, 'b').failure_transition = 'a' })
    expect(r.ok).toBe(true)
  })

  it('accepts a self failure transition', () => {
    const r = parseWith(d => { byId(d, 'b').failure_transition = 'b' })
    expect(r.ok).toBe(true)
  })

  it('accepts a failure transition equal to next_state', () => {
    // scheduled_release does exactly this: a missed instant routes into the
    // state that detects and escalates it.
    const r = parseWith(d => { byId(d, 'a').failure_transition = 'b' })
    expect(r.ok).toBe(true)
  })

  it('rejects a failure transition further forward than next_state', () => {
    expectRejected(
      parseWith(d => { byId(d, 'a').failure_transition = 'c' }),
      /is further forward than next_state .* a failure may not skip states/,
    )
  })

  it('requires a failure transition on a non-terminal state', () => {
    expectRejected(
      parseWith(d => { byId(d, 'b').failure_transition = null }),
      /required on a non-terminal state/,
    )
  })

  it('forbids a failure transition on a terminal state', () => {
    expectRejected(
      parseWith(d => { byId(d, 'c').failure_transition = 'a' }),
      /a terminal state must not declare one/,
    )
  })
})

describe('parser — prerequisites must be satisfiable', () => {
  it('rejects a prerequisite that does not precede the state', () => {
    expectRejected(
      parseWith(d => { byId(d, 'a').prerequisites = ['b'] }),
      /does not precede it on the success path and can never be satisfied/,
    )
  })
})

describe('parser — retry policies', () => {
  it('rejects an undeclared retry policy on a state', () => {
    expectRejected(parseWith(d => { byId(d, 'a').retry_policy = 'aggressive' }), /must be one of/)
  })

  it('rejects a missing policy declaration', () => {
    expectRejected(
      parseWith(d => { delete (d.retry_policies as Bag).network }),
      /retry_policies\.network: missing/,
    )
  })

  it('rejects an unknown policy declaration', () => {
    expectRejected(
      parseWith(d => { (d.retry_policies as Bag).forever = { max_attempts: 99 } }),
      /unknown key "forever"/,
    )
  })

  it('rejects max_attempts below 1', () => {
    expectRejected(
      parseWith(d => { (d.retry_policies as Bag).none = { max_attempts: 0 } }),
      /max_attempts: must be >= 1/,
    )
  })

  it('rejects backoff without an initial delay', () => {
    expectRejected(
      parseWith(d => { (d.retry_policies as Bag).transient = { max_attempts: 3, backoff: 'exponential' } }),
      /declared without initial_delay_s/,
    )
  })

  it('rejects an initial delay without a backoff strategy', () => {
    expectRejected(
      parseWith(d => { (d.retry_policies as Bag).transient = { max_attempts: 3, initial_delay_s: 5 } }),
      /declared without a backoff strategy/,
    )
  })

  it('rejects a single-attempt policy that also declares backoff', () => {
    expectRejected(
      parseWith(d => {
        (d.retry_policies as Bag).none = { max_attempts: 1, backoff: 'exponential', initial_delay_s: 5 }
      }),
      /leaves no retry for backoff/,
    )
  })
})

describe('parser — gates and escalation', () => {
  it('rejects a gate_ref that names no hard gate', () => {
    expectRejected(
      parseWith(d => { (byId(d, 'b').human_gate as Bag).gate_ref = 'imaginary' }),
      /unknown hard gate "imaginary"/,
    )
  })

  it('rejects enforced_at naming an unknown state', () => {
    expectRejected(
      parseWith(d => { (d.hard_gates as Bag[])[0].enforced_at = ['ghost'] }),
      /enforced_at: unknown state "ghost"/,
    )
  })

  it('accepts the "all" wildcard in enforced_at', () => {
    const r = parseWith(d => { (d.hard_gates as Bag[])[0].enforced_at = ['all'] })
    expect(r.ok).toBe(true)
  })

  it('rejects an unmodelled escalation severity', () => {
    expectRejected(
      parseWith(d => { (d.escalation as Bag[])[0].severity = 'catastrophic' }),
      /severity: must be one of/,
    )
  })

  it('requires human_gate.required to be a boolean', () => {
    expectRejected(
      parseWith(d => { (byId(d, 'a').human_gate as Bag).required = 'yes' }),
      /required boolean/,
    )
  })
})

describe('parser — reports every problem, not just the first', () => {
  it('accumulates independent errors', () => {
    const r = parseWith(d => {
      d.surprise = true
      byId(d, 'a').retry_policy = 'aggressive'
      byId(d, 'b').prerequisites = ['ghost']
    })
    expect(r.ok).toBe(false)
    expect(r.errors.length).toBeGreaterThanOrEqual(3)
  })
})
