import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {prepareStoryJob,approveStoryJob,readStoryJobReceipt,latestStoryJobReceipt} from './production-start';
import {findVendoredDefinition} from '../workflows/definitions';
import {humanStoryTargetHash} from '../workflows/story/human-scope';
const boundary=vi.hoisted(()=>({allowed:true,fx:10.5}));
vi.mock('../governance/execution-stop',()=>({resolveExecutionStop:async()=>({allowed:boundary.allowed})}));
vi.mock('../cost/rates',()=>({getRates:async()=>({usd_sek:boundary.fx})}));
const def=findVendoredDefinition('familje-stunden.monthly-release',2)!,projectId='10000000-0000-4000-8000-000000000001',instanceId='60000000-0000-4000-8000-000000000001',requestId='40000000-0000-4000-8000-000000000001';
const actor={userId:'owner',allowedProjectIds:[projectId]},input={projectId,instanceId,requestKey:requestId};
let rows:Record<string,any[]>,db:any,session:any;
beforeEach(()=>{
 vi.stubEnv('H1_SPEND_GATE','1');vi.stubEnv('H1_FINANCIAL_EXECUTION','1');boundary.allowed=true;boundary.fx=10.5;
 rows={projects:[{id:projectId,owner_id:'owner',execution_paused:false}],workflow_instances:[{id:instanceId,def_id:'def',project_id:projectId,def_key:def.def_key,def_version:2,def_hash:def.def_hash,current_state:'content_generation',instance_key:'2026-11',status:'active'}],
  workflow_defs:[{id:'def',def_key:def.def_key,version:2,def_hash:def.def_hash,spec:def.spec}],workflow_evidence:[],workflow_human_story_requests:[],workflow_human_story_approvals:[],runs:[]};
 db={from(table:string){const q:any={},filters:Record<string,unknown>={};let inner=false;
  q.select=(s:string)=>{inner=s.includes('!inner');return q};q.eq=(k:string,v:unknown)=>{filters[k]=v;return q};q.order=q.limit=()=>q;
  const data=()=>rows[table].filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v)).filter(r=>!inner||rows.workflow_human_story_approvals.some(a=>a.request_id===r.id));
  q.single=q.maybeSingle=async()=>({data:data()[0]??null,error:null});q.then=(ok:any)=>Promise.resolve({data:data(),error:null}).then(ok);return q;},rpc:vi.fn(async(_name:string,args:any)=>{
   let row=rows.workflow_human_story_requests[0];
   if(!row){row={id:requestId,project_id:projectId,instance_id:instanceId,requested_by:args.p_requested_by,model:'claude-sonnet-4-6',maximum_sek:args.p_maximum_sek,
    action_target_hash:args.p_action_target_hash,brief_hash:args.p_brief_hash,prompt_hash:args.p_prompt_hash,expires_at:new Date(Date.now()+900000).toISOString(),
    target_version_hash:humanStoryTargetHash({actionTargetHash:args.p_action_target_hash,briefHash:args.p_brief_hash,promptHash:args.p_prompt_hash,maximumSek:Number(args.p_maximum_sek).toFixed(4)})};rows.workflow_human_story_requests.push(row);}
   return {data:[row],error:null};
  })};
 session={rpc:vi.fn(async()=>{rows.workflow_human_story_approvals.push({request_id:requestId,run_id:'run'});rows.runs.push({id:'run',project_id:projectId,status:'pending',action_outcome:null,reconciliation_required:false});return {data:[{run_id:'run'}],error:null};})};
});
afterEach(()=>vi.unstubAllEnvs());
it('prepares exact server-derived terms, then grants only through the user session',async()=>{
 const review=await prepareStoryJob(db,actor,input);expect(Number(review.maximumSek)).toBeGreaterThan(0);expect(session.rpc).not.toHaveBeenCalled();
 expect(db.rpc.mock.calls[0][1]).toMatchObject({p_requested_by:'owner',p_request_key:requestId});
 expect(await approveStoryJob(db,session,actor,{requestId,reviewedHash:review.reviewedHash})).toMatchObject({runId:'run',status:'pending'});
 expect(session.rpc).toHaveBeenCalledTimes(1);expect(session.rpc.mock.calls[0][0]).toBe('approve_and_start_human_story');
});
it.each(['H1_SPEND_GATE','H1_FINANCIAL_EXECUTION'])('does not prepare when %s is closed',async flag=>{
 vi.stubEnv(flag,'0');await expect(prepareStoryJob(db,actor,input)).rejects.toMatchObject({reason:'configuration'});expect(db.rpc).not.toHaveBeenCalled();
});
it('respects a global/project stop before requesting authority',async()=>{
 boundary.allowed=false;await expect(prepareStoryJob(db,actor,input)).rejects.toMatchObject({reason:'not_ready'});expect(db.rpc).not.toHaveBeenCalled();
});
it('refuses foreign owners before preparing',async()=>{
 rows.projects[0].owner_id='other';await expect(prepareStoryJob(db,actor,input)).rejects.toMatchObject({code:'NOT_FOUND'});expect(db.rpc).not.toHaveBeenCalled();
});
it.each(['price','evidence','expiry','review'])('refuses changed consent before the session grant: %s',async condition=>{
 const review=await prepareStoryJob(db,actor,input);
 if(condition==='price')boundary.fx*=2;
 if(condition==='evidence')rows.workflow_evidence.push({id:'new',instance_id:instanceId,state:'content_generation',check_key:'story_generated',source:'automated',result:'pass',recorded_at:new Date().toISOString(),detail:{}});
 if(condition==='expiry')rows.workflow_human_story_requests[0].expires_at=new Date(Date.now()-1000).toISOString();
 await expect(approveStoryJob(db,session,actor,{requestId,reviewedHash:condition==='review'?'d'.repeat(64):review.reviewedHash})).rejects.toBeDefined();expect(session.rpc).not.toHaveBeenCalled();
});
it('recovers the same terminal receipt after reload without another grant',async()=>{
 const review=await prepareStoryJob(db,actor,input);await approveStoryJob(db,session,actor,{requestId,reviewedHash:review.reviewedHash});
 rows.runs[0].status='completed';rows.runs[0].action_outcome='SUCCEEDED';rows.workflow_instances[0].current_state='approval_content';
 expect(await latestStoryJobReceipt(db,actor,projectId,instanceId)).toMatchObject({runId:'run',status:'succeeded'});
 expect(await approveStoryJob(db,session,actor,{requestId,reviewedHash:review.reviewedHash})).toMatchObject({runId:'run',status:'succeeded',replayed:true});
 expect(session.rpc).toHaveBeenCalledTimes(1);
});
it('never calls an uncertain completed job successful',async()=>{
 const review=await prepareStoryJob(db,actor,input);await approveStoryJob(db,session,actor,{requestId,reviewedHash:review.reviewedHash});
 Object.assign(rows.runs[0],{status:'completed',action_outcome:'SUCCEEDED',reconciliation_required:true});
 expect(await readStoryJobReceipt(db,actor,requestId)).toMatchObject({status:'needs_review'});
});
it('allows a new review only after a proven terminal result, never an unknown crashed job',async()=>{
 const review=await prepareStoryJob(db,actor,input);await approveStoryJob(db,session,actor,{requestId,reviewedHash:review.reviewedHash});
 Object.assign(rows.runs[0],{status:'failed',action_phase:'DISPATCH_STARTED',action_outcome:null});
 expect(await readStoryJobReceipt(db,actor,requestId)).toMatchObject({status:'needs_review'});
 rows.runs[0].action_outcome='FAILED';expect(await readStoryJobReceipt(db,actor,requestId)).toMatchObject({status:'failed'});
 rows.runs[0].action_outcome='SUCCEEDED_EVIDENCE_PENDING';expect(await readStoryJobReceipt(db,actor,requestId)).toMatchObject({status:'needs_review'});
});
