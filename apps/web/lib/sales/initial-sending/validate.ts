import {fields,salesId} from '../validate'
import {digest,integer} from '../inbox/validate'
import {SalesError} from '../types'
import type {ConfirmInitialSend} from './types'
export function parseConfirmInitialSend(v:unknown):ConfirmInitialSend{
 fields(v,['projectId','revisionId','expectedRevisionHash','expectedMailboxGeneration','expectedHistoryRevisionId','expectedRuleRevisionId','expectedPolicyVersion','acceptHistoryGap','idempotencyKey'])
 if(typeof v.acceptHistoryGap!=='boolean')throw new SalesError('INVALID_BODY')
 return {projectId:salesId(v.projectId),revisionId:salesId(v.revisionId),expectedRevisionHash:digest(v.expectedRevisionHash),expectedMailboxGeneration:integer(v.expectedMailboxGeneration,1),expectedHistoryRevisionId:salesId(v.expectedHistoryRevisionId),expectedRuleRevisionId:salesId(v.expectedRuleRevisionId),expectedPolicyVersion:integer(v.expectedPolicyVersion,1),acceptHistoryGap:v.acceptHistoryGap,idempotencyKey:salesId(v.idempotencyKey)}
}
