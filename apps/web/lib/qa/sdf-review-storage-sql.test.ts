import {afterAll,beforeAll,describe,it,expect} from 'vitest'
import {ReviewPostgres,q} from './fixtures/sdf-review-postgres'
import {freezeCommand,storageActor,reportCommand,messageCommand,unwrap} from './fixtures/sdf-review-storage-fixture'
import {prepareReviewAppend,snapshotInputOf,reviewStorageCommandHash} from '@/lib/atlas/code-work/review/storage/prepare'
import {issueReviewRoleCredential} from '@/lib/atlas/code-work/review/storage/credential'
const db=new ReviewPostgres()
beforeAll(()=>db.start(),120000);afterAll(()=>db.stop(),30000)
function initialized(){const f=db.createParent();db.initialize(f);return f}
function frozen(){const f=initialized(),cmd=freezeCommand(f.job),reviewer=cmd.snapshotInput.assignment.reviewer,token=issueReviewRoleCredential(f.job.workId,'reviewer',reviewer.sessionId);db.sql(db.applySql(f.job,cmd,storageActor(f.job),f.roles[0].tokenHash,{role:'reviewer',...reviewer,tokenHash:token.tokenHash,candidateVersion:1}),'service_role');return{...f,job:db.read(f.job.workId),reviewerHash:token.tokenHash,cmd}}
describe('atomic durable review PostgreSQL',()=>{
 it('creates exact idempotent initial state and refuses changed bootstrap',()=>{const f=initialized();expect(db.read(f.job.workId)).toEqual(f.job);expect(db.initialize(f)).toEqual(f.job);f.job.config.budget.totalMicrousd++;expect(()=>db.initialize(f)).toThrow()})
 it('denies direct table writes and public reads/helpers',()=>{const f=initialized();for(const role of ['anon','authenticated','service_role'])expect(()=>db.sql('update public.atlas_code_review_jobs set version=9;',role)).toThrow();for(const role of ['anon','authenticated'])expect(()=>db.sql('select public.atlas_code_review_read('+q(f.job.workId)+'::uuid);',role)).toThrow();expect(()=>db.sql('select * from atlas_code_review_private.credentials;','service_role')).toThrow()})
 it('freezes packet atomically with distinct reviewer hash and no exposed credential',()=>{const f=frozen();expect(f.job.version).toBe(1);expect(JSON.stringify(f.job)).not.toContain('tokenHash');expect(f.job.candidates).toHaveLength(1)})
 it('authenticates role, validates report order and immutable prefixes in SQL',()=>{const f=frozen(),cmd=reportCommand(f.job),actor=storageActor(f.job,'reviewer'),sql=db.applySql(f.job,cmd,actor,f.reviewerHash);expect(()=>db.sql(sql.replace(q(f.reviewerHash),q('0'.repeat(64))),'service_role')).toThrow();db.sql(sql,'service_role');expect(db.read(f.job.workId).candidates[0].preliminary).not.toBeNull();expect(()=>db.sql(db.applySql(f.job,cmd,storageActor(f.job,'worker'),f.roles[1].tokenHash),'service_role')).toThrow()})
 it('serializes same-id replay and competing same-version commands',async()=>{const f=frozen(),a=storageActor(f.job,'reviewer'),one=db.applySql(f.job,reportCommand(f.job),a,f.reviewerHash);const duplicate=await db.parallel([one,one]);expect(duplicate.filter(x=>x.status==='fulfilled')).toHaveLength(2);expect(db.read(f.job.workId).version).toBe(2);const j=db.read(f.job.workId),c=messageCommand(j),d={...messageCommand(j,2),id:'other-command'};const raced=await db.parallel([db.applySql(j,c,storageActor(j),f.roles[0].tokenHash),db.applySql(j,d,storageActor(j),f.roles[0].tokenHash)]);expect(raced.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(db.read(j.workId).messages.entries).toHaveLength(1)})
 it('allows authenticated inert replay after cancellation but refuses new writes',()=>{const f=frozen(),before=f.job,original=db.applySql({...before,version:0,candidates:[],commands:[]},f.cmd,storageActor(before),f.roles[0].tokenHash,{role:'reviewer',...before.candidates[0].snapshot.assignment.reviewer,tokenHash:f.reviewerHash,candidateVersion:1});db.sql('select public.atlas_code_work_cancel('+[q(before.workId)+'::uuid',q(before.projectId)+'::uuid',q(f.owner)+'::uuid',q('user_cancel')].join(',')+');','service_role');const replay=JSON.parse(db.sql(original,'service_role'));expect(replay.outcome).toBe('replayed');expect(db.read(before.workId).version).toBe(1);expect(()=>db.sql(db.applySql(before,reportCommand(before),storageActor(before,'reviewer'),f.reviewerHash),'service_role')).toThrow()})
})

function revoke(f:ReturnType<typeof initialized>){return 'insert into public.atlas_authorizations(event_id,authorization_id,event_type,occurred_at,project_id,principal_id,authority_basis,action_kind,target_type,target_id,target_version_hash,conditions,evidence) values(gen_random_uuid(),'+[q(f.authorizationId),q('revoked'),'clock_timestamp()',q(f.job.projectId),q(f.owner),q('founder_owner'),q('code.worktree.prepare_and_patch'),q('atlas.code_work_admission'),q(f.job.workId),q(f.job.config.admissionHash),"'[]'::jsonb","'[]'::jsonb"].join(',')+');'}
describe('SQL independent negative guards and races',()=>{
 it('refuses forged aggregate config and unexpected keys even with a valid token',()=>{const f=frozen(),cmd=reportCommand(f.job),sql=db.applySql(f.job,cmd,storageActor(f.job,'reviewer'),f.reviewerHash),next=unwrap(prepareReviewAppend(f.job,cmd,storageActor(f.job,'reviewer'),{nowMs:Number(db.sql('select floor(extract(epoch from clock_timestamp())*1000)::bigint;')),parentLive:true})).next
 for(const mutate of [(j:any)=>j.config.targetHeadSha='c'.repeat(40),(j:any)=>j.config.requiredChecks[0].minPassedTests++,(j:any)=>j.candidates[0].snapshot.artifacts[0].body='tamper',(j:any)=>j.extra=true]){
  const changed=structuredClone(next);mutate(changed);const actor=storageActor(f.job,'reviewer')
  // Replace the full prepared next argument rather than relying on its wall-clock timestamp.
  const altered='select public.atlas_code_review_apply('+[q(f.job.workId)+'::uuid',q(actor.role),q(actor.sessionId),q(f.reviewerHash),String(f.job.version),q(cmd),q(reviewStorageCommandHash(cmd,actor)),q(changed),'null'].join(',')+');'
  expect(altered).not.toBe(sql);expect(()=>db.sql(altered,'service_role')).toThrow()
 }
 })
 it('serializes the twelfth message boundary and never commits a thirteenth',async()=>{const f=frozen();let j=f.job;db.sql(db.applySql(j,reportCommand(j),storageActor(j,'reviewer'),f.reviewerHash),'service_role');j=db.read(j.workId)
 for(let n=1;n<=11;n++){db.sql(db.applySql(j,messageCommand(j,n),storageActor(j),f.roles[0].tokenHash),'service_role');j=db.read(j.workId)}
 const race=await db.parallel([db.applySql(j,messageCommand(j,12),storageActor(j),f.roles[0].tokenHash),db.applySql(j,messageCommand(j,13),storageActor(j),f.roles[0].tokenHash)])
 expect(race.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(db.read(j.workId).messages.entries).toHaveLength(12)
 },120000)
 it('rejects a concurrent or already committed authority revocation',async()=>{const f=frozen(),sql=db.applySql(f.job,reportCommand(f.job),storageActor(f.job,'reviewer'),f.reviewerHash)
 const result=await db.parallel([revoke(f),sql]);expect(result[0].status).toBe('fulfilled');const after=db.read(f.job.workId);expect([1,2]).toContain(after.version)
 const command=after.version===1?reportCommand(after):reportCommand(after,'final')
 expect(()=>db.sql(db.applySql(after,command,storageActor(after,'reviewer'),f.reviewerHash),'service_role')).toThrow()
 expect(db.read(after.workId).version).toBe(after.version)
 })
 it('rejects replaced parent fence and broker revocation; heartbeat leaves frozen identity intact',()=>{const f=frozen(),hash=f.job.candidates[0].snapshot.snapshotHash
 db.sql('select public.atlas_code_work_heartbeat('+[q(f.job.workId)+'::uuid',q(f.proof.claimId)+'::uuid',String(f.proof.fence),q(f.proof.brokerId),q(f.proof.brokerHostId),q(f.proof.brokerTokenHash)].join(',')+');','service_role')
 expect(db.read(f.job.workId).candidates[0].snapshot.snapshotHash).toBe(hash)
 db.sql('select public.atlas_code_broker_revoke('+[q(f.proof.brokerId)+'::uuid',q(f.owner)+'::uuid',q('revoked'),q('fixture_revoke')].join(',')+');','service_role')
 expect(()=>db.sql(db.applySql(f.job,reportCommand(f.job),storageActor(f.job,'reviewer'),f.reviewerHash),'service_role')).toThrow()
 const g=frozen();db.sql("begin;select set_config('omnira.code_work_control','on',true);update public.atlas_code_work_runs set fence=fence+1 where work_id="+q(g.job.workId)+"::uuid;commit;")
 expect(()=>db.sql(db.applySql(g.job,reportCommand(g.job),storageActor(g.job,'reviewer'),g.reviewerHash),'service_role')).toThrow()
 },30000)
 it('rolls back new reviewer credentials on a failed freeze and refuses history mutation',()=>{const f=initialized(),cmd=freezeCommand(f.job),r=cmd.snapshotInput.assignment.reviewer
 const issued=issueReviewRoleCredential(f.job.workId,'reviewer',r.sessionId),newRole={role:'reviewer',...r,tokenHash:issued.tokenHash,candidateVersion:1}
 const sql=db.applySql(f.job,cmd,storageActor(f.job),f.roles[0].tokenHash,newRole)
 expect(()=>db.sql(sql.replace(q(f.roles[0].tokenHash),q('0'.repeat(64))),'service_role')).toThrow()
 expect(db.sql('select count(*) from atlas_code_review_private.credentials where work_id='+q(f.job.workId)+'::uuid;')).toBe('2')
 for(const statement of ['delete from public.atlas_code_review_jobs;','truncate public.atlas_code_review_jobs;'])expect(()=>db.sql(statement)).toThrow()
 expect(()=>db.sql('select atlas_code_review_private.must(true);','service_role')).toThrow()
 })
})

it('SQL refuses worker review submission and final without preliminary despite self-consistent hashes',()=>{
 const f=frozen(),cmd=reportCommand(f.job),actor=storageActor(f.job,'reviewer'),now=Number(db.sql('select floor(extract(epoch from clock_timestamp())*1000)::bigint;'))
 const prepared=unwrap(prepareReviewAppend(f.job,cmd,actor,{nowMs:now,parentLive:true})),worker=storageActor(f.job,'worker')
 const forged=structuredClone(prepared.next),receipt=forged.commands.at(-1)!;Object.assign(receipt,worker,{commandHash:reviewStorageCommandHash(cmd,worker)})
 const sql=(command:any,person:any,token:string,next:any)=>'select public.atlas_code_review_apply('+[q(f.job.workId)+'::uuid',q(person.role),q(person.sessionId),q(token),String(f.job.version),q(command),q(reviewStorageCommandHash(command,person)),q(next),'null'].join(',')+');'
 expect(()=>db.sql(sql(cmd,worker,f.roles[1].tokenHash,forged),'service_role')).toThrow()
 const finalCommand=reportCommand(f.job,'final'),s=f.job.candidates[0].snapshot
 const model=finalCommand.result,bound={...model,assignment:s.assignment,resultHash:canonical({domain:'atlas.bound_code_review_result.v1',result:model,assignment:s.assignment})}
 const final=structuredClone(prepared.next);final.candidates[0].preliminary=null;final.candidates[0].final=bound
 Object.assign(final.commands.at(-1)!,{id:finalCommand.id,commandHash:reviewStorageCommandHash(finalCommand,actor),payloadRef:bound.resultHash})
 expect(()=>db.sql(sql(finalCommand,actor,f.reviewerHash,final),'service_role')).toThrow()
})
import {canonicalTargetVersionHash as canonical} from '@/lib/atlas/authorization/build'

function roleRead(f:ReturnType<typeof frozen>,role:'worker'|'reviewer'='reviewer',hash=f.reviewerHash){
 const actor=storageActor(f.job,role);return 'select public.atlas_code_review_read_for_role('+[q(f.job.workId)+'::uuid',q(role),q(actor.sessionId),q(hash)].join(',')+');'
}
describe('stored role reads and credential recovery',()=>{
 it('enforces initial reviewer context isolation and directed-only discussion in SQL',()=>{
  const f=frozen();let j=f.job
  db.sql(db.applySql(j,messageCommand(j,1,'atlas'),storageActor(j,'worker'),f.roles[1].tokenHash),'service_role');j=db.read(j.workId)
  const initial=JSON.parse(db.sql(roleRead({...f,job:j}),'service_role'))
  expect(initial.candidate.snapshot.artifacts.length).toBeGreaterThan(0);expect(initial.messages).toEqual([]);expect(JSON.stringify(initial)).not.toMatch(/tokenHash|brokerTokenHash|commands/)
  db.sql(db.applySql(j,reportCommand(j),storageActor(j,'reviewer'),f.reviewerHash),'service_role');j=db.read(j.workId)
  db.sql(db.applySql(j,messageCommand(j,2,'reviewer'),storageActor(j),f.roles[0].tokenHash),'service_role');j=db.read(j.workId)
  const discussion=JSON.parse(db.sql(roleRead({...f,job:j}),'service_role'));expect(discussion.messages.map((m:any)=>m.id)).toEqual(['message-2'])
  const worker=JSON.parse(db.sql(roleRead({...f,job:j},'worker',f.roles[1].tokenHash),'service_role'));expect(worker.candidate.preliminary).toBeNull();expect(worker.messages.map((m:any)=>m.id)).toEqual(['message-1'])
  expect(()=>db.sql(roleRead({...f,job:j},'reviewer',f.roles[1].tokenHash),'service_role')).toThrow()
 },30000)
 it('recovers a role key without mutating history and invalidates old token immediately',async()=>{
  const f=frozen(),reviewer=storageActor(f.job,'reviewer'),hashes=['7'.repeat(64),'8'.repeat(64)]
  const rotate=(h:string)=>'select public.atlas_code_review_rotate_credential('+[q(f.job.workId)+'::uuid',q(f.proof),q('reviewer'),q(reviewer.sessionId),q(h)].join(',')+');'
  const race=await db.parallel(hashes.map(rotate));expect(race.every(r=>r.status==='fulfilled')).toBe(true)
  expect(db.read(f.job.workId)).toEqual(f.job);expect(()=>db.sql(roleRead(f),'service_role')).toThrow()
  const accepted=hashes.map(h=>{try{db.sql(roleRead(f,'reviewer',h),'service_role');return true}catch{return false}})
  expect(accepted.filter(Boolean)).toHaveLength(1)
  expect(()=>db.sql(rotate('9'.repeat(64)).replace(q(f.proof),q({...f.proof,fence:f.proof.fence+1})),'service_role')).toThrow()
 },30000)
 it('observes a stopped parent without granting live reads or key recovery',()=>{
  const f=frozen(),j=f.job;db.sql('select public.atlas_code_work_cancel('+[q(j.workId)+'::uuid',q(j.projectId)+'::uuid',q(f.owner)+'::uuid',q('stop')].join(',')+');','service_role')
  const observation=JSON.parse(db.sql('select public.atlas_code_review_observe('+q(j.workId)+'::uuid);','service_role'));expect(observation.parentLive).toBe(false);expect(observation.job).toEqual(j)
  expect(()=>db.sql(roleRead(f),'service_role')).toThrow()
  expect(()=>db.sql('select public.atlas_code_review_rotate_credential('+[q(j.workId)+'::uuid',q(f.proof),q('reviewer'),q(storageActor(j,'reviewer').sessionId),q('7'.repeat(64))].join(',')+');','service_role')).toThrow()
 })
})

describe('SQL snapshot admission ceilings',()=>{
 it.each(['files','diffBytes'] as const)('rejects self-consistent over-limit %s without persisting a candidate or credential',field=>{
  const f=initialized(),command=freezeCommand(f.job),actor=storageActor(f.job)
  const prepared=unwrap(prepareReviewAppend(f.job,command,actor,{nowMs:Number(db.sql('select floor(extract(epoch from clock_timestamp())*1000)::bigint;')),parentLive:true}))
  const next=structuredClone(prepared.next),snapshot=next.candidates[0].snapshot
  if(field==='files')snapshot.files=Array.from({length:f.job.config.admission.limits.maxChangedFiles+1},(_,i)=>({...snapshot.files[0],path:'apps/web/lib/atlas/code-work/over-limit-'+i+'.ts'}))
  else snapshot.diffBytes=f.job.config.admission.limits.maxDiffBytes+1
  const {snapshotHash:_,...packet}=snapshot;snapshot.snapshotHash=canonical({domain:'atlas.code_review_snapshot.v1',packet})
  const forged={...command,snapshotInput:snapshotInputOf(snapshot)},hash=reviewStorageCommandHash(forged,actor)
  Object.assign(next.commands[0],{commandHash:hash,payloadRef:snapshot.snapshotHash})
  const reviewer={role:'reviewer',...snapshot.assignment.reviewer,tokenHash:'7'.repeat(64),candidateVersion:1}
  const sql='select public.atlas_code_review_apply('+[q(f.job.workId)+'::uuid',q(actor.role),q(actor.sessionId),q(f.roles[0].tokenHash),'0',q(forged),q(hash),q(next),q(reviewer)].join(',')+');'
  expect(()=>db.sql(sql,'service_role')).toThrow()
  expect(db.read(f.job.workId)).toEqual(f.job)
  expect(db.sql('select count(*) from atlas_code_review_private.credentials where work_id='+q(f.job.workId)+'::uuid;')).toBe('2')
 })
})
