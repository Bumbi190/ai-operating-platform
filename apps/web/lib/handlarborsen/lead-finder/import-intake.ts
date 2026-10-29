import { createHash, timingSafeEqual } from 'node:crypto'
import { HANDLARBORSEN_PROJECT_ID } from '../../atlas/handlarborsen-test-data/contracts'
import { buildLocalReview } from './local-review'
import { makeCandidateImportManifest, type CandidateImportManifest } from './import-manifest'

/**
 * PURE intake for the owner-gated private import route. Takes untrusted text,
 * returns either a validated manifest + sanitized aggregate or a bare failure
 * code. No network, filesystem, database or env access here, and no failure
 * ever echoes input (names, orgnr, CSV cells, parser messages).
 */
export const IMPORT_MAX_BYTES = 150_000
export const IMPORT_COMMIT_CONFIRMATION = 'IMPORTERA 89 SOM EJ KONTAKTBARA' as const

export type ImportIntakeFailure =
  | 'body_too_large' | 'body_invalid' | 'unknown_fields' | 'mode_invalid' | 'confirmation_invalid'
  | 'snapshot_invalid' | 'manifest_invalid'

export type ImportRequest =
  | { mode: 'preview'; csv: string; summary: string }
  | { mode: 'commit'; csv: string; summary: string; confirmation: string }

export interface ImportAggregate {
  count: 89
  needsReview: number
  excluded: number
  suppressed: number
  inactive: number
  marketingRestricted: number
  priorContact: number
  legalFormsRequiringReview: number
  sourceRows: 90
  sourcePhysicalPersonsExcluded: 1
  historyCoverage: 'PARTIAL'
  contactability: 'BLOCKED_PENDING_VERIFICATION'
  outreachReady: 0
  digest: string
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; code: ImportIntakeFailure }
const bad = (code: ImportIntakeFailure): { ok: false; code: ImportIntakeFailure } => ({ ok: false, code })

const ALLOWED_KEYS = ['mode', 'csv', 'summary', 'confirmation']

export function parseImportRequest(rawText: unknown): ParseResult<ImportRequest> {
  if (typeof rawText !== 'string') return bad('body_invalid')
  if (Buffer.byteLength(rawText, 'utf8') > IMPORT_MAX_BYTES) return bad('body_too_large')
  let body: unknown
  try { body = JSON.parse(rawText) } catch { return bad('body_invalid') }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return bad('body_invalid')
  const rec = body as Record<string, unknown>
  if (Object.keys(rec).some(k => !ALLOWED_KEYS.includes(k))) return bad('unknown_fields')
  if (rec.mode !== 'preview' && rec.mode !== 'commit') return bad('mode_invalid')
  if (typeof rec.csv !== 'string' || typeof rec.summary !== 'string' || !rec.csv || !rec.summary) return bad('body_invalid')
  if (rec.mode === 'preview') {
    if ('confirmation' in rec) return bad('unknown_fields')
    return { ok: true, value: { mode: 'preview', csv: rec.csv, summary: rec.summary } }
  }
  if (typeof rec.confirmation !== 'string' || !constantTimeEqual(rec.confirmation, IMPORT_COMMIT_CONFIRMATION)) {
    return bad('confirmation_invalid')
  }
  return { ok: true, value: { mode: 'commit', csv: rec.csv, summary: rec.summary, confirmation: rec.confirmation } }
}

export function constantTimeEqual(a: string, b: string): boolean {
  const x = createHash('sha256').update(a).digest()
  const y = createHash('sha256').update(b).digest()
  return timingSafeEqual(x, y) && a.length === b.length
}

/** Deterministic: records are sorted by orgnr and built with a fixed key order. */
export function manifestDigest(manifest: CandidateImportManifest): string {
  return createHash('sha256').update(JSON.stringify(manifest.records)).digest('hex')
}

export interface ImportIntake { manifest: CandidateImportManifest; aggregate: ImportAggregate }

export function buildImportIntake(csv: string, summary: string): ParseResult<ImportIntake> {
  const state = buildLocalReview(csv, summary)
  if (state.status !== 'ready') return bad('snapshot_invalid')
  let manifest: CandidateImportManifest
  try { manifest = makeCandidateImportManifest(state.review, HANDLARBORSEN_PROJECT_ID) } catch { return bad('manifest_invalid') }
  if (manifest.records.length !== 89) return bad('manifest_invalid')
  const s = manifest.stats
  return {
    ok: true,
    value: {
      manifest,
      aggregate: {
        count: 89, needsReview: s.needsReview, excluded: s.excluded, suppressed: s.suppressed,
        inactive: s.inactive, marketingRestricted: s.marketingRestricted, priorContact: s.priorContact,
        legalFormsRequiringReview: s.legalFormsRequiringReview, sourceRows: 90, sourcePhysicalPersonsExcluded: 1,
        historyCoverage: 'PARTIAL', contactability: 'BLOCKED_PENDING_VERIFICATION', outreachReady: 0,
        digest: manifestDigest(manifest),
      },
    },
  }
}

/** Approved digest comes from server env; anything but 64 lowercase hex never matches. */
export function digestApproved(actual: string, approved: string | undefined): boolean {
  if (!approved || !/^[0-9a-f]{64}$/.test(approved) || !/^[0-9a-f]{64}$/.test(actual)) return false
  return constantTimeEqual(actual, approved)
}
