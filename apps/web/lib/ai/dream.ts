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
import { deriveIssueId, normSeverity } from '@/lib/atlas/dream'
import type { DreamSeverity } from '@/lib/atlas/dream'
import { isMemoryEnabled, recordMemoryEvent } from '@/lib/atlas/memory/record-event'
import { getAnthropic } from '@/lib/ai/anthropic'
import { PLATFORM_COMPAT_PROJECT } from '@/lib/cost/governed-spend'
import type { ExecutionContract } from '@/lib/governance/execution-stop'

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
      "issue_id": "<stabil_slug_för_problemet>",
      "value": "<konkret insikt på en mening>",
      "severity": "info | warning | critical",
      "action": "<specifik förbättringsåtgärd>"
    }
  ],

VIKTIGT om issue_id: det är en STABIL identitet för det underliggande problemet (en kort snake_case-slug utan datum, t.ex. "alerting_missing", "step_logs_missing", "ig_self_account_id"). Om ett problem är SAMMA som ett tidigare (se listan KÄNDA ÖPPNA PROBLEM nedan) MÅSTE du återanvända exakt samma issue_id — hitta inte på en ny. Bara HELT nya problem får ett nytt issue_id. Detta gör att återkommande problem spåras som ETT ärende över tid i stället för ett nytt varje natt.

  "agent_suggestions": [
    {
      "agent_name": "<namn>",
      "suggestion": "<konkret ändring i systemprompt>"
    }
  ],
  "summary": "<2-3 meningar om hälsotillståndet>"
}`,
  config: {
    // 2000 var för snålt: när olösta insikter ackumulerades växte JSON-svaret
    // förbi taket → trunkerat svar utan avslutande ```-stängsel → parsningsfel.
    max_tokens: 4096,
    temperature: 0.3,
  },
}

/**
 * Robust extraktion av ett JSON-objekt ur ett modellsvar.
 * Hanterar: rå JSON, ```json-/```-instängslad JSON, instängsling UTAN avslutande
 * stängsel (trunkerade svar), samt inledande/avslutande prosa runt objektet.
 * Exporterad för enhetstester.
 */
export function extractJsonObject(raw: string): string {
  let s = raw.trim()

  // Strip ett inledande kodstängsel (```json / ``` / ```JSON) – även om det
  // avslutande stängslet saknas (vanligt vid trunkerade svar).
  const openFence = s.match(/^```[ \t]*[A-Za-z]*[ \t]*\r?\n?/)
  if (openFence) {
    s = s.slice(openFence[0].length)
    const close = s.lastIndexOf('```')
    if (close !== -1) s = s.slice(0, close)
    s = s.trim()
  }

  // Snäva in till det yttersta {...}-objektet om prosa finns kvar runtom.
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last > first) s = s.slice(first, last + 1)

  return s.trim()
}

// Governed per call: the boundary needs project + operation context, which a
// module-level singleton cannot carry.

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

/** One analyzer finding, after key normalization. */
interface DreamInsight { key: string; issue_id?: string; value: string; severity: string; action: string }

/** An issue this cycle actually created in the ledger. */
interface NewIssueRecord {
  id: string; slug: string; severity: DreamSeverity
  title: string; memoryKey: string; firstSeenAt: string | null
}

/** An issue whose stored severity this cycle actually changed. */
interface SeverityChangeRecord {
  id: string; slug: string; from: DreamSeverity; to: DreamSeverity
}

/** Keep a payload readable without carrying a model blob into memory. */
function clip(text: string, max = 200): string {
  const t = (text ?? '').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/**
 * Atlas Memory M4 — what a Dream cycle actually changed.
 *
 * Three reflections, all episodic, all keyed so a retry is the same event:
 *   • a new issue            → `<issue id>:first_seen`  (once per issue, ever)
 *   • a severity change      → `<issue id>:severity:<new>:<UTC date>`
 *   • the gated cycle summary→ `<project id>:<UTC date>` (one per project/day)
 *
 * The severity key carries the cycle date on purpose. Cron, a manual "Kör nu"
 * and any retry on the same UTC day collapse to one event, while a genuine later
 * transition back to a severity the issue held before stays observable — a
 * lifetime `:severity:<new>` key would silently swallow it.
 *
 * The delta is built from ledger writes that LANDED, never from model output, so
 * memory cannot claim an issue Postgres refused. A night where known issues
 * merely recur produces no event at all: not a summary, not an issue event.
 *
 * Never throws: the ledger is already committed and Dream's result must not turn
 * into a failure because a memory write did.
 */
async function recordDreamCycleMemory(
  db: ReturnType<typeof createAdminClient>,
  project: { id: string; name: string },
  cycleDate: string,
  newIssues: NewIssueRecord[],
  severityChanges: SeverityChangeRecord[],
  stats: { runsAnalyzed: number; failRatePct: number },
): Promise<void> {
  try {
    if (!isMemoryEnabled()) return
    // The gate. Recurrence-only nights — occurrences++, last_seen, restated
    // wording — are the normal case here, and they are not worth remembering.
    if (newIssues.length === 0 && severityChanges.length === 0) return

    for (const issue of newIssues) {
      await recordMemoryEvent({
        scope: 'project', eventType: 'reflection', projectId: project.id,
        entityKind: 'dream_issue', entityId: issue.id,
        source: 'dream', sourceId: `${issue.id}:first_seen`,
        subject: `Dream issue: ${issue.slug}`,
        content: `New issue "${issue.slug}" (${issue.severity}): ${clip(issue.title)}`,
        confidence: 0.50,
        structured: {
          issueId: issue.id, issueSlug: issue.slug, severity: issue.severity,
          occurrences: 1, firstSeenAt: issue.firstSeenAt, memoryKey: issue.memoryKey,
          cycleDate,
        },
      }, db)
    }

    for (const change of severityChanges) {
      await recordMemoryEvent({
        scope: 'project', eventType: 'reflection', projectId: project.id,
        entityKind: 'dream_issue', entityId: change.id,
        source: 'dream', sourceId: `${change.id}:severity:${change.to}:${cycleDate}`,
        subject: `Dream severity: ${change.slug}`,
        content: `Issue "${change.slug}" severity ${change.from} → ${change.to}`,
        confidence: 0.50,
        structured: {
          issueId: change.id, issueSlug: change.slug,
          fromSeverity: change.from, toSeverity: change.to, cycleDate,
        },
      }, db)
    }

    await recordMemoryEvent({
      scope: 'project', eventType: 'reflection', projectId: project.id,
      entityKind: 'project', entityId: project.id,
      source: 'dream', sourceId: `${project.id}:${cycleDate}`,
      subject: `Dream cycle: ${cycleDate}`,
      content:
        `Dream cycle ${cycleDate}: ${newIssues.length} new issue(s), ` +
        `${severityChanges.length} severity change(s) across ${stats.runsAnalyzed} run(s) ` +
        `(fail rate ${stats.failRatePct}%)`,
      confidence: 0.50,
      structured: {
        cycleDate,
        newIssues: newIssues.length,
        severityChanges: severityChanges.length,
        // Only what this cycle changed — never the standing issue list, and
        // never the analyzer's free text.
        issues: [
          ...newIssues.map((i) => ({ slug: i.slug, severity: i.severity, kind: 'new' as const })),
          ...severityChanges.map((c) => ({ slug: c.slug, severity: c.to, kind: 'severity' as const })),
        ],
        runsAnalyzed: stats.runsAnalyzed, failRatePct: stats.failRatePct,
      },
    }, db)
  } catch (err) {
    console.error(
      `[dream ${project.id}] cycle not recorded in memory: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/**
 * Kör en komplett dream cycle för ETT projekt. Service-role (admin) internt.
 * Kastar fel vid Claude-/parsningsfel så att anroparen kan hantera det
 * (POST → 500; cron → logga och fortsätt till nästa projekt).
 */
export async function runDreamCycleForProject(
  /** REQUIRED execution classification, propagated from the caller. */
  execution: ExecutionContract,
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

  // 3b. Kända öppna problem (dream_issues) — så analyzern återanvänder issue_id
  //     för återkommande problem i stället för att skapa ett nytt varje natt.
  const { data: knownIssues } = await db
    .from('dream_issues')
    .select('issue_id, title, severity, manager_task_id')
    .eq('project_id', project.id)
    .order('last_seen_at', { ascending: false })
    .limit(40)

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

  const knownIssuesSummary = (knownIssues ?? [])
    .map((i: any) => `  ${i.issue_id} (${i.severity ?? '?'}${i.manager_task_id ? ', delegerad' : ''}): ${i.title ?? ''}`)
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

KÄNDA ÖPPNA PROBLEM (återanvänd exakt dessa issue_id om problemet återkommer):
${knownIssuesSummary || '(inga kända problem ännu)'}

Returnera din analys som giltig JSON enligt det format du instruerats att använda.`

  // 6. Anropa Claude
  let analysisResult: {
    insights: Array<{ key: string; issue_id?: string; value: string; severity: string; action: string }>
    agent_suggestions: Array<{ agent_name: string; suggestion: string }>
    summary: string
  }

  const response = await getAnthropic({
    project: PLATFORM_COMPAT_PROJECT, execution, agent: 'Dream', operation: 'Dream Analysis',
  }).messages.create({
    model: dreamAnalyzerSkill.defaultModel,
    max_tokens: dreamAnalyzerSkill.config.max_tokens ?? 2000,
    temperature: dreamAnalyzerSkill.config.temperature ?? 0.3,
    system: dreamAnalyzerSkill.systemPrompt,
    messages: [{ role: 'user', content: analysisReport }],
  })

  const rawText = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const jsonStr = extractJsonObject(rawText)
  try {
    analysisResult = JSON.parse(jsonStr)
  } catch (err) {
    // Diagnostik vid fortsatt parsningsfel: stop_reason='max_tokens' avslöjar
    // trunkering; raw_len + startutdrag gör tysta nattliga fel synliga i loggen.
    throw new Error(
      `Dream-analys: JSON-parsning misslyckades ` +
        `(model=${dreamAnalyzerSkill.defaultModel}, stop_reason=${response.stop_reason}, ` +
        `raw_len=${rawText.length}). ${(err as Error).message}. ` +
        `Råsvar (start): ${rawText.slice(0, 160)}`,
    )
  }

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

  // Compatibility log: unchanged, one row per insight, failures only affect the
  // reported count. dream_issues below is the canonical ledger.
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

  // ── Stable issue ledger ────────────────────────────────────────────────────
  // Stamp the findings onto their stable issues. Recurring issues (same issue_id)
  // UPDATE the existing row — occurrences++ / last_seen — instead of forking a
  // new lifecycle. Lifecycle itself is NOT stored here; it is derived from the
  // linked manager_task (single source of truth), so we never touch the link.
  //
  // One mutation per issue per cycle: an analyzer answer that names the same
  // issue twice used to insert it and then immediately update it — inflating
  // occurrences and leaving "what changed tonight" ambiguous. Fold first (last
  // finding wins), then the cycle's canonical delta falls out of the writes.
  const byIssue = new Map<string, DreamInsight>()
  for (const insight of normalizedInsights) {
    const slug = ((insight as { issue_id?: string }).issue_id || '').trim() || deriveIssueId(insight.key)
    byIssue.set(slug, insight)
  }

  const cycleDate = new Date().toISOString().slice(0, 10)
  const newIssues: NewIssueRecord[] = []
  const severityChanges: SeverityChangeRecord[] = []

  for (const [slug, insight] of byIssue) {
    try {
      const { data: existing } = await db
        .from('dream_issues')
        .select('id, occurrences, severity')
        .eq('project_id', project.id)
        .eq('issue_id', slug)
        .maybeSingle()

      if (existing) {
        const row = existing as { id: string; occurrences?: number; severity?: string | null }
        const before = normSeverity(row.severity)
        const after = normSeverity(insight.severity)
        const { data: updated, error } = await db.from('dream_issues').update({
          severity: insight.severity,
          latest_insight: insight.value,
          latest_action: insight.action,
          latest_memory_key: insight.key,
          occurrences: (row.occurrences ?? 1) + 1,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', row.id).select('id, severity').maybeSingle()

        // A severity change is only real once the new value is STORED. Same
        // canonical severity, a bumped occurrence count or restated wording is
        // a recurrence, and recurrences are not remembered.
        const stored = updated as { severity?: string | null } | null
        if (!error && stored && before !== after && normSeverity(stored.severity) === after) {
          severityChanges.push({ id: row.id, slug, from: before, to: after })
        }
      } else {
        const { data: inserted, error } = await db.from('dream_issues').insert({
          project_id: project.id,
          issue_id: slug,
          title: insight.value,
          severity: insight.severity,
          latest_insight: insight.value,
          latest_action: insight.action,
          latest_memory_key: insight.key,
        }).select('id, severity, first_seen_at').single()

        // Losing the (project_id, issue_id) race means another run owns this
        // issue's first sighting: no row of ours landed, so there is nothing to
        // record and the winner's event stands alone.
        const row = inserted as { id: string; severity?: string | null; first_seen_at?: string | null } | null
        if (!error && row) {
          newIssues.push({
            id: row.id, slug, severity: normSeverity(row.severity),
            title: insight.value, memoryKey: insight.key,
            firstSeenAt: row.first_seen_at ?? null,
          })
        }
      }
    } catch { /* ledger is best-effort; memory log already persisted */ }
  }

  // Atlas Memory M4 — after the ledger committed, and only about what it stored.
  await recordDreamCycleMemory(db, project, cycleDate, newIssues, severityChanges, {
    runsAnalyzed: totalRuns, failRatePct: failRate,
  })

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
