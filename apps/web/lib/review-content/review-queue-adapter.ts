import {normalizeReviewContent,parseOwnedPreviewRef} from './normalize';
import type {ReviewContent} from './types';
export function deriveStoredReviewContent(input:{kind:string|null;outputKey:string|null;content:string;projectId?:string|null}):ReviewContent{
 const content=normalizeReviewContent(input);
 if(content.kind!=='email'||!input.projectId||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.projectId))return content;
 const refs=(JSON.parse(input.content).attachments??[]).map(parseOwnedPreviewRef);
 return {...content,attachments:content.attachments.map((a,index)=>{
  const ref=refs[index];
  const kind=ref&&['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(ref.mimeType)?'image':ref&&['video/mp4','video/webm'].includes(ref.mimeType)?'video':null;
  // Byte access remains in the existing session/owner/project/hash-checked media endpoint.
  return {...a,preview:ref&&kind?{id:a.id,kind,src:'/api/social-content/media?'+new URLSearchParams({projectId:input.projectId!,assetId:ref.assetId,sha256:ref.sha256}),alt:a.name}:null};
 })};
}
