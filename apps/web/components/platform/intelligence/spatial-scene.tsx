/**
 * The spatial view's visual language (Phase 18 T2c) — vNext Live Operations only.
 *
 * Presentation, never meaning: every glyph here draws something the layout
 * placed and the snapshot holds. The hierarchy reads Atlas → project hub →
 * workflow → agent → run count by size, light and shape:
 *
 *   Atlas      the canonical Atlas orb's language (AtlasHomeVNext): glass,
 *              halo, orbits and the Omnira mark. Identity only — no status.
 *   hub        a lit ring in the project's own colour around a dark core and
 *              its monogram. A quiet project is dimmer, never greyed out.
 *   workflow   a cube in a ring, in its project's colour; an inactive workflow's
 *              ring is dashed grey, as its stored flag says.
 *   agent      a smaller ring with a single point of light.
 *   run        a ring in the colour of its stored status.
 *   run count  a count inside a ring whose segments are the stored statuses.
 *
 * Lines keep T1's truth classes by dash (direct solid, definition dashed,
 * derived dotted); colour only says which project a line belongs to. A
 * selection brightens what it touches and dims the rest — nothing disappears.
 *
 * Motion is identity (Atlas's slow breath) and transitions of selection and
 * focus; the stylesheet stands all of it down for reduced motion.
 */

import React from 'react'
import { OmniraMark } from '@/components/platform/OmniraLogo'
import { cn } from '@/lib/utils'
import type { IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { GRAPH_VISUAL_TOKENS, getStatusVisual, type GraphStatusVisual } from './graph-visuals'
import type { SpatialAtlasOrb, SpatialHub, SpatialLayout, SpatialRunCluster } from './spatial-layout'
import type { SpatialLabelPlacement } from './spatial-labels'
import { clusterDrawRadius, selectionRingOffset } from './spatial-text'
import styles from './GraphCanvas.module.css'

/** The canonical Atlas orb's colours (AtlasHomeVNext.module.css `.orbButton`, `.orbGlass`, `.orbHalo`, orbits). */
export const ATLAS_ORB_PALETTE = {
  glassRim: 'rgba(147, 237, 247, 0.58)',
  glassLight: 'rgba(231, 252, 255, 0.28)',
  glassViolet: 'rgba(76, 29, 149, 0.11)',
  glassDeep: 'rgba(10, 68, 91, 0.32)',
  glassNight: 'rgba(1, 10, 24, 0.93)',
  glassBase: 'rgba(3, 22, 40, 0.88)',
  glassInner: 'rgba(74, 222, 233, 0.2)',
  halo: 'rgba(27, 221, 223, 0.3)',
  haloOuter: 'rgba(16, 85, 165, 0.09)',
  glow: 'rgba(20, 184, 210, 0.34)',
  orbitOuter: 'rgba(87, 224, 231, 0.26)',
  orbitInner: 'rgba(96, 165, 250, 0.23)',
  orbitTilted: 'rgba(78, 231, 210, 0.2)',
  orbitPoint: '#36e4e4',
  orbitPointIndigo: '#818cf8',
} as const

/** Status colours for run-count segments, by stored status. */
export const CLUSTER_STATUS_COLORS: Readonly<Record<string, string>> = {
  done: GRAPH_VISUAL_TOKENS.status.completed,
  completed: GRAPH_VISUAL_TOKENS.status.completed,
  running: GRAPH_VISUAL_TOKENS.status.running,
  failed: GRAPH_VISUAL_TOKENS.status.failed,
  awaiting_approval: GRAPH_VISUAL_TOKENS.status.waiting,
  pending: GRAPH_VISUAL_TOKENS.status.waiting,
  cancelled: GRAPH_VISUAL_TOKENS.status.cancelled,
}

const NEUTRAL_IDENTITY = '#a5b4fc'
const INACTIVE_RING = GRAPH_VISUAL_TOKENS.status.cancelled

/** A hub's colour by project id, for everything that belongs to that project. */
export function projectColours(layout: SpatialLayout): ReadonlyMap<string, string> {
  return new Map(layout.hubs.map(hub => [hub.projectId, hub.color]))
}

export function identityColour(node: IntelligenceGraphNode, colours: ReadonlyMap<string, string>): string {
  return (node.projectId && colours.get(node.projectId)) || NEUTRAL_IDENTITY
}

// ─── Defs ────────────────────────────────────────────────────────────────────

export function SpatialSceneDefs({ hubs }: { hubs: readonly SpatialHub[] }) {
  const colours = [...new Set(hubs.map(hub => hub.color))].sort()
  return (
    <>
      <radialGradient id="ig-atlas-halo">
        <stop offset="0%" stopColor={ATLAS_ORB_PALETTE.halo} />
        <stop offset="47%" stopColor={ATLAS_ORB_PALETTE.haloOuter} />
        <stop offset="72%" stopColor="rgba(16, 85, 165, 0)" />
      </radialGradient>
      <radialGradient id="ig-atlas-glow">
        <stop offset="55%" stopColor="rgba(20, 184, 210, 0)" />
        <stop offset="74%" stopColor="rgba(20, 184, 210, 0.2)" />
        <stop offset="100%" stopColor="rgba(20, 184, 210, 0)" />
      </radialGradient>
      <radialGradient id="ig-atlas-glass" cx="50%" cy="58%" r="60%">
        <stop offset="0%" stopColor={ATLAS_ORB_PALETTE.glassDeep} />
        <stop offset="72%" stopColor={ATLAS_ORB_PALETTE.glassNight} />
        <stop offset="100%" stopColor={ATLAS_ORB_PALETTE.glassBase} />
      </radialGradient>
      <radialGradient id="ig-atlas-glass-light" cx="34%" cy="24%" r="34%">
        <stop offset="0%" stopColor={ATLAS_ORB_PALETTE.glassLight} />
        <stop offset="50%" stopColor="rgba(231, 252, 255, 0)" />
      </radialGradient>
      <radialGradient id="ig-atlas-glass-violet" cx="70%" cy="70%" r="40%">
        <stop offset="0%" stopColor={ATLAS_ORB_PALETTE.glassViolet} />
        <stop offset="100%" stopColor="rgba(76, 29, 149, 0)" />
      </radialGradient>
      <radialGradient id="ig-atlas-inner">
        <stop offset="62%" stopColor="rgba(74, 222, 233, 0)" />
        <stop offset="100%" stopColor={ATLAS_ORB_PALETTE.glassInner} />
      </radialGradient>
      {/* The canonical reflection is a blurred cap; a gradient that fades at every edge draws it without a filter. */}
      <radialGradient id="ig-atlas-reflection" cx="50%" cy="22%" r="78%">
        <stop offset="0%" stopColor="rgba(239, 253, 255, 0.2)" />
        <stop offset="48%" stopColor="rgba(239, 253, 255, 0.07)" />
        <stop offset="100%" stopColor="rgba(239, 253, 255, 0)" />
      </radialGradient>
      <radialGradient id="ig-atlas-core-light">
        <stop offset="0%" stopColor="rgba(125, 211, 252, 0.2)" />
        <stop offset="52%" stopColor="rgba(37, 99, 235, 0.04)" />
        <stop offset="100%" stopColor="rgba(37, 99, 235, 0)" />
      </radialGradient>
      {/* The canonical mark's cyan drop-shadow (`.orbMark`), sized to the mark. */}
      <filter id="ig-atlas-mark-glow" x="-60%" y="-60%" width="220%" height="220%" primitiveUnits="objectBoundingBox">
        <feGaussianBlur in="SourceAlpha" stdDeviation="0.075" result="blur" />
        <feFlood floodColor="rgb(131, 232, 255)" floodOpacity="0.82" />
        <feComposite in2="blur" operator="in" result="glow" />
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <linearGradient id="ig-atlas-axis" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="rgba(103, 232, 249, 0)" />
        <stop offset="50%" stopColor="rgba(103, 232, 249, 0.48)" />
        <stop offset="100%" stopColor="rgba(103, 232, 249, 0)" />
      </linearGradient>
      <linearGradient id="ig-atlas-axis-vertical" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="rgba(103, 232, 249, 0)" />
        <stop offset="50%" stopColor="rgba(103, 232, 249, 0.42)" />
        <stop offset="100%" stopColor="rgba(103, 232, 249, 0)" />
      </linearGradient>
      <radialGradient id="ig-node-core" cx="42%" cy="36%" r="70%">
        <stop offset="0%" stopColor="#1b2344" />
        <stop offset="100%" stopColor="#080c1d" />
      </radialGradient>
      {colours.map(colour => (
        <React.Fragment key={colour}>
          <radialGradient id={glowId(colour)}>
            <stop offset="0%" stopColor={colour} stopOpacity={0.34} />
            <stop offset="45%" stopColor={colour} stopOpacity={0.12} />
            <stop offset="100%" stopColor={colour} stopOpacity={0} />
          </radialGradient>
          <radialGradient id={coreId(colour)} cx="42%" cy="34%" r="72%">
            <stop offset="0%" stopColor={colour} stopOpacity={0.3} />
            <stop offset="55%" stopColor="#0b1026" stopOpacity={0.96} />
            <stop offset="100%" stopColor="#060918" stopOpacity={1} />
          </radialGradient>
        </React.Fragment>
      ))}
    </>
  )
}

function colourKey(colour: string): string {
  return colour.replace(/[^\da-z]/gi, '').toLowerCase()
}
export function glowId(colour: string): string { return `ig-glow-${colourKey(colour)}` }
export function coreId(colour: string): string { return `ig-core-${colourKey(colour)}` }

// ─── Fields ─────────────────────────────────────────────────────────────────

/** A soft light under each hub: separation by space and light, not by borders. */
export function HubFields({ layout, visibleIds }: { layout: SpatialLayout; visibleIds: ReadonlySet<string> }) {
  return (
    <g aria-hidden="true" pointerEvents="none">
      {layout.hubs.map(hub => {
        if (hub.orbit === 'receded' || !visibleIds.has(hub.nodeId)) return null
        const radius = hub.orbit === 'focus' ? hub.r * 6.4 : hub.r * 3.3
        return (
          <circle
            key={hub.nodeId}
            className={styles.spatialNode}
            style={{ transform: `translate(${hub.x}px, ${hub.y}px)` }}
            r={radius}
            fill={`url(#${glowId(hub.color)})`}
            opacity={hub.orbit === 'calm' ? 0.45 : hub.orbit === 'focus' ? 0.55 : 0.8}
          />
        )
      })}
    </g>
  )
}

// ─── Atlas ──────────────────────────────────────────────────────────────────

/**
 * Atlas, the identity orb, in the canonical orb's language. Not a node of the
 * snapshot: no status, no inspector, nothing operational in its light. Its
 * slow breath is identity motion and stands down with reduced motion.
 */
export function AtlasCore({
  atlas, label, description, onActivate,
}: {
  atlas: SpatialAtlasOrb
  label: string
  description: string
  onActivate?: () => void
}) {
  const r = atlas.r
  // The canonical orb sets its mark at about 0.85 of the glass's radius.
  const markSize = r * 0.86
  return (
    <g
      className={cn(styles.atlas, styles.spatialNode)}
      style={{ transform: `translate(${atlas.x}px, ${atlas.y}px)` }}
      opacity={atlas.receded ? 0.62 : 1}
      data-atlas={atlas.receded ? 'receded' : 'core'}
      role="button"
      tabIndex={0}
      aria-label={`${label}. ${description}`}
      onClick={event => { event.stopPropagation(); onActivate?.() }}
      onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        onActivate?.()
      }}
    >
      <title>{`${label} — ${description}`}</title>
      <g className={styles.atlasBreath} aria-hidden="true">
        <circle r={r * 2.1} fill="url(#ig-atlas-halo)" />
        <circle r={r * 1.38} fill="url(#ig-atlas-glow)" />
      </g>
      <g aria-hidden="true" pointerEvents="none">
        {!atlas.receded && (
          <>
            <rect x={-r * 1.7} y={-0.5} width={r * 3.4} height={1} fill="url(#ig-atlas-axis)" opacity={0.7} />
            <rect x={-0.5} y={-r * 1.58} width={1} height={r * 3.16} fill="url(#ig-atlas-axis-vertical)" opacity={0.55} />
            <ellipse rx={r * 1.38} ry={r * 0.5} fill="none" stroke={ATLAS_ORB_PALETTE.orbitTilted} strokeWidth={1} vectorEffect="non-scaling-stroke" transform="rotate(-16)" />
            <circle cx={r * 1.38 * Math.cos(-0.4)} cy={r * 0.5 * Math.sin(-0.4)} r={Math.max(1.6, r * 0.028)} fill={ATLAS_ORB_PALETTE.orbitPoint} transform="rotate(-16)" />
          </>
        )}
        <circle r={r * 1.25} fill="none" stroke={ATLAS_ORB_PALETTE.orbitOuter} strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.72} />
        <circle cx={-r * 1.25} r={Math.max(1.8, r * 0.034)} fill={ATLAS_ORB_PALETTE.orbitPoint} />
        <circle r={r * 1.1} fill="none" stroke={ATLAS_ORB_PALETTE.orbitInner} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <circle cx={r * 1.1 * Math.cos(1.1)} cy={r * 1.1 * Math.sin(1.1)} r={Math.max(1.6, r * 0.03)} fill={ATLAS_ORB_PALETTE.orbitPointIndigo} />
      </g>
      <circle r={r * 1.12} fill="none" stroke={GRAPH_VISUAL_TOKENS.status.selected} strokeWidth={1.6} vectorEffect="non-scaling-stroke" className={styles.atlasFocus} />
      <g aria-hidden="true" data-core="atlas">
        <circle r={r} fill={ATLAS_ORB_PALETTE.glassBase} />
        <circle r={r} fill="url(#ig-atlas-glass)" />
        <circle r={r} fill="url(#ig-atlas-glass-violet)" />
        <circle r={r} fill="url(#ig-atlas-inner)" />
        <circle r={r} fill="url(#ig-atlas-glass-light)" />
        <ellipse cy={-r * 0.5} rx={r * 0.64} ry={r * 0.4} fill="url(#ig-atlas-reflection)" />
        <circle r={r * 0.52} fill="url(#ig-atlas-core-light)" />
        <circle r={r} fill="none" stroke={ATLAS_ORB_PALETTE.glassRim} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        <g transform={`translate(${-markSize / 2}, ${-markSize / 2})`} filter="url(#ig-atlas-mark-glow)">
          <OmniraMark size={markSize} />
        </g>
      </g>
    </g>
  )
}

// ─── Hubs ───────────────────────────────────────────────────────────────────

/** A project hub: its colour lit around a dark core and its monogram. Names are drawn by the label plan. */
export function ProjectHubGlyph({ hub, selected, focused }: { hub: SpatialHub; selected: boolean; focused: boolean }) {
  const r = hub.r
  const receded = hub.orbit === 'receded'
  const quiet = hub.orbit === 'calm'
  const ring = receded ? 0.6 : quiet ? 0.8 : 1
  // A quiet project is dimmer, never greyed out: a colour with little of its own is lifted, not dulled.
  const ringColour = hubRingColour(hub.color)
  return (
    <g data-hub-orbit={hub.orbit} className={styles.spatialGlyph}>
      {!receded && <circle r={r * 1.55} fill={`url(#${glowId(hub.color)})`} opacity={quiet ? 0.6 : 0.95} />}
      {!receded && <circle r={r + 9} fill="none" stroke={ringColour} strokeOpacity={0.14 * ring} strokeWidth={6} vectorEffect="non-scaling-stroke" />}
      {(selected || focused) && (
        <circle
          r={r + selectionRingOffset(r)}
          fill="none"
          stroke={GRAPH_VISUAL_TOKENS.status.selected}
          strokeOpacity={selected ? 0.95 : 0.7}
          strokeWidth={selected ? 1.8 : 1.3}
          strokeDasharray={selected ? undefined : '4 3'}
          vectorEffect="non-scaling-stroke"
          className={styles.selectionRing}
        />
      )}
      <circle r={r} fill={`url(#${coreId(hub.color)})`} data-core={hub.nodeId} />
      <circle r={r} fill="none" stroke={ringColour} strokeOpacity={0.95 * ring} strokeWidth={receded ? 1.4 : 2.4} vectorEffect="non-scaling-stroke" className={styles.identity} />
      {!receded && <circle r={r - Math.max(3, r * 0.08)} fill="none" stroke={ringColour} strokeOpacity={0.3 * ring} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      <text className={styles.hubMonogram} textAnchor="middle" y={r * 0.19} fontSize={r * 0.52} fillOpacity={receded ? 0.8 : 1} style={{ fill: mixColour(hub.color, '#ffffff', 0.62) }}>
        {hub.monogram}
      </text>
    </g>
  )
}

/** `colour` moved toward `target` by `amount` (0–1); both six-digit hex. */
export function mixColour(colour: string, target: string, amount: number): string {
  const from = hexChannels(colour)
  const to = hexChannels(target)
  if (!from || !to) return colour
  return `#${from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount).toString(16).padStart(2, '0')).join('')}`
}

/** A hub's ring: its own colour, lifted toward white when that colour carries almost no hue (a grey project). */
export function hubRingColour(colour: string): string {
  const channels = hexChannels(colour)
  if (!channels) return colour
  return Math.max(...channels) - Math.min(...channels) < 48 ? mixColour(colour, '#ffffff', 0.34) : colour
}

function hexChannels(colour: string): [number, number, number] | null {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(colour)
  return match ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)] : null
}

// ─── Workflows, agents, runs, satellites ────────────────────────────────────

const CUBE_TOP = (s: number) => `0,${-s} ${s * 0.866},${-s * 0.5} 0,0 ${-s * 0.866},${-s * 0.5}`
const CUBE_LEFT = (s: number) => `${-s * 0.866},${-s * 0.5} 0,0 0,${s} ${-s * 0.866},${s * 0.5}`
const CUBE_RIGHT = (s: number) => `${s * 0.866},${-s * 0.5} ${s * 0.866},${s * 0.5} 0,${s} 0,0`

/** A workflow: a cube in a ring of its project's colour. An inactive workflow's ring is dashed grey. */
export function WorkflowGlyph({ radius, colour, inactive, selected, focused, nodeId }: {
  radius: number; colour: string; inactive: boolean; selected: boolean; focused: boolean; nodeId: string
}) {
  const ring = inactive ? INACTIVE_RING : colour
  const cube = radius * 0.6
  return (
    <g className={styles.spatialGlyph}>
      <circle r={radius * 2.2} fill={`url(#${glowId(colour)})`} opacity={inactive ? 0.3 : 0.95} />
      {!inactive && <circle r={radius + 4} fill="none" stroke={colour} strokeOpacity={0.16} strokeWidth={4} vectorEffect="non-scaling-stroke" />}
      <SelectionRing radius={radius} selected={selected} focused={focused} />
      <circle r={radius} fill="url(#ig-node-core)" data-core={nodeId} />
      <circle
        r={radius}
        fill="none"
        stroke={ring}
        strokeOpacity={inactive ? 0.8 : 1}
        strokeWidth={2}
        strokeDasharray={inactive ? '3 3' : undefined}
        vectorEffect="non-scaling-stroke"
        className={styles.identity}
      />
      <g opacity={inactive ? 0.55 : 1}>
        <polygon points={CUBE_TOP(cube)} fill={colour} fillOpacity={0.95} />
        <polygon points={CUBE_LEFT(cube)} fill={colour} fillOpacity={0.62} />
        <polygon points={CUBE_RIGHT(cube)} fill={colour} fillOpacity={0.42} />
      </g>
    </g>
  )
}

/** An agent: a smaller ring with one point of light. */
export function AgentGlyph({ radius, colour, selected, focused, nodeId }: {
  radius: number; colour: string; selected: boolean; focused: boolean; nodeId: string
}) {
  return (
    <g className={styles.spatialGlyph}>
      <SelectionRing radius={radius} selected={selected} focused={focused} />
      <circle r={radius} fill="url(#ig-node-core)" data-core={nodeId} />
      <circle r={radius} fill="none" stroke={colour} strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" className={styles.identity} />
      <circle r={radius * 0.34} fill={colour} fillOpacity={0.85} />
    </g>
  )
}

/** A run placed on its own: a ring in its stored status's colour, and a badge when it needs attention. */
export function RunGlyph({ radius, status, colour, selected, focused, nodeId }: {
  radius: number; status: GraphStatusVisual | null; colour: string; selected: boolean; focused: boolean; nodeId: string
}) {
  const stroke = status?.stroke ?? colour
  return (
    <g className={styles.spatialGlyph}>
      {status?.attention && <circle r={radius * 1.9} fill={stroke} fillOpacity={0.08} />}
      <SelectionRing radius={radius} selected={selected} focused={focused} />
      <circle r={radius} fill="url(#ig-node-core)" data-core={nodeId} />
      <circle r={radius} fill="none" stroke={stroke} strokeWidth={status?.attention ? 2 : 1.5} strokeDasharray={status?.dash} vectorEffect="non-scaling-stroke" className={styles.statusRing} />
      <circle r={radius * 0.36} fill={stroke} />
      {status?.attention && <SpatialStatusBadge radius={radius} status={status} />}
    </g>
  )
}

/** Approvals, outputs and tasks: quieter shapes beside what they belong to. */
export function SatelliteGlyph({ kind, radius, status, selected, focused, nodeId }: {
  kind: IntelligenceGraphNode['kind']; radius: number; status: GraphStatusVisual | null; selected: boolean; focused: boolean; nodeId: string
}) {
  const stroke = status?.stroke ?? '#8d9ab0'
  const common = {
    fill: 'url(#ig-node-core)',
    stroke,
    strokeWidth: status?.attention ? 1.8 : 1.2,
    strokeDasharray: status?.dash,
    vectorEffect: 'non-scaling-stroke' as const,
    className: styles.identity,
    'data-core': nodeId,
  }
  return (
    <g className={styles.spatialGlyph}>
      <SelectionRing radius={radius} selected={selected} focused={focused} />
      {kind === 'approval'
        ? <polygon points={`0,${-radius} ${radius},0 0,${radius} ${-radius},0`} {...common} />
        : kind === 'output'
          ? <rect x={-radius} y={-radius * 0.72} width={radius * 2} height={radius * 1.44} rx={radius * 0.32} {...common} />
          : <path d={`M0 ${-radius} L${radius * 0.82} ${-radius * 0.48} L${radius * 0.7} ${radius * 0.5} L0 ${radius} L${-radius * 0.7} ${radius * 0.5} L${-radius * 0.82} ${-radius * 0.48} Z`} {...common} />}
      {status?.attention && <SpatialStatusBadge radius={radius} status={status} />}
    </g>
  )
}

function SelectionRing({ radius, selected, focused }: { radius: number; selected: boolean; focused: boolean }) {
  if (!selected && !focused) return null
  return (
    <circle
      r={radius + selectionRingOffset(radius)}
      fill="none"
      stroke={GRAPH_VISUAL_TOKENS.status.selected}
      strokeOpacity={selected ? 0.95 : 0.7}
      strokeWidth={selected ? 1.7 : 1.2}
      strokeDasharray={selected ? undefined : '3 3'}
      vectorEffect="non-scaling-stroke"
      className={styles.selectionRing}
    />
  )
}

function SpatialStatusBadge({ radius, status }: { radius: number; status: GraphStatusVisual }) {
  const badge = Math.max(4.4, radius * 0.46)
  return (
    <g transform={`translate(${radius * 0.8},${-radius * 0.8})`} aria-hidden="true">
      <circle r={badge} fill="#070a18" stroke={status.stroke} strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
      <text y={badge * 0.42} textAnchor="middle" fontSize={badge * 1.25} fontWeight={700} fill={status.stroke}>{status.badge}</text>
    </g>
  )
}

// ─── Run counts ─────────────────────────────────────────────────────────────

/** Arc segments for a run count's stored-status distribution, most frequent first, clockwise from the top. */
export function clusterSegments(cluster: SpatialRunCluster): Array<{ status: string; colour: string; start: number; end: number }> {
  const total = Math.max(1, cluster.count)
  let at = 0
  return cluster.distribution.map(entry => {
    const start = at
    at += entry.count / total
    return { status: entry.status, colour: CLUSTER_STATUS_COLORS[entry.status] ?? GRAPH_VISUAL_TOKENS.status.cancelled, start, end: at }
  })
}

/** A run count: the number, a ring of its stored statuses, and a mark when some need attention. */
export function RunClusterGlyph({ cluster, colour, count, dimmed, attentionColour, scale }: {
  cluster: SpatialRunCluster; colour: string; count: string; dimmed: boolean; attentionColour: string | null; scale: number
}) {
  const r = clusterDrawRadius(cluster.r, scale)
  const segments = clusterSegments(cluster)
  const gap = segments.length > 1 ? 0.018 : 0
  const countSize = r * (count.length >= 3 ? 0.66 : count.length === 2 ? 0.78 : 0.9)
  return (
    <g opacity={dimmed ? 0.3 : 1} className={styles.spatialGlyph}>
      <circle r={r + 3.5 * scale} fill="#060918" fillOpacity={0.9} />
      <circle r={r} fill="url(#ig-node-core)" data-core={cluster.id} />
      <circle r={r + 2.5 * scale} fill="none" stroke={colour} strokeOpacity={0.28} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {segments.map(segment => (
        <path
          key={segment.status}
          d={arcPath(r, segment.start + gap, Math.max(segment.start + gap, segment.end - gap))}
          fill="none"
          stroke={segment.colour}
          strokeOpacity={0.9}
          strokeWidth={2.4}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <text className={styles.clusterCount} textAnchor="middle" y={countSize * 0.36} fontSize={countSize}>{count}</text>
      {attentionColour && (
        <circle cx={r * 0.74} cy={-r * 0.74} r={Math.max(2.2, r * 0.17)} fill={attentionColour} stroke="#060918" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
    </g>
  )
}

function arcPath(radius: number, from: number, to: number): string {
  if (to - from >= 0.999) {
    return `M0 ${-radius} A${radius} ${radius} 0 1 1 0 ${radius} A${radius} ${radius} 0 1 1 0 ${-radius}`
  }
  const angle = (fraction: number) => fraction * Math.PI * 2 - Math.PI / 2
  const x1 = Math.cos(angle(from)) * radius
  const y1 = Math.sin(angle(from)) * radius
  const x2 = Math.cos(angle(to)) * radius
  const y2 = Math.sin(angle(to)) * radius
  return `M${round(x1)} ${round(y1)} A${radius} ${radius} 0 ${to - from > 0.5 ? 1 : 0} 1 ${round(x2)} ${round(y2)}`
}

// ─── Lines ──────────────────────────────────────────────────────────────────

/**
 * A relation as a gentle curve between two circles' edges, bowed away from the
 * level's centre so lines around a hub read as its structure. Straight when
 * the ends are too close to bend.
 */
export function spatialEdgePath(
  source: { x: number; y: number; r: number },
  target: { x: number; y: number; r: number },
  centre: { x: number; y: number },
  bend: number,
): string | null {
  const curve = spatialCurve(source, target, centre, bend)
  return curve && curvePath(curve)
}

interface SpatialCurve { x1: number; y1: number; cx: number; cy: number; x2: number; y2: number }

/**
 * The same curve, bent further — or the other way — when its first bend would
 * cross a circle that is not one of its ends: a line through a node it does not
 * touch would read as a relation the snapshot does not hold. The first bend that
 * keeps clear wins; when none does, the first bend is drawn.
 */
export function clearSpatialEdgePath(
  source: { x: number; y: number; r: number },
  target: { x: number; y: number; r: number },
  centre: { x: number; y: number },
  bend: number,
  obstacles: ReadonlyArray<{ x: number; y: number; r: number }>,
): string | null {
  const first = spatialCurve(source, target, centre, bend)
  if (!first || obstacles.length === 0) return first && curvePath(first)
  for (const factor of CLEAR_BEND_FACTORS) {
    const curve = factor === 1 ? first : spatialCurve(source, target, centre, bend * factor)
    if (curve && !obstacles.some(circle => curveMeetsCircle(curve, circle))) return curvePath(curve)
  }
  return curvePath(first)
}

/** Bends tried in order, as multiples of a relation's own bend: its own, further out, then the other side. */
export const CLEAR_BEND_FACTORS = [1, 2.4, -1, 4, -2.4, 6, -4] as const

function spatialCurve(
  source: { x: number; y: number; r: number },
  target: { x: number; y: number; r: number },
  centre: { x: number; y: number },
  bend: number,
): SpatialCurve | null {
  const dx = target.x - source.x
  const dy = target.y - source.y
  const length = Math.hypot(dx, dy)
  if (length <= source.r + target.r + 2) return null
  let nx = -dy / length
  let ny = dx / length
  const midX = (source.x + target.x) / 2
  const midY = (source.y + target.y) / 2
  if ((midX - centre.x) * nx + (midY - centre.y) * ny < -1e-6) { nx = -nx; ny = -ny }
  const controlX = midX + nx * length * bend
  const controlY = midY + ny * length * bend
  const start = unit(controlX - source.x, controlY - source.y)
  const end = unit(target.x - controlX, target.y - controlY)
  return {
    x1: source.x + start.x * (source.r + 3),
    y1: source.y + start.y * (source.r + 3),
    cx: controlX,
    cy: controlY,
    x2: target.x - end.x * (target.r + 4),
    y2: target.y - end.y * (target.r + 4),
  }
}

function curvePath(curve: SpatialCurve): string {
  return `M${round(curve.x1)} ${round(curve.y1)} Q${round(curve.cx)} ${round(curve.cy)} ${round(curve.x2)} ${round(curve.y2)}`
}

/** Whether the curve passes inside the circle, measured along 32 chords of it. */
function curveMeetsCircle(curve: SpatialCurve, circle: { x: number; y: number; r: number }): boolean {
  let previous = { x: curve.x1, y: curve.y1 }
  for (let step = 1; step <= 32; step++) {
    const t = step / 32
    const u = 1 - t
    const point = {
      x: u * u * curve.x1 + 2 * u * t * curve.cx + t * t * curve.x2,
      y: u * u * curve.y1 + 2 * u * t * curve.cy + t * t * curve.y2,
    }
    if (segmentDistance(circle, previous, point) < circle.r) return true
    previous = point
  }
  return false
}

function segmentDistance(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

function unit(x: number, y: number) {
  const length = Math.hypot(x, y) || 1
  return { x: x / length, y: y / length }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

// ─── Labels ─────────────────────────────────────────────────────────────────

/** Every text the label plan placed, above the scene. Owners outside a selection dim with it. */
export function SpatialLabelLayer({ placements, dimmedOwners, attributesFor }: {
  placements: readonly SpatialLabelPlacement[]
  dimmedOwners: (ownerId: string) => boolean
  /** Extra data attributes for a text, e.g. a band caption's count. */
  attributesFor?: (label: SpatialLabelPlacement) => Record<string, string | number> | undefined
}) {
  return (
    <g aria-hidden="true" pointerEvents="none" data-spatial-labels={placements.length}>
      {placements.map(label => (
        <g key={label.key} opacity={dimmedOwners(label.ownerId) ? 0.34 : 1} className={styles.spatialLabelGroup} data-label-key={label.key} data-plan-width={Math.round(label.widthPx * 10) / 10}>
          {label.leader && (
            <line
              className={styles.leaderLine}
              x1={label.leader.x1}
              y1={label.leader.y1}
              x2={label.leader.x2}
              y2={label.leader.y2}
              vectorEffect="non-scaling-stroke"
            />
          )}
          <text
            x={label.x}
            y={label.y}
            textAnchor={label.anchor}
            fontSize={label.fontSize}
            fontWeight={label.weight}
            className={cn(styles.spatialLabel, label.tone === 'strong' ? styles.labelStrong : label.tone === 'muted' ? styles.labelMuted : styles.labelNormal)}
            data-label-kind={label.kind}
            {...attributesFor?.(label)}
          >
            {label.lines.map((line, index) => (
              <tspan key={`${index}:${line}`} x={label.x} dy={index === 0 ? 0 : label.lineHeight}>{line}</tspan>
            ))}
            {label.status && (
              <tspan x={label.x} dy={label.lineHeight} fontSize={label.status.fontSize} fontWeight={600} fill={label.status.color}>
                {label.status.text}
              </tspan>
            )}
          </text>
        </g>
      ))}
    </g>
  )
}

// ─── A node's glyph outside the canvas (the inspector) ──────────────────────

/** The glyph the canvas draws for a node, at a fixed small size — so the inspector and the canvas show one identity. */
export function NodeIdentityGlyph({ node, colour, monogram, size = 28 }: {
  node: IntelligenceGraphNode; colour: string; monogram?: string; size?: number
}) {
  const r = 11
  const status = node.kind === 'run' || node.kind === 'approval' ? getStatusVisual(node) : null
  return (
    <svg width={size} height={size} viewBox="-14 -14 28 28" aria-hidden="true" focusable="false" data-identity-kind={node.kind}>
      {node.kind === 'project' ? (
        <g>
          <circle r={r} fill="#0b1026" stroke={hubRingColour(colour)} strokeWidth={2} />
          <text textAnchor="middle" y={3.2} fontSize={8.5} fontWeight={700} fill={mixColour(colour, '#ffffff', 0.62)}>{monogram ?? ''}</text>
        </g>
      ) : node.kind === 'workflow' ? (
        <g>
          <circle r={r} fill="#0b1026" stroke={node.status === 'inactive' ? INACTIVE_RING : colour} strokeWidth={1.6} strokeDasharray={node.status === 'inactive' ? '3 2' : undefined} />
          <polygon points={CUBE_TOP(5.4)} fill={colour} fillOpacity={0.95} />
          <polygon points={CUBE_LEFT(5.4)} fill={colour} fillOpacity={0.62} />
          <polygon points={CUBE_RIGHT(5.4)} fill={colour} fillOpacity={0.42} />
        </g>
      ) : node.kind === 'agent' ? (
        <g>
          <circle r={r * 0.82} fill="#0b1026" stroke={colour} strokeWidth={1.4} strokeOpacity={0.8} />
          <circle r={3.6} fill={colour} />
        </g>
      ) : (
        <g>
          <circle r={r * 0.8} fill="#0b1026" stroke={status?.stroke ?? colour} strokeWidth={1.6} strokeDasharray={status?.dash} />
          <circle r={3} fill={status?.stroke ?? colour} />
        </g>
      )}
    </svg>
  )
}
