import {fields,salesId} from '../validate'
import {integer,digest} from '../inbox/validate'
import type {ConfirmSendInput,SendRef,SendReadInput,SendCancelInput} from './types'
export function parseConfirmSend(v:unknown):ConfirmSendInput{
 fields(v,['projectId','revisionId','expectedRevisionHash','expectedMailboxGeneration','idempotencyKey'])
 return {projectId:salesId(v.projectId),revisionId:salesId(v.revisionId),expectedRevisionHash:digest(v.expectedRevisionHash),expectedMailboxGeneration:integer(v.expectedMailboxGeneration,1),idempotencyKey:salesId(v.idempotencyKey)}
}
export function parseSendRead(v:unknown):SendReadInput{
 fields(v,['projectId','sendJobId'])
 return {projectId:salesId(v.projectId),sendJobId:salesId(v.sendJobId)}
}
export function parseSendCancel(v:unknown):SendCancelInput{
 fields(v,['projectId','sendJobId','expectedRevisionHash'])
 return {projectId:salesId(v.projectId),sendJobId:salesId(v.sendJobId),expectedRevisionHash:digest(v.expectedRevisionHash)}
}
export function parseSendRef(v:unknown):SendRef{
 fields(v,['projectId','sendJobId','workerId','claimId','generation'])
 return {projectId:salesId(v.projectId),sendJobId:salesId(v.sendJobId),workerId:salesId(v.workerId),claimId:salesId(v.claimId),generation:integer(v.generation,1)}
}
