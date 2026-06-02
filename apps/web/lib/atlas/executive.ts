/**
 * Atlas Executive Brain — Daily Briefing (Fas 5, Feature 1).
 *
 * Affärssyntesen Atlas resonerar kring. Läser Context Brain + agentaktivitet +
 * social + Content Score + möjligheter, och svarar på de FEM exekutiva frågorna:
 *   1. Vad hände?  2. Vad funkade?  3. Vad föll?  4. Vad kräver uppmärksamhet?
 *   5. Vad bör hända härnäst?
 *
 * Deterministisk (gratis att köra). Återanvänder befintliga tjänster — ingen ny
 * datamodell, ingen ny dashboard. Driver Atlas Home + dagliga briefingen.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { gatherAtlasContext } from './context'
import { agentActivity } from './activity'
import { socialSummary } from './social'
import { contentScore } from './content-score'
import { listOpportunities } from './opportunities'
import { revenueIntel } from './revenue'
import { atlasActions, type AtlasAction, type OpportunityLike } from './actions'

type AnyDb = any

export interface ExecutiveSummary {
  generatedAt: string
  whatHappened: string[]
  whatWorked: string[]
  whatFailed: string[]        // Fas 5
  needsAttention: string[]    // Fas 5
  cost: { todaySek: number; monthSek: number; forecastSek: number }
  whatToDo: AtlasAction[]     // "vad bör hända härnäst"
}

const k = (n: number) => `${Math.round(n)} kr`

export async function atlasExecutiveSummary(db?: AnyDb): Promise<ExecutiveSummary> {
  const adb = db ?? createAdminClient()
  const [ctx, act, soc, cs, opps, rev] = await Promise.all([
    gatherAtlasContext(adb),
    agentActivity(adb, 24),
    socialSummary(adb, 7),
    contentScore(adb).catch(() => null),
    listOpportunities(adb).catch(() => [] as any[]),
    revenueIntel(adb).catch(() => null),
  ])

  // 1. Vad hände
  const whatHappened: string[] = []
  for (const b of ctx.businesses) {
    if (b.publishedThisWeek > 0) whatHappened.push(`${b.name} publicerade ${b.publishedThisWeek} den här veckan.`)
  }
  if (act.runsDone > 0) whatHappened.push(`${act.runsDone} agentkörningar slutfördes senaste dygnet.`)
  for (const b of ctx.businesses) if (b.qualifiedLeads > 0) whatHappened.push(`${b.name} har ${b.qualifiedLeads} leads att bearbeta.`)
  if (whatHappened.length === 0) whatHappened.push('Lugnt dygn — inga publiceringar eller nya leads registrerade.')

  // 2. Vad funkade
  const whatWorked: string[] = []
  if (cs?.hasData && cs.best) {
    whatWorked.push(`Bästa innehållet: "${(cs.best.hook ?? '').slice(0, 60)}" (score ${cs.best.score}/100, ${cs.best.engagementRate}% engagemang). [n=${cs.sampleSize}, konfidens ${cs.confidence}]`)
    const top = cs.byTopic[0]
    if (top && top.posts >= 2) whatWorked.push(`Ämnet "${top.topic}" engagerar mest (snittscore ${top.avgScore}, n=${top.posts}).`)
  }
  if (soc.hasData) {
    whatWorked.push(`Räckvidd ${soc.reach.toLocaleString('sv-SE')}, ${soc.saved} sparningar och ${soc.followersGained} nya följare senaste ${soc.days} dagarna.`)
  } else if (!cs?.hasData) {
    whatWorked.push('Social prestanda inväntas — för få datapunkter för en slutsats ännu.')
  }
  const topRev = [...ctx.businesses].sort((a, b) => b.revenueMonthSek - a.revenueMonthSek)[0]
  if (topRev && topRev.revenueMonthSek > 0) whatWorked.push(`${topRev.name} leder på intäkt (${k(topRev.revenueMonthSek)} denna månad).`)
  if (rev?.hasData) {
    whatWorked.push(`Familje-Stunden: ${rev.activeSubscribers} aktiva prenumeranter, MRR ${k(rev.mrrSek)}${rev.mrrDeltaSek ? ` (${rev.mrrDeltaSek > 0 ? '+' : ''}${k(rev.mrrDeltaSek)})` : ''}, churn ${rev.churnRatePct}%.`)
    if (rev.newSubscribers > 0) whatHappened.push(`Familje-Stunden fick ${rev.newSubscribers} ny${rev.newSubscribers === 1 ? ' prenumerant' : 'a prenumeranter'} denna månad.`)
  }

  // 3. Vad föll
  const whatFailed: string[] = []
  if (act.runsFailed > 0) whatFailed.push(`${act.runsFailed} agentkörning(ar) misslyckades (success rate ${act.successRate}%).`)
  if (act.stalledRuns > 0) whatFailed.push(`${act.stalledRuns} körning(ar) verkar hängd (>2h i "running").`)
  if (whatFailed.length === 0) whatFailed.push('Inga kritiska fel upptäckta. Pipeline frisk.')

  // 4. Vad kräver uppmärksamhet
  const needsAttention: string[] = []
  if (ctx.totals.pendingApprovals > 0) needsAttention.push(`${ctx.totals.pendingApprovals} godkännande(n) väntar på beslut.`)
  for (const b of ctx.businesses) {
    if (b.costMonthSek > 0 && b.revenueMonthSek === 0) needsAttention.push(`${b.name}: ${k(b.costMonthSek)} kostnad men 0 kr intäkt — ROI omätbar tills intäkt kopplas.`)
  }
  if (!soc.hasData) needsAttention.push('Meta-insights saknas → tillväxtanalys ofullständig.')
  if (Array.isArray(opps) && opps[0]) needsAttention.push(`Möjlighet: ${opps[0].title}`)
  if (needsAttention.length === 0) needsAttention.push('Inget akut. Bra läge att planera nästa drag.')

  return {
    generatedAt: new Date().toISOString(),
    whatHappened,
    whatWorked,
    whatFailed,
    needsAttention,
    cost: { todaySek: ctx.totals.costTodaySek, monthSek: ctx.totals.costMonthSek, forecastSek: ctx.totals.forecastMonthSek },
    whatToDo: atlasActions(ctx, act, soc, (opps ?? []) as OpportunityLike[]),
  }
}
