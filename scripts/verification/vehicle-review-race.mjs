// Test ONLY the owning PowerShell runner's disposable network-none container.
// No hosted DB URLs, Docker images pulled, ports, secrets or customer records.
import assert from 'node:assert/strict'
import {spawn,execFileSync} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'

const container=process.argv[2]
if(process.env.OMNIRA_REVIEW_RACE_TEST!=='disposable-local'||
 !/^omnira-vehicle-capture-rls-[0-9]+$/.test(container??''))
 throw Error('Explicit, PID-scoped disposable fixture required')
const docker=(args)=>execFileSync('docker',args,{encoding:'utf8',timeout:4000})
const label=docker(['inspect','--format','{{index .Config.Labels "omnira.vehicle.audit.fixture"}}',container]).trim()
const network=docker(['inspect','--format','{{.HostConfig.NetworkMode}}',container]).trim()
const image=docker(['inspect','--format','{{.Config.Image}}',container]).trim()
assert.equal(label,container)
assert.equal(network,'none')
assert.equal(image,'postgres:17-alpine')
const q=s=>"'"+s.replaceAll("'","''")+"'"
const project='11111111-1111-4111-8111-111111111111'
const listing='33333333-3333-4333-8333-333333333333'
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const capture='66666666-6666-4666-8666-666666666666'
const rev3='90000000-0000-4000-8000-000000000003'
const rev4='90000000-0000-4000-8000-000000000004'
const rev5='90000000-0000-4000-8000-000000000005'
const uid=n=>'a0000000-0000-4000-8000-'+String(n).padStart(12,'0')
const run=(sql)=>docker(['exec',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1',
 '-U','postgres','-d','vehicle_capture_rls_fixture','-c',sql]).trim()
let sequence=0
const active=new Set()
function session(kind){
 const c=spawn('docker',['exec','-i',container,'psql','-X','-qAt',
  '-v','ON_ERROR_STOP=1','-U','postgres','-d','vehicle_capture_rls_fixture'],
  {stdio:['pipe','pipe','pipe'],windowsHide:true})
 active.add(c)
 let buffer='',errors='',pending=null
 c.stderr.on('data',x=>{errors+=x.toString().slice(0,500)})
 c.stdout.on('data',x=>{
  buffer+=x.toString()
  let pos
  while((pos=buffer.indexOf('\n'))>=0){
   const line=buffer.slice(0,pos).trim();buffer=buffer.slice(pos+1)
   if(!pending)continue
   if(line===pending.token){
    const p=pending;pending=null;clearTimeout(p.timer)
    p.resolve(p.lines)
   }else pending.lines.push(line)
  }
 })
 c.on('exit',code=>{
  active.delete(c)
  if(pending){const p=pending;pending=null;clearTimeout(p.timer);
   p.reject(Error(kind+' psql exit '+code+' '+errors.slice(-350)))}
 })
 const send=sql=>{
  assert(!pending,'Concurrent writes to same fixture session')
  const token='__REVIEW_RACE_'+kind+'_'+(++sequence)+'__'
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{
    pending=null
    reject(Error(kind+' fixture session timeout '+token+' '+errors.slice(-200)))
   },8000)
   pending={token,lines:[],resolve,reject,timer}
   c.stdin.write(sql+'\nSELECT '+q(token)+';\n')
  })
 }
 return {send,close:async()=>{
  if(!c.killed&&c.exitCode===null)c.stdin.end()
  await delay(70)
  if(c.exitCode===null)c.kill()
 }}
}
async function waitForBlocked(name){
 let observed=false
 for(let i=0;i<22;i++){
  const s=run('select count(*) from pg_stat_activity where application_name='+q(name)+
   " and wait_event_type='Lock'")
  if(s==='1'){observed=true;break}
  await delay(85)
 }
 assert(observed,'Expected a real PostgreSQL row-lock wait: '+name)
}
function append(eventId,revision,glb,proof){
 return 'select stored::text||\'|\'||coalesce(reason,\'\')||\'|\'||coalesce(audit_id::text,\'\')'+
  ' from website_review_private.append_pending('+
  [eventId,owner,project,listing,capture,revision,'vehicle3d:synthetic-a',glb,proof,
   'e'.repeat(64)].map(q).join(',')+
  ",now(),'human_review_required','{}'::text[],'{}'::text[],'Concurrent fixture review');"
}
const seed=(rev,glb,proof)=>run(
 'insert into public.website_vehicle_review_revisions('+
 'revision_id,listing_id,project_id,owner_id,capture_id,asset_id,glb_sha256,evidence_digest,photo_proof) values ('+
 [rev,listing,project,owner,capture,'vehicle3d:synthetic-a',glb,proof,
 'pixels_checked_for_human_review'].map(q).join(',')+');')
try{
 seed(rev4,'c'.repeat(64),'d'.repeat(64))
 seed(rev5,'f'.repeat(64),'0'.repeat(64))
 run('update public.website_vehicle_review_assignments set active=true where listing_id='+
 q(listing)+' and reviewer_id='+q(owner))
 // 1. Revision switch commits first: blocked audit must return stale revision.
 {
  const a=session('REVISION_LOCK'),b=session('APPEND_LOCK')
  try{
   await a.send("set application_name='vehicle_race_revision_writer'; BEGIN;"+
    ' update public.website_vehicle_review_current set revision_id='+q(rev4)+
    ' where listing_id='+q(listing)+';')
   await b.send("set application_name='vehicle_race_blocked_append'; set role service_role;")
   const delayed=b.send(append(uid(40),rev3,'8'.repeat(64),'9'.repeat(64)))
   await waitForBlocked('vehicle_race_blocked_append')
   await a.send('COMMIT;')
   const result=await delayed
   assert(result.some(s=>s.startsWith('false|stale_revision|')),'Stale model was accepted: '+result)
   console.log('PASS real two-connection interleave: committed revision change prevents stale audit')
  }finally{await Promise.all([a.close(),b.close()])}
 }
 // 2. Reviewer revocation commits first: blocked audit must not sneak in.
 {
  const a=session('REVOKE_LOCK'),b=session('APPEND_REVOKE')
  try{
   await a.send("set application_name='vehicle_race_revoke_writer'; BEGIN;"+
    ' update public.website_vehicle_review_assignments set active=false where listing_id='+
    q(listing)+' and reviewer_id='+q(owner)+';')
   await b.send("set application_name='vehicle_race_blocked_reviewer'; set role service_role;")
   const delayed=b.send(append(uid(41),rev4,'c'.repeat(64),'d'.repeat(64)))
   await waitForBlocked('vehicle_race_blocked_reviewer')
   await a.send('COMMIT;')
   const result=await delayed
   assert(result.some(s=>s.startsWith('false|no_permission|')),'Revoked reviewer was accepted: '+result)
   console.log('PASS real two-connection interleave: committed reviewer revoke prevents audit')
  }finally{await Promise.all([a.close(),b.close()])}
 }
 // 3. Audit obtains current+assignment locks first: revision switch must wait
 // until the audit commits. This is valid serialization (not a stale approval).
 {
  run('update public.website_vehicle_review_assignments set active=true where listing_id='+
   q(listing)+' and reviewer_id='+q(owner))
  const a=session('APPEND_FIRST'),b=session('SWITCH_SECOND')
  try{
   await a.send("set application_name='vehicle_race_audit_first'; set role service_role; BEGIN;")
   const recorded=await a.send(append(uid(42),rev4,'c'.repeat(64),'d'.repeat(64)))
   assert(recorded.some(s=>s.startsWith('true||')),'Expected pending audit to be accepted: '+recorded)
   await b.send("set application_name='vehicle_race_blocked_switch'; BEGIN;")
   const delayed=b.send('update public.website_vehicle_review_current set revision_id='+
    q(rev5)+' where listing_id='+q(listing)+';')
   await waitForBlocked('vehicle_race_blocked_switch')
   await a.send('COMMIT;')
   await delayed
   await b.send('COMMIT;')
   assert.equal(run('select revision_id from public.website_vehicle_review_current where listing_id='+
    q(listing)),rev5)
   assert.equal(run('select count(*) from public.website_vehicle_review_audit where event_id='+
    q(uid(42))),'1')
   console.log('PASS real two-connection interleave: pending audit committed before revision change')
  }finally{await Promise.all([a.close(),b.close()])}
 }
 // 4. Listing revoked while pending audit waits: no stale review may be saved.
 {
  const a=session('LISTING_REVOKE'),b=session('APPEND_LISTING')
  try{
   await a.send("set application_name='vehicle_race_listing_writer'; BEGIN;"+
    ' update public.website_vehicle_capture_listings set state=\'revoked\' where id='+
    q(listing)+';')
   await b.send("set application_name='vehicle_race_blocked_listing'; set role service_role;")
   const delayed=b.send(append(uid(43),rev5,'f'.repeat(64),'0'.repeat(64)))
   await waitForBlocked('vehicle_race_blocked_listing')
   await a.send('COMMIT;')
   const result=await delayed
   assert(result.some(s=>s.startsWith('false|no_permission|')),'Revoked listing was accepted: '+result)
   console.log('PASS real two-connection interleave: listing revoke prevents in-flight audit')
  }finally{await Promise.all([a.close(),b.close()])}
 }
 run('update public.website_vehicle_capture_listings set state=\'evidence_only\' where id='+q(listing))
 // 5. A concurrent project ownership transfer must also be serialized.
 {
  const a=session('TRANSFER_OWNER'),b=session('APPEND_TRANSFER')
  try{
   await a.send("set application_name='vehicle_race_owner_writer'; BEGIN;"+
    ' update public.projects set owner_id='+q('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')+
    ' where id='+q(project)+';')
   await b.send("set application_name='vehicle_race_blocked_owner'; set role service_role;")
   const delayed=b.send(append(uid(44),rev5,'f'.repeat(64),'0'.repeat(64)))
   await waitForBlocked('vehicle_race_blocked_owner')
   await a.send('COMMIT;')
   const result=await delayed
   assert(result.some(s=>s.startsWith('false|no_permission|')),'Transferred project was accepted: '+result)
   console.log('PASS real two-connection interleave: project owner transfer prevents in-flight audit')
  }finally{await Promise.all([a.close(),b.close()])}
 }
 assert.equal(run('select count(*) from public.website_vehicle_review_audit'), '3')
 console.log('PASS: five real two-session PostgreSQL review races (revision, assignment, listing and owner)')
}finally{
 for(const c of active){c.stdin.end();c.kill()}
}
