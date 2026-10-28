import 'server-only'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import {
  IMPORT_MAX_BYTES, buildImportIntake, constantTimeEqual, type ImportIntakeFailure,
} from './import-intake'
import { IMPORT_PREVIEW_FLAG, readBoundedImportBody, type ImportProjectRow } from './import-api'
import { buildLocalReview } from './local-review'
import { buildResearchQueue } from './lead-research'
import { runLeadResearch, WORKER_MAX_JOBS, type SearchAdapter } from './lead-research-worker'

export const RESEARCH_FLAG = 'HB_LEADFINDER_RESEARCH_ENABLED'
export const RESEARCH_KEY_ENV = 'TAVILY_API_KEY'
export const RESEARCH_CONFIRMATION = 'UNDERSÖK 5 FÖRETAG' as const
export const RESEARCH_EXTRACT_FLAG = 'HB_LEADFINDER_EXTRACT_ENABLED'
export const RESEARCH_EXTRACT_CONFIRMATION = 'UNDERSÖK 5 FÖRETAG OCH GRANSKA WEBBSIDOR' as const

const headers = { 'cache-control': 'private, no-store' }
const respond = (status: number, value: unknown) => Response.json(value, { status, headers })

export interface LeadFinderResearchDeps {
  env: Record<string, string | undefined>
  /** Real session user (auth.getUser), never a cookie-trusting shortcut. */
  getUser: () => Promise<{ id: string } | null>
  /** RLS read of projects filtered by exact id AND owner_id. */
  loadProject: (userId: string) => Promise<ImportProjectRow | null>
  isHandlarborsenProject: (p: { id: string; slug: string; name: string }) => boolean
  /** Called ONLY after every gate and the digest recheck have passed. */
  getAdapter: () => SearchAdapter
}

const failureStatus: Record<ImportIntakeFailure, number> = {
  body_too_large: 413, body_invalid: 400, unknown_fields: 400, mode_invalid: 400,
  confirmation_invalid: 400, snapshot_invalid: 422, manifest_invalid: 422,
}
const BODY_KEYS = ['csv', 'summary', 'digest', 'confirmation']

function parseBody(text: string, expectedConfirmation: string): { csv: string; summary: string; digest: string } | 'unknown_fields' | 'confirmation_invalid' | 'body_invalid' {
  let body: unknown
  try { body = JSON.parse(text) } catch { return 'body_invalid' }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return 'body_invalid'
  const rec = body as Record<string, unknown>
  const keys = Object.keys(rec)
  if (keys.some(k => !BODY_KEYS.includes(k))) return 'unknown_fields'
  if (!BODY_KEYS.every(k => keys.includes(k))) return 'body_invalid'
  if (typeof rec.csv !== 'string' || typeof rec.summary !== 'string' || !rec.csv || !rec.summary) return 'body_invalid'
  if (typeof rec.digest !== 'string' || !/^[0-9a-f]{64}$/.test(rec.digest)) return 'body_invalid'
  if (typeof rec.confirmation !== 'string' || !constantTimeEqual(rec.confirmation, expectedConfirmation)) return 'confirmation_invalid'
  return { csv: rec.csv, summary: rec.summary, digest: rec.digest }
}

/**
 * POST /api/atlas/handlarborsen/lead-finder/research
 * Owner-only, manual, at most five basic searches per call. Disabled unless both
 * server flags are exactly "true" and a search key is configured. Every gate runs
 * BEFORE the adapter is created, so a refused request costs zero search credits.
 * Never writes, never sends, never creates a service-role client, never logs input.
 */
export async function leadFinderResearchApi(request: Request, deps: LeadFinderResearchDeps): Promise<Response> {
  if (request.method !== 'POST') return respond(405, { status: 'method_not_allowed' })
  // Defense in depth: never run billable prospect research from production,
  // even if someone accidentally enables the two feature flags globally.
  if (deps.env.VERCEL_ENV === 'production') return respond(404, { status: 'disabled' })
  const key = deps.env[RESEARCH_KEY_ENV]
  if (deps.env[IMPORT_PREVIEW_FLAG] !== 'true' || deps.env[RESEARCH_FLAG] !== 'true' ||
    typeof key !== 'string' || key.trim() === '') return respond(404, { status: 'disabled' })

  let origin: string
  try { origin = new URL(request.url).origin } catch { return respond(403, { status: 'denied' }) }
  if (request.headers.get('origin') !== origin) return respond(403, { status: 'denied' })

  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type !== 'application/json') return respond(415, { status: 'unsupported_media_type' })
  const lengthHeader = request.headers.get('content-length')
  if (lengthHeader !== null && (!/^\d+$/.test(lengthHeader) || Number(lengthHeader) > IMPORT_MAX_BYTES))
    return respond(413, { status: 'body_too_large' })

  let user: { id: string } | null
  let project: ImportProjectRow | null
  try {
    user = await deps.getUser()
    if (!user || typeof user.id !== 'string' || !user.id) return respond(401, { status: 'unauthorized' })
    project = await deps.loadProject(user.id)
  } catch { return respond(503, { status: 'unavailable' }) }
  if (!project || project.id !== HANDLARBORSEN_PROJECT_ID || project.owner_id !== user.id ||
    !deps.isHandlarborsenProject(project)) return respond(403, { status: 'denied' })
  if (project.executionPaused !== false) return respond(409, { status: 'execution_paused' })

  const read = await readBoundedImportBody(request)
  if (!read.ok) return respond(read.status, { status: read.status === 413 ? 'body_too_large' : 'body_invalid' })
  const verifiedPagesEnabled = deps.env[RESEARCH_EXTRACT_FLAG] === 'true'
  const parsed = parseBody(read.text, verifiedPagesEnabled ? RESEARCH_EXTRACT_CONFIRMATION : RESEARCH_CONFIRMATION)
  if (typeof parsed === 'string') return respond(failureStatus[parsed], { status: parsed })

  // The digest the owner saw in the preview must match the exact files sent now.
  const intake = buildImportIntake(parsed.csv, parsed.summary)
  if (!intake.ok) return respond(failureStatus[intake.code], { status: intake.code })
  if (!constantTimeEqual(intake.value.aggregate.digest, parsed.digest)) return respond(422, { status: 'snapshot_invalid' })
  const state = buildLocalReview(parsed.csv, parsed.summary)
  if (state.status !== 'ready') return respond(422, { status: 'snapshot_invalid' })
  const queue = buildResearchQueue(state.review, WORKER_MAX_JOBS)
  if (queue.status !== 'ready') return respond(422, { status: 'snapshot_invalid' })

  let run: Awaited<ReturnType<typeof runLeadResearch>>
  try {
    const adapter = deps.getAdapter()
    run = await runLeadResearch({ review: state.review, adapter, limit: WORKER_MAX_JOBS })
  } catch { return respond(503, { status: 'unavailable' }) }
  if (run.status !== 'completed') return respond(503, { status: 'unavailable' })

  const names = new Map(queue.jobs.map(j => [j.orgnr, j]))
  return respond(200, {
    status: 'researched',
    calls: run.calls,
    preliminary: true,
    sourceMode: verifiedPagesEnabled ? 'search_and_page_extract' : 'search_snippets_only',
    contactability: 'BLOCKED_PENDING_VERIFICATION',
    outreachReady: false,
    results: run.results.map(r => ({
      orgnr: r.orgnr,
      companyName: names.get(r.orgnr)?.legalName ?? null,
      city: names.get(r.orgnr)?.city ?? null,
      classification: r.classification,
      reasons: r.reasons,
      identityVerified: r.identityVerified,
      officialSite: r.officialSite,
      evidence: r.evidence.map(e => ({
        sourceUrl: e.sourceUrl, sourceKind: e.sourceKind, observedOn: e.observedOn,
        indicators: e.indicators, excerpt: e.excerpt,
      })),
      // No search-result contacts. Only generic contacts explicitly seen on a
      // validated official company page, for dealer evidence, pending review.
      ...(verifiedPagesEnabled && r.classification === 'DEALER_EVIDENCE' &&
        r.identityVerified && r.contactProposal
        ? { contactSuggestion: r.contactProposal }
        : {}),
      contactability: 'BLOCKED_PENDING_VERIFICATION',
      outreachReady: false,
    })),
  })
}
