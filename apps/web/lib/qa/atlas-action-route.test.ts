/**
 * Action intent — ROUTE CONTRACT.
 *
 * The unit matrix proves the classifier. This proves what the route then does
 * with it: that "Kör workflowet" now reaches the same forced-tool path as an
 * already-working request like "Publicera nästa video", and that the questions
 * which merely mention a workflow do not.
 *
 * No workflow is executed. The model never emits a tool_use block, so nothing
 * downstream runs; the database is a recording mock and any write throws.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

let sessionUser: { id: string; email?: string } | null = null
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
}))

let touchedTables: string[] = []
let writeAttempts: string[] = []
const WRITE_VERBS = ['insert', 'update', 'upsert', 'delete']
function makeBuilder(table: string): any {
  const b: any = new Proxy({}, {
    get(_t, p) {
      const k = String(p)
      if (k === 'then') return (ok: any) => Promise.resolve({ data: [], error: null }).then(ok)
      if (WRITE_VERBS.includes(k)) {
        return () => { writeAttempts.push(`${table}.${k}`); throw new Error('BLOCKED WRITE') }
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

let streamCalls: Array<{ tools: Array<{ name: string }>; toolChoice: unknown }> = []
vi.mock('@anthropic-ai/sdk', () => {
  class Fake {
    messages = {
      stream: (args: any) => {
        streamCalls.push({ tools: args.tools ?? [], toolChoice: args.tool_choice ?? null })
        const h: Record<string, (d: any) => void> = {}
        return {
          on(e: string, cb: any) { h[e] = cb; return this },
          async finalMessage() {
            h.text?.('ok')
            return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }
          },
        }
      },
    }
  }
  return { default: Fake }
})

async function post(userText: string) {
  vi.resetModules()
  touchedTables = []; writeAttempts = []; streamCalls = []
  const { POST } = await import('@/app/api/chat/route')
  const res = await POST(new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: userText }] }),
  }) as any)
  const raw = res.body ? await new Response(res.body).text() : ''
  let reqType: string | null = null
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue
    try { const e = JSON.parse(line.slice(6)); if (e.event === 'timing' && e.reqType) reqType = e.reqType } catch { /* not JSON */ }
  }
  return {
    status: res.status, reqType,
    tools: streamCalls[0]?.tools ?? [],
    toolChoice: streamCalls[0]?.toolChoice ?? null,
    writeAttempts: [...writeAttempts],
  }
}

beforeEach(() => {
  sessionUser = { id: 'user-1', email: 'owner@example.com' }
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

describe('"Kör workflowet" reaches the action path', () => {
  it('routes as workflow_start', async () => {
    const r = await post('Kör workflowet')
    expect(r.status).toBe(200)
    expect(r.reqType).toBe('workflow_start')
  })

  it('forces a tool call on the first turn', async () => {
    const r = await post('Kör workflowet')
    expect(r.toolChoice).toEqual({ type: 'any' })
    expect(r.tools.length).toBeGreaterThan(0)
  })

  it('reaches exactly the same path as an already-working action request', async () => {
    const fixed = await post('Kör workflowet')
    const reference = await post('Publicera nästa video')
    expect(fixed.reqType).toBe(reference.reqType)
    expect(fixed.toolChoice).toEqual(reference.toolChoice)
    expect(fixed.tools.map(t => t.name)).toEqual(reference.tools.map(t => t.name))
  })

  it('executes no workflow — the model never emits a tool_use and nothing writes', async () => {
    const r = await post('Kör workflowet')
    expect(r.writeAttempts).toEqual([])
  })
})

describe('the same words in a question do NOT reach the action path', () => {
  const NON_ACTION = [
    'Hur kör jag workflowet?',
    'Vad är status på workflowet?',
    'Vilket workflow ska jag köra?',
    'Har du kört workflowet?',
    'Hur går workflowet idag?',
  ]
  for (const q of NON_ACTION) {
    it(`not workflow_start: "${q}"`, async () => {
      const r = await post(q)
      expect(r.reqType).not.toBe('workflow_start')
      // and no tool is forced
      expect(r.toolChoice).toBeNull()
    })
  }
})

describe('existing action behaviour unchanged', () => {
  it('"Publicera nästa video" still routes as workflow_start with a forced tool', async () => {
    const r = await post('Publicera nästa video')
    expect(r.reqType).toBe('workflow_start')
    expect(r.toolChoice).toEqual({ type: 'any' })
  })

  it('"Delegera de kritiska fynden" still routes as workflow_start', async () => {
    const r = await post('Delegera de kritiska fynden')
    expect(r.reqType).toBe('workflow_start')
  })

  it('full tool schema is unchanged on the action path', async () => {
    const r = await post('Kör workflowet')
    const names = r.tools.map(t => t.name)
    for (const expected of ['trigger_workflow', 'list_workflows', 'navigate', 'get_current_time']) {
      expect(names, expected).toContain(expected)
    }
  })
})

describe('closed-slice regressions', () => {
  it('STATIC stays static: 0 database reads, 0 tools', async () => {
    for (const q of ['Hej Atlas', 'Vem är du?', 'Tack']) {
      const r = await post(q)
      expect(r.reqType, q).toBe('static_conversation')
      expect(touchedTables, q).toEqual([])
      expect(r.tools, q).toEqual([])
    }
  })

  it('STATUS stays on the full path and is not an action', async () => {
    for (const q of ['Hur har The Prompt gått idag?', 'Vad är status på Familje-Stunden?']) {
      const r = await post(q)
      expect(r.reqType, q).toBe('atlas')
      expect(r.toolChoice, q).toBeNull()
    }
  })

  it('TIME stays on the full path with get_current_time available', async () => {
    const r = await post('Vad är klockan i New York?')
    expect(r.reqType).toBe('atlas')
    expect(r.tools.map(t => t.name)).toContain('get_current_time')
    expect(r.toolChoice).toBeNull()
  })

  it('NAV still routes as navigate', async () => {
    const r = await post('Visa dagens statistik')
    expect(r.reqType).toBe('navigate')
  })

  it('authentication is unchanged on the action path', async () => {
    sessionUser = null
    const r = await post('Kör workflowet')
    expect(r.status).toBe(401)
  })

  it('nothing in this suite mutated anything', async () => {
    await post('Kör workflowet')
    expect(writeAttempts).toEqual([])
  })
})
