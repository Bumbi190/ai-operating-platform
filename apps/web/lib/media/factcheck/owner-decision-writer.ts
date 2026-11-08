/**
 * The Prompt owner-origin decision writer — deliberately DORMANT.
 *
 * There is NO route, form, worker or cron importing this adapter. It cannot
 * become active until a separately reviewed production migration + owner UI,
 * session-origin/CSRF controls and a final publisher gate are approved.
 *
 * The session's identity is always derived from Supabase auth.getUser().
 * No caller may submit decided_by, project_id, report hashes or timestamps
 * as authoritative. The database proposal independently enforces owner,
 * project, current script version and immutable evidence at INSERT.
 */
import 'server-only'
import type {SupabaseClient} from '@supabase/supabase-js'
import {createClient} from '@/lib/supabase/server'
import {createAdminClient} from '@/lib/supabase/admin'
import {
  parseOwnerDecisionRequest,
  prepareOwnerEditorialDecision,
} from './owner-decision-intent'
import type {
  EditorialProject,CurrentEditorialScript,RecordedFactCheck,
} from './editorial-admission'

const PROJECT_SLUG='ai-media-automation'
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i

export type OwnerEditorialWriteResult =
  | Readonly<{status:'recorded';id:string;decision:'approve'|'reject'}>
  | Readonly<{status:'hold';reason:string}>

/**
 * This is a future manual-only server adapter, not a callable workflow tool.
 *
 * "getUser" validates identity with Supabase Auth, never trusts getSession()
 * claims or a user ID supplied by a request body. The reviewed HTTP route
 * (not yet built) MUST additionally enforce same-origin CSRF prevention and
 * direct human UI interaction. This adapter alone is not such an attestation.
 */
export async function submitAuthenticatedFactCheckDecision(
  untrustedBody:unknown,
):Promise<OwnerEditorialWriteResult> {
  const deny=(reason:string):OwnerEditorialWriteResult=>({status:'hold',reason})
  if (process.env.THE_PROMPT_FACTCHECK_OWNER_DECISIONS_ENABLED!=='true' ||
      process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED!=='true') {
    return deny('factcheck_owner_decisions_disabled')
  }
  const intent=parseOwnerDecisionRequest(untrustedBody)
  if (!intent) return deny('factcheck_decision_invalid_request')
  try {
    // NO service-role client is constructed before server-verified auth.
    const session=await createClient()
    const {data:{user},error:authError}=await session.auth.getUser()
    if (authError || !user || !UUID.test(user.id)) {
      return deny('factcheck_owner_session_required')
    }

    // Production types intentionally do not yet include proposed SQL tables.
    // The cast only adapts Typescript; it grants no RLS or database permissions.
    const db=createAdminClient() as unknown as SupabaseClient
    const p=await db.from('projects')
      .select('id,slug,owner_id,execution_paused')
      .eq('slug',PROJECT_SLUG).maybeSingle()
    if (p.error || !p.data || p.data.owner_id!==user.id ||
        p.data.execution_paused!==false || !UUID.test(p.data.id)) {
      return deny('factcheck_project_owner_required')
    }
    const project=p.data as EditorialProject
    const r=await db.from('media_factcheck_reports')
      .select('id,project_id,script_id,script_version,revision_id,content_sha256,source_set_sha256,reviewer_model,writer_model,risk_tier,outcome,framing,reasons,reviewed_at,recorded_at,manuscript_snapshot,source_receipts,findings')
      .eq('id',intent.reportId).eq('project_id',project.id).maybeSingle()
    if (r.error || !r.data) return deny('factcheck_report_unavailable')
    const report=r.data as unknown as RecordedFactCheck
    if (report.script_id!==intent.expectedScriptId) {
      return deny('factcheck_report_unavailable')
    }
    const s=await db.from('media_scripts')
      .select('id,project_id,version,hook,script,captions,hashtags,cta,tone,estimated_duration,raw_output')
      .eq('id',report.script_id).eq('project_id',project.id).maybeSingle()
    if (s.error || !s.data) return deny('factcheck_script_unavailable')
    const script=s.data as unknown as CurrentEditorialScript
    const prepared=prepareOwnerEditorialDecision({
      request:intent,project,script,report,
      authenticatedUserId:user.id,nowMs:Date.now(),
    })
    if (!prepared.ok) return deny(prepared.reason)
    // Exactly one insert; never upsert, no automatic retries after network
    // ambiguity. The SQL trigger rechecks owner/version/evidence atomically.
    const inserted=await db.from('media_factcheck_editorial_decisions')
      .insert(prepared.row).select('id').single()
    if (inserted.error || !inserted.data ||
        typeof inserted.data.id!=='string' || !UUID.test(inserted.data.id)) {
      return deny('factcheck_editorial_write_unconfirmed')
    }
    return {status:'recorded',id:inserted.data.id,decision:prepared.row.decision}
  } catch {
    // Never echo database details, tokens, model output or user identity.
    return deny('factcheck_editorial_unavailable')
  }
}
