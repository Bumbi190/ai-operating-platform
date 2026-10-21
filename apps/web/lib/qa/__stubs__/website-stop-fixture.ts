// Test-only bootstrap of the actual stop authority, never a runtime mutation path.
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
export function restoreWebsiteStopFixture(sql:(body:string)=>string,root:string):void{
 const source=readFileSync(resolve(root,'apps/web/supabase/migrations/20260831_unified_stop_authority.sql'),'utf8')
 sql(source.slice(source.indexOf('create table if not exists public.stop_events'),source.indexOf('create or replace function public.stop_set_platform_automation')))
 const start=source.indexOf('create or replace function public.stop_set_project_execution('),end=source.indexOf('end $$;',start)
 if(start<0||end<start)throw Error('Canonical stop authority missing')
 sql(source.slice(start,end+8))
 sql('revoke all on function stop_set_project_execution(uuid,boolean,text,text) from public,anon,authenticated;grant execute on function stop_set_project_execution(uuid,boolean,text,text) to service_role;')
}
