import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import type { AccessResult } from './api'
import { buildExclusionIndex, lookupExclusions } from './exclusions'
import { documentedPilotHistoryEntries } from './documented-pilot-history'
import { normalizeCompanyName, normalizeOrgnr } from './identity'
import type { KnownContacts } from './known-contacts'
import { createScbPageFetcher, fetchScbLegalEntityByOrgnr, SCB_LIVE_HOST } from './scb-client'
import { CONTACTABILITY_BLOCKED, evaluateScbCompany, type ScbStatusResult } from './scb-status-policy'
import { paginateScb } from './scb-source'
import { getReadiness, scbPreviewSearchApproved } from './readiness'
import type { ScbRegisterRecord } from './types'

export const SCB_PROBE_CONFIRMATION = 'TESTA SCB BILHANDLARE' as const
export const SCB_PROBE_SNI = '47.811' as const
export const SCB_PROBE_MUNICIPALITY = '1280' as const
const MAX_BODY_BYTES = 512
const MAX_SAMPLE = 5
const MAX_PAGES = 2
const PAGE_SIZE = 5000
const MAX_ROWS = MAX_PAGES * PAGE_SIZE
const LEGAL_LOOKUP_GAP_MS = 400

const headers = { 'cache-control': 'private, no-store' }
const respond = (status: number, value: unknown) => Response.json(value, { status, headers })
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export interface ScbProbeSearchResult {
  rows: ScbRegisterRecord[]
  pages: number
  truncated: boolean
}

export interface ScbProbeDeps {
  env: Record<string, string | undefined>
  resolveAccess: () => Promise<AccessResult>
  search?: () => Promise<ScbProbeSearchResult>
  reviewLegalEntity?: (orgnr: string) => Promise<ScbStatusResult>
  loadKnownContacts?: () => Promise<KnownContacts>
  sleep?: (ms: number) => Promise<void>
}

export async function runScbPreviewProbe(env: Record<string, string | undefined> = process.env): Promise<ScbProbeSearchResult> {
  if (!scbPreviewSearchApproved(env) || !getReadiness(env).liveSearchAvailable) {
    throw new Error('SCB Preview probe is disabled')
  }
  const fetchPage = createScbPageFetcher({
    source: 'arbetsstallen',
    sni: SCB_PROBE_SNI,
    baseUrl: `https://${SCB_LIVE_HOST}`,
    liveApproved: true,
  })
  return paginateScb(fetchPage, {
    pageSize: PAGE_SIZE,
    maxPages: MAX_PAGES,
    maxRows: MAX_ROWS,
    requestsPerSecond: 2,
  })
}

async function reviewScbLegalEntity(orgnrRaw: string, env: Record<string, string | undefined>): Promise<ScbStatusResult> {
  const orgnr = normalizeOrgnr(orgnrRaw)
  if (!orgnr) {
    return {
      ok: false, reason: 'bad_expected_orgnr', manualReviewOnly: true,
      outreachReady: false, contactability: CONTACTABILITY_BLOCKED,
    }
  }
  const je = await fetchScbLegalEntityByOrgnr({
    orgnr,
    baseUrl: `https://${SCB_LIVE_HOST}`,
    apiKey: env.SCB_API_KEY,
    liveApproved: true,
  })
  return evaluateScbCompany({ expectedOrgnr: orgnr, je })
}

function parseConfirmation(text: string): boolean {
  let body: unknown
  try { body = JSON.parse(text) } catch { return false }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return false
  const rec = body as Record<string, unknown>
  return Object.keys(rec).length === 1 && rec.confirmation === SCB_PROBE_CONFIRMATION
}

export async function leadFinderScbProbeApi(request: Request, deps: ScbProbeDeps): Promise<Response> {
  if (request.method !== 'POST') return respond(405, { status: 'method_not_allowed' })
  if (deps.env.VERCEL_ENV === 'production') return respond(404, { status: 'disabled' })
  const readiness = getReadiness(deps.env)
  if (!scbPreviewSearchApproved(deps.env) || !readiness.liveSearchAvailable) {
    return respond(404, { status: 'disabled' })
  }

  let origin: string
  try { origin = new URL(request.url).origin } catch { return respond(403, { status: 'denied' }) }
  if (request.headers.get('origin') !== origin) return respond(403, { status: 'denied' })
  if ((request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    return respond(415, { status: 'unsupported_media_type' })
  }
  const declared = request.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
    return respond(413, { status: 'body_too_large' })
  }

  const access = await deps.resolveAccess()
  if (!access.ok) return respond(access.status, { status: 'denied' })
  if (!access.allowedProjectIds.includes(HANDLARBORSEN_PROJECT_ID)) return respond(403, { status: 'denied' })

  let text: string
  try { text = await request.text() } catch { return respond(400, { status: 'body_invalid' }) }
  if (text.length > MAX_BODY_BYTES) return respond(413, { status: 'body_too_large' })
  if (!parseConfirmation(text)) return respond(400, { status: 'confirmation_invalid' })

  let result: ScbProbeSearchResult
  try {
    result = await (deps.search ?? (() => runScbPreviewProbe(deps.env)))()
  } catch {
    return respond(503, { status: 'unavailable' })
  }

  const seen = new Set<string>()
  const matching = result.rows.filter(row =>
    row.municipalityCode === SCB_PROBE_MUNICIPALITY &&
    row.sniCodes.includes(SCB_PROBE_SNI) &&
    typeof row.name === 'string' && row.name.trim().length >= 2
  ).filter(row => {
    const key = row.cfar ?? `${row.name.toLocaleLowerCase('sv-SE')}|${row.city ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const sampleRows = matching.slice(0, MAX_SAMPLE)

  let known: KnownContacts | null = null
  if (deps.loadKnownContacts) {
    try { known = await deps.loadKnownContacts() } catch { known = null }
  }
  const connectedEntries = known?.status === 'ready' ? known.entries : []
  const historyIndex = buildExclusionIndex([...connectedEntries, ...documentedPilotHistoryEntries()])
  const historyCoverage = known?.status === 'ready' ? 'omnira_plus_documented_partial' : 'documented_partial'
  const review = deps.reviewLegalEntity ?? ((orgnr: string) => reviewScbLegalEntity(orgnr, deps.env))
  const wait = deps.sleep ?? sleep

  const legalReviews: Array<Record<string, unknown>> = []
  for (const row of sampleRows) {
    await wait(LEGAL_LOOKUP_GAP_MS)
    let evaluated: ScbStatusResult
    try { evaluated = await review(row.orgnr) } catch { return respond(503, { status: 'unavailable' }) }
    if (!evaluated.ok) {
      legalReviews.push({
        workplaceName: row.name.trim(), city: row.city,
        legalCompanyName: null, identityReview: 'needs_manual_review',
        scbStatusClass: 'UNKNOWN_NEEDS_REVIEW', legalFormClass: 'MISSING_NEEDS_REVIEW',
        historyMatches: [], warnings: ['LEGAL_IDENTITY_NOT_CONFIRMED'],
        manualReviewOnly: true, contactability: CONTACTABILITY_BLOCKED, outreachReady: false,
      })
      continue
    }
    const historyMatches = lookupExclusions(historyIndex, {
      orgnr: evaluated.orgnr,
      normalizedName: normalizeCompanyName(evaluated.legalName),
    })
    legalReviews.push({
      workplaceName: row.name.trim(), city: row.city,
      legalCompanyName: evaluated.legalName,
      identityReview: 'scb_legal_entity_confirmed',
      scbStatusClass: evaluated.status.class,
      legalFormClass: evaluated.legalForm.class,
      historyMatches,
      warnings: evaluated.warnings.slice(0, 12),
      manualReviewOnly: true,
      contactability: evaluated.contactability,
      outreachReady: false,
    })
  }

  return respond(200, {
    status: 'ok',
    source: 'scb_foretagsregistret',
    query: {
      source: 'arbetsstallen',
      sni: SCB_PROBE_SNI,
      municipalityCode: SCB_PROBE_MUNICIPALITY,
      municipality: 'Malmö',
    },
    pages: result.pages,
    scannedRows: result.rows.length,
    truncated: result.truncated,
    matchCount: matching.length,
    sample: sampleRows.map(row => ({
      name: row.name.trim(), city: row.city, cfar: row.cfar, sniCodes: row.sniCodes,
    })),
    legalReviews,
    historyCoverage,
    knownOmniraContacts: known?.status === 'ready' ? known.count : null,
    externalPilotRegistryConnected: false,
    persisted: false,
    contactability: CONTACTABILITY_BLOCKED,
    outreachReady: false,
  })
}
