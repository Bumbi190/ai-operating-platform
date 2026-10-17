import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {Script} from 'node:vm'

const root=new URL('../src/compositions/ThePromptNewsPreview.tsx',import.meta.url)
const review=new URL('../scripts/mobile-review.html',import.meta.url)
const server=new URL('../scripts/mobile-review-server.mjs',import.meta.url)
const remotion=readFileSync(root,'utf8')
const html=readFileSync(review,'utf8')
const service=readFileSync(server,'utf8')

test('new Remotion layouts reject central explainer cards while preserving narration and captions',()=>{
  assert.doesNotMatch(remotion,/EditorialDiagram|EXPLAINER VISUAL|<SurfaceCard/)
  assert.match(remotion,/TimedCaptions/)
  assert.match(remotion,/groupNarrationWords/)
  assert.match(remotion,/PRIVATE REVIEW \/ NOT FOR POSTING/)
  assert.match(remotion,/p\.starts/)
  assert.match(remotion,/p\.audio/)
  assert.match(remotion,/THE <span/)
})

test('read-only mobile review uses the actual Victoria manifests and story cut times',()=>{
  assert.match(service,/qSeXEcewz7tA0Q0qk9fH/)
  assert.match(service,/eleven_turbo_v2_5/)
  const captionData=['codex','recruiter'].map(name=>JSON.parse(readFileSync(
    new URL('../src/compositions/data/'+name+'-captions.json',import.meta.url),'utf8')))
  for(const m of captionData){
    assert.equal(m.voiceId,'qSeXEcewz7tA0Q0qk9fH')
    assert.equal(m.modelId,'eleven_turbo_v2_5')
    assert(m.words.length>45)
  }
  for(const line of [
    '[0,5329,10089,17519]','[0,3541,10716,17206]',
  ])assert(remotion.includes('starts:'+line)&&service.includes('starts:'+line))
})

test('mobile controls are word-wrapped, not separate flex children that overflow',()=>{
  assert(html.includes('<div id="caption-text"></div>'))
  assert(html.includes("captions=get('caption-text')"))
  assert(html.includes("document.createTextNode(' ')"))
  assert(html.includes('width:100%;white-space:normal;overflow-wrap:break-word'))
  assert(!html.includes('EXPLAINER VISUAL'))
  assert(!html.includes('editorial diagram'))
  assert(html.includes('aria-label="Seek narration"'))
  const inline=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1]
  assert(inline)
  assert.doesNotThrow(()=>new Script(inline,{filename:'mobile-review-player.js'}))
})

test('private mobile server rejects public binds, limits its endpoints, and never publishes',()=>{
  assert(service.includes("if(!host||!privateIpv4(host)"))
  assert(service.includes("if(req.headers.host!==host+':'+port)"))
  assert(service.includes("if(!['GET','HEAD'].includes(req.method))"))
  assert(service.includes("if(!files.has(filename))"))
  assert(service.includes("createReadStream(join(MEDIA,filename)"))
  assert(service.includes("randomBytes(24)"))
  assert(service.includes("if(!/^[a-f0-9]{48}$/.test(token))"))
  assert(service.includes("'content-range'"))
  assert(!service.includes('service_role'))
  assert(!service.includes('publishReel('))
  assert(!service.includes('createSignedUploadUrl'))
})
