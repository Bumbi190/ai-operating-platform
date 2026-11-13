import {describe,it,expect,vi} from 'vitest'
import {createScbWorkplaceMunicipalityFetcher,createScbPageFetcher,ScbLiveSearchDisabledError} from '../handlarborsen/lead-finder/scb-client'
const base={baseUrl:'https://apiafr.scb.se',apiKey:'synthetic-test-key',liveApproved:true}
describe('SCB municipal workplace client safety and legacy compatibility',()=>{
 it.each(['1293/../1280','https://evil.example.com',1293,'129','12930',' 1293',null])('rejects malformed municipality %s before any source request',municipalityCode=>{
  const fetchImpl=vi.fn();expect(()=>createScbWorkplaceMunicipalityFetcher({...base,municipalityCode:municipalityCode as never,fetchImpl})).toThrow(RangeError);expect(fetchImpl).not.toHaveBeenCalled()
 })
 it('retains live gate and fixed-origin credential restriction without a test fetch injection',()=>{
  expect(()=>createScbWorkplaceMunicipalityFetcher({...base,municipalityCode:'1293',liveApproved:false})).toThrow(ScbLiveSearchDisabledError)
  expect(()=>createScbWorkplaceMunicipalityFetcher({...base,municipalityCode:'1293',baseUrl:'https://evil.example.com'})).toThrow(RangeError)
 })
 it('keeps the shared transport method, private key header, no-store, redirect denial and cursor contract',async()=>{
  const seen:{url:string;options:RequestInit|undefined}[]=[],fetchImpl=vi.fn(async(url:unknown,options?:RequestInit)=>{seen.push({url:String(url),options});return Response.json({pagination:{hasMore:false},arbetsstallen:[]})})
  const fetcher=createScbWorkplaceMunicipalityFetcher({...base,municipalityCode:'0114',fetchImpl});await fetcher({cursor:'99',pageSize:5000});expect(seen[0].url).toBe('https://apiafr.scb.se/v1/arbetsstallen/kommun/0114?limit=5000&cursorId=99');expect(seen[0].options).toMatchObject({method:'GET',cache:'no-store',redirect:'error',headers:{'X-API-Key':'synthetic-test-key',Accept:'application/json'}});expect(seen[0].options?.signal).toBeInstanceOf(AbortSignal)
  for(const pageSize of [0,5001])await expect(fetcher({cursor:null,pageSize})).rejects.toThrow(RangeError)
  await expect(fetcher({cursor:'https://evil.example.com',pageSize:5})).rejects.toThrow(RangeError);expect(fetchImpl).toHaveBeenCalledTimes(1)
 })
 it('leaves pre-existing industry and legal-entity list paths unchanged',async()=>{
  for(const source of ['arbetsstallen','juridiskaenheter'] as const){const fetchImpl=vi.fn(async(_url:unknown,_options?:RequestInit)=>Response.json({pagination:{hasMore:false},[source==='arbetsstallen'?'arbetsstallen':'jes']:[]}));await createScbPageFetcher({...base,source,sni:'47.811',fetchImpl})({cursor:null,pageSize:5});expect(String(fetchImpl.mock.calls[0][0])).toBe('https://apiafr.scb.se/v1/'+source+'/naringsgren/47811?limit=5')}
 })
})
