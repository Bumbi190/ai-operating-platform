import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
export async function timingRaces({container,db,sql}){
 const q=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb"
 const call=s=>JSON.parse(sql(s).trim())
 function session(name){
  const child=spawn('docker',['exec','-i','-e','PGAPPNAME='+name,container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db]);let out='',err='';const waits=[]
  child.stdout.on('data',x=>{out+=x;for(const w of waits)if(out.includes(w.mark))w.done()});child.stderr.on('data',x=>err+=x)
  const end=new Promise((done,reject)=>{child.on('error',reject);child.on('close',code=>done({code,out,err}))})
  return {child,end,send:s=>child.stdin.write(s+'\n'),mark:mark=>Promise.race([new Promise(done=>out.includes(mark)?done():waits.push({mark,done})),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('TIMING_BARRIER_TIMEOUT')),10000);t.unref()})])}
 }
 async function blocked(name){
  const until=Date.now()+10000
  while(Date.now()<until){if(call("select to_jsonb(exists(select from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='"+name+"' and not l.granted));"))return;await new Promise(r=>setTimeout(r,25))}
  throw Error('TIMING_EXPECTED_LOCK_WAIT')
 }
 for(const stage of ['prepare','attempt','rules_attempt']){
  const f=call("select sales_regression_fixture('timing-race-"+randomUUID()+"');")
  sql("select sales_fixture_review_timing('"+f.projectId+"');")
  let ref
  if(stage!=='prepare'){call('select sales_prepare_job('+q(f.principal)+','+q(f.input)+');');ref=call("select sales_claim_job('"+f.token+"','{}');").ref}
  const old=call("select to_jsonb(request) from sales_contact_history_revisions where project_id='"+f.projectId+"' order by version desc limit 1;")
  const rule=call("select to_jsonb(request) from sales_contact_timing_rules where project_id='"+f.projectId+"' order by version desc limit 1;")
  const hid=call("select to_jsonb(id) from sales_contact_history_revisions where project_id='"+f.projectId+"' order by version desc limit 1;")
  const rid=call("select to_jsonb(id) from sales_contact_timing_rules where project_id='"+f.projectId+"' order by version desc limit 1;")
  const mutate=stage==='rules_attempt'?'select sales_timing_save_rules('+q(f.principal)+','+q({...rule,idempotencyKey:randomUUID(),expectedPreviousId:rid,minWaitSeconds:1209601})+');':'select sales_timing_save_history('+q(f.principal)+','+q({...old,idempotencyKey:randomUUID(),expectedPreviousId:hid,data:{...old.data,history:stage==='prepare'?'unknown':old.data.history}})+');'
  const action=stage==='prepare'?'select sales_prepare_job('+q(f.principal)+','+q(f.input)+');':"select sales_reserve_attempt('"+f.token+"',"+q({...ref,contactId:f.contactId,attemptId:randomUUID()})+');'
  const name='timing-wait-'+randomUUID(),holder=session('timing-holder-'+randomUUID()),waiter=session(name)
  try{
   holder.send("begin;"+mutate+"select 'HELD';");await holder.mark('HELD');waiter.send(action);await blocked(name)
   holder.child.stdin.end('commit;\n');const held=await holder.end;if(held.code!==0)throw Error(held.err)
   waiter.child.stdin.end();const result=await waiter.end
   if(result.code===0||!result.err.includes(stage==='prepare'?'CONTACT_TIMING_REVIEW_REQUIRED':'CONTACT_TIMING_CHANGED'))throw Error('TIMING_STALE_PERMIT:'+JSON.stringify(result))
   if(call("select to_jsonb(count(*)) from sales_model_attempts where project_id='"+f.projectId+"';")!==0)throw Error('TIMING_PAID_ATTEMPT')
  }finally{holder.child.kill();waiter.child.kill()}
 }
 // Concurrent CAS uses two real transactions, with one winner.
 const f=call("select sales_regression_fixture('timing-cas-"+randomUUID()+"');")
 sql("select sales_fixture_review_timing('"+f.projectId+"');")
 const old=call("select request||jsonb_build_object('expectedPreviousId',id) from sales_contact_history_revisions where project_id='"+f.projectId+"';")
 const sessions=[session('timing-cas-a-'+randomUUID()),session('timing-cas-b-'+randomUUID())]
 for(const s of sessions)s.child.stdin.end('select sales_timing_save_history('+q(f.principal)+','+q({...old,idempotencyKey:randomUUID()})+');\n')
 const results=await Promise.all(sessions.map(s=>s.end))
 if(results.filter(x=>x.code===0).length!==1||results.filter(x=>x.err.includes('REVISION_CONFLICT')).length!==1)throw Error('TIMING_CAS_ONE_WINNER')
 console.log('PASS: timing history/prepare, history/attempt, rules/attempt lock races and concurrent CAS; no stale permits')
 // A held context read creates a deterministic concurrent rule commit midway through one report.
 const rf=call("select sales_regression_fixture('timing-read-"+randomUUID()+"');")
 sql("insert into sales_contacts select gen_random_uuid(),project_id,version,data||jsonb_build_object('id',gen_random_uuid(),'branchName','Syd'),now() from sales_contacts where id='"+rf.contactId+"';select sales_fixture_review_timing('"+rf.projectId+"');")
 const original=call("select to_jsonb(pg_get_functiondef('public.sales_timing_context(uuid,text)'::regprocedure));")
 sql(original.replace('public.sales_timing_context(', 'public.sales_fixture_original_context('))
 const oldRule=call("select request||jsonb_build_object('expectedPreviousId',id) from sales_contact_timing_rules where project_id='"+rf.projectId+"';")
 const oldRuleId=oldRule.expectedPreviousId,gate=1995019010
 sql("create or replace function public.sales_timing_context(pid uuid,address text) returns jsonb language plpgsql stable security invoker set search_path='' as $$begin if pid='"+rf.projectId+"'::uuid then perform pg_advisory_xact_lock("+gate+");end if;return public.sales_fixture_original_context(pid,address);end$$;")
 const name='timing-read-'+randomUUID(),holder=session('timing-read-holder-'+randomUUID()),reader=session(name)
 try{
  holder.send("begin;select pg_advisory_xact_lock("+gate+");select 'READ_HELD';");await holder.mark('READ_HELD')
  reader.send('select sales_timing_read('+q(rf.principal)+','+q({projectId:rf.projectId})+');');await blocked(name)
  call('select sales_timing_save_rules('+q(rf.principal)+','+q({...oldRule,idempotencyKey:randomUUID(),minWaitSeconds:1209601})+');')
  holder.child.stdin.end('commit;\n');if((await holder.end).code!==0)throw Error('TIMING_READ_HOLDER_FAILED')
  reader.child.stdin.end();const result=await reader.end;if(result.code!==0)throw Error(result.err)
  const report=JSON.parse(result.out)
  if(report.rules.id!==oldRuleId||report.contacts.some(c=>c.ruleRevisionId!==oldRuleId)||new Set(report.contacts.map(c=>c.historyRevisionId)).size!==1)throw Error('TIMING_MIXED_REPORT_SNAPSHOT')
 }finally{holder.child.kill();reader.child.kill();sql(original);sql("drop function public.sales_fixture_original_context(uuid,text);")}
 console.log('PASS: concurrent rule commit cannot mix rule/history versions within one timing report')

}
