import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HandlarborsenResearchArchive } from '@/components/platform/vnext/HandlarborsenResearchArchive'
import { describe, expect, it, vi } from 'vitest'
import { withCheckDigit } from '@/lib/handlarborsen/lead-finder/fixtures'
import { normalizeOrgnr } from '@/lib/handlarborsen/lead-finder/identity'
import { DOCUMENTED_PILOT_HISTORY, DOCUMENTED_PILOT_HISTORY_COUNTS,
  documentedPilotHistoryEntries } from '@/lib/handlarborsen/lead-finder/documented-pilot-history'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import {
  parseResearchArchive, reconcileArchiveWithCrm, type ArchiveReport, type ArchiveCompany, type ArchiveReview,
} from '@/lib/handlarborsen/lead-finder/research-archive'
import { parseKnownContacts } from '@/lib/handlarborsen/lead-finder/known-contacts'
import {
  archiveDigest, leadFinderResearchArchiveApi, RESEARCH_ARCHIVE_CONFIRMATION,
  type ResearchArchiveDeps,
} from '@/lib/handlarborsen/lead-finder/research-archive-api'

const OWNER = '11111111-1111-4111-8111-111111111111'
function sample(): ArchiveReport {
  const result = Array.from({ length: 81 }, (_, i) => {
    const sale = i < 4
    const registeredOnly = i >= 4 && i < 11
    const none = i >= 11 && i < 17
    const ownDomain = i < 28 ? 'https://firm'+i+'.se/' : null
    const label: ArchiveCompany['label'] = sale ? (i === 3
      ? 'Handlarprofil på marknadsplats – juridik ej verifierad'
      : 'Bilförsäljning på möjlig egen webbplats – juridik ej verifierad')
      : registeredOnly ? 'Registrerad bilhandel – aktuell försäljning ej verifierad'
      : none ? 'Inga relevanta källor' : 'Företagsuppgifter – mer research'
    return {
      orgnr: withCheckDigit('55600' + String(1000 + i).padStart(4, '0')),
      name: i === 7 ? 'AutoSlottsstaden AB' : 'Företag ' + String(i) + ' Aktiebolag',
      city: 'Malmö',
      matches: none ? 0 : 3,
      ownDomain,
      source: none ? '' : (i === 3 ? 'https://www.bytbil.com/handlare/test'
        : 'https://firm'+i+'.se/'),
      label,
      sale, registeredOnly, other: false, contactable: false as const,
    }
  })
  return { counts: {
    totalSCB: 89, eligible: 81, covered: 81, entries: 77,
    budgetBookkeeping: 87, budgetCap: 120, potentialOwnDomain: 28,
    saleSignalsToReview: 4, registeredOnly: 7, noRelevantSource: 6,
    noneContactable: true,
  }, result }
}
const report = sample()
const request = (body: unknown, extra: Record<string, string> = {}) =>
  new Request('https://preview.test/api/atlas/handlarborsen/lead-finder/archive', {
    method: 'POST',
    headers: { origin: 'https://preview.test', 'content-type': 'application/json', ...extra },
    body: JSON.stringify(body),
  })
function harness(change: Partial<ResearchArchiveDeps> = {}) {
  const readExisting = vi.fn(async () => ({ exists: false, failed: false }))
  const save = vi.fn(async (_record: unknown) => ({ failed: false }))
  const deps: ResearchArchiveDeps = {
    env: { VERCEL_ENV: 'preview', HB_LEADFINDER_RESEARCH_ARCHIVE_ENABLED: 'true',
      HB_LEADFINDER_RESEARCH_ARCHIVE_WRITE_ENABLED: 'true',
      HB_LEADFINDER_RESEARCH_ARCHIVE_APPROVED_SHA256: archiveDigest(report) },
    getUser: async () => ({ id: OWNER }),
    loadProject: async () => ({
      id: HANDLARBORSEN_PROJECT_ID,
      owner_id: OWNER, slug: 'handlarborsen', name: 'Handlarbörsen', executionPaused: false,
    }),
    isHandlarborsenProject: p => p.slug === 'handlarborsen',
    getKnownContacts: async () => parseKnownContacts([], HANDLARBORSEN_PROJECT_ID),
    readExisting, save, ...change,
  }
  return { deps, readExisting, save }
}
describe('Handlarbörsen research archive – validated, non-contactable legal entities', () => {
  it('keeps documented previous outreach separate from incomplete CRM and validates organisation numbers', () => {
    expect(DOCUMENTED_PILOT_HISTORY_COUNTS).toMatchObject({
      batch3a:10, founding:5, coverageComplete:false,
    })
    const sent=DOCUMENTED_PILOT_HISTORY.filter(x=>x.proof==='batch_3a_sent')
    expect(sent).toHaveLength(10)
    expect(new Set(sent.map(x=>x.orgnr)).size).toBe(10)
    for(const item of sent){
      expect(normalizeOrgnr(item.orgnr)).toBe(item.orgnr)
      expect(item.kind).toBe('contacted')
    }
    expect(JSON.stringify(DOCUMENTED_PILOT_HISTORY)).not.toMatch(/@|mailto:|\+46\d{7}/)
  })

  it('blocks a documented batch recipient even if the Omnira CRM contains no matching row', async () => {
    const touched: ArchiveReport = {counts:report.counts,result:report.result.map((row,i)=>
      i===0 ? {...row,name:'Halmstad Bil AB',orgnr:'5594304734'} : row)}
    expect(parseResearchArchive(touched).ok).toBe(true)
    const known = parseKnownContacts([], HANDLARBORSEN_PROJECT_ID)
    const reconciled = reconcileArchiveWithCrm(touched,known,documentedPilotHistoryEntries())
    expect(reconciled[0]).toMatchObject({
      crm:'matched_documented_history',outreachReady:false,historyComplete:false,
    })
    expect(reconciled[0].crmReasons).toContain('already_contacted')
    expect(reconciled[1].crm).toBe('no_match_in_partial_history')
    const preview = await leadFinderResearchArchiveApi(request({mode:'preview',report:touched}),
      harness({getKnownContacts:async()=>known}).deps)
    expect(preview.status).toBe(200)
    const result = await preview.json()
    expect(result.report.result[0].crm).toBe('matched_documented_history')
    expect(result.report.result[0].outreachReady).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(/@|mailto:/)
  })

  it('never grants outbound clearance when historical or CRM sources are unavailable', () => {
    const touched:ArchiveReport={counts:report.counts,result:report.result.map((row,i)=>
      i===0?{...row,name:'Kareby Bil'}:row)}
    const missing=parseKnownContacts(null,HANDLARBORSEN_PROJECT_ID)
    const rows=reconcileArchiveWithCrm(touched,missing,documentedPilotHistoryEntries())
    expect(rows[0]).toMatchObject({
      crm:'matched_documented_history',outreachReady:false,historyComplete:false,
    })
    expect(rows[1].crm).toBe('crm_unavailable')
    expect(rows.every(row=>row.outreachReady===false&&row.historyComplete===false)).toBe(true)
  })

  it('shows four manual-review priorities after saving, with no duplicate upload form or contact approval', () => {
    const known = parseKnownContacts([{project_id:HANDLARBORSEN_PROJECT_ID,data:{
      companyName:'AutoSlottsstaden',history:'contacted',suppressed:true,
    }}],HANDLARBORSEN_PROJECT_ID)
    const saved: ArchiveReview = {
      status:'ready',sourceDigest:archiveDigest(report),createdAt:'2026-10-29T07:21:47Z',
      crmStatus:known.status,
      report:{counts:report.counts,result:reconcileArchiveWithCrm(report,known)},
      outreachReady:false,historyComplete:false,
    }
    const html = renderToStaticMarkup(React.createElement(HandlarborsenResearchArchive,{
      archive:saved,saveEnabled:true,
    }))
    expect(html).toContain('Granska försäljningsindikationer först (4)')
    expect(html).toContain('Arkivet är permanent sparat')
    expect(html).toContain('Kända kontakter (CRM / historik)')
    expect(html).not.toContain('id="hb-archive-file"')
    expect(html).not.toContain('Spara endast som granskningsunderlag')
    expect(html).not.toContain('Godkänn kontakt')
    const blank = renderToStaticMarkup(React.createElement(HandlarborsenResearchArchive,{
      archive:{status:'empty'},saveEnabled:false,
    }))
    expect(blank).toContain('Förhandsgranska källrapporten')
    expect(blank).toContain('id="hb-archive-file"')
    expect(blank).not.toContain('Granska försäljningsindikationer först')
  })

  it('accepts 81 synthetic legal entities and rejects changed safety classifications', () => {
    expect(parseResearchArchive(report)).toMatchObject({ ok: true })
    expect(report.result.every(x => x.contactable === false)).toBe(true)
    expect(parseResearchArchive({ ...report, result: report.result.slice(1) })).toMatchObject({ ok: false })
    const changed = structuredClone(report)
    changed.result[0].contactable = true as never
    expect(parseResearchArchive(changed)).toMatchObject({ ok: false, reason: 'company_invalid' })
    const dup = structuredClone(report)
    dup.result[1].orgnr = dup.result[0].orgnr
    expect(parseResearchArchive(dup)).toMatchObject({ ok: false, reason: 'company_invalid' })
    const pii = structuredClone(report)
    pii.result[1].name = 'Anna Svensson <ana@email.se>'
    expect(parseResearchArchive(pii)).toMatchObject({ ok: false })
    const badUrl = structuredClone(report)
    badUrl.result[0].source = 'javascript:alert(1)'
    expect(parseResearchArchive(badUrl)).toMatchObject({ ok: false })
    const spoofed = structuredClone(report)
    spoofed.counts.saleSignalsToReview = 45
    expect(parseResearchArchive(spoofed)).toMatchObject({ ok: false, reason: 'counts_invalid' })
  })

  it('uses a stable archive SHA-256 even if a database jsonb object reorders keys', () => {
    const reverse = (value: unknown): unknown => Array.isArray(value)
      ? value.map(reverse) : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).reverse().map(([key, v]) => [key, reverse(v)]))
        : value
    expect(archiveDigest(report)).toBe(archiveDigest(reverse(report) as ArchiveReport))
    expect(archiveDigest(report)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('only flags exact CRM overlaps and never treats unmatched companies as outreach-safe', () => {
    const known = parseKnownContacts([
      { project_id: HANDLARBORSEN_PROJECT_ID, data: {
        companyName: 'AutoSlottsstaden', history: 'contacted', suppressed: true,
        email: 'person@private.example',
      } },
    ], HANDLARBORSEN_PROJECT_ID)
    const rows = reconcileArchiveWithCrm(report, known)
    expect(rows.filter(x => x.crm === 'matched_existing_contact')).toHaveLength(1)
    expect(rows.find(x => x.name === 'AutoSlottsstaden AB')).toMatchObject({
      crm: 'matched_existing_contact', outreachReady: false, historyComplete: false,
    })
    expect(rows.filter(x => x.crm === 'no_match_in_partial_history')).toHaveLength(80)
    expect(JSON.stringify(rows)).not.toContain('person@')
    expect(rows.every(x => x.outreachReady === false && x.historyComplete === false)).toBe(true)
    const blocked = reconcileArchiveWithCrm(report, parseKnownContacts(null, HANDLARBORSEN_PROJECT_ID))
    expect(blocked.every(x => x.crm === 'crm_unavailable')).toBe(true)
  })

  it('previews the report without creating a writer, then requires exact confirmation to save', async () => {
    const h = harness()
    const response = await leadFinderResearchArchiveApi(request({ mode: 'preview', report }), h.deps)
    expect(response.status).toBe(200)
    const first = await response.json()
    expect(first).toMatchObject({ count: 81, stored: false, outreachReady: false, historyComplete: false })
    expect(h.save).not.toHaveBeenCalled()
    expect(h.readExisting).not.toHaveBeenCalled()
    const wrong = await leadFinderResearchArchiveApi(request({
      mode: 'save', report, digest: first.digest, confirmation: 'GODKÄNN ALLA',
    }), h.deps)
    expect(wrong.status).toBe(403)
    expect(h.save).not.toHaveBeenCalled()
    const saved = await leadFinderResearchArchiveApi(request({
      mode: 'save', report, digest: first.digest, confirmation: RESEARCH_ARCHIVE_CONFIRMATION,
    }), h.deps)
    expect(saved.status).toBe(201)
    expect(h.readExisting).toHaveBeenCalledOnce()
    expect(h.save).toHaveBeenCalledOnce()
    expect(h.save.mock.calls[0][0]).toMatchObject({
      project_id: HANDLARBORSEN_PROJECT_ID, owner_id: OWNER,
      outreach_ready: false, history_complete: false,
      contactability: 'BLOCKED_PENDING_VERIFICATION',
    })
    const unapproved = harness({env:{VERCEL_ENV:'preview', HB_LEADFINDER_RESEARCH_ARCHIVE_ENABLED:'true'}})
    const denied = await leadFinderResearchArchiveApi(request({
      mode:'save', report, digest:first.digest, confirmation:RESEARCH_ARCHIVE_CONFIRMATION,
    }),unapproved.deps)
    expect(denied.status).toBe(404) // write flag is off: fail closed before digest validation
    expect(unapproved.save).not.toHaveBeenCalled()
    const already = harness({ readExisting: async () => ({ exists: true, failed: false }) })
    expect((await leadFinderResearchArchiveApi(request({
      mode: 'save', report, digest: first.digest, confirmation: RESEARCH_ARCHIVE_CONFIRMATION,
    }), already.deps)).status).toBe(409)
  })

  it('blocks production, unauthorized users, wrong owner, origin and malformed files before any write', async () => {
    const cases: [Partial<ResearchArchiveDeps>, Record<string,string>, number][] = [
      [{env:{VERCEL_ENV:'production',HB_LEADFINDER_RESEARCH_ARCHIVE_ENABLED:'true'}},{},404],
      [{env:{VERCEL_ENV:'preview'}},{},404],
      [{getUser:async()=>null},{},401],
      [{loadProject:async()=>null},{},403],
      [{loadProject:async()=>({
        id:HANDLARBORSEN_PROJECT_ID,owner_id:'someone-else',slug:'handlarborsen',name:'HB',
        executionPaused:false,
      })},{},403],
      [{loadProject:async()=>({
        id:HANDLARBORSEN_PROJECT_ID,owner_id:OWNER,slug:'handlarborsen',name:'HB',
        executionPaused:true,
      })},{},409],
      [{},{origin:'https://evil.test'},403],
      [{},{'content-type':'text/plain'},415],
      [{},{'content-length':'180000'},413],
    ]
    for (const [change, headers, status] of cases) {
      const h = harness(change)
      const res = await leadFinderResearchArchiveApi(request({mode:'preview',report},headers),h.deps)
      expect(res.status).toBe(status)
      expect(h.save).not.toHaveBeenCalled()
      expect(h.readExisting).not.toHaveBeenCalled()
    }
    const extra = harness()
    const res = await leadFinderResearchArchiveApi(request({mode:'preview',report,send:true}),extra.deps)
    expect(res.status).toBe(400)
    expect(extra.save).not.toHaveBeenCalled()
  })

  it('keeps the archive separated from service-role, CRM writes, outreach and schedules', () => {
    const source = readFileSync(new URL('../../app/api/atlas/handlarborsen/lead-finder/archive/route.ts', import.meta.url),'utf8')
    const api = readFileSync(new URL('../handlarborsen/lead-finder/research-archive-api.ts',import.meta.url),'utf8')
    const migration = readFileSync(new URL('../../../../docs/handlarborsen-archive-pending-migration.sql',import.meta.url),'utf8')
    expect(source).not.toMatch(/createAdminClient|service.?role|sendMail|mailto:/i)
    expect(api).not.toMatch(/sendMail|mailto:|sales_contacts|\.delete\(/i)
    expect(migration).toContain('enable row level security')
    expect(migration).toContain('for select to authenticated')
    expect(migration).toContain('for insert to authenticated')
    expect(migration).toContain('outreach_ready boolean not null default false')
    expect(migration).not.toMatch(/create (?:policy|trigger)[^\n]*(?:send|publish|schedule)/i)
  })
})
