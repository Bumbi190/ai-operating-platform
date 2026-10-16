import {beforeAll,it,expect} from 'vitest'
import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {initializePublicationDb} from './test-db'
import {publicationFixture,JPEG} from './fixtures.test-utils'
import {testSql} from '../../website-build/test-db'
import {publicationRead,publicationPrepare,publicationStep,publicationMediaLookup} from './store'
let db:ReturnType<typeof initializePublicationDb>
beforeAll(()=>{db=initializePublicationDb()})
const step=(f:Awaited<ReturnType<typeof publicationFixture>>,r:any,action:any,extra={})=>({projectId:f.projectId,postId:f.postId,publicationId:r.id,expectedVersion:r.version,action,...extra})
it('prepares one exact reviewed intent and never inserts a run or provider receipt',async()=>{
 const f=await publicationFixture(db),r=await publicationPrepare(db,f.p,f.input)
 expect(r.state).toBe('requested');expect(r.revisionId).toBe(f.post.revision.id);expect(r.accountId).toBe(f.accountId);expect(r.providerId).toBeNull();expect((await publicationRead(db,f.p,{projectId:f.projectId,postId:f.postId})).publication!.id).toBe(r.id)
 expect(testSql("select count(*) from runs where project_id='"+f.projectId+"';")).toBe('0')
})
it('refuses foreign ownership and post/project substitution without leaking a record',async()=>{
 const f=await publicationFixture(db),other=await publicationFixture(db)
 await expect(publicationRead(db,{...f.p,userId:other.p.allowedProjectIds[0]},{projectId:f.projectId,postId:f.postId})).rejects.toMatchObject({code:'NOT_FOUND'})
 await expect(publicationPrepare(db,f.p,{...f.input,postId:other.postId})).rejects.toMatchObject({code:'NOT_FOUND'})
 await expect(publicationRead(db,{...f.p,allowedProjectIds:[]},{projectId:f.projectId,postId:f.postId})).rejects.toMatchObject({code:'NOT_FOUND'})
})
it('requires the exact current approval, binding and content checksum',async()=>{
 const f=await publicationFixture(db)
 for(const patch of [{sha256:'0'.repeat(64)},{decisionId:f.postId},{bindingId:f.postId},{revisionId:f.postId}])await expect(publicationPrepare(db,f.p,{...f.input,...patch})).rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 expect(testSql("select count(*) from social_publications where project_id='"+f.projectId+"';")).toBe('0')
})
it('returns the existing intent for exact retries but refuses changed payloads',async()=>{
 const f=await publicationFixture(db),r=await publicationPrepare(db,f.p,f.input)
 expect((await publicationPrepare(db,f.p,f.input)).id).toBe(r.id)
 await expect(publicationPrepare(db,f.p,{...f.input,sha256:'0'.repeat(64)})).rejects.toMatchObject({code:'CONFLICT'})
 expect(testSql("select count(*) from social_publications where project_id='"+f.projectId+"';")).toBe('1')
})
it('admits one state transition and records published receipts without exposing capabilities',async()=>{
 const f=await publicationFixture(db),r=await publicationPrepare(db,f.p,f.input)
 const a=await publicationStep(db,f.p,step(f,r,'claim_create'));expect(a.changed).toBe(true);expect(a.record.state).toBe('publishing')
 expect((await publicationStep(db,f.p,step(f,r,'claim_create'))).changed).toBe(false)
 const done=await publicationStep(db,f.p,step(f,a.record,'complete',{providerId:'123_456',permalink:'https://www.facebook.com/123/posts/456'}))
 expect(done.record.state).toBe('published');expect(done.record.permalink).toBe('https://www.facebook.com/123/posts/456')
 expect((await publicationStep(db,f.p,step(f,done.record,'claim_create'))).changed).toBe(false)
 expect(testSql("select count(*) from social_publication_events where publication_id='"+r.id+"';")).toBe('3')
})
it('keeps Instagram processing separate from admitted publishing and never republishes uncertain writes',async()=>{
 const f=await publicationFixture(db,'instagram',true),r=await publicationPrepare(db,f.p,f.input)
 const created=await publicationStep(db,f.p,step(f,r,'claim_create',{capabilityHash:'c'.repeat(64)}));expect(created.record.state).toBe('creating')
 const ready=await publicationStep(db,f.p,step(f,created.record,'container_ready',{containerId:'12345'}));expect(ready.record.state).toBe('processing')
 const pub=await publicationStep(db,f.p,step(f,ready.record,'claim_publish'));expect(pub.record.state).toBe('publishing')
 const unknown=await publicationStep(db,f.p,step(f,pub.record,'uncertain',{failureCode:'provider_unavailable'}));expect(unknown.record.state).toBe('uncertain')
 expect((await publicationStep(db,f.p,step(f,unknown.record,'claim_publish'))).changed).toBe(false)
 const confirmed=await publicationStep(db,f.p,step(f,unknown.record,'confirm_published'));expect(confirmed.record.state).toBe('published');expect(confirmed.record.confirmation).toBe('container_status');expect(confirmed.record.permalink).toBeNull()
})
it.each(['stop','binding','media'])('rechecks %s before the next provider write',async(change)=>{
  const f=await publicationFixture(db,'instagram',true),r=await publicationPrepare(db,f.p,f.input)
  let v=(await publicationStep(db,f.p,step(f,r,'claim_create',{capabilityHash:'c'.repeat(64)}))).record
  v=(await publicationStep(db,f.p,step(f,v,'container_ready',{containerId:'12345'}))).record
  if(change==='stop')testSql("update projects set execution_paused=true where id='"+f.projectId+"';")
  if(change==='binding')testSql("update social_account_bindings set blocked_at=now(),blocked_reason='account_mismatch' where binding_id='"+f.bindingId+"';")
  if(change==='media')testSql("update assets set status='archived' where id='"+f.assetId+"';")
  await expect(publicationStep(db,f.p,step(f,v,'claim_publish'))).rejects.toMatchObject({code:change==='stop'?'STOPPED':'REVIEW_REQUIRED'})
  expect((await publicationRead(db,f.p,{projectId:f.projectId,postId:f.postId})).publication!.state).toBe('processing')
})
it('caps media lookup to the exact live request, correct hash and unexpired active image',async()=>{
 const f=await publicationFixture(db,'instagram',true),r=await publicationPrepare(db,f.p,f.input),hash=createHash('sha256').update('fixture-capability').digest('hex')
 const created=await publicationStep(db,f.p,step(f,r,'claim_create',{capabilityHash:hash}))
 expect(await publicationMediaLookup(db,{publicationId:r.id,keyHash:'0'.repeat(64)})).toBeNull()
 expect(await publicationMediaLookup(db,{publicationId:r.id,keyHash:hash})).toMatchObject({projectId:f.projectId,assetId:f.assetId,sha256:f.assetSha,mimeType:'image/jpeg'})
 const safe=await publicationRead(db,f.p,{projectId:f.projectId,postId:f.postId});expect(JSON.stringify(safe)).not.toContain(hash);expect(JSON.stringify(safe)).not.toContain('media-assets-private')
 testSql("update social_publications set capability_expires_at=now()-interval '1 second' where id='"+r.id+"';")
 expect(await publicationMediaLookup(db,{publicationId:r.id,keyHash:hash})).toBeNull()
})
it('locks both tables and functions away from web roles and keeps events immutable',async()=>{
 const f=await publicationFixture(db),r=await publicationPrepare(db,f.p,f.input)
 expect(testSql("select bool_and(relrowsecurity) from pg_class where oid in('social_publications'::regclass,'social_publication_events'::regclass);")).toBe('t')
 for(const role of ['anon','authenticated'])expect(testSql("select has_table_privilege('"+role+"','social_publications','select') or has_function_privilege('"+role+"','social_publication_prepare(jsonb,jsonb)','execute') or has_function_privilege('"+role+"','social_publication_media_lookup(jsonb)','execute');")).toBe('f')
 expect(()=>testSql("delete from social_publication_events where publication_id='"+r.id+"';",true)).toThrow()
})
it('two separate SQL claimers cannot both admit a provider write',async()=>{
 const f=await publicationFixture(db),r=await publicationPrepare(db,f.p,f.input),name=process.env.WEBSITE_BUILD_TEST_DATABASE_NAME!
 const literal=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb"
 async function claim(){return new Promise<any>((resolve,reject)=>{const child=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',name],{stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>code===0?resolve(JSON.parse(out.trim())):reject(Error(err)));child.stdin.end('set role service_role;select public.social_publication_step('+literal(f.p)+','+literal(step(f,r,'claim_create'))+');')})}
 const results=await Promise.all([claim(),claim()]);expect(results.filter(r=>r.changed)).toHaveLength(1);expect(results.every(r=>r.record.state==='publishing')).toBe(true)
})

it('cannot mark a request published without an observed provider id or container confirmation',async()=>{
 const f=await publicationFixture(db,'instagram',true),r=await publicationPrepare(db,f.p,f.input)
 const a=await publicationStep(db,f.p,step(f,r,'claim_create',{capabilityHash:'c'.repeat(64)}));await publicationStep(db,f.p,step(f,a.record,'container_ready',{containerId:'12345'}))
 expect(()=>testSql("update social_publications set state='published' where id='"+r.id+"';",true)).toThrow()
})

it('readiness and the SQL guard reject known unsupported dimensions before any request is admitted',async()=>{
 const f=await publicationFixture(db,'instagram',true,JPEG,{width:2000,height:2000})
 const {publicationPreview}=await import('./dispatch')
 const preview=await publicationPreview(db,f.p,{projectId:f.projectId,postId:f.postId})
 expect(preview.canRequest).toBe(false);expect(preview.blockers).toContain('image_dimensions_not_supported')
 await expect(publicationPrepare(db,f.p,f.input)).rejects.toMatchObject({code:'UNSUPPORTED'})
})
