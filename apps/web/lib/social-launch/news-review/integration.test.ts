import {beforeAll,afterAll,it,expect,vi} from 'vitest'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {encode} from 'jpeg-js'
import {initializeNewsReviewDb} from './test-db'
import {sqlReviewFixture,literal} from './sql-fixtures.test-utils'
import {testSql} from '../../website-build/test-db'
import {admitReviewVideo} from './admission'
import {newsReviewApi} from './api'
import {socialContentApi,socialContentMedia} from '../content/api'
import {proposeSocialContent,decideSocialContent} from '../content/store'
import {proposeSocialLaunchPlan,decideSocialLaunchPlan} from '../store'
const state=vi.hoisted(()=>({db:null as any,principal:null as any}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>state.db}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>({ok:true,...state.principal})}))
let dir=''
beforeAll(()=>{state.db=initializeNewsReviewDb();dir=mkdtempSync(join(tmpdir(),'news-review-integration-'))})
afterAll(()=>{vi.unstubAllGlobals();if(dir)rmSync(dir,{recursive:true,force:true})})
const post=(url:string,body:unknown)=>new Request('http://localhost'+url,{method:'POST',headers:{origin:'http://localhost',host:'localhost','content-type':'application/json'},body:JSON.stringify(body)})
it('prepare_read_review_and_invalidate_without_dispatch',async()=>{
 const f=await sqlReviewFixture(state.db);state.principal=f.principal
 const provider=vi.fn(()=>{throw Error('Provider network forbidden in review workflow')});vi.stubGlobal('fetch',provider)
 const costBefore=testSql('select count(*) from cost_events where project_id='+literal(f.input.projectId))
 const noDispatch=()=>{
  expect(testSql('select count(*) from runs where project_id='+literal(f.input.projectId))).toBe('0')
  expect(testSql('select count(*) from social_publications where project_id='+literal(f.input.projectId))).toBe('0')
  expect(testSql('select count(*) from cost_events where project_id='+literal(f.input.projectId))).toBe(costBefore)
  expect(testSql('select status||\'/\'||video_status from media_scripts where id='+literal(f.input.scriptId))).toBe('pending_review/none')
  expect(provider).not.toHaveBeenCalled()
 }
 const videoPath=join(dir,'synthetic.mp4'),manifestPath=join(dir,'receipt.json');writeFileSync(videoPath,f.bytes.get(f.input.videoAssetId)!)
 writeFileSync(manifestPath,JSON.stringify({...f.snapshot.receipt,usage:[]}))
 await expect(admitReviewVideo(f.principal,{projectId:f.input.projectId,scriptId:f.input.scriptId,videoPath,manifestPath,apply:true})).rejects.toMatchObject({code:'MISSING_USAGE_EVIDENCE'})
 expect(testSql('select count(*) from social_content_posts where project_id='+literal(f.input.projectId))).toBe('0');noDispatch()
 const objects=new Map<string,Uint8Array>(),uploads:Uint8Array[]=[]
 state.db.storage={from:()=>({
  upload:async(path:string,bytes:Uint8Array)=>{objects.set(path,new Uint8Array(bytes));uploads.push(new Uint8Array(bytes));return {data:{path},error:null}},
  download:async(path:string)=>{const b=objects.get(path)??f.bytes.get(path.split('/').at(-1)!);return {data:b?new Blob([b as BlobPart]):null,error:b?null:{message:'missing'}}},
  remove:async(paths:string[])=>{paths.forEach(p=>objects.delete(p));return {data:null,error:null}}
 })}
 // Extend only the local SDK-to-psql transport for the foundation uuid[] column.
 // Production admission/store logic remains real and all authority is real SQL.
 const from=state.db.from.bind(state.db)
 state.db.from=(table:string)=>{
  const chain=from(table);if(table!=='asset_provenance')return chain
  chain.insert=(row:Record<string,unknown>)=>({select:()=>({single:async()=>{
   try{const sql='insert into asset_provenance('+Object.keys(row).join(',')+') values('+Object.entries(row).map(([k,v])=>k==='reference_asset_ids'?'array['+(v as string[]).map(literal).join(',')+']::uuid[]':literal(v)).join(',')+') returning to_jsonb(asset_provenance);'
    return {data:JSON.parse(testSql(sql,true)),error:null}
   }catch(e){return {data:null,error:{message:(e as Error).message}}}
  }})});return chain
 }
 writeFileSync(manifestPath,JSON.stringify(f.snapshot.receipt))
 const dry=await admitReviewVideo(f.principal,{projectId:f.input.projectId,scriptId:f.input.scriptId,videoPath,manifestPath,apply:false});expect(dry.dryRun).toBe(true);expect(uploads).toHaveLength(0)
 const admitted=await admitReviewVideo(f.principal,{projectId:f.input.projectId,scriptId:f.input.scriptId,videoPath,manifestPath,apply:true});expect(admitted.videoAssetId).toBeTruthy();expect(uploads).toHaveLength(1)
 const input={...f.input,videoAssetId:admitted.videoAssetId!},first=await newsReviewApi(post('/api/media/news-review',input));expect(first.status).toBe(200);const original=await first.json();expect(original).toHaveLength(2);noDispatch()
 // The caller lost the first response; reusing its exact request returns the same packet.
 const retried=await newsReviewApi(post('/api/media/news-review',input));expect(retried.status).toBe(200);expect((await retried.json()).map((v:any)=>[v.postId,v.revisionId,v.evidenceSha256])).toEqual(original.map((v:any)=>[v.postId,v.revisionId,v.evidenceSha256]))
 const get=()=>socialContentApi(new Request('http://localhost/api/social-content?projectId='+input.projectId))
 const current=await (await get()).json(),p=current.posts[0];expect(p.newsReview.review_packet_ready).toBe(true);expect(p.revision.media[0].id).toBe(input.videoAssetId)
 const approved=await socialContentApi(post('/api/social-content',{operation:'decide',projectId:input.projectId,postId:p.id,revisionId:p.revision.id,sha256:p.revision.sha256,decision:'approve',idempotencyKey:randomUUID()}));expect(approved.status).toBe(200);expect((await approved.json()).posts.find((x:any)=>x.id===p.id).status).toBe('approved');noDispatch()
 const binding=randomUUID();testSql('insert into social_account_bindings(binding_id,project_id,platform,external_account_id,account_label,credential_source,verification,verified_at,bound_by) values('+[binding,input.projectId,p.revision.draft.channel,'test-account','Test destination','project_store','provider_attested'].map(literal).join(',')+',now(),'+literal('user:'+f.principal.userId)+');')
 const changed=await (await get()).json();expect(changed.posts.find((x:any)=>x.id===p.id).newsReview.review_packet_ready).toBe(false);expect((await newsReviewApi(post('/api/media/news-review',input))).status).toBe(409);noDispatch()
 testSql('update media_news_items set raw_output=jsonb_set(raw_output,\'{source_published_at}\',to_jsonb((now()-interval \'49 hours\')::text)) where id='+literal(f.snapshot.receipt.source.newsItemId))
 const stale=await (await get()).json();expect(stale.posts[0].newsReview.blockers).toContain('news_source_expired');noDispatch()
},120000)
it('ordinary_jpeg_project_keeps_exact_private_review_path',async()=>{
 const f=await sqlReviewFixture(state.db);state.principal=f.principal
 const old=f.snapshot.planRevisionId,plan=await proposeSocialLaunchPlan(state.db,f.principal,{projectId:f.input.projectId,expectedRevisionId:old,idempotencyKey:randomUUID(),choices:[{channel:'facebook',format:'image',purpose:'Family photographs',cadence:'weekly'}]})
 await decideSocialLaunchPlan(state.db,f.principal,{projectId:f.input.projectId,revisionId:plan.currentRevision!.id,sha256:plan.currentRevision!.sha256,decision:'approve',idempotencyKey:randomUUID()})
 const bytes=encode({data:Buffer.alloc(4*4*4,255),width:4,height:4},50).data,sha=createHash('sha256').update(bytes).digest('hex'),asset=randomUUID()
 testSql('insert into assets(id,project_id,kind,mime_type,byte_size,checksum_sha256,storage_bucket,storage_path) values('+[asset,f.input.projectId,'image','image/jpeg'].map(literal).join(',')+','+bytes.length+','+[sha,'media-assets-private',asset].map(literal).join(',')+');')
 state.db.storage={from:()=>({download:async()=>({data:new Blob([new Uint8Array(bytes)]),error:null})})}
 const prepared=await proposeSocialContent(state.db,f.principal,{projectId:f.input.projectId,postId:randomUUID(),expectedRevisionId:null,planRevisionId:plan.currentRevision!.id,idempotencyKey:randomUUID(),draft:{channel:'facebook',format:'image',title:'Family',text:'An ordinary image',linkUrl:null,mediaIds:[asset],mediaBrief:'',scheduledAt:null}}),p=prepared.posts[0]
 expect(p.newsReview).toBeUndefined()
 const approved=await decideSocialContent(state.db,f.principal,{projectId:f.input.projectId,postId:p.id,revisionId:p.revision.id,sha256:p.revision.sha256,decision:'approve',idempotencyKey:randomUUID()});expect(approved.posts[0].status).toBe('approved')
 const response=await socialContentMedia(new Request('http://localhost/api/social-content/media?'+new URLSearchParams({projectId:f.input.projectId,assetId:asset,sha256:sha}),{headers:{range:'bytes=0-9'}}))
 expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('image/jpeg');expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes)
 expect(testSql('select count(*) from social_publications where project_id='+literal(f.input.projectId))).toBe('0')
},30000)
