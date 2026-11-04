import {describe,it,expect} from 'vitest'
import {SWEDISH_MUNICIPALITIES,municipalityByCode,municipalityByName} from '../sales/companies/municipalities'
import {parseCompanySearchQuery,companyQueryMunicipality} from '../sales/companies/query'
describe('SCB 2026 municipality catalogue and read-only query',()=>{
 it('contains all 290 unique official codes with Swedish names and leading zeroes',()=>{expect(SWEDISH_MUNICIPALITIES).toHaveLength(290);expect(new Set(SWEDISH_MUNICIPALITIES.map(m=>m.code)).size).toBe(290);expect(municipalityByCode('0114')?.name).toBe('Upplands Väsby');expect(municipalityByCode('1293')?.name).toBe('Hässleholm');expect(municipalityByCode('1290')?.name).toBe('Kristianstad');expect(municipalityByCode('2584')?.name).toBe('Kiruna')})
 it('round trips every municipality through strict company-only validation',()=>{for(const m of SWEDISH_MUNICIPALITIES){const query=parseCompanySearchQuery({municipalityCode:m.code,category:'car_dealer',limit:5});expect(companyQueryMunicipality(query)).toEqual(m);expect(municipalityByName(m.name.toLocaleLowerCase('sv-SE'))).toEqual(m)}})
 it('retains the six old query names without broadening geographic discovery mutation schemas',()=>{expect(companyQueryMunicipality(parseCompanySearchQuery({city:'malmo',category:'car_dealer',radiusKm:5,limit:20}))?.code).toBe('1280')})
 it.each([{municipalityCode:'9999',category:'car_dealer',limit:5},{municipalityCode:1293,category:'car_dealer',limit:5},{municipalityCode:'1293',category:'__proto__',limit:5},{municipalityCode:'1293',category:'car_dealer',limit:20},{municipalityCode:'1293',city:'malmo',category:'car_dealer',limit:5},{municipalityCode:'1293',category:'car_dealer',limit:5,url:'https://example.com'}])('rejects malformed or mixed queries',query=>{expect(()=>parseCompanySearchQuery(query)).toThrow()})
})

it('accepts only the four reviewed categories and rejects arbitrary source controls',()=>{
 for(const category of ['car_dealer','restaurant','hairdresser','house_builder'])expect(parseCompanySearchQuery({municipalityCode:'1293',category,limit:5}).category).toBe(category)
 for(const category of ['dentist','constructor','toString','',null])expect(()=>parseCompanySearchQuery({municipalityCode:'1293',category,limit:5})).toThrow()
})
