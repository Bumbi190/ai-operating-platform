import {describe,expect,it} from 'vitest'
import {suggestProspectImprovements} from './improvements'
import type {ProspectCapture,ProspectObservation} from './types'

const observation=(viewport: 'desktop'|'mobile',kind:string,value:string):ProspectObservation=>({id:viewport+'-'+kind,viewport,kind,value,selector:'body',description:'Observerat i riktig webbläsare.'})
const fixture=(observations:ProspectObservation[]):ProspectCapture=>({id:'fixture',engine:'playwright',sourceUrl:'https://www.edforsbil.se/',finalUrl:'https://www.edforsbil.se/',capturedAt:'2026-11-08T11:47:59Z',images:[],observations,warnings:[]})
describe('evidence bound improvement suggestions',()=>{
 it('suggests three distinct changes from measured controls and missing metadata without inventing other defects',()=>{
   const capture=fixture([
     observation('desktop','h1','["Edfors Bil"]'),
     observation('desktop','description',''),
     observation('desktop','small-controls','[{"text":"Hem","width":39,"height":27}]'),
     observation('mobile','small-controls','[{"text":"","width":30,"height":30}]'),
     observation('mobile','primary-actions','["Bilar i lager"]'),
     observation('mobile','overflow','390'),
   ])
   const result=suggestProspectImprovements(capture)
   expect(result).toHaveLength(3)
   expect(result.map(x=>x.id)).toEqual(['mobile-controls','desktop-navigation','description'])
   for(const item of result)expect(item.observationIds).toHaveLength(1)
   for(const item of result)expect(capture.observations.some(o=>o.id===item.observationIds[0])).toBe(true)
 })
 it('does not invent small clickable targets from invalid or empty measurements',()=>{
   const capture=fixture([observation('desktop','small-controls','[broken'),observation('mobile','small-controls','[]'),observation('desktop','description','En korrekt metabeskrivning')])
   expect(suggestProspectImprovements(capture)).toHaveLength(0)
 })
})
