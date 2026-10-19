import test from 'node:test'
import assert from 'node:assert/strict'
import {inspectIfvg, inspectCisd} from './pattern-candidates.mjs'

const base=Date.parse('2026-10-15T14:00:00.000Z')
const at=(i)=>new Date(base+i*60000).toISOString()
function data(rows) {
  return {
    source:'SYNTHETIC', calendar:'SYNTHETIC_CONTIGUOUS', settled:true,
    candles:rows.map(([open,high,low,close],i)=>({
      openTime:at(i),open,high,low,close,complete:true
    }))
  }
}
test('bullish base gap inverted lower creates short research observation',()=>{
  const r=inspectIfvg(data([
    ['98','100','97','99'],['101','104','100','103'],
    ['105','106','104','105'],['105','106','98','99']
  ]),{manipulationCompleteAt:at(0)})
  assert.deepEqual(r.observations.filter(e=>e.side==='SHORT').map(e=>e.candleIndex),[3])
  assert.equal(r.observations.every(e=>e.entryPermitted===false),true)
})
test('bullish delivery run with different anchors changes short timing',()=>{
  const d=data([
    ['100','103','99','102'],['102','105','101','104'],
    ['104','104','100','101'],['101','102','98','99']
  ])
  assert.equal(inspectCisd(d,{manipulationCompleteAt:at(0),anchor:'LAST_RUN_OPEN'}).observations.find(e=>e.side==='SHORT')?.candleIndex,2)
  assert.equal(inspectCisd(d,{manipulationCompleteAt:at(0),anchor:'FIRST_RUN_OPEN'}).observations.find(e=>e.side==='SHORT')?.candleIndex,3)
})
test('original gap formation order must be selected explicitly',()=>{
  const d=data([
    ['105','106','104','104.5'],['102','103','100','101'],
    ['99','100','98','99'],['99','106','99','105']
  ])
  assert.equal(inspectIfvg(d,{manipulationCompleteAt:at(3),formation:'ANY'}).observations.length,1)
  assert.equal(inspectIfvg(d,{manipulationCompleteAt:at(3),formation:'AFTER_MANIPULATION'}).observations.length,0)
})
test('patterns before completed manipulation do not count',()=>{
  const d=data([
    ['105','106','104','104.5'],['102','103','100','101'],
    ['99','100','98','99'],['99','106','99','105']
  ])
  assert.equal(inspectIfvg(d,{manipulationCompleteAt:at(4)}).observations.length,0)
})
