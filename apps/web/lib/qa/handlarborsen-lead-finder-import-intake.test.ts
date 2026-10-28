import { describe, expect, it, vi } from 'vitest'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { withCheckDigit } from '@/lib/handlarborsen/lead-finder/fixtures'
import { csvField } from '@/lib/handlarborsen/lead-finder/offline-vetting'
import { STATUS_AUDIT_EXPORT_COLUMNS } from '@/lib/handlarborsen/lead-finder/status-audit'
import {
  IMPORT_COMMIT_CONFIRMATION, IMPORT_MAX_BYTES, buildImportIntake, digestApproved, parseImportRequest,
} from '@/lib/handlarborsen/lead-finder/import-intake'
import {
  leadFinderImportApi, type ImportProjectRow, type ImportWriter, type LeadFinderImportDeps,
} from '@/lib/handlarborsen/lead-finder/import-api'

type Col = (typeof STATUS_AUDIT_EXPORT_COLUMNS)[number]
type Rec = Record<Col, string>

function synthetic(mutate?: (rows: Rec[]) => void): Rec[] {
  const rows: Rec[] = []
  for (let i = 0; i < 89; i++) {
    const inactive = i >= 83
    const restricted = i === 10
    rows.push({
      legalCompanyName: `Firma${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))} Test ${i} AB`,
      orgnr: withCheckDigit('55600' + String(1000 + i).padStart(4, '0')),
      city: 'Teststad', sni: '47.811', scbStatusCode: inactive ? '9' : '1',
      scbStatusClass: inactive ? 'NOT_ACTIVE_PER_SCB' : 'ACTIVE_PER_SCB_NOT_MARKETING_APPROVAL',
      legalFormCode: i === 5 ? '31' : '49', legalFormLabel: i === 5 ? 'Handelsbolag, kommanditbolag' : 'Aktiebolag',
      reklamCode: restricted ? '2' : '1', epostCode: restricted ? '2' : '1', telefonCode: restricted ? '2' : '1',
      marketingReview: restricted ? 'RESTRICTION_MANUAL_REVIEW' : 'NO_SCB_RESTRICTION_SIGNAL_NOT_PERMISSION',
      priorContactReview: i === 20 ? 'KNOWN_PRIOR_CONTACT' : 'NO_MATCH_IN_PARTIAL_HISTORY',
      legalIdentityReview: 'JE_IDENTITY_CONFIRMED', manual_review_only: 'true', NOT_CONTACTABLE: 'true', historyCoverage: 'PARTIAL',
    })
  }
  mutate?.(rows)
  return rows
}
const toCsv = (rows: Rec[]) =>
  [STATUS_AUDIT_EXPORT_COLUMNS.join(','), ...rows.map(r => STATUS_AUDIT_EXPORT_COLUMNS.map(c => csvField(r[c])).join(','))].join('\r\n') + '\r\n'
const SUMMARY = {
  sourceRows: 90, reviewedLegalEntities: 89, excludedPhysicalPersons: 1, activePerScb: 83, notActivePerScb: 6,
  scbRestrictionRows: 1, emailRestricted: 1, reklamRestricted: 1, phoneRestricted: 1, knownPriorContacts: 1, unknownPriorContacts: 88,
  outreachReady: 0, contactability: 'BLOCKED_PENDING_VERIFICATION', sourceCoverage: 'PARTIAL', sourceStatus: 'OFFLINE_CORRECTED_FROM_SCB_CODEBOOKS',
}
const csv = () => toCsv(synthetic())
const body = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ mode: 'preview', csv: csv(), summary: JSON.stringify(SUMMARY), ...extra })
const commitBody = (extra: Record<string, unknown> = {}) => body({ mode: 'commit', confirmation: IMPORT_COMMIT_CONFIRMATION, ...extra })
const digest = () => {
  const r = buildImportIntake(csv(), JSON.stringify(SUMMARY))
  if (!r.ok) throw new Error('fixture invalid')
  return r.value.aggregate.digest
}

describe('import intake (pure)', () => {
  it('builds 89 blocked records and a sanitized aggregate with digest only', () => {
    const r = buildImportIntake(csv(), JSON.stringify(SUMMARY))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.manifest.records).toHaveLength(89)
    expect(r.value.manifest.records.every(x =>
      x.contactability === 'BLOCKED_PENDING_VERIFICATION' && x.outreach_ready === false && x.score === null)).toBe(true)
    expect(r.value.aggregate).toMatchObject({
      count: 89, inactive: 6, marketingRestricted: 1, priorContact: 1, outreachReady: 0,
      contactability: 'BLOCKED_PENDING_VERIFICATION', historyCoverage: 'PARTIAL', sourcePhysicalPersonsExcluded: 1,
    })
    expect(r.value.aggregate.digest).toMatch(/^[0-9a-f]{64}$/)
    const json = JSON.stringify(r.value.aggregate)
    expect(json).not.toMatch(/Test \d|Teststad|orgnr|5560/)
    expect(digest()).toBe(r.value.aggregate.digest) // deterministic
  })
  it('rejects malformed payloads and unknown fields', () => {
    for (const raw of ['', 'nope', '[]', 'null', '"x"', 'not json {']) {
      expect(parseImportRequest(raw)).toMatchObject({ ok: false, code: 'body_invalid' })
    }
    expect(parseImportRequest(body({ extra: 1 }))).toMatchObject({ ok: false, code: 'unknown_fields' })
    expect(parseImportRequest(body({ project_id: HANDLARBORSEN_PROJECT_ID }))).toMatchObject({ ok: false, code: 'unknown_fields' })
    expect(parseImportRequest(body({ path: 'C:/x.csv' }))).toMatchObject({ ok: false, code: 'unknown_fields' })
    expect(parseImportRequest(body({ mode: 'upsert' }))).toMatchObject({ ok: false, code: 'mode_invalid' })
    expect(parseImportRequest(body({ csv: 5 }))).toMatchObject({ ok: false, code: 'body_invalid' })
    expect(parseImportRequest(body({ confirmation: 'x' }))).toMatchObject({ ok: false, code: 'unknown_fields' }) // preview takes none
  })
  it('enforces the byte cap in bytes, not characters', () => {
    expect(parseImportRequest(JSON.stringify({ mode: 'preview', csv: 'å'.repeat(IMPORT_MAX_BYTES / 2), summary: '{}' })))
      .toMatchObject({ ok: false, code: 'body_too_large' })
    expect(Buffer.byteLength(body())).toBeLessThanOrEqual(IMPORT_MAX_BYTES)
  })
  it('requires the exact manual confirmation phrase for commit', () => {
    expect(parseImportRequest(commitBody()).ok).toBe(true)
    for (const c of ['', 'importera 89 som ej kontaktbara', IMPORT_COMMIT_CONFIRMATION + ' ', 'IMPORTERA 89', 5 as never]) {
      expect(parseImportRequest(commitBody({ confirmation: c }))).toMatchObject({ ok: false, code: 'confirmation_invalid' })
    }
    const noConf = JSON.parse(commitBody()); delete noConf.confirmation
    expect(parseImportRequest(JSON.stringify(noConf))).toMatchObject({ ok: false, code: 'confirmation_invalid' })
  })
  it('fails closed on PII, person legal form, wrong totals and bad status without leaking input', () => {
    const cases: Array<[string, string, unknown]> = [
      ['person jurform 10', toCsv(synthetic(r => { r[3].legalFormCode = '10'; r[3].legalFormLabel = 'Fysiska personer' })), SUMMARY],
      ['email in name', toCsv(synthetic(r => { r[4].legalCompanyName = 'Leak person@example.com AB' })), SUMMARY],
      ['phone in name', toCsv(synthetic(r => { r[4].legalCompanyName = 'Ring +46 70 123 45 67 AB' })), SUMMARY],
      ['personnummer orgnr', toCsv(synthetic(r => { r[4].orgnr = withCheckDigit('850101123') })), SUMMARY],
      ['88 rows', toCsv(synthetic(r => { r.pop() })), SUMMARY],
      ['wrong totals', csv(), { ...SUMMARY, activePerScb: 84 }],
      ['wrong source rows', csv(), { ...SUMMARY, sourceRows: 91 }],
      ['status not blocked', csv(), { ...SUMMARY, contactability: 'CONTACTABLE' }],
      ['outreach ready', csv(), { ...SUMMARY, outreachReady: 1 }],
      ['row contactable', toCsv(synthetic(r => { r[0].NOT_CONTACTABLE = 'false' })), SUMMARY],
      ['full history', toCsv(synthetic(r => { r[0].historyCoverage = 'FULL' })), SUMMARY],
    ]
    for (const [label, c, s] of cases) {
      const r = buildImportIntake(c, JSON.stringify(s))
      expect(r.ok, label).toBe(false)
      if (!r.ok) {
        expect(JSON.stringify(r), label).toMatch(/^\{"ok":false,"code":"(snapshot_invalid|manifest_invalid)"\}$/)
      }
    }
    expect(buildImportIntake(csv(), 'not json')).toMatchObject({ ok: false, code: 'snapshot_invalid' })
  })
  it('digestApproved needs exact 64-hex match', () => {
    const d = digest()
    expect(digestApproved(d, d)).toBe(true)
    expect(digestApproved(d, d.toUpperCase())).toBe(false)
    expect(digestApproved(d, undefined)).toBe(false)
    expect(digestApproved(d, '')).toBe(false)
    expect(digestApproved(d, 'a'.repeat(64))).toBe(false)
    expect(digestApproved(d, d.slice(1))).toBe(false)
  })
})

const ORIGIN = 'https://app.example.test'
const URL_ = ORIGIN + '/api/atlas/handlarborsen/lead-finder/import'
const OWNER = '11111111-1111-4111-8111-111111111111'
const ownerProject = (over: Partial<ImportProjectRow> = {}): ImportProjectRow => ({
  id: HANDLARBORSEN_PROJECT_ID, slug: 'handlarborsen', name: 'Handlarbörsen', owner_id: OWNER, executionPaused: false, ...over,
})
function harness(opts: {
  env?: Record<string, string | undefined>
  user?: { id: string } | null
  project?: ImportProjectRow | null
  count?: { count: number | null; failed: boolean }
  insertFailed?: boolean
  isProject?: boolean
} = {}) {
  const writer: ImportWriter = {
    countCandidates: vi.fn(async () => opts.count ?? { count: 0, failed: false }),
    insertCandidates: vi.fn(async () => ({ failed: opts.insertFailed ?? false })),
  }
  const getWriter = vi.fn(() => writer)
  const deps: LeadFinderImportDeps = {
    env: opts.env ?? { HB_LEADFINDER_IMPORT_PREVIEW_ENABLED: 'true' },
    getUser: vi.fn(async () => (opts.user === undefined ? { id: OWNER } : opts.user)),
    loadProject: vi.fn(async () => (opts.project === undefined ? ownerProject() : opts.project)),
    isHandlarborsenProject: () => opts.isProject ?? true,
    getWriter,
  }
  return { deps, writer, getWriter }
}
const req = (payload: string, init: { origin?: string | null; type?: string; method?: string } = {}) => {
  const h = new Headers()
  if (init.origin !== null) h.set('origin', init.origin ?? ORIGIN)
  h.set('content-type', init.type ?? 'application/json')
  return new Request(URL_, { method: init.method ?? 'POST', headers: h, body: init.method === 'GET' ? undefined : payload })
}
const COMMIT_ENV = () => ({
  HB_LEADFINDER_IMPORT_PREVIEW_ENABLED: 'true', HB_LEADFINDER_IMPORT_WRITE_ENABLED: 'true', HB_LEADFINDER_APPROVED_SHA256: digest(),
})
const status = async (r: Response) => ({ status: r.status, json: await r.json() })

describe('import route gate', () => {
  it('is disabled by default (no flags, wrong flag values) and touches nothing', async () => {
    for (const env of [{}, { HB_LEADFINDER_IMPORT_PREVIEW_ENABLED: 'TRUE' }, { HB_LEADFINDER_IMPORT_PREVIEW_ENABLED: '1' }, { HB_LEADFINDER_IMPORT_WRITE_ENABLED: 'true' }]) {
      const h = harness({ env })
      expect((await leadFinderImportApi(req(body()), h.deps)).status).toBe(404)
      expect(h.deps.getUser).not.toHaveBeenCalled()
      expect(h.getWriter).not.toHaveBeenCalled()
    }
  })
  it('preview returns only aggregate + digest, no names, and never creates the writer', async () => {
    const h = harness()
    const { status: s, json } = await status(await leadFinderImportApi(req(body()), h.deps))
    expect(s).toBe(200)
    expect(json).toMatchObject({ status: 'preview', imported: false, aggregate: { count: 89, digest: digest() } })
    expect(JSON.stringify(json)).not.toMatch(/Test \d|Teststad|5560|records/)
    expect(h.getWriter).not.toHaveBeenCalled()
    expect(h.writer.insertCandidates).not.toHaveBeenCalled()
  })
  it('rejects wrong method, origin, content type and oversized body before auth', async () => {
    const h = harness()
    expect((await leadFinderImportApi(req(body(), { method: 'GET' }), h.deps)).status).toBe(405)
    expect((await leadFinderImportApi(req(body(), { origin: 'https://evil.test' }), h.deps)).status).toBe(403)
    expect((await leadFinderImportApi(req(body(), { origin: null }), h.deps)).status).toBe(403)
    expect((await leadFinderImportApi(req(body(), { type: 'text/plain' }), h.deps)).status).toBe(415)
    const big = new Request(URL_, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', 'content-length': String(IMPORT_MAX_BYTES + 1) }, body: '{}' })
    expect((await leadFinderImportApi(big, h.deps)).status).toBe(413)
    expect(h.deps.getUser).not.toHaveBeenCalled()
    expect(h.getWriter).not.toHaveBeenCalled()
  })
  it('enforces byte cap even when Content-Length is omitted, without constructing a writer', async () => {
    const h = harness()
    const headers = new Headers({ origin: ORIGIN, 'content-type': 'application/json' })
    const unlimitedHeader = new Request(URL_, {
      method: 'POST', headers, body: 'x'.repeat(IMPORT_MAX_BYTES + 1),
    })
    expect(unlimitedHeader.headers.get('content-length')).toBeNull()
    expect((await leadFinderImportApi(unlimitedHeader, h.deps)).status).toBe(413)
    expect(h.getWriter).not.toHaveBeenCalled()
  })
  it('rejects unauthenticated, wrong-owner, wrong-project and paused callers without a writer', async () => {
    const cases: Array<[string, Parameters<typeof harness>[0], number]> = [
      ['no session', { user: null }, 401],
      ['project not visible', { project: null }, 403],
      ['other owner', { project: ownerProject({ owner_id: 'someone-else' }) }, 403],
      ['other project id', { project: ownerProject({ id: '00000000-0000-4000-8000-000000000000' }) }, 403],
      ['not handlarborsen', { isProject: false }, 403],
      ['paused', { project: ownerProject({ executionPaused: true }) }, 409],
    ]
    for (const [label, opts, code] of cases) {
      const h = harness({ ...opts, env: COMMIT_ENV() })
      expect((await leadFinderImportApi(req(commitBody()), h.deps)).status, label).toBe(code)
      expect(h.getWriter, label).not.toHaveBeenCalled()
    }
    const failing = harness({ env: COMMIT_ENV() })
    failing.deps.loadProject = async () => { throw new Error('boom secret') }
    const r = await status(await leadFinderImportApi(req(commitBody()), failing.deps))
    expect(r).toEqual({ status: 503, json: { status: 'unavailable' } })
    expect(failing.getWriter).not.toHaveBeenCalled()
  })
  it('invalid payload in either mode never reaches the writer', async () => {
    const h = harness({ env: COMMIT_ENV() })
    expect((await leadFinderImportApi(req('{bad'), h.deps)).status).toBe(400)
    expect((await leadFinderImportApi(req(commitBody({ confirmation: 'ja' })), h.deps)).status).toBe(400)
    expect((await leadFinderImportApi(req(commitBody({ project_id: HANDLARBORSEN_PROJECT_ID })), h.deps)).status).toBe(400)
    const bad = JSON.stringify({ mode: 'commit', confirmation: IMPORT_COMMIT_CONFIRMATION, summary: JSON.stringify(SUMMARY), csv: toCsv(synthetic(r => { r[3].legalFormCode = '10' })) })
    const res = await status(await leadFinderImportApi(req(bad), h.deps))
    expect(res).toEqual({ status: 422, json: { status: 'snapshot_invalid' } })
    expect(h.getWriter).not.toHaveBeenCalled()
  })
  it('commit needs the second write flag', async () => {
    const env = { HB_LEADFINDER_IMPORT_PREVIEW_ENABLED: 'true', HB_LEADFINDER_APPROVED_SHA256: digest() }
    const h = harness({ env })
    expect((await leadFinderImportApi(req(commitBody()), h.deps)).status).toBe(404)
    expect(h.getWriter).not.toHaveBeenCalled()
  })
  it('commit needs the approved digest from server env', async () => {
    for (const approved of [undefined, '', 'f'.repeat(64), digest().toUpperCase()]) {
      const h = harness({ env: { ...COMMIT_ENV(), HB_LEADFINDER_APPROVED_SHA256: approved } })
      expect((await leadFinderImportApi(req(commitBody()), h.deps)).status).toBe(403)
      expect(h.getWriter).not.toHaveBeenCalled()
    }
  })
  it('commit does one atomic insert of 89 blocked rows into an empty table', async () => {
    const h = harness({ env: COMMIT_ENV() })
    const { status: s, json } = await status(await leadFinderImportApi(req(commitBody()), h.deps))
    expect(s).toBe(201)
    expect(json).toEqual({ status: 'imported', imported: true, count: 89, digest: digest() })
    expect(h.writer.countCandidates).toHaveBeenCalledWith(HANDLARBORSEN_PROJECT_ID)
    expect(h.writer.insertCandidates).toHaveBeenCalledTimes(1)
    const rows = (h.writer.insertCandidates as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<Record<string, unknown>>
    expect(rows).toHaveLength(89)
    expect(rows.every(x => x.project_id === HANDLARBORSEN_PROJECT_ID && x.outreach_ready === false &&
      x.contactability === 'BLOCKED_PENDING_VERIFICATION' && x.score === null)).toBe(true)
    expect(JSON.stringify(rows)).not.toMatch(/"email"|"phone"|"recipient"/)
  })
  it('commit refuses a non-empty table and never overwrites', async () => {
    const h = harness({ env: COMMIT_ENV(), count: { count: 3, failed: false } })
    expect(await status(await leadFinderImportApi(req(commitBody()), h.deps))).toEqual({ status: 409, json: { status: 'table_not_empty' } })
    expect(h.writer.insertCandidates).not.toHaveBeenCalled()
  })
  it('maps missing table / DB failures to a sanitized 503', async () => {
    for (const opts of [{ count: { count: null, failed: true } }, { insertFailed: true }]) {
      const h = harness({ env: COMMIT_ENV(), ...opts })
      expect(await status(await leadFinderImportApi(req(commitBody()), h.deps))).toEqual({ status: 503, json: { status: 'unavailable' } })
    }
    const thrower = harness({ env: COMMIT_ENV() })
    thrower.writer.insertCandidates = async () => { throw new Error('relation "hb_lead_candidates" detail Firma') }
    const t = await status(await leadFinderImportApi(req(commitBody()), thrower.deps))
    expect(t).toEqual({ status: 503, json: { status: 'unavailable' } })
  })
  it('route file wires createAdminClient only inside getWriter', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const src = readFileSync(fileURLToPath(new URL('../../app/api/atlas/handlarborsen/lead-finder/import/route.ts', import.meta.url)), 'utf8')
    expect(src).not.toMatch(/export async function (GET|PUT|PATCH|DELETE)/)
    expect(src).not.toMatch(/upsert|\.update\(|\.delete\(|console\./)
    const afterGetWriter = src.slice(src.indexOf('const writer'))
    expect(src.slice(0, src.indexOf('const writer')).match(/createAdminClient\(/g)).toBeNull()
    expect(afterGetWriter).toContain('createAdminClient()')
  })
})
