/**
 * Atlas (spoken nickname Nova): exception-based editorial policy for The Prompt.
 * Nova is NOT a separate agent. Familje-Stunden's Nova is a fictional child-story character.
 *
 * Goal: Nova independently vets ordinary, well-sourced news. Do not force the
 * project owner to approve every story. Nova asks for human judgment only when
 * material uncertainty, sensitive impact or a real decision is unavoidable.
 *
 * PREVIEW ONLY. No route, cron, worker or publisher imports this policy.
 * Its "automatic_candidate" state has NO spending, rendering, scheduling,
 * social-posting or production approval authority.
 *
 * A future release must add server-attested Nova review receipts (distinct from
 * fake human decisions), a revision-bound final video check, an atomic publisher
 * admission, spending/stop limits, and an opt-in controlled rollout.
 */
import {contentDigest,assessFactCheck,needsEnhancedEditorialRiskReview,
  type ScriptMaterial,type SourceSnapshot} from './contract'
import {sourceSetDigest,type ReviewedFinding} from './independent-review'
import {recognizeSource} from './source-collector'
import {verifiedStoredWriterModel} from '../script-writer-provenance'

const PROJECT_SLUG='ai-media-automation'
const MAX_EVIDENCE_AGE_MS=24*60*60*1000
const MAX_SOURCE_ATTEMPTS=2
const MAX_REWRITES=1
const SHA256=/^[a-f0-9]{64}$/
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i

export type NovaReviewAction =
  | 'automatic_editorial_candidate'
  | 'ask_owner'
  | 'collect_more_evidence'
  | 'request_independent_review'
  | 'select_independent_reviewer'
  | 'rewrite_and_recheck'
  | 'skip_story'
  | 'hold_system'

export type NovaReviewQuestion=Readonly<{
  question:string
  context:string
  sourceUrls:readonly string[]
  options:readonly ['Godkänn för fortsatt redaktionell behandling','Avstå eller välj ny nyhet']
}>
export type NovaReviewPlan=Readonly<{
  agent:'atlas'
  displayName:'Nova'
  action:NovaReviewAction
  reason:string
  question: NovaReviewQuestion|null
  /** Not a green light from a model or from a text similarity score. */
  canSpend:false
  canRender:false
  canSchedule:false
  canPublish:false
}>
export interface NovaStoredScript {
  readonly id:string
  readonly project_id:string
  readonly version:number
  readonly hook:string
  readonly script:string
  readonly captions:readonly string[]
  readonly hashtags:readonly string[]
  readonly cta:string
  readonly tone:string
  readonly estimated_duration:string
  readonly raw_output:unknown
}
export interface NovaReviewInput {
  readonly previewMode:'offline_only'
  readonly featureEnabled:boolean
  readonly project:Readonly<{id:string;slug:string;execution_paused:boolean}>
  readonly script:NovaStoredScript
  /** Trusted from current DB fields, never recreated from an LLM answer. */
  readonly material:ScriptMaterial
  /** Complete, verified-collector snapshots, NOT model-supplied quotations. */
  readonly sources:readonly SourceSnapshot[]
  readonly review:ReviewedFinding|null
  readonly nowMs:number
  readonly sourceAttempts:number
  readonly reviewAttempts:number
  readonly rewrites:number
}

function result(action:NovaReviewAction,reason:string,
  question:NovaReviewQuestion|null=null):NovaReviewPlan {
  return Object.freeze({
    agent:'atlas',displayName:'Nova',action,reason,question,
    canSpend:false,canRender:false,canSchedule:false,canPublish:false,
  })
}
function requireOwner(material:ScriptMaterial,sources:readonly SourceSnapshot[],
  reason:string):NovaReviewPlan {
  const safeUrls=[...new Set(sources.map(s=>recognizeSource(s.url)?.url)
    .filter((s):s is string=>typeof s==='string'))].slice(0,4)
  return result('ask_owner',reason,Object.freeze({
    question:'Källorna stöder nyheten, men ämnet är känsligt. Vill du att jag fortsätter redaktionellt eller väljer en annan nyhet?',
    context:material.hook.slice(0,240),
    sourceUrls:Object.freeze(safeUrls),
    options:['Godkänn för fortsatt redaktionell behandling',
      'Avstå eller välj ny nyhet'] as const,
  }))
}
function distinctTrustedSources(sources:readonly SourceSnapshot[],
  nowMs:number):boolean {
  if(!Array.isArray(sources)||sources.length<2||sources.length>4)return false
  const ids=new Set<string>()
  const urls=new Set<string>()
  const groups=new Set<string>()
  const kinds=new Set<string>()
  for(const source of sources){
    if(!source || typeof source.id!=='string' ||
       typeof source.text!=='string' || source.text.length<70||
       source.text.length>12000 || typeof source.retrievedAt!=='string')return false
    const sourceDate=Date.parse(source.retrievedAt)
    if(!Number.isFinite(sourceDate) || sourceDate>nowMs ||
       sourceDate<=nowMs-MAX_EVIDENCE_AGE_MS)return false
    const recognized=recognizeSource(source.url)
    if(!recognized || recognized.url!==source.url ||
       recognized.group!==source.publisherGroup ||
       recognized.kind!==source.kind ||
       ids.has(source.id)||urls.has(source.url))return false
    ids.add(source.id)
    urls.add(source.url)
    groups.add(source.publisherGroup)
    kinds.add(source.kind)
  }
  // A primary source plus independent *reporting*, not just two press-release
  // mirrors. If this cannot be established, collect more/skip instead of
  // claiming autonomous fact verification.
  return groups.size>=2 && kinds.has('primary') &&
    kinds.has('independent_reporting')
}
function storyIdentity(input:NovaReviewInput):boolean {
  const {project,script,material}=input
  if(!project||!script||!material||project.slug!==PROJECT_SLUG ||
     !UUID.test(project.id)||project.execution_paused!==false ||
     !UUID.test(script.id)||!UUID.test(script.project_id)||
     project.id!==script.project_id||material.projectId!==project.id||
     material.scriptId!==script.id||
     !Number.isSafeInteger(script.version)||script.version<1||
     material.revisionId!=='v'+script.version||
     script.hook!==material.hook||script.script!==material.script||
     JSON.stringify(script.captions)!==JSON.stringify(material.captions)||
     script.cta!==(material.cta??''))return false
  return true
}
function failurePlan(input:NovaReviewInput,reason:string):NovaReviewPlan {
  const technicalReasons=new Set([
    'invalid_script','clock_unavailable','wrong_project_or_revision',
    'assessment_stale','invalid_source_snapshot','assessment_missing',
  ])
  if(technicalReasons.has(reason)){
    return result('hold_system','technical_or_stale_factcheck_evidence')
  }
  if(reason==='material_claim_contradicted_or_misleading'||
     reason==='misleading_framing'){
    if(input.rewrites<MAX_REWRITES)
      return result('rewrite_and_recheck','novas_claims_or_framing_conflicted')
    return result('skip_story','repeated_unverifiable_or_misleading_claims')
  }
  if(input.sourceAttempts<MAX_SOURCE_ATTEMPTS){
    return result('collect_more_evidence','nova_needs_independent_confirmation')
  }
  return result('skip_story','cannot_corroborate_without_guessing')
}

/**
 * Classification of editorial work, not an action executor.
 *
 * No automatic route is returned unless the ORIGINAL writer's provider is
 * independently verifiable, EVERY public-facing sentence is corroborated
 * in the exact unchanged source snapshots, sources have distinct publisher
 * ownership (including a primary source), and there is no high-impact risk.
 */
export function planNovaEditorialReview(input:NovaReviewInput):NovaReviewPlan {
  try {
    if(!input||input.previewMode!=='offline_only'||input.featureEnabled!==true){
      return result('hold_system','nova_autonomy_not_enabled')
    }
    if(!Number.isFinite(input.nowMs)||
       !Number.isSafeInteger(input.sourceAttempts)||
       !Number.isSafeInteger(input.reviewAttempts)||
       !Number.isSafeInteger(input.rewrites)||
       input.sourceAttempts<0||input.sourceAttempts>MAX_SOURCE_ATTEMPTS||
       input.reviewAttempts<0||input.reviewAttempts>2||
       input.rewrites<0||input.rewrites>MAX_REWRITES||
       !storyIdentity(input)){
      return result('hold_system','project_or_manuscript_revision_mismatch')
    }
    const writerModel=verifiedStoredWriterModel(input.script.raw_output,{
      ...input.script,
      captions:[...input.script.captions],
      hashtags:[...input.script.hashtags],
    })
    if(!writerModel){
      return result('hold_system','unverified_script_writer_provenance')
    }
    // Today's independent reviewer runs on OpenAI. A GPT-authored story must
    // go to a DIFFERENT provider; do not ask the owner to debug model routing.
    if(!writerModel.startsWith('claude-')){
      // Select another governed provider; do not pretend OpenAI can independently
      // verify a script written by the same provider.
      if(input.reviewAttempts<2){
        return result('select_independent_reviewer','different_provider_required')
      }
      return result('skip_story','independent_reviewer_not_available')
    }
    if(!distinctTrustedSources(input.sources,input.nowMs)){
      if(input.sourceAttempts<MAX_SOURCE_ATTEMPTS){
        return result('collect_more_evidence','primary_and_independent_reporting_required')
      }
      return result('skip_story','insufficient_independent_original_sources')
    }
    if(!input.review || !input.review.assessment){
      if(input.reviewAttempts<2){
        return result('request_independent_review',
          'nova_needs_independent_semantic_verification')
      }
      return result('skip_story','independent_review_could_not_complete')
    }
    if(input.review.model!=='gpt-5.4-mini'||
       !SHA256.test(input.review.sourceSetSha256)||
       input.review.sourceSetSha256!==sourceSetDigest(input.sources)||
       input.review.assessment.projectId!==input.material.projectId ||
       input.review.assessment.scriptId!==input.material.scriptId ||
       input.review.assessment.revisionId!==input.material.revisionId||
       input.review.assessment.contentSha256!==contentDigest(input.material)){
      return result('hold_system','independent_review_missing_or_unbound')
    }
    const actual=assessFactCheck(input.material,input.sources,
      input.review.assessment,input.nowMs)
    if(actual.contentSha256!==input.review.decision.contentSha256||
       actual.outcome!==input.review.decision.outcome||
       JSON.stringify(actual.reasons)!==JSON.stringify(input.review.decision.reasons)||
       actual.unitCount!==input.review.decision.unitCount||
       actual.reviewedSourceCount!==input.review.decision.reviewedSourceCount){
      return result('hold_system','review_decision_not_consistent_with_evidence')
    }
    if(needsEnhancedEditorialRiskReview(input.material)){
      // A human is asked only after Nova has done an independent substantive
      // check. An unsupported sensitive claim is NOT made publishable by a yes.
      if(actual.outcome==='requires_review'&&
         actual.reasons.length===1&&
         actual.reasons[0]==='sensitive_or_unclassified'){
        return requireOwner(input.material,input.sources,
          'sensitive_or_high_impact_editorial_decision')
      }
      return failurePlan(input,actual.reasons[0]??'high_impact_uncertainty')
    }
    if(actual.outcome==='ready_for_editor' && actual.reasons.length===0){
      return result('automatic_editorial_candidate',
        'ordinary_story_independently_supported')
    }
    return failurePlan(input,actual.reasons[0]??'review_not_supported')
  }catch{
    return result('hold_system','nova_review_inputs_invalid')
  }
}
