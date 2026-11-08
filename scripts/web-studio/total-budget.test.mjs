// Real PostgreSQL; isolated disposable container, no host DB/credentials/ports.
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync,spawn} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)))
const name='omnira-total-budget-'+process.pid+'-'+randomUUID().slice(0,8)
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',timeout:30000,maxBuffer:2*1024**2,stdio:['pipe','pipe','pipe']})
const args=['exec','-i',name,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres']
const sql=s=>docker(args,s).trim()
const asService=s=>sql('set role service_role;'+s)
const token=()=>randomUUID(),sha='a'.repeat(64)
const migrate=f=>sql(readFileSync(resolve(root,'apps/web/supabase/migrations',f),'utf8'))
const project=()=>sql("insert into projects(slug,owner_id,execution_paused) values('"+token()+"','20000000-0000-4000-8000-000000000001',true) returning id")
function setup(limit=1_000_000,prior=0){const p=project();sql(`insert into project_budgets(project_id,monthly_sek) values('${p}',1000)`);asService(`select budget_set_total_allowance('${p}','20000000-0000-4000-8000-000000000001',${limit},${prior},'${sha}')`);return p}
const reserve=(p,sek)=>asService(`select budget_open_override_reservation('${p}',${sek},'openai','website.test')`)
const mark=(r,t=token(),fx='10')=>asService(`select budget_mark_dispatch_intent('${r}','${t}','token_window',${fx})`)
const consumed=p=>Number(sql(`select total_usd_committed_micros from project_budgets where project_id='${p}'`))
const concurrent=s=>new Promise((done,fail)=>{const p=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',fail);p.on('close',c=>c?fail(Error(err)):done(out.trim()));p.stdin.end('set role service_role;'+s)})
test('one-off total allowance at the canonical dispatch intent',async t=>{
 let owned=false
 try{
  docker(['run','-d','--pull=never','--name',name,'--label','omnira.test.owner=studio-total-budget','--network','none','--memory','128m','--cpus','0.5','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16','-c','shared_buffers=16MB','-c','max_connections=20']);owned=true
  let ready=false;for(let i=0;i<30;i++){try{assert.ok(docker(['logs',name]).includes('PostgreSQL init process complete'));sql('select 1');ready=true;break}catch{await new Promise(r=>setTimeout(r,300))}}assert.ok(ready,'Postgres startup')
  const base=readFileSync(resolve(root,'apps/web/lib/qa/m0-durable-spend-sql.test.ts'),'utf8').match(/const FIXTURE = `([\s\S]*?)`/)
  assert.ok(base,'canonical M0 fixture');sql(base[1]);sql('alter table projects add column execution_paused boolean not null default true')
  for(const f of ['20260602_cost_events.sql','20260830_spend_budget_gate.sql','20260831_budget_scopes.sql','20260910120000_cost_ledger_rls_isolation.sql','20261001160000_m0_durable_spend_settlement.sql','20261104110000_project_total_allowance.sql'])migrate(f)
  await t.test('exact cap admitted, one extra microdollar refused',()=>{const p=setup();assert.equal(mark(reserve(p,10)),'t');assert.equal(consumed(p),1e6);assert.equal(mark(reserve(p,.0001)),'f');assert.equal(consumed(p),1e6)})
  await t.test('rounds the stored SEK ceiling upward to USD micros',()=>{const p=setup();assert.equal(mark(reserve(p,.0001),token(),'10.5'),'t');assert.equal(consumed(p),10)})
  await t.test('imports prior consumption once and cannot reset or top up',()=>{const p=setup(1e6,500000);assert.equal(mark(reserve(p,5)),'t');assert.equal(consumed(p),1e6);assert.throws(()=>asService(`select budget_set_total_allowance('${p}','20000000-0000-4000-8000-000000000001',2000000,0,'${sha}')`));assert.equal(consumed(p),1e6)})
  await t.test('legacy client cannot dispatch a capped project',()=>{const p=setup(),r=reserve(p,1);assert.equal(asService(`select budget_mark_dispatch_intent('${r}','${token()}','token_window')`),'f');assert.equal(consumed(p),0)})
  await t.test('uncapped projects keep both legacy and new caller behavior',()=>{const p=project();sql(`insert into project_budgets(project_id,monthly_sek) values('${p}',1000)`);assert.equal(asService(`select budget_mark_dispatch_intent('${reserve(p,1)}','${token()}','token_window')`),'t');assert.equal(mark(reserve(p,1),token(),'null'),'t')})
  await t.test('same-token retry counts once; changed token or FX refuses',()=>{const p=setup(),r=reserve(p,2),v=token();assert.equal(mark(r,v),'t');assert.equal(mark(r,v),'t');assert.equal(mark(r,token()),'f');assert.equal(mark(r,v,'11'),'f');assert.equal(consumed(p),200000)})
  await t.test('concurrent admissions cannot exceed the total',async()=>{const p=setup(),rs=Array.from({length:6},()=>reserve(p,3));const outcomes=await Promise.all(rs.map(r=>concurrent(`select budget_mark_dispatch_intent('${r}','${token()}','token_window',10)`)));assert.equal(outcomes.filter(x=>x==='t').length,3);assert.equal(consumed(p),900000)})
  await t.test('proven-undispatched release does not recycle the one-off allowance',()=>{const p=setup(),r=reserve(p,10),v=token();assert.equal(mark(r,v),'t');asService(`select budget_release_undispatched('${r}','${v}')`);assert.equal(consumed(p),1e6);assert.equal(mark(reserve(p,1)),'f')})
  await t.test('ambiguous settlement and month changes do not refund the allowance',()=>{const p=setup(),r=reserve(p,10),v=token();assert.equal(mark(r,v),'t');asService(`select * from budget_settle_recorded('${r}','${v}','estimate_ambiguous','[]')`);sql(`update project_budgets set updated_at=now()-interval '70 days',monthly_sek=500 where project_id='${p}'`);assert.equal(consumed(p),1e6);assert.equal(mark(reserve(p,1)),'f')})
  await t.test('ordinary clients cannot configure, reset, erase, or dispatch',()=>{const p=setup();for(const role of ['anon','authenticated']){assert.throws(()=>sql(`set role ${role};select budget_set_total_allowance('${p}','20000000-0000-4000-8000-000000000001',2,0,'${sha}')`));assert.throws(()=>sql(`set role ${role};update project_budgets set total_usd_limit_micros=null,total_usd_committed_micros=0,total_approval_sha256=null where project_id='${p}'`));assert.throws(()=>sql(`set role ${role};delete from project_budgets where project_id='${p}'`));assert.throws(()=>sql(`set role ${role};select budget_mark_dispatch_intent('${reserve(p,1)}','${token()}','token_window',10)`))}})
  await t.test('service role cannot erase or lower an activated allowance directly',()=>{const p=setup();assert.equal(mark(reserve(p,1)),'t');assert.throws(()=>asService(`update project_budgets set total_usd_committed_micros=0 where project_id='${p}'`));assert.throws(()=>asService(`delete from project_budgets where project_id='${p}'`));assert.equal(consumed(p),100000)})
  await t.test('invalid rate never admits and leaves intent untouched',()=>{for(const fx of ['null','0','-1',"'NaN'::numeric","'Infinity'::numeric"]){const p=setup(),r=reserve(p,1);assert.equal(mark(r,token(),fx),'f');assert.equal(consumed(p),0);assert.equal(sql(`select dispatched_at is null from spend_reservations where id='${r}'`),'t')}})
  await t.test('another project cannot consume this allowance',()=>{const p=setup(),other=setup();assert.equal(mark(reserve(p,10)),'t');assert.equal(consumed(other),0);assert.equal(mark(reserve(other,10)),'t')})
  await t.test('intent write failure rolls back the allowance in the same transaction',()=>{const p=setup(),r=reserve(p,1);sql(`create function public.total_test_fail() returns trigger language plpgsql as $$ begin raise exception 'fixture failure';end $$;create trigger total_test_fail before update on spend_reservations for each row execute function public.total_test_fail()`);try{assert.throws(()=>mark(r));assert.equal(consumed(p),0)}finally{sql('drop trigger total_test_fail on spend_reservations;drop function total_test_fail()')}assert.equal(mark(r),'t')})
  await t.test('monthly editing preserves an activated total and invalid partial caps are refused',()=>{const p=setup();asService(`update project_budgets set monthly_sek=200 where project_id='${p}'`);assert.equal(consumed(p),0);assert.equal(sql(`select total_usd_limit_micros from project_budgets where project_id='${p}'`),'1000000');assert.throws(()=>sql(`insert into project_budgets(project_id,monthly_sek,total_usd_committed_micros) values('${project()}',100,1)`))})
  await t.test('activation requires correct owner, pause and no native spend history',()=>{const p=project();sql(`insert into project_budgets(project_id,monthly_sek) values('${p}',1000)`);const call=`select budget_set_total_allowance('${p}','20000000-0000-4000-8000-000000000001',1000000,0,'${sha}')`;assert.throws(()=>asService(call.replace('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002')));sql(`update projects set execution_paused=false where id='${p}'`);assert.throws(()=>asService(call));sql(`update projects set execution_paused=true where id='${p}'`);reserve(p,1);assert.throws(()=>asService(call))})
 }finally{if(owned)docker(['rm','-f',name])}
})
