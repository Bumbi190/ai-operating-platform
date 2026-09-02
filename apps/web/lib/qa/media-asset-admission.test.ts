/**
 * lib/qa/media-asset-admission.test.ts — Media Runtime Phase 1.
 *
 * Proves the canonical Asset boundary. No live image API is reached by any test
 * in this file: every provider response is a fixture, every storage call is a
 * mock, and the one network primitive (`fetch`) is stubbed. Admitting bytes must
 * never cost money to verify.
 *
 * Numbered to the Phase 1 test requirements:
 *   1  Asset identity is stable and independent of URL.
 *   2  Provider/storage URL is not the canonical identifier.
 *   3  Asset belongs to the expected project.
 *   4  Media/MIME validation fails closed.
 *   5  Provenance links provider/model without creating provider authority.
 *   6  Optional provider metadata may be absent.
 *   7  Canonical reference assets are represented by asset ID.
 *   8  Draft visibility cannot silently downgrade to public.
 *   9  The proof path still obeys existing spend/governance behaviour.
 *  10  Normal tests require no live image API.
 *  11  Legacy URL media stays explicitly legacy.
 *  12  No provider-specific field is mandatory at the canonical layer.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** A minimal, byte-valid PNG (8-byte signature + filler). */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ...new Array(64).fill(0x00),
])

/** Byte-valid JPEG. */
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, ...new Array(64).fill(0x00)])

/** Valid-looking bytes that are NOT any admitted format (plain text). */
const TEXT_BYTES = new Uint8Array([...'not an image at all'].map(c => c.charCodeAt(0)))

const PROJECT_A = '11111111-1111-4111-8111-111111111111'
const PROJECT_B = '22222222-2222-4222-8222-222222222222'

// ── Mutable mock state ───────────────────────────────────────────────────────

let assetRows: Array<Record<string, any>> = []
let provenanceRows: Array<Record<string, any>> = []
let storagePuts: Array<{ bucket: string; path: string; contentType: string; size: number }> = []
let storageRemovals: Array<{ bucket: string; path: string }> = []
let uploadShouldFail: string | null = null
let assetInsertShouldFail: string | null = null
let provenanceInsertShouldFail: string | null = null
let fetchResponses: Map<string, { ok: boolean; status: number; contentType: string | null; bytes: Uint8Array }> = new Map()
let fetchCalls: string[] = []
let signCalls: Array<{ bucket: string; path: string; expiresIn: number }> = []

let nextId = 0
function mintId(): string {
  nextId += 1
  return `aaaaaaaa-0000-4000-8000-${String(nextId).padStart(12, '0')}`
}

// ── Mocks (must precede the import of the modules under test) ────────────────

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, bytes: Uint8Array, opts: { contentType: string }) => {
          if (uploadShouldFail) return { error: { message: uploadShouldFail } }
          if (storagePuts.some(p => p.bucket === bucket && p.path === path)) {
            return { error: { message: 'Duplicate object' } }
          }
          storagePuts.push({ bucket, path, contentType: opts.contentType, size: bytes.byteLength })
          return { error: null }
        },
        remove: async (paths: string[]) => {
          for (const p of paths) storageRemovals.push({ bucket, path: p })
          return { error: null }
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://sb.example/storage/v1/object/public/${bucket}/${path}` },
        }),
        // Signed URLs carry an expiry and a token, and differ per signing —
        // the two properties that make them delivery artifacts rather than
        // identities. The counter stands in for the real token's entropy.
        createSignedUrl: async (path: string, expiresIn: number) => {
          signCalls.push({ bucket, path, expiresIn })
          return {
            data: {
              signedUrl:
                `https://sb.example/storage/v1/object/sign/${bucket}/${path}`
                + `?token=sig-${signCalls.length}-exp-${expiresIn}`,
            },
            error: null,
          }
        },
      }),
    },
    from: (table: string) => {
      if (table === 'assets') return assetsTable()
      if (table === 'asset_provenance') return provenanceTable()
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))

function assetsTable() {
  return {
    insert: (row: Record<string, any>) => ({
      select: () => ({
        single: async () => {
          if (assetInsertShouldFail) return { data: null, error: { message: assetInsertShouldFail } }
          if (assetRows.some(r => r.storage_bucket === row.storage_bucket && r.storage_path === row.storage_path)) {
            return { data: null, error: { message: 'duplicate key value violates unique constraint' } }
          }
          const stored = {
            id: mintId(),
            status: 'active',
            created_at: '2026-09-02T00:00:00.000Z',
            ...row,
          }
          assetRows.push(stored)
          return { data: stored, error: null }
        },
      }),
    }),
    select: (_cols?: string) => ({
      eq: (col: string, val: string) => ({
        maybeSingle: async () => ({ data: assetRows.find(r => r[col] === val) ?? null, error: null }),
      }),
      in: async (col: string, vals: string[]) => ({
        data: assetRows.filter(r => vals.includes(r[col])),
        error: null,
      }),
    }),
    delete: () => ({
      eq: async (col: string, val: string) => {
        assetRows = assetRows.filter(r => r[col] !== val)
        return { error: null }
      },
    }),
  }
}

function provenanceTable() {
  return {
    insert: (row: Record<string, any>) => ({
      select: () => ({
        single: async () => {
          if (provenanceInsertShouldFail) return { data: null, error: { message: provenanceInsertShouldFail } }
          const stored = { recorded_at: '2026-09-02T00:00:00.000Z', ...row }
          provenanceRows.push(stored)
          return { data: stored, error: null }
        },
      }),
    }),
  }
}

// The single network primitive, stubbed. Requirement 10: no live image API.
vi.stubGlobal('fetch', async (input: any) => {
  const url = typeof input === 'string' ? input : String(input)
  fetchCalls.push(url)
  const r = fetchResponses.get(url)
  if (!r) throw new Error(`unstubbed fetch: ${url}`)
  return {
    ok: r.ok,
    status: r.status,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? r.contentType : null) },
    arrayBuffer: async () => r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength),
  }
})

// ── Modules under test ───────────────────────────────────────────────────────

const { admitAssetBytes, admitAssetFromUrl, canonicalHash, PUBLIC_ASSET_BUCKET } =
  await import('@/lib/media/asset/admission')
const { publicDeliveryUrl, signedAssetUrl } = await import('@/lib/media/asset/store')
const {
  AssetRejectedError,
  assertBucketTrusted,
  assertVisibilityPlacement,
  PUBLIC_BUCKETS,
  TRUSTED_BUCKETS,
  EXTENSION_FOR_MIME,
  ADMITTED_MIME_TYPES,
  BUCKET_FOR_VISIBILITY,
} = await import('@/lib/media/asset/validate')
const { legacyMediaRef, isLegacyMediaRef } = await import('@/lib/media/asset/types')

beforeEach(() => {
  assetRows = []
  provenanceRows = []
  storagePuts = []
  storageRemovals = []
  uploadShouldFail = null
  assetInsertShouldFail = null
  provenanceInsertShouldFail = null
  fetchResponses = new Map()
  fetchCalls = []
  signCalls = []
  nextId = 0
})

/** The minimum valid admission — a published image, since the only bucket is public. */
function validInput(over: Record<string, any> = {}) {
  return {
    projectId: PROJECT_A,
    kind: 'image' as const,
    visibility: 'public' as const,
    bytes: PNG_BYTES,
    mimeType: 'image/png',
    storage: { path: 'images/articles/p/a-hero-1' },
    provenance: { source: 'generated' as const, provider: 'ideogram', model: 'ideogram-v3' },
    ...over,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 + 2 — identity is independent of URL; a URL is never the identifier
// ─────────────────────────────────────────────────────────────────────────────

describe('asset identity is independent of any URL', () => {
  it('admission returns an id, and no column stores a URL', async () => {
    const { asset } = await admitAssetBytes(validInput())

    expect(asset.id).toBeTruthy()
    expect(asset.storage).toEqual({
      bucket: 'media-assets',
      path: 'images/articles/p/a-hero-1.png',
    })

    // The persisted row carries bucket + path and NOTHING url-shaped. This is
    // the §21.7 guarantee: if a URL had been stored, it would appear here.
    const row = assetRows[0]
    const urlish = Object.entries(row).filter(([, v]) => typeof v === 'string' && v.startsWith('http'))
    expect(urlish).toEqual([])
    expect(row.storage_bucket).toBe('media-assets')
    expect(row.storage_path).toBe('images/articles/p/a-hero-1.png')
  })

  it('the provider URL is used to fetch and then discarded', async () => {
    const providerUrl = 'https://ideogram.ai/generated/ephemeral-abc123.png'
    fetchResponses.set(providerUrl, { ok: true, status: 200, contentType: 'image/png', bytes: PNG_BYTES })

    const { asset } = await admitAssetFromUrl({
      projectId: PROJECT_A,
      kind: 'image',
      visibility: 'public',
      sourceUrl: providerUrl,
      storage: { path: 'images/articles/p/a-hero-2' },
      provenance: { source: 'generated', provider: 'ideogram' },
    })

    expect(fetchCalls).toEqual([providerUrl])

    // The vendor URL appears in NO persisted field. It was a retrieval
    // mechanism, never an identity.
    const serialized = JSON.stringify([assetRows, provenanceRows])
    expect(serialized).not.toContain('ideogram.ai/generated')
    expect(serialized).not.toContain('ephemeral-abc123')
    expect(asset.id).toBeTruthy()
  })

  it('the delivery URL is DERIVED from the location, not stored', async () => {
    const { asset } = await admitAssetBytes(validInput())

    const url = publicDeliveryUrl(asset.storage)
    expect(url).toBe(
      'https://sb.example/storage/v1/object/public/media-assets/images/articles/p/a-hero-1.png',
    )

    // Identity survives the URL changing: the same asset id yields a different
    // URL the moment its location moves, and nothing about the asset changed.
    const moved = publicDeliveryUrl({ bucket: 'media-assets', path: 'images/moved/elsewhere.png' })
    expect(moved).not.toBe(url)
    expect(asset.id).toBe(assetRows[0].id)
  })

  it('identity does not derive from the bytes — same bytes twice are two assets', async () => {
    const a = await admitAssetBytes(validInput({ storage: { path: 'images/x/one' } }))
    const b = await admitAssetBytes(validInput({ storage: { path: 'images/x/two' } }))

    expect(a.asset.checksumSha256).toBe(b.asset.checksumSha256) // same bytes
    expect(a.asset.id).not.toBe(b.asset.id)                     // different assets
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3 — project ownership
// ─────────────────────────────────────────────────────────────────────────────

describe('project ownership', () => {
  it('records the owning project', async () => {
    const { asset } = await admitAssetBytes(validInput())
    expect(asset.projectId).toBe(PROJECT_A)
    expect(assetRows[0].project_id).toBe(PROJECT_A)
  })

  it('refuses an asset with no project — there is no default owner', async () => {
    await expect(admitAssetBytes(validInput({ projectId: '' })))
      .rejects.toMatchObject({ code: 'ASSET_IDENTITY_INVALID' })

    expect(storagePuts).toEqual([])   // refused BEFORE any bytes were placed
    expect(assetRows).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4 — validation fails closed
// ─────────────────────────────────────────────────────────────────────────────

describe('media validation fails closed', () => {
  it('refuses a MIME type that is not admitted', async () => {
    await expect(admitAssetBytes(validInput({ mimeType: 'image/svg+xml' })))
      .rejects.toMatchObject({ code: 'ASSET_MIME_UNSUPPORTED' })
    expect(storagePuts).toEqual([])
  })

  it('refuses bytes whose signature contradicts the declared type', async () => {
    // The classic case: a provider says image/png and sends something else.
    await expect(admitAssetBytes(validInput({ bytes: TEXT_BYTES })))
      .rejects.toMatchObject({ code: 'ASSET_MIME_MISMATCH' })
    expect(storagePuts).toEqual([])
  })

  it('refuses a JPEG declared as PNG', async () => {
    await expect(admitAssetBytes(validInput({ bytes: JPEG_BYTES, mimeType: 'image/png' })))
      .rejects.toMatchObject({ code: 'ASSET_MIME_MISMATCH' })
  })

  it('refuses empty bytes', async () => {
    await expect(admitAssetBytes(validInput({ bytes: new Uint8Array(0) })))
      .rejects.toMatchObject({ code: 'ASSET_SIZE_INVALID' })
  })

  it('refuses path traversal', async () => {
    for (const path of ['../escape/x', 'a/../../b', '/absolute/x', 'a//b', 'a\\b']) {
      await expect(admitAssetBytes(validInput({ storage: { path } })))
        .rejects.toMatchObject({ code: 'ASSET_PATH_UNSAFE' })
    }
    expect(storagePuts).toEqual([])
  })

  it('refuses an untrusted bucket', () => {
    // Asserted on the rule directly. Admission no longer ACCEPTS a bucket from
    // the caller — it derives one from visibility — so the old "pass a hostile
    // bucket through admission" form could no longer fail even if the rule were
    // deleted. Two facts, kept separate:
    //   1. the rule still refuses anything not provisioned by a migration
    expect(() => assertBucketTrusted('attacker')).toThrow(AssetRejectedError)
    expect(() => assertBucketTrusted('outputs')).toThrow(AssetRejectedError)      // exists, but by hand
    expect(() => assertBucketTrusted('run-images')).toThrow(AssetRejectedError)   // exists, but by hand
    expect(() => assertBucketTrusted('media-assets')).not.toThrow()
    expect(() => assertBucketTrusted('media-assets-private')).not.toThrow()
  })

  it('refuses an unsafe source URL before any fetch (SSRF)', async () => {
    const cases = [
      'http://ideogram.ai/x.png',                  // not https
      'file:///etc/passwd',                        // local file
      'gopher://ideogram.ai/x',                    // exotic scheme
      'https://169.254.169.254/latest/meta-data',  // cloud metadata, dotted quad
      'https://2852039166/latest/meta-data',       // same, decimal integer form
      'https://0xA9FEA9FE/latest/meta-data',       // same, hex form
      'https://127.0.0.1/x.png',                   // loopback
      'https://10.0.0.5/x.png',                    // private range
      'https://[::1]/x.png',                       // IPv6 loopback
      'https://localhost/x.png',                   // single-label internal
      'https://vault/x.png',                       // single-label internal
      'https://db.internal/x.png',                 // private suffix
      'https://printer.local/x.png',               // mDNS suffix
      'not-a-url',
    ]
    for (const sourceUrl of cases) {
      await expect(admitAssetFromUrl({
        projectId: PROJECT_A, kind: 'image', visibility: 'public',
        sourceUrl, storage: { path: 'images/x/y' },
        provenance: { source: 'generated' },
      })).rejects.toMatchObject({ code: 'ASSET_SOURCE_UNTRUSTED' })
    }
    // The load-bearing assertion: the network was never touched.
    expect(fetchCalls).toEqual([])
  })

  it('honours caller-supplied host pinning without holding provider hosts itself', async () => {
    fetchResponses.set('https://cdn.example-provider.com/a', {
      ok: true, status: 200, contentType: 'image/png', bytes: PNG_BYTES,
    })

    // Pinned to a host the URL does not match → refused, no fetch.
    await expect(admitAssetFromUrl({
      projectId: PROJECT_A, kind: 'image', visibility: 'public',
      sourceUrl: 'https://cdn.example-provider.com/a',
      allowedHosts: ['some-other-host.com'],
      storage: { path: 'images/x/pinned' },
      provenance: { source: 'generated' },
    })).rejects.toMatchObject({ code: 'ASSET_SOURCE_UNTRUSTED' })
    expect(fetchCalls).toEqual([])

    // Pinned to a matching host → admitted.
    const { asset } = await admitAssetFromUrl({
      projectId: PROJECT_A, kind: 'image', visibility: 'public',
      sourceUrl: 'https://cdn.example-provider.com/a',
      allowedHosts: ['example-provider.com'],
      storage: { path: 'images/x/pinned' },
      provenance: { source: 'generated' },
    })
    expect(asset.id).toBeTruthy()
  })

  it('the asset layer names no provider hostname (provider boundary intact)', async () => {
    const { readFileSync } = await import('node:fs')
    for (const file of ['admission.ts', 'store.ts', 'validate.ts', 'types.ts']) {
      const src = readFileSync(new URL(`../media/asset/${file}`, import.meta.url), 'utf8')
      // Strip comments: the files EXPLAIN why no allowlist exists, and that
      // prose must not be what keeps this passing — or what fails it.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
      expect(code).not.toMatch(/api\.ideogram\.ai|api\.openai\.com|api\.elevenlabs\.io|api\.muapi\.ai/)
    }
  })

  it('the stored extension always matches the validated bytes', async () => {
    fetchResponses.set('https://ideogram.ai/a.png', {
      // Provider CLAIMS png; bytes are actually jpeg. Declared type wins only if
      // the bytes agree — here they do not, so this must be refused, not stored
      // under a misleading extension.
      ok: true, status: 200, contentType: 'image/png', bytes: JPEG_BYTES,
    })
    await expect(admitAssetFromUrl({
      projectId: PROJECT_A, kind: 'image', visibility: 'public',
      sourceUrl: 'https://ideogram.ai/a.png', storage: { path: 'images/x/y' },
      provenance: { source: 'generated' },
    })).rejects.toMatchObject({ code: 'ASSET_MIME_MISMATCH' })

    // And when they DO agree, the extension is derived from the verified type.
    fetchResponses.set('https://ideogram.ai/b', {
      ok: true, status: 200, contentType: 'image/jpeg', bytes: JPEG_BYTES,
    })
    const { asset } = await admitAssetFromUrl({
      projectId: PROJECT_A, kind: 'image', visibility: 'public',
      sourceUrl: 'https://ideogram.ai/b', storage: { path: 'images/x/z' },
      provenance: { source: 'generated' },
    })
    expect(asset.storage.path).toBe('images/x/z.jpg')
    expect(EXTENSION_FOR_MIME[asset.mimeType]).toBe('jpg')
  })

  it('every admitted MIME type has a canonical extension', () => {
    // Guards against adding a format to the allowlist and forgetting the
    // extension map, which would make admission fail at the last step.
    for (const mimes of Object.values(ADMITTED_MIME_TYPES)) {
      for (const m of mimes) expect(EXTENSION_FOR_MIME[m]).toBeTruthy()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5 + 12 — provenance records without conferring authority
// ─────────────────────────────────────────────────────────────────────────────

describe('provenance records provider facts without granting provider authority', () => {
  it('links provider and model', async () => {
    const { provenance } = await admitAssetBytes(validInput())
    expect(provenance.provider).toBe('ideogram')
    expect(provenance.model).toBe('ideogram-v3')
    expect(provenance.source).toBe('generated')
  })

  it('exports no execution capability — it is a record, not a grant', async () => {
    const mod = await import('@/lib/media/asset/admission')
    const store = await import('@/lib/media/asset/store')

    // The asset layer must not become a second way to reach a provider. If a
    // generate/dispatch verb ever appears here, media generation would have a
    // second door that lib/media/providers/gate.ts does not guard.
    const forbidden = /generate|dispatch|invoke|callProvider|execute/i
    for (const name of [...Object.keys(mod), ...Object.keys(store)]) {
      expect(name).not.toMatch(forbidden)
    }
  })

  it('stores hashes of the brief and request, never the payloads', async () => {
    const brief = { story: 'A secret editorial angle', shot: 'sensitive detail' }
    const request = { prompt: 'a prompt that should not be persisted' }

    const { provenance } = await admitAssetBytes(validInput({
      provenance: { source: 'generated', provider: 'ideogram', brief, request },
    }))

    expect(provenance.briefHash).toMatch(/^[0-9a-f]{64}$/)
    expect(provenance.requestHash).toMatch(/^[0-9a-f]{64}$/)

    const serialized = JSON.stringify(provenanceRows)
    expect(serialized).not.toContain('secret editorial angle')
    expect(serialized).not.toContain('should not be persisted')
  })

  it('hashes are order-independent, so the same brief hashes identically', () => {
    expect(canonicalHash({ a: 1, b: 2 })).toBe(canonicalHash({ b: 2, a: 1 }))
    expect(canonicalHash({ a: 1 })).not.toBe(canonicalHash({ a: 2 }))
  })

  it('carries a cost LINK and never an amount — cost_events stays the ledger', async () => {
    const costEventId = '33333333-3333-4333-8333-333333333333'
    const { provenance } = await admitAssetBytes(validInput({
      provenance: { source: 'generated', provider: 'ideogram', costEventId },
    }))

    expect(provenance.costEventId).toBe(costEventId)

    // No amount-shaped field exists anywhere on the provenance record.
    for (const key of Object.keys(provenanceRows[0])) {
      expect(key).not.toMatch(/cost_(usd|sek)|amount|price|credits/i)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6 + 12 — provider metadata is optional; nothing vendor-specific is mandatory
// ─────────────────────────────────────────────────────────────────────────────

describe('optional provider metadata', () => {
  it('admits an uploaded asset with NO provider, model, seed or metadata', async () => {
    // A human-supplied character reference: the case that proves no provider
    // field can be mandatory at the canonical layer.
    const { asset, provenance } = await admitAssetBytes(validInput({
      provenance: { source: 'uploaded' },
    }))

    expect(asset.id).toBeTruthy()
    expect(provenance.source).toBe('uploaded')
    expect(provenance.provider).toBeNull()
    expect(provenance.model).toBeNull()
    expect(provenance.seed).toBeNull()
    expect(provenance.providerRequestId).toBeNull()
    expect(provenance.briefHash).toBeNull()
    expect(provenance.providerMetadata).toEqual({})
    expect(provenance.simulated).toBe(false)
  })

  it('accepts arbitrary vendor metadata without it becoming canonical', async () => {
    const { provenance } = await admitAssetBytes(validInput({
      provenance: {
        source: 'generated',
        provider: 'muapi',
        providerMetadata: { vendorOnlyField: 'x', nested: { anything: true } },
      },
    }))
    expect(provenance.providerMetadata).toEqual({ vendorOnlyField: 'x', nested: { anything: true } })
  })

  it('marks a simulated result so a mock is never mistaken for a paid one', async () => {
    const { provenance } = await admitAssetBytes(validInput({
      provenance: { source: 'generated', provider: 'muapi', simulated: true },
    }))
    expect(provenance.simulated).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7 — reference assets by identity
// ─────────────────────────────────────────────────────────────────────────────

describe('canonical reference assets are addressed by asset id', () => {
  it('records references by id', async () => {
    const ref = await admitAssetBytes(validInput({
      storage: { path: 'references/nova/canonical-front' },
      provenance: { source: 'uploaded' },
    }))

    const { provenance } = await admitAssetBytes(validInput({
      storage: { path: 'images/story/scene-1' },
      provenance: {
        source: 'generated',
        provider: 'ideogram',
        referenceAssetIds: [ref.asset.id],
      },
    }))

    expect(provenance.referenceAssetIds).toEqual([ref.asset.id])
  })

  it('refuses a reference to an asset that does not exist', async () => {
    await expect(admitAssetBytes(validInput({
      provenance: {
        source: 'generated',
        referenceAssetIds: ['99999999-9999-4999-8999-999999999999' as any],
      },
    }))).rejects.toMatchObject({ code: 'ASSET_REFERENCE_INVALID' })

    expect(storagePuts).toEqual([])
  })

  it('refuses a cross-project reference (Project Isolation)', async () => {
    const foreign = await admitAssetBytes(validInput({
      projectId: PROJECT_B,
      storage: { path: 'references/other-project/x' },
      provenance: { source: 'uploaded' },
    }))

    await expect(admitAssetBytes(validInput({
      projectId: PROJECT_A,
      storage: { path: 'images/story/scene-2' },
      provenance: { source: 'generated', referenceAssetIds: [foreign.asset.id] },
    }))).rejects.toMatchObject({ code: 'ASSET_REFERENCE_INVALID' })
  })

  it('a reference is an id, never a URL — a URL cannot be passed as one', async () => {
    await expect(admitAssetBytes(validInput({
      provenance: {
        source: 'generated',
        referenceAssetIds: ['https://sb.example/storage/v1/object/public/media-assets/x.png' as any],
      },
    }))).rejects.toMatchObject({ code: 'ASSET_REFERENCE_INVALID' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8 — visibility cannot silently downgrade
// ─────────────────────────────────────────────────────────────────────────────

describe('a non-public asset cannot land in public storage', () => {
  it('an internal asset is admitted into the PRIVATE bucket', async () => {
    const { asset } = await admitAssetBytes(validInput({ visibility: 'internal' }))

    expect(asset.visibility).toBe('internal')
    expect(asset.storage.bucket).toBe('media-assets-private')
    expect([...PUBLIC_BUCKETS]).not.toContain(asset.storage.bucket)

    // And the bytes went there too — the row and the object agree.
    expect(storagePuts).toHaveLength(1)
    expect(storagePuts[0].bucket).toBe('media-assets-private')
  })

  it('DEFAULTS to internal, so an omitted visibility stores privately, never publicly', async () => {
    const input = validInput()
    delete (input as any).visibility

    const { asset } = await admitAssetBytes(input)
    expect(asset.visibility).toBe('internal')
    expect(asset.storage.bucket).toBe('media-assets-private')
    expect(storagePuts[0].bucket).toBe('media-assets-private')
  })

  it('the caller CANNOT choose the bucket — it is derived from visibility', async () => {
    // The structural guarantee. AdmitAssetInput.storage has no bucket field, so
    // a caller trying to force one is ignored by construction rather than
    // caught by a check that could be removed.
    const { asset } = await admitAssetBytes(validInput({
      visibility: 'internal',
      storage: { bucket: 'media-assets', path: 'images/x/forced' } as any,
    }))
    expect(asset.storage.bucket).toBe('media-assets-private')
    expect(storagePuts[0].bucket).toBe('media-assets-private')
  })

  it('the placement rule refuses BOTH wrong pairings', () => {
    // Correct pairings.
    expect(() => assertVisibilityPlacement('public', 'media-assets')).not.toThrow()
    expect(() => assertVisibilityPlacement('internal', 'media-assets-private')).not.toThrow()

    // The leak: a draft into world-readable storage.
    expect(() => assertVisibilityPlacement('internal', 'media-assets')).toThrow(AssetRejectedError)

    // The silent breakage: a published asset filed privately, where the delivery
    // URL every existing reader expects would not resolve.
    expect(() => assertVisibilityPlacement('public', 'media-assets-private')).toThrow(AssetRejectedError)

    // An unknown visibility has no destination at all.
    expect(() => assertVisibilityPlacement('secret' as any, 'media-assets')).toThrow(AssetRejectedError)
  })

  it('a public delivery URL cannot be derived from a private location', () => {
    // getPublicUrl is a pure string builder and would happily produce a URL that
    // Supabase then refuses to serve. Returning it would put a dead link in
    // hero_image_url and fail at render time, far from the cause.
    expect(() => publicDeliveryUrl({ bucket: 'media-assets-private', path: 'x.png' }))
      .toThrow(AssetRejectedError)
    expect(() => publicDeliveryUrl({ bucket: 'media-assets', path: 'x.png' }))
      .not.toThrow()
  })

  it('public assets are still admitted to the public bucket', async () => {
    const { asset } = await admitAssetBytes(validInput({ visibility: 'public' }))
    expect(asset.visibility).toBe('public')
    expect(asset.storage.bucket).toBe('media-assets')
  })

  it('the bucket sets are exactly as the migration provisions them', () => {
    // Both entries are created in migrations: media-assets PUBLIC
    // (20260520_media_tables.sql) and media-assets-private NON-PUBLIC
    // (20260902_media_asset_foundation.sql §1). If a public bucket is ever added
    // to TRUSTED_BUCKETS without being declared in PUBLIC_BUCKETS, the
    // visibility guarantee would silently weaken — so pin the known state.
    expect([...TRUSTED_BUCKETS]).toEqual(['media-assets', 'media-assets-private'])
    expect([...PUBLIC_BUCKETS]).toEqual(['media-assets'])
    expect(PUBLIC_ASSET_BUCKET).toBe('media-assets')
  })

  it('every bucket in the visibility map is trusted, and only public maps to a public bucket', () => {
    for (const [vis, bucket] of Object.entries(BUCKET_FOR_VISIBILITY)) {
      expect([...TRUSTED_BUCKETS]).toContain(bucket)
      if (vis !== 'public') {
        expect([...PUBLIC_BUCKETS]).not.toContain(bucket)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Admission atomicity — an asset nobody can explain must not exist (§21.5)
// ─────────────────────────────────────────────────────────────────────────────

describe('admission is all-or-nothing', () => {
  it('removes the stored bytes when the asset row fails', async () => {
    assetInsertShouldFail = 'insert exploded'
    await expect(admitAssetBytes(validInput())).rejects.toThrow(/insert exploded/)

    expect(storagePuts).toHaveLength(1)
    expect(storageRemovals).toHaveLength(1)
    expect(storageRemovals[0].path).toBe('images/articles/p/a-hero-1.png')
    expect(assetRows).toEqual([])
  })

  it('unwinds the asset row AND the bytes when provenance fails', async () => {
    provenanceInsertShouldFail = 'provenance exploded'
    await expect(admitAssetBytes(validInput())).rejects.toThrow(/provenance exploded/)

    // §21.5 makes provenance capture a precondition of admission. An asset with
    // no provenance is exactly what must not survive.
    expect(assetRows).toEqual([])
    expect(storageRemovals).toHaveLength(1)
  })

  it('does not write a row when byte placement fails', async () => {
    uploadShouldFail = 'storage down'
    await expect(admitAssetBytes(validInput())).rejects.toThrow(/storage down/)
    expect(assetRows).toEqual([])
    expect(provenanceRows).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11 — legacy media stays legacy
// ─────────────────────────────────────────────────────────────────────────────

describe('legacy URL media is not silently converted', () => {
  it('a legacy URL is a distinct, self-describing shape', () => {
    const legacy = legacyMediaRef('https://sb.example/storage/v1/object/public/media-assets/old.png')
    expect(isLegacyMediaRef(legacy)).toBe(true)
    expect(legacy.kind).toBe('legacy-url')
  })

  it('an admitted asset is not a legacy ref', async () => {
    const { asset } = await admitAssetBytes(validInput())
    expect(isLegacyMediaRef(asset)).toBe(false)
    expect(isLegacyMediaRef(asset.id)).toBe(false)
  })

  it('nothing in the asset layer converts a URL into an identity', async () => {
    const mod = await import('@/lib/media/asset/admission')
    const store = await import('@/lib/media/asset/store')
    const names = [...Object.keys(mod), ...Object.keys(store)]

    // A helper named like "urlToAsset"/"assetFromUrl"/"adoptUrl" would be the
    // shape of a silent backfill. Admission takes BYTES (or fetches them and
    // validates); it never blesses an existing URL as an asset.
    for (const n of names) {
      expect(n).not.toMatch(/^(urlTo|fromUrlString|adopt|backfill|migrate)/i)
    }
    // admitAssetFromUrl is the deliberate exception and it RETRIEVES + validates.
    expect(names).toContain('admitAssetFromUrl')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9 — the proof path keeps its existing governance and spend behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('the proof path (article hero) keeps its governance and spend behaviour', () => {
  it('still routes spend and stop authority through the existing modules', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(
      new URL('../article/hero-image.ts', import.meta.url),
      'utf8',
    )

    // Unchanged by Phase 1 — asserted by shape so a refactor that DROPS one is
    // caught rather than merely reviewed.
    expect(src).toContain('resolveExecutionEligibility')  // G3 stop authority
    expect(src).toContain('logImageCost')                 // cost_events
    expect(src).toContain('projectScope')                 // execution contract
    expect(src).toContain('sendPipelineAlert')            // failure alerting

    // The asset boundary replaced ONLY the upload primitive. Asserted against
    // the IMPORT and the CALL rather than the bare name: the header comment
    // deliberately still explains what was replaced, and that documentation
    // should not be what makes this test fail.
    expect(src).toContain('admitAssetFromUrl')
    expect(src).not.toMatch(/import\s*\{[^}]*uploadArticleHeroImage/)
    expect(src).not.toMatch(/await\s+uploadArticleHeroImage\s*\(/)

    // The asset layer did not acquire a spend concept of its own. Checked on
    // IMPORTS — the header comment names withGovernedSpend precisely to say
    // that spend lives elsewhere, and that sentence must not fail this test.
    for (const file of ['admission.ts', 'store.ts', 'validate.ts', 'types.ts']) {
      const assetSrc = readFileSync(new URL(`../media/asset/${file}`, import.meta.url), 'utf8')
      expect(assetSrc).not.toMatch(/^\s*import .*lib\/cost\//m)
      expect(assetSrc).not.toMatch(/\bawait\s+(withGovernedSpend|reserveSpend|settleSpend)\s*\(/)
    }
  })

  it('cost attribution reaches cost_events without changing lib/cost/track.ts', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../article/hero-image.ts', import.meta.url), 'utf8')

    // assetId rides in the EXISTING metadata field. If a future change adds a
    // dedicated column instead, this test should be updated deliberately.
    expect(src).toMatch(/metadata:\s*\{[^}]*assetId/)
  })

  it('the other image call sites are untouched (forward-only)', async () => {
    const { readFileSync } = await import('node:fs')
    const storageSrc = readFileSync(new URL('../media/storage.ts', import.meta.url), 'utf8')

    // lib/media/storage.ts remains the legacy boundary for the eight
    // uploadSceneImage call sites. Phase 1 changed exactly one path.
    expect(storageSrc).toContain('export async function uploadSceneImage')
    expect(storageSrc).toContain('export async function uploadArticleHeroImage')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10 — no live API
// ─────────────────────────────────────────────────────────────────────────────

describe('no live image API is reachable from these tests', () => {
  it('every fetch in this suite was a stub — no real provider was reached', () => {
    for (const url of fetchCalls) {
      // Only the fixture hosts registered in `fetchResponses` are ever called,
      // and the stub throws on anything unregistered.
      expect(fetchResponses.has(url)).toBe(true)
      expect(url.startsWith('https://')).toBe(true)
    }
  })

  it('admitting bytes performs no network call at all', async () => {
    await admitAssetBytes(validInput())
    expect(fetchCalls).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Private draft storage hardening — identity, access, and what cannot influence
// visibility
// ─────────────────────────────────────────────────────────────────────────────

describe('private asset identity is independent of any access URL', () => {
  it('a signed URL is minted on demand and is stored nowhere', async () => {
    const { asset } = await admitAssetBytes(validInput({ visibility: 'internal' }))

    const signed = await signedAssetUrl(asset.storage)
    expect(signed).toContain('token=')

    // The canonical row carries bucket + path and no URL of any kind — signed
    // or otherwise. A stored signed URL would be worse than a stored public one:
    // it is not merely indirect, it is WRONG after it expires.
    const row = assetRows[0]
    const urlish = Object.entries(row).filter(([, v]) => typeof v === 'string' && v.startsWith('http'))
    expect(urlish).toEqual([])
    expect(JSON.stringify([assetRows, provenanceRows])).not.toContain('token=')
  })

  it('two signings of the same asset differ, and neither is the identity', async () => {
    const { asset } = await admitAssetBytes(validInput({ visibility: 'internal' }))

    const a = await signedAssetUrl(asset.storage, 60)
    const b = await signedAssetUrl(asset.storage, 3600)

    expect(a).not.toBe(b)          // access artifacts, not identity
    expect(asset.id).toBe(assetRows[0].id)  // identity unchanged by either
  })

  it('signing is not an authorization decision — the asset row is', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../media/asset/store.ts', import.meta.url), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

    // signedAssetUrl signs the location it is handed. If it ever grew an owner
    // or session check it would become a half-authorization that callers trust
    // instead of doing their own — worse than none.
    expect(code).not.toMatch(/signedAssetUrl[\s\S]{0,400}(auth\.uid|getUser|session|owner_id)/)
  })
})

describe('nothing outside Omnira can influence visibility or placement', () => {
  it('a provider-supplied URL cannot determine visibility', async () => {
    // The same provider URL, admitted twice with different visibility. The URL
    // has no say: placement follows the CALLER'S declared visibility, and a
    // provider that returned a "public"-looking URL changes nothing.
    const providerUrl = 'https://cdn.example-provider.com/public/looks-public.png'
    fetchResponses.set(providerUrl, { ok: true, status: 200, contentType: 'image/png', bytes: PNG_BYTES })

    const draft = await admitAssetFromUrl({
      projectId: PROJECT_A, kind: 'image', visibility: 'internal',
      sourceUrl: providerUrl, storage: { path: 'images/x/from-provider-draft' },
      provenance: { source: 'generated' },
    })
    expect(draft.asset.visibility).toBe('internal')
    expect(draft.asset.storage.bucket).toBe('media-assets-private')

    const published = await admitAssetFromUrl({
      projectId: PROJECT_A, kind: 'image', visibility: 'public',
      sourceUrl: providerUrl, storage: { path: 'images/x/from-provider-public' },
      provenance: { source: 'generated' },
    })
    expect(published.asset.storage.bucket).toBe('media-assets')
  })

  it('the storage path is Omnira-built and validated, never taken from the provider', async () => {
    // A provider-controlled filename reaching a path template is how traversal
    // arrives. The path is validated regardless of how it was assembled.
    const hostile = 'https://cdn.example-provider.com/x.png'
    fetchResponses.set(hostile, { ok: true, status: 200, contentType: 'image/png', bytes: PNG_BYTES })

    for (const path of ['../../escape', 'a/../../b', '/abs']) {
      await expect(admitAssetFromUrl({
        projectId: PROJECT_A, kind: 'image', visibility: 'internal',
        sourceUrl: hostile, storage: { path },
        provenance: { source: 'generated' },
      })).rejects.toMatchObject({ code: 'ASSET_PATH_UNSAFE' })
    }

    // And the stored path is exactly what Omnira asked for, plus the extension
    // admission derived from the verified bytes — no provider filename in it.
    const { asset } = await admitAssetFromUrl({
      projectId: PROJECT_A, kind: 'image', visibility: 'internal',
      sourceUrl: hostile, storage: { path: 'images/articles/p/a-hero-1' },
      provenance: { source: 'generated' },
    })
    expect(asset.storage.path).toBe('images/articles/p/a-hero-1.png')
    expect(asset.storage.path).not.toContain('x.png')
  })

  it('project identity survives private admission and scopes references', async () => {
    const draft = await admitAssetBytes(validInput({
      projectId: PROJECT_B,
      visibility: 'internal',
      storage: { path: 'images/b/draft' },
    }))
    expect(draft.asset.projectId).toBe(PROJECT_B)
    expect(assetRows[0].project_id).toBe(PROJECT_B)

    // A private asset is still project-scoped for references: project A cannot
    // reference project B's draft.
    await expect(admitAssetBytes(validInput({
      projectId: PROJECT_A,
      visibility: 'internal',
      storage: { path: 'images/a/uses-b' },
      provenance: { source: 'generated', referenceAssetIds: [draft.asset.id] },
    }))).rejects.toMatchObject({ code: 'ASSET_REFERENCE_INVALID' })
  })
})
