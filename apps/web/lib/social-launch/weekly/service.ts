import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {SocialLaunchPrincipal} from '../types'
import {contentFields,contentId} from '../content/validate'
import {planMarketingWeek} from './planning'
import type {WeeklyChannel,WeeklyOccasion,WeeklyPlan} from './types'
const FAMILY='77cda551-57c9-4dc0-b019-1bb6438777f7'
type Db=ReturnType<typeof createAdminClient>
export type WeeklyScope={projectId:string;conversationId:string;weekStart:string}
export type WeeklyDraftInput={slotKey:string;channel:WeeklyChannel;assetId:string;text:string;title:string;sourceReferences:string[]}
export type WeeklySave=WeeklyScope&{generation:number;contextHash:string;drafts:WeeklyDraftInput[];idempotencyKey:string}
export class WeeklyError extends Error{constructor(public code:'NOT_FOUND'|'INVALID_BODY'|'CONFLICT'|'REVIEW_REQUIRED'|'DUPLICATE'|'UNAVAILABLE'){super(code)}}
function scope(p:SocialLaunchPrincipal,input:WeeklyScope){
 try{contentId(p.userId);contentId(input.projectId);contentId(input.conversationId)}catch{throw new WeeklyError('INVALID_BODY')}
 if(input.projectId!==FAMILY||!p.allowedProjectIds.includes(input.projectId))throw new WeeklyError('NOT_FOUND')
}
async function rpc(db:Db,p:SocialLaunchPrincipal,name:string,input:unknown):Promise<any>{
 const {data,error}=await (db as any).rpc(name,{p_principal:p,p_input:input})
 if(error||!data){const code=error?.code==='P0002'||error?.code==='42501'?'NOT_FOUND':(['INVALID_BODY','CONFLICT','REVIEW_REQUIRED','DUPLICATE'] as const).find(c=>error?.message?.includes('SOCIAL_WEEKLY_'+c))??'UNAVAILABLE';throw new WeeklyError(code)}
 return data
}
export async function getWeeklyContext(db:Db,p:SocialLaunchPrincipal,input:WeeklyScope,now=new Date().toISOString()){
 try{contentFields(input,['projectId','conversationId','weekStart'])}catch{throw new WeeklyError('INVALID_BODY')}
 scope(p,input);planMarketingWeek(input.weekStart,now,[],false)
 const raw=await rpc(db,p,'social_weekly_context',input),occasions:WeeklyOccasion[]=[],missing:string[]=[]
 const jobs=raw.jobs as any[],posts=raw.content.posts as any[]
 for(const j of jobs)if(j.state!=='cancelled'||j.publicationId)occasions.push({key:j.occasionId??j.id,kind:j.kind,scheduledAt:j.scheduledAt,channels:[j.channel],sourcePostIds:[j.postId]})
 for(const post of posts){
  const t=post.revision.draft.scheduledAt;if(!t||jobs.some(j=>j.postId===post.id&&j.revisionId===post.revision.id))continue
  occasions.push({key:post.id,kind:'ordinary',scheduledAt:t,channels:[post.revision.draft.channel],sourcePostIds:[post.id]})
 }
 const plan:WeeklyPlan=planMarketingWeek(input.weekStart,now,occasions,raw.monthlyRuleEnabled)
 for(const s of plan.slots)if(s.kind==='month_release')missing.push('monthly_catalog_missing:'+s.releaseMonth)
 plan.slots=plan.slots.filter(s=>s.kind==='ordinary')
 if(!raw.profile.revision||!raw.profile.revision.profile.description?.trim())missing.push('project_facts_missing')
 if(!raw.content.planApproved)missing.push('channel_plan_unapproved')
 for(const channel of ['facebook','instagram']){
  if(!raw.content.plannedChannels.some((c:any)=>c.channel===channel))missing.push('channel_unplanned:'+channel)
  if(!raw.bindings.some((b:any)=>b.channel===channel&&!b.blocked&&b.verification==='provider_attested'))missing.push('account_unverified:'+channel)
 }
 if(!raw.describedAssets.length)missing.push('described_image_missing')
 return {project:raw.content.project,contextHash:raw.contextHash,profile:raw.profile.revision,assets:raw.describedAssets,history:raw.history,posts:raw.content.posts,plan,missing:[...plan.missing,...missing],sourceReferences:raw.profile.revision?['profile:'+raw.profile.revision.sha256]:[],workspaceUrl:raw.content.workspaceUrl,preparation:raw.preparation??null,publicationAuthority:false as const}
}
export async function prepareWeeklyDrafts(db:Db,p:SocialLaunchPrincipal,input:WeeklySave){
 try{contentFields(input,['projectId','conversationId','weekStart','generation','contextHash','drafts','idempotencyKey']);if(input.generation!==1||!/^\w[\w-]{0,99}$/.test(input.idempotencyKey)||!/^\w{64}$/.test(input.contextHash)||!Array.isArray(input.drafts)||input.drafts.length<2||input.drafts.length>4)throw Error()}catch{throw new WeeklyError('INVALID_BODY')}
 scope(p,input)
 // Do not let callers provide execution times or authority fields; derive these from fresh vacancies.
 for(const d of input.drafts){try{contentFields(d,['slotKey','channel','assetId','text','title','sourceReferences']);contentId(d.assetId);if(!['facebook','instagram'].includes(d.channel)||typeof d.text!=='string'||!d.text.trim()||d.text.length>2200||typeof d.title!=='string'||!d.title.trim()||d.title.length>150||!Array.isArray(d.sourceReferences))throw Error()}catch{throw new WeeklyError('INVALID_BODY')}}
 const view=await getWeeklyContext(db,p,{projectId:input.projectId,conversationId:input.conversationId,weekStart:input.weekStart})
 if(view.missing.some(m=>['project_facts_missing','channel_plan_unapproved','described_image_missing'].includes(m)||m.startsWith('account_unverified:')||m.startsWith('channel_unplanned:')))throw new WeeklyError('REVIEW_REQUIRED')
 const drafts=input.drafts.map(d=>{
  // Saved preparations retain the original slot identities for identical retries.
  const slot=view.plan.slots.find(s=>s.key===d.slotKey)
  const local=d.slotKey.replace(/:ordinary$/,'')
  const saved=view.preparation?.posts?.some((x:any)=>x.slotKey===d.slotKey&&x.channel===d.channel)
  if(!slot&&!saved||!view.assets.some((a:any)=>a.id===d.assetId)||JSON.stringify(d.sourceReferences)!==JSON.stringify(view.sourceReferences))throw new WeeklyError('CONFLICT')
  return {...d,scheduledAt:slot?.scheduledAt??resolveSavedTime(local)}
 })
 if(!view.preparation&&(drafts.length!==view.plan.slots.length*2||view.plan.slots.some(s=>['facebook','instagram'].some(c=>drafts.filter(d=>d.slotKey===s.key&&d.channel===c).length!==1))))throw new WeeklyError('CONFLICT')
 return rpc(db,p,'social_weekly_save',{...input,drafts})
}
import {resolveStockholmSchedule as resolveSavedTime} from '../scheduling/time'
