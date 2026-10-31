/* Disposable PostgREST JWT/RLS integration probe.
 * Runs INSIDE a private Docker network against synthetic owner users and
 * the four UNAPPLIED Family consent SQL proposals. No production connection,
 * Supabase account, cloud resource, internet, model or publishing provider.
 * This is a verified-signature JWT / PostgREST test, NOT a GoTrue login or
 * an authenticated Vercel Preview browser session.
 */
'use strict';
const {createHmac}=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises');

const REST=process.env.FAMILY_TEST_REST_URL;
const SECRET=process.env.FAMILY_TEST_JWT_SECRET;
if(!REST||!SECRET||!REST.startsWith('http://omnira-family-jwt-')) {
 throw Error('ISOLATED_POSTGREST_ENV_NOT_RESTRICTED');
}
const PROJECT='77cda551-57c9-4dc0-b019-1bb6438777f7';
const OWNER='77777777-7777-4777-8777-777777777777';
const OTHER='88888888-8888-4888-8888-888888888888';
const bytes=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function signedToken(sub){
 const now=Math.floor(Date.now()/1000);
 const a=bytes({alg:'HS256',typ:'JWT'});
 const b=bytes({role:'authenticated',sub,aud:'authenticated',
  iss:'family-weekly-local-test',iat:now,exp:now+900});
 const sig=createHmac('sha256',SECRET).update(a+'.'+b).digest('base64url');
 return a+'.'+b+'.'+sig;
}
function expect(cond,code){if(!cond)throw Error(code)}
async function http(path,{method='GET',token=null,body}={}){
 const headers={accept:'application/json'};
 if(token!==null)headers.authorization='Bearer '+token;
 if(body!==undefined){
  headers['content-type']='application/json';
  headers.prefer='return=representation';
 }
 const response=await fetch(REST+'/'+path,{method,headers,
  body:body===undefined?undefined:JSON.stringify(body)});
 const raw=await response.text();
 let data;try{data=raw?JSON.parse(raw):null}catch{data=raw}
 return {status:response.status,data};
}
const isDenied=r=>r.status>=400 && r.status<500;
(async()=>{
 let live=false;
 for(let i=0;i<35;i++){
  try{
   const r=await http('');
   if(r.status!==502&&r.status!==503){live=true;break}
  }catch{}
  await delay(300);
 }
 expect(live,'POSTGREST_DID_NOT_START');
 const owner=signedToken(OWNER),other=signedToken(OTHER);
 const ownerProjects=await http('projects?select=id',{token:owner});
 const otherProjects=await http('projects?select=id',{token:other});
 expect(ownerProjects.status===200 && Array.isArray(ownerProjects.data)
  && ownerProjects.data.length===1
  && ownerProjects.data[0].id===PROJECT,'JWT_PROJECT_OWNER_RLS_FAILED');
 expect(otherProjects.status===200&&Array.isArray(otherProjects.data)
  && otherProjects.data.length===0,'JWT_PROJECT_CROSS_OWNER_RLS_FAILED');

 const path='family_weekly_auto_consent_events?select=event_id,project_id,owner_id,action,valid_until,can_schedule,can_publish&order=event_id.asc';
 const ownerEmpty=await http(path,{token:owner});
 expect(ownerEmpty.status===200&&Array.isArray(ownerEmpty.data)
  && ownerEmpty.data.length===0,'JWT_CONSENT_OWNER_INITIAL_READ_FAILED');
 const anon=await http(path);
 expect(isDenied(anon),'ANON_CONSENT_READ_EXPOSED');
 const anonInsert=await http('family_weekly_auto_consent_events',
  {method:'POST',body:{project_id:PROJECT,owner_id:OWNER,action:'revoke',valid_until:null}});
 expect(isDenied(anonInsert),'ANON_CONSENT_WRITE_EXPOSED');

 const until=new Date(Date.now()+20*86400000).toISOString();
 const enable={project_id:PROJECT,owner_id:OWNER,action:'enable',
  valid_until:until,max_completion_tokens:1800,max_calls_per_week:1,
  can_schedule:false,can_publish:false};
 const forged=await http('family_weekly_auto_consent_events',
  {method:'POST',token:other,body:enable});
 expect(isDenied(forged),'FOREIGN_JWT_FORGED_OWNER_INSERT_ACCEPTED');

 // Tamper the JWT payload without re-signing it. PostgREST must reject
 // it cryptographically before any DB access, not just by RLS.
 const parts=owner.split('.');
 const forgedJwt=parts[0]+'.'+bytes({role:'authenticated',sub:OTHER,
  aud:'authenticated',exp:Math.floor(Date.now()/1000)+900})+'.'+parts[2];
 const invalidSig=await http(path,{token:forgedJwt});
 expect(isDenied(invalidSig),'JWT_SIGNATURE_TAMPERING_ACCEPTED');

 const enabled=await http('family_weekly_auto_consent_events',
  {method:'POST',token:owner,body:enable});
 expect(enabled.status===201&&Array.isArray(enabled.data)
  && enabled.data.length===1 && enabled.data[0].action==='enable'
  && enabled.data[0].can_publish===false
  && enabled.data[0].can_schedule===false,
  'JWT_OWNER_CONSENT_ENABLE_FAILED');
 const ownerAfterEnable=await http(path,{token:owner});
 const foreignAfterEnable=await http(path,{token:other});
 expect(ownerAfterEnable.status===200&&ownerAfterEnable.data.length===1,
  'JWT_OWNER_CANNOT_READ_OWN_CONSENT');
 expect(foreignAfterEnable.status===200&&foreignAfterEnable.data.length===0,
  'JWT_FOREIGN_CAN_READ_OWNER_CONSENT');

 const forbiddenPublish=await http('family_weekly_auto_consent_events',
  {method:'POST',token:owner,body:{...enable,can_publish:true}});
 expect(isDenied(forbiddenPublish),'JWT_FORGED_PUBLICATION_AUTHORITY_ACCEPTED');
 const tooLong=await http('family_weekly_auto_consent_events',
  {method:'POST',token:owner,body:{...enable,
   valid_until:new Date(Date.now()+100*86400000).toISOString()}});
 expect(isDenied(tooLong),'JWT_OVERLONG_CONSENT_ACCEPTED');

 const patch=await http('family_weekly_auto_consent_events?event_id=eq.1',
  {method:'PATCH',token:owner,body:{action:'revoke'}});
 const remove=await http('family_weekly_auto_consent_events?event_id=eq.1',
  {method:'DELETE',token:owner});
 expect(isDenied(patch)&&isDenied(remove),
  'JWT_APPEND_ONLY_CONSENT_CAN_BE_MUTATED');

 // A signed-in owner MUST NOT be able to invoke the service-only worker.
 const enqueue=await http('rpc/family_weekly_enqueue_once',
  {method:'POST',token:owner,body:{}});
 const ledger=await http('family_weekly_model_attempts?select=id',
  {token:owner});
 expect(isDenied(enqueue)&&isDenied(ledger),
  'JWT_OWNER_CAN_CREATE_OR_READ_PAID_WORKER_LEDGER');

 const revoked=await http('family_weekly_auto_consent_events',
  {method:'POST',token:owner,body:{project_id:PROJECT,owner_id:OWNER,
   action:'revoke',valid_until:null,max_completion_tokens:1800,
   max_calls_per_week:1,can_schedule:false,can_publish:false}});
 expect(revoked.status===201&&Array.isArray(revoked.data)
  && revoked.data[0].action==='revoke',
  'JWT_OWNER_CONSENT_REVOKE_FAILED');
 const finalOwner=await http(path,{token:owner});
 const finalForeign=await http(path,{token:other});
 expect(finalOwner.status===200&&finalOwner.data.length===2
  && finalOwner.data[0].action==='enable'
  && finalOwner.data[1].action==='revoke'
  && finalOwner.data.every(r=>r.owner_id===OWNER&&
    r.project_id===PROJECT&&r.can_publish===false&&r.can_schedule===false),
  'JWT_OWNER_APPEND_ONLY_REVOCATION_HISTORY_INVALID');
 expect(finalForeign.status===200&&finalForeign.data.length===0,
  'JWT_FOREIGN_SAW_REVOKE_HISTORY');

 console.log('FAMILY_WEEKLY_SIGNED_JWT_POSTGREST_OWNER_ENABLE_REVOKE_PASS=true');
 console.log('FAMILY_WEEKLY_SIGNED_JWT_FOREIGN_ANON_FORGERY_DENIED=true');
 console.log('FAMILY_WEEKLY_SIGNED_JWT_COST_PUBLISH_RESTRICTIONS_PASS=true');
 console.log('FAMILY_WEEKLY_TEST_AUTH_TYPE=signature_verified_JWT_not_GoTrue');
})().catch(e=>{console.error('FAMILY_WEEKLY_SIGNED_JWT_TEST_FAILED:'+
 (e?.message||'UNKNOWN'));process.exitCode=1});
