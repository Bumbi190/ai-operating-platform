/**
 * Read-only audit of persisted The Prompt content; never a publishing authority.
 * Does not invent publisher dates from the ingestion time and never assumes
 * a storage URL proves visual rights or that voice_status proves voice identity.
 */
import {checkFreshRelevantNews} from './news-freshness'

export type PilotReadinessBlocker =
  | 'missing_script'|'wrong_project'|'not_render_ready'|'missing_story'
  | 'source_timestamp_missing'|'source_key_missing'|'source_not_fresh'
  | 'audio_missing'|'voice_identity_unproven'|'timing_unverified'
  | 'images_missing'|'image_rights_unverified'|'owner_approval_missing'

export type ScriptAuditRow={
  id:string;project_id:string;news_item_id:string|null
  hook:string|null;script:string|null;status:string|null
  voice_status:string|null;audio_url:string|null
  timing_url:string|null;duration_ms:number|null
  images:unknown
  raw_output:unknown
}
export type NewsAuditRow={
  id:string;project_id:string;title:string|null;summary:string|null
  url:string|null;source_name:string|null;raw_output:unknown
}
export type PilotReadiness={
  scriptId:string
  projectId:string
  sourcePublishedAt:string|null
  hasVerifiedSourceDate:boolean
  hasAuditableFreshStory:boolean
  canPublish:boolean
  blockers:PilotReadinessBlocker[]
  media:{audioPresent:boolean;timingUrlPresent:boolean;imageCount:number;voiceReceiptRecorded:boolean}
}
const obj=(x:unknown):Record<string,unknown> =>
  x!==null&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{}
function nonEmptyString(x:unknown):x is string {return typeof x==='string'&&!!x.trim()}

/** This is deliberately the latest DB receipt, not arbitrary client flags. */
export function assessPersistedDailyPilot(
  projectId:string,script:ScriptAuditRow|null,news:NewsAuditRow|null,
  nowMs=Date.now(),
):PilotReadiness{
  const blockers:PilotReadinessBlocker[]=[]
  const add=(b:PilotReadinessBlocker)=>{if(!blockers.includes(b))blockers.push(b)}
  const imageCount=Array.isArray(script?.images)?script.images.length:0
  const voiceReceipt=obj(obj(script?.raw_output).pilot_voice_receipt)
  const validSha=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)
  const voiceReceiptRecorded=voiceReceipt.kind==='the-prompt-voice-v1' &&
    voiceReceipt.voiceId==='qSeXEcewz7tA0Q0qk9fH' &&
    voiceReceipt.modelId==='eleven_turbo_v2_5' &&
    validSha(voiceReceipt.audioSha256)&&validSha(voiceReceipt.timingsSha256)&&
    validSha(voiceReceipt.transcriptSha256) &&
    voiceReceipt.durationMs===script?.duration_ms &&
    Number.isInteger(voiceReceipt.audioByteSize)&&Number(voiceReceipt.audioByteSize)>200
  const audioPresent=nonEmptyString(script?.audio_url)
  const timingUrlPresent=nonEmptyString(script?.timing_url)
  const base={
    scriptId:script?.id??'',projectId,
    sourcePublishedAt:null as string|null,hasVerifiedSourceDate:false,
    hasAuditableFreshStory:false,canPublish:false,
    blockers,media:{audioPresent,timingUrlPresent,imageCount,voiceReceiptRecorded},
  }
  if(!script){add('missing_script');return base}
  if(script.project_id!==projectId)add('wrong_project')
  if(script.voice_status!=='ready'||!nonEmptyString(script.hook)||!nonEmptyString(script.script))
    add('not_render_ready')
  if(!audioPresent||!Number.isFinite(script.duration_ms)||script.duration_ms!<8000)
    add('audio_missing')
  if(!timingUrlPresent)add('timing_unverified')
  // Merely having a timing URL is NOT a verification of the words.
  else add('timing_unverified')
  if(imageCount<2||imageCount>5)add('images_missing')
  // Stored images are legacy URLs, not rights-verified canonical Asset receipts.
  add('image_rights_unverified')
  // A voice receipt proves generation intent, not independent Storage readback.
  // Do not clear this blocker until actual stored MP3 and timing hashes match.
  // A voice_status row alone cannot prove voiceId/model was actually used.
  add('voice_identity_unproven')
  // A source manuscript row is not a durable human approval of a final video.
  add('owner_approval_missing')
  if(!news||news.id!==script.news_item_id){add('missing_story');return base}
  if(news.project_id!==projectId)add('wrong_project')
  const metadata=obj(news.raw_output)
  const stamp=metadata.source_published_at
  const key=metadata.source_key
  if(!nonEmptyString(stamp)||!Number.isFinite(Date.parse(stamp))){add('source_timestamp_missing');return base}
  base.sourcePublishedAt=new Date(stamp).toISOString()
  if(!nonEmptyString(key)){add('source_key_missing');return base}
  const status=checkFreshRelevantNews({
    title:news.title??'',summary:news.summary??'',
    url:news.url??'',source:key,sourceLabel:news.source_name??'',
    publishedAt:new Date(stamp),
  },nowMs)
  if(!status.eligible)add('source_not_fresh')
  else base.hasVerifiedSourceDate=true
  // Structural script/source readiness only. Rendering and publication remain
  // blocked by all outstanding provenance, content & authority checks.
  base.hasAuditableFreshStory=base.hasVerifiedSourceDate&&
    !blockers.includes('wrong_project')&&!blockers.includes('not_render_ready')&&
    !blockers.includes('audio_missing')&&!blockers.includes('images_missing')
  return base
}
