import {invokeWorkspaceHelper} from './workspace-helper.js'
import {isWorkspaceUuid,parseWindowsWorkspaceRequest,type WorkspaceRequest} from './workspace-contracts.js'
import {parseMaterializationReport,type MaterializationReadResult} from './source-contracts.js'
interface SourceDeps{platform:NodeJS.Platform;invoke:typeof invokeWorkspaceHelper}
/**
 * Internal construction seam for identity-checked cleanup of an already reserved attempt.
 * Execution is NOT offered here: materialization runs only through the guarded native stop bridge
 * (apps/code-broker/src/runtime/native-stop-bridge.ts), which keeps the helper's stop channel open.
 */
export function createSourceFixtureRunner(deps:SourceDeps){
 async function cleanup(input:unknown,attemptId:string):Promise<MaterializationReadResult>{
  let request:WorkspaceRequest
  try{request=parseWindowsWorkspaceRequest(input);if(!isWorkspaceUuid(attemptId,true))throw Error()}catch{return{status:'unavailable',reason:'input_invalid',attemptId:null}}
  if(deps.platform!=='win32')return{status:'unavailable',reason:'unsupported_platform',attemptId:null}
  const result=await deps.invoke('cleanup-materialization',{...request,schema:'sdf.windows_materialization_cleanup.v1',attemptId})
  if(result.status==='unavailable')return{...result,attemptId}
  try{
   const report=parseMaterializationReport(result.value)
   if(report.attemptId!==attemptId||(['workId','repositoryId','pinnedBaseSha','admissionHash','claimId','fence'] as const).some(k=>report.binding[k]!==request[k])||report.status==='verified_for_fixture'||report.status==='stopped'||report.manifest!==null)throw Error()
   return{status:'observed',report}
  }catch{return{status:'unavailable',reason:'invalid_report',attemptId}}
 }
 return{cleanup}
}
const fixed=createSourceFixtureRunner({platform:process.platform,invoke:invokeWorkspaceHelper})
export const cleanupWindowsSourceFixture=fixed.cleanup
