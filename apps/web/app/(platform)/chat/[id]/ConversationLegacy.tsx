/**
 * `/chat/[id]` — the legacy conversation body, moved verbatim.
 *
 * This file is the rollback target for `?ui=legacy`. Nothing in it was
 * rewritten: the body below is the previous page byte-for-byte, with exactly one
 * mechanical edit — the default export became a named one so the branch can
 * render it. The route had no segment config to move. The tests pin that with a
 * hash.
 *
 * `components/platform/ChatClient.tsx` stays where it is, unchanged; this body
 * imports it, and `atlas-static-conversation-route.test.ts` still pins its
 * text-only history.
 *
 * Do not improve anything here — including a failed message read that renders as
 * an empty conversation, the greeting that speaks for Atlas, every tool call
 * shown as "klar", and text written before a tool call repeated after it. A
 * rollback that renders something other than what it replaced is not a rollback.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { ChatClient } from '@/components/platform/ChatClient'

interface Props {
  params: Promise<{ id: string }>
}

export async function ConversationLegacy({ params }: Props) {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const convAny = conv as any
  const projectRaw = convAny?.projects
  const project = (Array.isArray(projectRaw) ? projectRaw[0] ?? null : projectRaw ?? null) as { name: string; slug: string } | null

  return (
    <ChatClient
      conversationId={id}
      conversationTitle={conv.title}
      projectName={project?.name ?? null}
      savedMessages={messages ?? []}
    />
  )
}
