/**
 * lib/media/asset/admission.ts — Output-to-Asset admission (§21.5).
 *
 * THE ONE ENTRY POINT by which generated or uploaded bytes become a canonical
 * Omnira asset. Everything upstream produces an *Output*; this function is where
 * an Output becomes an *Asset*, and canon is explicit that the two are different
 * things (§21.4: "Output identity and Asset identity shall remain distinct").
 *
 * Canon §21.5 lists what must happen before an Output may be called an Asset:
 *
 *     retrieval · integrity validation · type validation · classification
 *     provenance capture · storage · rights-state assignment · lifecycle
 *
 * This function performs them IN THAT ORDER and refuses at the first failure.
 * The ordering is load-bearing: bytes are validated before they are stored, and
 * stored before a row exists, so a rejected Output leaves nothing behind that a
 * later reader could mistake for an asset.
 *
 * WHAT THIS IS NOT:
 *   • Not a generator. It never calls a provider, never chooses a model, and
 *     never spends. It receives bytes (or a URL to retrieve them from) that some
 *     already-governed path produced.
 *   • Not a spend boundary. `withGovernedSpend` remains the only place money is
 *     reserved and settled. Provenance carries a LINK to the cost event, never
 *     an amount — an asset must not become a second billing ledger.
 *   • Not a publisher. Admitting an asset grants no right to show it to anyone;
 *     `visibility` is a property of the asset, and publication is a separate,
 *     separately-authorized act.
 *   • Not a migration. Nothing here reads or rewrites the legacy URL columns.
 *
 * FAIL CLOSED. Every refusal path throws `AssetRejectedError` with a typed code.
 * There is no branch that stores bytes it could not validate, and no branch that
 * writes a row whose provenance it could not capture.
 */

import 'server-only'

import { createHash } from 'node:crypto'
import {
  AssetRejectedError,
  assertBucketTrusted,
  assertBytesMatchMime,
  assertMimeAdmitted,
  assertPathSafe,
  assertProjectId,
  assertSizeWithinBounds,
  assertSourceUrlTrusted,
  assertVisibilityPlacement,
  BUCKET_FOR_VISIBILITY,
  EXTENSION_FOR_MIME,
} from './validate'
import {
  assertReferencesUsable,
  deleteAssetRow,
  insertAsset,
  insertProvenance,
  putAssetBytes,
  removeAssetBytes,
  sha256Hex,
} from './store'
import type {
  AdmittedAsset,
  AssetId,
  AssetKind,
  AssetVisibility,
  ProvenanceSource,
  StorageLocation,
} from './types'

/**
 * The bucket a PUBLISHED asset goes to.
 *
 * Re-exported from the visibility map rather than declared independently, so
 * there is exactly one place that decides where published bytes live. There is
 * deliberately no "default bucket" constant any more: a default is what let a
 * caller omit the decision, and the bucket is no longer a caller decision.
 */
export const PUBLIC_ASSET_BUCKET = BUCKET_FOR_VISIBILITY.public

/** Retrieval ceiling. Bounds how long one hung provider can hold a request. */
const RETRIEVAL_TIMEOUT_MS = 30_000

// ── Provenance the caller supplies ───────────────────────────────────────────

/**
 * What the caller knows about where the bytes came from.
 *
 * `source` is the only required field. Every provider field is optional so an
 * uploaded character reference — which has no provider, no model and no seed —
 * is admitted by the same function as a generated image, rather than needing a
 * second path that would inevitably validate less.
 */
export interface ProvenanceInput {
  source: ProvenanceSource
  provider?: string | null
  model?: string | null
  providerRequestId?: string | null
  adapterVersion?: string | null
  seed?: string | null
  /** The canonical creative intent. Hashed here; the payload is never stored. */
  brief?: unknown
  /** The exact provider request. Hashed here; the payload is never stored. */
  request?: unknown
  referenceAssetIds?: readonly AssetId[]
  costEventId?: string | null
  durationMs?: number | null
  simulated?: boolean
  providerMetadata?: Record<string, unknown>
}

export interface AdmitAssetInput {
  projectId: string
  kind: AssetKind
  /**
   * Defaults to `internal`. The default is the fail-closed half of the
   * visibility model: an omitted field can never produce a public asset.
   */
  visibility?: AssetVisibility
  /**
   * Where the bytes should live — PATH ONLY.
   *
   * THE BUCKET IS NOT A CALLER CHOICE. It is derived from `visibility` via
   * `BUCKET_FOR_VISIBILITY`, so a caller cannot pair a draft with a public
   * bucket even by mistake. This is the difference between a rule that is
   * checked and a rule that cannot be expressed: there is no argument here that
   * could carry the wrong answer.
   *
   * `path` is supplied WITHOUT a file extension — admission appends the one that
   * matches the validated MIME type. That ordering is forced by URL admission
   * (the caller cannot know the type before retrieval) and it makes an extension
   * that disagrees with the bytes impossible, which the legacy
   * `contentType.includes('png') ? 'png' : 'jpg'` helper could not promise.
   */
  storage: { path: string }
  /** Intrinsic properties, where the caller knows them. Never guessed. */
  width?: number | null
  height?: number | null
  durationMs?: number | null
  provenance: ProvenanceInput
}

/** Admit bytes the caller already holds. */
export interface AdmitBytesInput extends AdmitAssetInput {
  bytes: Uint8Array
  mimeType: string
}

/** Admit bytes that must first be retrieved from a provider URL. */
export interface AdmitFromUrlInput extends AdmitAssetInput {
  sourceUrl: string
  /** Overrides the response's Content-Type. Still magic-number verified. */
  mimeType?: string
  /**
   * Optional host pinning, supplied by the layer that knows its provider.
   *
   * Deliberately NOT a constant in the asset layer: the provider CDN hosts are
   * not recorded anywhere in this repository, and a guessed allowlist would
   * fail closed against the working path while looking like a control. The
   * structural defences in `assertSourceUrlTrusted` apply either way.
   */
  allowedHosts?: readonly string[]
}

// ── Hashing ──────────────────────────────────────────────────────────────────

/**
 * Stable hash of a request or brief.
 *
 * Keys are sorted recursively so that two structurally identical briefs hash
 * identically regardless of property order — otherwise "was this the same
 * request?" would depend on JSON serialisation order, which no caller controls.
 *
 * Only the HASH is persisted. A brief may contain editorial text drawn from
 * retrieved articles, and a prompt may contain arbitrary third-party content;
 * storing the payload would turn the provenance table into a second content
 * store and into text that some later feature might re-read as an instruction.
 */
export function canonicalHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

// ── Retrieval ────────────────────────────────────────────────────────────────

/**
 * Fetch bytes from a trusted generation origin.
 *
 * The URL is validated BEFORE the fetch, so a refused URL never reaches the
 * network — that ordering is what makes this an SSRF control rather than a log
 * of one. `assertSourceUrlTrusted` enforces https, rejects IP literals and
 * non-public hostname shapes, and applies the caller's optional host pinning.
 *
 * Redirects are followed by `fetch` and are NOT re-validated: that would need
 * per-hop control `fetch` does not expose. Named in validate.ts as a known gap.
 */
async function retrieveBytes(
  sourceUrl: string,
  allowedHosts?: readonly string[],
): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  assertSourceUrlTrusted(sourceUrl, allowedHosts)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RETRIEVAL_TIMEOUT_MS)
  try {
    const res = await fetch(sourceUrl, { signal: controller.signal, redirect: 'follow' })
    if (!res.ok) {
      throw new AssetRejectedError(
        'ASSET_SOURCE_UNTRUSTED',
        `Retrieval failed with HTTP ${res.status}.`,
      )
    }
    const buf = new Uint8Array(await res.arrayBuffer())
    return { bytes: buf, contentType: res.headers.get('content-type') }
  } catch (err) {
    if (err instanceof AssetRejectedError) throw err
    const msg = err instanceof Error ? err.message : String(err)
    throw new AssetRejectedError('ASSET_SOURCE_UNTRUSTED', `Retrieval failed: ${msg}`)
  } finally {
    clearTimeout(timer)
  }
}

// ── Admission ────────────────────────────────────────────────────────────────

/**
 * Admit bytes already in hand as a canonical asset.
 *
 * The order below is canon §21.5's, and each step is a refusal point:
 *
 *   1. identity      — a project must own it
 *   2. classification— visibility resolved (default `internal`)
 *   3. destination   — bucket trusted, path safe, visibility/placement agree
 *   4. type          — MIME admitted for the kind
 *   5. integrity     — size bounded, bytes match the declared type, checksum
 *   6. references    — every referenced asset exists, in this project
 *   7. storage       — bytes placed
 *   8. row           — asset identity created
 *   9. provenance    — captured; failure UNWINDS 7 and 8
 *
 * Step 9's unwind matters: an asset row whose provenance insert failed would be
 * an asset nobody can explain, which §21.5 says must not exist. Better to leave
 * nothing than to leave something unaccountable.
 */
export async function admitAssetBytes(input: AdmitBytesInput): Promise<AdmittedAsset> {
  // 1 — identity
  const projectId = assertProjectId(input.projectId)

  // 2 — classification. Default `internal`: never inferred from destination.
  const visibility: AssetVisibility = input.visibility ?? 'internal'

  // 3 — destination. The bucket is DERIVED from visibility, never supplied:
  //     `AdmitAssetInput.storage` has no bucket field, so "draft into the public
  //     bucket" is not a mistake a caller is able to make. The two assertions
  //     that follow are therefore belt-and-braces over a derivation that is
  //     already correct — kept because the failure they guard against is silent.
  //     Path is checked BEFORE the extension is appended, so a traversal cannot
  //     hide in the caller's segment.
  const bucket = BUCKET_FOR_VISIBILITY[visibility]
  assertBucketTrusted(bucket)
  assertPathSafe(input.storage.path)
  assertVisibilityPlacement(visibility, bucket)

  // 4 — type
  assertMimeAdmitted(input.kind, input.mimeType)

  // 5 — integrity
  const byteSize = input.bytes.byteLength
  assertSizeWithinBounds(input.kind, byteSize)
  assertBytesMatchMime(input.bytes, input.mimeType)
  const checksum = sha256Hex(input.bytes)

  // The extension is derived from the type that just passed the magic-number
  // check, so the path can never claim a format the bytes are not.
  const extension = EXTENSION_FOR_MIME[input.mimeType]
  if (!extension) {
    throw new AssetRejectedError(
      'ASSET_MIME_UNSUPPORTED',
      `No canonical file extension is defined for "${input.mimeType}".`,
    )
  }
  const location: StorageLocation = { bucket, path: `${input.storage.path}.${extension}` }

  // 6 — references, by identity and same-project
  const referenceAssetIds = input.provenance.referenceAssetIds ?? []
  await assertReferencesUsable(projectId, referenceAssetIds)

  // 7 — storage
  await putAssetBytes(location, input.bytes, input.mimeType)

  // 8 — identity row
  let asset
  try {
    asset = await insertAsset({
      projectId,
      kind:           input.kind,
      mimeType:       input.mimeType,
      byteSize,
      checksumSha256: checksum,
      width:          input.width ?? null,
      height:         input.height ?? null,
      durationMs:     input.durationMs ?? null,
      visibility,
      storage:        location,
    })
  } catch (err) {
    await removeAssetBytes(location)
    throw err
  }

  // 9 — provenance. An asset without it must not survive.
  try {
    const provenance = await insertProvenance({
      assetId:           asset.id,
      source:            input.provenance.source,
      provider:          input.provenance.provider,
      model:             input.provenance.model,
      providerRequestId: input.provenance.providerRequestId,
      adapterVersion:    input.provenance.adapterVersion,
      seed:              input.provenance.seed,
      briefHash:         input.provenance.brief   !== undefined ? canonicalHash(input.provenance.brief)   : null,
      requestHash:       input.provenance.request !== undefined ? canonicalHash(input.provenance.request) : null,
      referenceAssetIds,
      costEventId:       input.provenance.costEventId,
      durationMs:        input.provenance.durationMs,
      simulated:         input.provenance.simulated,
      providerMetadata:  input.provenance.providerMetadata,
    })
    return { asset, provenance }
  } catch (err) {
    await deleteAssetRow(asset.id)
    await removeAssetBytes(location)
    throw err
  }
}

/**
 * Retrieve bytes from a provider URL, then admit them.
 *
 * The provider URL is used ONLY to fetch. It is never persisted: canon §21.7 is
 * that a URL is a location, not an identity, and a vendor URL in particular is
 * short-lived. What survives is the checksum and the storage location, both of
 * which Omnira controls.
 *
 * A `Content-Type` from the response is treated as a CLAIM, not a fact — it is
 * used only to pick the expected type when the caller did not state one, and the
 * magic-number check in `admitAssetBytes` still has to agree.
 */
export async function admitAssetFromUrl(input: AdmitFromUrlInput): Promise<AdmittedAsset> {
  const { bytes, contentType } = await retrieveBytes(input.sourceUrl, input.allowedHosts)

  const declared = input.mimeType ?? normalizeContentType(contentType)
  if (!declared) {
    throw new AssetRejectedError(
      'ASSET_MIME_UNSUPPORTED',
      'Source did not state a usable content type and none was supplied.',
    )
  }

  return admitAssetBytes({ ...input, bytes, mimeType: declared })
}

/** Strip parameters (`image/png; charset=…`) and normalise case. */
function normalizeContentType(raw: string | null): string | null {
  if (!raw) return null
  const base = raw.split(';')[0]?.trim().toLowerCase()
  return base && base.length > 0 ? base : null
}
