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
import type {
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

export class MuapiProvider implements MediaProvider {
  readonly id = PROVIDER
  readonly capabilities = MUAPI_CAPABILITIES

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
    init: { method: 'GET' | 'POST'; body?: unknown; formData?: FormData } = { method: 'GET' },
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
      throw toMediaProviderError(err, PROVIDER)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new MediaProviderError({
        // `path` is a route template with no query string, so no credential can
        // ride along into the message the way a full URL would.
        code: classifyHttpFailure(res.status, text),
        message: `[${PROVIDER}] ${operation} failed (${res.status}) at ${path}: `
          + redactMediaSecrets(text).slice(0, 400),
        provider: PROVIDER,
        httpStatus: res.status,
      })
    }

    try {
      return (await res.json()) as T
    } catch (err) {
      throw new MediaProviderError({
        code: 'MEDIA_PROVIDER_RESPONSE_INVALID',
        message: `[${PROVIDER}] ${operation}: response was not JSON (${String(err)})`,
        provider: PROVIDER,
        httpStatus: res.status,
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
      { method: 'POST', body },
    )

    const requestId = typeof res?.request_id === 'string'
      ? res.request_id
      : typeof res?.id === 'string' ? res.id : null

    if (!requestId) {
      throw new MediaProviderError({
        code: 'MEDIA_PROVIDER_RESPONSE_INVALID',
        message: `[${PROVIDER}] ${capability}: response carried no request_id.`,
        provider: PROVIDER,
      })
    }

    return {
      provider: PROVIDER,
      requestId,
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
