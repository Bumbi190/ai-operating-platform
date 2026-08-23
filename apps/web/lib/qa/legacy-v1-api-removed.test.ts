/**
 * Regressionslås: den legacy externa /api/v1-ytan är borttagen och får inte återuppstå.
 *
 * /api/v1/{workflows, runs, runs/[id]} autentiserade på den delade globala
 * AIOPS_API_KEY och körde sedan mot service-role-klienten UTAN någon
 * projektscoping alls. Nyckeln bär inga claims, så `requireApiKey` etablerar
 * ingen principal — det fanns inget subjekt att auktorisera mot. Effekten var
 * cross-project LÄSNING (varje runs input/context/output, varje workflow) och
 * cross-project EXEKVERING (`POST /api/v1/runs` mot valfritt workflow), vilket
 * med H1_POLICY_GATE avstängd dessutom passerar approval-grinden.
 *
 * Auditen (2026-08-21) fann noll interna callers, noll Vercel-runtime-anrop på
 * 30 dagar, och att den enda konsumenten — Hermes-skillen `ai-ops-platform` —
 * var konfigurerad mot localhost och aldrig nådde produktion. Ytan raderades
 * därför i stället för att förses med scoped auth.
 *
 * Testerna är filsystem- och manifestbaserade med avsikt: ett beteendetest kan
 * bara pröva handlers som finns, och egenskapen som ska försvaras är att de
 * ALDRIG kommer tillbaka. En återinförd route ska fälla sviten, inte glida
 * igenom för att ingen skrev ett test för den.
 *
 * AIOPS_API_KEY och auth-helpers är MEDVETET kvar: /api/business/leads betjänar
 * fortfarande Familje-Stundens `send-pyssel-lead`. Den migreras separat till
 * project-scoped credentials.
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const API_ROOT = join(WEB_ROOT, 'app', 'api')

/** Varje route.ts under app/api, som routeväg (”/foo/[id]”). */
function routePathsOnDisk(dir: string, base = API_ROOT): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...routePathsOnDisk(full, base))
    else if (/^route( \d+)?\.tsx?$/.test(entry)) {
      out.push('/' + full.slice(base.length + 1).replace(/\/route( \d+)?\.tsx?$/, ''))
    }
  }
  return out
}

const ON_DISK = routePathsOnDisk(API_ROOT)
const MANIFEST = JSON.parse(
  readFileSync(join(WEB_ROOT, 'tests', 'isolation', 'route-manifest.json'), 'utf8'),
) as { routes: { path: string }[]; _meta?: Record<string, unknown> }

// ─── 1–3. Endpointsen är avregistrerade ──────────────────────────────────────

describe('legacy /api/v1 — routes borttagna', () => {
  it('katalogen app/api/v1 finns inte', () => {
    expect(existsSync(join(API_ROOT, 'v1'))).toBe(false)
  })

  for (const p of ['/v1/workflows', '/v1/runs', '/v1/runs/[id]']) {
    it(`${p} är inte registrerad på disk`, () => {
      expect(ON_DISK).not.toContain(p)
    })
  }

  it('ingen route-fil alls ligger under /v1', () => {
    expect(ON_DISK.filter((p) => p.startsWith('/v1'))).toEqual([])
  })
})

// ─── 4. Ingen exekveringsväg kvar ────────────────────────────────────────────

describe('legacy /api/v1 — ingen execution-path kvar', () => {
  it('ingen route utanför /api/runs* enqueue:ar via buildAgentRunInsert med API-nyckelauth', () => {
    // buildAgentRunInsert är den kanoniska enqueue-vägen. Efter borttagningen får
    // ingen API-nyckelautentiserad route använda den.
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) { walk(full); continue }
        if (!/^route( \d+)?\.tsx?$/.test(entry)) continue
        const src = readFileSync(full, 'utf8')
        if (src.includes('buildAgentRunInsert') && src.includes('requireApiKey')) {
          offenders.push(full.slice(API_ROOT.length + 1))
        }
      }
    }
    walk(API_ROOT)
    expect(offenders).toEqual([])
  })
})

// ─── 5. Manifestet klassar dem inte längre som aktiva ────────────────────────

describe('route-manifest — /v1 avklassad', () => {
  it('inga /v1-poster kvar i routes', () => {
    expect(MANIFEST.routes.filter((r) => r.path.startsWith('/v1'))).toEqual([])
  })

  it('borttagningen är dokumenterad i _meta', () => {
    expect(String(MANIFEST._meta?.removed ?? '')).toContain('/v1/runs')
  })
})

// ─── 6. Guard mot tyst återinförande ─────────────────────────────────────────

describe('drift-guard — manifest ↔ filsystem', () => {
  // OBS: manifestet har pre-existerande drift — 8 routes tillkomna efter att det
  // skrevs saknar klassificering (content/articles/*, media/breaking,
  // media/cron/dream, publishing/smoke, runs/[id]/cancel). Det ligger UTANFÖR
  // den här PR:n och lagas inte här; att klassa dem kräver ett säkerhetsbeslut
  // per route, inte en gissning. Guarden nedan är därför scopad till /v1 — den
  // egenskap den här ändringen faktiskt äger.
  it('ingen /v1-route finns vare sig på disk eller i manifestet', () => {
    const declared = MANIFEST.routes.map((r) => r.path)
    expect(ON_DISK.filter((p) => p.startsWith('/v1'))).toEqual([])
    expect(declared.filter((p) => p.startsWith('/v1'))).toEqual([])
  })

  it('varje manifestpost har en route-fil', () => {
    const onDisk = new Set(ON_DISK)
    expect(MANIFEST.routes.map((r) => r.path).filter((p) => !onDisk.has(p))).toEqual([])
  })
})

// ─── 7. Auth-kärnan och den levande konsumenten är ORÖRDA ────────────────────

describe('auth-kärnan behålls — Familje-Stunden är beroende av den', () => {
  it('lib/api-auth.ts exporterar fortfarande båda helpers', async () => {
    const auth = await import('@/lib/api-auth')
    expect(typeof auth.requireApiKey).toBe('function')
    expect(typeof auth.requireUserOrApiKey).toBe('function')
  })

  it('/api/business/leads finns kvar och accepterar API-nyckel', () => {
    // Phase 2 (2026-08-22) flyttade routen till lib/business/leads-auth.ts, som
    // anropar requireApiKey OFÖRÄNDRAD för legacy-vägen. Den egenskap det här
    // testet äger är att Familje-Stundens nyckelväg fortfarande finns — inte
    // vilket importnamn routen råkar använda. Kedjan asserteras därför hela
    // vägen ned till requireApiKey; beteendet självt är låst i
    // lib/qa/leads-dual-accept.test.ts.
    const src = readFileSync(join(API_ROOT, 'business', 'leads', 'route.ts'), 'utf8')
    expect(src).toMatch(/export async function POST/)
    expect(src).toContain("from '@/lib/business/leads-auth'")

    const resolver = readFileSync(
      join(API_ROOT, '..', '..', 'lib', 'business', 'leads-auth.ts'), 'utf8')
    expect(resolver).toContain("import { requireApiKey } from '@/lib/api-auth'")
    expect(resolver).toContain('requireApiKey(request)')
  })

  for (const p of ['/business/leads', '/business/campaigns', '/business/revenue', '/chat/tts']) {
    it(`${p} är fortfarande registrerad`, () => {
      expect(ON_DISK).toContain(p)
    })
  }
})
