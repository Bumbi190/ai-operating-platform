import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { HandlarborsenResearchResults, parseResearchResponse } from '@/components/platform/vnext/HandlarborsenResearchResults'
import { withCheckDigit } from '@/lib/handlarborsen/lead-finder/fixtures'
import { evaluateLeadEvidence, type ResearchJob } from '@/lib/handlarborsen/lead-finder/lead-research'
import {
  makeTavilyVerifiedResearchAdapter, TAVILY_EXTRACT_URL, MAX_EXTRACTS_PER_BATCH,
} from '@/lib/handlarborsen/lead-finder/tavily-extract-research'

const KEY='tvly-synthetic-test-only'
const ORG=withCheckDigit('556700001')
const DASHED=ORG.slice(0,6)+'-'+ORG.slice(6)
const JOB:ResearchJob={
  id:'research:'+ORG,legalName:'Provbil AB',orgnr:ORG,city:'Malmö',sni:'47.811',
  searchQueries:[],status:'RESEARCH_NOT_STARTED',outreachReady:false,
  contactability:'BLOCKED_PENDING_VERIFICATION',sourceDate:'2026-10-27',
}
const URL='https://www.provbil.se/om-oss'
const hit=()=>({
  title:'Provbil AB',url:URL,
  content:'Provbil AB, org.nr '+DASHED+'. Vi säljer begagnade personbilar i Malmö.',
})
const page=(content?:string)=>({
  url:URL,
  raw_content:content??(
    'Provbil AB. Organisationsnummer: '+DASHED+
    '. Vi säljer begagnade bilar och visar bilar i lager.'+
    ' Kontakta oss via info@provbil.se. Växel: 010-123 45 67.'
  ),
})
const response=(results:unknown[],status=200)=>new Response(JSON.stringify({results}),{
  status,headers:{'content-type':'application/json'},
})
const mockFetch=(searchResults:unknown[]=[hit()],extractResults:unknown[]=[page()],status=200)=>
  vi.fn(async(input:string,_init:RequestInit)=>{
    if(input==='https://api.tavily.com/search')return response(searchResults)
    if(input===TAVILY_EXTRACT_URL)return response(extractResults,status)
    throw Error('unexpected_network_destination')
  })
const make=(fetchImpl:ReturnType<typeof mockFetch>)=>makeTavilyVerifiedResearchAdapter({
  key:KEY,fetchImpl,now:()=>new Date('2026-10-28T12:00:00Z'),extractApproved:true,
})

describe('optional Tavily basic site extraction: separately consented and bounded',()=>{
  it('refuses the second paid stage without explicit approval',()=>{
    expect(()=>makeTavilyVerifiedResearchAdapter({
      key:KEY,fetchImpl:mockFetch(),extractApproved:false as true,
    })).toThrow('extract_not_approved')
  })
  it('calls exactly one fixed search and one fixed extract endpoint, no direct source fetch',async()=>{
    const f=mockFetch()
    const obs=await make(f).collect(JOB,new AbortController().signal) as unknown[]
    expect(f).toHaveBeenCalledTimes(2)
    expect(f.mock.calls[0][0]).toBe('https://api.tavily.com/search')
    expect(f.mock.calls[1][0]).toBe(TAVILY_EXTRACT_URL)
    const [url,req]=f.mock.calls[1]
    expect(url).not.toContain(KEY)
    expect(req.method).toBe('POST')
    expect(req.redirect).toBe('error')
    expect((req.headers as Record<string,string>).authorization).toBe('Bearer '+KEY)
    expect(JSON.stringify(req.body)).not.toContain(KEY)
    expect(JSON.parse(String(req.body))).toEqual({
      urls:URL,extract_depth:'basic',include_images:false,
      format:'text',timeout:6,include_usage:false,
    })
    expect(obs).toHaveLength(2)
    expect((obs[0] as {sourceKind:string}).sourceKind).toBe('search_snippet')
    expect((obs[1] as {sourceKind:string}).sourceKind).toBe('official_company_site')
  })
  it('needs matching legal identity AND vehicle sales on extracted company page',async()=>{
    const f=mockFetch()
    const result=evaluateLeadEvidence(JOB,await make(f).collect(JOB,new AbortController().signal))
    expect(result).toMatchObject({classification:'DEALER_EVIDENCE',identityVerified:true,
      outreachReady:false,contactability:'BLOCKED_PENDING_VERIFICATION'})
    expect(result.contactProposal).toMatchObject({
      generalBusinessEmail:{value:'info@provbil.se',sourceUrl:URL},
      switchboardPhone:{value:expect.stringContaining('010'),sourceUrl:URL},
      status:'NEEDS_MANUAL_CONTACT_CHECK',
    })
    expect(result.evidence.find(x=>x.sourceKind==='official_company_site')?.excerpt)
      .not.toMatch(/@|https?:|www\.|<|>/)
  })
  it('never treats search excerpts alone or a mismatched page as legal identity',async()=>{
    const bad=[
      'Provbil AB. Vi säljer begagnade bilar.',
      'Annanbilsbolaget AB. Organisationsnummer: '+DASHED+'. Vi säljer begagnade bilar.',
      'Provbil AB. Organisationsnummer: 556020-1369. Vi säljer begagnade bilar.',
    ]
    for(const raw of bad){
      const f=mockFetch([hit()],[page(raw)])
      const result=evaluateLeadEvidence(JOB,await make(f).collect(JOB,new AbortController().signal))
      expect(result).toMatchObject({classification:'NEEDS_FURTHER_RESEARCH',
        identityVerified:false,contactProposal:null,outreachReady:false})
    }
  })
  it('never promotes an Inkasso company name or registered car trade into active sales',async()=>{
    const job={...JOB,legalName:'Aktiebolaget Inkasso'}
    const url='https://www.inkasso.se/om-oss'
    const snippet={title:job.legalName,url,
      content:`Aktiebolaget Inkasso, org.nr ${DASHED}. Verksamhet inom detaljhandel med personbilar.`}
    const extracted={url,raw_content:`Aktiebolaget Inkasso. Organisationsnummer: ${DASHED}. Företaget har verksamhet inom detaljhandel med personbilar och lätta motorfordon.`}
    const fetch=mockFetch([snippet],[extracted])
    const output=evaluateLeadEvidence(job,await make(fetch).collect(job,new AbortController().signal))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(output).toMatchObject({
      classification:'NEEDS_FURTHER_RESEARCH',identityVerified:true,
      contactProposal:null,outreachReady:false,
    })
    expect(output.evidence.some(e=>e.indicators.includes('registered_vehicle_trade'))).toBe(true)
    expect(output.evidence.some(e=>e.indicators.includes('financial_or_collection_services'))).toBe(false)
    expect(output.evidence.some(e=>e.indicators.includes('cars_for_sale'))).toBe(false)
  })

  it('keeps registered motor-vehicle trade distinct from actual car sales even on a checked company page',async()=>{
    const job={...JOB,legalName:'Förenade Bil Aktiebolaget i Malmö'}
    const url='https://www.forenadebil.se/foretagsinformation'
    const snippet={title:job.legalName,url,
      content:`${job.legalName}, org.nr ${DASHED}. Bolaget skall bedriva handel med motorfordon.`}
    const extracted={url,raw_content:`${job.legalName}. Organisationsnummer: ${DASHED}. Bolaget skall bedriva handel med motorfordon, reservdelar och reparation av motorfordon.`}
    const output=evaluateLeadEvidence(job,await make(mockFetch([snippet],[extracted]))
      .collect(job,new AbortController().signal))
    expect(output.identityVerified).toBe(true)
    expect(output.classification).toBe('NEEDS_FURTHER_RESEARCH')
    expect(output.evidence.some(e=>e.indicators.includes('registered_vehicle_trade'))).toBe(true)
    expect(output.evidence.some(e=>e.indicators.includes('cars_for_sale'))).toBe(false)
    expect(output.outreachReady).toBe(false)
  })

  it('recognizes debt-collection services only when they are explicitly described on the page',async()=>{
    const job={...JOB,legalName:'Aktiebolaget Inkasso'}
    const url='https://www.inkasso.se/om-oss'
    const snippet={title:job.legalName,url,content:`Aktiebolaget Inkasso, org.nr ${DASHED}. Företagsinformation.`}
    const extracted={url,raw_content:`Aktiebolaget Inkasso. Organisationsnummer: ${DASHED}. Vi bedriver inkassoverksamhet och factoring.`}
    const output=evaluateLeadEvidence(job,await make(mockFetch([snippet],[extracted]))
      .collect(job,new AbortController().signal))
    expect(output.evidence.some(e=>e.indicators.includes('financial_or_collection_services'))).toBe(true)
    expect(output.evidence.some(e=>e.indicators.includes('registered_vehicle_trade'))).toBe(false)
    expect(output).toMatchObject({classification:'OUT_OF_SCOPE_EVIDENCE',identityVerified:true,
      contactProposal:null,outreachReady:false})
  })

  it('does not turn Bilförsäljning appearing only in a legal name into sales proof',async()=>{
    const job={...JOB,legalName:'Bengt Bilförsäljning AB'}
    const url='https://www.bengt-bilforsaljning.se/om-oss'
    const snippet={title:job.legalName,url,
      content:`Bengt Bilförsäljning AB, org.nr ${DASHED}. Företaget erbjuder konsulttjänster.`}
    const extracted={url,raw_content:`Bengt Bilförsäljning AB. Organisationsnummer: ${DASHED}. Företaget erbjuder konsulttjänster.`}
    const fetch=mockFetch([snippet],[extracted])
    const output=evaluateLeadEvidence(job,await make(fetch).collect(job,new AbortController().signal))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(output.identityVerified).toBe(true)
    expect(output.classification).toBe('NEEDS_FURTHER_RESEARCH')
    expect(output.evidence.every(e=>!e.indicators.includes('cars_for_sale') &&
      !e.indicators.includes('vehicle_stock_listings'))).toBe(true)
    expect(output.outreachReady).toBe(false)
  })

  it('does not extract directories, unrelated hosts or unsafe IP URLs',async()=>{
    for(const url of [
      'https://allabolag.se/foretag/provbil','https://www.car.info/sv-se/company/provbil',
      'https://www.permobil.com/om-oss','https://127.0.0.1/private',
    ]){
      const f=mockFetch([{...hit(),url}])
      await make(f).collect(JOB,new AbortController().signal)
      expect(f).toHaveBeenCalledTimes(1)
    }
  })
  it('does not promote a redirected/oversized/empty extract response to company proof',async()=>{
    for(const pages of [
      [{...page(),url:'https://www.other.se/kontakt'}],
      [{...page(),raw_content:'x'.repeat(65001)}],
      [],
    ]){
      const f=mockFetch([hit()],pages)
      const result=evaluateLeadEvidence(JOB,await make(f).collect(JOB,new AbortController().signal))
      expect(f).toHaveBeenCalledTimes(2)
      expect(result).toMatchObject({classification:'NEEDS_FURTHER_RESEARCH',
        identityVerified:false,outreachReady:false})
    }
  })
  it('does not retain personal mail or cellphone even when the company matches',async()=>{
    const raw='Provbil AB. Organisationsnummer: '+DASHED+
      '. Vi säljer begagnade bilar. Anna.Person@provbil.se, mobil 070-123 45 67.'
    const result=evaluateLeadEvidence(JOB,await make(mockFetch([hit()],[page(raw)]))
      .collect(JOB,new AbortController().signal))
    expect(result.classification).toBe('DEALER_EVIDENCE')
    expect(result.contactProposal).toBeNull()
    expect(JSON.stringify(result)).not.toMatch(/anna\.person@|070-123/)
  })
  it('shows only source-linked general contacts in the owner review without mailto or sends',async()=>{
    const output=evaluateLeadEvidence(JOB,await make(mockFetch()).collect(JOB,new AbortController().signal))
    const parsed=parseResearchResponse({
      status:'researched',sourceMode:'search_and_page_extract',outreachReady:false,
      results:[{
        orgnr:JOB.orgnr,companyName:JOB.legalName,city:JOB.city,
        classification:output.classification,identityVerified:output.identityVerified,
        officialSite:output.officialSite,contactSuggestion:output.contactProposal,
        contactability:'BLOCKED_PENDING_VERIFICATION',outreachReady:false,
        evidence:output.evidence,reasons:output.reasons,
      }],
    })
    expect(parsed).not.toBeNull()
    const html=renderToStaticMarkup(React.createElement(HandlarborsenResearchResults,{results:parsed!}))
    expect(html).toContain('info@provbil.se')
    expect(html).toContain('010-123 45 67')
    expect(html).toContain('Allmän företagskontakt')
    expect(html).toContain('Ej kontaktbar')
    expect(html).not.toMatch(/mailto:|tel:|godkänn.*kontakt|Skicka mejl/i)
  })
  it('never displays spoofed employee mail, unverifiable host or contacts from snippets',()=>{
    const source={
      status:'researched',sourceMode:'search_and_page_extract',outreachReady:false,
      results:[{
        orgnr:JOB.orgnr,companyName:JOB.legalName,city:JOB.city,
        classification:'DEALER_EVIDENCE',identityVerified:true,
        officialSite:URL,outreachReady:false,contactability:'BLOCKED_PENDING_VERIFICATION',
        evidence:[],reasons:[],contactSuggestion:{
          status:'NEEDS_MANUAL_CONTACT_CHECK',contactability:'BLOCKED_PENDING_VERIFICATION',
          generalBusinessEmail:{value:'anna.person@provbil.se',sourceUrl:URL},
          switchboardPhone:{value:'070-123 45 67',sourceUrl:URL},
        },
      }],
    }
    const invalid=parseResearchResponse(source)
    expect(invalid).not.toBeNull()
    expect(JSON.stringify(invalid)).not.toMatch(/anna\.person@|070-123/)
    expect(parseResearchResponse({...source,sourceMode:'search_snippets_only'})?.[0].contacts).toBeNull()
    const wrongHost=parseResearchResponse({
      ...source,results:[{...source.results[0],contactSuggestion:{
        ...source.results[0].contactSuggestion,
        generalBusinessEmail:{value:'info@provbil.se',sourceUrl:'https://outside.org/contacts'},
      }}],
    })
    expect(wrongHost?.[0].contacts).toBeNull()
  })
  it('preserves sanitized search snippets when the optional extract transport fails',async()=>{
    const f=vi.fn(async(url:string,_init:RequestInit)=>{
      if(url==='https://api.tavily.com/search')return response([hit()])
      throw Error('provider failure tvly-private-key-never-show')
    })
    const adapter=makeTavilyVerifiedResearchAdapter({
      key:KEY,fetchImpl:f,extractApproved:true,now:()=>new Date('2026-10-28T12:00:00Z'),
    })
    const obs=await adapter.collect(JOB,new AbortController().signal) as {sourceKind:string}[]
    expect(f).toHaveBeenCalledTimes(2)
    expect(obs).toHaveLength(1)
    expect(obs[0].sourceKind).toBe('search_snippet')
    const r=evaluateLeadEvidence(JOB,obs)
    expect(JSON.stringify(r)).not.toContain('tvly-private-key-never-show')
    expect(r).toMatchObject({classification:'NEEDS_FURTHER_RESEARCH',contactability:'BLOCKED_PENDING_VERIFICATION',outreachReady:false})
  })
  it('enforces at most five searches and five potential extractions per adapter',async()=>{
    const f=mockFetch()
    const adapter=make(f)
    for(let i=0;i<5;i++){
      const orgnr=withCheckDigit('556700'+String(100+i).padStart(3,'0'))
      await adapter.collect({...JOB,id:'research:'+orgnr,orgnr},new AbortController().signal)
    }
    expect(f.mock.calls.filter(([url])=>url==='https://api.tavily.com/search')).toHaveLength(5)
    expect(f.mock.calls.filter(([url])=>url===TAVILY_EXTRACT_URL).length).toBeLessThanOrEqual(MAX_EXTRACTS_PER_BATCH)
    const sixth=withCheckDigit('556700999')
    await expect(adapter.collect({...JOB,id:'research:'+sixth,orgnr:sixth},new AbortController().signal))
      .rejects.toThrow('request_budget_exceeded')
  })
})
