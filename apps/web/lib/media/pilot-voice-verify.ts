import {createHash} from 'node:crypto'
import {BRAND_MODEL,VICTORIA_VOICE_ID} from '../voice/config'
import type {PilotVoiceReceipt} from './pilot-voice-receipt'

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const BUCKET='media-assets'
const MAX_AUDIO_BYTES=25_000_000
const MAX_TIMING_BYTES=180_000
const SHA=/^[a-f0-9]{64}$/
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex')
export type PilotVoiceVerification={
  verified:boolean
  reason:'no_receipt'|'invalid_receipt'|'invalid_locator'|
    'storage_unavailable'|'audio_mismatch'|'timing_mismatch'|null
}
type FileStore={
  from:(bucket:string)=>{
    getPublicUrl:(path:string)=>{data:{publicUrl:string}}
    download:(path:string)=>Promise<{data:Blob|null;error:{message:string}|null}>
  }
}
type DownloadStorage={storage:FileStore}
const denied=(reason:NonNullable<PilotVoiceVerification['reason']>):PilotVoiceVerification=>
  ({verified:false,reason})
function canonicalUrl(url:string):string|null {
  try{
    const p=new URL(url)
    // Local CLI Storage is HTTP; only explicitly opted-in isolated loopback
    // tests may use it. Hosted/remote Storage URLs still require HTTPS.
    const isolatedLoopback=process.env.PILOT_STORAGE_TEST_MODE==='isolated-local' &&
      p.protocol==='http:'&&['127.0.0.1','localhost'].includes(p.hostname)&&!!p.port
    if((p.protocol!=='https:'&&!isolatedLoopback)||p.username||p.password||p.hash)return null
    return p.href
  }catch{return null}
}
function validateReceipt(value:unknown):value is PilotVoiceReceipt{
  const r=value as Partial<PilotVoiceReceipt>|null
  return !!r&&typeof r==='object'&&r.kind==='the-prompt-voice-v1'&&
    r.voiceId===VICTORIA_VOICE_ID&&r.modelId===BRAND_MODEL&&
    !!r.audioSha256&&SHA.test(r.audioSha256)&&
    !!r.timingsSha256&&SHA.test(r.timingsSha256)&&
    !!r.transcriptSha256&&SHA.test(r.transcriptSha256)&&
    Number.isInteger(r.durationMs)&&r.durationMs!>=8000&&r.durationMs!<=90000&&
    Number.isInteger(r.wordCount)&&r.wordCount!>=10&&r.wordCount!<=300&&
    Number.isInteger(r.audioByteSize)&&r.audioByteSize!>=200&&
    r.audioByteSize!<=MAX_AUDIO_BYTES
}
/**
 * Read back from the **exact canonical private project/script storage paths**.
 * NEVER fetch a caller-controlled media URL (SSRF), never accept a path merely
 * because it is under a plausible bucket, and never declare a green status
 * on a receipt without verifying both stored audio and word timing bytes.
 *
 * Audio is already in the legacy public bucket, but this API exposes neither
 * downloaded bytes nor storage URLs. A final release still needs an owner-
 * authorized immutable render review + independent rights verification.
 */
export async function verifyPilotStoredVoice(
  db:DownloadStorage,projectId:string,scriptId:string,
  audioUrl:string|null,timingUrl:string|null,scriptText:string,
  receipt:unknown,
):Promise<PilotVoiceVerification>{
  if(!receipt)return denied('no_receipt')
  if(!validateReceipt(receipt)||!scriptText.trim()||
     hash(scriptText)!==receipt.transcriptSha256)return denied('invalid_receipt')
  if(!UUID.test(projectId)||!UUID.test(scriptId))return denied('invalid_locator')
  const audioPath=`audio/${projectId}/${scriptId}.mp3`
  const timingPath=`data/${projectId}/${scriptId}-timing.json`
  const store=db.storage.from(BUCKET)
  const audioCanonical=canonicalUrl(store.getPublicUrl(audioPath).data.publicUrl)
  const timingCanonical=canonicalUrl(store.getPublicUrl(timingPath).data.publicUrl)
  if(!audioCanonical||!timingCanonical||
    canonicalUrl(audioUrl??'')!==audioCanonical||
    canonicalUrl(timingUrl??'')!==timingCanonical)return denied('invalid_locator')
  let audio:Blob,timing:Blob
  try{
    const [a,t]=await Promise.all([store.download(audioPath),store.download(timingPath)])
    if(a.error||t.error||!a.data||!t.data)return denied('storage_unavailable')
    audio=a.data;timing=t.data
  }catch{return denied('storage_unavailable')}
  if(audio.size!==receipt.audioByteSize||audio.size>MAX_AUDIO_BYTES||
    timing.size<10||timing.size>MAX_TIMING_BYTES)
    return denied('audio_mismatch')
  let audioBytes:Uint8Array,content:string
  try{
    audioBytes=new Uint8Array(await audio.arrayBuffer())
    content=await timing.text()
  }catch{return denied('storage_unavailable')}
  if(hash(audioBytes)!==receipt.audioSha256)return denied('audio_mismatch')
  try{
    const timingJson=JSON.parse(content) as {words?:unknown;durationMs?:unknown}
    if(!Array.isArray(timingJson.words)||
       timingJson.words.length!==receipt.wordCount||
       timingJson.durationMs!==receipt.durationMs||
       hash(JSON.stringify(timingJson.words))!==receipt.timingsSha256)
       return denied('timing_mismatch')
  }catch{return denied('timing_mismatch')}
  return {verified:true,reason:null}
}
