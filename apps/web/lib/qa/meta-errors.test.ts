/**
 * Strukturerad Meta-felhantering — incident 2026-07-19.
 *
 * Publiceringen failade med bara "An unknown error occurred" respektive "Fatal".
 * Båda är Metas generiska error.message; betydelsen ligger i code/subcode, som
 * den gamla koden kastade bort. Utan dem gick det inte att skilja transienta fel
 * (försök igen) från permanenta (gå till granskning).
 *
 * Testerna låser också fast att INGA access tokens någonsin kan läcka ut.
 */
import { describe, it, expect } from 'vitest'
import {
  MetaApiError,
  toMetaApiError,
  toNetworkError,
  redactSecrets,
  redactDeep,
  errorSummary,
  isPermanentError,
} from '@/lib/media/meta-errors'

const TOKEN = 'EAAWabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ'

describe('meta-errors — strukturerad parsning', () => {
  it('extraherar code, subcode, fbtrace_id och HTTP-status', () => {
    const err = toMetaApiError('media_publish', 400, {
      error: {
        message:       'An unknown error occurred',
        type:          'OAuthException',
        code:          1,
        error_subcode: 2207020,
        fbtrace_id:    'AbC123xyz',
      },
    })

    expect(err.httpStatus).toBe(400)
    expect(err.code).toBe(1)
    expect(err.subcode).toBe(2207020)
    expect(err.fbtraceId).toBe('AbC123xyz')
    expect(err.metaType).toBe('OAuthException')
    expect(err.endpoint).toBe('media_publish')
  })

  it('"An unknown error occurred" (code 1) klassas som TRANSIENT när subkod saknas', () => {
    const err = toMetaApiError('media_publish', 400, {
      error: { message: 'An unknown error occurred', code: 1 },
    })
    expect(err.permanent).toBe(false)
  })

  it('"Fatal" (code -1) klassas som TRANSIENT — Metas internfel', () => {
    const err = toMetaApiError('media_publish', 500, {
      error: { message: 'Fatal', code: -1 },
    })
    expect(err.permanent).toBe(false)
  })

  it('ogiltig token (code 190) klassas som PERMANENT', () => {
    const err = toMetaApiError('media_publish', 400, {
      error: { message: 'Invalid OAuth access token', code: 190 },
    })
    expect(err.permanent).toBe(true)
  })

  it('container-subkoder (2207020 expired) klassas som PERMANENT även vid code 1', () => {
    const err = toMetaApiError('media_publish', 400, {
      error: { message: 'An unknown error occurred', code: 1, error_subcode: 2207020 },
    })
    // Subkoden vinner över den transienta koden — containern är obrukbar.
    expect(err.permanent).toBe(true)
  })

  it('rate limit (429 och code 4) klassas som TRANSIENT trots 4xx', () => {
    expect(toMetaApiError('media_create', 429, null).permanent).toBe(false)
    expect(toMetaApiError('media_create', 400, { error: { message: 'limit', code: 4 } }).permanent).toBe(false)
  })

  it('5xx klassas som TRANSIENT, övriga 4xx som PERMANENT', () => {
    expect(toMetaApiError('x', 503, null).permanent).toBe(false)
    expect(toMetaApiError('x', 403, null).permanent).toBe(true)
  })

  it('nätverksfel är alltid transienta', () => {
    const err = toNetworkError('media_publish', new Error('ECONNRESET'))
    expect(err.permanent).toBe(false)
    expect(err.httpStatus).toBe(0)
  })

  it('isPermanentError behandlar okända fel som transienta (försiktig default)', () => {
    expect(isPermanentError(new Error('något oväntat'))).toBe(false)
    expect(isPermanentError(toMetaApiError('x', 403, null))).toBe(true)
  })
})

describe('meta-errors — inga tokens får läcka', () => {
  it('redactSecrets tar bort access_token i query-strängar', () => {
    const out = redactSecrets(`https://graph.facebook.com/v21.0/123/media?access_token=${TOKEN}&fields=x`)
    expect(out).not.toContain(TOKEN)
    expect(out).toContain('access_token=[REDACTED]')
  })

  it('redactSecrets tar bort Bearer-headers', () => {
    const out = redactSecrets(`Authorization: Bearer ${TOKEN}`)
    expect(out).not.toContain(TOKEN)
  })

  it('redactSecrets tar bort fristående EAA/IGA-tokenliteraler', () => {
    expect(redactSecrets(`token is ${TOKEN} ok`)).not.toContain(TOKEN)
    expect(redactSecrets('token is IGAAxxxxxxxxxxxxxxxxxxxxxxxxxx ok')).toContain('[REDACTED_TOKEN]')
  })

  it('redactDeep maskerar nycklar som heter token/secret/authorization', () => {
    const out = redactDeep({ access_token: TOKEN, nested: { pageToken: TOKEN }, safe: 'ok' }) as Record<string, unknown>
    expect(JSON.stringify(out)).not.toContain(TOKEN)
    expect(out.safe).toBe('ok')
  })

  it('MetaApiError.message redigeras redan i konstruktorn', () => {
    const err = new MetaApiError({
      message:    `misslyckades mot ?access_token=${TOKEN}`,
      httpStatus: 400,
      endpoint:   'media_publish',
    })
    expect(err.message).not.toContain(TOKEN)
    expect(JSON.stringify(err.toLogObject())).not.toContain(TOKEN)
    expect(err.toSummary()).not.toContain(TOKEN)
    expect(errorSummary(err)).not.toContain(TOKEN)
  })

  it('toSummary innehåller den strukturerade diagnostiken', () => {
    const err = toMetaApiError('media_publish', 400, {
      error: { message: 'Fatal', code: -1, error_subcode: 2207020, fbtrace_id: 'T1' },
    })
    const s = err.toSummary()
    expect(s).toContain('Fatal')
    expect(s).toContain('http=400')
    expect(s).toContain('code=-1')
    expect(s).toContain('subcode=2207020')
    expect(s).toContain('trace=T1')
    expect(s).toContain('permanent')
  })
})
