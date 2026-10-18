import 'server-only'
import type {SocialContentPrincipal,SocialContentView} from '../content/types'
import {resolveNewsEvidence,reviewRows,type ReviewDb} from './verify'
import {newsEvidenceSha256} from './contract'
import {reviewDatabaseError} from './store'
import {NewsReviewError,type NewsReviewDetails,type NewsReviewRpcClient} from './types'
export async function readNewsReview(db:ReviewDb,p:SocialContentPrincipal,input:{projectId:string;postId:string},nowMs:number):Promise<NewsReviewDetails>{
 if(!input||Object.keys(input).length!==2||Object.keys(input).some(k=>!['projectId','postId'].includes(k))||[input.projectId,input.postId].some(v=>typeof v!=='string'||!/^[-a-f0-9]{36}$/i.test(v)))throw new NewsReviewError('INVALID_BODY')
 if(!p.allowedProjectIds.includes(input.projectId))throw new NewsReviewError('NOT_FOUND')
 const {data,error}=await (db as unknown as NewsReviewRpcClient).rpc('media_news_review_read',{p_principal:p,p_input:input})
 if(error)throw reviewDatabaseError(error)
 const raw=data as NewsReviewDetails|null
 if(!raw||raw.projectId!==input.projectId||raw.postId!==input.postId||raw.canPublish!==false||raw.dispatchEnabled!==false||typeof raw.review_packet_ready!=='boolean'||!Array.isArray(raw.blockers)||!Array.isArray(raw.publicationBlockers))throw new NewsReviewError('UNAVAILABLE')
 const result:NewsReviewDetails={projectId:raw.projectId,postId:raw.postId,revisionId:raw.revisionId,evidenceSha256:raw.evidenceSha256,review_packet_ready:raw.review_packet_ready,blockers:[...raw.blockers],publicationBlockers:[...raw.publicationBlockers],canPublish:false,dispatchEnabled:false,source:raw.source?{url:raw.source.url,publishedAt:raw.source.publishedAt}:null,creativeVersion:raw.creativeVersion??null,video:raw.video?{id:raw.video.id,sha256:raw.video.sha256,byteSize:raw.video.byteSize}:null,imageCount:3,voiceLabel:'Victoria',aiDisclosure:'AI-GENERATED / EDITORIAL ILLUSTRATIONS'}
 if(result.review_packet_ready){
  try{
   const [e]=await reviewRows(db,'media_news_review_evidence',{project_id:input.projectId,revision_id:result.revisionId})
   if(!e||e.snapshot_sha256!==result.evidenceSha256)throw new NewsReviewError('MISSING_RENDER_EVIDENCE')
   const current=await resolveNewsEvidence(db,p,{projectId:input.projectId,scriptId:e.script_id,videoAssetId:e.video_asset_id,idempotencyKey:e.root_idempotency_key},nowMs)
   if(newsEvidenceSha256(current)!==result.evidenceSha256)throw new NewsReviewError('MEDIA_CHANGED')
  }catch(error){
   if(!(error instanceof NewsReviewError)||['UNAVAILABLE','NOT_FOUND','INVALID_BODY'].includes(error.code))throw error
   const reason=error.code==='SOURCE_EXPIRED'?'news_source_expired':error.code==='STOPPED'?'news_project_stopped':error.code==='MEDIA_CHANGED'?'news_evidence_changed':'news_evidence_required'
   result.review_packet_ready=false;result.blockers=[...new Set([...result.blockers,reason])];result.publicationBlockers=[...new Set([...result.publicationBlockers,reason])]
  }
 }
 return result
}
export async function enrichNewsContent(db:ReviewDb,p:SocialContentPrincipal,view:SocialContentView):Promise<SocialContentView>{
 const posts:SocialContentView['posts']=[]
 for(const post of view.posts){
  if(!post.newsReview){posts.push(post);continue}
  const review=await readNewsReview(db,p,{projectId:view.project.id,postId:post.id},Date.now())
  posts.push({...post,newsReview:{...review,channel:post.revision.draft.channel,destinationLabel:post.revision.binding?.label??post.revision.binding?.accountId??null},...(!review.review_packet_ready?{status:'needs_review' as const,requirements:[...new Set([...post.requirements,...review.blockers])]}:{})})
 }
 return {...view,posts}
}