import 'server-only';
import type {AdminDb,CalendarActor} from '../calendar/types';
import type {OwnedPreviewRef,ReviewMedia} from './types';
import {parseOwnedPreviewRef} from './normalize';
export async function resolveOwnedPreviewMedia(db:AdminDb,actor:CalendarActor,projectId:string,ref:OwnedPreviewRef):Promise<ReviewMedia|null>{
 if(actor.projectScopeAvailable===false||!actor.allowedProjectIds.includes(projectId)||!parseOwnedPreviewRef(ref))return null;
 try{
  const {data:a,error}=await db.from('assets').select('id,project_id,status,kind,mime_type,checksum_sha256,byte_size,storage_bucket,storage_path').eq('id',ref.assetId).eq('project_id',projectId).maybeSingle();
  if(error||!a||a.id!==ref.assetId||a.project_id!==projectId||a.status!=='active'||a.checksum_sha256!==ref.sha256||!['media-assets','media-assets-private'].includes(a.storage_bucket)||typeof a.storage_path!=='string'||a.storage_path.split(/[\\/]/).some((p:string)=>p==='..'||p==='.')||!Number.isSafeInteger(Number(a.byte_size))||Number(a.byte_size)<1||Number(a.byte_size)>52428800)return null;
  const kind=a.kind==='image'&&['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(a.mime_type)?'image':a.kind==='video'&&['video/mp4','video/webm'].includes(a.mime_type)?'video':null;
  if(!kind||ref.mimeType!==null&&ref.mimeType!==a.mime_type)return null;
  return {id:a.id,kind,src:'/api/social-content/media?'+new URLSearchParams({projectId,assetId:a.id,sha256:ref.sha256}),alt:ref.name};
 }catch{return null;}
}
export function resolveLegacyScriptVideo(input:{scriptId:string;videoUrl:string|null;renderId:string|null;bucket:string|null;region:string;configuredBucket?:string}):ReviewMedia|null{
 try{
  const {scriptId,renderId,bucket,region}=input;
  if(!input.videoUrl||!bucket||!/^remotionlambda-[a-z0-9-]{3,100}$/.test(bucket)||input.configuredBucket&&bucket!==input.configuredBucket||!renderId||!/^[a-zA-Z0-9_-]{5,100}$/.test(renderId)||!/^\w{2}-[a-z]+-\d$/.test(region)||!/^[a-f0-9-]{36}$/i.test(scriptId))return null;
  const url=new URL(input.videoUrl);if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||url.pathname.includes('%'))return null;
  const path='/renders/'+renderId+'/'+scriptId+'.mp4';
  if(!(url.hostname==='s3.'+region+'.amazonaws.com'&&url.pathname==='/'+bucket+path)&&!(url.hostname===bucket+'.s3.'+region+'.amazonaws.com'&&url.pathname===path))return null;
  return {id:scriptId,kind:'video',src:url.href,alt:'Nyhetsfilm'};
 }catch{return null;}
}
