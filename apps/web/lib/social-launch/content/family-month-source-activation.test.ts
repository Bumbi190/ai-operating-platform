import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {resolveFamilyOwnerApprovedPublicSource} from './family-month-source-activation'
import {readLatestOwnerApprovedFamilyMonthSource} from './family-month-source-store'
import {FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'

vi.mock('./family-month-source-store',async importOriginal=>({
 ...await importOriginal<typeof import('./family-month-source-store')>(),
 readLatestOwnerApprovedFamilyMonthSource:vi.fn(),
}))
const OWNER='10000000-0000-4000-8000-000000000001'
const IMAGE='20000000-0000-4000-8000-000000000002'
const CANDIDATE='30000000-0000-4000-8000-000000000003'
const DECISION='40000000-0000-4000-8000-000000000004'
const principal={userId:OWNER,allowedProjectIds:[FAMILY_WEEKLY_PROJECT_ID]}
const imageBytes=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(60,3)])
const sha=createHash('sha256').update(imageBytes).digest('hex')
const path=FAMILY_WEEKLY_PROJECT_ID+'/social/approved-source/image.jpg'
function source(){
 return {
  candidateId:CANDIDATE,candidateSha256:'a'.repeat(64),
  month:'2026-12',decisionId:DECISION,
  decidedAt:'2026-10-20T20:01:00Z',
  proposal:{
   projectId:FAMILY_WEEKLY_PROJECT_ID,month:'2026-12',
   planRevisionId:'e745041f-ad3a-493f-bd3b-025525d561b2',
   title:'December public preview',publicSummary:'Public preview of December.',
   campaignPurpose:'Public family media preview',
   proof:[{kind:'owner-project-public-evidence' as const,referenceId:IMAGE,
    sha256:sha,description:'Marketing asset original',privateSubscriberAsset:false as const}],
   proposedCopy:[{date:'2026-11-27',variant:'winter',
    title:'A winter family preview',text:'A public review text for the owner.'}],
  },
 }
}
function mockDb(patch:Record<string,unknown>={},downloadError=false,actualBytes=imageBytes){
 const calls:{table:string;bucket?:string;key?:string}[]=[]
 const row={
  id:IMAGE,project_id:FAMILY_WEEKLY_PROJECT_ID,
  kind:'image',mime_type:'image/jpeg',
  byte_size:imageBytes.byteLength,checksum_sha256:sha,
  status:'active',visibility:'internal',storage_bucket:'media-assets-private',
  storage_path:path,...patch,
 }
 const db={
  from(table:string){
   calls.push({table})
   if(table!=='assets')throw Error('unexpected source table')
   return {
    select(_fields:string){return{
     eq(_key:string,_value:string){return this},
     maybeSingle:async()=>({data:row,error:null}),
    }},
   }
  },
  storage:{
   from(bucket:string){
    calls.push({table:'storage',bucket})
    return{async download(key:string){
     calls.push({table:'download',bucket,key})
     return {data:downloadError?null:new Blob([actualBytes]),error:downloadError?{message:'denied'}:null}
    }}
   },
  },
 }
 return {db,calls}
}
beforeEach(()=>{
 vi.stubEnv('FAMILY_PUBLIC_SOURCE_ACTIVATION_ENABLED','true')
 vi.mocked(readLatestOwnerApprovedFamilyMonthSource).mockReset()
 vi.mocked(readLatestOwnerApprovedFamilyMonthSource).mockImplementation(async()=>source() as any)
})
afterEach(()=>vi.unstubAllEnvs())
describe('Family verified owner-approved PUBLIC source resolver (read-only)',()=>{
 it('gates on durable approved owner decision, project-owned image and SHA-256 of actual bytes',async()=>{
  const {db,calls}=mockDb()
  const value=await resolveFamilyOwnerApprovedPublicSource(db as any,principal,'2026-12')
  expect(value).toMatchObject({
   kind:'family-owner-approved-public-source-v1',sourceMonth:'2026-12',
   decisionId:DECISION,candidateId:CANDIDATE,
   sourceIntegrityVerified:true,verifiedImageCount:1,
   verifiedImageAssetIds:[IMAGE],canDraftReviewProposals:true,canPublish:false,
   canSpend:false,canSchedule:false,canOpenMemberContent:false,
  })
  expect(value.templates).toEqual(source().proposal.proposedCopy)
  expect(readLatestOwnerApprovedFamilyMonthSource).toHaveBeenCalledTimes(2)
  expect(calls.map(c=>c.table)).toEqual(['assets','storage','download'])
  expect(calls[2]).toEqual({table:'download',bucket:'media-assets-private',key:path})
  expect(JSON.stringify(value)).not.toContain('media-assets-private')
  expect(JSON.stringify(value)).not.toContain(path)
 })
 it('disabled by default: no DB reads, calls or costs even if a decision exists',async()=>{
  vi.stubEnv('FAMILY_PUBLIC_SOURCE_ACTIVATION_ENABLED','false')
  const {db,calls}=mockDb()
  await expect(resolveFamilyOwnerApprovedPublicSource(db as any,principal,'2026-12'))
   .rejects.toMatchObject({code:'REVIEW_REQUIRED'})
  expect(readLatestOwnerApprovedFamilyMonthSource).not.toHaveBeenCalled()
  expect(calls).toHaveLength(0)
 })
 it('denies spoofed media, wrong tenant, protected bucket, public fallback, missing asset and altered bytes',async()=>{
  const patches=[
   {id:'50000000-0000-4000-8000-000000000005'},
   {project_id:'50000000-0000-4000-8000-000000000005'},
   {kind:'audio'},
   {kind:'video'},
   {status:'archived'},
   {visibility:'private'},
   {storage_bucket:'protected'},
   {storage_bucket:'public'},
   {storage_path:'november/experience-v1/audio/story-01.mp3'},
   {storage_path:FAMILY_WEEKLY_PROJECT_ID+'/social/../../other/image.jpg'},
   {checksum_sha256:'c'.repeat(64)},
   {byte_size:7000000},
   {mime_type:'audio/mpeg'},
  ]
  for(const patch of patches){
   const {db,calls}=mockDb(patch)
   await expect(resolveFamilyOwnerApprovedPublicSource(db as any,principal,'2026-12'))
    .rejects.toMatchObject({code:'REVIEW_REQUIRED'})
   expect(calls.some(c=>c.table==='download')).toBe(false)
  }
  const {db}=mockDb({},true)
  await expect(resolveFamilyOwnerApprovedPublicSource(db as any,principal,'2026-12'))
   .rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 })
 it('tampered actual storage bytes with unchanged asset metadata are rejected',async()=>{
  const changed=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(60,4)])
  const {db}=mockDb({},false,changed)
  await expect(resolveFamilyOwnerApprovedPublicSource(db as any,principal,'2026-12'))
   .rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 })
 it('image bytes must match the declared format, not only the DB hash',async()=>{
  const forged=Buffer.alloc(64,7)
  const wrongMimeHash=createHash('sha256').update(forged).digest('hex')
  vi.mocked(readLatestOwnerApprovedFamilyMonthSource).mockImplementation(async()=>{
   const src=source();src.proposal.proof[0].sha256=wrongMimeHash
   return src as any
  })
  const {db}=mockDb({checksum_sha256:wrongMimeHash},false,forged)
  await expect(resolveFamilyOwnerApprovedPublicSource(db as any,principal,'2026-12'))
   .rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 })
 it('proof must reference an exact registered asset UUID, never a URL, text tag, or private story asset',async()=>{
  for(const bad of [
   'https://example.test/image.jpg','image', 'subscriber-story',
   'november/experience-v1/audio/story-01.mp3',
  ]){
   vi.mocked(readLatestOwnerApprovedFamilyMonthSource).mockImplementation(async()=>{
    const x=source();x.proposal.proof[0].referenceId=bad;return x as any
   })
   const {db,calls}=mockDb()
   await expect(resolveFamilyOwnerApprovedPublicSource(db as any,principal,'2026-12'))
    .rejects.toMatchObject({code:'REVIEW_REQUIRED'})
   expect(calls).toHaveLength(0)
  }
 })
 it('newer source revision or changed decision invalidates earlier approval after byte verification',async()=>{
  let number=0
  vi.mocked(readLatestOwnerApprovedFamilyMonthSource).mockImplementation(async()=>{
   number++
   const x=source()
   if(number===2)x.candidateId='50000000-0000-4000-8000-000000000005'
   return x as any
  })
  const {db}=mockDb()
  await expect(resolveFamilyOwnerApprovedPublicSource(db as any,principal,'2026-12'))
   .rejects.toMatchObject({code:'REVIEW_REQUIRED'})
  expect(number).toBe(2)
 })
 it('does not permit arbitrarily many images in a single read, preventing uncapped I/O',async()=>{
  vi.mocked(readLatestOwnerApprovedFamilyMonthSource).mockImplementation(async()=>{
   const x=source()
   x.proposal.proof=[...x.proposal.proof,...x.proposal.proof,...x.proposal.proof,...x.proposal.proof]
   return x as any
  })
  const {db,calls}=mockDb()
  await expect(resolveFamilyOwnerApprovedPublicSource(db as any,principal,'2026-12'))
   .rejects.toMatchObject({code:'REVIEW_REQUIRED'})
  expect(calls).toHaveLength(0)
 })
})
