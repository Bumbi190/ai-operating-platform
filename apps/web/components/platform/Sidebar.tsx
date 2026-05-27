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
  Lightbulb,
  Radio,
  Newspaper,
  FileText,
  Video,
  Activity,
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
  { href: '/approvals',  label: 'Approvals',        icon: ShieldCheck },
  { href: '/memory',     label: 'Memory',           icon: Lightbulb },
  { href: '/costs',      label: 'Kostnader',        icon: DollarSign },
  { href: '/planning',   label: 'Planering',        icon: CalendarDays },
]

const projectNav = [
  { href: '/agents',    label: 'Agenter',   icon: Bot },
  { href: '/workflows', label: 'Workflows', icon: GitBranch },
  { href: '/runs',      label: 'Körningar', icon: Play },
  { href: '/outputs',   label: 'Utdata',    icon: FileOutput },
]

const mediaProjectNav = [
  { href: '/media',     label: 'Media Pipeline', icon: Radio },
  { href: '/generate',  label: 'Generate',       icon: Video },
  { href: '/news',      label: 'News Feed',      icon: Newspaper },
  { href: '/scripts',   label: 'Script Queue',   icon: FileText },
]

export function Sidebar({ projects, userEmail, recentConversations = [] }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const isChatActive = pathname.startsWith('/chat')
  const activeSlug = pathname.match(/\/projects\/([^/]+)/)?.[1]

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = userEmail
    ? userEmail.split('@')[0].slice(0, 2).toUpperCase()
    : '?'

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-[220px] flex flex-col sidebar-border-gradient relative"
      style={{ background: 'linear-gradient(180deg, #070910 0%, #060813 50%, #070910 100%)' }}
    >
      {/* Ambient glow top */}
      <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(99,102,241,0.08) 0%, transparent 100%)' }}
      />

      {/* ── Logo ────────────────────────────────────────────── */}
      <div className="relative flex items-center gap-2.5 px-4 h-12 shrink-0"
        style={{ borderBottom: '1px solid rgba(99,102,241,0.1)' }}
      >
        {/* Logo mark */}
        <div className="relative flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.9) 0%, rgba(139,92,246,0.9) 100%)',
            boxShadow: '0 0 12px rgba(99,102,241,0.4), 0 2px 4px rgba(0,0,0,0.4)',
          }}
        >
          <Zap className="w-3.5 h-3.5 text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold tracking-tight text-gradient-indigo leading-none">
            AI Ops
          </p>
          <p className="text-[9px] text-zinc-600 tracking-widest uppercase leading-none mt-0.5">
            Platform
          </p>
        </div>

        {/* Live indicator */}
        <div className="relative flex items-center shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot pulse-dot-emerald" />
        </div>
      </div>

      {/* The Prompt brand — shown when media project exists */}
      {projects.some(p => p.slug === 'ai-media-automation') && (
        <div className="relative px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        >
          {/* TP wordmark */}
          <div className="flex flex-col items-start gap-[2px]">
            <div className="flex gap-1 items-center w-full">
              <div className="flex-1 h-[1.5px] bg-gradient-to-r from-white/60 to-white/20" />
            </div>
            <span
              style={{ letterSpacing: '0.2em' }}
              className="text-[10px] font-black text-white/80 uppercase leading-none py-[3px] tracking-[0.25em]"
            >
              THE PROMPT
            </span>
            <div className="flex gap-1 items-center w-full">
              <div className="flex-1 h-[0.5px] bg-gradient-to-r from-white/30 to-transparent" />
            </div>
          </div>
          <p className="text-[9px] text-zinc-600 mt-1 tracking-wider">AI news · autonomous</p>
        </div>
      )}

      {/* ── Navigation ──────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2.5 py-4 space-y-6">

        {/* Global nav */}
        <div className="space-y-0.5">
          {globalNav.map((item) => {
            const Icon = item.icon
            const isActive = item.href === '/chat'
              ? isChatActive
              : pathname === item.href || pathname.startsWith(item.href + '/')

            if (item.primary) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold transition-all overflow-hidden',
                    isActive
                      ? 'text-indigo-200'
                      : 'text-indigo-400/60 hover:text-indigo-300',
                  )}
                  style={isActive ? {
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(139,92,246,0.15) 100%)',
                    border: '1px solid rgba(99,102,241,0.25)',
                    boxShadow: '0 0 16px rgba(99,102,241,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
                  } : {
                    border: '1px solid transparent',
                  }}
                >
                  {isActive && (
                    <div className="absolute inset-0 shimmer opacity-30 pointer-events-none" />
                  )}
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {isActive && (
                    <Activity className="w-3 h-3 text-indigo-400 animate-pulse" />
                  )}
                </Link>
              )
            }

            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[12px] transition-all',
                    isActive
                      ? 'bg-white/[0.06] text-zinc-100 font-medium'
                      : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300',
                  )}
                >
                  <Icon className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-zinc-300' : 'text-zinc-600')} />
                  {item.label}
                  {isActive && item.href === '/approvals' && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400" />
                  )}
                </Link>

                {/* Recent chats */}
                {item.href === '/chat' && isChatActive && recentConversations.length > 0 && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-white/[0.05] pl-3">
                    {recentConversations.map(conv => {
                      const isConvActive = pathname === `/chat/${conv.id}`
                      return (
                        <Link
                          key={conv.id}
                          href={`/chat/${conv.id}`}
                          className={cn(
                            'flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] transition-colors',
                            isConvActive
                              ? 'bg-white/[0.06] text-zinc-200'
                              : 'text-zinc-600 hover:text-zinc-400',
                          )}
                        >
                          <MessageSquare className="w-2.5 h-2.5 shrink-0 opacity-60" />
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

        {/* ── Divider ──────────────────────────────────────── */}
        <div className="h-px mx-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)' }} />

        {/* ── Projects ─────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-[9.5px] font-semibold text-zinc-600 uppercase tracking-[0.15em]">
              Projekt
            </span>
            <Link
              href="/projects/new"
              className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-white/[0.05] text-zinc-600 hover:text-indigo-400 transition-colors"
              title="Nytt projekt"
            >
              <Plus className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-0.5">
            {projects.map((project) => {
              const isActive = activeSlug === project.slug
              const projectBase = `/projects/${project.slug}`

              return (
                <div key={project.id}>
                  <Link
                    href={projectBase}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[12px] transition-all group',
                      isActive
                        ? 'bg-white/[0.06] text-zinc-100 font-medium'
                        : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300',
                    )}
                  >
                    {/* Color dot with glow */}
                    <span
                      className="w-2 h-2 rounded-full shrink-0 transition-all"
                      style={{
                        backgroundColor: project.color,
                        boxShadow: isActive ? `0 0 6px ${project.color}66` : 'none',
                      }}
                    />
                    <span className="flex-1 truncate">{project.name}</span>
                    <ChevronRight
                      className={cn(
                        'w-3 h-3 shrink-0 transition-all text-zinc-700',
                        isActive ? 'rotate-90 text-zinc-500' : 'group-hover:text-zinc-600',
                      )}
                    />
                  </Link>

                  {/* Project sub-nav */}
                  {isActive && (
                    <div className="ml-3.5 mt-0.5 mb-1 space-y-0.5 border-l pl-3"
                      style={{ borderColor: `${project.color}30` }}
                    >
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
                              'flex items-center gap-2 px-2 py-1 rounded-md text-[11px] transition-all',
                              isSubActive
                                ? 'text-zinc-100 font-medium'
                                : 'text-zinc-600 hover:text-zinc-400',
                            )}
                            style={isSubActive ? {
                              background: `linear-gradient(90deg, ${project.color}18, transparent)`,
                              borderLeft: `2px solid ${project.color}60`,
                              marginLeft: '-1px',
                            } : {}}
                          >
                            <Icon className="w-3 h-3 shrink-0 opacity-70" />
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
                className="flex items-center gap-2 px-3 py-2 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors rounded-lg hover:bg-white/[0.04]"
              >
                <Plus className="w-3 h-3" />
                Skapa ditt första projekt
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* ── Bottom ──────────────────────────────────────────── */}
      <div className="px-2.5 py-3 space-y-0.5"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
      >
        <Link
          href="/settings"
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[12px] text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-400 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          Inställningar
        </Link>

        {userEmail && (
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg group cursor-default">
            {/* Avatar */}
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.3) 0%, rgba(139,92,246,0.3) 100%)',
                border: '1px solid rgba(99,102,241,0.3)',
              }}
            >
              <span className="text-[9px] font-bold text-indigo-300">{initials}</span>
            </div>
            <span className="flex-1 text-[11px] text-zinc-600 truncate min-w-0">
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
