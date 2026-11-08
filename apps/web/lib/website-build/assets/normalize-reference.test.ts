import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  MAX_REFERENCE_INPUT_BYTES, MAX_REFERENCES_PER_TURN,
  normalizeReferenceImage, ReferenceImageError,
} from '@/lib/website-build/assets/normalize-reference'

const sample = () => sharp({
  create: { width: 80, height: 60, channels: 4, background: { r: 20, g: 80, b: 120, alpha: 1 } },
})

describe('website reference-image boundary', () => {
  it('only accepts PNG, JPEG and WebP and returns metadata-free private-ready WebP', async () => {
    for (const [mime, format] of [
      ['image/png', 'png'], ['image/jpeg', 'jpeg'], ['image/webp', 'webp'],
    ] as const) {
      const input = await sample().toFormat(format).toBuffer()
      const result = await normalizeReferenceImage(input, mime)
      expect(result.mimeType).toBe('image/webp')
      expect({ width: result.width, height: result.height }).toEqual({ width: 80, height: 60 })
      const meta = await sharp(result.bytes).metadata()
      expect(meta.format).toBe('webp')
      expect(meta.exif).toBeUndefined()
      expect(meta.xmp).toBeUndefined()
      expect(meta.icc).toBeUndefined()
    }
  })

  it('refuses forged MIME, SVG and corrupt images before storage', async () => {
    const image = await sample().png().toBuffer()
    await expect(normalizeReferenceImage(image, 'image/jpeg'))
      .rejects.toMatchObject({ code: 'INVALID_IMAGE' })
    await expect(normalizeReferenceImage(Buffer.from('<svg onload="alert(1)"/>'), 'image/svg+xml'))
      .rejects.toMatchObject({ code: 'INVALID_IMAGE' })
    await expect(normalizeReferenceImage(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), 'image/png'))
      .rejects.toMatchObject({ code: 'IMAGE_DECODE_FAILED' })
  })

  it('refuses oversized byte input and decompression-bomb dimensions', async () => {
    const good = await sample().webp().toBuffer()
    const tooLarge = Buffer.concat([good, Buffer.alloc(MAX_REFERENCE_INPUT_BYTES)])
    await expect(normalizeReferenceImage(tooLarge, 'image/webp'))
      .rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' })
    const huge = await sharp({
      create: { width: 6001, height: 2, channels: 3, background: '#fff' },
    }).png().toBuffer()
    await expect(normalizeReferenceImage(huge, 'image/png'))
      .rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' })
  })

  it('drops source metadata and applies orientation rather than trusting client dimensions', async () => {
    const original = await sharp({
      create: { width: 90, height: 50, channels: 3, background: '#aaa' },
    }).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    const result = await normalizeReferenceImage(original, 'image/jpeg')
    expect([result.width, result.height]).toEqual([50, 90])
    const meta = await sharp(result.bytes).metadata()
    expect(meta.exif).toBeUndefined()
    expect(Buffer.from(result.bytes).includes(Buffer.from('private-camera-metadata'))).toBe(false)
  })

  it('is a validation-only step, not a model call, publication, or upload entitlement', () => {
    expect(MAX_REFERENCES_PER_TURN).toBe(4)
    expect(new ReferenceImageError('INVALID_IMAGE').code).toBe('INVALID_IMAGE')
  })
})
