/**
 * MUAPI MEDIA PROVIDER BOOTSTRAP — the provider is wired and stays unable to spend.
 *
 * The deliverable of this bootstrap is a boundary that nothing crosses, so this
 * suite owns the ways the boundary could be lost in practice:
 *
 *   1. CONFIG DRIFT — production selected automatically, a mode falling back to
 *      another mode's credential, or a default flipping from off to on.
 *   2. THE GATE RELAXED — an outbound call path that does not consult it, or a
 *      "read-only calls are fine when disabled" carve-out.
 *   3. THE DECLARATION RELAXED — the capability's license bumped off `draft`,
 *      its autonomy raised above L0, or its refusal turned into an approval.
 *   4. A SECRET ESCAPING — a credential reaching an error message, a log line,
 *      or the repository itself.
 *
 * NO TEST HERE TOUCHES THE NETWORK. Every provider instance is constructed with
 * an injected `fetchImpl`; a test that reached MuAPI would be a test that spends
 * money on CI, which is the exact failure this bootstrap exists to prevent.
 *
 * `execFileSync` takes an argv and never a shell string: this repository's path
 * contains spaces ("AI Operating Platform"), and a shell-interpolated `grep`
 * word-splits into non-existent paths, making a scan silently empty and its
 * assertion unfalsifiable.
 */

import { describe, it, expect, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

import {
  MUAPI_ENV,
  credentialEnvNameFor,
  resolveMuapiConfig,
  resolveMuapiCredential,
  resolveMuapiMode,
} from '@/lib/media/providers/config'
import {
  MediaProviderError,
  classifyHttpFailure,
  redactMediaDeep,
  redactMediaSecrets,
  toMediaProviderError,
} from '@/lib/media/providers/errors'
import {
  assertCapability,
  decideMediaExecution,
} from '@/lib/media/providers/gate'
import { MuapiProvider, extractAssets, mapMuapiStatus } from '@/lib/media/providers/muapi'
import { describeMediaProviders, requireProviderFor, resolveProviderFor } from '@/lib/media/providers/router'
import {
  MEDIA_GENERATION_AUTONOMOUS_EXECUTION,
  MEDIA_GENERATION_AUTONOMY_LEVEL,
  MEDIA_GENERATION_LICENSE_STATUS,
  MEDIA_GENERATION_TOOL_BOUND,
  MEDIA_GENERATION_TOOL_ID,
  describeMediaGenerationCapability,
  mediaGenerationAvailability,
  requestsMediaGeneration,
} from '@/lib/atlas/capability/media-generation'

const WEB_ROOT = resolve(__dirname, '../..')
const REPO_ROOT = resolve(WEB_ROOT, '../..')

/** A fetch that fails the test if it is ever called. */
const forbiddenFetch = (): Promise<Response> => {
  throw new Error('network call attempted — the gate should have refused first')
}

/** A fetch returning a canned JSON body. */
const jsonFetch = (body: unknown, status = 200): typeof fetch =>
  (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch

/**
 * Await a call that MUST reject, and return the error already typed.
 * `.catch(e => e as T)` widens to `T | <resolved>`, which hides a passing
 * test that silently stopped rejecting.
 */
const rejection = async (p: Promise<unknown>): Promise<MediaProviderError> =>
  p.then(
    () => { throw new Error('expected the call to reject, but it resolved') },
    (e: unknown) => e as MediaProviderError,
  )

const TEST_KEY = 'test-key-aaaaaaaaaaaaaaaaaaaaaaaa'
const PROD_KEY = 'prod-key-bbbbbbbbbbbbbbbbbbbbbbbb'

const ENABLED_TEST_ENV: Record<string, string | undefined> = {
  [MUAPI_ENV.enabled]: '1',
  [MUAPI_ENV.mode]: 'test',
  [MUAPI_ENV.testKey]: TEST_KEY,
}

// ── 1. Config resolution ─────────────────────────────────────────────────────

describe('config resolution defaults to the harmless state', () => {

  it('MUAPI_ENABLED=false disables, exactly as an operator would read it', () => {
    expect(resolveMuapiMode({ [MUAPI_ENV.enabled]: 'false' })).toBe('disabled')
    expect(resolveMuapiMode({ [MUAPI_ENV.enabled]: '0' })).toBe('disabled')
    expect(resolveMuapiMode({ [MUAPI_ENV.enabled]: '' })).toBe('disabled')
  })

  it('only the two canonical truthy spellings enable', () => {
    expect(resolveMuapiMode({ [MUAPI_ENV.enabled]: '1' })).toBe('test')
    expect(resolveMuapiMode({ [MUAPI_ENV.enabled]: 'true' })).toBe('test')
    // A typo must degrade toward the harmless state, never toward production.
    expect(resolveMuapiMode({ [MUAPI_ENV.enabled]: 'yes' })).toBe('disabled')
  })

  it('an unrecognised MUAPI_MODE resolves to test, never production', () => {
    expect(resolveMuapiMode({ [MUAPI_ENV.enabled]: '1', [MUAPI_ENV.mode]: 'prod' })).toBe('test')
    expect(resolveMuapiMode({ [MUAPI_ENV.enabled]: '1', [MUAPI_ENV.mode]: 'PRODUCTIN' })).toBe('test')
    expect(resolveMuapiMode({ [MUAPI_ENV.enabled]: '1', [MUAPI_ENV.mode]: '' })).toBe('test')
  })

  it('MUAPI_MODE=production is inert without the master switch', () => {
    expect(resolveMuapiMode({ [MUAPI_ENV.mode]: 'production' })).toBe('disabled')
  })

  it('a whitespace-only credential does not count as configured', () => {
    const c = resolveMuapiConfig({ ...ENABLED_TEST_ENV, [MUAPI_ENV.testKey]: '   ' })
    expect(c.hasCredential).toBe(false)
  })
})

// ── 2. Test / production separation ──────────────────────────────────────────

describe('production is never entered by the environment alone', () => {
  it('the presence of a production key does NOT select production', () => {
    const env = { [MUAPI_ENV.enabled]: '1', [MUAPI_ENV.prodKey]: PROD_KEY }
    // No MUAPI_MODE at all, but a production credential is sitting right there.
    expect(resolveMuapiMode(env)).toBe('test')
    expect(resolveMuapiConfig(env).mode).toBe('test')
  })

  it('test mode cannot reach the production credential', () => {
    const env = {
      [MUAPI_ENV.enabled]: '1',
      [MUAPI_ENV.mode]: 'test',
      [MUAPI_ENV.prodKey]: PROD_KEY,
      // deliberately no test key
    }
    expect(resolveMuapiCredential(env)).toBeNull()
    expect(resolveMuapiConfig(env).hasCredential).toBe(false)
  })

  it('production mode cannot fall back to the test credential', () => {
    const env = {
      [MUAPI_ENV.enabled]: '1',
      [MUAPI_ENV.mode]: 'production',
      [MUAPI_ENV.productionEnabled]: '1',
      [MUAPI_ENV.testKey]: TEST_KEY,
      // deliberately no prod key
    }
    expect(resolveMuapiCredential(env)).toBeNull()
    expect(decideMediaExecution(resolveMuapiConfig(env)).allowed).toBe(false)
  })

  it('each mode selects its own credential and no other', () => {
    expect(credentialEnvNameFor('test')).toBe(MUAPI_ENV.testKey)
    expect(credentialEnvNameFor('production')).toBe(MUAPI_ENV.prodKey)
    expect(credentialEnvNameFor('disabled')).toBeNull()

    const bothKeys = { [MUAPI_ENV.testKey]: TEST_KEY, [MUAPI_ENV.prodKey]: PROD_KEY }
    expect(resolveMuapiCredential({ ...bothKeys, [MUAPI_ENV.enabled]: '1', [MUAPI_ENV.mode]: 'test' }))
      .toBe(TEST_KEY)
    expect(resolveMuapiCredential({ ...bothKeys, [MUAPI_ENV.enabled]: '1', [MUAPI_ENV.mode]: 'production' }))
      .toBe(PROD_KEY)
  })

  it('a disabled provider yields no credential even when both keys are set', () => {
    expect(resolveMuapiCredential({
      [MUAPI_ENV.testKey]: TEST_KEY,
      [MUAPI_ENV.prodKey]: PROD_KEY,
    })).toBeNull()
  })
})

// ── 3. The execution gate ────────────────────────────────────────────────────

describe('the execution gate refuses by default', () => {
  it('disabled refuses and is not billable', () => {
    const d = decideMediaExecution(resolveMuapiConfig({}))
    expect(d.allowed).toBe(false)
    expect(d.code).toBe('MEDIA_EXECUTION_DISABLED')
    expect(d.billable).toBe(false)
  })

  it('test mode with its key is allowed and NOT billable', () => {
    const d = decideMediaExecution(resolveMuapiConfig(ENABLED_TEST_ENV))
    expect(d.allowed).toBe(true)
    // MuAPI sandbox keys return mock outputs without billing.
    expect(d.billable).toBe(false)
  })

  it('production is refused without the second switch', () => {
    const d = decideMediaExecution(resolveMuapiConfig({
      [MUAPI_ENV.enabled]: '1',
      [MUAPI_ENV.mode]: 'production',
      [MUAPI_ENV.prodKey]: PROD_KEY,
    }))
    expect(d.allowed).toBe(false)
    expect(d.code).toBe('MEDIA_EXECUTION_DISABLED')
    expect(d.reason).toContain(MUAPI_ENV.productionEnabled)
  })

  it('production refused is NOT silently downgraded to test', () => {
    const config = resolveMuapiConfig({
      [MUAPI_ENV.enabled]: '1',
      [MUAPI_ENV.mode]: 'production',
      [MUAPI_ENV.prodKey]: PROD_KEY,
    })
    // The mode still reads `production` — an operator must see what they chose.
    expect(config.mode).toBe('production')
    expect(decideMediaExecution(config).allowed).toBe(false)
  })

  it('production with both switches and its key is allowed and billable', () => {
    const d = decideMediaExecution(resolveMuapiConfig({
      [MUAPI_ENV.enabled]: '1',
      [MUAPI_ENV.mode]: 'production',
      [MUAPI_ENV.productionEnabled]: '1',
      [MUAPI_ENV.prodKey]: PROD_KEY,
    }))
    expect(d.allowed).toBe(true)
    expect(d.billable).toBe(true)
  })

  it('a missing key reports NOT_CONFIGURED, distinct from DISABLED', () => {
    const d = decideMediaExecution(resolveMuapiConfig({
      [MUAPI_ENV.enabled]: '1',
      [MUAPI_ENV.mode]: 'test',
    }))
    expect(d.allowed).toBe(false)
    expect(d.code).toBe('MEDIA_PROVIDER_NOT_CONFIGURED')
    expect(d.reason).toContain(MUAPI_ENV.testKey)
  })

  it('a gate refusal never leaks a credential into its reason', () => {
    for (const env of [
      { [MUAPI_ENV.enabled]: '1', [MUAPI_ENV.mode]: 'production', [MUAPI_ENV.prodKey]: PROD_KEY },
      { [MUAPI_ENV.enabled]: '1', [MUAPI_ENV.mode]: 'test', [MUAPI_ENV.testKey]: '' },
    ]) {
      const reason = decideMediaExecution(resolveMuapiConfig(env)).reason ?? ''
      expect(reason).not.toContain(PROD_KEY)
      expect(reason).not.toContain(TEST_KEY)
    }
  })
})

describe('a disabled provider makes no outbound call of any kind', () => {
  // Every method, including the read-only ones. A "read-only calls are fine"
  // carve-out is how a disabled integration acquires a live network path.
  const disabled = () => new MuapiProvider({ env: {}, fetchImpl: forbiddenFetch as unknown as typeof fetch })

  it('generateImage refuses before fetch', async () => {
    await expect(disabled().generateImage({ model: 'flux-dev-image', prompt: 'x' }))
      .rejects.toMatchObject({ code: 'MEDIA_EXECUTION_DISABLED', retryable: false })
  })

  it('getStatus refuses before fetch', async () => {
    await expect(disabled().getStatus({
      provider: 'muapi', requestId: 'abc', model: 'm', submittedAt: '', mode: 'test',
    })).rejects.toMatchObject({ code: 'MEDIA_EXECUTION_DISABLED' })
  })

  it('listModels — a pure read — still refuses before fetch', async () => {
    await expect(disabled().listModels()).rejects.toMatchObject({ code: 'MEDIA_EXECUTION_DISABLED' })
  })

  it('estimateCost refuses before fetch', async () => {
    await expect(disabled().estimateCost('flux-dev-image', {}))
      .rejects.toMatchObject({ code: 'MEDIA_EXECUTION_DISABLED' })
  })

  it('healthCheck reports failure rather than reaching the network', async () => {
    const r = await disabled().healthCheck()
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('MEDIA_EXECUTION_DISABLED')
  })

  it('describe() answers while disabled, without touching the network', () => {
    const s = disabled().describe()
    expect(s.mode).toBe('disabled')
    expect(s.configured).toBe(false)
    expect(s.executionAllowed).toBe(false)
    expect(s.blockedReason).toContain(MUAPI_ENV.enabled)
  })
})

describe('a missing API key blocks execution', () => {
  it('enabled test mode without a key refuses before fetch', async () => {
    const p = new MuapiProvider({
      env: { [MUAPI_ENV.enabled]: '1', [MUAPI_ENV.mode]: 'test' },
      fetchImpl: forbiddenFetch as unknown as typeof fetch,
    })
    await expect(p.generateImage({ model: 'flux-dev-image', prompt: 'x' }))
      .rejects.toMatchObject({ code: 'MEDIA_PROVIDER_NOT_CONFIGURED' })
  })
})

describe('capability refusal happens before any network call', () => {
  it('an undeclared capability is a typed refusal, not a vendor 404', () => {
    expect(() => assertCapability(['generateImage'], 'lipSync', 'muapi'))
      .toThrowError(/does not support "lipSync"/)
    try {
      assertCapability(['generateImage'], 'lipSync', 'muapi')
    } catch (e) {
      expect((e as MediaProviderError).code).toBe('MEDIA_CAPABILITY_UNSUPPORTED')
      expect((e as MediaProviderError).retryable).toBe(false)
    }
  })
})

// ── 4. Async request / status mapping ────────────────────────────────────────

describe('async submit and status mapping', () => {
  it('submit normalizes request_id into a job ref carrying its mode', async () => {
    const p = new MuapiProvider({
      env: ENABLED_TEST_ENV,
      fetchImpl: jsonFetch({ request_id: 'req_123' }),
    })
    const ref = await p.generateImage({ model: 'flux-dev-image', prompt: 'a cat' })
    expect(ref).toMatchObject({ provider: 'muapi', requestId: 'req_123', model: 'flux-dev-image', mode: 'test' })
    expect(Date.parse(ref.submittedAt)).not.toBeNaN()
  })

  /**
   * CHANGED IN PHASE 3, deliberately, and the change is the safety fix.
   *
   * This used to assert `MEDIA_PROVIDER_RESPONSE_INVALID` — "the vendor sent us
   * junk", which reads as a caller-side fault and invites a retry. It is the
   * opposite: a 2xx means MuAPI ACCEPTED the request and a paid operation almost
   * certainly exists; what was lost is Omnira's ability to name it. With no
   * lookup-by-correlation and no history endpoint (`MUAPI_LIFECYCLE`), that
   * operation is unreachable, and repeating the call would pay for it twice.
   */
  it('a 2xx without request_id is an AMBIGUOUS dispatch, not an invalid response', async () => {
    const p = new MuapiProvider({ env: ENABLED_TEST_ENV, fetchImpl: jsonFetch({ ok: true }) })
    await expect(p.generateImage({ model: 'flux-dev-image', prompt: 'x' }))
      .rejects.toMatchObject({
        code: 'MEDIA_DISPATCH_UNKNOWN',
        dispatchObservation: 'confirmed_evidence_failed',
        retryable: false,
      })
  })

  it('a 2xx without a usable id on a READ is still an invalid response', async () => {
    // The distinction the change turns on: a GET creates nothing, so an
    // unreadable answer to one raises no question about money.
    const p = new MuapiProvider({
      env: ENABLED_TEST_ENV,
      fetchImpl: (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch,
    })
    await expect(p.getStatus({ provider: 'muapi', requestId: 'r', model: 'm', submittedAt: 'T', mode: 'test' }))
      .rejects.toMatchObject({ code: 'MEDIA_PROVIDER_RESPONSE_INVALID', dispatchObservation: null })
  })

  it("MuAPI's six statuses map onto Omnira's four", () => {
    expect(mapMuapiStatus('queued')).toBe('pending')
    expect(mapMuapiStatus('pending')).toBe('pending')
    expect(mapMuapiStatus('processing')).toBe('running')
    expect(mapMuapiStatus('completed')).toBe('completed')
    expect(mapMuapiStatus('failed')).toBe('failed')
    expect(mapMuapiStatus('cancelled')).toBe('failed')
  })

  it('an unknown status is running — never a guessed terminal state', () => {
    expect(mapMuapiStatus('reticulating')).toBe('running')
    expect(mapMuapiStatus(undefined)).toBe('running')
    expect(mapMuapiStatus(42)).toBe('running')
  })

  it('a completed job yields normalized assets', async () => {
    const p = new MuapiProvider({
      env: ENABLED_TEST_ENV,
      fetchImpl: jsonFetch({
        status: 'completed',
        outputs: [{ url: 'https://cdn.muapi.ai/a.png', width: 1024, height: 1024 }],
      }),
    })
    const res = await p.getStatus({
      provider: 'muapi', requestId: 'req_123', model: 'flux-dev-image',
      submittedAt: new Date().toISOString(), mode: 'test',
    })
    expect(res.status).toBe('completed')
    expect(res.assets).toEqual([expect.objectContaining({ kind: 'image', url: 'https://cdn.muapi.ai/a.png' })])
    expect(res.error).toBeNull()
  })

  it('a test-mode job is marked simulated even if config later changes', async () => {
    // Provider now reads a PRODUCTION config, but the job was submitted in test.
    const p = new MuapiProvider({
      env: {
        [MUAPI_ENV.enabled]: '1', [MUAPI_ENV.mode]: 'production',
        [MUAPI_ENV.productionEnabled]: '1', [MUAPI_ENV.prodKey]: PROD_KEY,
      },
      fetchImpl: jsonFetch({ status: 'completed', outputs: [] }),
    })
    const res = await p.getStatus({
      provider: 'muapi', requestId: 'req_1', model: 'm', submittedAt: '', mode: 'test',
    })
    expect(res.simulated).toBe(true)
  })

  it('a failed job carries a typed, non-retryable error and no assets', async () => {
    const p = new MuapiProvider({
      env: ENABLED_TEST_ENV,
      fetchImpl: jsonFetch({ status: 'failed', error: 'content policy violation' }),
    })
    const res = await p.getStatus({
      provider: 'muapi', requestId: 'req_9', model: 'm', submittedAt: '', mode: 'test',
    })
    expect(res.status).toBe('failed')
    expect(res.assets).toEqual([])
    expect(res.error).toMatchObject({ code: 'MEDIA_JOB_FAILED', retryable: false })
  })

  it('extractAssets finds URLs across the shapes MuAPI actually returns', () => {
    expect(extractAssets({ outputs: ['https://x/a.png'] })[0].kind).toBe('image')
    expect(extractAssets({ video_url: 'https://x/a.mp4' })[0].kind).toBe('video')
    expect(extractAssets({ data: { audio: [{ url: 'https://x/a.mp3' }] } })[0].kind).toBe('audio')
    // Deduplicated, and non-URL strings ignored.
    expect(extractAssets({ outputs: ['https://x/a.png', 'https://x/a.png', 'not a url'] })).toHaveLength(1)
  })
})

// ── 5. Provider error normalization ──────────────────────────────────────────

describe('provider errors normalize to typed, redacted shapes', () => {
  it('401 and 403 classify as authentication failures', () => {
    expect(classifyHttpFailure(401, '')).toBe('MEDIA_PROVIDER_AUTHENTICATION_FAILED')
    expect(classifyHttpFailure(403, '')).toBe('MEDIA_PROVIDER_AUTHENTICATION_FAILED')
    expect(classifyHttpFailure(500, '')).toBe('MEDIA_PROVIDER_REQUEST_FAILED')
  })

  it('an auth-shaped body classifies as auth even on an odd status', () => {
    expect(classifyHttpFailure(400, 'Invalid API key')).toBe('MEDIA_PROVIDER_AUTHENTICATION_FAILED')
  })

  it('429 and 5xx are retryable; other 4xx are not', () => {
    const mk = (httpStatus: number) =>
      new MediaProviderError({ code: 'MEDIA_PROVIDER_REQUEST_FAILED', message: 'x', httpStatus })
    expect(mk(429).retryable).toBe(true)
    expect(mk(503).retryable).toBe(true)
    expect(mk(400).retryable).toBe(false)
    expect(mk(404).retryable).toBe(false)
  })

  it('a vendor HTTP failure becomes a typed error carrying its status', async () => {
    const p = new MuapiProvider({
      env: ENABLED_TEST_ENV,
      fetchImpl: (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch,
    })
    await expect(p.generateImage({ model: 'flux-dev-image', prompt: 'x' })).rejects.toMatchObject({
      code: 'MEDIA_PROVIDER_AUTHENTICATION_FAILED',
      httpStatus: 401,
      provider: 'muapi',
    })
  })

  /**
   * CHANGED IN PHASE 3. The original assertion — that a network throw on a
   * GENERATION is `retryable: true` — was the single most expensive default in
   * this adapter: a reset can arrive after the request body was written, so
   * "retry me" is permission to pay twice for one image.
   *
   * Retryability now splits by what the call DOES, not by what the network did.
   */
  it('a network throw on a READ is still retryable — repeating an observation is free', async () => {
    const p = new MuapiProvider({
      env: ENABLED_TEST_ENV,
      fetchImpl: (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch,
    })
    const err = await rejection(p.getStatus({ provider: 'muapi', requestId: 'r', model: 'm', submittedAt: 'T', mode: 'test' }))
    expect(err).toBeInstanceOf(MediaProviderError)
    expect(err.retryable).toBe(true)
    expect(err.dispatchObservation).toBeNull()
  })

  it('a network throw on a CREATION is ambiguous and NEVER retryable', async () => {
    const p = new MuapiProvider({
      env: ENABLED_TEST_ENV,
      fetchImpl: (async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }) }) as unknown as typeof fetch,
    })
    const err = await rejection(p.generateImage({ model: 'm', prompt: 'x' }))
    expect(err).toBeInstanceOf(MediaProviderError)
    expect(err.code).toBe('MEDIA_DISPATCH_UNKNOWN')
    expect(err.dispatchObservation).toBe('response_lost')
    expect(err.retryable).toBe(false)
  })

  it('a connect-stage failure on a CREATION is definite, and safe to retry', async () => {
    // The one transport failure that PROVES nothing was sent, so the retry it
    // permits cannot duplicate anything.
    const p = new MuapiProvider({
      env: ENABLED_TEST_ENV,
      fetchImpl: (async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }) }) as unknown as typeof fetch,
    })
    const err = await rejection(p.generateImage({ model: 'm', prompt: 'x' }))
    expect(err.code).toBe('MEDIA_PROVIDER_REQUEST_FAILED')
    expect(err.dispatchObservation).toBe('not_dispatched')
    expect(err.retryable).toBe(true)
  })

  it('toShape produces a serializable payload', () => {
    const shape = new MediaProviderError({
      code: 'MEDIA_JOB_FAILED', message: 'boom', provider: 'muapi', httpStatus: null,
    }).toShape()
    expect(JSON.parse(JSON.stringify(shape))).toEqual(shape)
  })

  it('an already-typed error passes through toMediaProviderError unchanged', () => {
    const original = new MediaProviderError({ code: 'MEDIA_JOB_FAILED', message: 'x' })
    expect(toMediaProviderError(original, 'muapi')).toBe(original)
  })
})

// ── 6. Secret redaction ──────────────────────────────────────────────────────

describe('secrets never survive into a message', () => {
  it('redacts header and parameter forms', () => {
    expect(redactMediaSecrets('x-api-key: sk-abc123def456')).not.toContain('sk-abc123def456')
    expect(redactMediaSecrets('?api_key=sk-abc123def456&x=1')).not.toContain('sk-abc123def456')
    expect(redactMediaSecrets('{"api_key":"sk-abc123def456"}')).not.toContain('sk-abc123def456')
  })

  it('redacts the LIVE credential literal even with no surrounding syntax', () => {
    const env = { ...ENABLED_TEST_ENV }
    const leaked = `the vendor echoed ${TEST_KEY} back at us`
    expect(redactMediaSecrets(leaked, env)).not.toContain(TEST_KEY)
    expect(redactMediaSecrets(leaked, env)).toContain('[REDACTED]')
  })

  it('redactMediaDeep strips secret-named keys anywhere in a structure', () => {
    const out = redactMediaDeep(
      { headers: { 'x-api-key': TEST_KEY }, nested: [{ apiKey: TEST_KEY }], safe: 'kept' },
      ENABLED_TEST_ENV,
    )
    expect(JSON.stringify(out)).not.toContain(TEST_KEY)
    expect(JSON.stringify(out)).toContain('kept')
  })

  it('an error constructed with a leaked key redacts in the CONSTRUCTOR', () => {
    const prev = process.env[MUAPI_ENV.enabled]
    const prevMode = process.env[MUAPI_ENV.mode]
    const prevKey = process.env[MUAPI_ENV.testKey]
    process.env[MUAPI_ENV.enabled] = '1'
    process.env[MUAPI_ENV.mode] = 'test'
    process.env[MUAPI_ENV.testKey] = TEST_KEY
    try {
      const err = new MediaProviderError({
        code: 'MEDIA_PROVIDER_REQUEST_FAILED',
        message: `failed with x-api-key: ${TEST_KEY}`,
      })
      // Anything that catches this and logs err.message is safe without knowing it.
      expect(err.message).not.toContain(TEST_KEY)
      expect(err.toShape().message).not.toContain(TEST_KEY)
    } finally {
      if (prev === undefined) delete process.env[MUAPI_ENV.enabled]; else process.env[MUAPI_ENV.enabled] = prev
      if (prevMode === undefined) delete process.env[MUAPI_ENV.mode]; else process.env[MUAPI_ENV.mode] = prevMode
      if (prevKey === undefined) delete process.env[MUAPI_ENV.testKey]; else process.env[MUAPI_ENV.testKey] = prevKey
    }
  })

  it('a vendor error body echoing the key does not leak it into the thrown message', async () => {
    const p = new MuapiProvider({
      env: ENABLED_TEST_ENV,
      fetchImpl: (async () =>
        new Response(`bad key: x-api-key: ${TEST_KEY}`, { status: 400 })) as unknown as typeof fetch,
    })
    const err = await rejection(p.generateImage({ model: 'm', prompt: 'x' }))
    expect(err.message).not.toContain(TEST_KEY)
  })
})

// ── 7. The router ────────────────────────────────────────────────────────────

describe('the router routes by capability, never by vendor name', () => {
  it('lists registered providers even while they are disabled', () => {
    const statuses = describeMediaProviders()
    expect(statuses.map(s => s.provider)).toContain('muapi')
  })

  it('resolves nothing while every provider is gated off', () => {
    // The ambient env has no MuAPI configuration, so nothing may execute.
    expect(resolveProviderFor('generateImage')).toBeNull()
  })

  it('an implemented-but-blocked capability reports WHY, not "unsupported"', () => {
    try {
      requireProviderFor('generateImage')
      throw new Error('expected a refusal')
    } catch (e) {
      expect((e as MediaProviderError).code).toBe('MEDIA_EXECUTION_DISABLED')
      expect((e as MediaProviderError).message).toContain('muapi')
    }
  })

  it('a capability nobody implements is a distinct, honest refusal', () => {
    // No registered provider declares this, so the ground must be UNSUPPORTED.
    expect(() => requireProviderFor('nonexistent' as never))
      .toThrowError(/No registered media provider implements/)
  })
})

// ── 8. The capability declaration grants nothing ─────────────────────────────

describe('media generation is declared and unlicensed', () => {
  it('the license status is the canonical Ch18.49 `draft`', () => {
    expect(MEDIA_GENERATION_LICENSE_STATUS).toBe('draft')
  })

  it('the autonomy level is the canonical Ch18.10 L0 — Observe', () => {
    expect(MEDIA_GENERATION_AUTONOMY_LEVEL).toBe('L0')
  })

  it('autonomous execution is false', () => {
    expect(MEDIA_GENERATION_AUTONOMOUS_EXECUTION).toBe(false)
  })

  it('the tool bound carries a restriction', () => {
    expect(MEDIA_GENERATION_TOOL_BOUND.tool).toBe(MEDIA_GENERATION_TOOL_ID)
    expect(MEDIA_GENERATION_TOOL_BOUND.restriction ?? '').not.toBe('')
  })

  it('the availability seam refuses every mission', async () => {
    const answer = await mediaGenerationAvailability({
      projectId: 'p', missionId: 'm', missionVersion: 1,
      tools: [MEDIA_GENERATION_TOOL_BOUND],
      dataScope: [{ resource: 'media_assets', access: 'write' }],
    })
    expect(answer.tools).toBe(false)
    expect(answer.data).toBe(false)
    expect(answer.unavailable).toContain(MEDIA_GENERATION_TOOL_ID)
  })

  it('requestsMediaGeneration notices the identifier without authorizing it', () => {
    expect(requestsMediaGeneration([MEDIA_GENERATION_TOOL_BOUND])).toBe(true)
    expect(requestsMediaGeneration([{ tool: 'other' }])).toBe(false)
  })

  it('execution stays disabled even when a provider is fully configured', () => {
    const prev = { ...process.env }
    process.env[MUAPI_ENV.enabled] = '1'
    process.env[MUAPI_ENV.mode] = 'test'
    process.env[MUAPI_ENV.testKey] = TEST_KEY
    try {
      const status = describeMediaGenerationCapability()
      // The provider is reachable...
      expect(status.available).toBe(true)
      expect(status.provider).toBe('muapi')
      expect(status.mode).toBe('test')
      // ...and an agent still may not use it.
      expect(status.execution).toBe('disabled')
      expect(status.blockedBy.length).toBeGreaterThan(0)
    } finally {
      for (const k of [MUAPI_ENV.enabled, MUAPI_ENV.mode, MUAPI_ENV.testKey]) {
        if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]
      }
    }
  })

  it('the provider declares no spend policy of its own (governance G1)', async () => {
    // The old `approvalRequiredSpendPolicy` default lived here and answered
    // "may we spend" for MuAPI alone. G1 made that one question with one answer
    // — lib/cost/governed-spend.ts — so a second abstraction must not reappear.
    const gate = await import('@/lib/media/providers/gate')
    expect(Object.keys(gate)).not.toContain('approvalRequiredSpendPolicy')
    // The EXECUTION authority half stays: it decides whether an outbound call
    // may happen at all, which is a different question from affordability.
    expect(Object.keys(gate)).toContain('decideMediaExecution')
  })
})

// ── 9. Repository-level secret and default scans ─────────────────────────────

/** Files under app/ and lib/ matching a pattern, excluding this QA directory. */
const productionMatches = (pattern: string): string[] => {
  let out = ''
  try {
    out = execFileSync('grep', ['-rlE', pattern, `${WEB_ROOT}/app`, `${WEB_ROOT}/lib`], { encoding: 'utf8' })
  } catch (e) {
    const err = e as { status?: number }
    if (err.status !== 1) throw e   // 1 = no match at all, which is the pass
  }
  return out.trim().split('\n').filter(Boolean).filter(f => !f.includes('/qa/'))
}

describe('no credential and no live default reaches the repository', () => {
  it('no tracked file assigns a non-placeholder MuAPI key', () => {
    // Matches MUAPI_*_API_KEY= followed by anything that is not end-of-line,
    // a quote pair, or an obvious placeholder.
    const hits = productionMatches('MUAPI_(TEST|PROD)_API_KEY\\s*=\\s*["\']?[A-Za-z0-9_-]{8,}')
    expect(hits).toEqual([])
  })

  /**
   * These two scans target ASSIGNMENT, not the variable names.
   *
   * `MUAPI_MODE=production` appears legitimately in this repository — in
   * `config.ts`'s explanation of why that value is inert on its own, and in the
   * env template. A substring ban on the name would trip over its own
   * documentation and push a later maintainer toward deleting the prose that
   * makes the invariant legible. So the scans target the thing that would
   * actually create the dangerous state: production code WRITING the config at
   * runtime, which would let a module override an operator's environment.
   */
  it('no production module writes MuAPI config at runtime', () => {
    const hits = productionMatches('process\\.env\\.MUAPI_[A-Z_]+\\s*=[^=]')
    expect(hits).toEqual([])
  })

  it('no production module hands out a credential outside config.ts', () => {
    // `resolveMuapiCredential` is the single credential exit. Any other module
    // reading a key env var directly would bypass the mode separation entirely.
    const hits = productionMatches('process\\.env\\[?["\']?MUAPI_(TEST|PROD)_API_KEY')
    expect(hits.filter(f => !f.endsWith('/lib/media/providers/config.ts'))).toEqual([])
  })

  it('the committed env template contains only empty placeholders', () => {
    const template = execFileSync(
      'cat',
      [`${REPO_ROOT}/docs/architecture/muapi-media-provider.env.example`],
      { encoding: 'utf8' },
    )
    for (const line of template.split('\n')) {
      const m = line.match(/^(MUAPI_(?:TEST|PROD)_API_KEY)\s*=\s*(.*)$/)
      if (m) expect(m[2].trim()).toBe('')
    }
    // And the shipped defaults are the harmless ones.
    expect(template).toMatch(/^MUAPI_ENABLED=false$/m)
    expect(template).toMatch(/^MUAPI_MODE=test$/m)
  })

  it('nothing outside the provider directory imports the MuAPI adapter directly', () => {
    // Atlas must reach media through the router, never by naming a vendor.
    const hits = productionMatches("from ['\"]@/lib/media/providers/muapi['\"]")
    expect(hits).toEqual([])
  })
})

// ── 10. No automatic generation ──────────────────────────────────────────────

describe('nothing generates media on its own', () => {
  /**
   * WHO MAY ASK A PROVIDER TO GENERATE.
   *
   * Until Phase 5 the answer was "nobody" — the methods existed and had no call
   * sites at all, which is what made the bootstrap safe. That is no longer the
   * claim, because a governed dispatch adapter now exists and calling the
   * provider is its entire purpose.
   *
   * So the assertion changed SHAPE rather than being relaxed. It was an
   * exclusion filter ("nothing outside the provider layer"); it is now an exact
   * set. One governed caller, named. A second one fails this test, and so does
   * a call site appearing in a route or a cron — which is the property the
   * original guard was really protecting, and it is now stated directly instead
   * of following from an emptiness that could not survive the feature.
   */
  it('exactly ONE governed module calls a generation method', () => {
    const hits = productionMatches('\\.(generateImage|generateVideo|imageToVideo|lipSync|editImage)\\(')
    const callers = hits
      // The provider layer DEFINES these methods; a definition is not a call.
      .filter(f => !f.includes('/lib/media/providers/'))
      .map(f => f.slice(f.indexOf('/lib/') + 1))
      .sort()
    expect(callers).toEqual(['lib/media/dispatch/governed-dispatch.ts'])
  })

  it('no route, cron or workflow calls a generation method', () => {
    const hits = productionMatches('\\.(generateImage|generateVideo|imageToVideo|lipSync|editImage)\\(')
    expect(hits.filter(f => f.includes('/app/'))).toEqual([])
  })

  it('the one governed caller reaches the provider ONLY inside the spend boundary', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const src = readFileSync(`${WEB_ROOT}/lib/media/dispatch/governed-dispatch.ts`, 'utf8')
    const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    // There is exactly one create call, and `withGovernedSpend(` opens before it.
    const calls = [...body.matchAll(/\.generateImage\(/g)]
    expect(calls.length).toBe(1)
    expect(body.indexOf('withGovernedSpend(')).toBeGreaterThan(-1)
    expect(body.indexOf('withGovernedSpend(')).toBeLessThan(calls[0].index!)
    // …and the ungoverned reads are outside it: `getStatus` is never reached
    // from inside the wrapper.
    const wrapperEnd = body.indexOf('const observe')
    expect(body.slice(0, wrapperEnd)).not.toContain('getStatus(')
  })

  it('the provider layer is not imported by any route or cron', () => {
    const hits = productionMatches("from ['\"]@/lib/media/providers/")
    expect(hits.filter(f => f.includes('/app/'))).toEqual([])
  })

  it('a vi.fn fetch is never called when the provider is disabled', async () => {
    const spy = vi.fn()
    const p = new MuapiProvider({ env: {}, fetchImpl: spy as unknown as typeof fetch })
    await p.generateImage({ model: 'm', prompt: 'x' }).catch(() => undefined)
    await p.listModels().catch(() => undefined)
    await p.healthCheck().catch(() => undefined)
    expect(spy).not.toHaveBeenCalled()
  })
})
