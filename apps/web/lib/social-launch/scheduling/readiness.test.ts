
import {it,expect,vi,beforeEach,afterEach} from 'vitest'
const s=vi.hoisted(()=>({view:null as any,peeks:0}))
vi.mock('./store',()=>({readSchedules:async()=>s.view,peekScheduleJobs:async()=>{s.peeks++;return {jobId:null,result:'not_due'}},scheduleDispatchEnabled:()=>process.env.SOCIAL_SCHEDULE_DISPATCH_ENABLED==='true'}))
import {readScheduleReadiness} from './readiness'
const projectId='77cda551-57c9-4dc0-b019-1bb6438777f7',now='2026-10-18T08:00:00.000Z'
const item={postId:'post',channel:'facebook',bindingId:'binding',accountId:'account',scheduledAt:'2026-10-20T15:00:00.000Z',expiresAt:'2026-10-20T15:10:00.000Z',kind:'ordinary',releaseCondition:null} as any
const principal={userId:'owner',allowedProjectIds:[projectId]} as any
const deps=()=>({now:()=>now,runnerVerified:true,resolveCredential:async(_projectId:string,channel:'facebook'|'instagram')=>({projectId,bindingId:'binding',accountId:'account',channel} as any),hasUncertainReceipt:async()=>false})
const batch=()=>({status:'approved',reviewCurrent:true,manifest:{projectId,items:[item]},jobs:[{postId:'post',state:'queued',expiresAt:item.expiresAt}]} as any)
beforeEach(()=>{s.peeks=0;s.view={projectId,batches:[batch()],monthlyRule:null,releaseEvidence:[]};vi.stubEnv('SOCIAL_SCHEDULE_DISPATCH_ENABLED','true')})
afterEach(()=>vi.unstubAllEnvs())
it('requires runner entitlement feature binding exact approval and recovered receipts',async()=>{
 s.view.batches=[];vi.stubEnv('SOCIAL_SCHEDULE_DISPATCH_ENABLED','false')
 const result=await readScheduleReadiness({} as any,principal,{projectId},{...deps(),runnerVerified:false,resolveCredential:async()=>{throw Error()},hasUncertainReceipt:async()=>true})
 expect(result.ready).toBe(false)
 expect(result.blockers).toEqual(expect.arrayContaining(['runner_unverified','dispatch_disabled','binding_unverified:facebook','binding_unverified:instagram','no_approved_batch','receipt_recovery_required']))
 expect(s.peeks).toBe(1)
})
it('monthly recurrence alone grants nothing and missing content or stale evidence blocks readiness',async()=>{
 s.view.monthlyRule={enabled:true};s.view.batches=[]
 let result=await readScheduleReadiness({} as any,principal,{projectId},deps())
 expect(result.blockers).toEqual(expect.arrayContaining(['no_approved_batch','monthly_content_missing:2026-11']))
 const monthly={...item,kind:'month_release',channel:'facebook',releaseCondition:{releaseMonth:'2026-11',catalogSha256:'a'.repeat(64)}}
 s.view.batches=[{...batch(),manifest:{projectId,items:[monthly,{...monthly,postId:'ig',channel:'instagram'}]},jobs:[...batch().jobs,{postId:'ig',state:'queued',expiresAt:item.expiresAt}]}]
 result=await readScheduleReadiness({} as any,principal,{projectId},deps())
 expect(result.blockers).toContain('release_evidence_missing:2026-11')
 s.view.releaseEvidence=[{releaseMonth:'2026-11',catalogSha256:'a'.repeat(64),verifiedAt:'2026-10-16T08:00:00Z'}]
 expect((await readScheduleReadiness({} as any,principal,{projectId},deps())).blockers).toContain('release_evidence_missing:2026-11')
})
it('is read only and checks exact current binding without returning any credential',async()=>{
 const db=new Proxy({},{get(){throw Error('unexpected DB mutation')}}) as any
 const result=await readScheduleReadiness(db,principal,{projectId},{...deps(),resolveCredential:async(_projectId:string,channel:'facebook'|'instagram')=>({projectId,bindingId:'binding',accountId:'account',channel,token:'NEVER_RETURN_ME'} as any)})
 expect(result.ready).toBe(true);expect(result.nextJobs).toEqual([item]);expect(result.dryRun).toMatchObject({result:'not_due'});expect(JSON.stringify(result)).not.toContain('NEVER_RETURN_ME');expect(s.peeks).toBe(1)
 const stale=await readScheduleReadiness(db,principal,{projectId},{...deps(),resolveCredential:async()=>({projectId,bindingId:'other',accountId:'account',channel:'facebook'} as any)})
 expect(stale.blockers).toContain('binding_changed:facebook')
})
it('rejects inaccessible projects before any privileged read',async()=>{
 await expect(readScheduleReadiness({} as any,{...principal,allowedProjectIds:[]},{projectId},deps())).rejects.toMatchObject({code:'NOT_FOUND'})
 expect(s.peeks).toBe(0)
})
