/**
 * lib/atlas/intelligence/producers/brief-producer.ts — the first Intelligence
 * Producer.
 *
 * FUNCTIONAL CORE: `buildBrief` is a synchronous, pure, deterministic function.
 * No DB, no I/O, no clock. All data (signals, memory) is pre-loaded by the
 * imperative shell (brief-orchestrator.ts) and passed in. Same input → same
 * output, so it is unit-tested without mocks.
 *
 * The Brief Producer turns normalized facts (atlas_signals) — optionally
 * enriched with consolidated memory — into a single versioned IntelligenceObject
 * of kind 'brief', carrying confidence and a COMPLETE evidence chain (one entry
 * per signal and memory item that informed it).
 *
 * Pipeline position: Signals + Memory → [Brief Producer] → Intelligence.
 * See OMNIRA_ATLAS_INTELLIGENCE_ADR.md.
 */

import type { SignalRecord } from '@/lib/atlas/signals'
import type {
  Confidence,
  Evidence,
  EvidenceChain,
  Finding,
  IntelligenceDraft,
  Subject,
} from '../types'

/** Producer identity + semver. Stamped on every object for track record. */
export const BRIEF_PRODUCER_ID = 'brief-producer'
export const BRIEF_PRODUCER_VERSION = 'brief-producer-1.0.0'

// Signal kinds the brief understands. Unknown kinds are still counted and
// evidenced, but do not contribute typed metrics.
const KIND_STRIPE = 'stripe.mrr_snapshot'
const KIND_SOCIAL = 'social.account_snapshot'
const KIND_IMPACT = 'impact_score'

/**
 * Consolidated-memory context the producer can fold in. Kept minimal and
 * backend-neutral so a future memory recall wrapper can supply it without
 * coupling the producer to atlas.memories' schema.
 */
export interface BriefMemoryContext {
  id: string
  summary: string
  confidence?: number
  lastSeenAt?: string
  entityKind?: string
  entityKey?: string
}

export interface BriefInput {
  /** Project scope. Null = platform-global brief. */
  projectId: string | null
  /** Time window the brief covers (ISO 8601). */
  window: { since: string; until: string }
  /** Pre-loaded signals within the window. */
  signals: SignalRecord[]
  /** Optional consolidated-memory enrichment. */
  memory?: BriefMemoryContext[]
}

export interface BriefBody {
  window: { since: string; until: string }
  /** Signal count per kind. */
  signalCounts: Record<string, number>
  metrics: {
    mrrSek?: number
    activeSubscribers?: number
    followersByPlatform?: Record<string, number>
    scoredContentCount?: number
    topImpactScore?: number
  }
  memoryUsed: number
}

// ── helpers (pure) ──────────────────────────────────────────────────────────

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** Latest-first by producedAt; stable for equal timestamps via id tiebreak. */
function byProducedDesc(a: SignalRecord, b: SignalRecord): number {
  if (a.producedAt !== b.producedAt) return a.producedAt < b.producedAt ? 1 : -1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

function round(n: number, dp = 3): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/**
 * Deterministic confidence in [0.1, 0.95]:
 *   - 0.2 per distinct signal kind present (coverage breadth)
 *   - up to +0.2 for total signal volume (0.02 each, capped)
 *   - +0.1 if any memory enrichment was available
 * Floored at 0.1 so an empty brief is honest, not zero.
 */
function computeConfidence(
  distinctKinds: number,
  totalSignals: number,
  memoryCount: number,
): Confidence {
  const coverage = 0.2 * distinctKinds
  const volume = Math.min(0.2, 0.02 * totalSignals)
  const memoryBoost = memoryCount > 0 ? 0.1 : 0
  return round(clamp(0.1 + coverage + volume + memoryBoost, 0.1, 0.95))
}

// ── core ─────────────────────────────────────────────────────────────────────

/**
 * Build a brief IntelligenceObject draft from pre-loaded signals + memory.
 * Pure and deterministic. The store assigns id/producedAt on persist.
 */
export function buildBrief(input: BriefInput): IntelligenceDraft<BriefBody> {
  const signals = [...input.signals].sort(byProducedDesc)
  const memory = input.memory ?? []

  // Count by kind + latest per kind.
  const signalCounts: Record<string, number> = {}
  const latestByKind: Record<string, SignalRecord> = {}
  for (const s of signals) {
    signalCounts[s.kind] = (signalCounts[s.kind] ?? 0) + 1
    if (!(s.kind in latestByKind)) latestByKind[s.kind] = s // signals are sorted desc
  }

  const findings: Finding[] = []
  const metrics: BriefBody['metrics'] = {}

  // Revenue (Stripe MRR).
  const stripe = latestByKind[KIND_STRIPE]
  if (stripe) {
    const p = stripe.payload as Record<string, unknown>
    const mrr = num(p.mrr_sek)
    const active = num(p.active_subscribers)
    if (mrr !== undefined) metrics.mrrSek = mrr
    if (active !== undefined) metrics.activeSubscribers = active
    findings.push({
      label: 'revenue',
      detail:
        mrr !== undefined
          ? `MRR ${Math.round(mrr)} kr` +
            (active !== undefined ? ` across ${active} active subscribers.` : '.')
          : 'Revenue snapshot present but MRR unavailable.',
      evidence: [signalEvidence(stripe)],
    })
  }

  // Audience (social account snapshot).
  const social = latestByKind[KIND_SOCIAL]
  if (social) {
    const p = social.payload as Record<string, unknown>
    const platforms = (p.platforms ?? {}) as Record<string, Record<string, unknown> | null>
    const followersByPlatform: Record<string, number> = {}
    for (const [platform, snap] of Object.entries(platforms)) {
      const f = num(snap?.followers)
      if (f !== undefined) followersByPlatform[platform] = f
    }
    if (Object.keys(followersByPlatform).length > 0) {
      metrics.followersByPlatform = followersByPlatform
    }
    const total = Object.values(followersByPlatform).reduce((a, b) => a + b, 0)
    findings.push({
      label: 'audience',
      detail:
        Object.keys(followersByPlatform).length > 0
          ? `${total} followers across ${Object.keys(followersByPlatform).length} platform(s).`
          : 'Social snapshot present but no follower counts available.',
      evidence: [signalEvidence(social)],
    })
  }

  // Content impact.
  const impactSignals = signals.filter((s) => s.kind === KIND_IMPACT)
  if (impactSignals.length > 0) {
    let top = -Infinity
    for (const s of impactSignals) {
      const v = num((s.payload as Record<string, unknown>).value)
      if (v !== undefined && v > top) top = v
    }
    metrics.scoredContentCount = impactSignals.length
    if (top > -Infinity) metrics.topImpactScore = top
    findings.push({
      label: 'content_impact',
      detail:
        top > -Infinity
          ? `${impactSignals.length} scored item(s); highest impact score ${Math.round(top)}.`
          : `${impactSignals.length} scored item(s).`,
      evidence: impactSignals.map(signalEvidence),
    })
  }

  // Memory enrichment (context, not a metric).
  if (memory.length > 0) {
    findings.push({
      label: 'memory_context',
      detail: `${memory.length} consolidated memory item(s) considered.`,
      evidence: memory.map(memoryEvidence),
    })
  }

  const distinctKinds = Object.keys(signalCounts).length
  const confidence = computeConfidence(distinctKinds, signals.length, memory.length)

  // Complete evidence chain: every signal + every memory item.
  const evidence: EvidenceChain = [
    ...signals.map(signalEvidence),
    ...memory.map(memoryEvidence),
  ]

  const subject: Subject = input.projectId
    ? { kind: 'project', ref: input.projectId }
    : { kind: 'global', ref: null }

  const summary = buildSummary(signals.length, distinctKinds, metrics, memory.length)

  const body: BriefBody = {
    window: input.window,
    signalCounts,
    metrics,
    memoryUsed: memory.length,
  }

  return {
    kind: 'brief',
    subject,
    projectId: input.projectId,
    summary,
    findings,
    body,
    confidence,
    evidence,
    producedBy: BRIEF_PRODUCER_ID,
    version: BRIEF_PRODUCER_VERSION,
  }
}

// ── evidence builders (pure) ──────────────────────────────────────────────────

function signalEvidence(s: SignalRecord): Evidence {
  return {
    sourceKind: 'signal',
    refId: s.id,
    weight: 1,
    observedAt: s.producedAt,
    note: s.kind,
  }
}

function memoryEvidence(m: BriefMemoryContext): Evidence {
  return {
    sourceKind: 'memory',
    refId: m.id,
    weight: 0.5,
    observedAt: m.lastSeenAt ?? '',
    note: m.summary,
  }
}

function buildSummary(
  total: number,
  distinctKinds: number,
  metrics: BriefBody['metrics'],
  memoryCount: number,
): string {
  if (total === 0 && memoryCount === 0) {
    return 'No signals in window — insufficient data for a brief.'
  }
  const parts: string[] = [`${total} signal(s) across ${distinctKinds} kind(s)`]
  if (metrics.mrrSek !== undefined) parts.push(`MRR ${Math.round(metrics.mrrSek)} kr`)
  if (metrics.followersByPlatform) {
    const t = Object.values(metrics.followersByPlatform).reduce((a, b) => a + b, 0)
    parts.push(`${t} followers`)
  }
  if (metrics.scoredContentCount !== undefined) {
    parts.push(`${metrics.scoredContentCount} scored item(s)`)
  }
  if (memoryCount > 0) parts.push(`${memoryCount} memory item(s)`)
  return parts.join(' · ') + '.'
}
