/**
 * lib/os/attention.ts
 *
 * Samlad insamling av alla operativa uppmärksamhetssignaler — EN motor för
 * "vad ska operatören göra härnäst". Lyft ur Action Center-sidan (P0) så att
 * Atlas hem och övriga ytor delar exakt samma lista.
 *
 * Källor:
 *   1. buildAttentionItems  — business-snapshots (fel, godkännanden, vilande, publicerat)
 *   2. social_credential_health — projektens utgångna, döende eller ej verifierade credentials
 *   3. media_scripts        — pipeline-steg som nått max försök
 *   4. cron_heartbeat       — döda/sena cron-jobb
 */

import { scopeProjectFilter } from '@/lib/atlas/isolation'
import type { Project } from '@/lib/supabase/types'
import { fetchBusinessSnapshots } from './business'
import { buildAttentionItems, type AttentionItem } from './priority'

type AnyDb = any

/** Credential health a person has to act on, and how each is named. */
const URGENT_CREDENTIAL_TITLES: Record<string, string> = {
  expired: 'credentialen är ogiltig eller har gått ut',
  account_mismatch: 'credentialen tillhör inte projektets verifierade konto',
  binding_blocked: 'kontobindningen är spärrad',
  credential_missing: 'credential saknas för det kopplade kontot',
}

export interface AttentionResult {
  items: AttentionItem[]
  urgent: AttentionItem[]
  important: AttentionItem[]
  info: AttentionItem[]
  /** antal som faktiskt kräver åtgärd (urgent + important) */
  actionable: number
}

/**
 * `allowedProjectIds` is REQUIRED. `projects` alone was not enough: the counts
 * and the stuck-pipeline scan below are this function's OWN reads and were
 * global, so another tenant's published-script count could raise an alarm here
 * and a foreign video's `hook` could be printed verbatim in an item title.
 *
 * Social credential health is project-owned and read for the caller's projects
 * only. `cron_heartbeat` is deliberately left unscoped — it has no project_id; it
 * describes platform infrastructure, not tenant data.
 */
export async function collectAttentionItems(
  db: AnyDb,
  projects: Project[],
  allowedProjectIds: string[],
): Promise<AttentionResult> {
  const scopedIds = scopeProjectFilter(allowedProjectIds)
  const businesses = await fetchBusinessSnapshots(db, projects, { kind: 'operator', allowedProjectIds })

  const [pubCountRes, insCountRes] = await Promise.all([
    (db.from('media_scripts') as any).select('id', { count: 'exact', head: true })
      .in('project_id', scopedIds).eq('status', 'published'),
    // `media_insights.project_id` is nullable; `.in()` excludes NULL, which is
    // the rule the Atlas call sites already apply to nullable ownership.
    (db.from('media_insights') as any).select('id', { count: 'exact', head: true })
      .in('project_id', scopedIds),
  ])
  const instagramInsightsMissing = (pubCountRes.count ?? 0) > 0 && (insCountRes.count ?? 0) === 0

  const items = buildAttentionItems(businesses, { instagramInsightsMissing })

  // Credential-larm från social_credential_health (samma sanningskälla som Operations
  // Center) — per projekt, och bara för operatörens egna projekt.
  try {
    const { data: tokens } = await (db.from('social_credential_health') as any)
      .select('project_id, platform, status, days_left')
      .in('project_id', scopedIds)
    const projectName = new Map(projects.map(p => [p.id, p.name]))
    for (const t of (tokens ?? []) as Array<{ project_id: string; platform: string; status: string; days_left: number | null }>) {
      const who = `${projectName.get(t.project_id) ?? 'Okänt projekt'} · ${t.platform}`
      const urgentTitle = URGENT_CREDENTIAL_TITLES[t.status]
      if (urgentTitle) {
        items.unshift({
          id: `token-${t.project_id}-${t.platform}`, score: 95, severity: 'urgent',
          title: `${who}: ${urgentTitle}`,
          reason: 'Publicering till den här kanalen stoppas tills projektets credential åtgärdas.',
          action: { href: '/atlas/operations', label: 'Visa' },
        } as AttentionItem)
      } else if (t.status === 'warning') {
        items.unshift({
          id: `token-${t.project_id}-${t.platform}`, score: 70, severity: 'important',
          title: `${who}: token löper ut${t.days_left != null ? ` om ${t.days_left} dagar` : ' snart'}`,
          reason: 'Förnya innan utgång så att publiceringen inte stoppas.',
          action: { href: '/atlas/operations', label: 'Visa' },
        } as AttentionItem)
      } else if (t.status === 'verification_failed') {
        items.unshift({
          id: `token-${t.project_id}-${t.platform}`, score: 60, severity: 'important',
          title: `${who}: credentialn kunde inte verifieras vid senaste kontrollen`,
          reason: 'Plattformen gick inte att fråga. Nästa kontroll försöker igen.',
          action: { href: '/atlas/operations', label: 'Visa' },
        } as AttentionItem)
      }
    }
  } catch { /* social_credential_health saknas ännu — icke-kritiskt */ }

  // Pipeline-steg som nått max försök (kräver operatör) → brådskande.
  try {
    // Scope precedes `.limit(10)`: ten foreign stuck videos would otherwise
    // fill the slice and hide the operator's own broken pipeline entirely.
    const { data: stuck } = await (db.from('media_scripts') as any)
      .select('id, hook, voice_status, video_status, voice_attempts, render_attempts, pipeline_failed_reason')
      .in('project_id', scopedIds)
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
