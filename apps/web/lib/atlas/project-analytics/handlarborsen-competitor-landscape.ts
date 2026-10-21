/** Public, dated competitor source catalogue. Not live claims, not prices or rankings. */
export type CompetitorSiteId = 'autoproff' | 'bca' | 'auto1'
export type CompetitorSite = Readonly<{
  id: CompetitorSiteId
  name: string
  url: string
  robotsUrl: string
  observedOn: '2026-10-14'
  description: string
  interviewQuestion: string
}>
export const LANDSCAPE_OBSERVED_ON = '2026-10-14' as const
export const COMPETITOR_SITES: readonly CompetitorSite[] = Object.freeze([
  Object.freeze({
    id: 'autoproff' as const,
    name: 'AutoProff',
    url: 'https://www.autoproff.se/b2b-marketplace',
    robotsUrl: 'https://www.autoproff.se/robots.txt',
    observedOn: LANDSCAPE_OBSERVED_ON,
    description: 'Den offentliga B2B-sidan beskriver försäljning till professionella handlare i flera länder och stöd för dokument och betalningar.',
    interviewQuestion: 'Hur viktigt är integrerad betalning och hjälp med dokument eller transport mellan handlare?',
  }),
  Object.freeze({
    id: 'bca' as const,
    name: 'BCA Sverige',
    url: 'https://www.bca.com/sv/se/Professional-Buyer/',
    robotsUrl: 'https://www.bca.com/robots.txt',
    observedOn: LANDSCAPE_OBSERVED_ON,
    description: 'Den officiella köparsidan beskriver inspekterade fordon, budgivning via auktion och köpstöd för handlare.',
    interviewQuestion: 'Vilken besiktnings- och fordonsinformation behöver ni före ett tryggt bud?',
  }),
  Object.freeze({
    id: 'auto1' as const,
    name: 'AUTO1.com',
    url: 'https://www.auto1.com/sv/home',
    robotsUrl: 'https://www.auto1.com/robots.txt',
    observedOn: LANDSCAPE_OBSERVED_ON,
    description: 'Den svenska offentliga sidan beskriver auktioner, direktköp och hjälp med logistik och dokument vid B2B-affärer.',
    interviewQuestion: 'Föredrar ni budgivning, direktköp eller båda – och vilka hinder finns i affärsavslutet?',
  }),
])

export type LandscapeSourceStatus =
  | 'metadata_checked'
  | 'robots_denied'
  | 'robots_unavailable'
  | 'redirect_refused'
  | 'http_error'
  | 'invalid_content_type'
  | 'too_large'
  | 'metadata_missing'
  | 'fetch_failed'

export type LandscapeObservation = Readonly<{
  id: CompetitorSiteId
  status: LandscapeSourceStatus
  title: string | null
  checkedAt: string
}>
export type LandscapeScan = Readonly<{
  checkedAt: string
  observations: readonly LandscapeObservation[]
}>
export function summarizeLandscape(scan: LandscapeScan | null) {
  if (!scan) return { checked: 0, failed: COMPETITOR_SITES.length, completed: false }
  const checked = scan.observations.filter(x => x.status === 'metadata_checked').length
  return { checked, failed: COMPETITOR_SITES.length - checked, completed: true }
}
