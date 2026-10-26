import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
export async function probeWeeklyConcurrency({sql,dockerBin,container}){
 const source=readFileSync(new URL('./probe-family-weekly-preparation-full.sql',import.meta.url),'utf8');
 const prefix=source.slice(0,source.indexOf(" if has_function_privilege"));
 sql("create table public.weekly_probe_input(p jsonb,input jsonb);grant select,insert on public.weekly_probe_input to service_role;"+prefix+"\ninsert into public.weekly_probe_input values(p,input);end $$;reset role;commit;");
 sql("insert into public.conversations(id,user_id,project_id) values('51000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','77cda551-57c9-4dc0-b019-1bb6438777f7');");
 const run=(second)=>new Promise((resolve,reject)=>{
  const child=spawn(dockerBin,['exec','-i',container,'psql','-X','-qAt','--single-transaction','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','calendar_history_test']);let out='',err='';
  child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(Error(err)));
  child.stdin.end("set local role service_role;select public.social_weekly_save(p,"+(second?"jsonb_set(input,'{conversationId}','\"51000000-0000-4000-8000-000000000002\"')":"input")+") from public.weekly_probe_input;");
 });
 const [a,b]=await Promise.all([run(false),run(true)]);assert.equal(a,b,'parallel conversations must receive identical saved IDs');
 assert.equal(sql("select count(*) from public.social_weekly_preparations where project_id='77cda551-57c9-4dc0-b019-1bb6438777f7'"),'1');
 assert.equal(sql("select count(*) from public.social_content_posts where project_id='77cda551-57c9-4dc0-b019-1bb6438777f7'"),'5');
 assert.equal(sql("select count(*) from public.social_schedule_jobs where project_id='77cda551-57c9-4dc0-b019-1bb6438777f7'"),'1');
 assert.equal(sql("select count(*) from public.social_publications where project_id='77cda551-57c9-4dc0-b019-1bb6438777f7'"),'0');
 return 5;
}
