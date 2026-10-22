import {execFileSync,execFile,type ChildProcess} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync,existsSync,rmSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {promisify} from 'node:util'
import {deriveCodeWorkProposal} from '@/lib/atlas/code-work/control-plane/derive-admission'
import {codeWorkRepositoryResource as resource} from '@/lib/atlas/code-work/control-plane/work-package'
import {brokerClaimTokenHash} from '@/lib/atlas/code-work/claim-credential/claim-credential'
import type {ParentReviewProof} from '@/lib/atlas/code-work/review/storage/types'
import {makeStorageJob} from './sdf-review-storage-fixture'
import {TOKEN} from './sdf-execution-lease-fixtures'
export const migration='20261019110000_atlas_code_work_execution_lease.sql'
export const q=(v:unknown)=>typeof v==='number'?String(v):v===null?'null':"'"+(typeof v==='string'?v:JSON.stringify(v)).replaceAll("'","''")+"'"+(typeof v==='object'?'::jsonb':'')
const ROOT=resolve(__dirname,'../../../../..'),PLAN='docs/superpowers/plans/2026-10-19-cooperative-native-stop.md',WS=join(ROOT,'.superpowers/sdd/2026-10-19-cooperative-native-stop'),LABEL='cooperative-native-stop'
/** Owned plan workspace must already exist with matching identity; fixtures never create or recreate it. */
function ownedWorkspace(){if(!existsSync(join(WS,'plan-path'))||readFileSync(join(WS,'plan-path'),'utf8').trim()!==PLAN||!existsSync(join(ROOT,PLAN)))throw Error('owned_plan_workspace_missing');return WS}
/** Approved all-users Docker Desktop target and pins (migration plan Gate 3, approved 2026-10-19 20:45/20:53). */
const DOCKER='C:/Program Files/Docker/Docker/resources/bin/docker.exe',DOCKER_SHA256='6c699720bb9523dedb9eb5d22a49951ea9210dbdb1314a3554029eee9be76896',DAEMON_IDENTITY='097b04099237066832a5574e26cb1708df26ff5007ae0165f7135bea76df3601',DOTNET='C:/Program Files/dotnet/dotnet.exe',IMAGE='sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d'
const execute=promisify(execFile)
export type HostQualify=()=>any
export type DockerSpawn=(args:string[],opts:{timeout:number;maxBuffer:number})=>Promise<{stdout:string}>&{child:ChildProcess}
const nativeQualify:HostQualify=()=>JSON.parse(execFileSync(DOTNET,[join(ROOT,'apps/code-broker/.native/windows-host/OmniraBrokerHost.dll'),'qualify'],{env:{NODE_ENV:'test',SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',PATH:'C:\\Windows\\System32'},encoding:'utf8',timeout:30000}))
/**
 * Approved exception (2026-10-19 21:02), PG test fixture only: inside an explicitly named, time-bounded window the
 * per-call identity check is replaced by full qualification immediately before and after the window. Only these two
 * SQL tests may open one; the native helper's own identity checks are unaffected.
 */
const WINDOW_LABELS=new Set(['lock_contention','broker_expiry_barrier']),WINDOW_MAX_MS=15000
type Hold={released:boolean;release:()=>Promise<void>}
type Window={label:string;maxMs:number;openedAt:number;expired:boolean;inflight:Promise<unknown>[];holds:Hold[]}
/**
 * Owned PostgreSQL instance. The first full qualification locks the observed backend process identity for this
 * fixture's whole lifetime; every Docker call is preceded by a full qualification that must match it (except inside an
 * approved window, see above). A change is never adopted as a new baseline: the fixture is sealed, no further Docker
 * call (including cleanup) is made, and the receipt records withheld cleanup and the resource that may remain.
 */
export class ExecutionLeasePostgres {
 private readonly hostQualify:HostQualify;private readonly spawnDocker:DockerSpawn;readonly dir:string
 backendIdentity:string|null=null;sealed:string|null=null;readonly peerChecks:{label:string;at:string;backendIdentityHash:string|null;ok:boolean}[]=[]
 readonly windows:{label:string;maxMs:number;openedAt:string;durationMs:number;outcome:string}[]=[];private win:Window|null=null
 readonly attempt=randomUUID();readonly name='omnira-lease-'+this.attempt;readonly commands:{operation:string;exit:number|null}[]=[];id:string|null=null;started=false
 constructor(deps:{hostQualify?:HostQualify;spawn?:DockerSpawn;dir?:string}={}){
  this.hostQualify=deps.hostQualify??nativeQualify;this.dir=deps.dir??join(WS,'pg-'+this.attempt)
  this.spawnDocker=deps.spawn??((args,opts)=>execute(DOCKER,args,{env:this.env(),encoding:'utf8',...opts}) as any)
 }
 env(){return{NODE_ENV:'test' as const,SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',PATH:'C:\\Windows\\System32',HOME:this.dir,USERPROFILE:this.dir,DOCKER_CONFIG:this.dir}}
 args(a:string[]){return['--config',this.dir,'--host','npipe:////./pipe/dockerDesktopLinuxEngine',...a]}
 /** Gate before every Docker call: sealed refuses; inside an approved window no new call after expiry; otherwise full qualification. */
 private guard(op:string){if(this.sealed)throw Error('test_docker_peer_sealed:'+this.sealed);if(this.win){if(this.win.expired)throw Error('pg_window_expired:'+this.win.label);return}this.qualify('before_'+op)}
 private exec(a:string[],input?:string){const out=execFileSync(DOCKER,this.args(a),{input,env:this.env(),encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024});this.commands.push({operation:a[0],exit:0});return out.trim()}
 run(a:string[],input?:string){this.guard(a[0]);return this.exec(a,input)}
 /** Explicitly bounded window for the two approved timing tests; post-check runs even when fn throws, after every started operation settled. */
 async window<T>(label:string,maxMs:number,fn:()=>Promise<T>):Promise<T>{
  if(!WINDOW_LABELS.has(label))throw Error('pg_window_not_approved:'+label)
  if(!Number.isInteger(maxMs)||maxMs<=0||maxMs>WINDOW_MAX_MS)throw Error('pg_window_bound')
  if(this.win)throw Error('pg_window_nested')
  this.qualify('window_open:'+label)
  const w:Window={label,maxMs,openedAt:Date.now(),expired:false,inflight:[],holds:[]};this.win=w
  const timer=setTimeout(()=>{w.expired=true},maxMs)
  let result:{ok:true;value:T}|{ok:false;error:unknown}
  try{result={ok:true,value:await fn()}}catch(error){result={ok:false,error}}
  clearTimeout(timer)
  for(let seen=-1;seen!==w.inflight.length+w.holds.length;){seen=w.inflight.length+w.holds.length;for(const h of w.holds)if(!h.released)await h.release().catch(()=>undefined);await Promise.allSettled(w.inflight)}
  const durationMs=Date.now()-w.openedAt,expired=w.expired||durationMs>maxMs
  this.win=null
  const record=(outcome:string)=>this.windows.push({label,maxMs,openedAt:new Date(w.openedAt).toISOString(),durationMs,outcome})
  try{this.qualify('window_close:'+label)}catch(error){if(!this.sealed)this.sealed='post_check_failed_at_window_close:'+label;record('post_check_failed');throw error}
  if(expired){record('timeout');throw Error('pg_window_timeout:'+label)}
  record(result.ok?'closed':'closed_with_test_error')
  if(!result.ok)throw result.error
  return result.value
 }
 /** Full qualification with approved pins; locks the backend process identity on first success, refuses any later change. */
 qualify(label='check'){
  if(this.sealed)throw Error('test_docker_peer_sealed:'+this.sealed)
  let host:any,observed:string|null=null
  try{host=this.hostQualify();observed=typeof host?.docker?.backendIdentityHash==='string'?host.docker.backendIdentityHash:null}catch{host=null}
  const ok=(id:string)=>Array.isArray(host?.targetChecks)&&host.targetChecks.some((t:any)=>t.id===id&&t.ok===true&&Array.isArray(t.reasons)&&t.reasons.length===0)
  const qualified=host?.status==='qualified_for_health_probe'&&Array.isArray(host?.reasons)&&host.reasons.length===0&&ok('docker')&&ok('backend')&&host.docker?.daemonIdentityHash===DAEMON_IDENTITY&&observed!==null&&/^[a-f0-9]{64}$/.test(observed)
  const changed=qualified&&this.backendIdentity!==null&&observed!==this.backendIdentity
  this.peerChecks.push({label,at:new Date().toISOString(),backendIdentityHash:observed,ok:qualified&&!changed})
  if(!qualified){if(this.backendIdentity!==null)this.sealed='unqualified_at_'+label;throw Error('test_docker_peer_unqualified')}
  if(changed){this.sealed='backend_changed_at_'+label;throw Error('test_docker_backend_changed')}
  if(this.backendIdentity===null)this.backendIdentity=observed
  return host.docker
 }
 receipt(status:string,more:unknown={}){writeFileSync(join(this.dir,'receipt.json'),JSON.stringify({status,attempt:this.attempt,name:this.name,id:this.id,imageId:IMAGE,dockerPath:DOCKER,dockerSha256:DOCKER_SHA256,daemonIdentityHash:DAEMON_IDENTITY,lockedBackendIdentityHash:this.backendIdentity,sealed:this.sealed,windows:this.windows,peerCheckCount:this.peerChecks.length,peerChecks:this.peerChecks,commands:this.commands,details:more,productionAuthority:false},null,2))}
 snapshot(){return{containers:this.run(['ps','-aq','--no-trunc']).split(/\r?\n/).filter(Boolean).sort(),volumes:this.run(['volume','ls','-q']).split(/\r?\n/).filter(Boolean).sort(),images:[...new Set(this.run(['image','ls','-aq','--no-trunc']).split(/\r?\n/).filter(Boolean))].sort()}}
 sql(sql:string,role:string|null=null){return this.run(['exec','-i',this.name,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],(role?'set role '+role+';\n':'')+sql)}
 async parallel(sqls:string[]){
  this.guard('parallel')
  const ops=sqls.map(sql=>{const c=this.spawnDocker(this.args(['exec','-i',this.name,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres']),{timeout:30000,maxBuffer:8*1024*1024});this.commands.push({operation:'exec',exit:null});c.child.stdin!.end('set role service_role;\n'+sql);return c.then(r=>r.stdout.trim())})
  const inWindow=this.win!==null;if(this.win)this.win.inflight.push(...ops)
  const settled=await Promise.allSettled(ops)
  if(!inWindow)this.qualify('after_parallel')
  return settled
 }
 async start(includeMigration=true){
  ownedWorkspace();if(process.platform!=='win32'||existsSync(this.dir))throw Error('owned_pg_environment');mkdirSync(this.dir);writeFileSync(join(this.dir,'config.json'),'{}');writeFileSync(join(this.dir,'intent.json'),JSON.stringify({name:this.name,attempt:this.attempt,imageId:IMAGE}),{flag:'wx'})
  if(createHash('sha256').update(readFileSync(DOCKER)).digest('hex')!==DOCKER_SHA256)throw Error('docker_binary_changed')
  this.qualify('start_lock');if(JSON.parse(this.run(['image','inspect',IMAGE]))[0].Id!==IMAGE)throw Error('cached_pg_image_missing')
  writeFileSync(join(this.dir,'before.json'),JSON.stringify(this.snapshot(),null,2));this.started=true;this.receipt('dispatching_once')
  this.id=this.run(['run','-d','--pull=never','--network=none','--read-only','--memory=536870912','--cpus=1','--name',this.name,'--label','omnira.plan='+LABEL,'--label','omnira.attempt='+this.attempt,'--tmpfs','/var/lib/postgresql/data:rw,nosuid,nodev,size=268435456','--tmpfs','/var/run/postgresql:rw,nosuid,nodev,size=16777216','--tmpfs','/tmp:rw,nosuid,nodev,size=16777216','-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE]);if(!/^[a-f0-9]{64}$/.test(this.id))throw Error('unknown_pg_create')
  const actual=JSON.parse(this.run(['inspect',this.id]))[0];this.owned(actual)
  if(actual.HostConfig.NetworkMode!=='none'||actual.HostConfig.ReadonlyRootfs!==true||actual.HostConfig.Binds?.length||actual.HostConfig.PortBindings&&Object.keys(actual.HostConfig.PortBindings).length||actual.Mounts.some((m:any)=>m.Type!=='tmpfs'))throw Error('unsafe_pg_test_spec')
  this.receipt('created',{inspect:{image:actual.Image,mounts:actual.Mounts}})
  for(let n=0;n<100;n++){try{if(this.run(['exec',this.id,'cat','/proc/1/comm'])!=='postgres')throw Error('initializing');this.sql('select 1;');break}catch(e){if(this.sealed)throw e;if(n===99)throw Error('owned_postgres_not_ready');await new Promise(r=>setTimeout(r,100))}}
  this.sql("create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;alter default privileges in schema public grant all on tables to anon,authenticated,service_role;alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;create table public.projects(id uuid primary key);create table public.agents(id uuid primary key);create table public.manager_tasks(id uuid primary key default gen_random_uuid(),project_id uuid references public.projects(id),title text not null default '',description text,status text not null default 'pending',source text,source_key text,created_at timestamptz default now());")
  for(const f of ['20260819_atlas_authorizations.sql','20260820_manager_tasks_work_packages.sql','20260918095827_sdf1b1_code_work_control_plane.sql','20260923150000_sdf1c1_trusted_broker_identity.sql','20260924080000_sdf1c1b_broker_claim_credentials.sql','20260924140000_sdf1c2_broker_control_channel.sql',...(includeMigration?[migration]:[])])this.sql(readFileSync(join(ROOT,'apps/web/supabase/migrations',f),'utf8'))
  this.receipt('ready',{version:this.sql('select version();')})
 }
 owned(a:any){if(a.Name!=='/'+this.name||a.Image!==IMAGE||a.Config.Labels['omnira.plan']!==LABEL||a.Config.Labels['omnira.attempt']!==this.attempt)throw Error('foreign_test_pg')}
 /** Identity-checked cleanup. A sealed fixture makes no Docker call at all; the receipt names what may remain. */
 stop(){
  if(!this.started)return
  let removeIssued=false
  const withheld=(reason:string)=>this.receipt('cleanup_withheld_backend_changed',{reason,containerName:this.name,containerId:this.id,removeIssued,containerMayRemain:true,note:'no Docker call was made after the identity check failed; owned container must be reconciled manually'})
  if(this.sealed){withheld(this.sealed);throw Error('pg_cleanup_withheld:'+this.sealed)}
  if(this.win)throw Error('pg_window_open_at_cleanup')
  try{
   const a=JSON.parse(this.run(['inspect',this.id??this.name]))[0];this.owned(a);this.guard('rm');removeIssued=true;this.exec(['rm','-f',a.Id])
   this.guard('inspect_absence');let absent=false;try{this.exec(['inspect',a.Id])}catch(e){absent=String((e as any).stderr).includes('No such object')||String((e as any).stderr).includes('no such object')}
   if(!absent)throw Error('pg_cleanup_unverified')
   this.started=false;writeFileSync(join(this.dir,'after.json'),JSON.stringify(this.snapshot(),null,2));this.qualify('after_cleanup');this.receipt('removed',{removedId:a.Id,absenceConfirmed:true})
  }catch(e){if(this.sealed){withheld(this.sealed);throw Error('pg_cleanup_withheld:'+this.sealed)}throw e}
 }
 async hold(sql:string){
  this.guard('hold')
  const c=this.spawnDocker(this.args(['exec','-i',this.name,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres']),{timeout:15000,maxBuffer:1048576});this.commands.push({operation:'exec',exit:null})
  const h:Hold={released:false,release:async()=>{if(h.released)return;h.released=true;c.child.stdin!.end('rollback;\n');await c}}
  if(this.win){this.win.holds.push(h);this.win.inflight.push(c)}
  const ready=new Promise<void>((resolve,reject)=>{let out='';c.child.stdout!.on('data',b=>{out+=b.toString();if(out.includes('LEASE_LOCK_READY'))resolve()});c.catch(reject)})
  c.child.stdin!.write('begin;'+sql+";select 'LEASE_LOCK_READY';\n");await ready
  return async()=>{const inWindow=this.win!==null;await h.release();if(!inWindow&&!this.sealed)this.qualify('after_hold')}
 }
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
  const brokerTokenHash=brokerClaimTokenHash(workId,TOKEN)
  const row=JSON.parse(this.sql('select to_jsonb(public.atlas_code_work_claim('+[q(workId)+'::uuid',q(broker),q(host),q(brokerTokenHash)].join(',')+'));','service_role'))
  const now=Number(this.sql('select floor(extract(epoch from clock_timestamp())*1000)::bigint;'))
  const proof:ParentReviewProof={workId,claimId:row.claim_id,fence:row.fence,brokerId:broker,brokerHostId:host,brokerTokenHash}
  j.workId=workId;j.projectId=projectId;j.messages={workId,projectId,entries:[]};const{brokerTokenHash:_,...parent}=proof;j.config.parent=parent;j.config.createdAtMs=now;j.config.authorizationExpiresAtMs=Date.parse(row.authorization_expires_at);j.config.deadlineMs=Math.min(now+600000,Date.parse(row.created_at)+1199000);j.config.targetHeadSha=a.repository.pinnedBaseSha
  return{job:j,proof,owner,authorizationId:auth,brokerTokenHash}
 }
}