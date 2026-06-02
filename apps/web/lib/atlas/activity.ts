/**
 * Atlas — agent activity + monitor + health (reuse model).
 *
 * "Vad gör agenterna?" — härlett ur runs + cost_events, som redan fångar
 * status/timing och per-anrop agent/kostnad. INGEN ny agent_events-tabell.
 *
 * Fas 5 utökar detta (utan ny datamodell) med Agent Monitor + Health:
 *   - körningar: klara / kö / pågår / fallerade / stalled
 *   - success rate, per-agent senaste aktivitet + kostnad
 *   - hälsopoäng: healthy | warning | critical
 */

type AnyDb = any

export type AgentHealth = 'healthy' | 'warning' | 'critical'

export interface AgentStat {
  agent: string
  calls: number
  costSek: number
  lastSeen: string | null
}

export interface AgentActivity {
  sinceHours: number
  runsDone: number
  runsFailed: number
  runsRunning: number
  runsQueued: number
  stalledRuns: number      // pågår > STALL_HOURS → troligen hängd
  successRate: number      // 0-100 (done / (done+failed)); 100 om inga avslut
  health: AgentHealth
  totalCostSek: number
  byAgent: AgentStat[]
}

const STALL_HOURS = 2

export async function agentActivity(db: AnyDb, sinceHours = 24): Promise<AgentActivity> {
  const since = new Date(Date.now() - sinceHours * 3600_000).toISOString()
  const safe = async <T>(p: Promise<{ data: T | null }>, fb: T): Promise<T> => {
    try { const { data } = await p; return data ?? fb } catch { return fb }
  }

  const [runs, costs] = await Promise.all([
    safe<any[]>(db.from('runs').select('status, started_at').gte('started_at', since), []),
    safe<any[]>(db.from('cost_events').select('agent, cost_sek, created_at').gte('created_at', since), []),
  ])

  let runsDone = 0, runsFailed = 0, runsRunning = 0, runsQueued = 0, stalledRuns = 0
  const stallCutoff = Date.now() - STALL_HOURS * 3600_000
  for (const r of runs) {
    const s = String(r.status)
    if (s === 'done') runsDone++
    else if (s === 'failed') runsFailed++
    else if (s === 'running') {
      runsRunning++
      if (r.started_at && new Date(r.started_at).getTime() < stallCutoff) stalledRuns++
    } else if (s === 'pending') runsQueued++
  }

  const finished = runsDone + runsFailed
  const successRate = finished > 0 ? Math.round((runsDone / finished) * 100) : 100

  // Hälsa: trasigt > varning > ok.
  let health: AgentHealth = 'healthy'
  if (runsFailed > 0 || stalledRuns > 0) health = 'critical'
  else if (finished > 0 && successRate < 80) health = 'warning'

  let totalCostSek = 0
  const agentMap = new Map<string, { calls: number; costSek: number; lastSeen: string | null }>()
  for (const c of costs) {
    const sek = Number(c.cost_sek ?? 0)
    totalCostSek += sek
    const key = c.agent ?? 'Okänd agent'
    const a = agentMap.get(key) ?? { calls: 0, costSek: 0, lastSeen: null }
    a.calls++; a.costSek += sek
    if (c.created_at && (!a.lastSeen || c.created_at > a.lastSeen)) a.lastSeen = c.created_at
    agentMap.set(key, a)
  }

  return {
    sinceHours, runsDone, runsFailed, runsRunning, runsQueued, stalledRuns, successRate, health, totalCostSek,
    byAgent: [...agentMap.entries()]
      .map(([agent, v]) => ({ agent, ...v }))
      .sort((a, b) => b.costSek - a.costSek),
  }
}
