import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import {resolveCleanupOperator} from './authority'
import {callHandlarborsenTestData} from './client'
import {dispatchApprovedCleanup,reconcileCleanup} from './service'
import {saveCleanupReview} from './review-store'
import {HANDLARBORSEN_PROJECT_ID,decodeIntegrationRequest,exactKeys,isObject,isUuid} from './contracts'
const object=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object' as const,properties,required,additionalProperties:false})
const uuid={type:'string',format:'uuid'}
export const CLEANUP_TOOLS:Anthropic.Tool[]=[
 {name:'inspect_handlarborsen_test_data',description:'Läs Handlarbörsens klassificeringar och blockerare. Inga ändringar. Okända företag är aldrig testdata.',input_schema:object({cursor:uuid})},
 {name:'prepare_handlarborsen_test_cleanup',description:'Förbered ett exakt 10-minuters paket för att lägga undan eller återställa verifierad testdata. Ett separat granskningskort måste godkännas av användaren. Familjestunden och Bromölla kylteknik är skyddade. Inga hårda raderingar.',input_schema:object({organisationIds:{type:'array',items:uuid,maxItems:25},operation:{type:'string',enum:['quarantine','restore']}},['organisationIds','operation'])},
 {name:'execute_handlarborsen_test_cleanup',description:'Utför bara ett redan mänskligt godkänt exakt paket. Ett muntligt ja eller confirm-fält kan aldrig godkänna. Utfallet får endast kallas lyckat när ett lagrat kvitto finns.',input_schema:object({packageId:uuid},['packageId'])},
 {name:'get_handlarborsen_test_cleanup_receipt',description:'Kontrollera kvittot för samma godkända paket efter väntan eller avbrott. Startar aldrig en ny körning.',input_schema:object({packageId:uuid},['packageId'])},
]
export const CLEANUP_TOOL_NAMES=CLEANUP_TOOLS.map(t=>t.name)
export async function handleCleanupTool(name:string,input:unknown,conversationId:string|null):Promise<unknown>{
 if(!CLEANUP_TOOL_NAMES.includes(name)||!isUuid(conversationId)||!isObject(input))return {status:'denied'}
 const scope={projectId:HANDLARBORSEN_PROJECT_ID,conversationId}
 if(name==='execute_handlarborsen_test_cleanup'||name==='get_handlarborsen_test_cleanup_receipt'){
  if(!exactKeys(input,['packageId'])||!isUuid(input.packageId))return {status:'denied'}
  return name==='execute_handlarborsen_test_cleanup'?dispatchApprovedCleanup(input.packageId,scope):reconcileCleanup(input.packageId,scope)
 }
 const request=decodeIntegrationRequest({action:name==='inspect_handlarborsen_test_data'?'inventory':'prepare',payload:input})
 if(!request||request.action!=='inventory'&&request.action!=='prepare')return {status:'denied'}
 const auth=await resolveCleanupOperator({...scope,...(request.action==='prepare'?{operation:request.payload.operation}:{})})
 if(!auth.ok)return {status:'denied'}
 const result=await callHandlarborsenTestData(request,auth.principal)
 if(result.status==='ok'&&result.action==='prepare'&&result.data.status==='prepared'){
  const review=await saveCleanupReview(result.data,auth.principal)
  return review?{status:'review_required',review}:{status:'unavailable'}
 }
 return result
}

export const CLEANUP_GUIDE='\nTestdata: inventera endast på begäran. Okänt är aldrig test. Be om klassning i separat adminvy; modellen får inte klassificera eller godkänna. Förbered ett exakt paket och be användaren trycka i granskningskortet. Läs upp kort omfattning och blockerare. Ett löst ja/confirm ger inget mandat. Vid nothing_to_do: Inga testposter att lägga undan. Vid needs_new_review: Ny granskning behövs. Vid okänt utfall: Utfallet kontrolleras; kontrollera samma kvitto. Säg Testdata undanlagd/återställd endast för ett validerat applied-kvitto. Mikrofonstopp avbryter inte ett godkänt serverjobb.\n'
