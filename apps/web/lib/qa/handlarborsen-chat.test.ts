/**
 * P1D.2 — Atlas can talk about Handlarbörsen's real, stored statistics in the REAL chat.
 *
 * These tests drive `POST /api/chat` itself (mocked session, database and model) and
 * inspect what is actually sent to the model, so they prove the legacy chat path — not
 * just the isolated reader — carries the facts, and only when it should.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/cost/governed-spend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cost/governed-spend')>()
  return { ...actual, withGovernedSpend: async (_i: unknown, run: () => Promise<unknown>) => run() }
})

const ME = 'user-me'
let sessionUser: { id: string; email?: string } | null = null
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
}))

const HB_ID = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
const KEYS = [
  'companies_registered_total', 'companies_verified_total', 'vehicles_published_active', 'vehicles_reserved',
  'vehicles_published_last_24h', 'bids_total', 'bids_last_24h', 'interests_last_24h', 'offers_last_24h',
  'deals_completed_total', 'deals_completed_last_24h',
] as const
const LABELS = [
  'Registrerade företag', 'Verifierade företag', 'Publicerade fordon', 'Reserverade fordon',
  'Nya fordon senaste 24 h', 'Bud totalt', 'Bud senaste 24 h', 'Intresseanmälningar senaste 24 h',
  'Erbjudanden senaste 24 h', 'Slutförda affärer totalt', 'Slutförda affärer senaste 24 h',
]

const day = (offset = 0) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10)
function snap(overrides: Record<string, unknown> = {}, metrics: Record<string, number | null> = {}, ageMs = 60_000) {
  const t = new Date(Date.now() - ageMs).toISOString()
  const row: Record<string, unknown> = {
    project_id: HB_ID, snapshot_date: day(), observed_at: t, captured_at: t,
    schema_version: 1, window_hours: 24, completeness: 'complete', unavailable: {},
  }
  KEYS.forEach((k, i) => { row[k] = 701 + i }) // distinctive: appear nowhere else in a prompt
  return { ...row, ...metrics, ...overrides }
}

let projects: Array<Record<string, unknown>> = []
let snapshots: unknown[] = []
let tablesRead: string[] = []

function makeBuilder(table: string): any {
  const filters: Array<[string, unknown]> = []
  tablesRead.push(table)
  const rows = (): unknown[] => {
    const src = table === 'projects' ? projects : table === 'handlarborsen_marketplace_snapshots' ? snapshots : []
    return src.filter((r) => filters.every(([k, v]) => (r as any)[k] === v))
  }
  const b: any = {
    select: () => b,
    eq: (k: string, v: unknown) => { filters.push([k, v]); return b },
    neq: () => b, gte: () => b, lte: () => b, lt: () => b, gt: () => b, in: () => b, is: () => b, not: () => b,
    order: () => b, limit: () => b, range: () => b, filter: () => b, or: () => b, contains: () => b, single: () => b,
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    insert: () => b, update: () => b, upsert: () => b, delete: () => b,
    then: (ok: any) => Promise.resolve({ data: rows(), error: null }).then(ok),
  }
  return b
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => makeBuilder(t), rpc: () => Promise.resolve({ data: null, error: null }) }),
}))

let streamCalls: Array<{ system: string; tools: unknown[] }> = []
vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = {
      stream: (args: any) => {
        streamCalls.push({ system: args.system, tools: args.tools })
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

async function ask(content: string, extra: Record<string, unknown> = {}): Promise<string> {
  streamCalls = []
  vi.resetModules()
  const { POST } = await import('@/app/api/chat/route')
  const res = await POST(new Request('http://localhost/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content }], ...extra }),
  }) as any)
  if (res.body) await new Response(res.body).text()
  await new Promise((r) => setTimeout(r, 20))
  expect(streamCalls).toHaveLength(1)
  return streamCalls[0].system
}

const HEADER = '[HANDLARBÖRSEN — MARKNADSPLATSSTATISTIK (faktaunderlag, observer)]'
const NOTICE = '[HANDLARBÖRSEN — MARKNADSPLATSSTATISTIK SAKNAS (observer)]'
const snapshotReads = () => tablesRead.filter((t) => t === 'handlarborsen_marketplace_snapshots').length

beforeEach(() => {
  sessionUser = { id: ME, email: 'me@example.com' }
  process.env.ANTHROPIC_API_KEY = 'test-key'
  tablesRead = []
  snapshots = [snap()]
  projects = [
    { id: HB_ID, slug: 'handlarborsen', name: 'Handlarbörsen', owner_id: ME, atlas_mode: 'observer' },
    { id: 'p-prompt', slug: 'ai-media-automation', name: 'The Prompt', owner_id: ME, atlas_mode: 'active' },
  ]
})

describe('real chat · Handlarbörsen question with access and a complete report', () => {
  it('"Hur går det för Handlarbörsen?" puts the stored report in the prompt sent to the model', async () => {
    const system = await ask('Hur går det för Handlarbörsen?')
    expect(system).toContain(HEADER)
    expect(system).toContain('komplett — 11 av 11 mätvärden')
  })

  it('all 11 metrics appear with their Swedish labels and the STORED values', async () => {
    const system = await ask('Hur går det för Handlarbörsen?')
    LABELS.forEach((label, i) => expect(system).toContain(`- ${label}: ${701 + i}`))
  })

  it('no previous snapshot → the model is told not to claim any increase or decrease', async () => {
    const system = await ask('Hur går det för Handlarbörsen?')
    expect(system).toContain('Ingen tidigare rapport finns')
    expect(system).toContain('INTE påstå')
    expect(system).not.toContain('Jämförelse mot rapporten')
  })

  it('with a previous snapshot the comparison is stated, for stock metrics only', async () => {
    snapshots = [snap(), snap({ snapshot_date: day(1) }, { companies_registered_total: 690 })]
    const system = await ask('Hur går det för Handlarbörsen?')
    expect(system).toContain('Jämförelse mot rapporten')
    expect(system).toContain('- Registrerade företag: +11')
    expect(system).not.toContain('Ingen tidigare rapport finns')
  })

  it('an unavailable metric is "Okänt" with its reason — never 0', async () => {
    snapshots = [snap({ completeness: 'partial', unavailable: { bids_total: 'query_failed' } }, { bids_total: null })]
    const system = await ask('Hur går det för Handlarbörsen?')
    expect(system).toContain('- Bud totalt: Okänt (Kunde inte beräknas hos Handlarbörsen)')
    expect(system).not.toMatch(/Bud totalt: 0/)
    expect(system).toContain('ofullständig — 10 av 11')
  })

  it('also fires for a non-status question that names Handlarbörsen', async () => {
    expect(await ask('Hur många bud har Handlarbörsen fått?')).toContain(HEADER)
  })
})

describe('real chat · honest absence', () => {
  it('no stored report → an explicit "saknas" notice and no numbers', async () => {
    snapshots = []
    const system = await ask('Hur går det för Handlarbörsen?')
    expect(system).toContain(NOTICE)
    expect(system).toContain('ingen marknadsplatsrapport har sparats')
    expect(system).not.toContain(HEADER)
    expect(system).not.toMatch(/Registrerade företag: \d/)
  })

  it('a corrupt latest report is not used; the notice says it could not be verified', async () => {
    snapshots = [snap({ schema_version: 9 })]
    const system = await ask('Hur går det för Handlarbörsen?')
    expect(system).toContain(NOTICE)
    expect(system).toContain('kunde inte verifieras')
    expect(system).not.toContain('701')
  })

  it('an old report is still given, flagged as possibly out of date', async () => {
    snapshots = [snap({}, {}, 3 * 86_400_000)]
    const system = await ask('Hur går det för Handlarbörsen?')
    expect(system).toContain(HEADER)
    expect(system).toContain('kan vara inaktuell')
  })

  it('a project outside observer/active → notice, and the snapshots table is never read', async () => {
    projects[0].atlas_mode = 'paused'
    const system = await ask('Hur går det för Handlarbörsen?')
    expect(system).toContain(NOTICE)
    expect(snapshotReads()).toBe(0)
  })
})

describe('real chat · permission', () => {
  it('a user who does not own the project gets nothing — no data, no notice, no snapshot read', async () => {
    projects[0].owner_id = 'someone-else'
    const system = await ask('Hur går det för Handlarbörsen?')
    expect(system).not.toContain(HEADER)
    expect(system).not.toContain(NOTICE)
    expect(system).not.toContain('701')
    expect(snapshotReads()).toBe(0)
  })

  it('the client view is a hint, never permission', async () => {
    projects[0].owner_id = 'someone-else'
    const system = await ask('Hur går det för Handlarbörsen?', {
      view: { route: '/projects/handlarborsen/marketplace', project: 'handlarborsen' },
    })
    expect(system).not.toContain(HEADER)
    expect(snapshotReads()).toBe(0)
  })

  it('the view naming Handlarbörsen does not trigger a read when the text does not', async () => {
    const system = await ask('Hur går det idag?', { view: { route: '/projects/handlarborsen', project: 'handlarborsen' } })
    expect(system).not.toContain(HEADER)
    expect(snapshotReads()).toBe(0)
  })
})

describe('real chat · other questions are unchanged', () => {
  it('a question about another project does not read Handlarbörsen', async () => {
    const system = await ask('Hur har The Prompt gått idag?')
    expect(system).not.toContain(HEADER)
    expect(system).not.toContain(NOTICE)
    expect(snapshotReads()).toBe(0)
  })

  it('an unclear multi-project question picks no project', async () => {
    const system = await ask('Hur går det för Handlarbörsen och The Prompt?')
    expect(system).not.toContain(HEADER)
    expect(system).not.toContain(NOTICE)
    expect(snapshotReads()).toBe(0)
  })

  it('a generic global question carries no Handlarbörsen facts', async () => {
    const system = await ask('Hur ligger vi till?')
    expect(system).not.toContain('MARKNADSPLATSSTATISTIK')
    expect(snapshotReads()).toBe(0)
  })

  it('an action request naming Handlarbörsen is not given statistics (observer: read/analyse only)', async () => {
    const system = await ask('Starta ett workflow för Handlarbörsen')
    expect(system).not.toContain(HEADER)
    expect(snapshotReads()).toBe(0)
  })

  it('a navigation request naming Handlarbörsen is not given statistics', async () => {
    const system = await ask('Öppna Handlarbörsen')
    expect(system).not.toContain(HEADER)
    expect(snapshotReads()).toBe(0)
  })

  it('static conversation stays untouched', async () => {
    expect(await ask('Hej, vem är du?')).not.toContain('MARKNADSPLATSSTATISTIK')
    expect(snapshotReads()).toBe(0)
  })
})

describe('wiring (source)', () => {
  const route = readFileSync(resolve(__dirname, '../../app/api/chat/route.ts'), 'utf8')
  it('the route uses the helper after the server-verified allow-list and never passes the client view', () => {
    const at = route.indexOf('buildHandlarborsenChatFacts({')
    expect(at).toBeGreaterThan(route.indexOf('await getAllowedProjectIds(db, user.id)'))
    const call = route.slice(at, route.indexOf('})', at))
    expect(call).toContain('allowedProjectIds')
    expect(call).not.toMatch(/\bview\b/)
  })
  it('does not touch the assembler, shadow or the allocation policy', () => {
    const helper = readFileSync(resolve(__dirname, '../atlas/project-analytics/handlarborsen-chat.ts'), 'utf8')
    expect(helper).not.toMatch(/assembleContext|CONTEXT_READERS|runContextShadow|STATIC_POLICY/)
    const alloc = readFileSync(resolve(__dirname, '../atlas/context/allocation.ts'), 'utf8')
    expect(alloc).not.toMatch(/export const STATIC_POLICY_V2/)
  })
})
