import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { ConversationList } from './ConversationList'
import { ExecutiveAssistant } from './ExecutiveAssistant'
import { deriveOperatorName } from '@/lib/os/briefing'

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

  const operatorName = deriveOperatorName(
    (user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined),
    user.email,
  )

  return (
    <div className="flex flex-col min-h-[calc(100vh-3rem)]">
      {/* Executive Assistant — chattens centrum */}
      <div className="px-6 md:px-8 lg:px-10 2xl:px-12 3xl:px-16 pt-10 pb-8">
        <ExecutiveAssistant projects={projects ?? []} operatorName={operatorName} />
      </div>

      {/* Tidigare konversationer */}
      {conversations && conversations.length > 0 && (
        <div className="flex-1 overflow-y-auto px-6 md:px-8 lg:px-10 2xl:px-12 3xl:px-16 pb-8">
          <div className="max-w-2xl mx-auto w-full">
            <p className="eyebrow !text-[9px] mb-3">Tidigare konversationer</p>
            <ConversationList conversations={conversations as any} />
          </div>
        </div>
      )}
    </div>
  )
}
