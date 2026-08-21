/**
 * B5 — regressionslås för /api/runs/[id].
 *
 * Auditen (2026-08-21) fann att PATCH accepterade `status` och `error` utan
 * transition-guard, utan claim-fencing och utan ownership-assert utöver
 * autentisering. Cross-project blockerades av RLS (`runs_owner`), men för egna
 * körningar gick det att:
 *   • awaiting_approval → done  (approval-bypass, approval-raden blev föräldralös)
 *   • failed → running          (oreapbar zombie: reapern kräver lease_until NOT NULL)
 *   • running → pending         (dubbelexekvering: claim_runs plockar på status ensamt)
 *
 * Routen hade noll callers. Fixen tar bort PATCH helt och lägger en explicit
 * ownership-assert på GET som defense in depth ovanpå RLS.
 *
 * Testerna är avsiktligt DELVIS STATISKA: de läser routens källkod. Ett
 * beteendetest kan bara pröva de handlers som finns, medan hela poängen här är
 * att en mutationsväg aldrig ska återuppstå — även under ett annat namn.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROUTE_PATH = fileURLToPath(
  new URL('../../app/api/runs/[id]/route.ts', import.meta.url),
)
const ROUTE_SRC = readFileSync(ROUTE_PATH, 'utf8')

/** Källkod utan blockkommentarer och radkommentarer — så doc-text inte ger falska träffar. */
const CODE_ONLY = ROUTE_SRC
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

// ─── Mockad omgivning för beteendetesterna ───────────────────────────────────

let mockAccess: { ok: boolean; allowedProjectIds?: string[]; status?: number } = { ok: true, allowedProjectIds: [] }
let mockRun: Record<string, unknown> | null = null
let mockRunError: { message: string } | null = null

vi.mock('@/lib/auth/project-access', () => ({
  resolveProjectAccess: async () =>
    mockAccess.ok
      ? { ok: true, userId: 'u1', allowedProjectIds: mockAccess.allowedProjectIds ?? [] }
      : { ok: false, response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: mockAccess.status ?? 401 }) },
  assertProjectAllowed: (id: string | null | undefined, allowed: string[]) => !!id && allowed.includes(id),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: mockRun, error: mockRunError }),
        }),
      }),
    }),
  }),
}))

const routeModule = await import('@/app/api/runs/[id]/route')

beforeEach(() => {
  mockAccess = { ok: true, allowedProjectIds: ['p-own'] }
  mockRun = null
  mockRunError = null
})

// ─── A. PATCH får inte finnas ────────────────────────────────────────────────

describe('B5.A — PATCH är borttagen', () => {
  it('exporterar ingen PATCH-handler', () => {
    expect((routeModule as Record<string, unknown>).PATCH).toBeUndefined()
  })

  it('källkoden deklarerar ingen PATCH-handler', () => {
    expect(/export\s+async\s+function\s+PATCH/.test(CODE_ONLY)).toBe(false)
  })

  it('exporterar ENDAST GET och DELETE som HTTP-metoder', () => {
    const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
    const exported = METHODS.filter((m) => (routeModule as Record<string, unknown>)[m] !== undefined)
    expect(exported.sort()).toEqual(['DELETE', 'GET'])
  })
})

// ─── B. GET: ägd körning ─────────────────────────────────────────────────────

describe('B5.B — GET på egen körning', () => {
  it('returnerar körningen när project_id ligger i anroparens projekt', async () => {
    mockRun = { id: 'r1', project_id: 'p-own', status: 'done' }
    const res = await routeModule.GET(new Request('http://x'), { params: { id: 'r1' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: 'r1', project_id: 'p-own' })
  })

  it('401 utan giltig session (fail-closed via resolveProjectAccess)', async () => {
    mockAccess = { ok: false, status: 401 }
    const res = await routeModule.GET(new Request('http://x'), { params: { id: 'r1' } })
    expect(res.status).toBe(401)
  })
})

// ─── C. GET: inget existensorakel ────────────────────────────────────────────

describe('B5.C — främmande projekt läcker inte existens', () => {
  it('främmande körning ger 404, inte 403', async () => {
    mockRun = { id: 'r-foreign', project_id: 'p-other', status: 'running' }
    const res = await routeModule.GET(new Request('http://x'), { params: { id: 'r-foreign' } })
    expect(res.status).toBe(404)
  })

  it('främmande och obefintlig körning ger IDENTISK status och body', async () => {
    mockRun = { id: 'r-foreign', project_id: 'p-other', status: 'running' }
    const foreign = await routeModule.GET(new Request('http://x'), { params: { id: 'r-foreign' } })
    const foreignBody = await foreign.text()

    mockRun = null
    mockRunError = { message: 'No rows found' }
    const missing = await routeModule.GET(new Request('http://x'), { params: { id: 'r-nope' } })
    const missingBody = await missing.text()

    expect(foreign.status).toBe(missing.status)
    expect(foreignBody).toBe(missingBody)
  })

  it('tom allow-list ger 404 för allt (fail-closed)', async () => {
    mockAccess = { ok: true, allowedProjectIds: [] }
    mockRun = { id: 'r1', project_id: 'p-own', status: 'done' }
    const res = await routeModule.GET(new Request('http://x'), { params: { id: 'r1' } })
    expect(res.status).toBe(404)
  })
})

// ─── D. Ingen approval-bypass via denna route ────────────────────────────────

describe('B5.D — ingen generell väg awaiting_approval → done', () => {
  it('routen skriver aldrig runs.status', () => {
    expect(/\.update\s*\(/.test(CODE_ONLY)).toBe(false)
    expect(/status\s*[:=]\s*(body|updates|req)/.test(CODE_ONLY)).toBe(false)
  })

  it('routen läser aldrig status ur request-bodyn', () => {
    expect(/body\.status/.test(CODE_ONLY)).toBe(false)
    expect(/request\.json\(\)/.test(CODE_ONLY)).toBe(false)
  })
})

// ─── E. Immutabel exekveringsdata ────────────────────────────────────────────

describe('B5.E — immutabla exekveringsfält nämns inte som skrivbara', () => {
  const IMMUTABLE = [
    'policy_class', 'steps_snapshot', 'claim_id',
    'lease_until', 'claimed_at', 'attempts', 'max_attempts', 'cancel_requested',
  ]
  for (const field of IMMUTABLE) {
    it(`accepterar inte ${field}`, () => {
      expect(CODE_ONLY.includes(field)).toBe(false)
    })
  }
})

// ─── F. Mutationskontraktet kan inte smygas tillbaka ─────────────────────────

describe('B5.F — inget mutationskontrakt kvar', () => {
  it('bygger inget updates-objekt', () => {
    expect(/const\s+updates\b/.test(CODE_ONLY)).toBe(false)
  })

  it('GET använder den explicita ownership-asserten', () => {
    expect(CODE_ONLY.includes('assertProjectAllowed')).toBe(true)
    expect(CODE_ONLY.includes('resolveProjectAccess')).toBe(true)
  })
})
