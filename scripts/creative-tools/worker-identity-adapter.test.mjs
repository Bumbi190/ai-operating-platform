import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCreativeIdentityDbAdapter} from '../../apps/web/lib/media/creative-queue/worker-identity-adapter.ts';

const project='00000000-0000-4000-8000-000000000011';
const worker='HultgrenCreative01',keyId='creativeKey001';
const row={
 worker_id:worker,key_id:keyId,public_key_spki_pem:'test-only-public-key',
 state:'active',creative_claim_enabled:true,project_ids:[project],
};
function fakeClient(opts={}) {
 const recorded={query:[],calls:[]};
 const db={
  from(name){
   recorded.query.push(name);
   return {select(columns){
    recorded.query.push(columns);
    return {eq(field,value){
     recorded.query.push(field,value);
     return {async maybeSingle(){
      if(opts.getError) return {data:null,error:{message:'failure'}};
      return {data:opts.row??row,error:null};
     }};
    }};
   }};
  },
  async rpc(name,params){
   recorded.calls.push({name,params});
   if(opts.rpcError) return {data:null,error:{message:'failed'}};
   return {data:opts.rpcData??true,error:null};
  }
 };
 return {db,recorded};
}
const evidence={
 workerId:worker,keyId,counter:1,nonceHash:'b'.repeat(64),
 requiredCapability:'creative.queue.claim',projectIds:[project]
};
test('select trusted creative worker registry, never code-broker registry',async()=>{
 const {db,recorded}=fakeClient();
 const deps=makeCreativeIdentityDbAdapter(db);
 const found=await deps.registry.getWorker(worker);
 assert.deepEqual(found,{workerId:worker,keyId,publicKey:row.public_key_spki_pem,
  state:'active',creativeClaimEnabled:true,projectIds:[project]});
 assert.equal(recorded.query[0],'atlas_creative_worker_identities');
 assert.equal(await deps.registry.getWorker('../other'),null);
});
test('verified caller invokes only the P10 nonce/counter RPC',async()=>{
 const {db,recorded}=fakeClient();
 const deps=makeCreativeIdentityDbAdapter(db);
 assert.equal(await deps.store.consumeVerifiedProof(evidence),true);
 assert.equal(recorded.calls.length,1);
 assert.equal(recorded.calls[0].name,'atlas_creative_consume_worker_proof_p10');
 assert.deepEqual(recorded.calls[0].params,{
  p_worker_id:worker,p_key_id:keyId,p_counter:1,
  p_nonce_sha256:evidence.nonceHash,p_project_ids:[project]
 });
});
test('bad capability, untrusted project and malformed nonce refuse before DB',async()=>{
 const {db,recorded}=fakeClient();
 const deps=makeCreativeIdentityDbAdapter(db);
 for (const v of [
  {...evidence,requiredCapability:'code.worktree.patch'},
  {...evidence,projectIds:['familje-stunden']},
  {...evidence,projectIds:[]},
  {...evidence,projectIds:[project,project]},
  {...evidence,counter:0},
  {...evidence,nonceHash:'unsafe'},
 ]) assert.equal(await deps.store.consumeVerifiedProof(v),false);
 assert.equal(recorded.calls.length,0);
});
test('DB read failure, rejected RPC and unexpected RPC value fail closed',async()=>{
 const a=makeCreativeIdentityDbAdapter(fakeClient({getError:true}).db);
 assert.equal(await a.registry.getWorker(worker),null);
 const b=makeCreativeIdentityDbAdapter(fakeClient({rpcError:true}).db);
 assert.equal(await b.store.consumeVerifiedProof(evidence),false);
 const c=makeCreativeIdentityDbAdapter(fakeClient({rpcData:'true'}).db);
 assert.equal(await c.store.consumeVerifiedProof(evidence),false);
});
