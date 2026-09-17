'use client'

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { nodeColor } from '@/components/platform/intelligence/GraphCanvas'
import { buildGraphListModel, type GraphListProject } from '@/components/platform/intelligence/graph-list-model'
import { kindLabel, nodeStatus } from '@/lib/os/intelligence-graph-shared'
import styles from './IntelligenceGraphVNext.module.css'

export interface IntelligenceGraphListHandle {
  focusNode: (nodeId: string, options?: { scroll?: boolean }) => void
}

export interface IntelligenceGraphListProps {
  nodes: IntelligenceGraphNode[]
  edges: IntelligenceGraphEdge[]
  projects: GraphListProject[]
  selectedId: string | null
  activeNodeId: string | null
  dimmedIds: ReadonlySet<string>
  dimmedEdgeIds: ReadonlySet<string>
  searchHitIds: ReadonlySet<string>
  scopeNodeIds: ReadonlySet<string> | null
  filtersActive: boolean
  matchCount: number
  query: string
  onSelect: (node: IntelligenceGraphNode) => void
  onFocusNode: (node: IntelligenceGraphNode) => void
}

export const IntelligenceGraphList = forwardRef<IntelligenceGraphListHandle, IntelligenceGraphListProps>(function IntelligenceGraphList({
  nodes,
  edges,
  projects,
  selectedId,
  activeNodeId,
  dimmedIds,
  dimmedEdgeIds,
  searchHitIds,
  scopeNodeIds,
  filtersActive,
  matchCount,
  query,
  onSelect,
  onFocusNode,
}, ref) {
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const model = useMemo(() => buildGraphListModel({
    nodes, edges, projects, dimmedIds, dimmedEdgeIds, searchHitIds, scopeNodeIds,
  }), [nodes, edges, projects, dimmedIds, dimmedEdgeIds, searchHitIds, scopeNodeIds])

  useImperativeHandle(ref, () => ({
    focusNode(nodeId, options) {
      const row = rowRefs.current.get(nodeId)
      if (!row) return
      row.focus({ preventScroll: options?.scroll === false })
      if (options?.scroll !== false) row.scrollIntoView({ block: 'nearest' })
    },
  }), [])

  return (
    <section className={styles.listView} aria-label="Graf som lista" data-testid="graph-list-view">
      <div className={styles.listContext}>
        <div>
          <p className={styles.listContextTitle}>{nodes.length} objekt i samma ögonblicksbild</p>
          <p className={styles.listContextNote}>Projektvis ordnade efter typ. Status och kopplingar är snapshotets lagrade värden.</p>
        </div>
        <div className={styles.listContextFacts} aria-live="polite">
          {filtersActive && <span>{matchCount} matchar filter · övriga tonas ned</span>}
          {query.trim().length >= 2 && <span>{searchHitIds.size} {searchHitIds.size === 1 ? 'sökträff' : 'sökträffar'} i aktuell scope</span>}
          {scopeNodeIds && <span>{scopeNodeIds.size} objekt i fördjupad scope · övriga visas nedtonade</span>}
        </div>
      </div>

      <div className={styles.listScroll} data-testid="graph-list-scroll">
        {model.groups.map(group => (
          <section key={group.id} className={styles.listGroup} aria-labelledby={`graph-list-${group.id}`}>
            <header className={styles.listGroupHeader}>
              <h2 id={`graph-list-${group.id}`}>{group.label}</h2>
              <span>{group.rows.length} objekt</span>
            </header>
            <ul className={styles.nodeList}>
              {group.rows.map(row => {
                const status = nodeStatus(row.node)
                const activeRelations = row.relations.filter(relation => !relation.dimmed).length
                const dimmed = row.dimmed || row.outsideScope
                return (
                  <li key={row.node.id} className={styles.nodeListItem}>
                    <button
                      ref={element => {
                        if (element) rowRefs.current.set(row.node.id, element)
                        else rowRefs.current.delete(row.node.id)
                      }}
                      type="button"
                      className={styles.nodeRow}
                      data-node-id={row.node.id}
                      data-selected={row.node.id === selectedId ? 'true' : undefined}
                      data-active={row.node.id === activeNodeId ? 'true' : undefined}
                      data-dimmed={dimmed ? 'true' : undefined}
                      aria-pressed={row.node.id === selectedId}
                      aria-label={`${kindLabel(row.node.kind)}: ${row.node.label}${status ? `, ${status.label}` : ''}, ${row.relations.length} ${row.relations.length === 1 ? 'koppling' : 'kopplingar'}`}
                      onFocus={() => onFocusNode(row.node)}
                      onClick={() => onSelect(row.node)}
                    >
                      <span className={styles.nodeRowGlyph} style={{ backgroundColor: nodeColor(row.node) }} aria-hidden />
                      <span className={styles.nodeRowIdentity}>
                        <span className={styles.nodeRowTitle}>{row.node.label}</span>
                        <span className={styles.nodeRowKind}>{kindLabel(row.node.kind)}</span>
                      </span>
                      {row.searchHit && <span className={styles.nodeRowMatch}>Sökträff</span>}
                      {status && (
                        <span className={styles.nodeRowStatus} data-tone={status.tone}>
                          <span aria-hidden />
                          {status.label}{status.unknown ? ` (${status.raw})` : ''}
                        </span>
                      )}
                      <span className={styles.nodeRowRelations}>
                        {dimmedEdgeIds.size > 0 && activeRelations !== row.relations.length
                          ? `${activeRelations} av ${row.relations.length}`
                          : row.relations.length}{' '}
                        {row.relations.length === 1 ? 'koppling' : 'kopplingar'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </section>
  )
})
