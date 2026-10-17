import {SalesError,type PrepareSalesInput,type SalesDraft} from './types'
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function fields(value:unknown,allowed:string[]):asserts value is Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw new SalesError('INVALID_BODY')
}
export function salesId(v:unknown):string{if(typeof v!=='string'||!UUID.test(v))throw new SalesError('INVALID_BODY');return v.toLowerCase()}
export function text(v:unknown,max:number,min=1):string{if(typeof v!=='string'||v.length>max||v.trim().length<min||v.includes('\u0000'))throw new SalesError('INVALID_BODY');return v.trim()}
export function normalizeSalesEmail(v:string):string{
  const s=text(v,254).toLowerCase()
  if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(s)||/[\r\n]/.test(s))throw new SalesError('INVALID_BODY')
  return s
}
export function ids(v:unknown,max:number):string[]{if(!Array.isArray(v)||v.length>max)throw new SalesError('INVALID_BODY');const a=v.map(salesId);if(new Set(a).size!==a.length)throw new SalesError('INVALID_BODY');return a}
export function parsePrepareSalesInput(v:unknown):PrepareSalesInput{
  fields(v,['projectId','conversationId','contactIds','offerRevisionId','idempotencyKey'])
  const contactIds=ids(v.contactIds,5);if(!contactIds.length)throw new SalesError('INVALID_BODY')
  return {projectId:salesId(v.projectId),conversationId:salesId(v.conversationId),contactIds,offerRevisionId:salesId(v.offerRevisionId),idempotencyKey:text(v.idempotencyKey,100)}
}
export function parseSalesDraft(v:unknown):SalesDraft{
  fields(v,['contactId','contactVersion','offerRevisionId','senderEmail','toEmail','subject','body','evidenceIds','questions'])
  if(!Number.isSafeInteger(v.contactVersion)||Number(v.contactVersion)<1||!Array.isArray(v.questions)||v.questions.length>10)throw new SalesError('INVALID_BODY')
  const subject=text(v.subject,90),body=text(v.body,2000)
  if(/[\r\n]/.test(subject)||/<\/?[a-z][^>]*>/i.test(body)||/\{\{?\s*\w+\s*\}\}?/.test(body))throw new SalesError('INVALID_BODY')
  return {contactId:salesId(v.contactId),contactVersion:Number(v.contactVersion),offerRevisionId:salesId(v.offerRevisionId),senderEmail:normalizeSalesEmail(text(v.senderEmail,254)),toEmail:normalizeSalesEmail(text(v.toEmail,254)),subject,body,evidenceIds:ids(v.evidenceIds,20),questions:v.questions.map(q=>text(q,500))}
}
export function assertDraftBinding(draft:SalesDraft,binding:Pick<SalesDraft,'contactId'|'contactVersion'|'offerRevisionId'|'senderEmail'|'toEmail'|'evidenceIds'>):void{
  if(draft.contactId!==binding.contactId||draft.contactVersion!==binding.contactVersion||draft.offerRevisionId!==binding.offerRevisionId||normalizeSalesEmail(draft.senderEmail)!==normalizeSalesEmail(binding.senderEmail)||normalizeSalesEmail(draft.toEmail)!==normalizeSalesEmail(binding.toEmail)||draft.evidenceIds.some(id=>!binding.evidenceIds.includes(id)))throw new SalesError('BINDING_MISMATCH',409)
}
