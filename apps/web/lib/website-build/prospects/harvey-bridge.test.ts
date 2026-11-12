import {describe,it,expect} from 'vitest'
import {generateKeyPairSync,sign} from 'node:crypto'
import {beginHarveyBridge,finishHarveyBridge,harveyBridgeConfigured,canonicalHarveyProof,evidenceAudience,HARVEY_EVIDENCE_SCOPE,EdforsProjectId,type HarveyEvidence} from './harvey-bridge'
const owner='5ffa2946-cd6e-4e18-b4a3-bc28c9909dad'
const another='888f2d86-5899-48a3-8359-c8a6988f3b18'
const origin='https://ai-operating-platform-5kwwm9s0c-bumbi190s-projects.vercel.app'
const signing=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
const publicJwk=JSON.stringify(signing.publicKey.export({format:'jwk'}))
const env={
  WEBBUILDER_HARVEY_BRIDGE_ENABLED:'true',
  WEBBUILDER_HARVEY_BRIDGE_ORIGIN:origin,
  WEBBUILDER_HARVEY_PUBLIC_JWK:publicJwk,
}
const now=1794470400000
const company={source:'scb' as const,sourceId:'scb/12345678',sourceUrl:'https://www.scb.se/vara-tjanster/bestall-data-och-statistik/foretagsregistret/',
  retrievedAt:new Date(now).toISOString(),name:'Edfors Bil AB',branchName:'Edfors Bil',
  orgnr:'5566391735',cfar:'12345678',city:'Hässleholm',municipalityCode:'1293',sniCodes:['47.811'],restricted:false,inactive:false}
function signPackage(evidence:HarveyEvidence,token='SYNTHETIC-NOT-A-JWT-'+('A'.repeat(120)),privateKey=signing.privateKey){
  const host=new URL(origin).hostname
  const signature=sign('sha256',Buffer.from(canonicalHarveyProof(evidence,token,host),'utf8'),
    {key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')
  return {evidence,token,signature}
}
const create=()=>{
  const url=new URL(beginHarveyBridge(owner,EdforsProjectId,env,now).url)
  const evidence:HarveyEvidence={v:1,scope:HARVEY_EVIDENCE_SCOPE,projectId:EdforsProjectId,nonce:url.searchParams.get('nonce')!,
    issuedAt:now,expiresAt:now+300000,company}
  return signPackage(evidence)
}
const fakeVerify=(expected:HarveyEvidence)=>(async(_token:string,audience:string)=>{
  if(audience!==evidenceAudience(expected))throw Error('bad audience')
  return {iss:'https://oidc.vercel.com/bumbi190s-projects',
    sub:'owner:bumbi190s-projects:project:ai-operating-platform-web:environment:preview',
    aud:audience,jti:expected.nonce,
    owner_id:'team_NlGVrs9ZItxkK4nMgRblBCI4',
    project_id:'prj_ZwTfAGuJBW8iCjfSzBqx0Jwjz03T',
    environment:'preview',exp:Math.floor((now+180000)/1000),iat:Math.floor(now/1000)}
})
const finish=(packet:unknown,userId=owner,verified:ReturnType<typeof fakeVerify>=fakeVerify((packet as {evidence:HarveyEvidence}).evidence),when=now+1000)=>
  finishHarveyBridge(packet,{projectId:EdforsProjectId,userId},verified,when,env)
describe('WebBuilder Harvey bridge – pinned local proof boundary',()=>{
  it('fails closed unless deliberately enabled on localhost with exact trusted PUBLIC key, never SCB key',()=>{
    expect(harveyBridgeConfigured()).toBe(false)
    expect(harveyBridgeConfigured(env)).toBe(true)
    for(const extra of [
      {WEBBUILDER_HARVEY_BRIDGE_ENABLED:'false'},{VERCEL_ENV:'preview'},
      {SCB_API_KEY:'DUMMY-NOT-REAL'},{WEBBUILDER_HARVEY_PUBLIC_JWK:''},
      {WEBBUILDER_HARVEY_PUBLIC_JWK:'{"kty":"EC","d":"DO-NOT-ACCEPT"}'},
      {WEBBUILDER_HARVEY_BRIDGE_ORIGIN:'http://example.com/'},
      {WEBBUILDER_HARVEY_BRIDGE_ORIGIN:'https://evil.invalid/'},
      {WEBBUILDER_HARVEY_BRIDGE_ORIGIN:origin+'/extra'},
    ])expect(harveyBridgeConfigured({...env,...extra})).toBe(false)
  })
  it('issues only a bounded URL to pinned Harvey host and designated local project',()=>{
    const url=new URL(beginHarveyBridge(owner,EdforsProjectId,env,now).url)
    expect(url.protocol).toBe('https:')
    expect(url.origin).toBe(origin)
    expect(url.searchParams.get('projectId')).toBe(EdforsProjectId)
    expect(url.searchParams.get('nonce')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(()=>beginHarveyBridge(owner,another,env,now)).toThrow()
  })
  it('accepts valid P-256 and OIDC evidence once, bound to the same local owner and project',async()=>{
    const packet=create()
    await expect(finish(packet)).resolves.toMatchObject(company)
    await expect(finish(packet)).rejects.toThrow()
  })
  it('refuses other local user, wrong project, expired proof and tampered corporate identity',async()=>{
    const a=create()
    await expect(finish(a,another)).rejects.toThrow()
    const b=create()
    await expect(finishHarveyBridge(b,{projectId:another,userId:owner},fakeVerify(b.evidence),now+1000,env)).rejects.toThrow()
    const c=create()
    await expect(finish(c,owner,fakeVerify(c.evidence),now+300001)).rejects.toThrow()
    const d=create()
    await expect(finish({...d,evidence:{...d.evidence,company:{...company,orgnr:'1234567890'}}})).rejects.toThrow()
    const e=create()
    await expect(finish({...e,evidence:{...e.evidence,company:{...company,cfar:'999999'}}})).rejects.toThrow()
  })
  it('refuses foreign OIDC issuer even when the P-256 signature is valid',async()=>{
    const packet=create()
    const wrongIssuer=async()=>({...await fakeVerify(packet.evidence)('',evidenceAudience(packet.evidence)),iss:'https://evil.invalid'})
    await expect(finish(packet,owner,wrongIssuer)).rejects.toThrow()
  })
  it('rejects a token that a different Vercel preview could mint under the SAME project claims',async()=>{
    const packet=create()
    const otherSigner=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
    const foreign=signPackage(packet.evidence,packet.token,otherSigner.privateKey)
    // The injected OIDC verification accepts identical project/environment claims here.
    // The extra, branch-scoped signature must still reject that proof.
    await expect(finish(foreign)).rejects.toThrow()
  })
  it('rejects a signature bound to a different deployment or altered OIDC token',async()=>{
    const a=create()
    await expect(finish({...a,signature:'A'.repeat(86)})).rejects.toThrow()
    const b=create()
    await expect(finish({...b,token:b.token+'X'})).rejects.toThrow()
    const c=create()
    const otherOrigin='https://ai-operating-platform-other-bumbi190s-projects.vercel.app'
    await expect(finishHarveyBridge(c,{projectId:EdforsProjectId,userId:owner},fakeVerify(c.evidence),now+1000,
      {...env,WEBBUILDER_HARVEY_BRIDGE_ORIGIN:otherOrigin})).rejects.toThrow()
  })
  it('rejects forged OIDC tokens when OIDC cryptographic verification fails',async()=>{
    const packet=create()
    await expect(finish(packet,owner,async()=>{throw Error('invalid OIDC signature')})).rejects.toThrow()
  })
})
