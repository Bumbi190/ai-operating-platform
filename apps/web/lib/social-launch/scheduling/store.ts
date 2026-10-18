import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {SocialLaunchPrincipal} from '../types'
import type {PublicationAction,PublicationRecord,PublicationStep} from '../publication/types'
import {contentFields,contentId} from '../content/validate'
import {validateManifest} from './manifest'
import {ScheduleError,type ScheduleManifest,type ScheduleBatchView,type ScheduleClaim,type ApprovedScheduleSnapshot,type MonthlyRule,type QueueState} from './types'
type Db=ReturnType<typeof createAdminClient>
export type ScheduleWorkspaceView={projectId:string;batches:ScheduleBatchView[];monthlyRule:MonthlyRule|null;releaseEvidence:{id:string;releaseMonth:string;catalogSha256:string;kind:'owner_verified_access';verifiedAt:string}[]}
export type ScheduleStep={action:PublicationAction|'prepare'|'checkpoint';expectedVersion?:number;reason?:'release_required'|'stopped'|'review_required'|'disabled'|'budget_exhausted'}&Partial<Pick<PublicationStep,'capabilityHash'|'containerId'|'providerId'|'permalink'|'failureCode'>>
export type ScheduleStepResult={claim:ScheduleClaim;publication:PublicationRecord|null;jobState:QueueState}
function fields(v:unknown,keys:string[]){try{contentFields(v,keys)}catch{throw new ScheduleError('INVALID_BODY')}}
function id(v:unknown){try{contentId(v)}catch{throw new ScheduleError('INVALID_BODY')}}
function key(v:unknown){if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(v))throw new ScheduleError('INVALID_BODY')}
async function rpc<T>(db:Db,name:string,args:Record<string,unknown>):Promise<T>{
 const {data,error}=await (db as any).rpc(name,args)
 if(error)throw new ScheduleError(error.code==='P0002'||error.code==='42501'?'NOT_FOUND':error.code==='23505'?'CONFLICT':error.code?.startsWith('22')?'INVALID_BODY':(['INVALID_BODY','CONFLICT','REVIEW_REQUIRED','STOPPED','NOT_DUE','EXPIRED','RELEASE_REQUIRED','DISABLED'] as const).find(c=>(error.message??'').includes('SOCIAL_SCHEDULE_'+c))??((error.message??'').includes('SOCIAL_CONTENT_STOPPED')?'STOPPED':'UNAVAILABLE'))
 return data as T
}
function owner<T>(db:Db,p:SocialLaunchPrincipal,name:string,input:{projectId:string}&Record<string,unknown>){
 id(p.userId);id(input.projectId);if(!p.allowedProjectIds.includes(input.projectId))throw new ScheduleError('NOT_FOUND')
 return rpc<T>(db,name,{p_principal:p,p_input:input})
}
export function readSchedules(db:Db,p:SocialLaunchPrincipal,input:{projectId:string}){
 fields(input,['projectId']);return owner<ScheduleWorkspaceView>(db,p,'social_schedule_read',input)
}
export function proposeSchedule(db:Db,p:SocialLaunchPrincipal,input:{projectId:string;manifest:ScheduleManifest;expectedRevisionId:string|null;idempotencyKey:string}){
 fields(input,['projectId','manifest','expectedRevisionId','idempotencyKey']);key(input.idempotencyKey);if(input.expectedRevisionId!==null)id(input.expectedRevisionId)
 const manifest=validateManifest(input.manifest,new Date().toISOString());if(manifest.projectId!==input.projectId)throw new ScheduleError('INVALID_BODY')
 return owner<ScheduleBatchView>(db,p,'social_schedule_propose',{...input,manifest})
}
export function approveSchedule(db:Db,p:SocialLaunchPrincipal,input:{projectId:string;batchId:string;revisionId:string;sha256:string;confirmed:true;idempotencyKey:string}){
 fields(input,['projectId','batchId','revisionId','sha256','confirmed','idempotencyKey']);id(input.batchId);id(input.revisionId);key(input.idempotencyKey)
 if(input.confirmed!==true||!/^[a-f0-9]{64}$/.test(input.sha256))throw new ScheduleError('INVALID_BODY')
 return owner<ScheduleBatchView>(db,p,'social_schedule_approve',input)
}
export function revokeSchedule(db:Db,p:SocialLaunchPrincipal,input:{projectId:string;batchId:string;expectedVersion:number}){
 fields(input,['projectId','batchId','expectedVersion']);id(input.batchId);if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1)throw new ScheduleError('INVALID_BODY')
 return owner<ScheduleBatchView>(db,p,'social_schedule_revoke',input)
}
export function saveMonthlyRule(db:Db,p:SocialLaunchPrincipal,input:{projectId:string;rule:MonthlyRule}){
 fields(input,['projectId','rule']);fields(input.rule,['dayOfMonth','localTime','timeZone','channels','enabled'])
 if(input.rule.dayOfMonth!==1||input.rule.localTime!=='20:30'||input.rule.timeZone!=='Europe/Stockholm'||JSON.stringify(input.rule.channels)!=='["facebook","instagram"]'||typeof input.rule.enabled!=='boolean')throw new ScheduleError('INVALID_BODY')
 return owner<MonthlyRule>(db,p,'social_schedule_monthly_rule_save',input)
}
export function recordReleaseEvidence(db:Db,p:SocialLaunchPrincipal,input:{projectId:string;releaseMonth:string;catalogSha256:string;customerViewUrl:string;confirmed:true}){
 fields(input,['projectId','releaseMonth','catalogSha256','customerViewUrl','confirmed'])
 try{const u=new URL(input.customerViewUrl);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||input.customerViewUrl.length>2048||!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(input.releaseMonth)||!/^[a-f0-9]{64}$/.test(input.catalogSha256)||input.confirmed!==true)throw Error()}catch{throw new ScheduleError('INVALID_BODY')}
 return owner<ScheduleWorkspaceView['releaseEvidence'][number]>(db,p,'social_schedule_release_confirm',input)
}
export function enabledScheduleProjects(){
 if(process.env.SOCIAL_SCHEDULE_DISPATCH_ENABLED!=='true')return []
 const values=(process.env.SOCIAL_SCHEDULE_PROJECT_IDS??'').split(',').map(v=>v.trim()).filter(Boolean)
 if(values.length>100)return []
 try{values.forEach(id);return [...new Set(values)]}catch{return []}
}
export function scheduleDispatchEnabled(projectId:string){return enabledScheduleProjects().includes(projectId)}
function claimInput(claim:ScheduleClaim){id(claim.jobId);id(claim.claimId);if(!Number.isSafeInteger(claim.version)||claim.version<1)throw new ScheduleError('INVALID_BODY');return {jobId:claim.jobId,claimId:claim.claimId,version:claim.version}}
export function claimScheduleJob(db:Db,input:{workerId:string;now:string;dryRun:boolean}){
 fields(input,['workerId','now','dryRun']);key(input.workerId)
 if(!Number.isFinite(Date.parse(input.now))||typeof input.dryRun!=='boolean')throw new ScheduleError('INVALID_BODY')
 const projectIds=enabledScheduleProjects();if(!projectIds.length)return Promise.resolve(null)
 return rpc<ScheduleClaim|null>(db,'social_schedule_claim',{p_input:{...input,projectIds}})
}
export function checkScheduleWrite(db:Db,claim:ScheduleClaim){
 if(!scheduleDispatchEnabled(claim.snapshot.projectId))throw new ScheduleError('DISABLED')
 return rpc<ApprovedScheduleSnapshot&{releaseEvidenceId:string|null}>(db,'social_schedule_authorize_write',{p_claim:claimInput(claim),p_project_ids:enabledScheduleProjects()})
}
export function recordScheduleStep(db:Db,claim:ScheduleClaim,step:ScheduleStep){
 fields(step,['action','expectedVersion','capabilityHash','containerId','providerId','permalink','failureCode','reason'])
 return rpc<ScheduleStepResult>(db,'social_schedule_step',{p_claim:claimInput(claim),p_step:step})
}
export function readScheduleReceipt(db:Db,claim:Pick<ScheduleClaim,'jobId'>){id(claim.jobId);return rpc<ScheduleStepResult>(db,'social_schedule_receipt',{p_input:{jobId:claim.jobId}})}
export function peekScheduleJobs(db:Db,projectIds=enabledScheduleProjects()){
 projectIds.forEach(id);return rpc<{jobId:string|null;result:string}>(db,'social_schedule_peek',{p_input:{projectIds}})
}

export function recoverScheduleCheckpoint(db:Db,claim:ScheduleClaim){return rpc<ScheduleStepResult>(db,'social_schedule_recover_checkpoint',{p_claim:claimInput(claim)})}
