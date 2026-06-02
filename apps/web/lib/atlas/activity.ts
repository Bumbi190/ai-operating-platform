/**
 * Atlas — agent activity (reuse model).
 *
 * "What did the agents do?" — derived from runs + cost_events, which already
 * capture status/timing and per-call agent/cost. No separate agent_events table.
 */

type AnyDb = any

export interface AgentActivity {
  sinceHours: number
  runsDone: number
  runsFailed: number
  runsRunning: number
  totalCostSek: number
  byAgent: { agent: string; calls: number; costSek: number }[]
}

export async function agentActivity(db: AnyDb, sinceHours = 24): Promise<AgentActivity> {
  const since = new Date(Date.now() - sinceHours * 3600_000).toISOString()
  const safe = async <T>(p: Promise<{ data: T | null }>, fb: T): Promise<T> => {
    try { const { data } = await p; return data ?? fb } catch { return fb }
  }

  const [runs, costs] = await Promise.all([
    safe<any[]>(db.from('runs').select('status').gte('started_at', since), []),
    safe<any[]>(db.from('cost_events').select('agent, cost_sek').gte('created_at', since), []),
  ])

  let runsDone = 0, runsFailed = 0, runsRunning = 0
  for (const r of runs) {
    const s = String(r.status)
    if (s === 'done') runsDone++
    else if (s === 'failed') runsFailed++
    else if (['running', 'pending'].includes(s)) runsRunning++
  }

  let totalCostSek = 0
  const agentMap = new Map<string, { calls: number; costSek: number }>()
  for (const c of costs) {
    const sek = Number(c.cost_sek ?? 0)
    totalCostSek += sek
    const key = c.agent ?? 'Okänd agent'
    const a = agentMap.get(key) ?? { calls: 0, costSek: 0 }
    a.calls++; a.costSek += sek
    agentMap.set(key, a)
  }

  return {
    sinceHours, runsDone, runsFailed, runsRunning, totalCostSek,
    byAgent: [...agentMap.entries()].map(([agent, v]) => ({ agent, ...v })).sort((a, b) => b.costSek - a.costSek),
  }
}
