import {describe,it,expect} from 'vitest'
import {validateProspectContent,validateImprovements,publicWebsiteUrl,prospectHash,prospectInputHash,prospectReadiness} from './validation'
import {suggestProspectImprovements} from './improvements'
import {issueSearchReceipt,readSearchReceipt} from './search-receipt'
import type {ProspectContent} from './types'
export const owner='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222'
export function fixture():ProspectContent{
  return {version:1,company:{source:'scb',sourceId:'scb/10000001',sourceUrl:'https://www.scb.se/vara-tjanster/bestall-data-och-statistik/foretagsregistret/',retrievedAt:'2026-11-08T10:00:00Z',name:'Syntetisk Testbil AB',branchName:'Testfilial',orgnr:'5568357585',cfar:'10000001',city:'Hässleholm',municipalityCode:'1293',sniCodes:['47.811','46.711'],restricted:true,inactive:false},website:{url:'https://dealer.se/',verifiedAt:'2026-11-08T10:01:00Z',verifiedBy:owner,method:'operator'},capture:{id:'33333333-3333-4333-8333-333333333333',sourceUrl:'https://dealer.se/',finalUrl:'https://dealer.se/',capturedAt:'2026-11-08T10:02:00Z',engine:'playwright',images:[{viewport:'desktop',width:1440,height:2000,assetId:'44444444-4444-4444-8444-444444444444',sha256:'a'.repeat(64)},{viewport:'mobile',width:390,height:3200,assetId:'55555555-5555-4555-8555-555555555555',sha256:'b'.repeat(64)}],observations:[{id:'desktop-h1',viewport:'desktop',kind:'h1',description:'Antal synliga huvudrubriker: 0.',selector:'h1',value:'[]'},{id:'desktop-description',viewport:'desktop',kind:'description',description:'Metabeskrivning saknas.',selector:'meta[name="description"]',value:''},{id:'mobile-small-controls',viewport:'mobile',kind:'small-controls',description:'Två kontroller är under 44 px.',selector:'',value:'[{"text":"Bilar","width":39,"height":22}]'}],warnings:[]},improvements:[],design:null,build:null,demo:null}
}
describe('prospect evidence and review boundaries',()=>{
  it('accepts a real-capture shaped draft without inventing completion',()=>{const c=fixture();expect(validateProspectContent(c)).toEqual(c);expect(prospectReadiness(c).ready).toBe(false)})
  it('derives three distinct proposals from the observed conditions',()=>{const c=fixture(),suggestions=suggestProspectImprovements(c.capture!);expect(suggestions).toHaveLength(3);expect(new Set(suggestions.map(s=>s.id)).size).toBe(3);expect(validateImprovements(suggestions,c)).toEqual(suggestions)})
  it('never fills a missing third proposal with invented observations',()=>{const c=fixture();c.capture!.observations=c.capture!.observations.slice(0,1);expect(suggestProspectImprovements(c.capture!)).toHaveLength(1);expect(()=>validateImprovements(suggestProspectImprovements(c.capture!),c)).toThrow('INVALID_PROSPECT')})
  it.each([1,2,4])('rejects %s improvements',length=>{const c=fixture(),item=suggestProspectImprovements(c.capture!)[0];expect(()=>validateImprovements(Array.from({length},(_,i)=>({...item,id:'item-'+i})),c)).toThrow()})
  it('rejects an invented evidence reference and duplicate improvement identities',()=>{const c=fixture(),items=suggestProspectImprovements(c.capture!);items[0].observationIds=['invented'];expect(()=>validateImprovements(items,c)).toThrow();items[0].observationIds=['desktop-h1'];items[1].id=items[0].id;expect(()=>validateImprovements(items,c)).toThrow()})
  it('invalidates a design binding after a change to evidence or website',()=>{const c=fixture();c.improvements=suggestProspectImprovements(c.capture!);c.design={projectId:project,planId:owner,revisionId:owner,sha256:'c'.repeat(64),conversationId:owner,inputSha256:prospectInputHash(c)};expect(validateProspectContent(c)).toEqual(c);c.capture!.observations[0].value='["Changed"]';expect(()=>validateProspectContent(c)).toThrow()})
  it('hashes human edits differently while preserving the original object',()=>{const c=fixture(),before=JSON.stringify(c),first=prospectHash(c);const changed=fixture();changed.company.name='Annat företag AB';expect(prospectHash(changed)).not.toBe(first);expect(JSON.stringify(c)).toBe(before)})
  it('preserves revision and design hashes when JSONB reorders every object',()=>{
    const c=fixture();c.improvements=suggestProspectImprovements(c.capture!)
    c.design={projectId:project,planId:owner,revisionId:owner,sha256:'c'.repeat(64),conversationId:owner,inputSha256:prospectInputHash(c)}
    const reordered=JSON.parse(JSON.stringify(c,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).reverse()):value))
    expect(prospectInputHash(reordered)).toBe(prospectInputHash(c))
    expect(prospectHash(reordered)).toBe(prospectHash(c))
    expect(validateProspectContent(reordered)).toEqual(validateProspectContent(c))
    reordered.improvements.reverse()
    expect(prospectInputHash(reordered)).not.toBe(prospectInputHash(c))
  })
  it('refuses forged or partial production readiness',()=>{const c=fixture();c.demo={url:'https://demo.vercel.app/',publisher:'vercel',exportSha256:'a'.repeat(64),artifactSha256:'b'.repeat(64),checkedAt:'2026-11-08T10:00:00Z',desktopWidth:1440,mobileWidth:390,desktopOverflow:false,mobileOverflow:false};expect(()=>validateProspectContent(c)).toThrow()})
  it.each(['file:///etc/passwd','http://localhost','http://127.0.0.1','http://2130706433','http://[::1]','https://dealer.se:444','https://user:pass@dealer.se','https://dealer.internal/','https://dealer.se/#secret'])('refuses unsafe website input %s',url=>expect(()=>publicWebsiteUrl(url)).toThrow())
  it('normalizes a public website without changing its path',()=>expect(publicWebsiteUrl('https://Dealer.se/bilar')).toBe('https://dealer.se/bilar'))
})
describe('SCB provenance cannot be authored in a browser',()=>{
  const principal={userId:owner,allowedProjectIds:[project]},secret='a-private-synthetic-key-for-testing-only',now=1_800_000_000_000
  it('round-trips only for the same owner and project',()=>{const token=issueSearchReceipt(fixture().company,principal,project,secret,now);expect(readSearchReceipt(token,principal,project,secret,now)).toEqual(fixture().company);expect(()=>readSearchReceipt(token,{...principal,userId:project},project,secret,now)).toThrow();expect(()=>readSearchReceipt(token,principal,owner,secret,now)).toThrow()})
  it('rejects tampering, wrong secret and expired receipts',()=>{const token=issueSearchReceipt(fixture().company,principal,project,secret,now);expect(()=>readSearchReceipt(token.replace(token[5],token[5]==='a'?'b':'a'),principal,project,secret,now)).toThrow();expect(()=>readSearchReceipt(token,principal,project,'a-different-private-key-for-testing',now)).toThrow();expect(()=>readSearchReceipt(token,principal,project,secret,now+30*60*1000)).toThrow()})
})
