import {test} from 'node:test'
import assert from 'node:assert/strict'
import {planThePromptTrial} from '../../web/lib/media/the-prompt-trial-plan'

test('14 intended slots, exactly 2 per date, same Swedish 10/20 clock',()=>{
 const p=planThePromptTrial('2026-10-19')
 assert.equal(p.expectedPosts,14)
 assert.equal(p.slots.length,14)
 assert.equal(p.startLocalDate,'2026-10-19')
 assert.equal(p.endLocalDate,'2026-10-25')
 assert.equal(new Set(p.slots.map(x=>x.localDate)).size,7)
 const counts=new Map<string,number>()
 for(const s of p.slots){
  counts.set(s.localDate,(counts.get(s.localDate)??0)+1)
  assert.equal(s.approvalRequired,true)
  assert(['10:00','20:00'].includes(s.localTime))
 }
 assert([...counts.values()].every(n=>n===2))
})
test('formats counterbalance 10 and 20 without additional posts',()=>{
 const {slots}=planThePromptTrial('2026-10-19')
 assert.equal(slots.filter(s=>s.variant==='text_motion').length,7)
 assert.equal(slots.filter(s=>s.variant==='story_visual').length,7)
 for(let day=0;day<7;day++){
  const two=slots.filter(s=>s.dayIndex===day)
  assert.deepEqual(two.map(s=>s.localTime),['10:00','20:00'])
  assert.notEqual(two[0].variant,two[1].variant)
 }
})
test('local wall-clock remains explicit across Sweden DST date',()=>{
 const {slots}=planThePromptTrial('2026-10-23')
 const dates=slots.map(s=>s.localDate)
 assert(dates.includes('2026-10-25'))
 assert.equal(slots.filter(s=>s.localDate==='2026-10-25').length,2)
 assert.deepEqual(slots.filter(s=>s.localDate==='2026-10-25').map(s=>s.localTime),['10:00','20:00'])
})
test('rejects invalid dates; does not silently choose a live starting day',()=>{
 for(const v of ['tomorrow','2026-02-30','2026-13-01','2026-2-5','']){
  assert.throws(()=>planThePromptTrial(v))
 }
})
test('planned slots stay explicitly unapproved and not publish commands',()=>{
 const p=planThePromptTrial('2026-10-19')
 assert.equal(p.slots.every(s=>s.approvalRequired),true)
 assert(p.warnings.some(w=>w.includes('exploratory')))
 assert(p.warnings.some(w=>w.includes('Never add a third')))
})
