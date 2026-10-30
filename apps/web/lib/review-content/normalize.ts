import type {ReviewContent,OwnedPreviewRef} from './types';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const header=(s:unknown,max:number):s is string=>typeof s==='string'&&s.length<=max&&!/[\u0000-\u001f\u007f]/.test(s);
export function parseOwnedPreviewRef(value:unknown):OwnedPreviewRef|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['assetId','sha256','name','mimeType'].includes(k))||typeof v.assetId!=='string'||!uuid.test(v.assetId)||typeof v.sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.sha256)||!header(v.name,200)||!v.name.trim()||v.mimeType!==null&&!header(v.mimeType,100))return null;
 return v as OwnedPreviewRef;
}
export function normalizeReviewContent(input:{kind:string|null;outputKey:string|null;content:string}):ReviewContent{
 if(typeof input.content!=='string'||new TextEncoder().encode(input.content).byteLength>131072)return {kind:'unavailable',reason:'Underlaget är för stort för säker förhandsvisning. Öppna källan för hela innehållet.'};
 const text:ReviewContent={kind:'text',text:input.content};
 if(!['email_draft','draft_email'].includes(input.kind??'')&&!['email_draft','draft_email'].includes(input.outputKey??''))return text;
 try{
  const e=JSON.parse(input.content),keys=['to','cc','bcc','subject','bodyText','attachments'];
  if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).some(k=>!keys.includes(k)))return text;
  const addresses=(v:unknown)=>Array.isArray(v)&&v.length<=100&&v.every(a=>header(a,320)&&/^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/.test(a));
  if(!addresses(e.to)||e.to.length===0||!addresses(e.cc??[])||!addresses(e.bcc??[])||!header(e.subject,998)||typeof e.bodyText!=='string'||!Array.isArray(e.attachments??[])||(e.attachments??[]).length>20)return text;
  const refs=(e.attachments??[]).map(parseOwnedPreviewRef);if(refs.some((r:OwnedPreviewRef|null)=>!r))return text;
  return {kind:'email',to:e.to,cc:e.cc??[],bcc:e.bcc??[],subject:e.subject,bodyText:e.bodyText,attachments:refs.map((r:OwnedPreviewRef)=>({id:r.assetId,name:r.name,mimeType:r.mimeType,preview:null}))};
 }catch{return text;}
}
