import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { withCheckDigit } from '@/lib/handlarborsen/lead-finder/fixtures'
import { BLOCKED, makeCandidateImportManifest, ImportManifestError } from '@/lib/handlarborsen/lead-finder/import-manifest'
import type { LocalReview, LocalReviewRow } from '@/lib/handlarborsen/lead-finder/local-review'
import { parseSavedCandidates, MAX_SAVED_CANDIDATES } from '@/lib/handlarborsen/lead-finder/saved-candidates'

const company = (index:number):LocalReviewRow => {
  const inactive=index>=83, restricted=index===8, prior=index===20
  return {
    name:'Syntetisk Bilhandlare '+index+' AB',
    orgnr:withCheckDigit('556700'+String(index).padStart(3,'0')),
    city:'Malmö',sni:index===40?'46.711':'47.811',
    scbActive:!inactive,legalFormCode:index===12?'31':'49',
    legalFormLabel:index===12?'Handelsbolag, kommanditbolag':'Övriga aktiebolag',
    otherLegalForm:index===12,restricted,
    restrictedChannels:restricted?['reklam','epost','telefon']:[],
    priorContact:prior,groupHypothesis:index===2||index===3?'Syntetisk':null,
    reviewState:'awaiting_human_review',contactability:BLOCKED,
  }
}
const fixture = ():LocalReview => ({
  rows:Array.from({length:89},(_,i)=>company(i)),
  counts:{total:89,active:83,inactive:6,restricted:1,priorContact:1,otherLegalForm:1,possibleGroup:2},
  excludedPhysicalPersons:1,sourceRows:90,
  provenance:'SCB 2026-10-27',historyCoverage:'PARTIAL',outreachReady:0,
})
const generate = (review:LocalReview=fixture(),pid:string=HANDLARBORSEN_PROJECT_ID) =>
  makeCandidateImportManifest(review,pid)

describe('review-only Handlarbörsen private import plan',()=>{
  it('prepares 89 legally formed companies with no automatic approval',()=>{
    const m=generate()
    expect(m).toMatchObject({
      kind:'handlarborsen_scb_import_manifest_dry_run',
      status:'PREVIEW_ONLY_NOT_IMPORTED',count:89,
      sourceRows:90,sourcePhysicalPersonsExcluded:1,
      historyCoverage:'PARTIAL',contactability:BLOCKED,outreachReady:0,
      stats:{needsReview:81,excluded:7,suppressed:1,inactive:6,marketingRestricted:1,priorContact:1},
    })
    expect(m.records).toHaveLength(89)
    expect(new Set(m.records.map(x=>x.orgnr)).size).toBe(89)
    expect(m.records.every(x=>
      x.score===null && x.outreach_ready===false &&
      x.contactability===BLOCKED && x.history_coverage==='PARTIAL' &&
      x.provenance.review==='awaiting_human_review')).toBe(true)
    expect(JSON.stringify(m)).not.toMatch(/"email"|"phone"|"tel"|"toEmail"|"recipient"/)
    expect(m.records.every(x=>x.legal_form_code!=='10')).toBe(true)
  })
  it('enforces conservative exclusion and suppression precedence',()=>{
    const m=generate()
    const byOrg=(i:number)=>m.records.find(x=>x.orgnr===company(i).orgnr)!
    expect(byOrg(8)).toMatchObject({
      status:'suppressed',reklam_code:'2',epost_code:'2',telefon_code:'2',
      exclusions:expect.arrayContaining(['historical_register_incomplete','scb_marketing_restriction']),
    })
    expect(byOrg(20)).toMatchObject({
      status:'excluded',prior_contact:true,
      exclusions:expect.arrayContaining(['previous_contact_partial_history']),
    })
    expect(byOrg(83)).toMatchObject({
      status:'excluded',scb_status_code:'9',exclusions:expect.arrayContaining(['scb_inactive']),
    })
    expect(byOrg(2).exclusions).toContain('possible_name_group_overlap')
    expect(byOrg(12).exclusions).toContain('legal_form_requires_review')
    expect(byOrg(0)).toMatchObject({
      status:'needs_review',score:null,prior_contact:false,
      exclusions:['historical_register_incomplete'],
    })
  })
  it('does not let a wrong project create a manifest',()=>{
    expect(()=>generate(fixture(),'00000000-0000-0000-0000-000000000000')).toThrow(ImportManifestError)
  })
  it('rejects person-like data even if TypeScript is bypassed',()=>{
    const r=fixture();r.rows[4].legalFormCode='10'
    expect(()=>generate(r)).toThrow(ImportManifestError)
    const r2=fixture();r2.rows[4].name='Call +46 701234567'
    expect(()=>generate(r2)).toThrow(ImportManifestError)
    const r3=fixture();r3.rows[4].orgnr=withCheckDigit('850101123')
    expect(()=>generate(r3)).toThrow(ImportManifestError)
  })
  it('rejects unknown histories, fake approvals, duplicates and broken counters',()=>{
    const r=fixture();r.outreachReady=1 as never
    expect(()=>generate(r)).toThrow(ImportManifestError)
    const r2=fixture();r2.historyCoverage='FULL' as never
    expect(()=>generate(r2)).toThrow(ImportManifestError)
    const r3=fixture();r3.rows[1].orgnr=r3.rows[0].orgnr
    expect(()=>generate(r3)).toThrow(ImportManifestError)
    const r4=fixture();r4.counts.active=84
    expect(()=>generate(r4)).toThrow(ImportManifestError)
    const r5=fixture();r5.rows.pop()
    expect(()=>generate(r5)).toThrow(ImportManifestError)
  })
  it('manifest rows remain valid in the proposed cloud read boundary without a fabricated score',()=>{
    const m=generate()
    const row=m.records.find(x=>x.status==='needs_review')!
    const data={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',...row}
    const saved=parseSavedCandidates([data],HANDLARBORSEN_PROJECT_ID)
    expect(saved.status).toBe('ready')
    expect(saved.candidates[0].score).toBeNull()
    expect(saved.candidates[0].status).toBe('needs_review')
    expect(saved.outreachReady).toBe(false)
    expect(MAX_SAVED_CANDIDATES).toBeGreaterThanOrEqual(89)
  })
  it('SQL draft contains owner RLS, excludes physical persons and forbids approval/writes',()=>{
    const sql=readFileSync(fileURLToPath(new URL('../../../../docs/handlarborsen-lead-finder-migration-proposal.sql',import.meta.url)),'utf8')
    expect(sql).toContain('HISTORICAL DESIGN PROPOSAL')
    const migration = readFileSync(fileURLToPath(
      new URL('../../supabase/migrations/20261028072659_handlarborsen_scb_review_only_candidates.sql',import.meta.url)
    ),'utf8')
    expect(migration).toContain('create table public.hb_lead_candidates')
    expect(migration).toContain('create policy hb_lead_candidates_owner_read')
    expect(migration).toContain('grant select on table public.hb_lead_candidates to authenticated')
    expect(migration).not.toMatch(/grant\s+insert\s+on\s+table\s+public\.hb_lead_candidates\s+to\s+authenticated/i)
    expect(sql).toMatch(/legal_form_code[^;\n]*not null check \(legal_form_code in \('49','31','96'\)\)/)
    expect(sql).toContain("contactability='BLOCKED_PENDING_VERIFICATION'")
    expect(sql).toContain('outreach_ready=false')
    expect(sql).toContain('row level security')
    expect(sql).toContain('to authenticated')
    expect(sql).toContain('owner_id = (select auth.uid())')
    expect(sql).not.toMatch(/grant (insert|update|delete|all) on table public\.hb_lead_candidates to authenticated/i)
    expect(sql).not.toMatch(/create trigger.*send|notify|email/i)
  })
})
