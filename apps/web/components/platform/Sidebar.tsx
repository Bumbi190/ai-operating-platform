'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { OmniraSidebarLogo } from '@/components/platform/OmniraLogo'
import {
  LayoutDashboard,
  Bot,
  GitBranch,
  Play,
  FileOutput,
  Settings,
  ChevronRight,
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
  Flame,
  TrendingUp,
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
  { href: '/dashboard',      label: 'Operationscentral', icon: LayoutDashboard, primary: true },
  { href: '/revenue',        label: 'Revenue Center',    icon: TrendingUp },
  { href: '/action-center',  label: 'Action Center',     icon: Flame },
  { href: '/agent-activity', label: 'Agentaktivitet',    icon: Activity },
  { href: '/manager',        label: 'Operatör',          icon: Brain },
  { href: '/chat',           label: 'Chat',              icon: MessageSquare },
  { href: '/approvals',      label: 'Granskningar',      icon: ShieldCheck },
  { href: '/memory',         label: 'Minne',             icon: Lightbulb },
  { href: '/costs',          label: 'Kostnader',         icon: DollarSign },
  { href: '/planning',       label: 'Planering',         icon: CalendarDays },
]

const projectNav = [
  { href: '/agents',    label: 'Agenter',       icon: Bot },
  { href: '/workflows', label: 'Arbetsflöden',  icon: GitBranch },
  { href: '/runs',      label: 'Körningar',     icon: Play },
  { href: '/outputs',   label: 'Utdata',        icon: FileOutput },
]

const mediaProjectNav = [
  { href: '/media',    label: 'Mediepipeline',  icon: Radio },
  { href: '/generate', label: 'Generera',        icon: Video },
  { href: '/news',     label: 'Nyhetsflöde',    icon: Newspaper },
  { href: '/scripts',  label: 'Manuskriptkö',   icon: FileText },
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
    <aside
      className="relative z-40 hidden lg:flex flex-col sidebar-border-gradient h-full overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse 100% 50% at 50% 0%, rgba(99,102,241,0.07) 0%, transparent 60%), linear-gradient(180deg, #060a18 0%, #050714 45%, #060a18 100%)',
      }}
    >
      {/* Top ambient orb */}
      <div
        className="absolute inset-x-0 top-0 h-44 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 80% at 50% 0%, rgba(99,102,241,0.14) 0%, transparent 70%)',
        }}
      />

      {/* ── Header / Logo ───────────────────────────────────── */}
      <div
        className="relative px-5 pt-5 pb-4 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <OmniraSidebarLogo isLive={true} />

        {/* Ship-systems status — Nothing OS minimal */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative inline-flex w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px #34d399' }} />
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
            </span>
            <span className="eyebrow !text-[8.5px] !text-emerald-300/85 !tracking-[0.22em]">
              Alla system nominella
            </span>
          </div>
          <span className="caption-mono text-[9px] text-zinc-700">v4.2</span>
        </div>
      </div>

      {/* ── Navigation ──────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-5 space-y-6">

        {/* Operations */}
        <div>
          <p className="px-3 mb-3 eyebrow !text-[9px] !text-zinc-700">
            Operationer
          </p>
          <div className="space-y-1">
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
                      'relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12.5px] font-semibold transition-all ease-os overflow-hidden group',
                      isActive
                        ? 'text-white'
                        : 'text-indigo-200/80 hover:text-white',
                    )}
                    style={isActive
                      ? {
                          background:
                            'linear-gradient(180deg, rgba(99,102,241,0.24) 0%, rgba(99,102,241,0.10) 100%)',
                          border: '1px solid rgba(99,102,241,0.40)',
                          boxShadow:
                            '0 10px 28px -12px rgba(99,102,241,0.55), inset 0 1px 0 rgba(255,255,255,0.07)',
                        }
                      : {
                          background: 'rgba(99,102,241,0.04)',
                          border: '1px solid rgba(99,102,241,0.10)',
                        }
                    }
                  >
                    {isActive && <div className="absolute inset-0 shimmer opacity-25 pointer-events-none" />}
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1 tracking-tight">{item.label}</span>
                    {isActive && (
                      <Activity className="w-3 h-3 text-indigo-200 animate-breathe" />
                    )}
                  </Link>
                )
              }

              return (
                <div key={item.href}>
                  <Link href={item.href} className="nav-pill ease-os" data-active={isActive}>
                    <Icon className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-indigo-200' : 'text-zinc-600')} />
                    <span className="flex-1 tracking-tight">{item.label}</span>
                    {isActive && item.href === '/approvals' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" style={{ boxShadow: '0 0 6px #fbbf24' }} />
                    )}
                  </Link>

                  {/* Recent chats */}
                  {item.href === '/chat' && isChatActive && recentConversations.length > 0 && (
                    <div
                      className="ml-3 mt-1 space-y-0.5 pl-3 border-l"
                      style={{ borderColor: 'rgba(255,255,255,0.05)' }}
                    >
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
        </div>

        {/* Divider */}
        <div className="px-1">
          <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.18), transparent)' }} />
        </div>

        {/* Autonomous stack */}
        <div>
          <div className="flex items-center justify-between px-3 mb-3">
            <span className="eyebrow !text-[9px] !text-zinc-700">
              Autonom stack
            </span>
            <Link
              href="/projects/new"
              className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-white/[0.06] text-zinc-600 hover:text-indigo-200 transition-colors ease-os"
              title="Driftsätt nytt projekt"
            >
              <Plus className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-1">
            {projects.map((project) => {
              const isActive = activeSlug === project.slug
              const projectBase = `/projects/${project.slug}`
              return (
                <div key={project.id}>
                  <Link
                    href={projectBase}
                    className="nav-pill ease-os group"
                    data-active={isActive}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0 transition-all ease-os"
                      style={{
                        backgroundColor: project.color,
                        boxShadow: isActive
                          ? `0 0 10px ${project.color}cc`
                          : `0 0 4px ${project.color}55`,
                      }}
                    />
                    <span className="flex-1 truncate tracking-tight">{project.name}</span>
                    <ChevronRight
                      className={cn(
                        'w-3 h-3 shrink-0 transition-all ease-os text-zinc-700',
                        isActive ? 'rotate-90 text-zinc-400' : 'group-hover:text-zinc-500',
                      )}
                    />
                  </Link>

                  {isActive && (
                    <div
                      className="ml-3 mt-1 mb-2 space-y-0.5 pl-3 border-l animate-fade-in"
                      style={{ borderColor: `${project.color}40` }}
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
                              'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] transition-all ease-os',
                              isSubActive ? 'text-white/95 font-medium' : 'text-zinc-600 hover:text-zinc-300',
                            )}
                            style={isSubActive ? {
                              background: `linear-gradient(90deg, ${project.color}24, transparent)`,
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
                className="flex items-center gap-2 px-3 py-2 text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors rounded-lg hover:bg-white/[0.04] ease-os"
              >
                <Plus className="w-3 h-3" />
                Driftsätt ditt första system
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* ── Bottom ──────────────────────────────────────────── */}
      <div
        className="px-3 py-3 space-y-1"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
      >
        <Link href="/settings" className="nav-pill ease-os" data-active={pathname === '/settings'}>
          <Settings className="w-3.5 h-3.5 shrink-0 text-zinc-600" />
          <span className="tracking-tight">Inställningar</span>
        </Link>

        {userEmail && (
          <div
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl group cursor-default mt-2"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 chrome-edge"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.42) 0%, rgba(139,92,246,0.30) 100%)',
                border: '1px solid rgba(99,102,241,0.40)',
                boxShadow: '0 4px 12px -4px rgba(99,102,241,0.5)',
              }}
            >
              <span className="text-[10px] font-bold text-white">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-white/90 truncate font-medium tracking-tight">
                {userEmail.split('@')[0]}
              </p>
              <p className="eyebrow !text-[8.5px] !text-zinc-600 !tracking-[0.20em] mt-0.5">Operatör</p>
            </div>
            <button
              onClick={handleSignOut}
              title="Logga ut"
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/[0.06] text-zinc-500 hover:text-white ease-os"
            >
              <LogOut className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
