/**
 * workspace-registry.ts
 *
 * Mappar URL-pathnames till semantiska Workspace-objekt.
 * Ren funktion — inga side effects, inga API-anrop.
 *
 * Konsumeras av AtlasRuntimeProvider (usePathname) och eventuellt av
 * AtlasMiniOrb (P1B) för att visa kontextuell information om aktuellt workspace.
 */

import type { Workspace, ProjectRef } from './runtime'

interface ProjectInput {
  id: string
  slug: string
  name: string
  color: string
}

/**
 * Konverterar ett pathname till ett semantiskt Workspace-objekt.
 */
export function resolveWorkspace(
  pathname: string,
  projects: ProjectInput[] = [],
): Workspace {

  // ── Atlas-sidor ───────────────────────────────────────────────────────────
  if (pathname === '/atlas') {
    return { href: '/atlas', label: 'Atlas', icon: 'sparkles', status: 'active' }
  }
  if (pathname.startsWith('/atlas/content')) {
    return { href: pathname, label: 'Content Center', icon: 'file-text' }
  }
  if (pathname === '/atlas/marketing') {
    return { href: pathname, label: 'Marknadsgranskning', icon: 'trending-up' }
  }
  if (pathname === '/atlas/operations') {
    return { href: pathname, label: 'Operationer', icon: 'settings-2' }
  }
  if (pathname === '/atlas/activity') {
    return { href: pathname, label: 'Atlas-aktivitet', icon: 'activity' }
  }
  if (pathname === '/atlas/actions') {
    return { href: pathname, label: 'Atlas-åtgärder', icon: 'zap' }
  }
  if (pathname.startsWith('/atlas/')) {
    return { href: pathname, label: 'Atlas', icon: 'sparkles' }
  }

  // ── Plattformssidor ───────────────────────────────────────────────────────
  if (pathname === '/approvals') {
    return { href: pathname, label: 'Granskningar', icon: 'shield-check' }
  }
  if (pathname === '/revenue') {
    return { href: pathname, label: 'Revenue Center', icon: 'bar-chart-2' }
  }
  if (pathname === '/agent-activity') {
    return { href: pathname, label: 'Agent-aktivitet', icon: 'cpu' }
  }
  if (pathname.startsWith('/chat/')) {
    return { href: pathname, label: 'Chatt', icon: 'message-square' }
  }
  if (pathname === '/chat') {
    return { href: pathname, label: 'Chatt', icon: 'message-square' }
  }
  if (pathname === '/memory') {
    return { href: pathname, label: 'Minne', icon: 'lightbulb' }
  }
  if (pathname === '/settings') {
    return { href: pathname, label: 'Inställningar', icon: 'settings' }
  }
  if (pathname === '/manager') {
    return { href: pathname, label: 'Manager', icon: 'layers' }
  }
  if (pathname === '/planning') {
    return { href: pathname, label: 'Planering', icon: 'calendar' }
  }
  if (pathname === '/system') {
    return { href: pathname, label: 'System', icon: 'monitor' }
  }
  if (pathname === '/costs') {
    return { href: pathname, label: 'Kostnader', icon: 'credit-card' }
  }
  if (pathname === '/dashboard') {
    return { href: pathname, label: 'Dashboard', icon: 'layout-dashboard' }
  }
  if (pathname === '/action-center') {
    return { href: pathname, label: 'Action Center', icon: 'inbox' }
  }

  // ── Projektsidor ──────────────────────────────────────────────────────────
  if (pathname === '/projects/new') {
    return { href: pathname, label: 'Nytt projekt', icon: 'plus-circle' }
  }

  if (pathname.startsWith('/projects/')) {
    const parts = pathname.split('/')   // ['', 'projects', 'slug', sub?, ...]
    const slug  = parts[2]
    if (slug) {
      const project = projects.find(p => p.slug === slug)
      const projectRef = project
        ? { id: project.id, slug: project.slug, name: project.name, color: project.color }
        : undefined

      const sub = parts[3]
      const subLabels: Record<string, string> = {
        agents:    'Agenter',
        workflows: 'Arbetsflöden',
        runs:      'Körningar',
        news:      'Nyheter',
        media:     'Media',
        outputs:   'Utdata',
        generate:  'Generera',
        scripts:   'Skript',
      }

      const projectName = project?.name ?? slug
      const label       = sub
        ? `${projectName} · ${subLabels[sub] ?? sub}`
        : projectName

      return {
        href: pathname,
        label,
        project: projectRef,
        icon:    sub ? undefined : 'folder',
        status:  'unknown',
      }
    }
  }

  // ── Fallback ─────────────────────────────────────────────────────────────
  return { href: pathname, label: 'Plattform', icon: 'layout' }
}

/**
 * Extraherar aktivt projekt från ett pathname, om det finns.
 */
export function resolveActiveProject(
  pathname: string,
  projects: ProjectInput[] = [],
): ProjectRef | null {
  if (!pathname.startsWith('/projects/')) return null
  const slug = pathname.split('/')[2]
  if (!slug || slug === 'new') return null
  const project = projects.find(p => p.slug === slug)
  if (!project) return null
  return { id: project.id, slug: project.slug, name: project.name, color: project.color }
}
