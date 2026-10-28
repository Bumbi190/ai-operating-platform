/**
 * The Prompt FactCheck evidence writer — SERVER-ONLY, DORMANT.
 *
 * No route, worker or scheduler imports this module. A future reviewed worker
 * must own the RUN_BOUND authority and use vetted source-collector snapshots.
 * Two disabled flags + enforced spend gate protect even accidental invocation.
 * No auto retry / upsert: an ambiguous insert result must be reconciled.
 */
import 'server-only'
import {createAdminClient} from '@/lib/supabase/admin'
import {isSpendGateEnforced} from '@/lib/cost/spend-gate-flag'
import type {RunBoundAuthority} from '@/lib/governance/execution-signal'
import type {SupabaseClient} from '@supabase/supabase-js'
import type {ScriptMaterial,SourceSnapshot} from './contract'
import type {ReviewedFinding} from './independent-review'
import {prepareFactCheckReport, type CurrentRunRow, type CurrentScriptRow} from './report-record'

export type ReportWriteResult =
  | Readonly<{status:'recorded'; reportId:string; outcome:string}>
  | Readonly<{status:'hold'; reason:string}>

export interface WriteFactCheckEvidenceInput {
  readonly material:ScriptMaterial
  readonly sources:readonly SourceSnapshot[]
  readonly review:ReviewedFinding
  /** Actual claimed-run authority granted by Omnira's worker system. */
  readonly authority:RunBoundAuthority
  readonly nowMs:number
}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PROJECT_SLUG='ai-media-automation'

/**
 * Safe absence: do not even create an admin client or look up a project if
 * the model reviewer isn't enabled or the database migration is not released.
 */
export async function persistFactCheckReport(
  input:WriteFactCheckEvidenceInput,
):Promise<ReportWriteResult> {
  const hold=(reason:string):ReportWriteResult=>({status:'hold',reason})
  if (process.env.THE_PROMPT_FACTCHECK_REPORT_WRITES_ENABLED!=='true') {
    return hold('factcheck_report_writes_disabled')
  }
  if (process.env.THE_PROMPT_FACTCHECK_MODEL_ENABLED!=='true' ||
      !isSpendGateEnforced()) {
    return hold('factcheck_review_and_hard_spend_gate_required')
  }
  if (!input || !input.material ||
      !input.authority || input.authority.kind!=='RUN_BOUND' ||
      !UUID.test(input.authority.runId) ||
      !UUID.test(input.authority.claimId) ||
      !UUID.test(input.material.scriptId) ||
      !Number.isFinite(input.nowMs)) {
    return hold('owned_factcheck_run_required')
  }

  try {
    // Production Database type deliberately does not include the uninstalled
    // proposal. This cast is only an API type adaption, never an RLS bypass;
    // service-role access still requires the existing server-side secret.
    const db=createAdminClient() as unknown as SupabaseClient
    const projectResult=await db.from('projects')
      .select('id,slug').eq('slug',PROJECT_SLUG).maybeSingle()
    if (projectResult.error || !projectResult.data ||
        !UUID.test(projectResult.data.id) ||
        projectResult.data.slug!==PROJECT_SLUG) {
      return hold('factcheck_project_not_verified')
    }
    const trustedProjectId=projectResult.data.id as string

    const [scriptRes,runRes]=await Promise.all([
      db.from('media_scripts')
        .select('id,project_id,version,hook,script,captions,cta,raw_output')
        .eq('id',input.material.scriptId).eq('project_id',trustedProjectId)
        .maybeSingle(),
      db.from('runs')
        .select('id,project_id,claim_id,status,cancel_requested,lease_until')
        .eq('id',input.authority.runId).eq('project_id',trustedProjectId)
        .maybeSingle(),
    ])
    if (scriptRes.error || runRes.error ||
        !scriptRes.data || !runRes.data) {
      return hold('factcheck_script_or_run_unavailable')
    }
    const row=scriptRes.data as CurrentScriptRow & {
      raw_output?:unknown
    }
    const actualRun=runRes.data as CurrentRunRow
    if (actualRun.claim_id!==input.authority.claimId) {
      return hold('factcheck_claim_fenced')
    }
    // Existing 2026 scripts lack trustworthy writer provenance in raw_output.
    // Do not guess "Claude" from prompts or from a model's own declaration.
    const raw=row.raw_output
    const writerModel=raw && typeof raw==='object' && !Array.isArray(raw)
      ? (raw as Record<string,unknown>).writer_model : undefined
    if (typeof writerModel!=='string' || !writerModel.trim()) {
      return hold('factcheck_writer_provenance_absent')
    }
    const prepared=prepareFactCheckReport({
      trustedProjectId,
      currentScript:row,
      currentRun:actualRun,
      material:input.material,
      sources:input.sources,
      review:input.review,
      writerModel,
      nowMs:input.nowMs,
    })
    if (!prepared.ok) return hold(prepared.reason)

    // A committed claim can still be fenced during the async preflight. The
    // SQL proposal's BEFORE INSERT trigger rechecks project/script/claim/
    // version/status/lease atomically. Until installed, this INSERT will fail
    // and the caller receives HOLD rather than a fabricated durable report.
    const inserted=await db.from('media_factcheck_reports')
      .insert(prepared.record)
      .select('id')
      .single()
    if (inserted.error || !inserted.data || !UUID.test(inserted.data.id)) {
      // Network ambiguity: the INSERT might have happened even if our read
      // was lost. Never automatically retry an append-only report.
      return hold('factcheck_ledger_write_unconfirmed')
    }
    return {
      status:'recorded',reportId:inserted.data.id as string,
      outcome:prepared.record.outcome,
    }
  } catch {
    return hold('factcheck_ledger_unavailable')
  }
}
