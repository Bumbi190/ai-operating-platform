/**
 * Atlas Executive Brain.
 *
 * The business-level synthesis Atlas reasons over. Reads the Context Brain +
 * agent activity + social, and answers the four executive questions:
 *   1. What happened?  2. What did it cost?  3. What worked?  4. What to do next?
 *
 * Deterministic (free to run). Used by Atlas Home and the daily briefing.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { gatherAtlasContext } from './context'
import { agentActivity } from './activity'
import { socialSummary } from './social'
import { atlasActions, type AtlasAction } from './actions'

type AnyDb = any

export interface ExecutiveSummary {
  generatedAt: string
  whatHappened: string[]
  cost: { todaySek: number; monthSek: number; forecastSek: number }
  whatWorked: string[]
  whatToDo: AtlasAction[]
}

const k = (n: number) => `${Math.round(n)} kr`

export async function atlasExecutiveSummary(db?: AnyDb): Promise<ExecutiveSummary> {
  const adb = db ?? createAdminClient()
  const [ctx, act, soc] = await Promise.all([
    gatherAtlasContext(adb),
    agentActivity(adb, 24),
    socialSummary(adb, 7),
  ])

  // 1. What happened
  const whatHappened: string[] = []
  for (const b of ctx.businesses) {
    if (b.publishedThisWeek > 0) whatHappened.push(`${b.name} publicerade ${b.publishedThisWeek} den här veckan.`)
  }
  if (act.runsDone > 0) whatHappened.push(`${act.runsDone} agentkörningar slutfördes senaste dygnet.`)
  const leadBiz = ctx.businesses.filter(b => b.qualifiedLeads > 0)
  for (const b of leadBiz) whatHappened.push(`${b.name} har ${b.qualifiedLeads} leads att bearbeta.`)
  if (whatHappened.length === 0) whatHappened.push('Lugnt dygn — inga publiceringar eller nya leads registrerade.')

  // 3. What worked
  const whatWorked: string[] = []
  if (soc.hasData) {
    whatWorked.push(`Räckvidd ${soc.reach.toLocaleString('sv-SE')}, ${soc.saved} sparningar och ${soc.followersGained} nya följare senaste ${soc.days} dagarna.`)
  } else {
    whatWorked.push('Social prestanda inväntas — koppla Meta-insights för att se vad som funkar.')
  }
  const topRev = [...ctx.businesses].sort((a, b) => b.revenueMonthSek - a.revenueMonthSek)[0]
  if (topRev && topRev.revenueMonthSek > 0) whatWorked.push(`${topRev.name} leder på intäkt (${k(topRev.revenueMonthSek)} denna månad).`)

  return {
    generatedAt: new Date().toISOString(),
    whatHappened,
    cost: { todaySek: ctx.totals.costTodaySek, monthSek: ctx.totals.costMonthSek, forecastSek: ctx.totals.forecastMonthSek },
    whatWorked,
    whatToDo: atlasActions(ctx, act, soc),
  }
}
