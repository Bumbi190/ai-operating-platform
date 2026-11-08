import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {existsSync,readFileSync} from 'node:fs'
import {freemem} from 'node:os'
import {fileURLToPath} from 'node:url'
const web=fileURLToPath(new URL('../',import.meta.url))
const proposal=fileURLToPath(new URL('../../../docs/sql/atlas-builder-reference-message-binding-proposed.sql',import.meta.url))
const container='omnira-reference-binding-'+randomUUID().slice(0,8)
const image='postgres:17-alpine',label='omnira-reference-binding-20261030'
const hash=s=>createHash('sha256').update(s).digest('hex')
const q=s=>"'"+String(s).replaceAll("'","''")+"'"
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:2**20,timeout:30000});if(r.status!==0)throw Error(r.stderr||r.error?.message||'docker failed');return r.stdout.trim()}
function sql(s){return docker(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],s)}
function sqlAsync(s){return new Promise((resolve,reject)=>{
 const child=spawn('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{stdio:['pipe','pipe','pipe']})
 let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v)
 const timer=setTimeout(()=>child.kill(),30000)
 child.on('error',reject);child.on('close',code=>{clearTimeout(timer);code===0?resolve(out.trim()):reject(Error(err||'concurrent psql failed'))});child.stdin.end(s)
})}
const owner=randomUUID(),otherOwner=randomUUID(),project=randomUUID(),otherProject=randomUUID(),conv=randomUUID(),otherConv=randomUUID()
const refs=[0,1].map(i=>({ticketId:randomUUID(),assetId:randomUUID(),mimeType:'image/webp',sha256:hash('synthetic-image-'+i)}))
const text='Använd dessa referenser. Åäö 🚗',intent=randomUUID()
function statement({key=intent,body=text,images=refs,user=owner,site=project,conversation=conv}={}){
 return 'select public.website_build_persist_reference_turn('+[user,site,conversation,key].map(v=>q(v)+'::uuid').join(',')+','+q(body)+','+q(JSON.stringify(images))+'::jsonb);'
}
let passed=0,started=false
function check(name,fn){fn();passed++;console.log('PASS '+name)}
try{
 if(freemem()<1024**3)throw Error('Less than 1GiB free RAM; no container started')
 docker(['image','inspect',image,'--format','{{.Id}}'])
 docker(['run','--pull=never','--rm','-d','--name',container,'--label','com.omnira.testplan='+label,
  '--network=none','--memory=256m','--memory-swap=256m','--cpus=0.5','--pids-limit=64',
  '--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,size=96m',
  '-e','POSTGRES_HOST_AUTH_METHOD=trust',image,'-c','shared_buffers=16MB','-c','max_connections=12','-c','work_mem=1MB'])
 started=true
 let ready=false
 for(let i=0;i<60;i++){
  const r=spawnSync('docker',['exec',container,'pg_isready','-U','postgres'],{encoding:'utf8',timeout:5000})
  if(r.status===0){ready=true;break}
  await new Promise(resolve=>setTimeout(resolve,200))
 }
 assert(ready,'Postgres not ready')
 sql(readFileSync(web+'lib/website-build/assets/fixtures/reference-binding-bootstrap.sql','utf8'))
 sql(readFileSync(fileURLToPath(new URL('../../../docs/sql/atlas-builder-reference-upload-tickets-proposed.sql',import.meta.url)),'utf8'))
 if(existsSync(proposal))sql(readFileSync(proposal,'utf8'))
 sql('insert into auth.users values('+q(owner)+'),('+q(otherOwner)+');'+
  'insert into projects(id,owner_id) values('+q(project)+','+q(owner)+'),('+q(otherProject)+','+q(otherOwner)+');'+
  'insert into conversations values('+q(conv)+','+q(owner)+','+q(project)+'),('+q(otherConv)+','+q(otherOwner)+','+q(otherProject)+');')
 for(const [i,ref] of refs.entries()){
  const path='website/references/'+project+'/'+conv+'/'+ref.ticketId+'.webp'
  sql('insert into assets values('+[ref.assetId,project,'internal','image','image/webp','active'].map(q).join(',')+',12,'+q(ref.sha256)+','+q('media-assets-private')+','+q(path)+');'+
   'insert into asset_provenance values('+q(ref.assetId)+','+q('uploaded')+','+q(JSON.stringify({purpose:'atlas-website-reference',ticketId:ref.ticketId}))+'::jsonb);'+
   'insert into website_build_reference_tickets(id,owner_id,project_id,conversation_id,draft_id,slot,mime_type,object_path,state,asset_id) values('+
   [ref.ticketId,owner,project,conv,intent].map(q).join(',')+','+i+','+[ref.mimeType,'incoming/'+ref.ticketId,'ready',ref.assetId].map(q).join(',')+');')
 }
 let first
 check('atomic message and ordered manifest, database-generated ID',()=>{
  first=JSON.parse(sql(statement()))
  assert.notEqual(first.messageId,intent)
  assert.equal(sql('select count(*) from conversation_messages;'),'1')
  assert.equal(sql('select count(*) from website_build_reference_messages;'),'1')
  assert.equal(first.messageSha256,hash(text))
  assert.equal(first.referenceSha256,hash(JSON.stringify(refs.map(r=>[r.ticketId,r.assetId,r.sha256]))))
  assert.equal(first.bindingSha256,hash(JSON.stringify(['omnira.website-reference-turn.v1',owner,project,conv,first.messageId,first.messageSha256,first.referenceSha256])))
 })
 check('exact replay returns same receipt and no duplicate message',()=>{
  assert.deepEqual(JSON.parse(sql(statement())),first);assert.equal(sql('select count(*) from conversation_messages;'),'1')
 })
 check('service-role-only definer RPC and forced RLS',()=>{
  assert.deepEqual(JSON.parse(sql('set role service_role;'+statement())),first)
  assert.equal(sql("select relrowsecurity and relforcerowsecurity from pg_class where oid='website_build_reference_messages'::regclass;"),'t')
  const signature='public.website_build_persist_reference_turn(uuid,uuid,uuid,uuid,text,jsonb)'
  for(const role of ['anon','authenticated']){
   assert.equal(sql("select has_function_privilege("+q(role)+','+q(signature)+",'EXECUTE');"),'f')
   assert.equal(sql("select has_table_privilege("+q(role)+",'website_build_reference_messages','SELECT');"),'f')
   assert.throws(()=>sql('set role '+role+';'+statement()),/permission denied/)
  }
  for(const role of ['anon','authenticated','service_role'])for(const op of ['INSERT','UPDATE','DELETE'])
   assert.equal(sql("select has_table_privilege("+q(role)+",'website_build_reference_messages',"+q(op)+');'),'f')
 })
 for(const [name,args] of [['changed text',{body:text+'!'}],['changed image order',{images:[...refs].reverse()}]]){
  check('same intent rejects '+name,()=>assert.throws(()=>sql(statement(args)),/ATLAS_REFERENCE_CONFLICT/))
 }
 for(const [name,args] of [['foreign owner',{user:otherOwner}],['foreign project',{site:otherProject}],['foreign conversation',{conversation:otherConv}]]){
  check('denies '+name,()=>assert.throws(()=>sql(statement({...args,key:randomUUID()})),/ATLAS_REFERENCE_NOT_FOUND/))
 }
 check('invalid/missing/duplicate images reject atomically',()=>{
  for(const images of [[],[refs[0],refs[0]],[{...refs[0],ticketId:randomUUID()}],[{...refs[0],sha256:'b'.repeat(64)}],[{...refs[0],url:'https://evil.test'}]]){
   assert.throws(()=>sql(statement({key:randomUUID(),images})),/ATLAS_REFERENCE_(INVALID|NOT_FOUND)/)
  }
  assert.equal(sql('select count(*) from conversation_messages;'),'1')
 })
 check('paused and archived projects refuse new messages',()=>{
  sql('update projects set execution_paused=true where id='+q(project))
  assert.throws(()=>sql(statement({key:randomUUID()})),/ATLAS_REFERENCE_NOT_FOUND/)
  sql('update projects set execution_paused=false where id='+q(project)+';insert into project_lifecycle values('+q(project)+','+q(owner)+',\'archived\');')
  assert.throws(()=>sql(statement({key:randomUUID()})),/ATLAS_REFERENCE_NOT_FOUND/)
  sql('delete from project_lifecycle;')
 })
 check('foreign lifecycle owner cannot bypass active-project gate',()=>{
  sql('insert into project_lifecycle values('+q(project)+','+q(otherOwner)+',\'archived\');')
  assert.throws(()=>sql(statement({key:randomUUID()})),/ATLAS_REFERENCE_NOT_FOUND/)
  sql('delete from project_lifecycle;')
 })
 check('revoked image data rejects replay and new messages without partial writes',()=>{
  const ref=refs[1],before=sql('select count(*) from conversation_messages;')
  for(const [change,restore] of [
   ["update assets set visibility='public' where id="+q(ref.assetId),"update assets set visibility='internal' where id="+q(ref.assetId)],
   ["update assets set checksum_sha256="+q('c'.repeat(64))+" where id="+q(ref.assetId),"update assets set checksum_sha256="+q(ref.sha256)+" where id="+q(ref.assetId)],
   ["update asset_provenance set source='generated' where asset_id="+q(ref.assetId),"update asset_provenance set source='uploaded' where asset_id="+q(ref.assetId)],
  ]){
   sql(change)
   assert.throws(()=>sql(statement()),/ATLAS_REFERENCE_NOT_FOUND/)
   assert.throws(()=>sql(statement({key:randomUUID()})),/ATLAS_REFERENCE_NOT_FOUND/)
   sql(restore)
  }
  assert.equal(sql('select count(*) from conversation_messages;'),before)
 })
 check('tampered message cannot produce replay evidence',()=>{
  sql('update conversation_messages set content=\'tampered\' where id='+q(first.messageId))
  assert.throws(()=>sql(statement()),/ATLAS_REFERENCE_CONFLICT/)
  sql('update conversation_messages set content='+q(text)+' where id='+q(first.messageId))
 })
 const concurrentKey=randomUUID()
 const pair=await Promise.all([sqlAsync(statement({key:concurrentKey})),sqlAsync(statement({key:concurrentKey}))])
 check('two concurrent requests persist one message/manifest',()=>{
  assert.deepEqual(JSON.parse(pair[0]),JSON.parse(pair[1]))
  assert.equal(sql('select count(*) from conversation_messages;'),'2')
  assert.equal(sql('select count(*) from website_build_reference_messages;'),'2')
 })
 const competingKey=randomUUID()
 const competing=await Promise.allSettled([sqlAsync(statement({key:competingKey})),sqlAsync(statement({key:competingKey,body:text+' changed'}))])
 check('concurrent conflicting intent has exactly one winner',()=>{
  assert.equal(competing.filter(r=>r.status==='fulfilled').length,1)
  const rejected=competing.find(r=>r.status==='rejected')
  assert.match(rejected.reason.message,/ATLAS_REFERENCE_CONFLICT/)
  assert.equal(sql('select count(*) from conversation_messages;'),'3')
 })
 const holder=sqlAsync("set application_name='omnira_reference_binding_hold';begin;select id from projects where id="+q(project)+" for update;select pg_sleep(4);rollback;")
 let holding=false
 for(let i=0;i<40;i++){
  if(sql("select count(*) from pg_stat_activity where application_name='omnira_reference_binding_hold' and wait_event='PgSleep';")==='1'){holding=true;break}
  await new Promise(resolve=>setTimeout(resolve,50))
 }
 assert(holding,'Lock holder did not become ready')
 let lockError=null
 try{sql(statement({key:randomUUID()}))}catch(error){lockError=error}
 await holder
 check('blocked project lock times out without a partial message',()=>{
  assert.match(lockError?.message??'',/lock timeout/)
  assert.equal(sql('select count(*) from conversation_messages;'),'3')
 })
 check('message deletion cascades manifest without blocking erasure',()=>{
  sql('delete from conversation_messages where id='+q(first.messageId))
  assert.equal(sql('select count(*) from website_build_reference_messages;'),'2')
 })
 console.log('RESULT '+passed+' PostgreSQL checks PASS')
}finally{
 if(started){
  assert.equal(docker(['inspect','--format','{{index .Config.Labels "com.omnira.testplan"}}',container]),label)
  docker(['rm','-f',container])
  const remaining=docker(['ps','-a','--filter','name=^/'+container+'$','--format','{{.ID}}'])
  assert.equal(remaining,'');console.log('CLEANUP verified: owned container absent')
 }
}
