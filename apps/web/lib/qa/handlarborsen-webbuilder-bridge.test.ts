import {describe,it,expect,vi} from 'vitest'
import {generateKeyPairSync,verify as verifySignature} from 'node:crypto'
import {canonicalHarveyProof,evidenceAudience,handleHarveyScbBridge,type BridgeCompany,type HarveyBridgeDeps} from '@/lib/handlarborsen/lead-finder/webbuilder-scb-bridge'
const projectId='a8d240af-e58e-446d-b293-6cae1fd6daa8'
const nonce='A'.repeat(43)
const base='https://ai-operating-platform-5kwwm9s0c-bumbi190s-projects.vercel.app'
const endpoint=base+'/api/atlas/handlarborsen/lead-finder/webbuilder-scb-bridge'
const approvedSha='7eedb7ffbea85d25459629639144b9efab5ff7d3'
const host='ai-operating-platform-5kwwm9s0c-bumbi190s-projects.vercel.app'
const env={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'codex/atlas-harvey-sales-20261017',
  VERCEL_GIT_COMMIT_SHA:approvedSha,VERCEL_URL:host,HARVEY_WEBBUILDER_APPROVED_SHA:approvedSha,
  HARVEY_WEBBUILDER_PRIVATE_JWK:'DUMMY-SIGNER-FOR-INJECTED-UNIT-TEST-ONLY',
  HB_LEADFINDER_SCB_PREVIEW_ENABLED:'true',SCB_API_KEY:'DUMMY-NOT-REAL'}
const company:BridgeCompany={source:'scb',sourceId:'scb/12345678',sourceUrl:'https://www.scb.se/vara-tjanster/bestall-data-och-statistik/foretagsregistret/',
  retrievedAt:'2026-11-12T08:00:00.000Z',name:'Edfors Bil AB',branchName:'Edfors Bil',orgnr:'5566391735',cfar:'12345678',
  city:'Hässleholm',municipalityCode:'1293',sniCodes:['47.811'],restricted:false,inactive:false}
const request=(method:'GET'|'POST',o:{origin?:string;body?:string;query?:string;contentType?:string}={})=>
  new Request(endpoint+(o.query??(method==='GET'?'?projectId='+projectId+'&nonce='+nonce:'')),{
    method,...(method==='POST'?{headers:{origin:o.origin??base,'content-type':o.contentType??'application/x-www-form-urlencoded'},body:o.body??'projectId='+projectId+'&nonce='+nonce}:{})
  })
const deps=():HarveyBridgeDeps=>({env,authorized:async()=>true,findCompany:async()=>company,
  attest:async()=> 'DUMMY-JWT-NOT-VALID',signEvidence:async()=> 'A'.repeat(86),now:()=>1794470400000})
describe('Harvey isolated SCB bridge – read-only attestation',()=>{
  it('never runs without the exact owner-approved Harvey branch, commit and private signing capability',async()=>{
    for(const change of [{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'some-other-preview'},
      {VERCEL_GIT_COMMIT_SHA:'f'.repeat(40)},
      {HARVEY_WEBBUILDER_APPROVED_SHA:'f'.repeat(40)},{HARVEY_WEBBUILDER_PRIVATE_JWK:''},
      {HB_LEADFINDER_SCB_PREVIEW_ENABLED:'false'},{SCB_API_KEY:''}]){
      const find=vi.fn(async()=>company),p={...deps(),env:{...env,...change},findCompany:find}
      const r=await handleHarveyScbBridge(request('POST'),p)
      expect(r.status).toBe(404);expect(find).not.toHaveBeenCalled()
    }
  })
  it('denies non-owner, malformed query, invalid origin and POST content type before lookup',async()=>{
    const find=vi.fn(async()=>company)
    for(const [r,p] of [
      [request('GET'),{...deps(),authorized:async()=>false,findCompany:find}],
      [request('POST',{origin:'https://hostile.invalid'}),{...deps(),findCompany:find}],
      [request('POST',{query:'?projectId='+projectId+'&nonce=bad'}),{...deps(),findCompany:find}],
      [request('POST',{contentType:'application/json'}),{...deps(),findCompany:find}],
      [request('GET',{query:'?projectId='+projectId+'&nonce='+nonce+'&extra=yes'}),{...deps(),findCompany:find}],
    ] as const){const response=await handleHarveyScbBridge(r,p);expect(response.status).toBeGreaterThanOrEqual(400)}
    expect(find).not.toHaveBeenCalled()
  })
  it('renders a confirmation before making any SCB call',async()=>{
    const find=vi.fn(async()=>company)
    const r=await handleHarveyScbBridge(request('GET'),{...deps(),findCompany:find})
    expect(r.status).toBe(200)
    expect(await r.text()).toContain('Verifiera Edfors Bil hos SCB')
    expect(find).not.toHaveBeenCalled()
    expect(r.headers.get('content-security-policy')).toContain("form-action 'self'")
    expect(r.headers.get('cache-control')).toBe('private, no-store')
  })
  it('attests only a confirmed company and returns a localhost FRAGMENT, not query token',async()=>{
    const find=vi.fn(async()=>company),mint=vi.fn(async()=> 'DUMMY-JWT-NOT-VALID')
    const r=await handleHarveyScbBridge(request('POST'),{...deps(),findCompany:find,attest:mint})
    expect(r.status).toBe(303);expect(find).toHaveBeenCalledTimes(1)
    const callback=new URL(r.headers.get('location')!)
    expect(callback.origin).toBe('http://localhost:56994')
    expect(callback.pathname).toBe('/build/prospects')
    expect(callback.searchParams.get('projectId')).toBe(projectId)
    expect(callback.search).not.toContain('JWT')
    const data=JSON.parse(decodeURIComponent(callback.hash.slice('#harveyBridge='.length)))
    expect(data.evidence.company).toMatchObject(company)
    expect(data.evidence.nonce).toBe(nonce)
    expect(data.evidence.expiresAt-data.evidence.issuedAt).toBe(300000)
    expect(data.signature).toMatch(/^[A-Za-z0-9_-]{86}$/)
    expect(canonicalHarveyProof(data.evidence,data.token,host)).toContain(data.evidence.nonce)
    expect(mint).toHaveBeenCalledWith(evidenceAudience(data.evidence),nonce)
  })
  it('rejects an unverified workplace rather than issuing an attestation',async()=>{
    const mint=vi.fn(async()=> 'NO')
    const r=await handleHarveyScbBridge(request('POST'),{...deps(),findCompany:async()=>null,attest:mint})
    expect(r.status).toBe(409);expect(mint).not.toHaveBeenCalled()
  })
  it('uses real P-256 signing in memory without exposing the private test key or SCB secrets',async()=>{
    const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
    const privateJwk=JSON.stringify(pair.privateKey.export({format:'jwk'}))
    const settings={...env,HARVEY_WEBBUILDER_PRIVATE_JWK:privateJwk}
    const r=await handleHarveyScbBridge(request('POST'),{...deps(),env:settings,signEvidence:undefined})
    expect(r.status).toBe(303)
    const callback=new URL(r.headers.get('location')!)
    const packageValue=JSON.parse(decodeURIComponent(callback.hash.slice('#harveyBridge='.length)))
    const proof=canonicalHarveyProof(packageValue.evidence,packageValue.token,host)
    expect(verifySignature('sha256',Buffer.from(proof,'utf8'),
      {key:pair.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(packageValue.signature,'base64url'))).toBe(true)
    expect(await r.text()).not.toContain(privateJwk)
  })
  it('does not return raw provider errors or issue a receipt when evidence minting fails',async()=>{
    const r=await handleHarveyScbBridge(request('POST'),{...deps(),attest:async()=>{throw Error('private token 123')}})
    expect(r.status).toBe(503);expect(await r.text()).not.toContain('private token')
  })
})
