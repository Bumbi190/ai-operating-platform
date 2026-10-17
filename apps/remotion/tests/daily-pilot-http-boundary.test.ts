import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const route=readFileSync(new URL('../../web/app/api/media/pilot/readiness/route.ts',import.meta.url),'utf8')
test('private readiness endpoint requires an authenticated project owner before admin client',()=>{
  assert.match(route,/const access=await resolveProjectAccess\(\)/)
  assert.match(route,/if\(!access.ok\)/)
  assert(route.indexOf('if(!access.ok)')<route.indexOf('createAdminClient()'))
  assert.match(route,/inspectDailyPilotScript\(createAdminClient\(\),access,projectId,scriptId\)/)
})
test('allow only exact projectId + scriptId; nonpub query gets 400',()=>{
  assert.match(route,/params\.keys\(\)\]\.sort\(\)\.join\(','\)!=='projectId,scriptId'/)
  assert.match(route,/getAll\('projectId'\)\.length!==1/)
  assert.match(route,/getAll\('scriptId'\)\.length!==1/)
  assert.match(route,/!UUID\.test\(projectId\)\|\|!UUID\.test\(scriptId\)/)
})
test('no video files, source URLs, provider secrets or publish commands returned',()=>{
  assert.match(route,/private, no-store/)
  assert.match(route,/Audit temporarily unavailable/)
  for(const bad of ['audio_url','timing_url','media_news_items','publisherToken','startLambdaRender','fetch(','POST(','publish('])
    assert(!route.includes(bad),'unexpected write/exposure '+bad)
  assert.match(route,/status:404/)
  assert.match(route,/status:503/)
})
