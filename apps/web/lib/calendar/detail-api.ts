import 'server-only';
import {resolveCalendarAccess} from './access';
import {createAdminClient} from '../supabase/admin';
import {CalendarError} from './types';
import {readCalendarDetail} from './detail';
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
export async function calendarDetailApi(request:Request):Promise<Response>{
 try{
  const access=await resolveCalendarAccess();if(!access.ok){Object.entries(headers).forEach(([k,v])=>access.response.headers.set(k,v));return access.response;}
  if(request.method!=='GET')return Response.json({ok:false,code:'INVALID_INPUT'},{status:405,headers});
  const params=new URL(request.url).searchParams,raw=params.get('source');
  if([...params.keys()].some(k=>k!=='source')||params.getAll('source').length!==1||!raw||raw.length>4096)return Response.json({ok:false,code:'INVALID_INPUT'},{status:400,headers});
  let source;try{source=JSON.parse(raw);}catch{return Response.json({ok:false,code:'INVALID_INPUT'},{status:400,headers});}
  const detail=await readCalendarDetail({adminDb:createAdminClient()},access.actor,source);
  return Response.json({ok:true,detail},{headers});
 }catch(error){const code=error instanceof CalendarError?error.code:'UNAVAILABLE';return Response.json({ok:false,code},{status:code==='NOT_FOUND'?404:code==='CONFLICT'?409:code==='INVALID_INPUT'?400:503,headers});}
}
