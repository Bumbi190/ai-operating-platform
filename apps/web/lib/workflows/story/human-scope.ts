import {canonicalTargetVersionHash} from '@/lib/atlas/authorization/build'
import {STORY_MODEL,STORY_PROVIDER,STORY_MAX_TOKENS} from './dispatch-contract'
export {assertApprovedStorySpend} from '@/lib/cost/approved-spend'
export interface HumanStoryScope{actionTargetHash:string;briefHash:string;promptHash:string;maximumSek:string}
export function humanStoryTargetHash(scope:HumanStoryScope):string{
 if(!/^[0-9]+\.[0-9]{4}$/.test(scope.maximumSek)||Number(scope.maximumSek)<=0||Number(scope.maximumSek)>1000
  ||![scope.actionTargetHash,scope.briefHash,scope.promptHash].every(h=>/^[a-f0-9]{64}$/.test(h)))throw new Error('Invalid human story scope')
 return canonicalTargetVersionHash({kind:'workflow.human_story_scope',action_target_hash:scope.actionTargetHash,
  brief_hash:scope.briefHash,prompt_hash:scope.promptHash,provider:STORY_PROVIDER,model:STORY_MODEL,
  max_tokens:STORY_MAX_TOKENS,maximum_sek:scope.maximumSek})
}
