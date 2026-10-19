import type {ExecutionLeaseV1} from './types'
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const keys=(v:unknown,names:string[]):v is Record<string,unknown>=>record(v)&&Object.keys(v).length===names.length&&names.every(k=>Object.prototype.hasOwnProperty.call(v,k))
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
const hash=(v:unknown,n:number)=>typeof v==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(v)
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0
const instant=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0
export function projectExecutionLease(v:unknown):ExecutionLeaseV1|null {
 if(!keys(v,['schema','binding','projectId','authorityPins','state','stateVersion','serverNowMs','leaseUntilMs','authorizationExpiresAtMs','runtimeExpiresAtMs','productionAuthority']))return null
 if(v.schema!=='atlas.code_work_execution_lease.v1'||v.productionAuthority!==false||!uuid(v.projectId)||!positive(v.stateVersion)||!['claimed','preparing','working','testing'].includes(v.state as string))return null
 const b=v.binding,a=v.authorityPins
 if(!keys(b,['workId','repositoryId','pinnedBaseSha','admissionHash','claimId','fence'])||!uuid(b.workId)||!uuid(b.claimId)||b.repositoryId!=='github.com/bumbi190/ai-operating-platform'||!hash(b.pinnedBaseSha,40)||!hash(b.admissionHash,64)||!positive(b.fence))return null
 if(!keys(a,['missionId','missionVersion','missionHash','delegationEnvelopeId','delegationHash','workPackageId','workPackageHash'])||!uuid(a.missionId)||!uuid(a.delegationEnvelopeId)||!uuid(a.workPackageId)||!positive(a.missionVersion)||!hash(a.missionHash,64)||!hash(a.delegationHash,64)||!hash(a.workPackageHash,64))return null
 const{serverNowMs:n,leaseUntilMs:l,authorizationExpiresAtMs:e,runtimeExpiresAtMs:r}=v
 if(!instant(n)||!instant(l)||!instant(e)||!instant(r)||l<=n||e<l||r<l||l-n>90000)return null
 return structuredClone(v) as unknown as ExecutionLeaseV1
}
