import {beforeAll,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {initializeNewsReviewDb} from './test-db'
import {sqlReviewFixture,prepareSql,literal} from './sql-fixtures.test-utils'
import {testSql} from '../../website-build/test-db'
import {decideSocialContent,proposeSocialContent,readSocialContent} from '../content/store'
import {canonicalNewsJson,newsEvidenceSha256} from './contract'
let db:ReturnType<typeof initializeNewsReviewDb>
beforeAll(()=>{db=initializeNewsReviewDb()},30000)
it('evidence_rls_append_only_and_composite_scope',async()=>{
 const f=await sqlReviewFixture(db),views=await prepareSql(f),post=views[0].postId
 for(const role of ['anon','authenticated'])expect(()=>testSql('set role '+role+';select * from media_news_review_evidence;')).toThrow()
 for(const mutation of ["update media_news_review_evidence set snapshot='{}'","delete from media_news_review_evidence","truncate media_news_review_evidence"])expect(()=>testSql(mutation,true)).toThrow()
 expect(testSql("select count(*) from media_news_review_evidence where project_id="+literal(f.input.projectId))).toBe('2')
 expect(()=>testSql("insert into media_news_review_evidence(project_id,post_id,revision_id,revision_sha256,script_id,video_asset_id,channel,snapshot,snapshot_sha256,root_idempotency_key,request,created_by) select project_id,post_id,"+literal(randomUUID())+",revision_sha256,script_id,video_asset_id,channel,snapshot,snapshot_sha256,'foreign',request,created_by from media_news_review_evidence where post_id="+literal(post))).toThrow()
})
it('reserved_receipt_cannot_be_minted_by_authenticated_client',async()=>{
 const f=await sqlReviewFixture(db),asset=randomUUID()
 testSql("insert into assets select "+literal(asset)+",project_id,kind,mime_type,byte_size,checksum_sha256,width,height,duration_ms,visibility,status,storage_bucket,storage_path||'-forged',created_at from assets where id="+literal(f.input.videoAssetId))
 expect(()=>testSql("set role authenticated;insert into asset_provenance(asset_id,source,adapter_version,provider_metadata) values("+literal(asset)+",'derived','the-prompt-review-admission-v1',"+literal({receipt:f.snapshot.receipt})+");")).toThrow(/REVIEW_ADMISSION_SERVER_ONLY/)
})
it('atomic_multichannel_retry_and_changed_snapshot_conflict',async()=>{
 const f=await sqlReviewFixture(db),first=await prepareSql(f);expect(await prepareSql(f)).toEqual(first)
 f.input.scriptId=randomUUID();await expect(prepareSql(f)).rejects.toThrow()
 expect(testSql("select count(*) from media_news_review_evidence where project_id="+literal(f.input.projectId))).toBe('2')
 const g=await sqlReviewFixture(db),initial=await prepareSql(g);g.snapshot.destinations[0].accountId='changed'
 await expect(prepareSql(g)).rejects.toThrow()
 expect(initial).toHaveLength(2)
})
it('canonical_hash_agrees_across_jsonb_unicode_and_word_key_order',async()=>{
 const f=await sqlReviewFixture(db)
 expect(testSql("select encode(sha256(convert_to(media_news_canonical_json("+literal(f.snapshot)+"),'UTF8')),'hex')")).toBe(newsEvidenceSha256(f.snapshot))
 const example={z:['å','line\n"quote"'],a:{word:'AI',endMs:100,startMs:0}}
 expect(testSql('select media_news_canonical_json('+literal(example)+')')).toBe(canonicalNewsJson(example))
})
it('concurrent_prepare_has_one_result_per_channel',async()=>{
 const f=await sqlReviewFixture(db),sql="set role service_role;select media_news_review_prepare("+literal(f.principal)+','+literal(f.input)+','+literal(f.snapshot)+");"
 const run=()=>new Promise<string>((resolve,reject)=>{const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',process.env.WEBSITE_BUILD_TEST_DATABASE_NAME!]);let out='',err='';p.stdout.on('data',c=>out+=c);p.stderr.on('data',c=>err+=c);p.on('close',code=>code===0?resolve(out.trim()):reject(Error(err)));p.stdin.end(sql)})
 const [a,b]=await Promise.all([run(),run()]);expect(JSON.parse(a)).toEqual(JSON.parse(b));expect(testSql("select count(*) from media_news_review_evidence where project_id="+literal(f.input.projectId))).toBe('2')
},30000)
it('late_evidence_cannot_retrofit_old_decision',async()=>{
 const f=await sqlReviewFixture(db),postId=randomUUID(),receipt=f.snapshot.receipt
 const content=await proposeSocialContent(db,f.principal,{projectId:f.input.projectId,postId,expectedRevisionId:null,planRevisionId:f.snapshot.planRevisionId,idempotencyKey:randomUUID(),draft:{channel:'facebook',format:'video',title:'AI agents',text:receipt.transcript,linkUrl:receipt.source.url,mediaIds:[f.input.videoAssetId],mediaBrief:'AI editorial illustrations',scheduledAt:null}})
 const post=content.posts.find(p=>p.id===postId)!
 // Model a real historical decision before the new evidence requirement existed.
 testSql("insert into social_content_decisions(project_id,post_id,revision_id,sha256,decision,idempotency_key,decided_by) values("+[f.input.projectId,postId,post.revision.id,post.revision.sha256,'approve',randomUUID(),f.principal.userId].map(literal).join(',')+")",true)
 const row={project_id:f.input.projectId,post_id:postId,revision_id:post.revision.id,revision_sha256:post.revision.sha256,script_id:f.input.scriptId,video_asset_id:f.input.videoAssetId,channel:'facebook',snapshot:f.snapshot,snapshot_sha256:newsEvidenceSha256(f.snapshot),root_idempotency_key:'late',request:f.input,created_by:f.principal.userId}
 expect(()=>testSql('insert into media_news_review_evidence('+Object.keys(row).join(',')+') values('+Object.values(row).map(literal).join(',')+')',true)).toThrow(/SOCIAL_CONTENT_REVIEW_REQUIRED/)
})
it('concurrent_review_vs_changed_revision',async()=>{
 const f=await sqlReviewFixture(db),views=await prepareSql(f),content=await readSocialContent(db,f.principal,{projectId:f.input.projectId}),post=content.posts.find(p=>p.id===views[0].postId)!
 await proposeSocialContent(db,f.principal,{projectId:f.input.projectId,postId:post.id,expectedRevisionId:post.revision.id,planRevisionId:post.revision.planRevisionId,idempotencyKey:randomUUID(),draft:{...post.revision.draft,text:'Changed caption'}})
 await expect(decideSocialContent(db,f.principal,{projectId:f.input.projectId,postId:post.id,revisionId:post.revision.id,sha256:post.revision.sha256,decision:'approve',idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'REVISION_CONFLICT'})
 const newer=await readSocialContent(db,f.principal,{projectId:f.input.projectId}),p=newer.posts.find(p=>p.id===post.id)!
 await expect(decideSocialContent(db,f.principal,{projectId:f.input.projectId,postId:p.id,revisionId:p.revision.id,sha256:p.revision.sha256,decision:'approve',idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'REVIEW_REQUIRED'})
})
it('expired_or_stopped_cannot_approve',async()=>{
 const f=await sqlReviewFixture(db),views=await prepareSql(f),content=await readSocialContent(db,f.principal,{projectId:f.input.projectId}),p=content.posts.find(p=>p.id===views[0].postId)!
 testSql("update media_news_items set raw_output=jsonb_set(raw_output,'{source_published_at}',to_jsonb((now()-interval '49 hours')::text)) where id="+literal(f.snapshot.receipt.source.newsItemId))
 await expect(decideSocialContent(db,f.principal,{projectId:f.input.projectId,postId:p.id,revisionId:p.revision.id,sha256:p.revision.sha256,decision:'approve',idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 await expect(prepareSql(f)).rejects.toThrow()
 testSql("update projects set execution_paused=true where id="+literal(f.input.projectId))
 await expect(prepareSql(f)).rejects.toThrow()
})

it('server_wrapper_builds_evidence_without_accepting_client_flags',async()=>{
 const {prepareNewsReview}=await import('./store')
 const f=await sqlReviewFixture(db)
 expect(await prepareNewsReview(db,f.principal,f.input,f.now)).toHaveLength(2)
 await expect(prepareNewsReview(db,f.principal,{...f.input,rightsVerified:true} as any,f.now)).rejects.toMatchObject({code:'INVALID_BODY'})
})
it('initial_install_refuses_unattributable_preexisting_admissions',async()=>{
 const {readFileSync,readdirSync}=await import('node:fs'),{resolve}=await import('node:path')
 const f=await sqlReviewFixture(db),dir=resolve(process.cwd(),'supabase/migrations'),file=readdirSync(dir).find(f=>f.endsWith('_media_news_review_evidence.sql'))!
 const source=readFileSync(resolve(dir,file),'utf8'),prefix=source.slice(0,source.indexOf('create table if not exists public.media_news_review_evidence'))
 expect(()=>testSql('begin;drop trigger media_news_review_reserved_provenance on asset_provenance;'+prefix+'rollback;')).toThrow(/REVIEW_ADMISSION_PREEXISTING_RECONCILIATION_REQUIRED/)
})
it('second_channel_failure_rolls_back_first_channel',async()=>{
 const f=await sqlReviewFixture(db)
 testSql("insert into social_content_posts(id,project_id,created_by) select gen_random_uuid(),"+literal(f.input.projectId)+','+literal(f.principal.userId)+' from generate_series(1,99)')
 await expect(prepareSql(f)).rejects.toThrow(/LIMIT_REACHED/)
 expect(testSql("select count(*) from social_content_posts where project_id="+literal(f.input.projectId))).toBe('99')
 expect(testSql("select count(*) from media_news_review_evidence where project_id="+literal(f.input.projectId))).toBe('0')
})
it('new_ingestion_does_not_refresh_original_49_hour_source',async()=>{
 const f=await sqlReviewFixture(db,49*3600000)
 await expect(prepareSql(f)).rejects.toThrow(/news_source_expired/)
 expect(testSql("select count(*) from media_news_review_evidence where project_id="+literal(f.input.projectId))).toBe('0')
 const future=await sqlReviewFixture(db,-16*60000)
 await expect(prepareSql(future)).rejects.toThrow(/news_source_expired/)
})
it('actual_concurrent_edit_prevents_old_revision_approval',async()=>{
 const f=await sqlReviewFixture(db),views=await prepareSql(f),content=await readSocialContent(db,f.principal,{projectId:f.input.projectId}),post=content.posts.find(p=>p.id===views[0].postId)!
 const edit={projectId:f.input.projectId,postId:post.id,expectedRevisionId:post.revision.id,planRevisionId:post.revision.planRevisionId,idempotencyKey:randomUUID(),draft:{...post.revision.draft,text:'Concurrent edit'}}
 const decision={projectId:f.input.projectId,postId:post.id,revisionId:post.revision.id,sha256:post.revision.sha256,decision:'approve',idempotencyKey:randomUUID()}
 let signal!:()=>void,failSignal!:(e:Error)=>void
 const locked=new Promise<void>((resolve,reject)=>{signal=resolve;failSignal=reject})
 const session=(sql:string,onChunk?:(s:string)=>void)=>new Promise<string>((resolve,reject)=>{const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',process.env.WEBSITE_BUILD_TEST_DATABASE_NAME!]);let out='',err='';p.stdout.on('data',c=>{out+=c;onChunk?.(out)});p.stderr.on('data',c=>err+=c);p.on('close',code=>code===0?resolve(out):reject(Error(err)));p.stdin.end(sql)})
 const writer=session("begin;set local role service_role;select 1 from projects where id="+literal(f.input.projectId)+" for update;select 'project-locked';select pg_sleep(0.2);select social_content_save("+literal(f.principal)+','+literal(edit)+");commit;",s=>{if(s.includes('project-locked'))signal()})
 writer.catch(failSignal);await locked
 const reviewer=session("set role service_role;select social_content_decide("+literal(f.principal)+','+literal(decision)+");").then(()=>null,e=>e as Error)
 await writer;expect((await reviewer)?.message).toMatch(/REVISION_CONFLICT/)
 expect(testSql("select count(*) from social_content_decisions where post_id="+literal(post.id))).toBe('0')
},30000)
