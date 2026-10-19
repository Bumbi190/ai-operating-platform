import {it,expect,beforeAll,afterAll,describe} from 'vitest'
import {performance} from 'node:perf_hooks'
import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {ExecutionLeasePostgres,q} from './fixtures/sdf-execution-lease-postgres'
import {executionLeaseForBroker} from '@/lib/atlas/code-broker/execution-lease/service'
import {projectExecutionLease} from '@/lib/atlas/code-broker/execution-lease/projection'
import {signedLeaseHarness,TOKEN} from './fixtures/sdf-execution-lease-fixtures'
const db=new ExecutionLeasePostgres(),observations:any[]=[]
beforeAll(async()=>{await db.start();observations.push({kind:'server_version',value:db.sql('select version();')})},120000);afterAll(()=>{writeFileSync(join(db.dir,'sql-observations.json'),JSON.stringify(observations,null,2));db.stop()},60000)
type Parent=ReturnType<ExecutionLeasePostgres['createParent']>
const readSql=(f:Parent,over:Partial<Parent['proof']>={})=>{const p={...f.proof,...over};return'select public.atlas_code_work_execution_lease('+[q(p.workId)+'::uuid',q(p.claimId)+'::uuid',p.fence,q(p.brokerId),q(p.brokerHostId),q(p.brokerTokenHash)].join(',')+');'}
const raw=(f:Parent)=>JSON.parse(db.sql(readSql(f),'service_role'))
const corrupt=(sql:string)=>db.sql("begin;set local session_replication_role='replica';"+sql+';commit;')
async function observe(f:Parent,over:Partial<Parent['proof']>={}){
 const p={...f.proof,...over},broker={...signedLeaseHarness().broker,brokerId:p.brokerId,hostId:p.brokerHostId},body={workId:p.workId,claimId:p.claimId,fence:p.fence,claimToken:TOKEN}
 return executionLeaseForBroker(broker,body,{store:{read:async input=>JSON.parse(db.sql('select public.atlas_code_work_execution_lease('+[q(input.workId)+'::uuid',q(input.claimId)+'::uuid',input.fence,q(input.brokerId),q(input.brokerHostId),q(input.brokerTokenHash)].join(',')+');','service_role'))}})
}
const count=(f:Parent)=>Number(db.sql("select count(*) from public.atlas_code_work_receipts where work_id="+q(f.proof.workId)+"::uuid and event_type='lease_renewed';"))
const revoke=(f:Parent)=>'insert into public.atlas_authorizations(event_id,authorization_id,event_type,occurred_at,project_id,principal_id,authority_basis,action_kind,target_type,target_id,target_version_hash,conditions,evidence) values(gen_random_uuid(),'+[q(f.authorizationId),q('revoked'),'clock_timestamp()',q(f.job.projectId),q(f.owner),q('founder_owner'),q('code.worktree.prepare_and_patch'),q('atlas.code_work_admission'),q(f.job.workId),q(f.job.config.admissionHash),"'[]'::jsonb","'[]'::jsonb"].join(',')+');'
const cancel=(f:Parent)=>'select public.atlas_code_work_cancel('+[q(f.job.workId)+'::uuid',q(f.job.projectId)+'::uuid',q(f.owner)+'::uuid',q('user_cancel')].join(',')+');'
describe('actual PostgreSQL execution lease',()=>{
 it('projects the live claim via the actual service RPC adapter',async()=>{const f=db.createParent(),r=await observe(f);expect(r.status).toBe('live');if(r.status!=='live')throw Error('no lease');expect(r.lease.binding).toEqual({workId:f.job.workId,repositoryId:'github.com/bumbi190/ai-operating-platform',pinnedBaseSha:f.job.config.admission.repository.pinnedBaseSha,admissionHash:f.job.config.admissionHash,claimId:f.proof.claimId,fence:f.proof.fence});expect(r.lease.projectId).toBe(f.job.projectId);expect(r.lease.authorityPins.workPackageHash).toBe(f.job.config.admission.governance.workPackage.hash);expect(r.lease.productionAuthority).toBe(false);expect(r.lease.leaseUntilMs-r.lease.serverNowMs).toBeGreaterThan(0);expect(r.lease.leaseUntilMs-r.lease.serverNowMs).toBeLessThanOrEqual(90000);expect(JSON.stringify(r)).not.toContain(TOKEN);expect(JSON.stringify(r)).not.toContain(f.proof.brokerTokenHash);expect(count(f)).toBe(1);observations.push({kind:'sample',lease:r.lease})})
 it('grants only the service RPC and leaves direct RLS/table protection in place',()=>{const f=db.createParent();for(const role of ['anon','authenticated'])expect(()=>db.sql(readSql(f),role)).toThrow();expect(db.sql("select prosecdef and array_to_string(proconfig,',') like '%search_path=%' from pg_proc where oid='public.atlas_code_work_execution_lease(uuid,uuid,bigint,text,text,text)'::regprocedure;")).toBe('t');expect(db.sql("select has_function_privilege('anon','public.atlas_code_work_execution_lease(uuid,uuid,bigint,text,text,text)','execute') or has_function_privilege('authenticated','public.atlas_code_work_execution_lease(uuid,uuid,bigint,text,text,text)','execute');")).toBe('f');expect(()=>db.sql('update public.atlas_code_work_runs set fence=fence+1;','service_role')).toThrow();expect(db.sql("select relrowsecurity from pg_class where oid='public.atlas_code_work_runs'::regclass;")).toBe('t');expect(projectExecutionLease(raw(f))).not.toBeNull()})
 for(const part of ['workId','claimId','fence','brokerId','brokerHostId','brokerTokenHash']as const)it('refuses wrong claim tuple '+part+' without renewing',()=>{const f=db.createParent(),p:any={};p[part]=part==='fence'?f.proof.fence+1:part==='brokerTokenHash'?'0'.repeat(64):'00000000-0000-4000-8000-000000000009';expect(()=>db.sql(readSql(f,p),'service_role')).toThrow();expect(count(f)).toBe(0)})
 for(const kind of ['cancel','terminal','lease_and_token_expired','runtime_elapsed','broker_expired','admission_corrupt']as const)it('withholds '+kind+' through the real service',async()=>{const f=db.createParent(),w=q(f.job.workId)+'::uuid'
 if(kind==='cancel')db.sql(cancel(f),'service_role')
 if(kind==='terminal')corrupt("update public.atlas_code_work_runs set state='worker_failed',terminal_at=clock_timestamp() where work_id="+w)
 if(kind==='lease_and_token_expired')corrupt("with expired as(select clock_timestamp()-interval '1 second' as at) update public.atlas_code_work_runs set lease_until=expired.at,broker_token_expires_at=expired.at from expired where work_id="+w)
 if(kind==='runtime_elapsed')corrupt("update public.atlas_code_work_runs set created_at=clock_timestamp()-interval '1201 seconds' where work_id="+w)
 if(kind==='broker_expired')corrupt("update public.atlas_code_brokers set expires_at=clock_timestamp()-interval '1 second' where broker_id="+q(f.proof.brokerId)+'::uuid')
 if(kind==='admission_corrupt')corrupt("update public.atlas_code_work_runs set pinned_base_sha='ffffffffffffffffffffffffffffffffffffffff',admission=jsonb_set(admission,'{repository,pinnedBaseSha}','\""+'f'.repeat(40)+"\"') where work_id="+w)
 expect(await observe(f)).toEqual({status:'not_live'});expect(count(f)).toBe(0)
 })
 it('refuses a committed broker revoke and authorization revoke',async()=>{for(const kind of ['broker','authorization']){const f=db.createParent();if(kind==='broker')db.sql('select public.atlas_code_broker_revoke('+[q(f.proof.brokerId)+'::uuid',q(f.owner)+'::uuid',q('revoked'),q('fixture')].join(',')+');','service_role');else db.sql(revoke(f),'service_role');expect(await observe(f)).toEqual({status:'not_live'});expect(count(f)).toBe(0)}})
 it('refuses an expired Authorization grant',async()=>{const f=db.createParent();corrupt("update public.atlas_authorizations set expires_at=clock_timestamp()-interval '1 second' where authorization_id="+q(f.authorizationId)+"::uuid and event_type='granted'");expect(await observe(f)).toEqual({status:'not_live'});expect(count(f)).toBe(0)})
 for(const kind of ['removed','pin','json_pin','action','capability','read_scope','write_scope','denial']as const)it('rechecks current WorkPackage '+kind,async()=>{const f=db.createParent(),id=q(f.job.config.admission.governance.workPackage.id)+'::uuid';let sql=''
 if(kind==='removed')sql='delete from public.manager_tasks where work_package_id='+id
 if(kind==='pin')sql="update public.manager_tasks set work_package_hash='"+'f'.repeat(64)+"' where work_package_id="+id
 const values:Record<string,[string,string]>={json_pin:['missionBoundHash',JSON.stringify('f'.repeat(64))],action:['allowedActions','[]'],capability:['tools','[]'],read_scope:['dataScope','[]'],write_scope:['dataScope',JSON.stringify([{resource:'repo:github.com/bumbi190/ai-operating-platform:apps/web/lib',access:'read'}])],denial:['outOfScope',JSON.stringify(['repo:github.com/bumbi190/ai-operating-platform:apps/web/lib/atlas'])]}
 if(values[kind]){const[key,value]=values[kind];sql="update public.manager_tasks set work_package=jsonb_set(work_package,'{"+key+"}',"+q(value)+'::jsonb) where work_package_id='+id}
 corrupt(sql);expect(await observe(f)).toEqual({status:'not_live'});expect(count(f)).toBe(0)
 })
 for(const kind of ['authorization','cancel','scope','broker']as const)it('serializes a competing '+kind+' change before the next lease',async()=>{const f=db.createParent();let mutation=kind==='authorization'?revoke(f):kind==='cancel'?cancel(f):kind==='broker'?'select public.atlas_code_broker_revoke('+[q(f.proof.brokerId)+'::uuid',q(f.owner)+'::uuid',q('revoked'),q('race')].join(',')+');':"reset role;begin;set local session_replication_role='replica';update public.manager_tasks set work_package=jsonb_set(work_package,'{dataScope}','[]'::jsonb) where work_package_id="+q(f.job.config.admission.governance.workPackage.id)+'::uuid;commit;'
 const result=await db.parallel([mutation,readSql(f)]);expect(result[0].status).toBe('fulfilled');if(result[1].status==='fulfilled')expect(projectExecutionLease(JSON.parse(result[1].value))).not.toBeNull();expect(await observe(f)).toEqual({status:'not_live'});observations.push({kind:'race_'+kind,outcomes:result.map(r=>r.status)})
 },30000)
 it('bounds lock contention without renewing or replaying the request',async()=>{const f=db.createParent(),release=await db.hold('lock table public.atlas_authorizations in row exclusive mode'),start=performance.now();try{expect(await observe(f)).toEqual({status:'not_live'});const elapsed=performance.now()-start;expect(elapsed).toBeGreaterThan(2500);expect(elapsed).toBeLessThan(7000);expect(count(f)).toBe(0);observations.push({kind:'lock_timeout',elapsedMs:elapsed})}finally{await release()}},15000)
 it('caps outward validity at the locked brokers known expiry',()=>{
  const f=db.createParent()
  corrupt("update public.atlas_code_brokers set expires_at=clock_timestamp()+interval '30 seconds' where broker_id="+q(f.proof.brokerId)+'::uuid')
  const expiry=Number(db.sql("select floor(extract(epoch from expires_at)*1000)::bigint from public.atlas_code_brokers where broker_id="+q(f.proof.brokerId)+'::uuid'))
  const lease=projectExecutionLease(raw(f))
  expect(lease).not.toBeNull()
  expect(lease!.leaseUntilMs).toBe(expiry)
  expect(count(f)).toBe(1)
  observations.push({kind:'broker_expiry_cap',expiresAtMs:expiry,leaseUntilMs:lease!.leaseUntilMs})
 })
 it('refuses broker expiry across an explicitly held WorkPackage lock with no renewal',async()=>{
  const f=db.createParent(),marker='lease_broker_expiry_barrier',id=q(f.job.config.admission.governance.workPackage.id)+'::uuid'
  const release=await db.hold('select id from public.manager_tasks where work_package_id='+id+' for update')
  let released=false,pending:Promise<unknown>|undefined
  const started=performance.now()
  try{
   corrupt("update public.atlas_code_brokers set expires_at=clock_timestamp()+interval '1200 milliseconds' where broker_id="+q(f.proof.brokerId)+'::uuid')
   const broker={...signedLeaseHarness().broker,brokerId:f.proof.brokerId,hostId:f.proof.brokerHostId}
   pending=executionLeaseForBroker(broker,{workId:f.proof.workId,claimId:f.proof.claimId,fence:f.proof.fence,claimToken:TOKEN},{store:{read:async()=>{
    const [result]=await db.parallel(['/* '+marker+' */'+readSql(f)])
    if(result.status==='rejected')throw result.reason
    return JSON.parse(result.value)
   }}})
   let blocked=false
   for(let n=0;n<10;n++){
    const status=JSON.parse(db.sql("select json_build_object('blocked',exists(select 1 from pg_stat_activity where wait_event_type='Lock' and query like '%"+marker+"%'),'brokerLive',expires_at>clock_timestamp()) from public.atlas_code_brokers where broker_id="+q(f.proof.brokerId)+'::uuid'))
    if(status.blocked){expect(status.brokerLive).toBe(true);blocked=true;break}
    await new Promise(resolve=>setTimeout(resolve,20))
   }
   expect(blocked).toBe(true)
   db.sql("select pg_sleep(greatest(0,extract(epoch from (expires_at-clock_timestamp()))+0.05)) from public.atlas_code_brokers where broker_id="+q(f.proof.brokerId)+'::uuid')
   expect(db.sql("select expires_at<=clock_timestamp() from public.atlas_code_brokers where broker_id="+q(f.proof.brokerId)+'::uuid')).toBe('t')
   await release();released=true
   const result=await pending,elapsed=performance.now()-started
   expect(elapsed).toBeLessThan(2900)
   expect(result).toEqual({status:'not_live'})
   expect(count(f)).toBe(0)
   observations.push({kind:'broker_expiry_after_workpackage_barrier',elapsedMs:elapsed,blockedBeforeExpiry:true,releasedAfterExpiry:true,result,renewalReceipts:count(f)})
  }finally{if(!released)await release();await pending}
 },15000)
})
