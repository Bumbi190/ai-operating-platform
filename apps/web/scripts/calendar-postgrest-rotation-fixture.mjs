// TEST ONLY. Runs inside the owned parent cross-tree replay. A second,
// isolated PostgREST container verifies overlapping and retired RSA keys
// against the exact same synthetic database, without live credentials.
// Does NOT provision HTTPS OIDC, modify production, or model Supabase's
// hosted third-party JWKS cache behavior.
import assert from 'node:assert/strict'
import {setTimeout as pause} from 'node:timers/promises'
import {createCalendarRotationFixture,calendarRotationFixturePublic} from
 './calendar-oidc-rotation-fixture.mjs'

export async function runClosedCalendarRotationProbe({
 docker,dbContainerName,httpNetwork,gatewayName,restImage,password,
 operatorSubject,projectId,jobId,publicationId,sql,
}){
 const name=dbContainerName+'-rest-rotation'
 assert.notEqual(docker(['container','inspect',name]).status,0,
  'refusing to replace any pre-existing rotation container')
 const issuer=createCalendarRotationFixture({
  expectedSubject:operatorSubject,expectedProject:projectId,
 })
 const scope={p_project_id:projectId,p_job_id:jobId,p_publication_id:publicationId}
 const role='social_schedule_operator_review_fixture'
 const old=issuer.issue({role,subject:operatorSubject,projectId})
 issuer.activateNew()
 const fresh=issuer.issue({role,subject:operatorSubject,projectId})
 const reviewer=issuer.issue({
  role:'social_schedule_broker_review_fixture',
  subject:operatorSubject,projectId,
 })
 const active=issuer.publicJwks()
 assert.deepEqual(active.keys.map(k=>k.kid),[
  calendarRotationFixturePublic.oldKid,calendarRotationFixturePublic.newKid,
 ])
 // The gateway has only the closed internal network, no public ports.
 let running=false
 const remove=()=>{
  if(!running)return
  const stopped=docker(['rm','-f',name])
  assert.equal(stopped.status,0,'failed to clean test-only rotation service: '+stopped.stderr)
  running=false
 }
 const launch=(jwks)=>{
  const started=docker(['run','--pull=never','--detach',
    '--name',name,'--network',httpNetwork,'--network-alias','rest-rotation',
    '--env','PGRST_DB_URI=postgres://authenticator:'+password+'@db:5432/postgres',
    '--env','PGRST_DB_SCHEMAS=public',
    '--env','PGRST_DB_ANON_ROLE=anon',
    '--env','PGRST_JWT_SECRET='+JSON.stringify(jwks),
    '--env','PGRST_JWT_AUD=authenticated',restImage])
  assert.equal(started.status,0,started.stderr)
  running=true
 }
 const script=`const q=JSON.parse(Buffer.from(process.argv[1],'base64').toString('utf8'));
   fetch('http://rest-rotation:3000'+q.path,{
     method:'POST',headers:{Authorization:'Bearer '+q.token,
       'Content-Type':'application/json'},body:JSON.stringify(q.input),
   }).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.text()})))
     .catch(e=>{console.error('rotation fixture request failed');process.exitCode=1})`
 const request=(token,path='/rpc/social_schedule_operator_review_history_fixture',
  input=scope)=>{
  const encoded=Buffer.from(JSON.stringify({path,token,input})).toString('base64')
  const result=docker(['exec',gatewayName,'node','-e',script,encoded])
  assert.equal(result.status,0,result.stderr)
  return JSON.parse(result.stdout.trim())
 }
 const ready=async()=>{
  for(let attempt=0;attempt<50;attempt++){
   const result=docker(['exec',gatewayName,'node','-e',
    "fetch('http://rest-rotation:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"])
   if(result.status===0)return
   await pause(80)
  }
  throw Error('rotation verifier not ready')
 }
 try{
  launch(active)
  await ready()
  const oldDuringOverlap=request(old)
  const newDuringOverlap=request(fresh)
  for(const [label,result] of [['old-overlap',oldDuringOverlap],['new-overlap',newDuringOverlap]]){
   assert.equal(result.status,200,label+': '+result.body)
   const payload=JSON.parse(result.body)
   assert.equal(payload.items.length,2)
   assert.equal(payload.providerOutcome,'unknown')
   assert.equal(payload.automaticRetryAllowed,false)
  }
  const reviewCandidate=request(reviewer,
   '/rpc/social_schedule_dispatch_review_fixture',{p_project_id:projectId})
  assert.equal(reviewCandidate.status,200,reviewCandidate.body)
  assert.equal(JSON.parse(reviewCandidate.body).items.length,1)
  // Same actor/role/claims but changed kid or signature cannot pass RSA.
  const parts=fresh.split('.')
  const unknownHeader=Buffer.from(JSON.stringify({
   alg:'RS256',typ:'JWT',kid:'untrusted-rotated-key',
  })).toString('base64url')
  const unknownKid=unknownHeader+'.'+parts[1]+'.'+parts[2]
  assert.equal(request(unknownKid).status,401)
  const foreignClaims=Buffer.from(JSON.stringify({
   ...JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8')),
   sub:'20000000-0000-4000-8000-000000000099',
  })).toString('base64url')
  const forgedSub=parts[0]+'.'+foreignClaims+'.'+parts[2]
  assert.equal(request(forgedSub).status,401)
  assert.throws(()=>issuer.issue({
   role:'service_role',subject:operatorSubject,projectId,
  }),/DENIED/)
  assert.throws(()=>issuer.issue({
   role,subject:'20000000-0000-4000-8000-000000000099',projectId,
  }),/DENIED/)
  // Use a NEW verifier process with only the new public key. This models
  // the post-cache retirement state, NOT immediate hosted-Supabase invalidation.
  issuer.retireOld()
  remove()
  launch(issuer.publicJwks())
  await ready()
  const retired=request(old)
  assert.equal(retired.status,401,
   'retired old-key JWT still accepted: '+retired.body)
  const newContinues=request(fresh)
  assert.equal(newContinues.status,200,newContinues.body)
  assert.equal(JSON.parse(newContinues.body).items.length,2)
  // No authorization, review or provider-side effects during rotation.
  assert.equal(sql('SELECT count(*) FROM public.social_schedule_operator_review_events_fixture'),'2')
  assert.equal(sql('SELECT count(*) FROM public.social_schedule_dispatch_intents_fixture'),'1')
  assert.equal(sql('SELECT provider_outcome FROM public.social_schedule_dispatch_intents_fixture'),'unknown')
  return Object.freeze({
   oldKeyAcceptedDuringOverlap:true,newKeyAcceptedDuringOverlap:true,
   retiredOldRejected:true,newKeyContinues:true,
   unknownKidRejected:true,forgedSubjectRejected:true,
   providerOutcome:'unknown',operatorEventCount:2,
  })
 }finally{remove()}
}
