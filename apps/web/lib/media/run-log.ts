/**
 * run-log.ts — Loggar pipeline-körningar till `runs`-tabellen så att de syns i
 * Omnira-dashboarden ("Senaste körningar") under projektet AI Media Automation.
 *
 * Varje cron-steg anropar logRun() vid lyckad/misslyckad körning. Workflow-raderna
 * ("Fetch AI News", "Generate Script", "Generate Voiceover", "Render Video",
 * "Publish to Social") är förskapade under AI Media Automation-projektet.
 *
 * Helt non-blocking: kastar aldrig, loggar bara om något går fel — pipelinen ska
 * aldrig påverkas av att dashboard-loggningen fallerar.
 */

import { createAdminClient } from '@/lib/supabase/admin'

const MEDIA_PROJECT_SLUG = 'ai-media-automation'

export type PipelineWorkflow =
  | 'Fetch AI News'
  | 'Generate Script'
  | 'Generate Voiceover'
  | 'Render Video'
  | 'Publish to Social'

export interface LogRunOptions {
  workflow:   PipelineWorkflow
  status?:    'done' | 'failed'                 // default: 'done'
  startedAt?: Date                              // default: now
  context?:   Record<string, unknown>           // t.ex. { scriptId, hook }
  error?:     string | null
}

export async function logRun(opts: LogRunOptions): Promise<void> {
  try {
    const db = createAdminClient()

    const { data: project } = await db
      .from('projects')
      .select('id')
      .eq('slug', MEDIA_PROJECT_SLUG)
      .limit(1)
      .single()

    if (!project?.id) {
      console.warn('[run-log] AI Media Automation-projektet hittades inte — hoppar över')
      return
    }

    const { data: workflow } = await db
      .from('workflows')
      .select('id')
      .eq('project_id', project.id)
      .eq('name', opts.workflow)
      .limit(1)
      .maybeSingle()

    const nowIso = new Date().toISOString()

    await db.from('runs').insert({
      project_id:  project.id,
      workflow_id: workflow?.id ?? null,
      status:      opts.status ?? 'done',
      started_at:  (opts.startedAt ?? new Date()).toISOString(),
      finished_at: nowIso,
      context:     opts.context ?? {},
      error:       opts.error ?? null,
    })
  } catch (err) {
    console.error('[run-log] Kunde inte logga körning:', err instanceof Error ? err.message : err)
  }
}
