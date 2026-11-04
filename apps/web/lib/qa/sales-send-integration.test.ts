import {describe,it,expect} from 'vitest'
import {spawnSync,spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {randomUUID,createHash,randomBytes} from 'node:crypto'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {tmpdir} from 'node:os'
import {createSendWorkerApi} from '@/lib/sales/sending/worker-api'
import {handleSalesTool} from '@/lib/sales/atlas-tools'
const database=process.env.SALES_FIXTURE_DATABASE??'',suite=/^sales_[0-9]+$/.test(database)?describe:describe.skip
suite('send real SQL / Next / fresh Python',()=>{it('binds exact SMTP payload and recovers crashes or uncertainty without another DATA',async()=>{
 const container=process.env.SALES_FIXTURE_CONTAINER??''
 if(container!=='omnira-sales-sending-20261018')throw Error('UNOWNED_FIXTURE_CONTAINER')
 const sql=(s:string)=>{const r=spawnSync('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d',database],{input:s,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim()}
 const quote=(v:unknown)=>"'"+String(v).replaceAll("'","''")+"'"
 const db={rpc:async(name:string,args:Record<string,unknown>)=>{if(!/^sales_[a-z_]+$/.test(name))throw Error('RPC_REFUSED');try{return {data:JSON.parse(sql('set role service_role;select to_jsonb('+name+'('+Object.entries(args).map(([k,v])=>k+'=>'+quote(typeof v==='string'?v:JSON.stringify(v))+(typeof v==='string'?'::text':'::jsonb')).join(',')+'));')),error:null}}catch(e){return {data:null,error:{code:String(e).match(/ERROR:\s+([A-Z0-9]{5})/)?.[1]??'XX000'}}}}} as never
 const projectId='8f673c09-1c8f-4d78-876e-4c14bf1c89b3',userId='d63a09fb-448e-41b8-9fb2-9a608f5f1800',mailboxId='80000000-0000-4000-8000-000000000191',workerId='60000000-0000-4000-8000-000000000191'
 const principal={userId,allowedProjectIds:[projectId]},senderEmail='info@handlarborsen.se',recipient='andrehultgren190@gmail.com'
 const worker=createSendWorkerApi({db:()=>db,enabled:()=>true})
 for(const mode of ['accepted','lost250','lostHttpReceipt','crashAfterLocalReceipt','rotateAccepted','crashBeforePermit','crashAfterData','pause','revoke','rotate','suppression','newMail','mailbox']){
  const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex'),messageId=randomUUID(),stateDirectory=mkdtempSync(join(tmpdir(),'omnira-send-fixture-'))
  let activeToken=token
  sql("update projects set execution_paused=false where id='"+projectId+"';update sales_worker_registrations set token_hash='"+hash+"',revoked_at=null,desired_state='running' where id='"+workerId+"';update sales_mailbox_connections set generation=6 where id='"+mailboxId+"';update sales_send_policies set enabled=true,version=1,expires_at=clock_timestamp()+interval '1 hour' where project_id='"+projectId+"';update sales_contacts set data=jsonb_set(data,'{suppressed}','false') where project_id='"+projectId+"';")
  sql("insert into sales_inbox_messages(id,project_id,mailbox_id,owner_id,header,header_sha256,content_sha256,body_text,text_state,text_selected,internal_date) values('"+messageId+"','"+projectId+"','"+mailboxId+"','"+userId+"',"+quote(JSON.stringify({from:recipient,to:senderEmail,subject:'Syntetiskt källmejl',messageId:'<synthetic-send-source@example.se>',inReplyTo:null,references:[]}))+",repeat('a',64),encode(extensions.digest('"+messageId+"','sha256'),'hex'),'Syntetisk inkommande fråga','complete',true,now());insert into sales_inbox_occurrences values('"+projectId+"','"+mailboxId+"','INBOX',10,coalesce((select max(uid)+1 from sales_inbox_occurrences where mailbox_id='"+mailboxId+"'),1),'"+messageId+"',false);")
  const rpc=async(name:string,input:unknown)=>{const r:any=await (db as any).rpc(name,{p_principal:principal,p_input:input});if(r.error)throw Error(JSON.stringify(r.error));return r.data}
  const request={projectId,conversationId:'50000000-0000-4000-8000-000000000191',messageId,messageVersion:1,replyMode:'general',idempotencyKey:randomUUID()}
  await rpc('sales_reply_prepare',request)
  const claimed=JSON.parse(sql("select sales_reply_claim('"+hash+"','{}');")),attemptId=randomUUID()
  sql("select sales_reply_reserve_attempt('"+hash+"',"+quote(JSON.stringify({...claimed.ref,attemptId}))+");select sales_reply_complete('"+hash+"',"+quote(JSON.stringify({...claimed.ref,attemptId,draft:{subject:'Syntetiskt sändprov',body:'Syntetiskt svar.\n\nAndre',questions:[],evidenceIds:[messageId]}}))+");")
  const revision=JSON.parse(sql("select jsonb_build_object('id',id,'sha256',sha256) from sales_reply_draft_revisions where job_id='"+claimed.ref.jobId+"' and is_current;"))
  await rpc('sales_reply_review_draft',{projectId,revisionId:revision.id,expectedHash:revision.sha256,decision:'approved'})
  const input={projectId,revisionId:revision.id,expectedRevisionHash:revision.sha256,expectedMailboxGeneration:6,idempotencyKey:randomUUID()}
  const send=await rpc('sales_send_confirm',input)
  expect((await rpc('sales_send_confirm',{...input,idempotencyKey:randomUUID()})).id).toBe(send.id)
  async function cycle(recovery=false){
   const child=spawn(process.platform==='win32'?'C:\\Python312\\python.exe':'python3',['-u','-m','workers.sales.tests.send_cross_fixture'],{cwd:resolve(process.cwd(),'../..'),stdio:['pipe','pipe','pipe']})
   let result:any,fail:unknown,stderr='',chain=Promise.resolve()
   child.stderr.on('data',x=>stderr+=x)
   createInterface({input:child.stdout}).on('line',line=>{chain=chain.then(async()=>{
    const v=JSON.parse(line)
    if(v.event){expect(v.event).toBe('complete');result=v;return}
    if(v.control){
     if(mode==='pause')sql("update projects set execution_paused=true where id='"+projectId+"';")
     if(mode==='revoke')sql("update sales_worker_registrations set revoked_at=now() where id='"+workerId+"';")
     if(mode==='rotateAccepted'){activeToken=randomBytes(32).toString('base64url');const nextHash=createHash('sha256').update(activeToken).digest('hex');sql("update sales_worker_registrations set token_hash='"+nextHash+"',host_generation=host_generation+1 where id='"+workerId+"';")}
     if(mode==='rotate')sql("update sales_worker_registrations set token_hash=repeat('ef',32),host_generation=host_generation+1 where id='"+workerId+"';")
     if(mode==='suppression')sql("update sales_contacts set data=jsonb_set(data,'{suppressed}','true') where project_id='"+projectId+"';")
     if(mode==='newMail')sql("insert into sales_inbox_messages(project_id,mailbox_id,owner_id,header,text_state,text_selected) select project_id,mailbox_id,owner_id,header,'not_selected',false from sales_inbox_messages where id='"+messageId+"';")
     if(mode==='mailbox')sql("update sales_mailbox_connections set generation=7 where id='"+mailboxId+"';")
     child.stdin.write('{}\n');return
    }
    const response=await worker(new Request('https://fixture.invalid/api/sales/sending/worker',{method:'POST',headers:{authorization:'Bearer '+v.token},body:JSON.stringify(v.body)}))
    const answer=await response.json();child.stdin.write(JSON.stringify(response.ok?answer:{error:answer.code})+'\n')
   }).catch(e=>{fail=e;child.kill()})})
   child.stdin.write(JSON.stringify({token:recovery?activeToken:token,stateDirectory,mailboxId,senderEmail,recipient,mode:recovery?'recovery':mode})+'\n')
   const exit=await new Promise((done,reject)=>{child.on('error',reject);child.on('close',done)});await chain;if(fail)throw fail
   expect(stderr).toBe('');expect(exit).toBe(!recovery&&mode==='crashBeforePermit'?24:!recovery&&mode==='crashAfterData'?25:!recovery&&mode==='crashAfterLocalReceipt'?26:0)
   if(result)expect(result.network).toBe(0)
   return result
  }
  try{
   await cycle();const recovered=await cycle(true);expect(recovered.smtp).toBe(0);expect(recovered.data).toBe(0)
   const dataPath=join(stateDirectory,'data-count.json');let count=0;try{count=JSON.parse(readFileSync(dataPath,'utf8')).count}catch{}
   expect(count).toBe(['accepted','lost250','lostHttpReceipt','crashAfterData','crashAfterLocalReceipt','rotateAccepted'].includes(mode)?1:0)
   const status=sql("select status from sales_send_jobs where id='"+send.id+"';")
   expect(status).toBe(['accepted','lostHttpReceipt','crashAfterLocalReceipt','rotateAccepted'].includes(mode)?'smtp_accepted':['lost250','crashAfterData'].includes(mode)?'delivery_unknown':['revoke','rotate'].includes(mode)?'claimed':'failed_before_send')
   if(mode==='accepted'){
    const atlas=await handleSalesTool('get_sales_reply_job',{projectId,jobId:claimed.ref.jobId},principal,request.conversationId,db,()=>true)
    expect(atlas).toMatchObject({id:claimed.ref.jobId,editorialStatus:'approved',draft:{id:revision.id,sha256:revision.sha256,current:true},sendStatus:{known:true,job:{id:send.id,status:'smtp_accepted',revisionId:revision.id,revisionHash:revision.sha256,deliveryConfirmed:false}},sendingEnabled:false})
    expect(send.id).not.toBe(claimed.ref.jobId)
   }
  }finally{rmSync(stateDirectory,{recursive:true,force:true})}
 }
},240000)})
