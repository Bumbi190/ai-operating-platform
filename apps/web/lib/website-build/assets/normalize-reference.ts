/**
 * Untrusted website-design reference bytes -> a private-ready, metadata-free image.
 *
 * Deliberately not an upload endpoint or authorization boundary. The caller must
 * authenticate the owner, bind project/conversation and admit the returned bytes
 * as a private canonical AssetId. There is no public URL or model call here.
 */
import sharp from 'sharp'
import { bytesMatchMime } from '@/lib/media/asset/validate'

export const MAX_REFERENCE_INPUT_BYTES = 10 * 1024 * 1024
export const MAX_REFERENCE_PIXELS = 16_000_000
export const MAX_REFERENCE_EDGE = 6_000
export const MAX_REFERENCES_PER_TURN = 4

export const REFERENCE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type ReferenceMime = (typeof REFERENCE_MIME_TYPES)[number]

export class ReferenceImageError extends Error {
  constructor(readonly code: 'INVALID_IMAGE' | 'IMAGE_TOO_LARGE' | 'IMAGE_DECODE_FAILED') {
    super(code)
    this.name = 'ReferenceImageError'
  }
}

export type NormalizedReferenceImage = {
  bytes: Uint8Array
  mimeType: 'image/webp'
  width: number
  height: number
}

/**
 * Never persist the uploaded original: WebP encoding strips EXIF, comments and
 * geolocation by default. Image dimensions come from decoded output, not HTTP
 * metadata, filename, client claims, or EXIF orientation tags.
 */
export async function normalizeReferenceImage(
  bytes: Uint8Array,
  claimedMime: string,
): Promise<NormalizedReferenceImage> {
  if (!REFERENCE_MIME_TYPES.includes(claimedMime as ReferenceMime) || !bytesMatchMime(bytes, claimedMime))
    throw new ReferenceImageError('INVALID_IMAGE')
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_REFERENCE_INPUT_BYTES)
    throw new ReferenceImageError('IMAGE_TOO_LARGE')
  try {
    const image = sharp(bytes, { failOn: 'error', limitInputPixels: MAX_REFERENCE_PIXELS, animated: false })
    const metadata = await image.metadata()
    const expected = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' }[claimedMime]
    const width = metadata.width ?? 0, height = metadata.height ?? 0
    if (metadata.format !== expected || (metadata.pages ?? 1) !== 1)
      throw new ReferenceImageError('INVALID_IMAGE')
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
        width > MAX_REFERENCE_EDGE || height > MAX_REFERENCE_EDGE || width * height > MAX_REFERENCE_PIXELS)
      throw new ReferenceImageError('IMAGE_TOO_LARGE')
    // rotate() applies orientation and drops original EXIF/ICC/XMP by default.
    const { data, info } = await image.rotate().webp({ quality: 84, effort: 4 }).toBuffer({ resolveWithObject: true })
    if (info.width * info.height > MAX_REFERENCE_PIXELS ||
        info.width > MAX_REFERENCE_EDGE || info.height > MAX_REFERENCE_EDGE ||
        data.byteLength > MAX_REFERENCE_INPUT_BYTES)
      throw new ReferenceImageError('IMAGE_TOO_LARGE')
    return { bytes: new Uint8Array(data), mimeType: 'image/webp', width: info.width, height: info.height }
  } catch (e) {
    if (e instanceof ReferenceImageError) throw e
    throw new ReferenceImageError('IMAGE_DECODE_FAILED')
  }
}
