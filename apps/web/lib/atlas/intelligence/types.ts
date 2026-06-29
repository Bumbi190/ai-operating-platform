/**
 * lib/atlas/intelligence/types.ts — Atlas Intelligence domain contracts.
 *
 * The Intelligence layer answers "What does it MEAN?" — distinct from the Signal
 * layer, which answers "What HAPPENED?". The platform pipeline is strictly:
 *
 *     Collectors → Signals (atlas_signals) → Intelligence (atlas_intelligence)
 *                                          → Consumers (Manager, Agents, The Prompt)
 *
 * These types ARE the public architecture. They are deliberately storage-agnostic:
 * a Postgres IntelligenceStore is the v1 implementation; a graph backend (e.g.
 * Graphify) can implement the SAME contracts later WITHOUT changing producers or
 * consumers. Nothing here references the database.
 *
 * P0 scope: contracts only. No producers, no consumers wired, no behavior change.
 * See OMNIRA_ATLAS_INTELLIGENCE_ADR.md for the full rationale.
 */

// ── Entities ──────────────────────────────────────────────────────────────────
//
// Canonical subjects intelligence can be about. Identity is the natural key
// (kind, key) — e.g. ('company', 'openai'). Reconciles conceptually with
// atlas.memories.entity_kind/entity_id; the canonical registry lives in
// public.atlas_entities.

export type EntityKind =
  | 'company'
  | 'person'
  | 'product'
  | 'topic'
  | 'project'
  | 'content'

/** A canonical actor/subject. Identity = (kind, key). */
export interface Entity {
  kind: EntityKind
  /** Stable natural key, unique within kind. Lowercase slug, e.g. 'openai'. */
  key: string
  displayName: string
  attributes?: Record<string, unknown>
}

/** A lightweight reference to an entity, without embedding it. */
export interface EntityRef {
  kind: EntityKind
  key: string
}

// ── Relationships ──────────────────────────────────────────────────────────────
//
// Graph-ready abstraction. Defined now so the contract is stable; traversal is
// NOT implemented in P0 (YAGNI until a producer needs it). When a graph backend
// is evaluated, relationships move behind IntelligenceStore unchanged.

export type RelationshipType =
  | 'mentions'
  | 'competes_with'
  | 'partners_with'
  | 'belongs_to'
  | 'derived_from'
  | 'related_to'

export interface Relationship {
  from: EntityRef
  type: RelationshipType
  to: EntityRef
  confidence: Confidence
  evidence: EvidenceChain
}

// ── Evidence ───────────────────────────────────────────────────────────────────
//
// Every conclusion the Intelligence layer makes carries the chain of inputs that
// produced it. This is what keeps intelligence auditable rather than a black box.

export type EvidenceSourceKind =
  | 'signal' // public.atlas_signals row
  | 'memory' // atlas.memories / atlas.memory_events
  | 'content' // website_content / articles
  | 'collector_run' // collector_runs row
  | 'intelligence' // another atlas_intelligence object (derived chains)
  | 'url' // external source

/** One traceable input supporting a conclusion. */
export interface Evidence {
  sourceKind: EvidenceSourceKind
  /** Identifier within the source domain: signal id, memory id, content id, URL… */
  refId: string
  /** Relative contribution to the conclusion, 0–1. Producer-defined. */
  weight: number
  /** When the evidence was observed/produced (ISO 8601). */
  observedAt: string
  note?: string
}

/** Ordered chain of evidence backing an intelligence object or relationship. */
export type EvidenceChain = Evidence[]

// ── Confidence ─────────────────────────────────────────────────────────────────

/**
 * 0–1 confidence. Platform-wide convention, matching atlas.memories.confidence,
 * so confidence is comparable across memory, relationships, and intelligence.
 */
export type Confidence = number

// ── Intelligence Objects ───────────────────────────────────────────────────────
//
// The reusable unit of refined intelligence. Consumed IDENTICALLY by Omnira
// Manager, future agents, and The Prompt. Persisted via IntelligenceStore;
// append-only by convention — lifecycle is supersede, never mutate-in-place.

export type IntelligenceKind =
  | 'brief' // aggregated situational summary
  | 'trend' // direction/inflection detected over time
  | 'entity_momentum' // an entity's trajectory
  | 'reasoning' // a derived conclusion / hypothesis
  | 'executive_brief' // the 5 executive questions, persisted

export type SubjectKind = 'entity' | 'content' | 'project' | 'global'

/** What an intelligence object is about. */
export interface Subject {
  kind: SubjectKind
  /** entity key | content id | project id | null for global. */
  ref: string | null
}

/** A single structured conclusion within an intelligence object. */
export interface Finding {
  label: string
  detail: string
  confidence?: Confidence
  evidence?: EvidenceChain
}

/**
 * A persisted unit of refined intelligence.
 *
 * @typeParam B  Shape of the producer-specific `body`. Consumers that only read
 *               summary/findings/confidence can leave it as the default.
 */
export interface IntelligenceObject<B = Record<string, unknown>> {
  id: string
  kind: IntelligenceKind
  subject: Subject
  /** Project scope. Null = platform-global. */
  projectId: string | null
  /** One-line human-readable headline. */
  summary: string
  /** Structured, machine-readable conclusions. */
  findings: Finding[]
  /** Producer-specific structured body (dimensions, narrative, etc.). */
  body: B
  confidence: Confidence
  evidence: EvidenceChain
  /** Producer identity + version, e.g. 'brief-producer-1.0.0'. */
  producedBy: string
  version: string
  /** ISO 8601. */
  producedAt: string
  /** Optional staleness horizon (ISO 8601). Null = no defined horizon. */
  validUntil?: string | null
  /** Set when a newer object replaces this one. Null = current. */
  supersededBy?: string | null
}

/**
 * The shape a producer hands to IntelligenceStore.record(). `id`, `producedAt`
 * and `supersededBy` are assigned by the store on persist.
 */
export interface IntelligenceDraft<B = Record<string, unknown>> {
  kind: IntelligenceKind
  subject: Subject
  projectId?: string | null
  summary: string
  findings: Finding[]
  body: B
  confidence: Confidence
  evidence: EvidenceChain
  producedBy: string
  version: string
  validUntil?: string | null
}
