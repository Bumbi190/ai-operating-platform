import {randomUUID} from 'node:crypto'
import {invokeWorkspaceHelper} from './workspace-helper.js'
import {isWorkspaceUuid,parseWindowsWorkspaceRequest,parseWindowsWorkspaceReport,parseWindowsSandboxProbeReport,type WorkspaceReadResult,type ProbeReadResult} from './workspace-contracts.js'
/** Internal infrastructure evidence only. No operational caller or code-work authority. */
export async function prepareWindowsWorktree(input:unknown):Promise<WorkspaceReadResult>{
 let request
 try{request=parseWindowsWorkspaceRequest(input)}catch{return{status:'unavailable',reason:'input_invalid'}}
 const response=await invokeWorkspaceHelper('prepare',request);if(response.status==='unavailable')return response
 try{
  const report=parseWindowsWorkspaceReport(response.value)
  if(report.status==='prepared'){
   for(const key of ['workId','repositoryId','pinnedBaseSha','admissionHash','claimId','fence'] as const)if(report.binding[key]!==request[key])throw Error()
  }else if(report.status==='stale_base'&&report.pinnedBaseSha!==request.pinnedBaseSha)throw Error()
  return{status:'observed',report}
 }catch{return{status:'unavailable',reason:'invalid_report'}}
}
async function probe(mode:'probe'|'cleanup-probe',attemptId:string):Promise<ProbeReadResult>{
 const response=await invokeWorkspaceHelper(mode,{schema:'sdf.windows_probe_request.v1',attemptId})
 if(response.status==='unavailable')return{...response,attemptId}
 try{
  const report=parseWindowsSandboxProbeReport(response.value)
  if(report.attemptId!==attemptId||(mode==='probe'&&report.status==='cleaned')||(mode==='cleanup-probe'&&report.status==='ok'))throw Error()
  return{status:'observed',report}
 }catch{return{status:'unavailable',reason:'invalid_report',attemptId}}
}
export async function runWindowsSandboxHealthProbe():Promise<ProbeReadResult>{return probe('probe',randomUUID())}
export async function cleanupWindowsSandboxHealthProbe(attemptId:string):Promise<ProbeReadResult>{
 if(!isWorkspaceUuid(attemptId,true))return{status:'unavailable',reason:'input_invalid',attemptId:null}
 return probe('cleanup-probe',attemptId)
}
