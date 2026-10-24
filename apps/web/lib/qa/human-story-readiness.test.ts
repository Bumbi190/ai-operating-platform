import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {assertWorkflowActionReady} from '../workflows/action-run';
import {findVendoredDefinition} from '../workflows/definitions';
import {computeWorkflowActionTarget} from '../workflows/action-target';
import {findAdapter} from '../workflows/adapters/registry';
import {composeMonthlyBrief,computeMonthlyBriefHash} from '../workflows/brief/compose';
import {readStoryRequirements} from '../workflows/story/requirements';
import {buildStoryPromptContract,computeStoryPromptHash} from '../workflows/story/prompt';
import {humanStoryTargetHash} from '../workflows/story/human-scope';
import {executeWorkflowAction} from '../workflows/action-executor';
import {computeExecutionAuthorizationTarget} from '../workflows/effect/execution-authorization';
const authority=vi.hoisted(()=>vi.fn(async()=>({valid:true})));
const offline=vi.hoisted(()=>({fx:10.5,reserved:vi.fn(),sent:vi.fn(),evidence:vi.fn()}));
vi.mock('../cost/rates',()=>({getRates:async()=>({usd_sek:offline.fx})}));
vi.mock('../cost/track',()=>({logLlmCost:vi.fn(async()=>{})}));
vi.mock('../cost/governed-spend',async original=>({...await original<typeof import('../cost/governed-spend')>(),
 withGovernedSpend:async(input:unknown,fn:()=>Promise<unknown>)=>{offline.reserved(input);return fn();}}));
vi.mock('../governance/run-execution-checkpoint',async original=>({...await original<typeof import('../governance/run-execution-checkpoint')>(),checkpointClaimedRun:async()=>({allowed:true})}));
vi.mock('../governance/execution-signal',async original=>({...await original<typeof import('../governance/execution-signal')>(),
 admitPhysicalRequest:async()=>{},watchExecutionAuthority:()=>({signal:new AbortController().signal,dispose(){},authorityUnavailable:false,abortReason:null})}));
vi.mock('../workflows/store',async original=>({...await original<typeof import('../workflows/store')>(),recordEvidence:async(...args:unknown[])=>{offline.evidence(...args);return {};}}));
vi.mock('@anthropic-ai/sdk',()=>({default:class{
 messages={create:async()=>{offline.sent();return {content:[{type:'text',text:JSON.stringify({title:'Nova och vinden',pages:Array.from({length:18},(_,i)=>({page_number:i+1,role:i===0?'cover':i===17?'closing':'content',text:i===0?'Nova och vinden':i===17?'God natt, Nova.':'Nova tittade ut. Pling blinkade.'}))})}],usage:{input_tokens:100,output_tokens:200}};}};
}}));
vi.mock('../workflows/effect/execution-authorization-runtime',()=>({assertExecutionAuthorized:authority}));
const def=findVendoredDefinition('familje-stunden.monthly-release',2)!;
let rows:Record<string,any[]>,run:any;
function fixture(){
 const instance={id:'instance',def_id:'definition',project_id:'project',def_key:def.def_key,def_version:2,def_hash:def.def_hash,instance_key:'2026-11',current_state:'content_generation',status:'active'};
 const action=computeWorkflowActionTarget({instance:instance as never,spec:def.spec,state:'content_generation',actionKind:'generate_monthly_story',actionClass:'FINANCIAL',sideEffectTarget:null,evidence:[],declaredCheckKeys:findAdapter(def.def_key)!.attestableChecks().filter(c=>c.state==='content_generation').map(c=>c.check_key)});
 const brief=composeMonthlyBrief(def.spec.canonical,instance.instance_key,{defKey:def.def_key,defVersion:2}),rules=readStoryRequirements(def.spec.canonical);
 const prompt=buildStoryPromptContract({brief,storyContractVersion:rules.storyContractVersion,characterRefs:rules.characterRefs,maxContentSentences:rules.maxContentSentences,targetSentencesMin:rules.targetSentencesMin,targetSentencesMax:rules.targetSentencesMax});
 const target=humanStoryTargetHash({actionTargetHash:action.versionHash,briefHash:computeMonthlyBriefHash(brief),promptHash:computeStoryPromptHash(prompt),maximumSek:'7.0000'});
 run={id:'run',project_id:'project',status:'running',claim_id:'claim',attempts:1,max_attempts:1,idempotency_key:'identity',workflow_def_hash:def.def_hash,workflow_instance_id:'instance',workflow_from_state:'content_generation',action_kind:'generate_monthly_story',action_class:'FINANCIAL',authorization_id:'authorization',attempt_group:'request',human_story_request_id:'request',target_version_hash:target};
 const execution=computeExecutionAuthorizationTarget({instanceId:instance.id,defKey:def.def_key,defVersion:2,defHash:def.def_hash,state:instance.current_state,actionKind:'generate_monthly_story',actionClass:'FINANCIAL',targetVersionHash:target,attemptGroup:'request'});
 const event={authorization_id:'authorization',project_id:'project',principal_id:'owner',authority_basis:'founder_owner',action_kind:'workflow.action.execute',authority_description:'fixture',target_type:execution.targetType,target_id:execution.targetId,target_version_hash:execution.versionHash,conditions:[],evidence:[],superseded_by:null,reason:null};
 rows={runs:[run],workflow_instances:[instance],workflow_defs:[{id:'definition',def_key:def.def_key,version:2,def_hash:def.def_hash,spec:def.spec}],projects:[{id:'project',owner_id:'owner',execution_paused:false}],workflow_evidence:[],
 workflow_human_story_requests:[{id:'request',instance_id:'instance',project_id:'project',def_hash:def.def_hash,authorization_id:'authorization',provider:'anthropic',model:'claude-sonnet-4-6',max_tokens:4096,maximum_sek:7,target_version_hash:target}],
 workflow_human_story_approvals:[{request_id:'request',run_id:'run',human_principal:'owner'}],workflow_stories:[],atlas_authorizations:[
  {...event,event_id:'requested',event_type:'requested',occurred_at:new Date(Date.now()-2000).toISOString(),expires_at:null},
  {...event,event_id:'granted',event_type:'granted',occurred_at:new Date(Date.now()-1000).toISOString(),expires_at:new Date(Date.now()+900000).toISOString()},
 ]};
 const db={from(table:string){let columns='*';const predicates:Record<string,unknown>={},q:any={};
  let patch:any=null,inserted:any=null;
  q.select=(s:string)=>{columns=s;return q};q.eq=(k:string,v:unknown)=>{predicates[k]=v;return q};q.order=q.limit=()=>q;
  q.update=(value:unknown)=>{patch=value;return q};q.insert=(value:any)=>{inserted={id:'story',...value};rows[table].push(inserted);return q};
  const found=()=>rows[table].filter((r:any)=>Object.entries(predicates).every(([k,v])=>r[k]===v));
  const one=()=>({data:inserted??(found()[0]?columns==='*'?found()[0]:Object.fromEntries(columns.split(',').map(c=>c.trim()).map(c=>[c,found()[0][c]])):null),error:null});
  q.single=q.maybeSingle=async()=>one();q.then=(ok:any)=>{const data=found();if(patch)data.forEach((row:any)=>Object.assign(row,patch));return Promise.resolve({data,error:null,count:data.length}).then(ok);};return q;}};
 return db;
}
beforeEach(()=>{vi.stubEnv('H1_SPEND_GATE','1');vi.stubEnv('H1_FINANCIAL_EXECUTION','1');authority.mockReset();authority.mockResolvedValue({valid:true});offline.fx=10.5;offline.reserved.mockClear();offline.sent.mockClear();offline.evidence.mockClear();});
afterEach(()=>vi.unstubAllEnvs());
it('verifies the real combined target and forwards only the human-approved cap',async()=>{
 const db=fixture();expect(await assertWorkflowActionReady(db,'run')).toMatchObject({ready:true,approvedStoryMaximumSek:7});
 expect(authority).not.toHaveBeenCalled(); // no browser-principal seam in a worker
});
it.each(['model','maximum_sek','target_version_hash','authorization_id'])('refuses mutated persisted scope: %s',async field=>{
 const db=fixture();rows.workflow_human_story_requests[0][field]=field==='maximum_sek'?8:'changed';
 expect(await assertWorkflowActionReady(db,'run')).toMatchObject({ready:false,terminal:true,blockers:expect.arrayContaining(['target_drifted'])});
});
it('refuses a missing human attestation and ownership drift',async()=>{
 const db=fixture();rows.workflow_human_story_approvals=[];expect((await assertWorkflowActionReady(db,'run')).ready).toBe(false);
 fixture();rows.projects[0].owner_id='other';expect((await assertWorkflowActionReady(db,'run')).ready).toBe(false);
});
it('still refuses revoked execution authority even with intact human provenance',async()=>{
 const db=fixture();rows.atlas_authorizations.push({...rows.atlas_authorizations[1],event_id:'revoked',event_type:'revoked',occurred_at:new Date().toISOString(),expires_at:null});
 expect(await assertWorkflowActionReady(db,'run')).toMatchObject({ready:false,blockers:expect.arrayContaining(['authorization_not_effective'])});
});
it.each(['expired','missing','wrong_target','conditional'])('refuses live ledger authority failure without a session: %s',async failure=>{
 const db=fixture();
 if(failure==='expired')rows.atlas_authorizations[1].expires_at=new Date(Date.now()-1).toISOString();
 if(failure==='missing')rows.atlas_authorizations.pop();
 if(failure==='wrong_target')rows.atlas_authorizations.forEach(r=>r.target_version_hash='d'.repeat(64));
 if(failure==='conditional')rows.atlas_authorizations[1].event_type='granted_with_conditions';
 expect(await assertWorkflowActionReady(db,'run')).toMatchObject({ready:false,blockers:expect.arrayContaining(['authorization_not_effective'])});
});
it('runs the real executor, story handler and provider wrapper through one offline reservation',async()=>{
 const db=fixture();const result=await executeWorkflowAction(db,run,'claim',new Date().toISOString());
 expect(result).toMatchObject({executed:true,outcome:'SUCCEEDED'});
 expect(offline.reserved).toHaveBeenCalledTimes(1);expect(offline.reserved).toHaveBeenCalledWith(expect.objectContaining({provider:'anthropic',idempotencyKey:'identity'}));
 expect(offline.sent).toHaveBeenCalledTimes(1);expect(offline.evidence).toHaveBeenCalled();
});
it('a higher live price refuses before reservation and never becomes ambiguous',async()=>{
 const db=fixture();offline.fx=21;
 const result=await executeWorkflowAction(db,run,'claim',new Date().toISOString());
 expect(result.outcome).not.toBe('UNKNOWN');expect(run.reconciliation_required).toBe(false);
 expect(offline.reserved).not.toHaveBeenCalled();expect(offline.sent).not.toHaveBeenCalled();
});
it('evidence drift refuses at the real executor before provider or reservation',async()=>{
 const db=fixture();rows.workflow_evidence.push({id:'drift',instance_id:'instance',state:'content_generation',check_key:'story_generated',source:'automated',result:'pass',recorded_at:new Date().toISOString(),detail:{}});
 expect(await executeWorkflowAction(db,run,'claim',new Date().toISOString())).toMatchObject({executed:false,refusal:'not_ready'});
 expect(offline.reserved).not.toHaveBeenCalled();expect(offline.sent).not.toHaveBeenCalled();
});
