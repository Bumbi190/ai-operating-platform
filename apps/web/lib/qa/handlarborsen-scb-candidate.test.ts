import { describe, expect, it, vi } from 'vitest'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { ORG } from '@/lib/handlarborsen/lead-finder/fixtures'
import { leadFinderScbCandidateApi, SCB_CANDIDATE_CONFIRMATION, type LiveScbCandidateRow } from '@/lib/handlarborsen/lead-finder/scb-candidate'
import { evaluateScbCompany } from '@/lib/handlarborsen/lead-finder/scb-status-policy'
import type { KnownContacts } from '@/lib/handlarborsen/lead-finder/known-contacts'
import type { ScbRegisterRecord } from '@/lib/handlarborsen/lead-finder/types'

const owner=async()=>({ok:true as const,userId:'owner',allowedProjectIds:[HANDLARBORSEN_PROJECT_ID]})
const env={VERCEL_ENV:'preview',HB_LEADFINDER_SCB_PREVIEW_ENABLED:'true',HB_LEADFINDER_SCB_CANDIDATE_WRITE_ENABLED:'true',SCB_API_KEY:'secret-value'}
const rows:ScbRegisterRecord[]=[
 {orgnr:ORG.alpha,name:'Malmö Bil Ett',cfar:'1001',sniCodes:['47.811'],countyCode:'12',municipalityCode:'1280',city:'MALMÖ'},
 {orgnr:ORG.beta,name:'Malmö Bil Två',cfar:'1002',sniCodes:['47.811'],countyCode:'12',municipalityCode:'1280',city:'MALMÖ'},
]
const known:KnownContacts={status:'ready',count:1,entries:[{kind:'contacted',orgnr:ORG.beta,companyName:'Bilhuset Beta AB',domain:null}],source:'omnira_sales_contacts',externalPilotRegistryConnected:false}
const review=(orgnr:string,restricted=false)=>evaluateScbCompany({
 expectedOrgnr:orgnr,
 je:{peOrgNr:`16${orgnr}`,namn:orgnr===ORG.beta?'Bilhuset Beta AB':'Testbil Alfa AB',ftgStat:'1',jurform:'49',reklamSparrTyp:restricted?2:1,epostSparrTyp:1,telefonSparrTyp:1},
})
const request=(cfar:string='1001',confirmation:string=SCB_CANDIDATE_CONFIRMATION)=>new Request('https://preview.example/api/atlas/handlarborsen/lead-finder/scb-candidate',{method:'POST',headers:{origin:'https://preview.example','content-type':'application/json'},body:JSON.stringify({confirmation,cfar})})
function memoryWriter(){
 const values:LiveScbCandidateRow[]=[]
 return {
  values,
  writer:{
   find:vi.fn(async(_projectId:string,orgnr:string)=>({id:values.find(v=>v.orgnr===orgnr)?'11111111-1111-4111-8111-111111111111':null,failed:false})),
   insert:vi.fn(async(row:LiveScbCandidateRow)=>{values.push(row);return{id:'22222222-2222-4222-8222-222222222222',failed:false}}),
  },
 }
}

describe('Handlarbörsen live SCB candidate bridge',()=>{
 it('fails closed outside Preview or without the separate write flag',async()=>{
  const mem=memoryWriter(),search=vi.fn(async()=>({rows,pages:1,truncated:false}))
  expect((await leadFinderScbCandidateApi(request(),{env:{...env,VERCEL_ENV:'production'},resolveAccess:owner,search,reviewLegalEntity:async o=>review(o),loadKnownContacts:async()=>known,getWriter:()=>mem.writer})).status).toBe(404)
  expect((await leadFinderScbCandidateApi(request(),{env:{...env,HB_LEADFINDER_SCB_CANDIDATE_WRITE_ENABLED:'false'},resolveAccess:owner,search,reviewLegalEntity:async o=>review(o),loadKnownContacts:async()=>known,getWriter:()=>mem.writer})).status).toBe(404)
  expect(search).not.toHaveBeenCalled()
  expect(mem.values).toHaveLength(0)
 })

 it('requires exact confirmation and a CFAR from the bounded Malmö/SNI probe',async()=>{
  const mem=memoryWriter()
  const deps={env,resolveAccess:owner,search:async()=>({rows,pages:1,truncated:false}),reviewLegalEntity:async(o:string)=>review(o),loadKnownContacts:async()=>known,getWriter:()=>mem.writer,today:()=> '2026-11-02'}
  expect((await leadFinderScbCandidateApi(request('1001','wrong'),deps)).status).toBe(400)
  expect((await leadFinderScbCandidateApi(request('9999'),deps)).status).toBe(404)
  expect(mem.values).toHaveLength(0)
 })

 it('saves only a blocked needs-review row with live provenance and no contact data',async()=>{
  const mem=memoryWriter()
  const res=await leadFinderScbCandidateApi(request('1001'),{env,resolveAccess:owner,search:async()=>({rows,pages:1,truncated:false}),reviewLegalEntity:async o=>review(o),loadKnownContacts:async()=>known,getWriter:()=>mem.writer,today:()=> '2026-11-02'})
  expect(res.status).toBe(201)
  expect(await res.json()).toEqual({status:'saved',candidateId:'22222222-2222-4222-8222-222222222222',outreachReady:false})
  expect(mem.values).toHaveLength(1)
  expect(mem.values[0]).toMatchObject({
   project_id:HANDLARBORSEN_PROJECT_ID,orgnr:ORG.alpha,name:'Testbil Alfa AB',city:'MALMÖ',status:'needs_review',
   exclusions:['historical_register_incomplete'],contactability:'BLOCKED_PENDING_VERIFICATION',outreach_ready:false,
   provenance:{source:'scb_foretagsregistret',retrievedAt:'2026-11-02',audit:'hb-scb-live-preview-v1',review:'awaiting_human_review',workplaceCfar:'1001'},
  })
  expect(JSON.stringify(mem.values[0])).not.toContain('secret-value')
  expect(JSON.stringify(mem.values[0])).not.toContain('email')
 })

 it('turns prior contact into excluded and an SCB marketing block into suppressed',async()=>{
  const prior=memoryWriter()
  const base={env,resolveAccess:owner,search:async()=>({rows,pages:1,truncated:false}),loadKnownContacts:async()=>known,today:()=> '2026-11-02'}
  expect((await leadFinderScbCandidateApi(request('1002'),{...base,reviewLegalEntity:async o=>review(o),getWriter:()=>prior.writer})).status).toBe(201)
  expect(prior.values[0]).toMatchObject({status:'excluded',prior_contact:true})
  expect(prior.values[0].exclusions).toContain('previous_contact_partial_history')

  const suppressed=memoryWriter()
  expect((await leadFinderScbCandidateApi(request('1001'),{...base,reviewLegalEntity:async o=>review(o,true),getWriter:()=>suppressed.writer})).status).toBe(201)
  expect(suppressed.values[0]).toMatchObject({status:'suppressed',reklam_code:'2'})
  expect(suppressed.values[0].exclusions).toContain('scb_marketing_restriction')
 })

 it('does not create a second row for an existing legal entity and refuses incomplete history',async()=>{
  const existing=memoryWriter();existing.values.push({
   project_id:HANDLARBORSEN_PROJECT_ID,orgnr:ORG.alpha,name:'Testbil Alfa AB',city:'MALMÖ',county_code:'12',sni_codes:['47.811'],score:null,status:'needs_review',exclusions:['historical_register_incomplete'],scb_status_code:'1',legal_form_code:'49',reklam_code:'1',epost_code:'1',telefon_code:'1',prior_contact:false,history_coverage:'PARTIAL',contactability:'BLOCKED_PENDING_VERIFICATION',outreach_ready:false,provenance:{source:'scb_foretagsregistret',retrievedAt:'2026-11-02',audit:'hb-scb-live-preview-v1',review:'awaiting_human_review',workplaceCfar:'1001'},
  })
  const deps={env,resolveAccess:owner,search:async()=>({rows,pages:1,truncated:false}),reviewLegalEntity:async(o:string)=>review(o),loadKnownContacts:async()=>known,getWriter:()=>existing.writer,today:()=> '2026-11-02'}
  expect((await leadFinderScbCandidateApi(request(),deps)).status).toBe(200)
  expect(existing.values).toHaveLength(1)

  const noHistory=memoryWriter()
  const res=await leadFinderScbCandidateApi(request(),{...deps,loadKnownContacts:async()=>({...known,status:'incomplete'}),getWriter:()=>noHistory.writer})
  expect(res.status).toBe(503)
  expect(noHistory.values).toHaveLength(0)
 })
})
