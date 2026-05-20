import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/platform/Sidebar'

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  // Load projects + recent conversations for sidebar
  const [projectsRes, conversationsRes] = await Promise.allSettled([
    supabase
      .from('projects')
      .select('id, name, slug, color')
      .order('created_at', { ascending: true }),
    db
      .from('conversations')
      .select('id, title, project_id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(8),
  ])

  const projects = projectsRes.status === 'fulfilled' ? (projectsRes.value.data ?? []) : []
  const conversations = conversationsRes.status === 'fulfilled' ? (conversationsRes.value.data ?? []) : []

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        projects={projects}
        userEmail={user.email ?? ''}
        recentConversations={conversations}
      />

      {/* Main content — offset by sidebar width */}
      <main className="flex-1 ml-60 overflow-y-auto bg-[#060a10] mc-grid">
        <div className="min-h-full">
          {children}
        </div>
      </main>
    </div>
  )
}
