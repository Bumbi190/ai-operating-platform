import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
registerHooks({
  resolve(specifier, context, next) {
    if (specifier==='server-only') return {url:'data:text/javascript,export {}',shortCircuit:true}
    if (specifier==='./posthog-approved-read') return {
      url:'data:text/javascript,'+encodeURIComponent(`
        export async function prepareApprovedPosthogRead(input){globalThis.__phHttp.calls.push(input);return {enabled:false}}
        export async function readApprovedPosthogDashboards(input){
          globalThis.__phHttp.calls.push(input)
          if(globalThis.__phHttp.error)throw globalThis.__phHttp.error
          return {dashboards:[{id:1,name:'Pilot'}]}
        }`),shortCircuit:true,
    }
    return next(specifier,context)
  },
})
const { approvedPosthogGET,approvedPosthogPOST }=await import('../atlas/capability/posthog-approved-http.ts')
const url='https://omnira.test/api/analytics/posthog/dashboards'
const request=(body='{}',headers={})=>new Request(url,{method:'POST',headers:{origin:'https://omnira.test','content-type':'application/json',...headers},body})
test.beforeEach(()=>{globalThis.__phHttp={calls:[],error:null}})
test('GET only prepares target, with no-store response',async()=>{
  const response=await approvedPosthogGET(new Request(url+'?projectId=p1'))
  assert.equal(response.status,200)
  assert.equal(response.headers.get('cache-control'),'no-store')
  assert.deepEqual(globalThis.__phHttp.calls,[{projectId:'p1'}])
})
test('POST delegates parsed selectors to the single approved service',async()=>{
  const response=await approvedPosthogPOST(request('{"projectId":"p1","authorizationId":"a1","expectedVersionHash":"h1"}'))
  assert.equal(response.status,200)
  assert.deepEqual(await response.json(),{dashboards:[{id:1,name:'Pilot'}]})
})
test('cross-origin and missing-origin POSTs never reach service',async()=>{
  for(const headers of [{origin:'https://evil.test'},{origin:''}]){
    assert.equal((await approvedPosthogPOST(request('{}',headers))).status,403)
  }
  assert.equal(globalThis.__phHttp.calls.length,0)
})
test('malformed or oversized JSON is refused before service call',async()=>{
  assert.equal((await approvedPosthogPOST(request('{broken'))).status,400)
  assert.equal((await approvedPosthogPOST(request('"'+ 'x'.repeat(5000)+'"'))).status,400)
  assert.equal(globalThis.__phHttp.calls.length,0)
})
test('private exceptions are hidden; known denial codes preserve HTTP meaning',async()=>{
  for(const [message,status]of [['SECRET DATABASE URL',500],['posthog_unauthorized',401],['posthog_read_rate_limited',429],['posthog_read_not_authorized',403],['posthog_approved_read_disabled',503]]){
    globalThis.__phHttp.error=new Error(message)
    const response=await approvedPosthogPOST(request())
    assert.equal(response.status,status)
    assert.ok(!(await response.text()).includes('SECRET'))
  }
})

test('JSON-like content types are not accepted as application/json',async()=>{
  const response=await approvedPosthogPOST(request('{}',{'content-type':'application/jsonp'}))
  assert.equal(response.status,415)
  assert.equal(globalThis.__phHttp.calls.length,0)
})
