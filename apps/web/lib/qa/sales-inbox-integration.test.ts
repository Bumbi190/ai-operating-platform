import {describe,it,expect} from 'vitest'
import {spawnSync,spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {randomUUID,createHash} from 'node:crypto'
import {resolve,join} from 'node:path'
import {tmpdir} from 'node:os'
import {mkdtempSync,rmSync} from 'node:fs'
import {createSalesApi} from '@/lib/sales/api'
import {createInboxApi} from '@/lib/sales/inbox/api'
import {createInboxHostApi} from '@/lib/sales/inbox/host-api'
import {handleSalesTool} from '@/lib/sales/atlas-tools'
if(process.env.SALES_FIXTURE_CONTAINER&&!['omnira-sales-pilot-20261017','omnira-sales-reply-20261018'].includes(process.env.SALES_FIXTURE_CONTAINER))throw Error('UNOWNED_FIXTURE_CONTAINER')
const database=process.env.SALES_FIXTURE_DATABASE??'',suite=/^sales_[0-9]+$/.test(database)?describe:describe.skip
suite('durable inbox real SQL/API/Python/IMAP wire integration',()=>{
 it('recovers process crashes and lost receipts, reads selected old UID, deduplicates epochs, bounds MIME and fences pause during fetch',async()=>{
  const sql=(s:string)=>{const r=spawnSync('docker',['exec','-i',(process.env.SALES_FIXTURE_CONTAINER??'omnira-sales-pilot-20261017'),'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d',database],{input:s,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim()}
  const projectId=randomUUID(),mailboxId=randomUUID(),workerId=randomUUID(),conversationId=randomUUID(),contactId=randomUUID(),userId='20000000-0000-4000-8000-000000000001',token='I'.repeat(43),p={userId,allowedProjectIds:[projectId]},canary='SYNTHETIC_INBOX_PASSWORD_å🔑',stateDirectory=mkdtempSync(join(tmpdir(),'omnira-inbox-fixture-'))
  sql(`insert into projects values('${projectId}','${userId}','inbox-fixture',false);insert into conversations values('${conversationId}','${userId}','${projectId}');insert into sales_worker_registrations(id,project_id,owner_id,token_hash,managed_authorized_at,manager_token_hash) values('${workerId}','${projectId}','${userId}',repeat('e',64),now(),'${createHash('sha256').update(token).digest('hex')}');insert into sales_mailbox_connections(id,project_id,worker_id,owner_id,public_jwk,kid,key_generation,generation,email,status,smtp_authenticated_at,imap_authenticated_at) values('${mailboxId}','${projectId}','${workerId}','${userId}','{}',repeat('a',64),1,6,'info@example.se','authenticated',now(),now());`)
  const quote=(v:unknown)=>`'${String(v).replaceAll("'","''")}'`,db={rpc:async(name:string,args:Record<string,unknown>)=>{
   if(!/^sales_[a-z_]+$/.test(name))throw Error('RPC_REFUSED')
   try{const a=Object.entries(args).map(([k,v])=>`${k}=>${quote(typeof v==='string'?v:JSON.stringify(v))}${typeof v==='string'?'::text':'::jsonb'}`).join(',');return {data:JSON.parse(sql(`set role service_role;select to_jsonb(${name}(${a}));`)),error:null}}catch(e){return {data:null,error:{code:String(e).match(/ERROR:\s+([A-Z0-9]{5})/)?.[1]??'XX000'}}}
  }} as never
  const deps={db:()=>db,enabled:(id:string)=>id===projectId},owner=createInboxApi({...deps,access:async()=>({ok:true as const,...p})}),host=createInboxHostApi(deps),sales=createSalesApi({...deps,access:async()=>({ok:true as const,...p})})
  const post=async(api:(r:Request)=>Promise<Response>,body:unknown,bearer?:string)=>{const r=await api(new Request('https://fixture.invalid/api/sales/inbox',{method:'POST',headers:bearer?{authorization:'Bearer '+bearer}:{origin:'https://fixture.invalid'},body:JSON.stringify(body)}));return {code:r.status,body:await r.json()}}
  const ownerPost=async(operation:string,v:Record<string,unknown>)=>{const r=await post(owner,{operation,projectId,...v});expect(r.code).toBe(200);return r.body}
  const cursor=()=>JSON.parse(sql(`select sales_inbox_cursor(c) from sales_inbox_configs c where mailbox_id='${mailboxId}';`))
  let config=await ownerPost('configure',{mailboxId,expectedVersion:0,folder:'INBOX',since:'2026-10-07T22:00:00Z',selectedContactIds:[]})
  async function cycle(options:Record<string,unknown>={}){
   const child=spawn(process.platform==='win32'?'C:\\Python312\\python.exe':'python3',['-u','-m','workers.sales.tests.inbox_cross_fixture'],{cwd:resolve(process.cwd(),'../..'),stdio:['pipe','pipe','ignore']});let chain=Promise.resolve(),failure:unknown,result:any=null,lost=false
   createInterface({input:child.stdout}).on('line',line=>{chain=chain.then(async()=>{
    const v=JSON.parse(line)
    if(v.event){if(v.event!=='complete')throw Error('PYTHON_INBOX_FIXTURE_FAILED:'+v.errorType);result=v;return}
    if(v.control==='pause'){config=await ownerPost('set_state',{mailboxId,expectedVersion:config.version,state:'paused'});child.stdin.write('{}\n');return}
    if(v.control==='revoke'){expect((await post(sales,{operation:'revoke_worker',projectId,workerId})).code).toBe(200);child.stdin.write('{}\n');return}
    const r=await post(host,v.body,v.token)
    if(options.loseReceipt&&v.body.operation==='commit_batch'&&r.code===200&&!lost){lost=true;child.stdin.write('{"error":"UNAVAILABLE"}\n')}
    else child.stdin.write(JSON.stringify(r.code===200?r.body:{error:r.body.code})+'\n')
   }).catch(e=>{failure=e;child.kill()})})
   child.stdin.write(JSON.stringify({token,canary,stateDirectory,mailboxId,...options})+'\n')
   const exit=await new Promise<number|null>((done,reject)=>{child.on('error',reject);child.on('close',done)});await chain;if(failure)throw failure
   expect(exit).toBe(options.crashBeforeCommit?24:0);if(!options.crashBeforeCommit)expect(result).toMatchObject({readOnly:true,modelCalls:0,externalCalls:0});return result
  }
  try{
   expect(await cycle()).toMatchObject({authCount:0,code:'IDLE'})
   config=await ownerPost('set_state',{mailboxId,expectedVersion:config.version,state:'enabled'})
   await cycle({crashBeforeCommit:true});expect(cursor().scannedThroughUid).toBe(0)
   sql(`update sales_inbox_batches set lease_until=clock_timestamp()-interval '1 second' where mailbox_id='${mailboxId}';`)
   expect(await cycle({loseReceipt:true})).toMatchObject({authCount:1,code:'WAITING_RECEIPT',pending:true});expect(cursor()).toEqual({uidValidity:'10',scannedThroughUid:29,epoch:1})
   expect(await cycle()).toMatchObject({authCount:0,code:'RECOVERED',pending:false});expect(sql(`select count(*) from sales_inbox_occurrences where mailbox_id='${mailboxId}';`)).toBe('1')
   const messageId=sql(`select id from sales_inbox_messages where mailbox_id='${mailboxId}';`)
   const absent=await handleSalesTool('get_sales_inbox_message',{projectId,messageId},p,conversationId,db,()=>true);expect(absent).toMatchObject({missingText:true})
   await ownerPost('select_text',{messageId,expectedVersion:1});expect(await cycle()).toMatchObject({authCount:1,code:'SYNCED'});expect(cursor().scannedThroughUid).toBe(29)
   const evidence:any=await handleSalesTool('get_sales_inbox_message',{projectId,messageId},p,conversationId,db,()=>true);expect(evidence).toMatchObject({message:{text:'Tack åäö',textState:'complete'},source:{kind:'saved_sales_inbox',messageId},missingText:false,sendingEnabled:false})
   sql(`insert into sales_contacts(id,project_id,version,data) values('${contactId}','${projectId}',1,'{"confirmed":true,"email":"dealer@example.se"}');`)
   config=await ownerPost('configure',{mailboxId,expectedVersion:config.version,folder:'INBOX',since:'2026-10-07T22:00:00Z',selectedContactIds:[contactId]});config=await ownerPost('set_state',{mailboxId,expectedVersion:config.version,state:'enabled'})
   expect(await cycle({validity:11})).toMatchObject({code:'SYNCED'});expect(sql(`select count(*) from sales_inbox_messages where mailbox_id='${mailboxId}';`)).toBe('1');expect(sql(`select count(*) from sales_inbox_occurrences where mailbox_id='${mailboxId}';`)).toBe('2')
   expect(await cycle({validity:12,messages:{12:{},13:{vanished:true}}})).toMatchObject({code:'SYNCED'});expect(sql(`select count(*) from sales_inbox_messages where mailbox_id='${mailboxId}' and text_state='vanished';`)).toBe('1')
   const attachment='("TEXT" "PLAIN" ("CHARSET" "UTF-8" "NAME" "private.txt") NIL NIL "8BIT" 12 1 NIL ("ATTACHMENT" ("FILENAME" "private.txt")))'
   expect(await cycle({validity:12,next:34,messages:{31:{structure:attachment},32:{body:'A'.repeat(65537)},33:{body:'B'.repeat(9000)}}})).toMatchObject({code:'SYNCED'});expect(sql(`select string_agg(text_state,',' order by text_state) from sales_inbox_messages where mailbox_id='${mailboxId}' and text_state in('unsupported','truncated','too_large');`)).toBe('too_large,truncated,unsupported')
   const before=cursor();expect(await cycle({validity:13,pauseBeforeCommit:true})).toMatchObject({code:'WAITING_RECEIPT'});expect(cursor()).toEqual(before);expect(await cycle()).toMatchObject({authCount:0,code:'FENCED'})
   config=await ownerPost('set_state',{mailboxId,expectedVersion:config.version,state:'enabled'});expect(await cycle({validity:13,revokeBeforeCommit:true})).toMatchObject({code:'WAITING_RECEIPT'});expect(cursor()).toEqual(before);expect(await cycle()).toMatchObject({authCount:0,code:'NOT_FOUND'});expect(sql(`select sales_mailbox_status(c)->>'inboxEnabled' from sales_mailbox_connections c where id='${mailboxId}';`)).toBe('false')
   expect(sql(`select count(*) from sales_model_attempts where project_id='${projectId}';`)).toBe('0')
  }finally{rmSync(stateDirectory,{recursive:true,force:true})}
 },120000)
})
