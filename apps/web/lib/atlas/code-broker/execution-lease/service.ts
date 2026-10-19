import 'server-only'
import {brokerClaimTokenHash,isBrokerClaimToken} from '../../code-work/claim-credential/claim-credential'
import {createExecutionLeaseStore} from './store'
import {projectExecutionLease} from './projection'
import type {ExecutionLeaseService} from './types'
export const executionLeaseForBroker:ExecutionLeaseService=async(broker,body,deps)=>{
 if(broker.status!=='active'||!isBrokerClaimToken(body.claimToken))return{status:'not_live'}
 try{
  const value=await(deps?.store??createExecutionLeaseStore()).read({workId:body.workId,claimId:body.claimId,fence:body.fence,brokerId:broker.brokerId,brokerHostId:broker.hostId,brokerTokenHash:brokerClaimTokenHash(body.workId,body.claimToken)})
  const lease=projectExecutionLease(value)
  if(!lease||lease.binding.workId!==body.workId||lease.binding.claimId!==body.claimId||lease.binding.fence!==body.fence||!broker.allowedRepositoryIds.includes(lease.binding.repositoryId))return{status:'not_live'}
  return{status:'live',lease}
 }catch{return{status:'not_live'}}
}
