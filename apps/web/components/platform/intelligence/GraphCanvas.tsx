'use client'

/**
 * GraphCanvas — SVG force-graph renderer for the Intelligence Graph.
 *
 * Pure presentation: layout is computed once per graph (deterministic),
 * zoom/pan is a viewBox transform, selection/hover lift into the parent.
 * All labels/paths are rendered as SVG text (never HTML injection).
 * Animations are limited to selected/active nodes — idle graphs are static
 * (no per-frame JS, no meaningless motion).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { computeLayout, type PositionedNode } from './force-layout'

// ─── Palette (Omnira OS accents) ─────────────────────────────────────────────

const KIND_COLOR: Record<string, string> = {
  community: '#818cf8',
  code: '#a5b4fc',
  document: '#67e8f9',
  rationale: '#d4a574',
  project: '#f0abfc',
  agent: '#a78bfa',
  workflow: '#818cf8',
  run: '#60a5fa',
  approval: '#d4a574',
  output: '#34d399',
  task: '#94a3b8',
}

const STATUS_COLOR: Record<string, string> = {
  running: '#818cf8',
  pending: '#94a3b8',
  awaiting_approval: '#d4a574',
  done: '#34d399',
  completed: '#34d399',
  failed: '#f87171',
  cancelled: '#94a3b8',
  rejected: '#f87171',
  active: '#34d399',
  inactive: '#64748b',
}

export function nodeColor(node: IntelligenceGraphNode): string {
  if (node.status && STATUS_COLOR[node.status]) return STATUS_COLOR[node.status]
  return KIND_COLOR[node.kind] ?? '#a5b4fc'
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface GraphCanvasProps {
  nodes: IntelligenceGraphNode[]
  edges: IntelligenceGraphEdge[]
  selectedId: string | null
  onSelect: (node: IntelligenceGraphNode | null) => void
  onOpen?: (node: IntelligenceGraphNode) => void
  /** Bump to trigger fit-to-graph (e.g. from a toolbar button). */
  fitSignal?: number
  className?: string
}

const WORLD_W = 1200
const WORLD_H = 800

interface ViewBox { x: number; y: number; w: number; h: number }

export function GraphCanvas({
  nodes, edges, selectedId, onSelect, onOpen, fitSignal = 0, className,
}: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [view, setView] = useState<ViewBox>({ x: 0, y: 0, w: WORLD_W, h: WORLD_H })
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; view: ViewBox } | null>(null)
  const movedRef = useRef(false)

  const layout = useMemo(() => {
    const positioned = computeLayout(
      nodes.map(n => ({
        id: n.id,
        weight: n.degree ?? 1,
        group: n.community ?? (n.projectId ? hashGroup(n.projectId) : undefined),
      })),
      edges.map(e => ({ source: e.source, target: e.target })),
      { width: WORLD_W, height: WORLD_H },
    )
    const byId = new Map<string, PositionedNode>()
    for (const p of positioned) byId.set(p.id, p)
    return byId
  }, [nodes, edges])

  const nodeById = useMemo(() => {
    const m = new Map<string, IntelligenceGraphNode>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])

  // Neighbors of the selected node → path highlighting
  const highlighted = useMemo(() => {
    const focus = selectedId ?? hoverId ?? focusId
    if (!focus) return null
    const ids = new Set<string>([focus])
    const edgeIds = new Set<string>()
    for (const e of edges) {
      if (e.source === focus || e.target === focus) {
        ids.add(e.source); ids.add(e.target); edgeIds.add(e.id)
      }
    }
    return { ids, edgeIds }
  }, [selectedId, hoverId, focusId, edges])

  // ── Fit to graph ──
  const fit = useCallback(() => {
    if (layout.size === 0) { setView({ x: 0, y: 0, w: WORLD_W, h: WORLD_H }); return }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of layout.values()) {
      minX = Math.min(minX, p.x - p.r); maxX = Math.max(maxX, p.x + p.r)
      minY = Math.min(minY, p.y - p.r); maxY = Math.max(maxY, p.y + p.r)
    }
    const pad = 60
    setView({ x: minX - pad, y: minY - pad, w: Math.max(200, maxX - minX + pad * 2), h: Math.max(150, maxY - minY + pad * 2) })
  }, [layout])

  useEffect(() => { fit() }, [fit, fitSignal])

  // ── Zoom (wheel) ──
  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12
    setView(v => {
      const w = Math.min(WORLD_W * 3, Math.max(80, v.w * factor))
      const h = Math.min(WORLD_H * 3, Math.max(53, v.h * factor))
      return { x: v.x + (v.w - w) * px, y: v.y + (v.h - h) * py, w, h }
    })
  }, [])

  // ── Pan (drag background) ──
  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, view }
    movedRef.current = false
  }, [view])

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    const svg = svgRef.current
    if (!drag || !svg) return
    const rect = svg.getBoundingClientRect()
    const dx = ((e.clientX - drag.startX) / rect.width) * drag.view.w
    const dy = ((e.clientY - drag.startY) / rect.height) * drag.view.h
    if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 4) movedRef.current = true
    setView({ ...drag.view, x: drag.view.x - dx, y: drag.view.y - dy })
  }, [])

  const onPointerUp = useCallback(() => { dragRef.current = null }, [])

  const backgroundClick = useCallback(() => {
    if (!movedRef.current) onSelect(null)
  }, [onSelect])

  const dim = highlighted !== null

  return (
    <svg
      ref={svgRef}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      className={cn('h-full w-full touch-none select-none cursor-grab active:cursor-grabbing', className)}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onClick={backgroundClick}
      role="img"
      aria-label="Intelligence graph"
    >
      <defs>
        <radialGradient id="ig-node-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="white" stopOpacity="0.35" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Edges */}
      <g>
        {edges.map(e => {
          const a = layout.get(e.source)
          const b = layout.get(e.target)
          if (!a || !b) return null
          const isHot = highlighted?.edgeIds.has(e.id) ?? false
          const bundled = typeof e.metadata?.bundledEdges === 'number' ? (e.metadata.bundledEdges as number) : 1
          const width = Math.min(4, 0.6 + Math.log2(1 + bundled) * 0.5)
          return (
            <line
              key={e.id}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={isHot ? '#a5b4fc' : '#475569'}
              strokeOpacity={isHot ? 0.9 : dim ? 0.12 : 0.3}
              strokeWidth={isHot ? width + 0.8 : width}
              strokeDasharray={e.confidence === 'INFERRED' ? '4 3' : undefined}
            />
          )
        })}
      </g>

      {/* Nodes */}
      <g>
        {nodes.map(n => {
          const p = layout.get(n.id)
          if (!p) return null
          const color = nodeColor(n)
          const isSelected = n.id === selectedId
          const isHot = highlighted?.ids.has(n.id) ?? !dim
          const isRunning = n.status === 'running'
          const isFocused = n.id === focusId
          const showLabel = isSelected || n.id === hoverId || isFocused || view.w < 700 || n.kind === 'community' || n.kind === 'project'
          return (
            <g
              key={n.id}
              transform={`translate(${p.x},${p.y})`}
              opacity={isHot ? 1 : 0.25}
              className="cursor-pointer focus:outline-none"
              // M2 — keyboard access: focusable, button semantics, Enter/Space selects.
              tabIndex={0}
              role="button"
              aria-label={`${n.kind}: ${n.label}${n.status ? ` (${n.status})` : ''}`}
              aria-pressed={isSelected}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  onSelect(n)
                }
              }}
              onFocus={() => setFocusId(n.id)}
              onBlur={() => setFocusId(f => (f === n.id ? null : f))}
              onClick={(e) => { e.stopPropagation(); if (!movedRef.current) onSelect(n) }}
              onDoubleClick={(e) => { e.stopPropagation(); onOpen?.(n) }}
              onPointerEnter={() => setHoverId(n.id)}
              onPointerLeave={() => setHoverId(h => (h === n.id ? null : h))}
            >
              {isFocused && (
                <circle
                  r={p.r + 10}
                  fill="none"
                  stroke="#f8fafc"
                  strokeOpacity={0.8}
                  strokeWidth={1.4}
                  strokeDasharray="3 3"
                />
              )}
              {(isSelected || isRunning) && (
                <circle r={p.r + 7} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={1.4}>
                  {isRunning && (
                    <animate attributeName="r" values={`${p.r + 4};${p.r + 9};${p.r + 4}`} dur="2.4s" repeatCount="indefinite" />
                  )}
                </circle>
              )}
              <circle r={p.r + 3} fill={color} opacity={0.14} />
              <circle
                r={p.r}
                fill={color}
                fillOpacity={0.85}
                stroke={isSelected ? '#f8fafc' : 'rgba(15,23,42,0.9)'}
                strokeWidth={isSelected ? 1.6 : 1}
              />
              {n.status === 'failed' && (
                <circle r={Math.max(2.4, p.r * 0.3)} cx={p.r * 0.75} cy={-p.r * 0.75} fill="#f87171" stroke="rgba(15,23,42,0.9)" strokeWidth={0.8} />
              )}
              {showLabel && (
                <text
                  y={p.r + 12}
                  textAnchor="middle"
                  fontSize={n.kind === 'community' ? 12 : 10}
                  fill={isSelected ? '#f8fafc' : '#94a3b8'}
                  style={{ pointerEvents: 'none' }}
                >
                  {truncate(n.label, n.kind === 'community' ? 42 : 28)}
                </text>
              )}
            </g>
          )
        })}
      </g>
    </svg>
  )
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

function hashGroup(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h) % 1000
}
