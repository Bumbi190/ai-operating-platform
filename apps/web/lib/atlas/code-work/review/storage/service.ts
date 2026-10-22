import 'server-only'
import {randomUUID} from 'node:crypto'
import {canonicalTargetVersionHash as pin} from '../../../authorization/build'
import {exact,ensure,freeze,id,jsonCopy,requireValid} from '../validation'
import type {ReviewRole,ReviewAssignmentV1} from '../types'
import {issueReviewRoleCredential,hashReviewRoleCredential} from './credential'
import {createReviewStorageStore} from './store'
import {prepareReviewAppend,validateStoredReviewJob,storageContext,storageBinding,snapshotInputOf} from './prepare'
import {REVIEW_STORAGE_MAX_BYTES} from './types'
import type {CommandResult,ParentReviewProof,ReviewCredentialRow,ReviewRoleCredential,ReviewRoleView,ReviewStorageConfig,ReviewStorageStore,ReviewStorageCommand,StorageStatus,StoredReviewJobV1} from './types'
export interface ReviewStorageDeps {store?:ReviewStorageStore;now?:()=>number;uuid?:()=>string;random?:(n:number)=>Buffer}
const deps=(d:ReviewStorageDeps)=>({store:d.store??createReviewStorageStore(),now:d.now??(()=>Date.now()),uuid:d.uuid??randomUUID,random:d.random})
function proofShape(p:ParentReviewProof):void{
 exact(p,['workId','claimId','fence','brokerId','brokerHostId','brokerTokenHash'])
 for(const k of['workId','claimId','brokerId','brokerHostId']as const)id(p[k])
 ensure(Number.isSafeInteger(p.fence)&&p.fence>0&&/^[a-f0-9]{64}$/.test(p.brokerTokenHash),'parent_proof_invalid')
}
type InitResult={status:StorageStatus;job:StoredReviewJobV1|null;credentials:{atlas:ReviewRoleCredential;worker:ReviewRoleCredential}|null}
/** Trusted server bootstrap ONLY. No network/client principal or model is authorized by this export. */
export async function initializeReviewStorage(input:{parentProof:ParentReviewProof;config:unknown},options:ReviewStorageDeps={}):Promise<InitResult>{
 try{
  exact(input,['parentProof','config']);proofShape(input.parentProof);const d=deps(options),raw=jsonCopy(input.config,REVIEW_STORAGE_MAX_BYTES)
  ensure(!('coordinator'in raw)&&!('worker'in raw),'server_identity_required')
  const coordinator={actorId:d.uuid(),sessionId:d.uuid()},worker={actorId:d.uuid(),sessionId:d.uuid()}
  const config={...raw,coordinator,worker}as ReviewStorageConfig
  const job=requireValid(validateStoredReviewJob({workId:config.admission.workId,projectId:config.admission.projectId,version:0,config,candidates:[],messages:{workId:config.admission.workId,projectId:config.admission.projectId,entries:[]},commands:[]}))
  const existing=await d.store.read(job.workId)
  if(existing){
   const saved=requireValid(validateStoredReviewJob(existing)),{coordinator:_,worker:__,...fixed}=saved.config
   ensure(pin(fixed)===pin(raw),'bootstrap_conflict')
   await d.store.initialize(input.parentProof,saved.config,null)
   return{status:'replayed',job:saved,credentials:null}
  }
  const atlas=issueReviewRoleCredential(job.workId,'atlas',coordinator.sessionId,d.random),codeWorker=issueReviewRoleCredential(job.workId,'worker',worker.sessionId,d.random)
  const roles:ReviewCredentialRow[]=[{role:'atlas',...coordinator,tokenHash:atlas.tokenHash,candidateVersion:0},{role:'worker',...worker,tokenHash:codeWorker.tokenHash,candidateVersion:0}]
  const saved=requireValid(validateStoredReviewJob(await d.store.initialize(input.parentProof,job.config,roles)))
  return{status:'ok',job:saved,credentials:{atlas:atlas.credential,worker:codeWorker.credential}}
 }catch{return{status:'unavailable',job:null,credentials:null}}
}
type RoleInput={workId:string;role:ReviewRole;sessionId:string;credential:unknown}
async function authenticate(input:RoleInput,d:ReturnType<typeof deps>){
 id(input.workId);id(input.sessionId)
 const tokenHash=hashReviewRoleCredential(input.workId,input.role,input.sessionId,input.credential)
 ensure(tokenHash,'credential_invalid')
 const actor=await d.store.authenticate(input.workId,input.role,input.sessionId,tokenHash)
 ensure(actor.role===input.role&&actor.sessionId===input.sessionId,'credential_actor_mismatch')
 return{actor:{role:actor.role,actorId:actor.actorId,sessionId:actor.sessionId},tokenHash}
}
export async function applyReviewStorageCommand(input:RoleInput&{command:unknown},options:ReviewStorageDeps={}):Promise<{status:StorageStatus;result:CommandResult|null;reviewerCredential:ReviewRoleCredential|null}>{
 try{
  exact(input,['workId','role','sessionId','credential','command']);const d=deps(options),auth=await authenticate(input,d)
  const observation=await d.store.observe(input.workId),job=requireValid(validateStoredReviewJob(observation.job))
  ensure(job.workId===input.workId,'work_scope_mismatch')
  let command=jsonCopy(input.command,REVIEW_STORAGE_MAX_BYTES)as ReviewStorageCommand,newReviewer:ReviewCredentialRow|null=null,reviewerCredential:ReviewRoleCredential|null=null
  if(command.kind==='freeze'){
   ensure(auth.actor.role==='atlas','freeze_role_forbidden');exact(command,['id','kind','snapshotInput'])
   const raw=command.snapshotInput
   exact(raw,['schema','candidateVersion','briefArtifactId','files','diffArtifactId','diffBytes','checks','artifacts'])
   const prior=job.commands.find(r=>r.id===command.id)
   let assignment:ReviewAssignmentV1
   if(prior){
    ensure(prior.kind==='freeze','command_id_conflict')
    const saved=job.candidates.find(c=>c.version===prior.candidateVersion);ensure(saved,'candidate_missing');assignment=saved.snapshot.assignment
   }else{
    const reviewer={actorId:d.uuid(),sessionId:d.uuid()}
    assignment={workId:job.workId,projectId:job.projectId,coordinator:job.config.coordinator,worker:job.config.worker,reviewer,claim:{id:d.uuid(),fence:1,expiresAt:new Date(Math.min(job.config.deadlineMs,job.config.authorizationExpiresAtMs)).toISOString()},policyHash:job.config.policyHash}
    const issued=issueReviewRoleCredential(job.workId,'reviewer',reviewer.sessionId,d.random)
    newReviewer={role:'reviewer',...reviewer,tokenHash:issued.tokenHash,candidateVersion:raw.candidateVersion};reviewerCredential=issued.credential
   }
   const context=storageContext(job,assignment,job.config.createdAtMs,true)
   command={...command,snapshotInput:{...raw,binding:storageBinding(context),assignment}}
  }
  const p=requireValid(prepareReviewAppend(job,command,auth.actor,{nowMs:observation.nowMs,parentLive:observation.parentLive}))
  if(command.kind==='freeze'){
   const cv=command.snapshotInput.candidateVersion,s=p.next.candidates.find(c=>c.version===cv);ensure(s,'candidate_missing')
   command={...command,snapshotInput:snapshotInputOf(s.snapshot)}
  }
  const result=await d.store.apply({workId:job.workId,role:auth.actor.role,sessionId:auth.actor.sessionId,tokenHash:auth.tokenHash,expectedVersion:p.expectedVersion,command,commandHash:p.commandHash,next:p.next,newReviewer:p.outcome==='replayed'?null:newReviewer})
  ensure(result.commandId===p.commandId&&result.productionAuthority===false&&['appended','replayed'].includes(result.outcome),'store_result_invalid')
  return{status:result.outcome==='replayed'?'replayed':'ok',result,reviewerCredential:result.outcome==='appended'?reviewerCredential:null}
 }catch{return{status:'unavailable',result:null,reviewerCredential:null}}
}
export async function recoverReviewRoleCredential(input:{parentProof:ParentReviewProof;role:ReviewRole;sessionId:string},options:ReviewStorageDeps={}):Promise<{status:StorageStatus;credential:ReviewRoleCredential|null}>{
 try{
  exact(input,['parentProof','role','sessionId']);proofShape(input.parentProof);id(input.sessionId)
  const d=deps(options),issued=issueReviewRoleCredential(input.parentProof.workId,input.role,input.sessionId,d.random)
  await d.store.rotate(input.parentProof.workId,input.parentProof,input.role,input.sessionId,issued.tokenHash)
  return{status:'ok',credential:issued.credential}
 }catch{return{status:'unavailable',credential:null}}
}
export async function readReviewStorageForRole(input:RoleInput,options:ReviewStorageDeps={}):Promise<{status:StorageStatus;view:ReviewRoleView|null}>{
 try{
  exact(input,['workId','role','sessionId','credential']);const d=deps(options),auth=await authenticate(input,d)
  const v=jsonCopy(await d.store.readForRole(input.workId,input.role,input.sessionId,auth.tokenHash),REVIEW_STORAGE_MAX_BYTES)
  exact(v,['workId','projectId','role','candidate','messages']);ensure(v.workId===input.workId&&v.role===input.role,'role_view_mismatch')
  if(v.candidate!==null)exact(v.candidate,['version','snapshot','preliminary','final'])
  return{status:'ok',view:freeze(v as ReviewRoleView)}
 }catch{return{status:'unavailable',view:null}}
}
