/**
 * Atlas Operations Center — ETT operativt snapshot över hela verksamheten.
 *
 * Bygger ENBART på befintliga tabeller (media_scripts, media_insights, runs,
 * leads, cost_events, projects). Ingen ny datamodell, ingen dashboard-duplicering.
 * Detta är datalagret bakom /atlas/operations OCH bakom Atlas svar på frågor som
 * "Hur går det idag?", "Vad väntar på publicering?", "Finns några fel?".
 *
 * Allt är defensivt: saknad/avvikande data degraderar till 0/null i stället för
 * att krascha. Read-only.
 */

type AnyDb = any

const PROMPT_SLUG   = 'ai-media-automation'
const FAMILJE_SLUG  = 'familje-stunden'
const GAINPILOT_SLUG = 'gainpilot'

export interface PromptOps {
  publishedToday: number
  waitingRender: number   // voiceover klar, render ej startad
  rendering: number       // render pågår
  waitingPublish: number  // video klar, ej publicerad (FÄRSK, ≤4 dagar)
  archived: number        // arkiverad pga färskhetspolicy (>4 dagar gammal news)
  failed24h: number
  views: { instagram: number; youtube: number; facebook: number }
  latestPublished: {
    hook: string
    at: string | null
    instagram: string | null
    youtube: string | null
    facebook: string | null
  } | null
}

export interface FamiljeOps {
  activeSubscribers: number | null  // placeholder tills Stripe är inkopplat
  leads: number
  socialPosts: number
  failed24h: number
}

export interface GainpilotOps {
  betaUsers: number | null    // placeholder — ingen datakälla ännu
  activeUsers: number | null  // placeholder — ingen datakälla ännu
  leads: number
  failed24h: number
}

export interface SystemHealth {
  costTodaySek: number
  costMonthSek: number
  activeWorkflows: number   // körningar som pågår nu
  stuckWorkflows: number    // pågår men lease utgången / hängda
  failedWorkflows: number   // misslyckade senaste 24h
  lastError: { message: string; workflow: string | null; at: string } | null
}

export interface OperationsSnapshot {
  generatedAt: string
  prompt: PromptOps
  familje: FamiljeOps
  gainpilot: GainpilotOps
  system: SystemHealth
}

function startOfTodayIso(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString()
}
function startOfMonthIso(): string {
  const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}
function isToday(iso: string | null): boolean {
  if (!iso) return false
  const d = new Date(iso); const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}
function wfName(r: any): string | null {
  const w = Array.isArray(r.workflows) ? r.workflows[0] : r.workflows
  return w?.name ?? null
}

export async function getOperations(db: AnyDb): Promise<OperationsSnapshot> {
  const safe = async <T>(p: Promise<{ data: T | null }>, fb: T): Promise<T> => {
    try { const { data } = await p; return data ?? fb } catch { return fb }
  }

  const since24h   = new Date(Date.now() - 24 * 3600_000).toISOString()
  const monthStart = startOfMonthIso()
  const todayStart = startOfTodayIso()
  const nowMs      = Date.now()

  const [projects, scripts, insights, runs24h, runningRuns, leads, costMonthRows] = await Promise.all([
    safe<any[]>(db.from('projects').select('id, name, slug, color'), []),
    safe<any[]>(db.from('media_scripts').select('project_id, status, voice_status, video_status, published_at, hook, instagram_url, youtube_url, facebook_url, updated_at'), []),
    safe<any[]>(db.from('media_insights').select('project_id, platform, views, reach, impressions'), []),
    safe<any[]>(db.from('runs').select('project_id, status, error, last_error, created_at, finished_at, workflows(name)').gte('created_at', since24h).order('created_at', { ascending: false }), []),
    safe<any[]>(db.from('runs').select('project_id, status, started_at, lease_until').eq('status', 'running'), []),
    safe<any[]>(db.from('leads').select('project_id, status'), []),
    safe<any[]>(db.from('cost_events').select('cost_sek, created_at').gte('created_at', monthStart), []),
  ])

  const idBySlug = new Map<string, string>()
  for (const p of projects) idBySlug.set(p.slug, p.id)
  const promptId    = idBySlug.get(PROMPT_SLUG)
  const familjeId   = idBySlug.get(FAMILJE_SLUG)
  const gainpilotId = idBySlug.get(GAINPILOT_SLUG)

  const failed24hFor = (pid?: string) =>
    runs24h.filter(r => r.status === 'failed' && (!pid || r.project_id === pid)).length
  const leadsFor = (pid?: string) =>
    leads.filter(l => !pid || l.project_id === pid).length

  // ── THE PROMPT ──────────────────────────────────────────────────────────────
  const promptScripts = scripts.filter(s => s.project_id === promptId)
  const isReadyVideo  = (s: any) => String(s.video_status) === 'ready'
  const isPublished   = (s: any) => String(s.status) === 'published'

  const promptViews = { instagram: 0, youtube: 0, facebook: 0 }
  for (const i of insights.filter(x => x.project_id === promptId)) {
    const v = Number(i.views ?? 0) || Number(i.reach ?? 0) || Number(i.impressions ?? 0) || 0
    const plat = String(i.platform ?? '').toLowerCase()
    if (plat.includes('insta')) promptViews.instagram += v
    else if (plat.includes('you')) promptViews.youtube += v
    else if (plat.includes('face')) promptViews.facebook += v
  }

  const latestPubScript = promptScripts
    .filter(isPublished)
    .slice()
    .sort((a, b) => new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime())[0] ?? null

  const prompt: PromptOps = {
    publishedToday: promptScripts.filter(s => isPublished(s) && isToday(s.published_at)).length,
    waitingRender:  promptScripts.filter(s => String(s.voice_status) === 'ready' && ['none', 'generating_images'].includes(String(s.video_status)) && !isPublished(s)).length,
    rendering:      promptScripts.filter(s => String(s.video_status) === 'rendering').length,
    waitingPublish: promptScripts.filter(s => isReadyVideo(s) && !isPublished(s)).length,
    archived:       promptScripts.filter(s => String(s.video_status) === 'archived').length,
    failed24h:      failed24hFor(promptId),
    views:          promptViews,
    latestPublished: latestPubScript ? {
      hook: latestPubScript.hook ?? 'Publicerad video',
      at:   latestPubScript.published_at ?? null,
      instagram: latestPubScript.instagram_url ?? null,
      youtube:   latestPubScript.youtube_url ?? null,
      facebook:  latestPubScript.facebook_url ?? null,
    } : null,
  }

  // ── FAMILJE-STUNDEN ─────────────────────────────────────────────────────────
  const familje: FamiljeOps = {
    activeSubscribers: null,  // placeholder tills Stripe är inkopplat
    leads:       leadsFor(familjeId),
    socialPosts: scripts.filter(s => s.project_id === familjeId && isPublished(s)).length,
    failed24h:   failed24hFor(familjeId),
  }

  // ── GAINPILOT ───────────────────────────────────────────────────────────────
  const gainpilot: GainpilotOps = {
    betaUsers:   null,  // placeholder — ingen datakälla ännu
    activeUsers: null,  // placeholder — ingen datakälla ännu
    leads:       leadsFor(gainpilotId),
    failed24h:   failed24hFor(gainpilotId),
  }

  // ── ATLAS SYSTEM HEALTH ─────────────────────────────────────────────────────
  const costMonthSek = costMonthRows.reduce((a, r) => a + (Number(r.cost_sek ?? 0) || 0), 0)
  const costTodaySek = costMonthRows
    .filter(r => r.created_at && r.created_at >= todayStart)
    .reduce((a, r) => a + (Number(r.cost_sek ?? 0) || 0), 0)

  const stuck = runningRuns.filter(r => {
    if (r.lease_until) return new Date(r.lease_until).getTime() < nowMs
    return r.started_at ? (nowMs - new Date(r.started_at).getTime()) > 2 * 3600_000 : false
  }).length

  const lastErrRun = runs24h.find(r => r.status === 'failed' && (r.error || r.last_error))
  const system: SystemHealth = {
    costTodaySek,
    costMonthSek,
    activeWorkflows: runningRuns.length,
    stuckWorkflows:  stuck,
    failedWorkflows: failed24hFor(),
    lastError: lastErrRun ? {
      message:  String(lastErrRun.error ?? lastErrRun.last_error).slice(0, 200),
      workflow: wfName(lastErrRun),
      at:       lastErrRun.finished_at ?? lastErrRun.created_at,
    } : null,
  }

  return { generatedAt: new Date().toISOString(), prompt, familje, gainpilot, system }
}

/**
 * Kompakt textsammanfattning för Atlas live-kontext (chat/röst), så Atlas kan
 * svara "Hur går det idag?", "Vad väntar på publicering?", "Finns några fel?",
 * "Vilket projekt går bäst?" direkt — utan att fråga databasen per tur.
 */
export function operationsSummary(o: OperationsSnapshot): string {
  const p = o.prompt
  const viewsTotal = p.views.instagram + p.views.youtube + p.views.facebook
  const lines: string[] = []
  lines.push(`\n\nOPERATIONS (live):`)
  lines.push(`The Prompt — publicerat idag: ${p.publishedToday}, väntar render: ${p.waitingRender}, renderar: ${p.rendering}, väntar publicering (färska ≤4d): ${p.waitingPublish}, arkiverade (gammal news): ${p.archived}, fel 24h: ${p.failed24h}. Visningar: IG ${p.views.instagram}, YouTube ${p.views.youtube}, FB ${p.views.facebook} (totalt ${viewsTotal}).`)
  if (p.latestPublished) lines.push(`Senast publicerat: "${(p.latestPublished.hook ?? '').slice(0, 60)}".`)
  lines.push(`Familje-Stunden — prenumeranter: ${o.familje.activeSubscribers ?? 'ej inkopplat (Stripe)'}, leads: ${o.familje.leads}, sociala poster: ${o.familje.socialPosts}, fel 24h: ${o.familje.failed24h}.`)
  lines.push(`GainPilot — beta: ${o.gainpilot.betaUsers ?? 'ingen data'}, aktiva: ${o.gainpilot.activeUsers ?? 'ingen data'}, leads: ${o.gainpilot.leads}, fel 24h: ${o.gainpilot.failed24h}.`)
  lines.push(`System — kostnad idag ${Math.round(o.system.costTodaySek)} kr, denna månad ${Math.round(o.system.costMonthSek)} kr. Aktiva workflows: ${o.system.activeWorkflows}, hängda: ${o.system.stuckWorkflows}, misslyckade 24h: ${o.system.failedWorkflows}.`)
  if (o.system.lastError) lines.push(`Senaste fel: ${o.system.lastError.workflow ?? 'okänt'} — ${o.system.lastError.message.slice(0, 100)}.`)
  return lines.join('\n')
}
