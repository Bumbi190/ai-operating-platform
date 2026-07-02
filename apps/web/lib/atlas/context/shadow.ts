/**
 * lib/atlas/context/shadow.ts — Stage-0 shadow harness (CL Commit 5, patched Commit 5.1)
 *
 * INSTRUMENTATION, NOT BEHAVIOR. The route keeps serving the legacy context
 * exactly as before; this module builds the assembler context IN PARALLEL,
 * computes a structural + token diff against the legacy segments, and logs
 * ONE structured line. The assembled context is discarded after the diff —
 * it never touches the prompt, the reasoner, tools, or output.
 *
 * Non-invasiveness guarantees (operator requirements, 2026-07-02):
 *  - Flag-gated by `ATLAS_CTX_ASSEMBLER === 'shadow'` — one env var disables
 *    everything ('off'/unset = default). 'on' is Stage 1 and does NOT arm
 *    the shadow (cutover has its own commits).
 *  - Fire-and-forget: the route `void`s the call and never awaits it →
 *    zero live-path latency by construction (the Stage-0 gate).
 *  - `runContextShadow` never throws and never rejects; any internal
 *    failure logs `[ctx-shadow] error` and ends there.
 *  - No writes: the shadow only reads (through the same readers) and logs.
 *
 * Commit 5.1 — separating reader fidelity from allocation policy:
 * The original `fidelity.actionLedger` compared legacy against the
 * ALREADY-ALLOCATED `soft.activeWork.text`. That conflates two independent
 * concerns: did the reader reproduce legacy content, and did the (working-
 * as-designed) allocation policy shrink it for this turn's modality? A
 * voice turn allocates ② to 300 tokens against a ~910-token legacy ledger —
 * the allocated text can never be a legacy-prefix, so the old diff reported
 * a false `"divergent"` even though the reader was byte-faithful. `fidelity.*`
 * below now compares legacy against `provenance.rawSoft` — the reader's
 * output BEFORE `truncateToBudget` runs — so it measures reader fidelity
 * only. The NEW `allocation.*` field measures the allocation step on its
 * own (raw vs. allocated), independent of legacy. Composition, the reader
 * implementations, and the allocation table are all unchanged; only what
 * gets compared to what has changed.
 *
 * Reading the diff (`[ctx-shadow]` JSON):
 *  - `structural.legacyOnly` lists legacy markers with no assembled
 *    counterpart. `[BESLUT]` is EXPECTED here until Stage 1 (constraints
 *    reader), as are the extra live slices ([AGENTER]/content/revenue/…)
 *    that fold into ① at cutover — the diff makes them visible so the
 *    Commit-7 review sees exactly what moves.
 *  - `fidelity.view` / `fidelity.actionLedger` compare legacy against RAW
 *    reader output (pre-allocation). `fidelity.view` should read
 *    'identical' whenever a view is present: ③ reuses
 *    normalizeView/renderViewBlock verbatim on the same envelope.
 *    `fidelity.actionLedger` compares the [SENASTE ÅTGÄRDER] segment by
 *    prefix (② appends [PÅGÅENDE KÖRNINGAR], and the two paths query
 *    seconds apart, so byte-equality is not the invariant — presence and
 *    prefix fidelity are). Neither is affected by allocation any more.
 *  - `allocation.view` / `allocation.activeWork` report whether THIS turn's
 *    static policy (§6.4) truncated the raw block, zeroed it, or left it
 *    within budget — a fact about the policy, not a comparison to legacy.
 *    A `"divergent"` reader fidelity next to a `"truncated"` allocation on
 *    the SAME line means the reader is fine and the policy did its job; a
 *    `"divergent"` reader fidelity with `"within-budget"` allocation means
 *    the reader actually changed and needs investigating.
 *  - Token counts use the shared M4 heuristic (`estimateTokens`).
 */

import { deriveContextRequest } from '@/lib/atlas/context/request'
import { assembleContext, type AssembledContext } from '@/lib/atlas/context/assembler'
import { estimateTokens } from '@/lib/atlas/context/allocation'
import type { ClientViewEnvelope } from '@/lib/atlas/view-context'

type AnyDb = any

/** Single-flag arm/disarm (operator requirement). Only 'shadow' arms this module. */
export function isContextShadowEnabled(): boolean {
  return process.env.ATLAS_CTX_ASSEMBLER === 'shadow'
}

/** The legacy prompt segments the route already builds, captured verbatim. */
export interface LegacySegments {
  /** buildLiveContext output (live snapshot + [BESLUT] + the extra slices). */
  live: string
  /** buildActionMemory().text ([SENASTE ÅTGÄRDER] or ''). */
  action: string
  /** renderViewBlock output ('' when view awareness is off / no view). */
  view: string
}

export interface ShadowDiff {
  at: string
  modality: string
  /** Attribution (operator requirement): which composition logic + allocation policy produced this diff. */
  versions: { assembler: string; allocationPolicy: string }
  structural: {
    /** Marker sections found in the legacy segments. */
    legacy: string[]
    /** Assembled blocks present (provenance.blocksPresent). */
    assembled: string[]
    /** Legacy markers with no assembled counterpart (expected until Stage 1 — see header). */
    legacyOnly: string[]
    /** Assembled blocks with no legacy counterpart (e.g. [PÅGÅENDE KÖRNINGAR] inside ②). */
    assembledOnly: string[]
  }
  /** Reader fidelity: legacy segment vs. RAW reader output, BEFORE allocation (Commit 5.1). */
  fidelity: {
    view: 'identical' | 'divergent' | 'absent'
    actionLedger: 'identical-prefix' | 'divergent' | 'absent'
  }
  /**
   * Allocation fidelity: the static policy's own effect on the raw block for
   * THIS turn's modality (Commit 5.1). NOT a comparison to legacy — a
   * mechanical fact about the (unchanged) allocation table. 'absent' = no
   * raw block to allocate; 'zeroed-by-policy' = raw present, budget 0 for
   * this modality; 'truncated' = raw exceeded budget; 'within-budget' = raw
   * passed through unshortened.
   */
  allocation: {
    view: 'within-budget' | 'truncated' | 'zeroed-by-policy' | 'absent'
    activeWork: 'within-budget' | 'truncated' | 'zeroed-by-policy' | 'absent'
  }
  tokens: {
    legacyLive: number
    legacyAction: number
    legacyView: number
    operational: number
    activeWork: number
    view: number
  }
  blocksDropped: AssembledContext['provenance']['blocksDropped']
  cacheHits: string[]
  shadowMs: number
}

/** Legacy marker → the assembled dimension expected to carry it. */
const LEGACY_MARKERS: { marker: string; segment: keyof LegacySegments; dimension: string | null }[] = [
  { marker: '[LIVE LÄGE',        segment: 'live',   dimension: 'operational' },
  { marker: '[BESLUT',           segment: 'live',   dimension: null },          // constraints — Stage 1
  { marker: '[SENASTE ÅTGÄRDER', segment: 'action', dimension: 'activeWork' },
  { marker: '[CURRENT VIEW',     segment: 'view',   dimension: 'view' },
]

/**
 * Pure diff: legacy segments vs an AssembledContext. No I/O — exported for
 * DB-free unit tests; `runContextShadow` is just I/O around this.
 */
export function computeShadowDiff(legacy: LegacySegments, assembled: AssembledContext, shadowMs: number): ShadowDiff {
  const legacyFound = LEGACY_MARKERS.filter(m => legacy[m.segment].includes(m.marker))
  const present = new Set<string>(assembled.provenance.blocksPresent)

  const legacyOnly = legacyFound
    .filter(m => m.dimension === null || !present.has(m.dimension))
    .map(m => m.marker)

  const legacyDims = new Set(legacyFound.map(m => m.dimension).filter(Boolean))
  const assembledOnly = [...present].filter(d => !legacyDims.has(d))

  // RAW reader output (pre-allocation) — this is what reader fidelity
  // compares against legacy. Falls back to '' when a fixture/older caller
  // doesn't populate `rawSoft` (kept optional so it never throws).
  const rawView = assembled.provenance.rawSoft?.view ?? ''
  const rawActiveWork = assembled.provenance.rawSoft?.activeWork ?? ''

  const view: ShadowDiff['fidelity']['view'] =
    !legacy.view && !rawView ? 'absent' : legacy.view === rawView ? 'identical' : 'divergent'

  const actionLedger: ShadowDiff['fidelity']['actionLedger'] =
    !legacy.action && !rawActiveWork ? 'absent'
    : legacy.action && rawActiveWork.startsWith(legacy.action) ? 'identical-prefix'
    : 'divergent'

  // ALLOCATED text (post-truncation) — this is what actually reaches the
  // model. Used only for the allocation-fidelity fact and token accounting,
  // never for the legacy comparison above.
  const viewText = assembled.soft.view?.text ?? ''
  const awText = assembled.soft.activeWork?.text ?? ''

  const allocationState = (raw: string, allocated: string): ShadowDiff['allocation']['view'] => {
    if (!raw) return 'absent'
    if (!allocated) return 'zeroed-by-policy'
    return allocated.length < raw.length ? 'truncated' : 'within-budget'
  }

  return {
    at: assembled.provenance.generatedAt,
    modality: assembled.allocation.modality,
    versions: {
      assembler: assembled.provenance.assemblerVersion,
      allocationPolicy: assembled.allocation.policyVersion,
    },
    structural: {
      legacy: legacyFound.map(m => m.marker),
      assembled: [...present],
      legacyOnly,
      assembledOnly,
    },
    fidelity: { view, actionLedger },
    allocation: {
      view: allocationState(rawView, viewText),
      activeWork: allocationState(rawActiveWork, awText),
    },
    tokens: {
      legacyLive: estimateTokens(legacy.live),
      legacyAction: estimateTokens(legacy.action),
      legacyView: estimateTokens(legacy.view),
      operational: estimateTokens(assembled.soft.operational?.text ?? ''),
      activeWork: estimateTokens(awText),
      view: estimateTokens(viewText),
    },
    blocksDropped: [...assembled.provenance.blocksDropped],
    cacheHits: [...assembled.provenance.cacheHits],
    shadowMs,
  }
}

export interface ShadowArgs {
  db: AnyDb
  allowedProjectIds: string[]
  voice: boolean
  view: ClientViewEnvelope | null
  legacy: LegacySegments
  /** Test seam: capture the diff instead of logging. */
  sink?: (diff: ShadowDiff) => void
}

/**
 * Build the assembler context in the shadow, diff it, log ONE line.
 * Fire-and-forget: never throws, never rejects, never returns the context —
 * the assembled result cannot influence the live turn by construction.
 */
export async function runContextShadow(args: ShadowArgs): Promise<void> {
  const t0 = Date.now()
  try {
    const req = deriveContextRequest({
      trigger: 'operator',
      voice: args.voice,
      allowedProjectIds: args.allowedProjectIds,
      projectId: null,
      view: args.view,
    })
    const assembled = await assembleContext(req, {
      db: args.db,
      allowedProjectIds: args.allowedProjectIds,
    })
    const diff = computeShadowDiff(args.legacy, assembled, Date.now() - t0)
    if (args.sink) args.sink(diff)
    else console.log('[ctx-shadow]', JSON.stringify(diff))
  } catch (err) {
    // Contained by contract — the shadow may fail, the turn may not notice.
    try { console.error('[ctx-shadow] error', err instanceof Error ? err.message : String(err)) } catch { /* noop */ }
  }
}
