import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { ORG } from '@/lib/handlarborsen/lead-finder/fixtures'
import {
  eligibleExclusions, knownContactSummary, loadKnownContacts, reconcileSavedCandidates,
  MAX_KNOWN_CONTACTS, parseKnownContacts,
} from '@/lib/handlarborsen/lead-finder/known-contacts'
import {
  filterCandidateViews, loadSavedCandidates, MAX_SAVED_CANDIDATES, parseSavedCandidates,
} from '@/lib/handlarborsen/lead-finder/saved-candidates'
import { HandlarborsenLeadFinder } from '@/components/platform/vnext/HandlarborsenLeadFinder'
import type { LeadFinderReadiness } from '@/lib/handlarborsen/lead-finder/readiness'

const pid = HANDLARBORSEN_PROJECT_ID
const foreign = '11111111-1111-4111-8111-111111111111'
const saved = (overrides: Record<string, unknown> = {}) => ({
  id: 'dddddddd-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  project_id: pid,
  name: 'Syntetisk Testbil AB',
  orgnr: ORG.alpha,
  county_code: '12',
  score: null,
  city: 'Malmö',
  scb_status_code: '1',
  legal_form_code: '49',
  reklam_code: '1',
  epost_code: '1',
  telefon_code: '1',
  prior_contact: false,
  history_coverage: 'PARTIAL',
  contactability: 'BLOCKED_PENDING_VERIFICATION',
  outreach_ready: false,
  status: 'needs_review',
  exclusions: ['historical_register_incomplete'],
  sni_codes: ['47.811'],
  provenance: {
    source: 'scb_foretagsregistret',
    retrievedAt: '2026-10-27',
    audit: 'hb-scb-status-audited-20261028-061729',
    review: 'awaiting_human_review',
  },
  ...overrides,
})
const readiness: LeadFinderReadiness = {
  scbKeyConfigured: false, scbContractVerified: true,
  scbLiveSearchApproved: false, liveSearchAvailable: false,
  googlePlaces: 'disabled', persistence: 'not_applied', outreach: 'never_triggered_by_import',
}

describe('Handlarbörsen lead finder: Omnira contact baseline', () => {
  it('never queries the wrong project or a disabled source', async () => {
    const fetch = vi.fn(async () => ({ data: [], error: null }))
    expect((await loadKnownContacts(foreign, true, fetch)).status).toBe('forbidden')
    expect((await loadKnownContacts(pid, false, fetch)).status).toBe('disabled')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('maps a real-shaped sales_contacts record to suppression without leaking email', () => {
    const rows = [{ project_id: pid, data: {
      companyName: 'Exempel Bil AB', email: 'kontakt@exempel.se',
      history: 'contacted', suppressed: true, excluded: false, orgnr: ORG.alpha,
    } }]
    const result = parseKnownContacts(rows, pid)
    expect(result.status).toBe('ready')
    expect(result.count).toBe(1)
    expect(result.entries.some(entry => entry.kind === 'suppressed' && entry.orgnr === ORG.alpha)).toBe(true)
    expect(JSON.stringify(result)).not.toContain('kontakt@')
    expect(JSON.stringify(knownContactSummary(result))).not.toContain('exempel.se')
    expect(eligibleExclusions(result)).toBeNull() // external pilot contacts unverified
  })
  it('fails closed for incomplete or foreign rows; never treats unavailable as zero contacts', () => {
    expect(parseKnownContacts([{ project_id: foreign, data: { companyName: 'X AB' } }], pid).status).toBe('unavailable')
    expect(parseKnownContacts([{ project_id: pid, data: { history: 'contacted' } }], pid).status).toBe('incomplete')
    expect(parseKnownContacts(Array(MAX_KNOWN_CONTACTS + 1).fill({ project_id: pid, data: { companyName: 'X AB' } }), pid).status).toBe('incomplete')
    expect(parseKnownContacts(null, pid).count).toBeNull()
    expect(parseKnownContacts([{ project_id: pid, data: { companyName: 'Enskild firma', orgnr: ORG.sole } }], pid).status).toBe('incomplete')
  })
  it('returns unavailable if the session RLS read fails', async () => {
    const result = await loadKnownContacts(pid, true, async (_project, limit) => {
      expect(limit).toBe(MAX_KNOWN_CONTACTS + 1)
      return { data: null, error: 'read_failed' }
    })
    expect(result.status).toBe('unavailable')
    expect(result.entries).toEqual([])
  })
})

describe('Handlarbörsen lead finder: stored SCB candidates', () => {
  it('hard-denies disabled/wrong-project reads before touching a data source', async () => {
    const fetch = vi.fn(async () => ({ data: [], error: null }))
    expect((await loadSavedCandidates(foreign, true, fetch)).status).toBe('forbidden')
    expect((await loadSavedCandidates(pid, false, fetch)).status).toBe('disabled')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('displays only valid legal entities from SCB, bounded to 50', () => {
    const v = parseSavedCandidates([saved()], pid)
    expect(v.status).toBe('ready')
    expect(v.outreachReady).toBe(false)
    expect(v.candidates).toHaveLength(1)
    expect(v.candidates[0].score).toBeNull() // never invent business-fit points
    expect(v.candidates[0].restricted).toBe(false)
    expect(filterCandidateViews(v.candidates, 'testbil', 'needs_review')).toHaveLength(1)
    expect(filterCandidateViews(v.candidates, 'saknas', 'all')).toHaveLength(0)
    expect(parseSavedCandidates(Array(MAX_SAVED_CANDIDATES + 1).fill(saved()), pid).status).toBe('incomplete')
  })
  it('rejects invalid, cross-project, non-SCB and pseudonymous/person-linked candidate rows', () => {
    expect(parseSavedCandidates([saved({ project_id: foreign })], pid).status).toBe('unavailable')
    expect(parseSavedCandidates([saved({ provenance: { source: 'fixture', retrievedAt: '2026-10-27T09:00:00Z' } })], pid).status).toBe('unavailable')
    expect(parseSavedCandidates([saved({ orgnr: null, name: 'Maskerad person' })], pid).status).toBe('unavailable')
    expect(parseSavedCandidates([saved({ orgnr: ORG.sole })], pid).status).toBe('unavailable')
    expect(parseSavedCandidates([saved({ name: '<script>alert(1)</script>' })], pid).status).toBe('ready') // React escapes display
    expect(parseSavedCandidates([saved({ id: 'bad' })], pid).status).toBe('unavailable')
  })
  it('rejects cloud rows without verified SCB identity, legal form and review-only gates', () => {
    const rejects = [
      { legal_form_code: '10' },
      { legal_form_code: undefined },
      { contactability: 'READY' },
      { outreach_ready: true },
      { history_coverage: 'FULL' },
      { prior_contact: true, status: 'needs_review' },
      { scb_status_code: '9', status: 'needs_review' },
      { epost_code: '2', status: 'needs_review' },
      { reklam_code: '2', status: 'needs_review' },
      { telefon_code: '3', status: 'needs_review' },
      { status: 'approved_for_outreach_review' },
      { score: -1 },
      { score: 101 },
      { provenance: { source: 'scb_foretagsregistret', retrievedAt: '2026-10-27', audit: 'other', review: 'awaiting_human_review' } },
    ]
    for (const change of rejects) {
      expect(parseSavedCandidates([saved(change)], pid).status).toBe('unavailable')
    }
    const blocked = parseSavedCandidates([saved({ epost_code: '2', status: 'suppressed' })], pid)
    expect(blocked.status).toBe('ready')
    expect(blocked.candidates[0].restricted).toBe(true)
    expect(blocked.outreachReady).toBe(false)
  })
  it('marks saved candidates with existing suppressions without leaking contact data', () => {
    const baseline = parseKnownContacts([{ project_id: pid, data: {
      companyName: 'Syntetisk Testbil AB', email: 'private@exempel.se',
      history: 'contacted', suppressed: true, excluded: false, orgnr: ORG.alpha,
    } }], pid)
    const result = reconcileSavedCandidates(parseSavedCandidates([saved()], pid), baseline)
    expect(result.candidates[0].status).toBe('suppressed')
    expect(result.candidates[0].reasons).toContain('already_contacted')
    expect(result.candidates[0].reasons).toContain('suppressed')
    expect(result.outreachReady).toBe(false)
    expect(JSON.stringify(result)).not.toContain('private@')
    expect(reconcileSavedCandidates(parseSavedCandidates([saved()], pid), parseKnownContacts(null, pid)).candidates[0].status).toBe('needs_review')
  })
  it('fails closed when migration not available', async () => {
    const result = await loadSavedCandidates(pid, true, async () => ({ data: null, error: { message: 'missing table' } }))
    expect(result.status).toBe('unavailable')
    expect(result.candidates).toEqual([])
  })
})

describe('Handlarbörsen Lead Finder UI', () => {
  it('clearly signals missing key and no real leads, without exposing source records', () => {
    const known = knownContactSummary(parseKnownContacts(null, pid))
    const savedCandidates = parseSavedCandidates([], pid)
    const html = renderToStaticMarkup(React.createElement(HandlarborsenLeadFinder, {
      slug: 'handlarborsen', readiness, known, saved: savedCandidates, search: '', filter: 'all',
    }))
    expect(html).toContain('Lead Finder')
    expect(html).toContain('SCB:s live-API-nyckel saknas')
    expect(html).toContain('Inga riktiga leads')
    expect(html).toContain('Utskick')
    expect(html).not.toContain('kontakt@')
    expect(html).toContain('/projects/handlarborsen/competitors')
  })
  it('never renders raw HTML inside a saved company name', () => {
    const html = renderToStaticMarkup(React.createElement(HandlarborsenLeadFinder, {
      slug: 'handlarborsen',
      readiness,
      known: knownContactSummary(parseKnownContacts([], pid)),
      saved: parseSavedCandidates([saved({ name: '<script>alert(1)</script>' })], pid),
      search: '', filter: 'all',
    }))
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('Filtrera')
  })
})
