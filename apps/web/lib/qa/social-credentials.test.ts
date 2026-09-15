/**
 * lib/media/social-credentials.ts — the only way to a usable social credential.
 *
 * Owner lock, 2026-09-14: Project → Platform → Verified External Account → Credential,
 * end to end, for every consumer. No default project, no first project, no choice by
 * platform alone, no global Instagram/Facebook environment token, no implicit The
 * Prompt. The project id comes from the resource the operation acts on; when the
 * project, its binding or its credential cannot be proven, the answer is a refusal.
 *
 * Two halves:
 *   · THE RESOLVER, executed. Every link is required and each missing link is its own
 *     refusal; a credential is only ever the named project's own, confirmed by the
 *     platform as the binding's account; YouTube Y1 serves exactly the binding its
 *     transitional credential is attached to.
 *   · THE CODEBASE, read. No consumer reaches a credential any other way.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import {
  confirmYouTubeUploadChannel,
  createCredentialResolver,
  refusalIsPermanent,
  resolveFacebookCredential,
  resolveInstagramCredential,
  resolveYouTubeCredential,
  type CredentialRefusal,
} from '@/lib/media/social-credentials'

const APP = resolve(__dirname, '../..')
const PROMPT = '33333333-3333-4333-8333-333333333333'
const FAMILY = '44444444-4444-4444-8444-444444444444'
const IG_PROMPT = '17841437027967629'
const IG_FAMILY = '17841400000000002'
const PAGE_PROMPT = '1138612202672850'
const CHANNEL = 'UCUM9JDi75ziLssYcGLo8IPA'
const TOKEN_PROMPT_IG = `IGAA${'p'.repeat(60)}`
const TOKEN_FAMILY_IG = `IGAA${'f'.repeat(60)}`
const TOKEN_PROMPT_FB = `EAAB${'p'.repeat(60)}`
const PAGE_TOKEN_PROMPT = `EAAP${'p'.repeat(60)}`
const YT_ACCESS = `ya29.${'y'.repeat(60)}`
const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload'
const READ_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'
const EXPIRES = new Date('2026-11-13T06:00:06.627Z')

interface Binding {
  bindingId: string
  projectId: string
  platform: 'instagram' | 'facebook' | 'youtube'
  externalAccountId: string
  accountLabel: string | null
  credentialSource: 'project_store' | 'platform_env_transitional'
  verification: 'provider_attested' | 'runtime_evidence'
  verifiedAt: string
  boundBy: string
  boundAt: string
  blockedAt: string | null
  blockedReason: string | null
}
type Stored = { accessToken: string; accountId: string | null; expiresAt: Date | null; refreshedAt: Date | null }

let BINDINGS: Binding[] = []
let BINDING_OVERRIDE: Binding | null = null
let BINDING_READ_FAILS = false
let BINDING_READS: string[] = []
let BLOCKED: string[] = []
let STORED: Record<string, Stored | 'unreadable'> = {}
let STORE_READS: string[] = []
let IG_ANSWERS: Record<string, unknown> = {}
let FB_ANSWERS: Record<string, unknown> = {}
let ATTESTATIONS: string[] = []
let GRANT: { clientId: string; clientSecret: string; refreshToken: string } | null = null
let GRANT_READS = 0
let YT_EXCHANGE: unknown = null
let YT_CHANNELS: unknown = null
let OAUTH_CLIENT: { clientId: string; clientSecret: string } | null = null
let OAUTH_CLIENT_READS = 0
let EXCHANGED_GRANTS: unknown[] = []
let bindingSeq = 0

vi.mock('@/lib/media/social-bindings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/social-bindings')>()),
  readActiveBinding: async (projectId: string, platform: string) => {
    BINDING_READS.push(`${platform}:${projectId}`)
    if (BINDING_READ_FAILS) return { ok: false }
    if (BINDING_OVERRIDE) return { ok: true, binding: BINDING_OVERRIDE }
    return { ok: true, binding: BINDINGS.find((b) => b.projectId === projectId && b.platform === platform) ?? null }
  },
  blockBinding: async (bindingId: string) => {
    BLOCKED.push(bindingId)
    return true
  },
}))

vi.mock('@/lib/media/token-store', () => ({
  readStoredCredential: async (projectId: string, platform: string) => {
    STORE_READS.push(`${platform}:${projectId}`)
    const stored = STORED[`${platform}:${projectId}`]
    if (stored === 'unreadable') return { ok: false }
    return { ok: true, credential: stored ?? null }
  },
  storeCredential: async () => { throw new Error('the resolver never stores a credential') },
}))

vi.mock('@/lib/media/social-identity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/social-identity')>()),
  attestInstagramCredential: async (token: string, expected: string | null) => {
    ATTESTATIONS.push(`instagram:${token}:${expected}`)
    return IG_ANSWERS[token] ?? { ok: false, failure: 'credential_invalid' }
  },
  attestFacebookPage: async (token: string, pageId: string) => {
    ATTESTATIONS.push(`facebook:${token}:${pageId}`)
    return FB_ANSWERS[`${token}:${pageId}`] ?? { ok: false, failure: 'account_not_found' }
  },
  exchangeYouTubeGrant: async (grant: { clientId: string }) => {
    ATTESTATIONS.push(`youtube:exchange:${grant.clientId}`)
    EXCHANGED_GRANTS.push({ ...grant })
    return YT_EXCHANGE
  },
  attestYouTubeChannels: async (accessToken: string) => {
    ATTESTATIONS.push(`youtube:channels:${accessToken}`)
    return YT_CHANNELS
  },
}))

vi.mock('@/lib/media/youtube', () => ({
  platformYouTubeGrant: () => {
    GRANT_READS += 1
    return GRANT
  },
  platformYouTubeOAuthClient: () => {
    OAUTH_CLIENT_READS += 1
    return OAUTH_CLIENT
  },
}))

function binding(projectId: string, platform: Binding['platform'], externalAccountId: string, over: Partial<Binding> = {}): Binding {
  bindingSeq += 1
  return {
    bindingId: `77777777-7777-4777-8777-${String(bindingSeq).padStart(12, '0')}`,
    projectId, platform, externalAccountId,
    accountLabel: null,
    credentialSource: platform === 'youtube' ? 'platform_env_transitional' : 'project_store',
    verification: 'runtime_evidence',
    verifiedAt: '2026-09-14T07:00:07.000Z',
    boundBy: 'migration:social_account_bindings_the_prompt_evidence',
    boundAt: '2026-09-14T12:00:00.000Z',
    blockedAt: null,
    blockedReason: null,
    ...over,
  }
}
const igIdentity = (accountId: string, username: string | null) =>
  ({ ok: true, accountId, username, apiBase: 'https://graph.instagram.com/v21.0', isIgLogin: true })
const bindingOf = (projectId: string, platform: string) => BINDINGS.find((b) => b.projectId === projectId && b.platform === platform)!

beforeEach(() => {
  bindingSeq = 0
  BINDINGS = [
    binding(PROMPT, 'instagram', IG_PROMPT, { accountLabel: 'theprompt.news' }),
    binding(PROMPT, 'facebook', PAGE_PROMPT),
    binding(PROMPT, 'youtube', CHANNEL),
    binding(FAMILY, 'instagram', IG_FAMILY),
  ]
  BINDING_OVERRIDE = null
  BINDING_READ_FAILS = false
  BINDING_READS = []
  BLOCKED = []
  STORED = {
    [`instagram:${PROMPT}`]: { accessToken: TOKEN_PROMPT_IG, accountId: null, expiresAt: EXPIRES, refreshedAt: null },
    [`facebook:${PROMPT}`]: { accessToken: TOKEN_PROMPT_FB, accountId: PAGE_PROMPT, expiresAt: null, refreshedAt: null },
    [`instagram:${FAMILY}`]: { accessToken: TOKEN_FAMILY_IG, accountId: IG_FAMILY, expiresAt: null, refreshedAt: null },
  }
  STORE_READS = []
  IG_ANSWERS = {
    [TOKEN_PROMPT_IG]: igIdentity(IG_PROMPT, 'theprompt.news'),
    [TOKEN_FAMILY_IG]: igIdentity(IG_FAMILY, 'familjestunden'),
  }
  FB_ANSWERS = {
    [`${TOKEN_PROMPT_FB}:${PAGE_PROMPT}`]: { ok: true, pageId: PAGE_PROMPT, pageName: 'The Prompt', pageToken: PAGE_TOKEN_PROMPT },
  }
  ATTESTATIONS = []
  GRANT = { clientId: 'platform-client', clientSecret: 'platform-secret', refreshToken: 'platform-refresh' }
  GRANT_READS = 0
  YT_EXCHANGE = { ok: true, accessToken: YT_ACCESS, scopes: [UPLOAD_SCOPE] }
  YT_CHANNELS = { ok: true, channels: [{ channelId: CHANNEL, title: 'The Prompt' }] }
})

const RESOLVERS = [resolveInstagramCredential, resolveFacebookCredential, resolveYouTubeCredential] as const

// ─────────────────────────────────────────────────────────────────────────────

describe('social credentials · every link in the relation is required', () => {
  it('no server-derived project id, no credential — and nothing is read to find one', async () => {
    for (const projectId of [undefined, null, '', 'ai-media-automation', 42, { id: PROMPT }, PROMPT.replace(/-/g, '')]) {
      for (const resolveOne of RESOLVERS) {
        expect(await resolveOne(projectId), String(projectId)).toEqual({ ok: false, refusal: 'project_required', binding: null })
      }
    }
    expect({ BINDING_READS, STORE_READS, ATTESTATIONS, GRANT_READS }).toEqual({ BINDING_READS: [], STORE_READS: [], ATTESTATIONS: [], GRANT_READS: 0 })
  })

  it('a project without a binding on the platform gets nothing — not another project’s credential, not the platform’s', async () => {
    expect(await resolveFacebookCredential(FAMILY)).toEqual({ ok: false, refusal: 'binding_missing', binding: null })
    expect(await resolveYouTubeCredential(FAMILY)).toEqual({ ok: false, refusal: 'binding_missing', binding: null })
    expect(STORE_READS).toEqual([])
    expect(ATTESTATIONS).toEqual([])
    expect(GRANT_READS, 'the platform YouTube credential was consulted for a project without a YouTube binding').toBe(0)
  })

  it('an unreadable binding is unreadable, never “no binding”, and nothing behind it is read', async () => {
    BINDING_READ_FAILS = true
    for (const resolveOne of RESOLVERS) {
      expect(await resolveOne(PROMPT)).toEqual({ ok: false, refusal: 'binding_unreadable', binding: null })
    }
    expect({ STORE_READS, ATTESTATIONS, GRANT_READS }).toEqual({ STORE_READS: [], ATTESTATIONS: [], GRANT_READS: 0 })
  })

  it('a binding that is not the named project’s own is refused', async () => {
    BINDING_OVERRIDE = binding(FAMILY, 'instagram', IG_FAMILY)
    expect(await resolveInstagramCredential(PROMPT)).toEqual({ ok: false, refusal: 'binding_unreadable', binding: null })
    BINDING_OVERRIDE = binding(PROMPT, 'facebook', PAGE_PROMPT)
    expect(await resolveInstagramCredential(PROMPT)).toEqual({ ok: false, refusal: 'binding_unreadable', binding: null })
    expect(STORE_READS).toEqual([])
  })

  it('a blocked binding stops everything behind it', async () => {
    for (const platform of ['instagram', 'youtube'] as const) {
      const b = bindingOf(PROMPT, platform)
      b.blockedAt = '2026-09-14T18:05:00.000Z'
      b.blockedReason = 'account_mismatch'
    }
    expect(await resolveInstagramCredential(PROMPT)).toMatchObject({ ok: false, refusal: 'binding_blocked', binding: { bindingId: bindingOf(PROMPT, 'instagram').bindingId } })
    expect(await resolveYouTubeCredential(PROMPT)).toMatchObject({ ok: false, refusal: 'binding_blocked' })
    expect({ STORE_READS, ATTESTATIONS, GRANT_READS }).toEqual({ STORE_READS: [], ATTESTATIONS: [], GRANT_READS: 0 })
  })

  it('a binding without its credential is credential_missing; an unreadable credential is credential_unreadable', async () => {
    delete STORED[`instagram:${PROMPT}`]
    expect(await resolveInstagramCredential(PROMPT)).toMatchObject({ ok: false, refusal: 'credential_missing', binding: { projectId: PROMPT } })
    STORED[`facebook:${PROMPT}`] = 'unreadable'
    expect(await resolveFacebookCredential(PROMPT)).toMatchObject({ ok: false, refusal: 'credential_unreadable' })
    expect(ATTESTATIONS).toEqual([])
  })

  it('a binding whose credential does not live in the project’s own store never reads a stored credential', async () => {
    bindingOf(PROMPT, 'instagram').credentialSource = 'platform_env_transitional'
    expect(await resolveInstagramCredential(PROMPT)).toMatchObject({ ok: false, refusal: 'credential_missing' })
    expect(STORE_READS).toEqual([])
    expect(GRANT_READS).toBe(0)
  })

  it('Instagram: the stored credential is used only after Instagram confirms it is the binding’s account', async () => {
    const resolved = await resolveInstagramCredential(PROMPT)
    expect(resolved).toEqual({
      ok: true,
      binding: bindingOf(PROMPT, 'instagram'),
      credential: {
        platform: 'instagram', projectId: PROMPT, bindingId: bindingOf(PROMPT, 'instagram').bindingId,
        accountId: IG_PROMPT, username: 'theprompt.news', token: TOKEN_PROMPT_IG,
        apiBase: 'https://graph.instagram.com/v21.0', isIgLogin: true, expiresAt: EXPIRES,
      },
    })
    expect(STORE_READS).toEqual([`instagram:${PROMPT}`])
    expect(ATTESTATIONS).toEqual([`instagram:${TOKEN_PROMPT_IG}:${IG_PROMPT}`])

    IG_ANSWERS[TOKEN_PROMPT_IG] = igIdentity(IG_FAMILY, 'familjestunden')
    expect(await resolveInstagramCredential(PROMPT)).toMatchObject({ ok: false, refusal: 'account_mismatch' })
  })

  it('what the platform says maps onto refusals: invalid stays invalid, trouble stays retryable, a missing or ambiguous account is a mismatch', async () => {
    for (const [failure, refusal] of [
      ['credential_invalid', 'credential_invalid'],
      ['provider_unavailable', 'provider_unavailable'],
      ['account_not_found', 'account_mismatch'],
      ['account_ambiguous', 'account_mismatch'],
    ] as const) {
      IG_ANSWERS[TOKEN_PROMPT_IG] = { ok: false, failure }
      expect(await resolveInstagramCredential(PROMPT), failure).toMatchObject({ ok: false, refusal })
    }
  })

  it('Facebook: Meta confirms the binding’s page, and the dispatch token is the page’s own — not the stored credential', async () => {
    const resolved = await resolveFacebookCredential(PROMPT)
    expect(resolved).toMatchObject({
      ok: true,
      credential: { platform: 'facebook', projectId: PROMPT, pageId: PAGE_PROMPT, pageName: 'The Prompt', pageToken: PAGE_TOKEN_PROMPT, expiresAt: null },
    })
    expect(ATTESTATIONS).toEqual([`facebook:${TOKEN_PROMPT_FB}:${PAGE_PROMPT}`])
    FB_ANSWERS[`${TOKEN_PROMPT_FB}:${PAGE_PROMPT}`] = { ok: true, pageId: '2000000000000002', pageName: 'Another', pageToken: PAGE_TOKEN_PROMPT }
    expect(await resolveFacebookCredential(PROMPT)).toMatchObject({ ok: false, refusal: 'account_mismatch' })
  })
})

describe('social credentials · one project’s credential never serves another', () => {
  it('each project resolves its own stored credential against its own binding', async () => {
    const prompt = await resolveInstagramCredential(PROMPT)
    const family = await resolveInstagramCredential(FAMILY)
    expect(prompt).toMatchObject({ ok: true, credential: { projectId: PROMPT, accountId: IG_PROMPT, token: TOKEN_PROMPT_IG } })
    expect(family).toMatchObject({ ok: true, credential: { projectId: FAMILY, accountId: IG_FAMILY, token: TOKEN_FAMILY_IG } })
    expect(STORE_READS).toEqual([`instagram:${PROMPT}`, `instagram:${FAMILY}`])
  })

  it('a project with a binding but no credential of its own is refused — while another project holds a working one', async () => {
    delete STORED[`instagram:${FAMILY}`]
    expect(await resolveInstagramCredential(FAMILY)).toMatchObject({ ok: false, refusal: 'credential_missing' })
    expect(STORE_READS).toEqual([`instagram:${FAMILY}`])
    expect(ATTESTATIONS).toEqual([])
  })

  it('another project’s credential stored under this project is refused: the platform names the other account', async () => {
    STORED[`instagram:${FAMILY}`] = { accessToken: TOKEN_PROMPT_IG, accountId: IG_FAMILY, expiresAt: null, refreshedAt: null }
    expect(await resolveInstagramCredential(FAMILY)).toMatchObject({ ok: false, refusal: 'account_mismatch' })
    expect(ATTESTATIONS).toEqual([`instagram:${TOKEN_PROMPT_IG}:${IG_FAMILY}`])
  })
})

describe('social credentials · YouTube Y1 — the platform’s transitional credential serves one binding', () => {
  it('the attached binding gets the credential; with upload scope alone the channel is confirmed after the upload instead', async () => {
    expect(await resolveYouTubeCredential(PROMPT)).toEqual({
      ok: true,
      binding: bindingOf(PROMPT, 'youtube'),
      credential: {
        platform: 'youtube', projectId: PROMPT, bindingId: bindingOf(PROMPT, 'youtube').bindingId,
        channelId: CHANNEL, channelTitle: null, accessToken: YT_ACCESS, channelVerifiedBeforeUpload: false,
      },
    })
    expect(ATTESTATIONS).toEqual(['youtube:exchange:platform-client'])
  })

  it('with a read scope the channel is verified before any upload, and another channel is refused', async () => {
    YT_EXCHANGE = { ok: true, accessToken: YT_ACCESS, scopes: [UPLOAD_SCOPE, READ_SCOPE] }
    expect(await resolveYouTubeCredential(PROMPT)).toMatchObject({
      ok: true, credential: { channelId: CHANNEL, channelTitle: 'The Prompt', channelVerifiedBeforeUpload: true },
    })
    expect(ATTESTATIONS).toEqual(['youtube:exchange:platform-client', `youtube:channels:${YT_ACCESS}`])
    YT_CHANNELS = { ok: true, channels: [{ channelId: 'UCsomeoneElse0000000000', title: 'Someone' }] }
    expect(await resolveYouTubeCredential(PROMPT)).toMatchObject({ ok: false, refusal: 'account_mismatch' })
    YT_CHANNELS = { ok: false, failure: 'provider_unavailable' }
    expect(await resolveYouTubeCredential(PROMPT)).toMatchObject({ ok: false, refusal: 'provider_unavailable' })
  })

  it('the Vercel credential is never borrowed: a project-store binding without its own connection, or a missing grant, is credential_missing', async () => {
    BINDINGS.push(binding(FAMILY, 'youtube', 'UCfamily000000000000000', { credentialSource: 'project_store' }))
    expect(await resolveYouTubeCredential(FAMILY)).toMatchObject({ ok: false, refusal: 'credential_missing' })
    expect(GRANT_READS).toBe(0)
    GRANT = null
    expect(await resolveYouTubeCredential(PROMPT)).toMatchObject({ ok: false, refusal: 'credential_missing' })
    expect(ATTESTATIONS).toEqual([])
    GRANT = { clientId: 'platform-client', clientSecret: 'platform-secret', refreshToken: 'platform-refresh' }
    YT_EXCHANGE = { ok: false, failure: 'credential_invalid' }
    expect(await resolveYouTubeCredential(PROMPT)).toMatchObject({ ok: false, refusal: 'credential_invalid' })
  })
})

describe('social credentials · YouTube project store (Y2a) — the project’s own connection, its channel verified before upload', () => {
  const CHANNEL_FAMILY = 'UCfamily000000000000000'
  const REFRESH_FAMILY = `1//${'f'.repeat(60)}`
  const REFRESH_PROMPT = `1//${'p'.repeat(60)}`
  const ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/yt-analytics.readonly'
  const connect = () => {
    BINDINGS.push(binding(FAMILY, 'youtube', CHANNEL_FAMILY, { credentialSource: 'project_store', verification: 'provider_attested' }))
    STORED[`youtube:${FAMILY}`] = { accessToken: REFRESH_FAMILY, accountId: CHANNEL_FAMILY, expiresAt: null, refreshedAt: null }
    OAUTH_CLIENT = { clientId: 'platform-client', clientSecret: 'platform-secret' }
    OAUTH_CLIENT_READS = 0
    EXCHANGED_GRANTS = []
    YT_EXCHANGE = { ok: true, accessToken: YT_ACCESS, scopes: [UPLOAD_SCOPE, READ_SCOPE, ANALYTICS_SCOPE] }
    YT_CHANNELS = { ok: true, channels: [{ channelId: CHANNEL_FAMILY, title: 'Familje-Stunden' }] }
  }

  it('the project’s own stored connection is exchanged with the platform’s OAuth client, and its channel is confirmed before any upload', async () => {
    connect()
    expect(await resolveYouTubeCredential(FAMILY)).toMatchObject({
      ok: true,
      credential: {
        platform: 'youtube', projectId: FAMILY, channelId: CHANNEL_FAMILY, channelTitle: 'Familje-Stunden',
        accessToken: YT_ACCESS, channelVerifiedBeforeUpload: true,
      },
    })
    expect(EXCHANGED_GRANTS).toEqual([{ clientId: 'platform-client', clientSecret: 'platform-secret', refreshToken: REFRESH_FAMILY }])
    expect(STORE_READS).toContain(`youtube:${FAMILY}`)
    expect(ATTESTATIONS).toEqual(['youtube:exchange:platform-client', `youtube:channels:${YT_ACCESS}`])
    expect(GRANT_READS).toBe(0)
  })

  it('no fallback: without its own connection a project gets nothing — never the Vercel credential, never another project’s connection', async () => {
    connect()
    delete STORED[`youtube:${FAMILY}`]
    STORED[`youtube:${PROMPT}`] = { accessToken: REFRESH_PROMPT, accountId: CHANNEL, expiresAt: null, refreshedAt: null }
    expect(await resolveYouTubeCredential(FAMILY)).toMatchObject({ ok: false, refusal: 'credential_missing' })
    expect(STORE_READS).toEqual([`youtube:${FAMILY}`])
    expect({ GRANT_READS, EXCHANGED_GRANTS, ATTESTATIONS }).toEqual({ GRANT_READS: 0, EXCHANGED_GRANTS: [], ATTESTATIONS: [] })
  })

  it('the transitional binding never reads a stored connection, even when one is stored for its project', async () => {
    connect()
    YT_EXCHANGE = { ok: true, accessToken: YT_ACCESS, scopes: [UPLOAD_SCOPE] }
    STORED[`youtube:${PROMPT}`] = { accessToken: REFRESH_PROMPT, accountId: CHANNEL, expiresAt: null, refreshedAt: null }
    expect(await resolveYouTubeCredential(PROMPT)).toMatchObject({ ok: true, credential: { projectId: PROMPT, channelId: CHANNEL } })
    expect(STORE_READS).toEqual([])
    expect(OAUTH_CLIENT_READS).toBe(0)
    expect(EXCHANGED_GRANTS).toEqual([GRANT])
  })

  it('a connection that cannot read its channel, answers as another channel, is refused or unreadable is not usable', async () => {
    connect()
    YT_EXCHANGE = { ok: true, accessToken: YT_ACCESS, scopes: [UPLOAD_SCOPE] }
    expect(await resolveYouTubeCredential(FAMILY)).toMatchObject({ ok: false, refusal: 'credential_invalid' })
    YT_EXCHANGE = { ok: true, accessToken: YT_ACCESS, scopes: [UPLOAD_SCOPE, READ_SCOPE, ANALYTICS_SCOPE] }
    YT_CHANNELS = { ok: true, channels: [{ channelId: CHANNEL, title: 'The Prompt' }] }
    expect(await resolveYouTubeCredential(FAMILY)).toMatchObject({ ok: false, refusal: 'account_mismatch' })
    YT_CHANNELS = { ok: false, failure: 'provider_unavailable' }
    expect(await resolveYouTubeCredential(FAMILY)).toMatchObject({ ok: false, refusal: 'provider_unavailable' })
    YT_EXCHANGE = { ok: false, failure: 'credential_invalid' }
    expect(await resolveYouTubeCredential(FAMILY)).toMatchObject({ ok: false, refusal: 'credential_invalid' })
    STORED[`youtube:${FAMILY}`] = 'unreadable'
    expect(await resolveYouTubeCredential(FAMILY)).toMatchObject({ ok: false, refusal: 'credential_unreadable' })
    STORED[`youtube:${FAMILY}`] = { accessToken: REFRESH_FAMILY, accountId: CHANNEL_FAMILY, expiresAt: null, refreshedAt: null }
    OAUTH_CLIENT = null
    expect(await resolveYouTubeCredential(FAMILY)).toMatchObject({ ok: false, refusal: 'credential_missing' })
    expect(GRANT_READS).toBe(0)
  })
})

describe('social credentials · resolved per run, never cached across runs', () => {
  it('a resolver resolves each project and platform once for its own lifetime — and a new run asks again', async () => {
    const run = createCredentialResolver()
    const [first, second] = await Promise.all([run.instagram(PROMPT), run.instagram(PROMPT)])
    expect(first).toBe(second)
    await run.instagram(FAMILY)
    await run.facebook(PROMPT)
    expect(BINDING_READS).toEqual([`instagram:${PROMPT}`, `instagram:${FAMILY}`, `facebook:${PROMPT}`])
    expect(await run.instagram(FAMILY)).toMatchObject({ credential: { projectId: FAMILY, token: TOKEN_FAMILY_IG } })
    await createCredentialResolver().instagram(PROMPT)
    expect(BINDING_READS.filter((r) => r === `instagram:${PROMPT}`)).toHaveLength(2)
  })
})

describe('social credentials · after a YouTube upload', () => {
  it('an upload YouTube reports on the binding’s channel is confirmed, and nothing is blocked', async () => {
    const resolved = await resolveYouTubeCredential(PROMPT)
    if (!resolved.ok) throw new Error('expected a credential')
    expect(await confirmYouTubeUploadChannel(resolved.credential, CHANNEL)).toEqual({ confirmed: true })
    expect(BLOCKED).toEqual([])
  })

  it('any other channel — or none — blocks the binding, so no later upload can reach the wrong channel', async () => {
    const resolved = await resolveYouTubeCredential(PROMPT)
    if (!resolved.ok) throw new Error('expected a credential')
    for (const uploaded of ['UCsomeoneElse0000000000', null, '', 'not a channel!']) {
      expect(await confirmYouTubeUploadChannel(resolved.credential, uploaded), String(uploaded)).toEqual({ confirmed: false, blocked: true })
    }
    expect(BLOCKED).toEqual(Array(4).fill(bindingOf(PROMPT, 'youtube').bindingId))
  })

  it('only read trouble and provider trouble are retryable; every other refusal needs a person', () => {
    const retryable: CredentialRefusal[] = ['binding_unreadable', 'credential_unreadable', 'provider_unavailable']
    const permanent: CredentialRefusal[] = ['project_required', 'binding_missing', 'binding_blocked', 'credential_missing', 'credential_invalid', 'account_mismatch']
    for (const refusal of retryable) expect(refusalIsPermanent(refusal), refusal).toBe(false)
    for (const refusal of permanent) expect(refusalIsPermanent(refusal), refusal).toBe(true)
  })
})

describe('social credentials · no consumer reaches a credential any other way', () => {
  function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (entry === 'node_modules' || entry === '.next' || entry === 'qa') continue
      if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
    }
    return out
  }
  const FILES = () => ['app', 'components', 'lib'].flatMap((d) => sourceFiles(resolve(APP, d)))
  const rel = (f: string) => relative(APP, f)
  const raw = (f: string) => readFileSync(f, 'utf8')
  const code = (f: string) => raw(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

  it('no deployed code names a retired environment credential or a global account identity', () => {
    for (const name of ['INSTAGRAM_ACCESS_TOKEN', 'FACEBOOK_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID', 'INSTAGRAM_USER_ID',
      'INSTAGRAM_ACCOUNT_ID', 'IG_SELF_USERNAME', 'IG_SELF_ACCOUNT_ID']) {
      expect(FILES().filter((f) => raw(f).includes(name)).map(rel), name).toEqual([])
    }
    // A dynamic environment read could reach any variable; each one that exists is reviewed.
    expect(FILES().filter((f) => /process\.env\[/.test(code(f))).map(rel).sort()).toEqual([
      'lib/bugs/scan.ts', 'lib/media/lambda-render.ts', 'lib/os/settings.ts', 'lib/publishing/client.ts',
    ])
  })

  it('the token store has no platform-only, default-project or environment entry point', () => {
    const store = code(resolve(APP, 'lib/media/token-store.ts'))
    expect([...store.matchAll(/export (?:async function|function|const) (\w+)/g)].map((m) => m[1]).sort())
      .toEqual(['STORED_TOKEN_TYPE', 'readStoredCredential', 'storeCredential'])
    expect(store).toMatch(/export async function readStoredCredential\(projectId: string, platform: StoredSocialPlatform\)/)
    expect(store).toMatch(/export async function storeCredential\(\s*projectId: string, platform: StoredSocialPlatform,/)
    expect(store).not.toMatch(/process\.env|slug|ai-media-automation|\.limit\(1\)/)
    const importers = FILES().filter((f) => /from '(@\/lib\/media|\.)\/token-store'/.test(raw(f)))
    for (const f of importers) expect(code(f), rel(f)).not.toMatch(/\b(getToken|setToken)\b/)
  })

  it('every credential resolution names the project of the resource it acts on — never a constant, slug or default', () => {
    const CALL = /\b(resolve(?:Instagram|Facebook|YouTube)Credential|credentials\.(?:instagram|facebook|youtube))\(([^)]*)\)/g
    const calls: [string, string][] = []
    for (const f of FILES()) {
      if (rel(f) === 'lib/media/social-credentials.ts') continue
      for (const m of code(f).matchAll(CALL)) calls.push([rel(f), m[2].trim()])
    }
    expect(calls.length).toBeGreaterThanOrEqual(20)
    for (const [file, arg] of calls) {
      expect(arg, `${file} resolves a credential for "${arg}"`).toMatch(/^(script\.project_id|s\.project_id|projectId|project\.id|binding\.projectId)$/)
    }
    const resolving = FILES().filter((f) => /\b(resolve(?:Instagram|Facebook|YouTube)Credential|createCredentialResolver)\(/.test(code(f)))
    for (const f of resolving) expect(code(f), rel(f)).not.toContain("'ai-media-automation'")
  })

  it('the platform’s YouTube credential is read in one place, for the one binding attached to it', () => {
    expect(FILES().filter((f) => rel(f) !== 'lib/media/youtube.ts' && /\bplatformYouTubeGrant\s*\(/.test(code(f))).map(rel))
      .toEqual(['lib/media/social-credentials.ts'])
    expect(FILES().filter((f) => /process\.env\.YOUTUBE_REFRESH_TOKEN/.test(code(f))).map(rel)).toEqual(['lib/media/youtube.ts'])
  })

  it('no autonomous run picks a project for itself', () => {
    const route = code(resolve(APP, 'app/api/media/cron/autonomous/route.ts'))
    expect(route).toMatch(/if \(!isProjectId\(projectIdParam\)\)/)
    expect(route).toMatch(/from\('projects'\)\.select\('id, name, slug'\)\.eq\('id', projectIdParam\)\.maybeSingle\(\)/)
    expect(route).not.toMatch(/from\('projects'\)[^;]*\.limit\(1\)/)
  })

  it('token_health — keyed by platform alone — is written by nothing, and read only for the heartbeat’s transitional timestamp', () => {
    expect(FILES().filter((f) => /from\(\s*'token_health'\s*\)[\s\S]{0,200}?\.(insert|upsert|update|delete)\(/.test(code(f))).map(rel)).toEqual([])
    expect(FILES().filter((f) => /from\(\s*'token_health'\s*\)/.test(code(f))).map(rel)).toEqual(['app/api/media/cron/heartbeat/route.ts'])
  })

  it('the platform’s YouTube OAuth client is read only by the resolver and the connection routes — and carries no refresh token', () => {
    expect(FILES().filter((f) => rel(f) !== 'lib/media/youtube.ts' && /\bplatformYouTubeOAuthClient\s*\(/.test(code(f))).map(rel).sort()).toEqual([
      'app/api/media/youtube/oauth/callback/route.ts', 'app/api/media/youtube/oauth/start/route.ts', 'lib/media/social-credentials.ts',
    ])
    const youtube = code(resolve(APP, 'lib/media/youtube.ts'))
    const client = youtube.slice(youtube.indexOf('export function platformYouTubeOAuthClient'))
    expect(client.slice(0, client.indexOf('\n}') + 2)).not.toMatch(/REFRESH_TOKEN|refreshToken/)
  })
})
