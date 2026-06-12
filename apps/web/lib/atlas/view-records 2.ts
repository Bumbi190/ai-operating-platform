/**
 * Atlas View → Record bridge (Sprint 1, Task 2).
 *
 * Turns the trusted [CURRENT VIEW] (from view-context) into the actual rows the
 * operator is looking at, and renders a compact [RECORDS IN VIEW] block injected
 * into Atlas's system prompt — so Atlas can reason about concrete records without
 * the operator re-describing them and without the model having to decide to call
 * a tool first.
 *
 * Security posture is inherited, not re-implemented:
 *  - All reads go through `fetchRecords`, which ALWAYS scopes to the caller's
 *    allowed projects (project isolation) and selects only registry columns.
 *  - This auto-prefetch path NEVER requests PII (`includePii` is always false).
 *    Contact details remain available only via the explicit `get_records` tool.
 *  - A model/operator-supplied selection id is only ever an EXTRA by-id filter;
 *    `fetchRecords` keeps the project scope, so a selection can never widen access.
 *
 * Gated by the ATLAS_RECORD_AWARENESS feature flag (off by default), independent
 * of ATLAS_VIEW_AWARENESS so the bridge can be rolled out after the view block.
 */

import { fetchRecords } from './record-access'
import type { NormalizedView } from './view-context'
import type { DestinationId } from '@/lib/nav/registry'
import { RECORD_DOMAINS, type RecordDomain } from './data-registry'

/** Feature flag — record awareness is off unless explicitly enabled. */
export function isRecordAwarenessEnabled(): boolean {
  const v = process.env.ATLAS_RECORD_AWARENESS
  return v === '1' || v === 'true'
}

/**
 * Which record domain backs each page, plus how the page's (already
 * nav-whitelisted) filter keys map onto the domain's table columns.
 *
 * Only destinations with a clean, project-native row table are listed; pages
 * that are aggregate-only (costs/money), have a dedicated tool (dream), or are
 * overviews (atlas/settings/project_home) are intentionally absent → no-op.
 */
interface DomainMapping {
  domain: RecordDomain
  /** view-filter key → table column. Keys not listed pass through unchanged. */
  filterKeyMap?: Record<string, string>
}

export const DESTINATION_TO_DOMAIN: Partial<Record<DestinationId, DomainMapping>> = {
  approvals: { domain: 'approvals', filterKeyMap: { state: 'status' } },
  activity: { domain: 'runs' },
  content_queue: { domain: 'website_content' },
  marketing_queue: { domain: 'website_content' },
  actions: { domain: 'opportunities' },
  planning: { domain: 'manager_tasks' },
  knowledge: { domain: 'memories' },
  revenue: { domain: 'leads' },
}

export interface RecordQuery {
  domain: RecordDomain
  project?: string
  filters: Record<string, string>
  /** Ids the operator explicitly selected on screen (for guaranteed inclusion). */
  selectedIds: string[]
}

/** How many on-screen rows to prefetch, and how many selected rows to pin. */
export const PREFETCH_LIMIT = 8
export const MAX_PINNED_SELECTION = 3

/** A trailing UUID on a detail route is the record the operator has open. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Extract the open-record id from a detail route (e.g. /atlas/content/<uuid>). */
function routeRecordId(route: string | undefined): string | null {
  const last = (route ?? '').split('/').filter(Boolean).pop()
  return last && UUID_RE.test(last) ? last : null
}

/**
 * Derive the record query for a normalized view, or null when the page has no
 * mapped record domain. Pure (no I/O) so it is fully unit-testable.
 */
export function deriveRecordQuery(view: NormalizedView | null | undefined): RecordQuery | null {
  if (!view || !view.destinationId) return null
  const mapping = DESTINATION_TO_DOMAIN[view.destinationId]
  if (!mapping) return null

  // Remap nav filter keys onto table columns (e.g. approvals: state → status).
  const filters: Record<string, string> = {}
  for (const [k, val] of Object.entries(view.filters ?? {})) {
    if (typeof val !== 'string') continue
    const col = mapping.filterKeyMap?.[k] ?? k
    filters[col] = val
  }

  // Selected ids: the open record from a detail route (highest priority), then
  // any rows the page tagged as selected (or generic 'record' refs). Deduped + capped.
  const fromSelection = (view.selection ?? [])
    .filter(r => r.domain === mapping.domain || r.domain === 'record')
    .map(r => r.id)
    .filter(Boolean)
  const openId = routeRecordId(view.route)
  const selectedIds = Array.from(new Set([...(openId ? [openId] : []), ...fromSelection]))
    .slice(0, MAX_PINNED_SELECTION)

  return {
    domain: mapping.domain,
    project: view.project?.slug,
    filters,
    selectedIds,
  }
}

const compactRow = (row: Record<string, unknown>): string => {
  const parts: string[] = []
  for (const [k, v] of Object.entries(row)) {
    if (v == null || v === '') continue
    const s = Array.isArray(v) ? v.join(',') : String(v)
    parts.push(`${k}=${s}`)
  }
  return `- ${parts.join(' · ')}`
}

/**
 * Render the [RECORDS IN VIEW] block from already-fetched rows. Pure.
 * Rows are assumed to come straight from `fetchRecords` (registry columns only,
 * truncated, never PII).
 */
export function renderRecordsBlock(
  domain: RecordDomain,
  rows: Record<string, unknown>[],
  opts: { project?: string; truncated?: boolean } = {},
): string {
  if (!rows.length) return ''
  const lines: string[] = []
  lines.push(`\n\n[RECORDS IN VIEW — the actual rows on the operator's screen right now]`)
  const scope = opts.project ? ` · project: ${opts.project}` : ''
  lines.push(`Domain: ${domain}${scope} · ${rows.length} row(s)${opts.truncated ? ' (more exist)' : ''}`)
  for (const r of rows) lines.push(compactRow(r))
  lines.push(
    `These are the real records the operator is viewing — reference them directly by id/title; never invent rows. ` +
    `For other domains, more rows, or contact details (PII), call get_records.`,
  )
  return lines.join('\n')
}

type AnyDb = any

/**
 * Orchestrate the bridge: derive the query, fetch the visible rows (project-
 * scoped, no PII), pin any explicitly-selected rows that fell outside the list,
 * and render the block. Returns '' when there is nothing to show (or on error).
 *
 * Safe to call unconditionally behind the flag — every failure path returns ''.
 */
export async function buildRecordsInView(
  db: AnyDb,
  view: NormalizedView | null | undefined,
  allowedProjectIds: string[],
): Promise<string> {
  const q = deriveRecordQuery(view)
  if (!q) return ''
  // Defensive: only ever query a registered domain.
  if (!(RECORD_DOMAINS as readonly string[]).includes(q.domain)) return ''

  try {
    const list = await fetchRecords(
      db,
      { domain: q.domain, project: q.project, filters: q.filters, limit: PREFETCH_LIMIT, includePii: false },
      allowedProjectIds,
    )

    const rows = [...list.rows]
    const seen = new Set(rows.map(r => String((r as { id?: unknown }).id)))

    // Pin explicitly-selected rows that aren't already in the visible list, so a
    // row the operator clicked is guaranteed present even if it's off the top.
    for (const id of q.selectedIds) {
      if (seen.has(id)) continue
      const one = await fetchRecords(
        db,
        { domain: q.domain, project: q.project, id, includePii: false },
        allowedProjectIds,
      )
      const row = one.rows[0]
      if (row) {
        rows.unshift(row)
        seen.add(String((row as { id?: unknown }).id))
      }
    }

    return renderRecordsBlock(q.domain, rows, { project: q.project, truncated: list.truncated })
  } catch {
    return '' // non-critical: never block the chat on prefetch failure
  }
}
