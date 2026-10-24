import 'server-only'
import {findVendoredDefinition} from '../definitions'
import {composeMonthlyBrief,computeMonthlyBriefHash} from '../brief/compose'
import {readStoryRequirements} from './requirements'
import {buildStoryPromptContract,computeStoryPromptHash} from './prompt'
import {humanStoryTargetHash} from './human-scope'
import {STORY_MODEL,STORY_PROVIDER,STORY_MAX_TOKENS} from './dispatch-contract'
import {readRunBoundAuthorizationHistory} from '@/lib/atlas/authorization/store'
import {isEffectiveNow} from '@/lib/atlas/authorization/derive'
import {computeExecutionAuthorizationTarget,WORKFLOW_EXECUTION_ACTION_KIND} from '../effect/execution-authorization'
export class HumanStoryAuthorizationError extends Error{}
/** Immutable human provenance is distinct from, and cannot assert, an autonomy licence. */
export async function humanStoryReadiness(db:any,run:any,instance:any,actionTargetHash:string):Promise<{targetHash:string;maximumSek:number}>{
 const {data:request,error}=await db.from('workflow_human_story_requests').select('*').eq('id',run.human_story_request_id).maybeSingle()
 const proof=await db.from('workflow_human_story_approvals').select('run_id, human_principal').eq('request_id',run.human_story_request_id).eq('run_id',run.id).maybeSingle()
 const owner=await db.from('projects').select('owner_id').eq('id',instance.project_id).maybeSingle()
 const def=findVendoredDefinition(instance.def_key,instance.def_version)
 if(error||proof.error||owner.error||!request||!proof.data||owner.data?.owner_id!==proof.data.human_principal
  ||!def||def.def_key!=='familje-stunden.monthly-release'||def.version!==2||def.def_hash!==instance.def_hash
  ||request.project_id!==instance.project_id||request.instance_id!==instance.id||request.def_hash!==instance.def_hash
  ||request.authorization_id!==run.authorization_id||request.id!==run.attempt_group
  ||request.provider!==STORY_PROVIDER||request.model!==STORY_MODEL||request.max_tokens!==STORY_MAX_TOKENS
  ||run.action_kind!=='generate_monthly_story'||run.action_class!=='FINANCIAL'||instance.current_state!=='content_generation')throw new Error('Human story authority unavailable or drifted')
 const brief=composeMonthlyBrief(def.spec.canonical,instance.instance_key,{defKey:def.def_key,defVersion:2})
 const rules=readStoryRequirements(def.spec.canonical)
 const prompt=buildStoryPromptContract({brief,storyContractVersion:rules.storyContractVersion,characterRefs:rules.characterRefs,
  maxContentSentences:rules.maxContentSentences,targetSentencesMin:rules.targetSentencesMin,targetSentencesMax:rules.targetSentencesMax})
 const targetHash=humanStoryTargetHash({actionTargetHash,briefHash:computeMonthlyBriefHash(brief),promptHash:computeStoryPromptHash(prompt),maximumSek:Number(request.maximum_sek).toFixed(4)})
 if(targetHash!==request.target_version_hash)throw new Error('Human story inputs changed')
 // A cron/drain has no browser session. Fold the SAME canonical ledger core,
 // but only after proving this run's immutable human scope and current owner.
 try{
  const history=await readRunBoundAuthorizationHistory(db,run.authorization_id)
  const target=computeExecutionAuthorizationTarget({instanceId:instance.id,defKey:instance.def_key,defVersion:instance.def_version,
   defHash:instance.def_hash,state:run.workflow_from_state,actionKind:run.action_kind,actionClass:'FINANCIAL',targetVersionHash:targetHash,attemptGroup:run.attempt_group})
  const verdict=isEffectiveNow(history,{at:new Date().toISOString(),target,projectId:instance.project_id,actionKind:WORKFLOW_EXECUTION_ACTION_KIND})
  if(!verdict.effective)throw new Error(verdict.reason)
 }catch{throw new HumanStoryAuthorizationError('Human execution grant is not effective')}
 return {targetHash,maximumSek:Number(request.maximum_sek)}
}
