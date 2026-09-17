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
 * Layout (Phase 18 T2a): the actions sit directly under the name, where the
 * shell's floating chrome cannot reach them, and the facts, the connections and
 * the source each get a tab instead of one long column. Inactive panels stay in
 * the document, `hidden`, so a tab switch never re-reads anything.
 *
 * Everything renders as text. Nothing here fetches.
 */

import { forwardRef, useId, useState, type CSSProperties, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, Crosshair, PanelRightClose, X } from 'lucide-react'
import { NodeIdentityGlyph } from '@/components/platform/intelligence/spatial-scene'
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

export const INSPECTOR_TABS = ['overview', 'relations', 'source'] as const
export type InspectorTab = (typeof INSPECTOR_TABS)[number]

const TAB_LABELS: Record<InspectorTab, string> = {
  overview: 'Översikt',
  relations: 'Kopplingar',
  source: 'Källa',
}

export interface IntelligenceGraphInspectorProps {
  node: IntelligenceGraphNode
  edges: IntelligenceGraphEdge[]
  neighbors: IntelligenceGraphNode[]
  /** The payload's meta — only when it belongs to the mode on screen. */
  meta: IntelligenceGraphMeta | undefined
  mode: 'system' | 'operations'
  onClose: () => void
  /** Puts the panel away and keeps the selection (book ¶595–596). */
  onHide: () => void
  onSelectNeighbor: (node: IntelligenceGraphNode) => void
  onDrillIn: (node: IntelligenceGraphNode) => void
  onIsolate: (node: IntelligenceGraphNode) => void
  onFocus: (node: IntelligenceGraphNode) => void
  /**
   * Live Operations: the colour the canvas draws this node in (its project's) and a hub's
   * monogram, so the panel shows the same identity as the selection on the canvas.
   */
  identity?: { accent: string; monogram?: string }
  /** Phone list detail: returns to the still-mounted list and restores its focused row. */
  listBack?: { label: string; onBack: () => void }
}

export const IntelligenceGraphInspector = forwardRef<HTMLElement, IntelligenceGraphInspectorProps>(function IntelligenceGraphInspector({
  node, edges, neighbors, meta, mode, onClose, onHide, onSelectNeighbor, onDrillIn, onIsolate, onFocus, identity, listBack,
}, ref) {
  // Kept across selections: following a connection stays on Kopplingar.
  const [tab, setTab] = useState<InspectorTab>('overview')
  const baseId = useId()
  const color = nodeColor(node)
  const status = nodeStatus(node)
  const provenance = nodeProvenance(node, meta)
  const destination = runtimeDestination(node)
  const scopeable = SCOPEABLE_KINDS.has(node.kind)
  const neighborById = new Map(neighbors.map(neighbor => [neighbor.id, neighbor]))
  const fetched = mode === 'operations' && meta ? snapshotStamp('operations', meta) : null
  const facts = inspectorFacts(node, edges, neighbors)
  const storedError = typeof node.metadata?.error === 'string' && node.metadata.error ? node.metadata.error : null
  const tabId = (value: InspectorTab) => `${baseId}-tab-${value}`
  const panelId = (value: InspectorTab) => `${baseId}-panel-${value}`

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = INSPECTOR_TABS.indexOf(tab)
    let next: InspectorTab | null = null
    if (event.key === 'ArrowRight') next = INSPECTOR_TABS[(index + 1) % INSPECTOR_TABS.length]
    else if (event.key === 'ArrowLeft') next = INSPECTOR_TABS[(index - 1 + INSPECTOR_TABS.length) % INSPECTOR_TABS.length]
    else if (event.key === 'Home') next = INSPECTOR_TABS[0]
    else if (event.key === 'End') next = INSPECTOR_TABS[INSPECTOR_TABS.length - 1]
    if (!next) return
    event.preventDefault()
    setTab(next)
    document.getElementById(tabId(next))?.focus()
  }

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      className={styles.inspector}
      aria-label={`${kindLabel(node.kind)}: ${node.label}`}
      data-testid="graph-inspector"
      data-identity={identity ? 'spatial' : undefined}
      style={identity ? ({ '--ig-inspector-accent': identity.accent } as CSSProperties) : undefined}
    >
      <div className={styles.inspectorHeader}>
        {listBack && (
          <button
            type="button"
            onClick={listBack.onBack}
            className={styles.mobileDetailBack}
            aria-label={listBack.label}
          >
            <ArrowLeft className={styles.buttonIcon} aria-hidden />
            Lista
          </button>
        )}
        {identity ? (
          <span className={styles.inspectorIdentity}>
            <NodeIdentityGlyph node={node} colour={identity.accent} monogram={identity.monogram} />
          </span>
        ) : (
          <span className={styles.inspectorGlyph} style={{ backgroundColor: color }} aria-hidden />
        )}
        <div className={styles.inspectorHeading}>
          <p className={styles.inspectorTitle} title={node.label}>{node.label}</p>
          <p className={styles.inspectorKind}>{kindLabel(node.kind)}</p>
        </div>
        {!listBack && (
          <>
            <button
              type="button"
              onClick={onHide}
              className={styles.inspectorClose}
              aria-label="Dölj inspektören"
              title="Dölj panelen — valet ligger kvar"
              data-testid="graph-hide-inspector"
            >
              <PanelRightClose className={styles.buttonIcon} aria-hidden />
            </button>
            <button type="button" onClick={onClose} className={styles.inspectorClose} aria-label="Stäng inspektören" title="Stäng och avmarkera">
              <X className={styles.buttonIcon} aria-hidden />
            </button>
          </>
        )}
      </div>

      <div className={styles.inspectorActions} data-testid="inspector-actions">
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

      <div className={styles.tabs} role="tablist" aria-label="Inspektörens innehåll">
        {INSPECTOR_TABS.map(value => (
          <button
            key={value}
            type="button"
            role="tab"
            id={tabId(value)}
            aria-selected={tab === value}
            aria-controls={panelId(value)}
            tabIndex={tab === value ? 0 : -1}
            className={styles.tab}
            onClick={() => setTab(value)}
            onKeyDown={onTabKeyDown}
          >
            {TAB_LABELS[value]}
            {value === 'relations' && <span className={styles.tabCount}>{edges.length}</span>}
          </button>
        ))}
      </div>

      <div className={styles.inspectorBody}>
        <div
          role="tabpanel"
          id={panelId('overview')}
          aria-labelledby={tabId('overview')}
          hidden={tab !== 'overview'}
          tabIndex={0}
          className={styles.tabPanel}
          data-testid="inspector-panel-overview"
        >
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

          {storedError && (
            <div className={styles.inspectorError}>
              <span className={styles.inspectorSection}>Lagrat fel</span>
              <p>{storedError}</p>
            </div>
          )}

          {!status && facts.length === 0 && !storedError && (
            <p className={styles.inspectorEmpty}>
              {mode === 'operations'
                ? 'Ögonblicksbilden har inga fler fält för det här objektet.'
                : 'Kodkartan har inga fler fält för det här objektet.'}
            </p>
          )}
        </div>

        <div
          role="tabpanel"
          id={panelId('relations')}
          aria-labelledby={tabId('relations')}
          hidden={tab !== 'relations'}
          tabIndex={0}
          className={styles.tabPanel}
          data-testid="inspector-panel-relations"
        >
          {edges.length > 0 ? (
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
          ) : (
            <p className={styles.inspectorEmpty}>Inga kopplingar i vyn.</p>
          )}
        </div>

        <div
          role="tabpanel"
          id={panelId('source')}
          aria-labelledby={tabId('source')}
          hidden={tab !== 'source'}
          tabIndex={0}
          className={styles.tabPanel}
          data-testid="inspector-panel-source"
        >
          <div className={styles.provenance} data-testid="inspector-provenance">
            <span className={styles.inspectorSection}>Källa</span>
            <p>{provenance.source}{provenance.detail ? <span className={styles.provenanceDetail}> · {provenance.detail}</span> : null}</p>
            {fetched && <p className={styles.provenanceDetail} title={fetched.detail ?? undefined}>{fetched.label}</p>}
          </div>
        </div>
      </div>
    </aside>
  )
})

interface Fact {
  label: string
  value: string
  mono?: boolean
}

/**
 * Stored fields only, each under the name of what it is. Absent stays absent.
 * The one count here — a workflow's runs in this snapshot — uses the canvas
 * cluster's rule (`STARTED` to a run of the same project), so both say the same number.
 */
function inspectorFacts(node: IntelligenceGraphNode, edges: readonly IntelligenceGraphEdge[], neighbors: readonly IntelligenceGraphNode[]): Fact[] {
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
  if (node.kind === 'workflow') {
    const runs = new Map(neighbors.filter(neighbor => neighbor.kind === 'run' && neighbor.projectId === node.projectId).map(run => [run.id, run]))
    const started = new Set(edges.filter(edge => edge.relation === 'STARTED' && edge.source === node.id && runs.has(edge.target)).map(edge => edge.target))
    push('Körningar i ögonblicksbilden', started.size > 0 ? String(started.size) : null)
  }
  push(operatorLabel(node), node.kind === 'approval' ? text('operator') : null)
  return facts
}

function formatStored(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
}
