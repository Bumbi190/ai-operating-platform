import {describe,expect,it,vi} from 'vitest'
import {companySearchProvider,searchScbCompanies} from '../sales/companies/source'
import type {ScbRegisterRecord} from '../handlarborsen/lead-finder/types'
import type {ScbStatusResult} from '../handlarborsen/lead-finder/scb-status-policy'
const query={city:'malmo',category:'car_dealer',radiusKm:5,limit:20} as const
const env={VERCEL_ENV:'preview',NODE_ENV:'production',HB_LEADFINDER_SCB_PREVIEW_ENABLED:'true',SCB_API_KEY:'synthetic-test-key'}
const orgnr='5568357585'
const row=(n:number,extra:Partial<ScbRegisterRecord>={}):ScbRegisterRecord=>({orgnr,name:'Synthetic workplace '+n,cfar:String(10000000+n),sniCodes:['47.811'],municipalityCode:'1280',city:'Malmö',...extra})
const review:ScbStatusResult={ok:true,orgnr,legalName:'Synthetic Legal Dealer AB',status:{code:'1',class:'ACTIVE_PER_SCB',label:null},legalForm:{code:'49',class:'AB',label:null},marketing:{post:{channel:'post',field:'reklamSparrTyp',code:1,label:null,signal:'CODEBOOK_NOT_VERIFIED'},email:{channel:'email',field:'epostSparrTyp',code:2,label:null,signal:'CODEBOOK_NOT_VERIFIED'},phone:{channel:'phone',field:'telefonSparrTyp',code:1,label:null,signal:'CODEBOOK_NOT_VERIFIED'}},warnings:[],needsReview:true,source:[] as never,manualReviewOnly:true,outreachReady:false,contactability:'BLOCKED_PENDING_VERIFICATION'}
function deps(rows:ScbRegisterRecord[]){return {env,search:vi.fn(async()=>({rows,pages:2,truncated:false})),review:vi.fn(async()=>review),sleep:async()=>{},now:()=>new Date('2026-11-04T08:00:00Z')}}
describe('company view uses the qualified SCB preview source',()=>{
 it('is configured with only the existing SCB key/flag, without an Overpass subscription',()=>{expect(companySearchProvider(env)).toBe('scb');expect(companySearchProvider({...env,HB_LEADFINDER_SCB_PREVIEW_ENABLED:'false'})).toBeNull();expect(companySearchProvider({...env,VERCEL_ENV:'production'})).toBeNull()})
 it('prefers SCB when the explicitly configured reserve also exists',()=>{expect(companySearchProvider({...env,ATLAS_SALES_DISCOVERY_OVERPASS_URL:'https://reserve.example.com/api/interpreter'})).toBe('scb')})
 it('refuses source access when preview gate is closed',async()=>{const d=deps([row(1)]);d.env={...env,VERCEL_ENV:'production'};await expect(searchScbCompanies(query,0,d)).rejects.toMatchObject({code:'DISCOVERY_SOURCE_NOT_CONFIGURED'});expect(d.search).not.toHaveBeenCalled();expect(d.review).not.toHaveBeenCalled()})
 it('uses municipality rather than a made-up radius; verifies legal identity and retains branch CFAR',async()=>{const d=deps([row(1),row(2,{municipalityCode:'1281',city:'Lund'})]);const r=await searchScbCompanies(query,0,d);expect(r.candidates).toHaveLength(1);expect(r.candidates[0]).toMatchObject({sourceId:'scb/10000001',name:'Synthetic Legal Dealer AB',branchName:'Synthetic workplace 1',city:'Malmö',orgnr,email:null,websiteUrl:null,restricted:true});expect(r.meta).toMatchObject({provider:'scb',areaLabel:'Malmö kommun',matchedWorkplaces:1,nextOffset:null});expect(JSON.stringify(r)).not.toContain('synthetic-test-key')})
 it('paginates five distinct workplaces at a time without repeating the previous page',async()=>{const d=deps(Array.from({length:12},(_,i)=>row(i+1)));const a=await searchScbCompanies(query,0,d),b=await searchScbCompanies(query,5,d),c=await searchScbCompanies(query,10,d);expect(a.candidates).toHaveLength(5);expect(b.candidates).toHaveLength(5);expect(c.candidates).toHaveLength(2);expect(a.meta?.nextOffset).toBe(5);expect(b.meta?.nextOffset).toBe(10);expect(c.meta?.nextOffset).toBeNull();expect(new Set([...a.candidates,...b.candidates,...c.candidates].map(r=>r.sourceId)).size).toBe(12)})
 it('deduplicates workplace IDs but preserves separate branches sharing one legal company',async()=>{const d=deps([row(1),row(1),row(2)]);const r=await searchScbCompanies(query,0,d);expect(r.candidates).toHaveLength(2);expect(d.review).toHaveBeenCalledTimes(1)})
 it('excludes personal identifiers and ambiguous CFAR ownership before any company review',async()=>{const d=deps([row(1,{orgnr:'199001011234'}),row(2),row(2,{orgnr:'5595433995'})]);const r=await searchScbCompanies(query,0,d);expect(r.candidates).toEqual([]);expect(d.review).not.toHaveBeenCalled();expect(JSON.stringify(r)).not.toContain('199001011234')})
 it('does not expose a failed legal identity or reuse another company review',async()=>{const d=deps([row(1)]);d.review=vi.fn(async()=>({...review,orgnr:'5595433995'}));expect((await searchScbCompanies(query,0,d)).candidates).toEqual([])})
 it('retains truncation and review skips instead of claiming complete dealer coverage',async()=>{const d=deps([row(1)]);d.search=vi.fn(async()=>({rows:[row(1)],pages:2,truncated:true}));d.review=vi.fn(async()=>({ok:false,reason:'identifier_missing',manualReviewOnly:true,outreachReady:false,contactability:'BLOCKED_PENDING_VERIFICATION'}));const r=await searchScbCompanies(query,0,d);expect(r.meta).toMatchObject({truncated:true,skippedInPage:1});expect(r.candidates).toEqual([])})
 it.each([-1,1,1000,NaN])('rejects malformed page offset %s before source access',async offset=>{const d=deps([row(1)]);await expect(searchScbCompanies(query,offset,d)).rejects.toMatchObject({code:'INVALID_BODY'});expect(d.search).not.toHaveBeenCalled()})
 it('does not silently fall back to another provider after SCB fails',async()=>{const d=deps([row(1)]);d.search=vi.fn(async()=>{throw new Error('private upstream detail')});await expect(searchScbCompanies(query,0,d)).rejects.toMatchObject({code:'DISCOVERY_PROVIDER_UNAVAILABLE'})})
 it('integrates the real SCB page mapper, cursor and legal-entity verifier with raw HTTP fixtures',async()=>{
  const calls:string[]=[];const mock=vi.fn(async(url:unknown)=>{const u=new URL(String(url));calls.push(u.pathname+u.search);if(u.pathname.includes('/arbetsstallen/'))return Response.json({pagination:{hasMore:!u.searchParams.has('cursorId'),nextCursorId:99},arbetsstallen:u.searchParams.has('cursorId')?[]:[{peOrgNr:'16'+orgnr,ben:'Raw AE branch',cfarNr:10000001,primarNaringsgren:{naringsgren:'47811'},belagenhetsadress:{kommun:'1280',bPostOrt:'Malmö'}}]});return Response.json({peOrgNr:'16'+orgnr,namn:'Raw JE Dealer AB',jurform:'49',ftgStat:'1',epostSparrTyp:2})});vi.stubGlobal('fetch',mock)
  try{const r=await searchScbCompanies(query,0,{env,sleep:async()=>{}});expect(r.candidates).toHaveLength(1);expect(r.candidates[0]).toMatchObject({name:'Raw JE Dealer AB',branchName:'Raw AE branch',orgnr,cfar:'10000001',city:'Malmö',restricted:true});expect(calls).toEqual(['/v1/arbetsstallen/kommun/1280?limit=5000','/v1/arbetsstallen/kommun/1280?limit=5000&cursorId=99','/v1/juridiskaenheter/16'+orgnr]);expect(JSON.stringify(r)).not.toContain('synthetic-test-key')}finally{vi.unstubAllGlobals()}
 })

 it('accepts Hässleholm and Kristianstad municipality codes without the six-city discovery restriction',async()=>{
  for(const [municipalityCode,name] of [['1293','Hässleholm'],['1290','Kristianstad']]){const d=deps([row(1,{municipalityCode,city:name}),row(2,{municipalityCode:'1280'})]);const r=await searchScbCompanies({municipalityCode,category:'car_dealer',limit:5} as never,0,d);expect(r.candidates).toHaveLength(1);expect(r.meta?.areaLabel).toBe(name+' kommun');expect(d.review).toHaveBeenCalledOnce()}
 })
 it('rejects invented municipalities and mixed geographic query fields before any source access',async()=>{
  for(const query of [{municipalityCode:'9999',category:'car_dealer',limit:5},{municipalityCode:'1293',city:'malmo',category:'car_dealer',limit:5}]){const d=deps([]);await expect(searchScbCompanies(query as never,0,d)).rejects.toMatchObject({code:'INVALID_BODY'});expect(d.search).not.toHaveBeenCalled()}
 })

})


describe('registered industries use their real SCB codes',()=>{
 it.each([['restaurant','56.110','56110'],['hairdresser','96.210','96210'],['house_builder','41.000','41000']] as const)('filters %s within the selected municipality through the real SCB client',async(category,sni,code)=>{
  const paths:string[]=[]
  const mock=vi.fn(async(url:unknown)=>{const u=new URL(String(url));paths.push(u.pathname);if(u.pathname.includes('/arbetsstallen/'))return Response.json({pagination:{hasMore:false},arbetsstallen:[{peOrgNr:'16'+orgnr,ben:'Synthetic branch',cfarNr:10000001,primarNaringsgren:{naringsgren:code},belagenhetsadress:{kommun:'1293',bPostOrt:'Hässleholm'}},{peOrgNr:'16'+orgnr,ben:'Wrong industry',cfarNr:10000002,primarNaringsgren:{naringsgren:'47811'},belagenhetsadress:{kommun:'1293'}}]});return Response.json({peOrgNr:'16'+orgnr,namn:'Synthetic Industry AB',jurform:'49',ftgStat:'1'})})
  vi.stubGlobal('fetch',mock)
  try{const result=await searchScbCompanies({municipalityCode:'1293',category,limit:5} as never,0,{env,sleep:async()=>{}});expect(result.candidates).toHaveLength(1);expect(result.meta).toMatchObject({category,industryLabel:expect.any(String),sniCode:sni,matchedWorkplaces:1});expect(paths[0]).toBe('/v1/arbetsstallen/kommun/1293');expect(result.candidates[0].sourceId).toBe('scb/10000001')}finally{vi.unstubAllGlobals()}
 })
})


describe('municipal lookup avoids national branch truncation',()=>{
 it('finds the local restaurant on the second municipal page without scanning the nationwide industry',async()=>{
  const paths:string[]=[],raw=(id:number,code='56110',kommun='1293')=>({peOrgNr:'16'+orgnr,ben:'Branch '+id,cfarNr:id,primarNaringsgren:{naringsgren:code},belagenhetsadress:{kommun,bPostOrt:'Hässleholm'}})
  vi.stubGlobal('fetch',vi.fn(async(url:unknown)=>{const u=new URL(String(url));paths.push(u.pathname+u.search);if(u.pathname==='/v1/arbetsstallen/kommun/1293')return Response.json({pagination:{hasMore:!u.searchParams.has('cursorId'),nextCursorId:99},arbetsstallen:u.searchParams.has('cursorId')?[raw(10000002),raw(10000003,'47811'),raw(10000004,'56110','1280')]:[raw(10000001,'47811')]});if(u.pathname.includes('/juridiskaenheter/'))return Response.json({peOrgNr:'16'+orgnr,namn:'Local Restaurant AB',jurform:'49',ftgStat:'1'});return Response.json({pagination:{hasMore:true,nextCursorId:99},arbetsstallen:[]})}))
  try{const result=await searchScbCompanies({municipalityCode:'1293',category:'restaurant',limit:5},0,{env,sleep:async()=>{}});expect(result.candidates.map(x=>x.sourceId)).toEqual(['scb/10000002']);expect(result.meta).toMatchObject({truncated:false,sourceScope:'municipality',municipalityCode:'1293',matchedWorkplaces:1,pages:2});expect(paths).toEqual(['/v1/arbetsstallen/kommun/1293?limit=5000','/v1/arbetsstallen/kommun/1293?limit=5000&cursorId=99','/v1/juridiskaenheter/16'+orgnr])}finally{vi.unstubAllGlobals()}
 })
 it('keeps the two-source-page limit visible for a municipality with more remaining pages',async()=>{
  const paths:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:unknown)=>{const u=new URL(String(url));paths.push(u.pathname+u.search);return Response.json({pagination:{hasMore:true,nextCursorId:u.searchParams.has('cursorId')?100:99},arbetsstallen:[]})}))
  try{const result=await searchScbCompanies({municipalityCode:'0180',category:'restaurant',limit:5},0,{env,sleep:async()=>{}});expect(paths).toHaveLength(2);expect(result.meta).toMatchObject({truncated:true,sourceScope:'municipality',pages:2,municipalityCode:'0180'})}finally{vi.unstubAllGlobals()}
 })
})
