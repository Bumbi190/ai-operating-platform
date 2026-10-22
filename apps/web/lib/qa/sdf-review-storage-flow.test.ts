import {afterAll,beforeAll,describe,it,expect} from 'vitest'
import {ReviewPostgres,q} from './fixtures/sdf-review-postgres'
import {createReviewStorageStore} from '@/lib/atlas/code-work/review/storage/store'
import type {ReviewStorageDb} from '@/lib/atlas/code-work/review/storage/store'
import {initializeReviewStorage,applyReviewStorageCommand,readReviewStorageForRole,recoverReviewRoleCredential} from '@/lib/atlas/code-work/review/storage/service'
import {readReviewStorageForOperator} from '@/lib/atlas/code-work/review/storage/principal-read'
import {freezeCommand,reportCommand,messageCommand,storageActor} from './fixtures/sdf-review-storage-fixture'
import {validateStoredReviewJob} from '@/lib/atlas/code-work/review/storage/prepare'
const db=new ReviewPostgres()
beforeAll(()=>db.start(),120000);afterAll(()=>db.stop(),30000)
const fixtureErrors:string[]=[]
const allowed=new Set(['atlas_code_review_read','atlas_code_review_initialize','atlas_code_review_authenticate_role','atlas_code_review_observe','atlas_code_review_apply','atlas_code_review_read_for_role','atlas_code_review_rotate_credential'])
function adapter():ReviewStorageDb{return{rpc:async(name,args)=>{try{if(!allowed.has(name)||Object.keys(args).some(k=>!/^p_[a-z_]+$/.test(k)))throw Error('fixture_rpc');const sql='select public.'+name+'('+Object.entries(args).map(([k,v])=>k+'=>'+q(v)).join(',')+');';const output=db.sql(sql,'service_role');return{data:output===''?null:JSON.parse(output),error:null}}catch(e){fixtureErrors.push(String((e as {stderr?:unknown}).stderr??e));return{data:null,error:{message:'fixture_rpc_rejected'}}}}}}
const deps=()=>({store:createReviewStorageStore(adapter())})
function evidence(j:any,version:1|2=1){const full=freezeCommand(j,version),{binding:_,assignment:__,...snapshotInput}=full.snapshotInput;return{...full,snapshotInput}}
async function boot(){const parent=db.createParent(),{coordinator:_,worker:__,...config}=parent.job.config,input={parentProof:parent.proof,config},result=await initializeReviewStorage(input,deps());expect(result.status).toBe('ok');return{...parent,input,initial:result,job:result.job!}}
async function send(j:any,role:'atlas'|'worker'|'reviewer',credential:unknown,command:unknown){const actor=storageActor(j,role);return applyReviewStorageCommand({workId:j.workId,role,sessionId:actor.sessionId,credential,command},deps())}
describe('real persisted server review flow',()=>{
 it('recreates services through two candidates, directed discussion, independent roles and operator history',async()=>{
  const f=await boot(),atlas=f.initial.credentials!.atlas,worker=f.initial.credentials!.worker
  const frozen=await send(f.job,'atlas',atlas,evidence(f.job));expect(frozen.status).toBe('ok');let j=db.read(f.job.workId),reviewer1=frozen.reviewerCredential!
  const initial=await readReviewStorageForRole({workId:j.workId,role:'reviewer',sessionId:storageActor(j,'reviewer').sessionId,credential:reviewer1},deps());expect(initial.status).toBe('ok');expect(initial.view!.messages).toEqual([])
  expect((await send(j,'reviewer',reviewer1,reportCommand(j))).status).toBe('ok');j=db.read(j.workId)
  expect((await send(j,'reviewer',reviewer1,messageCommand(j,1,'worker'))).status).toBe('ok');j=db.read(j.workId)
  const answer=messageCommand(j,2,'reviewer');Object.assign(answer.body,{kind:'answer',replyTo:'message-1',body:'The requested behavior is this.'})
  expect((await send(j,'worker',worker,answer)).status).toBe('ok');j=db.read(j.workId)
  expect((await send(j,'reviewer',reviewer1,reportCommand(j,'final','changes_requested'))).status).toBe('ok');j=db.read(j.workId)
  const oldSession=storageActor(j,'reviewer').sessionId,oldHash=j.candidates[0].snapshot.snapshotHash
  const second=await send(j,'atlas',atlas,evidence(j,2));expect(second.status,fixtureErrors.join('\n')).toBe('ok');j=db.read(j.workId)
  expect(storageActor(j,'reviewer').sessionId).not.toBe(oldSession);expect(j.candidates[1].snapshot.snapshotHash).not.toBe(oldHash)
  expect((await readReviewStorageForRole({workId:j.workId,role:'reviewer',sessionId:oldSession,credential:reviewer1},deps())).view).toBeNull()
  expect((await send(j,'reviewer',second.reviewerCredential,reportCommand(j))).status).toBe('ok');j=db.read(j.workId)
  expect((await send(j,'reviewer',second.reviewerCredential,reportCommand(j,'final'))).status).toBe('ok');j=db.read(j.workId)
  expect(validateStoredReviewJob(j).ok).toBe(true);expect(j.version).toBe(8);expect(j.candidates[1].final.decision).toBe('passed')
  const view=await readReviewStorageForOperator(j.projectId,j.workId,{store:deps().store,access:async()=>({ok:true,allowedProjectIds:[j.projectId]})})
  expect(view.status).toBe('ok');expect(view.view!.candidates).toHaveLength(2);expect(view.view!.messages).toHaveLength(2)
  expect(JSON.stringify(view.view)).not.toMatch(/acr1\.|tokenHash|brokerTokenHash|commandHash/)
  expect(db.sql('select state from public.atlas_code_work_runs where work_id='+q(j.workId)+'::uuid;')).toBe('claimed')
 },120000)
 it('reconciles lost initialization and freeze responses without duplicate state or secret replay',async()=>{
  const f=db.createParent(),{coordinator:_,worker:__,...config}=f.job.config,input={parentProof:f.proof,config}
  const actual=deps().store,lossyInit={...actual,initialize:async(...a:Parameters<typeof actual.initialize>)=>{await actual.initialize(...a);throw Error('response_lost')}}
  expect((await initializeReviewStorage(input,{store:lossyInit})).status).toBe('unavailable')
  const retry=await initializeReviewStorage(input,deps());expect(retry.status).toBe('replayed');expect(retry.credentials).toBeNull()
  let j=db.read(f.job.workId);const coordinator=j.config.coordinator,atlas=await recoverReviewRoleCredential({parentProof:f.proof,role:'atlas',sessionId:coordinator.sessionId},deps());expect(atlas.status).toBe('ok')
  const cmd=evidence(j),lossyApply={...actual,apply:async(...a:Parameters<typeof actual.apply>)=>{await actual.apply(...a);throw Error('response_lost')}}
  const request={workId:j.workId,role:'atlas' as const,sessionId:coordinator.sessionId,credential:atlas.credential,command:cmd}
  expect((await applyReviewStorageCommand(request,{store:lossyApply})).status).toBe('unavailable')
  const replay=await applyReviewStorageCommand(request,deps());expect(replay.status).toBe('replayed');expect(replay.reviewerCredential).toBeNull();j=db.read(j.workId);expect(j.version).toBe(1)
  const reviewer=storageActor(j,'reviewer'),recovered=await recoverReviewRoleCredential({parentProof:f.proof,role:'reviewer',sessionId:reviewer.sessionId},deps());expect(recovered.status).toBe('ok')
  expect((await send(j,'reviewer',recovered.credential,reportCommand(j))).status).toBe('ok');expect(db.read(j.workId).version).toBe(2)
 },120000)
 it('rejects stale scope/evidence and late results while retaining exact stopped replay',async()=>{
  const f=await boot(),atlas=f.initial.credentials!.atlas,first=evidence(f.job),frozen=await send(f.job,'atlas',atlas,first);expect(frozen.status).toBe('ok');let j=db.read(f.job.workId)
  for(const mutated of [{...first,id:'bad-floor',snapshotInput:{...first.snapshotInput,checks:first.snapshotInput.checks.map(c=>({...c,passedTestCount:0}))}},{...first,id:'missing-artifact',snapshotInput:{...first.snapshotInput,artifacts:first.snapshotInput.artifacts.filter(a=>a.id!=='after')}},{...first,id:'wrong-project',projectId:'foreign'}])expect((await send(j,'atlas',atlas,mutated)).result).toBeNull()
  db.sql('select public.atlas_code_work_cancel('+[q(j.workId)+'::uuid',q(j.projectId)+'::uuid',q(f.owner)+'::uuid',q('user_cancel')].join(',')+');','service_role')
  expect((await send(j,'reviewer',frozen.reviewerCredential,reportCommand(j))).result).toBeNull()
  const replay=await send(j,'atlas',atlas,first);expect(replay.status).toBe('replayed');expect(replay.result!.productionAuthority).toBe(false);expect(db.read(j.workId)).toEqual(j)
  const denied=await readReviewStorageForOperator('foreign',j.workId,{store:deps().store,access:async()=>({ok:true,allowedProjectIds:[j.projectId]})});expect(denied.view).toBeNull()
 },60000)
})
