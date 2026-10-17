import {test} from 'node:test'
import assert from 'node:assert/strict'
import codex from '../src/compositions/data/codex-captions.json'
import recruiter from '../src/compositions/data/recruiter-captions.json'
import {activeWordIndex,captionAtTime,groupNarrationWords} from '../src/lib/news-captions'

for(const item of [codex,recruiter]){
  test(item.story+': exact transcribed words, readable chunks, non-overlapping active intervals',()=>{
    const captions=groupNarrationWords(item.words)
    assert.ok(captions.length>7)
    assert.ok(captions.length<35)
    assert.equal(captions.flatMap(c=>c.words).map(w=>w.text).join(' '),
      item.words.map(w=>w.text).join(' '))
    for(const [i,g] of captions.entries()){
      assert.ok(g.words.length<=6)
      assert.ok(g.words.length>0)
      assert.ok(g.endMs>g.startMs)
      if(i) assert.ok(g.startMs>=captions[i-1].endMs)
    }
    assert.equal(captionAtTime(captions,-1),null)
    assert.equal(captionAtTime(captions,0)?.words[0].text,item.words[0].text)
    assert.equal(captionAtTime(captions,item.durationSecs*1000+100),null)
    const a=captions[1]
    assert.equal(activeWordIndex(a,a.words[0].startMs),0)
    assert.equal(activeWordIndex(a,a.words.at(-1)!.startMs),a.words.length-1)
    console.log(item.story, 'caption groups:',captions.length)
  })
  test(item.story+': only source transcription and valid canonical timing',()=>{
    assert.equal(item.text.replace(/\s+/g,' ').trim(),
      item.words.map(w=>w.text).join(' ').replace(/\s+/g,' ').trim())
    assert.ok(item.words.every(w=>w.startMs>=0&&w.endMs>w.startMs))
    assert.ok(item.words.at(-1)!.endMs<=item.durationSecs*1000+100)
  })
}
