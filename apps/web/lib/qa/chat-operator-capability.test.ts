/**
 * Phase 9X — Atlas chat operator capability boundary.
 *
 * `run_media_step` is the one chat tool that leaves the caller's own projects.
 * It dispatches to the platform media pipeline with `Bearer ${CRON_SECRET}`,
 * which spends (Anthropic, ElevenLabs, Ideogram, Lambda render) and can publish
 * to the platform's Instagram, Facebook and YouTube accounts.
 *
 * Before this phase the only inbound check was `auth.getUser()`. That proves
 * identity, never platform authority — and `allowedProjectIds`, which the route
 * does resolve, bounds only its READ context and says nothing about who may
 * operate the platform. So any authenticated account could have driven platform
 * spend and public posting.
 *
 * That was NOT exploitable in production: `auth.users` held exactly one row, all
 * projects shared that owner, and there is no signup route. But the protection
 * was a property of the DEPLOYMENT, not of the code — provision a second account
 * and it inherits the capability. These tests move the property into the code,
 * which is why they simulate a second, non-operator account rather than relying
 * on the population of one.
 *
 * The gate is a CAPABILITY, deliberately not tenant scoping: the media pipeline
 * is platform-owned, so project-scoping it would misdescribe the operation. The
 * authority is server-derived from the verified session email through
 * `resolvePlatformOperator()` — the helper already used for global stop
 * authority — so no tool argument, model output or project grant can reach it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const OPERATOR = 'ops@omnira.test'
const OPERATOR_ID = 'user-operator'
const OTHER_ID = 'user-second'
const OTHER_EMAIL = 'someone.else@example.test'
const MINE = '11111111-1111-1111-1111-111111111111'

let CURRENT_USER: { id: string; email: string } | null = null
let FETCHED: string[] = []
/** Tool results the route fed back to the model — how we read the tool's answer. */
let TOOL_RESULTS: any[] = []
let TOOL_INPUT: Record<string, unknown> = { step: 'generate_script' }
let TOOL_NAME = 'run_media_step'
let OWNED_PROJECTS: any[] = []

vi.mock('server-only', () => ({}))
// getAnthropic() routes the model call through governed spend; pass it through so
// the tool loop actually runs. Spend policy is not what this suite is about.
vi.mock('@/lib/cost/governed-spend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cost/governed-spend')>()
  return { ...actual, withGovernedSpend: async (_i: unknown, run: () => Promise<unknown>) => run() }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: CURRENT_USER } }) },
    from: (t: string) => builder(t),
  }),
}))
const builder = (table?: string): any => {
  // `projects` answers with OWNED_PROJECTS so a non-operator can be given real
  // ownership — otherwise "owning a project is not authority" tests nothing.
  const rows = table === 'projects' ? OWNED_PROJECTS : []
  const q: any = {
    select: () => q, insert: () => q, update: () => q, eq: () => q, in: () => q,
    gte: () => q, order: () => q, limit: () => q, not: () => q,
    single: async () => ({ data: rows[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (ok: any, e?: any) => Promise.resolve({ data: rows, error: null }).then(ok, e),
  }
  return q
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t), rpc: async () => ({ data: null, error: null }) }) }))

/** Model that asks for ONE tool call, then ends. The tool choice is the model's. */
let streamCall = 0
vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = {
      stream: (args: any) => {
        streamCall += 1
        const turn = streamCall
        // The second stream call carries the tool_result the route produced.
        if (turn > 1) {
          for (const m of args.messages ?? []) {
            const c = (m as any).content
            if (Array.isArray(c)) for (const b of c) if (b?.type === 'tool_result') TOOL_RESULTS.push(b.content)
          }
        }
        const handlers: Record<string, (d: any) => void> = {}
        return {
          on(e: string, cb: (d: any) => void) { handlers[e] = cb; return this },
          async finalMessage() {
            if (turn === 1) {
              return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: TOOL_NAME, input: TOOL_INPUT }] }
            }
            handlers.text?.('Klart.')
            return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Klart.' }] }
          },
        }
      },
    }
  }
  return { default: FakeAnthropic }
})

async function ask(name: string, input: Record<string, unknown>) {
  TOOL_NAME = name; TOOL_INPUT = input
  streamCall = 0; FETCHED = []; TOOL_RESULTS = []
  vi.resetModules()
  const { POST } = await import('@/app/api/chat/route')
  const res: any = await POST(new Request('http://localhost/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'kör steget' }] }),
  }) as any)
  if (res?.body) await new Response(res.body).text()
  await new Promise(r => setTimeout(r, 30))
  return { res, result: TOOL_RESULTS.map(r => JSON.stringify(r)).join(' ') }
}

beforeEach(() => {
  OWNED_PROJECTS = []
  CURRENT_USER = { id: OPERATOR_ID, email: OPERATOR }
  process.env.PLATFORM_OPERATOR_EMAILS = OPERATOR
  delete process.env.BREVO_ADMIN_EMAIL
  process.env.CRON_SECRET = 'test-cron'
  process.env.ANTHROPIC_API_KEY = 'test-key'   // the route 503s without a configured provider
  ;(globalThis as any).fetch = async (u: string) => {
    FETCHED.push(String(u))
    return { ok: true, status: 200, json: async () => ({ ok: true }) }
  }
})
afterEach(() => { delete process.env.PLATFORM_OPERATOR_EMAILS })

const cronCalls = () => FETCHED.filter(u => u.includes('/api/media/'))

describe('9X · run_media_step — a session is identity, not platform authority', () => {
  it('an ORDINARY authenticated user is denied', async () => {
    CURRENT_USER = { id: OTHER_ID, email: OTHER_EMAIL }
    const { result } = await ask('run_media_step', { step: 'generate_script' })
    expect(result).toContain('platform_operator_required')
    expect(result).toContain('not_platform_operator')
  })

  it('an ordinary user triggers ZERO cron sub-requests — no machine escalation', async () => {
    CURRENT_USER = { id: OTHER_ID, email: OTHER_EMAIL }
    await ask('run_media_step', { step: 'generate_script' })
    expect(cronCalls(), 'an ordinary user escalated into machine authority').toEqual([])
  })

  it('an ordinary user causes ZERO spend and ZERO publish-capable execution', async () => {
    CURRENT_USER = { id: OTHER_ID, email: OTHER_EMAIL }
    for (const step of ['generate_script', 'generate_voiceover', 'render_video', 'publish_social', 'publish_youtube']) {
      const { result } = await ask('run_media_step', { step, confirm_publish: true })
      expect(result).toContain('platform_operator_required')
      expect(cronCalls()).toEqual([])
    }
  })

  it('a SECOND authenticated account is denied — the property is in code, not the user count', async () => {
    CURRENT_USER = { id: 'user-third', email: 'third@example.test' }
    const { result } = await ask('run_media_step', { step: 'fetch_news' })
    expect(result).toContain('platform_operator_required')
    expect(cronCalls()).toEqual([])
  })

  it('confirm_publish cannot bypass the capability gate', async () => {
    CURRENT_USER = { id: OTHER_ID, email: OTHER_EMAIL }
    const { result } = await ask('run_media_step', { step: 'publish_social', confirm_publish: true })
    expect(result).toContain('platform_operator_required')
    expect(result).not.toContain('needs_confirmation')   // capability answered first
    expect(cronCalls()).toEqual([])
  })

  it('no tool argument can grant operator authority', async () => {
    CURRENT_USER = { id: OTHER_ID, email: OTHER_EMAIL }
    const { result } = await ask('run_media_step', {
      step: 'generate_script', confirm_publish: true, operator: true, is_operator: true,
      email: OPERATOR, role: 'admin', project_id: MINE, platform_operator: OPERATOR,
    })
    expect(result).toContain('platform_operator_required')
    expect(cronCalls()).toEqual([])
  })

  it('MISSING operator config fails closed — even for the would-be operator', async () => {
    delete process.env.PLATFORM_OPERATOR_EMAILS
    delete process.env.BREVO_ADMIN_EMAIL
    const { result } = await ask('run_media_step', { step: 'generate_script' })
    expect(result).toContain('no_operator_configured')
    expect(cronCalls()).toEqual([])
  })
})

describe('9X · run_media_step — the operator path is preserved', () => {
  it('the operator may run a non-publish step, and it reaches the machine pipeline', async () => {
    const { result } = await ask('run_media_step', { step: 'generate_script' })
    expect(result).not.toContain('platform_operator_required')
    expect(cronCalls()).toHaveLength(1)
    expect(cronCalls()[0]).toContain('/api/media/cron/step1')
  })

  it('the operator still needs confirm_publish for a publish step', async () => {
    const { result } = await ask('run_media_step', { step: 'publish_social' })
    expect(result).toContain('needs_confirmation')
    expect(cronCalls(), 'unconfirmed publish must not reach the pipeline').toEqual([])
  })

  it('the operator with confirm_publish does publish', async () => {
    const { result } = await ask('run_media_step', { step: 'publish_social', confirm_publish: true })
    expect(result).not.toContain('needs_confirmation')
    expect(cronCalls()).toHaveLength(1)
    expect(cronCalls()[0]).toContain('/api/media/cron/publish')
  })

  it('the BREVO_ADMIN_EMAIL compatibility fallback still authorises', async () => {
    delete process.env.PLATFORM_OPERATOR_EMAILS
    process.env.BREVO_ADMIN_EMAIL = OPERATOR
    const { result } = await ask('run_media_step', { step: 'fetch_news' })
    expect(result).not.toContain('platform_operator_required')
    expect(cronCalls()).toHaveLength(1)
  })
})

describe('9X · ordinary chat capability is NOT reduced', () => {
  it('a non-operator still gets a normal chat response', async () => {
    CURRENT_USER = { id: OTHER_ID, email: OTHER_EMAIL }
    const { res } = await ask('get_current_time', {})
    expect(res.status ?? 200).toBe(200)
  })

  it('only run_media_step consults the operator gate', async () => {
    CURRENT_USER = { id: OTHER_ID, email: OTHER_EMAIL }
    for (const t of ['get_current_time', 'list_workflows']) {
      const { result } = await ask(t, {})
      expect(result).not.toContain('platform_operator_required')
    }
  })

  it('an unauthenticated chat request is still refused by the route, as before', async () => {
    CURRENT_USER = null
    const { res } = await ask('run_media_step', { step: 'generate_script' })
    expect(res.status).toBe(401)
    expect(cronCalls()).toEqual([])
  })
})

// ═══ Gaps the mutation matrix exposed — each of these caught a survivor ══════

describe('9X · project ownership is not platform authority', () => {
  it('a non-operator who OWNS a project is still denied', async () => {
    // The survivor this closes: gating on `allowedProjectIds.length === 0` looked
    // identical while the fixture user owned nothing. Owning a project is exactly
    // the wrong proxy — the media pipeline is platform-owned, not theirs.
    CURRENT_USER = { id: OTHER_ID, email: OTHER_EMAIL }
    OWNED_PROJECTS = [{ id: MINE, owner_id: OTHER_ID }]
    const { result } = await ask('run_media_step', { step: 'generate_script' })
    expect(result).toContain('platform_operator_required')
    expect(cronCalls()).toEqual([])
  })
})

describe('9X · capability is answered before confirmation', () => {
  it('an ordinary user on an UNCONFIRMED publish gets the capability denial, not a confirmation prompt', async () => {
    // The survivor this closes: moving the gate below the confirm_publish branch
    // still denied eventually, but told a non-operator "confirm and I will post",
    // which is the wrong answer and the wrong order.
    CURRENT_USER = { id: OTHER_ID, email: OTHER_EMAIL }
    const { result } = await ask('run_media_step', { step: 'publish_social' })
    expect(result).toContain('platform_operator_required')
    expect(result).not.toContain('needs_confirmation')
    expect(cronCalls()).toEqual([])
  })
})

describe('9X · no ungated path may reach the machine pipeline', () => {
  it('every tool handler that dispatches with CRON_SECRET sits behind the operator gate', async () => {
    // The survivor this closes: a SECOND escalating tool added later would bypass
    // a guard written for one handler by name. This is a structural invariant, so
    // it holds for aliases that do not exist yet.
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(process.cwd(), 'app/api/chat/route.ts'), 'utf8')
    const lines = src.split('\n')
    const handlers: { name: string; start: number; end: number }[] = []
    lines.forEach((l, i) => {
      const m = l.match(/if \(name === '([a-z_0-9]+)'\)/)
      if (m) handlers.push({ name: m[1], start: i, end: lines.length })
    })
    handlers.forEach((h, i) => { if (handlers[i + 1]) h.end = handlers[i + 1].start })

    for (const h of handlers) {
      const body = lines.slice(h.start, h.end).join('\n')
      const escalates = /CRON_SECRET/.test(body) && /await fetch\(/.test(body)
      if (!escalates) continue
      const gateAt = body.indexOf('resolvePlatformOperator()')
      const fetchAt = body.indexOf('await fetch(')
      expect(gateAt, `${h.name} escalates with CRON_SECRET but has no operator gate`).toBeGreaterThan(-1)
      expect(gateAt, `${h.name} gates AFTER its machine call`).toBeLessThan(fetchAt)
    }
    // and the invariant is not vacuous
    expect(handlers.some(h => h.name === 'run_media_step')).toBe(true)
  })
})

describe('9X · the security register tells the truth', () => {
  it('/chat is not described as a route where a bare session suffices', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/isolation/route-manifest.json'), 'utf8'))
    const rows = Array.isArray(raw) ? raw : raw.routes
    const entry = rows.find((r: any) => r?.path === '/chat')
    expect(entry).toBeDefined()
    expect(entry.auth).toContain('User')            // still a session route, not MACHINE
    const note = String(entry.note ?? '')
    expect(note, '/chat must record the operator capability').toMatch(/operator/i)
    expect(note).not.toMatch(/bare session is sufficient/i)
  })
})
