import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  parseReviewCsv, parseReviewLegalOrgnr, STATUS_AUDIT_EXPORT_COLUMNS,
} from '@/lib/handlarborsen/lead-finder/client-review-core'
import { parseCsv, parseLegalOrgnr } from '@/lib/handlarborsen/lead-finder/offline-vetting'
import { withCheckDigit } from '@/lib/handlarborsen/lead-finder/fixtures'
import { buildLocalReview } from '@/lib/handlarborsen/lead-finder/local-review'

const readRelative = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')

describe('browser-only SCB preview parsing boundary', () => {
  it('has no Node imports reachable through the client display parser', () => {
    const pure = readRelative('../handlarborsen/lead-finder/client-review-core.ts')
    const local = readRelative('../handlarborsen/lead-finder/local-review.ts')
    const view = readRelative('../../components/platform/vnext/HandlarborsenScbImportControl.tsx')
    expect(pure).not.toMatch(/from ['"]node:|require\(['"]node:|process\.env|fs\.|crypto\.|localStorage/)
    expect(local).not.toMatch(/offline-vetting|status-audit|node:crypto|from ['"]node:/)
    expect(local).toContain("from './client-review-core'")
    expect(view).toContain("from '@/lib/handlarborsen/lead-finder/local-review'")
  })

  it('uses one shared header contract with the offline exporter', async () => {
    const exporter = await import('@/lib/handlarborsen/lead-finder/status-audit')
    expect(exporter.STATUS_AUDIT_EXPORT_COLUMNS).toEqual(STATUS_AUDIT_EXPORT_COLUMNS)
    expect(STATUS_AUDIT_EXPORT_COLUMNS).toHaveLength(17)
  })

  it('matches canonical CSV parser for safe multiline and escaped quotes', () => {
    const good = [
      '\uFEFFa,b,c\r\n1,2,3\r\n',
      'a,"b,""c""",d\r\n1,2,3\r\n',
      'a,b,c\n"x","y",z\n',
      'a,b\n"legal\nname","field"\n',
    ]
    for (const csv of good) expect(parseReviewCsv(csv)).toEqual(parseCsv(csv))
  })

  it('fails closed for malformed CSV and unsupported trailing quote content', () => {
    for (const csv of ['a,"b"junk,c', 'a,"unterminated', 'a,"b"x', 'a,b"c",d']) {
      expect(() => parseReviewCsv(csv)).toThrow()
      expect(() => parseCsv(csv)).toThrow()
    }
  })

  it('matches the server legal company orgnr validator without processing personal identifiers', () => {
    const legal = [
      withCheckDigit('556700001'),
      withCheckDigit('559700001'),
      withCheckDigit('556000123'),
    ]
    for (const orgnr of legal) {
      expect(parseReviewLegalOrgnr(orgnr)).toBe(parseLegalOrgnr(orgnr))
    }
    for (const illegal of [
      withCheckDigit('850101123'),
      '8001011234',
      '5560770661',
      '165560770660',
      '123',
      'not-an-id',
    ]) expect(() => parseReviewLegalOrgnr(illegal)).toThrow()
  })

  it('retains a strict fail-closed display state for bad input', () => {
    expect(buildLocalReview('bad,header\r\nx,y', '{}').status).toBe('unavailable')
    expect(buildLocalReview('', '').status).toBe('unavailable')
  })
})
