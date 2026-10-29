import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { isHandlarborsenProject } from '@/lib/os/project-command-center'
import type { KnownContacts } from './known-contacts'
import { archiveDigest } from './research-archive-api'
import { parseResearchArchive, reconcileArchiveWithCrm, type ArchiveReview } from './research-archive'
import { documentedPilotHistoryEntries } from './documented-pilot-history'

/**
 * Safe owner-only projection: excludes every CRM contact record, email,
 * phone number or service role. The view never grants outreach clearance.
 */
export async function loadArchivedLeadResearchForOwner(projectId: string, known: KnownContacts): Promise<ArchiveReview> {
  if (projectId !== HANDLARBORSEN_PROJECT_ID || process.env.VERCEL_ENV === 'production' ||
    process.env.HB_LEADFINDER_RESEARCH_ARCHIVE_ENABLED !== 'true') return { status: 'disabled' }
  try {
    const db = await createClient()
    const { data: auth, error: authError } = await db.auth.getUser()
    const user = auth.user
    if (authError || !user) return { status: 'unavailable' }
    const { data: project, error: projectError } = await db.from('projects')
      .select('id,slug,name,owner_id')
      .eq('id', projectId).eq('owner_id', user.id).maybeSingle()
    if (projectError || !project || !isHandlarborsenProject(project)) return { status: 'unavailable' }
    // The table has a separate owner-AND-project RLS predicate.
    const { data, error } = await (db as unknown as {from(table: string): any}).from('hb_lead_research_archives')
      .select('snapshot_sha256,report,created_at,owner_id')
      .eq('project_id', projectId).eq('owner_id', user.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) return { status: 'unavailable' }
    if (!data) return { status: 'empty' }
    const row = data as unknown as Record<string, unknown>
    const parsed = parseResearchArchive(row.report)
    if (!parsed.ok || typeof row.snapshot_sha256 !== 'string' ||
      row.snapshot_sha256 !== archiveDigest(parsed.value) ||
      row.owner_id !== user.id || typeof row.created_at !== 'string') return { status: 'unavailable' }
    return {
      status: 'ready',
      report: {
        counts: parsed.value.counts,
        result: reconcileArchiveWithCrm(parsed.value, known, documentedPilotHistoryEntries()),
      },
      sourceDigest: row.snapshot_sha256,
      createdAt: row.created_at,
      crmStatus: known.status,
      outreachReady: false,
      historyComplete: false,
    }
  } catch { return { status: 'unavailable' } }
}
