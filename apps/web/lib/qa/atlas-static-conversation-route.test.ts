/**
 * Static conversation — ROUTE CONTRACT.
 *
 * The classifier unit tests prove which class a sentence belongs to. They prove
 * nothing about what the route then does with that answer, and the whole value
 * of this slice is in the second half: a static request must actually skip the
 * database and actually be sent no tools, while every other request must reach
 * the existing path completely unchanged.
 *
 * So these tests drive the real POST handler with a recording database and a
 * recording Anthropic client, and assert on what those two recorded — not on the
 * shape of the source file.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// `server-only` is a Next.js build guard with no runtime implementation outside
// the framework; several modules in the import graph pull it in.
vi.mock('server-only', () => ({}))

// ── Recording session ─────────────────────────────────────────────────────────
let sessionUser: { id: string; email?: string } | null = null
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
  }),
}))

// ── Recording admin database ──────────────────────────────────────────────────
// Records every table touched. A static request must touch none.
let touchedTables: string[] = []

function makeBuilder(table: string): any {
  const b: any = {
    select: () => b, eq: () => b, neq: () => b, gte: () => b, lte: () => b,
    lt: () => b, gt: () => b, in: () => b, is: () => b, not: () => b,
    order: () => b, limit: () => b, range: () => b, single: () => b,
    maybeSingle: () => b, insert: () => b, update: () => b, upsert: () => b,
    delete: () => b, filter: () => b, or: () => b, contains: () => b,
    then: (onOk: any) => Promise.resolve({ data: [], error: null }).then(onOk),
  }
  return b
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => { touchedTables.push(t); return makeBuilder(t) },
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}))

// ── Recording Anthropic client ────────────────────────────────────────────────
let streamCalls: Array<{ system: string; tools: unknown[]; messages: unknown[] }> = []

vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = {
      stream: (args: any) => {
        streamCalls.push({ system: args.system, tools: args.tools, messages: args.messages })
        const handlers: Record<string, (d: any) => void> = {}
        return {
          on(event: string, cb: (d: any) => void) { handlers[event] = cb; return this },
          async finalMessage() {
            handlers.text?.('Hej Andre.')
            return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hej Andre.' }] }
          },
        }
      },
    }
  }
  return { default: FakeAnthropic }
})

async function post(body: unknown) {
  vi.resetModules()          // fresh module state, incl. the 45s live-context cache
  touchedTables = []
  streamCalls = []
  const { POST } = await import('@/app/api/chat/route')
  const res = await POST(new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any)
  const text = res.body ? await new Response(res.body).text() : ''
  return { res, text }
}

const userMsg = (content: string) => ({ messages: [{ role: 'user', content }] })

beforeEach(() => {
  sessionUser = { id: 'user-1', email: 'owner@example.com' }
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

describe('authentication is unchanged', () => {
  it('rejects an unauthenticated request with 401 on the static path', async () => {
    sessionUser = null
    const { res } = await post(userMsg('Hej'))
    expect(res.status).toBe(401)
    // and never reached the model
    expect(streamCalls).toHaveLength(0)
  })

  it('rejects an unauthenticated request with 401 on the full path', async () => {
    sessionUser = null
    const { res } = await post(userMsg('Hur har The Prompt gått idag?'))
    expect(res.status).toBe(401)
    expect(streamCalls).toHaveLength(0)
  })

  it('a greeting does not become a public unauthenticated entry point', async () => {
    sessionUser = null
    for (const greeting of ['Hej', 'Tack', 'Vem är du?']) {
      const { res } = await post(userMsg(greeting))
      expect(res.status, greeting).toBe(401)
    }
  })
})

describe('STATIC path execution contract', () => {
  it('performs NO database reads at all', async () => {
    const { res } = await post(userMsg('Hej'))
    expect(res.status).toBe(200)
    expect(touchedTables).toEqual([])
  })

  it('sends NO tools to the model', async () => {
    await post(userMsg('Vem är du?'))
    expect(streamCalls).toHaveLength(1)
    expect(streamCalls[0].tools).toEqual([])
  })

  it('still reaches the model, with the message history intact', async () => {
    const history = [
      { role: 'user', content: 'Vem är du?' },
      { role: 'assistant', content: 'Jag är Atlas.' },
      { role: 'user', content: 'Tack' },
    ]
    await post({ messages: history })
    expect(streamCalls).toHaveLength(1)
    // History is passed through unchanged — the static path drops context, not
    // the conversation itself.
    expect(streamCalls[0].messages).toEqual(history)
  })

  it('uses the minimal identity system prompt, not the full Executive one', async () => {
    await post(userMsg('Hej'))
    const sys = streamCalls[0].system
    expect(sys).toMatch(/You are Atlas/)
    expect(sys).toMatch(/do NOT have the live operational snapshot/i)
    // None of the full-path blocks may appear.
    expect(sys).not.toMatch(/\[LIVE LÄGE\]/)
    expect(sys).not.toMatch(/You have a live snapshot/i)
    expect(sys).not.toMatch(/AKTUELL TID|CURRENT TIME/i)
  })

  it('preserves normal SSE streaming behaviour', async () => {
    const { res, text } = await post(userMsg('Hej'))
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    expect(text).toContain('"event":"text"')
    expect(text).toContain('Hej Andre.')
  })

  it('reports the static class in telemetry without faking a zero', async () => {
    const { text } = await post(userMsg('Hej'))
    expect(text).toContain('"reqType":"static_conversation"')
    // contextMs is a real measurement of real (near-zero) work, still emitted.
    expect(text).toMatch(/"contextMs":\d+/)
  })
})

describe('FULL path invariance', () => {
  const FULL_REQUESTS = [
    'Hur har The Prompt gått idag?',
    'Vad är klockan i New York?',
    'Vad är status på Familje-Stunden?',
    'Vad minns du om min plan för The Prompt?',
    'Publicera nästa video',
    'Vad menar du?',
  ]

  for (const msg of FULL_REQUESTS) {
    it(`still builds context and sends tools: ${msg}`, async () => {
      await post(userMsg(msg))
      // Context was actually built — the isolation read plus live readers ran.
      expect(touchedTables.length, 'expected database reads').toBeGreaterThan(0)
      expect(touchedTables).toContain('projects')
      // Tools are unchanged and non-empty.
      expect((streamCalls[0].tools as unknown[]).length).toBeGreaterThan(0)
    })
  }

  it('keeps the full Atlas system prompt and the live-context block', async () => {
    await post(userMsg('Hur har The Prompt gått idag?'))
    const sys = streamCalls[0].system
    expect(sys).toMatch(/Executive Chief of Staff/)
    expect(sys).toMatch(/You have a live snapshot/i)
    expect(sys).not.toMatch(/do NOT have the live operational snapshot/i)
  })

  it('keeps Time Foundation reachable — get_current_time is still offered', async () => {
    await post(userMsg('Vad är klockan i New York?'))
    const names = (streamCalls[0].tools as Array<{ name: string }>).map(t => t.name)
    expect(names).toContain('get_current_time')
  })

  it('offers the same tool set to a full-path request as before this slice', async () => {
    await post(userMsg('Vad är status på projektet?'))
    const names = (streamCalls[0].tools as Array<{ name: string }>).map(t => t.name)
    // A representative spread across the schema, proving no pruning happened.
    for (const expected of ['navigate', 'trigger_workflow', 'list_workflows', 'get_current_time']) {
      expect(names, expected).toContain(expected)
    }
  })

  it('reads the isolation boundary on the full path', async () => {
    await post(userMsg('Hur går det?'))
    expect(touchedTables).toContain('projects')
  })
})

describe('FULL → STATIC history transition', () => {
  /**
   * The hazard: a turn that used tools, followed by a turn that is sent NO
   * tools. If tool_use/tool_result blocks survived into the next request, the
   * Anthropic API would reject it — a static "Tack" would 400 purely because
   * the previous turn had been a project question.
   *
   * It cannot happen, and the reason is upstream: the client's API history is
   * text-only by construction. The tool loop's assistant/tool_result messages
   * live inside a single server request and are discarded with it. The tests
   * below prove the transition works, and the last one pins the invariant that
   * keeps it working.
   */

  it('turn 2 "Tack" after a full-path project turn is static, and completes normally', async () => {
    const history = [
      { role: 'user', content: 'Hur har The Prompt gått idag?' },
      { role: 'assistant', content: 'The Prompt: 3 publicerade denna vecka, kostnad 199 kr denna månad.' },
      { role: 'user', content: 'Tack' },
    ]
    const { res, text } = await post({ messages: history })

    expect(res.status).toBe(200)
    expect(text).toContain('"reqType":"static_conversation"')
    // No new dynamic context was built for turn 2.
    expect(touchedTables).toEqual([])
    // No tools offered for turn 2.
    expect(streamCalls[0].tools).toEqual([])
    // Prior history is passed through untouched — and is plain text.
    expect(streamCalls[0].messages).toEqual(history)
    // The response still completes.
    expect(text).toContain('"event":"text"')
  })

  it('"Hej" after a prior non-tool project conversation stays structurally valid', async () => {
    const history = [
      { role: 'user', content: 'Vad är status på Familje-Stunden?' },
      { role: 'assistant', content: 'Familje-Stunden: inga fallerade körningar senaste dygnet.' },
      { role: 'user', content: 'Hej' },
    ]
    const { res, text } = await post({ messages: history })

    expect(res.status).toBe(200)
    expect(text).toContain('"reqType":"static_conversation"')
    expect(touchedTables).toEqual([])
    expect(streamCalls[0].tools).toEqual([])
    expect(streamCalls[0].messages).toEqual(history)
  })

  it('every message reaching the model is plain text — no tool blocks in history', async () => {
    await post({
      messages: [
        { role: 'user', content: 'Publicera nästa video' },
        { role: 'assistant', content: 'Klart — run-id 42.' },
        { role: 'user', content: 'Tack Atlas' },
      ],
    })
    for (const m of streamCalls[0].messages as Array<{ content: unknown }>) {
      expect(typeof m.content).toBe('string')
    }
  })

  it('authentication still applies to a static turn that follows a full-path turn', async () => {
    sessionUser = null
    const { res } = await post({
      messages: [
        { role: 'user', content: 'Hur har The Prompt gått idag?' },
        { role: 'assistant', content: 'Svar.' },
        { role: 'user', content: 'Tack' },
      ],
    })
    expect(res.status).toBe(401)
  })

  it('PINS THE UPSTREAM INVARIANT: the client sends a text-only API history', async () => {
    // If this ever stops being true — if tool_use/tool_result blocks start being
    // persisted into apiMessages — then sending `tools: []` on a later static
    // turn becomes a protocol error. This test is the tripwire for that change.
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(__dirname, '../../components/platform/ChatClient.tsx'), 'utf8',
    )
    // Hydration filters persisted rows down to user/assistant with string content.
    expect(src).toMatch(/m\.role === 'user' \|\| m\.role === 'assistant'/)
    expect(src).toMatch(/content: m\.content as string/)
    // Appends are plain strings on both sides of the exchange.
    expect(src).toMatch(/apiMessages\.current = \[\.\.\.apiMessages\.current, \{ role: 'user', content: text \}\]/)
    expect(src).toMatch(/apiMessages\.current = \[\.\.\.apiMessages\.current, \{ role: 'assistant', content: assistantText \}\]/)
  })
})

describe('the two paths are genuinely different', () => {
  it('static touches no table where full touches many', async () => {
    await post(userMsg('Hej'))
    const staticTables = [...touchedTables]

    await post(userMsg('Hur har The Prompt gått idag?'))
    const fullTables = [...touchedTables]

    expect(staticTables).toEqual([])
    expect(fullTables.length).toBeGreaterThan(5)
  })

  it('static sends zero tools where full sends the whole schema', async () => {
    await post(userMsg('Tack'))
    const staticTools = (streamCalls[0].tools as unknown[]).length

    await post(userMsg('Visa dagens statistik'))
    const fullTools = (streamCalls[0].tools as unknown[]).length

    expect(staticTools).toBe(0)
    expect(fullTools).toBeGreaterThan(0)
  })
})
