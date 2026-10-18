import {createHash} from 'node:crypto'
import {pilotVoiceTimingsSha256} from '@/lib/media/pilot-voice-receipt'
import {NewsReviewError,type PrepareNewsReviewInput,type RenderReceipt,type NewsEvidenceSnapshot} from './types'
const fail=():never=>{throw new NewsReviewError('INVALID_BODY')}
export const digest=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex')
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i,HASH=/^[a-f0-9]{64}$/
function object(v:unknown,keys:string[]):Record<string,any>{
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k)))fail()
 return v as Record<string,any>
}
function text(v:unknown,max=5000):asserts v is string{if(typeof v!=='string'||!v.trim()||v.length>max||v.includes('\0'))fail()}
function uuid(v:unknown){if(typeof v!=='string'||!UUID.test(v))fail()}
function hash(v:unknown){if(typeof v!=='string'||!HASH.test(v))fail()}
function integer(v:unknown,min:number,max:number){if(!Number.isSafeInteger(v)||(v as number)<min||(v as number)>max)fail()}
function date(v:unknown){text(v,50);if(!/^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v)))fail()}
function url(v:unknown){text(v,2048);try{const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)fail()}catch{fail()}}
function asset(v:unknown){const a=object(v,['id','sha256','byteSize']);uuid(a.id);hash(a.sha256);integer(a.byteSize,1,50*1024*1024)}
function ids(v:unknown,max=20){if(!Array.isArray(v)||!v.length||v.length>max||new Set(v).size!==v.length)fail();v.forEach(uuid)}
function list(v:unknown,n:number):any[]{if(!Array.isArray(v)||v.length!==n)fail();return v}
export function parsePrepareNewsReview(v:unknown):PrepareNewsReviewInput{
 const x=object(v,['projectId','scriptId','videoAssetId','idempotencyKey']);uuid(x.projectId);uuid(x.scriptId);uuid(x.videoAssetId)
 if(typeof x.idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(x.idempotencyKey))fail()
 return {projectId:x.projectId,scriptId:x.scriptId,videoAssetId:x.videoAssetId,idempotencyKey:x.idempotencyKey}
}
/** Fixed schema only. This representation is also implemented by the SQL evidence digest. */
export function canonicalNewsJson(v:unknown):string{
 if(Array.isArray(v))return '['+v.map(canonicalNewsJson).join(',')+']'
 if(v!==null&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalNewsJson((v as Record<string,unknown>)[k])).join(',')+'}'
 if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v)
 return fail()
}
export function parseRenderReceipt(v:unknown):RenderReceipt{
 const r=object(v,['kind','projectId','scriptId','scriptSha256','hookSha256','captionSha256','language','source','video','images','audio','voiceReceipt','words','transcript','narrationDurationMs','creativeVersion','compositionId','sourceSha','profile','qa','usage','assetProvenanceIds','costEventIds'])
 if(r.kind!=='the-prompt-review-render-v1'||r.language!=='en'||r.creativeVersion!=='the-prompt-illustrated-smooth-v1'||r.compositionId!=='ThePromptIllustratedNews')fail()
 uuid(r.projectId);uuid(r.scriptId);hash(r.scriptSha256);hash(r.hookSha256);hash(r.captionSha256)
 if(typeof r.sourceSha!=='string'||!/^[a-f0-9]{40}$/.test(r.sourceSha))fail()
 const source=object(r.source,['newsItemId','url','key','publishedAt']);uuid(source.newsItemId);url(source.url);text(source.key,100);date(source.publishedAt)
 const video=object(r.video,['sha256','byteSize']);hash(video.sha256);integer(video.byteSize,1,50*1024*1024)
 list(r.images,3).forEach(asset);if(new Set(r.images.map((a:any)=>a.id)).size!==3)fail()
 asset(r.audio);integer(r.audio.byteSize,200,25000000)
 text(r.transcript);if(digest(r.transcript)!==r.scriptSha256)fail()
 integer(r.narrationDurationMs,8000,90000)
 if(!Array.isArray(r.words)||!r.words.length||r.words.length>300)fail()
 r.words.forEach((word:unknown,i:number)=>{
  const w=object(word,['word','startMs','endMs']);text(w.word,200);integer(w.startMs,0,r.narrationDurationMs);integer(w.endMs,1,r.narrationDurationMs+500)
  if(w.endMs<=w.startMs||i>0&&w.startMs<r.words[i-1].startMs)fail()
 })
 const normalized=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()
 if(normalized(r.words.map((w:any)=>w.word).join(' '))!==normalized(r.transcript))fail()
 const voice=object(r.voiceReceipt,['kind','voiceId','modelId','transcriptSha256','audioSha256','timingsSha256','audioByteSize','durationMs','wordCount'])
 if(voice.kind!=='the-prompt-voice-v1'||voice.voiceId!=='qSeXEcewz7tA0Q0qk9fH'||voice.modelId!=='eleven_turbo_v2_5'||
 voice.transcriptSha256!==r.scriptSha256||voice.audioSha256!==r.audio.sha256||voice.audioByteSize!==r.audio.byteSize||
 voice.timingsSha256!==pilotVoiceTimingsSha256(r.words)||voice.durationMs!==r.narrationDurationMs||voice.wordCount!==r.words.length)fail()
 const p=object(r.profile,['width','height','fps','frames','durationMs','videoCodec','audioCodec'])
 if(p.width!==720||p.height!==1280||p.fps!==30||p.videoCodec!=='h264'||p.audioCodec!=='aac'||p.frames!==Math.ceil(r.narrationDurationMs*30/1000)+90)fail()
 integer(p.durationMs,8000,93034);if(Math.abs(p.durationMs-p.frames*1000/30)>1000/30)fail()
 const qa=object(r.qa,['reportSha256','reportText','reviewedBy','reviewedAt']);text(qa.reportText,16384);uuid(qa.reviewedBy);date(qa.reviewedAt)
 if(digest(qa.reportText)!==qa.reportSha256)fail()
 list(r.usage,3).forEach(u=>{
  const use=object(u,['documentUrl','documentSha256','documentText','scope','reviewedBy','reviewedAt'])
  url(use.documentUrl);text(use.documentText,32768);uuid(use.reviewedBy);date(use.reviewedAt)
  if(use.scope!=='public_social_editorial'||digest(use.documentText)!==use.documentSha256)fail()
 })
 ids(r.assetProvenanceIds);ids(r.costEventIds)
 return structuredClone(r) as RenderReceipt
}
export function renderReceiptSha256(v:unknown):string{return digest(canonicalNewsJson(parseRenderReceipt(v)))}
export function parseNewsEvidenceSnapshot(v:unknown):NewsEvidenceSnapshot{
 const s=object(v,['video','receipt','receiptSha256','provenanceId','planRevisionId','destinations'])
 asset(s.video);uuid(s.provenanceId);uuid(s.planRevisionId);const receipt=parseRenderReceipt(s.receipt)
 if(s.receiptSha256!==renderReceiptSha256(receipt)||s.video.sha256!==receipt.video.sha256||s.video.byteSize!==receipt.video.byteSize)fail()
 if(!Array.isArray(s.destinations)||!s.destinations.length||s.destinations.length>3)fail()
 s.destinations.forEach((d:unknown)=>{
  const dest=object(d,['channel','bindingId','accountId'])
  if(!['facebook','instagram','youtube'].includes(dest.channel))fail()
  if(dest.bindingId!==null)uuid(dest.bindingId)
  if(dest.accountId!==null)text(dest.accountId,256)
  if((dest.bindingId===null)!==(dest.accountId===null))fail()
 })
 if(new Set(s.destinations.map((d:any)=>d.channel)).size!==s.destinations.length)fail()
 return structuredClone(s) as NewsEvidenceSnapshot
}
export function newsEvidenceSha256(v:unknown):string{return digest(canonicalNewsJson(parseNewsEvidenceSnapshot(v)))}
