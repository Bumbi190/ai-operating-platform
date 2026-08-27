/**
 * lib/media/providers/types.ts — the MediaProvider contract.
 *
 * WHY THIS EXISTS. Omnira already talks to external generation services, but it
 * talks to each of them by name: `lib/media/ideogram.ts` builds an Ideogram body
 * and reads `IDEOGRAM_API_KEY` at four separate call sites, `lib/media/elevenlabs
 * .ts` does the same for voice. That shape is fine for one vendor and becomes a
 * migration every time a second one appears. MuAPI is the second one, and
 * Higgsfield/OpenArt are already named as the third and fourth, so the vendor
 * seam gets written once, here, before the first adapter — not extracted later
 * from three copies of a fetch call.
 *
 * WHAT THIS IS NOT:
 *   • Not a replacement for the Ideogram/ElevenLabs call sites. They keep
 *     working exactly as they do; nothing in this directory is imported by the
 *     existing media pipeline. Rewriting shipped, working generation paths is a
 *     separate change with its own risk, and bundling it here would hide a
 *     migration inside a bootstrap.
 *   • Not an execution grant. Holding a provider object authorizes nothing —
 *     `gate.ts` is consulted on every outbound call, and its default is refusal.
 *     Capability must never be read as permission.
 *   • Not a model catalogue. Which model serves which job is a routing decision
 *     (`router.ts`) and, later, an orchestrator decision. The contract only says
 *     what a provider can be ASKED, never what it should be asked.
 *
 * THE TARGET SHAPE this is one layer of:
 *   Atlas → Media Orchestrator → Provider Router → MediaProvider → MuAPI
 * Only the last two exist today. The orchestrator is deliberately absent: it
 * needs a QC loop and a spend policy that Omnira has not designed yet, and a
 * stub orchestrator would become the thing everyone codes against.
 */

/** Stable provider identity. Extended, never renamed — ids reach persistence. */
export type MediaProviderId = 'muapi' | 'higgsfield' | 'openart'

/**
 * The operations a provider may expose. A provider declares the subset it can
 * actually serve; the router refuses the rest BEFORE any network call, so an
 * unsupported operation fails as a typed refusal rather than a vendor 404.
 */
export type MediaCapability =
  | 'generateImage'
  | 'editImage'
  | 'generateVideo'
  | 'imageToVideo'
  | 'lipSync'
  | 'uploadReference'
  | 'estimateCost'
  | 'discoverModels'

export const MEDIA_CAPABILITIES: readonly MediaCapability[] = [
  'generateImage',
  'editImage',
  'generateVideo',
  'imageToVideo',
  'lipSync',
  'uploadReference',
  'estimateCost',
  'discoverModels',
] as const

// ── Execution mode ───────────────────────────────────────────────────────────

/**
 * The three states a provider can be in. This is Omnira's vocabulary, not a
 * vendor's — a provider without a sandbox simply cannot be run in `test`.
 *
 * `disabled` is the default and the only state that needs no configuration.
 */
export type MediaProviderMode = 'disabled' | 'test' | 'production'

// ── Jobs ─────────────────────────────────────────────────────────────────────

/**
 * Normalized job status. MuAPI reports six values (`queued`, `pending`,
 * `processing`, `completed`, `failed`, `cancelled`); other vendors report
 * different ones. Callers see only these four, so a status check never has to
 * know which vendor produced the job.
 */
export type MediaJobStatus = 'pending' | 'running' | 'completed' | 'failed'

/**
 * A handle on an async generation. Every provider in this space is async —
 * submit returns an id, results arrive by polling or webhook — so the contract
 * has no synchronous generate. A vendor with a sync mode wraps it as a job that
 * is already `completed`, rather than the contract growing a second shape.
 */
export interface MediaJobRef {
  provider: MediaProviderId
  /** The vendor's own request id, verbatim. Never parsed, only echoed back. */
  requestId: string
  /** Vendor model/endpoint the job was submitted to, for cost attribution. */
  model: string
  submittedAt: string
  /** Which mode produced this job — a test job must never be read as real. */
  mode: Exclude<MediaProviderMode, 'disabled'>
}

export type MediaAssetKind = 'image' | 'video' | 'audio'

/** One produced artifact, normalized across vendors. */
export interface MediaAsset {
  kind: MediaAssetKind
  /** Vendor-hosted URL. Omnira persists its own copy separately (storage.ts). */
  url: string
  mimeType?: string | null
  width?: number | null
  height?: number | null
  durationSeconds?: number | null
}

/** The normalized answer to "what happened to this job?". */
export interface MediaJobResult {
  ref: MediaJobRef
  status: MediaJobStatus
  assets: MediaAsset[]
  /** Set only when `status === 'failed'`. Already secret-redacted. */
  error?: MediaProviderErrorShape | null
  /**
   * Whether this result came from a sandbox/mock run. Carried on the RESULT and
   * not merely on the config, because a persisted asset outlives the env that
   * produced it: without this flag a mock image is indistinguishable from a
   * paid one the moment it lands in a table.
   */
  simulated: boolean
}

// ── Cost ─────────────────────────────────────────────────────────────────────

/**
 * A pre-flight cost estimate. `exact: false` means the vendor gave a range or
 * Omnira fell back to a table — a spend policy must treat an inexact estimate
 * as the upper bound, never as the price.
 */
export interface MediaCostEstimate {
  provider: MediaProviderId
  model: string
  /** Vendors bill in their own unit; MuAPI bills wallet credits. */
  unit: 'credits' | 'usd'
  amount: number
  exact: boolean
}

// ── Errors ───────────────────────────────────────────────────────────────────

/**
 * Typed failure grounds. Mirrors the shape of `lib/atlas/provider-errors.ts` —
 * a closed code list plus a message — so media failures classify the same way
 * Atlas's AI-provider failures already do, instead of inventing a second scheme.
 */
export const MEDIA_PROVIDER_ERROR_CODES = [
  /** The gate refused: mode is `disabled`, or production without explicit enable. */
  'MEDIA_EXECUTION_DISABLED',
  /** Mode requires a key that is not set. Never falls back to another mode's key. */
  'MEDIA_PROVIDER_NOT_CONFIGURED',
  /** The vendor rejected the credential (401/403). */
  'MEDIA_PROVIDER_AUTHENTICATION_FAILED',
  /** The provider does not declare this capability. Refused before any call. */
  'MEDIA_CAPABILITY_UNSUPPORTED',
  /** Vendor returned a non-2xx that is not an auth failure. */
  'MEDIA_PROVIDER_REQUEST_FAILED',
  /** Vendor 2xx whose body did not carry the field the contract needs. */
  'MEDIA_PROVIDER_RESPONSE_INVALID',
  /** The generation itself failed vendor-side (job status `failed`). */
  'MEDIA_JOB_FAILED',
] as const

export type MediaProviderErrorCode = (typeof MEDIA_PROVIDER_ERROR_CODES)[number]

/** Serializable error payload — safe for logs, DB columns and API responses. */
export interface MediaProviderErrorShape {
  code: MediaProviderErrorCode
  /** Human-readable, already redacted. */
  message: string
  provider: MediaProviderId | null
  /** HTTP status when the failure came from a response; null otherwise. */
  httpStatus: number | null
  /** Whether retrying the same call could plausibly succeed. */
  retryable: boolean
}

export function isMediaProviderErrorCode(v: unknown): v is MediaProviderErrorCode {
  return typeof v === 'string' && (MEDIA_PROVIDER_ERROR_CODES as readonly string[]).includes(v)
}

// ── Provider status ──────────────────────────────────────────────────────────

/**
 * The read-only self-description a provider gives without touching the network.
 * This is what a capability/status surface renders; it must be answerable when
 * the provider is disabled, unconfigured, or offline.
 */
export interface MediaProviderStatus {
  provider: MediaProviderId
  mode: MediaProviderMode
  /** True only when mode !== 'disabled' AND that mode's credential is present. */
  configured: boolean
  /** True only when the gate would currently permit an outbound call. */
  executionAllowed: boolean
  capabilities: readonly MediaCapability[]
  /** Why execution is refused, when it is. Never contains a credential. */
  blockedReason: string | null
}

// ── Request shapes ───────────────────────────────────────────────────────────

/**
 * The vendor-neutral request fields. `model` is required and NOT defaulted: a
 * default model is a spend decision, and this layer does not make spend
 * decisions. `providerOptions` is the deliberate escape hatch — 765 MuAPI
 * endpoints have per-model fields that no neutral contract can enumerate, and
 * pretending otherwise would mean a contract change per model.
 */
export interface MediaRequestBase {
  model: string
  providerOptions?: Record<string, unknown>
  /** Cost attribution — flows into `cost_events` when execution is enabled. */
  costContext?: { projectId?: string | null; agent?: string; operation?: string }
}

export interface GenerateImageRequest extends MediaRequestBase {
  prompt: string
  negativePrompt?: string
  width?: number
  height?: number
  count?: number
}

export interface EditImageRequest extends MediaRequestBase {
  prompt: string
  /** Publicly reachable URL — use `uploadReference` for local bytes first. */
  imageUrl: string
}

export interface GenerateVideoRequest extends MediaRequestBase {
  prompt: string
  durationSeconds?: number
  aspectRatio?: string
}

export interface ImageToVideoRequest extends MediaRequestBase {
  imageUrl: string
  prompt?: string
  durationSeconds?: number
}

export interface LipSyncRequest extends MediaRequestBase {
  videoUrl: string
  audioUrl: string
}

export interface UploadReferenceRequest {
  /** Bytes to host. The provider returns a URL usable as a reference input. */
  data: Blob | ArrayBuffer | Uint8Array
  filename: string
  contentType?: string
}

export interface UploadReferenceResult {
  url: string
  provider: MediaProviderId
}

/** One entry from a provider's model catalogue, where it exposes one. */
export interface MediaModelDescriptor {
  /** The identifier to pass back as `model`. */
  name: string
  category?: string | null
  description?: string | null
}

// ── The contract ─────────────────────────────────────────────────────────────

/**
 * What every media provider must offer, and what it MAY offer.
 *
 * `describe`, `getStatus` and `capabilities` are mandatory: a provider that
 * cannot say what it is, and cannot answer for a job it created, is not usable
 * by an orchestrator at all. Every generation method is OPTIONAL and gated by
 * the `capabilities` array — that is how a provider covering only images sits
 * beside one covering only lipsync without either declaring methods it throws
 * from. The router checks `capabilities`; it never probes for a method and
 * hopes.
 */
export interface MediaProvider {
  readonly id: MediaProviderId
  readonly capabilities: readonly MediaCapability[]

  /** Never touches the network. Safe to call when disabled. */
  describe(): MediaProviderStatus

  /**
   * Proves the configured credential actually works. Gated like any other
   * outbound call, so it refuses when disabled rather than reaching the vendor.
   */
  healthCheck(): Promise<{ ok: boolean; detail: string }>

  /** Answers for a job this provider created. Mandatory. */
  getStatus(ref: MediaJobRef): Promise<MediaJobResult>

  generateImage?(req: GenerateImageRequest): Promise<MediaJobRef>
  editImage?(req: EditImageRequest): Promise<MediaJobRef>
  generateVideo?(req: GenerateVideoRequest): Promise<MediaJobRef>
  imageToVideo?(req: ImageToVideoRequest): Promise<MediaJobRef>
  lipSync?(req: LipSyncRequest): Promise<MediaJobRef>
  uploadReference?(req: UploadReferenceRequest): Promise<UploadReferenceResult>
  estimateCost?(model: string, input: Record<string, unknown>): Promise<MediaCostEstimate>
  listModels?(category?: string): Promise<MediaModelDescriptor[]>
}
