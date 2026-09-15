/**
 * lib/media/social-identity.ts — what a platform says a social credential belongs to.
 *
 * Every project-scoped credential decision rests on this answer: /api/media/token
 * before anything is stored, lib/media/social-credentials.ts before every dispatch,
 * the health cron every day. The real module runs against a stubbed fetch, and the
 * suite pins four things:
 *
 *   · WHO ANSWERS — which endpoint names the account for which kind of credential;
 *   · HOW THE CREDENTIAL TRAVELS — as an Authorization header, never in a URL
 *     (Google's token endpoint, which requires a form body, is the one exception);
 *   · A CLOSED VOCABULARY — a refused credential, a missing account, an ambiguous one
 *     and provider trouble are told apart, and trouble is never read as a bad
 *     credential, nor a bad credential as trouble;
 *   · NOTHING COMES BACK — no provider message, body or exception text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  attestFacebookPage,
  attestInstagramCredential,
  attestYouTubeChannels,
  canReadOwnChannel,
  displayLabel,
  exchangeYouTubeAuthorizationCode,
  exchangeYouTubeGrant,
  EXTERNAL_ACCOUNT_ID,
} from '@/lib/media/social-identity'

const IG_BASE = 'https://graph.instagram.com/v21.0'
const FB_BASE = 'https://graph.facebook.com/v21.0'
const IG_ACCOUNT = '17841437027967629'
const IG_OTHER = '17841400000000002'
const PAGE = '1138612202672850'
const CHANNEL = 'UCUM9JDi75ziLssYcGLo8IPA'

const IG_TOKEN = `IGAA${'i'.repeat(60)}`
const FB_TOKEN = `EAAB${'f'.repeat(60)}`
const PAGE_TOKEN = `EAAP${'p'.repeat(60)}`
const YT_ACCESS = `ya29.${'a'.repeat(60)}`
const GRANT = { clientId: 'client-id.apps.googleusercontent.com', clientSecret: 'GOCSPX-client-secret', refreshToken: `1//${'r'.repeat(60)}` }
const PROVIDER_TEXT = 'Error validating access token: Session has expired'
const CONTROL = (code: number) => String.fromCharCode(code)

type Reply = { status: number; body: unknown } | Error | 'not-json'
interface Call { url: string; method: string; headers: Record<string, string>; body: string | null }

let CALLS: Call[] = []
let ROUTES: { prefix: string; reply: (call: Call) => Reply }[] = []

const on = (prefix: string, reply: Reply | ((call: Call) => Reply)) => {
  ROUTES.push({ prefix, reply: typeof reply === 'function' ? reply : () => reply })
}
const json = (body: unknown, status = 200): Reply => ({ status, body })
/** A Graph refusal that quotes the credential and the provider's own words back. */
const graphError = (status: number, code: number, credential = IG_TOKEN): Reply =>
  ({ status, body: { error: { message: `${PROVIDER_TEXT} (${credential})`, type: 'OAuthException', code } } })

beforeEach(() => {
  CALLS = []
  ROUTES = []
  vi.stubGlobal('fetch', async (input: unknown, init?: { method?: string; headers?: Record<string, string>; body?: unknown }) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: { ...(init?.headers ?? {}) },
      body: init?.body == null ? null : String(init.body),
    }
    CALLS.push(call)
    const route = ROUTES.find((r) => call.url.startsWith(r.prefix))
    if (!route) throw new Error(`no route for ${call.url}`)
    const reply = route.reply(call)
    if (reply instanceof Error) throw reply
    if (reply === 'not-json') return { status: 200, json: async () => { throw new SyntaxError('Unexpected token <') } }
    return { status: reply.status, json: async () => reply.body }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('social identity · the shapes it hands back', () => {
  it('a display name is kept readable and bounded, and never invented', () => {
    expect(displayLabel('  theprompt.news  ')).toBe('theprompt.news')
    expect(displayLabel(`The${CONTROL(0)} Prompt${CONTROL(0x1f)}${CONTROL(0x7f)}`)).toBe('The Prompt')
    expect(displayLabel('x'.repeat(500))).toHaveLength(200)
    for (const value of [null, undefined, 42, {}, '', '   ', `${CONTROL(0)}${CONTROL(1)}`]) expect(displayLabel(value)).toBeNull()
  })

  it('an account id is a bounded provider identifier — the shape the binding table accepts', () => {
    for (const id of [IG_ACCOUNT, PAGE, CHANNEL]) expect(EXTERNAL_ACCOUNT_ID.test(id)).toBe(true)
    for (const id of ['', 'a'.repeat(65), 'has space', '1;drop', 'kanal-ö', `12${CONTROL(10)}`]) expect(EXTERNAL_ACCOUNT_ID.test(id)).toBe(false)
  })
})

describe('social identity · Instagram', () => {
  it('an Instagram-login credential is its own account — asked at /me, with the credential only in the Authorization header', async () => {
    on(`${IG_BASE}/me`, json({ user_id: IG_ACCOUNT, username: 'theprompt.news' }))
    expect(await attestInstagramCredential(IG_TOKEN, null)).toEqual({
      ok: true, accountId: IG_ACCOUNT, username: 'theprompt.news', apiBase: IG_BASE, isIgLogin: true,
    })
    expect(CALLS).toEqual([{
      url: `${IG_BASE}/me?fields=user_id,username`, method: 'GET', headers: { Authorization: `Bearer ${IG_TOKEN}` }, body: null,
    }])
  })

  it('the platform names the account, whatever the caller expected — comparing is the caller’s job', async () => {
    on(`${IG_BASE}/me`, json({ user_id: IG_OTHER, username: 'someone.else' }))
    expect(await attestInstagramCredential(IG_TOKEN, IG_ACCOUNT)).toMatchObject({ ok: true, accountId: IG_OTHER })
  })

  it('a refused credential is credential_invalid, and provider trouble is provider_unavailable — never the other way round', async () => {
    const cases: [Reply, string][] = [
      [graphError(400, 190), 'credential_invalid'],
      [graphError(401, 102), 'credential_invalid'],
      [json({ error: { message: PROVIDER_TEXT, code: 190 } }), 'credential_invalid'],
      [graphError(500, 2), 'provider_unavailable'],
      [json({ error: { message: 'Too many calls' } }, 429), 'provider_unavailable'],
      ...[-1, 1, 2, 4, 17, 32, 341, 368, 613].map((code): [Reply, string] => [graphError(400, code), 'provider_unavailable']),
      [new Error(`getaddrinfo ENOTFOUND graph.instagram.com ${IG_TOKEN}`), 'provider_unavailable'],
      ['not-json', 'provider_unavailable'],
      [json({ username: 'no-id' }), 'provider_unavailable'],
      [json({ user_id: 'not an id!' }), 'provider_unavailable'],
    ]
    for (const [reply, failure] of cases) {
      ROUTES = []
      on(`${IG_BASE}/me`, reply)
      const label = reply instanceof Error ? reply.message : JSON.stringify(reply)
      expect(await attestInstagramCredential(IG_TOKEN, null), label).toEqual({ ok: false, failure })
    }
  })

  it('a Facebook-login credential reaches the Instagram accounts of its pages — and must reach the expected one', async () => {
    on(`${FB_BASE}/me/accounts?fields=instagram_business_account`, json({ data: [
      { instagram_business_account: { id: IG_OTHER, username: 'someone.else' } },
      { name: 'a page without Instagram' },
      { instagram_business_account: { id: IG_ACCOUNT, username: 'theprompt.news' } },
    ] }))
    expect(await attestInstagramCredential(FB_TOKEN, IG_ACCOUNT)).toEqual({
      ok: true, accountId: IG_ACCOUNT, username: 'theprompt.news', apiBase: FB_BASE, isIgLogin: false,
    })
    expect(CALLS).toEqual([{
      url: `${FB_BASE}/me/accounts?fields=instagram_business_account{id,username}&limit=200`,
      method: 'GET', headers: { Authorization: `Bearer ${FB_TOKEN}` }, body: null,
    }])
    expect(await attestInstagramCredential(FB_TOKEN, '17840000000000009')).toEqual({ ok: false, failure: 'account_not_found' })
  })

  it('without an expected account, a Facebook-login credential must reach exactly one Instagram account', async () => {
    const reach = (...ids: string[]) => {
      ROUTES = []
      on(`${FB_BASE}/me/accounts?fields=instagram_business_account`, json({ data: ids.map((id) => ({ instagram_business_account: { id } })) }))
    }
    reach(IG_ACCOUNT)
    expect(await attestInstagramCredential(FB_TOKEN, null)).toMatchObject({ ok: true, accountId: IG_ACCOUNT })
    reach(IG_ACCOUNT, IG_ACCOUNT)
    expect(await attestInstagramCredential(FB_TOKEN, null)).toMatchObject({ ok: true, accountId: IG_ACCOUNT })
    reach(IG_ACCOUNT, IG_OTHER)
    expect(await attestInstagramCredential(FB_TOKEN, null)).toEqual({ ok: false, failure: 'account_ambiguous' })
    reach()
    expect(await attestInstagramCredential(FB_TOKEN, null)).toEqual({ ok: false, failure: 'account_not_found' })
    reach('not an id!')
    expect(await attestInstagramCredential(FB_TOKEN, null)).toEqual({ ok: false, failure: 'account_not_found' })
  })

  it('a Facebook-login credential the platform refuses is credential_invalid; trouble is provider_unavailable', async () => {
    const cases: [Reply, string][] = [
      [graphError(400, 190, FB_TOKEN), 'credential_invalid'],
      [json({ data: 'not a list' }), 'credential_invalid'],
      [graphError(503, 2, FB_TOKEN), 'provider_unavailable'],
      [graphError(400, 4, FB_TOKEN), 'provider_unavailable'],
      [new Error('socket hang up'), 'provider_unavailable'],
    ]
    for (const [reply, failure] of cases) {
      ROUTES = []
      on(`${FB_BASE}/me/accounts?fields=instagram_business_account`, reply)
      expect(await attestInstagramCredential(FB_TOKEN, IG_ACCOUNT)).toEqual({ ok: false, failure })
    }
  })
})

describe('social identity · Facebook pages', () => {
  it('a user credential reaches the page through /me/accounts, and the page’s own token then names the page itself', async () => {
    on(`${FB_BASE}/me/accounts?fields=id,access_token`, json({ data: [
      { id: '1000000000000009', access_token: `EAAO${'o'.repeat(60)}` },
      { id: PAGE, access_token: PAGE_TOKEN },
    ] }))
    on(`${FB_BASE}/me?fields=id,name`, (call) => call.headers.Authorization === `Bearer ${PAGE_TOKEN}`
      ? json({ id: PAGE, name: 'The Prompt' })
      : graphError(400, 190, FB_TOKEN))
    expect(await attestFacebookPage(FB_TOKEN, PAGE)).toEqual({ ok: true, pageId: PAGE, pageName: 'The Prompt', pageToken: PAGE_TOKEN })
    expect(CALLS.map((c) => [c.url, c.headers.Authorization])).toEqual([
      [`${FB_BASE}/me/accounts?fields=id,access_token&limit=200`, `Bearer ${FB_TOKEN}`],
      [`${FB_BASE}/me?fields=id,name`, `Bearer ${PAGE_TOKEN}`],
    ])
  })

  it('a page credential already is the page: /me/accounts refuses it, and /me decides', async () => {
    on(`${FB_BASE}/me/accounts?fields=id,access_token`, graphError(400, 100, PAGE_TOKEN))
    on(`${FB_BASE}/me?fields=id,name`, json({ id: PAGE, name: 'The Prompt' }))
    expect(await attestFacebookPage(PAGE_TOKEN, PAGE)).toEqual({ ok: true, pageId: PAGE, pageName: 'The Prompt', pageToken: PAGE_TOKEN })
  })

  it('a credential that does not reach the page is account_not_found — it is never handed another page', async () => {
    on(`${FB_BASE}/me/accounts?fields=id,access_token`, json({ data: [{ id: '1000000000000009', access_token: `EAAO${'o'.repeat(60)}` }] }))
    on(`${FB_BASE}/me?fields=id,name`, json({ id: '100000000000001', name: 'A Person' }))
    expect(await attestFacebookPage(FB_TOKEN, PAGE)).toEqual({ ok: false, failure: 'account_not_found' })
  })

  it('an impossible page id is refused without asking anyone', async () => {
    for (const pageId of ['', '1;drop table', 'a'.repeat(65)]) {
      expect(await attestFacebookPage(FB_TOKEN, pageId)).toEqual({ ok: false, failure: 'account_not_found' })
    }
    expect(CALLS).toEqual([])
  })

  it('provider trouble is provider_unavailable, and a refused page token is credential_invalid', async () => {
    const attempt = async (accounts: Reply, me: Reply) => {
      ROUTES = []
      on(`${FB_BASE}/me/accounts?fields=id,access_token`, accounts)
      on(`${FB_BASE}/me?fields=id,name`, me)
      return attestFacebookPage(FB_TOKEN, PAGE)
    }
    const pages = json({ data: [{ id: PAGE, access_token: PAGE_TOKEN }] })
    expect(await attempt(graphError(500, 2, FB_TOKEN), json({ id: PAGE }))).toEqual({ ok: false, failure: 'provider_unavailable' })
    expect(await attempt(json({}, 429), json({ id: PAGE }))).toEqual({ ok: false, failure: 'provider_unavailable' })
    expect(await attempt(new Error('ECONNRESET'), json({ id: PAGE }))).toEqual({ ok: false, failure: 'provider_unavailable' })
    expect(await attempt(pages, graphError(502, 1, PAGE_TOKEN))).toEqual({ ok: false, failure: 'provider_unavailable' })
    expect(await attempt(pages, graphError(400, 4, PAGE_TOKEN))).toEqual({ ok: false, failure: 'provider_unavailable' })
    expect(await attempt(pages, 'not-json')).toEqual({ ok: false, failure: 'provider_unavailable' })
    expect(await attempt(pages, graphError(400, 190, PAGE_TOKEN))).toEqual({ ok: false, failure: 'credential_invalid' })
  })
})

describe('social identity · YouTube', () => {
  it('the refresh grant is exchanged with a form body — the one credential that is not a header — and its scopes come back', async () => {
    on('https://oauth2.googleapis.com/token', json({
      access_token: YT_ACCESS, expires_in: 3599, token_type: 'Bearer',
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
    }))
    expect(await exchangeYouTubeGrant(GRANT)).toEqual({
      ok: true, accessToken: YT_ACCESS,
      scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
    })
    expect(CALLS).toHaveLength(1)
    const [call] = CALLS
    expect(call.url).toBe('https://oauth2.googleapis.com/token')
    expect(call.method).toBe('POST')
    expect(call.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' })
    expect(Object.fromEntries(new URLSearchParams(call.body ?? ''))).toEqual({
      client_id: GRANT.clientId, client_secret: GRANT.clientSecret, refresh_token: GRANT.refreshToken, grant_type: 'refresh_token',
    })
  })

  it('a refused grant is credential_invalid; provider trouble is provider_unavailable', async () => {
    const cases: [Reply, string][] = [
      [json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400), 'credential_invalid'],
      [json({ token_type: 'Bearer' }), 'credential_invalid'],
      [json({ error: 'backendError' }, 503), 'provider_unavailable'],
      [json({ error: 'rate_limit_exceeded' }, 429), 'provider_unavailable'],
      [new Error('ETIMEDOUT'), 'provider_unavailable'],
      ['not-json', 'provider_unavailable'],
    ]
    for (const [reply, failure] of cases) {
      ROUTES = []
      on('https://oauth2.googleapis.com/token', reply)
      expect(await exchangeYouTubeGrant(GRANT)).toEqual({ ok: false, failure })
    }
  })

  it('upload scope alone cannot read a channel — only a read scope lets the channel be verified before an upload', () => {
    expect(canReadOwnChannel(['https://www.googleapis.com/auth/youtube.upload'])).toBe(false)
    expect(canReadOwnChannel([])).toBe(false)
    for (const scope of [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ]) {
      expect(canReadOwnChannel(['https://www.googleapis.com/auth/youtube.upload', scope]), scope).toBe(true)
    }
  })

  it('channels mine=true names the channels the access token acts as, with the token as a header', async () => {
    on('https://www.googleapis.com/youtube/v3/channels', json({ items: [
      { id: CHANNEL, snippet: { title: 'The Prompt' } },
      { id: 'not a channel!', snippet: { title: 'Broken' } },
    ] }))
    expect(await attestYouTubeChannels(YT_ACCESS)).toEqual({ ok: true, channels: [{ channelId: CHANNEL, title: 'The Prompt' }] })
    expect(CALLS).toEqual([{
      url: 'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true&maxResults=50',
      method: 'GET', headers: { Authorization: `Bearer ${YT_ACCESS}` }, body: null,
    }])
  })

  it('no channel, a refused token and trouble are each named', async () => {
    const cases: [Reply, string][] = [
      [json({ items: [] }), 'account_not_found'],
      [json({}), 'account_not_found'],
      [json({ error: { code: 401, message: 'Request had invalid authentication credentials.' } }, 401), 'credential_invalid'],
      [json({ error: { code: 403, message: 'insufficientPermissions' } }, 403), 'credential_invalid'],
      [json({ error: { code: 500 } }, 500), 'provider_unavailable'],
      [json({ error: { code: 429 } }, 429), 'provider_unavailable'],
      [new Error('socket hang up'), 'provider_unavailable'],
    ]
    for (const [reply, failure] of cases) {
      ROUTES = []
      on('https://www.googleapis.com/youtube/v3/channels', reply)
      expect(await attestYouTubeChannels(YT_ACCESS)).toEqual({ ok: false, failure })
    }
  })
})

describe('social identity · YouTube connection — the authorization code', () => {
  const INPUT = {
    clientId: GRANT.clientId,
    clientSecret: GRANT.clientSecret,
    code: `4/0A${'c'.repeat(60)}`,
    codeVerifier: 'v'.repeat(43),
    redirectUri: 'https://ai-operating-platform-web.vercel.app/api/media/youtube/oauth/callback',
  }
  const ALL_SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly'

  it('the code is exchanged with its PKCE verifier and the redirect URI, as a form body — and the refresh token and scopes come back', async () => {
    on('https://oauth2.googleapis.com/token', json({
      access_token: YT_ACCESS, refresh_token: GRANT.refreshToken, expires_in: 3599, token_type: 'Bearer', scope: ALL_SCOPES,
    }))
    expect(await exchangeYouTubeAuthorizationCode(INPUT)).toEqual({
      ok: true, accessToken: YT_ACCESS, refreshToken: GRANT.refreshToken, scopes: ALL_SCOPES.split(' '),
    })
    expect(CALLS).toHaveLength(1)
    const [call] = CALLS
    expect(call.url).toBe('https://oauth2.googleapis.com/token')
    expect(call.method).toBe('POST')
    expect(call.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' })
    expect(Object.fromEntries(new URLSearchParams(call.body ?? ''))).toEqual({
      client_id: INPUT.clientId, client_secret: INPUT.clientSecret, code: INPUT.code, code_verifier: INPUT.codeVerifier,
      redirect_uri: INPUT.redirectUri, grant_type: 'authorization_code',
    })
  })

  it('no refresh token is said as such; a refused code is credential_invalid; trouble is provider_unavailable — and nothing comes back', async () => {
    on('https://oauth2.googleapis.com/token', json({ access_token: YT_ACCESS, scope: ALL_SCOPES }))
    expect(await exchangeYouTubeAuthorizationCode(INPUT)).toEqual({
      ok: true, accessToken: YT_ACCESS, refreshToken: null, scopes: ALL_SCOPES.split(' '),
    })
    const cases: [Reply, string][] = [
      [json({ error: 'invalid_grant', error_description: `${PROVIDER_TEXT} ${INPUT.code}` }, 400), 'credential_invalid'],
      [json({ token_type: 'Bearer' }), 'credential_invalid'],
      [json({ error: 'backendError' }, 503), 'provider_unavailable'],
      [json({ error: 'rate_limit_exceeded' }, 429), 'provider_unavailable'],
      [new Error(`ETIMEDOUT ${INPUT.code}`), 'provider_unavailable'],
      ['not-json', 'provider_unavailable'],
    ]
    for (const [reply, failure] of cases) {
      ROUTES = []
      on('https://oauth2.googleapis.com/token', reply)
      const result = await exchangeYouTubeAuthorizationCode(INPUT)
      expect(result).toEqual({ ok: false, failure })
      expect(JSON.stringify(result)).not.toContain(INPUT.code)
    }
  })
})

describe('social identity · nothing a provider says comes back', () => {
  it('every failure is exactly { ok: false, failure } — no message, body, status or credential', async () => {
    const results: unknown[] = []
    on(`${IG_BASE}/me`, graphError(400, 190))
    results.push(await attestInstagramCredential(IG_TOKEN, null))
    ROUTES = []
    on(`${FB_BASE}/me/accounts`, graphError(400, 190, FB_TOKEN))
    on(`${FB_BASE}/me?fields=id,name`, graphError(400, 190, FB_TOKEN))
    results.push(await attestInstagramCredential(FB_TOKEN, IG_ACCOUNT), await attestFacebookPage(FB_TOKEN, PAGE))
    ROUTES = []
    on('https://oauth2.googleapis.com/token', json({ error: 'invalid_grant', error_description: `${PROVIDER_TEXT} ${GRANT.refreshToken}` }, 400))
    on('https://www.googleapis.com/youtube/v3/channels', new Error(`${PROVIDER_TEXT} ${YT_ACCESS}`))
    results.push(await exchangeYouTubeGrant(GRANT), await attestYouTubeChannels(YT_ACCESS))
    expect(results).toHaveLength(5)
    for (const result of results) expect(Object.keys(result as object).sort()).toEqual(['failure', 'ok'])
    const text = JSON.stringify(results)
    for (const needle of [PROVIDER_TEXT, 'OAuthException', 'invalid_grant', IG_TOKEN, FB_TOKEN, GRANT.refreshToken, GRANT.clientSecret, YT_ACCESS]) {
      expect(text).not.toContain(needle)
    }
  })

  it('in the source: no credential in a URL, no log line, no environment read, three fetch sites', () => {
    const code = readFileSync(resolve(__dirname, '../media/social-identity.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/access_token=|[?&](token|client_secret|refresh_token)=/)
    expect(code).not.toMatch(/console\./)
    expect(code).not.toMatch(/process\.env/)
    expect(code.match(/\bfetch\(/g) ?? []).toHaveLength(3)
    expect(code).toMatch(/headers: \{ Authorization: `Bearer \$\{credential\}` \}/)
  })
})
