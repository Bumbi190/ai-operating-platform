import 'server-only'
import { createHash } from 'node:crypto'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { readBoundedImportBody, type ImportProjectRow } from './import-api'
import { constantTimeEqual, digestApproved } from './import-intake'
import { parseResearchArchive, type ArchiveReport } from './research-archive'

export const RESEARCH_ARCHIVE_FLAG = 'HB_LEADFINDER_RESEARCH_ARCHIVE_ENABLED'
export const RESEARCH_ARCHIVE_APPROVED_DIGEST_ENV = 'HB_LEADFINDER_RESEARCH_ARCHIVE_APPROVED_SHA256'
export const RESEARCH_ARCHIVE_CONFIRMATION = 'SPARA 81 SOM EJ KONTAKTBARA' as const
/** Stable even after Postgres jsonb reorders object properties. */
const stableJson = (v: unknown): string => Array.isArray(v)
  ? '[' + v.map(stableJson).join(',') + ']'
  : v !== null && typeof v === 'object'
    ? '{' + Object.keys(v).sort().map(k =>
        JSON.stringify(k) + ':' + stableJson((v as Record<string, unknown>)[k])).join(',') + '}'
    : JSON.stringify(v)
export const archiveDigest = (report: ArchiveReport) =>
  createHash('sha256').update(stableJson(report)).digest('hex')

type SaveRecord = {
  project_id: string
  owner_id: string
  snapshot_sha256: string
  report: ArchiveReport
  review_state: 'awaiting_manual_review'
  history_complete: false
  contactability: 'BLOCKED_PENDING_VERIFICATION'
  outreach_ready: false
}

export interface ResearchArchiveDeps {
  env: Record<string, string | undefined>
  getUser: () => Promise<{ id: string } | null>
  loadProject: (userId: string) => Promise<ImportProjectRow | null>
  isHandlarborsenProject: (project: { id: string; slug: string; name: string }) => boolean
  /** The actual session client, constrained by RLS. Never admin/service role. */
  readExisting: (digest: string) => Promise<{ exists: boolean; failed: boolean }>
  save: (record: SaveRecord) => Promise<{ failed: boolean }>
}

const noStore = { 'cache-control': 'private, no-store' }
const respond = (status: number, value: object) => Response.json(value, { status, headers: noStore })
const isObject = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x)

/** Preview validates the same exact file as save. No rows are echoed back. */
export async function leadFinderResearchArchiveApi(request: Request, deps: ResearchArchiveDeps): Promise<Response> {
  if (request.method !== 'POST') return respond(405, { status: 'method_not_allowed' })
  if (deps.env.VERCEL_ENV === 'production' || deps.env[RESEARCH_ARCHIVE_FLAG] !== 'true')
    return respond(404, { status: 'disabled' })
  let origin = ''
  try { origin = new URL(request.url).origin } catch { return respond(403, { status: 'denied' }) }
  if (request.headers.get('origin') !== origin) return respond(403, { status: 'denied' })
  if ((request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json')
    return respond(415, { status: 'unsupported_media_type' })
  const declared = request.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 150_000))
    return respond(413, { status: 'body_too_large' })

  let user: { id: string } | null
  let project: ImportProjectRow | null
  try {
    user = await deps.getUser()
    if (!user?.id) return respond(401, { status: 'unauthorized' })
    project = await deps.loadProject(user.id)
  } catch { return respond(503, { status: 'unavailable' }) }
  if (!project || project.id !== HANDLARBORSEN_PROJECT_ID || project.owner_id !== user.id ||
    !deps.isHandlarborsenProject(project)) return respond(403, { status: 'denied' })
  if (project.executionPaused !== false) return respond(409, { status: 'execution_paused' })

  const raw = await readBoundedImportBody(request)
  if (!raw.ok) return respond(raw.status, { status: raw.status === 413 ? 'body_too_large' : 'body_invalid' })
  let body: unknown
  try { body = JSON.parse(raw.text) } catch { return respond(400, { status: 'body_invalid' }) }
  if (!isObject(body) || !['preview', 'save'].includes(body.mode as string) ||
    !isObject(body.report)) return respond(400, { status: 'body_invalid' })
  const keys = Object.keys(body).sort()
  const wanted = body.mode === 'preview' ? ['mode', 'report'] : ['confirmation', 'digest', 'mode', 'report']
  if (keys.join(',') !== wanted.join(',')) return respond(400, { status: 'body_invalid' })

  const parsed = parseResearchArchive(body.report)
  if (!parsed.ok) return respond(422, { status: parsed.reason })
  const digest = archiveDigest(parsed.value)

  if (body.mode === 'preview') return respond(200, {
    status: 'preview', count: parsed.value.result.length, digest,
    stored: false, outreachReady: false, historyComplete: false,
  })
  if (typeof body.digest !== 'string' || !/^[0-9a-f]{64}$/.test(body.digest) ||
    !constantTimeEqual(body.digest, digest) ||
    typeof body.confirmation !== 'string' ||
    !constantTimeEqual(body.confirmation, RESEARCH_ARCHIVE_CONFIRMATION))
    return respond(403, { status: 'confirmation_invalid' })
  if (!digestApproved(digest, deps.env[RESEARCH_ARCHIVE_APPROVED_DIGEST_ENV]))
    return respond(403, { status: 'digest_not_approved' })

  try {
    const existing = await deps.readExisting(digest)
    if (existing.failed) return respond(503, { status: 'unavailable' })
    if (existing.exists) return respond(409, { status: 'already_saved' })
    const saved = await deps.save({
      project_id: HANDLARBORSEN_PROJECT_ID,
      owner_id: user.id,
      snapshot_sha256: digest,
      report: parsed.value,
      review_state: 'awaiting_manual_review',
      history_complete: false,
      contactability: 'BLOCKED_PENDING_VERIFICATION',
      outreach_ready: false,
    })
    if (saved.failed) return respond(503, { status: 'unavailable' })
  } catch { return respond(503, { status: 'unavailable' }) }

  return respond(201, {
    status: 'saved_for_review', count: 81, digest,
    outreachReady: false, historyComplete: false,
  })
}
