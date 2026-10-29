/** Server-only, no-input RPC. No direct run insertion and no model call. */
import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {WeeklyEnqueuePort} from './run-creator'

type Admin=ReturnType<typeof createAdminClient>
type Rpc={rpc:(name:string,args:Record<string,never>)=>Promise<{data:unknown;error:unknown}>}
export function familyWeeklyEnqueuePort(db:Admin):WeeklyEnqueuePort{
 const client=db as unknown as Rpc
 return {
  async enqueueOnce(){
   const {data,error}=await client.rpc('family_weekly_enqueue_once',{})
   if(error)throw Error('FAMILY_WEEKLY_QUEUE_UNAVAILABLE')
   return data
  },
 }
}
