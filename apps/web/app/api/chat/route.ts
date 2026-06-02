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
import { interpolate } from '@/lib/utils'
import { runStep } from '@/lib/ai/runner'
import { getManager } from '@/lib/ai/manager'
import { fetchOperatorPatterns } from '@/lib/os/patterns'
import { buildAtlasSystemPrompt } from '@/lib/atlas/identity'
import { gatherAtlasContext } from '@/lib/atlas/context'
import type { WorkflowStep } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

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

Dåligt: "Familje-Stunden genererade 17 aktiviteter och slutförde julipaketet samt..."
Bra: "Familje-Stunden ser fin ut idag. Julipaketet är klart — vill du ha en snabb sammanfattning?"`

// Verktygsvägledning — hur Atlas använder sina verktyg.
const TOOL_GUIDE = `Verktyg du har:
- list_workflows / trigger_workflow / get_run_status — kör arbetsflöden när operatören ber dig skapa eller generera något (t.ex. "generera veckobrevet").
- ask_manager — för djupare operativ analys, planering och utvärdering av godkännanden.
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
]

export async function POST(request: Request) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages, conversation_id, voice } = await request.json() as {
    messages: Anthropic.MessageParam[]
    conversation_id?: string
    voice?: boolean
  }

  const db = createAdminClient()

  // Atlas-identitet (Executive Chief of Staff) + verktygsvägledning.
  let systemPrompt = buildAtlasSystemPrompt() + '\n\n' + TOOL_GUIDE
  if (voice) systemPrompt += VOICE_DIRECTIVE

  // Live-ögonblicksbild — Atlas grundar varje svar i riktig data.
  try {
    const ctx = await gatherAtlasContext(db)
    const k = (n: number) => `${Math.round(n)} kr`
    systemPrompt += `\n\n[LIVE LÄGE — ${new Date().toLocaleString('sv-SE')}]
Kostnad idag: ${k(ctx.totals.costTodaySek)} · denna månad: ${k(ctx.totals.costMonthSek)} (prognos ${k(ctx.totals.forecastMonthSek)}).
Intäkt denna månad: ${k(ctx.totals.revenueMonthSek)}. Väntande godkännanden: ${ctx.totals.pendingApprovals}. Fallerade körningar (24h): ${ctx.totals.failedRuns24h}.
Verksamheter:
${ctx.businesses.map(b => `- ${b.name}: intäkt ${k(b.revenueMonthSek)}, kostnad ${k(b.costMonthSek)}, ${b.qualifiedLeads} leads, ${b.publishedThisWeek} publicerat denna vecka, ${b.pendingReview} att granska.`).join('\n')}${ctx.topPriority ? `\nViktigaste åtgärden nu: ${ctx.topPriority.label}.` : ''}`
  } catch { /* icke-kritiskt */ }

  // Operativt minne — härledda mönster gör rekommendationerna vassare.
  try {
    const { summary } = await fetchOperatorPatterns(db)
    if (summary) systemPrompt += `\n\n${summary}`
  } catch { /* icke-kritiskt */ }

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

  // Save the latest user message (last item in messages)
  const lastMsg = messages[messages.length - 1]
  if (lastMsg?.role === 'user' && typeof lastMsg.content === 'string') {
    await saveMessage('user', lastMsg.content)

    // Auto-title conversation from first user message
    if (conversation_id && messages.filter(m => m.role === 'user').length === 1) {
      const title = lastMsg.content.slice(0, 60) + (lastMsg.content.length > 60 ? '…' : '')
      await db.from('conversations')
        .update({ title })
        .eq('id', conversation_id)
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

      async function runConversation(msgs: Anthropic.MessageParam[]) {
        // Agentic loop — Claude can use tools multiple times
        for (let i = 0; i < 10; i++) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: voice ? 220 : 4096,
            system: systemPrompt,
            tools: TOOLS,
            messages: msgs,
          })

          // Stream text blocks
          for (const block of response.content) {
            if (block.type === 'text') {
              send('text', { text: block.text })
            }
          }

          // If no tool use, we're done — save final assistant text
          if (response.stop_reason !== 'tool_use') {
            const textBlocks = response.content.filter(b => b.type === 'text')
            const fullText = textBlocks.map(b => (b as Anthropic.TextBlock).text).join('')
            if (fullText) await saveMessage('assistant', fullText)
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

    const { data: run } = await db
      .from('runs')
      .insert({
        workflow_id: workflow.id,
        project_id: workflow.project_id,
        status: 'running',
        input: workflowInput,
        context: {},
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (!run) throw new Error('Kunde inte skapa körning')

    // Execute synchronously (chat waits for result — good for short workflows)
    await executeWorkflow(db, run.id, workflow.project_id, (workflow.steps as WorkflowStep[]) ?? [], workflowInput)

    return { run_id: run.id, message: 'Körning startad' }
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

  throw new Error(`Okänt verktyg: ${name}`)
}

async function executeWorkflow(
  db: AdminClient,
  runId: string,
  projectId: string,
  steps: WorkflowStep[],
  initialInput: Record<string, string>,
) {
  const context: Record<string, string> = { ...initialInput }
  const sortedSteps = [...steps].sort((a, b) => a.order - b.order)

  try {
    for (const step of sortedSteps) {
      const { data: agent } = await db
        .from('agents')
        .select('id, name, system_prompt, model, config')
        .eq('id', step.agent_id)
        .single()

      if (!agent) throw new Error(`Agent hittades inte (steg "${step.name}")`)

      const userMessage = interpolate(step.input_template, context)

      await db.from('run_logs').insert({
        run_id: runId, step_order: step.order, step_name: step.name,
        role: 'user', content: userMessage,
      })

      const result = await runStep({
        systemPrompt: agent.system_prompt,
        userMessage,
        model: agent.model,
        maxTokens: (agent.config as { max_tokens?: number })?.max_tokens ?? 4000,
        temperature: (agent.config as { temperature?: number })?.temperature ?? 0.7,
      })

      await db.from('run_logs').insert({
        run_id: runId, step_order: step.order, step_name: step.name,
        role: 'assistant', content: result.content,
        tokens_in: result.tokensIn, tokens_out: result.tokensOut, duration_ms: result.durationMs,
      })

      context[step.output_key] = result.content
      await db.from('runs').update({ context }).eq('id', runId)
    }

    const lastKey = sortedSteps[sortedSteps.length - 1]?.output_key
    await db.from('outputs').insert({
      run_id: runId, project_id: projectId,
      name: `Chatt-körning — ${new Date().toLocaleDateString('sv-SE')}`,
      type: 'text',
      content: lastKey ? context[lastKey] : '',
    })

    await db.from('runs').update({
      status: 'done', finished_at: new Date().toISOString(), context,
    }).eq('id', runId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    await db.from('run_logs').insert({ run_id: runId, role: 'system', content: `❌ ${message}` })
    await db.from('runs').update({
      status: 'failed', error: message, finished_at: new Date().toISOString(),
    }).eq('id', runId)
    throw err
  }
}
