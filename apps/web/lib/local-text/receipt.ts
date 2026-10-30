import type {JobReceipt} from './types'
export type LocalTextReceiptLink={id:string;projectId:string;conversationId:string}
export type LocalTextReceiptView=ReturnType<typeof projectLocalTextReceipt>
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const labels:Record<JobReceipt['state'],string>={queued:'I kö på AI-datorn',claimed:'Förbereder lokal modell',running:'Bearbetar lokalt',reviewing:'Granskar svaret',escalation_pending:'Förbereder reservmodell',needs_input:'Behöver din granskning',succeeded:'Granskat förslag klart',failed:'Kunde inte slutföras',cancelled:'Avbrutet',reconciling:'Kontrollerar ett osäkert försök'}
export function projectLocalTextReceipt(receipt:JobReceipt){
 const expired=Date.parse(receipt.expiresAt)<=Date.now()||receipt.reasonCode==='PAYLOAD_EXPIRED'
 return {type:'local_text_job' as const,id:receipt.id,projectId:receipt.projectId,conversationId:receipt.conversationId,state:receipt.state,label:expired?'Textens lagringstid har löpt ut':labels[receipt.state],reviewStatus:receipt.reviewStatus,reasonCode:expired?'PAYLOAD_EXPIRED':receipt.reasonCode,result:!expired&&receipt.state==='succeeded'&&receipt.reviewStatus==='approved'?receipt.result:null,expiresAt:receipt.expiresAt,updatedAt:receipt.updatedAt,authority:'suggestion_only' as const,cost:{localApiFeeUsd:0 as const,totalApiCostUsd:null as number|null,totalOperatingCostUsd:null as number|null,guaranteedSavings:false as const,status:'unverified' as 'unverified'|'metered'|'estimated'}}
}
/** History carries only a link. UI always re-fetches owned current state before
 * displaying output; an old/fabricated transcript cannot bless a result. */
export function localTextReceiptLink(value:unknown):LocalTextReceiptLink|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null
 const v=value as Record<string,unknown>
 return v.type==='local_text_job'&&uuid(v.id)&&uuid(v.projectId)&&uuid(v.conversationId)?{id:v.id,projectId:v.projectId,conversationId:v.conversationId}:null
}
export function localTextReceiptActive(v:{state:string;expiresAt:string;reasonCode:string|null}){return ['queued','claimed','running','reviewing','escalation_pending'].includes(v.state)&&Number.isFinite(Date.parse(v.expiresAt))&&Date.parse(v.expiresAt)>Date.now()&&v.reasonCode!=='PAYLOAD_EXPIRED'}
