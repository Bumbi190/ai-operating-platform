import {beforeAll,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {initializeNewsReviewDb} from './test-db'
import {sqlReviewFixture,prepareSql,literal} from './sql-fixtures.test-utils'
import {testSql} from '../../website-build/test-db'
let db:ReturnType<typeof initializeNewsReviewDb>
beforeAll(()=>{db=initializeNewsReviewDb()},30000)
function session(sql:string,onChunk?:(s:string)=>void){return new Promise<string>((resolve,reject)=>{
 const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',process.env.WEBSITE_BUILD_TEST_DATABASE_NAME!]);let out='',err=''
 p.stdout.on('data',c=>{out+=c;onChunk?.(out)});p.stderr.on('data',c=>err+=c);p.on('error',reject);p.on('close',code=>code===0?resolve(out):reject(Error(err)));p.stdin.end(sql)
})}
function signal(){let ready!:()=>void,failed!:(e:Error)=>void;const promise=new Promise<void>((yes,no)=>{ready=yes;failed=no});return {promise,ready,failed}}
function bindingInsert(f:any,binding:string){return 'insert into social_account_bindings(binding_id,project_id,platform,external_account_id,account_label,credential_source,verification,verified_at,bound_by) values('+[binding,f.input.projectId,'facebook','race-'+binding,'Race test','project_store','provider_attested'].map(literal).join(',')+',now(),'+literal('user:'+f.principal.userId)+');'}
function decision(f:any,v:any){return {projectId:f.input.projectId,postId:v.postId,revisionId:v.revisionId,sha256:testSql('select sha256 from social_content_revisions where id='+literal(v.revisionId)),decision:'approve',idempotencyKey:randomUUID()}}
it.each(['prepare','approve'] as const)('wall_clock_expiry_after_project_lock_wait_refuses_%s',async operation=>{
 const f=await sqlReviewFixture(db,48*3600000-10000),views=operation==='approve'?await prepareSql(f):[]
 const locked=signal(),expiry=new Date(Date.parse(f.snapshot.receipt.source.publishedAt)+48*3600000+250).toISOString()
 const holder=session('begin;select 1 from projects where id='+literal(f.input.projectId)+" for update;select 'project-locked';select pg_sleep(greatest(0,extract(epoch from ("+literal(expiry)+"::timestamptz-clock_timestamp()))));commit;",s=>{if(s.includes('project-locked'))locked.ready()})
 holder.catch(locked.failed);await locked.promise
 expect(Date.now()).toBeLessThan(Date.parse(expiry)-250)
 const query=operation==='approve'?'social_content_decide('+literal(f.principal)+','+literal(decision(f,views[0]))+')':'media_news_review_prepare('+literal(f.principal)+','+literal(f.input)+','+literal(f.snapshot)+')'
 const attempt=session('begin;set local role service_role;select '+query+';commit;').then(()=>null,e=>e as Error)
 await holder;expect((await attempt)?.message).toMatch(/REVIEW_REQUIRED/)
 expect(testSql('select count(*) from social_content_decisions where project_id='+literal(f.input.projectId))).toBe('0')
 if(operation==='prepare')expect(testSql('select count(*) from media_news_review_evidence where project_id='+literal(f.input.projectId))).toBe('0')
},30000)
it.each(['source','asset','binding','absent_binding'] as const)('approval_holds_%s_mutation_until_transaction_end',async target=>{
 const f=await sqlReviewFixture(db),binding=randomUUID()
 if(target==='binding'){testSql(bindingInsert(f,binding));f.snapshot.destinations[0]={channel:'facebook',bindingId:binding,accountId:'race-'+binding}}
 const views=await prepareSql(f),validated=signal(),input=decision(f,views[0])
 const reviewer=session('begin;set local role service_role;select social_content_decide('+literal(f.principal)+','+literal(input)+");select 'approval-validated';select pg_sleep(3);rollback;",s=>{if(s.includes('approval-validated'))validated.ready()})
 reviewer.catch(validated.failed);await validated.promise
 const mutation=target==='source'?'update media_news_items set url=url||\'-changed\' where id='+literal(f.snapshot.receipt.source.newsItemId):target==='asset'?"update assets set status='archived' where id="+literal(f.input.videoAssetId):target==='binding'?"update social_account_bindings set blocked_at=now(),blocked_reason='account_mismatch' where binding_id="+literal(binding):bindingInsert(f,binding)
 try{expect(()=>testSql("set lock_timeout='200ms';"+mutation,true)).toThrow(/lock timeout/)}finally{await reviewer}
 expect(testSql('select count(*) from social_content_decisions where project_id='+literal(f.input.projectId))).toBe('0')
},30000)
