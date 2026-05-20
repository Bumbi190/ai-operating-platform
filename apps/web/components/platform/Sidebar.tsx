'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Bot,
  GitBranch,
  Play,
  FileOutput,
  Settings,
  ChevronRight,
  Zap,
  LogOut,
  Plus,
  MessageSquare,
  DollarSign,
  CalendarDays,
  ShieldCheck,
  Brain,
  Radio,
  Newspaper,
  FileText,
} from 'lucide-react'

interface Project {
  id: string
  name: string
  slug: string
  color: string
}

interface RecentConversation {
  id: string
  title: string
  project_id: string | null
}

interface SidebarProps {
  projects: Project[]
  userEmail?: string
  recentConversations?: RecentConversation[]
}

const globalNav = [
  { href: '/dashboard',  label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/manager',    label: 'Mission Control',  icon: Brain,        primary: true },
  { href: '/chat',       label: 'Chatt',            icon: MessageSquare },
  { href: '/approvals',  label: 'Godkännanden',     icon: ShieldCheck },
  { href: '/costs',      label: 'Kostnader',        icon: DollarSign },
  { href: '/planning',   label: 'Planering',        icon: CalendarDays },
]

const projectNav = [
  { href: '/agents',    label: 'Agenter',   icon: Bot },
  { href: '/workflows', label: 'Workflows', icon: GitBranch },
  { href: '/runs',      label: 'Körningar', icon: Play },
  { href: '/outputs',   label: 'Utdata',    icon: FileOutput },
]

// Extra nav items only for the AI Media Automation project
const mediaProjectNav = [
  { href: '/news',    label: 'News Feed',     icon: Newspaper },
  { href: '/scripts', label: 'Script Queue',  icon: FileText },
]

export function Sidebar({ projects, userEmail, recentConversations = [] }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const isChatActive = pathname.startsWith('/chat')

  // Find active project slug from pathname
  const activeSlug = pathname.match(/\/projects\/([^/]+)/)?.[1]

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Get initials from email
  const initials = userEmail
    ? userEmail.split('@')[0].slice(0, 2).toUpperCase()
    : '?'

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-60 flex flex-col bg-[#07080f] border-r border-white/[0.06]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-11 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center justify-center w-6 h-6 rounded bg-indigo-500/90 text-white shrink-0">
          <Zap className="w-3.5 h-3.5" />
        </div>
        <span className="font-semibold text-[13px] text-zinc-200 tracking-tight">
          AI Ops Platform
        </span>
        {/* Live dot */}
        <span className="ml-auto flex items-center gap-1">
          <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
        </span>
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 py-3 space-y-5">
        {/* Global */}
        <div className="space-y-0.5">
          {globalNav.map((item) => {
            const Icon = item.icon
            const isActive = item.href === '/chat' ? isChatActive : pathname === item.href || pathname.startsWith(item.href + '/')

            if (item.primary) {
              // Mission Control — special glowing button
              return (
                <div key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-all',
                      isActive
                        ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                        : 'text-indigo-400/80 hover:bg-indigo-600/20 hover:text-indigo-300 border border-transparent hover:border-indigo-500/20',
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                    {isActive && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    )}
                  </Link>
                </div>
              )
            }

            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors',
                    isActive
                      ? 'bg-white/[0.08] text-zinc-100 font-medium'
                      : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300',
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </Link>

                {/* Recent conversations sub-list under Chatt */}
                {item.href === '/chat' && isChatActive && recentConversations.length > 0 && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/[0.06] pl-2.5">
                    {recentConversations.map(conv => {
                      const isConvActive = pathname === `/chat/${conv.id}`
                      return (
                        <Link
                          key={conv.id}
                          href={`/chat/${conv.id}`}
                          className={cn(
                            'flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-colors',
                            isConvActive
                              ? 'bg-white/[0.08] text-zinc-100 font-medium'
                              : 'text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-400',
                          )}
                        >
                          <MessageSquare className="w-3 h-3 shrink-0" />
                          <span className="truncate">{conv.title}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Divider */}
        <div className="border-t border-white/[0.04]" />

        {/* Projects */}
        <div>
          <div className="flex items-center justify-between px-2.5 mb-2">
            <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">
              Projekt
            </span>
            <Link
              href="/projects/new"
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/[0.05] text-zinc-600 hover:text-zinc-400 transition-colors"
              title="Nytt projekt"
            >
              <Plus className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-0.5">
            {projects.map((project) => {
              const isActive = activeSlug === project.slug
              const projectBase = `/projects/${project.slug}`

              return (
                <div key={project.id}>
                  {/* Project header */}
                  <Link
                    href={projectBase}
                    className={cn(
                      'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors group',
                      isActive
                        ? 'bg-white/[0.08] text-zinc-100 font-medium'
                        : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300',
                    )}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0 ring-1 ring-black/20"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="flex-1 truncate">{project.name}</span>
                    <ChevronRight
                      className={cn(
                        'w-3 h-3 shrink-0 transition-transform text-zinc-700',
                        isActive ? 'rotate-90 text-zinc-500' : '',
                      )}
                    />
                  </Link>

                  {/* Project sub-nav — visible when project is active */}
                  {isActive && (
                    <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/[0.06] pl-2.5">
                      {[
                        ...projectNav,
                        ...(project.slug === 'ai-media-automation' ? mediaProjectNav : []),
                      ].map((item) => {
                        const Icon = item.icon
                        const href = `${projectBase}${item.href}`
                        const isSubActive = pathname.startsWith(href)
                        return (
                          <Link
                            key={href}
                            href={href}
                            className={cn(
                              'flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-colors',
                              isSubActive
                                ? 'bg-white/[0.08] text-zinc-100 font-medium'
                                : 'text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-400',
                            )}
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            {item.label}
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            {projects.length === 0 && (
              <Link
                href="/projects/new"
                className="flex items-center gap-2 px-2.5 py-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors rounded-md hover:bg-white/[0.05]"
              >
                <Plus className="w-3.5 h-3.5" />
                Skapa ditt första projekt
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Bottom — settings + user */}
      <div className="border-t border-white/[0.06] px-2 py-2 space-y-0.5">
        <Link
          href="/settings"
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-400 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Inställningar
        </Link>

        {/* User row */}
        {userEmail && (
          <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md group">
            {/* Avatar */}
            <div className="w-6 h-6 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-indigo-400">{initials}</span>
            </div>
            <span className="flex-1 text-xs text-zinc-600 truncate min-w-0">
              {userEmail}
            </span>
            <button
              onClick={handleSignOut}
              title="Logga ut"
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/[0.05] text-zinc-600 hover:text-zinc-400"
            >
              <LogOut className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
