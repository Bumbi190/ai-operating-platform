/**
 * Atlas record-access executor (Foundation 2) — backs the `get_records` tool.
 *
 * Reuses the shipped isolation boundary: every query is `applyProjectScope`d to
 * the caller's allowed projects, a model-supplied `project` is mapped slug→id
 * and membership-checked, a by-`id` fetch is an ADDITIONAL filter (never a scope
 * bypass), columns come strictly from the registry (no SELECT *), and PII is
 * excluded unless explicitly requested (and then logged).
 */

import { applyProjectScope, scopeProjectFilter } from './isolation'
import { resolveProjectSlug } from '@/lib/nav/registry'
import { DOMAIN_REGISTRY, RECORD_DOMAINS, type RecordDomain } from './data-registry'

type AnyDb = any

export interface GetRecordsInput {
  domain: string
  project?: string
  filters?: Record<string, string>
  id?: string
  limit?: number
  includePii?: boolean
}

export interface GetRecordsResult {
  domain?: string
  project?: string | null
  count: number
  rows: Record<string, unknown>[]
  truncated: boolean
  note?: string
  error?: string
}

function truncate(val: unknown, n: number): unknown {
  if (typeof val !== 'string') return val
  return val.length > n ? val.slice(0, n) + '…' : val
}

export async function fetchRecords(
  db: AnyDb,
  input: GetRecordsInput,
  allowedProjectIds: string[],
): Promise<GetRecordsResult> {
  const spec = DOMAIN_REGISTRY[input.domain as RecordDomain]
  if (!spec) {
    return { count: 0, rows: [], truncated: false, error: `Okänd domän: ${input.domain}. Tillåtna: ${RECORD_DOMAINS.join(', ')}.` }
  }

  // ── Optional narrowing to a specific project (mapped slug→id, owner-checked) ──
  let scopeIds = allowedProjectIds
  let projectSlug: string | null = null
  if (input.project) {
    const slug = resolveProjectSlug(input.project)
    if (!slug) {
      return { domain: input.domain, project: null, count: 0, rows: [], truncated: false, note: 'Okänt projekt.' }
    }
    const { data: projRows } = await db
      .from('projects')
      .select('id, slug')
      .eq('slug', slug)
      .in('id', scopeProjectFilter(allowedProjectIds)) // membership: only owned projects
    const match = (projRows ?? [])[0] as { id: string } | undefined
    if (!match) {
      return { domain: input.domain, project: slug, count: 0, rows: [], truncated: false, note: 'Projektet finns inte i din åtkomst.' }
    }
    scopeIds = [match.id]
    projectSlug = slug
  }

  // ── Strictly-whitelisted columns (never SELECT *; PII only on request) ───────
  const cols = [...spec.columns, ...(input.includePii && spec.piiColumns ? spec.piiColumns : [])]
  const selectList = cols.join(', ')

  let q = db.from(spec.table).select(selectList)
  q = applyProjectScope(q, scopeIds)            // ALWAYS scoped; empty allow-list → impossible id → 0 rows
  if (input.id) q = q.eq('id', input.id)        // by-id is an EXTRA filter; the project scope above still applies

  if (input.filters) {
    for (const [k, v] of Object.entries(input.filters)) {
      const allowed = spec.filters?.[k]
      if (!allowed) continue                    // unknown filter key → dropped
      if (allowed.includes('*') || allowed.includes(v)) q = q.eq(k, v)
    }
  }

  const limit = Math.min(Math.max(1, input.limit ?? 10), spec.maxLimit)
  q = q.order(spec.defaultOrder.column, { ascending: spec.defaultOrder.ascending }).limit(limit)

  let data: Record<string, unknown>[] = []
  try {
    const res = await q
    if (res?.error) {
      return { domain: input.domain, project: projectSlug, count: 0, rows: [], truncated: false, error: 'Kunde inte hämta poster.' }
    }
    data = (res?.data ?? []) as Record<string, unknown>[]
  } catch {
    return { domain: input.domain, project: projectSlug, count: 0, rows: [], truncated: false, error: 'Kunde inte hämta poster.' }
  }

  let rows = data
  if (spec.truncate) {
    rows = rows.map(r => {
      const out = { ...r }
      for (const [col, n] of Object.entries(spec.truncate!)) out[col] = truncate(out[col], n)
      return out
    })
  }

  // Audit — metadata only, never row contents or PII values.
  // eslint-disable-next-line no-console
  console.log(`[get_records] domain=${input.domain} project=${projectSlug ?? 'all-owned'} scope=${scopeIds.length} rows=${rows.length} pii=${!!input.includePii}`)

  return {
    domain: input.domain,
    project: projectSlug,
    count: rows.length,
    rows,
    truncated: rows.length >= limit,
  }
}
