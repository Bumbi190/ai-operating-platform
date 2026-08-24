import {
  Activity,
  CalendarRange,
  Cpu,
  Lightbulb,
  MessageSquare,
  Megaphone,
  Network,
  Newspaper,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import type { DestinationId } from '@/lib/nav/registry'

/**
 * Canonical vNext navigation model.
 *
 * ONE definition for both the desktop shell and AtlasMobileNav. Today there are
 * three navigation definitions in the codebase — legacy desktop, vNext desktop
 * (which is still legacy's), and a separate hard-coded mobile list — and they
 * have already drifted: mobile carries a `knowledge` entry the desktop shell has
 * never had. This model exists so a fourth cannot appear and the existing drift
 * has somewhere to converge.
 *
 * NOT WIRED YET. Nothing renders from this file. It encodes the owner-approved
 * IA so the later slices can switch renderers over one at a time, each with its
 * own proof, rather than changing structure and renderer in the same step.
 *
 * Scope boundaries this model deliberately respects:
 *
 * - Data only. No CSS, no class names, no colours. Presentation stays in the
 *   components so a theme change never means editing navigation.
 * - Visibility is a LAYOUT concern, never an authorization one. `desktop` and
 *   `mobile` say where an item appears, nothing about who may reach it. Route
 *   access is enforced by middleware and the server, exactly as before, and
 *   hiding an item here grants and denies nothing.
 * - Legacy is untouched. It keeps its own frozen definition in legacy-nav.ts.
 */

export type VNextNavGroupId = 'atlas' | 'arbete' | 'intelligens' | 'system'

export interface VNextNavItem {
  /** Stable identity, and the registry destination where one exists. */
  id: DestinationId | 'system' | 'planning'
  label: string
  href: string
  icon: LucideIcon
  /** Rendered in the desktop sidebar. */
  desktop: boolean
  /**
   * Rendered in the mobile nav. Intentionally narrower than desktop: the mobile
   * sheet is a quick-jump surface, not the full map.
   */
  mobile: boolean
  /** Marks the single home destination, styled distinctly by the shell. */
  primary?: boolean
}

export interface VNextNavGroup {
  id: VNextNavGroupId
  /** Presentational heading. Groups carry no state — no collapsing in Stage C. */
  label: string
  items: readonly VNextNavItem[]
}

export const VNEXT_NAV: readonly VNextNavGroup[] = [
  {
    id: 'atlas',
    label: 'Atlas',
    items: [
      { id: 'atlas', label: 'Atlas', href: '/atlas', icon: Sparkles, desktop: true, mobile: true, primary: true },
      { id: 'chat', label: 'Chat', href: '/chat', icon: MessageSquare, desktop: true, mobile: true },
    ],
  },
  {
    id: 'arbete',
    label: 'Arbete',
    items: [
      { id: 'approvals', label: 'Granskningar', href: '/approvals', icon: ShieldCheck, desktop: true, mobile: true },
      { id: 'activity', label: 'Aktivitet', href: '/agent-activity', icon: Activity, desktop: true, mobile: true },
      { id: 'planning', label: 'Planering', href: '/planning', icon: CalendarRange, desktop: true, mobile: false },
      { id: 'marketing_queue', label: 'Marknadsgranskning', href: '/atlas/marketing', icon: Megaphone, desktop: true, mobile: false },
      { id: 'content_queue', label: 'Content Center', href: '/atlas/content', icon: Newspaper, desktop: true, mobile: false },
    ],
  },
  {
    id: 'intelligens',
    label: 'Intelligens',
    items: [
      // `knowledge` in the registry routes to /memory; the mobile nav surfaced
      // it under the English label "Knowledge". One destination, one identity.
      { id: 'knowledge', label: 'Minne', href: '/memory', icon: Lightbulb, desktop: true, mobile: true },
      { id: 'intelligence_graph', label: 'Intelligence Graph', href: '/intelligence/graph', icon: Network, desktop: true, mobile: false },
      { id: 'revenue', label: 'Revenue Center', href: '/revenue', icon: TrendingUp, desktop: true, mobile: false },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { id: 'system', label: 'System', href: '/system', icon: Cpu, desktop: true, mobile: false },
      { id: 'settings', label: 'Inställningar', href: '/settings', icon: Settings, desktop: true, mobile: false },
    ],
  },
]

/** Flat item list, in group order. */
export function vnextNavItems(): VNextNavItem[] {
  return VNEXT_NAV.flatMap((group) => [...group.items])
}

/** Items for one surface. Layout filtering only — never an access decision. */
export function vnextNavItemsFor(surface: 'desktop' | 'mobile'): VNextNavItem[] {
  return vnextNavItems().filter((item) => item[surface])
}

/** Groups for one surface, with empty groups dropped. */
export function vnextNavGroupsFor(surface: 'desktop' | 'mobile'): VNextNavGroup[] {
  return VNEXT_NAV
    .map((group) => ({ ...group, items: group.items.filter((item) => item[surface]) }))
    .filter((group) => group.items.length > 0)
}
