import {SalesError} from './types'
import {salesId} from './validate'
export type EmailCopyRevision={
 id:string;projectId:string;templateKey:string;version:number;previousId:string|null;createdAt:string;createdBy:string;
 kind:'initial'|'reminder';offerRevisionId:string;pilotMonths:2|6|12;offerText:string;productFacts:string[];
 senderName:string;senderEmail:string;subject:string;body:string;usage:string;
 status:'draft';recipient:null;scheduledAt:null;ownerTextReviewed:false
}
export type EmailCopyEdit={projectId:string;templateKey:string;expectedPreviousId:string|null;idempotencyKey:string;subject:string;body:string}
export function parseEmailCopyEdit(value:unknown):EmailCopyEdit{
 const keys=['projectId','templateKey','expectedPreviousId','idempotencyKey','subject','body']
 if(!value||typeof value!=='object'||Array.isArray(value))throw new SalesError('INVALID_BODY')
 const v=value as Record<string,unknown>
 if(Object.keys(v).some(k=>!keys.includes(k))||keys.some(k=>!(k in v)))throw new SalesError('INVALID_BODY')
 if(typeof v.templateKey!=='string'||!/^[a-z][a-z0-9-]{0,79}$/.test(v.templateKey)||
 typeof v.subject!=='string'||!v.subject.trim()||v.subject.length>90||/[\u0000-\u001f\u007f]/.test(v.subject)||
 typeof v.body!=='string'||!v.body.trim()||v.body.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v.body))throw new SalesError('INVALID_BODY')
 return {projectId:salesId(v.projectId),templateKey:v.templateKey,expectedPreviousId:v.expectedPreviousId===null?null:salesId(v.expectedPreviousId),idempotencyKey:salesId(v.idempotencyKey),subject:v.subject,body:v.body}
}
