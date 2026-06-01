/**
 * lib/os/patterns.ts
 *
 * Operativt minne (V3, Feature 6).
 *
 * Assistenten "minns" hur verksamheterna och operatören faktiskt beter sig —
 * men istället för att hitta på mönster HÄRLEDER vi dem ur riktig data
 * (godkännandetempo, vilken verksamhet som är mest aktiv, vad varje projekt
 * främst producerar). Sammanfattningen matas in i assistentens systemprompt
 * så rekommendationerna blir vassare och mer personliga.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface OperatorPatterns {
  summary: string        // klar för att injiceras i en systemprompt
  patterns: string[]     // enskilda observationer
}

function rows<T>(res: PromiseSettledResult<{ data: T[] | null }>): T[] {
  return res.status === 'fulfilled' ? ((res.value as any).data ?? []) : []
}

export async function fetchOperatorPatterns(admin: SupabaseClient): Promise<OperatorPatterns> {
  const [projectsRes, approvalsRes, runsRes, scriptsRes, newsRes] = await Promise.allSettled([
    (admin.from('projects') as any).select('id, name'),
    (admin.from('approvals') as any)
      .select('status, created_at, reviewed_at').not('reviewed_at', 'is', null).limit(200),
    (admin.from('runs') as any).select('project_id, created_at').limit(500),
    (admin.from('media_scripts') as any).select('project_id').limit(500),
    (admin.from('media_news_items') as any).select('project_id').limit(500),
  ])

  const projects = rows<{ id: string; name: string }>(projectsRes)
  const approvals = rows<{ status: string; created_at: string; reviewed_at: string }>(approvalsRes)
  const runs = rows<{ project_id: string; created_at: string }>(runsRes)
  const scripts = rows<{ project_id: string }>(scriptsRes)
  const news = rows<{ project_id: string }>(newsRes)

  const nameOf = (id: string) => projects.find(p => p.id === id)?.name ?? 'okänd verksamhet'
  const patterns: string[] = []

  // 1. Godkännandetempo
  if (approvals.length >= 3) {
    const hours = approvals
      .map(a => (new Date(a.reviewed_at).getTime() - new Date(a.created_at).getTime()) / 3_600_000)
      .filter(h => h >= 0 && h < 24 * 30)
    if (hours.length) {
      const avg = hours.reduce((a, b) => a + b, 0) / hours.length
      if (avg < 6) patterns.push(`Andre godkänner oftast innehåll snabbt (snitt ~${avg < 1 ? 'under en timme' : Math.round(avg) + ' h'}).`)
      else if (avg < 48) patterns.push(`Andre granskar innehåll inom ungefär ${Math.round(avg)} timmar.`)
      else patterns.push('Godkännanden tenderar att bli liggande — påminn vänligt om de väntat länge.')
      const rejected = approvals.filter(a => a.status === 'rejected' || a.status === 'revised').length
      if (rejected / approvals.length > 0.3) patterns.push('En del innehåll revideras — var noga med kvalitet innan du föreslår publicering.')
    }
  }

  // 2. Mest aktiva verksamheten
  if (runs.length) {
    const byProject = new Map<string, number>()
    for (const r of runs) byProject.set(r.project_id, (byProject.get(r.project_id) ?? 0) + 1)
    const top = [...byProject.entries()].sort((a, b) => b[1] - a[1])[0]
    if (top) patterns.push(`${nameOf(top[0])} är den mest aktiva verksamheten just nu.`)
  }

  // 3. Innehållsfokus per verksamhet
  const focus = new Map<string, { scripts: number; news: number }>()
  for (const s of scripts) { const f = focus.get(s.project_id) ?? { scripts: 0, news: 0 }; f.scripts++; focus.set(s.project_id, f) }
  for (const n of news)    { const f = focus.get(n.project_id) ?? { scripts: 0, news: 0 }; f.news++; focus.set(n.project_id, f) }
  for (const [pid, f] of focus) {
    if (f.scripts + f.news < 3) continue
    patterns.push(`${nameOf(pid)} fokuserar främst på ${f.scripts >= f.news ? 'innehållsproduktion och publicering' : 'nyhetsbevakning'}.`)
  }

  const summary = patterns.length
    ? `Vad du vet om operatören och verksamheterna (operativt minne):\n- ${patterns.join('\n- ')}`
    : ''

  return { summary, patterns }
}
