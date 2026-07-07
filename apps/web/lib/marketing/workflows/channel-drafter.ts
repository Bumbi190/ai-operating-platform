/**
 * Channel Drafter — workflow-handler (Fas 3, WF2).
 *
 * Läser en campaign_brief (run.input.brief_id), bygger en LLM-prompt ur briefen
 * + KB-kanon, anropar Claude för COPY, monterar ett deterministiskt draft_post
 * (asset/CTA/landningssida/must_not styrs i kod — LLM hittar aldrig på dem),
 * persisterar draft_posts (version+1) och KÖAR automatiskt en Brand Guard-run.
 *
 * Kastar vid fel → drainern äger retry/failed. ⛔ The Prompt berörs aldrig.
 */
import 'server-only'
import type { AdminClient, MarketingHandler } from './index'
import type { Run } from '@/lib/supabase/types'
import { runStep } from '@/lib/ai/runner'
import { themeByMonthIndex, resolveTheme } from '@/lib/marketing/kb/marketing-canon'
import {
  buildDrafterSystemPrompt, buildDrafterUserMessage, parseDraftResponse, assembleDraftPost,
} from '@/lib/marketing/drafter'

const DRAFTER_MODEL = 'claude-sonnet-4-6'

export const channelDrafterHandler: MarketingHandler = async (db: AdminClient, run: Run) => {
  const briefId = String((run.input as Record<string, unknown>)?.brief_id ?? '').trim()
  if (!briefId) throw new Error('Channel Drafter: saknar input.brief_id')

  // Hämta brief + plan-kontext (tema).
  const { data: brief } = await db
    .from('campaign_briefs')
    .select('id, project_id, plan_id, brief_key, channel, format, beat, brief_payload')
    .eq('id', briefId)
    .maybeSingle()
  const b = brief as {
    id?: string; project_id?: string; plan_id?: string; brief_key?: string
    channel?: string; format?: string; beat?: string; brief_payload?: Record<string, any>
  } | null
  if (!b?.id) throw new Error(`Channel Drafter: brief ${briefId} saknas`)

  const { data: plan } = await db.from('campaign_plans').select('theme_key, plan_key').eq('id', b.plan_id as string).maybeSingle()
  const themeKey = (plan as { theme_key?: string } | null)?.theme_key ?? null
  const theme = resolveTheme(themeKey) ?? themeByMonthIndex(1)!

  const payload = (b.brief_payload ?? {}) as Record<string, any>
  const briefForPrompt = { ...payload, channel: b.channel, format: b.format, beat: b.beat }

  // Skydd: temaspecifik copy mot ofastställt tema får inte genereras.
  if (!theme.defined) {
    const { data: existing } = await db.from('draft_posts').select('version').eq('brief_id', b.id).order('version', { ascending: false }).limit(1).maybeSingle()
    const version = ((existing as { version?: number } | null)?.version ?? 0) + 1
    const draftKey = `draft-${b.brief_key}-v${version}`
    await (db.from('draft_posts') as any).insert({
      project_id: b.project_id, run_id: run.id, brief_id: b.id, draft_key: draftKey,
      channel: b.channel, format: b.format, beat: b.beat,
      draft_payload: { note: 'Tema ej fastställt — ingen temaspecifik copy genererad.' },
      gaps: [{ field: 'theme', level: 'LUCKA', blocking: true }], needs_input: ['Fastställ tema innan copy genereras'],
      status: 'needs_input', version,
    })
    await db.from('run_logs').insert({ run_id: run.id, role: 'system', content: `⚠️ Tema ${themeKey} ej fastställt — draft satt till needs_input.` })
    return
  }

  // LLM: generera COPY.
  const result = await runStep({
    systemPrompt: buildDrafterSystemPrompt(),
    userMessage: buildDrafterUserMessage(briefForPrompt, theme),
    model: DRAFTER_MODEL,
    maxTokens: 2000,
    temperature: 0.6,
    cost: { projectId: b.project_id ?? null, agent: 'channel-drafter', operation: 'draft_copy' },
  })

  // Montera deterministiskt draft_post.
  const { data: existing } = await db.from('draft_posts').select('version').eq('brief_id', b.id).order('version', { ascending: false }).limit(1).maybeSingle()
  const version = ((existing as { version?: number } | null)?.version ?? 0) + 1
  const draftKey = `draft-${b.brief_key}-v${version}`

  const parsed = parseDraftResponse(result.content)
  const draftPayload = assembleDraftPost(briefForPrompt, theme, parsed, draftKey)

  const { data: draftRow, error: draftErr } = await (db.from('draft_posts') as any).insert({
    project_id: b.project_id,
    run_id: run.id,
    brief_id: b.id,
    draft_key: draftKey,
    channel: b.channel,
    format: b.format,
    beat: b.beat,
    draft_payload: draftPayload,
    self_check: (draftPayload as any).self_check,
    gaps: [],
    needs_input: [],
    canon_level: (draftPayload as any).canon_level,
    status: 'drafted',
    version,
  }).select('id').single()
  if (draftErr) throw new Error(`Channel Drafter: kunde inte spara utkast: ${draftErr.message}`)
  const draftId = (draftRow as { id: string }).id

  // Brief → drafted.
  await db.from('campaign_briefs').update({ status: 'drafted', updated_at: new Date().toISOString() }).eq('id', b.id)

  // Kedja automatiskt vidare till Brand Guard (WF3).
  await (db.from('runs') as any).insert({
    project_id: b.project_id, workflow_id: null, kind: 'marketing_brand_guard',
    status: 'pending', input: { draft_id: draftId }, context: {},
  })

  await db.from('run_logs').insert({
    run_id: run.id, role: 'system',
    content: `✍️ Utkast ${draftKey} (${b.channel}/${b.format}) sparat → guard köad.`,
  })
}
