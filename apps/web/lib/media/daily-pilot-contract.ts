import {checkFreshRelevantNews,type FreshNewsLead} from './news-freshness'

/**
 * Server-side editorial preflight for a prospective daily The Prompt pilot.
 * This is a pure safety check, NOT a permission to use provider credentials,
 * publish, spend or assert that caller-supplied "approved" flags are genuine.
 * Callers must fetch and verify all evidence through trusted owner-scoped DB
 * records before using it, and then gate human approval and dispatch separately.
 */
export interface DailyPilotEvidence {
  story:FreshNewsLead
  projectId:string
  scriptId:string
  language:string
  hook:string
  scriptText:string
  audio:{
    url:string
    durationMs:number
    voiceId:string
    modelId:string
    words:{word:string;startMs:number;endMs:number}[]
  }
  images:{
    assetId:string
    projectId:string
    url:string
    rightsVerified:boolean
    newsSpecific:boolean
  }[]
  sourceCrossChecked:boolean
  duplicateNewsChecked:boolean
  humanPreviewApproved:boolean
}
export type PilotReason =
  | 'stale_or_unverified_news' | 'missing_provenance' | 'non_english'
  | 'missing_editorial_approval' | 'missing_approved_images'
  | 'invalid_voice' | 'invalid_audio' | 'missing_captions'
export type DailyPilotDecision={eligible:boolean;reasons:PilotReason[]}
export type PilotStage='private_preview'|'release'
const BRAND_VOICE_ID='qSeXEcewz7tA0Q0qk9fH'
const BRAND_MODEL='eleven_turbo_v2_5'
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
function validMedia(url:string){
  try{
    const u=new URL(url)
    return u.protocol==='https:'&&!u.username&&!u.password&&u.port===''&&!!u.hostname
  }catch{return false}
}

export function evaluateDailyPilotEvidence(
  e:DailyPilotEvidence, nowMs=Date.now(),stage:PilotStage='release',
):DailyPilotDecision {
  const reasons:PilotReason[]=[]
  if(!checkFreshRelevantNews(e.story,nowMs).eligible)reasons.push('stale_or_unverified_news')
  if(!UUID.test(e.projectId)||!UUID.test(e.scriptId)||
    !e.sourceCrossChecked||!e.duplicateNewsChecked||
    !e.story.url||!e.story.title.trim())reasons.push('missing_provenance')
  if(e.language!=='en'||!e.scriptText?.trim()||!e.hook?.trim())reasons.push('non_english')
  if(stage==='release'&&!e.humanPreviewApproved)reasons.push('missing_editorial_approval')

  if(!Array.isArray(e.images)||e.images.length<2||e.images.length>5 ||
     !e.images.every(img=>UUID.test(img.assetId)&&img.projectId===e.projectId &&
       img.rightsVerified&&img.newsSpecific&&validMedia(img.url)) ||
     new Set(e.images.map(i=>i.assetId)).size!==e.images.length)
    reasons.push('missing_approved_images')

  if(e.audio.voiceId!==BRAND_VOICE_ID||e.audio.modelId!==BRAND_MODEL)
    reasons.push('invalid_voice')
  if(!validMedia(e.audio.url)||!Number.isFinite(e.audio.durationMs)||
     e.audio.durationMs<8000||e.audio.durationMs>90000)
    reasons.push('invalid_audio')

  const words=e.audio.words
  if(!Array.isArray(words)||words.length<10||words.length>300||
     !words.every((w,i)=>typeof w.word==='string'&&!!w.word.trim()&&
       Number.isFinite(w.startMs)&&Number.isFinite(w.endMs)&&
       w.startMs>=0&&w.endMs>w.startMs&&
       (i===0||w.startMs>=words[i-1].startMs))||
     words.at(-1)?.endMs>e.audio.durationMs+500)
    reasons.push('missing_captions')
  return {eligible:reasons.length===0,reasons}
}


/**
 * A pure adapter for private video QA: after trusted server-side provenance is
 * fetched and verified, pass exactly these fresh dynamic props into the
 * ThePromptDailyPilot Remotion composition. No DB mutation / render dispatch.
 * Actual release still needs a durably approved exact output, credentials,
 * cost reservation, idempotency and a controlled two-slot schedule.
 */
export function prepareDailyPilotPreview(e:DailyPilotEvidence,nowMs=Date.now()):
  | {ok:true;props:{
    hook:string;audioUrl:string;durationMs:number
    words:DailyPilotEvidence['audio']['words'];images:string[]
    captions:[];sourceLabel:string;sourcePublishedAt:string;sourceUrl:string
    creativeVersion:'the-prompt-editorial-v1'
  }}
  | {ok:false;reasons:PilotReason[]} {
  const result=evaluateDailyPilotEvidence(e,nowMs,'private_preview')
  if(!result.eligible)return {ok:false,reasons:result.reasons}
  return {ok:true,props:{
    hook:e.hook.trim(),audioUrl:e.audio.url,durationMs:e.audio.durationMs,
    words:e.audio.words,images:e.images.map(x=>x.url),captions:[],
    sourceLabel:e.story.sourceLabel,sourceUrl:e.story.url,
    sourcePublishedAt:e.story.publishedAt.toISOString(),
    creativeVersion:'the-prompt-editorial-v1',
  }}
}
