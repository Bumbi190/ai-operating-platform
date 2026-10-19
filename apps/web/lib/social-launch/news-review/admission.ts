import 'server-only'
import {readFile,stat,mkdtemp,writeFile,chmod,rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {tmpdir} from 'node:os'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomUUID} from 'node:crypto'
import {createAdminClient} from '@/lib/supabase/admin'
import {getAllowedProjectIds} from '@/lib/atlas/isolation'
import {admitAssetBytes} from '@/lib/media/asset/admission'
import {asAssetId} from '@/lib/media/asset/types'
import type {SocialContentPrincipal} from '../content/types'
import {authorizeNewsProject,verifyReceiptReferences,type ReviewDb} from './verify'
import {digest,canonicalNewsJson,parseRenderReceipt,renderReceiptSha256} from './contract'
import {NewsReviewError,type RenderReceipt} from './types'
const execute=promisify(execFile)
function binary(name:'ffmpeg'|'ffprobe'){
 const configured=name==='ffmpeg'?process.env.FFMPEG_PATH:process.env.FFPROBE_PATH
 if(configured)return configured
 const bundled=resolve(process.cwd(),'../remotion/node_modules/@remotion/compositor-win32-x64-msvc',name+'.exe')
 return process.platform==='win32'&&existsSync(bundled)?bundled:name
}
export async function measureReviewVideo(path:string):Promise<RenderReceipt['profile']>{
 try{
  const {stdout}=await execute(binary('ffprobe'),['-v','error','-count_frames','-show_entries','stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',path],{timeout:60000,maxBuffer:1024*1024})
  const p=JSON.parse(stdout),videos=p.streams.filter((s:any)=>s.codec_type==='video'),audios=p.streams.filter((s:any)=>s.codec_type==='audio'),v=videos[0]
  if(videos.length!==1||audios.length!==1||v.codec_name!=='h264'||audios[0].codec_name!=='aac'||v.width!==720||v.height!==1280||v.avg_frame_rate!=='30/1')throw new NewsReviewError('MISSING_RENDER_EVIDENCE')
  const profile={width:720,height:1280,fps:30,frames:Number(v.nb_read_frames),durationMs:Math.round(Number(p.format.duration)*1000),videoCodec:'h264',audioCodec:'aac'} as RenderReceipt['profile']
  if(!Number.isSafeInteger(profile.frames)||profile.frames<1||profile.durationMs<8000||profile.durationMs>93034)throw new NewsReviewError('MISSING_RENDER_EVIDENCE')
  await execute(binary('ffmpeg'),['-v','error','-xerror','-i',path,'-map','0:v:0','-map','0:a:0','-c:v','libx264','-preset','ultrafast','-c:a','aac','-f','null','-'],{timeout:60000,maxBuffer:1024*1024})
  return profile
 }catch(e){if(e instanceof NewsReviewError)throw e;throw new NewsReviewError('MISSING_RENDER_EVIDENCE')}
}
async function measureSnapshot(bytes:Uint8Array):Promise<RenderReceipt['profile']>{
 const dir=await mkdtemp(join(tmpdir(),'omnira-news-review-'))
 try{
  await chmod(dir,0o700)
  const path=join(dir,'snapshot.mp4')
  await writeFile(path,bytes,{flag:'wx',mode:0o600})
  return await measureReviewVideo(path)
 }finally{await rm(dir,{recursive:true,force:true})}
}
export async function authenticateReviewOperator(db:ReviewDb,token:string):Promise<SocialContentPrincipal>{
 const {data,error}=await db.auth.getUser(token)
 if(error||!data.user)throw new NewsReviewError('NOT_FOUND')
 return {userId:data.user.id,allowedProjectIds:await getAllowedProjectIds(db,data.user.id)}
}
export async function admitReviewVideo(p:SocialContentPrincipal,input:{projectId:string;scriptId:string;videoPath:string;manifestPath:string;apply:boolean}):Promise<{dryRun:boolean;videoAssetId:string|null;receiptSha256:string;blockers:string[]}>{
 const db=createAdminClient();await authorizeNewsProject(db,p,input.projectId)
 const [videoStat,manifestStat]=await Promise.all([stat(input.videoPath),stat(input.manifestPath)])
 if(!videoStat.isFile()||videoStat.size<1||videoStat.size>50*1024*1024||!manifestStat.isFile()||manifestStat.size>256*1024)throw new NewsReviewError('INVALID_BODY')
 const raw=JSON.parse(await readFile(input.manifestPath,'utf8'))
 if(!Array.isArray(raw?.usage)||raw.usage.length!==3)throw new NewsReviewError('MISSING_USAGE_EVIDENCE')
 const receipt=parseRenderReceipt(raw),bytes=await readFile(input.videoPath)
 if(receipt.projectId!==input.projectId||receipt.scriptId!==input.scriptId)throw new NewsReviewError('NOT_FOUND')
 if(digest(bytes)!==receipt.video.sha256||bytes.length!==receipt.video.byteSize)throw new NewsReviewError('MEDIA_CHANGED')
 const profile=await measureSnapshot(bytes)
 if(canonicalNewsJson(profile)!==canonicalNewsJson(receipt.profile))throw new NewsReviewError('MEDIA_CHANGED')
 await verifyReceiptReferences(db,p,receipt,Date.now())
 const receiptSha256=renderReceiptSha256(receipt)
 if(!input.apply)return {dryRun:true,videoAssetId:null,receiptSha256,blockers:[]}
 await authorizeNewsProject(db,p,input.projectId)
 const admitted=await admitAssetBytes({projectId:input.projectId,kind:'video',visibility:'internal',storage:{path:'the-prompt-review/'+input.scriptId+'/'+randomUUID()},bytes,mimeType:'video/mp4',width:profile.width,height:profile.height,durationMs:profile.durationMs,
 provenance:{source:'derived',adapterVersion:'the-prompt-review-admission-v1',simulated:false,referenceAssetIds:receipt.assetProvenanceIds.map(asAssetId),durationMs:profile.durationMs,providerMetadata:{receipt}}})
 return {dryRun:false,videoAssetId:admitted.asset.id,receiptSha256,blockers:[]}
}