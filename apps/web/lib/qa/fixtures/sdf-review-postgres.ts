import {execFileSync,execFile} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {promisify} from 'node:util'
import {codeWorkAdmissionHash} from '@/lib/atlas/code-work/binding'
import {deriveCodeWorkProposal} from '@/lib/atlas/code-work/control-plane/derive-admission'
import {makeStorageJob} from './sdf-review-storage-fixture'
import {issueReviewRoleCredential} from '@/lib/atlas/code-work/review/storage/credential'
import {prepareReviewAppend,snapshotInputOf} from '@/lib/atlas/code-work/review/storage/prepare'
import type {ParentReviewProof,ReviewCredentialRow,ReviewStorageCommand,StorageActor,StoredReviewJobV1} from '@/lib/atlas/code-work/review/storage/types'
const docker=process.platform==='win32'?'docker.exe':'docker',execute=promisify(execFile)
export const migration='20261018185809_atlas_code_review_storage.sql'
export const q=(v:unknown)=>typeof v==='number'?String(v):v===null?'null':"'"+(typeof v==='string'?v:JSON.stringify(v)).replaceAll("'","''")+"'"+(typeof v==='object'?'::jsonb':'')
const run=(args:string[],input?:string)=>execFileSync(docker,args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:90000,maxBuffer:8*1024*1024}).trim()
export class ReviewPostgres {
 readonly name='omnira-review-'+randomUUID();started=false
 sql(sql:string,role:string|null=null):string{return run(['exec','-i',this.name,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],(role?'set role '+role+';\n':'')+sql)}
 async parallel(sqls:string[]):Promise<PromiseSettledResult<string>[]>{
  return Promise.allSettled(sqls.map(async sql=>{const child=execute(docker,['exec','-i',this.name,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024});child.child.stdin!.end('set role service_role;\n'+sql);return(await child).stdout.trim()}))
 }
 async start(includeMigration=true):Promise<void>{
  run(['run','--rm','-d','--pull=never','--network=none','--name',this.name,'--label','omnira.plan=atlas-review-storage','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16']);this.started=true
  for(let i=0;i<100;i++){try{if(run(['exec',this.name,'cat','/proc/1/comm'])!=='postgres')throw Error('initializing');this.sql('select 1;');break}catch{if(i===99)throw Error('owned_postgres_not_ready');await new Promise(r=>setTimeout(r,100))}}
  this.sql('create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;alter default privileges in schema public grant all on tables to anon,authenticated,service_role;alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;create table public.projects(id uuid primary key);create table public.agents(id uuid primary key);create table public.manager_tasks(id uuid primary key default gen_random_uuid(),project_id uuid references public.projects(id),title text not null default \'\',description text,status text not null default \'pending\',source text,source_key text,created_at timestamptz default now());')
  for(const f of ['20260819_atlas_authorizations.sql','20260820_manager_tasks_work_packages.sql','20260918095827_sdf1b1_code_work_control_plane.sql','20260923150000_sdf1c1_trusted_broker_identity.sql','20260924080000_sdf1c1b_broker_claim_credentials.sql','20260924140000_sdf1c2_broker_control_channel.sql',...(includeMigration?[migration]:[])])this.sql(readFileSync(join(process.cwd(),'supabase/migrations',f),'utf8'))
 }
 stop(){if(this.started){run(['rm','-f',this.name]);this.started=false}}
 createParent(){
  const j=makeStorageJob(),a=j.config.admission,workId=randomUUID(),projectId=randomUUID(),owner=randomUUID(),agent=randomUUID(),mission=randomUUID(),envelope=randomUUID(),wp=randomUUID(),auth=randomUUID(),broker=randomUUID(),host=randomUUID(),enrollment=randomUUID()
  Object.assign(a,{workId,projectId});a.governance.mission.id=mission;a.governance.delegation.envelopeId=envelope;a.governance.workPackage.id=wp;a.governance.authorizationTarget.targetId=workId
  const pkg:any={schema:'atlas.workpackage',schemaVersion:1,workPackageId:wp,projectId,parentMission:{missionId:mission,missionVersion:1,missionHash:a.governance.mission.hash},parentDelegation:{envelopeId:envelope,envelopeHash:a.governance.delegation.hash},assignedRole:{roleId:agent,role:'developer'},taskObjective:'Bounded review fixture',inputs:[],expectedOutput:[],authority:[{action:'code.worktree.prepare_and_patch'}],allowedActions:[{action:'code.worktree.prepare_and_patch'}],forbiddenActions:[],constraints:[],tools:[{tool:a.worker.capabilityId}],dataScope:[{resource:'repository:'+a.repository.repositoryId+':apps/web/lib',access:'read'},{resource:'repository:'+a.repository.repositoryId+':apps/web/lib/atlas/code-work',access:'write'}],budget:null,deadline:null,reporting:[],escalationTriggers:[],stopConditions:[],approvalGates:[],inScope:[],outOfScope:[],dependencies:[],fallback:null,packageVersion:1,packageHash:a.governance.workPackage.hash}
  // Use the real repository-resource helper grammar from the existing control-plane fixture.
  // Resource fields are replaced by the exported helper below.
  pkg.dataScope=[{resource:resource(a.repository.repositoryId,'apps/web/lib'),access:'read'},{resource:resource(a.repository.repositoryId,'apps/web/lib/atlas/code-work'),access:'write'}]
  Object.assign(pkg,{envelopeId:envelope,delegationBoundHash:a.governance.delegation.hash,missionId:mission,missionVersion:1,missionBoundHash:a.governance.mission.hash})
  const derived=deriveCodeWorkProposal({admission:a,workPackage:pkg,requestedBy:owner,idempotencyKey:'review-fixture-'+workId})
  if(!derived.ok)throw Error('fixture_admission:'+derived.violations.map(v=>v.code).join(','))
  j.config.admission=derived.value.admission;j.config.admissionHash=derived.value.admissionHash
  this.sql('insert into public.projects values('+q(projectId)+');insert into public.agents values('+q(agent)+');insert into public.manager_tasks(project_id,title,source,source_key,work_package_id,work_package,work_package_hash,delegation_envelope_id,delegation_bound_hash,mission_id,mission_version,mission_bound_hash,workforce_role_id,assigned_at) values('+[q(projectId),q('Review'),q('work_package'),q(wp),q(wp),q(pkg),q(a.governance.workPackage.hash),q(envelope),q(a.governance.delegation.hash),q(mission),'1',q(a.governance.mission.hash),q(agent),'clock_timestamp()'].join(',')+');')
  const v=derived.value
  this.sql('select public.atlas_code_work_propose('+[q(workId)+'::uuid',q(projectId)+'::uuid',q(owner)+'::uuid',q(v.proposalKeyHash),q(v.proposalFingerprintHash),q(v.admission),q(v.admissionHash),q(auth)+'::uuid',q(randomUUID())+'::uuid'].join(',')+');','service_role')
  this.sql('insert into public.atlas_authorizations(event_id,authorization_id,event_type,occurred_at,project_id,principal_id,authority_basis,action_kind,target_type,target_id,target_version_hash,conditions,evidence,expires_at) values('+[q(randomUUID()),q(auth),q('granted'),'clock_timestamp()',q(projectId),q(owner),q('founder_owner'),q('code.worktree.prepare_and_patch'),q('atlas.code_work_admission'),q(workId),q(v.admissionHash),"'[]'::jsonb","'[]'::jsonb","clock_timestamp()+interval '1 hour'"].join(',')+');')
  this.sql('select public.atlas_code_work_sync_authorization('+q(workId)+'::uuid);','service_role')
  // Real schema, synthetic identity: this is not a device enrollment/signature proof.
  this.sql('insert into public.atlas_code_broker_enrollments(enrollment_id,requested_by,host_id,challenge_hash,pairing_code_hash,allowed_repository_ids,state,expires_at) values('+[q(enrollment),q(owner),q(host),q(randomUUID().replaceAll('-','').repeat(2)),q(randomUUID().replaceAll('-','').repeat(2)),"array['github.com/bumbi190/ai-operating-platform']",q('revoked'),"clock_timestamp()+interval '1 hour'"].join(',')+');insert into public.atlas_code_brokers(broker_id,enrollment_id,owner_user_id,host_id,public_jwk,key_thumbprint,algorithm,protocol_version,broker_version,build_sha256,host_label,local_uid_hash,os_version,status,allowed_repository_ids,approved_at,approved_by) values('+[q(broker),q(enrollment),q(owner),q(host),q({kty:'EC',crv:'P-256',x:'a'.repeat(43),y:'b'.repeat(43)}),q(randomUUID().replaceAll('-','')+'a'.repeat(11)),q('ES256'),'1',q('1.0.0'),q('c'.repeat(64)),q('fixture'),q('d'.repeat(64)),q('Windows fixture'),q('active'),"array['github.com/bumbi190/ai-operating-platform']",'clock_timestamp()',q(owner)].join(',')+');')
  const brokerTokenHash='e'.repeat(64)
  const row=JSON.parse(this.sql('select to_jsonb(public.atlas_code_work_claim('+[q(workId)+'::uuid',q(broker),q(host),q(brokerTokenHash)].join(',')+'));','service_role'))
  const now=Number(this.sql('select floor(extract(epoch from clock_timestamp())*1000)::bigint;'))
  const proof:ParentReviewProof={workId,claimId:row.claim_id,fence:row.fence,brokerId:broker,brokerHostId:host,brokerTokenHash}
  j.workId=workId;j.projectId=projectId;j.messages={workId,projectId,entries:[]};const{brokerTokenHash:_,...parent}=proof;j.config.parent=parent;j.config.createdAtMs=now;j.config.authorizationExpiresAtMs=Date.parse(row.authorization_expires_at);j.config.deadlineMs=Math.min(now+600000,Date.parse(row.created_at)+1199000);j.config.targetHeadSha=a.repository.pinnedBaseSha
  const roles:ReviewCredentialRow[]=(['atlas','worker']as const).map(role=>{const actor=role==='atlas'?j.config.coordinator:j.config.worker;const c=issueReviewRoleCredential(workId,role,actor.sessionId);return{role,...actor,tokenHash:c.tokenHash,candidateVersion:0}})
  return{job:j,proof,roles,owner,authorizationId:auth}
 }
 initialize(f:ReturnType<ReviewPostgres['createParent']>){return JSON.parse(this.sql('select public.atlas_code_review_initialize('+[q(f.job.workId)+'::uuid',q(f.proof),q(f.job.config),q(f.roles)].join(',')+');','service_role'))}
 read(workId:string){return JSON.parse(this.sql('select public.atlas_code_review_read('+q(workId)+'::uuid);','service_role'))}
 applySql(job:StoredReviewJobV1,command:ReviewStorageCommand,actor:StorageActor,tokenHash:string,newReviewer:unknown=null){
  const prepared=prepareReviewAppend(job,command,actor,{nowMs:Number(this.sql('select floor(extract(epoch from clock_timestamp())*1000)::bigint;')),parentLive:true})
  if(!prepared.ok)throw Error('fixture_prepare:'+prepared.violations.map(v=>v.code))
  if(command.kind==='freeze')command={...command,snapshotInput:snapshotInputOf(prepared.value.next.candidates.find(c=>c.version===command.snapshotInput.candidateVersion).snapshot)}
  return 'select public.atlas_code_review_apply('+[q(job.workId)+'::uuid',q(actor.role),q(actor.sessionId),q(tokenHash),String(job.version),q(command),q(prepared.value.commandHash),q(prepared.value.next),q(newReviewer)].join(',')+');'
 }
}
import {codeWorkRepositoryResource as resource} from '@/lib/atlas/code-work/control-plane/work-package'
