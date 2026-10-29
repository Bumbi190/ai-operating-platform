import {test} from 'node:test'
import assert from 'node:assert/strict'
import {recognizeSource, collectVerifiedSources} from './source-collector.ts'

const NOW = Date.parse('2026-10-28T10:30:00Z')
const WIRED = 'https://www.wired.com/story/uk-home-office-may-face-investigation-over-use-of-openai-tools/'
const PARLIAMENT = 'https://questions-statements.parliament.uk/written-questions/detail/2026-06-02/5868'
const GOV = 'https://www.gov.uk/government/news/example'
const BODY = 'The inspector may investigate AI tools. Trained case workers make all asylum decisions. The use of automated summaries requires safeguards.'
const goodReader = async url => ({success:true,url,title:'Article read as plaintext',text:BODY+' Publisher: '+url})

test('reads two distinct publisher groups and generates audit receipts', async ()=>{
  const r = await collectVerifiedSources([WIRED, PARLIAMENT],goodReader,NOW)
  assert.equal(r.ok,true)
  if (!r.ok) return
  assert.equal(r.snapshots.length,2)
  assert.equal(r.snapshots[0].publisherGroup,'condenast')
  assert.equal(r.snapshots[1].kind,'primary')
  assert.equal(r.receipts[0].textSha256.length,64)
  assert.equal(r.receipts[0].characterCount,(BODY+' Publisher: '+WIRED).length)
  assert.equal(r.snapshots[0].text,BODY+' Publisher: '+WIRED)
})

test('tracking-only params canonicalize without creating another source',()=>{
  assert.equal(recognizeSource(WIRED+'?utm_source=newsletter').url,WIRED)
  assert.equal(recognizeSource(WIRED+'?next=https://127.0.0.1'),null)
})

test('refuses forged hosts, localhost, credentials, ports and redirects',()=>{
  const invalid=[
    'http://www.wired.com/story/one',
    'https://www.wired.com.evil.test/story/one',
    'https://127.0.0.1/private',
    'https://localhost/anything',
    'https://user:password@www.wired.com/story/one',
    'https://www.wired.com:8443/story/one',
    'https://www.wired.com./story/one',
    'https://evil.test@www.wired.com/story/one',
    'https://www.wired.com/story/one#fragment',
    'https://www.wired.com/story/%2e%2e/private',
    'https://www.wired.com/',
    'https://parliament.uk/government',
  ]
  for (const url of invalid) assert.equal(recognizeSource(url),null,url)
})

test('all URLs are validated before any reader call',async()=>{
  let reads=0
  const reader=async url=>{reads++;return goodReader(url)}
  const r=await collectVerifiedSources([WIRED,'https://169.254.169.254/latest/meta-data'],reader,NOW)
  assert.equal(r.ok,false)
  assert.equal(reads,0)
})

test('multiple brands under one owner count as one publisher',async()=>{
  let reads=0
  const r=await collectVerifiedSources([
    'https://www.wired.com/story/example',
    'https://arstechnica.com/ai/2026/10/another-story',
  ],async url=>{reads++;return goodReader(url)},NOW)
  assert.deepEqual(r,{ok:false,reason:'same_publisher_not_independent',snapshots:[],receipts:[]})
  assert.equal(reads,0)
})

test('rejects duplicate URLs before reading including stripped trackers',async()=>{
  let count=0
  const r=await collectVerifiedSources(
    [WIRED,WIRED+'?utm_campaign=copy'],async url=>{count++;return goodReader(url)},NOW)
  assert.equal(r.ok,false)
  assert.equal(count,0)
})

test('refuses a worker redirect even when it returns readable article text',async()=>{
  const result=await collectVerifiedSources([WIRED,PARLIAMENT],
    async url=>({...await goodReader(url),url:'https://www.gov.uk/government/private'}),NOW)
  assert.equal(result.ok,false)
  assert.equal(result.reason,'source_identity_or_body_invalid')
  assert.equal(result.snapshots.length,0)
})

test('refuses silent null, thrown worker exceptions, and malformed bodies',async()=>{
  const zero=await collectVerifiedSources([WIRED,PARLIAMENT],async()=>null,NOW)
  assert.equal(zero.ok,false)
  const boom=await collectVerifiedSources([WIRED,PARLIAMENT],async()=>{throw Error('timeout')},NOW)
  assert.equal(boom.ok,false)
  const short=await collectVerifiedSources([WIRED,PARLIAMENT],
    async url=>({...await goodReader(url),text:'Too short'}),NOW)
  assert.equal(short.ok,false)
  const huge=await collectVerifiedSources([WIRED,PARLIAMENT],
    async url=>({...await goodReader(url),text:'a'.repeat(36_001)}),NOW)
  assert.equal(huge.ok,false)
})

test('reader cannot spoof the final URL, trust group or text hash',async()=>{
  const res=await collectVerifiedSources([WIRED,GOV],goodReader,NOW)
  assert.equal(res.ok,true)
  if (!res.ok) return
  assert.equal(res.snapshots[1].publisherGroup,'uk-government')
  assert.notEqual(res.receipts[0].textSha256,'0'.repeat(64))
  assert.deepEqual(res.snapshots.map(s=>s.id),['source-0','source-1'])
})

test('refuses missing or excessive sources, invalid clock and unknown domains',async()=>{
  const urls=[WIRED, PARLIAMENT,'https://www.gov.uk/government/example',
    'https://www.reuters.com/world/example',
    'https://www.apnews.com/article/example',
    'https://www.bbc.com/news/example',
    'https://www.theverge.com/example']
  for (const [list,t] of [[[],NOW],[[WIRED],NOW],[urls,NOW],[[WIRED,PARLIAMENT],Number.NaN]]){
    assert.equal((await collectVerifiedSources(list,goodReader,t)).ok,false)
  }
})

test('snapshots and receipts are runtime immutable',async()=>{
  const res=await collectVerifiedSources([WIRED,PARLIAMENT],goodReader,NOW)
  assert.equal(res.ok,true)
  if (!res.ok) return
  assert.equal(Object.isFrozen(res.snapshots),true)
  assert.equal(Object.isFrozen(res.receipts),true)
  assert.equal(Object.isFrozen(res.snapshots[0]),true)
  assert.equal(Object.isFrozen(res.receipts[0]),true)
  assert.throws(()=>{ res.snapshots[0].text='injected claim' },TypeError)
})

test('identical syndicated content is not counted as independent corroboration',async()=>{
  const result=await collectVerifiedSources([WIRED,PARLIAMENT],
    async url=>({success:true,url,title:'Mirrored copy',text:BODY}),NOW)
  assert.deepEqual(result,{
    ok:false,reason:'duplicate_source_content',snapshots:[],receipts:[],
  })
})
