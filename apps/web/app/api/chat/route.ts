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
import { buildAgentRunInsert } from '@/lib/ai/run-create'
import { fetchOperatorPatterns } from '@/lib/os/patterns'
import { buildAtlasSystemPrompt } from '@/lib/atlas/identity'
import { gatherAtlasContext } from '@/lib/atlas/context'
import { contentScore } from '@/lib/atlas/content-score'
import { listOpportunities } from '@/lib/atlas/opportunities'
import { agentActivity } from '@/lib/atlas/activity'
import { revenueIntel } from '@/lib/atlas/revenue'
import { getOperations, operationsSummary } from '@/lib/atlas/operations'
import { getDreamFindings, dreamLiveSummary, delegateDreamFinding, resolveDreamFinding } from '@/lib/atlas/dream'
import { ACTION_CLAIM_RE, NAV_CLAIM_RE, DELEGATE_CLAIM_RE } from '@/lib/atlas/honesty'
import { isNavIntent } from '@/lib/atlas/nav-intent'
import { isActionIntent } from '@/lib/atlas/action-intent'
import { getAllowedProjectIds, assertProjectAllowed, scopeProjectFilter } from '@/lib/atlas/isolation'
import { validateWorkflowDraft, type WorkflowDraft } from '@/lib/atlas/workflow-authoring'
import type { Json } from '@/lib/supabase/database.types'
import { isViewAwarenessEnabled, normalizeView, renderViewBlock, type ClientViewEnvelope } from '@/lib/atlas/view-context'
import { fetchRecords } from '@/lib/atlas/record-access'
import { RECORD_DOMAINS } from '@/lib/atlas/data-registry'
import { isRecordAwarenessEnabled, buildRecordsInView } from '@/lib/atlas/view-records'
import { recordAction, buildActionMemory } from '@/lib/atlas/action-memory'
// CL Commit 5 (Stage 0, shadow): assembler-vs-legacy diff instrumentation.
// Flag-gated (ATLAS_CTX_ASSEMBLER=shadow), fire-and-forget, never in the live path.
import { isContextShadowEnabled, runContextShadow } from '@/lib/atlas/context/shadow'
import { resolveDestination, resolveLinks, resolveProjectSlug, DESTINATION_IDS, type DestinationId } from '@/lib/nav/registry'
import { toJson, parseWorkflowSteps } from '@/lib/supabase/json'

// ── Fas 5: cachad live-snapshot (Atlas Brain + Content/Opportunity/Agent) ──────
// Multi-turn röstsamtal hämtade om ~12 DB-frågor PER tur → stor latens. Vi cachar
// den sammansatta kontext-strängen kort så turer 2+ blir nära momentana.
// Keyed by the sorted allowed-project-id set so each tenant's snapshot is cached
// independently (single owner today → one key → identical behavior).
const _liveCtxCache = new Map<string, { at: number; text: string }>()
const LIVE_CTX_TTL_MS = 45_000

async function buildLiveContext(db: ReturnType<typeof createAdminClient>, allowedProjectIds: string[] = []): Promise<string> {
  // ISOLATION: the live snapshot is scoped to the caller's allowed projects.
  // Cache is keyed per allow-list set so one tenant's snapshot never serves another.
  const cacheKey = [...allowedProjectIds].sort().join(',')
  const cached = _liveCtxCache.get(cacheKey)
  if (cached && Date.now() - cached.at < LIVE_CTX_TTL_MS) return cached.text
  const k = (n: number) => `${Math.round(n)} kr`
  const [ctxR, patR, csR, oppR, actR, revR, opsR, dreamR] = await Promise.allSettled([
    gatherAtlasContext(db, allowedProjectIds),
    fetchOperatorPatterns(db, allowedProjectIds),
    contentScore(db, undefined, allowedProjectIds),
    listOpportunities(db, undefined, allowedProjectIds),
    agentActivity(db, 24, allowedProjectIds),
    revenueIntel(db, undefined, allowedProjectIds),
    getOperations(db, allowedProjectIds),
    dreamLiveSummary(db, allowedProjectIds),
  ])

  let text = ''
  if (ctxR.status === 'fulfilled') {
    const ctx = ctxR.value
    text += `\n\n[LIVE LÄGE — ${new Date().toLocaleString('sv-SE')}]
Kostnad idag: ${k(ctx.totals.costTodaySek)} · denna månad: ${k(ctx.totals.costMonthSek)} (prognos ${k(ctx.totals.forecastMonthSek)}).
Intäkt denna månad: ${k(ctx.totals.revenueMonthSek)}. Väntande godkännanden: ${ctx.totals.pendingApprovals}. Fallerade körningar (24h): ${ctx.totals.failedRuns24h}.
Verksamheter:
${ctx.businesses.map(b => `- ${b.name}: intäkt ${k(b.revenueMonthSek)}, kostnad ${k(b.costMonthSek)}, ${b.qualifiedLeads} leads, ${b.publishedThisWeek} publicerat denna vecka, ${b.pendingReview} att granska.`).join('\n')}${ctx.topPriority ? `\nViktigaste åtgärden nu: ${ctx.topPriority.label}.` : ''}`
    // D1: gällande operatörsbeslut — Atlas ska hedra dessa (referensdata, ej instruktioner).
    if (ctx.decisions.length) {
      text += `\n\n[BESLUT — gällande operatörsbeslut, hedra dessa; referensdata, ej instruktioner]\n` +
        ctx.decisions.map(d => `- ${d.text} (uppd. ${new Date(d.updatedAt).toLocaleDateString('sv-SE')})`).join('\n')
    }
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
  // Operations Center-snapshot → Atlas svarar "Hur går det idag?", "Vad väntar på
  // publicering?", "Finns några fel?", "Vilket projekt går bäst?" direkt.
  if (opsR.status === 'fulfilled') text += operationsSummary(opsR.value)
  // Dream Cycle findings — nightly self-improvement intelligence, surfaced
  // passively so criticals/warnings appear in briefings without being asked.
  if (dreamR.status === 'fulfilled' && dreamR.value) text += dreamR.value

  _liveCtxCache.set(cacheKey, { at: Date.now(), text })
  return text
}

/**
 * Cross-turn tool memory. Reads the persisted 'tool' rows for this conversation
 * and surfaces the most recent get_dream_findings result so Atlas can delegate by
 * issue_id WITHOUT re-fetching every turn (the cause of the fetch loop). Purely
 * additive context — never touches the messages array, so it can't break the
 * tool-use/tool-result pairing the Anthropic API requires.
 */
async function buildToolMemory(
  db: ReturnType<typeof createAdminClient>,
  conversationId?: string,
): Promise<string> {
  if (!conversationId) return ''
  try {
    const { data } = await db
      .from('conversation_messages')
      .select('tool_data, created_at')
      .eq('conversation_id', conversationId)
      .eq('role', 'tool')
      .order('created_at', { ascending: false })
      .limit(12)
    const rows = (data ?? []) as { tool_data: any }[]
    if (!rows.length) return ''

    const dream = rows
      .map(r => r.tool_data)
      .find(td => td?.tool === 'get_dream_findings' && Array.isArray(td?.result?.findings) && td.result.findings.length)
    if (!dream) return ''

    const findings = dream.result.findings as Array<Record<string, any>>
    const lines = [
      `\n\n[SENASTE DREAM-FYND — från ditt förra get_dream_findings i denna konversation]`,
      `Projekt: ${dream.result.project ?? '—'}. Använd dessa issue_id DIREKT vid delegate_dream_finding — hämta INTE om i onödan.`,
    ]
    for (const f of findings.slice(0, 12)) {
      lines.push(
        `- issue_id=${f.issue_id} · ${f.severity} · lifecycle=${f.lifecycle ?? 'open'}` +
        (f.insight ? ` · ${String(f.insight).slice(0, 80)}` : ''),
      )
    }
    return lines.join('\n')
  } catch {
    return ''
  }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 120   // cap (sekunder); ger run_media_step plats att köra ett media-steg synkront. Normala/röst-svar returnerar ändå på sekunder.

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

// Ärlighetsspärrarnas claim-regexar (ACTION_CLAIM_RE / NAV_CLAIM_RE) bor i
// @/lib/atlas/honesty så de kan enhetstestas utan att ladda route-beroenden.

// ── MEDIA-BRYGGA ────────────────────────────────────────────────────────────
// Mappar Atlas "kör <steg>" → de RIKTIGA media-pipeline-endpoints (separata från
// durable-motorn). Cron-stegen behöver ingen input. Publicering kräver bekräftelse.
const MEDIA_STEPS: Record<string, { path: string; workflow: string; label: string; isPublish?: boolean }> = {
  fetch_news:        { path: '/api/media/news/cron',   workflow: 'Fetch AI News',       label: 'Fetch AI News' },
  generate_script:   { path: '/api/media/cron/step1',  workflow: 'Generate Script',     label: 'Generate Script' },
  generate_voiceover:{ path: '/api/media/cron/step2',  workflow: 'Generate Voiceover',  label: 'Generate Voiceover' },
  // Render = step3: genererar bilder + STARTAR Lambda-renderingen (sätter video_status='rendering').
  // step4 bara POLLAR pågående renderingar — fel steg att "starta" video.
  render_video:      { path: '/api/media/cron/step3',  workflow: 'Render Video',        label: 'Render Video' },
  publish_social:    { path: '/api/media/cron/publish', workflow: 'Publish to Social',  label: 'Publish to Social', isPublish: true },
  publish_youtube:   { path: '/api/media/cron/youtube', workflow: 'Publish to YouTube', label: 'Publish to YouTube', isPublish: true },
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
- ÄRLIGHET FÖRE KORTHET: säg ALDRIG "jag startar", "jag kör", "workflow startat/köat" eller "publicering påbörjad" om du inte faktiskt anropat verktyget i samma tur. Vet du inte vilket workflow: fråga kort "vilket workflow menar du?". Påstå aldrig en åtgärd som inte skett — det är viktigare än att vara kortfattad.

Dåligt: "Familje-Stunden genererade 17 aktiviteter och slutförde julipaketet samt..."
Bra: "Familje-Stunden ser fin ut idag. Julipaketet är klart — vill du ha en snabb sammanfattning?"`

// Verktygsvägledning — hur Atlas använder sina verktyg.
const TOOL_GUIDE = `Verktyg du har:
- run_media_step — DETTA är rätt verktyg för The Prompts media-pipeline. När operatören säger "kör/starta" Fetch AI News, Generate Script, Generate Voiceover, Render Video, Publish to Social eller Publish to YouTube: anropa run_media_step DIREKT med rätt steg. Be ALDRIG om input för dessa — cron-stegen hämtar sin egen data. Säg sedan kort "Kört — Run ID: <id>, status: <status>". För publish_social/publish_youtube: bekräfta först med operatören (publikt inlägg), sätt sedan confirm_publish=true.
- list_workflows / trigger_workflow / get_run_status — för ÖVRIGA workflows (t.ex. Familje-Stunden). trigger_workflow kräver input. Använd INTE dessa för de sex media-stegen ovan — använd run_media_step.
- ask_manager — för djupare operativ analys, planering och utvärdering av godkännanden.
- get_records — RAD-NIVÅ. När operatören frågar om konkreta poster eller "vad tittar jag på" (se [CURRENT VIEW]): hämta dem med rätt domain (leads, memories, website_content, runs, approvals, manager_tasks, opportunities, agents) + valfritt project/filters/id. När [RECORDS IN VIEW] redan finns i prompten är sidans rader REDAN hämtade — referera dem direkt och anropa get_records bara för andra domäner, fler rader eller PII. Allt är projekt-isolerat. PII (e-post/telefon) BARA med include_pii=true och bara om operatören uttryckligen ber om kontaktuppgifter. Referera bara poster verktyget returnerat — hitta aldrig på rader.
- validate_workflow / save_workflow — när operatören ber dig SKAPA eller ÄNDRA ett workflow (ett automationsflöde av agent-steg, INTE en engångsuppgift → det är delegate). Arbetsgång: 1) hämta giltiga agent_id med get_records(domain=agents, project=…), 2) bygg stegen (varje steg: agent_id + input_template med {{output_key}} från tidigare steg + unik output_key), 3) validate_workflow (dry-run), 4) åtgärda ev. errors, 5) save_workflow (workflow_id för ändring, annars project för nytt). Rapportera workflow_id och required_inputs. Påstå ALDRIG att ett workflow sparats utan saved=true. Kör det inte automatiskt — föreslå trigger_workflow separat.
- get_dream_findings — Dream Cycle är din nattliga självförbättringsanalys. Du HAR direkt tillgång per projekt. Varje ärende har en STABIL issue_id (samma över tid även om problemet återkommer) och lifecycle (open/in_progress/completed) → svara på "vilka är öppna / under arbete / lösta?" direkt från det. Sammanfatta kritiska → varningar → info. Säg ALDRIG att du inte kan se Dream Cycle.
- delegate_dream_finding — stänger Dream→Action-loopen. När ett ärende har lifecycle="open" och en recommended_action: FRÅGA INTE "vill du att jag delegerar?". Förklara kort vad du gör, anropa delegate_dream_finding (issue_id + project_id, valfri owner), returnera task-id, ägare, status. Idempotent på issue_id — återkommande problem skapar ingen dubblett. Påstå aldrig att en uppgift skapats utan att ha fått tillbaka ett task-id.
- resolve_dream_finding — när operatören BEKRÄFTAR att ett delegerat ärende är åtgärdat: anropa resolve_dream_finding (issue_id + project_id). Det sätter uppgiften till done → lifecycle completed. Markera aldrig något löst på eget bevåg.
- delegate — när operatören ber dig SKAPA/STARTA något större (t.ex. "skapa en GainPilot-kampanj"): bryt ner målet i konkreta uppgifter med ägare, delegera dem, och rapportera kedjan kort (t.ex. "Skapat: Research ✓ planerad, Copy, Bild, QA"). Uppgifterna syns live i Activity Center.
- present_links — FÖRSLAG/BLÄDDRING. Använd BARA när operatören bläddrar, ställer en fråga, eller när flera destinationer är relevanta och du vill låta dem välja. Det ÖPPNAR ingenting — det visar klickbara genvägar under svaret. Logiska destinationer (t.ex. "approvals", "activity", "money", "revenue", "dream", "content_queue", "marketing_queue", "project_home") + valfritt project (verksamhetens namn eller slug) + valfria filters (t.ex. {state:"pending"} eller {status:"failed"}). Aldrig råa URL:er. Håll till 1–3 mest relevanta. FORMULERING: säg "Här är genvägar:" / "Here are shortcuts:". Påstå ALDRIG att du öppnat, navigerat till eller tagit operatören till sidan när du bara använt present_links — det har du inte gjort förrän de klickar.
- navigate — ÖPPNAR en vy DIREKT åt operatören. Ett DIREKT navigeringskommando ("öppna X", "gå till X", "ta mig till X", "visa X", eng. "open/go to/take me to/show X") ÄR i sig bekräftelsen → anropa navigate OMEDELBART, samma tur, utan att fråga om bekräftelse och utan att erbjuda present_links först. Använd present_links endast när operatören bläddrar/frågar eller flera mål är relevanta. Samma destinationer/project/filters som present_links.
  • Att öppna en hel VERKSAMHET/ett PROJEKT ("öppna The Prompt", "open GainPilot", "ta mig till Familje-Stunden") → navigate med destination:"project_home" och project:"<namn>" (t.ex. project:"The Prompt", "GainPilot", "Familje-Stunden"). Registret översätter namnet till rätt slug.
  • Att öppna en SIDA ("öppna godkännanden", "show failed runs") → navigate med rätt destination (approvals, activity {status:"failed"}, …).
  ENDAST ett lyckat navigate-anrop får beskrivas som genomförd navigering ("öppnade", "tog dig till", "navigerade", "visar nu sidan"). Använd sådana formuleringar ALDRIG om du inte anropat navigate och fått ok=true denna tur — annars korrigeras du automatiskt.
När operatören vill köra något: hitta rätt workflow, trigga det, presentera resultatet snyggt. Svara på operatörens språk (svenska om inget annat anges).

ÄRLIGHETSREGEL (absolut, gäller alltid):
- Du får ALDRIG skriva eller säga att något är startat, kört, köat, triggat, publicerat eller påbörjat om du inte i SAMMA tur faktiskt anropat ett verktyg och fått ett resultat tillbaka.
- Ber operatören dig köra/starta/publicera något → anropa verktyget (list_workflows → trigger_workflow). Vet du inte vilket workflow som avses: anropa list_workflows och FRÅGA vilket — påstå aldrig att något körts.
- Spegla alltid verkligheten: körde inget verktyg → säg det rakt ut. Körde ett verktyg → visa resultatet (t.ex. run_id och att körningen är köad).
- Hitta aldrig på run_id, status eller utfall.`

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
    name: 'run_media_step',
    description: 'Kör ett RIKTIGT steg i The Prompts media-pipeline. ANVÄND DETTA (inte trigger_workflow) när operatören säger "kör/starta" något av: Fetch AI News, Generate Script, Generate Voiceover, Render Video, Publish to Social, Publish to YouTube. Cron-stegen behöver INGEN input — kör direkt. Returnerar run_id och status. Publiceringssteg (publish_social/publish_youtube) postar PUBLIKT och kräver confirm_publish=true.',
    input_schema: {
      type: 'object' as const,
      properties: {
        step: {
          type: 'string',
          enum: ['fetch_news', 'generate_script', 'generate_voiceover', 'render_video', 'publish_social', 'publish_youtube'],
          description: 'Vilket media-steg som ska köras.',
        },
        confirm_publish: {
          type: 'boolean',
          description: 'Måste vara true för publish_social/publish_youtube (publikt inlägg). Lämna tomt/false för övriga steg.',
        },
      },
      required: ['step'],
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
  {
    name: 'get_dream_findings',
    description: 'Hämta Dream Cycle-insikter (nattlig självförbättringsanalys) för ett projekt. Returnerar kritiska/varnings-/info-fynd med rekommenderade åtgärder, samt en sammanfattning per allvarlighetsgrad. Använd när operatören frågar om Dream-varningar, systemhälsa, återkommande fel, eller "vad bör vi förbättra" för ett projekt.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: {
          type: 'string',
          description: 'Vilken verksamhet Dream-insikterna gäller — UUID, slug ELLER namn (t.ex. "The Prompt", "Familje-Stunden"). Ta namnet från LIVE LÄGE / CURRENT VIEW; det resolvas och ägarkontrolleras server-side.',
        },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'delegate_dream_finding',
    description: 'Omvandla ett Dream-ärende till en konkret uppgift i manager_tasks (stänger Dream→Action-loopen). Anropa DIREKT — utan att fråga om lov — när ett ärende har lifecycle="open" och en recommended_action. Idempotent på stabil issue_id: skapar ingen dubblett även om problemet återkommit under ny nyckel. Returnerar task-id, ägare och status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'Verksamheten ärendet tillhör — UUID, slug eller namn (t.ex. "The Prompt"). Resolvas och ägarkontrolleras server-side.' },
        issue_id: { type: 'string', description: 'Dream-ärendets stabila issue_id (fältet "issue_id" från get_dream_findings, t.ex. critical_alerting_missing).' },
        owner: { type: 'string', description: 'Vem uppgiften tilldelas (agent eller person). Default "Atlas" om utelämnad.' },
        title: { type: 'string', description: 'Valfri uppgiftstitel. Default: ärendets rekommenderade åtgärd.' },
      },
      required: ['project_id', 'issue_id'],
    },
  },
  {
    name: 'resolve_dream_finding',
    description: 'Markera ett Dream-ärende som löst genom att slutföra dess delegerade uppgift (status → done, lifecycle → completed). Anropa BARA när operatören bekräftar att arbetet faktiskt är gjort — hitta aldrig på att något är löst. Kräver att ärendet redan delegerats. Returnerar issue_id, task-id och status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'Verksamheten ärendet tillhör — UUID, slug eller namn (t.ex. "The Prompt"). Resolvas och ägarkontrolleras server-side.' },
        issue_id: { type: 'string', description: 'Dream-ärendets stabila issue_id.' },
        result: { type: 'string', description: 'Valfri kort notering om hur det löstes.' },
      },
      required: ['project_id', 'issue_id'],
    },
  },
  {
    name: 'present_links',
    description: 'Visa klickbara navigationsgenvägar UNDER ditt svar (Atlas-navigationslagret). Använd när svaret refererar till en plats operatören kan agera på. Skicka logiska destinationer — ALDRIG råa URL:er. Registret bygger rätt länk och filtrerar bort ogiltiga. Håll till 1–3 mest relevanta.',
    input_schema: {
      type: 'object' as const,
      properties: {
        items: {
          type: 'array',
          description: 'Destinationerna att visa som genvägar.',
          items: {
            type: 'object',
            properties: {
              destination: { type: 'string', enum: [...DESTINATION_IDS], description: 'Logisk destination, t.ex. approvals, activity, money, revenue, dream, content_queue, marketing_queue.' },
              project: { type: 'string', description: 'Valfri verksamhet (namn eller slug), t.ex. "The Prompt" eller "gainpilot".' },
              filters: { type: 'object', description: 'Valfria filter, t.ex. {"state":"pending"} eller {"status":"failed"}.', additionalProperties: { type: 'string' } },
              label: { type: 'string', description: 'Valfri egen etikett på genvägen.' },
            },
            required: ['destination'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'navigate',
    description: 'Öppna en vy DIREKT åt operatören (router-navigering). Ett direkt kommando ("öppna/gå till/ta mig till/visa X", eng. "open/go to/take me to/show X") ÄR bekräftelsen → anropa omedelbart, fråga inte. För att öppna en hel verksamhet/projekt: destination="project_home" + project="The Prompt"/"GainPilot"/"Familje-Stunden". Skicka en logisk destination, aldrig en rå URL.',
    input_schema: {
      type: 'object' as const,
      properties: {
        destination: { type: 'string', enum: [...DESTINATION_IDS], description: 'Logisk destination att öppna. För en hel verksamhet/projekt: "project_home" (kombinera med project).' },
        project: { type: 'string', description: 'Verksamhet (namn eller slug), t.ex. "The Prompt", "GainPilot", "Familje-Stunden". Krävs för project_home.' },
        filters: { type: 'object', description: 'Valfria filter, t.ex. {"state":"pending"}.', additionalProperties: { type: 'string' } },
      },
      required: ['destination'],
    },
  },
  {
    name: 'get_records',
    description: 'Hämta poster på RAD-nivå för en vy operatören tittar på (eller frågar om). Använd när du behöver konkreta poster — "vilka leads finns", "vad ligger i innehållskön", "vad väntar på godkännande", "visa körningarna", "vilka uppgifter är öppna". Domäner: leads, memories, website_content, runs, approvals, manager_tasks, opportunities, agents. NOTERA: när [RECORDS IN VIEW] redan finns i kontexten är raderna på skärmen redan hämtade — använd dem direkt; anropa get_records bara för ANDRA domäner, FLER rader eller PII. Alltid projekt-isolerat. PII (e-post/telefon) returneras ALDRIG om du inte sätter include_pii=true (gör det bara om operatören uttryckligen ber om kontaktuppgifter). Hitta aldrig på poster — använd bara det verktyget returnerar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        domain: { type: 'string', enum: [...RECORD_DOMAINS], description: 'Vilken posttyp: leads, memories, website_content, runs, approvals, manager_tasks, opportunities eller agents.' },
        project: { type: 'string', description: 'Valfri verksamhet (namn eller slug) att begränsa till, t.ex. "The Prompt".' },
        filters: { type: 'object', description: 'Valfria filter, t.ex. {"status":"pending_review"} eller {"status":"failed"}.', additionalProperties: { type: 'string' } },
        id: { type: 'string', description: 'Valfritt: hämta en specifik post via id (t.ex. från [CURRENT VIEW]).' },
        limit: { type: 'number', description: 'Max antal rader (tak 25).' },
        include_pii: { type: 'boolean', description: 'Sätt true BARA om operatören uttryckligen ber om PII (e-post/telefon för leads).' },
      },
      required: ['domain'],
    },
  },
  {
    name: 'validate_workflow',
    description: 'Validera ett workflow-utkast UTAN att spara (dry-run). Använd ALLTID innan save_workflow för nya/ändrade workflows. Kontrollerar att steg-ordning och output_key är unika, att varje agent_id finns i projektet, att {{variabler}} produceras av tidigare steg eller listas som indata, samt trigger/cron. Returnerar valid, errors[], warnings[] och required_inputs[]. Tips: lista projektets agenter med get_records(domain=agents) för att få giltiga agent_id.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Verksamhet (namn eller slug) workflowet hör till, t.ex. "The Prompt". Krävs för nya workflows; för befintliga räcker workflow_id.' },
        workflow_id: { type: 'string', description: 'Valfritt: id för ett BEFINTLIGT workflow som ska valideras/ändras (projektet härleds då därifrån).' },
        name: { type: 'string', description: 'Workflowets namn.' },
        description: { type: 'string', description: 'Valfri beskrivning.' },
        trigger: { type: 'string', enum: ['manual', 'cron', 'webhook'], description: 'Hur workflowet startas. Default "manual".' },
        cron_expr: { type: 'string', description: 'Cron-uttryck, krävs när trigger="cron" (t.ex. "0 7 * * *").' },
        steps: {
          type: 'array',
          description: 'Stegen i körordning. Varje steg kör en agent och skriver sitt resultat till output_key.',
          items: {
            type: 'object',
            properties: {
              order: { type: 'number', description: 'Körordning (1,2,3…). Utelämna för att ordna efter listan.' },
              name: { type: 'string', description: 'Stegets namn.' },
              agent_id: { type: 'string', description: 'Agentens id (måste finnas i projektet — hämta via get_records domain=agents).' },
              input_template: { type: 'string', description: 'Prompt/indata. Använd {{output_key}} från tidigare steg eller {{indata}} som fylls vid körning.' },
              output_key: { type: 'string', description: 'Nyckel resultatet sparas under (alfanumeriskt/understreck), unik i workflowet.' },
            },
            required: ['name', 'agent_id', 'output_key'],
          },
        },
      },
      required: ['steps'],
    },
  },
  {
    name: 'save_workflow',
    description: 'Skapa ETT nytt workflow eller uppdatera ett befintligt (om workflow_id anges). Validerar alltid först (samma regler som validate_workflow) och vägrar spara ogiltiga utkast. Projekt-isolerat: du kan bara spara i verksamheter du äger. Returnerar saved, workflow_id, required_inputs[] och ev. errors[]. Påstå ALDRIG att ett workflow sparats utan att ha fått saved=true tillbaka.',
    input_schema: {
      type: 'object' as const,
      properties: {
        workflow_id: { type: 'string', description: 'Ange för att UPPDATERA ett befintligt workflow. Utelämna för att SKAPA ett nytt.' },
        project: { type: 'string', description: 'Verksamhet (namn eller slug) för ett NYTT workflow, t.ex. "The Prompt". Krävs vid skapande.' },
        name: { type: 'string', description: 'Workflowets namn.' },
        description: { type: 'string', description: 'Valfri beskrivning.' },
        trigger: { type: 'string', enum: ['manual', 'cron', 'webhook'], description: 'Hur workflowet startas. Default "manual".' },
        cron_expr: { type: 'string', description: 'Cron-uttryck, krävs när trigger="cron".' },
        active: { type: 'boolean', description: 'Om workflowet är aktivt. Default true för nya.' },
        steps: {
          type: 'array',
          description: 'Stegen i körordning (samma form som validate_workflow).',
          items: {
            type: 'object',
            properties: {
              order: { type: 'number' },
              name: { type: 'string' },
              agent_id: { type: 'string' },
              input_template: { type: 'string' },
              output_key: { type: 'string' },
            },
            required: ['name', 'agent_id', 'output_key'],
          },
        },
      },
      required: ['name', 'steps'],
    },
  },
]

export async function POST(request: Request) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Capture as local — the `!user` narrowing above doesn't survive into the
  // streaming closure further down.
  const userId = user.id

  const { messages, conversation_id, voice, mode, view } = await request.json() as {
    messages: Anthropic.MessageParam[]
    conversation_id?: string
    voice?: boolean
    mode?: string
    view?: ClientViewEnvelope
  }

  const db = createAdminClient()
  const tStart = Date.now()

  // Project-isolation boundary: the projects THIS user owns. Every Atlas data
  // path (live context, ask_manager, get_dream_findings) is scoped to these.
  // Single-owner today → all projects; multi-tenant ready by construction.
  const allowedProjectIds = await getAllowedProjectIds(db, user.id)

  // ── FAST PATH-beslut ────────────────────────────────────────────────────────
  const lastUserText = (() => {
    const m = messages[messages.length - 1]
    return m?.role === 'user' && typeof m.content === 'string' ? m.content : ''
  })()
  const fastPath = mode === 'content' || isFastPathContent(lastUserText)
  // Action-intent (kör/starta/publicera …) → tvinga verktygsanrop på första turen.
  const actionIntent = !fastPath && isActionIntent(lastUserText)
  // Navigerings-intent (öppna/gå till/ta mig till/visa <mål>) → ett direkt
  // kommando ÄR bekräftelsen; tvinga navigate på första turen (ingen extra tur).
  const navIntent = !fastPath && !actionIntent && isNavIntent(lastUserText)
  const reqType = fastPath ? 'fast_path' : (actionIntent ? 'workflow_start' : (navIntent ? 'navigate' : 'atlas'))

  // True when the action ledger already shows a delegation — corroborates truthful
  // recall so the delegation honesty guard does NOT fire on it (set below).
  let recentDelegationKnown = false

  let systemPrompt: string
  if (fastPath) {
    // Ingen Executive Brain, inga verktyg, ingen workflow — bara skriv.
    systemPrompt = FAST_PATH_SYSTEM + (voice ? VOICE_DIRECTIVE : '')
  } else {
    systemPrompt = buildAtlasSystemPrompt() + '\n\n' + TOOL_GUIDE
    // CL Commit 5: legacy segments captured verbatim for the shadow diff only —
    // the exact strings appended below, nothing recomputed, zero behavior change.
    let shadowLive = '', shadowAction = '', shadowView = ''
    try {
      const live = await buildLiveContext(db, allowedProjectIds)
      shadowLive = live
      systemPrompt += live
    } catch { /* icke-kritiskt */ }
    // Cross-turn tool memory: surface prior tool outputs (esp. Dream issue_ids) so
    // delegation across turns doesn't require re-fetching (kills the fetch loop).
    try { systemPrompt += await buildToolMemory(db, conversation_id) } catch { /* icke-kritiskt */ }
    // Action memory (atlas_actions): PROJECT-scoped so "what did you do?" works
    // across chats/sessions. Also reports whether a delegation is on record, used
    // to suppress a false-claim correction on truthful recall.
    try {
      const am = await buildActionMemory(db, allowedProjectIds)
      shadowAction = am.text
      systemPrompt += am.text
      recentDelegationKnown = am.hasRecentDelegation
    } catch { /* icke-kritiskt */ }
    // View Awareness (Foundation 1, flag-gated): tell Atlas what the operator is
    // currently looking at. Hint-only — route/project re-resolved via the registry.
    if (isViewAwarenessEnabled()) {
      try {
        const nv = normalizeView(view)
        if (nv) {
          const viewBlock = renderViewBlock(nv)
          shadowView = viewBlock
          systemPrompt += viewBlock
          // View → Record bridge (Foundation 2, flag-gated): auto-prefetch the
          // actual rows on screen so Atlas can reason about them directly.
          // Project-isolated and PII-free by construction (see view-records.ts).
          if (isRecordAwarenessEnabled()) {
            systemPrompt += await buildRecordsInView(db, nv, allowedProjectIds)
          }
        }
      } catch { /* icke-kritiskt */ }
    }
    if (voice) systemPrompt += VOICE_DIRECTIVE

    // ── CL Commit 5 (Stage 0): context-shadow — INSTRUMENTATION ONLY ──────────
    // Builds the assembler context in parallel and logs a structural+token diff
    // ([ctx-shadow] JSON). Fire-and-forget: never awaited, never throws, and the
    // assembled context is discarded — it cannot influence prompt, reasoning,
    // tools, or output. Disable with ATLAS_CTX_ASSEMBLER unset/'off'.
    if (isContextShadowEnabled()) {
      void runContextShadow({
        db,
        allowedProjectIds,
        voice: !!voice,
        view: view ?? null,
        legacy: { live: shadowLive, action: shadowAction, view: shadowView },
      })
    }
  }

  const activeTools = fastPath ? [] : TOOLS
  const forceToolFirstTurn = actionIntent && activeTools.length > 0
  // Direkt navigeringskommando → tvinga specifikt navigate-verktyget på turn 0.
  const forceNavigateFirstTurn = navIntent && activeTools.length > 0
  const contextMs = Date.now() - tStart

  // Helper: persist a message to DB
  async function saveMessage(role: string, content: string | null, toolData?: unknown) {
    if (!conversation_id) return
    try {
      await db.from('conversation_messages').insert({
        conversation_id,
        role,
        content,
        tool_data: toolData ? toJson(toolData) : null,
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

      let firstTokenMs = 0    // tid (från tStart) till första token — latens-mätning
      let actionToolUsed = false  // kördes ett ÅTGÄRDS-verktyg (trigger_workflow/delegate) DENNA förfrågan?
      // OBS: list_workflows/get_run_status/ask_manager räknas INTE — de är läsningar.
      // Ärlighetsspärren får bara tystas av ett verkligt, lyckat åtgärdsanrop.
      let navigateSucceeded = false  // emitterades ett LYCKAT navigate-event DENNA förfrågan?
      // present_links räknas INTE — det visar bara genvägar, det navigerar inte.
      let delegateToolUsed = false  // kördes ett LYCKAT delegate/delegate_dream_finding DENNA förfrågan?
      // Tystar delegerings-ärlighetsspärren — bara en verklig, lyckad delegering räknas.

      async function runConversation(msgs: Anthropic.MessageParam[]) {
        // Agentic loop — Claude can use tools multiple times
        for (let i = 0; i < 10; i++) {
          // STREAMA svaret token-för-token. Detta är nyckeln: TTS kan börja på
          // första färdiga meningen i stället för att vänta in hela svaret.
          // TVINGAD ROUTNING (turn 0):
          //  • navigerings-kommando → tvinga specifikt navigate (kommandot ÄR bekräftelsen).
          //  • action-intent → tvinga något verktyg (tool_choice=any) så Atlas inte bara påstår.
          const toolChoice = i === 0
            ? (forceNavigateFirstTurn
                ? { tool_choice: { type: 'tool' as const, name: 'navigate' } }
                : forceToolFirstTurn
                  ? { tool_choice: { type: 'any' as const } }
                  : {})
            : {}
          const llm = anthropic.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: voice ? 150 : (fastPath ? 1200 : 4096),
            system: systemPrompt,
            tools: activeTools,   // fast path = [] → ingen verktygsloop
            ...toolChoice,
            messages: msgs,
          })
          llm.on('text', (delta: string) => {
            if (!firstTokenMs) firstTokenMs = Date.now() - tStart
            if (delta) send('text', { text: delta })
          })
          const response = await llm.finalMessage()

          // If no tool use, we're done — save final assistant text
          if (response.stop_reason !== 'tool_use') {
            const textBlocks = response.content.filter((b: Anthropic.ContentBlock) => b.type === 'text')
            let fullText = textBlocks.map((b: Anthropic.ContentBlock) => (b as Anthropic.TextBlock).text).join('')

            // ÄRLIGHETSSPÄRR (safety net): om Atlas PÅSTÅR en åtgärd ("jag triggar/kör …")
            // men inget ÅTGÄRDS-verktyg (trigger_workflow/delegate) faktiskt kördes denna
            // förfrågan → korrigera. list_workflows/ask_manager tystar INTE spärren.
            if (!fastPath && !actionToolUsed && ACTION_CLAIM_RE.test(fullText)) {
              const correction = ' \n\n⚠️ Obs: jag har faktiskt inte kört något än — ingen körning startades. Bekräfta vilket workflow du vill köra, så triggar jag det på riktigt och visar run-id.'
              send('text', { text: correction })
              fullText += correction
              console.log('[honesty-guard] blockerade falskt åtgärdspåstående (inget åtgärdsverktyg kördes)')
            }

            // NAVIGATIONS-ÄRLIGHETSSPÄRR: om Atlas PÅSTÅR att den öppnat/navigerat/
            // visat en vy ("jag öppnade godkännanden") men inget LYCKAT navigate-anrop
            // skedde denna tur → korrigera. present_links (genvägar) räknas INTE som
            // navigering; bara ett verkligt navigate-event får tysta spärren.
            if (!fastPath && !navigateSucceeded && NAV_CLAIM_RE.test(fullText)) {
              const correction = ' \n\n⚠️ Obs: jag har faktiskt inte öppnat eller navigerat någonstans — jag kan visa genvägar att klicka på, eller öppna direkt om du bekräftar. Klicka på en genväg, eller säg "öppna den" så tar jag dig dit på riktigt.'
              send('text', { text: correction })
              fullText += correction
              console.log('[honesty-guard] blockerade falskt navigeringspåstående (inget navigate-anrop lyckades)')
            }

            // DELEGERINGS-ÄRLIGHETSSPÄRR: korrigera bara FALSKA delegeringspåståenden.
            // Tystas av (a) ett lyckat delegate-verktyg DENNA tur, ELLER (b) en delegering
            // som redan finns i åtgärdsloggen (atlas_actions) — då är "jag delegerade …"
            // en sann historisk recall, inte ett falskt påstående. Falska påståenden utan
            // vare sig verktygsanrop eller loggpost fångas fortfarande.
            if (!fastPath && !delegateToolUsed && !recentDelegationKnown && DELEGATE_CLAIM_RE.test(fullText)) {
              const correction = ' \n\n⚠️ Obs: jag har faktiskt inte delegerat något än — ingen uppgift skapades. Säg till så kör jag delegeringen på riktigt (delegate_dream_finding) och visar task-id.'
              send('text', { text: correction })
              fullText += correction
              console.log('[honesty-guard] blockerade falskt delegeringspåstående (inget delegate-verktyg kördes)')
            }

            if (fullText) void saveMessage('assistant', fullText)
            break
          }

          // Process tool calls
          const toolUseBlocks = response.content.filter((b: Anthropic.ContentBlock): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
          const toolResults: Anthropic.ToolResultBlockParam[] = []

          // KVITTO-PERSISTENS: assistenttext som följer MED verktygsanrop (t.ex.
          // delegeringskvittot precis innan present_links) sparas annars aldrig —
          // final-saveMessage körs bara i icke-verktygsgrenen. Spara den här så att
          // kvittot överlever en reload. (Oberoende av atlas_actions.)
          const inlineText = (response.content as Anthropic.ContentBlock[])
            .filter(b => b.type === 'text')
            .map(b => (b as Anthropic.TextBlock).text)
            .join('')
            .trim()
          if (inlineText) void saveMessage('assistant', inlineText)

          for (const toolUse of toolUseBlocks) {
            send('tool_call', { tool: toolUse.name, input: toolUse.input })

            let result: unknown
            try {
              result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>, db, userId, allowedProjectIds)
            } catch (err) {
              result = { error: err instanceof Error ? err.message : 'Okänt fel' }
            }

            // Markera att en VERKLIG åtgärd skedde — bara åtgärdsverktyg som LYCKADES.
            const r = (result ?? null) as Record<string, unknown> | null
            const errored = !!r && 'error' in r
            let took = false
            if (toolUse.name === 'trigger_workflow' || toolUse.name === 'delegate') took = !errored
            // run_media_step: räknas bara om steget faktiskt kördes (ok=true) — inte vid
            // needs_confirmation (publicering ej bekräftad) eller fel.
            if (toolUse.name === 'run_media_step') took = !!r && r.ok === true
            // save_workflow: bara om det FAKTISKT sparades.
            if (toolUse.name === 'save_workflow') took = !!r && (r as { saved?: boolean }).saved === true
            if (took) actionToolUsed = true

            // Delegerings-spärr: en delegering räknas som utförd bara om verktyget LYCKADES.
            // delegate (mål→uppgifter) + delegate_dream_finding (Dream→uppgift) + resolve_dream_finding.
            if (toolUse.name === 'delegate') delegateToolUsed = delegateToolUsed || !errored
            if (toolUse.name === 'delegate_dream_finding' || toolUse.name === 'resolve_dream_finding') {
              if (!!r && (r as { ok?: boolean }).ok === true) delegateToolUsed = true
            }

            // ── ÅTGÄRDSMINNE (atlas_actions, Phase 1) ──────────────────────────
            // Registrera bara FAKTISKT utförda åtgärder. Phase 1: dream_delegation + workflow_run.
            const ra = r as any
            if (toolUse.name === 'delegate_dream_finding' && ra?.ok === true) {
              void recordAction(db, {
                projectId: ra.project_id ?? null,
                conversationId: conversation_id,
                actionType: 'dream_delegation',
                toolName: 'delegate_dream_finding',
                targetKind: 'manager_task',
                targetId: ra.task_id ?? null,
                status: ra.status ?? null,
                summary: `Delegerade Dream-fynd ${ra.issue_id ?? '?'} → uppgift "${ra.title ?? ''}" (task ${ra.task_id ?? '?'})`,
                detail: { issue_id: ra.issue_id ?? null, owner: ra.owner ?? null, priority: ra.priority ?? null, already_existed: ra.already_existed ?? false },
              })
            }
            if (toolUse.name === 'trigger_workflow' && !errored && ra?.run_id) {
              void recordAction(db, {
                projectId: ra.project_id ?? null,
                conversationId: conversation_id,
                actionType: 'workflow_run',
                toolName: 'trigger_workflow',
                targetKind: 'run',
                targetId: ra.run_id ?? null,
                status: ra.status ?? 'queued',
                summary: `Köade workflow "${ra.workflow_name ?? ''}" → körning ${ra.run_id} (${ra.status ?? 'queued'})`,
                detail: { workflow_name: ra.workflow_name ?? null },
              })
            }

            // ── NAVIGATIONSLAGRET ──────────────────────────────────────────────
            // present_links → klickbara genvägar under svaret (persisteras för reload).
            // navigate → klienten router-navigerar direkt (efter operatörens bekräftelse).
            if (toolUse.name === 'present_links' && r && Array.isArray((r as any).links) && (r as any).links.length) {
              const links = (r as any).links
              send('links', { links })
              void saveMessage('assistant', null, { kind: 'links', links })
            }
            if (toolUse.name === 'navigate' && r && (r as any).ok === true && (r as any).href) {
              send('navigate', { href: (r as any).href, label: (r as any).label, id: (r as any).id })
              navigateSucceeded = true
            }

            send('tool_result', { tool: toolUse.name, result })

            // PERSISTENS: spara verktygsanrop + resultat som en 'tool'-rad så att
            // utdata (särskilt Dream issue_id) överlever mellan turer och vid reload.
            // Visas inte i UI (klientens filter behåller bara user/assistant).
            void saveMessage('tool', null, { kind: 'tool_result', tool: toolUse.name, input: toolUse.input, result })

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

/**
 * Resolve a model-supplied project reference (UUID, slug, or name) to a project
 * id the operator OWNS, or null. Mirrors the get_records/fetchRecords pattern so
 * the Dream tools accept the same identifiers Atlas actually has in context
 * (LIVE LÄGE / CURRENT VIEW expose name + slug, never the UUID).
 *
 * Isolation is preserved: a raw id is only accepted if it's in the allow-list,
 * and a slug/name lookup is scoped via scopeProjectFilter (empty allow-list →
 * impossible id → no match), so this can never reach another tenant's project.
 */
async function resolveOwnedProjectId(
  db: AdminClient,
  input: string | undefined,
  allowedProjectIds: string[],
): Promise<string | null> {
  if (!input) return null
  // 1) Already an owned UUID → trust as-is.
  if (assertProjectAllowed(input, allowedProjectIds)) return input
  // 2) Treat as name/slug → canonical slug → owned project id (scoped lookup).
  const slug = resolveProjectSlug(input)
  if (!slug) return null
  const { data } = await db
    .from('projects')
    .select('id')
    .eq('slug', slug)
    .in('id', scopeProjectFilter(allowedProjectIds))
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  db: AdminClient,
  _userId: string,
  allowedProjectIds: string[] = [],
): Promise<unknown> {
  if (name === 'list_workflows') {
    const { data: workflows } = await db
      .from('workflows')
      .select('id, name, description, steps, projects(name, slug)')
      .order('created_at', { ascending: false })

    return (workflows ?? []).map((w) => {
      const steps = parseWorkflowSteps(w.steps)
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
      .select('id, project_id, name, steps, side_effect_class')
      .eq('id', workflow_id)
      .single()

    if (!workflow) throw new Error('Workflow hittades inte')

    // ISOLATION (H-2): en modell-/operatörsangiven workflow_id får bara triggas om
    // dess projekt ligger i anroparens allow-list. Utan detta kunde ett annat projekts
    // workflow köas. Samma mönster som save_workflow nedan.
    if (!assertProjectAllowed(workflow.project_id, allowedProjectIds)) {
      throw new Error('Du har inte åtkomst till det workflowets projekt.')
    }

    // DURABLE: skapa som 'pending'. INGET fire-and-forget. pg_cron-drainern claimar
    // och kör den durabelt — Atlas rapporterar "köad", aldrig falskt "startad".
    const { data: run } = await db
      .from('runs')
      .insert(buildAgentRunInsert(workflow, workflowInput))
      .select('id')
      .single()

    if (!run) throw new Error('Kunde inte skapa körning')

    return {
      run_id: run.id,
      project_id: workflow.project_id,
      workflow_name: workflow.name,
      status: 'queued',
      message: 'Körningen är köad och körs durabelt inom kort. Fråga om status med get_run_status när du vill.',
    }
  }

  if (name === 'run_media_step') {
    const { step, confirm_publish } = input as { step: string; confirm_publish?: boolean }
    const cfg = MEDIA_STEPS[step]
    if (!cfg) return { error: `Okänt media-steg: ${step}` }

    // Publiceringssteg postar publikt → kräver uttrycklig bekräftelse.
    if (cfg.isPublish && !confirm_publish) {
      return { needs_confirmation: true, step, message: `${cfg.label} postar publikt. Bekräfta att du vill publicera, så kör jag.` }
    }

    const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ai-operating-platform-web.vercel.app'
    const secret = process.env.CRON_SECRET
    try {
      const res = await fetch(`${base}${cfg.path}`, {
        method:  'GET',
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
        signal:  AbortSignal.timeout(110_000),
      })
      const payload = await res.json().catch(() => ({})) as Record<string, unknown>

      // Hämta run-id som media-steget loggade (logRun skriver en rad i 'runs').
      let runId: string | null = null
      try {
        const { data: run } = await db.from('runs')
          .select('id, status, workflows(name)')
          .gte('created_at', new Date(Date.now() - 5 * 60_000).toISOString())
          .order('created_at', { ascending: false })
          .limit(10)
        const match = (run as any[] | null)?.find(r => {
          const wf = Array.isArray(r.workflows) ? r.workflows[0] : r.workflows
          return wf?.name === cfg.workflow
        })
        runId = match?.id ?? null
      } catch { /* run-id är best-effort */ }

      const resultStatus = (payload.status as string) ?? (res.ok ? 'ok' : `http_${res.status}`)
      return {
        ok: res.ok,
        step,
        workflow: cfg.workflow,
        run_id: runId,
        status: resultStatus,
        detail: payload,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'okänt fel'
      return { ok: false, step, error: `Kunde inte köra ${cfg.label}: ${msg}. Kontrollera Activity Center.` }
    }
  }

  if (name === 'get_run_status') {
    const { run_id } = input as { run_id: string }

    const { data: run } = await db
      .from('runs')
      .select('id, project_id, status, context, error, started_at, finished_at')
      .eq('id', run_id)
      .single()

    if (!run) throw new Error('Körning hittades inte')

    // ISOLATION (H-2): en modell-/operatörsangiven run_id får bara läsas om
    // körningens projekt ligger i anroparens allow-list. Samma mönster som ovan.
    if (!assertProjectAllowed(run.project_id, allowedProjectIds)) {
      throw new Error('Du har inte åtkomst till den körningens projekt.')
    }

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
    // ISOLATION: only narrow by a model-supplied project_id if the operator owns
    // it; otherwise ignore it. The manager's reads are scoped to allowedProjectIds
    // regardless, so a spoofed id can never widen access.
    const scopedProjectId = assertProjectAllowed(project_id, allowedProjectIds) ? project_id : undefined
    const manager = getManager()
    const response = await manager.chat(message, scopedProjectId, allowedProjectIds)
    return { response }
  }

  if (name === 'get_dream_findings') {
    const { project_id } = input as { project_id?: string }
    if (!project_id) {
      return { error: 'project krävs (UUID, slug eller namn — t.ex. "The Prompt" från LIVE LÄGE / CURRENT VIEW).' }
    }
    // ISOLATION: accept UUID/slug/name, resolve to an OWNED project id (same
    // pattern as get_records). Unresolvable/non-owned → behave as "no data"
    // (never read another tenant's findings).
    const resolvedId = await resolveOwnedProjectId(db, project_id, allowedProjectIds)
    if (!resolvedId) {
      return { project: null, has_data: false, note: 'Inget sådant projekt i din åtkomst.' }
    }
    const { data: proj } = await db.from('projects').select('name').eq('id', resolvedId).maybeSingle()
    const res = await getDreamFindings(db, resolvedId, 20)
    if (!res.hasData) {
      return {
        project: (proj as { name?: string } | null)?.name ?? null,
        has_data: false,
        note: 'Inga Dream Cycle-insikter för det här projektet ännu (dream cycle har inte kört, eller inga körningar att analysera de senaste 24h).',
      }
    }
    return {
      project: (proj as { name?: string } | null)?.name ?? null,
      has_data: true,
      last_run_at: res.lastRunAt,
      summary: res.counts,
      lifecycle: res.lifecycle, // { open, in_progress, completed } — answers "which are open/delegated/resolved?"
      findings: res.findings.map(f => ({
        issue_id: f.issueId, // STABLE identity — pass to delegate_dream_finding / resolve_dream_finding
        severity: f.severity,
        insight: f.insight,
        recommended_action: f.action,
        occurrences: f.occurrences, // how many nights it has recurred
        lifecycle: f.lifecycle, // open | in_progress | completed
        task: f.task, // { id, status, owner } when delegated
        first_seen_at: f.firstSeenAt,
        last_seen_at: f.lastSeenAt,
      })),
      note: 'Svara på "öppna/under arbete/lösta" via lifecycle. För findings med lifecycle="open" och en recommended_action: delegera DIREKT med delegate_dream_finding(issue_id) — fråga inte om lov, säg vad du gör och returnera task-id/ägare/status. När operatören bekräftar att ett ärende är åtgärdat: anropa resolve_dream_finding(issue_id).',
    }
  }

  if (name === 'delegate_dream_finding') {
    const { project_id, issue_id, owner, title } = input as {
      project_id?: string; issue_id?: string; owner?: string; title?: string
    }
    if (!project_id || !issue_id) {
      return { error: 'project (UUID/slug/namn) och issue_id krävs.' }
    }
    // ISOLATION: resolve UUID/slug/name → owned project id before any write.
    const resolvedId = await resolveOwnedProjectId(db, project_id, allowedProjectIds)
    if (!resolvedId) return { ok: false, error: 'Inget sådant projekt i din åtkomst.' }
    const r = await delegateDreamFinding(db, { projectId: resolvedId, issueId: issue_id, owner, title })
    if (!r.ok) return { ok: false, error: r.error }
    return {
      ok: true,
      project_id: resolvedId,
      issue_id,
      already_existed: r.alreadyExisted ?? false,
      task_id: r.task?.id,
      owner: r.task?.owner,
      status: r.task?.status,
      priority: r.task?.priority,
      title: r.task?.title,
      dream_finding: r.finding,
      note: r.alreadyExisted
        ? 'Det här ärendet var redan delegerat — återanvände befintlig uppgift (ingen dubblett, även om problemet återkommit). Rapportera task-id, ägare och status.'
        : 'Uppgift skapad i manager_tasks och synlig i Activity Center. Ärendets lifecycle är nu "in_progress". Rapportera task-id, ägare och status till operatören.',
    }
  }

  if (name === 'resolve_dream_finding') {
    const { project_id, issue_id, result } = input as {
      project_id?: string; issue_id?: string; result?: string
    }
    if (!project_id || !issue_id) {
      return { error: 'project (UUID/slug/namn) och issue_id krävs.' }
    }
    // ISOLATION: resolve UUID/slug/name → owned project id before any write.
    const resolvedId = await resolveOwnedProjectId(db, project_id, allowedProjectIds)
    if (!resolvedId) return { ok: false, error: 'Inget sådant projekt i din åtkomst.' }
    const r = await resolveDreamFinding(db, { projectId: resolvedId, issueId: issue_id, result })
    if (!r.ok) return { ok: false, error: r.error }
    return {
      ok: true,
      issue_id: r.issueId,
      task_id: r.taskId,
      status: r.status,
      note: 'Uppgiften är markerad som done — ärendets lifecycle är nu "completed". Bekräfta kort för operatören.',
    }
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

  if (name === 'present_links') {
    const { items } = input as { items?: { destination: DestinationId; project?: string; filters?: Record<string, string>; label?: string }[] }
    const links = resolveLinks(items ?? [])
    if (links.length === 0) {
      return { links: [], note: 'Inga giltiga destinationer kunde byggas — kontrollera destination/projekt.' }
    }
    return { links, note: 'Genvägar visade under svaret. Beskriv kort vad de leder till.' }
  }

  if (name === 'navigate') {
    const { destination, project, filters } = input as { destination?: DestinationId; project?: string; filters?: Record<string, string> }
    if (!destination) return { ok: false, error: 'destination krävs.' }
    const r = resolveDestination(destination, { project, filters })
    if (!r) return { ok: false, error: 'Okänd destination eller projekt — kunde inte navigera.' }
    return { ok: true, id: r.id, label: r.label, href: r.href, note: 'Vyn öppnas för operatören.' }
  }

  if (name === 'get_records') {
    const { domain, project, filters, id, limit, include_pii } = input as {
      domain: string; project?: string; filters?: Record<string, string>; id?: string; limit?: number; include_pii?: boolean
    }
    // Reuses the shipped isolation boundary via allowedProjectIds.
    return await fetchRecords(db, { domain, project, filters, id, limit, includePii: !!include_pii }, allowedProjectIds)
  }

  if (name === 'validate_workflow' || name === 'save_workflow') {
    return await authorWorkflow(name, input, db, allowedProjectIds)
  }

  throw new Error(`Okänt verktyg: ${name}`)
}

/**
 * Resolve the target project (from workflow_id for edits, else from project
 * name/slug for new), gather that project's agent ids, validate the draft, and —
 * for save_workflow — persist it. Project-isolated: writes only to owned projects.
 */
async function authorWorkflow(
  name: 'validate_workflow' | 'save_workflow',
  input: Record<string, unknown>,
  db: AdminClient,
  allowedProjectIds: string[],
): Promise<unknown> {
  const { workflow_id, project, name: wfName, description, steps, trigger, cron_expr, active } = input as {
    workflow_id?: string; project?: string; name?: string; description?: string
    steps?: unknown; trigger?: string; cron_expr?: string; active?: boolean
  }

  // ── Resolve the target project (and assert ownership) ──
  let projectId: string | null = null
  if (workflow_id) {
    const { data: existing } = await db.from('workflows').select('id, project_id').eq('id', workflow_id).single()
    if (!existing) return { ok: false, error: 'Workflow hittades inte.' }
    if (!assertProjectAllowed(existing.project_id, allowedProjectIds)) {
      return { ok: false, error: 'Du har inte åtkomst till det workflowets projekt.' }
    }
    projectId = existing.project_id
  } else {
    const slug = resolveProjectSlug(project)
    if (!slug) return { ok: false, error: 'project krävs (verksamhetens namn eller slug) för ett nytt workflow.' }
    const { data: proj } = await db
      .from('projects').select('id, slug').eq('slug', slug)
      .in('id', scopeProjectFilter(allowedProjectIds)).maybeSingle()
    if (!proj) return { ok: false, error: `Projektet "${project}" finns inte i din åtkomst.` }
    projectId = proj.id
  }

  // ── Known agent ids for THAT project (steps may only target them) ──
  const { data: agentRows } = await db.from('agents').select('id').eq('project_id', projectId)
  const knownAgentIds = (agentRows ?? []).map((a: { id: string }) => a.id)

  const draft: WorkflowDraft = {
    name: wfName,
    description: description ?? null,
    steps: Array.isArray(steps) ? steps : [],
    trigger,
    cron_expr: cron_expr ?? null,
  }
  const v = validateWorkflowDraft(draft, knownAgentIds)

  if (name === 'validate_workflow' || !v.valid) {
    return {
      ok: v.valid,
      valid: v.valid,
      saved: false,
      errors: v.errors,
      warnings: v.warnings,
      required_inputs: v.requiredInputs,
      steps: v.normalizedSteps.length,
      ...(name === 'save_workflow' && !v.valid ? { note: 'Sparades INTE — åtgärda errors och försök igen.' } : {}),
    }
  }

  // ── Persist (create or update). Mirrors the existing workflows API. ──
  // `steps` is a Json column; cast at the DB boundary only (logic above is typed).
  const payload = {
    name: (wfName ?? '').trim(),
    description: description ?? null,
    steps: v.normalizedSteps as unknown as Json,
    trigger: v.trigger as string,
    cron_expr: v.trigger === 'cron' ? (cron_expr ?? null) : null,
    ...(typeof active === 'boolean' ? { active } : {}),
  }

  if (workflow_id) {
    const { data, error } = await db.from('workflows').update(payload).eq('id', workflow_id).select('id').single()
    if (error || !data) return { ok: false, saved: false, error: error?.message ?? 'Kunde inte uppdatera workflowet.' }
    return { ok: true, saved: true, action: 'updated', workflow_id: data.id, steps: v.normalizedSteps.length, required_inputs: v.requiredInputs, warnings: v.warnings }
  }

  const { data, error } = await db
    .from('workflows')
    .insert({ project_id: projectId as string, ...payload })
    .select('id').single()
  if (error || !data) return { ok: false, saved: false, error: error?.message ?? 'Kunde inte skapa workflowet.' }
  return { ok: true, saved: true, action: 'created', workflow_id: data.id, steps: v.normalizedSteps.length, required_inputs: v.requiredInputs, warnings: v.warnings }
}

// executeWorkflow flyttad till lib/ai/workflow-runner.ts. trigger_workflow skapar nu en
// 'pending' run (durabelt); pg_cron-drainern (/api/runs/drain) claimar och kör den.
