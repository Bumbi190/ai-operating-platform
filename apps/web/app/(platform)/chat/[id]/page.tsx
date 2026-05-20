import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { ChatClient } from '@/components/platform/ChatClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ConversationPage({ params }: Props) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  // Load conversation + messages
  const { data: conv } = await db
    .from('conversations')
    .select('id, title, project_id, projects(name, slug)')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!conv) redirect('/chat')

  const { data: messages } = await db
    .from('conversation_messages')
    .select('role, content, tool_data, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  const projectRaw = conv.projects as unknown
  const project = (Array.isArray(projectRaw) ? projectRaw[0] : projectRaw) as { name: string; slug: string } | null

  return (
    <ChatClient
      conversationId={id}
      conversationTitle={conv.title}
      projectName={project?.name ?? null}
      savedMessages={messages ?? []}
    />
  )
}
