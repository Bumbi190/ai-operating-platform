import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const reader=readFileSync(new URL('../../web/lib/media/daily-pilot-readiness-reader.ts',import.meta.url),'utf8')
test('readiness loader strictly requires current owner, live project and lifecycle',()=>{
  assert.match(reader,/assertProjectAllowed\(projectId,owner.allowedProjectIds\)/)
  assert.match(reader,/eq\('owner_id',owner.userId\)/)
  assert.match(reader,/eq\('execution_paused',false\)/)
  assert.match(reader,/lifecycle\.state!=='active'/)
})
test('all script and source lookups are scoped to identical project and exact IDs',()=>{
  assert.match(reader,/eq\('id',scriptId\)\.eq\('project_id',projectId\)/)
  assert.match(reader,/eq\('id',script.news_item_id\)\.eq\('project_id',projectId\)/)
  assert.match(reader,/if\(script.project_id!==projectId\)/)
})
test('readiness inspection performs no writes, provider calls, image retrieval or dispatch',()=>{
  for(const forbidden of [
    '.insert(','.upsert(','.update(','.delete(','startLambdaRender(',
    'publishContainer(', 'generateVoiceover(', 'uploadSceneImage(',
  ])assert.equal(reader.includes(forbidden),false,'Forbidden operation '+forbidden)
  assert.match(reader,/assessPersistedDailyPilot/)
  assert(!reader.includes('video_url'))
})
