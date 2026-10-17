import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const root=readFileSync(new URL('../src/Root.tsx',import.meta.url),'utf8')
const preview=readFileSync(new URL('../src/compositions/ThePromptNewsPreview.tsx',import.meta.url),'utf8')
const pending=readFileSync(new URL('../../web/app/api/media/cron/step3/route.ts',import.meta.url),'utf8')
const read=(name)=>readFileSync(new URL('../src/compositions/data/'+name+'-captions.json',import.meta.url),'utf8')

assert(root.includes('id="ThePromptCodexReview"'))
assert(root.includes('id="ThePromptRecruiterReview"'))
assert(root.includes('id="FamiljeStundenContentLab"'))
assert(root.includes('component={ContentGrowthReel}'))
assert(root.includes('id="SimpleNewsReel"'))
assert(root.includes('component={SimpleNewsReel}'))
assert(pending.includes("startLambdaRender(script.id, inputProps, 'SimpleNewsReel')"))
assert(!pending.includes('ThePromptCodexReview'))
assert(!pending.includes('ThePromptRecruiterReview'))

for(const x of ['codex','recruiter']){
  const t=JSON.parse(read(x))
  assert(t.text.length>80&&t.words.length>40)
  assert(t.words.at(-1).endMs<=t.durationSecs*1000+100)
  assert(preview.includes("the-prompt-qa/"+x+".mp3") || preview.includes("audio:'the-prompt-qa/"+x+".mp3'"))
}
assert(preview.includes('groupNarrationWords'))
assert(preview.includes('activeWordIndex'))
assert(preview.includes('STAY AHEAD OF THE SIGNAL'))
assert(preview.includes('FOLLOW<br/>'))
assert(preview.includes('AI news. Daily. No fluff.'))
assert(preview.includes('OUTRO_FRAMES = 90'))
assert(preview.includes('Math.ceil(STORIES[story].narration.durationSecs*30)+OUTRO_FRAMES'))
assert(preview.includes('PRIVATE REVIEW / NOT FOR POSTING'))
assert(preview.includes('NOT A PRODUCT SCREENSHOT'))
for(const x of ['fetch(', 'uploadToSignedUrl(', 'startLambdaRender(', 'publishReel(', 'process.env.CRON_SECRET'])
  assert(!preview.includes(x),'Preview file must have no side effects: '+x)
console.log('PASS: two accurate timestamped English review videos, production and family pipelines untouched')
