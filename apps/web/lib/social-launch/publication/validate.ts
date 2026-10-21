import {contentFields,contentId} from '../content/validate'
import {PublicationError,type PublicationRequest,type PublicationPost} from './types'
export function parsePublicationRequest(input:unknown):PublicationRequest{
 try{contentFields(input,['projectId','postId','revisionId','sha256','decisionId','bindingId','idempotencyKey','confirmed']);for(const k of ['projectId','postId','revisionId','decisionId','bindingId'])contentId(input[k]);if(input.confirmed!==true||typeof input.sha256!=='string'||!/^[a-f0-9]{64}$/.test(input.sha256)||typeof input.idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(input.idempotencyKey))throw Error();return input as unknown as PublicationRequest}catch{throw new PublicationError('INVALID_BODY')}
}
export function manualBlockers(post:PublicationPost):string[]{
 const reasons=new Set(post.requirements.filter(r=>r!=='activation_required')),r=post.revision,d=post.decision,v=r.draft
 if(post.status!=='approved'||d?.decision!=='approve'||d.revisionId!==r.id||d.sha256!==r.sha256)reasons.add('review_required')
 if(!r.binding)reasons.add('account_required')
 if(v.scheduledAt!==null)reasons.add('manual_time_required')
 if(!(['facebook','instagram'].includes(v.channel))||v.channel==='facebook'&&!['text','link','image'].includes(v.format)||v.channel==='instagram'&&v.format!=='image')reasons.add('format_not_supported')
 if(v.channel==='instagram'&&v.text.length>2200)reasons.add('caption_too_long')
 if(v.format==='image'){
  if(r.media.length!==1||v.mediaIds.length!==1||r.media[0]?.id!==v.mediaIds[0]||r.media[0]?.kind!=='image'||r.media[0]?.mimeType!=='image/jpeg')reasons.add('single_jpeg_required')
  const image=r.media[0];if(image&&!imageDimensionsSupported(image.width,image.height))reasons.add('image_dimensions_not_supported')
  if(v.linkUrl&&!v.text.includes(v.linkUrl))reasons.add('image_link_not_in_text')
 }
 return [...reasons]
}
export function imageDimensionsSupported(width:number|null,height:number|null):boolean{return (width===null||Number.isInteger(width)&&width>=320&&width<=1440)&&(height===null||Number.isInteger(height)&&height>0)&&(width===null||height===null||width/height>=0.8&&width/height<=1.91)}
/** Bounded envelope/frame/scan preflight; the server also decodes before admitting a provider write. */
export function readJpegDimensions(b:Uint8Array):{width:number;height:number}{
 const fail=():never=>{throw new PublicationError('UNSUPPORTED')}
 if(b.length<4||b.length>8*1024*1024||b[0]!==255||b[1]!==216||b[b.length-2]!==255||b[b.length-1]!==217)return fail()
 let offset=2,frame:{width:number;height:number}|null=null
 while(offset<b.length-2){
  if(b[offset++]!==255)return fail();while(b[offset]===255)offset++
  const marker=b[offset++];if(marker===undefined||offset+2>b.length)return fail()
  const length=b[offset]*256+b[offset+1];if(length<2||offset+length>b.length-2)return fail()
  if(marker===192||marker===194){
   if(frame||length<11||b[offset+2]!==8||![1,3].includes(b[offset+7])||length!==8+b[offset+7]*3)return fail()
   const height=b[offset+3]*256+b[offset+4],width=b[offset+5]*256+b[offset+6],ratio=width/height
   if(width<320||width>1440||height<1||ratio<0.8||ratio>1.91)return fail()
   frame={width,height}
  }
  if(marker===218){const components=b[offset+2];if(!frame||components<1||components>3||length!==6+2*components||offset+length>=b.length-2)return fail();return frame}
  offset+=length
 }
 return fail()
}
