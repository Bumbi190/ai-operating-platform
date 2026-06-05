/**
 * POST /api/media/breaking — NEWSJACKING: producera + publicera en video DIREKT,
 * utanför det dagliga schemat.
 *
 * Källa (tre lägen):
 *   1. { text }  — klistrad artikeltext (full kontroll)
 *   2. { url }   — skrapas via Hermes → artikeltext
 *   3. inget     — auto-hunt: News Hunter hämtar dagens största story
 *
 * Flöde (återanvänder den testade pipelinen via ?scriptId): analysera → manus →
 * spara approved+breaking → step2 (röst+bild) → step3 (render) → poll step4 → publish → youtube.
 *
 * Auth: inloggad operatör ELLER Bearer {CRON_SECRET}.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Anthropic } from '@anthropic-ai/sdk'
import { runNewsHunter } from '@/lib/media/news-hunter'
import { callHermesRead, isHermesConfigured } from '@/lib/media/hermes'
import { NEWS_SYSTEM, buildScriptSystem } from '@/lib/media/script-prompt'
import { scoreScript } from '@/lib/media/quality'
import { classifyTopic } from '@/lib/atlas/content-tags'
import type { NewsHunterOutput, ScriptWriterOutput } from '@/lib/media/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300   // hela kedjan inkl. render-poll

const DEFAULT_PROJECT_SLUG = 'ai-media-automation'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function parseJson<T>(raw: string): T {
  return JSON.parse(raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()) as T
}

export async function POST(request: Request) {
  // ── Auth: cron-secret ELLER inloggad operatör ──────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  let authed = !!cronSecret && authHeader === `Bearer ${cronSecret}`
  if (!authed) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    authed = !!user
  }
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { project_id?: string; url?: string; text?: string }
  const db = createAdminClient()
  const claude = new Anthropic()
  const steps: Record<string, unknown> = {}

  // ── Projekt ─────────────────────────────────────────────────────────────────
  let projectQuery = db.from('projects').select('id, slug')
  projectQuery = body.project_id ? projectQuery.eq('id', body.project_id) : projectQuery.eq('slug', DEFAULT_PROJECT_SLUG)
  const { data: project } = await projectQuery.limit(1).single()
  if (!project) return NextResponse.json({ error: 'Projekt saknas' }, { status: 404 })

  try {
    // ── 1. Hämta källtext (text → url-skrap → auto-hunt) ──────────────────────
    let articleText: string | null = body.text?.trim() || null
    let sourceUrl: string | null = body.url?.trim() || null

    if (!articleText && sourceUrl && isHermesConfigured()) {
      const read = await callHermesRead(sourceUrl)
      if (read?.success && read.text) articleText = `${read.title}\n\n${read.text}`
    }
    if (!articleText && sourceUrl) articleText = `Article URL: ${sourceUrl}`

    if (!articleText) {
      // Auto-hunt: dagens största story
      const hunt = await runNewsHunter(db, project.id, 5, [])
      const top = hunt.candidates?.[0]
      if (!top) return NextResponse.json({ error: 'Ingen story hittades att newsjacka' }, { status: 404 })
      articleText = [top.story.title, top.story.summary ?? '', top.editorialNote ? `Key insight: ${top.editorialNote}` : '', `Source: ${top.story.sourceLabel}`].filter(Boolean).join('\n\n')
      sourceUrl = top.story.url ?? null
      steps.source = 'auto-hunt'
    } else {
      steps.source = body.text ? 'text' : 'url'
    }

    // ── 2. Analysera nyheten ──────────────────────────────────────────────────
    const newsRes = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 800, system: NEWS_SYSTEM,
      messages: [{ role: 'user', content: `Analyze this article for short-form video:\n\n${articleText}` }],
    })
    const news = parseJson<NewsHunterOutput>(newsRes.content[0].type === 'text' ? newsRes.content[0].text : '')
    steps.news = news.title

    const { data: newsItem } = await db.from('media_news_items').insert({
      project_id: project.id, title: news.title, summary: news.summary, key_insight: news.key_insight,
      url: news.source_url ?? sourceUrl, source_name: news.source_name ?? null,
      target_audience: news.target_audience, content_angle: news.content_angle,
      virality_score: news.virality_score ?? 0, status: 'approved', raw_output: { ...news, breaking: true },
    }).select('id').single()

    // ── 3. Skriv manus (samma förbättrade prompt som dagligt) ─────────────────
    const scriptRes = await claude.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 2000, system: buildScriptSystem(),
      messages: [{ role: 'user', content: `Write a short-form video script for this AI news story:\n\nTitle: ${news.title}\nSummary: ${news.summary}\nKey insight: ${news.key_insight}\nAudience: ${news.target_audience}\nAngle: ${news.content_angle}` }],
    })
    const script = parseJson<ScriptWriterOutput>(scriptRes.content[0].type === 'text' ? scriptRes.content[0].text : '')
    const qualityScore = await scoreScript(script.hook, script.script, `${news.title}\n${news.summary}\n${news.key_insight}`).catch(() => null)
    steps.hook = script.hook

    const { data: scriptRow } = await db.from('media_scripts').insert({
      project_id: project.id, news_item_id: newsItem?.id ?? null,
      hook: script.hook, script: script.script, captions: script.captions,
      hashtags: script.hashtags, cta: script.cta, tone: script.tone,
      estimated_duration: script.estimated_duration, raw_output: script,
      quality_score: qualityScore, status: 'approved',
      voice_status: 'none', video_status: 'none', version: 1,
      topic: classifyTopic(script.hook, script.script), format: 'reel',
      breaking: true, generated_at: new Date().toISOString(),
    }).select('id').single()
    if (!scriptRow) throw new Error('Kunde inte spara manus')
    const scriptId = scriptRow.id as string
    steps.scriptId = scriptId

    // ── 4. Kör kedjan via befintliga steg (?scriptId kringgår tidsfönstret) ───
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ai-operating-platform-web.vercel.app'
    const callStep = async (path: string, timeoutMs = 120_000) => {
      try {
        const res = await fetch(`${base}${path}?scriptId=${scriptId}`, {
          headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
          signal: AbortSignal.timeout(timeoutMs),
        })
        return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) }
      } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'fel' } }
    }

    steps.step2 = await callStep('/api/media/cron/step2')   // röst + bild
    steps.step3 = await callStep('/api/media/cron/step3')   // render-start

    // Poll step4 tills render klar (video_status='ready') eller timeout (~3 min).
    let ready = false
    for (let i = 0; i < 14 && !ready; i++) {
      await sleep(12_000)
      await callStep('/api/media/cron/step4', 90_000)
      const { data: row } = await db.from('media_scripts').select('video_status').eq('id', scriptId).single()
      ready = (row as { video_status?: string } | null)?.video_status === 'ready'
    }
    steps.renderReady = ready

    if (ready) {
      steps.publish = await callStep('/api/media/cron/publish')   // IG + FB
      steps.youtube = await callStep('/api/media/cron/youtube')   // YouTube
    } else {
      // Säkerhetsnät: pipeline-retry/publish plockar upp den ready breaking-videon inom kort.
      steps.note = 'Render tog längre än inline-budgeten — publiceras automatiskt så snart den är klar.'
    }

    return NextResponse.json({ ok: true, breaking: true, scriptId, hook: script.hook, steps })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    console.error('[breaking]', message)
    return NextResponse.json({ ok: false, error: message, steps }, { status: 500 })
  }
}
