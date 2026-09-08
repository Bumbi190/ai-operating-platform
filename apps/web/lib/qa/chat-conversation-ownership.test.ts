/**
 * POST /api/chat — conversation ownership (Phase 9E).
 *
 * `conversation_id` arrives in the REQUEST BODY. It proves nothing. Before this
 * slice the route used it directly for both a read and five writes:
 *
 *   READ   buildToolMemory() selected this conversation's prior `tool` rows and
 *          appended them to the SYSTEM PROMPT — so naming another operator's
 *          conversation put their tool history into the model's context. This
 *          is the severe half: it lands before the stream starts, and blocking
 *          only the write would not have prevented it.
 *
 *   WRITES the user message, the assistant message, tool results, link cards,
 *          the `updated_at` touch and the first-turn title rename all keyed off
 *          the same unverified id.
 *
 * The guard is deliberately split, because the two halves have different costs:
 *
 *   The read is scoped INSIDE its existing query, through
 *   `conversations!inner(user_id)`. `conversation_messages` carries neither
 *   user_id nor project_id, so ownership can only travel over that join — and
 *   doing it there adds no round trip, because the query was already being made.
 *
 *   The writes await a memoised ownership proof. Every write site is already
 *   `void`/non-blocking, so the proof costs nothing an operator can feel. A
 *   pre-stream check would have: this route's contract is that it never waits
 *   on the database before the first token, and a point query to this database
 *   measured ~100 ms.
 *
 * Verified against the live database while writing these tests: the same query
 * that returns 8 rows unscoped returns 8 for the real owner and 0 for a foreign
 * user id.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WEB_ROOT = resolve(__dirname, '../..')
const ROUTE_SRC = readFileSync(resolve(WEB_ROOT, 'app/api/chat/route.ts'), 'utf8')
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const ROUTE = codeOnly(ROUTE_SRC)

/**
 * Slice between two markers, searching for `end` AFTER `start`, and assert both
 * were found. An unguarded `indexOf` pair returns '' whenever `end` occurs
 * earlier in the file than `start`, and '' satisfies every `not.toMatch` — a
 * silent pass on an assertion that never ran. This file hit exactly that while
 * being written.
 */
function between(src: string, start: string, end: string): string {
  const from = src.indexOf(start)
  expect(from, `start marker not found: ${start}`).toBeGreaterThan(-1)
  const to = src.indexOf(end, from + start.length)
  expect(to, `end marker not found after start: ${end}`).toBeGreaterThan(from)
  return src.slice(from, to)
}

vi.mock('server-only', () => ({}))

vi.mock('@/lib/cost/governed-spend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cost/governed-spend')>()
  return { ...actual, withGovernedSpend: async (_i: unknown, run: () => Promise<unknown>) => run() }
})

// ── Session ──────────────────────────────────────────────────────────────────
const ME = 'user-me'
let sessionUser: { id: string; email?: string } | null = null
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
}))

// ── A recording database that APPLIES ownership filters ──────────────────────
/**
 * Two conversations exist. Only `conv-mine` belongs to the session user; the
 * other carries a unique marker so its presence anywhere is unambiguous.
 */
const FOREIGN_MARKER = 'ZZ-FOREIGN-TOOL-MEMORY-MARKER-ZZ'

const CONVERSATIONS = [
  { id: 'conv-mine', user_id: ME, title: 'Mine' },
  { id: 'conv-theirs', user_id: 'user-other', title: 'Theirs' },
]

const TOOL_ROWS = [
  {
    conversation_id: 'conv-mine', role: 'tool', created_at: '2026-09-08T00:00:00Z',
    tool_data: { tool: 'get_dream_findings', result: { project: 'mine-project', findings: [{ issue_id: 'MINE-1', title: 'my finding' }] } },
  },
  {
    conversation_id: 'conv-theirs', role: 'tool', created_at: '2026-09-08T01:00:00Z',
    tool_data: { tool: 'get_dream_findings', result: { project: FOREIGN_MARKER, findings: [{ issue_id: FOREIGN_MARKER, title: FOREIGN_MARKER }] } },
  },
]

interface Write { table: string; op: 'insert' | 'update'; payload: any; filters: [string, unknown][] }
let writes: Write[] = []
let ownershipQueries = 0
/** The counter sampled at the moment the model stream is opened. */
let ownershipQueriesAtStreamStart = 0
/**
 * When set, the ownership query hangs until released. The proof being ISSUED
 * before the stream costs nothing — it is fired inside a `void` call and never
 * waited on. What would cost ~100 ms of first token is the route BLOCKING on
 * it, and only a query that refuses to resolve can tell the two apart.
 */
let deferOwnership: { promise: Promise<void>; release: () => void } | null = null

function makeBuilder(table: string): any {
  const filters: [string, unknown][] = []
  let op: 'select' | 'insert' | 'update' = 'select'
  let payload: any = null

  const rows = () => {
    if (table === 'conversations') {
      return CONVERSATIONS.filter(c => filters.every(([k, v]) => (c as any)[k] === v))
    }
    if (table === 'conversation_messages') {
      return TOOL_ROWS.filter(r =>
        filters.every(([k, v]) => {
          // The embedded ownership filter, applied the way `!inner` does.
          if (k === 'conversations.user_id') {
            return CONVERSATIONS.find(c => c.id === r.conversation_id)?.user_id === v
          }
          return (r as any)[k] === v
        }))
    }
    return []
  }

  const b: any = {
    select: (cols?: string) => {
      if (table === 'conversations' && cols === 'id') ownershipQueries++
      return b
    },
    eq: (k: string, v: unknown) => { filters.push([k, v]); return b },
    neq: () => b, gte: () => b, lte: () => b, lt: () => b, gt: () => b,
    in: () => b, is: () => b, not: () => b, order: () => b, limit: () => b,
    range: () => b, filter: () => b, or: () => b, contains: () => b,
    single: () => b,
    maybeSingle: () => ({
      then: (ok: any) => {
        const settle = () => ({ data: rows()[0] ?? null, error: null })
        const gate = table === 'conversations' && deferOwnership ? deferOwnership.promise : Promise.resolve()
        return gate.then(settle).then(ok)
      },
    }),
    insert: (p: any) => { op = 'insert'; payload = p; writes.push({ table, op, payload, filters }); return b },
    update: (p: any) => { op = 'update'; payload = p; writes.push({ table, op, payload, filters }); return b },
    upsert: () => b,
    delete: () => b,
    then: (ok: any) => Promise.resolve({ data: rows(), error: null }).then(ok),
  }
  return b
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => makeBuilder(t),
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}))

// ── Recording model client ───────────────────────────────────────────────────
let streamCalls: Array<{ system: string; tools: unknown[]; messages: unknown[] }> = []
vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = {
      stream: (args: any) => {
        ownershipQueriesAtStreamStart = ownershipQueries
        streamCalls.push({ system: args.system, tools: args.tools, messages: args.messages })
        const handlers: Record<string, (d: any) => void> = {}
        return {
          on(event: string, cb: (d: any) => void) { handlers[event] = cb; return this },
          async finalMessage() {
            handlers.text?.('Svar.')
            return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Svar.' }] }
          },
        }
      },
    }
  }
  return { default: FakeAnthropic }
})

/**
 * Poll until `cond` holds. The write sites are `void`, so their effects land on
 * a later turn — a fixed sleep is a race under parallel test-file execution
 * (these tests passed alone and failed in a full run before this helper).
 */
async function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!cond() && Date.now() < deadline) await new Promise(r => setTimeout(r, 5))
}

async function post(body: unknown) {
  vi.resetModules()
  const { POST } = await import('@/app/api/chat/route')
  const res = await POST(new Request('http://localhost/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any)
  const text = res.body ? await new Response(res.body).text() : ''
  // The write sites are `void` — let them settle before asserting. Bounded, and
  // it exits as soon as an effect is observable rather than after a fixed wait.
  await waitFor(() => writes.length > 0 || ownershipQueries > 0, 1500)
  await new Promise(r => setTimeout(r, 20))
  return { res, text }
}

/** A message that takes the FULL Atlas path, so tool memory is actually built. */
const ask = (conversation_id?: string) => ({
  messages: [{ role: 'user', content: 'Hur har The Prompt gått idag?' }],
  ...(conversation_id ? { conversation_id } : {}),
})

beforeEach(() => {
  sessionUser = { id: ME, email: 'me@example.com' }
  writes = []
  streamCalls = []
  ownershipQueries = 0
  ownershipQueriesAtStreamStart = 0
  deferOwnership = null
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

const messageWrites = () => writes.filter(w => w.table === 'conversation_messages' && w.op === 'insert')
const conversationUpdates = () => writes.filter(w => w.table === 'conversations' && w.op === 'update')

// ═══ Reads · prompt contamination ════════════════════════════════════════════

describe('9E · reads — a foreign conversation cannot reach the prompt', () => {
  it('an OWNED conversation supplies its prior tool memory', async () => {
    await post(ask('conv-mine'))
    expect(streamCalls).toHaveLength(1)
    expect(streamCalls[0].system).toContain('MINE-1')
  })

  it('a FOREIGN conversation supplies NO prior context', async () => {
    await post(ask('conv-theirs'))
    expect(streamCalls).toHaveLength(1)
    expect(streamCalls[0].system).not.toContain(FOREIGN_MARKER)
  })

  it('THE contamination test — the foreign marker reaches nothing sent to the model', async () => {
    await post(ask('conv-theirs'))
    const everythingSent = JSON.stringify(streamCalls)
    expect(everythingSent).not.toContain(FOREIGN_MARKER)
  })

  it('a NONEXISTENT conversation behaves exactly like a foreign one', async () => {
    // Compared by the TOOL-MEMORY BLOCK, not by the whole prompt: the system
    // prompt embeds the current instant, so two requests are never byte-equal
    // and asserting that would fail on the clock rather than on ownership.
    const MEMORY_BLOCK = /\[SENASTE DREAM-FYND[\s\S]*/
    const memoryBlock = (system: string) => MEMORY_BLOCK.exec(system)?.[0] ?? null

    await post(ask('conv-does-not-exist'))
    const missing = memoryBlock(streamCalls[0].system)

    streamCalls = []
    await post(ask('conv-theirs'))
    const foreign = memoryBlock(streamCalls[0].system)

    expect(missing).toBeNull()
    expect(foreign).toBeNull()
    expect(missing).toEqual(foreign)

    // And the owned one DOES get a block — otherwise this proves nothing.
    streamCalls = []
    await post(ask('conv-mine'))
    expect(memoryBlock(streamCalls[0].system)).toContain('MINE-1')
  })

  it('the tool-memory read is scoped through the parent conversation', () => {
    const body = between(ROUTE, 'async function buildToolMemory', '\n}')
    expect(body).toMatch(/conversations!inner\(user_id\)/)
    expect(body).toMatch(/\.eq\('conversations\.user_id', userId\)/)
  })

  it('buildToolMemory cannot be called without an owner — userId is required', () => {
    const sig = between(ROUTE, 'async function buildToolMemory', '): Promise<string>')
    expect(sig).toMatch(/userId: string/)
    expect(sig).not.toMatch(/userId\?:/)
    expect(sig).not.toMatch(/userId[^,)]*=\s*/)
  })
})

// ═══ Writes ══════════════════════════════════════════════════════════════════

describe('9E · writes — a foreign conversation receives nothing', () => {
  it('an OWNED conversation receives the user message', async () => {
    await post(ask('conv-mine'))
    await waitFor(() => messageWrites().length > 0)
    const ins = messageWrites()
    expect(ins.length).toBeGreaterThan(0)
    expect(ins.every(w => w.payload.conversation_id === 'conv-mine')).toBe(true)
  })

  it('a FOREIGN conversation receives NO message of any role', async () => {
    await post(ask('conv-theirs'))
    expect(messageWrites()).toEqual([])
  })

  it('a foreign conversation receives no assistant or tool-result write either', async () => {
    await post(ask('conv-theirs'))
    const roles = messageWrites().map(w => w.payload.role)
    expect(roles).not.toContain('assistant')
    expect(roles).not.toContain('tool')
    expect(roles).toEqual([])
  })

  it('a foreign conversation is never touched — no updated_at, no title', async () => {
    await post(ask('conv-theirs'))
    expect(conversationUpdates()).toEqual([])
  })

  it('a NONEXISTENT conversation cannot receive writes', async () => {
    await post(ask('conv-does-not-exist'))
    expect(messageWrites()).toEqual([])
    expect(conversationUpdates()).toEqual([])
  })

  it('the title rename is guarded too — it is the write an operator would notice', async () => {
    await post(ask('conv-theirs'))
    expect(writes.filter(w => w.payload?.title !== undefined)).toEqual([])
  })

  it('every conversation UPDATE carries its own user_id predicate (defence in depth)', async () => {
    await post(ask('conv-mine'))
    for (const u of conversationUpdates()) {
      const cols = u.filters.map(([c]) => c)
      expect(cols, JSON.stringify(u.payload)).toContain('id')
      expect(cols, JSON.stringify(u.payload)).toContain('user_id')
    }
  })

  it('writes use the PROVEN id, never the request body value', () => {
    const body = between(ROUTE, 'async function saveMessage', '\n  }')
    expect(body).toMatch(/await resolveOwnedConversationId\(\)/)
    expect(body).toMatch(/if \(!ownedConversationId\) return/)
    // The raw body value must not be what is inserted.
    expect(body).not.toMatch(/conversation_id,\s*$/m)
  })
})

// ═══ Request contract ════════════════════════════════════════════════════════

describe('9E · the client-supplied id is untrusted', () => {
  it('the owner comes only from the authenticated session, never from the body', () => {
    // `userId` is captured from supabase auth at the top of POST.
    expect(ROUTE).toMatch(/const userId = user\.id/)
    // Nothing reads a user id out of the parsed request body.
    const parse = between(ROUTE, 'await request.json()', 'const db = createAdminClient()')
    expect(parse).not.toMatch(/user_id|userId/)
  })

  it('ownership is proven by id AND user_id together', () => {
    const body = between(ROUTE, 'const resolveOwnedConversationId', '\n  }')
    expect(body).toMatch(/\.eq\('id', conversation_id\)/)
    expect(body).toMatch(/\.eq\('user_id', userId\)/)
  })

  it('a failed ownership read is not permission — it fails closed', async () => {
    const body = between(ROUTE, 'const resolveOwnedConversationId', '\n    return ownedConversationPromise')
    // The rejection handler must yield null, not the id.
    expect(body).toMatch(/\(\)\s*=>\s*null/)
  })

  it('there is no global or first-conversation fallback', () => {
    expect(ROUTE).not.toMatch(/conversations\[0\]|\.limit\(1\)[\s\S]{0,40}conversations/)
    expect(ROUTE).not.toMatch(/conversation_id\s*\|\|\s*['"]/)
  })

  it('the proof is issued at most ONCE per request across all write sites', async () => {
    await post(ask('conv-mine'))
    await waitFor(() => ownershipQueries >= 1)
    // Five write sites share one memoised promise.
    expect(ownershipQueries).toBeLessThanOrEqual(1)
  })

  it('no ownership query at all when no conversation_id is supplied', async () => {
    await post(ask())
    expect(ownershipQueries).toBe(0)
    expect(messageWrites()).toEqual([])
  })
})

// ═══ Latency contract ════════════════════════════════════════════════════════

describe('9E · the streaming hot path is unchanged', () => {
  it('the route does NOT BLOCK on the ownership proof before reaching the model', async () => {
    // The proof is fired inside a `void` write helper, so it is in flight
    // before the stream — that costs nothing. Blocking on it is what would cost
    // ~100 ms of first token on a database this far away. Here the ownership
    // query is held open: if the route awaited it on the pre-stream path, the
    // model would never be reached and this would fail.
    let release!: () => void
    const promise = new Promise<void>(r => { release = r })
    deferOwnership = { promise, release }

    const inFlight = post(ask('conv-mine'))
    // Poll: the model must be reached WHILE the ownership query is still held
    // open. If the route awaited the proof pre-stream this never becomes true
    // and the poll times out.
    await waitFor(() => streamCalls.length === 1)
    expect(streamCalls, 'model was not reached while ownership was pending').toHaveLength(1)

    release()
    await inFlight
  })

  it('the proof is still issued — the writes remain guarded', async () => {
    await post(ask('conv-mine'))
    await waitFor(() => ownershipQueries === 1)
    expect(ownershipQueries).toBe(1)
  })

  it('the tool-memory read adds no query — it is the same single select', () => {
    const body = between(ROUTE, 'async function buildToolMemory', '\n}')
    expect((body.match(/\.from\(/g) ?? []).length).toBe(1)
  })

  it('a request with no conversation_id still performs no ownership read', async () => {
    await post(ask())
    expect(ownershipQueries).toBe(0)
  })
})
