import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllowedProjectIds, scopeProjectFilter } from '@/lib/atlas/isolation'
import { redirect } from 'next/navigation'
import { ConversationList } from './ConversationList'
import { ExecutiveAssistant } from './ExecutiveAssistant'
import { deriveOperatorName } from '@/lib/os/briefing'

export default async function ChatIndexPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  // TWO DIFFERENT OWNERSHIP DIMENSIONS ON ONE PAGE, deliberately kept apart.
  //
  // A conversation is USER-owned: `conversations.user_id`. That contract is
  // already correct and is left exactly as it was — it is stronger here than a
  // project scope would be, and rewriting it into project semantics would
  // weaken it, because a conversation may carry no project at all.
  const { data: conversations } = await db
    .from('conversations')
    .select('id, title, project_id, updated_at, projects(name, slug)')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(50)

  // A project is PROJECT-authorised. This picker was unscoped: it listed every
  // project in the database — id, name and slug — to any signed-in operator,
  // through a service-role client that bypasses RLS. The names and slugs alone
  // disclose what other tenants are working on.
  const { data: projects } = await db
    .from('projects')
    .select('id, name, slug')
    .in('id', scopeProjectFilter(await getAllowedProjectIds(db, user.id)))
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
