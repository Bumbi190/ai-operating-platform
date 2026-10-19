import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const voiceConfig = readFileSync(new URL('../../web/lib/voice/config.ts',import.meta.url),'utf8')
const pipeline = readFileSync(new URL('../../web/app/api/media/cron/step2/route.ts',import.meta.url),'utf8')
const preview = readFileSync(new URL('../src/compositions/ThePromptNewsPreview.tsx',import.meta.url),'utf8')
const canonical = voiceConfig.match(/VICTORIA_VOICE_ID\s*=\s*'([^']+)'/)?.[1]
const model = voiceConfig.match(/BRAND_MODEL\s*=\s*'([^']+)'/)?.[1]

assert.ok(canonical, 'Missing canonical Victoria voice ID')
assert.ok(model, 'Missing canonical news voice model')
assert.equal(canonical,'qSeXEcewz7tA0Q0qk9fH')
assert.equal(model,'eleven_turbo_v2_5')
assert.match(pipeline,/generateVoiceover\(scriptText,[\s\S]*?'victoria'/)
assert.ok(voiceConfig.includes('DEFAULT_BRAND_VOICE'))

for (const [name,anchors] of [
  ['codex',['The','But','Would']],
  ['recruiter',['So','The','If']],
]) {
  const alignment=JSON.parse(readFileSync(
    new URL('../src/compositions/data/'+name+'-captions.json',import.meta.url),'utf8'))
  assert.equal(alignment.story,name)
  assert.equal(alignment.voiceId,canonical, 'Preview must use exact production Victoria voice ID')
  assert.equal(alignment.modelId,model, 'Preview must use exact production voice model')
  assert.ok(alignment.durationSecs>15&&alignment.durationSecs<35)
  const used=alignment.words.map((w)=>w.text).join(' ')
  assert.equal(used.replace(/\s+/g,' ').trim(),alignment.text.replace(/\s+/g,' ').trim())
  const starts=anchors.map((word)=>{
    const match=alignment.words.find((w)=>w.text===word)
    assert.ok(match,'Required scene start cue '+word+' missing in '+name)
    return match.startMs
  })
  const defined=[0,...starts].join(',')
  assert.ok(preview.includes('starts:['+defined+']'),
    'Scene timing must follow actual Victoria speech: '+name+' expected '+defined)
  assert.ok(preview.includes("the-prompt-qa/"+name+".mp3"))
}
assert.match(preview,/PRIVATE REVIEW \/ NOT FOR POSTING/)
console.log('PASS: both preview voice IDs/models match production Victoria; real transcript and cuts bound to new timing.')
