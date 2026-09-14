/**
 * Credential health — lib/media/credential-health.ts and "Verifiera nu"
 * (POST /api/media/social-accounts/verify), project-scoped (2026-09-14).
 *
 * One verdict serves the daily health cron and the operator's manual check: the
 * platform is asked, with the project's OWN credential, whether it is still the
 * project's bound account. A match records the platform's attestation on the binding
 * (with the name it gave — for Facebook, the page's name); every outcome is written
 * to social_credential_health as closed codes, keyed by (project, platform).
 *
 * The route takes the same two gates as replacing a credential: the platform operator,
 * then ownership of the named project. The project id is a selector, never a
 * permission, and nothing the route answers can carry a token.
 *
 * The operator predicate and project access are real; the session, database, binding
 * store and credential resolution are faked so each outcome can be forced.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BROKEN_HEALTH,
  expiryHealthStatus,
  refusalHealthStatus,
  verifyBindingHealth,
  writeCredentialHealth,
} from '@/lib/media/credential-health'
import type { CredentialRefusal } from '@/lib/media/social-credentials'

const ME = '0f8a2c4e-6b1d-4e3f-9a5c-7d2e8b1f4a6c'
const SOMEONE_ELSE = '9d3b7a51-2c4e-4f6a-8b1d-3e5f7a9c1b2d'
const OPERATOR_EMAIL = 'operator@omnira.test'
const PROJECT = '33333333-3333-4333-8333-333333333333'
const SIBLING = '44444444-4444-4444-8444-444444444444'
const FOREIGN = '55555555-5555-4555-8555-555555555555'
const IG_ACCOUNT = '17841437027967629'
const PAGE = '1138612202672850'
const CHANNEL = 'UCUM9JDi75ziLssYcGLo8IPA'
const IG_TOKEN = `IGAA${'i'.repeat(60)}`
const PAGE_TOKEN = `EAAP${'p'.repeat(60)}`
const YT_ACCESS = `ya29.${'y'.repeat(60)}`
const DAY = 86_400_000

interface Binding {
  bindingId: string; projectId: string; platform: 'instagram' | 'facebook' | 'youtube'; externalAccountId: string
  accountLabel: string | null; credentialSource: 'project_store' | 'platform_env_transitional'
  verification: 'provider_attested' | 'runtime_evidence'; verifiedAt: string; boundBy: string; boundAt: string
  blockedAt: string | null; blockedReason: string | null
}

let USER: { id: string; email: string | null } | null = null
let PROJECTS: Record<string, unknown>[] = []
let BINDINGS: Binding[] = []
let BINDING_READS: string[] = []
let BINDING_READ_FAILS = false
let RESOLVED: string[] = []
let ANSWERS: Record<string, unknown> = {}
let RESOLVER_THROWS = false
let ATTESTED: { bindingId: string; label: string | null }[] = []
let UPSERTS: { table: string; row: Record<string, unknown>; options: unknown }[] = []
let UPSERT_ERROR: unknown = null
let READS: string[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: USER } }) } }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      READS.push(table)
      let rows: Record<string, unknown>[] = table === 'projects' ? PROJECTS.map((r) => ({ ...r })) : []
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q },
        upsert: async (row: Record<string, unknown>, options: unknown) => {
          UPSERTS.push({ table, row, options })
          if (UPSERT_ERROR === 'throw') throw new Error('network')
          return { error: UPSERT_ERROR }
        },
        then: (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok, err),
      }
      return q
    },
  }),
}))

vi.mock('@/lib/media/social-bindings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/social-bindings')>()),
  readActiveBinding: async (projectId: string, platform: string) => {
    BINDING_READS.push(`${platform}:${projectId}`)
    if (BINDING_READ_FAILS) return { ok: false }
    return { ok: true, binding: BINDINGS.find((b) => b.projectId === projectId && b.platform === platform) ?? null }
  },
  recordProviderAttestation: async (binding: { bindingId: string }, label: string | null) => {
    ATTESTED.push({ bindingId: binding.bindingId, label })
    return true
  },
}))

vi.mock('@/lib/media/social-credentials', () => {
  const resolveFor = (platform: string) => async (projectId: string) => {
    RESOLVED.push(`${platform}:${projectId}`)
    if (RESOLVER_THROWS) throw new Error(`boom ${IG_TOKEN}`)
    return ANSWERS[platform]
  }
  return {
    resolveInstagramCredential: resolveFor('instagram'),
    resolveFacebookCredential: resolveFor('facebook'),
    resolveYouTubeCredential: resolveFor('youtube'),
  }
})

function binding(projectId: string, platform: Binding['platform'], externalAccountId: string, seq: number): Binding {
  return {
    bindingId: `77777777-7777-4777-8777-00000000000${seq}`, projectId, platform, externalAccountId, accountLabel: null,
    credentialSource: platform === 'youtube' ? 'platform_env_transitional' : 'project_store',
    verification: 'runtime_evidence', verifiedAt: '2026-09-14T07:00:07.000Z',
    boundBy: 'migration:social_account_bindings_the_prompt_evidence', boundAt: '2026-09-14T12:00:00.000Z',
    blockedAt: null, blockedReason: null,
  }
}
const bindingOf = (platform: string) => BINDINGS.find((b) => b.projectId === PROJECT && b.platform === platform)!
const inDays = (days: number) => new Date(Date.now() + days * DAY)

const ORIGINAL_ENV = { operators: process.env.PLATFORM_OPERATOR_EMAILS, brevo: process.env.BREVO_ADMIN_EMAIL }

beforeEach(() => {
  vi.resetModules()
  USER = { id: ME, email: OPERATOR_EMAIL }
  PROJECTS = [{ id: PROJECT, owner_id: ME }, { id: SIBLING, owner_id: ME }, { id: FOREIGN, owner_id: SOMEONE_ELSE }]
  BINDINGS = [
    binding(PROJECT, 'instagram', IG_ACCOUNT, 1),
    binding(PROJECT, 'facebook', PAGE, 2),
    binding(PROJECT, 'youtube', CHANNEL, 3),
    binding(FOREIGN, 'facebook', '2000000000000002', 4),
  ]
  BINDING_READS = []
  BINDING_READ_FAILS = false
  RESOLVED = []
  RESOLVER_THROWS = false
  ATTESTED = []
  UPSERTS = []
  UPSERT_ERROR = null
  READS = []
  ANSWERS = {
    instagram: {
      ok: true, binding: bindingOf('instagram'),
      credential: { platform: 'instagram', projectId: PROJECT, bindingId: bindingOf('instagram').bindingId, accountId: IG_ACCOUNT,
        username: 'theprompt.news', token: IG_TOKEN, apiBase: 'https://graph.instagram.com/v21.0', isIgLogin: true, expiresAt: inDays(60) },
    },
    facebook: {
      ok: true, binding: bindingOf('facebook'),
      credential: { platform: 'facebook', projectId: PROJECT, bindingId: bindingOf('facebook').bindingId, pageId: PAGE,
        pageName: 'The Prompt', pageToken: PAGE_TOKEN, expiresAt: null },
    },
    youtube: {
      ok: true, binding: bindingOf('youtube'),
      credential: { platform: 'youtube', projectId: PROJECT, bindingId: bindingOf('youtube').bindingId, channelId: CHANNEL,
        channelTitle: null, accessToken: YT_ACCESS, channelVerifiedBeforeUpload: false },
    },
  }
  process.env.PLATFORM_OPERATOR_EMAILS = OPERATOR_EMAIL
  delete process.env.BREVO_ADMIN_EMAIL
})

afterAll(() => {
  if (ORIGINAL_ENV.operators === undefined) delete process.env.PLATFORM_OPERATOR_EMAILS
  else process.env.PLATFORM_OPERATOR_EMAILS = ORIGINAL_ENV.operators
  if (ORIGINAL_ENV.brevo === undefined) delete process.env.BREVO_ADMIN_EMAIL
  else process.env.BREVO_ADMIN_EMAIL = ORIGINAL_ENV.brevo
})

// ─────────────────────────────────────────────────────────────────────────────

describe('credential health · the verdict vocabulary', () => {
  it('a refusal becomes the status a person can act on — or verification_failed when nobody can', () => {
    const cases: [CredentialRefusal, string][] = [
      ['credential_invalid', 'expired'],
      ['account_mismatch', 'account_mismatch'],
      ['binding_blocked', 'binding_blocked'],
      ['credential_missing', 'credential_missing'],
      ['project_required', 'verification_failed'],
      ['binding_missing', 'verification_failed'],
      ['binding_unreadable', 'verification_failed'],
      ['credential_unreadable', 'verification_failed'],
      ['provider_unavailable', 'verification_failed'],
    ]
    for (const [refusal, status] of cases) expect(refusalHealthStatus(refusal), refusal).toBe(status)
    expect([...BROKEN_HEALTH].sort()).toEqual(['account_mismatch', 'binding_blocked', 'credential_missing', 'expired'])
  })

  it('expiry: none recorded is ok, 14 days or fewer is a warning, none left is expired', () => {
    expect(expiryHealthStatus(null)).toBe('ok')
    expect(expiryHealthStatus(15)).toBe('ok')
    expect(expiryHealthStatus(14)).toBe('warning')
    expect(expiryHealthStatus(1)).toBe('warning')
    expect(expiryHealthStatus(0)).toBe('expired')
    expect(expiryHealthStatus(-3)).toBe('expired')
  })
})

describe('credential health · verifyBindingHealth asks with the binding’s own project', () => {
  it('Instagram: confirmed — the attestation is recorded with the username, and the expiry decides the status', async () => {
    const verdict = await verifyBindingHealth(bindingOf('instagram'))
    expect(RESOLVED).toEqual([`instagram:${PROJECT}`])
    expect(verdict).toEqual({
      status: 'ok', identityVerified: true, verifiedAccountId: IG_ACCOUNT, accountLabel: 'theprompt.news',
      expiresAt: expect.any(Date), daysLeft: 60, refusal: null,
    })
    expect(ATTESTED).toEqual([{ bindingId: bindingOf('instagram').bindingId, label: 'theprompt.news' }])
    ;(ANSWERS.instagram as { credential: { expiresAt: Date } }).credential.expiresAt = inDays(6)
    expect(await verifyBindingHealth(bindingOf('instagram'))).toMatchObject({ status: 'warning', daysLeft: 6 })
  })

  it('Facebook: confirmed — the verified page’s name is what the attestation records', async () => {
    expect(await verifyBindingHealth(bindingOf('facebook'))).toEqual({
      status: 'ok', identityVerified: true, verifiedAccountId: PAGE, accountLabel: 'The Prompt', expiresAt: null, daysLeft: null, refusal: null,
    })
    expect(ATTESTED).toEqual([{ bindingId: bindingOf('facebook').bindingId, label: 'The Prompt' }])
  })

  it('a refusal is recorded as a status only — no attestation, no account claimed', async () => {
    ANSWERS.instagram = { ok: false, refusal: 'account_mismatch', binding: bindingOf('instagram') }
    expect(await verifyBindingHealth(bindingOf('instagram'))).toEqual({
      status: 'account_mismatch', identityVerified: false, verifiedAccountId: null, accountLabel: null, expiresAt: null, daysLeft: null, refusal: 'account_mismatch',
    })
    expect(ATTESTED).toEqual([])
  })

  it('YouTube Y1: a working upload credential is ok, but the channel is confirmed only when its scope could read it', async () => {
    expect(await verifyBindingHealth(bindingOf('youtube'))).toEqual({
      status: 'ok', identityVerified: false, verifiedAccountId: null, accountLabel: null, expiresAt: null, daysLeft: null, refusal: null,
    })
    expect(ATTESTED).toEqual([])
    const youtube = ANSWERS.youtube as { credential: { channelVerifiedBeforeUpload: boolean; channelTitle: string | null } }
    youtube.credential.channelVerifiedBeforeUpload = true
    youtube.credential.channelTitle = 'The Prompt'
    expect(await verifyBindingHealth(bindingOf('youtube'))).toMatchObject({ identityVerified: true, verifiedAccountId: CHANNEL, accountLabel: 'The Prompt' })
    expect(ATTESTED).toEqual([{ bindingId: bindingOf('youtube').bindingId, label: 'The Prompt' }])
  })

  it('an exception is verification_failed, and carries nothing of what was thrown', async () => {
    RESOLVER_THROWS = true
    const verdict = await verifyBindingHealth(bindingOf('facebook'))
    expect(verdict).toMatchObject({ status: 'verification_failed', identityVerified: false, refusal: 'provider_unavailable' })
    expect(JSON.stringify(verdict)).not.toContain(IG_TOKEN)
  })
})

describe('credential health · writeCredentialHealth records closed codes for (project, platform)', () => {
  it('the row is the binding’s project, platform and binding, the verdict’s codes and bounded ids — nothing else', async () => {
    const verdict = await verifyBindingHealth(bindingOf('instagram'))
    expect(await writeCredentialHealth(bindingOf('instagram'), verdict, '2026-09-15T06:15:00.000Z', 14)).toBe(true)
    expect(UPSERTS).toEqual([{
      table: 'social_credential_health',
      options: { onConflict: 'project_id,platform' },
      row: {
        project_id: PROJECT, platform: 'instagram', binding_id: bindingOf('instagram').bindingId, status: 'ok',
        identity_verified: true, verified_account_id: IG_ACCOUNT, checked_at: '2026-09-15T06:15:00.000Z',
        expires_at: expect.stringMatching(/Z$/), days_left: 60, last_warned_threshold: 14,
      },
    }])
    expect(JSON.stringify(UPSERTS)).not.toContain(IG_TOKEN)
    expect(JSON.stringify(UPSERTS)).not.toContain('theprompt.news')
  })

  it('a manual check leaves the cron’s warning deduplication alone; a failed write is false, never a throw', async () => {
    const verdict = await verifyBindingHealth(bindingOf('facebook'))
    await writeCredentialHealth(bindingOf('facebook'), verdict, '2026-09-15T06:15:00.000Z')
    expect(Object.keys(UPSERTS[0].row)).not.toContain('last_warned_threshold')
    UPSERT_ERROR = { code: '42501' }
    expect(await writeCredentialHealth(bindingOf('facebook'), verdict, '2026-09-15T06:15:00.000Z')).toBe(false)
    UPSERT_ERROR = 'throw'
    expect(await writeCredentialHealth(bindingOf('facebook'), verdict, '2026-09-15T06:15:00.000Z')).toBe(false)
  })
})

describe('credential health · POST /api/media/social-accounts/verify', () => {
  async function verify(body: unknown) {
    const { POST } = await import('@/app/api/media/social-accounts/verify/route')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const res = await POST(new Request('http://localhost/api/media/social-accounts/verify', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }))
      const text = await res.text()
      return { status: res.status, text, json: text ? JSON.parse(text) : null }
    } finally {
      warn.mockRestore()
    }
  }
  const nothingTouched = () => {
    expect(BINDING_READS).toEqual([])
    expect(RESOLVED).toEqual([])
    expect(UPSERTS).toEqual([])
    expect(ATTESTED).toEqual([])
  }

  it('unauthenticated is 401, and a signed-in owner who is not the platform operator is 403 — before anything is read', async () => {
    USER = null
    expect((await verify({ project_id: PROJECT, platform: 'facebook' })).status).toBe(401)
    USER = { id: ME, email: 'owner-not-operator@omnira.test' }
    const denied = await verify({ project_id: PROJECT, platform: 'facebook' })
    expect(denied.status).toBe(403)
    expect(denied.json).toEqual({ error: 'Forbidden', denied: 'platform_operator_required' })
    expect(READS).toEqual([])
    nothingTouched()
  })

  it('the project is explicit and the platform a closed set — otherwise 400, before any read', async () => {
    for (const body of [
      { platform: 'facebook' },
      { project_id: 'ai-media-automation', platform: 'facebook' },
      { project_id: PROJECT },
      { project_id: PROJECT, platform: 'tiktok' },
      [{ project_id: PROJECT, platform: 'facebook' }],
      null,
    ]) {
      expect((await verify(body)).status, JSON.stringify(body)).toBe(400)
    }
    expect(READS).toEqual([])
    nothingTouched()
  })

  it('a project the operator does not own is 403 — its binding is never read, its credential never asked', async () => {
    const res = await verify({ project_id: FOREIGN, platform: 'facebook' })
    expect(res.status).toBe(403)
    expect(res.json).toEqual({ error: 'Forbidden' })
    nothingTouched()
  })

  it('an unreadable binding is 503 and no binding is 404 — neither asks a platform or records anything', async () => {
    BINDING_READ_FAILS = true
    expect(await verify({ project_id: PROJECT, platform: 'instagram' })).toMatchObject({ status: 503, json: { ok: false, refusal: 'binding_unreadable' } })
    BINDING_READ_FAILS = false
    expect(await verify({ project_id: SIBLING, platform: 'instagram' })).toMatchObject({ status: 404, json: { ok: false, refusal: 'binding_missing' } })
    expect(RESOLVED).toEqual([])
    expect(UPSERTS).toEqual([])
  })

  it('confirmed: the verified Facebook page by name, recorded for that project — never a token', async () => {
    const res = await verify({ project_id: PROJECT, platform: 'facebook' })
    expect(res.status).toBe(200)
    expect(res.json).toEqual({
      ok: true, project_id: PROJECT, platform: 'facebook', account: { id: PAGE, label: 'The Prompt' },
      status: 'ok', identity_verified: true, refusal: null, recorded: true,
    })
    expect(BINDING_READS).toEqual([`facebook:${PROJECT}`])
    expect(RESOLVED).toEqual([`facebook:${PROJECT}`])
    expect(UPSERTS.map((u) => [u.row.project_id, u.row.platform, u.row.status])).toEqual([[PROJECT, 'facebook', 'ok']])
    expect(Object.keys(UPSERTS[0].row)).not.toContain('last_warned_threshold')
    for (const secret of [PAGE_TOKEN, IG_TOKEN, YT_ACCESS]) expect(res.text).not.toContain(secret)
  })

  it('a credential that is not the project’s account is answered and recorded as account_mismatch', async () => {
    ANSWERS.instagram = { ok: false, refusal: 'account_mismatch', binding: bindingOf('instagram') }
    const res = await verify({ project_id: PROJECT, platform: 'instagram' })
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ ok: false, status: 'account_mismatch', identity_verified: false, refusal: 'account_mismatch', account: { id: IG_ACCOUNT } })
    expect(UPSERTS[0].row).toMatchObject({ project_id: PROJECT, platform: 'instagram', status: 'account_mismatch', identity_verified: false, verified_account_id: null })
  })

  it('platform trouble is a 503 verification_failed — recorded, and nothing thrown reaches the answer', async () => {
    RESOLVER_THROWS = true
    const res = await verify({ project_id: PROJECT, platform: 'youtube' })
    expect(res.status).toBe(503)
    expect(res.json).toMatchObject({ ok: false, status: 'verification_failed' })
    expect(res.text).not.toContain(IG_TOKEN)
    expect(UPSERTS[0].row).toMatchObject({ project_id: PROJECT, platform: 'youtube', status: 'verification_failed' })
  })
})
