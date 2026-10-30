import type {ReferenceMessageReceipt} from './persist-reference-turn'
export type ReferenceSaveSelection={ticketIds:string[];idempotencyKey:string}
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/
const digest=/^[a-f0-9]{64}$/
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
export const REFERENCE_SAVED_NOTICE='Referenserna är sparade till meddelandet. Bildanalys är ännu inte aktiverad.'
export function parseReferenceSaveSelection(value:unknown):ReferenceSaveSelection|null{
 if(!object(value)||Object.keys(value).sort().join(',')!=='idempotencyKey,ticketIds'||
    typeof value.idempotencyKey!=='string'||!uuid.test(value.idempotencyKey.toLowerCase())||
    !Array.isArray(value.ticketIds)||value.ticketIds.length<1||value.ticketIds.length>4||
    !value.ticketIds.every(v=>typeof v==='string'&&uuid.test(v.toLowerCase())))return null
 const ticketIds=value.ticketIds.map(v=>(v as string).toLowerCase())
 if(new Set(ticketIds).size!==ticketIds.length)return null
 return {ticketIds,idempotencyKey:value.idempotencyKey.toLowerCase()}
}
/** Display receipt only; never grants provider, project or execution rights. */
export function decodeReferenceSaveResponse(value:unknown,expected:{projectId:string;conversationId:string;imageCount:number}):ReferenceMessageReceipt|null{
 if(!object(value)||Object.keys(value).sort().join(',')!=='analysis,receipt,status'||
    value.status!=='reference_saved'||value.analysis!=='not_started'||!object(value.receipt))return null
 const r=value.receipt
 if(Object.keys(r).sort().join(',')!=='bindingSha256,conversationId,imageCount,messageId,messageSha256,projectId,referenceSha256'||
    typeof r.messageId!=='string'||!uuid.test(r.messageId)||r.projectId!==expected.projectId||
    r.conversationId!==expected.conversationId||r.imageCount!==expected.imageCount||
    ![r.messageSha256,r.referenceSha256,r.bindingSha256].every(v=>typeof v==='string'&&digest.test(v)))return null
 return r as ReferenceMessageReceipt
}
