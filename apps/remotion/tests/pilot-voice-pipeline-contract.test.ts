import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const code=readFileSync(new URL('../../web/app/api/media/cron/step2/route.ts',import.meta.url),'utf8')
test('receipt is tied to exact returned Victoria bytes, text and timestamps',()=>{
  assert.match(code,/generateVoiceover\(scriptText,[\s\S]*?'victoria'/)
  assert.match(code,/buildPilotVoiceReceipt\(\s*scriptText,voiceResult.audioBuffer,voiceResult.words,voiceResult.durationMs\)/)
  assert.match(code,/script\.raw_output/)
  assert.match(code,/if\(strictPilot\)\{/)
  assert.match(code,/if\(receiptError\|\|!receiptRow\)throw new Error\('PILOT_VOICE_RECEIPT_NOT_PERSISTED'\)/)
})
test('receipt is strictly OFF by default and legacy rendering remains SimpleNewsReel',()=>{
  assert.match(code,/const strictPilot=process.env.THE_PROMPT_FRESH_NEWS_PILOT === 'true'/)
  assert.match(code,/\.\.\.\(strictPilot\?\{raw_output:\{/)
  assert.match(code,/composition:  'SimpleNewsReel'/)
  assert.match(code,/voice_status: 'ready'/)
})
test('voice receipt is only updated alongside uploaded audio and inside project boundary',()=>{
  assert.match(code,/const \[audioUrl, timingUrl, \.\.\.storedImageUrls\] = await Promise\.all/)
  assert.match(code,/\.update\(update\)[\s\S]*?\.eq\('id',script.id\)\.eq\('project_id',projectId\)/)
  assert(!code.includes('THE_PROMPT_PREVIEW_TOKEN'))
})
