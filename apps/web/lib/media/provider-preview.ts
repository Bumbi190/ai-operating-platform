import {createHash} from 'node:crypto'
import candidate from '../../../../docs/the-prompt-provider-qa-candidate-20261018.json'
import {checkFreshRelevantNews} from './news-freshness'
import {missingIllustratedNewsProviders,ILLUSTRATED_NEWS_PROFILE} from './illustrated-news-profile'
import {buildPilotVoiceReceipt,type PilotVoiceReceipt} from './pilot-voice-receipt'
import type {VoiceResult} from './elevenlabs'
export const PREVIEW_PROJECT_ID='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
export const PREVIEW_KIND='the-prompt-private-provider-qa-v1'
const MAXIMUM_SEK=12 as const
const hash=(s:string)=>createHash('sha256').update(s).digest('hex')
// The source, date and manuscript are server-reviewed inputs, never request data.
export const PREVIEW_CANDIDATE={
 title:candidate.headline,hook:candidate.hook,script:candidate.script,
 sourceUrl:candidate.sourceUrl,publishedAt:candidate.sourcePublishedAt,
 profile:ILLUSTRATED_NEWS_PROFILE,
}
export const PREVIEW_INPUT_HASH=hash(JSON.stringify({projectId:PREVIEW_PROJECT_ID,...PREVIEW_CANDIDATE}))
// A stable business identity, not an access token. PK insertion is the claim.
const h=PREVIEW_INPUT_HASH
export const PREVIEW_ID=h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32)
export interface PreviewAttempt{
 kind:typeof PREVIEW_KIND;inputHash:string;state:'claimed'|'ready'|'review_required'
 imageIds:string[];audioId?:string;voiceReceipt?:PilotVoiceReceipt
 words?:VoiceResult['words'];durationMs?:number
}
export interface ProviderPreviewDeps{
 env:Record<string,string|undefined>
 access:{ok:boolean;userId?:string;allowedProjectIds?:string[]}
 now:()=>number
 read:()=>Promise<PreviewAttempt|null>
 claim:(state:PreviewAttempt)=>Promise<boolean>
 save:(state:PreviewAttempt)=>Promise<void>
 verifySource:()=>Promise<void>
 estimate:()=>Promise<number>
 assertExecution:()=>Promise<void>
 images:()=>Promise<string[]>
 admitImage:(url:string,index:number)=>Promise<string>
 voice:()=>Promise<VoiceResult>
 admitVoice:(voice:VoiceResult)=>Promise<string>
 deliver:(state:PreviewAttempt)=>Promise<unknown>
}
export class ProviderPreviewError extends Error{
 constructor(public readonly code:string,public readonly status=409){super(code)}
}
export function createProviderPreview(d:ProviderPreviewDeps){
 const owner=()=>{
  if(d.env.VERCEL_ENV!=='preview')throw new ProviderPreviewError('PREVIEW_ONLY',404)
  if(!d.access.ok||!d.access.userId||!d.access.allowedProjectIds?.includes(PREVIEW_PROJECT_ID))
   throw new ProviderPreviewError('NOT_FOUND',404)
 }
 const view=async(s:PreviewAttempt)=>({
  status:s.state,previewId:PREVIEW_ID,candidate:PREVIEW_CANDIDATE,maximumSek:MAXIMUM_SEK,
  ...(s.state==='ready'?{media:await d.deliver(s)}:{}),
 })
 const quote=async()=>{
  if(d.env.H1_SPEND_GATE!=='1')throw new ProviderPreviewError('STRICT_BUDGET_GATE_REQUIRED')
  if(missingIllustratedNewsProviders(d.env).length)throw new ProviderPreviewError('PROVIDERS_NOT_CONFIGURED')
  const fresh=checkFreshRelevantNews({
   title:PREVIEW_CANDIDATE.title,summary:PREVIEW_CANDIDATE.script,url:PREVIEW_CANDIDATE.sourceUrl,
   publishedAt:new Date(PREVIEW_CANDIDATE.publishedAt),source:'rss_anthropic',sourceLabel:'ANTHROPIC RESEARCH',
  },d.now())
  if(!fresh.eligible)throw new ProviderPreviewError('SOURCE_NO_LONGER_FRESH')
  const estimatedSek=await d.estimate()
  if(!Number.isFinite(estimatedSek)||estimatedSek<=0||estimatedSek>MAXIMUM_SEK)
   throw new ProviderPreviewError('PROBE_COST_CAP_EXCEEDED')
  return{estimatedSek,quoteHash:hash(JSON.stringify({input:PREVIEW_INPUT_HASH,estimatedSek,maximumSek:MAXIMUM_SEK}))}
 }
 return{
  async inspect(){
   owner()
   const prior=await d.read()
   if(prior)return view(prior)
   return{status:'ready_to_generate',previewId:PREVIEW_ID,candidate:PREVIEW_CANDIDATE,
    maximumSek:MAXIMUM_SEK,...await quote()}
  },
  async generate(input:{quoteHash:unknown;maximumSek:unknown}){
   owner()
   const prior=await d.read()
   if(prior)return view(prior)
   const q=await quote()
   if(input.maximumSek!==MAXIMUM_SEK||input.quoteHash!==q.quoteHash)
    throw new ProviderPreviewError('QUOTE_MISMATCH')
   await d.verifySource()
   const finalQuote=await quote()
   if(input.quoteHash!==finalQuote.quoteHash)throw new ProviderPreviewError('QUOTE_MISMATCH')
   await d.assertExecution()
   let state:PreviewAttempt={kind:PREVIEW_KIND,inputHash:PREVIEW_INPUT_HASH,state:'claimed',imageIds:[]}
   if(!await d.claim(state)){
    const existing=await d.read()
    if(!existing)throw new ProviderPreviewError('CLAIM_NOT_VERIFIED',503)
    return view(existing)
   }
   // Once a claim exists, no request can regenerate it, even after a crash.
   // Persist each admitted output; ambiguity goes to human review.
   try{
    const urls=await d.images()
    if(urls.length!==3)throw new Error('INVALID_IMAGE_COUNT')
    for(let i=0;i<3;i++){
     const id=await d.admitImage(urls[i],i)
     state={...state,imageIds:[...state.imageIds,id]}
     await d.save(state)
    }
    const voice=await d.voice()
    const voiceReceipt=buildPilotVoiceReceipt(PREVIEW_CANDIDATE.script,voice.audioBuffer,voice.words,voice.durationMs)
    const audioId=await d.admitVoice(voice)
    state={...state,audioId,words:voice.words,durationMs:voice.durationMs,voiceReceipt,state:'ready'}
    await d.save(state)
   }catch{
    state={...state,state:'review_required'}
    try{await d.save(state)}catch{/* The original claimed row still forbids replay. */}
   }
   return view(state)
  },
 }
}
