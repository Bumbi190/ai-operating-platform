import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'

/** Called only by test-sales-db.mjs after its local Docker ownership checks. */
export async function discoveryRaces({container,db,sql}){
 const owned=['omnira-sales-pilot-20261017','omnira-sales-reply-20261018','omnira-sales-sending-20261018']
 if(!owned.includes(container)||!/^sales_\d+$/.test(db))throw Error('DISCOVERY_UNOWNED_FIXTURE_REFUSED')
 const literal=v=>"'"+String(v).replaceAll("'","''")+"'"
 const q=v=>literal(JSON.stringify(v))+'::jsonb'
 const call=statement=>JSON.parse(sql(statement).trim())
 function session(name){
  const child=spawn('docker',['exec','-i','-e','PGAPPNAME='+name,container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db])
  let out='',err='',closed=false;const waits=new Set()
  child.stdout.on('data',value=>{
   out+=value
   for(const wait of waits)if(out.includes(wait.mark)){clearTimeout(wait.timer);waits.delete(wait);wait.done()}
  })
  child.stderr.on('data',value=>err+=value)
  const end=new Promise((done,reject)=>{
   child.on('error',reject)
   child.on('close',code=>{closed=true;for(const wait of waits){clearTimeout(wait.timer);wait.reject(Error('DISCOVERY_BARRIER_CLOSED:'+err))}waits.clear();done({code,out,err})})
  })
  return {child,end,send:statement=>child.stdin.write(statement+'\n'),mark:mark=>new Promise((done,reject)=>{
   if(out.includes(mark)){done();return}
   if(closed){reject(Error('DISCOVERY_BARRIER_CLOSED:'+err));return}
   const wait={mark,done,reject,timer:setTimeout(()=>{waits.delete(wait);reject(Error('DISCOVERY_BARRIER_TIMEOUT'))},10000)}
   wait.timer.unref();waits.add(wait)
  })}
 }
 async function blocked(names){
  const until=Date.now()+10000
  while(Date.now()<until){
   const count=call('select to_jsonb(count(distinct a.application_name)) from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name in('+names.map(literal).join(',')+") and l.locktype='advisory' and not l.granted;")
   if(count===names.length)return
   await new Promise(done=>setTimeout(done,25))
  }
  throw Error('DISCOVERY_EXPECTED_CONCURRENT_LOCK_WAIT')
 }
 function fixture(label){
  sql("update public.sales_discovery_batches b set created_at=clock_timestamp()-interval '2 days',completed_at=case when b.completed_at is null then null else clock_timestamp()-interval '2 days' end from public.projects p where b.project_id=p.id and p.slug like 'fixture-discovery-%' and p.owner_id='20000000-0000-4000-8000-000000000001';")
  const f=call('select sales_regression_fixture('+literal('discovery-race-'+label+'-'+randomUUID())+');')
  const query={city:'stockholm',category:'car_dealer',radiusKm:5,limit:20}
  const b=call('select sales_discovery_begin('+q(f.principal)+','+q({projectId:f.projectId,idempotencyKey:randomUUID(),query})+');')
  const candidates=[1,2].map(index=>({sourceId:'node/'+(9999999999900+index),sourceUrl:'https://www.openstreetmap.org/node/'+(9999999999900+index),name:'Synthetic discovery race '+index+' '+f.projectId,websiteUrl:'https://discovery-race-'+index+'.example.com/',email:'public@discovery-race-'+index+'.example.com',exclusions:[]}))
  call('select sales_discovery_finish('+q(f.principal)+','+q({projectId:f.projectId,batchId:b.batchId,retrievedAt:new Date().toISOString(),candidates})+');')
  const report=call('select sales_discovery_read('+q(f.principal)+','+q({projectId:f.projectId,batchId:b.batchId})+');')
  if(report.candidates.length!==2||report.candidates.some(c=>c.status!=='needs_review'))throw Error('DISCOVERY_RACE_SETUP_FAILED')
  return {...f,candidates:report.candidates}
 }
 function promotion(f,index){
  const c=f.candidates[index]
  return {projectId:f.projectId,candidateId:c.id,expectedVersion:1,companyName:c.name,branchName:'',email:'verified@concurrent-discovery.example.com',websiteUrl:c.websiteUrl,reviewNote:'Synthetic independently reviewed business and recipient',businessConfirmed:true,emailConfirmed:true,offerKind:'general_service',pilotMonths:null,baselineReasons:[]}
 }
 function stop(s){s.child.stdin.destroy();s.child.kill()}
 for(const sameCandidate of [false,true]){
  const f=fixture(sameCandidate?'same-candidate':'same-mailbox'),inputs=[promotion(f,0),promotion(f,sameCandidate?0:1)]
  const names=['discovery-a-'+randomUUID(),'discovery-b-'+randomUUID()],holder=session('discovery-holder-'+randomUUID()),waiters=names.map(session)
  try{
   holder.send("set role service_role;begin;select pg_advisory_xact_lock(hashtextextended("+literal(f.projectId+':sales-contact-eligibility')+",0));select 'DISCOVERY_HELD';")
   await holder.mark('DISCOVERY_HELD')
   for(let i=0;i<waiters.length;i++)waiters[i].send('set role service_role;select sales_discovery_promote('+q(f.principal)+','+q(inputs[i])+');')
   // Prove both independent PostgreSQL sessions are waiting on the shared lock.
   await blocked(names)
   holder.child.stdin.end('commit;\n');const held=await holder.end;if(held.code!==0)throw Error(held.err)
   for(const waiter of waiters)waiter.child.stdin.end()
   const completed=await Promise.all(waiters.map(waiter=>waiter.end))
   if(completed.some(result=>result.code!==0))throw Error('DISCOVERY_RACE_SQL_FAILED:'+JSON.stringify(completed))
   const results=completed.map(result=>JSON.parse(result.out.trim()))
   if(sameCandidate){
    if(results.some(result=>result.state!=='promoted')||new Set(results.map(result=>result.contactId)).size!==1)throw Error('DISCOVERY_CONCURRENT_REPLAY_DUPLICATED')
   }else if(results.filter(result=>result.state==='promoted').length!==1||results.filter(result=>result.state==='blocked').length!==1)throw Error('DISCOVERY_CONCURRENT_MAILBOX_DUPLICATED')
   const count=call('select to_jsonb(count(*)) from sales_contacts where project_id='+literal(f.projectId)+" and data->>'email'='verified@concurrent-discovery.example.com';")
   if(count!==1)throw Error('DISCOVERY_CONCURRENT_CONTACT_COUNT')
   const contact=call('select data from sales_contacts where project_id='+literal(f.projectId)+" and data->>'email'='verified@concurrent-discovery.example.com';")
   if(contact.history!=='unknown'||contact.pilotMonths!==null||contact.offerKind!=='general_service')throw Error('DISCOVERY_CONCURRENT_HISTORY_INVENTED')
   const timing=call('select sales_timing_evaluate('+literal(f.projectId)+'::uuid,'+literal(contact.id)+'::uuid,clock_timestamp());')
   if(timing.initialPreparationAllowed!==false)throw Error('DISCOVERY_CONCURRENT_PREPARATION_ALLOWED')
  }finally{stop(holder);for(const waiter of waiters)stop(waiter)}
 }
 // A suppression created while holding the same lock must be seen after commit.
 const f=fixture('suppression'),input=promotion(f,0),name='discovery-suppression-wait-'+randomUUID(),holder=session('discovery-suppression-holder-'+randomUUID()),waiter=session(name)
 try{
  const contact={projectId:f.projectId,id:randomUUID(),companyName:'Synthetic newly suppressed contact',branchName:'',email:input.email,websiteUrl:null,history:'unknown',historySource:'Synthetic suppression before promotion commit',offerKind:'general_service',pilotMonths:null,confirmed:true,excluded:false,suppressed:true,expectedVersion:0}
  holder.send('set role service_role;begin;select sales_save_contact('+q(f.principal)+','+q(contact)+");select 'DISCOVERY_SUPPRESSION_HELD';")
  await holder.mark('DISCOVERY_SUPPRESSION_HELD')
  waiter.send('set role service_role;select sales_discovery_promote('+q(f.principal)+','+q(input)+');')
  await blocked([name]);holder.child.stdin.end('commit;\n');if((await holder.end).code!==0)throw Error('DISCOVERY_SUPPRESSION_HOLDER_FAILED')
  waiter.child.stdin.end();const completed=await waiter.end;if(completed.code!==0)throw Error(completed.err)
  const result=JSON.parse(completed.out.trim())
  if(result.state!=='blocked'||!result.reasons.includes('suppressed'))throw Error('DISCOVERY_STALE_SUPPRESSION_PERMIT')
  if(call('select to_jsonb(count(*)) from sales_contacts where project_id='+literal(f.projectId)+" and data->>'email'='verified@concurrent-discovery.example.com';")!==1)throw Error('DISCOVERY_SUPPRESSED_DUPLICATE_CREATED')
  if(call('select to_jsonb(count(*)) from sales_jobs where project_id='+literal(f.projectId)+';')!==0)throw Error('DISCOVERY_RACE_QUEUED_WORK')
 }finally{stop(holder);stop(waiter)}
 const cf=fixture('candidate-suppression'),negative=cf.candidates[0],edited={...promotion(cf,1),companyName:negative.name,email:negative.email,websiteUrl:negative.websiteUrl}
 const cname='discovery-candidate-wait-'+randomUUID(),cholder=session('discovery-candidate-holder-'+randomUUID()),cwaiter=session(cname)
 try{
  const review={projectId:cf.projectId,candidateId:negative.id,expectedVersion:1,decision:'suppressed',note:'Synthetic persistent candidate suppression'}
  cholder.send('set role service_role;begin;select sales_discovery_review('+q(cf.principal)+','+q(review)+");select 'DISCOVERY_CANDIDATE_HELD';")
  await cholder.mark('DISCOVERY_CANDIDATE_HELD')
  cwaiter.send('set role service_role;select sales_discovery_promote('+q(cf.principal)+','+q(edited)+');')
  await blocked([cname]);cholder.child.stdin.end('commit;\n');if((await cholder.end).code!==0)throw Error('DISCOVERY_CANDIDATE_HOLDER_FAILED')
  cwaiter.child.stdin.end();const completed=await cwaiter.end;if(completed.code!==0)throw Error(completed.err)
  const result=JSON.parse(completed.out.trim())
  if(result.state!=='blocked'||!result.reasons.includes('suppressed')||!result.reasons.includes('duplicate_candidate'))throw Error('DISCOVERY_STALE_CANDIDATE_SUPPRESSION_PERMIT')
  if(call('select to_jsonb(count(*)) from sales_contacts where project_id='+literal(cf.projectId)+' and data->>\'email\'='+literal(negative.email)+';')!==0)throw Error('DISCOVERY_CANDIDATE_SUPPRESSION_BYPASSED')
 }finally{stop(cholder);stop(cwaiter)}
 // Different projects share one provider admission gate; both really wait on it.
 sql("update public.sales_discovery_batches b set created_at=clock_timestamp()-interval '2 days',completed_at=case when b.completed_at is null then null else clock_timestamp()-interval '2 days' end from public.projects p where b.project_id=p.id and p.slug like 'fixture-discovery-%' and p.owner_id='20000000-0000-4000-8000-000000000001';")
 const af=[0,1].map(i=>call('select sales_regression_fixture('+literal('discovery-admission-'+i+'-'+randomUUID())+');'))
 const anames=['discovery-admit-a-'+randomUUID(),'discovery-admit-b-'+randomUUID()],aholder=session('discovery-admit-holder-'+randomUUID()),awaiters=anames.map(session)
 try{
  aholder.send("set role service_role;begin;select pg_advisory_xact_lock(hashtextextended('sales-discovery-overpass-admission',0));select 'DISCOVERY_ADMISSION_HELD';")
  await aholder.mark('DISCOVERY_ADMISSION_HELD')
  for(let i=0;i<awaiters.length;i++)awaiters[i].send('set role service_role;select sales_discovery_begin('+q(af[i].principal)+','+q({projectId:af[i].projectId,idempotencyKey:randomUUID(),query:{city:'stockholm',category:'car_dealer',radiusKm:5,limit:20}})+');')
  await blocked(anames);aholder.child.stdin.end('commit;\n');if((await aholder.end).code!==0)throw Error('DISCOVERY_ADMISSION_HOLDER_FAILED')
  for(const waiter of awaiters)waiter.child.stdin.end()
  const results=await Promise.all(awaiters.map(waiter=>waiter.end))
  if(results.some(result=>result.code!==0))throw Error('DISCOVERY_ADMISSION_SQL_FAILED:'+JSON.stringify(results))
  const decisions=results.map(result=>JSON.parse(result.out.trim()))
  if(decisions.filter(result=>result.fetchRequired===true).length!==1||decisions.filter(result=>result.rateLimited===true).length!==1)throw Error('DISCOVERY_PARALLEL_PROJECT_ADMISSION')
  if(call('select to_jsonb(count(*)) from sales_discovery_batches where project_id in('+af.map(f=>literal(f.projectId)).join(',')+');')!==1)throw Error('DISCOVERY_ADMISSION_DUPLICATE_BATCH')
 }finally{stop(aholder);for(const waiter of awaiters)stop(waiter)}
 console.log('PASS: two concurrently waiting projects produce one global approved-source admission and one rate refusal')
 console.log('PASS: discovery concurrent mailbox dedup, identical promotion replay, CRM and candidate suppression/commit barriers; history remains unknown and draft preparation blocked')
}
