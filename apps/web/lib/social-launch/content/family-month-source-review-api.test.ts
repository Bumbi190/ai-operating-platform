import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'
import {prepareFamilyMonthSourceReview,type FamilyMonthSourceProposal} from './family-month-source-review'

const state=vi.hoisted(()=>({
 allowed:[ '77cda551-57c9-4dc0-b019-1bb6438777f7' ] as string[],
 authenticated:true,
 dbCalls:0,
 lists:[] as unknown[][],proposals:[] as unknown[][],decisions:[] as unknown[][],
}))
const OWNER='10000000-0000-4000-8000-000000000001'
vi.mock('@/lib/auth/project-access',()=>({
 resolveProjectAccess:async()=>state.authenticated?
  {ok:true,userId:OWNER,allowedProjectIds:state.allowed}:
  {ok:false,response:Response.json({code:'UNAUTHORIZED'},{status:401})},
}))
vi.mock('@/lib/atlas/executive/http',()=>({
 assertSameOrigin:(req:Request)=>{
  const origin=req.headers.get('origin')
  return origin===new URL(req.url).origin?null:
   Response.json({code:'FORBIDDEN'},{status:403})
 },
}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{
 state.dbCalls++;return{fixture:'db'}
}}))
vi.mock('./family-month-source-store',()=>{
 class FamilySourceStoreError extends Error{
  constructor(public code:string){super(code)}
  get status(){return this.code==='INVALID_INPUT'?400:this.code==='NOT_FOUND'?404:503}
 }
 return {
  FamilySourceStoreError,
  listFamilyMonthSourceReviews:async(...x:unknown[])=>{
   state.lists.push(x);return {records:[],canPublish:false}
  },
  proposeFamilyMonthSource:async(...x:unknown[])=>{
   state.proposals.push(x);return {candidateId:'candidate',canActivate:false,canPublish:false}
  },
  decideFamilyMonthSource:async(...x:unknown[])=>{
   state.decisions.push(x);return {decision:'approve',activationAllowed:false,canPublish:false}
  },
 }
})
import {familyMonthSourceReviewApi} from './family-month-source-review-api'
function proposed():FamilyMonthSourceProposal{
 return {
  projectId:FAMILY_WEEKLY_PROJECT_ID,month:'2026-12',
  planRevisionId:'e745041f-ad3a-493f-bd3b-025525d561b2',
  title:'December preview review',
  publicSummary:'Public preview from the owner studio.',
  campaignPurpose:'Preview December family activities',
  proof:[{kind:'owner-project-public-evidence',referenceId:'source-image',
   sha256:'a'.repeat(64),description:'Public promotional source',
   privateSubscriberAsset:false}],
  proposedCopy:[{date:'2026-11-27',variant:'winter',title:'Coming December preview',
   text:'Publicly reviewable December teaser.'}],
 }
}
const url='http://localhost/api/family-month-source-review'
function request(body?:unknown,origin='http://localhost'){
 return new Request(url,body===undefined?{method:'GET'}:{
  method:'POST',headers:{origin,'content-type':'application/json'},
  body:JSON.stringify(body),
 })
}
beforeEach(()=>{
 vi.stubEnv('FAMILY_MONTH_SOURCE_REVIEW_ENABLED','true')
 Object.assign(state,{allowed:[FAMILY_WEEKLY_PROJECT_ID],authenticated:true,
  dbCalls:0,lists:[],proposals:[],decisions:[]})
})
afterEach(()=>vi.unstubAllEnvs())
describe('private owner month-source review API (disabled by default)',()=>{
 it('requires authenticated current owner and never touches DB on refusal',async()=>{
  state.authenticated=false
  expect((await familyMonthSourceReviewApi(request())).status).toBe(401)
  state.authenticated=true;state.allowed=[]
  expect((await familyMonthSourceReviewApi(request())).status).toBe(404)
  expect(state.dbCalls).toBe(0)
 })
 it('disabled feature is no-op with no database reads or writes',async()=>{
  vi.stubEnv('FAMILY_MONTH_SOURCE_REVIEW_ENABLED','false')
  const response=await familyMonthSourceReviewApi(request({operation:'propose',proposal:proposed()}))
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({code:'UNAVAILABLE'})
  expect(state.dbCalls).toBe(0)
 })
 it('rejects cross-origin writes, unknown fields and invalid methods',async()=>{
  expect((await familyMonthSourceReviewApi(request(
   {operation:'propose',proposal:proposed()},'https://evil.example'))).status).toBe(403)
  expect((await familyMonthSourceReviewApi(new Request(url,{method:'PUT'}))).status).toBe(405)
  expect((await familyMonthSourceReviewApi(new Request(url+'?month=2026-12&month=2026-11'))).status).toBe(400)
  expect((await familyMonthSourceReviewApi(new Request(url+'?month=2026-12&approve=true'))).status).toBe(400)
  expect(state.dbCalls).toBeLessThanOrEqual(2)
  expect(state.proposals).toHaveLength(0)
  expect(state.decisions).toHaveLength(0)
 })
 it('lists owner month review without exposing caches or writing decisions',async()=>{
  const response=await familyMonthSourceReviewApi(new Request(url+'?month=2026-12'))
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  expect(state.lists).toHaveLength(1)
  const args=state.lists[0] as any[]
  expect(args[1]).toEqual({ok:true,userId:OWNER,allowedProjectIds:[FAMILY_WEEKLY_PROJECT_ID]})
  expect(args[2]).toEqual({month:'2026-12',candidateId:undefined})
  expect(state.decisions).toHaveLength(0)
 })
 it('proposes exact month evidence using server-proven owner, no approval or publishing',async()=>{
  const proposal=proposed()
  const response=await familyMonthSourceReviewApi(request({operation:'propose',proposal}))
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({canActivate:false,canPublish:false})
  expect(state.proposals).toHaveLength(1)
  const args=state.proposals[0] as any[]
  expect(args[1]).toMatchObject({userId:OWNER,allowedProjectIds:[FAMILY_WEEKLY_PROJECT_ID]})
  expect(args[2]).toEqual(proposal)
  expect(state.decisions).toHaveLength(0)
 })
 it('decision requires explicit confirmation and owner session, never grants activation',async()=>{
  const digest=prepareFamilyMonthSourceReview(proposed()).candidateSha256
  const candidateId='30000000-0000-4000-8000-000000000003'
  const payload={operation:'decide',month:'2026-12',candidateId,
   candidateSha256:digest,decision:'approve',confirmed:true}
  const response=await familyMonthSourceReviewApi(request(payload))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({activationAllowed:false,canPublish:false})
  expect(state.decisions).toHaveLength(1)
  expect((state.decisions[0] as any[])[2]).toEqual({
   month:'2026-12',candidateId,candidateSha256:digest,decision:'approve',confirmed:true,
  })
  expect(state.proposals).toHaveLength(0)
 })
 it('body cannot smuggle publisher authority and is size-bounded',async()=>{
  const malformed=[
   {operation:'decide',month:'2026-12',candidateId:'id',
    candidateSha256:'a'.repeat(64),decision:'approve'},
   {operation:'propose',proposal:proposed(),approved:true},
   {operation:'publish',proposal:proposed()},
  ]
  for(const data of malformed)
   expect((await familyMonthSourceReviewApi(request(data))).status).toBe(400)
  const large='x'.repeat(66000)
  expect((await familyMonthSourceReviewApi(request({operation:'propose',proposal:large}))).status)
   .toBe(400)
  expect(state.proposals).toHaveLength(0)
  expect(state.decisions).toHaveLength(0)
 })
})
