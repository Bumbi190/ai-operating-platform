import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { withCheckDigit } from '@/lib/handlarborsen/lead-finder/fixtures'
import {
  buildLocalReview, filterLocalReview, paginateLocalReview, LocalReviewError, parseLocalReview, type LocalReviewState,
} from '@/lib/handlarborsen/lead-finder/local-review'
import { loadLocalReviewForOwner, type LocalReviewDeps } from '@/lib/handlarborsen/lead-finder/local-review-server'
import { csvField } from '@/lib/handlarborsen/lead-finder/offline-vetting'
import { STATUS_AUDIT_EXPORT_COLUMNS } from '@/lib/handlarborsen/lead-finder/status-audit'
import { HandlarborsenLeadFinder } from '@/components/platform/vnext/HandlarborsenLeadFinder'
import { HandlarborsenScbPreviewTable } from '@/components/platform/vnext/HandlarborsenScbPreviewTable'
import { knownContactSummary, parseKnownContacts } from '@/lib/handlarborsen/lead-finder/known-contacts'
import { parseSavedCandidates } from '@/lib/handlarborsen/lead-finder/saved-candidates'

type Col = (typeof STATUS_AUDIT_EXPORT_COLUMNS)[number]
type Rec = Record<Col, string>

/** 89 synthetic rows: 83 active + 6 inactive, one restricted, one prior contact. */
function synthetic(mutate?: (rows: Rec[]) => void): Rec[] {
  const rows: Rec[] = []
  for (let i = 0; i < 89; i++) {
    const inactive = i >= 83
    const grouped = i < 2 ? 'Hedbergs' : i < 4 ? 'Bilia' : 'Firma' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26))
    const restricted = i === 10
    rows.push({
      legalCompanyName: `${grouped} Test ${i} AB`, orgnr: withCheckDigit('55600' + String(1000 + i).padStart(4, '0')),
      city: 'Teststad', sni: '45.111', scbStatusCode: inactive ? '9' : '1',
      scbStatusClass: inactive ? 'NOT_ACTIVE_PER_SCB' : 'ACTIVE_PER_SCB_NOT_MARKETING_APPROVAL',
      legalFormCode: i === 5 ? '51' : '49', legalFormLabel: i === 5 ? 'Ekonomiska foreningar' : 'Aktiebolag',
      reklamCode: restricted ? '2' : '1', epostCode: restricted ? '2' : '1', telefonCode: restricted ? '2' : '1',
      marketingReview: restricted ? 'RESTRICTION_MANUAL_REVIEW' : 'NO_SCB_RESTRICTION_SIGNAL_NOT_PERMISSION',
      priorContactReview: i === 20 ? 'KNOWN_PRIOR_CONTACT' : 'NO_MATCH_IN_PARTIAL_HISTORY',
      legalIdentityReview: 'JE_IDENTITY_CONFIRMED', manual_review_only: 'true', NOT_CONTACTABLE: 'true', historyCoverage: 'PARTIAL',
    })
  }
  mutate?.(rows)
  return rows
}
const toCsv = (rows: Rec[], header: readonly string[] = STATUS_AUDIT_EXPORT_COLUMNS) =>
  [header.join(','), ...rows.map(r => STATUS_AUDIT_EXPORT_COLUMNS.map(c => csvField(r[c])).join(','))].join('\r\n') + '\r\n'
const SUMMARY = {
  sourceRows: 90, reviewedLegalEntities: 89, excludedPhysicalPersons: 1, activePerScb: 83, notActivePerScb: 6,
  scbRestrictionRows: 1, emailRestricted: 1, reklamRestricted: 1, phoneRestricted: 1, knownPriorContacts: 1, unknownPriorContacts: 88,
  outreachReady: 0, contactability: 'BLOCKED_PENDING_VERIFICATION', sourceCoverage: 'PARTIAL', sourceStatus: 'OFFLINE_CORRECTED_FROM_SCB_CODEBOOKS',
}
const reasonOf = (csv: string, summary: unknown = SUMMARY): string => {
  try { parseLocalReview(csv, summary) } catch (e) { return e instanceof LocalReviewError ? e.code : 'other' }
  return 'accepted'
}
const good = () => toCsv(synthetic())

describe('local review parser', () => {
  it('accepts the 89-row snapshot and recomputes counts', () => {
    const r = parseLocalReview(good(), SUMMARY)
    expect(r.counts).toMatchObject({ total: 89, active: 83, inactive: 6, restricted: 1, priorContact: 1, otherLegalForm: 1 })
    expect(r.outreachReady).toBe(0)
    expect(r.historyCoverage).toBe('PARTIAL')
    expect(r.rows.every(x => x.reviewState === 'awaiting_human_review' && x.contactability === 'BLOCKED_PENDING_VERIFICATION')).toBe(true)
    expect(Object.keys(r.rows[0]).join()).not.toMatch(/mail|phone|telefon|url/i)
  })
  it('also accepts a summary nested under "summary"', () => {
    expect(reasonOf(good(), { kind: 'x', summary: SUMMARY })).toBe('accepted')
  })
  it('rejects invalid header, extra columns and unknown columns', () => {
    expect(reasonOf(toCsv(synthetic(), [...STATUS_AUDIT_EXPORT_COLUMNS].reverse()))).toBe('header_mismatch')
    expect(reasonOf(good().replace('historyCoverage', 'historyCoverage,email'))).toBe('header_mismatch')
  })
  it('rejects jurform 10 and person-shaped identifiers', () => {
    expect(reasonOf(toCsv(synthetic(r => { r[3].legalFormCode = '10'; r[3].legalFormLabel = 'Fysiska personer' })))).toBe('row_invalid')
    expect(reasonOf(toCsv(synthetic(r => { r[3].orgnr = '8112289874' })))).toBe('row_invalid')
    // Valid Luhn is not enough: a physical-person-shaped number must be rejected.
    expect(reasonOf(toCsv(synthetic(r => { r[3].orgnr = withCheckDigit('810101123') })))).toBe('row_invalid')
    expect(reasonOf(toCsv(synthetic(r => { r[3].orgnr = r[3].orgnr.slice(0, 9) + ((Number(r[3].orgnr[9]) + 1) % 10) })))).toBe('row_invalid') // bad checksum
    expect(reasonOf(toCsv(synthetic(r => { r[3].orgnr = '16' + r[3].orgnr })))).toBe('row_invalid') // only the 10-digit form is stored
  })
  it('rejects duplicates, >100 rows, unknown status and marketing codes', () => {
    expect(reasonOf(toCsv(synthetic(r => { r[1].orgnr = r[0].orgnr })))).toBe('duplicate_orgnr')
    expect(reasonOf(toCsv([...synthetic(), ...synthetic(), ...synthetic()].slice(0, 101)))).toBe('too_many_rows')
    expect(reasonOf(toCsv(synthetic(r => { r[3].scbStatusCode = '5' })))).toBe('row_invalid')
    expect(reasonOf(toCsv(synthetic(r => { r[3].epostCode = '7' })))).toBe('row_invalid')
    expect(reasonOf(toCsv(synthetic(r => { r[3].telefonCode = '4' })))).toBe('row_invalid')
    expect(reasonOf(toCsv(synthetic(r => { r[3].scbStatusClass = 'NOT_ACTIVE_PER_SCB' })))).toBe('row_invalid')
    expect(reasonOf(toCsv(synthetic(r => { r[10].marketingReview = 'NO_SCB_RESTRICTION_SIGNAL_NOT_PERMISSION' })))).toBe('row_invalid')
  })
  it('rejects contact-like content and unsafe contactability claims', () => {
    expect(reasonOf(toCsv(synthetic(r => { r[3].legalCompanyName = 'Info info@example.se' })))).toBe('row_invalid')
    expect(reasonOf(toCsv(synthetic(r => { r[3].legalCompanyName = 'Ring 040 123 456 78' })))).toBe('row_invalid')
    expect(reasonOf(toCsv(synthetic(r => { r[3].city = 'https://example.se' })))).toBe('row_invalid')
    expect(reasonOf(toCsv(synthetic(r => { r[3].NOT_CONTACTABLE = 'false' })))).toBe('row_invalid')
    expect(reasonOf(toCsv(synthetic(r => { r[3].manual_review_only = 'false' })))).toBe('row_invalid')
    expect(reasonOf(toCsv(synthetic(r => { r[3].historyCoverage = 'FULL' })))).toBe('row_invalid')
  })
  it('requires an exact summary and recomputed counters', () => {
    expect(reasonOf(good(), { ...SUMMARY, activePerScb: 84 })).toBe('summary_mismatch')
    expect(reasonOf(good(), { ...SUMMARY, outreachReady: 1 })).toBe('summary_invalid')
    expect(reasonOf(good(), { ...SUMMARY, contactability: 'READY' })).toBe('summary_invalid')
    expect(reasonOf(good(), { ...SUMMARY, sourceCoverage: 'FULL' })).toBe('summary_invalid')
    expect(reasonOf(good(), { ...SUMMARY, sourceStatus: 'LIVE' })).toBe('summary_invalid')
    expect(reasonOf(good(), { ...SUMMARY, phoneRestricted: 0 })).toBe('summary_mismatch')
    expect(reasonOf(good(), null)).toBe('summary_invalid')
    // Row set that differs from the pinned snapshot (88 rows) is unavailable, never "0".
    expect(reasonOf(toCsv(synthetic().slice(0, 88)))).toBe('summary_mismatch')
    expect(reasonOf(toCsv(synthetic(r => { r[20].priorContactReview = 'NO_MATCH_IN_PARTIAL_HISTORY' })))).toBe('summary_mismatch')
  })
  it('buildLocalReview never throws and reports only safe codes', () => {
    const bad = buildLocalReview('garbage', JSON.stringify(SUMMARY))
    expect(bad).toEqual({ status: 'unavailable', reason: 'header_mismatch' })
    expect(buildLocalReview(good(), '{not json')).toEqual({ status: 'unavailable', reason: 'summary_invalid' })
    expect(buildLocalReview(good(), JSON.stringify(SUMMARY)).status).toBe('ready')
  })
})

describe('group hypotheses, search and filters', () => {
  const rows = parseLocalReview(good(), SUMMARY).rows
  it('only flags shared, non-generic first name tokens as hypotheses', () => {
    const hinted = rows.filter(r => r.groupHypothesis)
    expect(hinted.map(r => r.groupHypothesis).sort()).toEqual(['Bilia', 'Bilia', 'Hedbergs', 'Hedbergs'])
    expect(rows.find(r => r.name.startsWith('Firma') && r.groupHypothesis)).toBeUndefined()
  })
  it('ignores generic words such as Bil, Aktiebolaget and place names', () => {
    const csv = toCsv(synthetic(r => {
      r[30].legalCompanyName = 'Bil Alfa AB'
      r[31].legalCompanyName = 'Bil Beta AB'
      r[32].legalCompanyName = 'Malmö Alfa AB'
      r[33].legalCompanyName = 'Malmo Beta AB'
      r[34].legalCompanyName = 'AKTIEBOLAGET INKASSO'
      r[35].legalCompanyName = 'AKTIEBOLAGET AUTO-ÄLGEN'
    }))
    const parsed = parseLocalReview(csv, SUMMARY).rows
    expect(parsed.slice(30, 36).every(r => r.groupHypothesis === null)).toBe(true)
    // Real distinct names such as Bilia or Hedbergs still produce tentative hints.
    expect(parsed.filter(r => r.groupHypothesis === 'Bilia')).toHaveLength(2)
    expect(parsed.filter(r => r.groupHypothesis === 'Hedbergs')).toHaveLength(2)
  })
  it('filters', () => {
    expect(filterLocalReview(rows, '', 'all')).toHaveLength(89)
    expect(filterLocalReview(rows, '', 'active')).toHaveLength(83)
    expect(filterLocalReview(rows, '', 'inactive')).toHaveLength(6)
    expect(filterLocalReview(rows, '', 'restricted')).toHaveLength(1)
    expect(filterLocalReview(rows, '', 'prior')).toHaveLength(1)
    expect(filterLocalReview(rows, '', 'possible_group')).toHaveLength(4)
    expect(filterLocalReview(rows, '', 'other_legal_form')).toHaveLength(1)
    expect(filterLocalReview(rows, '', 'bogus')).toHaveLength(89)
  })
  it('paginates the same 89 companies into 15-row pages without dropping anyone', () => {
    const sorted = filterLocalReview(rows, '', 'all')
      .sort((a, b) => a.name.localeCompare(b.name, 'sv', { sensitivity: 'base' }) || a.orgnr.localeCompare(b.orgnr))
    const first = paginateLocalReview(sorted, 1)
    const second = paginateLocalReview(sorted, 2)
    const last = paginateLocalReview(sorted, 6)
    expect(first).toMatchObject({ from: 1, to: 15, total: 89, page: 1, pages: 6 })
    expect(second).toMatchObject({ from: 16, to: 30, page: 2 })
    expect(last).toMatchObject({ from: 76, to: 89, page: 6 })
    expect([...Array.from({ length: 6 }, (_, i) => paginateLocalReview(sorted, i + 1).items)]
      .flat().map(r => r.orgnr)).toEqual(sorted.map(r => r.orgnr))
    expect(paginateLocalReview(sorted, 999).page).toBe(6)
    expect(paginateLocalReview(sorted, -2).page).toBe(1)
    expect(paginateLocalReview([], 2)).toMatchObject({ from: 0, to: 0, total: 0, page: 1, pages: 1 })
    expect(paginateLocalReview(filterLocalReview(rows, '', 'restricted'), 6))
      .toMatchObject({ from: 1, to: 1, page: 1, pages: 1 })
  })
  it('searches name (accent/case-insensitive), orgnr and city', () => {
    expect(filterLocalReview(rows, 'HEDBERGS', 'all')).toHaveLength(2)
    expect(filterLocalReview(rows, rows[7].orgnr, 'all')).toHaveLength(1)
    expect(filterLocalReview(rows, 'teststad', 'all')).toHaveLength(89)
    expect(filterLocalReview(rows, 'hedbergs', 'restricted')).toHaveLength(0)
    expect(filterLocalReview(rows, 'x'.repeat(500), 'all')).toHaveLength(0)
  })
})

describe('preview-only company table after verified owner upload', () => {
  const review = parseLocalReview(good(), SUMMARY)
  const html = renderToStaticMarkup(React.createElement(HandlarborsenScbPreviewTable, { review }))

  it('shows 15 of 89 safely, with pagination but without import or contact actions', () => {
    expect(html).toContain('Företagen i den verifierade rapporten')
    expect(html).toContain('Visar 1–15 av 89 matchande företag (totalt 89)')
    expect(html).toContain('Sida 1 av 6')
    expect(html).toContain('Sök på företag, organisationsnummer eller ort')
    expect(html).toContain('Kontaktspärr')
    expect((html.match(/<tr\b/g) ?? []).length).toBe(16) // header + 15 of 89 validated legal rows
    expect(html).not.toMatch(/mailto:|tel:|<a\b/)
    expect(html).toContain('Föregående sida')
    expect(html).toContain('Nästa sida')
    expect(html).not.toMatch(/Importera endast som|Godkänn för kontakt|Skicka mejl/)
    expect(html).not.toContain('SYNTHETIC PERSON')
    expect(html).toContain('Ingen utskicksbehörighet')
  })
  it('keeps blocked, inactive, prior contact and group hints in the full filtered dataset', () => {
    expect(filterLocalReview(review.rows, '', 'restricted')).toMatchObject([
      { restricted: true, restrictedChannels: ['reklam', 'epost', 'telefon'] },
    ])
    expect(filterLocalReview(review.rows, '', 'prior')).toMatchObject([{ priorContact: true }])
    expect(filterLocalReview(review.rows, '', 'inactive')).toHaveLength(6)
    expect(filterLocalReview(review.rows, '', 'possible_group')).toHaveLength(4)
    expect(html).toContain('Möjlig namnkoppling:')
    expect(html).toContain('Verksam enligt SCB')
    expect(html).toContain('Kräver manuell granskning')
    expect(html).not.toContain('Godkänn för utskick')
  })
})

describe('local review server gates', () => {
  const dir = 'C:\\Users\\Tester\\Projects\\Omnira\\Temp\\hb-scb-status-audited-20261028-061729'
  const files: Record<string, string> = {
    [dir + '\\review-legal-entities-only.csv']: good(),
    [dir + '\\summary.json']: JSON.stringify(SUMMARY),
  }
  function deps(over: Partial<LocalReviewDeps> & { env?: Record<string, string | undefined> } = {}) {
    const calls = { realpath: vi.fn(), stat: vi.fn(), readFile: vi.fn() }
    const d: LocalReviewDeps = {
      env: { NODE_ENV: 'development', USERPROFILE: 'C:\\Users\\Tester', HB_LEADFINDER_LOCAL_REVIEW_ENABLED: 'true', ...over.env },
      platform: over.platform ?? 'win32',
      realpath: over.realpath ?? (async p => { calls.realpath(p); return p }),
      stat: over.stat ?? (async p => { calls.stat(p); return { size: files[p]?.length ?? 0, isFile: () => true } }),
      readFile: over.readFile ?? (async p => { calls.readFile(p); if (!(p in files)) throw new Error('nope'); return files[p] }),
    }
    return { d, calls }
  }
  const untouched = (c: ReturnType<typeof deps>['calls']) =>
    expect([c.realpath, c.stat, c.readFile].every(f => f.mock.calls.length === 0)).toBe(true)

  it('reads the two pinned files when every gate passes', async () => {
    const { d, calls } = deps()
    const s = await loadLocalReviewForOwner(HANDLARBORSEN_PROJECT_ID, d)
    expect(s.status).toBe('ready')
    expect(calls.readFile.mock.calls.map(c => c[0]).sort()).toEqual(Object.keys(files).sort())
  })
  it.each([
    ['wrong project', '00000000-0000-0000-0000-000000000000', {}],
    ['production', HANDLARBORSEN_PROJECT_ID, { env: { NODE_ENV: 'production' } }],
    ['test env', HANDLARBORSEN_PROJECT_ID, { env: { NODE_ENV: 'test' } }],
    ['flag unset', HANDLARBORSEN_PROJECT_ID, { env: { HB_LEADFINDER_LOCAL_REVIEW_ENABLED: undefined } }],
    ['flag not "true"', HANDLARBORSEN_PROJECT_ID, { env: { HB_LEADFINDER_LOCAL_REVIEW_ENABLED: '1' } }],
    ['non-windows', HANDLARBORSEN_PROJECT_ID, { platform: 'linux' }],
  ])('is disabled before any fs access: %s', async (_n, project, over) => {
    const { d, calls } = deps(over as Partial<LocalReviewDeps>)
    expect(await loadLocalReviewForOwner(project, d)).toEqual({ status: 'disabled' })
    untouched(calls)
  })
  it('fails closed on missing profile, symlink escape, oversize and read errors without leaking detail', async () => {
    expect((await loadLocalReviewForOwner(HANDLARBORSEN_PROJECT_ID, deps({ env: { USERPROFILE: undefined } }).d)).status).toBe('unavailable')
    const escape = await loadLocalReviewForOwner(HANDLARBORSEN_PROJECT_ID, deps({ realpath: async p => p.replace('Temp', 'Elsewhere') }).d)
    expect(escape).toEqual({ status: 'unavailable', reason: 'path_rejected' })
    const fileEscape = await loadLocalReviewForOwner(HANDLARBORSEN_PROJECT_ID, deps({ realpath: async p => (p.endsWith('.csv') ? 'C:\\other\\review-legal-entities-only.csv' : p) }).d)
    expect(fileEscape).toEqual({ status: 'unavailable', reason: 'read_failed' })
    const big = await loadLocalReviewForOwner(HANDLARBORSEN_PROJECT_ID, deps({ stat: async () => ({ size: 350_001, isFile: () => true }) }).d)
    expect(big).toEqual({ status: 'unavailable', reason: 'read_failed' })
    const boom = await loadLocalReviewForOwner(HANDLARBORSEN_PROJECT_ID, deps({ readFile: async () => { throw new Error('C:\\secret\\path content') } }).d)
    expect(JSON.stringify(boom)).not.toMatch(/secret|Tester/)
  })
  it('a corrupted report is unavailable, never zero', async () => {
    const d = deps({ readFile: async p => (p.endsWith('.csv') ? good().replace('JE_IDENTITY_CONFIRMED', 'X') : JSON.stringify(SUMMARY)) }).d
    expect(await loadLocalReviewForOwner(HANDLARBORSEN_PROJECT_ID, d)).toEqual({ status: 'unavailable', reason: 'row_invalid' })
  })
})

describe('local review UI', () => {
  const readiness = { scbKeyConfigured: false, scbContractVerified: true, liveSearchAvailable: false } as never
  const render = (localReview?: LocalReviewState, extra: Record<string, string | boolean> = {}) => renderToStaticMarkup(React.createElement(HandlarborsenLeadFinder, {
    slug: 'handlarborsen', readiness,
    known: knownContactSummary(parseKnownContacts(null, HANDLARBORSEN_PROJECT_ID)),
    saved: parseSavedCandidates([], HANDLARBORSEN_PROJECT_ID), search: '', filter: 'all', localReview, ...extra,
  }))
  const ready = buildLocalReview(good(), JSON.stringify(SUMMARY))

  it('renders nothing for disabled/omitted state', () => {
    expect(render()).not.toContain('Lokal SCB-granskning')
    expect(render({ status: 'disabled' })).not.toContain('Lokal SCB-granskning')
    expect(render()).not.toContain('Importförhandsgranskning')
  })
  it('gates the import upload form behind a separate owner-only server flag', () => {
    const html = render(ready, { importPreviewEnabled: true, importWriteEnabled: false })
    expect(html).toContain('Importförhandsgranskning')
    expect(html).toContain('Förhandsgranska utan import')
    expect(html).toContain('Databasskrivning är avstängd')
    expect(html).not.toContain('Importera endast som ej kontaktbara')
    expect(html).not.toContain('Skicka mejl')
    expect(html).not.toContain('Tavily – manuell webbresearch')
    const researchPreview = render(ready, { importPreviewEnabled: true, researchEnabled: true })
    expect(researchPreview).toContain('Tavily – manuell webbresearch')
    expect(researchPreview).toContain('Den extra webbsidgranskningen är avstängd.')
    expect(researchPreview).not.toContain('Skicka mejl')
  })
  it('renders the audited review with warnings, provenance and no approval/outreach actions', () => {
    const html = render(ready)
    expect(html).toContain('Lokal SCB-granskning')
    expect(html).toContain('SCB 2026-10-27')
    expect(html).toContain('89 juridiska enheter')
    expect(html).toContain('name="local_q"')
    expect(html).toContain('name="local_filter"')
    expect(html).toContain('SCB-spärr')
    expect(html).toContain('Tidigare kontaktad')
    expect(html).toContain('Ej verksam per SCB')
    expect(html).toContain('hypotes')
    expect(html).toContain('BLOCKED_PENDING_VERIFICATION')
    expect(html).toContain('SCB:s live-API-nyckel saknas')
    expect(html).toContain('kan fortfarande granskas utan liveanrop')
    expect(html).not.toMatch(/Godkänn|Skicka mejl|Kontakta nu|>Ny<|nytt företag/)
    expect(html).not.toMatch(/mailto:|tel:|@/)
    expect((html.match(/<button/g) ?? []).length).toBe(1) // only the local GET filter submit; legacy form has no candidates
  })
  it('applies local search/filter and escapes names', () => {
    const html = render(ready, { localSearch: 'hedbergs', localFilter: 'all' })
    expect(html).toContain('Visar 2 av 89')
    expect(html).not.toContain('Visar 89')
    expect(render(ready, { localFilter: 'restricted' })).toContain('Visar 1 av 89')
    expect(render(ready, { localFilter: 'nonsense' })).toContain('Visar 89 av 89')
    // Markup-like names are rejected by the parser, so they can never reach the DOM.
    expect(reasonOf(toCsv(synthetic(r => { r[3].legalCompanyName = '<script>x</script> AB' })))).toBe('row_invalid')
  })
  it('shows an unavailable notice without numbers', () => {
    const html = render({ status: 'unavailable', reason: 'summary_mismatch' })
    expect(html).toContain('kan inte verifieras')
    expect(html).not.toContain('Visar')
  })
})
