import type {AuthChangeEvent,Session} from '@supabase/supabase-js';
const A='20000000-0000-4000-8000-000000000001';
let owner=/calendar_test_user=([a-f0-9-]+)/.exec(document.cookie)?.[1]??A;
const listeners=new Set<(event:AuthChangeEvent,session:Session|null)=>void>();
const session=()=>owner?({user:{id:owner}} as Session):null;
export function emitCalendarAuth(next:string|null){owner=next??'';document.cookie='calendar_test_user='+owner+'; Path=/';for(const listener of listeners)listener(next?'SIGNED_IN':'SIGNED_OUT',session());}
export function createClient(){return {auth:{onAuthStateChange(listener:(event:AuthChangeEvent,session:Session|null)=>void){listeners.add(listener);queueMicrotask(()=>{if(listeners.has(listener))listener('INITIAL_SESSION',session())});return {data:{subscription:{unsubscribe:()=>listeners.delete(listener)}}};}}};}
