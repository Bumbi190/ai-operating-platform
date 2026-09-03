/**
 * lib/media/providers/muapi.ts — the MuAPI adapter.
 *
 * DELIBERATELY THIN. MuAPI exposes 765 versioned endpoints across text-to-image,
 * image-to-video, lipsync, audio and 3D, all behind one uniform contract:
 *
 *   POST /api/v1/{model-endpoint}   →  { request_id }
 *   GET  /api/v1/predictions/{id}/result  →  { status, outputs }
 *
 * Because the vendor contract is uniform, the adapter is one submit function and
 * one poll function; the per-model differences live entirely in the request body
 * and are passed through as `providerOptions`. Enumerating 765 endpoints as
 * typed methods would be a generated client that goes stale on the vendor's
 * release schedule, and every model added upstream would be a code change here.
 *
 * THE ADAPTER IS NOT THE MCP. Claude Code talks to MuAPI over `muapi mcp serve`
 * — a developer tool, on the developer's machine, using the developer's
 * keychain credential. Omnira's runtime never touches that path: it reads its
 * own env-scoped credential and calls the HTTP API directly. The two share a
 * vendor and nothing else, which is why an MCP that is connected in an editor
 * says nothing about whether Omnira can generate.
 *
 * RESPONSE PARSING IS TOLERANT ON PURPOSE. MuAPI's OpenAPI document declares
 * `{}` as the 200 schema for both the submit and the result endpoints — the
 * response is genuinely untyped upstream. So the extractors below probe the
 * plausible field names and fail with `MEDIA_PROVIDER_RESPONSE_INVALID` when
 * none match, rather than asserting a shape the vendor never promised.
 */

import {
  resolveMuapiConfig,
  resolveMuapiCredential,
  type EnvSource,
  type MuapiConfig,
} from './config'
import {
  MediaProviderError,
  classifyHttpFailure,
  redactMediaSecrets,
  toMediaProviderError,
} from './errors'
import {
  assertCapability,
  assertMediaExecutionAllowed,
  decideMediaExecution,
} from './gate'
import { classifyTransportFailure, statusProvesNotCreated } from '@/lib/media/job/dispatch'
import { acceptRemoteOperationId } from '@/lib/media/job/identity'
import type {
  MediaLifecycleProfile,
  EditImageRequest,
  GenerateImageRequest,
  GenerateVideoRequest,
  ImageToVideoRequest,
  LipSyncRequest,
  MediaAsset,
  MediaAssetKind,
  MediaCapability,
  MediaCostEstimate,
  MediaJobRef,
  MediaJobResult,
  MediaJobStatus,
  MediaModelDescriptor,
  MediaProvider,
  MediaProviderStatus,
  UploadReferenceRequest,
  UploadReferenceResult,
} from './types'

const PROVIDER = 'muapi' as const

/**
 * What this adapter can serve today. `discoverModels` and `estimateCost` are
 * included because MuAPI genuinely exposes both (`GET /models`,
 * `POST /models/{name}/estimate-cost`) — a capability list that overstates the
 * vendor would make the router's pre-flight refusal useless.
 */
export const MUAPI_CAPABILITIES: readonly MediaCapability[] = [
  'generateImage',
  'editImage',
  'generateVideo',
  'imageToVideo',
  'lipSync',
  'uploadReference',
  'estimateCost',
  'discoverModels',
] as const

/**
 * MuAPI's six status values, mapped onto Omnira's four.
 *
 * `cancelled` maps to `failed` rather than to a fifth state: from a caller's
 * position the two are identical — no assets, no retry that helps — and a state
 * that never changes any behaviour is a state every switch has to remember.
 */
const STATUS_MAP: Record<string, MediaJobStatus> = {
  queued: 'pending',
  pending: 'pending',
  processing: 'running',
  running: 'running',
  completed: 'completed',
  succeeded: 'completed',
  failed: 'failed',
  cancelled: 'failed',
  canceled: 'failed',
}

export function mapMuapiStatus(raw: unknown): MediaJobStatus {
  const key = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  // Unknown statuses are `running`, never `completed` or `failed`: an unknown
  // status means the job's fate is not yet established, and guessing terminal
  // in either direction is the guess that loses work or bills twice.
  return STATUS_MAP[key] ?? 'running'
}

/** Infer asset kind from a URL or a declared type. Images are the fallback. */
function inferKind(url: string, declared?: unknown): MediaAssetKind {
  const d = typeof declared === 'string' ? declared.toLowerCase() : ''
  if (d.includes('video')) return 'video'
  if (d.includes('audio')) return 'audio'
  if (d.includes('image')) return 'image'
  const clean = url.split('?')[0].toLowerCase()
  if (/\.(mp4|mov|webm|m4v)$/.test(clean)) return 'video'
  if (/\.(mp3|wav|m4a|ogg|flac)$/.test(clean)) return 'audio'
  return 'image'
}

/**
 * Pull asset URLs out of an untyped MuAPI result body.
 *
 * Walks the body looking for URL-bearing shapes rather than trusting one field
 * name, because the field differs by category (`images`, `video`, `outputs`,
 * `audio_url`, …) and the spec types none of them.
 */
export function extractAssets(body: unknown): MediaAsset[] {
  const out: MediaAsset[] = []
  const seen = new Set<string>()

  const push = (url: unknown, meta?: Record<string, unknown>) => {
    if (typeof url !== 'string') return
    if (!/^https?:\/\//i.test(url)) return
    if (seen.has(url)) return
    seen.add(url)
    out.push({
      kind: inferKind(url, meta?.type ?? meta?.content_type ?? meta?.mime_type),
      url,
      mimeType: typeof meta?.content_type === 'string' ? meta.content_type : null,
      width: typeof meta?.width === 'number' ? meta.width : null,
      height: typeof meta?.height === 'number' ? meta.height : null,
      durationSeconds: typeof meta?.duration === 'number' ? meta.duration : null,
    })
  }

  const visit = (node: unknown, depth: number): void => {
    if (depth > 6 || node === null || node === undefined) return
    if (typeof node === 'string') return push(node)
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1)
      return
    }
    if (typeof node !== 'object') return

    const rec = node as Record<string, unknown>
    for (const field of ['url', 'image_url', 'video_url', 'audio_url', 'output_url']) {
      if (typeof rec[field] === 'string') push(rec[field], rec)
    }
    for (const field of ['outputs', 'output', 'images', 'videos', 'audio', 'result', 'data', 'assets']) {
      if (field in rec) visit(rec[field], depth + 1)
    }
  }

  visit(body, 0)
  return out
}

// ── The adapter ──────────────────────────────────────────────────────────────

export interface MuapiProviderOptions {
  /** Injected for tests. Defaults to the ambient environment. */
  env?: EnvSource
  /** Injected for tests. Defaults to global fetch — no network in unit tests. */
  fetchImpl?: typeof fetch
}

/**
 * MuAPI's async lifecycle, as a matter of repository evidence.
 *
 * Every value is established from the two endpoints this adapter actually calls
 * and from `docs/architecture/muapi-media-provider.md`. Nothing here is inferred
 * from the vendor's name or from what a media API "usually" offers.
 *
 *   observation: 'poll'      `GET /api/v1/predictions/{id}/result` is the only
 *                            way to learn a job's state. No webhook appears in
 *                            the adapter, the config, or the documentation.
 *   clientIdempotency: false `POST /api/v1/{model}` takes a model body and
 *                            returns `{ request_id }`. Omnira supplies no key,
 *                            and no key field is documented.
 *   lookupByRemoteId: true   the status endpoint, given the vendor's own id.
 *   lookupByCorrelationId    ─┐ neither exists. Together these two `false`s are
 *   lookupByHistory          ─┘ the reason an ambiguous dispatch with no id read
 *                            back is UNRECOVERABLE against the provider API —
 *                            stated plainly in PHASE3_RESULT.md §11 rather than
 *                            hidden behind an automatic regeneration.
 *   cancellable: false       no cancellation endpoint is integrated. MuAPI
 *                            reports a `cancelled` STATUS, which is a state a
 *                            job can be found in — not an action Omnira can take.
 *
 * If the vendor's HTTP API does expose an operation-history endpoint, that is a
 * fact this repository does not currently contain; establishing it needs the
 * vendor's API documentation, and flipping a flag here without that evidence
 * would make a control out of a guess.
 */
export const MUAPI_LIFECYCLE: MediaLifecycleProfile = {
  observation: 'poll',
  clientIdempotency: false,
  lookupByRemoteId: true,
  lookupByCorrelationId: false,
  lookupByHistory: false,
  cancellable: false,
}

export class MuapiProvider implements MediaProvider {
  readonly id = PROVIDER
  readonly capabilities = MUAPI_CAPABILITIES
  readonly lifecycle = MUAPI_LIFECYCLE

  private readonly env: EnvSource
  private readonly fetchImpl: typeof fetch

  constructor(opts: MuapiProviderOptions = {}) {
    this.env = opts.env ?? process.env
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args))
  }

  /** Config is resolved per call, never cached: a cached mode outlives a rollback. */
  private config(): MuapiConfig {
    return resolveMuapiConfig(this.env)
  }

  describe(): MediaProviderStatus {
    const config = this.config()
    const decision = decideMediaExecution(config)
    return {
      provider: PROVIDER,
      mode: config.mode,
      configured: config.mode !== 'disabled' && config.hasCredential,
      executionAllowed: decision.allowed,
      capabilities: this.capabilities,
      blockedReason: decision.reason,
    }
  }

  /**
   * The single outbound path. Every call — generation, polling, listing, health
   * — goes through here, so the gate is consulted exactly once per request and
   * cannot be bypassed by adding a method that forgets to ask.
   */
  private async call<T = unknown>(
    operation: string,
    path: string,
    init: {
      method: 'GET' | 'POST'
      body?: unknown
      formData?: FormData
      /**
       * This call CREATES a remote operation, so every failure has to say what
       * it proves (Phase 3). Reads leave it unset: "did this create something
       * we now owe money for" is not a question a GET can raise.
       */
      creates?: boolean
    } = { method: 'GET' },
  ): Promise<T> {
    const config = this.config()
    assertMediaExecutionAllowed(config, PROVIDER, operation)

    const key = resolveMuapiCredential(this.env)
    if (!key) {
      // Unreachable while the gate is correct — the gate already refuses a mode
      // without its credential. Kept as a structural guarantee that no request
      // is ever built without one, rather than as an expected branch.
      throw new MediaProviderError({
        code: 'MEDIA_PROVIDER_NOT_CONFIGURED',
        message: `[${PROVIDER}] ${operation}: no credential for mode "${config.mode}".`,
        provider: PROVIDER,
        retryable: false,
      })
    }

    const headers: Record<string, string> = { 'x-api-key': key }
    let payload: BodyInit | undefined
    if (init.formData) {
      payload = init.formData
    } else if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      payload = JSON.stringify(init.body)
    }

    let res: Response
    try {
      res = await this.fetchImpl(`${config.baseUrl}${path}`, {
        method: init.method,
        headers,
        body: payload,
      })
    } catch (err) {
      // ── THE AMBIGUITY BOUNDARY, FOR A CREATION ──────────────────────────
      //
      // For a READ this is just a failed read. For a CREATE it is the single
      // most consequential branch in the adapter: a DNS failure proves nothing
      // was sent, while a socket reset or a fired deadline proves nothing at
      // all — the vendor may already have accepted the job and started billing.
      //
      // `classifyTransportFailure` answers only when it can PROVE the safe
      // case, and reports `'unknown'` otherwise. There is deliberately no
      // branch here that guesses toward the convenient answer.
      if (init.creates) {
        const verdict = classifyTransportFailure(err)
        if (verdict.sent === false) {
          throw new MediaProviderError({
            code: 'MEDIA_PROVIDER_REQUEST_FAILED',
            message: `[${PROVIDER}] ${operation}: the request never reached the provider (${verdict.code}).`,
            provider: PROVIDER,
            retryable: true,
            dispatchObservation: 'not_dispatched',
          })
        }
        throw new MediaProviderError({
          code: 'MEDIA_DISPATCH_UNKNOWN',
          message: `[${PROVIDER}] ${operation}: ${verdict.detail}. `
            + 'A remote operation may exist; this call must not be repeated automatically.',
          provider: PROVIDER,
          dispatchObservation: 'response_lost',
        })
      }
      throw toMediaProviderError(err, PROVIDER)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new MediaProviderError({
        // `path` is a route template with no query string, so no credential can
        // ride along into the message the way a full URL would.
        code: init.creates && !statusProvesNotCreated(res.status)
          ? 'MEDIA_DISPATCH_UNKNOWN'
          : classifyHttpFailure(res.status, text),
        message: `[${PROVIDER}] ${operation} failed (${res.status}) at ${path}: `
          + redactMediaSecrets(text).slice(0, 400)
          + (init.creates && !statusProvesNotCreated(res.status)
            ? ' — a 5xx may come from a gateway in front of a service that already accepted the request'
            : ''),
        provider: PROVIDER,
        httpStatus: res.status,
        // 4xx (429 included) is the vendor ANSWERING: it parsed the request and
        // declined to do work. 5xx is not an answer about the work.
        ...(init.creates
          ? { dispatchObservation: statusProvesNotCreated(res.status) ? 'remote_rejected' as const : 'response_lost' as const }
          : {}),
      })
    }

    try {
      return (await res.json()) as T
    } catch (err) {
      throw new MediaProviderError({
        code: init.creates ? 'MEDIA_DISPATCH_UNKNOWN' : 'MEDIA_PROVIDER_RESPONSE_INVALID',
        message: `[${PROVIDER}] ${operation}: response was not JSON (${String(err)})`
          + (init.creates ? ' — the provider answered 2xx, so the operation probably exists under an id we could not read' : ''),
        provider: PROVIDER,
        httpStatus: res.status,
        // 2xx means the vendor accepted it. Our own inability to read the answer
        // is an EVIDENCE failure, not a creation failure — the strongest form of
        // "it exists and we cannot name it".
        ...(init.creates ? { dispatchObservation: 'confirmed_evidence_failed' as const } : {}),
      })
    }
  }

  /** Submit to a model endpoint and normalize the async handle. */
  private async submit(
    capability: MediaCapability,
    model: string,
    body: Record<string, unknown>,
  ): Promise<MediaJobRef> {
    assertCapability(this.capabilities, capability, PROVIDER)
    const config = this.config()

    const res = await this.call<{ request_id?: unknown; id?: unknown }>(
      capability,
      `/api/v1/${encodeURIComponent(model)}`,
      { method: 'POST', body, creates: true },
    )

    // A 2xx WITH NO USABLE ID IS NOT A FAILED CREATION.
    //
    // The vendor answered success, so an operation almost certainly exists and
    // is almost certainly billing. What Omnira lost is the ability to NAME it —
    // and with no lookup-by-correlation and no history endpoint (see
    // `MUAPI_LIFECYCLE` below), naming is the only way back to it.
    //
    // This used to be `MEDIA_PROVIDER_RESPONSE_INVALID`, which reads as "the
    // vendor sent us junk" and invites a retry. It is the opposite: the vendor
    // did its job and we cannot prove which job.
    const accepted = acceptRemoteOperationId(
      typeof res?.request_id === 'string' ? res.request_id : res?.id,
    )

    if (!accepted.ok) {
      throw new MediaProviderError({
        code: 'MEDIA_DISPATCH_UNKNOWN',
        message: `[${PROVIDER}] ${capability}: the provider accepted the request but its `
          + `operation id was unusable (${accepted.refusal}). A remote operation may exist `
          + 'and cannot be observed; this call must not be repeated automatically.',
        provider: PROVIDER,
        dispatchObservation: 'confirmed_evidence_failed',
      })
    }

    return {
      provider: PROVIDER,
      requestId: accepted.id,
      model,
      submittedAt: new Date().toISOString(),
      // Narrowed safely: the gate has already refused `disabled` by this point.
      mode: config.mode === 'production' ? 'production' : 'test',
    }
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      await this.call('healthCheck', '/api/v1/account/balance', { method: 'GET' })
      const { mode } = this.config()
      return { ok: true, detail: `MuAPI reachable and credential accepted (mode=${mode}).` }
    } catch (err) {
      const e = toMediaProviderError(err, PROVIDER)
      return { ok: false, detail: `${e.code}: ${e.message}` }
    }
  }

  async getStatus(ref: MediaJobRef): Promise<MediaJobResult> {
    const body = await this.call<Record<string, unknown>>(
      'getStatus',
      `/api/v1/predictions/${encodeURIComponent(ref.requestId)}/result`,
      { method: 'GET' },
    )

    const status = mapMuapiStatus(body?.status)
    const assets = status === 'completed' ? extractAssets(body) : []

    return {
      ref,
      status,
      assets,
      error: status === 'failed'
        ? new MediaProviderError({
            code: 'MEDIA_JOB_FAILED',
            message: `[${PROVIDER}] job ${ref.requestId} failed: `
              + redactMediaSecrets(String(body?.error ?? body?.message ?? 'no detail given')),
            provider: PROVIDER,
            retryable: false,
          }).toShape()
        : null,
      // Derived from the job's OWN recorded mode, not from current config: a
      // config change between submit and poll must not relabel a mock asset as
      // a paid one.
      simulated: ref.mode === 'test',
    }
  }

  async generateImage(req: GenerateImageRequest): Promise<MediaJobRef> {
    return this.submit('generateImage', req.model, {
      prompt: req.prompt,
      ...(req.negativePrompt ? { negative_prompt: req.negativePrompt } : {}),
      ...(req.width ? { width: req.width } : {}),
      ...(req.height ? { height: req.height } : {}),
      ...(req.count ? { num_images: req.count } : {}),
      ...req.providerOptions,
    })
  }

  async editImage(req: EditImageRequest): Promise<MediaJobRef> {
    return this.submit('editImage', req.model, {
      prompt: req.prompt,
      image_url: req.imageUrl,
      ...req.providerOptions,
    })
  }

  async generateVideo(req: GenerateVideoRequest): Promise<MediaJobRef> {
    return this.submit('generateVideo', req.model, {
      prompt: req.prompt,
      ...(req.durationSeconds ? { duration: req.durationSeconds } : {}),
      ...(req.aspectRatio ? { aspect_ratio: req.aspectRatio } : {}),
      ...req.providerOptions,
    })
  }

  async imageToVideo(req: ImageToVideoRequest): Promise<MediaJobRef> {
    return this.submit('imageToVideo', req.model, {
      image_url: req.imageUrl,
      ...(req.prompt ? { prompt: req.prompt } : {}),
      ...(req.durationSeconds ? { duration: req.durationSeconds } : {}),
      ...req.providerOptions,
    })
  }

  async lipSync(req: LipSyncRequest): Promise<MediaJobRef> {
    return this.submit('lipSync', req.model, {
      video_url: req.videoUrl,
      audio_url: req.audioUrl,
      ...req.providerOptions,
    })
  }

  async uploadReference(req: UploadReferenceRequest): Promise<UploadReferenceResult> {
    assertCapability(this.capabilities, 'uploadReference', PROVIDER)
    const form = new FormData()
    const blob = req.data instanceof Blob
      ? req.data
      : new Blob([req.data as BlobPart], { type: req.contentType ?? 'application/octet-stream' })
    form.append('file', blob, req.filename)

    const res = await this.call<Record<string, unknown>>(
      'uploadReference',
      '/api/v1/upload_file',
      { method: 'POST', formData: form },
    )

    const url = [res?.url, res?.file_url, res?.download_url]
      .find((v): v is string => typeof v === 'string' && /^https?:\/\//i.test(v))

    if (!url) {
      throw new MediaProviderError({
        code: 'MEDIA_PROVIDER_RESPONSE_INVALID',
        message: `[${PROVIDER}] uploadReference: response carried no URL.`,
        provider: PROVIDER,
      })
    }
    return { url, provider: PROVIDER }
  }

  async estimateCost(model: string, input: Record<string, unknown>): Promise<MediaCostEstimate> {
    assertCapability(this.capabilities, 'estimateCost', PROVIDER)
    const res = await this.call<Record<string, unknown>>(
      'estimateCost',
      `/api/v1/models/${encodeURIComponent(model)}/estimate-cost`,
      { method: 'POST', body: input },
    )

    const amount = [res?.cost, res?.credits, res?.estimated_cost, res?.price]
      .find((v): v is number => typeof v === 'number')

    if (amount === undefined) {
      throw new MediaProviderError({
        code: 'MEDIA_PROVIDER_RESPONSE_INVALID',
        message: `[${PROVIDER}] estimateCost: response carried no numeric cost.`,
        provider: PROVIDER,
      })
    }

    return {
      provider: PROVIDER,
      model,
      unit: 'credits',
      amount,
      // MuAPI bills per-model dynamically; a returned figure is the vendor's
      // own estimate, so a spend policy must treat it as an upper bound.
      exact: false,
    }
  }

  async listModels(category?: string): Promise<MediaModelDescriptor[]> {
    assertCapability(this.capabilities, 'discoverModels', PROVIDER)
    const query = category ? `?category=${encodeURIComponent(category)}` : ''
    const res = await this.call<unknown>('discoverModels', `/api/v1/models${query}`, { method: 'GET' })

    const rows = Array.isArray(res)
      ? res
      : Array.isArray((res as Record<string, unknown>)?.models)
        ? ((res as Record<string, unknown>).models as unknown[])
        : []

    return rows.flatMap((row): MediaModelDescriptor[] => {
      if (!row || typeof row !== 'object') return []
      const r = row as Record<string, unknown>
      const name = [r.name, r.endpoint, r.id].find((v): v is string => typeof v === 'string')
      if (!name) return []
      return [{
        name,
        category: typeof r.category === 'string' ? r.category : null,
        description: typeof r.description === 'string' ? r.description : null,
      }]
    })
  }
}
