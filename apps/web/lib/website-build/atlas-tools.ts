import 'server-only'
import {readWebsiteBuildReadiness} from './connections/readiness'
import type Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { appendBuildFeedback, readBuildSession, requestBuildControl, WebsiteBuildError } from './store'
import {WEBSITE_PLANNING_TOOLS,WEBSITE_PLANNING_GUIDE,handleWebsitePlanningTool} from './planning/chat-tools'
import {readWebsitePlan,startApprovedWebsitePlan,findWebsitePlanDecision} from './planning/store'
import {parseWebsitePlanRef} from './planning/operator-command'
import type {BuildContext} from '@/lib/atlas/conversation/stream-effects'
import type { BuildPrincipal, FeedbackInput } from './types'

const project = { projectId: { type: 'string', description: 'Existing authorized project UUID.' } }
const session = { ...project, sessionId: { type: 'string' } }
export const WEBSITE_BUILD_TOOLS: Anthropic.Tool[] = [
  ...WEBSITE_PLANNING_TOOLS,
  {name:'get_website_build_readiness',description:'Read real plan needs, project directory metadata and safe connection guides. Separates unavailable execution adapters from verified account access. Strato first for domains. Does not run commands, create tokens or connect providers.',input_schema:{type:'object',additionalProperties:false,properties:{...project,planId:{type:'string'}},required:['projectId','planId']}},
  {name:'start_website_build',description:'Queue the exact architecture revision already approved by the operator in this conversation. Does not approve a plan, run a terminal or publish. No agent or brief overrides.',input_schema:{type:'object',additionalProperties:false,properties:{...project,planId:{type:'string'},revisionId:{type:'string'},sha256:{type:'string'}},required:['projectId','planId','revisionId','sha256']}},
  { name: 'get_website_build', description: 'Read actual build state, immutable revisions and feedback receipts.', input_schema: { type: 'object', properties: session, required: ['projectId', 'sessionId'] } },
  { name: 'submit_website_build_feedback', description: 'Persist feedback while a website builds. received is not applied. Bind the revision the operator is actually viewing, or null before the first preview.', input_schema: { type: 'object', properties: { ...session, text: { type: 'string', maxLength: 4000 }, viewedRevisionId: { type: ['string', 'null'] }, inputSource: { type: 'string', enum: ['text', 'voice'] }, idempotencyKey: { type: 'string' } }, required: ['projectId', 'sessionId', 'text', 'viewedRevisionId', 'inputSource', 'idempotencyKey'] } },
  { name: 'control_website_build', description: 'Request pause, resume or cancel with a durable receipt. pausing is not paused; an already dispatched provider call may finish.', input_schema: { type: 'object', properties: { ...session, action: { type: 'string', enum: ['pause', 'resume', 'cancel'] }, idempotencyKey: { type: 'string' } }, required: ['projectId', 'sessionId', 'action', 'idempotencyKey'] } },
]
export const WEBSITE_BUILD_TOOL_NAMES = WEBSITE_BUILD_TOOLS.map(tool => tool.name)
export const WEBSITE_BUILD_GUIDE = WEBSITE_PLANNING_GUIDE + '\nCONNECTIONS: Read get_website_build_readiness for this conversation plan. Follow its safe provider links and named fields. Strato is first for domain discovery and purchases use the operator account. A search result is not account ownership, and saved directory metadata does not create a physical folder. An unavailable adapter cannot execute even if the account exists or ChatGPT has a connector. Never request secret values in chat, print them, invent API-key generators or claim a manual login connected Atlas.\nWEBSITE BUILDS: Use start_website_build only after the exact saved plan revision has a real operator decision. Resolve the builder on the server; never select the first agent or supply an invented brief. This tool queues governed static HTML/CSS with reviewed interactions, not backend, payments or public hosting. Read get_website_build before claiming progress or completion. Open the returned workspaceUrl with a Markdown link so the operator can view preview and send feedback during the build. Distinguish received, acknowledged and applied to an exact revision. Never invent a public URL or claim deployment. Pause/cancel only claim the status returned by the server. start_website_build is idempotent for one approved revision: an existing failed session is not a newly queued run. When the operator explicitly asks to resume a failed or paused session, use control_website_build with action resume and a fresh intent key; neither a smaller plan nor an existing preview is required. An invalid package is a technical failure, not proof the approved page count is excessive. Do not invent its cause when the tools expose no error detail. Idempotency keys identify one intent; reuse after retry, use a fresh key for a new intent.\n'

export async function handleWebsiteBuildTool(name: string, input: Record<string, unknown>, principal: BuildPrincipal, conversationId: string | null = null, db = createAdminClient(), buildContext:BuildContext|null=null, inputSource:'text'|'voice'='text'): Promise<unknown> {
  if(['draft_website_build_plan','get_website_build_plan'].includes(name))return handleWebsitePlanningTool(name,input,principal,conversationId,db)
  const ref = { projectId: input.projectId as string, sessionId: input.sessionId as string }
  try {
    if(name==='get_website_build_readiness'){
      if(Object.keys(input).some(k=>!['projectId','planId'].includes(k)))throw new WebsiteBuildError('INVALID_BODY')
      const planRef={projectId:input.projectId as string,planId:input.planId as string}
      const plan=await readWebsitePlan(db,principal,planRef)
      if(!conversationId||plan.conversationId!==conversationId)throw new WebsiteBuildError('NOT_FOUND',404)
      return await readWebsiteBuildReadiness(db,principal,planRef)
    }
    if(['submit_website_build_feedback','control_website_build'].includes(name)){
      const existing=await readBuildSession(db,principal,ref)
      if(!conversationId||existing.conversationId!==conversationId)throw new WebsiteBuildError('NOT_FOUND',404)
      if(name==='submit_website_build_feedback'){
        if(!buildContext||buildContext.projectId!==ref.projectId||buildContext.sessionId!==ref.sessionId)throw new WebsiteBuildError('BUILD_CONTEXT_REQUIRED',409)
        return await appendBuildFeedback(db,principal,ref,{...input as unknown as FeedbackInput,viewedRevisionId:buildContext.viewedRevisionId,inputSource})
      }
      return await requestBuildControl(db,principal,ref,input.action as 'pause'|'resume'|'cancel',input.idempotencyKey as string)
    }
    let state
    if(name==='start_website_build'){
      if(!principal.allowedProjectIds.includes(input.projectId as string))throw new WebsiteBuildError('NOT_FOUND',404)
      if(!input.planId)throw new WebsiteBuildError('PLAN_REVIEW_REQUIRED',409)
      const planRef=parseWebsitePlanRef(input)!
      const plan=await readWebsitePlan(db,principal,planRef)
      if(!conversationId||plan.conversationId!==conversationId)throw new WebsiteBuildError('NOT_FOUND',404)
      const decision=await findWebsitePlanDecision(db,principal,planRef)
      if(!decision)throw new WebsiteBuildError('PLAN_REVIEW_REQUIRED',409)
      state=await startApprovedWebsitePlan(db,principal,{...planRef,decisionId:decision.id})
    }else state=await readBuildSession(db,principal,ref)
    const { data, error } = await db.from('projects').select('slug').eq('id', state.projectId).maybeSingle()
    if (error || !data) throw new WebsiteBuildError('BUILD_UNAVAILABLE', 503)
    return { ...state, workspaceUrl: `/projects/${encodeURIComponent(data.slug)}/build/${state.sessionId}`, published: false }
  } catch (error) {
    if (error instanceof WebsiteBuildError) return { code: error.code, error: error.status === 404 ? 'Bygget eller projektet kunde inte hittas.' : 'Byggförfrågan kunde inte genomföras. Kontrollera läget innan du försöker igen.' }
    return { code: 'BUILD_UNAVAILABLE', error: 'Byggtjänsten kunde inte svara.' }
  }
}