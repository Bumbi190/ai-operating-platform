/**
 * Atlas Action Center — prioriterad rekommendationsmotor.
 *
 * Gör om verkliga signaler (agentaktivitet, kostnader, leads, social,
 * möjligheter) till en rankad lista av "vad operatören bör göra härnäst".
 * Deterministisk och gratis att köra — business intelligence, inte en dashboard.
 *
 * Fas 5 (Feature 2): varje åtgärd bär nu Priority (severity), Impact,
 * Recommendation, Owner och Status. Bakåtkompatibelt — fälten är tillägg.
 */

import type { AtlasContext } from './context'
import type { AgentActivity } from './activity'
import type { SocialSummary } from './social'

export type Severity = 'critical' | 'high' | 'normal'

export interface AtlasAction {
  severity: Severity
  title: string
  why: string
  href: string
  // Fas 5 — Action Center-fält:
  impact?: string
  recommendation?: string
  owner?: string
  status?: 'open' | 'in_progress' | 'done'
}

export interface OpportunityLike {
  title: string
  rationale?: string | null
  score?: number | null
  confidence?: string | null
  type?: string | null
}

const RANK: Record<Severity, number> = { critical: 0, high: 1, normal: 2 }

export function atlasActions(
  ctx: AtlasContext,
  activity: AgentActivity,
  social: SocialSummary,
  opportunities: OpportunityLike[] = [],
): AtlasAction[] {
  const out: AtlasAction[] = []

  // Critical — saker som är aktivt trasiga.
  if (activity.runsFailed > 0) {
    out.push({
      severity: 'critical',
      title: `Undersök ${activity.runsFailed} fallerad${activity.runsFailed === 1 ? ' körning' : 'a körningar'}`,
      why: 'Agentkörningar misslyckades senaste dygnet — något är trasigt eller blockerat.',
      impact: 'Pipelinen kan stanna och leveranser missas.',
      recommendation: 'Öppna Activity Center och åtgärda grundorsaken.',
      owner: 'Operator',
      status: 'open',
      href: '/atlas/activity',
    })
  }
  if (activity.stalledRuns > 0) {
    out.push({
      severity: 'critical',
      title: `${activity.stalledRuns} körning(ar) verkar hängd`,
      why: `Körningar har varit "running" i över 2 timmar — troligen fastnade.`,
      impact: 'Blockerar pipeline och drar kostnad utan resultat.',
      recommendation: 'Avbryt och kör om de hängda körningarna.',
      owner: 'Operator',
      status: 'open',
      href: '/atlas/activity',
    })
  }

  // High — beslut och intäktsblockerare.
  if (ctx.totals.pendingApprovals > 0) {
    out.push({
      severity: 'high',
      title: `Granska ${ctx.totals.pendingApprovals} väntande godkännande${ctx.totals.pendingApprovals === 1 ? '' : 'n'}`,
      why: 'Innehåll väntar på ditt beslut innan det kan publiceras.',
      impact: 'Publicering fördröjs tills du godkänner.',
      recommendation: 'Öppna godkännanden och besluta.',
      owner: 'Operator',
      status: 'open',
      href: '/approvals',
    })
  }
  for (const b of ctx.businesses) {
    if (b.qualifiedLeads > 0) {
      out.push({
        severity: 'high',
        title: `Konvertera ${b.qualifiedLeads} leads i ${b.name}`,
        why: 'Kvalificerade leads ligger obearbetade — konvertering ger avkastning före nya kampanjer.',
        impact: 'Direkt intäktspotential som svalnar för varje dag.',
        recommendation: 'Bearbeta leadsen nu.',
        owner: b.name,
        status: 'open',
        href: '/revenue',
      })
    }
  }

  // Möjligheter (Fas 4a) → åtgärder. Höga om hög konfidens.
  for (const o of opportunities.slice(0, 4)) {
    out.push({
      severity: o.confidence === 'high' ? 'high' : 'normal',
      title: o.title,
      why: o.rationale ?? 'Upptäckt möjlighet ur datan.',
      impact: o.type === 'content_topic' ? 'Bättre innehållsval höjer engagemang.' : 'Möjlig förbättring.',
      recommendation: o.title,
      owner: 'Atlas',
      status: 'open',
      href: '/atlas/actions',
    })
  }

  // Normal — effektivitet & intelligens-luckor.
  for (const b of ctx.businesses) {
    if (b.costMonthSek > 0 && b.revenueMonthSek === 0) {
      out.push({
        severity: 'normal',
        title: `${b.name}: kostnad utan registrerad intäkt`,
        why: `${Math.round(b.costMonthSek)} kr i AI-kostnad denna månad men 0 kr intäkt — koppla en intäktskälla så ROI blir mätbar.`,
        impact: 'ROI kan inte mätas — du flyger blind på lönsamhet.',
        recommendation: 'Koppla intäkts-ingestion (Stripe → revenue_events).',
        owner: b.name,
        status: 'open',
        href: '/revenue',
      })
    }
  }
  if (!social.hasData) {
    out.push({
      severity: 'normal',
      title: 'Koppla Meta-insights för social analys',
      why: 'Atlas kan inte se räckvidd, sparningar eller följartillväxt förrän Instagram-insights flödar in.',
      impact: 'Tillväxtanalys ofullständig.',
      recommendation: 'Återanslut Meta-behörigheter / insights-scope.',
      owner: 'Operator',
      status: 'open',
      href: '/atlas/activity',
    })
  }

  out.sort((a, b) => RANK[a.severity] - RANK[b.severity])

  if (out.length === 0) {
    out.push({
      severity: 'normal', title: 'Allt nominellt',
      why: 'Inget kräver din uppmärksamhet just nu. Bra läge att planera nästa drag.',
      impact: '—', recommendation: 'Planera nästa drag.', owner: 'Operator', status: 'open',
      href: '/manager',
    })
  }
  return out
}
