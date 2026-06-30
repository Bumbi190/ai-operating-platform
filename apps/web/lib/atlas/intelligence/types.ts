/**
 * lib/atlas/intelligence/types.ts — EI Domain Contracts
 *
 * All cognitive artifacts produced by Executive Intelligence. Every type here
 * maps to a section of the canonical architecture:
 *
 *   IntelligenceObject<B>  — §14 (cognitive artifacts)
 *   EvidenceChain          — §8.3, P4 (provenance on every output)
 *   Confidence             — §8.2 (calibrated confidence)
 *   IntelligenceKind       — §14 (full artifact taxonomy)
 *   Body types             — §5, §8, §9, §13 (per-kind reasoning output)
 *
 * P2: these types describe stateless reasoning outputs. No retained state lives
 * here. The store (store.ts) persists them; EI reads them back as inputs.
 *
 * P3: every body type is an interpretation, never raw signal data.
 *
 * P4: every IntelligenceObject carries evidence: EvidenceChain — a complete
 * provenance trace. An object without evidence is malformed, not merely terse.
 */

// ── Primitives ─────────────────────────────────────────────────────────────────

/** Calibrated confidence 0–1. See §8.2. Not a "vibe" — calibrated against outcomes. */
export type Confidence = number

/**
 * One entry in a provenance chain. Every consumed source — signal, prior
 * intelligence object, memory item — gets one entry. P4.
 */
export interface EvidenceEntry {
  /** ID of the source (signal id, intelligence object id, memory item id). */
  sourceId:   string
  /** What kind of source this is. ('action' = an execution in atlas_actions —
   *  the interface the Outcome→Experience→Memory loop needs; loop itself is M4.) */
  sourceKind: 'signal' | 'atlas_intelligence' | 'memory' | 'config' | 'action'
  /** Human-readable label for audit. */
  label:      string
  /** ISO timestamp of the source. */
  producedAt: string
}

/** Complete provenance trace. One entry per consumed source. */
export type EvidenceChain = EvidenceEntry[]

/** A single interpreted finding within a broader artifact. */
export interface Finding {
  label:     string
  value:     string | number
  direction: 'positive' | 'negative' | 'neutral'
  confidence: Confidence
  evidence:  EvidenceChain
}

/**
 * An entity EI reasons about: a project, metric, tenant, or content item.
 * Referenced in artifacts by (kind, id) so the trace is stable even if
 * underlying data is restructured. §14.
 */
export interface Subject {
  kind: 'project' | 'metric' | 'tenant' | 'content'
  id:   string
  name?: string
}

// ── Artifact kinds ──────────────────────────────────────────────────────────────

/**
 * The complete taxonomy of EI cognitive artifacts. §14.
 *
 * Input-tier: brief, trend, insight, entity_profile — consumed by higher-tier producers.
 * Output-tier: risk, opportunity, executive_brief, recommendation, attention_request,
 *              delegation_request, knowledge_request, hypothesis.
 * Ledger: outcome, experience — used by the decision ledger (Epic 5).
 * Reserved: attention_request, delegation_request, knowledge_request, hypothesis
 *           are typed in types.ts but produced in later epics (2–7).
 */
export type IntelligenceKind =
  // Input-tier (produced in Epic 1)
  | 'brief'
  | 'trend'
  | 'insight'
  | 'risk'
  | 'opportunity'
  // Output-tier (produced in Epics 4+)
  | 'executive_brief'
  | 'recommendation'
  // Boundary artifacts (Epics 6–7)
  | 'attention_request'
  | 'delegation_request'
  | 'knowledge_request'
  // Memory artifacts (Epic 7)
  | 'hypothesis'
  // Decision ledger (Epic 5)
  | 'outcome'
  | 'experience'

// ── Core artifact shape ─────────────────────────────────────────────────────────

/**
 * A persisted cognitive artifact — what EI emits and Memory stores. §14.
 *
 * Generic over B (body): the interpretation specific to this kind.
 * P4: every artifact carries evidence. An artifact without a chain is malformed.
 */
export interface IntelligenceObject<B = unknown> {
  id:           string
  kind:         IntelligenceKind
  projectId:    string | null
  subject:      Subject | null
  body:         B
  evidence:     EvidenceChain
  confidence:   Confidence
  producedAt:   string               // ISO
  producedBy:   string               // e.g. 'brief-producer-1.0.0'
  supersededBy: string | null        // ID of the artifact that superseded this one
  window:       { since: string; until: string } | null
}

/**
 * A draft artifact before it is persisted. The store assigns id and may
 * set supersededBy on the prior artifact. Producers emit drafts; the
 * orchestrator shell passes them to the store.
 */
export type IntelligenceDraft<B = unknown> = Omit<IntelligenceObject<B>, 'id' | 'supersededBy'>

// ── Body types ──────────────────────────────────────────────────────────────────

/**
 * Situational brief body. The lower-tier input to executive_brief (Epic 4).
 * Produced by brief-producer.ts. One per scope+window cycle.
 *
 * This is a "brief" (§13.2 input-tier), not the "executive_brief" apex (§13.1).
 * It carries findings and a one-sentence situation. The executive_brief producer
 * synthesises multiple briefs, trends, and insights into the five-section shape.
 */
export interface BriefBody {
  scope:          'project' | 'global'
  projectId:      string | null
  window:         { since: string; until: string }
  /** One reasoned sentence — the whole situation. Not a list (§13.1). */
  situation:      string
  findings:       BriefFinding[]
  signalCount:    number
  memoryItemCount: number
}

export interface BriefFinding {
  metric:    string
  label:     string
  direction: 'positive' | 'negative' | 'neutral'
  detail:    string
  evidence:  EvidenceChain
}

/**
 * Trend body. One per (metric, projectId, window). Produced by trend-producer.ts.
 * Confidence is derived deterministically from R², point count, and prior intelligence.
 */
export interface TrendBody {
  metric:     string
  projectId:  string | null
  direction:  'rising' | 'falling' | 'flat' | 'insufficient_data'
  /** Fractional change (current - baseline) / |baseline|. 0 when baseline is zero. */
  changeRatio: number
  /** Regression quality 0–1. */
  r2:         number
  pointCount: number
  window:     { since: string; until: string }
  baseline:   number | null    // first-point value
  current:    number | null    // last-point value
  /** Regression slope in metric units per day. */
  slope:      number
}

/**
 * Insight body. Cross-metric pattern detection. Produced by insight-producer.ts.
 * Canonical §8.1: pattern detection (acceleration/deceleration/divergence/plateau).
 */
export interface InsightBody {
  pattern:    'acceleration' | 'deceleration' | 'divergence' | 'plateau' | 'no_pattern'
  metrics:    string[]
  projectId:  string | null
  description: string
  window:     { since: string; until: string }
}

/**
 * Risk body. Signed negative finding. Produced by risk-producer.ts.
 * Canonical §9: a deviation with negative expected utility against an in-play goal.
 *
 * likelihood and confidence are kept strictly independent:
 *   likelihood = how probable the risk materialises (domain estimate)
 *   confidence = how sure EI is of this risk assessment (evidence quality)
 */
export interface RiskBody {
  subject:         string
  description:     string
  affectedMetrics: string[]
  /** Probability of materialisation 0–1. Independent from confidence. */
  likelihood:      number
  /** Magnitude of impact 0–1. */
  magnitude:       number
  horizon:         'near_term' | 'mid_term'
  mitigations:     string[]
  projectId:       string | null
}

/**
 * Opportunity body. Signed positive finding. Produced by opportunity-producer.ts.
 * Canonical §9: a deviation with positive expected utility against an in-play goal.
 */
export interface OpportunityBody {
  subject:         string
  description:     string
  affectedMetrics: string[]
  /** Expected gain magnitude 0–1. */
  expectedGain:    number
  magnitude:       number
  horizon:         'near_term' | 'mid_term'
  actions:         string[]
  projectId:       string | null
}

// ── Memory input type (passed to producers as context) ─────────────────────────

/**
 * A minimal memory item passed to producers for context enrichment.
 * Producers never read memory directly (P6); orchestrators inject it as input.
 */
export interface MemoryItem {
  id:         string
  content:    string
  eventType:  string
  confidence: Confidence
  occurredAt: string
}
