import React from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { withCheckDigit } from '@/lib/handlarborsen/lead-finder/fixtures'
import type { LocalReview, LocalReviewRow } from '@/lib/handlarborsen/lead-finder/local-review'
import {
  buildResearchQueue, evaluateLeadEvidence, parseSafePublicUrl,
  normalizeResearchLimit, LEAD_RESEARCH_MAX_LIMIT,
  type ResearchJob,
} from '@/lib/handlarborsen/lead-finder/lead-research'
import { runLeadResearch } from '@/lib/handlarborsen/lead-finder/lead-research-worker'
import { HandlarborsenScbPreviewTable } from '@/components/platform/vnext/HandlarborsenScbPreviewTable'

const orgnr = (i: number) => withCheckDigit('556700' + String(i).padStart(3,'0'))
function reviewFixture(): LocalReview {
  const rows: LocalReviewRow[] = Array.from({length:89},(_,i)=>({
    name: i<2 ? 'Hedbergs Bil ' + i + ' AB' : 'Provmotor ' + i + ' AB',
    orgnr:orgnr(i),city:['Malmö','Lund','Helsingborg','Ystad','Hässleholm','Ängelholm'][i%6],
    sni: i%7===0?'46.711':'47.811',
    scbActive:i<83,legalFormCode:'49',legalFormLabel:'Övriga aktiebolag',
    otherLegalForm:false, restricted:i===9, restrictedChannels:i===9?['reklam','epost','telefon']:[],
    priorContact:i===20,groupHypothesis:i<2?'Hedbergs':null,
    reviewState:'awaiting_human_review',contactability:'BLOCKED_PENDING_VERIFICATION',
  }))
  return {
    rows, counts:{total:89,active:83,inactive:6,restricted:1,priorContact:1,possibleGroup:2,otherLegalForm:0},
    excludedPhysicalPersons:1,sourceRows:90,provenance:'SCB 2026-10-27',historyCoverage:'PARTIAL',outreachReady:0,
  }
}
const verified = reviewFixture()
const getJob = () => {
  const q = buildResearchQueue(verified)
  if(q.status!=='ready') throw new Error('synthetic review not accepted')
  return q.jobs[0]
}
const obs=(job:ResearchJob,extra:Record<string,unknown>={})=>({
  sourceUrl:'https://www.syntetiskbil.se/om-oss',
  sourceKind:'official_company_site',observedOn:'2026-10-28',
  orgnrOnPage:job.orgnr,
  observedBusinessIndicators:['cars_for_sale','vehicle_stock_listings'],
  excerpt:'Vi säljer begagnade personbilar och visar vårt billager.',
  ...extra,
})

describe('Atlas Lead Research Worker v1: research is NOT contact authorization',()=>{
  it('creates 5 repeatable, diversified offline research requests, never a list of approved leads',()=>{
    const q=buildResearchQueue(verified)
    expect(q.status).toBe('ready')
    if(q.status!=='ready')return
    expect(q).toMatchObject({eligible:81,outreachReady:false})
    expect(q.jobs).toHaveLength(5)
    expect(new Set(q.jobs.map(j=>j.orgnr)).size).toBe(5)
    expect(new Set(q.jobs.map(j=>j.city)).size).toBeGreaterThan(1)
    expect(q.jobs.every(j=>j.outreachReady===false&&j.contactability==='BLOCKED_PENDING_VERIFICATION'
      &&j.status==='RESEARCH_NOT_STARTED'&&j.searchQueries.length===3)).toBe(true)
    expect(buildResearchQueue(verified)).toEqual(q)
    expect(q.jobs.find(j=>j.orgnr===orgnr(9))).toBeUndefined()
    expect(q.jobs.find(j=>j.orgnr===orgnr(20))).toBeUndefined()
    expect(q.jobs.find(j=>j.orgnr===orgnr(83))).toBeUndefined()
    expect(q.skipped).toEqual(expect.arrayContaining([
      {orgnr:orgnr(9),reason:'scb_marketing_restriction'},
      {orgnr:orgnr(20),reason:'prior_contact'},
      {orgnr:orgnr(83),reason:'inactive_per_scb'},
    ]))
  })
  it('caps research at max ten requests and fails closed for an invalid or changed source',()=>{
    expect(normalizeResearchLimit(-1)).toBe(0)
    expect(normalizeResearchLimit(0)).toBe(0)
    expect(normalizeResearchLimit(NaN)).toBe(0)
    expect(buildResearchQueue(verified, 0)).toMatchObject({ status: 'ready', jobs: [], outreachReady: false })
    expect(normalizeResearchLimit(300)).toBe(LEAD_RESEARCH_MAX_LIMIT)
    expect(buildResearchQueue(verified,300).status).toBe('ready')
    const changed=reviewFixture(); changed.historyCoverage='FULL' as never
    expect(buildResearchQueue(changed).status).toBe('refused')
    const changed2=reviewFixture(); changed2.rows[0].contactability='READY' as never
    expect(buildResearchQueue(changed2).status).toBe('refused')
    const changed3=reviewFixture();changed3.rows[1].orgnr=changed3.rows[0].orgnr
    expect(buildResearchQueue(changed3).status).toBe('refused')
  })
  it('rejects private URLs, credentials, userinfo, port, non-HTTPS, IPs and unsafe domains',()=>{
    for(const url of [
      'http://example.se','https://localhost/','https://internal/','https://127.0.0.1/x',
      'https://192.168.1.1','https://[::1]','https://user:pass@official.se',
      'https://www.official.se:8080','https://intranet.local','https://company.invalid',
      'https://www.example.se/evil space','https://www.example.se\\@internal.local/',
    ])expect(parseSafePublicUrl(url)).toBeNull()
    expect(parseSafePublicUrl('https://www.syntetiskbil.se/kontakt')?.host).toBe('www.syntetiskbil.se')
  })
  it('only labels a dealer from a legal-identity-matched, official website with observed cars for sale',()=>{
    const job=getJob()
    const r=evaluateLeadEvidence(job,[obs(job)])
    expect(r).toMatchObject({classification:'DEALER_EVIDENCE',identityVerified:true,
      contactability:'BLOCKED_PENDING_VERIFICATION',outreachReady:false})
    expect(r.evidence[0].sourceUrl).toMatch(/^https:\/\//)
    expect(r.contactProposal).toBeNull()
  })
  it('does not infer dealer suitability from SCB alone, a third-party excerpt or mismatched company ID',()=>{
    const job=getJob()
    expect(evaluateLeadEvidence(job,[])).toMatchObject({classification:'NEEDS_FURTHER_RESEARCH',identityVerified:false,contactProposal:null})
    expect(evaluateLeadEvidence(job,[obs(job,{sourceKind:'search_snippet'})]).classification).toBe('NEEDS_FURTHER_RESEARCH')
    expect(evaluateLeadEvidence(job,[obs(job,{orgnrOnPage:orgnr(84)})])).toMatchObject({
      classification:'NEEDS_FURTHER_RESEARCH',identityVerified:false,contactProposal:null,
    })
    expect(evaluateLeadEvidence(job,[obs(job,{orgnrOnPage:null,legalNameOnPage:'Another Company AB'})]).identityVerified).toBe(false)
  })
  it('treats confirmed official wheelchair/finance-only business as out-of-scope evidence, not an outreach decision',()=>{
    const job=getJob()
    for(const signal of ['wheelchairs_or_mobility_aids','financial_or_collection_services']){
      const r=evaluateLeadEvidence(job,[obs(job,{
        observedBusinessIndicators:[signal],excerpt:'Här säljer vi inte bilar, endast andra produkter.',
      })])
      expect(r).toMatchObject({classification:'OUT_OF_SCOPE_EVIDENCE',
        contactability:'BLOCKED_PENDING_VERIFICATION',outreachReady:false})
    }
  })
  it('never treats a shared corporate domain as enough proof from name alone',()=>{
    const job=getJob()
    const r=evaluateLeadEvidence(job,[obs(job,{sourceUrl:'https://bilia.se/om-oss',
      orgnrOnPage:null,legalNameOnPage:job.legalName})])
    expect(r.identityVerified).toBe(false)
    expect(r.classification).toBe('NEEDS_FURTHER_RESEARCH')
  })
  it('only proposes general business contacts with source, confirmed site family and review block',()=>{
    const job=getJob()
    const r=evaluateLeadEvidence(job,[obs(job,{
      generalBusinessEmail:'info@syntetiskbil.se',
      emailSourceUrl:'https://syntetiskbil.se/kontakt',
      switchboardPhone:'010-123 45 67',
      phoneLabel:'company switchboard',
      phoneSourceUrl:'https://syntetiskbil.se/kontakt',
    })])
    expect(r.contactProposal).toEqual({
      generalBusinessEmail:{value:'info@syntetiskbil.se',sourceUrl:'https://syntetiskbil.se/kontakt'},
      switchboardPhone:{value:'010-123 45 67',sourceUrl:'https://syntetiskbil.se/kontakt'},
      status:'NEEDS_MANUAL_CONTACT_CHECK',contactability:'BLOCKED_PENDING_VERIFICATION',
    })
    expect(r.outreachReady).toBe(false)
  })
  it('never elevates personal emails, mobile numbers, wrong domains or unsafe contact pages',()=>{
    const job=getJob()
    const cases=[
      {generalBusinessEmail:'anna.svensson@syntetiskbil.se',emailSourceUrl:'https://syntetiskbil.se/kontakt'},
      {generalBusinessEmail:'info@other-dealer.se',emailSourceUrl:'https://syntetiskbil.se/kontakt'},
      {generalBusinessEmail:'info@syntetiskbil.se',emailSourceUrl:'https://localhost/kontakt'},
      {switchboardPhone:'+46701234567',phoneLabel:'company switchboard',phoneSourceUrl:'https://syntetiskbil.se/kontakt'},
      {switchboardPhone:'010-123 45 67',phoneLabel:'Salesperson phone',phoneSourceUrl:'https://syntetiskbil.se/kontakt'},
    ]
    for(const extra of cases){
      const r=evaluateLeadEvidence(job,[obs(job,extra)])
      expect(r.contactProposal).toBeNull()
      expect(r.outreachReady).toBe(false)
    }
  })
  it('rejects invalid observations, unexpected extra volume, and refuses any fake contact clearance',()=>{
    const job=getJob()
    expect(evaluateLeadEvidence(job,[obs(job,{sourceUrl:'https://localhost'})]).classification).toBe('NEEDS_FURTHER_RESEARCH')
    expect(evaluateLeadEvidence(job,Array.from({length:6},()=>obs(job)))).toMatchObject({
      classification:'NEEDS_FURTHER_RESEARCH',contactProposal:null,identityVerified:false,
    })
    const r=evaluateLeadEvidence(job,[obs(job,{excerpt:'info@person.se <script>alert(1)</script>'})])
    expect(r.contactProposal).toBeNull()
    expect(r.outreachReady).toBe(false)
    expect(JSON.stringify(r)).not.toContain('script')
  })
  it('has no default adapter; injected adapter is bounded to five research attempts with no outreach',async()=>{
    const blocked=await runLeadResearch({review:verified})
    expect(blocked).toEqual({status:'blocked',reason:'adapter_absent',results:[],calls:0,outreachReady:false})
    const adapter={name:'synthetic-no-network',collect:vi.fn(async(job:ResearchJob)=>[obs(job)])}
    const noJobs=await runLeadResearch({review:verified,adapter,limit:0})
    expect(noJobs).toMatchObject({status:'completed',calls:0,results:[],outreachReady:false})
    expect(adapter.collect).not.toHaveBeenCalled()
    const result=await runLeadResearch({review:verified,adapter,limit:100})
    expect(result.status).toBe('completed')
    expect(result.calls).toBe(5)
    expect(adapter.collect).toHaveBeenCalledTimes(5)
    if(result.status==='completed'){
      expect(result.results).toHaveLength(5)
      expect(result.results.every(x=>x.classification==='DEALER_EVIDENCE'&&
        x.outreachReady===false&&x.contactability==='BLOCKED_PENDING_VERIFICATION')).toBe(true)
    }
  })
  it('prepares only five visible research requests; no fake contact or action button',()=>{
    const html=renderToStaticMarkup(React.createElement(HandlarborsenScbPreviewTable,{review:verified}))
    expect(html).toContain('Atlas forskningskö')
    expect(html).toContain('Research ej körd')
    expect(html).toContain('5 företag')
    expect(html).not.toMatch(/mailto:|tel:|Skicka mejl|Godkänn för utskick/)
  })
  it('updates the research queue status only after a completed owner review run', () => {
    const before=renderToStaticMarkup(React.createElement(HandlarborsenScbPreviewTable,{review:verified}))
    const after=renderToStaticMarkup(React.createElement(HandlarborsenScbPreviewTable,{review:verified,researched:true}))
    expect(before).toContain('Research ej körd')
    expect(after).toContain('Research körd – källgranska')
    expect(after).not.toContain('Research ej körd')
    expect(after).toContain('Ingen utskicksbehörighet')
  })
  it('contains no Node or outbound search dependency in the browser-safe core',()=>{
    const source=readFileSync(fileURLToPath(new URL('../handlarborsen/lead-finder/lead-research.ts',import.meta.url)),'utf8')
    expect(source).not.toMatch(/from ['"]node:|require\(|\bfetch\(|axios|process\.env|setInterval\(|setTimeout\(|localStorage|window\.location/)
  })
})
