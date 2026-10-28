import 'server-only'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import {
  IMPORT_MAX_BYTES, buildImportIntake, digestApproved, parseImportRequest, type ImportIntakeFailure,
} from './import-intake'
import type { CandidateImportRow } from './import-manifest'

const headers = { 'cache-control': 'private, no-store' }
const respond = (status: number, value: unknown) => Response.json(value, { status, headers })

/** Never buffer unbounded user-controlled POST bodies, even without Content-Length. */
export async function readBoundedImportBody(request: Request):
  Promise<{ ok: true; text: string } | { ok: false; status: 400 | 413 }> {
  if (!request.body) return { ok: false, status: 400 }
  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > IMPORT_MAX_BYTES) {
        await reader.cancel().catch(() => undefined)
        return { ok: false, status: 413 }
      }
      parts.push(value)
    }
    const raw = new Uint8Array(size)
    let at = 0
    for (const part of parts) { raw.set(part, at); at += part.byteLength }
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(raw) }
  } catch {
    return { ok: false, status: 400 }
  } finally {
    reader.releaseLock()
  }
}

export const IMPORT_PREVIEW_FLAG = 'HB_LEADFINDER_IMPORT_PREVIEW_ENABLED'
export const IMPORT_WRITE_FLAG = 'HB_LEADFINDER_IMPORT_WRITE_ENABLED'
export const IMPORT_DIGEST_ENV = 'HB_LEADFINDER_APPROVED_SHA256'

export interface ImportProjectRow {
  id: string
  slug: string
  name: string
  owner_id: string
  executionPaused: boolean
}

/** Minimal write surface. The service-role client only ever exists behind this. */
export interface ImportWriter {
  countCandidates(projectId: string): Promise<{ count: number | null; failed: boolean }>
  insertCandidates(rows: CandidateImportRow[]): Promise<{ failed: boolean }>
}

export interface LeadFinderImportDeps {
  env: Record<string, string | undefined>
  /** Real session user (auth.getUser), never a cookie-trusting shortcut. */
  getUser: () => Promise<{ id: string } | null>
  /** RLS read of projects filtered by exact id AND owner_id. */
  loadProject: (userId: string) => Promise<ImportProjectRow | null>
  isHandlarborsenProject: (p: { id: string; slug: string; name: string }) => boolean
  /** Called ONLY on an authorized, fully validated commit. */
  getWriter: () => ImportWriter
}

const failureStatus: Record<ImportIntakeFailure, number> = {
  body_too_large: 413, body_invalid: 400, unknown_fields: 400, mode_invalid: 400,
  confirmation_invalid: 400, snapshot_invalid: 422, manifest_invalid: 422,
}

/**
 * POST /api/atlas/handlarborsen/lead-finder/import
 * Disabled unless env flags are exactly "true". Preview never writes and never
 * creates a service-role client. Commit additionally needs the write flag, an
 * approved SHA-256 from server env, the human confirmation phrase and an empty
 * target table. No payload or row data is ever logged or echoed on failure.
 */
export async function leadFinderImportApi(request: Request, deps: LeadFinderImportDeps): Promise<Response> {
  if (request.method !== 'POST') return respond(405, { status: 'method_not_allowed' })
  if (deps.env[IMPORT_PREVIEW_FLAG] !== 'true') return respond(404, { status: 'disabled' })

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
  const parsed = parseImportRequest(read.text)
  if (!parsed.ok) return respond(failureStatus[parsed.code], { status: parsed.code })
  const intake = buildImportIntake(parsed.value.csv, parsed.value.summary)
  if (!intake.ok) return respond(failureStatus[intake.code], { status: intake.code })
  const { manifest, aggregate } = intake.value

  if (parsed.value.mode === 'preview') {
    return respond(200, { status: 'preview', imported: false, aggregate })
  }

  if (deps.env[IMPORT_WRITE_FLAG] !== 'true') return respond(404, { status: 'disabled' })
  if (!digestApproved(aggregate.digest, deps.env[IMPORT_DIGEST_ENV])) return respond(403, { status: 'digest_not_approved' })

  try {
    const writer = deps.getWriter()
    const existing = await writer.countCandidates(HANDLARBORSEN_PROJECT_ID)
    if (existing.failed || existing.count === null) return respond(503, { status: 'unavailable' })
    if (existing.count !== 0) return respond(409, { status: 'table_not_empty' })
    const inserted = await writer.insertCandidates(manifest.records)
    if (inserted.failed) return respond(503, { status: 'unavailable' })
  } catch { return respond(503, { status: 'unavailable' }) }
  return respond(201, { status: 'imported', imported: true, count: manifest.records.length, digest: aggregate.digest })
}
