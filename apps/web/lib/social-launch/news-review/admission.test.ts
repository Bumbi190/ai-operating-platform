import {beforeAll,afterAll,it,expect,vi} from 'vitest'
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {boundaryFixture} from './boundary.test-utils'
import {id,sha} from './fixtures.test-utils'
import {admitReviewVideo,measureReviewVideo} from './admission'
const state=vi.hoisted(()=>({db:null as any,admitted:[] as any[],afterRead:null as null|((path:unknown)=>void)}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.db}))
vi.mock('@/lib/media/asset/admission',()=>({admitAssetBytes:async(input:any)=>{state.admitted.push(input);return {asset:{id:'10000000-0000-4000-8000-000000000099'}}}}))
vi.mock('node:fs/promises',async original=>{
 const fs=await original<typeof import('node:fs/promises')>()
 return {...fs,readFile:async(...args:any[])=>{const bytes=await (fs.readFile as any)(...args);state.afterRead?.(args[0]);return bytes}}
})
let dir='',videoPath=''
beforeAll(()=>{
 vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-18T08:00:00Z'))
 dir=mkdtempSync(join(tmpdir(),'the-prompt-review-test-'));videoPath=join(dir,'sample.mp4')
 writeFileSync(videoPath,Buffer.from(readFileSync(new URL('./silent-review.mp4.base64',import.meta.url),'utf8'),'base64'))
})
afterAll(()=>{vi.restoreAllMocks();if(dir)rmSync(dir,{recursive:true,force:true})})
it('dry_run_measures_actual_movie_without_storage_writes',async()=>{
 const f=boundaryFixture();state.db=f.db;state.admitted=[]
 const receipt=structuredClone(f.snapshot.receipt),bytes=readFileSync(videoPath);receipt.video={sha256:sha(bytes),byteSize:bytes.length}
 receipt.profile=await measureReviewVideo(videoPath)
 const manifestPath=join(dir,'manifest.json');writeFileSync(manifestPath,JSON.stringify(receipt))
 const result=await admitReviewVideo(f.principal,{projectId:id(1),scriptId:id(3),videoPath,manifestPath,apply:false})
 expect(result).toMatchObject({dryRun:true,videoAssetId:null,blockers:[]});expect(state.admitted).toHaveLength(0);expect(f.effects.writes).toBe(0)
 const applied=await admitReviewVideo(f.principal,{projectId:id(1),scriptId:id(3),videoPath,manifestPath,apply:true})
 expect(applied.videoAssetId).toBe(id(99));expect(state.admitted).toHaveLength(1)
 expect(state.admitted[0]).toMatchObject({visibility:'internal',kind:'video',provenance:{source:'derived',adapterVersion:'the-prompt-review-admission-v1',simulated:false,referenceAssetIds:receipt.assetProvenanceIds}})
 expect(sha(state.admitted[0].bytes)).toBe(receipt.video.sha256)
})
it('missing_usage_or_changed_movie_cannot_be_admitted',async()=>{
 const f=boundaryFixture();state.db=f.db;state.admitted=[]
 const manifestPath=join(dir,'invalid.json');writeFileSync(manifestPath,JSON.stringify({...f.snapshot.receipt,usage:[]}))
 await expect(admitReviewVideo(f.principal,{projectId:id(1),scriptId:id(3),videoPath,manifestPath,apply:true})).rejects.toBeTruthy()
 writeFileSync(manifestPath,JSON.stringify(f.snapshot.receipt))
 await expect(admitReviewVideo(f.principal,{projectId:id(1),scriptId:id(3),videoPath,manifestPath,apply:true})).rejects.toMatchObject({code:'MEDIA_CHANGED'})
 expect(state.admitted).toHaveLength(0)
})
it('foreign_owner_and_stops_prevent_any_admission',async()=>{
 const f=boundaryFixture();state.db=f.db;state.admitted=[]
 const input={projectId:id(1),scriptId:id(3),videoPath,manifestPath:join(dir,'does-not-exist'),apply:true}
 await expect(admitReviewVideo({...f.principal,userId:id(999)},input)).rejects.toMatchObject({code:'NOT_FOUND'})
 f.setStopped();await expect(admitReviewVideo(f.principal,input)).rejects.toMatchObject({code:'STOPPED'})
 expect(state.admitted).toHaveLength(0)
})

it('operator_identity_comes_from_verified_auth_not_local_claims',async()=>{
 const {authenticateReviewOperator}=await import('./admission')
 const f=boundaryFixture();f.db.auth={getUser:async()=>({data:{user:{id:id(2)}},error:null})}
 expect(await authenticateReviewOperator(f.db,'verified-session-token')).toEqual(f.principal)
 f.db.auth.getUser=async()=>({data:{user:null},error:{message:'Invalid token'}})
 await expect(authenticateReviewOperator(f.db,'unverified-token')).rejects.toMatchObject({code:'NOT_FOUND'})
})
it('replacement_of_original_path_cannot_certify_unmeasured_bytes',async()=>{
 const f=boundaryFixture();state.db=f.db;state.admitted=[]
 const original=readFileSync(videoPath),invalid=Buffer.alloc(original.length);original.copy(invalid,0,0,12)
 const receipt=structuredClone(f.snapshot.receipt);receipt.video={sha256:sha(invalid),byteSize:invalid.length}
 const path=join(dir,'replaced.mp4'),manifestPath=join(dir,'replacement-receipt.json')
 writeFileSync(path,invalid);writeFileSync(manifestPath,JSON.stringify(receipt))
 state.afterRead=p=>{if(String(p)===path)writeFileSync(path,original)}
 try{
  await expect(admitReviewVideo(f.principal,{projectId:id(1),scriptId:id(3),videoPath:path,manifestPath,apply:true})).rejects.toMatchObject({code:'MISSING_RENDER_EVIDENCE'})
  expect(state.admitted).toHaveLength(0)
 }finally{state.afterRead=null}
},30000)
