import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {assertSameOrigin} from '@/lib/atlas/executive/http';
import {resolveCalendarAccess} from './access';
import {readCalendarWeek} from './read';
import {mutateCalendarEvent} from './store';
import {requestCalendarSourceMove} from './source-changes';
import {CalendarError,type CalendarActor,type CalendarReadDeps,type CalendarRange,type CalendarSourceRef,type CalendarFailure} from './types';
import {calendarFields,calendarId,parseCalendarMutation,parseCalendarRange} from './validate';
const statuses:Record<CalendarFailure['code'],number>={UNAUTHORIZED:401,NOT_FOUND:404,INVALID_INPUT:400,CONFLICT:409,UNAVAILABLE:503};
export function calendarResponse(value:unknown,status=200):Response{return Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});}
export async function readFilteredCalendar(deps:CalendarReadDeps,actor:CalendarActor,input:unknown){
 calendarFields(input,['fromDate','toDateExclusive','timeZone','projectId']);
 const range=parseCalendarRange({fromDate:input.fromDate,toDateExclusive:input.toDateExclusive,timeZone:input.timeZone});
 let scoped=actor;
 if(input.projectId!==undefined){
  calendarId(input.projectId);
  if(!actor.allowedProjectIds.includes(input.projectId))throw new CalendarError('NOT_FOUND');
  scoped={...actor,allowedProjectIds:[input.projectId]};
 }
 const model=await readCalendarWeek(deps,scoped,range);
 return input.projectId===undefined?model:{...model,entries:model.entries.filter(e=>e.projectId===input.projectId)};
}
async function jsonBody(request:Request):Promise<unknown>{
 if(!request.body)throw new CalendarError('INVALID_INPUT');
 const reader=request.body.getReader();let length=0;const chunks:Uint8Array[]=[];
 try {
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>32768){await reader.cancel();throw Object.assign(new CalendarError('INVALID_INPUT'),{httpStatus:413});}chunks.push(value);}
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new CalendarError('INVALID_INPUT');}
}
export async function calendarApi(request:Request):Promise<Response>{
 try {
  const access=await resolveCalendarAccess();
  if(!access.ok){access.response.headers.set('Cache-Control','private, no-store');return access.response;}
  const deps={sessionDb:access.sessionDb,adminDb:createAdminClient()};
  if(request.method==='GET'){
   const params=new URL(request.url).searchParams;
   for(const key of params.keys())if(params.getAll(key).length!==1)throw new CalendarError('INVALID_INPUT');
   const values=Object.fromEntries(params);
   return calendarResponse(await readFilteredCalendar(deps,access.actor,{timeZone:'Europe/Stockholm',...values}));
  }
  if(request.method!=='POST')return calendarResponse({ok:false,code:'INVALID_INPUT'},405);
  const forbidden=assertSameOrigin(request);if(forbidden){forbidden.headers.set('Cache-Control','private, no-store');return forbidden;}
  const body=await jsonBody(request);
  if(body&&typeof body==='object'&&(body as {operation?:unknown}).operation==='source_move'){
   calendarFields(body,['operation','source','localMinute','idempotencyKey']);
   const result=await requestCalendarSourceMove(deps.adminDb,access.actor,{source:body.source as CalendarSourceRef,localMinute:body.localMinute as string,idempotencyKey:body.idempotencyKey as string});
   return calendarResponse(result,result.ok?200:statuses[result.code]);
  }
  return calendarResponse(await mutateCalendarEvent(access.sessionDb,parseCalendarMutation(body)));
 }catch(error){
  const code=error instanceof CalendarError?error.code:'UNAVAILABLE';
  return calendarResponse({ok:false,code},(error as {httpStatus?:number}).httpStatus??statuses[code]);
 }
}
