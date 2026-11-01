import {readFileSync} from 'node:fs'
export async function sendDispatchRaces({root,sql,run}){
 const tests=readFileSync(root+'/apps/web/supabase/tests/sales_sending.sql','utf8')
 const prefix=tests.slice(0,tests.indexOf(" c:=sales_send_claim(repeat('8',64),'{}');ref:=")).replaceAll('000000000091','000000000191').replaceAll('000000000092','000000000192').replaceAll("repeat('8',64)","repeat('d7',32)").replaceAll("repeat('9',64)","repeat('d8',32)")
 sql('create table public.send_race_fixture(data jsonb);grant select,insert on public.send_race_fixture to service_role;')
 sql(prefix+" c:=sales_send_claim(repeat('d7',32),'{}');insert into public.send_race_fixture values(c);end $$;reset role;commit;")
 const results=await Promise.all(Array.from({length:10},()=>run("select sales_send_begin_dispatch(repeat('d7',32),(select data->'ref' from send_race_fixture));")))
 if(results.filter(x=>x.code===0).length!==1||results.filter(x=>x.err.includes('FENCED')).length!==9)throw Error('SEND_PARALLEL_DISPATCH_FAILED: '+JSON.stringify(results.map(x=>({code:x.code,error:x.err.slice(-120)}))))
 console.log('PASS: ten parallel begin_dispatch calls produce exactly one permit and nine fences')
}
