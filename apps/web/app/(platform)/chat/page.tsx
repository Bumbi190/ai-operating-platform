import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { NewChatButton } from './NewChatButton'
import { ConversationList } from './ConversationList'

export default async function ChatIndexPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  const { data: conversations } = await db
    .from('conversations')
    .select('id, title, project_id, updated_at, projects(name, slug)')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(50)

  const { data: projects } = await db
    .from('projects')
    .select('id, name, slug')
    .order('name')

  return (
    <div className="flex flex-col min-h-[calc(100vh-3rem)]">
      {/* Header — OS canvas padding */}
      <div className="flex items-center justify-between px-6 md:px-8 lg:px-10 2xl:px-12 3xl:px-16 py-5 lg:py-6 border-b border-white/5 shrink-0">
        <div>
          <p className="eyebrow eyebrow-accent mb-2">Operator · conversation channel</p>
          <h1 className="text-xl 2xl:text-2xl font-bold tracking-tight">Chattar</h1>
          <p className="text-xs text-zinc-500 mt-1">
            {conversations?.length ?? 0} sparade konversationer
          </p>
        </div>
        <NewChatButton projects={projects ?? []} />
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-8 lg:px-10 2xl:px-12 3xl:px-16 py-6">
        {!conversations || conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <span className="text-2xl">💬</span>
            </div>
            <div>
              <p className="text-sm font-medium">Inga chattar ännu</p>
              <p className="text-xs text-muted-foreground mt-1">
                Starta en ny konversation med dina AI-agenter
              </p>
            </div>
            <NewChatButton projects={projects ?? []} variant="primary" />
          </div>
        ) : (
          <ConversationList conversations={conversations as any} />
        )}
      </div>
    </div>
  )
}
