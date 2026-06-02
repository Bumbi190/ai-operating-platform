/**
 * Atlas Action Center — prioritized recommendations engine.
 *
 * Turns real signals (agent activity, costs, leads, social) into a ranked list
 * of "what the operator should do next". Deterministic and free to run — this
 * is business intelligence, not a dashboard. Reuses the Context Brain output.
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
}

const RANK: Record<Severity, number> = { critical: 0, high: 1, normal: 2 }

export function atlasActions(ctx: AtlasContext, activity: AgentActivity, social: SocialSummary): AtlasAction[] {
  const out: AtlasAction[] = []

  // Critical — things actively broken.
  if (activity.runsFailed > 0) {
    out.push({
      severity: 'critical',
      title: `Undersök ${activity.runsFailed} fallerad${activity.runsFailed === 1 ? ' körning' : 'a körningar'}`,
      why: 'Agentkörningar misslyckades senaste dygnet — något är trasigt eller blockerat.',
      href: '/atlas/activity',
    })
  }

  // High — decisions and revenue blockers.
  if (ctx.totals.pendingApprovals > 0) {
    out.push({
      severity: 'high',
      title: `Granska ${ctx.totals.pendingApprovals} väntande godkännande${ctx.totals.pendingApprovals === 1 ? '' : 'n'}`,
      why: 'Innehåll väntar på ditt beslut innan det kan publiceras.',
      href: '/approvals',
    })
  }
  for (const b of ctx.businesses) {
    if (b.qualifiedLeads > 0) {
      out.push({
        severity: 'high',
        title: `Konvertera ${b.qualifiedLeads} leads i ${b.name}`,
        why: 'Kvalificerade leads ligger obearbetade — konvertering ger avkastning före nya kampanjer.',
        href: '/revenue',
      })
    }
  }

  // Normal — efficiency & intelligence gaps.
  for (const b of ctx.businesses) {
    if (b.costMonthSek > 0 && b.revenueMonthSek === 0) {
      out.push({
        severity: 'normal',
        title: `${b.name}: kostnad utan registrerad intäkt`,
        why: `${Math.round(b.costMonthSek)} kr i AI-kostnad denna månad men 0 kr intäkt — koppla en intäktskälla så ROI blir mätbar.`,
        href: '/revenue',
      })
    }
  }
  if (!social.hasData) {
    out.push({
      severity: 'normal',
      title: 'Koppla Meta-insights för social analys',
      why: 'Atlas kan inte se räckvidd, sparningar eller följartillväxt förrän Instagram-insights flödar in.',
      href: '/atlas/activity',
    })
  } else if (social.topPosts.length > 0) {
    out.push({
      severity: 'normal',
      title: `Dubbla ner på det som presterar`,
      why: `Bästa inlägget nådde ${social.topPosts[0].reach.toLocaleString('sv-SE')} — gör mer av det formatet.`,
      href: '/atlas/activity',
    })
  }

  out.sort((a, b) => RANK[a.severity] - RANK[b.severity])

  if (out.length === 0) {
    out.push({ severity: 'normal', title: 'Allt nominellt', why: 'Inget kräver din uppmärksamhet just nu. Bra läge att planera nästa drag.', href: '/manager' })
  }
  return out
}
