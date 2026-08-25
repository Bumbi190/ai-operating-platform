import {
  Activity,
  Bot,
  FileOutput,
  FileText,
  GitBranch,
  Lightbulb,
  MessageSquare,
  Megaphone,
  Network,
  Newspaper,
  Play,
  Radio,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Video,
  type LucideIcon,
} from 'lucide-react'

/**
 * Legacy sidebar navigation — the exact data the legacy shell has always
 * rendered, lifted out of Sidebar.tsx unchanged.
 *
 * It lives here for one reason: Sidebar is a client component wired to
 * next/navigation, the Supabase browser client and a CSS module, so pinning its
 * navigation by rendering it is not sound in a unit test. Holding the data in a
 * pure module lets the regression contract assert against the SAME values the
 * shell renders, rather than a copy that could drift away from the source.
 *
 * This is deliberately just a move. Order, labels, hrefs and icons are
 * untouched, and Sidebar continues to be the only renderer.
 *
 * Legacy navigation is frozen: vNext gets its own model rather than mutating
 * this one.
 */

export interface LegacyNavItem {
  href: string
  label: string
  icon: LucideIcon
  primary?: boolean
}

// P0: 14 → 9 poster; Intelligence Graph-epicen adderade en 10:e (medvetet).
// /manager, /planning och /atlas/operations är DOLDA (nås via URL/Atlas, inte
// via nav). /dashboard, /action-center, /atlas/actions och /atlas/activity är
// redirects och har därför ingen nav-post.
// Marknadsgranskning + Content Center flyttar till projektscope i P2.
export const LEGACY_GLOBAL_NAV: readonly LegacyNavItem[] = [
  { href: '/atlas',          label: 'Atlas',             icon: Sparkles, primary: true },
  { href: '/atlas/marketing', label: 'Marknadsgranskning', icon: Megaphone },
  { href: '/atlas/content',  label: 'Content Center',    icon: Newspaper },
  { href: '/revenue',        label: 'Revenue Center',    icon: TrendingUp },
  { href: '/agent-activity', label: 'Aktivitet',    icon: Activity },
  { href: '/chat',           label: 'Chat',              icon: MessageSquare },
  { href: '/approvals',      label: 'Granskningar',      icon: ShieldCheck },
  { href: '/memory',         label: 'Minne',             icon: Lightbulb },
  { href: '/intelligence/graph', label: 'Intelligence Graph', icon: Network },
]

/** Sub-navigation inside /projects/[slug]. Workspace nav, not global nav. */
export const LEGACY_PROJECT_NAV: readonly LegacyNavItem[] = [
  { href: '/agents',    label: 'Agenter',       icon: Bot },
  { href: '/workflows', label: 'Arbetsflöden',  icon: GitBranch },
  { href: '/runs',      label: 'Körningar',     icon: Play },
  { href: '/outputs',   label: 'Utdata',        icon: FileOutput },
]

/** Additional workspace nav for media-capable projects. */
export const LEGACY_MEDIA_PROJECT_NAV: readonly LegacyNavItem[] = [
  { href: '/media',    label: 'Mediepipeline',  icon: Radio },
  { href: '/generate', label: 'Generera',        icon: Video },
  { href: '/news',     label: 'Nyhetsflöde',    icon: Newspaper },
  { href: '/scripts',  label: 'Manuskriptkö',   icon: FileText },
]

/** Settings sits outside the nav lists, as a footer destination. */
export const LEGACY_SETTINGS_HREF = '/settings'
