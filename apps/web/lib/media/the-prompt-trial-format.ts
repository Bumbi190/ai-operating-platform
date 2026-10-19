/**
 * The Prompt creative treatment decision: content and fact checking belong
 * to the same authenticated, approved news item regardless of variant.
 * Neither a stock background nor a decorative AI diagram is documentary
 * evidence. A trial format selector cannot authorize publishing.
 */
import type {CreativeVariant} from './the-prompt-trial-plan'

export interface TrialVisualInput {
  variant:CreativeVariant
  verifiedNewsSource:boolean
  storyId:string
  scriptId:string
  voiceId:string
  englishCaptionsVerified:boolean
  visuals:{sourceId:string;storySpecific:boolean;rightsReviewed:boolean;kind:'source_visual'|'illustrative'}[]
}
export type TrialVisualDecision={
  eligibleForPrivateComparison:boolean
  reasons:string[]
  visualEvidence:'source_specific'|'illustrative'|'missing'
}
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
export function assessTrialVisualTreatment(input:TrialVisualInput):TrialVisualDecision{
  const reasons:string[]=[]
  if(!UUID.test(input.storyId)||!UUID.test(input.scriptId)||!input.verifiedNewsSource)
    reasons.push('unverified_story')
  if(input.voiceId!=='qSeXEcewz7tA0Q0qk9fH'||!input.englishCaptionsVerified)
    reasons.push('audio_or_captions_unverified')
  if(!Array.isArray(input.visuals)||input.visuals.length===0)
    reasons.push('visuals_missing')
  else if(input.visuals.some(v=>!v.sourceId||!v.rightsReviewed))
    reasons.push('visual_rights_unverified')
  const specific=input.visuals.filter(v=>v.kind==='source_visual'&&v.storySpecific)
  if(input.variant==='story_visual'&&specific.length<2)
    reasons.push('story_visual_needs_two_specific_visuals')
  // Text+graphics is a valid experiment, but never label its imagery as
  // documentary evidence or claim it had more photos than it really does.
  const visualEvidence=specific.length>=2?'source_specific':
    input.visuals.length?'illustrative':'missing'
  return {eligibleForPrivateComparison:reasons.length===0,reasons,visualEvidence}
}
