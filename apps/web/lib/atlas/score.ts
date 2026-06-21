/**
 * lib/atlas/score.ts — Atlas Score Engine v1.
 *
 * Functional core, imperative shell.
 *
 * `computeScore` is a synchronous pure function. No DB. No I/O. All data
 * fetching happens in the caller (e.g. brief assembly orchestrator), which
 * pre-loads source authority via loadAuthorityMap and passes it in. The
 * engine reads from input only; given identical input it returns identical
 * output every time.
 *
 * v1 ships with 2 dimensions: source_authority and source_count. We add
 * dimensions as the data to compute them becomes available, never before.
 * Each addition bumps SCORE_ENGINE_VERSION so historic scores remain
 * interpretable forever via their stamped version.
 *
 * See OMNIRA_ATLAS_BRIEF_ADR.md → "Signal Producer v1 — Atlas Score Engine".
 */

/** Producer version stamped on every signal record. Bump on any change to
 *  weights, dimensions, or formula. */
export const SCORE_ENGINE_VERSION = 'score-engine-1.0.0'

/** v1 dimensions. Future additions: 'momentum', 'novelty', 'scope'. */
export type DimensionName = 'source_authority' | 'source_count'

export interface SourceObservation {
  name:       string
  url:        string
  observedAt: string
}

export interface ScoreInput {
  contentId:       string
  publishedAt:     string
  sources:         SourceObservation[]
  category:        string | null
  /** Pre-loaded by caller; engine never reaches for I/O. */
  sourceAuthority: Record<string, number>
}

export interface ScoreDimension {
  name:    DimensionName
  /** 0-100, normalized within the dimension. */
  value:   number
  /** Renormalized over included dimensions; sum across dimensions = 1.0. */
  weight:  number
  /** Audit trail: the inputs that produced this dimension's value. */
  rawData: Record<string, unknown>
}

export interface ScorePayload {
  /** Weighted sum across included dimensions. Always 0-100. */
  value:      number
  /** Only the dimensions the engine could compute given the input. */
  dimensions: ScoreDimension[]
  /** Dimension names skipped because their input data was missing. */
  excluded:   DimensionName[]
}

/**
 * Default weights — explicit, version-controlled. Sum to 1.0.
 * When a dimension is excluded (missing input), the remaining weights are
 * renormalized so the final score still lives on a 0-100 scale.
 */
const DEFAULT_WEIGHTS: Record<DimensionName, number> = {
  source_authority: 0.6,
  source_count:     0.4,
}

const ALL_DIMENSIONS: DimensionName[] = ['source_authority', 'source_count']

/**
 * Compute the score for a single content item. Pure. Synchronous.
 *
 * Returns a ScorePayload whose `value` is 0-100 and whose `dimensions`
 * lists only what could be computed. Dimensions with missing input data
 * end up in `excluded` and do not contribute.
 */
export function computeScore(input: ScoreInput): ScorePayload {
  const computed: ScoreDimension[] = []
  const excluded: DimensionName[] = []

  const authority = dimSourceAuthority(input)
  if (authority) computed.push({ ...authority, name: 'source_authority', weight: DEFAULT_WEIGHTS.source_authority })
  else excluded.push('source_authority')

  const count = dimSourceCount(input)
  if (count) computed.push({ ...count, name: 'source_count', weight: DEFAULT_WEIGHTS.source_count })
  else excluded.push('source_count')

  // Renormalize weights over the included subset so they sum to 1.0.
  if (computed.length === 0) {
    return { value: 0, dimensions: [], excluded }
  }
  const weightSum = computed.reduce((s, d) => s + d.weight, 0)
  for (const d of computed) d.weight = d.weight / weightSum

  const value = clamp01_100(
    computed.reduce((s, d) => s + d.value * d.weight, 0),
  )

  // Round to integer for clean display + stable comparisons.
  return {
    value:      Math.round(value),
    dimensions: computed.map((d) => ({ ...d, value: Math.round(d.value) })),
    excluded:   sortDims(excluded),
  }
}

// ── Dimension calculators ────────────────────────────────────────────────────
// Each returns the {value, rawData} payload OR null when the input data
// required for that dimension is missing. Never throws.

interface DimResult {
  value:   number
  rawData: Record<string, unknown>
}

/**
 * source_authority: weighted-by-presence average of authority values across
 * observed sources, looked up in the pre-loaded authority map. Excluded
 * when there are zero sources.
 */
function dimSourceAuthority(input: ScoreInput): DimResult | null {
  if (input.sources.length === 0) return null
  const lookups = input.sources.map((s) => ({
    name:      s.name,
    authority: input.sourceAuthority[s.name] ?? input.sourceAuthority[s.name.toLowerCase()] ?? 50,
  }))
  const total = lookups.reduce((s, l) => s + l.authority, 0)
  const value = total / lookups.length
  return {
    value,
    rawData: {
      sourceCount: lookups.length,
      perSource:   lookups,
    },
  }
}

/**
 * source_count: how many distinct sources observed the story. 10+ distinct
 * sources saturates to 100. Excluded when there are zero sources.
 *
 * Formula: min(100, distinct_source_names.length * 10)
 *
 * Conservative ramp — a single source = 10, 5 sources = 50, 10+ sources
 * = 100. Adjusts in future versions; today's choice errs toward giving
 * highly-replicated stories real weight.
 */
function dimSourceCount(input: ScoreInput): DimResult | null {
  if (input.sources.length === 0) return null
  const distinctNames = new Set(input.sources.map((s) => s.name.trim().toLowerCase()))
  const value = Math.min(100, distinctNames.size * 10)
  return {
    value,
    rawData: {
      totalObservations: input.sources.length,
      distinctSources:   distinctNames.size,
      saturationCap:     100,
    },
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp01_100(n: number): number {
  if (n < 0)   return 0
  if (n > 100) return 100
  return n
}

function sortDims(dims: DimensionName[]): DimensionName[] {
  // Stable order for snapshot tests and human readability.
  const order = ALL_DIMENSIONS
  return [...dims].sort((a, b) => order.indexOf(a) - order.indexOf(b))
}
