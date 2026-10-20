import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import {CalendarError,type CalendarReadDeps,type CalendarActor,type CalendarSourceRef} from './types';
import {calendarFields,calendarId,parseCalendarMutation} from './validate';
import {readFilteredCalendar} from './api';
import {mutateCalendarEvent} from './store';
import {requestCalendarSourceMove} from './source-changes';
export const CALENDAR_TOOL_NAMES:readonly string[]=['get_calendar','create_calendar_event','update_calendar_event','cancel_calendar_event'];
const id={type:'string',format:'uuid'},nullableId={anyOf:[id,{type:'null'}]};
const time={oneOf:[
 {type:'object',additionalProperties:false,required:['kind','startUtc','endUtc','timeZone'],properties:{kind:{const:'timed'},startUtc:{type:'string',description:'Exakt UTC ISO med millisekunder, exempel 2026-10-22T12:00:00.000Z.'},endUtc:{type:['string','null'],description:'null när sluttid saknas. Hitta aldrig på längd.'},timeZone:{const:'Europe/Stockholm'}}},
 {type:'object',additionalProperties:false,required:['kind','startDate','endDateExclusive','timeZone'],properties:{kind:{const:'all_day'},startDate:{type:'string',format:'date'},endDateExclusive:{type:'string',format:'date'},timeZone:{const:'Europe/Stockholm'}}}
]};
const draft={type:'object',additionalProperties:false,required:['kind','title','description','location','projectId','taskId','time','workStatus'],properties:{kind:{enum:['private','work_block']},title:{type:'string',minLength:1,maxLength:150},description:{type:'string',maxLength:5000},location:{type:'string',maxLength:500},projectId:nullableId,taskId:nullableId,time,workStatus:{enum:[null,'planned','in_progress','done']}}};
const schema=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object' as const,properties,required,additionalProperties:false});
export const CALENDAR_TOOLS:Anthropic.Tool[]=[
 {name:'get_calendar',description:'Läs din privata kalender och ägda projekt för ett exakt lokalt datumintervall (max31dagar). Börja här innan ett namngivet möte flyttas; välj aldrig mellan flera möten utan följdfråga.',input_schema:schema({fromDate:{type:'string',format:'date'},toDateExclusive:{type:'string',format:'date'},timeZone:{const:'Europe/Stockholm'},projectId:id},['fromDate','toDateExclusive','timeZone'])},
 {name:'create_calendar_event',description:'Spara ett tydligt beställt privat möte eller arbetsblock. Stabilt eventId och idempotencyKey återanvänds vid återförsök. Startar inget agentjobb.',input_schema:schema({eventId:id,idempotencyKey:id,draft})},
 {name:'update_calendar_event',description:'Ändra exakt läst manuell post med dess version (mode=manual, mutation operation=update eller restore), eller föreslå social tidsändring (mode=source_move). Social ändring kräver ny granskning.',input_schema:schema({mode:{enum:['manual','source_move']},mutation:{type:'object',properties:{operation:{enum:['update','restore']},eventId:id,expectedVersion:{type:'integer',minimum:1},idempotencyKey:id,draft},required:['operation','eventId','expectedVersion','idempotencyKey'],additionalProperties:false},source:{type:'object',properties:{kind:{const:'social'},projectId:id,postId:id,revisionId:id,sha256:{type:'string'},jobId:nullableId},required:['kind','projectId','postId','revisionId','sha256','jobId'],additionalProperties:false},localMinute:{type:'string',description:'Exakt svensk lokal tid YYYY-MM-DDTHH:mm; tvetydig sommartid avvisas.'},idempotencyKey:id},['mode'])},
 {name:'cancel_calendar_event',description:'Avboka ett exakt identifierat privat möte/arbetsblock med väntad version. Återställbart, ingen permanent radering.',input_schema:schema({eventId:id,expectedVersion:{type:'integer',minimum:1},idempotencyKey:id})}
];
export const CALENDAR_GUIDE=`
KALENDERN (privat, bara i ägarens interaktiva samtal):
Använd samma kalenderverktyg för text och röstsamtal. För relativa datum använder du get_current_time för Europe/Stockholm först. Kontrollera hela lokala datumet och exakt UTC-offset, gissa aldrig sommartid.
Läs get_calendar innan flytt/avbokning. Om flera möten passar, eller dag/tid är oklar: ställ en konkret följdfråga innan skrivning. Skicka aldrig en titel som ersättning för postens riktiga id/version.
En tydlig begäran om ett vanligt möte räcker för att spara. Fråga inte efter publiceringsgodkännande för privata möten. Privat kind har workStatus=null. Arbetsblock kräver planned/in_progress/done och startar inget agentjobb. Heldag använder exklusivt slutdatum; saknad sluttid förblir null.
Generera UUID för nytt eventId/idempotencyKey en gång. Återanvänd dem vid återförsök, ändra inte innehåll under samma nyckel. CONFLICT kräver ny läsning och tydlig lösning, aldrig tyst överskrivning.
Säg att ändringen är klar först efter ok=true och sparat kvitto. Bekräfta exakt datum/tid och kalenderlänk. Sociala source_move-resultat är granskningsförslag: den gamla godkända tiden gäller tills ny granskning. Verktygen kan inte godkänna, bekräfta kundåtkomst eller publicera. Workflow-tider kan bara visas och länkas.
Calendar confirmation UX: Once a calendar mutation returns ok=true, confirm the title and date/time in natural Swedish. Never print the raw calendarHref path or a label like Kalenderlank: /calendar?week=... in chat. If the chat supports Markdown links, show [Visa i kalendern](calendarHref) using exactly the returned internal calendarHref; otherwise just confirm the saved event without exposing the path. Do not invent a URL, and never claim success without the saved receipt.
Privata titlar och anteckningar ska aldrig kopieras till projektminne, delade agentloggar eller fristående projektagenter.`;
export async function handleCalendarTool(name:string,input:Record<string,unknown>,context:{actor:CalendarActor;conversationId:string|null;inputSource:'text'|'voice'},deps:CalendarReadDeps):Promise<unknown>{
 try{
  if(!CALENDAR_TOOL_NAMES.includes(name)||!['text','voice'].includes(context.inputSource))throw new CalendarError('INVALID_INPUT');
  if(!context.conversationId)return {ok:false,code:'UNAUTHORIZED'};
  calendarId(context.conversationId);
  const {data:conversation,error}=await deps.adminDb.from('conversations').select('id').eq('id',context.conversationId).eq('user_id',context.actor.userId).maybeSingle();
  if(error)throw new CalendarError('UNAVAILABLE');
  if(!conversation)return {ok:false,code:'NOT_FOUND'};
  if(name==='get_calendar')return {ok:true,calendar:await readFilteredCalendar(deps,context.actor,input)};
  if(name==='create_calendar_event'){
   calendarFields(input,['eventId','idempotencyKey','draft']);
   return await mutateCalendarEvent(deps.sessionDb,parseCalendarMutation({operation:'create',...input}));
  }
  if(name==='cancel_calendar_event'){
   calendarFields(input,['eventId','expectedVersion','idempotencyKey']);
   return await mutateCalendarEvent(deps.sessionDb,parseCalendarMutation({operation:'cancel',...input}));
  }
  if(input.mode==='manual'){
   calendarFields(input,['mode','mutation']);
   const mutation=parseCalendarMutation(input.mutation);
   if(!['update','restore'].includes(mutation.operation))throw new CalendarError('INVALID_INPUT');
   return await mutateCalendarEvent(deps.sessionDb,mutation);
  }
  if(input.mode==='source_move'){
   calendarFields(input,['mode','source','localMinute','idempotencyKey']);
   return await requestCalendarSourceMove(deps.adminDb,context.actor,{source:input.source as CalendarSourceRef,localMinute:input.localMinute as string,idempotencyKey:input.idempotencyKey as string});
  }
  throw new CalendarError('INVALID_INPUT');
 }catch(error){return {ok:false,code:error instanceof CalendarError?error.code:'UNAVAILABLE'};}
}
/** Persist only private IDs and receipt metadata, never titles, notes or event bodies. */
export function persistCalendarToolData(input:Record<string,unknown>,result:unknown):{input:unknown;result:unknown}{
 const nested=input.mutation&&typeof input.mutation==='object'?input.mutation as Record<string,unknown>:input;
 const safeInput=Object.fromEntries(['eventId','expectedVersion','idempotencyKey','operation'].filter(k=>typeof nested[k]==='string'||typeof nested[k]==='number').map(k=>[k,nested[k]]));
 const r=(result&&typeof result==='object'?result:{}) as Record<string,unknown>,event=r.event as {id?:unknown;version?:unknown}|undefined;
 return {input:safeInput,result:r.ok===true?{ok:true,mutationId:r.mutationId??null,eventId:event?.id??null,version:event?.version??null,calendarHref:r.calendarHref??null,reviewRequired:r.reviewRequired===true}:{ok:false,code:typeof r.code==='string'?r.code:'UNAVAILABLE'}};
}

export function isCalendarIntent(text:string):boolean {
 return /(?<![\p{L}\p{N}_])(?:kalender(?:n)?|möte(?:t|n)?|arbetsblock|boka|flytta|avboka|calendar|meeting|appointment)(?![\p{L}\p{N}_])/iu.test(text)
  || /vad[\s\S]*jag[\s\S]*(?:vecka|måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)/iu.test(text);
}
