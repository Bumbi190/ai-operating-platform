import {readFileSync} from 'node:fs'
import {spawn,spawnSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
export async function initialSendingRaces({root,container,db,sql}){
 const args=['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db]
 const q=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb"
 const plain=v=>"'"+String(v).replaceAll("'","''")+"'"
 function call(s){const r=spawnSync('docker',args,{input:s,encoding:'utf8'});if(r.status)throw Error(r.stderr);return JSON.parse(r.stdout.trim())}
 const run=s=>new Promise((done,reject)=>{const c=spawn('docker',args);let out='',err='';c.stdout.on('data',x=>out+=x);c.stderr.on('data',x=>err+=x);c.on('error',reject);c.on('close',code=>done({code,out,err}));c.stdin.end(s)})
 const tests=readFileSync(root+'/apps/web/supabase/tests/sales_initial_sending.sql','utf8')
 sql(tests.slice(0,tests.indexOf('-- TESTS_BEGIN')).replaceAll('pg_temp.','public.initial_test_')+'commit;')
 const fixture=()=>call("select public.initial_test_initial_fixture('race-"+randomUUID()+"');")
 let f=fixture(),v=call('select public.initial_test_initial_request('+q(f)+');')
 const confirmations=await Promise.all(Array.from({length:8},()=>run('select sales_initial_send_confirm('+q(f.principal)+','+q({...v,idempotencyKey:randomUUID()})+');')))
 if(confirmations.some(x=>x.code!==0)||call('select to_jsonb(count(*)) from sales_initial_send_jobs where project_id='+plain(f.projectId)+'::uuid;')!==1)throw Error('INITIAL_DUPLICATE_CONFIRMATION_RACE:'+JSON.stringify(confirmations))
 let claim=call('select sales_initial_send_claim('+plain(f.token)+",'{}');")
 const permits=await Promise.all(Array.from({length:10},()=>run('select sales_initial_send_begin_dispatch('+plain(f.token)+','+q(claim.ref)+');')))
 if(permits.filter(x=>x.code===0).length!==1||permits.filter(x=>x.err.includes('FENCED')).length!==9)throw Error('INITIAL_DUPLICATE_DISPATCH_RACE:'+JSON.stringify(permits))
 console.log('PASS initial: eight confirmation keys one job; ten dispatch calls one permit')
 function session(name){
  const c=spawn('docker',['exec','-i','-e','PGAPPNAME='+name,...args.slice(2)]);let out='',err='';const waits=[]
  c.stdout.on('data',x=>{out+=x;for(const w of waits)if(out.includes(w.mark))w.done()});c.stderr.on('data',x=>err+=x)
  const end=new Promise((done,reject)=>{c.on('error',reject);c.on('close',code=>done({code,out,err}))})
  return {c,end,write:s=>c.stdin.write(s+'\n'),mark:mark=>Promise.race([new Promise(done=>out.includes(mark)?done():waits.push({mark,done})),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('INITIAL_RACE_BARRIER')),10000);t.unref()})])}
 }
 for(const kind of ['incoming','cancel']){
  f=fixture();v=call('select public.initial_test_initial_request('+q(f)+');');call('select sales_initial_send_confirm('+q(f.principal)+','+q(v)+');');claim=call('select sales_initial_send_claim('+plain(f.token)+",'{}');")
  const name='initial-race-'+randomUUID(),holder=session('holder-'+name),contender=session(name)
  const source=kind==='incoming'?'insert into sales_inbox_messages(project_id,mailbox_id,owner_id,header,text_state,text_selected) values('+plain(f.projectId)+'::uuid,'+plain(f.mailboxId)+'::uuid,'+plain(f.principal.userId)+"::uuid,"+q({from:f.draft.toEmail,messageId:'<race-incoming@example.se>'})+",'not_selected',false);":'select sales_initial_send_cancel('+q(f.principal)+','+q({projectId:f.projectId,sendJobId:claim.ref.sendJobId,expectedRevisionHash:f.revisionHash})+');'
  try{
   holder.write('begin;'+source+"select 'SOURCE_HELD';");await holder.mark('SOURCE_HELD')
   contender.write('select sales_initial_send_begin_dispatch('+plain(f.token)+','+q(claim.ref)+');')
   let blocked=false;const until=Date.now()+10000
   while(Date.now()<until){if(call('select to_jsonb(exists(select from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='+plain(name)+' and not l.granted));')){blocked=true;break}await new Promise(done=>setTimeout(done,25))}
   if(!blocked)throw Error('INITIAL_EXPECTED_LOCK_WAIT')
   holder.c.stdin.end('commit;\n');if((await holder.end).code)throw Error('INITIAL_SOURCE_FAILED')
   contender.c.stdin.end();const result=await contender.end;if(result.code===0||!/(SOURCE_CHANGED|FENCED|INITIAL_CONTACT_REVIEW_REQUIRED)/.test(result.err))throw Error('INITIAL_STALE_AUTHORITY:'+JSON.stringify(result))
   if(call('select to_jsonb(dispatch_before is not null) from sales_initial_send_jobs where id='+plain(claim.ref.sendJobId)+'::uuid;'))throw Error('INITIAL_DISPATCH_AFTER_SOURCE')
   console.log('PASS initial: '+kind+' committed before permit fences dispatch')
  }finally{holder.c.kill();contender.c.kill()}
 }
}
