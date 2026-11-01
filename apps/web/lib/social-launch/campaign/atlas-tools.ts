import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import {createAdminClient} from '@/lib/supabase/admin'
import {enqueueCampaign,readCampaign,cancelCampaign} from './store'
import {campaignId,campaignObject} from './validate'
import {CampaignError,type CampaignPrincipal} from './types'
const ids={projectId:{type:'string' as const,description:'Explicit owned target UUID from resolve_project_context.'},campaignId:{type:'string' as const,description:'A UUID, never an idempotency key. For a new campaign generate a fresh UUID; for status/cancel use the UUID from its actual saved receipt.'}}
const short={type:'object' as const,additionalProperties:false,properties:ids,required:['projectId','campaignId']}
export const SOCIAL_CAMPAIGN_TOOLS:Anthropic.Tool[]=[
 {name:'prepare_social_campaign',description:'Queue 1–3 LinkedIn image drafts for native review after reading the current approved plan, company profile and existing content. No LinkedIn account or publication activation is needed. Use when get_social_content reports imageCampaignPreparation.configured=true; runtime enqueue still verifies authorization, budget and provider configuration. Call this tool on the explicit new-image request; never infer refusal from publicationReady=false. DISABLED means nothing was queued. One real image per item, no publication.',input_schema:{type:'object',additionalProperties:false,properties:{...ids,planRevisionId:{type:'string'},profileRevisionId:{type:'string'},idempotencyKey:{type:'string',maxLength:100},items:{type:'array',minItems:1,maxItems:3,items:{type:'object',additionalProperties:false,properties:{title:{type:'string',maxLength:150},text:{type:'string',maxLength:5000},imagePrompt:{type:'string',maxLength:2000},localMinute:{type:'string',description:'Future Europe/Stockholm YYYY-MM-DDTHH:mm; intended editorial slot, not publication authority.'}},required:['title','text','imagePrompt','localMinute']}}},required:['projectId','campaignId','planRevisionId','profileRevisionId','idempotencyKey','items']}},
 {name:'get_social_campaign',description:'Read actual owned preparation status and native review links. Queued or uncertain never means complete.',input_schema:short},
 {name:'cancel_social_campaign',description:'Cancel remaining image preparation. Preserves charged/generated evidence and existing drafts. Does not revoke or publish reviewed posts.',input_schema:short},
]
export const SOCIAL_CAMPAIGN_TOOL_NAMES=SOCIAL_CAMPAIGN_TOOLS.map(t=>t.name)
export const SOCIAL_CAMPAIGN_STUDIO_GUIDE='\nUse prepare_social_campaign only on explicit new-image requests.\n'
export const SOCIAL_CAMPAIGN_GUIDE='\nSOCIAL IMAGE CAMPAIGNS: For an explicit request to prepare text AND new images, resolve_project_context for the target UUID from any owned chat. Read get_social_profile, get_social_launch_plan and get_social_content first; pin their current profile and APPROVED plan revision. Use verified company facts and distinct editorial texts/image briefs. If the operator delegates days/times, choose future Stockholm slots without another routine question. The get_social_content result reports imageCampaignPreparation configuration separately from delivery. publicationReady=false, dispatchEnabled=false, account_required and missing LinkedIn credentials do NOT block review preparation. On the explicit new-image request call prepare_social_campaign; only its actual refusal may be described as an enqueue failure. Generate one valid campaign UUID and one idempotency key, reused unchanged on retry; never put an idempotency key into campaignId. Do not call get_social_campaign before a saved campaign UUID exists; it cannot search by idempotency key. max3 posts, max5SEK campaign image allocation in addition to canonical budgets. prepare_social_campaign queues native jobs only after its real durable receipt. Feature defaults OFF: DISABLED is a real blocker requiring reviewed activation, never claim a queued/completed workflow then. Do not bypass it via run_media_step, another provider or a generic agent. Only review_ready with saved revisionId means text AND real canonical image exist for that item. Link workspaceUrl and read get_social_campaign for progress. Unknown image outcome must never auto-regenerate. No campaign tool approves, schedules executable delivery, connects accounts or publishes. Existing text-only proposal tools remain available independently. Editorial times and approvals are not publishing authority.\n'
export async function handleCampaignTool(name:string,input:Record<string,unknown>,p:CampaignPrincipal,conversationId:string|null,db=createAdminClient()):Promise<unknown>{
 try{
  if(!SOCIAL_CAMPAIGN_TOOL_NAMES.includes(name))throw new CampaignError('INVALID_BODY')
  if(!conversationId)throw new CampaignError('NOT_FOUND');campaignId(conversationId)
  if(name==='prepare_social_campaign'){
   if(Object.hasOwn(input,'conversationId'))throw new CampaignError('INVALID_BODY')
   return await enqueueCampaign(db,p,conversationId,input)
  }
  campaignObject(input,['projectId','campaignId']);campaignId(input.projectId);campaignId(input.campaignId)
  const ref=input as {projectId:string;campaignId:string}
  return name==='get_social_campaign'?await readCampaign(db,p,ref):await cancelCampaign(db,p,ref)
 }catch(error){
  const code=error instanceof CampaignError?error.code:'UNAVAILABLE'
  if(code==='INVALID_BODY'&&name==='get_social_campaign')return {code,error:'Status kräver kampanjens sparade UUID, inte idempotensnyckeln. För en ny uttryckligen beställd bildkampanj: använd prepare_social_campaign med ett nytt UUID och samma beställningsnyckel.',nextAction:'prepare_social_campaign_if_new_request'}
  return {code,error:'Kampanjen kunde inte behandlas. Endast sparade granskningsutkast räknas som klara.'}
 }
}
