/**
 * Atlas View Awareness (Foundation 1).
 *
 * Turns the small, operator-supplied "view envelope" sent with each chat
 * request into a normalized, trusted [CURRENT VIEW] block for Atlas's context,
 * so Atlas can answer "explain what I'm looking at right now".
 *
 * The envelope is a HINT, never authority: route → destination and project are
 * re-resolved server-side through the navigation registry, filters are
 * whitelisted, and selection/visible carry only ids + short labels (no row
 * data). Record-level detail is a later phase (get_records); this layer only
 * tells Atlas WHAT is on screen, not the contents.
 *
 * Gated by the ATLAS_VIEW_AWARENESS feature flag (off by default).
 */

import {
  pathToDestination,
  destinationLabel,
  destinationFilters,
  projectDisplayName,
  resolveProjectSlug,
  type DestinationId,
} from '@/lib/nav/registry'

// ── Client → server envelope (all fields optional / untrusted) ───────────────
export interface ViewRecordRef {
  domain?: string
  id?: string
  label?: string
}

export interface ClientViewEnvelope {
  pathname?: string
  search?: string            // raw query string, e.g. "?state=pending"
  selection?: ViewRecordRef[]
  visible?: ViewRecordRef[]
  ts?: number
}

// ── Normalized, server-trusted view ──────────────────────────────────────────
export interface NormalizedRecordRef { domain: string; id: string; label: string }

export interface NormalizedView {
  route: string
  destinationId: DestinationId | null
  destinationLabel: string | null
  project: { slug: string; name: string } | null
  filters: Record<string, string>
  selection: NormalizedRecordRef[]
  visible: NormalizedRecordRef[]
}

const MAX_SELECTION = 10
const MAX_VISIBLE = 12
const MAX_LABEL = 80
const MAX_ROUTE = 256

/** Feature flag — view awareness is off unless explicitly enabled. */
export function isViewAwarenessEnabled(): boolean {
  const v = process.env.ATLAS_VIEW_AWARENESS
  return v === '1' || v === 'true'
}

function cleanRoute(pathname?: string): string | null {
  if (!pathname || typeof pathname !== 'string') return null
  const p = pathname.split('?')[0].trim()
  if (!p.startsWith('/') || p.length > MAX_ROUTE) return null
  return p.replace(/\/+$/, '') || '/'
}

function clampRefs(refs: ViewRecordRef[] | undefined, cap: number): NormalizedRecordRef[] {
  if (!Array.isArray(refs)) return []
  const out: NormalizedRecordRef[] = []
  for (const r of refs) {
    if (!r || typeof r.id !== 'string' || !r.id) continue
    out.push({
      domain: typeof r.domain === 'string' && r.domain ? r.domain.slice(0, 40) : 'record',
      id: r.id.slice(0, 80),
      label: typeof r.label === 'string' ? r.label.slice(0, MAX_LABEL) : '',
    })
    if (out.length >= cap) break
  }
  return out
}

/** Derive the active project from the route (/projects/<slug>) or ?project=<slug>. */
function resolveProject(route: string, params: URLSearchParams): NormalizedView['project'] {
  let raw: string | null = null
  const seg = route.split('/').filter(Boolean)
  if (seg[0] === 'projects' && seg[1]) raw = seg[1]
  if (!raw) raw = params.get('project')
  if (!raw) return null
  const slug = resolveProjectSlug(raw)
  if (!slug) return null
  return { slug, name: projectDisplayName(slug) ?? slug }
}

/** Whitelist filters against the destination's allowed keys+values. */
function resolveFilters(destinationId: DestinationId | null, params: URLSearchParams): Record<string, string> {
  if (!destinationId) return {}
  const spec = destinationFilters(destinationId)
  if (!spec) return {}
  const out: Record<string, string> = {}
  for (const [key, allowed] of Object.entries(spec)) {
    const v = params.get(key)
    if (v != null && (allowed.includes('*') || allowed.includes(v))) out[key] = v
  }
  return out
}

/**
 * Normalize an untrusted client envelope into a trusted view, or null if there
 * is nothing usable (no valid route).
 */
export function normalizeView(env: ClientViewEnvelope | undefined | null): NormalizedView | null {
  if (!env) return null
  const route = cleanRoute(env.pathname)
  if (!route) return null

  let params: URLSearchParams
  try { params = new URLSearchParams(env.search ?? '') } catch { params = new URLSearchParams() }

  const destinationId = pathToDestination(route)
  return {
    route,
    destinationId,
    destinationLabel: destinationId ? destinationLabel(destinationId) : null,
    project: resolveProject(route, params),
    filters: resolveFilters(destinationId, params),
    selection: clampRefs(env.selection, MAX_SELECTION),
    visible: clampRefs(env.visible, MAX_VISIBLE),
  }
}

const fmtRefs = (refs: NormalizedRecordRef[]) =>
  refs.map(r => `${r.domain}:${r.id}${r.label ? ` "${r.label}"` : ''}`).join(', ')

/** Render the compact [CURRENT VIEW] block injected into Atlas's system prompt. */
export function renderViewBlock(v: NormalizedView): string {
  const lines: string[] = []
  lines.push(`\n\n[CURRENT VIEW — what the operator is looking at right now]`)
  lines.push(`Page: ${v.destinationLabel ?? v.route}`)
  lines.push(`Project: ${v.project ? `${v.project.name} (${v.project.slug})` : '(none / all)'}`)
  const f = Object.entries(v.filters)
  if (f.length) lines.push(`Filters: ${f.map(([k, val]) => `${k}=${val}`).join(', ')}`)
  if (v.selection.length) lines.push(`Selected: ${fmtRefs(v.selection)}`)
  if (v.visible.length) lines.push(`Visible: ${fmtRefs(v.visible)}`)
  lines.push(`Use this to answer "what am I looking at / explain this page". Reference only what's listed here; do not invent records. You can see WHICH records are on screen (ids + labels), not their full contents.`)
  return lines.join('\n')
}
