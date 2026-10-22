import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import type {ApprovedScheduleSnapshot} from './types'
import {createApprovedScheduleMediaScopeFixture} from './approved-media-scope-fixture'

const project='10000000-0000-4000-8000-000000000001'
const foreign='10000000-0000-4000-8000-000000000002'
const binding='20000000-0000-4000-8000-000000000018'
const assetId='30000000-0000-4000-8000-000000000001'
const revisionId='40000000-0000-4000-8000-000000000001'
const now=Date.parse('2026-10-22T15:00:00.000Z')
const mediaDb={} as any
const token='fixture-token-do-not-use-outside-test'
function approved():ApprovedScheduleSnapshot{
 return {
  projectId:project,approvalId:'50000000-0000-4000-8000-000000000001',
  manifestSha256:'a'.repeat(64),
  item:{
   postId:'60000000-0000-4000-8000-000000000001',revisionId,
   sha256:'b'.repeat(64),decisionId:'70000000-0000-4000-8000-000000000001',
   planRevisionId:'80000000-0000-4000-8000-000000000001',
   bindingId:binding,accountId:'12345',channel:'facebook',
   asset:{id:assetId,sha256:'c'.repeat(64)},
   localMinute:'2026-10-22T17:00',scheduledAt:'2026-10-22T15:00:00.000Z',
   expiresAt:'2026-10-22T15:10:00.000Z',occasionId:'90000000-0000-4000-8000-000000000001',
   kind:'ordinary',releaseCondition:null,
  },
  revision:{
   id:revisionId,sequence:1,sha256:'b'.repeat(64),planRevisionId:'80000000-0000-4000-8000-000000000001',
   draft:{channel:'facebook',format:'image',title:'fixture',text:'text',linkUrl:null,
     mediaIds:[assetId],mediaBrief:'',scheduledAt:'2026-10-22T15:00:00.000Z'},
   media:[{id:assetId,sha256:'c'.repeat(64),kind:'image',mimeType:'image/jpeg',width:600,height:600}],
   binding:{id:binding,accountId:'12345',label:'test page'},
   createdAt:'2026-10-22T14:00:00.000Z',
  },publication:null,
 }
}
function backing(opts:Record<string,unknown>={}){
 const credential={projectId:project,channel:'facebook' as const,accountId:'12345',bindingId:binding,token,
  apiBase:'https://graph.facebook.com/v21.0'}
 const resolveCredential=vi.fn(async()=>({...credential}))
 const verifyImage=vi.fn(async()=>({bytes:new Uint8Array([1,2,3]),width:600,height:600}))
 return {expectedProjectId:project,mediaDb,leaseExpiresAt:new Date(now+90000).toISOString(),now:()=>now,
   resolveCredential,verifyImage,...opts}
}
beforeEach(()=>vi.stubEnv('NODE_ENV','test'))
afterEach(()=>vi.unstubAllEnvs())

it('resolves only the approved project/account and exact asset without exposing the backing client',async()=>{
 const source=approved(),deps=backing(),scope=createApprovedScheduleMediaScopeFixture(source,deps)
 expect(Object.keys(scope).sort()).toEqual(['resolveCredential','verifyImage'])
 expect('mediaDb' in scope).toBe(false)
 expect('platformTokens' in scope).toBe(false)
 const result=await scope.resolveCredential(project,'facebook')
 expect(result).toMatchObject({projectId:project,bindingId:binding,accountId:'12345',token})
 const image=await scope.verifyImage(mediaDb,project,{id:assetId,sha256:'c'.repeat(64)})
 expect(image.width).toBe(600)
 expect(deps.resolveCredential).toHaveBeenCalledTimes(1)
 expect(deps.verifyImage).toHaveBeenCalledWith(mediaDb,project,{id:assetId,sha256:'c'.repeat(64)})
})

it('rejects foreign project, channel, file, hash and media client before a privileged read',async()=>{
 const deps=backing(),scope=createApprovedScheduleMediaScopeFixture(approved(),deps)
 await expect(scope.resolveCredential(foreign,'facebook')).rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 await expect(scope.resolveCredential(project,'instagram')).rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 for(const [db,projectId,image] of [
  [mediaDb,foreign,{id:assetId,sha256:'c'.repeat(64)}],
  [mediaDb,project,{id:'30000000-0000-4000-8000-000000000002',sha256:'c'.repeat(64)}],
  [mediaDb,project,{id:assetId,sha256:'d'.repeat(64)}],
  [{},project,{id:assetId,sha256:'c'.repeat(64)}],
 ] as const)
  await expect(scope.verifyImage(db as any,projectId,image)).rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 expect(deps.resolveCredential).not.toHaveBeenCalled()
 expect(deps.verifyImage).not.toHaveBeenCalled()
})

it('refuses mismatched provider credentials, including an account selected from another project',async()=>{
 for(const mismatch of [
  {projectId:foreign},{channel:'instagram'},{accountId:'7777'}, {bindingId:'20000000-0000-4000-8000-000000000019'},
  {token:''},
 ]){
  const deps=backing(),scope=createApprovedScheduleMediaScopeFixture(approved(),{
   ...deps,resolveCredential:vi.fn(async()=>({...await deps.resolveCredential(),...mismatch})),
  } as any)
  await expect(scope.resolveCredential(project,'facebook')).rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 }
})

it('rejects stale leases and untrusted approval snapshots',async()=>{
 const deps=backing({now:()=>now+90000})
 const scope=createApprovedScheduleMediaScopeFixture(approved(),deps as any)
 await expect(scope.resolveCredential(project,'facebook')).rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 await expect(scope.verifyImage(mediaDb,project,{id:assetId,sha256:'c'.repeat(64)})).rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 expect(deps.resolveCredential).not.toHaveBeenCalled()
 expect(deps.verifyImage).not.toHaveBeenCalled()
 const changes=[
  (s:ApprovedScheduleSnapshot)=>{s.projectId=foreign},
  (s:ApprovedScheduleSnapshot)=>{s.item.accountId='777'},
  (s:ApprovedScheduleSnapshot)=>{s.item.asset.id='30000000-0000-4000-8000-000000000002'},
  (s:ApprovedScheduleSnapshot)=>{s.revision.media[0].sha256='d'.repeat(64)},
  (s:ApprovedScheduleSnapshot)=>{s.revision.binding=null},
  (s:ApprovedScheduleSnapshot)=>{s.revision.draft.mediaIds=[]},
  (s:ApprovedScheduleSnapshot)=>{s.revision.draft.channel='instagram'},
 ] as const
 for(const mutate of changes){
  const s=approved();mutate(s)
  expect(()=>createApprovedScheduleMediaScopeFixture(s,backing())).toThrow()
 }
 vi.stubEnv('NODE_ENV','production')
 expect(()=>createApprovedScheduleMediaScopeFixture(approved(),backing())).toThrow()
})

it('accepts the canonical SQL binding projection with no embedded binding id',async()=>{
 const snapshot=approved()
 snapshot.revision.binding={accountId:'12345',label:'Synthetic page'} as any
 const deps=backing()
 const scope=createApprovedScheduleMediaScopeFixture(snapshot,deps)
 expect((await scope.resolveCredential(project,'facebook')).bindingId).toBe(binding)
})

it('pins the original scope even if the snapshot is later mutated',async()=>{
 const s=approved(),deps=backing()
 const scope=createApprovedScheduleMediaScopeFixture(s,deps)
 s.projectId=foreign;s.item.channel='instagram';s.item.asset.id='30000000-0000-4000-8000-000000000009'
 await expect(scope.resolveCredential(foreign,'instagram')).rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 const credential=await scope.resolveCredential(project,'facebook')
 expect(credential.accountId).toBe('12345')
 const image=await scope.verifyImage(mediaDb,project,{id:assetId,sha256:'c'.repeat(64)})
 expect(image.height).toBe(600)
})
