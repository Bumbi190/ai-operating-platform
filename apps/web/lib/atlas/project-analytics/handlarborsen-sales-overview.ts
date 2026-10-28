import 'server-only'

import { assertProjectAllowed } from '@/lib/atlas/isolation'
import {
  HANDLARBORSEN_PROJECT_ID,
  HANDLARBORSEN_PROJECT_SLUG,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'

/**
 * Fixed-project, aggregate-only snapshot of the EXISTING sales system.
 *
 * All source reads use PostgREST HEAD + exact count; no contact, header, body,
 * organization number or workflow content ever reaches the model. Not a
 * substitute for the separate owner-authorized CRM/review screens.
 */
type ReadContext = {
  db: any
  userId: string
  allowedProjectIds: string[]
  now?: Date
}

type MetricSpec = {
  key: string
  source: string
  filterColumn?: string
  filterValue?: string
}

const PROJECT = HANDLARBORSEN_PROJECT_ID

// Fixed at build-time, not influenced by an LLM/client-supplied table, project,
// status, email, contact ID, JSON path, or filter.
const METRICS: readonly MetricSpec[] = [
  { key: 'sales_contacts_total', source: 'sales_contacts' },
  { key: 'sales_contacts_suppressed_flag', source: 'sales_contacts', filterColumn: 'data->>suppressed', filterValue: 'true' },
  { key: 'sales_contacts_confirmed_flag', source: 'sales_contacts', filterColumn: 'data->>confirmed', filterValue: 'true' },
  { key: 'sales_contacts_excluded_flag', source: 'sales_contacts', filterColumn: 'data->>excluded', filterValue: 'true' },
  { key: 'sales_jobs_total', source: 'sales_jobs' },
  { key: 'sales_draft_revisions_total', source: 'sales_draft_revisions' },
  { key: 'synced_inbox_messages_total', source: 'sales_inbox_messages' },
  { key: 'mailbox_connections_total', source: 'sales_mailbox_connections' },
  { key: 'reply_jobs_total', source: 'sales_reply_jobs' },
  { key: 'reply_jobs_awaiting_review', source: 'sales_reply_jobs', filterColumn: 'status', filterValue: 'awaiting_review' },
  { key: 'reply_draft_revisions_total', source: 'sales_reply_draft_revisions' },
  { key: 'send_jobs_total', source: 'sales_send_jobs' },
  { key: 'send_jobs_smtp_accepted', source: 'sales_send_jobs', filterColumn: 'status', filterValue: 'smtp_accepted' },
  { key: 'scb_review_queue_total', source: 'hb_lead_candidates' },
  { key: 'handlarborsen_candidate_inbox_total', source: 'handlarborsen_candidate_inbox' },
]

export async function readHandlarborsenSalesOverview(context: ReadContext) {
  const { db, userId, allowedProjectIds } = context
  if (!userId || !assertProjectAllowed(PROJECT, allowedProjectIds)) {
    return { status: 'not_permitted' as const }
  }

  // Admin/service DB is used by chat, so independently prove ownership and
  // the live mode before issuing ANY count against privileged tables.
  try {
    const { data: project, error: projectError } = await db.from('projects')
      .select('id,slug,atlas_mode')
      .eq('id', PROJECT)
      .eq('owner_id', userId)
      .maybeSingle()

    if (projectError || !project ||
        project.id !== PROJECT ||
        project.slug !== HANDLARBORSEN_PROJECT_SLUG ||
        !['observer', 'active'].includes(project.atlas_mode)) {
      return { status: 'not_permitted' as const }
    }
  } catch {
    return { status: 'not_permitted' as const }
  }

  try {
    const results = await Promise.all(METRICS.map(async metric => {
      // HEAD means zero row content is fetched; only PostgREST count is read.
      let query = db.from(metric.source)
        .select('project_id', { head: true, count: 'exact' })
        .eq('project_id', PROJECT)
      if (metric.filterColumn && metric.filterValue) {
        query = query.eq(metric.filterColumn, metric.filterValue)
      }
      const { count, error } = await query
      if (error || !Number.isSafeInteger(count) || count < 0) {
        throw new Error('aggregate_unavailable')
      }
      return {
        key: metric.key,
        source: metric.source,
        count: count as number,
      }
    }))

    return {
      status: 'ok' as const,
      source: 'handlarborsen_project_scoped_sales_tables',
      projectSlug: HANDLARBORSEN_PROJECT_SLUG,
      observedAt: (context.now ?? new Date()).toISOString(),
      dataScope: 'handlarborsen_only',
      readMethod: 'head_exact_counts_no_rows',
      consistency: 'non_atomic_multi_table_observation',
      metrics: results,
      interpretation: [
        'sales_contacts är lagrade CRM-kontaktposter, inte aktiva eller kontaktgodkända leads.',
        'CRM-flaggor confirmed, excluded och suppressed är överlappande metadata, inte separata summerbara kohorter eller tillstånd att skicka.',
        'sales_reply_jobs awaiting_review är ett internt granskningsläge, inte ett godkänt svar.',
        'sales_send_jobs smtp_accepted innebär SMTP-mottagning, INTE verifierad leverans eller läsning hos mottagaren.',
        'scb_review_queue_total gäller endast den redan importerade hb_lead_candidates-tabellen; lokalt granskade SCB-underlag kan finnas separat.',
        'sales_inbox_messages räknar synkade poster men ger INTE rätt att läsa brödtext eller identifierande kontaktuppgifter.',
        'Mätningarna är separata exakta HEAD-counts, inte ett transaktionskonsistent ögonblicksfoto. Vid fel returneras ingen partiell eller påhittad nolla.',
        'Ingen funktion för kontaktgodkännande, import, skicka-mejl eller workflowexekvering ingår i denna läsning.',
      ],
      contactPermissionInferred: false as const,
      sendingEnabledByThisTool: false as const,
    }
  } catch {
    return { status: 'unavailable' as const, reason: 'aggregate_unavailable' as const }
  }
}
