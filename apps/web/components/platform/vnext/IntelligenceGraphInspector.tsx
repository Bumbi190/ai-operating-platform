'use client'

/**
 * The vNext Intelligence Graph inspector.
 *
 * The same docking as the legacy inspector — a column beside the canvas from
 * 768px, a bottom sheet below it — and the same actions: drill in, isolate,
 * follow a neighbour, open the node's existing Omnira route. What it adds is
 * where each fact comes from:
 *
 *  - PROVENANCE. A runtime node names the table the builder read it from and
 *    the snapshot it arrived in; a static node names the Graphify artifact, its
 *    source location and commit.
 *  - RELATIONS IN THEIR OWN WORDS. Each connection is phrased from this node's
 *    side ("körning av", not "STARTED") and tagged Direkt / Definition /
 *    Härledd from `relationTruth`, which never raises a class.
 *  - NO BORROWED DECISION. `approvals.operator` is labelled "Godkänd av" only on
 *    an approved row; the legacy panel said it for every stored operator.
 *
 * Everything renders as text. Nothing here fetches.
 */

import Link from 'next/link'
import { Crosshair, X } from 'lucide-react'
import type {
  IntelligenceGraphEdge,
  IntelligenceGraphMeta,
  IntelligenceGraphNode,
} from '@/lib/intelligence/graph-contract'
import { nodeColor } from '@/components/platform/intelligence/GraphCanvas'
import {
  RELATION_TRUTH_COPY,
  SCOPEABLE_KINDS,
  kindLabel,
  nodeProvenance,
  nodeStatus,
  operatorLabel,
  relationTruth,
  relationWording,
  runtimeDestination,
  snapshotStamp,
} from '@/lib/os/intelligence-graph-shared'
import styles from './IntelligenceGraphVNext.module.css'

/** Connections listed before the panel says how many it left out. */
const RELATION_LIMIT = 12

export interface IntelligenceGraphInspectorProps {
  node: IntelligenceGraphNode
  edges: IntelligenceGraphEdge[]
  neighbors: IntelligenceGraphNode[]
  /** The payload's meta — only when it belongs to the mode on screen. */
  meta: IntelligenceGraphMeta | undefined
  mode: 'system' | 'operations'
  onClose: () => void
  onSelectNeighbor: (node: IntelligenceGraphNode) => void
  onDrillIn: (node: IntelligenceGraphNode) => void
  onIsolate: (node: IntelligenceGraphNode) => void
  onFocus: (node: IntelligenceGraphNode) => void
}

export function IntelligenceGraphInspector({
  node, edges, neighbors, meta, mode, onClose, onSelectNeighbor, onDrillIn, onIsolate, onFocus,
}: IntelligenceGraphInspectorProps) {
  const color = nodeColor(node)
  const status = nodeStatus(node)
  const provenance = nodeProvenance(node, meta)
  const destination = runtimeDestination(node)
  const scopeable = SCOPEABLE_KINDS.has(node.kind)
  const neighborById = new Map(neighbors.map(neighbor => [neighbor.id, neighbor]))
  const fetched = mode === 'operations' && meta ? snapshotStamp('operations', meta) : null
  const facts = inspectorFacts(node)

  return (
    <aside className={styles.inspector} aria-label={`${kindLabel(node.kind)}: ${node.label}`} data-testid="graph-inspector">
      <div className={styles.inspectorHeader}>
        <span className={styles.inspectorGlyph} style={{ backgroundColor: color }} aria-hidden />
        <div className={styles.inspectorHeading}>
          <p className={styles.inspectorTitle} title={node.label}>{node.label}</p>
          <p className={styles.inspectorKind}>{kindLabel(node.kind)}</p>
        </div>
        <button type="button" onClick={onClose} className={styles.inspectorClose} aria-label="Stäng inspektören">
          <X className={styles.buttonIcon} aria-hidden />
        </button>
      </div>

      <div className={styles.inspectorBody}>
        {status && (
          <div className={styles.inspectorStatus} data-tone={status.tone} data-testid="inspector-status">
            <span className={styles.inspectorSection}>{mode === 'operations' ? 'Status vid hämtning' : 'Status'}</span>
            <span className={styles.inspectorStatusValue}>
              <span className={styles.statusDot} aria-hidden />
              {status.label}
              {status.unknown && <span className={styles.inspectorRaw}> ({status.raw})</span>}
            </span>
          </div>
        )}

        {facts.length > 0 && (
          <dl className={styles.facts}>
            {facts.map(fact => (
              <div key={fact.label} className={styles.fact}>
                <dt>{fact.label}</dt>
                <dd data-mono={fact.mono ? 'true' : undefined} title={fact.value}>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {typeof node.metadata?.error === 'string' && node.metadata.error && (
          <div className={styles.inspectorError}>
            <span className={styles.inspectorSection}>Lagrat fel</span>
            <p>{node.metadata.error}</p>
          </div>
        )}

        <div className={styles.provenance} data-testid="inspector-provenance">
          <span className={styles.inspectorSection}>Källa</span>
          <p>{provenance.source}{provenance.detail ? <span className={styles.provenanceDetail}> · {provenance.detail}</span> : null}</p>
          {fetched && <p className={styles.provenanceDetail} title={fetched.detail ?? undefined}>{fetched.label}</p>}
        </div>

        {edges.length > 0 && (
          <div className={styles.relations}>
            <span className={styles.inspectorSection}>
              Kopplingar i vyn{' '}
              <span className={styles.inspectorRaw}>
                ({edges.length > RELATION_LIMIT ? `${RELATION_LIMIT} av ${edges.length}` : edges.length})
              </span>
            </span>
            <ul className={styles.relationList}>
              {edges.slice(0, RELATION_LIMIT).map(edge => {
                const outgoing = edge.source === node.id
                const other = neighborById.get(outgoing ? edge.target : edge.source)
                if (!other) return null
                const wording = relationWording(edge)
                const truth = relationTruth(edge)
                const step = edge.relation === 'DELEGATED_TO' && typeof edge.metadata?.step === 'string'
                  ? edge.metadata.step
                  : null
                return (
                  <li key={edge.id}>
                    <button type="button" onClick={() => onSelectNeighbor(other)} className={styles.relation}>
                      <span className={styles.relationDot} style={{ backgroundColor: nodeColor(other) }} aria-hidden />
                      <span className={styles.relationText}>
                        <span className={styles.relationPhrase}>{outgoing ? wording.forward : wording.backward}</span>
                        <span className={styles.relationOther}>{other.label}</span>
                        {step && <span className={styles.relationStep}>steg: {step}</span>}
                      </span>
                      <span className={styles.relationTruth} data-truth={truth}>{RELATION_TRUTH_COPY[truth].label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      <div className={styles.inspectorActions}>
        {scopeable && (
          <button type="button" onClick={() => onDrillIn(node)} className={styles.primaryAction}>
            {node.kind === 'community' ? 'Fördjupa i subsystemet' : 'Fördjupa'}
          </button>
        )}
        {scopeable && (
          <button type="button" onClick={() => onIsolate(node)} className={styles.secondaryAction}>
            {node.kind === 'run' ? 'Isolera kedjan' : 'Isolera'}
          </button>
        )}
        <button type="button" onClick={() => onFocus(node)} className={styles.secondaryAction}>
          <Crosshair className={styles.buttonIcon} aria-hidden /> Fokusera
        </button>
        {destination && (
          <Link href={destination.href} className={styles.secondaryAction}>
            {destination.label}
          </Link>
        )}
      </div>
    </aside>
  )
}

interface Fact {
  label: string
  value: string
  mono?: boolean
}

/** Stored fields only, each under the name of what it is. Absent stays absent. */
function inspectorFacts(node: IntelligenceGraphNode): Fact[] {
  const metadata = node.metadata ?? {}
  const text = (key: string) => (typeof metadata[key] === 'string' && metadata[key] ? (metadata[key] as string) : null)
  const facts: Fact[] = []
  const push = (label: string, value: string | null, mono = false) => { if (value) facts.push({ label, value, mono }) }

  if (typeof node.community === 'number') push('Subsystem', `#${node.community}`)
  push('Källfil', node.sourceFile ?? null, true)
  push('Position', node.sourceLocation ?? null, true)
  if (typeof metadata.size === 'number') push('Noder i subsystemet', String(metadata.size))
  if (node.source === 'graphify' && typeof node.degree === 'number') push('Kopplingar i kodkartan', String(node.degree))
  push('Modell', text('model'), true)
  push('Trigger', text('trigger'))
  push('Projekt', text('projectName'))
  push('Prioritet', text('priority'))
  push('Typ', node.kind === 'output' ? text('type') : null)
  push('Skapad', formatStored(text('createdAt')))
  push('Startad', formatStored(text('startedAt')))
  push('Avslutad', formatStored(text('finishedAt')))
  push('Granskad', formatStored(text('reviewedAt')))
  if (typeof metadata.attempts === 'number') push('Försök', String(metadata.attempts))
  push(operatorLabel(node), node.kind === 'approval' ? text('operator') : null)
  return facts
}

function formatStored(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
}
