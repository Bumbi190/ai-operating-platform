/**
 * lib/media/asset/store.ts — asset persistence and byte placement.
 *
 * The ONLY module that writes `public.assets` / `public.asset_provenance` or
 * puts asset bytes into storage. Everything else goes through `admission.ts`,
 * which is the only caller of this file.
 *
 * WHY THIS IS SEPARATE FROM `lib/media/storage.ts`. That module is the LEGACY
 * boundary: `uploadSceneImage` and `uploadArticleHeroImage` return a public URL
 * and nothing else, which is precisely the shape that made the asset problem —
 * a caller receives a URL, so a URL is what it stores. This module returns a
 * `StorageLocation` (bucket + path) and never a URL, so a caller physically
 * cannot record a URL as identity. `lib/media/storage.ts` is untouched and keeps
 * serving the eight pre-existing call sites; Phase 1 is forward-only.
 *
 * WHY THE TYPE CASTS. `assets` and `asset_provenance` do not exist in
 * `lib/supabase/database.types.ts` until the migration is applied and the types
 * are regenerated (`supabase gen types typescript …`, per the note in
 * `lib/supabase/types.ts`). The repository already handles a not-yet-generated
 * table the same way — `(db as any).from('bug_reports')` in `lib/bugs/report.ts`
 * — so this follows the existing convention rather than inventing one.
 *
 * The casts are confined to this file and to two table names. Once the migration
 * is applied and types regenerated, removing them is a deletion, not a refactor.
 * Nothing above this module sees `any`: `admission.ts` and every caller work
 * with the fully-typed `Asset` / `AssetProvenance` shapes.
 */

import 'server-only'

import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { AssetRejectedError, PUBLIC_BUCKETS } from './validate'
import {
  asAssetId,
  type Asset,
  type AssetId,
  type AssetProvenance,
  type StorageLocation,
} from './types'

/** Lowercase hex sha256 of the exact bytes. The asset's integrity evidence. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

// ── Byte placement ───────────────────────────────────────────────────────────

/**
 * Put bytes at a validated location and return WHERE they went.
 *
 * Returns a `StorageLocation`, deliberately never a URL. A delivery URL is a
 * derived, expiring access artifact (§21.7); producing one here would put it in
 * every caller's hand at exactly the moment they are deciding what to persist.
 *
 * `upsert: false` so an admission can never silently overwrite another asset's
 * bytes. The unique constraint on `(storage_bucket, storage_path)` is the second
 * half of that guarantee — this one fails at the object, that one at the row.
 */
export async function putAssetBytes(
  location: StorageLocation,
  bytes: Uint8Array,
  contentType: string,
): Promise<StorageLocation> {
  const db = createAdminClient()

  const { error } = await db.storage
    .from(location.bucket)
    .upload(location.path, bytes, { contentType, upsert: false })

  if (error) {
    throw new Error(`Asset byte placement failed at ${location.bucket}/${location.path}: ${error.message}`)
  }

  return location
}

/**
 * Derive a delivery URL for an asset's CURRENT location.
 *
 * DERIVED, never stored as identity. This is the direction canon requires: an
 * identity produces a URL on demand (§21.7), rather than a URL being kept and
 * later reverse-engineered back into a location. `app/api/outputs/[id]/route.ts`
 * does the latter —
 *
 *     output.file_url.split('/storage/v1/object/public/outputs/')[1]
 *
 * — and breaks if the bucket is renamed, if the URL is signed, or if Supabase
 * changes its URL shape. Nothing built on this function can acquire that bug,
 * because the bucket and path are already known before a URL exists.
 *
 * REFUSES a non-public bucket. `getPublicUrl` is a pure string builder — it will
 * happily construct an `/object/public/…` URL for a private bucket, and Supabase
 * will then serve a 400 to whoever follows it. Returning that string would put a
 * dead link into `hero_image_url` and fail at render time, far from the cause.
 * Refusing here turns a silent breakage into a loud one at the only moment
 * anyone can act on it.
 *
 * A private asset needs `signedAssetUrl` plus an authorization decision, which
 * is a delivery concern Phase 1 does not build.
 */
export function publicDeliveryUrl(location: StorageLocation): string {
  if (!(PUBLIC_BUCKETS as readonly string[]).includes(location.bucket)) {
    throw new AssetRejectedError(
      'ASSET_VISIBILITY_UNSAFE',
      `"${location.bucket}" is not a public bucket — a public delivery URL cannot be derived `
        + 'from it. Use signedAssetUrl() with an authorization decision instead.',
    )
  }
  const db = createAdminClient()
  const { data } = db.storage.from(location.bucket).getPublicUrl(location.path)
  return data.publicUrl
}

/**
 * Mint a TEMPORARY access URL for a private asset.
 *
 * ── WHY THIS IS A FUNCTION AND NOT A COLUMN ────────────────────────────────
 * A signed URL is a delivery artifact with an expiry. Persisting one would
 * recreate, for private assets, exactly the defect Phase 1 exists to remove:
 * a URL standing in for an identity. It would also age badly in a way a public
 * URL does not — a stored signed URL is not merely indirect, it is *wrong*
 * after `expiresInSeconds`, and every reader would have to know that.
 *
 * So: nothing persists the return value. `assets` stores bucket + path; this
 * derives an access URL from them at the moment of use, and the caller is
 * expected to hand it straight to a response.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 * NOT an authorization decision. It signs whatever location it is given. The
 * decision "may THIS viewer see THIS asset" belongs to the route that calls it,
 * against the `assets` row's `project_id` — and Phase 1 builds no such route,
 * because a user-facing draft view is publication-adjacent work that was
 * explicitly out of scope. This helper exists so the private bucket is provably
 * reachable by Omnira, not so drafts can be shared.
 *
 * Default 1 hour, matching the only existing precedent in the repository
 * (`app/api/outputs/[id]/route.ts` uses 3600).
 */
export async function signedAssetUrl(
  location: StorageLocation,
  expiresInSeconds = 3600,
): Promise<string> {
  const db = createAdminClient()
  const { data, error } = await db.storage
    .from(location.bucket)
    .createSignedUrl(location.path, expiresInSeconds)

  if (error || !data?.signedUrl) {
    throw new Error(
      `Could not sign ${location.bucket}/${location.path}: ${error?.message ?? 'no url returned'}`,
    )
  }
  return data.signedUrl
}

/** Best-effort removal, for unwinding a failed admission. Never throws. */
export async function removeAssetBytes(location: StorageLocation): Promise<void> {
  try {
    const db = createAdminClient()
    await db.storage.from(location.bucket).remove([location.path])
  } catch {
    // An orphaned object costs storage; a thrown error here would mask the
    // original admission failure, which is the thing the caller needs to see.
  }
}

// ── Rows ─────────────────────────────────────────────────────────────────────

export interface InsertAssetInput {
  projectId: string
  kind: Asset['kind']
  mimeType: string
  byteSize: number
  checksumSha256: string
  width: number | null
  height: number | null
  durationMs: number | null
  visibility: Asset['visibility']
  storage: StorageLocation
}

/** Insert the asset row and return it as the canonical `Asset`. */
export async function insertAsset(input: InsertAssetInput): Promise<Asset> {
  const db = createAdminClient()

  const { data, error } = await (db as any).from('assets')
    .insert({
      project_id:      input.projectId,
      kind:            input.kind,
      mime_type:       input.mimeType,
      byte_size:       input.byteSize,
      checksum_sha256: input.checksumSha256,
      width:           input.width,
      height:          input.height,
      duration_ms:     input.durationMs,
      visibility:      input.visibility,
      storage_bucket:  input.storage.bucket,
      storage_path:    input.storage.path,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Asset insert failed: ${error?.message ?? 'no row returned'}`)
  }

  return rowToAsset(data)
}

export interface InsertProvenanceInput {
  assetId: AssetId
  source: AssetProvenance['source']
  provider?: string | null
  model?: string | null
  providerRequestId?: string | null
  adapterVersion?: string | null
  seed?: string | null
  briefHash?: string | null
  requestHash?: string | null
  referenceAssetIds?: readonly AssetId[]
  costEventId?: string | null
  durationMs?: number | null
  simulated?: boolean
  providerMetadata?: Record<string, unknown>
}

/**
 * Insert the provenance row.
 *
 * Every provider field defaults to null rather than to a placeholder string: an
 * uploaded reference image genuinely has no provider, and writing `'unknown'`
 * would make "we don't know" indistinguishable from a vendor named unknown.
 */
export async function insertProvenance(input: InsertProvenanceInput): Promise<AssetProvenance> {
  const db = createAdminClient()

  const { data, error } = await (db as any).from('asset_provenance')
    .insert({
      asset_id:            input.assetId,
      source:              input.source,
      provider:            input.provider ?? null,
      model:               input.model ?? null,
      provider_request_id: input.providerRequestId ?? null,
      adapter_version:     input.adapterVersion ?? null,
      seed:                input.seed ?? null,
      brief_hash:          input.briefHash ?? null,
      request_hash:        input.requestHash ?? null,
      reference_asset_ids: input.referenceAssetIds ? [...input.referenceAssetIds] : [],
      cost_event_id:       input.costEventId ?? null,
      duration_ms:         input.durationMs ?? null,
      simulated:           input.simulated ?? false,
      provider_metadata:   input.providerMetadata ?? {},
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Asset provenance insert failed: ${error?.message ?? 'no row returned'}`)
  }

  return rowToProvenance(data)
}

/** Delete an asset row, for unwinding a failed admission. Never throws. */
export async function deleteAssetRow(assetId: AssetId): Promise<void> {
  try {
    const db = createAdminClient()
    await (db as any).from('assets').delete().eq('id', assetId)
  } catch {
    // Same reasoning as removeAssetBytes: never mask the original failure.
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function getAsset(assetId: AssetId): Promise<Asset | null> {
  const db = createAdminClient()
  const { data, error } = await (db as any).from('assets')
    .select('*')
    .eq('id', assetId)
    .maybeSingle()

  if (error || !data) return null
  return rowToAsset(data)
}

/**
 * Verify that every referenced asset exists AND belongs to `projectId`.
 *
 * Cross-project reference is REFUSED, not filtered. Project Isolation is an
 * official Omnira architecture principle ("Delat agentminne mellan projekt är
 * förbjudet"; agents are instantiated per project, not filtered), so a reference
 * that reaches outside its project is a caller error to surface, not a row to
 * quietly drop. Silently dropping it would produce an asset whose provenance
 * claims fewer references than were actually requested — the §6.254 hidden
 * feature-loss failure, one layer down.
 */
export async function assertReferencesUsable(
  projectId: string,
  referenceAssetIds: readonly AssetId[],
): Promise<void> {
  if (referenceAssetIds.length === 0) return

  const db = createAdminClient()
  const { data, error } = await (db as any).from('assets')
    .select('id, project_id')
    .in('id', [...referenceAssetIds])

  if (error) {
    // Fail closed: an unverifiable reference is not a usable reference.
    throw new AssetRejectedError(
      'ASSET_REFERENCE_INVALID',
      `Could not verify reference assets: ${error.message}`,
    )
  }

  const rows = (data ?? []) as Array<{ id: string; project_id: string }>
  const byId = new Map(rows.map(r => [r.id, r.project_id]))

  for (const id of referenceAssetIds) {
    const owner = byId.get(id)
    if (owner === undefined) {
      throw new AssetRejectedError('ASSET_REFERENCE_INVALID', `Reference asset ${id} does not exist.`)
    }
    if (owner !== projectId) {
      throw new AssetRejectedError(
        'ASSET_REFERENCE_INVALID',
        `Reference asset ${id} belongs to another project — cross-project references are refused.`,
      )
    }
  }
}

// ── Row mapping ──────────────────────────────────────────────────────────────

function rowToAsset(row: any): Asset {
  return {
    id:             asAssetId(row.id),
    projectId:      row.project_id,
    kind:           row.kind,
    mimeType:       row.mime_type,
    byteSize:       Number(row.byte_size),
    checksumSha256: row.checksum_sha256,
    width:          row.width ?? null,
    height:         row.height ?? null,
    durationMs:     row.duration_ms ?? null,
    visibility:     row.visibility,
    status:         row.status,
    storage:        { bucket: row.storage_bucket, path: row.storage_path },
    createdAt:      row.created_at,
  }
}

function rowToProvenance(row: any): AssetProvenance {
  return {
    assetId:           asAssetId(row.asset_id),
    source:            row.source,
    provider:          row.provider ?? null,
    model:             row.model ?? null,
    providerRequestId: row.provider_request_id ?? null,
    adapterVersion:    row.adapter_version ?? null,
    seed:              row.seed ?? null,
    briefHash:         row.brief_hash ?? null,
    requestHash:       row.request_hash ?? null,
    referenceAssetIds: (row.reference_asset_ids ?? []).map(asAssetId),
    costEventId:       row.cost_event_id ?? null,
    durationMs:        row.duration_ms ?? null,
    simulated:         Boolean(row.simulated),
    providerMetadata:  row.provider_metadata ?? {},
    recordedAt:        row.recorded_at,
  }
}
