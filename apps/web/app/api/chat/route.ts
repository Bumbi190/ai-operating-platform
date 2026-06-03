/**
 * POST /api/chat
 *
 * Streaming chat endpoint with Claude + tool use.
 * Claude knows about the user's workflows and can trigger them.
 *
 * Tools available to Claude:
 *   - list_workflows: list all workflows for the user
 *   - trigger_workflow: start a workflow run
 *   - get_run_status: poll a run for completion + output
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getManager } from '@/lib/ai/manager'
import { fetchOperatorPatterns } from '@/lib/os/patterns'
import { buildAtlasSystemPrompt } from '@/lib/atlas/identity'
import { gatherAtlasContext } from '@/lib/atlas/context'
import { contentScore } from '@/lib/atlas/content-score'
import { listOpportunities } from '@/lib/atlas/opportunities'
import { agentActivity } from '@/lib/atlas/activity'
import { revenueIntel } from '@/lib/atlas/revenue'
import type { WorkflowStep } from '@/lib/supabase/types'

// ── Fas 5: cachad live-snapshot (Atlas Brain + Content/Opportunity/Agent) ──────
// Multi-turn röstsamtal hämtade om ~12 DB-frågor PER tur → stor latens. Vi cachar
// den sammansatta kontext-strängen kort så turer 2+ blir nära momentana.
let _liveCtxCache: { at: number; text: string } | null = null
const LIVE_CTX_TTL_MS = 45_000

async function buildLiveContext(db: ReturnType<typeof createAdminClient>): Promise<string> {
  if (_liveCtxCache && Date.now() - _liveCtxCache.at < LIVE_CTX_TTL_MS) return _liveCtxCache.text
  const k = (n: number) => `${Math.round(n)} kr`
  const [ctxR, patR, csR, oppR, actR, revR] = await Promise.allSettled([
    gatherAtlasContext(db),
    fetchOperatorPatterns(db),
    contentScore(db),
    listOpportunities(db),
    agentActivity(db, 24),
    revenueIntel(db),
  ])

  let text = ''
  if (ctxR.status === 'fulfilled') {
    const ctx = ctxR.value
    text += `\n\n[LIVE LÄGE — ${new Date().toLocaleString('sv-SE')}]
Kostnad idag: ${k(ctx.totals.costTodaySek)} · denna månad: ${k(ctx.totals.costMonthSek)} (prognos ${k(ctx.totals.forecastMonthSek)}).
Intäkt denna månad: ${k(ctx.totals.revenueMonthSek)}. Väntande godkännanden: ${ctx.totals.pendingApprovals}. Fallerade körningar (24h): ${ctx.totals.failedRuns24h}.
Verksamheter:
${ctx.businesses.map(b => `- ${b.name}: intäkt ${k(b.revenueMonthSek)}, kostnad ${k(b.costMonthSek)}, ${b.qualifiedLeads} leads, ${b.publishedThisWeek} publicerat denna vecka, ${b.pendingReview} att granska.`).join('\n')}${ctx.topPriority ? `\nViktigaste åtgärden nu: ${ctx.topPriority.label}.` : ''}`
  }
  if (actR.status === 'fulfilled') {
    const a = actR.value
    text += `\n\nAGENTER (24h): ${a.runsDone} klara · ${a.runsRunning} pågår · ${a.runsQueued} i kö · ${a.runsFailed} fallerade${a.stalledRuns ? ` · ${a.stalledRuns} hängda` : ''}. Success rate ${a.successRate}%. Hälsa: ${a.health}.`
  }
  if (csR.status === 'fulfilled' && csR.value.hasData) {
    const cs = csR.value
    text += `\n\nINNEHÅLLSPRESTANDA (The Prompt · n=${cs.sampleSize} · konfidens ${cs.confidence}):`
    if (cs.best)  text += `\n- Bäst: "${(cs.best.hook ?? '').slice(0, 55)}" (score ${cs.best.score}, ${cs.best.engagementRate}% eng).`
    if (cs.worst) text += `\n- Sämst: "${(cs.worst.hook ?? '').slice(0, 55)}" (score ${cs.worst.score}).`
    const top = cs.byTopic[0]
    if (top && top.posts >= 2) text += `\n- Ämne som engagerar mest: ${top.topic} (snittscore ${top.avgScore}, n=${top.posts}).`
    text += `\nOBS: säg "för lite data för säker slutsats" om n är litet — hitta aldrig på siffror.`
  }
  if (revR.status === 'fulfilled' && revR.value.hasData) {
    const r = revR.value
    text += `\n\nFAMILJE-STUNDEN INTÄKT (Stripe, per ${r.asOf}): ${r.activeSubscribers} aktiva prenumeranter · MRR ${Math.round(r.mrrSek)} kr${r.mrrDeltaSek ? ` (Δ ${r.mrrDeltaSek > 0 ? '+' : ''}${Math.round(r.mrrDeltaSek)} kr)` : ''} · ${r.newSubscribers} nya denna månad · ${r.trialing} trial · churn ${r.churnRatePct}% · intäkt denna månad ${Math.round(r.revenueMonthSek)} kr.`
  }
  if (oppR.status === 'fulfilled' && oppR.value.length) {
    text += `\n\nÖPPNA MÖJLIGHETER:`
    for (const o of (oppR.value as any[]).slice(0, 3)) text += `\n- [${o.confidence}] ${o.title}`
  }
  if (patR.status === 'fulfilled' && patR.value?.summary) text += `\n\n${patR.value.summary}`

  _liveCtxCache = { at: Date.now(), text }
  return text
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60   // cap så en hängd körning aldrig låser requesten för evigt

// ── FAST PATH ─────────────────────────────────────────────────────────────────
// Rena innehållsuppgifter ("skriv en Facebook-post") ska INTE dra igång Executive
// Brain, verktyg eller workflows. De går direkt till LLM och streamar omedelbart.
const FAST_PATH_SYSTEM = `Du är en skicklig copywriter för Omnira. Skriv det som efterfrågas — direkt, färdigt och i rätt ton för kanalen. Ingen meta-text, inga frågor tillbaka, inga verktyg. Svara på operatörens språk (svenska om inget annat anges). Håll det publiceringsklart.`

// ── INTENT CLASSIFIER ─────────────────────────────────────────────────────────
// Avgör FAST PATH (ren skriv-/text-uppgift → direkt LLM) vs EXECUTIVE (verksamhet
// → Executive Brain + verktyg). FAST PATH vinner bara om inget "systemy" finns med.
function isFastPathContent(text: string): boolean {
  const t = (text || '').toLowerCase().trim()
  if (t.length > 800) return false   // långa/komplexa briefs → executive

  // EXECUTIVE-signaler vinner alltid (status, analys, publicering, workflow, agenter, affär).
  const executive = /\b(workflow|arbetsflöde|\bkör\b|starta|publicera|publish|kampanj|pipeline|status|kostnad|intäkt|mrr|prenumer|churn|hur (går|mår|presterar)|analys|analysera|rapport|prioriter|opportunit|möjlighet|agent|render|deploy)\b/.test(t)
  if (executive) return false

  // Fristående skriv-/redigeringsåtgärder (inget objekt krävs).
  const standalone = /\b(sammanfatta|summera|summarize|förbättra|improve|skriv om|omformulera|korta ner|översätt|translate|brainstorm(a)?|ge mig (idéer|förslag)|fler idéer)\b/.test(t)

  // Skriv-verb + innehålls-objekt.
  const writeVerb = /\b(skriv|generera|formulera|utkast|skapa|gör|ge mig|föreslå|ta fram)\b/.test(t)
  const contentNoun = /\b(post|inlägg|caption|bildtext|blogg|blogginlägg|text|texter|tweet|mejl|e-?post|email|linkedin|rubrik|rubriker|annons|copy|beskrivning|hook|hooks|manus|bio|slogan|idé|idéer|ideas|stycke|punktlista|svar)\b/.test(t)

  return standalone || (writeVerb && contentNoun)
}

const SYSTEM_PROMPT = `Du är en AI-assistent inbyggd i AI Ops Platform — ett AI-operativsystem för att koordinera AI-agenter och workflows för flera verksamheter.

Du hjälper användaren att:
- Förstå och köra workflows
- Tolka och förklara resultat
- Planera och prioritera arbete (via Manager Agent)
- Analysera prestanda, kostnader och systemstatus (via Manager Agent)

När användaren ber om att köra något — t.ex. "skriv en berättelse om havet", "generera veckobrevet" — ska du:
1. Identifiera rätt workflow med list_workflows
2. Trigga det med trigger_workflow
3. Presentera outputen snyggt

När användaren ställer frågor om systemstatus, prioriteringar, affärsrekommendationer, kostnader, eller vill planera — använd ask_manager-verktyget. Exempel:
- "Vad borde vi fokusera på idag?" → ask_manager
- "Hur mår Familje-Stunden?" → ask_manager
- "Vilka workflows misslyckas?" → ask_manager
- "Analysera kostnaderna" → ask_manager

Manager Agent har tillgång till realtidsdata om körningar, agenter, kostnader och godkännanden.

Svara alltid på svenska. Var kortfattad och hjälpsam.`

// Röstläge — talad konversation. Korta, naturliga svar, inga monologer.
const VOICE_DIRECTIVE = `

VIKTIGT — DETTA ÄR ETT RÖSTSAMTAL (som ChatGPT Voice):
- Svara med HÖGST 2 meningar. Aldrig en rapport, aldrig en lista, aldrig markdown eller emojis.
- Prata som en avslappnad kollega — kort, varmt, naturligt.
- Ge ETT litet svar och fråga sedan om personen vill höra mer. Rabbla aldrig allt på en gång.
- Hellre flera korta repliker i ett samtal än ett långt svar.
- SNABBHET: svara DIREKT från LIVE-snapshoten nedan (kostnad, agenter, innehållsprestanda, möjligheter). Använd INTE verktyg (ask_manager m.fl.) för frågor om status/prestanda/vad-bör-jag-göra — det gör svaret långsamt. Verktyg används BARA när operatören ber dig GÖRA något (köra/skapa/starta).

Dåligt: "Familje-Stunden genererade 17 aktiviteter och slutförde julipaketet samt..."
Bra: "Familje-Stunden ser fin ut idag. Julipaketet är klart — vill du ha en snabb sammanfattning?"`

// Verktygsvägledning — hur Atlas använder sina verktyg.
const TOOL_GUIDE = `Verktyg du har:
- list_workflows / trigger_workflow / get_run_status — kör arbetsflöden när operatören ber dig skapa eller generera något (t.ex. "generera veckobrevet").
- ask_manager — för djupare operativ analys, planering och utvärdering av godkännanden.
- delegate — när operatören ber dig SKAPA/STARTA något större (t.ex. "skapa en GainPilot-kampanj"): bryt ner målet i konkreta uppgifter med ägare, delegera dem, och rapportera kedjan kort (t.ex. "Skapat: Research ✓ planerad, Copy, Bild, QA"). Uppgifterna syns live i Activity Center.
När operatören vill köra något: hitta rätt workflow, trigga det, presentera resultatet snyggt. Svara på operatörens språk (svenska om inget annat anges).`

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_workflows',
    description: 'Lista alla tillgängliga workflows. Anropa detta för att se vilka workflows som finns och vilka inputs de kräver.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'trigger_workflow',
    description: 'Starta ett workflow. Returnerar ett run_id som du sedan kan använda med get_run_status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workflow_id: {
          type: 'string',
          description: 'ID för workflowet att köra',
        },
        input: {
          type: 'object',
          description: 'Input-variabler för workflowet, t.ex. {"tema": "havet", "ålder": "6-9 år"}',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['workflow_id', 'input'],
    },
  },
  {
    name: 'get_run_status',
    description: 'Hämta status och output för en körning. Om status är "running", vänta lite och försök igen.',
    input_schema: {
      type: 'object' as const,
      properties: {
        run_id: {
          type: 'string',
          description: 'ID för körningen att hämta',
        },
      },
      required: ['run_id'],
    },
  },
  {
    name: 'ask_manager',
    description: 'Fråga Manager Agent om systemstatus, prioriteringar, kostnader, affärsrekommendationer, eller planering. Använd när användaren vill ha operationell insikt snarare än att köra ett workflow.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: 'Frågan eller uppdraget till Manager Agent, formulerat som ett direkt meddelande',
        },
        project_id: {
          type: 'string',
          description: 'Valfritt projekt-ID om frågan gäller ett specifikt projekt',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'delegate',
    description: 'Delegera ett mål: bryt ner det i konkreta uppgifter, tilldela ägare och spåra dem. Använd när operatören ber dig SKAPA eller STARTA något större — t.ex. "skapa en GainPilot-kampanj", "dra igång en lanseringsplan". Du föreslår själv uppgiftslistan i logisk ordning. Uppgifterna sparas och syns live i Activity Center.',
    input_schema: {
      type: 'object' as const,
      properties: {
        goal: { type: 'string', description: 'Målet, t.ex. "GainPilot-kampanj för Q3"' },
        project_id: { type: 'string', description: 'Valfritt projekt-ID som målet gäller' },
        tasks: {
          type: 'array',
          description: 'Uppgifterna att skapa, i ordning de bör utföras',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Vad som ska göras' },
              agent: { type: 'string', description: 'Vilken agent/roll som äger uppgiften, t.ex. "Research Agent", "Copy Agent", "QA Agent"' },
            },
            required: ['title'],
          },
        },
      },
      required: ['goal', 'tasks'],
    },
  },
]

export async function POST(request: Request) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages, conversation_id, voice, mode } = await request.json() as {
    messages: Anthropic.MessageParam[]
    conversation_id?: string
    voice?: boolean
    mode?: string
  }

  const db = createAdminClient()
  const tStart = Date.now()

  // ── FAST PATH-beslut ────────────────────────────────────────────────────────
  const lastUserText = (() => {
    const m = messages[messages.length - 1]
    return m?.role === 'user' && typeof m.content === 'string' ? m.content : ''
  })()
  const fastPath = mode === 'content' || isFastPathContent(lastUserText)
  const reqType = fastPath ? 'fast_path' : 'atlas'

  let systemPrompt: string
  if (fastPath) {
    // Ingen Executive Brain, inga verktyg, ingen workflow — bara skriv.
    systemPrompt = FAST_PATH_SYSTEM + (voice ? VOICE_DIRECTIVE : '')
  } else {
    systemPrompt = buildAtlasSystemPrompt() + '\n\n' + TOOL_GUIDE
    try { systemPrompt += await buildLiveContext(db) } catch { /* icke-kritiskt */ }
    if (voice) systemPrompt += VOICE_DIRECTIVE
  }

  const activeTools = fastPath ? [] : TOOLS
  const contextMs = Date.now() - tStart

  // Helper: persist a message to DB
  async function saveMessage(role: string, content: string | null, toolData?: unknown) {
    if (!conversation_id) return
    try {
      await db.from('conversation_messages').insert({
        conversation_id,
        role,
        content,
        tool_data: toolData ?? null,
      })
      // Touch updated_at on conversation
      await db.from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversation_id)
    } catch { /* non-fatal */ }
  }

  // Spara användarmeddelandet ICKE-BLOCKERANDE — vänta aldrig på DB innan
  // strömmen startar (det fördröjde första token, särskilt i röstläge).
  const lastMsg = messages[messages.length - 1]
  if (lastMsg?.role === 'user' && typeof lastMsg.content === 'string') {
    void saveMessage('user', lastMsg.content)
    if (conversation_id && messages.filter(m => m.role === 'user').length === 1) {
      const title = lastMsg.content.slice(0, 60) + (lastMsg.content.length > 60 ? '…' : '')
      void db.from('conversations').update({ title }).eq('id', conversation_id)
    }
  }

  // SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ event, ...( typeof data === 'object' ? data : { data }) })}\n\n`),
        )
      }

      let firstTokenMs = 0   // tid (från tStart) till första token — latens-mätning

      async function runConversation(msgs: Anthropic.MessageParam[]) {
        // Agentic loop — Claude can use tools multiple times
        for (let i = 0; i < 10; i++) {
          // STREAMA svaret token-för-token. Detta är nyckeln: TTS kan börja på
          // första färdiga meningen i stället för att vänta in hela svaret.
          const llm = anthropic.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: voice ? 150 : (fastPath ? 1200 : 4096),
            system: systemPrompt,
            tools: activeTools,   // fast path = [] → ingen verktygsloop
            messages: msgs,
          })
          llm.on('text', (delta: string) => {
            if (!firstTokenMs) firstTokenMs = Date.now() - tStart
            if (delta) send('text', { text: delta })
          })
          const response = await llm.finalMessage()

          // If no tool use, we're done — save final assistant text
          if (response.stop_reason !== 'tool_use') {
            const textBlocks = response.content.filter(b => b.type === 'text')
            const fullText = textBlocks.map(b => (b as Anthropic.TextBlock).text).join('')
            if (fullText) void saveMessage('assistant', fullText)
            break
          }

          // Process tool calls
          const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
          const toolResults: Anthropic.ToolResultBlockParam[] = []

          for (const toolUse of toolUseBlocks) {
            send('tool_call', { tool: toolUse.name, input: toolUse.input })

            let result: unknown
            try {
              result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>, db, user.id)
            } catch (err) {
              result = { error: err instanceof Error ? err.message : 'Okänt fel' }
            }

            send('tool_result', { tool: toolUse.name, result })

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            })
          }

          // Add assistant response + tool results to message history
          msgs = [
            ...msgs,
            { role: 'assistant', content: response.content },
            { role: 'user', content: toolResults },
          ]
        }

        // Latens-sammanfattning från servern: hur lång tid Atlas Brain tog att
        // bygga + tid till första token. Klienten loggar resten (STT, TTS, totalt).
        const serverTotalMs = Date.now() - tStart
        // Mätbar rad i runtime-loggarna → snitt per typ (fast_path/atlas/workflow_start).
        console.log(`[chat-latency] type=${reqType} contextMs=${contextMs} firstTokenMs=${firstTokenMs} totalMs=${serverTotalMs}`)
        send('timing', { reqType, contextMs, firstTokenMs, serverTotalMs })
        send('done', {})
        controller.close()
      }

      try {
        await runConversation(messages)
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : 'Okänt fel' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  db: AdminClient,
  _userId: string,
): Promise<unknown> {
  if (name === 'list_workflows') {
    const { data: workflows } = await db
      .from('workflows')
      .select('id, name, description, steps, projects(name, slug)')
      .order('created_at', { ascending: false })

    return (workflows ?? []).map((w) => {
      const steps = (w.steps as WorkflowStep[]) ?? []
      const project = Array.isArray(w.projects) ? w.projects[0] : w.projects
      const inputVars = new Set<string>()
      steps.forEach((s) => {
        const matches = s.input_template.matchAll(/\{\{([^}]+)\}\}/g)
        for (const m of matches) inputVars.add(m[1].trim())
      })
      // Remove vars that are outputs of previous steps
      const outputKeys = steps.map((s) => s.output_key)
      outputKeys.forEach((k) => inputVars.delete(k))

      return {
        id: w.id,
        name: w.name,
        description: w.description,
        project: project?.name,
        steps: steps.length,
        input_variables: [...inputVars],
      }
    })
  }

  if (name === 'trigger_workflow') {
    const { workflow_id, input: workflowInput } = input as { workflow_id: string; input: Record<string, string> }

    const { data: workflow } = await db
      .from('workflows')
      .select('id, project_id, name, steps')
      .eq('id', workflow_id)
      .single()

    if (!workflow) throw new Error('Workflow hittades inte')

    // DURABLE: skapa som 'pending'. INGET fire-and-forget. pg_cron-drainern claimar
    // och kör den durabelt — Atlas rapporterar "köad", aldrig falskt "startad".
    const { data: run } = await db
      .from('runs')
      .insert({
        workflow_id: workflow.id,
        project_id: workflow.project_id,
        status: 'pending',
        input: workflowInput,
        context: {},
      })
      .select('id')
      .single()

    if (!run) throw new Error('Kunde inte skapa körning')

    return {
      run_id: run.id,
      status: 'queued',
      message: 'Körningen är köad och körs durabelt inom kort. Fråga om status med get_run_status när du vill.',
    }
  }

  if (name === 'get_run_status') {
    const { run_id } = input as { run_id: string }

    const { data: run } = await db
      .from('runs')
      .select('id, status, context, error, started_at, finished_at')
      .eq('id', run_id)
      .single()

    if (!run) throw new Error('Körning hittades inte')

    const context = (run.context as Record<string, string>) ?? {}
    const duration =
      run.started_at && run.finished_at
        ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
        : null

    // Build a safe summary — strip base64 image data and truncate large text
    const contextSummary: Record<string, string> = {}
    for (const [key, value] of Object.entries(context)) {
      if (typeof value !== 'string') continue
      // Skip or summarize base64 image data
      if (value.includes('data:image') || value.includes('"b64_json"')) {
        contextSummary[key] = '[bilddata genererad — för stor att visa i chatt]'
        continue
      }
      // Try to parse JSON for image URLs
      try {
        const parsed = JSON.parse(value)
        if (parsed?.urls && Array.isArray(parsed.urls)) {
          contextSummary[key] = `${parsed.urls.length} bild(er) genererade. URL:er: ${parsed.urls.map((u: string) => u.startsWith('data:') ? '[base64-bild]' : u).join(', ')}`
          continue
        }
      } catch { /* not JSON */ }
      // Truncate long text
      contextSummary[key] = value.length > 500 ? value.slice(0, 500) + `… [${value.length} tecken totalt]` : value
    }

    const keys = Object.keys(context)
    const lastKey = keys[keys.length - 1]
    const lastValue = lastKey ? contextSummary[lastKey] : null

    return {
      run_id: run.id,
      status: run.status,
      output: run.status === 'done' ? lastValue : null,
      steps_completed: keys,
      duration_seconds: duration,
      error: (run as { error?: string }).error ?? null,
    }
  }

  if (name === 'ask_manager') {
    const { message, project_id } = input as { message: string; project_id?: string }
    const manager = getManager()
    const response = await manager.chat(message, project_id)
    return { response }
  }

  if (name === 'delegate') {
    const { goal, project_id, tasks } = input as { goal: string; project_id?: string; tasks: { title: string; agent?: string }[] }
    const adb: any = db
    let projectId = project_id
    if (!projectId) {
      const { data: p } = await db.from('projects').select('id').limit(1).maybeSingle()
      projectId = (p as { id?: string } | null)?.id
    }
    const created: { id: string; title: string; status: string }[] = []
    for (const t of (tasks ?? [])) {
      try {
        const { data } = await adb.from('manager_tasks').insert({
          project_id:  projectId,
          title:       t.title,
          description: t.agent ? `Ägare: ${t.agent}` : null,
          status:      'pending',
        }).select('id, title, status').single()
        if (data) created.push(data)
      } catch { /* hoppa över enskild uppgift */ }
    }
    try {
      await adb.from('agent_messages').insert({
        project_id:   projectId,
        from_agent:   'Atlas',
        to_agent:     'Operator',
        message_type: 'daily_plan',
        content:      `Delegering: ${goal} — ${created.length} uppgifter skapade och tilldelade.`,
      })
    } catch { /* icke-kritiskt */ }
    return { goal, created: created.length, tasks: created, note: 'Uppgifterna syns nu live i Atlas Activity Center.' }
  }

  throw new Error(`Okänt verktyg: ${name}`)
}

// executeWorkflow flyttad till lib/ai/workflow-runner.ts. trigger_workflow skapar nu en
// 'pending' run (durabelt); pg_cron-drainern (/api/runs/drain) claimar och kör den.
