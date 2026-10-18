import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getAllowedProjectIds} from '@/lib/atlas/isolation';
import type {CalendarActor,CalendarDb} from './types';
export async function resolveCalendarAccess():Promise<{ok:true;actor:CalendarActor;sessionDb:CalendarDb}|{ok:false;response:Response}>{
 try {
  const sessionDb=await createClient();
  const {data:{user},error}=await sessionDb.auth.getUser();
  if(error||!user)return {ok:false,response:Response.json({ok:false,code:'UNAUTHORIZED'},{status:401,headers:{'Cache-Control':'private, no-store'}})};
  const allowedProjectIds=await getAllowedProjectIds(createAdminClient(),user.id);
  return {ok:true,actor:{userId:user.id,allowedProjectIds},sessionDb};
 }catch{
  return {ok:false,response:Response.json({ok:false,code:'UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store'}})};
 }
}
