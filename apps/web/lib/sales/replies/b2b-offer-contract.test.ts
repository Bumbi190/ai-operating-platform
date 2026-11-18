import {describe,it,expect} from 'vitest'
import {offersMatch,offerLabel,parseOfferTerms} from '../offers'
import {createSalesApi} from '../api'
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`
describe('persisted offer discriminators and exact pilot compatibility',()=>{
 it.each([2,6,12])('accepts legacy and explicit %s month pilots and refuses mismatches',months=>{
  expect(offersMatch({pilotMonths:months},{freeMonths:months})).toBe(true)
  expect(offersMatch({offerKind:'pilot',pilotMonths:months},{offerKind:'pilot',freeMonths:months})).toBe(true)
  expect(offersMatch({pilotMonths:months},{freeMonths:months===2?6:2})).toBe(false)
  expect(parseOfferTerms({pilotMonths:months},'pilotMonths')).toEqual({pilotMonths:months})
 })
 it('accepts a service only with explicit matching kinds and null months',()=>{
  const contact={offerKind:'general_service',pilotMonths:null},offer={offerKind:'general_service',freeMonths:null}
  expect(offersMatch(contact,offer)).toBe(true)
  expect(offerLabel(offer)).toBe('Tjänsteerbjudande')
  expect(offersMatch(contact,{freeMonths:12})).toBe(false)
  expect(offersMatch({pilotMonths:12},offer)).toBe(false)
  expect(offersMatch({...contact,pilotMonths:12},offer)).toBe(false)
  expect(offersMatch({...contact,pilotMonths:undefined},offer)).toBe(false)
  expect(offersMatch({pilotMonths:null},offer)).toBe(false)
  expect(parseOfferTerms(offer,'freeMonths')).toEqual(offer)
 })
 it.each([
  {offerKind:'general_service',freeMonths:12},
  {offerKind:'general_service'},
  {offerKind:'pilot',freeMonths:null},
  {offerKind:null,freeMonths:12},
  {offerKind:'future',freeMonths:12},
  {freeMonths:null},
  {freeMonths:0},
  {freeMonths:'12'},
 ])('fails closed for malformed terms %j',value=>expect(()=>parseOfferTerms(value,'freeMonths')).toThrow('INVALID_BODY'))
})
describe('confirmed project-owned service prerequisites',()=>{
 const body={operation:'save_offer',projectId:id(2),id:id(5),senderEmail:'studio@example.invalid',offerKind:'general_service',freeMonths:null,offerText:'Separat förslag efter bekräftat projektunderlag.',productFacts:['Synthetic confirmed service fact.'],confirmed:true}
 it.each([{senderEmail:''},{senderEmail:undefined},{productFacts:[]},{productFacts:undefined},{productFacts:['']},{confirmed:false},{offerText:''}])('refuses missing prerequisites %j before SQL',async change=>{
  const calls:any[]=[]
  const api=createSalesApi({access:async()=>({ok:true as const,userId:id(9),allowedProjectIds:[id(1),id(2)]}),enabled:projectId=>projectId===id(2),db:()=>({rpc:async(name:string,args:unknown)=>{calls.push([name,args]);return {data:{saved:true},error:null}}}) as never})
  const response=await api(new Request('https://owner.invalid/api/sales',{method:'POST',headers:{origin:'https://owner.invalid'},body:JSON.stringify({...body,...change})}))
  expect(response.status).toBe(400);expect(calls).toHaveLength(0)
 })
})
