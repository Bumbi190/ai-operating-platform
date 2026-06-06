/**
 * lib/ai/dream.ts
 *
 * Dream Cycle — nattlig självförbättring. Delad kärnlogik så att BÅDE
 *   - "Kör nu"-knappen (POST /api/projects/[slug]/dream), och
 *   - det nattliga cron-jobbet (GET /api/media/cron/dream)
 * använder exakt samma analys. Ingen logik duplicerad.
 *
 * Hämtar senaste körningarna (24h) + run_logs + befintliga minnen, bygger en
 * analysrapport, anropar Claude (DreamAnalyzer) och upsertar insikterna i
 * memories-tabellen (source = 'dream', nyckel-prefix 'dream_').
 */

import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'

// DreamAnalyzer skill — inline för att undvika paketimport-komplexitet
const dreamAnalyzerSkill = {
  defaultModel: 'claude-sonnet-4-6',
  systemPrompt: `Du är en meta-analytiker som granskar AI-agenters körningar.
Din uppgift är att hitta mönster, identifiera problem och föreslå förbättringar.

Analysera alltid:
1. Vilka steg som misslyckas ofta och varför
2. Vilka inputs som leder till dåliga outputs
3. Vilka steg som tar onödigt lång tid (>10s)
4. Vad som fungerar bra och bör behållas

Format: Returnera alltid giltig JSON med denna struktur:
{
  "insights": [
    {
      "key": "dream_<datum>_<kategori>",
      "value": "<konkret insikt på en mening>",
      "severity": "info | warning | critical",
      "action": "<specifik förbättringsåtgärd>"
    }
  ],
  "agent_suggestions": [
    {
      "agent_name": "<namn>",
      "suggestion": "<konkret ändring i systemprompt>"
    }
  ],
  "summary": "<2-3 meningar om hälsotillståndet>"
}`,
  config: {
    max_tokens: 2000,
    temperature: 0.3,
  },
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Max antal insikter per projekt — gamla rensas vid upsert
const MAX_INSIGHTS = 20

export interface DreamResult {
  /** false = hoppades över (inga körningar att analysera). */
  ran: boolean
  insights_saved: number
  summary: string
  agent_suggestions?: Array<{ agent_name: string; suggestion: string }>
  stats?: {
    total_runs: number
    successful: number
    failed: number
    fail_rate_pct: number
  }
}

/**
 * Kör en komplett dream cycle för ETT projekt. Service-role (admin) internt.
 * Kastar fel vid Claude-/parsningsfel så att anroparen kan hantera det
 * (POST → 500; cron → logga och fortsätt till nästa projekt).
 */
export async function runDreamCycleForProject(
  project: { id: string; name: string },
): Promise<DreamResult> {
  const db = createAdminClient()

  // 1. Senaste körningarna (24h, max 50)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: runs } = await db
    .from('runs')
    .select('id, status, error, created_at, finished_at, started_at, workflows(name)')
    .eq('project_id', project.id)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50)

  if (!runs || runs.length === 0) {
    return { ran: false, insights_saved: 0, summary: 'Inga körningar att analysera.' }
  }

  // 2. run_logs för körningarna (assistant-rader för statistik)
  const runIds = runs.map(r => r.id)
  const { data: allLogs } = await db
    .from('run_logs')
    .select('run_id, step_name, role, tokens_in, tokens_out, duration_ms, content')
    .in('run_id', runIds)
    .eq('role', 'assistant')

  // 3. Befintliga minnen
  const { data: existingMemories } = await db
    .from('memories')
    .select('key, value')
    .eq('project_id', project.id)
    .order('updated_at', { ascending: false })
    .limit(30)

  // 4. Statistik per steg
  const stepStats: Record<string, {
    count: number
    failures: number
    totalDurationMs: number
    totalTokensIn: number
    totalTokensOut: number
    errors: string[]
  }> = {}

  const totalRuns = runs.length
  const successfulRuns = runs.filter(r => r.status === 'done').length
  const failedRuns = runs.filter(r => r.status === 'failed').length

  for (const log of allLogs ?? []) {
    const key = log.step_name ?? 'okänt steg'
    if (!stepStats[key]) {
      stepStats[key] = { count: 0, failures: 0, totalDurationMs: 0, totalTokensIn: 0, totalTokensOut: 0, errors: [] }
    }
    stepStats[key].count++
    stepStats[key].totalDurationMs += log.duration_ms ?? 0
    stepStats[key].totalTokensIn += log.tokens_in ?? 0
    stepStats[key].totalTokensOut += log.tokens_out ?? 0
  }

  const recentFailures = runs.filter(r => r.status === 'failed' && r.error).slice(0, 5)

  // 5. Bygg analysrapport
  const dateStr = new Date().toLocaleDateString('sv-SE')
  const failRate = totalRuns > 0 ? Math.round((failedRuns / totalRuns) * 100) : 0

  const stepAnalysis = Object.entries(stepStats)
    .map(([name, s]) => {
      const avgTime = s.count > 0 ? Math.round(s.totalDurationMs / s.count) : 0
      const avgTokensIn = s.count > 0 ? Math.round(s.totalTokensIn / s.count) : 0
      const avgTokensOut = s.count > 0 ? Math.round(s.totalTokensOut / s.count) : 0
      return `- Steg: "${name}"
  - Körningar: ${s.count}
  - Medeltid: ${avgTime}ms
  - Snitt tokens: ${avgTokensIn} in / ${avgTokensOut} ut`
    })
    .join('\n')

  const failuresList = recentFailures
    .map(r => {
      const workflow = Array.isArray(r.workflows) ? r.workflows[0] : r.workflows
      return `  [${r.id.slice(0, 8)}]: ${r.error} (workflow: ${workflow?.name ?? '?'})`
    })
    .join('\n')

  const memorySummary = (existingMemories ?? [])
    .slice(0, 10)
    .map(m => `  ${m.key}: ${m.value}`)
    .join('\n')

  const analysisReport = `Analysera följande körningsdata för projektet "${project.name}" (${dateStr}):

KÖRNINGSSTATISTIK (senaste 24h):
- Totalt: ${totalRuns} körningar, ${successfulRuns} lyckade, ${failedRuns} misslyckade
- Misslyckanderate: ${failRate}%

STEG-ANALYS:
${stepAnalysis || '(inga steg-loggar tillgängliga)'}

SENASTE MISSLYCKANDEN (max 5):
${failuresList || '(inga misslyckanden)'}

NUVARANDE MINNEN (befintlig kontext):
${memorySummary || '(inga sparade minnen)'}

Returnera din analys som giltig JSON enligt det format du instruerats att använda.`

  // 6. Anropa Claude
  let analysisResult: {
    insights: Array<{ key: string; value: string; severity: string; action: string }>
    agent_suggestions: Array<{ agent_name: string; suggestion: string }>
    summary: string
  }

  const response = await anthropic.messages.create({
    model: dreamAnalyzerSkill.defaultModel,
    max_tokens: dreamAnalyzerSkill.config.max_tokens ?? 2000,
    temperature: dreamAnalyzerSkill.config.temperature ?? 0.3,
    system: dreamAnalyzerSkill.systemPrompt,
    messages: [{ role: 'user', content: analysisReport }],
  })

  const rawText = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawText.trim()
  analysisResult = JSON.parse(jsonStr) // kastar vid ogiltig JSON → anroparen hanterar

  // 7. Upserta insikter
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const insights = (analysisResult.insights ?? []).slice(0, MAX_INSIGHTS)

  const normalizedInsights = insights.map(insight => ({
    ...insight,
    key: insight.key.startsWith('dream_') ? insight.key : `dream_${today}_${insight.key}`,
  }))

  // Rensa gamla dream-insikter om vi överskrider MAX_INSIGHTS
  const { data: existingDreamMemories } = await db
    .from('memories')
    .select('id, key')
    .eq('project_id', project.id)
    .like('key', 'dream_%')
    .order('updated_at', { ascending: true })

  const existingCount = existingDreamMemories?.length ?? 0
  const toDelete = existingCount + normalizedInsights.length - MAX_INSIGHTS
  if (toDelete > 0 && existingDreamMemories && existingDreamMemories.length > 0) {
    const idsToDelete = existingDreamMemories.slice(0, toDelete).map(m => m.id)
    await db.from('memories').delete().in('id', idsToDelete)
  }

  let savedCount = 0
  for (const insight of normalizedInsights) {
    const { error } = await db.from('memories').upsert(
      {
        project_id: project.id,
        key: insight.key,
        value: `[${insight.severity.toUpperCase()}] ${insight.value} → ${insight.action}`,
        source: 'dream',
      },
      { onConflict: 'project_id,key' },
    )
    if (!error) savedCount++
  }

  return {
    ran: true,
    insights_saved: savedCount,
    summary: analysisResult.summary,
    agent_suggestions: analysisResult.agent_suggestions ?? [],
    stats: {
      total_runs: totalRuns,
      successful: successfulRuns,
      failed: failedRuns,
      fail_rate_pct: failRate,
    },
  }
}
