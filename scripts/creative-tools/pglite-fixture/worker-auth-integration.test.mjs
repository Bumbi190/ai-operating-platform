import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {makeCreativeIdentityDbAdapter} from
  '../../../apps/web/lib/media/creative-queue/worker-identity-adapter.ts';
import {
  makeCreativeWorkerAuthenticator,canonicalCreativeWorkerRequest,CREATIVE_CLAIM_PATH
} from '../worker-request-auth.mjs';

const db=new PGlite();
const migration=readFileSync(resolve(import.meta.dirname,
 '../../../apps/web/supabase/creative-drafts/20261020235500_atlas_creative_worker_identity_p10.sql'),'utf8');
const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const projectId='00000000-0000-4000-8000-000000000011';
const otherProject='00000000-0000-4000-8000-000000000012';
const workerId='HultgrenCreative01',keyId='creativeKey001';
const now=new Date('2026-10-21T07:00:00.000Z');
const body=JSON.stringify({workId:'creativeWorkP11'});
const sha=s=>createHash('sha256').update(s).digest('hex');
const nonce1='abcdefghijklmnopqrstuvwx';
const nonce2='anotherNonce9876543210123456';
let nextCounter=1;
function signedRequest(counter,nonce=nonce1,requestBody=body) {
 const fields={
  workerId,keyId,counter,nonce,timestamp:now.toISOString(),
  method:'POST',path:CREATIVE_CLAIM_PATH,bodySha256:sha(requestBody)
 };
 const signature=sign('sha256',Buffer.from(canonicalCreativeWorkerRequest(fields)),
  {key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
 const headers={
  'content-type':'application/json',
  'x-omnira-creative-worker-id':workerId,
  'x-omnira-creative-key-id':keyId,
  'x-omnira-creative-counter':String(counter),
  'x-omnira-creative-nonce':nonce,
  'x-omnira-creative-timestamp':fields.timestamp,
  'x-omnira-creative-signature':signature,
 };
 return new Request('https://omnira.invalid'+CREATIVE_CLAIM_PATH,
  {method:'POST',body:requestBody,headers});
}
/** TEST-ONLY Supabase shape adapter backed by actual local PostgreSQL. */
function dbAdapter(){
 return {
  from(table) {
   assert.equal(table,'atlas_creative_worker_identities');
   return {
    select(columns) {
     assert.match(columns,/public_key_spki_pem/);
     return {
      eq(key,value) {
       assert.equal(key,'worker_id');
       return {
        async maybeSingle() {
         try {
          const result=await db.query(
           'select worker_id,key_id,public_key_spki_pem,state,'+
           'creative_claim_enabled,project_ids from public.atlas_creative_worker_identities where worker_id=$1',
           [value]);
          return {data:result.rows[0]??null,error:null};
         }catch(error){return {data:null,error:{message:String(error)}}}
        }
       };
      }
     };
    }
   };
  },
  async rpc(name,params) {
   assert.equal(name,'atlas_creative_consume_worker_proof_p10');
   await db.exec('set role service_role');
   try {
    await db.query("select set_config('request.jwt.claim.role','service_role',false)");
    const result=await db.query(
      'select public.atlas_creative_consume_worker_proof_p10($1,$2,$3,$4,$5::uuid[]) as accepted',
      [params.p_worker_id,params.p_key_id,params.p_counter,
       params.p_nonce_sha256,params.p_project_ids]);
    return {data:result.rows[0].accepted,error:null};
   } catch(error) {
    return {data:null,error:{message:String(error)}};
   } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.role','',false)");
   }
  }
 };
}
function authenticator() {
 const deps=makeCreativeIdentityDbAdapter(dbAdapter());
 return makeCreativeWorkerAuthenticator({...deps,now:()=>now});
}
before(async()=>{
 await db.exec('create role service_role nologin;create role authenticated nologin;create role anon nologin;');
 await db.exec(migration);
 const pem=keys.publicKey.export({type:'spki',format:'pem'});
 await db.query('insert into public.atlas_creative_worker_identities '+
 '(worker_id,key_id,public_key_spki_pem,state,creative_claim_enabled,project_ids) '+
 'values($1,$2,$3,$4,$5,$6::uuid[])',
 [workerId,keyId,pem,'active',true,[projectId]]);
});
after(async()=>db.close());
test('real P-256 HTTP signature -> DB public key lookup -> atomic P10 consumption',async()=>{
 const req=signedRequest(1,nonce1);
 const principal=await authenticator()(req,body);
 assert.equal(principal?.authenticated,true);
 assert.equal(principal?.workerId,workerId);
 assert.deepEqual(principal?.allowedProjectIds,[projectId]);
 const {rows}=await db.query('select last_counter from public.atlas_creative_worker_identities');
 assert.equal(Number(rows[0].last_counter),1);
});
test('replay fails after building an entirely NEW server authenticator instance',async()=>{
 const req=signedRequest(1,nonce1);
 assert.equal(await authenticator()(req,body),null);
 assert.equal(await authenticator()(signedRequest(2,nonce1),body),null);
 assert.ok(await authenticator()(signedRequest(2,nonce2),body));
});
test('DB-side project change refreshes granted projects, never returns stale scope',async()=>{
 await db.query('update public.atlas_creative_worker_identities set project_ids=$1::uuid[]',
  [[otherProject]]);
 try {
  const principal=await authenticator()(signedRequest(3,'thirdNonce0123456789abcdefgh'),body);
  assert.deepEqual(principal?.allowedProjectIds,[otherProject]);
  assert.equal(principal.allowedProjectIds.includes(projectId),false);
 } finally {
  await db.query('update public.atlas_creative_worker_identities set project_ids=$1::uuid[]',
   [[projectId]]);
 }
});
test('database revocation stops an otherwise valid signed request',async()=>{
 await db.query("update public.atlas_creative_worker_identities set state='revoked'");
 assert.equal(await authenticator()(signedRequest(3,'thirdNonce0123456789abcdefgh'),body),null);
});
