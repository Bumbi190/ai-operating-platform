import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
export async function replyReviewRaces({container,db,run,principal,input,claimed}){
 const q=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb",plain=v=>"'"+String(v).replaceAll("'","''")+"'"
 const call=async s=>{const r=await run(s);if(r.code!==0)throw Error(r.err);return JSON.parse(r.out)}
 const aid=(await call(`select to_jsonb(id) from sales_reply_attempts where job_id=${plain(claimed.ref.jobId)}::uuid limit 1;`))
 await call(`select sales_reply_complete(repeat('8',64),${q({...claimed.ref,attemptId:aid,draft:{subject:'Questions only',body:'Synthetic unanswered price question.',evidenceIds:[input.messageId],questions:['Confirm price.']}})});`)
 let workspace=await call(`select sales_reply_read_drafts(${q(principal)},${q({projectId:input.projectId})});`)
 let draft=workspace.drafts.find(d=>d.jobId===claimed.ref.jobId)
 const edit=(d,body)=>`select sales_reply_edit_draft(${q(principal)},${q({projectId:input.projectId,revisionId:d.id,expectedHash:d.sha256,subject:'Edited synthetic reply',body,questions:[]})});`
 const cancel=`select sales_reply_cancel_job(${q(principal)},${q({projectId:input.projectId,jobId:claimed.ref.jobId})});`
 function session(name){
  const child=spawn('docker',['exec','-i','-e','PGAPPNAME='+name,container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db]);let out='',err='';const waiting=[]
  child.stdout.on('data',v=>{out+=v;for(const w of waiting)if(out.includes(w.mark))w.done()});child.stderr.on('data',v=>err+=v)
  const end=new Promise((done,reject)=>{child.on('error',reject);child.on('close',code=>done({code,out,err}))})
  return {child,end,peek:()=>({out,err}),send:s=>child.stdin.write(s+'\n'),mark:mark=>Promise.race([new Promise(done=>{if(out.includes(mark))done();else waiting.push({mark,done})}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('BARRIER_TIMEOUT:'+name)),10000);t.unref()})])}
 }
 async function blocked(name){
  const until=Date.now()+10000
  while(Date.now()<until){const v=await call(`select to_jsonb(exists(select from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name=${plain(name)} and not l.granted));`);if(v)return;await new Promise(done=>setTimeout(done,25))}
  throw Error('EXPECTED_LOCK_WAIT:'+name)
 }
 // Cancel wins first. A questions-only revision has no run lock to serialize this.
 const editName='reply-edit-'+randomUUID();let holder=session('reply-cancel-holder-'+randomUUID()),editor=session(editName)
 try{
  holder.send('begin;'+cancel+"select 'CANCEL_HELD';");await holder.mark('CANCEL_HELD')
  editor.send(edit(draft,'Must not resurrect cancelled work.'));await blocked(editName).catch(e=>{throw Error(String(e)+JSON.stringify(editor.peek()))})
  holder.child.stdin.end('commit;\n');if((await holder.end).code!==0)throw Error('CANCEL_HOLDER_FAILED')
  editor.child.stdin.end();const r=await editor.end
  const state=await call(`select jsonb_build_object('status',status,'revisions',(select count(*) from sales_reply_draft_revisions where job_id=j.id)) from sales_reply_jobs j where id=${plain(claimed.ref.jobId)}::uuid;`)
  if(r.code===0||!r.err.includes('FENCED')||state.status!=='cancelled'||state.revisions!==1)throw Error('CANCEL_FIRST_EDIT_RESURRECTED:'+JSON.stringify({r,state}))
 }finally{holder.child.kill();editor.child.kill()}
 console.log('PASS: cancel-first questions-only edit waits, rereads cancelled state and refuses resurrection')
 // A second independent request permits the reverse order without mutating a cancelled job.
 const mid=randomUUID();await call(`insert into sales_inbox_messages(id,project_id,mailbox_id,owner_id,header,header_sha256,content_sha256,body_text,text_state,text_selected,contact_id,contact_version,internal_date) select ${plain(mid)}::uuid,project_id,mailbox_id,owner_id,header,header_sha256,repeat('c',64),body_text||' Second.',text_state,text_selected,contact_id,contact_version,internal_date from sales_inbox_messages where id=${plain(input.messageId)}::uuid returning to_jsonb(id);`)
 await call(`insert into sales_inbox_occurrences select project_id,mailbox_id,folder,uid_validity,2,${plain(mid)}::uuid,false from sales_inbox_occurrences where message_id=${plain(input.messageId)}::uuid returning to_jsonb(uid);`)
 const secondInput={...input,messageId:mid,idempotencyKey:randomUUID()},job=await call(`select sales_reply_prepare(${q(principal)},${q(secondInput)});`),c=await call("select sales_reply_claim(repeat('8',64),'{}');"),a=await call(`select sales_reply_reserve_attempt(repeat('8',64),${q({...c.ref,attemptId:randomUUID()})});`)
 await call(`select sales_reply_complete(repeat('8',64),${q({...c.ref,attemptId:a.attemptId,draft:{subject:'Questions only second',body:'Synthetic second answer.',evidenceIds:[mid],questions:['Confirm second price.']}})});`)
 workspace=await call(`select sales_reply_read_drafts(${q(principal)},${q({projectId:input.projectId})});`);draft=workspace.drafts.find(d=>d.jobId===job.id)
 const cancelSecond=`select sales_reply_cancel_job(${q(principal)},${q({projectId:input.projectId,jobId:job.id})});`,cancelName='reply-cancel-'+randomUUID();holder=session('reply-edit-holder-'+randomUUID());const canceller=session(cancelName)
 try{
  holder.send('begin;'+edit(draft,'Accepted new revision before cancellation.')+"select 'EDIT_HELD';");await holder.mark('EDIT_HELD')
  canceller.send(cancelSecond);await blocked(cancelName).catch(e=>{throw Error(String(e)+JSON.stringify(canceller.peek()))});holder.child.stdin.end('commit;\n');if((await holder.end).code!==0)throw Error('EDIT_HOLDER_FAILED')
  canceller.child.stdin.end();const r=await canceller.end
  if(r.code===0||!r.err.includes('FENCED'))throw Error('STALE_CANCEL_DID_NOT_REQUIRE_REFRESH:'+JSON.stringify(r))
  await call(cancelSecond)
  const statuses=await call(`select jsonb_build_object('job',j.status,'approval',a.status,'run',r.status) from sales_reply_jobs j join sales_reply_draft_revisions d on d.job_id=j.id and d.is_current join approvals a on a.id=d.approval_id join runs r on r.id=d.run_id where j.id=${plain(job.id)}::uuid;`)
  if(statuses.job!=='cancelled'||statuses.approval!=='returned'||statuses.run!=='cancelled')throw Error('LATEST_APPROVAL_LEFT_PENDING:'+JSON.stringify(statuses))
 }finally{holder.child.kill();canceller.child.kill()}
 console.log('PASS: edit-first cancellation requires current-revision refresh, then cancels the actual latest approval/run')
}
