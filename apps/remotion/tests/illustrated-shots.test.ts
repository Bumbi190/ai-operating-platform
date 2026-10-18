import test from 'node:test'
import assert from 'node:assert/strict'
import {getIllustratedShotAt, type IllustratedShot} from '../src/lib/illustrated-shots'

const shots:IllustratedShot[]=[
  {startMs:0,imageIndex:0,scaleFrom:1.02,scaleTo:1.12,focusX:50,focusY:50},
  {startMs:3000,imageIndex:0,scaleFrom:1.3,scaleTo:1.4,focusX:70,focusY:65},
  {startMs:6000,imageIndex:1,scaleFrom:1.02,scaleTo:1.1,focusX:50,focusY:50},
]
test('real cut boundary changes image/camera without waiting for equal image quarters',()=>{
 assert.equal(getIllustratedShotAt(shots,2999,2,9000)?.index,0)
 const cut=getIllustratedShotAt(shots,3000,2,9000)!
 assert.equal(cut.index,1)
 assert.equal(cut.imageIndex,0)
 assert.equal(cut.scale,1.3)
 assert.equal(cut.focusX,70)
 assert.equal(getIllustratedShotAt(shots,6000,2,9000)?.imageIndex,1)
})
test('camera motion is bounded, deterministic and stops before outro',()=>{
 const mid=getIllustratedShotAt(shots,1500,2,9000)!
 assert.equal(mid.scale,1.07)
 assert.equal(mid.progress,0.5)
 assert.equal(getIllustratedShotAt(shots,-1,2,9000),null)
 assert.equal(getIllustratedShotAt(shots,9000,2,9000),null)
 assert.equal(getIllustratedShotAt(shots,NaN,2,9000),null)
 assert.equal(getIllustratedShotAt([],0,2,9000),null)
})
test('malformed shot timing, foreign asset indices and unsafe crops fail before render',()=>{
 for(const invalid of [
  [{...shots[0],startMs:1}],
  [shots[0],{...shots[1],startMs:0}],
  [{...shots[0],imageIndex:2}],
  [{...shots[0],imageIndex:-1}],
  [{...shots[0],imageIndex:0.5}],
  [{...shots[0],scaleTo:2}],
  [{...shots[0],focusX:101}],
  [{...shots[0],focusY:NaN}],
  [shots[0],{...shots[1],startMs:9000}],
 ]) assert.throws(()=>getIllustratedShotAt(invalid,0,2,9000),/Invalid illustrated shot/)
})
