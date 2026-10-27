import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import type { MarketplaceReport } from './handlarborsen-marketplace-report'
import { deriveHandlarborsenInsights, type HandlarborsenEvidence } from './handlarborsen-insights'

export const PAPER_WORKFLOW_DRAFT_RULE_VERSION = 'handlarborsen-paper-drafts-1.0.0'

/** Display data only. These kinds are deliberately separate from ActionKind. */
export interface PaperWorkflowDraftV1 {
  schemaVersion: 1
  id: string
  ruleVersion: typeof PAPER_WORKFLOW_DRAFT_RULE_VERSION
  kind: 'review_company_status' | 'check_bid_activity' | 'review_data_quality'
  projectId: typeof HANDLARBORSEN_PROJECT_ID
  status: 'preview_only' | 'blocked'
  executable: false
  sourceSnapshotDate: string | null
  observedAt: string | null
  sourceInsightId: string
  evidenceSummary: string
  evidenceRefs: string[]
  evidence: HandlarborsenEvidence[]
  objective: string
  humanChecklist: string[]
  blockers: string[]
}

/** Pure, bounded paper proposals from evaluated P0 facts; no store or executor. */
export function deriveHandlarborsenWorkflowDrafts(
  report: MarketplaceReport,
  now: Date,
): PaperWorkflowDraftV1[] {
  const { insights } = deriveHandlarborsenInsights(report, now)
  const drafts: PaperWorkflowDraftV1[] = []
  for (const insight of insights) {
    let kind: PaperWorkflowDraftV1['kind']
    let objective: string
    let humanChecklist: string[]
    if (insight.kind === 'quality') {
      kind = 'review_data_quality'
      objective = 'Granska underlagets begränsningar före nästa bedömning.'
      humanChecklist = [
        insight.nextCheck,
        'Verifiera saknade datum och mått manuellt; fyll inte luckor med noll eller antagna observationer.',
      ]
    } else if (insight.kind === 'proposal' && insight.rule === 'company-status') {
      kind = 'review_company_status'
      objective = 'Klargör populationen och faktiska företagsstatusar.'
      humanChecklist = [
        insight.nextCheck,
        'Kontrollera om populationen inkluderar stängda företag. Registrerade minus verifierade är inte antalet som väntar på verifiering.',
        'Dokumentera populationsdefinitionen innan någon slutsats om verifiering dras.',
      ]
    } else if (insight.kind === 'proposal' && insight.rule === 'bid-window') {
      kind = 'check_bid_activity'
      objective = 'Kontrollera budfönstrets täckning och känt publicerat utbud.'
      humanChecklist = [
        insight.nextCheck,
        'Verifiera fönstrets täckning och invänta jämförbara observationer; noll nya bud bevisar inte brist på efterfrågan.',
        'Skilj totalbud från rullande 24 h-bud. Ingen trend eller trafikorsak kan fastställas här.',
      ]
    } else continue

    // P0 permits known levels with unknown audit. Paper business proposals use a
    // stricter boundary: an unknown/failed/skipped collector is never ready.
    const audit = insight.quality.collection
    const auditConfirmed = audit?.lastAttempt?.status === 'ok' && audit.lastSuccess !== null &&
      !audit.latestAttemptFailed && audit.today !== 'failed'
    const blockers = insight.kind === 'quality'
      ? [insight.blockedReason]
      : auditConfirmed ? [] : ['Lyckad insamlingsaudit måste bekräftas innan förslaget kan bedömas.']
    const evidence = insight.evidence
    drafts.push({
      schemaVersion: 1,
      id: `${HANDLARBORSEN_PROJECT_ID}:${PAPER_WORKFLOW_DRAFT_RULE_VERSION}:${insight.id}`,
      ruleVersion: PAPER_WORKFLOW_DRAFT_RULE_VERSION,
      kind,
      projectId: HANDLARBORSEN_PROJECT_ID,
      status: blockers.length ? 'blocked' : 'preview_only',
      executable: false,
      sourceSnapshotDate: evidence[0]?.snapshotDate ?? null,
      observedAt: evidence[0]?.observedAt ?? null,
      sourceInsightId: insight.id,
      evidenceSummary: insight.kind === 'proposal'
        ? `${insight.observation} ${insight.reviewReason}` : insight.observation,
      evidenceRefs: [...new Set(evidence.map((item) => item.snapshotRef))],
      evidence,
      objective,
      humanChecklist,
      blockers,
    })
  }
  // P0 order is quality, company, bids. Explicit bounded dedup also protects
  // the paper contract if upstream rules are extended later.
  return drafts.filter((draft, index) => drafts.findIndex((item) => item.kind === draft.kind) === index).slice(0, 3)
}
