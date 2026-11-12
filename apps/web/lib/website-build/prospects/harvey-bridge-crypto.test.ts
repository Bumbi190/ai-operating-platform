import {describe,it,expect} from 'vitest'
import {generateKeyPairSync,sign} from 'node:crypto'
import {SignJWT,jwtVerify} from 'jose'
import {beginHarveyBridge,finishHarveyBridge,evidenceAudience,canonicalHarveyProof,HARVEY_EVIDENCE_SCOPE,EdforsProjectId,type HarveyEvidence} from './harvey-bridge'
const userId='5ffa2946-cd6e-4e18-b4a3-bc28c9909dad'
const origin='https://ai-operating-platform-5kwwm9s0c-bumbi190s-projects.vercel.app'
const signedKey=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
const otherKey=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
const config={WEBBUILDER_HARVEY_BRIDGE_ENABLED:'true',WEBBUILDER_HARVEY_BRIDGE_ORIGIN:origin,
  WEBBUILDER_HARVEY_PUBLIC_JWK:JSON.stringify(signedKey.publicKey.export({format:'jwk'}))}
const issuer='https://oidc.vercel.com/bumbi190s-projects'
const subject='owner:bumbi190s-projects:project:ai-operating-platform-web:environment:preview'
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048})
const signProof=(e:HarveyEvidence,token:string,key=signedKey.privateKey)=>
  sign('sha256',Buffer.from(canonicalHarveyProof(e,token,new URL(origin).hostname),'utf8'),
    {key,dsaEncoding:'ieee-p1363'}).toString('base64url')
async function signedPacket(now:number,signer=signedKey.privateKey){
 const nonce=new URL(beginHarveyBridge(userId,EdforsProjectId,config,now).url).searchParams.get('nonce')!
 const e:HarveyEvidence={v:1,scope:HARVEY_EVIDENCE_SCOPE,projectId:EdforsProjectId,nonce,issuedAt:now,expiresAt:now+300000,
  company:{source:'scb',sourceId:'scb/12345678',sourceUrl:'https://www.scb.se/vara-tjanster/bestall-data-och-statistik/foretagsregistret/',retrievedAt:new Date(now).toISOString(),name:'Edfors Bil AB',branchName:'Edfors Bil',orgnr:'5566391735',cfar:'12345678',city:'Hässleholm',municipalityCode:'1293',sniCodes:['47.811'],restricted:false,inactive:false}}
 const token=await new SignJWT({owner_id:'team_NlGVrs9ZItxkK4nMgRblBCI4',project_id:'prj_ZwTfAGuJBW8iCjfSzBqx0Jwjz03T',environment:'preview'})
  .setProtectedHeader({alg:'RS256'}).setIssuer(issuer).setSubject(subject).setAudience(evidenceAudience(e))
  .setIssuedAt(Math.floor(now/1000)).setExpirationTime(Math.floor((now+180000)/1000)).setJti(nonce).sign(privateKey)
 return {evidence:e,token,signature:signProof(e,token,signer)}
}
const verifyOidc=async(token:string,aud:string)=>(await jwtVerify(token,publicKey,{issuer,subject,audience:aud})).payload
const finish=(p:unknown,time:number)=>finishHarveyBridge(p,{projectId:EdforsProjectId,userId},verifyOidc,time,config)
describe('Harvey evidence – two cryptographic signatures (OIDC + branch-scoped P-256)',()=>{
 it('accepts signed evidence with a real local OIDC JWT plus valid P-256 signature, once',async()=>{
  const now=Date.now()
  const p=await signedPacket(now)
  await expect(finish(p,now+1000)).resolves.toMatchObject({orgnr:'5566391735'})
  await expect(finish(p,now+2000)).rejects.toThrow()
 })
 it('rejects altered company data, CFAR, and an altered OIDC token',async()=>{
  const now=Date.now()
  const p=await signedPacket(now)
  await expect(finish({...p,evidence:{...p.evidence,company:{...p.evidence.company,name:'Wrong company'}}},now+1000)).rejects.toThrow()
  const p2=await signedPacket(now)
  await expect(finish({...p2,evidence:{...p2.evidence,company:{...p2.evidence.company,cfar:'654321'}}},now+1000)).rejects.toThrow()
  const p3=await signedPacket(now)
  await expect(finish({...p3,token:p3.token+'q'},now+1000)).rejects.toThrow()
 })
 it('rejects an OIDC token from an unrelated issuer key',async()=>{
  const now=Date.now()
  const p=await signedPacket(now)
  const foreign=generateKeyPairSync('rsa',{modulusLength:2048})
  const token=await new SignJWT({owner_id:'team_NlGVrs9ZItxkK4nMgRblBCI4',project_id:'prj_ZwTfAGuJBW8iCjfSzBqx0Jwjz03T',environment:'preview'})
   .setProtectedHeader({alg:'RS256'}).setIssuer(issuer).setSubject(subject).setAudience(evidenceAudience(p.evidence))
   .setIssuedAt().setExpirationTime('2m').setJti(p.evidence.nonce).sign(foreign.privateKey)
  await expect(finish({...p,token,signature:signProof(p.evidence,token)},now+1000)).rejects.toThrow()
 })
 it('rejects valid same-project OIDC issued by ANOTHER PREVIEW when its branch signature is different',async()=>{
  const now=Date.now()
  const p=await signedPacket(now,otherKey.privateKey)
  // Its OIDC is valid for the same Vercel project/preview: P-256 is the distinguishing trust boundary.
  await expect(verifyOidc(p.token,evidenceAudience(p.evidence))).resolves.toBeTruthy()
  await expect(finish(p,now+1000)).rejects.toThrow()
 })
 it('rejects a valid issuer signature under a different deployment hostname',async()=>{
  const now=Date.now()
  const p=await signedPacket(now)
  const wrong={...config,WEBBUILDER_HARVEY_BRIDGE_ORIGIN:'https://ai-operating-platform-different-bumbi190s-projects.vercel.app'}
  await expect(finishHarveyBridge(p,{projectId:EdforsProjectId,userId},verifyOidc,now+1000,wrong)).rejects.toThrow()
 })
})
