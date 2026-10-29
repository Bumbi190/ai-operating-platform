/**
 * Atlas (voice alias Nova) / The Prompt: validate a delegated RUN_BOUND
 * project workflow step. No separately registered Nova agent is required.
 *
 * This is a PURE, SHADOW-ONLY DB evidence preflight. It cannot authenticate
 * the physical worker holding the claim or authorize spend, media or posting.
 * Input rows must be read independently from the actual project-scoped DB.
 *
 * Distinguishes a delegated project workforce role from Atlas's central
 * executive identity and the owner's account. It validates role registration,
 * frozen run.steps_snapshot assignment, project workflow,
 * current run claim/lease and one completed run_logs assistant step.
 */
import {createHash} from 'node:crypto'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256=/^[0-9a-f]{64}$/

/** Stable SHA256 over the exact persisted UTF-8 assistant output bytes. */
export function novaStepOutputSha256(content:string):string {
  return createHash('sha256').update(content,'utf8').digest('hex')
}

export interface NovaAssignedRun {
  readonly id:string
  readonly project_id:string
  readonly workflow_id:string|null
  readonly claim_id:string|null
  readonly status:string
  readonly cancel_requested:boolean
  readonly lease_until:string|null
  readonly claimed_at:string|null
  readonly steps_snapshot:unknown
}
export interface NovaAgentRecord {
  readonly id:string
  readonly project_id:string
  readonly name:string
}
export interface NovaWorkflowRecord {
  readonly id:string
  readonly project_id:string
}
export interface NovaStepLogRecord {
  readonly id:string
  readonly run_id:string
  readonly step_order:number|null
  readonly step_name:string|null
  readonly role:string
  readonly content:string
  readonly created_at:string
}
export interface NovaStepBinding {
  readonly projectId:string
  readonly agentId:string
  readonly runId:string
  readonly claimId:string
  readonly workflowId:string
  readonly stepOrder:number
  readonly stepName:string
  readonly stepLogId:string
  readonly outputSha256:string
}
export type NovaStepBindingPreview=
  | Readonly<{ok:true;binding:Readonly<NovaStepBinding>}>
  | Readonly<{ok:false;reason:string}>

export interface NovaStepAssignmentInput {
  readonly mode:'shadow_only'
  readonly featureEnabled:boolean
  readonly projectId:string
  readonly agent:NovaAgentRecord
  readonly workflow:NovaWorkflowRecord
  readonly run:NovaAssignedRun
  readonly assistantLog:NovaStepLogRecord
  readonly nowMs:number
}

export function proveNovaAssignedWorkflowStep(
  input:NovaStepAssignmentInput,
):NovaStepBindingPreview {
  const hold=(reason:string):NovaStepBindingPreview=>({ok:false,reason})
  try {
    if(!input || input.mode!=='shadow_only' ||
       input.featureEnabled!==true){
      return hold('nova_assignment_disabled')
    }
    const {projectId,agent,workflow,run,assistantLog:log,nowMs}=input
    if(!Number.isFinite(nowMs) || !UUID.test(projectId) ||
       !agent || !UUID.test(agent.id) ||
       agent.project_id!==projectId ||
       typeof agent.name!=='string' ||
       !agent.name.trim() || agent.name.trim().toLowerCase()==='nova'){
      // A role called Nova would recreate the identity confusion. The real
      // Atlas executive actor is NOT a row in the workforce-role registry.
      return hold('delegated_role_identity_invalid')
    }
    if(!workflow || !UUID.test(workflow.id) ||
       workflow.project_id!==projectId ||
       !run || !UUID.test(run.id) ||
       !UUID.test(run.claim_id??'') ||
       run.project_id!==projectId ||
       run.workflow_id!==workflow.id ||
       run.status!=='running' ||
       run.cancel_requested!==false ||
       typeof run.lease_until!=='string' ||
       typeof run.claimed_at!=='string' ||
       !Number.isFinite(Date.parse(run.claimed_at)) ||
       Date.parse(run.claimed_at)>nowMs ||
       !Number.isFinite(Date.parse(run.lease_until)) ||
       Date.parse(run.lease_until)<=nowMs){
      return hold('nova_workflow_or_claim_not_current')
    }
    // Immutable per-run snapshot is the only accepted assignment source.
    // Never fall back to today's mutable workflows.steps for an older run.
    if(!Array.isArray(run.steps_snapshot) ||
       run.steps_snapshot.length<1 ||
       run.steps_snapshot.length>24) {
      return hold('nova_frozen_step_assignment_missing')
    }
    const orders=new Set<number>()
    let boundOrder:number|null=null
    let boundName=''
    let occurrences=0
    for(const value of run.steps_snapshot){
      if(!value || typeof value!=='object' || Array.isArray(value)){
        return hold('nova_workflow_step_malformed')
      }
      const step=value as Record<string,unknown>
      if(!Number.isSafeInteger(step.order) ||
         (step.order as number)<1 ||
         (step.order as number)>1000 ||
         typeof step.name!=='string' ||
         step.name.trim().length<1 ||
         step.name.length>150 ||
         typeof step.agent_id!=='string' ||
         !UUID.test(step.agent_id) ||
         orders.has(step.order as number)) {
        return hold('nova_workflow_step_malformed')
      }
      orders.add(step.order as number)
      if(step.agent_id===agent.id){
        occurrences++
        boundOrder=step.order as number
        boundName=step.name
      }
    }
    if(occurrences!==1 || boundOrder===null){
      return hold('nova_step_identity_not_unique')
    }
    // Log is not a cryptographic execution attestation. It is only proof
    // that the durable runner recorded one assistant result for this step.
    if(!log || !UUID.test(log.id) ||
       log.run_id!==run.id ||
       log.step_order!==boundOrder ||
       log.step_name!==boundName ||
       log.role!=='assistant' ||
       typeof log.content!=='string' ||
       log.content.trim().length<12 ||
       log.content.length>64_000 ||
       typeof log.created_at!=='string' ||
       !Number.isFinite(Date.parse(log.created_at)) ||
       Date.parse(log.created_at)<Date.parse(run.claimed_at) ||
       Date.parse(log.created_at)>nowMs){
      return hold('nova_completed_step_log_mismatch')
    }
    const outputSha256=novaStepOutputSha256(log.content)
    if(!SHA256.test(outputSha256))return hold('nova_log_digest_failed')
    return {ok:true,binding:Object.freeze({
      projectId,agentId:agent.id,runId:run.id,
      claimId:run.claim_id!,workflowId:workflow.id,
      stepOrder:boundOrder,stepName:boundName,
      stepLogId:log.id,outputSha256,
    })}
  } catch {
    return hold('nova_assignment_input_invalid')
  }
}
