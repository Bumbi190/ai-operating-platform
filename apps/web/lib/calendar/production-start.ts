import 'server-only';
import {CalendarError,type AdminDb,type CalendarActor,type CalendarDb} from './types';
import {readCalendarProductionPreview} from './production-preview';
import {readInstance,listEvidence,readDefinitionById} from '../workflows/store';
import {computeWorkflowActionTarget} from '../workflows/action-target';
import {computeDefHash} from '../workflows/spec';
import {findVendoredDefinition} from '../workflows/definitions';
import {findAdapter} from '../workflows/adapters/registry';
import {composeMonthlyBrief,computeMonthlyBriefHash} from '../workflows/brief/compose';
import {buildStoryPromptContract,computeStoryPromptHash} from '../workflows/story/prompt';
import {readStoryRequirements} from '../workflows/story/requirements';
import {STORY_MODEL,STORY_PROVIDER,STORY_MAX_TOKENS} from '../workflows/story/dispatch-contract';
import {ceilToLedgerScale,tokenWindowCeiling} from '../cost/spend-ceiling';
import {getRates} from '../cost/rates';
import {isSpendGateEnforced} from '../cost/spend-gate-flag';
import {isFinancialExecutionEnabled} from '../governance/financial-execution-flag';
import {resolveExecutionStop} from '../governance/execution-stop';
import type {StoryJobReview,StoryJobReceipt} from './production-start-types';

export class StoryStartError extends Error{constructor(readonly reason:'not_ready'|'configuration'|'changed'|'expired'|'unavailable'){super(reason);}}
// Additive migration not yet present in the generated Supabase schema. Keep
// this transport cast confined to its new tables/RPCs.
type HumanStoryDb={from:(table:string)=>any;rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:any;error:{code?:string}|null}>};
type RequestRow={id:string;project_id:string;instance_id:string;requested_by:string;authorization_id:string;target_version_hash:string;action_target_hash:string;brief_hash:string;prompt_hash:string;maximum_sek:number;expires_at:string};
async function assertEnabled(db:AdminDb,projectId:string){
 if(!isSpendGateEnforced()||!isFinancialExecutionEnabled())throw new StoryStartError('configuration');
 const stop=await resolveExecutionStop(db,{context:'OPERATOR_EXECUTION',projectId});
 if(!stop.allowed)throw new StoryStartError('not_ready');
}
async function snapshot(db:AdminDb,actor:CalendarActor,projectId:string,instanceId:string){
 const preview=await readCalendarProductionPreview(db,actor,{projectId,instanceId});
 if(!preview.brief||preview.requirements.some(r=>!['execution_approval','budget_check'].includes(r)))throw new StoryStartError('not_ready');
 await assertEnabled(db,projectId);
 const instance=await readInstance(db,instanceId);
 if(!instance||instance.project_id!==projectId||instance.status!=='active'||instance.current_state!=='content_generation')throw new StoryStartError('changed');
 const def=await readDefinitionById(db,instance.def_id),canonical=findVendoredDefinition(instance.def_key,instance.def_version);
 if(!canonical||canonical.version!==2||canonical.def_hash!==instance.def_hash||def.def_hash!==instance.def_hash||computeDefHash(def.spec)!==canonical.def_hash)throw new StoryStartError('changed');
 const evidence=await listEvidence(db,instanceId);
 const action=computeWorkflowActionTarget({instance,spec:def.spec,state:instance.current_state,actionKind:'generate_monthly_story',actionClass:'FINANCIAL',sideEffectTarget:null,evidence,
  declaredCheckKeys:findAdapter(instance.def_key)!.attestableChecks().filter(c=>c.state===instance.current_state).map(c=>c.check_key)});
 const brief=composeMonthlyBrief(def.spec.canonical,instance.instance_key,{defKey:instance.def_key,defVersion:2});
 const rules=readStoryRequirements(def.spec.canonical);
 const prompt=buildStoryPromptContract({brief,storyContractVersion:rules.storyContractVersion,characterRefs:rules.characterRefs,maxContentSentences:rules.maxContentSentences,targetSentencesMin:rules.targetSentencesMin,targetSentencesMax:rules.targetSentencesMax});
 return {preview,instance,actionHash:action.versionHash,briefHash:computeMonthlyBriefHash(brief),promptHash:computeStoryPromptHash(prompt)};
}
async function ownedRequest(db:AdminDb,actor:CalendarActor,requestId:string):Promise<RequestRow>{
 if(actor.projectScopeAvailable===false)throw new CalendarError('UNAVAILABLE');
 const {data,error}=await (db as unknown as HumanStoryDb).from('workflow_human_story_requests').select('*').eq('id',requestId).eq('requested_by',actor.userId).maybeSingle();
 if(error)throw new StoryStartError('unavailable');
 if(!data||!actor.allowedProjectIds.includes(data.project_id))throw new CalendarError('NOT_FOUND');
 const owner=await db.from('projects').select('id').eq('id',data.project_id).eq('owner_id',actor.userId).maybeSingle();
 if(owner.error)throw new StoryStartError('unavailable');
 if(!owner.data)throw new CalendarError('NOT_FOUND');
 return data;
}
export async function readStoryJobReceipt(db:AdminDb,actor:CalendarActor,requestId:string,replayed=true):Promise<StoryJobReceipt|null>{
 const request=await ownedRequest(db,actor,requestId);
 const proof=await (db as unknown as HumanStoryDb).from('workflow_human_story_approvals').select('run_id').eq('request_id',request.id).maybeSingle();
 if(proof.error)throw new StoryStartError('unavailable');if(!proof.data)return null;
 const run=await db.from('runs').select('id,status,action_phase,action_outcome,reconciliation_required').eq('id',proof.data.run_id).eq('project_id',request.project_id).maybeSingle();
 if(run.error||!run.data)throw new StoryStartError('unavailable');
 const r=run.data;
 const status:StoryJobReceipt['status']=r.reconciliation_required||['UNKNOWN','PARTIAL','SUCCEEDED_EVIDENCE_PENDING'].includes(r.action_outcome??'')?'needs_review'
  :r.status==='pending'?'pending':r.status==='running'?'running':r.action_outcome==='SUCCEEDED'&&['done','completed'].includes(r.status)?'succeeded'
  :r.action_outcome==='CANCELLED'?'cancelled':['FAILED','REJECTED'].includes(r.action_outcome??'')?'failed':'needs_review';
 return {requestId:request.id,runId:r.id,status,replayed};
}
export async function latestStoryJobReceipt(db:AdminDb,actor:CalendarActor,projectId:string,instanceId:string):Promise<StoryJobReceipt|null>{
 // Read-only discovery also works after the workflow has advanced/closed.
 if(actor.projectScopeAvailable===false)throw new CalendarError('UNAVAILABLE');
 if(!actor.allowedProjectIds.includes(projectId))throw new CalendarError('NOT_FOUND');
 const owner=await db.from('projects').select('id').eq('id',projectId).eq('owner_id',actor.userId).maybeSingle();
 if(owner.error)throw new StoryStartError('unavailable');if(!owner.data)throw new CalendarError('NOT_FOUND');
 const {data,error}=await (db as unknown as HumanStoryDb).from('workflow_human_story_requests')
  .select('id, workflow_human_story_approvals!inner(run_id)').eq('project_id',projectId).eq('instance_id',instanceId).eq('requested_by',actor.userId)
  .order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(error)throw new StoryStartError('unavailable');
 return data?readStoryJobReceipt(db,actor,data.id):null;
}
export async function prepareStoryJob(db:AdminDb,actor:CalendarActor,input:{projectId:string;instanceId:string;requestKey:string}):Promise<StoryJobReview>{
 const s=await snapshot(db,actor,input.projectId,input.instanceId);
 const ceiling=tokenWindowCeiling(STORY_MODEL,STORY_MAX_TOKENS,await getRates());
 if(!ceiling.ok)throw new StoryStartError('unavailable');
 const maximum=ceilToLedgerScale(ceiling.sek);
 if(!Number.isFinite(maximum)||maximum<=0||maximum>1000)throw new StoryStartError('unavailable');
 const {data,error}=await (db as unknown as HumanStoryDb).rpc('prepare_human_story_request',{p_instance_id:s.instance.id,p_requested_by:actor.userId,p_request_key:input.requestKey,
  p_action_target_hash:s.actionHash,p_brief_hash:s.briefHash,p_prompt_hash:s.promptHash,p_maximum_sek:maximum});
 if(error)throw new StoryStartError('unavailable');
 const row=Array.isArray(data)?data[0]:data;if(!row)throw new StoryStartError('unavailable');
 if(row.instance_id!==s.instance.id||row.requested_by!==actor.userId||row.action_target_hash!==s.actionHash||row.brief_hash!==s.briefHash||row.prompt_hash!==s.promptHash)throw new StoryStartError('changed');
 return {requestId:row.id,reviewedHash:row.target_version_hash,expiresAt:row.expires_at,provider:STORY_PROVIDER,model:row.model,maximumSek:Number(row.maximum_sek).toFixed(4),
  month:s.preview.brief!.month,theme:s.preview.brief!.theme,receipt:await readStoryJobReceipt(db,actor,row.id)};
}
export async function approveStoryJob(db:AdminDb,sessionDb:CalendarDb,actor:CalendarActor,input:{requestId:string;reviewedHash:string}):Promise<StoryJobReceipt>{
 const request=await ownedRequest(db,actor,input.requestId);
 if(request.target_version_hash!==input.reviewedHash)throw new StoryStartError('changed');
 // Lost response or terminal replay retrieves the SAME receipt. No fresh bind.
 const existing=await readStoryJobReceipt(db,actor,input.requestId);if(existing)return existing;
 const s=await snapshot(db,actor,request.project_id,request.instance_id);
 if(s.actionHash!==request.action_target_hash||s.briefHash!==request.brief_hash||s.promptHash!==request.prompt_hash)throw new StoryStartError('changed');
 if(Date.now()>=Date.parse(request.expires_at))throw new StoryStartError('expired');
 const current=tokenWindowCeiling(STORY_MODEL,STORY_MAX_TOKENS,await getRates());
 if(!current.ok||ceilToLedgerScale(current.sek)>Number(request.maximum_sek))throw new StoryStartError('changed');
 const {error}=await (sessionDb as unknown as HumanStoryDb).rpc('approve_and_start_human_story',{p_request_id:request.id,p_reviewed_hash:input.reviewedHash,p_current_action_hash:s.actionHash});
 if(error)throw new StoryStartError(error.code==='22023'?'changed':error.code==='55000'?'not_ready':'unavailable');
 const receipt=await readStoryJobReceipt(db,actor,request.id,false);if(!receipt)throw new StoryStartError('unavailable');
 return receipt;
}
