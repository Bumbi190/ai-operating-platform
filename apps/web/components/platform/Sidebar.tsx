'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { OmniraSidebarLogo } from '@/components/platform/OmniraLogo'
import {
  Settings,
  ChevronRight,
  LogOut,
  Plus,
  MessageSquare,
  Activity,
} from 'lucide-react'
import vnextStyles from './SidebarVNext.module.css'
import { DEFAULT_UI_GENERATION, isVNext, type OmniraUiGeneration } from '@/lib/ui/generation'
import {
  LEGACY_GLOBAL_NAV as globalNav,
  LEGACY_MEDIA_PROJECT_NAV as mediaProjectNav,
  LEGACY_PROJECT_NAV as projectNav,
} from '@/lib/nav/legacy-nav'
import {
  shouldRenderGlobalProjectList,
  shouldRenderProjectSection,
  sidebarProjectsFor,
} from '@/lib/nav/sidebar-visibility'

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
  operatorName?: string
  recentConversations?: RecentConversation[]
  /** Resolved server-side by the platform layout — never parsed here. */
  uiGeneration?: OmniraUiGeneration
}


export function Sidebar({
  projects,
  userEmail,
  operatorName,
  recentConversations = [],
  uiGeneration = DEFAULT_UI_GENERATION,
}: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  // The generation arrives resolved from the server layout, so the shell keeps
  // its vNext identity across navigation instead of only on /atlas?ui=vnext.
  const isVNextShell = isVNext(uiGeneration)
  const isChatActive = pathname.startsWith('/chat')
  const activeSlug = pathname.match(/\/projects\/([^/]+)/)?.[1]
  // vNext defers project SELECTION to ProjectRail on Atlas Home, so the global
  // list is duplication and goes. Workspace context for the project you are
  // already inside is not duplication and stays.
  const showGlobalProjectList = shouldRenderGlobalProjectList(uiGeneration)
  const sidebarProjects = sidebarProjectsFor(uiGeneration, projects, activeSlug)
  const showProjectSection = shouldRenderProjectSection(uiGeneration, projects, activeSlug)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const emailHandle = userEmail?.split('@')[0] ?? ''
  const displayName = emailHandle
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase('sv-SE') + part.slice(1))
    .join(' ')
  const humanName = operatorName?.trim() || displayName
  const initials = humanName
    ? humanName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('sv-SE')
    : '?'

  return (
    <aside
      className={cn(
        'relative z-40 hidden lg:flex flex-col sidebar-border-gradient h-full overflow-hidden',
        isVNextShell && vnextStyles.sidebar,
      )}
      data-atlas-vnext={isVNextShell || undefined}
      style={{
        background:
          isVNextShell
            ? 'radial-gradient(ellipse 120% 52% at 50% 0%, rgba(34,211,238,0.10) 0%, transparent 64%), linear-gradient(180deg, #020b16 0%, #03101a 46%, #020813 100%)'
            : 'radial-gradient(ellipse 100% 50% at 50% 0%, rgba(99,102,241,0.07) 0%, transparent 60%), linear-gradient(180deg, #060a18 0%, #050714 45%, #060a18 100%)',
      }}
    >
      {/* Top ambient orb */}
      <div
        className="absolute inset-x-0 top-0 h-44 pointer-events-none"
        style={{
          background:
            isVNextShell
              ? 'radial-gradient(ellipse 90% 80% at 50% 0%, rgba(34,211,238,0.12) 0%, transparent 72%)'
              : 'radial-gradient(ellipse 80% 80% at 50% 0%, rgba(99,102,241,0.14) 0%, transparent 70%)',
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
              {isVNextShell ? `${projects.length} projekt kopplade` : 'Alla system nominella'}
            </span>
          </div>
          <span className="caption-mono text-[9px] text-faint">{isVNextShell ? 'ATLAS' : 'v4.2'}</span>
        </div>
      </div>

      {/* ── Navigation ──────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-5 space-y-6">

        {/* Operations */}
        <div>
          <p className="px-3 mb-3 eyebrow !text-[9px] !text-faint">
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
                    href={isVNextShell ? '/atlas?ui=vnext' : item.href}
                    className={cn(
                      'relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12.5px] font-semibold transition-all ease-os overflow-hidden group',
                      isVNextShell && vnextStyles.primaryNav,
                      isActive
                        ? 'text-white'
                        : 'text-indigo-200/80 hover:text-white',
                    )}
                    style={isActive
                      ? {
                          background: isVNextShell
                            ? 'linear-gradient(105deg, rgba(18,184,202,0.18), rgba(37,99,235,0.08) 72%, transparent)'
                            : 'linear-gradient(180deg, rgba(99,102,241,0.24) 0%, rgba(99,102,241,0.10) 100%)',
                          border: isVNextShell ? '1px solid rgba(72,218,226,0.28)' : '1px solid rgba(99,102,241,0.40)',
                          boxShadow:
                            isVNextShell
                              ? '0 12px 34px -18px rgba(34,211,238,0.62), inset 0 1px 0 rgba(255,255,255,0.06)'
                              : '0 10px 28px -12px rgba(99,102,241,0.55), inset 0 1px 0 rgba(255,255,255,0.07)',
                        }
                      : {
                          background: isVNextShell ? 'rgba(34,211,238,0.025)' : 'rgba(99,102,241,0.04)',
                          border: isVNextShell ? '1px solid rgba(34,211,238,0.08)' : '1px solid rgba(99,102,241,0.10)',
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
                    <Icon className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-indigo-200' : 'text-meta')} />
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
                                : 'text-meta hover:text-zinc-400',
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
        {showProjectSection && (
        <div>
          <div className="flex items-center justify-between px-3 mb-3">
            <span className="eyebrow !text-[9px] !text-faint">
              Autonom stack
            </span>
            {showGlobalProjectList && (
            <Link
                href="/projects/new"
                className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-white/[0.06] text-meta hover:text-indigo-200 transition-colors ease-os"
                title="Driftsätt nytt projekt"
              >
                <Plus className="w-3 h-3" />
              </Link>
            )}
          </div>

          <div className="space-y-1">
            {sidebarProjects.map((project) => {
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
                        'w-3 h-3 shrink-0 transition-all ease-os text-faint',
                        // Names the readable text token directly. The shorthand
                        // form is deliberately avoided: Tailwind emits that
                        // variant at (0,3,0) from the dark `secondary` SURFACE
                        // token, which rendered this chevron at ~1.08:1 — an
                        // invisible hover. (Spelling it out here would also keep
                        // the dead utility alive, since the JIT scans comments.)
                        isActive ? 'rotate-90 text-zinc-400' : 'group-hover:text-[var(--omnira-text-2)]',
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
                              isSubActive ? 'text-white/95 font-medium' : 'text-meta hover:text-zinc-300',
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

            {showGlobalProjectList && projects.length === 0 && (
              <Link
                href="/projects/new"
                className="flex items-center gap-2 px-3 py-2 text-[11px] text-meta hover:text-zinc-300 transition-colors rounded-lg hover:bg-white/[0.04] ease-os"
              >
                <Plus className="w-3 h-3" />
                Driftsätt ditt första system
              </Link>
            )}
          </div>
        </div>
        )}
      </nav>

      {/* ── Bottom ──────────────────────────────────────────── */}
      <div
        className="px-3 py-3 space-y-1"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
      >
        <Link href="/settings" className="nav-pill ease-os" data-active={pathname === '/settings'}>
          <Settings className="w-3.5 h-3.5 shrink-0 text-meta" />
          <span className="tracking-tight">Inställningar</span>
        </Link>

        {userEmail && (
          <div
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-xl group cursor-default mt-2',
              isVNextShell && vnextStyles.operatorCard,
            )}
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 chrome-edge"
              style={{
                background: isVNextShell
                  ? 'linear-gradient(135deg, rgba(34,211,238,0.32), rgba(37,99,235,0.24) 72%, rgba(139,92,246,0.24))'
                  : 'linear-gradient(135deg, rgba(99,102,241,0.42) 0%, rgba(139,92,246,0.30) 100%)',
                border: isVNextShell ? '1px solid rgba(103,232,249,0.30)' : '1px solid rgba(99,102,241,0.40)',
                boxShadow: isVNextShell ? '0 4px 16px -5px rgba(34,211,238,0.55)' : '0 4px 12px -4px rgba(99,102,241,0.5)',
              }}
            >
              <span className="text-[10px] font-bold text-white">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-white/90 truncate font-medium tracking-tight">
                {isVNextShell ? humanName : emailHandle}
              </p>
              <p className="eyebrow !text-[8.5px] !text-meta !tracking-[0.20em] mt-0.5">Operatör</p>
            </div>
            <button
              onClick={handleSignOut}
              title="Logga ut"
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/[0.06] text-secondary hover:text-white ease-os"
            >
              <LogOut className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
