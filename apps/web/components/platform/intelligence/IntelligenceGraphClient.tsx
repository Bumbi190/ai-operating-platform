'use client'

/**
 * IntelligenceGraphClient — the Intelligence Graph experience.
 *
 * Three modes:
 *   System Map      — static architecture (Graphify import), progressive levels
 *                     Overview (communities) → Community (drilldown)
 *   Live Operations — read-only runtime graph from real Omnira tables
 *   Execution Replay— honestly disabled (per-step event data is not granular
 *                     enough yet; see docs/intelligence-graph.md)
 *
 * All data arrives via the authenticated /api/intelligence/graph/* routes.
 * No sample data is ever fabricated: empty results render empty states.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Loader2, Maximize2, RotateCcw, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  IntelligenceGraphEdge,
  IntelligenceGraphMeta,
  IntelligenceGraphNode,
} from '@/lib/intelligence/graph-contract'
import { GraphCanvas, nodeColor } from './GraphCanvas'
import { NodeInspector } from './NodeInspector'

type Mode = 'system' | 'operations' | 'replay'

interface GraphPayload {
  available?: boolean
  reason?: string
  hint?: string
  error?: string
  level?: string
  communityId?: number
  truncated?: boolean
  meta?: IntelligenceGraphMeta
  nodes?: IntelligenceGraphNode[]
  edges?: IntelligenceGraphEdge[]
  projects?: Array<{ id: string; name: string; slug: string; color: string }>
}

interface SearchHit {
  id: string
  label: string
  kind: string
  community?: number
  sourceFile?: string
}

const RUN_STATUS_FILTERS = [
  { id: 'running', label: 'Kör' },
  { id: 'awaiting_approval', label: 'Väntar' },
  { id: 'failed', label: 'Fel' },
  { id: 'done', label: 'Klar' },
] as const

const TIME_FILTERS = [
  { hours: 24, label: '24 h' },
  { hours: 24 * 7, label: '7 d' },
  { hours: 24 * 30, label: '30 d' },
] as const

export function IntelligenceGraphClient() {
  const [mode, setMode] = useState<Mode>('system')

  // System Map state
  const [communityId, setCommunityId] = useState<number | null>(null)

  // Live Operations state
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [hours, setHours] = useState<number>(24)
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())

  // Shared state
  const [data, setData] = useState<GraphPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<IntelligenceGraphNode | null>(null)
  const [fitSignal, setFitSignal] = useState(0)
  const [kindFilter, setKindFilter] = useState<Set<string>>(new Set())
  const [relationFilter, setRelationFilter] = useState<Set<string>>(new Set())

  // Search
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const searchAbort = useRef<AbortController | null>(null)
  /** Node id to select once the next payload lands (search → community drilldown). */
  const pendingSelect = useRef<string | null>(null)

  const url = useMemo(() => {
    if (mode === 'system') {
      return communityId === null
        ? '/api/intelligence/graph/system?level=overview'
        : `/api/intelligence/graph/system?level=community&community=${communityId}`
    }
    if (mode === 'operations') {
      const params = new URLSearchParams({ hours: String(hours) })
      if (projectFilter !== 'all') params.set('project', projectFilter)
      return `/api/intelligence/graph/operations?${params}`
    }
    return null
  }, [mode, communityId, projectFilter, hours])

  // ── Data fetch ──
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch(url, { signal: controller.signal })
      .then(async res => {
        if (res.status === 401) throw new Error('Du är inte inloggad.')
        if (!res.ok) throw new Error(`Grafen kunde inte hämtas (${res.status}).`)
        return res.json() as Promise<GraphPayload>
      })
      .then(payload => {
        setData(payload)
        setSelected(null)
        setFitSignal(x => x + 1)
      })
      .catch(err => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Okänt fel.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [url])

  // ── Search (System Map only) ──
  useEffect(() => {
    if (mode !== 'system' || query.trim().length < 2) { setHits([]); return }
    searchAbort.current?.abort()
    const controller = new AbortController()
    searchAbort.current = controller
    const t = setTimeout(() => {
      fetch(`/api/intelligence/graph/system?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then(res => (res.ok ? res.json() : { hits: [] }))
        .then(payload => setHits(payload.hits ?? []))
        .catch(() => {})
    }, 200)
    return () => { clearTimeout(t); controller.abort() }
  }, [query, mode])

  // ── Filters applied client-side ──
  const allNodes = useMemo(() => data?.nodes ?? [], [data])
  const allEdges = useMemo(() => data?.edges ?? [], [data])

  const nodes = useMemo(() => {
    return allNodes.filter(n => {
      if (kindFilter.size > 0 && !kindFilter.has(n.kind)) return false
      if (mode === 'operations' && statusFilter.size > 0 && n.kind === 'run') {
        if (!n.status || !statusFilter.has(n.status)) return false
      }
      return true
    })
  }, [allNodes, kindFilter, statusFilter, mode])

  const edges = useMemo(() => {
    const ids = new Set(nodes.map(n => n.id))
    return allEdges.filter(e => {
      if (!ids.has(e.source) || !ids.has(e.target)) return false
      if (relationFilter.size > 0 && !relationFilter.has(e.relation)) return false
      return true
    })
  }, [allEdges, nodes, relationFilter])

  const presentKinds = useMemo(() => [...new Set(allNodes.map(n => n.kind))], [allNodes])
  const presentRelations = useMemo(() => [...new Set(allEdges.map(e => e.relation))], [allEdges])

  // Inspector data for the selected node
  const selectedEdges = useMemo(
    () => (selected ? allEdges.filter(e => e.source === selected.id || e.target === selected.id) : []),
    [selected, allEdges],
  )
  const neighborNodes = useMemo(() => {
    if (!selected) return []
    const ids = new Set<string>()
    for (const e of selectedEdges) { ids.add(e.source); ids.add(e.target) }
    return allNodes.filter(n => ids.has(n.id))
  }, [selected, selectedEdges, allNodes])

  const drillIn = useCallback((node: IntelligenceGraphNode) => {
    if (node.kind === 'community' && typeof node.community === 'number') {
      setCommunityId(node.community)
      setSelected(null)
    }
  }, [])

  const openSearchHit = useCallback((hit: SearchHit) => {
    setQuery('')
    setHits([])
    if (typeof hit.community === 'number') {
      // Selection resolves once the community payload lands.
      pendingSelect.current = hit.id
      setCommunityId(hit.community)
      return
    }
    // No community to drill into — select directly if the node is in view,
    // and never leave a stale pending selection behind (L1).
    pendingSelect.current = null
    const inView = data?.nodes?.find(n => n.id === hit.id)
    if (inView) setSelected(inView)
  }, [data])
  useEffect(() => {
    if (!pendingSelect.current || !data?.nodes) return
    const found = data.nodes.find(n => n.id === pendingSelect.current)
    if (found) setSelected(found)
    // One resolution attempt per payload — hit or miss, the intent is consumed (L1).
    pendingSelect.current = null
  }, [data])

  const toggle = (set: Set<string>, value: string, apply: (next: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    apply(next)
  }

  const resetView = useCallback(() => {
    setKindFilter(new Set())
    setRelationFilter(new Set())
    setStatusFilter(new Set())
    setSelected(null)
    setFitSignal(x => x + 1)
  }, [])

  const unavailable = data && data.available === false

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* ── Mode tabs + toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-white/[0.07] bg-white/[0.03] p-0.5">
          <TabButton active={mode === 'system'} onClick={() => setMode('system')}>System Map</TabButton>
          <TabButton active={mode === 'operations'} onClick={() => setMode('operations')}>Live Operations</TabButton>
          <TabButton active={false} disabled title="Kräver mer granulär eventdata (per-steg-tidslinje). Se docs/intelligence-graph.md.">
            Execution Replay
          </TabButton>
        </div>

        {mode === 'system' && communityId !== null && (
          <button
            type="button"
            onClick={() => { setCommunityId(null); setSelected(null) }}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/[0.07]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Overview
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {mode === 'system' && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Sök nod…"
                className="w-44 rounded-lg border border-white/[0.07] bg-white/[0.03] py-1.5 pl-8 pr-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-indigo-400/40 focus:outline-none md:w-56"
              />
              {hits.length > 0 && (
                <ul className="absolute right-0 top-full z-20 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-white/[0.08] bg-[rgba(10,12,20,0.97)] p-1 shadow-2xl backdrop-blur-xl">
                  {hits.map(hit => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        onClick={() => openSearchHit(hit)}
                        className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
                      >
                        <span className="truncate text-xs text-slate-200">{hit.label}</span>
                        <span className="truncate text-[10px] text-slate-500">
                          {hit.kind}{typeof hit.community === 'number' ? ` · community ${hit.community}` : ''}{hit.sourceFile ? ` · ${hit.sourceFile}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <IconButton onClick={() => setFitSignal(x => x + 1)} title="Fit to graph"><Maximize2 className="h-3.5 w-3.5" /></IconButton>
          <IconButton onClick={resetView} title="Återställ vy"><RotateCcw className="h-3.5 w-3.5" /></IconButton>
        </div>
      </div>

      {/* ── Filter row ── */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {mode === 'operations' && (
          <>
            <select
              value={projectFilter}
              onChange={e => setProjectFilter(e.target.value)}
              className="rounded-lg border border-white/[0.07] bg-[rgba(10,12,20,0.9)] px-2 py-1.5 text-xs text-slate-200 focus:outline-none"
              aria-label="Projektfilter"
            >
              <option value="all">Alla projekt</option>
              {(data?.projects ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <div className="flex rounded-lg border border-white/[0.07] bg-white/[0.03] p-0.5">
              {TIME_FILTERS.map(t => (
                <TabButton key={t.hours} active={hours === t.hours} onClick={() => setHours(t.hours)} small>{t.label}</TabButton>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {RUN_STATUS_FILTERS.map(s => (
                <FilterChip
                  key={s.id}
                  active={statusFilter.has(s.id)}
                  onClick={() => toggle(statusFilter, s.id, setStatusFilter)}
                >
                  {s.label}
                </FilterChip>
              ))}
            </div>
          </>
        )}

        {presentKinds.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {presentKinds.map(kind => (
              <FilterChip
                key={kind}
                active={kindFilter.has(kind)}
                onClick={() => toggle(kindFilter, kind, setKindFilter)}
                dotColor={nodeColor({ kind, id: '', label: '', source: 'graphify', metadata: {} } as IntelligenceGraphNode)}
              >
                {kind}
              </FilterChip>
            ))}
          </div>
        )}

        {presentRelations.length > 1 && (
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-400 transition-colors hover:bg-white/[0.07]">
              Relationer {relationFilter.size > 0 ? `(${relationFilter.size})` : ''}
            </summary>
            <div className="absolute left-0 top-full z-20 mt-1 flex w-60 flex-wrap gap-1.5 rounded-lg border border-white/[0.08] bg-[rgba(10,12,20,0.97)] p-2 shadow-2xl backdrop-blur-xl">
              {presentRelations.map(rel => (
                <FilterChip key={rel} active={relationFilter.has(rel)} onClick={() => toggle(relationFilter, rel, setRelationFilter)}>
                  {rel}
                </FilterChip>
              ))}
            </div>
          </details>
        )}

        {data?.meta?.builtAtCommit && mode === 'system' && (
          <span className="ml-auto font-mono text-[10px] text-slate-600" title="Git-commit som grafen byggdes från">
            {data.meta.builtAtCommit.slice(0, 10)}
          </span>
        )}
        {data?.truncated && (
          <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-300">
            Vyn är trunkerad — högst {nodes.length} noder visas
          </span>
        )}
      </div>

      {/* ── Canvas + inspector ── */}
      <div className="relative flex min-h-0 flex-1 gap-3">
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-white/[0.06] bg-[var(--omnira-bg)]">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" /> Laddar graf…
              </div>
            </div>
          )}

          {error && !loading && (
            <StateMessage title="Grafen kunde inte laddas" body={error} tone="error" />
          )}

          {unavailable && !loading && !error && (
            <StateMessage
              title={mode === 'system' ? 'Ingen System Map-artifact ännu' : 'Ingen driftdata'}
              body={mode === 'system'
                ? 'Ingen distribuerad System Map-artifact är tillgänglig för den här versionen. Grafen är inte trasig; Graphify-generering och leverans hanteras separat.'
                : data?.hint ?? 'Ingen data tillgänglig ännu.'}
            />
          )}

          {!loading && !error && !unavailable && nodes.length === 0 && (
            <StateMessage
              title="Tom graf"
              body={mode === 'operations'
                ? 'Inga körningar i det valda tidsfönstret. Justera tids- eller projektfiltret.'
                : 'Inga noder matchar de aktiva filtren.'}
            />
          )}

          {!error && !unavailable && nodes.length > 0 && (
            <GraphCanvas
              nodes={nodes}
              edges={edges}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              onOpen={drillIn}
              fitSignal={fitSignal}
              mode={mode === 'operations' ? 'operations' : 'system'}
            />
          )}
        </div>

        {selected && (
          <div className="absolute inset-y-0 right-0 z-10 w-[19rem] max-w-[85vw] md:static md:z-auto md:w-80 md:shrink-0">
            <NodeInspector
              node={selected}
              edges={selectedEdges}
              neighbors={neighborNodes}
              builtAtCommit={data?.meta?.builtAtCommit}
              onClose={() => setSelected(null)}
              onSelectNeighbor={setSelected}
              onDrillIn={drillIn}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Small UI atoms ──────────────────────────────────────────────────────────

function TabButton({
  active, disabled, small, title, onClick, children,
}: {
  active: boolean
  disabled?: boolean
  small?: boolean
  title?: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
        small && 'px-2.5 py-1',
        active ? 'bg-indigo-400/20 text-indigo-100' : 'text-slate-400 hover:text-slate-200',
        disabled && 'cursor-not-allowed text-slate-600 hover:text-slate-600',
      )}
    >
      {children}
    </button>
  )
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-2 text-slate-400 transition-colors hover:bg-white/[0.07] hover:text-slate-200"
    >
      {children}
    </button>
  )
}

function FilterChip({
  active, dotColor, onClick, children,
}: {
  active: boolean
  dotColor?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
        active
          ? 'border-indigo-400/40 bg-indigo-400/15 text-indigo-100'
          : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:bg-white/[0.07]',
      )}
    >
      {dotColor && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor }} />}
      {children}
    </button>
  )
}

function StateMessage({ title, body, tone = 'default' }: { title: string; body: string; tone?: 'default' | 'error' }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <p className={cn('text-sm font-medium', tone === 'error' ? 'text-red-300' : 'text-slate-200')}>{title}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{body}</p>
      </div>
    </div>
  )
}
