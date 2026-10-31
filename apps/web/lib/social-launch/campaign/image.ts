import 'server-only'
import {PNG} from 'pngjs'
import {decode} from 'jpeg-js'
import {readJpegDimensions} from '../publication/validate'
import {generateIdeogramV3} from '@/lib/media/image-client'
import {admitAssetBytes} from '@/lib/media/asset/admission'
import {assertSourceUrlTrusted} from '@/lib/media/asset/validate'
import {projectScope} from '@/lib/governance/execution-stop'
import {campaignImageOrigins} from './config'
import {checkCampaignItemAuthority,requireCampaignEnabled,type CampaignDb} from './store'
import {CampaignError,type CampaignItem,type CampaignWriter} from './types'
const MAX_BYTES=20*1024*1024
export async function prepareCampaignImage(w:CampaignWriter,item:CampaignItem,signal:AbortSignal,db:CampaignDb):Promise<string>{
 const origins=campaignImageOrigins()
 signal.throwIfAborted()
 const url=await generateIdeogramV3({
 project:{projectId:w.projectId},execution:{context:'AUTONOMOUS',scope:projectScope({projectId:w.projectId})},
 authority:{kind:'RUN_BOUND',runId:w.runId,claimId:w.claimId},operation:'Social campaign image',agent:'Nova',runId:w.runId,
 idempotencyKey:'social_campaign_'+w.itemId,
 },{prompt:item.draft.imagePrompt,aspect_ratio:'1x1',rendering_speed:'TURBO',num_images:1},{maxEstimatedSek:item.unitCeilingSek,signal,timeoutMs:55000,beforeDispatch:async()=>{requireCampaignEnabled(w.projectId);await checkCampaignItemAuthority(db,w)}})
 const parsed=assertSourceUrlTrusted(url,origins.map(v=>new URL(v).hostname))
 if(!origins.includes(parsed.origin)||parsed.port||parsed.username||parsed.password||parsed.hash)throw new CampaignError('UNCERTAIN')
 signal.throwIfAborted()
 const response=await fetch(url,{signal,redirect:'error',credentials:'omit',cache:'no-store'})
 const mime=response.headers.get('content-type')?.split(';')[0].trim()
 if(!response.ok||!mime||!['image/png','image/jpeg'].includes(mime)||Number(response.headers.get('content-length'))>MAX_BYTES||!response.body)throw new CampaignError('UNCERTAIN')
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0
 try{for(;;){signal.throwIfAborted();const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>MAX_BYTES){await reader.cancel();throw new CampaignError('UNCERTAIN')}chunks.push(part.value)}}finally{reader.releaseLock()}
 const bytes=Buffer.concat(chunks)
 let width:number,height:number
 if(mime==='image/png'){
  if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new CampaignError('UNCERTAIN')
  width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20)
  if(width<256||height<256||width>1440||height>1440||bytes.includes(Buffer.from('acTL')))throw new CampaignError('UNCERTAIN')
  const decoded=PNG.sync.read(bytes,{checkCRC:true});if(decoded.width!==width||decoded.height!==height)throw new CampaignError('UNCERTAIN')
 }else{
  const dimensions=readJpegDimensions(bytes);width=dimensions.width;height=dimensions.height
  const decoded=decode(bytes,{useTArray:true,tolerantDecoding:false,maxResolutionInMP:3,maxMemoryUsageInMB:64})
  if(decoded.width!==width||decoded.height!==height||height<256||height>1440)throw new CampaignError('UNCERTAIN')
 }
 signal.throwIfAborted()
 const admitted=await admitAssetBytes({projectId:w.projectId,kind:'image',visibility:'internal',
 storage:{path:w.projectId+'/social-campaigns/'+w.campaignId+'/'+w.itemId},bytes,mimeType:mime,width,height,
 provenance:{source:'generated',provider:'ideogram',model:'ideogram-v3',adapterVersion:'social-campaign-v1',brief:{prompt:item.draft.imagePrompt},request:{campaignId:w.campaignId,itemId:w.itemId,runId:w.runId}}})
 return admitted.asset.id
}
