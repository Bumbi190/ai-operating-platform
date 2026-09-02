/**
 * lib/media/asset/validate.ts — the admission security boundary (pure, no I/O).
 *
 * WHY A PURE MODULE. Shaped after `lib/media/providers/gate.ts` and
 * `lib/ai/policy-gate.ts`, which are Omnira's precedent for an authority
 * decision kept free of I/O: no code path can "helpfully" fetch something that
 * changes the answer, and every branch is exhaustively testable without a
 * network or a database.
 *
 * WHY VALIDATION IS AN ADMISSION STEP AND NOT A LATER CHECK. Canon §21.5 makes
 * integrity validation, type validation and classification PRECONDITIONS of an
 * Output becoming an Asset. A validator that runs after the row exists is a
 * report; a validator that gates the row is a boundary. `lib/media/storage.ts`
 * documents the current posture honestly — "trusts fetch.ok and the storage
 * client error" — and this module is where that stops being true for new assets.
 *
 * FAIL CLOSED. Every function here refuses on anything it cannot positively
 * verify. An unrecognised MIME type is refused rather than stored as
 * `application/octet-stream`; a byte length of zero is refused rather than
 * treated as an empty file; a declared type that disagrees with the actual bytes
 * is refused rather than resolved in favour of either.
 *
 * WHAT THIS DOES NOT DO. It does not strip EXIF, transcode, re-encode, or
 * decompress. Those need an image library Omnira does not currently depend on,
 * and adding one to a foundation change would be the "every future media
 * security feature now" that Phase 1 excludes. The gaps are named explicitly at
 * the bottom of this file so they are a recorded decision rather than an
 * oversight.
 */

import type { AssetKind, AssetVisibility } from './types'

// ── Refusal grounds ──────────────────────────────────────────────────────────

/**
 * A closed code list, mirroring `MEDIA_PROVIDER_ERROR_CODES` in
 * `lib/media/providers/types.ts` so an admission failure classifies the same way
 * a provider failure already does, instead of inventing a second scheme.
 */
export const ASSET_REJECTION_CODES = [
  /** The declared MIME type is not one Omnira admits. */
  'ASSET_MIME_UNSUPPORTED',
  /** The bytes do not match the declared MIME type (magic-number mismatch). */
  'ASSET_MIME_MISMATCH',
  /** Zero bytes, or larger than the per-kind ceiling. */
  'ASSET_SIZE_INVALID',
  /** The storage path is unsafe (traversal, absolute, empty segment, …). */
  'ASSET_PATH_UNSAFE',
  /** The destination bucket is not on the allowlist. */
  'ASSET_BUCKET_UNTRUSTED',
  /** A non-public asset was aimed at a public bucket. */
  'ASSET_VISIBILITY_UNSAFE',
  /** The source URL is not a permitted origin to retrieve bytes from. */
  'ASSET_SOURCE_UNTRUSTED',
  /** A referenced asset does not exist, or belongs to another project. */
  'ASSET_REFERENCE_INVALID',
  /** Required identity (project, kind) is missing or malformed. */
  'ASSET_IDENTITY_INVALID',
] as const

export type AssetRejectionCode = (typeof ASSET_REJECTION_CODES)[number]

export class AssetRejectedError extends Error {
  readonly code: AssetRejectionCode

  constructor(code: AssetRejectionCode, message: string) {
    super(message)
    this.name = 'AssetRejectedError'
    this.code = code
  }
}

// ── MIME allowlist ───────────────────────────────────────────────────────────

/**
 * What Omnira admits, by kind. An ALLOWLIST rather than a denylist: the set of
 * formats we can reason about is small and known, while the set of formats an
 * arbitrary provider might return is not.
 *
 * SVG is deliberately absent. It is a document format that can carry script and
 * external references, and admitting it into a bucket that may be served
 * publicly would make every asset viewer an XSS surface. If a vector format is
 * ever needed it should arrive as a deliberate decision with a sanitiser, not by
 * inheriting an `image/*` wildcard.
 */
export const ADMITTED_MIME_TYPES: Readonly<Record<AssetKind, readonly string[]>> = {
  image: ['image/png', 'image/jpeg', 'image/webp'],
  video: ['video/mp4', 'video/webm'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/wav'],
} as const

/**
 * The canonical file extension for each admitted type.
 *
 * WHY ADMISSION OWNS THE EXTENSION. The legacy helper chose it from the response
 * header — `contentType.includes('png') ? 'png' : 'jpg'` — which means a WebP
 * was stored as `.jpg` and any header the provider got wrong was written into
 * the path. Deriving it from the type that has ALREADY passed the magic-number
 * check makes "the extension matches the bytes" structurally true rather than
 * hopeful, and it removes the ordering problem for URL admission, where the
 * caller cannot know the type before retrieval.
 */
export const EXTENSION_FOR_MIME: Readonly<Record<string, string>> = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4':  'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4':  'm4a',
  'audio/wav':  'wav',
} as const

/**
 * Per-kind byte ceilings.
 *
 * Grounded in what Omnira actually produces: Ideogram heroes and gpt-image-1
 * output are well under 10 MB, ElevenLabs voiceovers under a few MB, and the
 * Remotion reels are the only large artefacts. These are a bound on the damage a
 * misbehaving provider can do to storage, not a quality target.
 */
export const MAX_BYTES: Readonly<Record<AssetKind, number>> = {
  image: 32 * 1024 * 1024,
  video: 512 * 1024 * 1024,
  audio: 128 * 1024 * 1024,
} as const

/**
 * Buckets Omnira will write an asset into.
 *
 * An allowlist because the bucket is the security boundary: a caller that could
 * name any bucket could write into one whose RLS or public flag it does not
 * control. Both entries are created in migrations —
 * `media-assets` PUBLIC (20260520_media_tables.sql) and `media-assets-private`
 * NON-PUBLIC (20260902_media_asset_foundation.sql §1). Buckets that exist only
 * by hand (`outputs`, `run-images`) are deliberately absent: this layer will not
 * write into storage whose provisioning is not in the repository.
 */
export const TRUSTED_BUCKETS = ['media-assets', 'media-assets-private'] as const

/**
 * Buckets known to be world-readable.
 *
 * Tracked separately from `TRUSTED_BUCKETS` because "we are willing to write
 * here" and "anyone can read this" are different facts, and conflating them is
 * how a draft becomes public. Kept as data rather than probed at runtime: the
 * bucket's public flag is set in a migration, so this list is checkable against
 * the repository rather than against a live database that could disagree.
 */
export const PUBLIC_BUCKETS = ['media-assets'] as const

/**
 * THE VISIBILITY → BUCKET MAP. One destination per visibility, both directions
 * enforced.
 *
 * This is the structural form of the invariant "a non-public asset must not land
 * in public storage". It is a total map over `AssetVisibility`, so adding a
 * third visibility later is a compile error here rather than an asset that
 * quietly inherits someone else's bucket.
 */
export const BUCKET_FOR_VISIBILITY: Readonly<Record<AssetVisibility, string>> = {
  internal: 'media-assets-private',
  public:   'media-assets',
} as const

// ── Magic numbers ────────────────────────────────────────────────────────────

/**
 * Byte signatures for the admitted formats.
 *
 * WHY BOTHER, given the provider told us the content type. Because a
 * `Content-Type` header is a claim by whoever served the bytes, and admission is
 * the moment Omnira stops taking that claim on trust. A mismatch means either
 * the provider is wrong or the bytes are not what anyone thinks — both are
 * reasons to refuse rather than to store and find out later.
 */
const SIGNATURES: ReadonlyArray<{ mime: string; test: (b: Uint8Array) => boolean }> = [
  { mime: 'image/png', test: b => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a },
  { mime: 'image/jpeg', test: b => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  // RIFF....WEBP — the container tag sits at offset 8, after the 4-byte size.
  { mime: 'image/webp', test: b => b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' },
  // ISO-BMFF: 'ftyp' box at offset 4. Shared by mp4 and m4a — the brand that
  // follows distinguishes them, and we do not need that precision here because
  // `expectedMime` already carries the caller's kind.
  { mime: 'video/mp4', test: b => b.length >= 12 && ascii(b, 4, 4) === 'ftyp' },
  { mime: 'audio/mp4', test: b => b.length >= 12 && ascii(b, 4, 4) === 'ftyp' },
  { mime: 'video/webm', test: b => b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { mime: 'audio/wav', test: b => b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE' },
  // MP3: an ID3 tag, or a raw frame sync (0xFF 0xEx/0xFx).
  { mime: 'audio/mpeg', test: b => (b.length >= 3 && ascii(b, 0, 3) === 'ID3') || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
]

function ascii(b: Uint8Array, offset: number, length: number): string {
  let out = ''
  for (let i = offset; i < offset + length && i < b.length; i++) out += String.fromCharCode(b[i])
  return out
}

/** Whether the bytes carry a signature consistent with the declared type. */
export function bytesMatchMime(bytes: Uint8Array, mime: string): boolean {
  const sig = SIGNATURES.find(s => s.mime === mime)
  // No signature on file means we cannot positively confirm the type. Every
  // admitted MIME type above HAS one, so reaching this branch means the caller
  // passed a type that is not admitted — refuse rather than pass by default.
  if (!sig) return false
  return sig.test(bytes)
}

// ── Checks ───────────────────────────────────────────────────────────────────

/** Refuse a MIME type that is not admitted for this kind. */
export function assertMimeAdmitted(kind: AssetKind, mime: string): void {
  const allowed = ADMITTED_MIME_TYPES[kind]
  if (!allowed) {
    throw new AssetRejectedError('ASSET_IDENTITY_INVALID', `Unknown asset kind "${kind}".`)
  }
  if (!allowed.includes(mime)) {
    throw new AssetRejectedError(
      'ASSET_MIME_UNSUPPORTED',
      `MIME type "${mime}" is not admitted for kind "${kind}". Admitted: ${allowed.join(', ')}.`,
    )
  }
}

/** Refuse bytes that are empty, or larger than the per-kind ceiling. */
export function assertSizeWithinBounds(kind: AssetKind, byteSize: number): void {
  if (!Number.isFinite(byteSize) || byteSize <= 0) {
    throw new AssetRejectedError('ASSET_SIZE_INVALID', `Asset has no bytes (byteSize=${byteSize}).`)
  }
  const max = MAX_BYTES[kind]
  if (byteSize > max) {
    throw new AssetRejectedError(
      'ASSET_SIZE_INVALID',
      `Asset is ${byteSize} bytes, above the ${max}-byte ceiling for kind "${kind}".`,
    )
  }
}

/** Refuse bytes whose signature disagrees with the declared MIME type. */
export function assertBytesMatchMime(bytes: Uint8Array, mime: string): void {
  if (!bytesMatchMime(bytes, mime)) {
    throw new AssetRejectedError(
      'ASSET_MIME_MISMATCH',
      `Byte signature does not match declared MIME type "${mime}".`,
    )
  }
}

/**
 * Refuse an unsafe storage path.
 *
 * Storage paths are constructed by Omnira, never supplied by a provider — but a
 * provider-supplied FILENAME can reach one through a template, and that is the
 * path (so to speak) by which traversal arrives. Checked here so the rule holds
 * regardless of how the string was assembled.
 */
export function assertPathSafe(path: string): void {
  if (!path || path.trim().length === 0) {
    throw new AssetRejectedError('ASSET_PATH_UNSAFE', 'Storage path is empty.')
  }
  if (path.startsWith('/')) {
    throw new AssetRejectedError('ASSET_PATH_UNSAFE', `Storage path must be relative: "${path}".`)
  }
  // Backslashes and NUL are refused because they are interpreted differently by
  // different layers, which is exactly the ambiguity a traversal exploits.
  if (path.includes('\\') || path.includes('\0')) {
    throw new AssetRejectedError('ASSET_PATH_UNSAFE', `Storage path contains an illegal character: "${path}".`)
  }
  const segments = path.split('/')
  for (const seg of segments) {
    if (seg === '' || seg === '.' || seg === '..') {
      throw new AssetRejectedError(
        'ASSET_PATH_UNSAFE',
        `Storage path has an unsafe segment ("${seg}") in "${path}".`,
      )
    }
  }
}

/** Refuse a bucket Omnira has not sanctioned as a write destination. */
export function assertBucketTrusted(bucket: string): void {
  if (!(TRUSTED_BUCKETS as readonly string[]).includes(bucket)) {
    throw new AssetRejectedError(
      'ASSET_BUCKET_UNTRUSTED',
      `Bucket "${bucket}" is not a trusted asset destination. Trusted: ${TRUSTED_BUCKETS.join(', ')}.`,
    )
  }
}

/**
 * THE VISIBILITY GUARANTEE — the check the whole visibility model rests on.
 *
 * Enforces the `BUCKET_FOR_VISIBILITY` pairing in BOTH directions:
 *
 *   internal → media-assets-private   ✓        internal → media-assets   ✗ LEAK
 *   public   → media-assets           ✓        public   → …-private      ✗ BREAKAGE
 *
 * WHY BOTH DIRECTIONS. The leak direction is obvious: a draft in a world-
 * readable bucket is exposed at a guessable URL. The other direction is not a
 * leak but is still wrong — a published asset filed privately is unreachable
 * through the delivery URL every existing reader expects, and it would fail at
 * render time rather than at admission. One rule prevents both, so there is no
 * reason to only half-enforce it.
 *
 * BELT AND BRACES. The pairing is checked first, then the world-readable check
 * is re-derived independently from `PUBLIC_BUCKETS`. That second check is
 * redundant while the map is correct — and it is exactly what still holds if a
 * future edit adds a public bucket to the map by mistake. The redundancy is the
 * point: the expensive failure here is silent, so it is worth two ways of not
 * having it.
 */
export function assertVisibilityPlacement(visibility: AssetVisibility, bucket: string): void {
  const expected = BUCKET_FOR_VISIBILITY[visibility]
  if (!expected) {
    throw new AssetRejectedError(
      'ASSET_VISIBILITY_UNSAFE',
      `Unknown visibility "${visibility}" has no permitted storage destination.`,
    )
  }

  if (bucket !== expected) {
    throw new AssetRejectedError(
      'ASSET_VISIBILITY_UNSAFE',
      `A "${visibility}" asset must be stored in "${expected}", not "${bucket}".`,
    )
  }

  // Independent re-derivation. Survives a wrong map.
  if (visibility !== 'public' && (PUBLIC_BUCKETS as readonly string[]).includes(bucket)) {
    throw new AssetRejectedError(
      'ASSET_VISIBILITY_UNSAFE',
      `Refusing to store a "${visibility}" asset in the world-readable bucket "${bucket}".`,
    )
  }
}

/**
 * Refuse a source URL Omnira should not fetch.
 *
 * WHY THERE IS NO PROVIDER HOSTNAME LIST HERE. The obvious design is an
 * allowlist of provider CDN hosts. It was written that way first and removed,
 * for two reasons that matter more than the theoretical tidiness:
 *
 *   1. THE HOSTS ARE NOT KNOWN. Ideogram returns `data.data[0].url`
 *      (`lib/media/image-client.ts:103`) and nothing in this repository records
 *      which host serves it. An allowlist of GUESSED hosts is worse than none:
 *      it fails closed against the real, working path in production while
 *      looking like a security control in review. OpenAI is worse still —
 *      `gpt-image-1` returns `b64_json` (`lib/ai/runner.ts:736`), so there is no
 *      URL to fetch at all and any openai host here would be pure fiction.
 *   2. IT WOULD BREACH THE PROVIDER BOUNDARY. `lib/qa/governance-provider-
 *      boundary.test.ts` fails the build when a runtime module outside four
 *      sanctioned adapters names a provider hostname, and asserts that
 *      allowlist is exactly those four. Adding this file to it would weaken a
 *      deliberately locked invariant to satisfy a control that could not be
 *      verified anyway.
 *
 * What is enforced instead is STRUCTURAL, and needs no vendor knowledge:
 *
 *   • https only — kills `file:`, `gopher:`, `http:` to an internal service.
 *   • no IP literals — kills `169.254.169.254` (cloud metadata), loopback, and
 *     private ranges addressed numerically, which is how SSRF is actually aimed.
 *   • no non-public hostname shapes — `localhost`, single-label hosts, and
 *     `.local` / `.internal` suffixes.
 *
 * A caller that DOES know its provider's host may pin it via `allowedHosts`;
 * that is defence in depth supplied by the layer that has the knowledge, rather
 * than a guess frozen into this one. Per-provider pinning becomes worthwhile
 * once real response hosts have been observed — recorded as a Phase 2 item.
 *
 * NOT DEFENDED HERE: DNS rebinding, and a redirect from a permitted host to an
 * internal one. Both need resolve-then-connect control that `fetch` does not
 * expose. Named so the gap is a decision rather than an assumption.
 */
export function assertSourceUrlTrusted(rawUrl: string, allowedHosts?: readonly string[]): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new AssetRejectedError('ASSET_SOURCE_UNTRUSTED', 'Source URL is not a valid URL.')
  }

  // Checked first, so a bug in any later rule cannot expose a local-file read.
  if (url.protocol !== 'https:') {
    throw new AssetRejectedError(
      'ASSET_SOURCE_UNTRUSTED',
      `Source URL must be https (got "${url.protocol}").`,
    )
  }

  const host = url.hostname.toLowerCase()

  if (isIpLiteral(host)) {
    throw new AssetRejectedError(
      'ASSET_SOURCE_UNTRUSTED',
      'Source URL must name a host, not an IP address.',
    )
  }

  if (!isPublicHostname(host)) {
    throw new AssetRejectedError(
      'ASSET_SOURCE_UNTRUSTED',
      `Source host "${host}" is not a public hostname.`,
    )
  }

  if (allowedHosts && allowedHosts.length > 0) {
    const ok = allowedHosts.some(h => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`))
    if (!ok) {
      throw new AssetRejectedError(
        'ASSET_SOURCE_UNTRUSTED',
        `Source host "${host}" is not among the hosts the caller permitted.`,
      )
    }
  }

  return url
}

/**
 * Whether a hostname is a bare IP address.
 *
 * Covers dotted-quad IPv4, bracketed IPv6 (which `URL` strips to the raw form),
 * and the decimal/hex integer forms of IPv4 that `169.254.169.254` is often
 * disguised as — a purely numeric or `0x`-prefixed host is never a real DNS name.
 */
function isIpLiteral(host: string): boolean {
  if (host.includes(':')) return true                    // IPv6
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true   // dotted-quad IPv4
  if (/^\d+$/.test(host)) return true                     // decimal integer form
  if (/^0x[0-9a-f]+$/i.test(host)) return true            // hex form
  return false
}

/**
 * Whether a hostname looks publicly routable.
 *
 * Requires at least one dot (so `localhost` and other single-label internal
 * names are refused) and rejects the suffixes conventionally used for private
 * networks. This is a shape check, not a resolution check — see the note about
 * DNS rebinding above.
 */
function isPublicHostname(host: string): boolean {
  if (host.length === 0) return false
  if (!host.includes('.')) return false
  if (host.endsWith('.')) return false
  for (const suffix of ['.local', '.internal', '.localdomain', '.home.arpa']) {
    if (host.endsWith(suffix)) return false
  }
  if (host === 'localhost' || host.endsWith('.localhost')) return false
  return true
}

/** Refuse a malformed project identity. Admission is always project-scoped. */
export function assertProjectId(projectId: string | null | undefined): string {
  if (!projectId || projectId.trim().length === 0) {
    throw new AssetRejectedError(
      'ASSET_IDENTITY_INVALID',
      'An asset must name the project that owns it; none was supplied.',
    )
  }
  return projectId
}

// ── Known gaps (deliberate, Phase 1) ─────────────────────────────────────────
//
// Recorded here rather than in a document so they sit next to the code that
// would have to change, and so a later reader cannot mistake them for oversights:
//
//   • EXIF / metadata stripping — not done. A provider may embed the prompt, a
//     timestamp, or geodata in an image. Needs an image library Omnira does not
//     depend on today. Until then, an admitted image may carry vendor metadata.
//   • Decompression-bomb detection — not done. `MAX_BYTES` bounds the STORED
//     size, which bounds storage cost but not the memory cost of decoding. A
//     real defence needs dimension limits enforced by a decoder.
//   • Dimension extraction — not done here. Width/height are accepted from the
//     caller when known and stored as NULL otherwise, rather than parsed from
//     the bytes. Nothing in Phase 1 depends on them being present.
//   • Content moderation — out of scope, and deliberately so: a generator must
//     never also be the judge of whether its output is publishable
//     (`lib/atlas/capability/media-generation.ts`).
