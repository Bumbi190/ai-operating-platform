import {describe,it,expect,vi} from 'vitest'
import {generateKeyPairSync,createHash} from 'node:crypto'
import {createMailboxHostApi} from '@/lib/sales/mailbox/host-api'
const projectId='10000000-0000-4000-8000-000000000001',workerId='60000000-0000-4000-8000-000000000001',ownerId='20000000-0000-4000-8000-000000000001',setupId='70000000-0000-4000-8000-000000000001',claimId='90000000-0000-4000-8000-000000000001'
const {publicKey}=generateKeyPairSync('rsa',{modulusLength:3072,publicExponent:65537}),jwk=publicKey.export({format:'jwk'}),kid=createHash('sha256').update(publicKey.export({format:'der',type:'spki'})).digest('hex')
function setup(){const rpc=vi.fn(async(name:string,_args?:unknown)=>({data:name==='sales_host_identity'?{projectId,workerId,ownerId,generation:1}:{setup:null},error:null}));return {rpc,api:createMailboxHostApi({db:()=>({rpc} as never),enabled:()=>true})}}
const req=(body:unknown)=>new Request('https://omnira.example/api/sales/mailbox/host',{method:'POST',headers:{authorization:'Bearer '+'x'.repeat(43)},body:JSON.stringify(body)})
describe('bounded mailbox host operations',()=>{
 it('publishes the exact RSA3072 public key bound to manager identity',async()=>{const {api,rpc}=setup();expect((await api(req({operation:'publish_key',generation:1,kid,jwk}))).status).toBe(200);expect(rpc.mock.calls[0][0]).toBe('sales_host_identity');expect(rpc.mock.calls[1][0]).toBe('sales_mailbox_publish_key')})
 it.each([{...jwk,d:'PRIVATE'},{...jwk,n:'AQAB'},{...jwk,e:'Aw'}])('rejects private or wrong-strength keys %j',async key=>{const {api,rpc}=setup();expect((await api(req({operation:'publish_key',generation:1,kid,jwk:key}))).status).toBe(400);expect(rpc).not.toHaveBeenCalled()})
 it('rejects a swapped kid',async()=>expect((await setup().api(req({operation:'publish_key',generation:1,kid:'0'.repeat(64),jwk}))).status).toBe(400))
 it('claims only for the authenticated host without supplied project',async()=>{const {api,rpc}=setup();expect((await api(req({operation:'claim_setup'}))).status).toBe(200);expect((await api(req({operation:'claim_setup',projectId}))).status).toBe(400);expect(rpc.mock.calls[1][1]).toEqual({p_token_hash:expect.any(String),p_input:{}})})
 it('rejects credentials or raw exceptions in a receipt',async()=>{const {api}=setup();for(const extra of [{password:'CANARY'},{error:'raw exception'}])expect((await api(req({operation:'commit_probe',setupId,claimId,hostGeneration:1,mailboxGeneration:1,receipt:{smtpAuthenticatedAt:null,imapAuthenticatedAt:null,localStored:false,reasonCode:'AUTH_FAILED',...extra}}))).status).toBe(400)})
 it('refuses wrong-purpose, revoked or owner-changed credentials',async()=>{const {api,rpc}=setup();rpc.mockResolvedValue({data:null as never,error:{code:'P0002'} as never});expect((await api(req({operation:'claim_setup'}))).status).toBe(404)})
})
