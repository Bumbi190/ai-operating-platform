// Test-only durable feedback/candidate acceptance. Interpretation and copy are explicit fixtures, not model output.
import {testBudgetDrain} from './website-auth-drain-local'
import {probeWorkerSpend,testReservationSafety} from './website-auth-spend-local'
import {executeWebsiteBuildRun} from '../lib/website-build/worker'
import {recordBuildInterpretation,saveBuildCandidate} from '../lib/website-build/store'
import {compileCinematicArtifact,CINEMATIC_BINDING} from '../lib/website-build/studio/cinematic-binding'
export async function runFeedbackAcceptance({db,http,jarA,jarB,f,externalAttempts,projectId,sessionId,initialView,initialArtifact,check}:any){
 const sessionPath='/api/website-builds/'+sessionId,query='?projectId='+projectId,oldId=initialView.activePreviewRevisionId
 const newCopy='Boka en provvisning'
 const input={projectId,idempotencyKey:'real-feedback-change',text:'Byt Roadsterns kontaktknapp till '+newCopy+'.',inputSource:'text',viewedRevisionId:oldId}
 check('feedback_foreign_user_refused',(await http(sessionPath+'/feedback',jarB,input)).status===404)
 const added=await http(sessionPath+'/feedback',jarA,input),retry=await http(sessionPath+'/feedback',jarA,input)
 check('feedback_real_owner_accepted',added.status===200&&Boolean(added.data.id))
 check('feedback_idempotent',retry.status===200&&retry.data.id===added.data.id)
 const queued=await http(sessionPath+query,jarA)
 check('feedback_queues_next_generation',queued.status===200&&queued.data.status==='queued'&&queued.data.activePreviewRevisionId===oldId&&queued.data.revisions.length===1&&Boolean(queued.data.currentRunId))
 const claim=await db.rpc('claim_runs',{p_limit:1,p_lease_seconds:320})
 check('feedback_canonical_claim',!claim.error&&claim.data?.length===1)
 const run=claim.data[0]
 check('feedback_claim_bound_to_successor',run.id===queued.data.currentRunId&&run.input.sessionId===sessionId&&run.input.generation===2)
 if(f.spendGuard){
  await probeWorkerSpend({db,run,check,externalAttempts});
  await testReservationSafety({db,http,jarA,f,check,externalAttempts});
 }
 const paidSteps:string[]=[]
 let stopped=false
 if(!f.spendGuard){
  try{await executeWebsiteBuildRun(db,run,run.claim_id,{beforePaidStep:step=>{paidSteps.push(step.operation);throw Error('LOCAL_NO_PAID_ALLOWANCE')}})}catch(error){stopped=error instanceof Error&&error.message==='LOCAL_NO_PAID_ALLOWANCE'}
  check('feedback_stops_before_real_model',stopped&&paidSteps.length===1&&paidSteps[0]==='website.feedback.interpret')
 }
 const held=await http(sessionPath+query,jarA),before=await http(sessionPath+'/revisions/'+oldId+query,jarA)
 check('feedback_pending_preserves_active_preview',held.data.activePreviewRevisionId===oldId&&held.data.revisions.length===1&&before.data.sha256===initialArtifact.sha256)
 const writer={projectId,sessionId,runId:run.id,claimId:run.claim_id,generation:run.input.generation}
 // Explicit fixture at the durable handoff after model work. No claim/status, approval, source pin or production policy is rewritten.
 await recordBuildInterpretation(db,writer,{items:[{feedbackId:added.data.id,summary:'Update only the reviewed Roadster contact label',disposition:'apply',changeKey:'roadster.cta',supersedesFeedbackIds:[]}]})
 await saveBuildCandidate(db,writer,compileCinematicArtifact(CINEMATIC_BINDING,{roadsterCta:newCopy}))
 const noPaid={beforePaidStep:()=>{throw Error('UNEXPECTED_PAID_STEP_AFTER_CANDIDATE')}}
 await executeWebsiteBuildRun(db,run,run.claim_id,noPaid)
 const after=await http(sessionPath+query,jarA),newId=after.data.activePreviewRevisionId
 check('feedback_commits_second_revision',after.status===200&&after.data.status==='ready'&&after.data.revisions.length===2&&newId!==oldId)
 const updated=await http(sessionPath+'/revisions/'+newId+query,jarA),original=await http(sessionPath+'/revisions/'+oldId+query,jarA)
 check('feedback_new_copy_in_preview',updated.status===200&&updated.data.pages.find((p:any)=>p.key==='roadster').html.includes(newCopy)&&updated.data.sha256!==initialArtifact.sha256)
 check('feedback_old_revision_immutable',original.status===200&&original.data.sha256===initialArtifact.sha256&&JSON.stringify(original.data)===JSON.stringify(initialArtifact))
 check('feedback_other_pages_unchanged',JSON.stringify(updated.data.pages.filter((p:any)=>p.key!=='roadster'))===JSON.stringify(initialArtifact.pages.filter((p:any)=>p.key!=='roadster')))
 check('feedback_media_manifest_unchanged',JSON.stringify(updated.data.assets)===JSON.stringify(initialArtifact.assets))
 const applied=after.data.feedback.find((item:any)=>item.id===added.data.id)
 check('feedback_receipt_points_to_new_revision',applied?.status==='applied'&&applied.appliedRevisionId===newId&&applied.viewedRevisionId===oldId)
 const latest=await db.from('runs').select('*').eq('id',run.id).single()
 check('feedback_completed_marker_persisted',!latest.error&&latest.data.context.websiteBuildCompleted===true)
 await executeWebsiteBuildRun(db,latest.data,run.claim_id,noPaid)
 const unchanged=await http(sessionPath+query,jarA)
 check('feedback_completed_run_replay_idempotent',unchanged.data.revisions.length===2&&unchanged.data.activePreviewRevisionId===newId)
 check('feedback_new_revision_hidden_from_foreign_user',(await http(sessionPath+'/revisions/'+newId+query,jarB)).status===404)
 if(f.drain)await testBudgetDrain({db,http,jarA,sessionPath,query,projectId,oldId:newId,expectedArtifact:updated.data,check,externalAttempts});
 return {oldRevisionId:oldId,newRevisionId:newId,newCopy,oldCopy:initialArtifact.cinematicPreset.copy.roadsterCta}
}
