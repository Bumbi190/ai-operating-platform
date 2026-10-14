import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { appendBuildFeedback, createBuildSession, readBuildSession, requestBuildControl, WebsiteBuildError } from './store'
import type { BuildPrincipal, CreateBuildInput, FeedbackInput } from './types'

const project = { projectId: { type: 'string', description: 'Existing authorized project UUID.' } }
const session = { ...project, sessionId: { type: 'string' } }
export const WEBSITE_BUILD_TOOLS: Anthropic.Tool[] = [
  { name: 'start_website_build', description: 'Queue a real static website build with an existing text agent. Returns durable state and workspace URL; queued is not finished or published.', input_schema: { type: 'object', properties: { ...project, agentId: { type: 'string' }, brief: { type: 'string', maxLength: 8000 }, idempotencyKey: { type: 'string' } }, required: ['projectId', 'agentId', 'brief', 'idempotencyKey'] } },
  { name: 'get_website_build', description: 'Read actual build state, immutable revisions and feedback receipts.', input_schema: { type: 'object', properties: session, required: ['projectId', 'sessionId'] } },
  { name: 'submit_website_build_feedback', description: 'Persist feedback while a website builds. received is not applied. Bind the revision the operator is actually viewing, or null before the first preview.', input_schema: { type: 'object', properties: { ...session, text: { type: 'string', maxLength: 4000 }, viewedRevisionId: { type: ['string', 'null'] }, inputSource: { type: 'string', enum: ['text', 'voice'] }, idempotencyKey: { type: 'string' } }, required: ['projectId', 'sessionId', 'text', 'viewedRevisionId', 'inputSource', 'idempotencyKey'] } },
  { name: 'control_website_build', description: 'Request pause, resume or cancel with a durable receipt. pausing is not paused; an already dispatched provider call may finish.', input_schema: { type: 'object', properties: { ...session, action: { type: 'string', enum: ['pause', 'resume', 'cancel'] }, idempotencyKey: { type: 'string' } }, required: ['projectId', 'sessionId', 'action', 'idempotencyKey'] } },
]
export const WEBSITE_BUILD_TOOL_NAMES = WEBSITE_BUILD_TOOLS.map(tool => tool.name)
export const WEBSITE_BUILD_GUIDE = '\nWEBSITE BUILDS: Use start_website_build with a real authorized project and existing text agent. This tool queues governed static HTML/CSS with reviewed interactions, not backend, payments or public hosting. Read get_website_build before claiming progress or completion. Open the returned workspaceUrl with a Markdown link so the operator can view preview and send feedback during the build. Distinguish received, acknowledged and applied to an exact revision. Never invent a public URL or claim deployment. Pause/cancel only claim the status returned by the server. Idempotency keys identify one intent; reuse after retry, use a fresh key for a new intent.\n'

export async function handleWebsiteBuildTool(name: string, input: Record<string, unknown>, principal: BuildPrincipal, conversationId: string | null = null, db = createAdminClient()): Promise<unknown> {
  const ref = { projectId: input.projectId as string, sessionId: input.sessionId as string }
  try {
    if (name === 'submit_website_build_feedback') return await appendBuildFeedback(db, principal, ref, input as unknown as FeedbackInput)
    if (name === 'control_website_build') return await requestBuildControl(db, principal, ref, input.action as 'pause' | 'resume' | 'cancel', input.idempotencyKey as string)
    const state = name === 'start_website_build'
      ? await createBuildSession(db, principal, { ...input, conversationId } as unknown as CreateBuildInput)
      : await readBuildSession(db, principal, ref)
    const { data, error } = await db.from('projects').select('slug').eq('id', state.projectId).maybeSingle()
    if (error || !data) throw new WebsiteBuildError('BUILD_UNAVAILABLE', 503)
    return { ...state, workspaceUrl: `/projects/${encodeURIComponent(data.slug)}/build/${state.sessionId}`, published: false }
  } catch (error) {
    if (error instanceof WebsiteBuildError) return { code: error.code, error: error.status === 404 ? 'Bygget eller projektet kunde inte hittas.' : 'Byggförfrågan kunde inte genomföras. Kontrollera läget innan du försöker igen.' }
    return { code: 'BUILD_UNAVAILABLE', error: 'Byggtjänsten kunde inte svara.' }
  }
}
