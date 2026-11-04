import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
export async function sendSourceRaces({container,db,sql,run}){
 const q=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb",plain=v=>"'"+String(v).replaceAll("'","''")+"'"
 const call=async s=>{const r=await run(s);if(r.code!==0)throw Error(r.err);return JSON.parse(r.out)}
 const fixture=await call("select data from send_race_fixture;"),pid=fixture.ref.projectId,mid=JSON.parse(fixture.snapshot.sealedJson).sourceMessageId
 const principal={userId:'d63a09fb-448e-41b8-9fb2-9a608f5f1800',allowedProjectIds:[pid]}
 sql(`create function public.send_test_new_claim() returns jsonb language plpgsql as $$ declare p jsonb:=${q(principal)};d sales_reply_draft_revisions;r jsonb;j jsonb;begin
 select x.* into d from sales_reply_draft_revisions x join sales_reply_jobs y on y.id=x.job_id where y.message_id=${plain(mid)}::uuid and x.is_current;
 r:=sales_reply_edit_draft(p,jsonb_build_object('projectId',${plain(pid)},'revisionId',d.id,'expectedHash',d.sha256,'subject','Race '||gen_random_uuid(),'body','Synthetic race reply.','questions','[]'::jsonb));
 perform sales_reply_review_draft(p,jsonb_build_object('projectId',${plain(pid)},'revisionId',r->>'id','expectedHash',r->>'sha256','decision','approved'));
 j:=sales_send_confirm(p,jsonb_build_object('projectId',${plain(pid)},'revisionId',r->>'id','expectedRevisionHash',r->>'sha256','expectedMailboxGeneration',6,'idempotencyKey',gen_random_uuid()));
 return sales_send_claim(repeat('d7',32),'{}');end $$;`)
 function session(name){
  const child=spawn('docker',['exec','-i','-e','PGAPPNAME='+name,container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db]);let out='',err='';const waiting=[]
  child.stdout.on('data',v=>{out+=v;for(const w of waiting)if(out.includes(w.mark))w.done()});child.stderr.on('data',v=>err+=v)
  const end=new Promise((done,reject)=>{child.on('error',reject);child.on('close',code=>done({code,out,err}))})
  return {child,end,send:s=>child.stdin.write(s+'\n'),mark:mark=>Promise.race([new Promise(done=>{if(out.includes(mark))done();else waiting.push({mark,done})}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('SEND_BARRIER_TIMEOUT:'+name)),10000);t.unref()})])}
 }
 async function blocked(name){
  const until=Date.now()+10000
  while(Date.now()<until){if(await call("select to_jsonb(exists(select from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name="+plain(name)+" and not l.granted));"))return;await new Promise(done=>setTimeout(done,25))}
  throw Error('SEND_EXPECTED_LOCK_WAIT:'+name)
 }
 for(const kind of ['newMail','newSuppression','cancel','edit']){
  const claim=await call('select send_test_new_claim();'),ref=claim.ref,name='send-race-'+randomUUID(),holder=session('send-holder-'+randomUUID()),contender=session(name)
  const extraId=randomUUID(),sender=JSON.parse(claim.snapshot.sealedJson).toEmail
  let statement
  if(kind==='newMail')statement="insert into sales_inbox_messages(id,project_id,mailbox_id,owner_id,header,text_state,text_selected) select "+plain(extraId)+"::uuid,project_id,mailbox_id,owner_id,header,'not_selected',false from sales_inbox_messages where id="+plain(mid)+"::uuid;"
  if(kind==='newSuppression')statement="insert into sales_contacts(id,project_id,version,data) values("+plain(extraId)+"::uuid,"+plain(pid)+"::uuid,1,"+q({id:extraId,projectId:pid,version:1,companyName:'Synthetic suppressed sender',branchName:'',email:sender,websiteUrl:null,history:'unknown',historySource:'Synthetic suppression inserted before the dispatch permit.',offerKind:'general_service',pilotMonths:null,confirmed:true,suppressed:true,excluded:false})+");"
  if(kind==='cancel')statement="select sales_send_cancel("+q(principal)+","+q({projectId:pid,sendJobId:ref.sendJobId,expectedRevisionHash:JSON.parse(claim.snapshot.sealedJson).revisionHash})+");"
  if(kind==='edit')statement="select sales_reply_edit_draft("+q(principal)+","+q({projectId:pid,revisionId:JSON.parse(claim.snapshot.sealedJson).revisionId,expectedHash:JSON.parse(claim.snapshot.sealedJson).revisionHash,subject:'New unsent revision',body:'Synthetic newer text.',questions:[]})+");"
  try{
   holder.send('begin;'+statement+"select 'SOURCE_HELD';");await holder.mark('SOURCE_HELD')
   contender.send("select sales_send_begin_dispatch(repeat('d7',32),"+q(ref)+");");await blocked(name)
   holder.child.stdin.end('commit;\n');if((await holder.end).code!==0)throw Error('SEND_SOURCE_HOLDER_FAILED')
   contender.child.stdin.end();const r=await contender.end
   if(r.code===0||!/(SOURCE_CHANGED|TEXT_APPROVAL_REQUIRED|FENCED)/.test(r.err))throw Error('SEND_STALE_AUTHORITY_RACE:'+kind+JSON.stringify(r))
   const job=await call("select to_jsonb(status) from sales_send_jobs where id="+plain(ref.sendJobId)+"::uuid;")
   if(job==='dispatching'||job==='smtp_accepted')throw Error('SEND_STALE_DISPATCHED:'+kind)
   if(kind==='newMail')sql("update sales_inbox_messages set created_at=clock_timestamp()-interval '1 day' where id="+plain(extraId)+"::uuid;")
   if(kind==='newSuppression')sql("delete from sales_contacts where id="+plain(extraId)+"::uuid;")
   console.log('PASS: '+kind+' committed before permit refuses stale sending authority')
  }finally{holder.child.kill();contender.child.kill()}
 }
}
