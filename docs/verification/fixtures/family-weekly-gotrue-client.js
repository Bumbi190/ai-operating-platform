'use strict';
// Disposable Supabase GoTrue + PostgREST integration test. All endpoints must
// be private Docker DNS names; no cloud, Vercel, email, model or social calls.
const {setTimeout:delay}=require('node:timers/promises');
const AUTH=process.env.FAMILY_TEST_GOTRUE_URL;
const REST=process.env.FAMILY_TEST_REST_URL;
const PHASE=process.env.FAMILY_TEST_PHASE;
if(!AUTH?.startsWith('http://omnira-family-gotrue-') ||
   (PHASE==='test' && !REST?.startsWith('http://omnira-family-gotrue-')) ||
   !['signup','test'].includes(PHASE)){
 throw Error('LOCAL_GOTRUE_ENVIRONMENT_NOT_ISOLATED');
}
const OWNER_EMAIL='family-weekly-owner@example.test';
const OTHER_EMAIL='family-weekly-foreign@example.test';
const PASS='fixture-only-long-password-2026';
const PROJECT='77cda551-57c9-4dc0-b019-1bb6438777f7';
function expect(x,code){if(!x)throw Error(code)}
async function request(url,{method='GET',token=null,body}={}){
 const headers={accept:'application/json'};
 if(token)headers.authorization='Bearer '+token;
 if(body!==undefined)headers['content-type']='application/json';
 if(url.startsWith(REST+'/') && body!==undefined)headers.prefer='return=representation';
 const res=await fetch(url,{method,headers,
  body:body===undefined?undefined:JSON.stringify(body)});
 const raw=await res.text();
 let data;try{data=raw?JSON.parse(raw):null}catch{data=raw}
 return {status:res.status,data};
}
const denied=r=>r.status>=400&&r.status<500;
const authRequest=(path,opts)=>request(AUTH+path,opts);
const restRequest=(path,opts)=>request(REST+'/'+path,opts);
function inspectToken(t){
 expect(typeof t==='string'&&t.split('.').length===3,'GOTRUE_TOKEN_MISSING');
 return JSON.parse(Buffer.from(t.split('.')[1],'base64url'));
}
async function login(email){
 const r=await authRequest('/token?grant_type=password',{
  method:'POST',body:{email,password:PASS}});
 expect(r.status===200 && r.data?.access_token,
  'GOTRUE_EMAIL_PASSWORD_LOGIN_FAILED_'+r.status);
 const claims=inspectToken(r.data.access_token);
 expect(claims.role==='authenticated'&&claims.sub===r.data.user?.id,
  'GOTRUE_MISSING_AUTHENTICATED_JWT');
 expect(claims.exp>Math.floor(Date.now()/1000),'GOTRUE_JWT_EXPIRED');
 return {user:r.data.user,token:r.data.access_token,claims};
}
(async()=>{
 if(PHASE==='signup'){
  let ready=false;
  for(let i=0;i<70;i++){
   try{const r=await authRequest('/health');if(r.status===200){ready=true;break}}catch{}
   await delay(300);
  }
  expect(ready,'GOTRUE_FAILED_TO_START');
  for(const email of [OWNER_EMAIL,OTHER_EMAIL]){
   const r=await authRequest('/signup',{method:'POST',
    body:{email,password:PASS}});
   expect([200,201].includes(r.status)&&(r.data?.id||r.data?.user?.id),
    'GOTRUE_SIGNUP_FAILED_'+r.status+'_'+String(r.data?.code||r.data?.message||r.data?.msg||r.data?.error||'unknown').slice(0,180));
   await login(email);
  }
  console.log('FAMILY_WEEKLY_REAL_GOTRUE_SIGNUP_AND_PASSWORD_LOGIN_PASS=true');
  return;
 }
 const owner=await login(OWNER_EMAIL), foreign=await login(OTHER_EMAIL);
 expect(owner.user.id!==foreign.user.id,'GOTRUE_USERS_NOT_DISTINCT');
 const badLogin=await authRequest('/token?grant_type=password',{
  method:'POST',body:{email:OWNER_EMAIL,password:'wrong-password'}});
 expect(denied(badLogin),'GOTRUE_INVALID_PASSWORD_ACCEPTED');
 let live=false;
 for(let i=0;i<40;i++){
  try{const r=await restRequest('');if(r.status!==502&&r.status!==503){live=true;break}}catch{}
  await delay(300);
 }
 expect(live,'POSTGREST_FAILED_TO_START');
 const owned=await restRequest('projects?select=id',{token:owner.token});
 const foreignProjects=await restRequest('projects?select=id',{token:foreign.token});
 expect(owned.status===200&&owned.data?.length===1&&owned.data[0].id===PROJECT,
  'REAL_LOGIN_PROJECT_OWNER_RLS_FAILED');
 expect(foreignProjects.status===200&&foreignProjects.data?.length===0,
  'REAL_LOGIN_FOREIGN_PROJECT_RLS_FAILED');
 const endpoint='family_weekly_auto_consent_events?select=event_id,owner_id,action,valid_until,can_publish,can_schedule&order=event_id.asc';
 const initial=await restRequest(endpoint,{token:owner.token});
 expect(initial.status===200&&initial.data.length===0,'GOTRUE_OWNER_CONSENT_INITIAL_FAILED');
 const an=await restRequest(endpoint);
 expect(denied(an),'GOTRUE_ANON_CONSENT_EXPOSED');
 const validUntil=new Date(Date.now()+12*86400000).toISOString();
 const enable={project_id:PROJECT,owner_id:owner.user.id,action:'enable',
  valid_until:validUntil,max_completion_tokens:1800,max_calls_per_week:1,
  can_schedule:false,can_publish:false};
 const forgery=await restRequest('family_weekly_auto_consent_events',{
  method:'POST',token:foreign.token,body:enable});
 expect(denied(forgery),'GOTRUE_FOREIGN_FORGED_OWNER_ACCEPTED');
 const e=await restRequest('family_weekly_auto_consent_events',{
  method:'POST',token:owner.token,body:enable});
 expect(e.status===201&&e.data?.length===1&&e.data[0].action==='enable'&&
  e.data[0].can_publish===false,'GOTRUE_OWNER_CONSENT_ENABLE_FAILED_'+e.status);
 const ownerHistory=await restRequest(endpoint,{token:owner.token});
 const foreignHistory=await restRequest(endpoint,{token:foreign.token});
 expect(ownerHistory.status===200&&ownerHistory.data?.length===1,
  'GOTRUE_OWNER_CONSENT_READ_FAILED');
 expect(foreignHistory.status===200&&foreignHistory.data?.length===0,
  'GOTRUE_FOREIGN_CONSENT_VISIBLE');
 const publish=await restRequest('family_weekly_auto_consent_events',{
  method:'POST',token:owner.token,body:{...enable,can_publish:true}});
 expect(denied(publish),'GOTRUE_FORGED_PUBLISH_PERMISSION_ACCEPTED');
 const expiration=await restRequest('family_weekly_auto_consent_events',{
  method:'POST',token:owner.token,body:{...enable,
   valid_until:new Date(Date.now()+99*86400000).toISOString()}});
 expect(denied(expiration),'GOTRUE_OVERLONG_EXPIRY_ACCEPTED');
 const patch=await restRequest('family_weekly_auto_consent_events?event_id=eq.1',{
  method:'PATCH',token:owner.token,body:{action:'revoke'}});
 const del=await restRequest('family_weekly_auto_consent_events?event_id=eq.1',{
  method:'DELETE',token:owner.token});
 expect(denied(patch)&&denied(del),'GOTRUE_APPEND_ONLY_TAMPER_ACCEPTED');
 const enqueue=await restRequest('rpc/family_weekly_enqueue_once',{
  method:'POST',token:owner.token,body:{}});
 const ledger=await restRequest('family_weekly_model_attempts?select=id',
  {token:owner.token});
 expect(denied(enqueue)&&denied(ledger),'GOTRUE_WORKER_PERMISSION_EXPOSED');
 const revoke=await restRequest('family_weekly_auto_consent_events',{
  method:'POST',token:owner.token,
  body:{project_id:PROJECT,owner_id:owner.user.id,action:'revoke',
   valid_until:null,max_completion_tokens:1800,max_calls_per_week:1,
   can_schedule:false,can_publish:false}});
 expect(revoke.status===201&&revoke.data?.[0]?.action==='revoke',
  'GOTRUE_REVOKE_FAILED_'+revoke.status);
 const final=await restRequest(endpoint,{token:owner.token});
 const foreignFinal=await restRequest(endpoint,{token:foreign.token});
 expect(final.status===200&&final.data?.length===2&&
  final.data[0].action==='enable'&&final.data[1].action==='revoke'&&
  final.data.every(x=>x.owner_id===owner.user.id&&!x.can_publish&&!x.can_schedule),
  'GOTRUE_OWNER_REVOKE_HISTORY_INVALID');
 expect(foreignFinal.status===200&&foreignFinal.data?.length===0,
  'GOTRUE_FOREIGN_SEES_REVOKE_HISTORY');
 console.log('FAMILY_WEEKLY_REAL_GOTRUE_PASSWORD_AUTH_RLS_PASS=true');
 console.log('FAMILY_WEEKLY_REAL_GOTRUE_OWNER_CONSENT_REVOKE_PASS=true');
 console.log('FAMILY_WEEKLY_REAL_GOTRUE_FOREIGN_COST_PUBLISH_DENIED=true');
 console.log('FAMILY_WEEKLY_TEST_AUTH_TYPE=GoTrue_password_session_and_PostgREST');
})().catch(e=>{console.error('FAMILY_WEEKLY_GOTRUE_TEST_FAILED:'+(e?.message||'UNKNOWN'));process.exitCode=1});
