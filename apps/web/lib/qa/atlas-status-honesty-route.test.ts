/**
 * Status intent + honesty — ROUTE CONTRACT.
 *
 * The unit tests prove the classifier and the claim detector in isolation. These
 * drive the real POST handler with a recording database and a controlled model,
 * because the defects were only ever visible end-to-end: the scope was lost
 * between the request and the system prompt, and the disclaimer was appended
 * after the model had already answered.
 *
 * The model is canned here on purpose — honesty operates on response text, so
 * the only way to test it deterministically is to choose that text.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

let sessionUser: { id: string; email?: string } | null = null
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
}))

let touchedTables: string[] = []
let writeAttempts: string[] = []
/** Rows a table should return. Empty by default; set only by the tests that need
 *  a tool call to genuinely succeed (verified-execution evidence). */
let tableRows: Record<string, unknown[]> = {}
const WRITE_VERBS = ['insert', 'update', 'upsert', 'delete']

function makeBuilder(table: string): any {
  let single = false
  const b: any = new Proxy({}, {
    get(_t, p) {
      const k = String(p)
      if (k === 'then') return (ok: any) => {
        const rows = tableRows[table] ?? []
        return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: null }).then(ok)
      }
      if (k === 'single' || k === 'maybeSingle') return () => { single = true; return b }
      if (WRITE_VERBS.includes(k)) {
        return () => { writeAttempts.push(`${table}.${k}`); return b }
      }
      return () => b
    },
  })
  return b
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => { touchedTables.push(t); return makeBuilder(t) },
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}))

let cannedText = 'ok'
/** When set, the model emits this tool_use on turn 0 before answering. Used to
 *  create REAL execution evidence rather than asserting the flag by hand. */
let cannedToolUse: { name: string; input: unknown } | null = null
let streamCalls: Array<{ system: string; tools: Array<{ name: string }> }> = []
vi.mock('@anthropic-ai/sdk', () => {
  class Fake {
    messages = {
      stream: (args: any) => {
        const turn = streamCalls.length
        streamCalls.push({ system: args.system, tools: args.tools ?? [] })
        const h: Record<string, (d: any) => void> = {}
        return {
          on(e: string, cb: any) { h[e] = cb; return this },
          async finalMessage() {
            if (cannedToolUse && turn === 0) {
              return {
                stop_reason: 'tool_use',
                content: [{ type: 'tool_use', id: 'tu_1', name: cannedToolUse.name, input: cannedToolUse.input }],
              }
            }
            h.text?.(cannedText)
            return { stop_reason: 'end_turn', content: [{ type: 'text', text: cannedText }] }
          },
        }
      },
    }
  }
  return { default: Fake }
})

const DISCLAIMER = /faktiskt inte kört något/

async function post(userText: string, modelText = 'ok') {
  vi.resetModules()
  touchedTables = []; writeAttempts = []; streamCalls = []; cannedText = modelText
  const { POST } = await import('@/app/api/chat/route')
  const res = await POST(new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: userText }] }),
  }) as any)
  const raw = res.body ? await new Response(res.body).text() : ''
  let out = '', reqType: string | null = null
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue
    try {
      const e = JSON.parse(line.slice(6))
      if (e.event === 'text') out += e.text
      if (e.event === 'timing' && e.reqType) reqType = e.reqType
    } catch { /* not a JSON frame */ }
  }
  return { res, out, reqType, system: streamCalls[0]?.system ?? '', tools: streamCalls[0]?.tools ?? [] }
}

beforeEach(() => {
  sessionUser = { id: 'user-1', email: 'owner@example.com' }
  process.env.ANTHROPIC_API_KEY = 'test-key'
  cannedToolUse = null
  tableRows = {}
})

describe('STATUS request — stays on the full path', () => {
  it('authenticates like any other request', async () => {
    sessionUser = null
    const { res } = await post('Hur har The Prompt gått idag?')
    expect(res.status).toBe(401)
  })

  it('builds full context and keeps the whole tool schema', async () => {
    const r = await post('Hur har The Prompt gått idag?')
    expect(r.reqType).toBe('atlas')
    expect(touchedTables).toContain('projects')      // isolation boundary read
    expect(touchedTables.length).toBeGreaterThan(5)  // live context built
    expect(r.tools.length).toBeGreaterThan(0)
    expect(r.tools.map(t => t.name)).toContain('get_current_time')
  })

  it('does not become a lightweight fast path', async () => {
    const r = await post('Vad är status på Familje-Stunden?')
    expect(r.reqType).toBe('atlas')
    expect(touchedTables.length).toBeGreaterThan(5)
  })

  it('mutates nothing', async () => {
    await post('Hur har The Prompt gått idag?')
    expect(writeAttempts).toEqual([])
  })
})

describe('STATUS request — the asked-for scope reaches the model', () => {
  it('carries project and day scope into the system prompt', async () => {
    const r = await post('Hur har The Prompt gått idag?')
    expect(r.system).toContain('[STATUSFÖRFRÅGAN')
    expect(r.system).toContain('The Prompt')
    expect(r.system).toMatch(/Period: idag/)
  })

  it('carries week and month scope', async () => {
    const w = await post('Hur har The Prompt gått denna vecka?')
    expect(w.system).toMatch(/Period: denna vecka/)
    const m = await post('Hur går The Prompt den här månaden?')
    expect(m.system).toMatch(/Period: denna månad/)
  })

  it('states no project when the request is generic, rather than guessing one', async () => {
    const r = await post('Hur går det?')
    expect(r.system).toContain('[STATUSFÖRFRÅGAN')
    expect(r.system).toMatch(/Gissa aldrig ett projekt/i)
    expect(r.system).not.toMatch(/Projekt: The Prompt/)
  })

  it('adds no directive at all to a non-status request', async () => {
    for (const q of ['Vad är klockan i New York?', 'Publicera nästa video']) {
      const r = await post(q)
      expect(r.system, q).not.toContain('[STATUSFÖRFRÅGAN')
    }
  })

  it('labels cumulative view totals so they cannot be reported as the period', async () => {
    const r = await post('Hur har The Prompt gått idag?')
    // The OPERATIONS block must say what the view numbers actually are.
    expect(r.system).toMatch(/Visningar TOTALT ackumulerat \(INTE idag/)
    expect(r.system).toMatch(/NULÄGE just nu/)
  })
})

describe('HONESTY — read-only answers get no execution disclaimer', () => {
  const READ_ONLY_ANSWERS = [
    'Idag har 0 publicerats. Nästa körning startar kl 14.',
    'The Prompt publicerar två gånger om dagen.',
    'Just nu väntar 4 på rendering och 1 renderar.',
    'Vill du trigga en publicering eller kolla vad som ligger i kön?',
  ]
  for (const answer of READ_ONLY_ANSWERS) {
    it(`no disclaimer for: "${answer.slice(0, 44)}"`, async () => {
      const r = await post('Hur har The Prompt gått idag?', answer)
      expect(r.out).not.toMatch(DISCLAIMER)
      expect(r.out).toContain(answer.slice(0, 20))
    })
  }

  it('no disclaimer on a time answer', async () => {
    const r = await post('Vad är klockan i New York?', 'Klockan är 13:42 i New York (EDT).')
    expect(r.out).not.toMatch(DISCLAIMER)
  })

  it('no disclaimer on a static identity answer', async () => {
    const r = await post('Vem är du?', 'Jag är Atlas — din Chief of Staff.')
    expect(r.reqType).toBe('static_conversation')
    expect(r.out).not.toMatch(DISCLAIMER)
  })
})

describe('HONESTY — unsupported execution claims are still corrected', () => {
  it('catches a publish claim made during a STATUS request', async () => {
    const r = await post('Hur har The Prompt gått idag?', 'Jag publicerade nästa video åt dig.')
    expect(r.out).toMatch(DISCLAIMER)
  })

  it('catches a publish claim made during an ACTION request', async () => {
    const r = await post('Publicera nästa video', 'Klart, jag publicerade den.')
    expect(r.out).toMatch(DISCLAIMER)
  })

  it('catches a claim buried inside an otherwise read-only report', async () => {
    const r = await post(
      'Hur har The Prompt gått idag?',
      'Idag har 0 publicerats. Just nu väntar 4 på rendering. Jag triggade körningen åt dig.',
    )
    expect(r.out).toMatch(DISCLAIMER)
  })

  it('still catches the present-tense claim it always caught', async () => {
    const r = await post('Kör workflowet', 'Jag triggar workflowet nu.')
    expect(r.out).toMatch(DISCLAIMER)
  })
})

describe('HONESTY — verified execution suppresses the warning', () => {
  /**
   * Real evidence, not a hand-set flag: the model emits a trigger_workflow
   * tool_use, the route executes it against a database shaped to let it succeed,
   * and only then does the model make the claim. `actionToolUsed` becomes true
   * the same way it does in production.
   */
  const PROJECT = 'proj-1'
  function armVerifiedExecution() {
    cannedToolUse = { name: 'trigger_workflow', input: { workflow_id: 'wf-1', input: {} } }
    tableRows = {
      // getAllowedProjectIds → the caller owns PROJECT, so isolation permits it
      projects: [{ id: PROJECT, owner_id: 'user-1' }],
      workflows: [{ id: 'wf-1', project_id: PROJECT, name: 'Publish', steps: [], side_effect_class: 'external' }],
      runs: [{ id: 'run-1' }],
    }
  }

  it('no warning for "Jag publicerade nästa video." when the workflow really ran', async () => {
    armVerifiedExecution()
    const r = await post('Publicera nästa video', 'Jag publicerade nästa video.')
    expect(r.out).not.toMatch(DISCLAIMER)
  })

  it('no warning for "Klart, jag publicerade den." when the workflow really ran', async () => {
    armVerifiedExecution()
    const r = await post('Publicera nästa video', 'Klart, jag publicerade den.')
    expect(r.out).not.toMatch(DISCLAIMER)
  })

  it('the SAME claim without execution evidence is still corrected', async () => {
    // Identical text, no tool call — the only difference is the evidence.
    const r = await post('Publicera nästa video', 'Jag publicerade nästa video.')
    expect(r.out).toMatch(DISCLAIMER)
  })
})

describe('HONESTY — final adversarial matrix (route level)', () => {
  const MUST_WARN = [
    'Jag publicerade nästa video.',
    'Jag har publicerat nästa video.',
    'Publicerade nästa video.',
    'Klart, jag publicerade den.',
    'Klart — jag har publicerat videon.',
    'Jag körde workflowet.',
    'Körde workflowet.',
    'Jag startade körningen.',
    'Startade körningen.',
    'Startar publiceringen.',
  ]
  for (const answer of MUST_WARN) {
    it(`warns: "${answer}"`, async () => {
      const r = await post('Hur har The Prompt gått idag?', answer)
      expect(r.out).toMatch(DISCLAIMER)
    })
  }

  const MUST_NOT_WARN = [
    'Videon publicerades kl 14.',
    'Nästa körning startar kl 14.',
    'Systemet kör en render.',
    'The Prompt publicerar två gånger om dagen.',
    'Publicering sker kl 14.',
    'Vill du att jag publicerar nästa video?',
    'Ska jag publicera nästa video?',
    'Jag kan publicera den om du vill.',
    'Jag kommer att publicera den först efter ditt godkännande.',
    'Det ser ut som att videon publicerades kl 14.',
  ]
  for (const answer of MUST_NOT_WARN) {
    it(`stays quiet: "${answer.slice(0, 46)}"`, async () => {
      const r = await post('Hur har The Prompt gått idag?', answer)
      expect(r.out).not.toMatch(DISCLAIMER)
    })
  }

  it('modal and future forms are blocked structurally, not just by the offer phrase', async () => {
    // "kan/ska/tänker/kommer" is not an auxiliary this pattern accepts, so these
    // stay quiet even without "om du vill" to mark them as an offer.
    for (const answer of ['Jag kan publicera den.', 'Jag ska publicera den.', 'Jag tänker publicera den.']) {
      const r = await post('Hur har The Prompt gått idag?', answer)
      expect(r.out, answer).not.toMatch(DISCLAIMER)
    }
  })
})

describe('unchanged behaviour elsewhere', () => {
  it('STATIC fast path still does zero database work and sends zero tools', async () => {
    for (const q of ['Hej Atlas', 'Vem är du?', 'Tack']) {
      const r = await post(q)
      expect(r.reqType, q).toBe('static_conversation')
      expect(touchedTables, q).toEqual([])
      expect(r.tools, q).toEqual([])
    }
  })

  it('TIME path keeps get_current_time and the full schema', async () => {
    const r = await post('Vad är klockan i New York?')
    expect(r.reqType).toBe('atlas')
    expect(r.tools.map(t => t.name)).toContain('get_current_time')
  })

  it('ACTION request still routes as workflow_start with tools', async () => {
    const r = await post('Publicera nästa video')
    expect(r.reqType).toBe('workflow_start')
    expect(r.tools.length).toBeGreaterThan(0)
  })

  it('NAV request still routes as navigate', async () => {
    const r = await post('Visa dagens statistik')
    expect(r.reqType).toBe('navigate')
  })

  it('no request in this suite mutated anything', async () => {
    await post('Hur går det för GainPilot?')
    expect(writeAttempts).toEqual([])
  })
})
