import 'server-only'
import {createHash} from 'node:crypto'
import type {ProjectAccessOk} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {getRates} from '@/lib/cost/rates'
import type {ProjectRef} from '@/lib/cost/governed-spend'
import {spendIdempotencyKey} from '@/lib/cost/spend-identity'
import {estimateImageSek,estimateVoiceSek} from '@/lib/cost/budget-gate'
import {estimateAnthropicSek} from '@/lib/ai/anthropic'
import {estimateOpenAIChatSek} from '@/lib/ai/openai-client'
import {projectScope,type ExecutionContract} from '@/lib/governance/execution-stop'
import {assertExecutionDispatchAllowed} from '@/lib/governance/execution-dispatch'
import {generateNewsImages} from './ideogram'
import {generateVoiceover} from './elevenlabs'
import {admitAssetBytes,admitAssetFromUrl} from './asset/admission'
import {getAsset,signedAssetUrl} from './asset/store'
import {asAssetId} from './asset/types'
import {createProviderPreviewStore} from './provider-preview-store'
import {pilotVoiceTimingsSha256} from './pilot-voice-receipt'
import {createProviderPreview,PREVIEW_ID,PREVIEW_PROJECT_ID,PREVIEW_CANDIDATE as candidate,type PreviewAttempt} from './provider-preview'
import {ILLUSTRATED_NEWS_PROFILE} from './illustrated-news-profile'
import {planIllustratedNewsShots} from './illustrated-news-shots'
const sha=(s:string)=>createHash('sha256').update(s).digest('hex')
async function verifyOriginalSource(){
 const response=await fetch(candidate.sourceUrl,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)})
 if(!response.ok||!response.body)throw Error('SOURCE_VERIFY_UNAVAILABLE')
 const reader=response.body.getReader(),decoder=new TextDecoder()
 let html='',size=0
 try{
  while(true){
   const chunk=await reader.read()
   if(chunk.done)break
   size+=chunk.value.byteLength
   if(size>1000000)throw Error('SOURCE_VERIFY_TOO_LARGE')
   html+=decoder.decode(chunk.value,{stream:true})
  }
 }finally{await reader.cancel()}
 if(!html.includes(candidate.publishedAt))throw Error('ORIGINAL_SOURCE_DATE_CHANGED')
}
export function createRuntimeProviderPreview(access:ProjectAccessOk){
 const project:ProjectRef={projectId:PREVIEW_PROJECT_ID}
 const execution:ExecutionContract={context:'OPERATOR_EXECUTION',scope:projectScope({projectId:PREVIEW_PROJECT_ID})}
 const provenance={source:'generated' as const,adapterVersion:ILLUSTRATED_NEWS_PROFILE,brief:candidate,
  providerMetadata:{privateProviderQa:true,releaseApproved:false}}
 return createProviderPreview({
  access,env:process.env,now:Date.now,...createProviderPreviewStore(createAdminClient()),
  verifySource:verifyOriginalSource,
  async estimate(){
   const rates=await getRates()
   const costs=await Promise.all([
    estimateImageSek(3,'ideogram',rates),estimateVoiceSek(candidate.script.length,rates),
    estimateAnthropicSek({model:'claude-haiku-4-5-20251001',max_tokens:1500},rates),
    estimateOpenAIChatSek({model:'gpt-5.4-mini',max_completion_tokens:1500},rates),
   ])
   return costs.reduce((total,cost)=>total+cost,0)
  },
  assertExecution:()=>assertExecutionDispatchAllowed(execution,{system:'the-prompt-private-preview',operation:'generate_preview'}),
  images:()=>generateNewsImages(candidate.title,candidate.script,3,execution,project,PREVIEW_ID,ILLUSTRATED_NEWS_PROFILE),
  async admitImage(url,index){
   const result=await admitAssetFromUrl({projectId:PREVIEW_PROJECT_ID,kind:'image',visibility:'internal',
    storage:{path:'the-prompt-private-qa/'+PREVIEW_ID+'/scene-'+index},sourceUrl:url,
    provenance:{...provenance,provider:'ideogram',model:'ideogram-v3',providerMetadata:{...provenance.providerMetadata,scene:index}}})
   return result.asset.id
  },
  voice:()=>generateVoiceover(candidate.script,execution,'victoria',project,spendIdempotencyKey({project,provider:'elevenlabs',operation:'generateVoiceover',subject:PREVIEW_ID})),
  async admitVoice(voice){
   const result=await admitAssetBytes({projectId:PREVIEW_PROJECT_ID,kind:'audio',visibility:'internal',
    storage:{path:'the-prompt-private-qa/'+PREVIEW_ID+'/victoria'},bytes:voice.audioBuffer,
    mimeType:'audio/mpeg',durationMs:voice.durationMs,
    provenance:{...provenance,provider:'elevenlabs',model:'eleven_turbo_v2_5',durationMs:voice.durationMs}})
   return result.asset.id
  },
  async deliver(state:PreviewAttempt){
   const resolve=async(id:string,kind:'image'|'audio')=>{
    const asset=await getAsset(asAssetId(id))
    if(!asset||asset.projectId!==PREVIEW_PROJECT_ID||asset.kind!==kind||asset.status!=='active'||
       asset.visibility!=='internal'||asset.storage.bucket!=='media-assets-private')
     throw Error('PREVIEW_ASSET_NOT_VERIFIED')
    return{assetId:asset.id,url:await signedAssetUrl(asset.storage,1800),
     sha256:asset.checksumSha256,mimeType:asset.mimeType,byteSize:asset.byteSize}
   }
   const images=await Promise.all(state.imageIds.map(id=>resolve(id,'image')))
   if(!state.audioId||!state.words||!state.durationMs||!state.voiceReceipt)throw Error('PREVIEW_VOICE_NOT_VERIFIED')
   const audio=await resolve(state.audioId,'audio'),receipt=state.voiceReceipt
   if(receipt.voiceId!=='qSeXEcewz7tA0Q0qk9fH'||receipt.modelId!=='eleven_turbo_v2_5'||
      receipt.audioSha256!==audio.sha256||receipt.durationMs!==state.durationMs||
      receipt.transcriptSha256!==sha(candidate.script)||receipt.timingsSha256!==pilotVoiceTimingsSha256(state.words))
    throw Error('PREVIEW_VOICE_NOT_VERIFIED')
   return{
    assets:{images,audio},voiceReceipt:receipt,signedLinksExpireAfterSeconds:1800,releaseApproved:false,
    props:{hook:candidate.hook,script:candidate.script,audioUrl:audio.url,durationMs:state.durationMs,
     words:state.words,captions:[],images:images.map(x=>x.url),sourceLabel:'ANTHROPIC RESEARCH',
     sourceUrl:candidate.sourceUrl,sourcePublishedAt:candidate.publishedAt,creativeVersion:'the-prompt-editorial-v1',
     illustratedShots:planIllustratedNewsShots(state.words,state.durationMs,3)},
   }
  },
 })
}
