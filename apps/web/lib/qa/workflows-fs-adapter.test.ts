/**
 * The Familje-Stunden read-only verification adapter.
 *
 * The most important tests here are the NEGATIVE ones. The adapter's whole
 * purpose is to observe policy without owning it, and that property cannot be
 * demonstrated by behaviour — only by the absence of the code that would break
 * it. So the structural block asserts what the file must never contain, and the
 * behavioural blocks assert that nothing it cannot verify ever reads as verified.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  checkAnonymousProtectedAccessDenied, checkIsMonthReleased, checkNonAdminAccess,
  checkReleaseGate, checkReleaseInstant, checkVisibleMonths, familjeStundenAdapter,
} from '@/lib/workflows/adapters/familje-stunden'
import { computeReleaseInstant, InvalidMonthKeyError } from '@/lib/workflows/adapters/familje-stunden/instant'
import { isRetryable, notPass, pass } from '@/lib/workflows/adapters/types'
import { findAdapter, registeredAdapters } from '@/lib/workflows/adapters/registry'
import { summarizeVerification } from '@/lib/workflows/schedule'
import { FAMILJE_STUNDEN_MONTHLY_RELEASE } from '@/lib/workflows/definitions'

const NOW = '2026-08-29T12:00:00.000Z'
const FS_URL = 'https://example-fs.supabase.co'

const SRC = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const ADAPTER_DIR = '../workflows/adapters/familje-stunden/'
const ADAPTER_FILES = [`${ADAPTER_DIR}index.ts`, `${ADAPTER_DIR}instant.ts`]
/** Source with comments stripped — these guards are about code, not prose. */
const CODE = (rel: string) =>
  SRC(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.FAMILJE_STUNDEN_SUPABASE_URL
  delete process.env.FAMILJE_STUNDEN_VERIFY_KEY
})

// ── D. Negative architecture ─────────────────────────────────────────────────

describe('the adapter observes policy and never owns it', () => {
  it('does not reimplement can_access_month conditions', () => {
    for (const f of ADAPTER_FILES) {
      const code = CODE(f)
      // The gate's real SQL: NOT EXISTS (... WHERE month_key = _ AND _as_of < release_at).
      expect(code, f).not.toMatch(/not\s+exists/i)
      expect(code, f).not.toMatch(/release_at\s*[<>]/)
      expect(code, f).not.toMatch(/\bselect\b[\s\S]*\bfrom\b/i)   // no `s` flag: tsconfig targets ES2017
    }
  })

  it('contains no subscription or entitlement policy logic', () => {
    for (const f of ADAPTER_FILES) {
      const code = CODE(f)
      for (const term of ['subscription', 'entitlement', 'stripe', 'is_admin', 'has_active']) {
        expect(code.toLowerCase(), `${f} / ${term}`).not.toContain(term)
      }
    }
  })

  it('contains no month_releases mutation of any kind', () => {
    for (const f of ADAPTER_FILES) {
      const code = CODE(f)
      expect(code, f).not.toMatch(/\b(delete|insert|update|upsert)\b/i)
      expect(code, f).not.toMatch(/month_releases/)
    }
  })

  it('resolves no protected storage paths and reads no storage objects', () => {
    for (const f of ADAPTER_FILES) {
      const code = CODE(f)
      expect(code, f).not.toMatch(/protectedManifest|PROTECTED_ASSETS|EBOOK_PAGES|EBOOK_META/)
      expect(code, f).not.toMatch(/\.storage\b|createSignedUrl|\/object\/|\bbucket\b/)
      expect(code, f).not.toMatch(/protected\/[a-z0-9-]+\//i)
    }
  })

  it('never names or uses a service role', () => {
    for (const f of ADAPTER_FILES) {
      expect(CODE(f).toLowerCase(), f).not.toContain('service_role')
      expect(CODE(f), f).not.toMatch(/SERVICE_ROLE_KEY/)
    }
  })

  it('performs no uploads and no Edge Function deploys', () => {
    for (const f of ADAPTER_FILES) {
      const code = CODE(f)
      expect(code, f).not.toMatch(/\bupload\b/i)
      expect(code, f).not.toMatch(/functions\s+deploy|\/v1\/projects\/.*\/functions/)
      expect(code, f).not.toMatch(/SUPABASE_ACCESS_TOKEN|Management API/i)
    }
  })

  it('issues no write-shaped HTTP to Familje-Stunden beyond the read probes', () => {
    const code = CODE(`${ADAPTER_DIR}index.ts`)
    // The only methods present are the POSTs that the protected functions
    // require in order to refuse them.
    expect(code).not.toMatch(/method:\s*'(PUT|PATCH|DELETE)'/)
  })

  it('does not import Omnira admin database access', () => {
    for (const f of ADAPTER_FILES) {
      expect(CODE(f), f).not.toMatch(/supabase\/admin|createAdminClient/)
    }
  })
})

// ── C. Release instant ───────────────────────────────────────────────────────

describe('computeReleaseInstant — DST is derived, never assumed', () => {
  it('matches Familje-Stunden production for the released reference month', () => {
    // Ground truth read from month_releases: 2026-08 → 2026-07-31 22:00 UTC.
    expect(computeReleaseInstant('2026-08').utc).toBe('2026-07-31T22:00:00.000Z')
  })

  it('matches the runbook’s canonical October example', () => {
    const r = computeReleaseInstant('2026-10')
    expect(r.utc).toBe('2026-09-30T22:00:00.000Z')
    expect(r.stockholm).toBe('2026-10-01 00:00')
    expect(r.utcOffset).toBe('+02:00')
  })

  it('crosses the autumn DST boundary correctly — the runbook’s warning case', () => {
    // Sweden leaves CEST on the last Sunday of October, so November is +01:00.
    // Deriving it by adding a month to October would be an hour wrong.
    const nov = computeReleaseInstant('2026-11')
    expect(nov.utc).toBe('2026-10-31T23:00:00.000Z')
    expect(nov.utcOffset).toBe('+01:00')
    expect(nov.stockholm).toBe('2026-11-01 00:00')
  })

  it('handles every month of the release year', () => {
    expect(computeReleaseInstant('2026-09').utc).toBe('2026-08-31T22:00:00.000Z')
    expect(computeReleaseInstant('2026-12').utc).toBe('2026-11-30T23:00:00.000Z')
    expect(computeReleaseInstant('2027-01').utc).toBe('2026-12-31T23:00:00.000Z')
  })

  it('crosses the spring DST boundary correctly', () => {
    expect(computeReleaseInstant('2027-03').utc).toBe('2027-02-28T23:00:00.000Z')  // CET
    expect(computeReleaseInstant('2027-04').utc).toBe('2027-03-31T22:00:00.000Z')  // CEST
  })

  it('is independent — the same month always yields the same instant', () => {
    expect(computeReleaseInstant('2026-11').utc).toBe(computeReleaseInstant('2026-11').utc)
  })

  it('rejects a malformed month key rather than guessing', () => {
    for (const bad of ['2026-13', '2026-00', '26-10', '2026/10', '2026-1', '', 'oktober']) {
      expect(() => computeReleaseInstant(bad), bad).toThrow(InvalidMonthKeyError)
    }
  })

  it('the check wrapper turns a malformed key into an error, never a pass', () => {
    const e = checkReleaseInstant('nonsense', NOW)
    expect(e.result).toBe('error')
    expect(e.authoritative_system).toBeNull()
  })
})

// ── E. Evidence model ────────────────────────────────────────────────────────

describe('evidence shape', () => {
  it('derives result from failure kind — a caller cannot mislabel one', () => {
    const base = { expected: 'e', observed: 'o', authoritative_system: 'x', observed_at: NOW }
    expect(notPass('k', 'authoritative_fail', base).result).toBe('fail')
    expect(notPass('k', 'credential_missing', base).result).toBe('blocked')
    expect(notPass('k', 'network_timeout', base).result).toBe('blocked')
    expect(notPass('k', 'service_unavailable', base).result).toBe('blocked')
    expect(notPass('k', 'malformed_response', base).result).toBe('error')
    expect(notPass('k', 'unexpected_status', base).result).toBe('error')
  })

  it('no failure kind can ever produce a pass', () => {
    const base = { expected: 'e', observed: 'o', authoritative_system: 'x', observed_at: NOW }
    for (const kind of ['authoritative_fail', 'credential_missing', 'network_timeout',
      'malformed_response', 'service_unavailable', 'unexpected_status'] as const) {
      expect(notPass('k', kind, base).result, kind).not.toBe('pass')
    }
  })

  it('only transient conditions are retryable', () => {
    expect(isRetryable('network_timeout')).toBe(true)
    expect(isRetryable('service_unavailable')).toBe(true)
    // A real NO, and a credential problem, must not be hammered.
    expect(isRetryable('authoritative_fail')).toBe(false)
    expect(isRetryable('credential_missing')).toBe(false)
    expect(isRetryable('malformed_response')).toBe(false)
    expect(isRetryable('unexpected_status')).toBe(false)
  })

  it('is deterministic and carries no secrets', () => {
    process.env.FAMILJE_STUNDEN_VERIFY_KEY = 'super-secret-value'
    const e = checkIsMonthReleased('2026-10', NOW)
    const serialized = JSON.stringify(e)
    expect(serialized).not.toContain('super-secret-value')
    expect(e.detail.missing_config).toBe('FAMILJE_STUNDEN_VERIFY_KEY')  // the NAME, not the value
    expect(JSON.stringify(checkIsMonthReleased('2026-10', NOW))).toBe(serialized)
  })

  it('a pass records which system answered', () => {
    const e = pass('k', { expected: 'e', observed: 'o', authoritative_system: 'familje-stunden', observed_at: NOW })
    expect(e.source).toBe('omnira.workflow.adapter')
    expect(e.authoritative_system).toBe('familje-stunden')
    expect(e.failure_kind).toBeNull()
  })
})

// ── Credential-gated checks ──────────────────────────────────────────────────

describe('checks that need a credential Omnira does not hold', () => {
  it.each([
    ['release_gate_exists', () => checkReleaseGate('2026-10', NOW)],
    ['is_month_released_expected_state', () => checkIsMonthReleased('2026-10', NOW)],
    ['non_admin_access_expected_state', () => checkNonAdminAccess('2026-10', NOW)],
    ['visible_months_expected_state', () => checkVisibleMonths(NOW)],
  ])('%s reports blocked, never pass and never fail', (key, run) => {
    const e = run()
    expect(e.check_key).toBe(key)
    expect(e.result).toBe('blocked')
    expect(e.failure_kind).toBe('credential_missing')
    expect(e.authoritative_system).toBe('familje-stunden')
  })

  it('names the exact grant needed, so the decision is concrete', () => {
    const e = checkIsMonthReleased('2026-10', NOW)
    expect(String(e.detail.required_grant)).toMatch(/scoped read-only role/)
    expect(String(e.detail.note)).toMatch(/privileged full-access key is deliberately not an option/)
  })
})

// ── Anonymous protected probe ────────────────────────────────────────────────

function stubFetch(responder: (url: string, init: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => responder(url, init)))
}
const res = (status: number) => new Response(null, { status })

describe('anonymous protected access probe', () => {
  it('is blocked when the endpoint is not configured', async () => {
    const e = await checkAnonymousProtectedAccessDenied('2026-10', NOW)
    expect(e.result).toBe('blocked')
    expect(e.failure_kind).toBe('credential_missing')
    expect(e.detail.missing_config).toBe('FAMILJE_STUNDEN_SUPABASE_URL')
  })

  it('PASSES when every unauthenticated variant is refused with 401', async () => {
    process.env.FAMILJE_STUNDEN_SUPABASE_URL = FS_URL
    stubFetch(() => res(401))
    const e = await checkAnonymousProtectedAccessDenied('2026-10', NOW)
    expect(e.result).toBe('pass')
    // Both functions, two variants each — KFM 7: one proving nothing about the other.
    expect((e.detail.attempts as unknown[]).length).toBe(4)
  })

  it('FAILS when protected material is reachable unauthenticated', async () => {
    process.env.FAMILJE_STUNDEN_SUPABASE_URL = FS_URL
    stubFetch(url => res(url.includes('get-protected-ebook') ? 200 : 401))
    const e = await checkAnonymousProtectedAccessDenied('2026-10', NOW)
    expect(e.result).toBe('fail')
    expect(e.failure_kind).toBe('authoritative_fail')
    expect(e.observed).toMatch(/were ALLOWED/)
  })

  it('a leak outranks a concurrent timeout — it is never hidden', async () => {
    process.env.FAMILJE_STUNDEN_SUPABASE_URL = FS_URL
    let n = 0
    stubFetch(() => {
      n += 1
      if (n === 1) return res(200)                                  // the leak
      throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    })
    const e = await checkAnonymousProtectedAccessDenied('2026-10', NOW)
    expect(e.result).toBe('fail')
  })

  it('a timeout is BLOCKED, never a pass', async () => {
    process.env.FAMILJE_STUNDEN_SUPABASE_URL = FS_URL
    stubFetch(() => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }) })
    const e = await checkAnonymousProtectedAccessDenied('2026-10', NOW)
    expect(e.result).toBe('blocked')
    expect(e.failure_kind).toBe('network_timeout')
  })

  it('an unreachable service is BLOCKED, never a pass', async () => {
    process.env.FAMILJE_STUNDEN_SUPABASE_URL = FS_URL
    stubFetch(() => { throw new TypeError('fetch failed') })
    const e = await checkAnonymousProtectedAccessDenied('2026-10', NOW)
    expect(e.result).toBe('blocked')
    expect(e.failure_kind).toBe('service_unavailable')
  })

  it('an unexpected status is an ERROR, never a pass', async () => {
    process.env.FAMILJE_STUNDEN_SUPABASE_URL = FS_URL
    stubFetch(() => res(500))
    const e = await checkAnonymousProtectedAccessDenied('2026-10', NOW)
    expect(e.result).toBe('error')
    expect(e.failure_kind).toBe('unexpected_status')
  })

  it('403 is not silently accepted as a denial — only 401 is expected', async () => {
    process.env.FAMILJE_STUNDEN_SUPABASE_URL = FS_URL
    stubFetch(() => res(403))
    const e = await checkAnonymousProtectedAccessDenied('2026-10', NOW)
    expect(e.result).toBe('error')
  })

  it('never sends an Authorization header carrying a real credential', async () => {
    process.env.FAMILJE_STUNDEN_SUPABASE_URL = FS_URL
    process.env.FAMILJE_STUNDEN_VERIFY_KEY = 'super-secret-value'
    const seen: string[] = []
    stubFetch((_u, init) => {
      seen.push(JSON.stringify(init.headers ?? {}))
      return res(401)
    })
    await checkAnonymousProtectedAccessDenied('2026-10', NOW)
    // The probe's whole point is being unauthenticated.
    for (const h of seen) expect(h).not.toContain('super-secret-value')
  })
})

// ── Registry and state coverage ──────────────────────────────────────────────

describe('adapter registration', () => {
  it('is reached through the definition, not by name', () => {
    expect(findAdapter(FAMILJE_STUNDEN_MONTHLY_RELEASE)).toBe(familjeStundenAdapter)
    expect(findAdapter('some.other.workflow')).toBeNull()
    expect(registeredAdapters()).toHaveLength(1)
  })

  it('exposes no execute, write or upload capability', () => {
    expect(Object.keys(familjeStundenAdapter).sort())
      .toEqual(['authoritativeSystem', 'defKey', 'verifiableStates', 'verifyState'])
  })

  it('returns nothing for a state it cannot speak about', async () => {
    expect(await familjeStundenAdapter.verifyState({
      state: 'pdf_build', instanceKey: '2026-10', now: NOW,
    })).toEqual([])
  })

  it('names exactly the states it can verify', () => {
    expect(familjeStundenAdapter.verifiableStates()).toEqual([
      'approval_release', 'backend_release_gate', 'planning', 'post_release_qa', 'scheduled_release',
    ])
  })
})

// ── F. Scheduler integration ─────────────────────────────────────────────────

describe('verification summary — worst finding wins', () => {
  const ev = (result: 'pass' | 'fail' | 'blocked' | 'error', key = 'k') =>
    ({ ...pass(key, { expected: '', observed: '', authoritative_system: null, observed_at: NOW }), result })

  it('reports nothing when nothing ran — absence of a finding is not a finding', () => {
    expect(summarizeVerification([]).summary).toBeNull()
  })

  it('a FAIL outranks an error, a blocked and a pass', () => {
    expect(summarizeVerification([ev('pass'), ev('blocked'), ev('error'), ev('fail')]).summary)
      .toBe('verification_failed')
  })

  it('an error outranks blocked and pass', () => {
    expect(summarizeVerification([ev('pass'), ev('blocked'), ev('error')]).summary)
      .toBe('verification_error')
  })

  it('blocked outranks pass — a partial look is not a clean bill', () => {
    expect(summarizeVerification([ev('pass'), ev('blocked')]).summary).toBe('verification_blocked')
  })

  it('all passing reports passed', () => {
    expect(summarizeVerification([ev('pass'), ev('pass')]).summary).toBe('verification_passed')
  })

  it('lists the non-passing check keys for the audit record', () => {
    expect(summarizeVerification([ev('pass', 'a'), ev('fail', 'b')]).findings).toEqual(['b:fail'])
  })
})
