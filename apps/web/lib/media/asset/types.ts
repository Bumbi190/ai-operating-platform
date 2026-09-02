/**
 * lib/media/asset/types.ts — the canonical Asset contract.
 *
 * WHY THIS EXISTS. Omnira generates media and keeps only a URL string:
 * `media_scripts.images` is a jsonb array of public URLs, `website_content
 * .hero_image_url` is text, `outputs.file_url` is text. Nothing in the schema
 * can answer "what is this file, what made it, and may we show it to anyone" —
 * and `app/api/outputs/[id]/route.ts` already has to recover a storage path by
 * splitting a public URL on a hardcoded prefix, which is what happens when a
 * location is asked to serve as an identity.
 *
 * Intelligence Fabric ch21 names the rule this module implements:
 *   §21.7  "URLs may expire, redirect, change, or disappear. Canonical Asset
 *           identity shall remain independent."
 *   §21.9  Storage paths are implementation details.
 *   §21.4  "Output identity and Asset identity shall remain distinct."
 *
 * THE ONE INVARIANT: an `AssetId` is the only durable handle. Bucket, path, URL,
 * filename and provider object id are all attributes that may change while the
 * asset stays the same asset.
 *
 * WHAT THIS IS NOT:
 *   • Not a DAM. No collections, tags, folders, or rights model. Canon defines
 *     Representations and Renditions (§21.23-21.35); Phase 1 stores one location
 *     per asset because Omnira produces one.
 *   • Not a billing ledger. `cost_events` remains the only spend record;
 *     provenance carries a link, never an amount.
 *   • Not an authority. `provenance.provider === 'ideogram'` records what
 *     happened; it never permits calling Ideogram. Capability is not permission.
 *   • Not a replacement for `lib/media/storage.ts`. Those functions keep serving
 *     the legacy URL-string paths untouched. Phase 1 is forward-only.
 */

// ── Identity ─────────────────────────────────────────────────────────────────

/**
 * The canonical handle. A branded string rather than a bare `string` so that a
 * URL, a storage path, or a provider request id cannot be passed where an asset
 * identity is required — the single mistake this whole module exists to prevent,
 * caught by the compiler instead of by a code review.
 */
export type AssetId = string & { readonly __brand: 'AssetId' }

/** Narrow a raw uuid from the database into an `AssetId`. */
export function asAssetId(raw: string): AssetId {
  return raw as AssetId
}

// ── Closed vocabularies (mirror the CHECK constraints exactly) ───────────────

export const ASSET_KINDS = ['image', 'video', 'audio'] as const
export type AssetKind = (typeof ASSET_KINDS)[number]

/**
 * Two values, deliberately. The smallest vocabulary that separates "not for the
 * world" from "published", which is the distinction Phase 1 must be able to make
 * safely. `internal` covers private/internal/draft; splitting them further would
 * be an ACL system nobody has a use for yet.
 *
 * `internal` is the DEFAULT everywhere — in the column, in the type, and in
 * `admitAsset` — so that a forgotten field can never produce a public asset.
 */
export const ASSET_VISIBILITIES = ['internal', 'public'] as const
export type AssetVisibility = (typeof ASSET_VISIBILITIES)[number]

/** Matches the repository's existing lifecycle convention. */
export const ASSET_STATUSES = ['active', 'archived', 'superseded'] as const
export type AssetStatus = (typeof ASSET_STATUSES)[number]

/**
 * How the bytes came to exist. `uploaded` is why every provider field on
 * `AssetProvenance` is optional: a human-supplied character reference is a
 * first-class asset with no provider at all.
 */
export const PROVENANCE_SOURCES = ['generated', 'uploaded', 'derived', 'imported'] as const
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number]

// ── Storage location ─────────────────────────────────────────────────────────

/**
 * WHERE the bytes are. Bucket and path are carried separately and never as a
 * URL, so that no consumer has to parse a URL to find the object.
 *
 * This type is deliberately NOT called `AssetLocation` on the asset itself in a
 * way that suggests permanence: it is the *current* location. Moving an object
 * updates this and does not create a new asset (§21.9).
 */
export interface StorageLocation {
  bucket: string
  path: string
}

// ── The asset ────────────────────────────────────────────────────────────────

export interface Asset {
  id: AssetId
  projectId: string
  kind: AssetKind
  mimeType: string
  byteSize: number
  /** Lowercase hex sha256 of the exact stored bytes. Integrity evidence (§21.3). */
  checksumSha256: string
  /** Null where the medium has no such property, not where it was not measured. */
  width: number | null
  height: number | null
  durationMs: number | null
  visibility: AssetVisibility
  status: AssetStatus
  storage: StorageLocation
  createdAt: string
}

// ── Provenance ───────────────────────────────────────────────────────────────

/**
 * What produced one asset. Written at admission, never afterwards — the database
 * enforces this with an append-only trigger, so a later bug cannot rewrite the
 * record of what made an image.
 *
 * REQUIRED vs OPTIONAL is the load-bearing distinction here. `source` is the only
 * required field, because it is the only one every asset has. Everything else is
 * nullable so that no provider can make a field mandatory at the canonical layer
 * — canon §6.254 forbids adapters silently dropping requested features, and the
 * mirror of that rule is that the canonical layer must not silently require
 * vendor-specific ones.
 */
export interface AssetProvenance {
  assetId: AssetId
  source: ProvenanceSource

  /** Which vendor produced the bytes. A record of the past, never a grant. */
  provider: string | null
  model: string | null
  /** The vendor's own id, verbatim. Echoed, never parsed. */
  providerRequestId: string | null
  /** §16.21 — historical executions preserve the exact adapter version used. */
  adapterVersion: string | null
  seed: string | null

  /**
   * Hashes, not payloads. "Was this the same request?" is answerable without
   * this table becoming a second content store — or a place where retrieved
   * text is persisted and might later be re-read as an instruction.
   */
  briefHash: string | null
  requestHash: string | null

  /**
   * Canonical reference assets BY IDENTITY. The foundation for recurring
   * characters. Admission requires each to exist in the same project.
   */
  referenceAssetIds: AssetId[]

  /** A link into `cost_events`. Never an amount — that table is the only ledger. */
  costEventId: string | null
  durationMs: number | null

  /** True when a sandbox/mock produced this. Carried on the record, not the env. */
  simulated: boolean

  /** Vendor fields with no canonical home. Always optional. */
  providerMetadata: Record<string, unknown>

  recordedAt: string
}

/** An asset and the record of what made it — what admission returns. */
export interface AdmittedAsset {
  asset: Asset
  provenance: AssetProvenance
}

// ── Legacy boundary ──────────────────────────────────────────────────────────

/**
 * A media reference that is NOT an asset: a bare URL from a pre-Phase-1 row.
 *
 * This type exists so that legacy media stays *visibly* legacy at the type
 * level. Phase 1 is forward-only, and the failure mode it is guarding against is
 * a later change quietly treating `media_scripts.images[0]` as though it were a
 * canonical identity. A URL cannot be widened into an `AssetId`; converting one
 * requires actually admitting the bytes.
 */
export interface LegacyMediaRef {
  readonly kind: 'legacy-url'
  url: string
}

export function legacyMediaRef(url: string): LegacyMediaRef {
  return { kind: 'legacy-url', url }
}

/** Whether a value is a canonical asset reference rather than a legacy URL. */
export function isLegacyMediaRef(v: unknown): v is LegacyMediaRef {
  return typeof v === 'object' && v !== null && (v as LegacyMediaRef).kind === 'legacy-url'
}
