
import {beforeAll,afterAll,it,expect} from 'vitest'
import {initializeSchedulingDb} from './test-db'
import {scheduleFixture,setScheduleClock,appendScheduleFixtureItem} from './fixtures.test-utils'
import {approveSchedule,claimScheduleJob,checkScheduleWrite,revokeSchedule,recordReleaseEvidence,recordScheduleStep,saveMonthlyRule,readSchedules,proposeSchedule} from './store'
import {testSql} from '../../website-build/test-db'
import {publicationAssert,publicationStep} from '../publication/store'
import {manifestHash} from './manifest'
let db:ReturnType<typeof initializeSchedulingDb>
beforeAll(()=>{db=initializeSchedulingDb()})
afterAll(()=>setScheduleClock(null))
it('two_claimers_share_only_one_intent',async()=>{
 const f=await scheduleFixture(db)
 expect(f.batch.sha256).toBe(manifestHash(f.manifest))
 const [first,second]=await Promise.all([approveSchedule(db,f.principal,f.approval),approveSchedule(db,f.principal,f.approval)])
 expect(first.approval!.id).toBe(second.approval!.id);setScheduleClock(f.dueAt)
 const claims=await Promise.all(['a','b'].map(workerId=>claimScheduleJob(db,{workerId,now:f.dueAt,dryRun:false})))
 expect(claims.filter(Boolean)).toHaveLength(1)
 expect(testSql("select count(*) from social_schedule_jobs where project_id='"+f.manifest.projectId+"';")).toBe('1')
},20000)
it('due scheduled authority replaces only temporal activation requirements while manual dispatch stays closed',async()=>{
 const f=await scheduleFixture(db);await approveSchedule(db,f.principal,f.approval);setScheduleClock(f.dueAt)
 const claim=(await claimScheduleJob(db,{workerId:'a',now:f.dueAt,dryRun:false}))!
 expect((await checkScheduleWrite(db,claim)).item.revisionId).toBe(f.manifest.items[0].revisionId)
 await expect(publicationAssert(db,f.principal,f.source.input)).rejects.toBeTruthy()
 const saved=await recordScheduleStep(db,claim,{action:'prepare'})
 expect(saved.publication!.authoritySource).toBe('scheduled');expect(saved.publication!.jobId).toBe(claim.jobId)
},20000)
it('fresh matching release evidence may arrive after conditional approval; wrong year catalog and stale evidence deny',async()=>{
 const f=await scheduleFixture(db,{kind:'month_release',releaseMonth:'2026-11'});await approveSchedule(db,f.principal,f.approval);setScheduleClock(f.dueAt)
 const claim=(await claimScheduleJob(db,{workerId:'a',now:f.dueAt,dryRun:false}))!
 await expect(checkScheduleWrite(db,claim)).rejects.toMatchObject({code:'RELEASE_REQUIRED'})
 const condition=f.manifest.items[0].releaseCondition!
 for(const patch of [{releaseMonth:'2027-11'},{catalogSha256:'f'.repeat(64)}]){
  await recordReleaseEvidence(db,f.principal,{projectId:f.manifest.projectId,...condition,...patch,customerViewUrl:'https://familje-stunden.se/aktiviteter',confirmed:true})
  await expect(checkScheduleWrite(db,claim)).rejects.toMatchObject({code:'RELEASE_REQUIRED'})
 }
 setScheduleClock(new Date(Date.parse(f.dueAt)-25*3600000).toISOString())
 await recordReleaseEvidence(db,f.principal,{projectId:f.manifest.projectId,...condition,customerViewUrl:'https://familje-stunden.se/aktiviteter',confirmed:true})
 setScheduleClock(f.dueAt)
 await expect(checkScheduleWrite(db,claim)).rejects.toMatchObject({code:'RELEASE_REQUIRED'})
 await recordReleaseEvidence(db,f.principal,{projectId:f.manifest.projectId,...condition,customerViewUrl:'https://familje-stunden.se/aktiviteter',confirmed:true})
 expect((await checkScheduleWrite(db,claim)).item.releaseCondition).toEqual(condition)
 setScheduleClock(new Date(Date.parse(f.dueAt)+86400001).toISOString())
 await expect(checkScheduleWrite(db,claim)).rejects.toBeTruthy()
},30000)
it('revocation owner loss and project/global stops deny a live claim before every write',async()=>{
 for(const mode of ['owner','pause','global','revoke'] as const){
  const f=await scheduleFixture(db);const approved=await approveSchedule(db,f.principal,f.approval);setScheduleClock(f.dueAt)
  const claim=(await claimScheduleJob(db,{workerId:'a',now:f.dueAt,dryRun:false}))!
  if(mode==='owner')testSql("update projects set owner_id='20000000-0000-4000-8000-000000000002' where id='"+f.manifest.projectId+"';")
  if(mode==='pause')testSql("update projects set execution_paused=true where id='"+f.manifest.projectId+"';")
  if(mode==='global')testSql("update platform_config set automation_paused=true;")
  if(mode==='revoke')await revokeSchedule(db,f.principal,{projectId:f.manifest.projectId,batchId:approved.batchId,expectedVersion:approved.version})
  await expect(checkScheduleWrite(db,claim)).rejects.toBeTruthy()
 }
},45000)
it('monthly planning and dry run create no executable intent; web roles cannot call worker RPCs',async()=>{
 const f=await scheduleFixture(db);const before=testSql('select count(*) from social_schedule_events;')
 await saveMonthlyRule(db,f.principal,{projectId:f.manifest.projectId,rule:{dayOfMonth:1,localTime:'20:30',timeZone:'Europe/Stockholm',channels:['facebook','instagram'],enabled:true}})
 expect((await readSchedules(db,f.principal,{projectId:f.manifest.projectId})).batches[0].jobs).toHaveLength(0)
 await approveSchedule(db,f.principal,f.approval);setScheduleClock(f.dueAt)
 const baselineEvents=testSql('select count(*) from social_schedule_events;')
 const baseline=testSql("select jsonb_agg(row_to_json(j)) from social_schedule_jobs j where project_id='"+f.manifest.projectId+"';")
 expect(await claimScheduleJob(db,{workerId:'a',now:f.dueAt,dryRun:true})).toBeNull()
 expect(testSql("select jsonb_agg(row_to_json(j)) from social_schedule_jobs j where project_id='"+f.manifest.projectId+"';")).toBe(baseline)
 for(const role of ['anon','authenticated'])expect(()=>testSql("set role "+role+";select social_schedule_claim('{}');")).toThrow()
 expect(testSql('select count(*) from social_schedule_events;')).toBe(baselineEvents)
 expect(Number(baselineEvents)).toBeGreaterThan(Number(before))
},20000)

it('manual journal cannot mutate a scheduled attempt',async()=>{
 const f=await scheduleFixture(db);await approveSchedule(db,f.principal,f.approval);setScheduleClock(f.dueAt)
 let claim=(await claimScheduleJob(db,{workerId:'a',now:f.dueAt,dryRun:false}))!
 let saved=await recordScheduleStep(db,claim,{action:'prepare'});claim=saved.claim
 saved=await recordScheduleStep(db,claim,{action:'claim_create',expectedVersion:saved.publication!.version,capabilityHash:'a'.repeat(64)})
 await expect(publicationStep(db,f.principal,{projectId:f.manifest.projectId,postId:f.manifest.items[0].postId,publicationId:saved.publication!.id,expectedVersion:saved.publication!.version,action:'uncertain',failureCode:'receipt_unavailable'})).rejects.toMatchObject({code:'REVIEW_REQUIRED'})
},20000)

it('checks the actual job project against the fresh allowlist',async()=>{
 const f=await scheduleFixture(db);await approveSchedule(db,f.principal,f.approval);setScheduleClock(f.dueAt)
 const claim=(await claimScheduleJob(db,{workerId:'a',now:f.dueAt,dryRun:false}))!
 const other='10000000-0000-4000-8000-000000000099'
 process.env.SOCIAL_SCHEDULE_PROJECT_IDS=other
 await expect(checkScheduleWrite(db,{...claim,snapshot:{...claim.snapshot,projectId:other}})).rejects.toMatchObject({code:'DISABLED'})
},20000)

it('two approved batches cannot reserve the same month and channel',async()=>{
 const f=await scheduleFixture(db,{kind:'month_release'});await approveSchedule(db,f.principal,f.approval)
 const other=await appendScheduleFixtureItem(db,f)
 const batch=await proposeSchedule(db,f.principal,{projectId:f.manifest.projectId,manifest:{projectId:f.manifest.projectId,items:[other]},expectedRevisionId:null,idempotencyKey:crypto.randomUUID()})
 await expect(approveSchedule(db,f.principal,{...f.approval,batchId:batch.batchId,revisionId:batch.revisionId,sha256:batch.sha256,idempotencyKey:crypto.randomUUID()})).rejects.toMatchObject({code:'CONFLICT'})
},25000)
it('counts ordinary and monthly occasions independently with a global weekly cap across batches',async()=>{
 const f=await scheduleFixture(db,{kind:'month_release'});await approveSchedule(db,f.principal,f.approval)
 const ordinary=await appendScheduleFixtureItem(db,f,{kind:'ordinary',releaseCondition:null,localMinute:'2026-11-01T17:00'})
 const third=await appendScheduleFixtureItem(db,f,{kind:'ordinary',releaseCondition:null})
 const secondBatch=await proposeSchedule(db,f.principal,{projectId:f.manifest.projectId,manifest:{projectId:f.manifest.projectId,items:[ordinary,third]},expectedRevisionId:null,idempotencyKey:crypto.randomUUID()})
 await approveSchedule(db,f.principal,{...f.approval,batchId:secondBatch.batchId,revisionId:secondBatch.revisionId,sha256:secondBatch.sha256,idempotencyKey:crypto.randomUUID()})
 const fourth=await appendScheduleFixtureItem(db,f,{kind:'ordinary',releaseCondition:null})
 const finalBatch=await proposeSchedule(db,f.principal,{projectId:f.manifest.projectId,manifest:{projectId:f.manifest.projectId,items:[fourth]},expectedRevisionId:null,idempotencyKey:crypto.randomUUID()})
 await expect(approveSchedule(db,f.principal,{...f.approval,batchId:finalBatch.batchId,revisionId:finalBatch.revisionId,sha256:finalBatch.sha256,idempotencyKey:crypto.randomUUID()})).rejects.toMatchObject({code:'CONFLICT'})
},35000)
