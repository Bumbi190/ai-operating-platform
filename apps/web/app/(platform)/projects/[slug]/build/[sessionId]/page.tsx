import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProjectBySlug } from '@/lib/project/get-project'
import { readBuildSession, WebsiteBuildError } from '@/lib/website-build/store'
import {loadChatConversation} from '@/lib/os/chat'
import {readConversationWorkspace} from '@/lib/website-build/planning/conversation-workspace'
import { BuildWorkspace } from '@/components/website-build/BuildWorkspace'
export default async function WebsiteBuildPage({ params }: { params: { slug: string; sessionId: string } }) {
  const project = await getProjectBySlug(params.slug)
  if (!project) notFound()
  const db = await createClient(), { data: { user } } = await db.auth.getUser()
  if (!user) notFound()
  try {
    const session = await readBuildSession(createAdminClient(), { userId: user.id, allowedProjectIds: [project.id] }, { projectId: project.id, sessionId: params.sessionId })
    const model=await loadChatConversation(session.conversationId)
    if(!model||model==='not_found')notFound()
    const workspace=await readConversationWorkspace(createAdminClient(),{userId:user.id,allowedProjectIds:[project.id]},session.conversationId,session.sessionId)
    return <BuildWorkspace key={session.sessionId} conversationModel={model} initialSession={session} plan={workspace.plan} brief={workspace.brief??undefined}/>

  } catch (error) {
    if (error instanceof WebsiteBuildError && error.status < 500) notFound()
    return <p role="alert">Byggtjänsten kunde inte svara. Försök igen.</p>
  }
}