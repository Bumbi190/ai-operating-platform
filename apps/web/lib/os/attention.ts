/**
 * lib/os/attention.ts
 *
 * Samlad insamling av alla operativa uppmärksamhetssignaler — EN motor för
 * "vad ska operatören göra härnäst". Lyft ur Action Center-sidan (P0) så att
 * Atlas hem och övriga ytor delar exakt samma lista.
 *
 * Källor:
 *   1. buildAttentionItems  — business-snapshots (fel, godkännanden, vilande, publicerat)
 *   2. token_health         — utgångna/döende plattformstokens
 *   3. media_scripts        — pipeline-steg som nått max försök
 *   4. cron_heartbeat       — döda/sena cron-jobb
 */

import type { Project } from '@/lib/supabase/types'
import { fetchBusinessSnapshots } from './business'
import { buildAttentionItems, type AttentionItem } from './priority'

type AnyDb = any

export interface AttentionResult {
  items: AttentionItem[]
  urgent: AttentionItem[]
  important: AttentionItem[]
  info: AttentionItem[]
  /** antal som faktiskt kräver åtgärd (urgent + important) */
  actionable: number
}

export async function collectAttentionItems(
  db: AnyDb,
  projects: Project[],
): Promise<AttentionResult> {
  const businesses = await fetchBusinessSnapshots(db, projects)

  const [pubCountRes, insCountRes] = await Promise.all([
    (db.from('media_scripts') as any).select('id', { count: 'exact', head: true }).eq('status', 'published'),
    (db.from('media_insights') as any).select('id', { count: 'exact', head: true }),
  ])
  const instagramInsightsMissing = (pubCountRes.count ?? 0) > 0 && (insCountRes.count ?? 0) === 0

  const items = buildAttentionItems(businesses, { instagramInsightsMissing })

  // Token-larm direkt från token_health (samma sanningskälla som Operations Center).
  try {
    const { data: tokens } = await (db.from('token_health') as any)
      .select('platform, status, days_left')
    for (const t of (tokens ?? []) as Array<{ platform: string; status: string; days_left: number | null }>) {
      if (t.status === 'expired' || t.status === 'error') {
        items.unshift({
          id: `token-${t.platform}`, score: 95, severity: 'urgent',
          title: `${t.platform}-token ${t.status === 'expired' ? 'har gått ut' : 'svarar med fel'}`,
          reason: 'Publicering till den här kanalen kommer att misslyckas tills tokenet förnyas.',
          action: { href: '/atlas/operations', label: 'Visa' },
        } as AttentionItem)
      } else if (t.status === 'warning') {
        items.unshift({
          id: `token-${t.platform}`, score: 70, severity: 'important',
          title: `${t.platform}-token löper ut${t.days_left != null ? ` om ${t.days_left} dagar` : ' snart'}`,
          reason: 'Förnya innan utgång så att publiceringen inte stoppas.',
          action: { href: '/atlas/operations', label: 'Visa' },
        } as AttentionItem)
      }
    }
  } catch { /* token_health saknas ännu — icke-kritiskt */ }

  // Pipeline-steg som nått max försök (kräver operatör) → brådskande.
  try {
    const { data: stuck } = await (db.from('media_scripts') as any)
      .select('id, hook, voice_status, video_status, voice_attempts, render_attempts, pipeline_failed_reason')
      .or('and(voice_status.eq.failed,voice_attempts.gte.3),and(video_status.eq.failed,render_attempts.gte.3)')
      .limit(10)
    for (const s of (stuck ?? []) as Array<{ id: string; hook: string | null; voice_status: string; pipeline_failed_reason: string | null }>) {
      const step = s.voice_status === 'failed' ? 'voiceover' : 'render'
      items.unshift({
        id: `pipeline-${s.id}`, score: 95, severity: 'urgent',
        title: `Video fastnade i ${step} — max försök nått`,
        reason: `"${(s.hook ?? 'Video').slice(0, 50)}" — ${s.pipeline_failed_reason ?? 'okänt fel'}. Auto-retry uttömt; behöver din åtgärd.`,
        action: { href: '/atlas/operations', label: 'Visa' },
      } as AttentionItem)
    }
  } catch { /* pipeline-kolumner saknas ännu — icke-kritiskt */ }

  // Cron-heartbeat: jobb som är döda/sena/endpoint-trasiga.
  try {
    const { data: hb } = await (db.from('cron_heartbeat') as any)
      .select('jobname, label, status, detail')
      .in('status', ['late', 'dead', 'endpoint_failing'])
    for (const h of (hb ?? []) as Array<{ jobname: string; label: string; status: string; detail: string | null }>) {
      const urgentHb = h.status === 'dead' || h.status === 'endpoint_failing'
      items.unshift({
        id: `heartbeat-${h.jobname}`, score: urgentHb ? 92 : 65, severity: urgentHb ? 'urgent' : 'important',
        title: h.status === 'dead' ? `${h.label} verkar dött`
          : h.status === 'endpoint_failing' ? `${h.label} fyrar men gör inget`
          : `${h.label} är sent`,
        reason: `${h.detail ?? ''} — automationen ${urgentHb ? 'kör inte som den ska' : 'har missat sitt schema'}.`,
        action: { href: '/atlas/operations', label: 'Visa' },
      } as AttentionItem)
    }
  } catch { /* cron_heartbeat saknas ännu — icke-kritiskt */ }

  const urgent    = items.filter(i => i.severity === 'urgent')
  const important = items.filter(i => i.severity === 'important')
  const info      = items.filter(i => i.severity === 'info')

  return { items, urgent, important, info, actionable: urgent.length + important.length }
}
