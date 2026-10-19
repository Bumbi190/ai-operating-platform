import 'server-only'
import type {SupabaseClient} from '@supabase/supabase-js'
import type {Database} from '@/lib/supabase/types'
import type {SocialContentPrincipal} from '../content/types'
import {checkFreshRelevantNews} from '@/lib/media/news-freshness'
import {digest,canonicalNewsJson,parseRenderReceipt,parsePrepareNewsReview,renderReceiptSha256,parseNewsEvidenceSnapshot} from './contract'
import {NewsReviewError,type RenderReceipt,type PrepareNewsReviewInput,type NewsEvidenceSnapshot} from './types'
export type ReviewDb=SupabaseClient<Database>
export async function reviewRows(db:ReviewDb,table:string,filters:Record<string,unknown>):Promise<any[]>{
 try{let q=(db as any).from(table).select('*');for(const [k,v] of Object.entries(filters))q=v===null?q.is(k,null):q.eq(k,v)
 const {data,error}=await q;if(error||!Array.isArray(data))throw new NewsReviewError('UNAVAILABLE');return data
 }catch(e){if(e instanceof NewsReviewError)throw e;throw new NewsReviewError('UNAVAILABLE')}
}
export async function authorizeNewsProject(db:ReviewDb,p:SocialContentPrincipal,projectId:string){
 if(!p.allowedProjectIds.includes(projectId))throw new NewsReviewError('NOT_FOUND')
 const [project]=await reviewRows(db,'projects',{id:projectId})
 if(!project||project.owner_id!==p.userId)throw new NewsReviewError('NOT_FOUND')
 const {error}=await (db as any).rpc('social_content_active',{p_project:projectId})
 if(error)throw new NewsReviewError(error.message?.includes('STOPPED')?'STOPPED':'UNAVAILABLE')
}
export function captionText(script:{captions?:unknown;hashtags?:unknown;cta?:unknown}):string{
 if(!Array.isArray(script.captions)||!script.captions.every(s=>typeof s==='string')||!Array.isArray(script.hashtags)||!script.hashtags.every(s=>typeof s==='string')||script.cta!==null&&script.cta!==undefined&&typeof script.cta!=='string')throw new NewsReviewError('INVALID_BODY')
 return [script.captions.join('\n'),script.hashtags.join(' '),script.cta??''].filter(Boolean).join('\n')
}
export async function readVerifiedAsset(db:ReviewDb,projectId:string,identity:{id:string;sha256:string;byteSize:number},kind:string):Promise<Uint8Array>{
 const [a]=await reviewRows(db,'assets',{id:identity.id,project_id:projectId})
 if(!a||a.kind!==kind||a.status!=='active'||a.visibility!=='internal'||a.storage_bucket!=='media-assets-private'||!a.storage_path||
 a.checksum_sha256!==identity.sha256||Number(a.byte_size)!==identity.byteSize||identity.byteSize>50*1024*1024||
 (kind==='video'&&a.mime_type!=='video/mp4')||(kind==='audio'&&a.mime_type!=='audio/mpeg')||(kind==='image'&&!['image/png','image/jpeg','image/webp'].includes(a.mime_type)))throw new NewsReviewError('MEDIA_CHANGED')
 const {data,error}=await db.storage.from(a.storage_bucket).download(a.storage_path)
 if(error||!data||data.size!==identity.byteSize)throw new NewsReviewError('MEDIA_CHANGED')
 const bytes=new Uint8Array(await data.arrayBuffer());if(digest(bytes)!==identity.sha256)throw new NewsReviewError('MEDIA_CHANGED')
 return bytes
}
export async function verifyReceiptReferences(db:ReviewDb,p:SocialContentPrincipal,input:unknown,nowMs:number):Promise<{receipt:RenderReceipt;planRevisionId:string;destinations:NewsEvidenceSnapshot['destinations']}>{
 if(!input||typeof input!=='object'||!Array.isArray((input as any).usage)||(input as any).usage.length!==3)throw new NewsReviewError('MISSING_USAGE_EVIDENCE')
 const r=parseRenderReceipt(input);await authorizeNewsProject(db,p,r.projectId)
 const [script]=await reviewRows(db,'media_scripts',{id:r.scriptId,project_id:r.projectId})
 if(!script||!script.news_item_id||script.video_status==='private_preview'||script.raw_output?.private_provider_preview!=null)throw new NewsReviewError('MISSING_SOURCE')
 if(script.news_item_id!==r.source.newsItemId||digest(script.script??'')!==r.scriptSha256||digest(script.hook??'')!==r.hookSha256||digest(captionText(script))!==r.captionSha256||script.voice_status!=='ready'||
 canonicalNewsJson(script.raw_output?.pilot_voice_receipt??null)!==canonicalNewsJson(r.voiceReceipt))throw new NewsReviewError('MEDIA_CHANGED')
 const [news]=await reviewRows(db,'media_news_items',{id:r.source.newsItemId,project_id:r.projectId})
 if(!news||news.url!==r.source.url||news.raw_output?.source_key!==r.source.key||Date.parse(news.raw_output?.source_published_at)!==Date.parse(r.source.publishedAt))throw new NewsReviewError('MISSING_SOURCE')
 const fresh=checkFreshRelevantNews({title:news.title,summary:news.summary??'',url:news.url,source:r.source.key,sourceLabel:r.source.key,publishedAt:new Date(news.raw_output.source_published_at)},nowMs)
 if(!fresh.eligible)throw new NewsReviewError(fresh.reason==='stale'||fresh.reason==='future_date'?'SOURCE_EXPIRED':'MISSING_SOURCE')
 if(r.qa.reviewedBy!==p.userId||Date.parse(r.qa.reviewedAt)>nowMs||r.usage.some(u=>u.reviewedBy!==p.userId||Date.parse(u.reviewedAt)>nowMs))throw new NewsReviewError('MISSING_USAGE_EVIDENCE')
 const refs=[...r.images,r.audio],usedCosts=new Set<string>()
 if(canonicalNewsJson(r.assetProvenanceIds)!==canonicalNewsJson(refs.map(a=>a.id)))throw new NewsReviewError('MISSING_RENDER_EVIDENCE')
 for(const [i,a] of refs.entries()){
  const [provenance]=await reviewRows(db,'asset_provenance',{asset_id:a.id})
  if(!provenance||provenance.source!=='generated'||provenance.simulated!==false||provenance.provider!==(i===3?'elevenlabs':'ideogram')||i===3&&provenance.model!==r.voiceReceipt.modelId)throw new NewsReviewError('MISSING_RENDER_EVIDENCE')
  if(!provenance.cost_event_id||!r.costEventIds.includes(provenance.cost_event_id))throw new NewsReviewError('MISSING_COST_PROVENANCE')
  const [cost]=await reviewRows(db,'cost_events',{id:provenance.cost_event_id,project_id:r.projectId});if(!cost||cost.provider!==provenance.provider)throw new NewsReviewError('MISSING_COST_PROVENANCE')
  usedCosts.add(provenance.cost_event_id)
  await readVerifiedAsset(db,r.projectId,a,i===3?'audio':'image')
 }
 if(usedCosts.size!==r.costEventIds.length)throw new NewsReviewError('MISSING_COST_PROVENANCE')
 const {data:plan,error}=await (db as any).rpc('social_launch_plan_read',{p_principal:p,p_input:{projectId:r.projectId}})
 if(error)throw new NewsReviewError('UNAVAILABLE')
 if(!plan?.currentRevision||plan.decision?.decision!=='approve'||plan.decision.revisionId!==plan.currentRevision.id||plan.decision.sha256!==plan.currentRevision.sha256)throw new NewsReviewError('PLAN_REQUIRED')
 const choices=plan.currentRevision.choices.filter((c:any)=>c.format==='video'&&['facebook','instagram','youtube'].includes(c.channel)).sort((a:any,b:any)=>a.channel.localeCompare(b.channel))
 if(!choices.length)throw new NewsReviewError('PLAN_REQUIRED')
 const destinations:NewsEvidenceSnapshot['destinations']=[]
 for(const choice of choices){
  const [binding]=await reviewRows(db,'social_account_bindings',{project_id:r.projectId,platform:choice.channel,superseded_at:null})
  if(binding?.blocked_at)throw new NewsReviewError('STOPPED')
  destinations.push({channel:choice.channel,bindingId:binding?.binding_id??null,accountId:binding?.external_account_id??null})
 }
 return {receipt:r,planRevisionId:plan.currentRevision.id,destinations}
}
export async function resolveNewsEvidence(db:ReviewDb,p:SocialContentPrincipal,input:PrepareNewsReviewInput,nowMs:number):Promise<NewsEvidenceSnapshot>{
 const x=parsePrepareNewsReview(input);await authorizeNewsProject(db,p,x.projectId)
 const [provenance]=await reviewRows(db,'asset_provenance',{asset_id:x.videoAssetId})
 if(!provenance||provenance.source!=='derived'||provenance.adapter_version!=='the-prompt-review-admission-v1'||provenance.simulated!==false)throw new NewsReviewError('MISSING_RENDER_EVIDENCE')
 const result=await verifyReceiptReferences(db,p,provenance.provider_metadata?.receipt,nowMs),r=result.receipt
 if(r.projectId!==x.projectId||r.scriptId!==x.scriptId||canonicalNewsJson(provenance.reference_asset_ids)!==canonicalNewsJson(r.assetProvenanceIds))throw new NewsReviewError('MISSING_RENDER_EVIDENCE')
 const video={id:x.videoAssetId,...r.video};await readVerifiedAsset(db,x.projectId,video,'video')
 return parseNewsEvidenceSnapshot({video,...result,receiptSha256:renderReceiptSha256(r),provenanceId:provenance.asset_id})
}
