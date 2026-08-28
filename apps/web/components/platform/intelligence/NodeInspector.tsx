'use client'

/**
 * NodeInspector — the right-hand detail panel of the Intelligence Graph.
 * Renders only validated contract data as TEXT (never HTML). File paths are
 * repo-relative by contract; runtime nodes link to their existing Omnira routes.
 */

import Link from 'next/link'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { nodeColor } from './GraphCanvas'

const KIND_LABEL: Record<string, string> = {
  community: 'Subsystem',
  code: 'Kod',
  document: 'Dokument',
  rationale: 'Rationale',
  project: 'Projekt',
  agent: 'Agent',
  workflow: 'Workflow',
  run: 'Körning',
  approval: 'Granskning',
  output: 'Utdata',
  task: 'Manager-task',
}

/** Existing Omnira routes for runtime nodes — reuse, never invent. */
function runtimeHref(node: IntelligenceGraphNode): { href: string; label: string } | null {
  const slug = typeof node.metadata?.slug === 'string' ? node.metadata.slug : null
  switch (node.kind) {
    case 'project':
      return slug ? { href: `/projects/${slug}`, label: 'Öppna projektet' } : null
    case 'run':
      return { href: '/agent-activity', label: 'Öppna Aktivitet' }
    case 'approval':
      return { href: '/approvals', label: 'Öppna Granskningar' }
    case 'task':
      return { href: '/manager', label: 'Öppna Manager' }
    default:
      return null
  }
}

export interface NodeInspectorProps {
  node: IntelligenceGraphNode
  edges: IntelligenceGraphEdge[]
  neighbors: IntelligenceGraphNode[]
  builtAtCommit?: string
  onClose: () => void
  onSelectNeighbor: (node: IntelligenceGraphNode) => void
  onDrillIn?: (node: IntelligenceGraphNode) => void
  onIsolate?: (node: IntelligenceGraphNode) => void
  className?: string
}

export function NodeInspector({
  node, edges, neighbors, builtAtCommit, onClose, onSelectNeighbor, onDrillIn, onIsolate, className,
}: NodeInspectorProps) {
  const color = nodeColor(node)
  const degree = node.degree ?? edges.length
  const link = node.source === 'runtime' ? runtimeHref(node) : null

  const relationCounts = new Map<string, number>()
  for (const e of edges) relationCounts.set(e.relation, (relationCounts.get(e.relation) ?? 0) + 1)

  const neighborById = new Map(neighbors.map(n => [n.id, n]))

  return (
    <aside
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/[0.06]',
        'bg-[rgba(10,12,20,0.92)] backdrop-blur-xl shadow-2xl',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-white/[0.06] p-4">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}66` }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-100" title={node.label}>{node.label}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wider text-slate-500">
            {KIND_LABEL[node.kind] ?? node.kind}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
          aria-label="Stäng inspector"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        <dl className="space-y-2">
          {typeof node.community === 'number' && (
            <Row label="Community" value={`#${node.community}`} />
          )}
          {node.sourceFile && (
            <Row label="Källfil" value={node.sourceFile} mono />
          )}
          {node.sourceLocation && (
            <Row label="Position" value={node.sourceLocation} mono />
          )}
          <Row label="Relationer" value={String(degree)} />
          {typeof node.metadata?.size === 'number' && (
            <Row label="Noder i subsystemet" value={String(node.metadata.size)} />
          )}

          {node.kind === 'workflow' && (
            <>
              <WorkflowConfigRow status={node.status} />
              {typeof node.metadata?.trigger === 'string' && (
                <Row label="Trigger" value={node.metadata.trigger as string} />
              )}
            </>
          )}

          {node.kind === 'agent' && (
            <>
              {typeof node.metadata?.model === 'string' && (
                <Row label="Modell" value={node.metadata.model as string} mono />
              )}
              {typeof node.metadata?.description === 'string' && node.metadata.description && (
                <Row label="Beskrivning" value={node.metadata.description as string} />
              )}
            </>
          )}

          {node.kind === 'run' && (
            <>
              {node.status && <Row label="Körningsstatus" value={node.status} />}
              {typeof node.metadata?.createdAt === 'string' && (
                <Row label="Skapad" value={formatTime(node.metadata.createdAt as string)} />
              )}
              {typeof node.metadata?.startedAt === 'string' && (
                <Row label="Startad" value={formatTime(node.metadata.startedAt as string)} />
              )}
              {typeof node.metadata?.finishedAt === 'string' && (
                <Row label="Avslutad" value={formatTime(node.metadata.finishedAt as string)} />
              )}
              {typeof node.metadata?.attempts === 'number' && (
                <Row label="Försök" value={String(node.metadata.attempts)} />
              )}
              {typeof node.metadata?.kind === 'string' && node.metadata.kind && (
                <Row label="Typ" value={node.metadata.kind as string} />
              )}
              {typeof node.metadata?.projectName === 'string' && (
                <Row label="Projekt" value={node.metadata.projectName as string} />
              )}
            </>
          )}

          {node.kind === 'approval' && (
            <>
              {node.status && <Row label="Godkännandestatus" value={node.status} />}
              {typeof node.metadata?.createdAt === 'string' && (
                <Row label="Skapad" value={formatTime(node.metadata.createdAt as string)} />
              )}
              {typeof node.metadata?.reviewedAt === 'string' && (
                <Row label="Granskad" value={formatTime(node.metadata.reviewedAt as string)} />
              )}
              {typeof node.metadata?.operator === 'string' && node.metadata.operator && (
                <Row label="Granskad av" value={node.metadata.operator as string} />
              )}
            </>
          )}

          {node.kind === 'output' && (
            <>
              {typeof node.metadata?.type === 'string' && (
                <Row label="Artefakttyp" value={node.metadata.type as string} />
              )}
              {typeof node.metadata?.createdAt === 'string' && (
                <Row label="Skapad" value={formatTime(node.metadata.createdAt as string)} />
              )}
            </>
          )}

          {node.kind === 'task' && (
            <>
              {node.status && <Row label="Uppgiftsstatus" value={node.status} />}
              {typeof node.metadata?.createdAt === 'string' && (
                <Row label="Skapad" value={formatTime(node.metadata.createdAt as string)} />
              )}
              {(typeof node.metadata?.priority === 'string' || typeof node.metadata?.priority === 'number')
                && node.metadata.priority !== null && (
                  <Row label="Prioritet" value={String(node.metadata.priority)} />
              )}
            </>
          )}

          {builtAtCommit && node.source === 'graphify' && (
            <Row label="Byggd från commit" value={builtAtCommit.slice(0, 12)} mono />
          )}
        </dl>

        {typeof node.metadata?.error === 'string' && node.metadata.error && (
          <div className="rounded-lg border border-red-400/20 bg-red-400/[0.07] p-3">
            <p className="text-[11px] uppercase tracking-wider text-red-300/80">Felmeddelande</p>
            <p className="mt-1 break-words text-xs text-red-200/90">{node.metadata.error as string}</p>
          </div>
        )}

        {relationCounts.size > 0 && (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Relationstyper</p>
            <div className="flex flex-wrap gap-1.5">
              {[...relationCounts.entries()].map(([rel, count]) => (
                <span key={rel} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] text-slate-300">
                  {rel} <span className="text-slate-500">×{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {edges.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">
              Närliggande noder <span className="text-slate-600">({Math.min(edges.length, 12)} av {edges.length})</span>
            </p>
            <ul className="space-y-1">
              {edges.slice(0, 12).map(e => {
                const otherId = e.source === node.id ? e.target : e.source
                const other = neighborById.get(otherId)
                if (!other) return null
                const direction = e.source === node.id ? '→' : '←'
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => onSelectNeighbor(other)}
                      className="group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-white/[0.05]"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: nodeColor(other) }} />
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-300 group-hover:text-slate-100">{other.label}</span>
                      <span className="shrink-0 text-[10px] text-slate-600">{direction} {e.relation}{e.confidence === 'INFERRED' ? ' ·inferred' : ''}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Footer actions */}
      {(onDrillIn || onIsolate || link) && (
        <div className="flex flex-wrap gap-2 border-t border-white/[0.06] p-3">
          {onDrillIn && ['community', 'project', 'workflow', 'agent', 'run'].includes(node.kind) && (
            <button
              type="button"
              onClick={() => onDrillIn(node)}
              className="flex-1 rounded-lg border border-indigo-400/30 bg-indigo-400/10 px-3 py-1.5 text-xs font-medium text-indigo-200 transition-colors hover:bg-indigo-400/20"
            >
              {node.kind === 'community' ? 'Fördjupa i subsystemet' : 'Fördjupa'}
            </button>
          )}
          {onIsolate && ['community', 'project', 'workflow', 'agent', 'run'].includes(node.kind) && (
            <button
              type="button"
              onClick={() => onIsolate(node)}
              className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
            >
              Isolera {node.kind === 'run' ? 'path' : 'scope'}
            </button>
          )}
          {link && (
            <Link
              href={link.href}
              className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-center text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
            >
              {link.label}
            </Link>
          )}
        </div>
      )}
    </aside>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[11px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={cn('min-w-0 truncate text-right text-xs text-slate-200', mono && 'font-mono')} title={value}>
        {value}
      </dd>
    </div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * `workflows.active` is a configuration flag, not an execution signal — there is
 * no "running now" truth to show here. An unrecognized value stays "okänd"
 * rather than being folded into either known state.
 */
function WorkflowConfigRow({ status }: { status?: string }) {
  if (!status) return null
  const label = status === 'active' ? 'aktiverad' : status === 'inactive' ? 'inaktiverad' : 'okänd'
  return <Row label="Konfiguration" value={label} />
}
