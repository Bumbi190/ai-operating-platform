import 'server-only';
import {resolveCalendarAccess} from './access';
import {createAdminClient} from '../supabase/admin';
import {CalendarError} from './types';
import {calendarFields,calendarId} from './validate';
import {readCalendarProductionPreview} from './production-preview';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function calendarProductionPreviewApi(request:Request):Promise<Response>{
 try{
  if(request.method!=='GET')return json({ok:false,code:'INVALID_INPUT'},405);
  const access=await resolveCalendarAccess();
  if(!access.ok){access.response.headers.set('Cache-Control','private, no-store');return access.response;}
  const params=new URL(request.url).searchParams;
  for(const key of params.keys())if(params.getAll(key).length!==1)throw new CalendarError('INVALID_INPUT');
  const input=Object.fromEntries(params);
  calendarFields(input,['projectId','instanceId']);calendarId(input.projectId);calendarId(input.instanceId);
  return json({ok:true,preview:await readCalendarProductionPreview(createAdminClient(),access.actor,{projectId:input.projectId,instanceId:input.instanceId})});
 }catch(error){
  const code=error instanceof CalendarError?error.code:'UNAVAILABLE';
  return json({ok:false,code},code==='INVALID_INPUT'?400:code==='NOT_FOUND'?404:503);
 }
}
