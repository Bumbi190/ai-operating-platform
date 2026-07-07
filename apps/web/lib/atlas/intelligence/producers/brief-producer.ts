/**
 * lib/atlas/intelligence/producers/brief-producer.ts — Situational Brief Producer
 *
 * Pure functional core. No I/O, no retained state. P1, P2, P3, P4.
 *
 * Produces a situational `brief` artifact from pre-loaded signals and memory
 * items. The brief is an *interpretation* of signals, never a raw listing of
 * them (P3). Every signal consumed is recorded in the evidence chain (P4).
 *
 * The `brief` kind is the input-tier foundation. The `executive_brief` (Epic 4)
 * synthesises multiple briefs into the apex five-section shape (§13.1).
 *
 * Canonical refs: §5 (cognitive cycle core), §13 (briefing), P1–P4.
 */

import type { SignalRecord } from '../../signals'
import type { IntelligenceDraft, BriefBody, BriefFinding, EvidenceChain, MemoryItem } from '../types'
import { propagateConfidence, metricImportance } from './assessment'

export const BRIEF_PRODUCER_VERSION = 'brief-producer-1.0.0'

// ── Input ─────────────────────────────────────────────────────────────────────

export interface BriefInput {
  scope:       'project' | 'global'
  projectId:   string | null
  window:      { since: string; until: string }
  signals:     SignalRecord[]
  memoryItems: MemoryItem[]
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Build a situational brief from signals and memory items.
 *
 * Zero signals → low-confidence brief with empty findings (cold-start safe).
 * The situation string is always emitted (may be "Insufficient data…").
 *
 * Evidence chain: one entry per signal + one entry per memory item consumed.
 * An entry is emitted for every source this artifact depends on, so the
 * provenance trace is complete (P4).
 */
export function buildBrief(input: BriefInput): IntelligenceDraft<BriefBody> {
  const { scope, projectId, window, signals, memoryItems } = input

  // ── Evidence chain ────────────────────────────────────────────────────────
  const evidence: EvidenceChain = [
    ...signals.map(s => ({
      sourceId:   s.id,
      sourceKind: 'signal' as const,
      label:      `${s.kind} @ ${s.producedAt.slice(0, 10)}`,
      producedAt: s.producedAt,
    })),
    ...memoryItems.map(m => ({
      sourceId:   m.id,
      sourceKind: 'memory' as const,
      label:      `memory:${m.eventType}`,
      producedAt: m.occurredAt,
    })),
  ]

  // ── Findings ──────────────────────────────────────────────────────────────
  const findings: BriefFinding[] = deriveFindings(signals)

  // ── Confidence ───────────────────────────────────────────────────────────
  //   Base: 0.15 (prior to any data)
  //   Signal contribution: saturates near 0.75 at 10+ signals
  //   Memory contribution: up to 0.1 additional
  const signalFactor  = signals.length  > 0 ? Math.min(signals.length  / 10, 1) * 0.60 : 0
  const memoryFactor  = memoryItems.length > 0 ? Math.min(memoryItems.length / 5, 1) * 0.10 : 0
  const findingConf   = findings.length > 0
    ? propagateConfidence(findings.map(() => 0.6 + metricImportance('generic') * 0.2))
    : 0
  const rawConf       = 0.15 + signalFactor + memoryFactor + (findingConf > 0 ? 0.05 : 0)
  const confidence    = Math.min(rawConf, 0.90)

  // ── Situation ─────────────────────────────────────────────────────────────
  const situation = deriveSituation(findings, signals.length, scope)

  return {
    kind:       'brief',
    projectId,
    subject:    projectId ? { kind: 'project', id: projectId } : null,
    body: {
      scope,
      projectId,
      window,
      situation,
      findings,
      signalCount:     signals.length,
      memoryItemCount: memoryItems.length,
    },
    evidence,
    confidence,
    producedAt: new Date().toISOString(),
    producedBy: BRIEF_PRODUCER_VERSION,
    window,
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function deriveFindings(signals: SignalRecord[]): BriefFinding[] {
  if (signals.length === 0) return []

  // Group signals by kind
  const byKind = new Map<string, SignalRecord[]>()
  for (const s of signals) {
    const group = byKind.get(s.kind) ?? []
    group.push(s)
    byKind.set(s.kind, group)
  }

  const findings: BriefFinding[] = []

  for (const [kind, kindSignals] of byKind.entries()) {
    // Use most recent signal in the group
    const latest = kindSignals.sort(
      (a, b) => new Date(b.producedAt).getTime() - new Date(a.producedAt).getTime(),
    )[0]

    const { label, direction, detail } = interpretSignal(kind, latest.payload as Record<string, unknown>)

    const sigEvidence: EvidenceChain = kindSignals.map(s => ({
      sourceId:   s.id,
      sourceKind: 'signal' as const,
      label:      `${s.kind} @ ${s.producedAt.slice(0, 10)}`,
      producedAt: s.producedAt,
    }))

    findings.push({
      metric:    kind,
      label,
      direction,
      detail,
      evidence:  sigEvidence,
    })
  }

  // Sort by metric importance descending so the most important findings come first
  return findings.sort((a, b) => metricImportance(b.metric) - metricImportance(a.metric))
}

function interpretSignal(
  kind: string,
  payload: Record<string, unknown>,
): Pick<BriefFinding, 'label' | 'direction' | 'detail'> {
  // Stripe MRR snapshot
  if (kind === 'stripe.mrr_snapshot') {
    const mrr = payload.mrr_sek as number | undefined
    const subs = payload.active_subscribers as number | undefined
    const churn = payload.churn_rate_pct as number | undefined
    const label = 'MRR'
    if (mrr === undefined) return { label, direction: 'neutral', detail: 'MRR data present (no value extracted).' }
    const churnNote = typeof churn === 'number' ? ` Churn ${churn.toFixed(1)}%.` : ''
    const subsNote  = typeof subs  === 'number' ? ` ${subs} aktiva prenumeranter.` : ''
    return {
      label,
      direction: mrr > 0 ? 'positive' : 'neutral',
      detail: `MRR ${Math.round(mrr).toLocaleString('sv-SE')} kr.${subsNote}${churnNote}`,
    }
  }

  // Social account snapshot
  if (kind === 'social.account_snapshot') {
    const platforms = payload.platforms as Record<string, Record<string, unknown> | null> | undefined
    if (!platforms) return { label: 'Sociala kanaler', direction: 'neutral', detail: 'Snapshot mottagen, inga plattformsdata.' }
    const parts: string[] = []
    for (const [name, snap] of Object.entries(platforms)) {
      if (!snap) continue
      const followers = snap.followers as number | undefined
      if (typeof followers === 'number') parts.push(`${name}: ${followers.toLocaleString('sv-SE')} följare`)
    }
    const detail = parts.length > 0 ? parts.join(', ') + '.' : 'Inga plattformsdata tillgängliga.'
    return { label: 'Sociala kanaler', direction: parts.length > 0 ? 'neutral' : 'neutral', detail }
  }

  // Generic fallback
  return {
    label:     kind.split('.').pop() ?? kind,
    direction: 'neutral',
    detail:    `Signal mottagen (${kind}).`,
  }
}

function deriveSituation(
  findings:     BriefFinding[],
  signalCount:  number,
  scope:        'project' | 'global',
): string {
  if (signalCount === 0) {
    return scope === 'global'
      ? 'Inga signaler tillgängliga för perioden — plattformen inväntar datainsamling.'
      : 'Inga projektsignaler tillgängliga för perioden — datainsamling pågår.'
  }
  if (findings.length === 0) {
    return `${signalCount} signal${signalCount === 1 ? '' : 'er'} mottagen${signalCount === 1 ? '' : 'a'}, inga tolkningsbara fynd ännu.`
  }

  const positives = findings.filter(f => f.direction === 'positive').length
  const negatives = findings.filter(f => f.direction === 'negative').length

  if (positives > 0 && negatives === 0) {
    return `${findings.length} fynd — samtliga positiva; inga varningssignaler.`
  }
  if (negatives > 0 && positives === 0) {
    return `${findings.length} fynd — negativt utfall på ${negatives} mätpunkt${negatives === 1 ? '' : 'er'}; åtgärd kan behövas.`
  }
  if (positives > 0 && negatives > 0) {
    return `Blandat läge: ${positives} positiv${positives === 1 ? 't' : 'a'} och ${negatives} negativt fynd.`
  }
  return `${findings.length} fynd noterade; inga signifikanta avvikelser.`
}
