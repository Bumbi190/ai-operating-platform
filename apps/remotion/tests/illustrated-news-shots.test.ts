import {test} from 'node:test'
import assert from 'node:assert/strict'
import {planIllustratedNewsShots} from '../../web/lib/media/illustrated-news-shots'
import {getIllustratedShotAt} from '../src/lib/illustrated-shots'
const words=(n:number,step:number)=>Array.from({length:n},(_,i)=>({word:'word'+i,startMs:i*step,endMs:i*step+step-40}))
test('different real transcripts produce different monotonic shot timelines for every image',()=>{
 const a=planIllustratedNewsShots(words(60,300),18000,3)
 const b=planIllustratedNewsShots(words(40,500),20000,2)
 for(const [shots,w,d,n] of [[a,words(60,300),18000,3],[b,words(40,500),20000,2]] as const){
  assert.equal(shots[0].startMs,0)
  assert.deepEqual([...new Set(shots.map(s=>s.imageIndex))],Array.from({length:n},(_,i)=>i))
  assert.equal(shots.length,n,'one continuous camera move per image')
  assert.ok(shots.every((s,i)=>s.startMs<d&&(i===0||s.startMs>shots[i-1].startMs)))
  assert.ok(shots.every(s=>s.startMs===0||w.some(x=>x.startMs===s.startMs)))
  assert.ok(shots.every(s=>s.scaleFrom>=1&&s.scaleTo<=1.6&&s.focusX>=0&&s.focusX<=100))
 }
 assert.notDeepEqual(a.map(s=>s.startMs),b.map(s=>s.startMs))
})
test('uses all five approved images in a long story, never generates another image',()=>{
 const shots=planIllustratedNewsShots(words(180,400),72000,5)
 assert.deepEqual([...new Set(shots.map(s=>s.imageIndex))],[0,1,2,3,4])
 assert.equal(shots.length,5)
 assert.ok(shots.every(s=>s.startMs<72000))
})
test('malformed timing cannot silently become visual cut points',()=>{
 const original=words(30,400)
 for(const w of [
  [],original.slice(0,5),
  original.map((x,i)=>i===10?{...x,startMs:original[9].startMs}:x),
  original.map((x,i)=>i===10?{...x,startMs:-1}:x),
  original.map((x,i)=>i===29?{...x,endMs:15000}:x),
  original.map((x,i)=>i===10?{...x,word:''}:x),
  original.map((x,i)=>i===10?{...x,startMs:NaN}:x),
 ])assert.throws(()=>planIllustratedNewsShots(w,12000,3),/Invalid illustrated/)
 for(const n of [0,1,6,2.5])assert.throws(()=>planIllustratedNewsShots(original,12000,n),/Invalid illustrated/)
 for(const d of [NaN,7000,91000])assert.throws(()=>planIllustratedNewsShots(original,d,3),/Invalid illustrated/)
})

test('short narration with many images cannot reuse a sentence-shifted scene anchor',()=>{
 const w=words(10,700);w[3].word+='.'
 const shots=planIllustratedNewsShots(w,8000,5)
 assert.deepEqual([...new Set(shots.map(s=>s.imageIndex))],[0,1,2,3,4])
 assert.ok(shots.every((s,i)=>i===0||s.startMs>shots[i-1].startMs))
})

test('30fps camera never resets or jumps inside the same image and finishes at its change',()=>{
 const durationMs=30000,shots=planIllustratedNewsShots(words(60,500),durationMs,3)
 let previous=getIllustratedShotAt(shots,0,3,durationMs)!
 assert.equal(previous.scale,1.02)
 for(let frame=1;frame<900;frame++){
  const current=getIllustratedShotAt(shots,frame*1000/30,3,durationMs)!
  if(current.imageIndex===previous.imageIndex){
   assert.equal(current.index,previous.index,'same image must not start a fresh crop')
   assert.ok(current.scale>=previous.scale,'zoom must not rewind')
   assert.ok(current.scale-previous.scale<0.0005,'zoom must remain slow')
   assert.equal(current.focusX,previous.focusX)
   assert.equal(current.focusY,previous.focusY)
  }
  assert.ok(current.scale<=1.1,'avoid tight repeating crops')
  previous=current
 }
 for(let i=0;i<shots.length;i++){
  const end=shots[i+1]?.startMs??durationMs
  assert.ok(Math.abs(getIllustratedShotAt(shots,end-1,3,durationMs)!.scale-1.1)<0.0001,
   'camera motion lasts until the next image or outro')
 }
})
