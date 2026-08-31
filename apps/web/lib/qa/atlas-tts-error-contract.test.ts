/**
 * Atlas TTS error contract.
 *
 * This suite exists because of a merge. main (4B2) rewrote the authentication
 * on /api/chat/tts at the same time vNext rewrote its failure responses, and
 * the two changes collided on the same import line. Taking either side wholesale
 * would have compiled and passed every existing test while silently destroying
 * the other half — main's suites cover auth and say nothing about response
 * shape, and nothing covered the error shape at all.
 *
 * What is pinned here is the vNext half, and specifically the part that is
 * load-bearing rather than cosmetic: the route answers with a STABLE CODE, and
 * `resolveAtlasServiceWarning` turns exactly that code into the orb's `warning`
 * state and its user-facing copy. A raw provider message would both break the
 * orb and leak server configuration detail into UI text.
 *
 * The auth cases here are deliberately thin — main's session-only-routes suite
 * owns that property. These only assert the intersection the merge created:
 * that authentication still precedes the spend, and that a denial is never
 * dressed up as an Atlas service error.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getAtlasServiceErrorMessage,
  isAtlasServiceErrorCode,
} from '@/lib/atlas/provider-errors'
import { resolveAtlasServiceWarning } from '@/lib/atlas/orb-state'

// ── Governance G1 ────────────────────────────────────────────────────────────
// These suites exercise prompt construction, routing and error contracts — not
// spend governance. The provider boundary is stubbed to run its callback so a
// DB-less unit test is not refused for having no resolvable project. That the
// routes ARE governed is proven by lib/qa/governance-provider-boundary.test.ts,
// which reads the real source, and by that suite's lifecycle tests.
vi.mock('@/lib/cost/governed-spend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cost/governed-spend')>()
  return { ...actual, withGovernedSpend: async (_input: unknown, run: () => Promise<unknown>) => run() }
})


let sessionUser: { id: string } | null = null
let openaiCalls: number

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
  }),
}))

const ttsRoute = await import('@/app/api/chat/tts/route')

const post = (body: unknown = { text: 'hej' }) =>
  new Request('https://x.test/api/chat/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const ORIGINAL_KEY = process.env.OPENAI_API_KEY

/** Upstream text that must never reach the client. */
const LEAKY_UPSTREAM_BODY = 'Incorrect API key provided: sk-live-abc123'

function mockOpenAI(response: Response) {
  vi.stubGlobal('fetch', vi.fn(async () => {
    openaiCalls += 1
    return response
  }))
}

beforeEach(() => {
  sessionUser = { id: 'user-1' }
  openaiCalls = 0
  process.env.OPENAI_API_KEY = 'sk-test-key'
  mockOpenAI(new Response(new ArrayBuffer(8), { status: 200 }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = ORIGINAL_KEY
})

describe('atlas tts · not-configured contract', () => {
  it('answers 503 with a stable code when the key is missing, and never calls OpenAI', async () => {
    delete process.env.OPENAI_API_KEY
    const res = await ttsRoute.POST(post())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.code).toBe('ATLAS_TTS_NOT_CONFIGURED')
    expect(openaiCalls).toBe(0)
  })

  it('treats a whitespace-only key as unconfigured', async () => {
    // The route trims before testing; without it a stray space would be taken
    // as a real key and the request would go out and fail at OpenAI instead.
    process.env.OPENAI_API_KEY = '   '
    const res = await ttsRoute.POST(post())
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('ATLAS_TTS_NOT_CONFIGURED')
    expect(openaiCalls).toBe(0)
  })

  it('sends the operator-facing message, not a configuration hint', async () => {
    delete process.env.OPENAI_API_KEY
    const body = await (await ttsRoute.POST(post())).json()
    expect(body.error).toBe(getAtlasServiceErrorMessage('ATLAS_TTS_NOT_CONFIGURED'))
    expect(JSON.stringify(body)).not.toContain('OPENAI_API_KEY')
  })
})

describe('atlas tts · upstream-failure contract', () => {
  it('answers 502 with a stable code when OpenAI fails', async () => {
    mockOpenAI(new Response(LEAKY_UPSTREAM_BODY, { status: 401 }))
    const res = await ttsRoute.POST(post())
    expect(res.status).toBe(502)
    expect((await res.json()).code).toBe('ATLAS_TTS_REQUEST_FAILED')
  })

  it('does not leak the upstream body, status or key material to the client', async () => {
    mockOpenAI(new Response(LEAKY_UPSTREAM_BODY, { status: 401 }))
    const raw = JSON.stringify(await (await ttsRoute.POST(post())).json())
    expect(raw).not.toContain('sk-live-abc123')
    expect(raw).not.toContain('Incorrect API key')
    expect(raw).not.toContain('OpenAI')
  })
})

describe('atlas tts · codes drive the orb warning state', () => {
  it('both route codes are recognised service codes', () => {
    expect(isAtlasServiceErrorCode('ATLAS_TTS_NOT_CONFIGURED')).toBe(true)
    expect(isAtlasServiceErrorCode('ATLAS_TTS_REQUEST_FAILED')).toBe(true)
  })

  it('each code resolves to an active warning carrying its own copy', () => {
    for (const code of ['ATLAS_TTS_NOT_CONFIGURED', 'ATLAS_TTS_REQUEST_FAILED'] as const) {
      const warning = resolveAtlasServiceWarning(code)
      expect(warning.active).toBe(true)
      expect(warning.code).toBe(code)
      expect(warning.detail).toBe(getAtlasServiceErrorMessage(code))
    }
  })

  it('an unrecognised code degrades to the generic warning rather than throwing', () => {
    const warning = resolveAtlasServiceWarning('SOMETHING_ELSE')
    expect(warning.active).toBe(true)
    expect(warning.code).toBe('ATLAS_UNKNOWN_SERVICE_ERROR')
  })

  it('the code the route emits is the code the orb consumes', async () => {
    // The end-to-end property: whatever the route puts on the wire must be
    // directly usable by the orb without translation.
    delete process.env.OPENAI_API_KEY
    const body = await (await ttsRoute.POST(post())).json()
    const warning = resolveAtlasServiceWarning(body.code)
    expect(warning.code).toBe('ATLAS_TTS_NOT_CONFIGURED')
    expect(warning.detail).toBe(body.error)
  })
})

describe('atlas tts · the merge intersection', () => {
  it('authentication still precedes the spend', async () => {
    sessionUser = null
    const res = await ttsRoute.POST(post())
    expect(res.status).toBe(401)
    expect(openaiCalls).toBe(0)
  })

  it('a denial is never dressed up as an Atlas service error', async () => {
    // A 401 must stay an auth answer; if it ever gained a service code the orb
    // would render "voice unavailable" for what is really a sign-in problem.
    sessionUser = null
    const res = await ttsRoute.POST(post())
    const body = await res.json().catch(() => ({}))
    expect(isAtlasServiceErrorCode((body as { code?: unknown }).code)).toBe(false)
  })

  it('the success path still returns audio, so voice survives the merge', async () => {
    const res = await ttsRoute.POST(post({ text: 'hej världen' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/mpeg')
    expect(openaiCalls).toBe(1)
  })
})
