/**
 * Omnira Navigation Registry — the single source of truth for "where does a
 * concept live?". Atlas deep links, Atlas direct-navigation, the ⌘K command
 * palette, the Activity Rail and the Executive Brain all resolve destinations
 * through THIS module and nowhere else.
 *
 * Design goals:
 *  - Atlas never emits raw URLs. It passes a logical DestinationId (+ optional
 *    project + filters); the registry validates and builds the href.
 *  - Logical destination is decoupled from the current path via ROUTE_MAP, so
 *    the future Activity / Money / Health / Knowledge (Obsidian) instruments
 *    plug in by repointing ONE line — no registry redesign.
 *  - Project name → slug resolution lives here too ("The Prompt" → the real
 *    slug), so a link can never silently target the wrong business.
 */

import { BUSINESS_PROFILES } from '@/lib/atlas/identity'

// ─────────────────────────────────────────────────────────────────────────────
// Destinations
// ─────────────────────────────────────────────────────────────────────────────

export type DestinationId =
  | 'atlas'
  | 'chat'
  | 'approvals'
  | 'activity'
  | 'money'
  | 'costs'
  | 'revenue'
  | 'dream'
  | 'knowledge'
  | 'health'
  | 'content_queue'
  | 'marketing_queue'
  | 'actions'
  | 'planning'
  | 'settings'
  | 'project_home'

type ProjectMode = 'none' | 'query' | 'path'

export interface Destination {
  id: DestinationId
  label: string
  /** Fuzzy-match terms for the ⌘K palette (English + Swedish). */
  keywords: string[]
  projectMode: ProjectMode
  /** Allowed filter keys → allowed values. '*' means any string. */
  filters?: Record<string, readonly string[]>
  /** Hide from the palette's default/blank list (still resolvable). */
  hidden?: boolean
}

export interface ResolvedLink {
  id: DestinationId
  label: string
  href: string
}

export interface NavResult {
  kind: 'page' | 'project' | 'intent'
  label: string
  href?: string
  hint?: string
  id?: DestinationId
}

// Logical id → current base path. Repoint these (and only these) when the P3
// instruments ship — e.g. activity → '/activity', money → '/money'.
const ROUTE_MAP: Record<DestinationId, string> = {
  atlas: '/atlas',
  chat: '/chat',
  approvals: '/approvals',
  activity: '/agent-activity', // → '/activity' when the Activity instrument ships
  money: '/costs', // → '/money' when the Money instrument ships
  costs: '/costs',
  revenue: '/revenue',
  dream: '/system', // → '/health' (Dream/bug status lives in Health)
  knowledge: '/memory', // → '/knowledge' (Obsidian / Knowledge graph)
  health: '/system', // → '/health'
  content_queue: '/atlas/content',
  marketing_queue: '/atlas/marketing',
  actions: '/atlas/actions',
  planning: '/planning',
  settings: '/settings',
  project_home: '/projects', // path mode → /projects/<slug>
}

const DESTINATIONS: Record<DestinationId, Destination> = {
  atlas: { id: 'atlas', label: 'Atlas', keywords: ['atlas', 'home', 'start', 'hem', 'briefing'], projectMode: 'none' },
  chat: { id: 'chat', label: 'Chat', keywords: ['chat', 'ask atlas', 'prata', 'fråga'], projectMode: 'none' },
  approvals: {
    id: 'approvals', label: 'Approvals',
    keywords: ['approvals', 'godkännanden', 'granskningar', 'review', 'pending'],
    projectMode: 'query',
    filters: { state: ['pending', 'approved', 'rejected', 'revised'] },
  },
  activity: {
    id: 'activity', label: 'Activity',
    keywords: ['activity', 'aktivitet', 'runs', 'körningar', 'failed', 'fallerade', 'agent activity'],
    projectMode: 'query',
    filters: { status: ['failed', 'running', 'done', 'queued', 'stalled'] },
  },
  money: {
    id: 'money', label: 'Money',
    keywords: ['money', 'spend', 'cost', 'kostnad', 'ekonomi', 'budget', 'pengar'],
    projectMode: 'query',
  },
  costs: { id: 'costs', label: 'Costs', keywords: ['costs', 'kostnader'], projectMode: 'query', hidden: true },
  revenue: {
    id: 'revenue', label: 'Revenue',
    keywords: ['revenue', 'intäkt', 'leads', 'sales', 'mrr'],
    projectMode: 'query',
  },
  dream: {
    id: 'dream', label: 'Dream Findings',
    keywords: ['dream', 'findings', 'insights', 'nattlig', 'self-improvement', 'fynd'],
    projectMode: 'query',
  },
  knowledge: {
    id: 'knowledge', label: 'Knowledge',
    keywords: ['knowledge', 'memory', 'minne', 'graph', 'obsidian', 'kunskap', 'decisions'],
    projectMode: 'none',
  },
  health: {
    id: 'health', label: 'Health',
    keywords: ['health', 'system', 'telemetry', 'hälsa', 'status', 'tokens'],
    projectMode: 'none',
  },
  content_queue: {
    id: 'content_queue', label: 'Content Queue',
    keywords: ['content', 'articles', 'queue', 'innehåll', 'editorial', 'the prompt'],
    projectMode: 'none',
  },
  marketing_queue: {
    id: 'marketing_queue', label: 'Marketing Queue',
    keywords: ['marketing', 'marknad', 'familje', 'drafts', 'utkast'],
    projectMode: 'none',
  },
  actions: {
    id: 'actions', label: 'Action Center',
    keywords: ['actions', 'action center', 'att göra', 'priorities', 'next'],
    projectMode: 'none',
  },
  planning: { id: 'planning', label: 'Planning', keywords: ['planning', 'planering', 'plan', 'week'], projectMode: 'none' },
  settings: { id: 'settings', label: 'Settings', keywords: ['settings', 'inställningar', 'config'], projectMode: 'none' },
  project_home: {
    id: 'project_home', label: 'Project',
    keywords: ['project', 'projekt'],
    projectMode: 'path',
    hidden: true,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Project name / alias → canonical slug
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT_ALIASES: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const [slug, profile] of Object.entries(BUSINESS_PROFILES)) {
    map[slug] = slug
    map[profile.name.toLowerCase()] = slug
  }
  // Hand-tuned aliases for the way operators (and Atlas) actually refer to them.
  Object.assign(map, {
    'the prompt': 'ai-media-automation',
    'the-prompt': 'ai-media-automation',
    prompt: 'ai-media-automation',
    'familje': 'familje-stunden',
    'familje stunden': 'familje-stunden',
    familjestunden: 'familje-stunden',
    'gain pilot': 'gainpilot',
  })
  return map
})()

/**
 * Resolve any operator/Atlas reference to a project into a canonical slug.
 * Returns `null` for an explicitly-given-but-unresolvable project (so a link is
 * dropped rather than pointed at the wrong business), or `undefined` for "no
 * project given".
 */
export function resolveProjectSlug(input?: string | null): string | null | undefined {
  if (input == null || input === '') return undefined
  const key = input.trim().toLowerCase()
  if (PROJECT_ALIASES[key]) return PROJECT_ALIASES[key]
  // Lenient: accept anything already shaped like a slug (supports new projects
  // not yet in BUSINESS_PROFILES). Validation of destination + filters still applies.
  if (/^[a-z0-9][a-z0-9-]{1,40}$/.test(key)) return key
  return null
}

function displayName(slug?: string): string | undefined {
  if (!slug) return undefined
  return BUSINESS_PROFILES[slug]?.name ?? slug
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — the only way to turn a concept into an href
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolveOptions {
  project?: string | null
  filters?: Record<string, string>
  /** Override the generated label (e.g. a phrase Atlas wants on the chip). */
  label?: string
}

export function resolveDestination(id: DestinationId, opts: ResolveOptions = {}): ResolvedLink | null {
  const def = DESTINATIONS[id]
  if (!def) return null

  let slug: string | undefined
  if (opts.project != null && opts.project !== '') {
    const r = resolveProjectSlug(opts.project)
    if (r === null) return null // explicit project we couldn't trust → drop the link
    slug = r ?? undefined
  }

  let path = ROUTE_MAP[id]
  if (def.projectMode === 'path') {
    if (!slug) return null // a path-scoped destination needs a project
    path = `${ROUTE_MAP[id]}/${slug}`
  }

  const qs = new URLSearchParams()
  if (def.projectMode === 'query' && slug) qs.set('project', slug)
  if (opts.filters) {
    for (const [k, v] of Object.entries(opts.filters)) {
      const allowed = def.filters?.[k]
      if (!allowed) continue
      if (allowed.includes('*') || allowed.includes(v)) qs.set(k, v)
    }
  }

  const query = qs.toString()
  const baseLabel = def.projectMode !== 'none' && slug ? `${def.label} · ${displayName(slug)}` : def.label
  return { id, label: opts.label ?? baseLabel, href: query ? `${path}?${query}` : path }
}

/** Resolve a batch (Atlas `present_links`), silently dropping invalid items. */
export function resolveLinks(
  items: { destination: DestinationId; project?: string; filters?: Record<string, string>; label?: string }[],
): ResolvedLink[] {
  const out: ResolvedLink[] = []
  for (const it of items ?? []) {
    const r = resolveDestination(it.destination, { project: it.project, filters: it.filters, label: it.label })
    if (r) out.push(r)
  }
  return out
}

/** The destination ids Atlas may reference — exported for the tool schema enum. */
export const DESTINATION_IDS = Object.keys(DESTINATIONS) as DestinationId[]

/** Default jump targets shown in the palette before the operator types. */
export const PRIMARY_JUMP_TARGETS: DestinationId[] = [
  'atlas', 'chat', 'approvals', 'activity', 'money', 'revenue', 'actions', 'health', 'knowledge',
]

interface ProjectLite { name: string; slug: string }

/** Rank destinations + projects for the ⌘K palette. */
export function searchDestinations(query: string, opts: { projects?: ProjectLite[] } = {}): NavResult[] {
  const q = query.trim().toLowerCase()
  const projects = opts.projects ?? []

  if (!q) {
    const pages = PRIMARY_JUMP_TARGETS
      .map(id => resolveDestination(id))
      .filter((r): r is ResolvedLink => !!r)
      .map<NavResult>(r => ({ kind: 'page', id: r.id, label: r.label, href: r.href }))
    const projItems = projects.slice(0, 4).map<NavResult>(p => {
      const r = resolveDestination('project_home', { project: p.slug })
      return { kind: 'project', label: p.name, href: r?.href, hint: 'Project' }
    })
    return [...pages, ...projItems]
  }

  const scored: { score: number; item: NavResult }[] = []

  for (const def of Object.values(DESTINATIONS)) {
    if (def.hidden) continue
    const hay = [def.label.toLowerCase(), ...def.keywords]
    let score = 0
    for (const term of hay) {
      if (term === q) { score = Math.max(score, 100); break }
      if (term.startsWith(q)) score = Math.max(score, 70)
      else if (term.includes(q)) score = Math.max(score, 40)
    }
    if (score > 0) {
      const r = resolveDestination(def.id)
      if (r) scored.push({ score, item: { kind: 'page', id: r.id, label: r.label, href: r.href } })
    }
  }

  for (const p of projects) {
    const name = p.name.toLowerCase()
    const slug = p.slug.toLowerCase()
    let score = 0
    if (name === q || slug === q) score = 95
    else if (name.startsWith(q) || slug.startsWith(q)) score = 65
    else if (name.includes(q) || slug.includes(q)) score = 35
    if (score > 0) {
      const r = resolveDestination('project_home', { project: p.slug })
      scored.push({ score, item: { kind: 'project', label: p.name, href: r?.href, hint: 'Project' } })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 8).map(s => s.item)
}
