import 'server-only';
import {NextResponse} from 'next/server';
import {assertSameOrigin,readJsonBody} from '../atlas/executive/http';
import {resolveCalendarAccess} from './access';
import {createAdminClient} from '../supabase/admin';
import {CalendarError} from './types';
import {calendarFields,calendarId} from './validate';
import {prepareStoryJob,approveStoryJob,readStoryJobReceipt,latestStoryJobReceipt,StoryStartError} from './production-start';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function calendarProductionStartApi(request:Request):Promise<Response>{
 try{
  if(request.method!=='POST')return json({ok:false,code:'INVALID_INPUT'},405);
  const origin=assertSameOrigin(request);if(origin){origin.headers.set('Cache-Control','private, no-store');return origin;}
  const access=await resolveCalendarAccess();if(!access.ok){access.response.headers.set('Cache-Control','private, no-store');return access.response;}
  const input=await readJsonBody(request);if(input instanceof NextResponse){input.headers.set('Cache-Control','private, no-store');return input;}
  const db=createAdminClient();
  if(input.operation==='prepare'){
   calendarFields(input,['operation','projectId','instanceId','requestKey']);calendarId(input.projectId);calendarId(input.instanceId);calendarId(input.requestKey);
   return json({ok:true,review:await prepareStoryJob(db,access.actor,{projectId:input.projectId,instanceId:input.instanceId,requestKey:input.requestKey})});
  }
  if(input.operation==='approve'){
   calendarFields(input,['operation','requestId','reviewedHash']);calendarId(input.requestId);
   if(typeof input.reviewedHash!=='string'||!/^[a-f0-9]{64}$/.test(input.reviewedHash))throw new CalendarError('INVALID_INPUT');
   return json({ok:true,receipt:await approveStoryJob(db,access.sessionDb,access.actor,{requestId:input.requestId,reviewedHash:input.reviewedHash})});
  }
  if(input.operation==='status'){
   if(input.requestId===undefined){
    calendarFields(input,['operation','projectId','instanceId']);calendarId(input.projectId);calendarId(input.instanceId);
    return json({ok:true,receipt:await latestStoryJobReceipt(db,access.actor,input.projectId,input.instanceId)});
   }
   calendarFields(input,['operation','requestId']);calendarId(input.requestId);
   return json({ok:true,receipt:await readStoryJobReceipt(db,access.actor,input.requestId)});
  }
  throw new CalendarError('INVALID_INPUT');
 }catch(error){
  if(error instanceof StoryStartError)return json({ok:false,code:error.reason},error.reason==='unavailable'?503:409);
  const code=error instanceof CalendarError?error.code:'UNAVAILABLE';
  return json({ok:false,code},code==='NOT_FOUND'?404:code==='INVALID_INPUT'?400:503);
 }
}
