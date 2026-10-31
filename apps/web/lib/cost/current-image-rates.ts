import 'server-only'
import {createAdminClient} from '@/lib/supabase/admin'
/** Campaign-only release gate: never cache, infer or fall back on an unreadable rate. */
export async function getCurrentImageRates(db:ReturnType<typeof createAdminClient>=createAdminClient(),signal?:AbortSignal):Promise<Record<string,number>>{
 const deadline=signal?AbortSignal.any([signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000)
 const keys=['usd_sek','ideogram_v3_usd_per_image']
 try{
  const {data,error}=await db.from('cost_rates').select('key,value').in('key',keys).abortSignal(deadline)
  if(error||!data||data.length!==2)throw Error()
  const rates:Record<string,number>={}
  for(const row of data){
   if(!keys.includes(row.key)||Object.hasOwn(rates,row.key)||!Number.isFinite(Number(row.value))||Number(row.value)<=0)throw Error()
   rates[row.key]=Number(row.value)
  }
  if(keys.some(key=>!Object.hasOwn(rates,key)))throw Error()
  return rates
 }catch{throw new Error('Current canonical image prices unavailable')}
}
