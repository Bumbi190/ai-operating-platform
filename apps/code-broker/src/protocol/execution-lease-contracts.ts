// Frozen mirror of the server metadata DTO; parity/negative vectors live in QA.
export interface ExecutionLeaseV1 {
 schema:'atlas.code_work_execution_lease.v1'
 binding:{workId:string;repositoryId:string;pinnedBaseSha:string;admissionHash:string;claimId:string;fence:number}
 projectId:string
 authorityPins:{missionId:string;missionVersion:number;missionHash:string;delegationEnvelopeId:string;delegationHash:string;workPackageId:string;workPackageHash:string}
 state:'claimed'|'preparing'|'working'|'testing';stateVersion:number
 serverNowMs:number;leaseUntilMs:number;authorizationExpiresAtMs:number;runtimeExpiresAtMs:number;productionAuthority:false
}

const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const keys=(v:unknown,names:string[]):v is Record<string,unknown>=>record(v)&&Object.keys(v).length===names.length&&names.every(k=>Object.prototype.hasOwnProperty.call(v,k))
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
const hash=(v:unknown,n:number)=>typeof v==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(v)
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0
const instant=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0
export function parseExecutionLease(v:unknown):ExecutionLeaseV1 {
 if(!keys(v,['schema','binding','projectId','authorityPins','state','stateVersion','serverNowMs','leaseUntilMs','authorizationExpiresAtMs','runtimeExpiresAtMs','productionAuthority']))throw Error('invalid execution lease')
 if(v.schema!=='atlas.code_work_execution_lease.v1'||v.productionAuthority!==false||!uuid(v.projectId)||!positive(v.stateVersion)||!['claimed','preparing','working','testing'].includes(v.state as string))throw Error('invalid execution lease')
 const b=v.binding,a=v.authorityPins
 if(!keys(b,['workId','repositoryId','pinnedBaseSha','admissionHash','claimId','fence'])||!uuid(b.workId)||!uuid(b.claimId)||b.repositoryId!=='github.com/bumbi190/ai-operating-platform'||!hash(b.pinnedBaseSha,40)||!hash(b.admissionHash,64)||!positive(b.fence))throw Error('invalid execution lease')
 if(!keys(a,['missionId','missionVersion','missionHash','delegationEnvelopeId','delegationHash','workPackageId','workPackageHash'])||!uuid(a.missionId)||!uuid(a.delegationEnvelopeId)||!uuid(a.workPackageId)||!positive(a.missionVersion)||!hash(a.missionHash,64)||!hash(a.delegationHash,64)||!hash(a.workPackageHash,64))throw Error('invalid execution lease')
 const{serverNowMs:n,leaseUntilMs:l,authorizationExpiresAtMs:e,runtimeExpiresAtMs:r}=v
 if(!instant(n)||!instant(l)||!instant(e)||!instant(r)||l<=n||e<l||r<l||l-n>90000)throw Error('invalid execution lease')
 return structuredClone(v) as unknown as ExecutionLeaseV1
}
