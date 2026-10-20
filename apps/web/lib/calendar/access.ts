import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import type {AdminDb,CalendarActor,CalendarDb} from './types';
/** A failed ownership lookup is closed scope plus unavailable feeds, never a healthy empty week. */
export async function resolveCalendarProjectScope(db:AdminDb,userId:string):Promise<{allowedProjectIds:string[];projectScopeAvailable:boolean}>{
 try {
  const {data,error}=await db.from('projects').select('id').eq('owner_id',userId);
  if(error||!Array.isArray(data))throw Error('Calendar project scope unavailable');
  return {allowedProjectIds:data.map(row=>row.id),projectScopeAvailable:true};
 }catch{return {allowedProjectIds:[],projectScopeAvailable:false};}
}
export async function resolveCalendarAccess():Promise<{ok:true;actor:CalendarActor;sessionDb:CalendarDb}|{ok:false;response:Response}>{
 try {
  const sessionDb=await createClient();
  const {data:{user},error}=await sessionDb.auth.getUser();
  if(error||!user)return {ok:false,response:Response.json({ok:false,code:'UNAUTHORIZED'},{status:401,headers:{'Cache-Control':'private, no-store'}})};
  const scope=await resolveCalendarProjectScope(createAdminClient(),user.id);
  return {ok:true,actor:{userId:user.id,...scope},sessionDb};
 }catch{
  return {ok:false,response:Response.json({ok:false,code:'UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store'}})};
 }
}
