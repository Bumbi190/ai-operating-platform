import {test} from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './source-collector' &&
        context.parentURL?.includes('/factcheck/')) {
      return nextResolve(specifier+'.ts',context)
    }
    return nextResolve(specifier,context)
  },
})

const {
  isPublicIpv4, selectPinnedPublicIpv4, createPinnedReaderForOfflineTests,
} = await import('./safe-https-reader.ts')

const WIRED = 'https://www.wired.com/story/uk-home-office-may-face-investigation-over-use-of-openai-tools/'
const signal = new AbortController().signal
const TEXT = 'The regulator may open a review. No investigation is confirmed yet. Humans make asylum decisions, and AI is used only as a research tool in the quoted report.'
const bytes = new TextEncoder().encode(TEXT)
const okResponse = {status:200,contentType:'text/plain; charset=utf-8',contentEncoding:'',body:bytes}
const publicRecords = [{family:4,address:'151.101.65.55'}]
const resolve = async host => publicRecords
const transport = async (_url,_ip,_signal)=>okResponse

test('allows ordinary global IPv4 but rejects internal and special-use addresses',()=>{
  for (const ip of ['1.1.1.1','8.8.8.8','151.101.65.55','93.184.216.34']) {
    assert.equal(isPublicIpv4(ip),true,ip)
  }
  for (const ip of [
    '127.0.0.1','10.0.0.1','172.16.0.1','172.31.255.1',
    '192.168.0.1','169.254.169.254','100.64.0.1','100.127.255.255',
    '0.0.0.0','192.0.0.5','192.0.2.1','198.18.0.1','198.51.100.4',
    '203.0.113.2','224.0.0.1','240.0.0.1','255.255.255.255',
    '192.88.99.1','::1','::ffff:127.0.0.1','garbage'
  ]) {
    assert.equal(isPublicIpv4(ip),false,ip)
  }
})

test('pins the validated first public A record and disallows mixed private A',()=>{
  assert.equal(selectPinnedPublicIpv4(publicRecords),'151.101.65.55')
  assert.equal(selectPinnedPublicIpv4([
    {family:6,address:'2606:4700:4700::1111'},...publicRecords,
  ]),'151.101.65.55')
  assert.equal(selectPinnedPublicIpv4([
    ...publicRecords,{family:4,address:'10.0.0.1'},
  ]),null)
  assert.equal(selectPinnedPublicIpv4([{family:6,address:'2606:4700:4700::1111'}]),null)
  assert.equal(selectPinnedPublicIpv4([]),null)
  assert.equal(selectPinnedPublicIpv4([{family:4,address:'not-a-number'}]),null)
})

test('normal fixture returns readable primary URL and exactly pinned socket target',async()=>{
  const calls=[]
  const reader=createPinnedReaderForOfflineTests(
    async host=>{calls.push(['dns',host]);return publicRecords},
    async (url,ip,sourceSignal)=>{
      calls.push(['socket',url.hostname,ip,sourceSignal===signal])
      return okResponse
    },
  )
  const result=await reader(WIRED,signal)
  assert.deepEqual(result,{success:true,url:WIRED,title:'Source text',text:TEXT})
  assert.deepEqual(calls,[['dns','www.wired.com'],
    ['socket','www.wired.com','151.101.65.55',true]])
})

test('unapproved URL is rejected without any DNS or network call',async()=>{
  let calls=0
  const reader=createPinnedReaderForOfflineTests(
    async()=>{calls++;return publicRecords},
    async()=>{calls++;return okResponse},
  )
  assert.equal(await reader('https://127.0.0.1/internal',signal),null)
  assert.equal(await reader('https://www.wired.com.evil.test/story/1',signal),null)
  assert.equal(calls,0)
})

test('DNS poisoning (private A) refuses before transport',async()=>{
  let sent=0
  const reader=createPinnedReaderForOfflineTests(
    async()=>[...publicRecords,{family:4,address:'169.254.169.254'}],
    async()=>{sent++;return okResponse},
  )
  assert.equal(await reader(WIRED,signal),null)
  assert.equal(sent,0)
})

test('redirect responses, plain HTTP errors and gzip are not followed or decoded',async()=>{
  for (const value of [
    {...okResponse,status:302},
    {...okResponse,status:404},
    {...okResponse,contentEncoding:'gzip'},
    {...okResponse,contentDisposition:'attachment; filename="news.html"'},
  ]) {
    const reader=createPinnedReaderForOfflineTests(resolve,async()=>value)
    assert.equal(await reader(WIRED,signal),null)
  }
})

test('refuses binary and unsupported character set; fails closed',async()=>{
  for (const value of [
    {...okResponse,contentType:'application/pdf'},
    {...okResponse,contentType:'text/plain; charset=iso-8859-1'},
    {...okResponse,body:new Uint8Array([0xc3,0x28,0x28,0x28])},
  ]) {
    const reader=createPinnedReaderForOfflineTests(resolve,async()=>value)
    assert.equal(await reader(WIRED,signal),null)
  }
})

test('raw body and extracted text caps are enforced',async()=>{
  const huge=createPinnedReaderForOfflineTests(resolve,async()=>({...okResponse,
    body:new Uint8Array(240001)}))
  assert.equal(await huge(WIRED,signal),null)
  const largeText=createPinnedReaderForOfflineTests(resolve,async()=>({...okResponse,
    body:new TextEncoder().encode('a'.repeat(36001))}))
  assert.equal(await largeText(WIRED,signal),null)
})

test('aborted tasks refuse to call resolver or transfer',async()=>{
  let attempts=0
  const stopped=new AbortController()
  stopped.abort()
  const reader=createPinnedReaderForOfflineTests(
    async()=>{attempts++;return publicRecords},
    async()=>{attempts++;return okResponse},
  )
  assert.equal(await reader(WIRED,stopped.signal),null)
  assert.equal(attempts,0)
})

test('a network failure, DNS exception or incomplete page fails closed',async()=>{
  const notFound=createPinnedReaderForOfflineTests(
    async()=>{throw new Error('DNS timeout')},transport)
  assert.equal(await notFound(WIRED,signal),null)
  const failed=createPinnedReaderForOfflineTests(
    resolve,async()=>{throw new Error('TLS failure')})
  assert.equal(await failed(WIRED,signal),null)
  const short=createPinnedReaderForOfflineTests(resolve,async()=>({...okResponse,
    body:new TextEncoder().encode('short')}))
  assert.equal(await short(WIRED,signal),null)
})

test('real HTTPS implementation is TLS-verified and pins only IPv4 sockets',async()=>{
  const {readFileSync}=await import('node:fs')
  const source=readFileSync(new URL('./safe-https-reader.ts',import.meta.url),'utf8')
  assert.match(source,/family:\s*4/)
  assert.match(source,/autoSelectFamily:\s*false/)
  assert.match(source,/servername:\s*url\.hostname/)
  assert.match(source,/rejectUnauthorized:\s*true/)
  assert.match(source,/lookup:\s*\(hostname,\s*_opts,\s*callback\)/)
  assert.match(source,/pinnedIpv4,\s*4/)
  assert.doesNotMatch(source,/redirect:\s*['"]follow['"]/)
})
