import type {StoredBroker} from '../types'
import type {HeartbeatBody} from '../control-channel/dto'
export const EXECUTION_LEASE_PATH='/api/atlas/code-work/broker/execution-lease' as const
export interface ExecutionLeaseV1 {
 schema:'atlas.code_work_execution_lease.v1'
 binding:{workId:string;repositoryId:string;pinnedBaseSha:string;admissionHash:string;claimId:string;fence:number}
 projectId:string
 authorityPins:{missionId:string;missionVersion:number;missionHash:string;delegationEnvelopeId:string;delegationHash:string;workPackageId:string;workPackageHash:string}
 state:'claimed'|'preparing'|'working'|'testing';stateVersion:number
 serverNowMs:number;leaseUntilMs:number;authorizationExpiresAtMs:number;runtimeExpiresAtMs:number;productionAuthority:false
}
export interface ExecutionLeaseStore{read(input:{workId:string;claimId:string;fence:number;brokerId:string;brokerHostId:string;brokerTokenHash:string}):Promise<unknown>}
export interface ExecutionLeaseDeps{store?:ExecutionLeaseStore}
export type ExecutionLeaseOutcome={status:'live';lease:ExecutionLeaseV1}|{status:'not_live'}
export type ExecutionLeaseService=(broker:StoredBroker,body:HeartbeatBody,deps?:ExecutionLeaseDeps)=>Promise<ExecutionLeaseOutcome>
