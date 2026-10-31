import {it,expect,vi} from 'vitest'
import {createDiscoveryApi} from '../sales/discovery/api'
import {SalesError} from '../sales/types'

const pid='10000000-0000-4000-8000-000000000001',uid='20000000-0000-4000-8000-000000000001',cid='30000000-0000-4000-8000-000000000001',bid='40000000-0000-4000-8000-000000000001',key='50000000-0000-4000-8000-000000000001'
const principal={ok:true as const,userId:uid,allowedProjectIds:[pid]},url='https://fixture.invalid/api/sales/discovery'
const query={city:'stockholm',category:'car_dealer',radiusKm:5,limit:20}
const source={sourceId:'node/1',sourceUrl:'https://www.openstreetmap.org/node/1',name:'Synthetic Business AB',websiteUrl:'https://business.example.com/',email:'public@business.example.com'}
const candidate={...source,id:cid,projectId:pid,version:1,status:'needs_review',exclusions:[],historyCoverage:'partial',outreachReady:false}
const report={projectId:pid,batch:null,batches:[],candidates:[],historyCoverage:'partial',customerSendingEnabled:false}
const discoverInput={operation:'discover',projectId:pid,idempotencyKey:key,query}
const promoteInput={operation:'promote',projectId:pid,candidateId:cid,expectedVersion:1,companyName:source.name,branchName:'',email:'verified@business.example.com',websiteUrl:source.websiteUrl,reviewNote:'Independently verified business and recipient.',businessConfirmed:true,emailConfirmed:true,offerKind:'general_service',pilotMonths:null}
function setup(options:{replay?:boolean;rateLimited?:boolean;blocked?:boolean;disabled?:boolean;dbError?:boolean;finishError?:boolean;failError?:boolean;providerError?:Error}={}){
 const rpc=vi.fn(async(name:string,_args:Record<string,unknown>)=>({data:name==='sales_discovery_begin'?{batchId:bid,fetchRequired:!options.replay,rateLimited:options.rateLimited}:name==='sales_discovery_read'?report:name==='sales_discovery_candidate'?candidate:name==='sales_discovery_promote'?(options.blocked?{state:'blocked',reasons:['suppressed']}:{state:'promoted',contactId:cid,history:'unknown'}):{batchId:bid},error:options.dbError||(options.finishError&&name==='sales_discovery_finish')||(options.failError&&name==='sales_discovery_fail')?{code:'XX000'}:null}))
 const discover=vi.fn(async()=>{if(options.providerError)throw options.providerError;return {candidates:[source],retrievedAt:'2026-10-31T12:00:00.000Z'}})
 const api=createDiscoveryApi({access:async()=>principal,db:()=>({rpc} as never),enabled:()=>!options.disabled,discover})
 return {rpc,discover,api}
}
function post(value:unknown,origin=true){return new Request(url,{method:'POST',headers:origin?{origin:'https://fixture.invalid'}:{},body:JSON.stringify(value)})}
it('GET is read-only and explicitly preserves partial history',async()=>{
 const {api,rpc,discover}=setup(),r=await api(new Request(url+'?projectId='+pid))
 expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(await r.json()).toEqual(report)
 expect(rpc.mock.calls.map(c=>c[0])).toEqual(['sales_discovery_read']);expect(discover).not.toHaveBeenCalled()
})
it.each(['&projectId='+pid,'&url=https://attacker.example.com','&batchId='+bid+'&batchId='+bid])('rejects ambiguous GET %s',async extra=>{
 const {api,rpc}=setup();expect((await api(new Request(url+'?projectId='+pid+extra))).status).toBe(400);expect(rpc).not.toHaveBeenCalled()
})
it('requires same-origin writes before any database or provider call',async()=>{
 const {api,rpc,discover}=setup();expect((await api(post(discoverInput,false))).status).toBe(403);expect(rpc).not.toHaveBeenCalled();expect(discover).not.toHaveBeenCalled()
})
it.each([{...discoverInput,projectId:cid},{...discoverInput,url:'https://attacker.example.com'},{...discoverInput,query:{...query,radiusKm:1000}},{...discoverInput,operation:'send'}])('denies foreign, unbounded and unsupported mutations before provider access',async input=>{
 const {api,rpc,discover}=setup();expect((await api(post(input))).status).not.toBe(200);expect(rpc).not.toHaveBeenCalled();expect(discover).not.toHaveBeenCalled()
})
it('feature gating precedes admission and provider calls',async()=>{
 const {api,rpc,discover}=setup({disabled:true});expect((await api(post(discoverInput))).status).toBe(404);expect(rpc).not.toHaveBeenCalled();expect(discover).not.toHaveBeenCalled()
})
it('one admitted finite search persists safe candidates and reads the result',async()=>{
 const {api,rpc,discover}=setup();expect((await api(post(discoverInput))).status).toBe(200)
 expect(discover).toHaveBeenCalledTimes(1);expect(discover).toHaveBeenCalledWith(query)
 expect(rpc.mock.calls.map(c=>c[0])).toEqual(['sales_discovery_begin','sales_discovery_finish','sales_discovery_read'])
 const input=rpc.mock.calls[1][1].p_input as Record<string,unknown>
 expect(input).toMatchObject({projectId:pid,batchId:bid,candidates:[{...source,exclusions:[]}]});expect(JSON.stringify(input)).not.toContain('confirmed')
})
it('idempotent admission never repeats a provider request',async()=>{
 const {api,rpc,discover}=setup({replay:true});expect((await api(post(discoverInput))).status).toBe(200);expect(discover).not.toHaveBeenCalled();expect(rpc.mock.calls.map(c=>c[0])).toEqual(['sales_discovery_begin','sales_discovery_read'])
})
it('database rate admission stops external calls',async()=>{
 const {api,rpc,discover}=setup({rateLimited:true});expect((await api(post(discoverInput))).status).toBe(429);expect(discover).not.toHaveBeenCalled();expect(rpc.mock.calls.map(c=>c[0])).toEqual(['sales_discovery_begin'])
})
it('provider 429 persists a bounded safe error and is surfaced as 429',async()=>{
 const {api,rpc}=setup({providerError:new SalesError('DISCOVERY_RATE_LIMITED',429)}),r=await api(post(discoverInput))
 expect(r.status).toBe(429);expect(await r.json()).toEqual({code:'DISCOVERY_RATE_LIMITED'})
 expect(rpc.mock.calls.map(c=>c[0])).toEqual(['sales_discovery_begin','sales_discovery_fail'])
 expect(rpc.mock.calls[1][1].p_input).toEqual({projectId:pid,batchId:bid,errorCode:'DISCOVERY_RATE_LIMITED'})
})
it('successful provider data followed by storage failure closes the pending batch honestly',async()=>{
 const {api,rpc,discover}=setup({finishError:true}),r=await api(post(discoverInput))
 expect(r.status).toBe(503);expect(await r.json()).toEqual({code:'DISCOVERY_STORE_UNAVAILABLE'})
 expect(discover).toHaveBeenCalledTimes(1)
 expect(rpc.mock.calls.map(c=>c[0])).toEqual(['sales_discovery_begin','sales_discovery_finish','sales_discovery_fail'])
 expect(rpc.mock.calls[2][1].p_input).toEqual({projectId:pid,batchId:bid,errorCode:'DISCOVERY_STORE_UNAVAILABLE'})
})
it('an unavailable error recorder returns storage uncertainty without retrying the provider',async()=>{
 const {api,rpc,discover}=setup({providerError:new SalesError('DISCOVERY_RATE_LIMITED',429),failError:true}),r=await api(post(discoverInput))
 expect(r.status).toBe(503);expect(await r.json()).toEqual({code:'DISCOVERY_STORE_UNAVAILABLE'})
 expect(discover).toHaveBeenCalledTimes(1);expect(rpc.mock.calls.map(c=>c[0])).toEqual(['sales_discovery_begin','sales_discovery_fail'])
})
it.each([{...promoteInput,emailConfirmed:false},{...promoteInput,businessConfirmed:false},{...promoteInput,history:'not_contacted'},{...promoteInput,confirmed:true}])('rejects promotion confirmation/history bypasses',async input=>{
 const {api,rpc}=setup();expect((await api(post(input))).status).toBe(400);expect(rpc).not.toHaveBeenCalled()
})
it('manual promotion uses only the atomic promotion RPC with freshly computed baseline reasons',async()=>{
 const {api,rpc,discover}=setup(),r=await api(post(promoteInput));expect(r.status).toBe(200);expect(await r.json()).toMatchObject({state:'promoted',history:'unknown'})
 expect(rpc.mock.calls.map(c=>c[0])).toEqual(['sales_discovery_candidate','sales_discovery_promote'])
 expect(rpc.mock.calls[1][1].p_input).toMatchObject({businessConfirmed:true,emailConfirmed:true,offerKind:'general_service',pilotMonths:null,baselineReasons:[]});expect(discover).not.toHaveBeenCalled()
})
it('new suppression returns review conflict without an ordinary contact mutation',async()=>{
 const {api,rpc}=setup({blocked:true}),r=await api(post(promoteInput));expect(r.status).toBe(409);expect(await r.json()).toEqual({code:'DISCOVERY_REVIEW_BLOCKED',reasons:['suppressed']});expect(rpc.mock.calls.map(c=>c[0])).not.toContain('sales_save_contact')
})
it('database read failure stays unavailable rather than an empty success',async()=>{
 const {api}=setup({dbError:true});expect((await api(new Request(url+'?projectId='+pid))).status).toBe(503)
})
