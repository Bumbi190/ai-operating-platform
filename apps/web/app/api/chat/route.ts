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
import { getOperations, operationsSummary } from '@/lib/atlas/operations'
import { getDreamFindings, dreamLiveSummary, delegateDreamFinding, resolveDreamFinding } from '@/lib/atlas/dream'
import type { WorkflowStep } from '@/lib/supabase/types'

// ── Fas 5: cachad live-snapshot (Atlas Brain + Content/Opportunity/Agent) ──────
// Multi-turn röstsamtal hämtade om ~12 DB-frågor PER tur → stor latens. Vi cachar
// den sammansatta kontext-strängen kort så turer 2+ blir nära momentana.
let _liveCtxCache: { at: number; text: string } | null = null
const LIVE_CTX_TTL_MS = 45_000

async function buildLiveContext(db: ReturnType<typeof createAdminClient>): Promise<string> {
  if (_liveCtxCache && Date.now() - _liveCtxCache.at < LIVE_CTX_TTL_MS) return _liveCtxCache.text
  const k = (n: number) => `${Math.round(n)} kr`
  const [ctxR, patR, csR, oppR, actR, revR, opsR, dreamR] = await Promise.allSettled([
    gatherAtlasContext(db),
    fetchOperatorPatterns(db),
    contentScore(db),
    listOpportunities(db),
    agentActivity(db, 24),
    revenueIntel(db),
    getOperations(db),
    dreamLiveSummary(db),
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
  // Operations Center-snapshot → Atlas svarar "Hur går det idag?", "Vad väntar på
  // publicering?", "Finns några fel?", "Vilket projekt går bäst?" direkt.
  if (opsR.status === 'fulfilled') text += operationsSummary(opsR.value)
  // Dream Cycle findings — nightly self-improvement intelligence, surfaced
  // passively so criticals/warnings appear in briefings without being asked.
  if (dreamR.status === 'fulfilled' && dreamR.value) text += dreamR.value

  _liveCtxCache = { at: Date.now(), text }
  return text
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

// ── ACTION INTENT ───────────────────────────────────────────────────────────
// Operatören ber Atlas GÖRA något konkret (köra/starta/publicera/aktivera). Då MÅSTE
// ett verktyg anropas — Atlas får aldrig bara säga att det är gjort. Vi tvingar
// tool_choice på första turen så ett verkligt verktygsanrop garanteras.
function isActionIntent(text: string): boolean {
  const t = (text || '').toLowerCase().trim()
  // Publicera/posta innebär en åtgärd i sig själv (inget objekt krävs).
  if (/\b(publicera|publish|posta|publicering)\b/.test(t)) return true
  // Övriga handlingsverb kräver ett objekt (workflow/nyhet/script/analys/…).
  // Media-stegens egennamn räknas som objekt (engelska namn → matcha direkt).
  if (/\b(fetch ai news|generate script|generate voiceover|render video|publish to social|publish to youtube)\b/.test(t)) return true
  return /\b(starta|start|kör|kör igång|dra igång|sätt igång|aktivera|generera|skapa|gör|trigga|exekvera|genomför|utför|hämta|sök|hitta)\b/.test(t)
    && /\b(workflow|arbetsflöde|flöde|analys|process|agent|kampanj|pipeline|körning|jobb|inlägg|post|video|reel|manus|script|nyhet|nyheter|artikel|innehåll|content|story|veckobrev|rapport|render|deploy|news|publish|youtube|voiceover)\b/.test(t)
}

// Ord/fraser som PÅSTÅR en utförd/pågående åtgärd. Om Atlas skriver något av dessa
// utan att ha anropat ett verktyg i samma tur → falskt påstående (ärlighetsspärr).
const ACTION_CLAIM_RE = new RegExp(
  [
    // Starka åtgärds-verb i presens (med eller utan "jag") = påstår pågående körning/postning.
    '\\b(startar|triggar|publicerar|postar|kör igång|drar igång|sätter igång|påbörjar)\\b',
    // "kör/genomför … <workflow-objekt eller -namn>" (ej ren analys).
    '\\b(kör|genomför)\\b[^.!?]*\\b(workflow|arbetsflöde|fetch ai news|generate script|generate voiceover|publish to social|publish to youtube|render video|render|youtube|nyhet|nyheten|artikeln|scriptet|manus|posten|inlägget|publicering|videon|reel)\\b',
    // Status-påståenden om workflow/körning/publicering.
    '\\bworkflow(et)?\\b[^.!?]*\\b(startat|köat|köad|igång|påbörjat|triggat)\\b',
    '\\b(körningen|publiceringen)\\b[^.!?]*\\b(startad|köad|igång|påbörjad)\\b',
    '\\b(har )?(startat|köat|triggat|publicerat) (workflow|körning|scriptet|nyheten|posten|inlägget)\\b',
  ].join('|'),
  'i',
)

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
- get_dream_findings — Dream Cycle är din nattliga självförbättringsanalys. Du HAR direkt tillgång per projekt. Varje ärende har en STABIL issue_id (samma över tid även om problemet återkommer) och lifecycle (open/in_progress/completed) → svara på "vilka är öppna / under arbete / lösta?" direkt från det. Sammanfatta kritiska → varningar → info. Säg ALDRIG att du inte kan se Dream Cycle.
- delegate_dream_finding — stänger Dream→Action-loopen. När ett ärende har lifecycle="open" och en recommended_action: FRÅGA INTE "vill du att jag delegerar?". Förklara kort vad du gör, anropa delegate_dream_finding (issue_id + project_id, valfri owner), returnera task-id, ägare, status. Idempotent på issue_id — återkommande problem skapar ingen dubblett. Påstå aldrig att en uppgift skapats utan att ha fått tillbaka ett task-id.
- resolve_dream_finding — när operatören BEKRÄFTAR att ett delegerat ärende är åtgärdat: anropa resolve_dream_finding (issue_id + project_id). Det sätter uppgiften till done → lifecycle completed. Markera aldrig något löst på eget bevåg.
- delegate — när operatören ber dig SKAPA/STARTA något större (t.ex. "skapa en GainPilot-kampanj"): bryt ner målet i konkreta uppgifter med ägare, delegera dem, och rapportera kedjan kort (t.ex. "Skapat: Research ✓ planerad, Copy, Bild, QA"). Uppgifterna syns live i Activity Center.
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
          description: 'Projekt-ID vars Dream-insikter ska hämtas. Använd projekt-ID:t från LIVE LÄGE-kontexten för den verksamhet operatören frågar om.',
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
        project_id: { type: 'string', description: 'Projekt-ID som ärendet tillhör (från LIVE LÄGE).' },
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
        project_id: { type: 'string', description: 'Projekt-ID som ärendet tillhör.' },
        issue_id: { type: 'string', description: 'Dream-ärendets stabila issue_id.' },
        result: { type: 'string', description: 'Valfri kort notering om hur det löstes.' },
      },
      required: ['project_id', 'issue_id'],
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
  // Action-intent (kör/starta/publicera …) → tvinga verktygsanrop på första turen.
  const actionIntent = !fastPath && isActionIntent(lastUserText)
  const reqType = fastPath ? 'fast_path' : (actionIntent ? 'workflow_start' : 'atlas')

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
  const forceToolFirstTurn = actionIntent && activeTools.length > 0
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

      let firstTokenMs = 0    // tid (från tStart) till första token — latens-mätning
      let actionToolUsed = false  // kördes ett ÅTGÄRDS-verktyg (trigger_workflow/delegate) DENNA förfrågan?
      // OBS: list_workflows/get_run_status/ask_manager räknas INTE — de är läsningar.
      // Ärlighetsspärren får bara tystas av ett verkligt, lyckat åtgärdsanrop.

      async function runConversation(msgs: Anthropic.MessageParam[]) {
        // Agentic loop — Claude can use tools multiple times
        for (let i = 0; i < 10; i++) {
          // STREAMA svaret token-för-token. Detta är nyckeln: TTS kan börja på
          // första färdiga meningen i stället för att vänta in hela svaret.
          // TVINGAD ROUTNING: vid action-intent måste FÖRSTA turen anropa ett verktyg
          // (tool_choice=any) — Atlas kan då inte bara påstå att något körts.
          const llm = anthropic.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: voice ? 150 : (fastPath ? 1200 : 4096),
            system: systemPrompt,
            tools: activeTools,   // fast path = [] → ingen verktygsloop
            ...(forceToolFirstTurn && i === 0 ? { tool_choice: { type: 'any' as const } } : {}),
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
            let fullText = textBlocks.map(b => (b as Anthropic.TextBlock).text).join('')

            // ÄRLIGHETSSPÄRR (safety net): om Atlas PÅSTÅR en åtgärd ("jag triggar/kör …")
            // men inget ÅTGÄRDS-verktyg (trigger_workflow/delegate) faktiskt kördes denna
            // förfrågan → korrigera. list_workflows/ask_manager tystar INTE spärren.
            if (!fastPath && !actionToolUsed && ACTION_CLAIM_RE.test(fullText)) {
              const correction = ' \n\n⚠️ Obs: jag har faktiskt inte kört något än — ingen körning startades. Bekräfta vilket workflow du vill köra, så triggar jag det på riktigt och visar run-id.'
              send('text', { text: correction })
              fullText += correction
              console.log('[honesty-guard] blockerade falskt åtgärdspåstående (inget åtgärdsverktyg kördes)')
            }

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

            // Markera att en VERKLIG åtgärd skedde — bara åtgärdsverktyg som LYCKADES.
            const r = (result ?? null) as Record<string, unknown> | null
            const errored = !!r && 'error' in r
            let took = false
            if (toolUse.name === 'trigger_workflow' || toolUse.name === 'delegate') took = !errored
            // run_media_step: räknas bara om steget faktiskt kördes (ok=true) — inte vid
            // needs_confirmation (publicering ej bekräftad) eller fel.
            if (toolUse.name === 'run_media_step') took = !!r && r.ok === true
            if (took) actionToolUsed = true

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

  if (name === 'get_dream_findings') {
    const { project_id } = input as { project_id?: string }
    if (!project_id) {
      return { error: 'project_id krävs. Använd projekt-ID:t från LIVE LÄGE-kontexten.' }
    }
    const { data: proj } = await db.from('projects').select('name').eq('id', project_id).maybeSingle()
    const res = await getDreamFindings(db, project_id, 20)
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
      return { error: 'project_id och issue_id krävs.' }
    }
    const r = await delegateDreamFinding(db, { projectId: project_id, issueId: issue_id, owner, title })
    if (!r.ok) return { ok: false, error: r.error }
    return {
      ok: true,
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
      return { error: 'project_id och issue_id krävs.' }
    }
    const r = await resolveDreamFinding(db, { projectId: project_id, issueId: issue_id, result })
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

  throw new Error(`Okänt verktyg: ${name}`)
}

// executeWorkflow flyttad till lib/ai/workflow-runner.ts. trigger_workflow skapar nu en
// 'pending' run (durabelt); pg_cron-drainern (/api/runs/drain) claimar och kör den.
