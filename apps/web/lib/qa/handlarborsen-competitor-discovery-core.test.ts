import { describe, expect, it } from 'vitest'
import {
  KNOWN_OFFICIAL_HOSTS, officialHost, reconcileDiscovery,
  type OfficialCandidateEvidence,
} from '@/lib/atlas/project-analytics/handlarborsen-competitor-discovery-core'
import { MANUALLY_REVIEWED_DISCOVERY_LEADS } from '@/lib/atlas/project-analytics/handlarborsen-competitor-discovery-leads'

const now = new Date('2026-10-15T12:00:00.000Z')
const sample = MANUALLY_REVIEWED_DISCOVERY_LEADS[0]
const lead = (url: string, change: Partial<OfficialCandidateEvidence> = {}): OfficialCandidateEvidence => ({
  ...sample, officialUrl: url, ...change,
})

describe('Handlarbörsen: new competitor discovery is review-only', () => {
  it('uses only an independently checked official source for TradingSolutions', () => {
    const result = reconcileDiscovery(MANUALLY_REVIEWED_DISCOVERY_LEADS, [], now)
    expect(result).toMatchObject({ status: 'ok', existingCount: 0, knownCount: 0, invalidCount: 0 })
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({
      name: 'TradingSolutions D2D',
      officialUrl: 'https://www.tradingsolutions.se/d2d/',
      host: 'tradingsolutions.se',
      lifecycle: 'candidate_for_review',
      foundedRecently: 'not_verified',
      provenance: 'independently_checked_official_website',
    })
    expect(result.notices).toEqual([{
      identity: 'hb-discovery:tradingsolutions.se',
      title: 'Möjlig konkurrent upptäckt för Omnira',
      sourceUrl: 'https://www.tradingsolutions.se/d2d/',
      sourceObservedOn: '2026-10-15',
      reviewOnly: true,
      executable: false,
    }])
  })

  it('filters all established watched actors and the project itself', () => {
    const urls = [
      'https://handlarbudet.se/nyheter/item',
      'https://www.autoproff.se/b2b-marketplace',
      'https://www.bca.com/sv/se/Professional-Buyer/',
      'https://www.auto1.com/sv/home',
      'https://handlarborsen.se/',
    ]
    expect(KNOWN_OFFICIAL_HOSTS).toEqual(expect.arrayContaining(['handlarbudet.se', 'autoproff.se', 'bca.com', 'auto1.com', 'handlarborsen.se']))
    const result = reconcileDiscovery(urls.map(url => lead(url)), [], now)
    expect(result).toMatchObject({ knownCount: 5, invalidCount: 0 })
    expect(result.candidates).toEqual([])
    expect(result.notices).toEqual([])
  })

  it('deduplicates domain variants and suppresses candidates seen on earlier checks', () => {
    const original = 'https://www.tradingsolutions.se/d2d/'
    const duplicate = 'https://tradingsolutions.se/'
    const one = reconcileDiscovery([lead(original), lead(duplicate)], [], now)
    expect(one.candidates).toHaveLength(1)
    expect(one).toMatchObject({ duplicateCount: 1 })
    const previous = reconcileDiscovery([lead(original)], ['tradingsolutions.se'], now)
    expect(previous).toMatchObject({ existingCount: 1 })
    expect(previous.candidates).toEqual([])
    expect(previous.notices).toEqual([])
    const prefixed = reconcileDiscovery([lead(original)], ['www.tradingsolutions.se'], now)
    expect(prefixed).toMatchObject({ existingCount: 1 })
    expect(prefixed.notices).toHaveLength(0)
  })

  it('rejects unsafe, bogus or unreviewed provider results', () => {
    for (const url of [
      'http://tradingsolutions.se/',
      'javascript:alert(1)',
      'https://user:password@tradingsolutions.se/',
      'https://127.0.0.1/',
      'https://localhost/',
      'https://evil.example:8443/path',
      'https://-invalid.se/',
      'https://xn--legit-boa.se/',
      'https://tradingsolutions.se/?session=secret',
      'https://tradingsolutions.se/#fragment',
    ]) expect(officialHost(url)).toBeNull()
    const bad = reconcileDiscovery([
      lead('https://goodcandidate.se/', { provenance: 'transient_search_result' as any }),
      lead('https://goodcandidate.se/', { name: '<script>alert(1)</script>' }),
      lead('https://goodcandidate.se/', { observedOn: '2099-12-31' }),
      lead('https://goodcandidate.se/', { observedOn: '2026-02-30' }),
      lead('https://goodcandidate.se/', { relevance: 'bad\nline' }),
    ], [], now)
    expect(bad).toMatchObject({ invalidCount: 5 })
    expect(bad.notices).toHaveLength(0)
  })

  it('keeps results deterministic when observed pages arrive in different order', () => {
    const a = lead('https://alpha.se/')
    const b = lead('https://beta.se/')
    const normal = reconcileDiscovery([a, b], [], now)
    const reversed = reconcileDiscovery([b, a], [], now)
    expect(normal.candidates.map(x => x.host)).toEqual(['alpha.se', 'beta.se'])
    expect(reversed.candidates).toEqual(normal.candidates)
  })
})
