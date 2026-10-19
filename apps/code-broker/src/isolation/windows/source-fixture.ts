import {randomUUID} from 'node:crypto'
import {invokeWorkspaceHelper} from './workspace-helper.js'
import {isWorkspaceUuid,parseWindowsWorkspaceRequest,type WorkspaceRequest} from './workspace-contracts.js'
import {parseMaterializationReport,type MaterializationReadResult} from './source-contracts.js'
import {reserveWindowsSourceAttempt} from './source-attempts.js'
interface SourceDeps{platform:NodeJS.Platform;nextAttempt:()=>string;reserve:(request:WorkspaceRequest,attempt:string)=>void;invoke:typeof invokeWorkspaceHelper}
/** Internal construction seam. Public functions below always use the fixed dependencies. */
export function createSourceFixtureRunner(deps:SourceDeps){
 async function call(input:unknown,cleanup:boolean,provided?:string):Promise<MaterializationReadResult>{
  let request:WorkspaceRequest,attemptId:string|null=null
  try{request=parseWindowsWorkspaceRequest(input);if(cleanup&&!isWorkspaceUuid(provided,true))throw Error()}catch{return{status:'unavailable',reason:'input_invalid',attemptId:null}}
  if(deps.platform!=='win32')return{status:'unavailable',reason:'unsupported_platform',attemptId:null}
  attemptId=cleanup?provided!:deps.nextAttempt();if(!isWorkspaceUuid(attemptId,true))return{status:'unavailable',reason:'input_invalid',attemptId:null}
  if(!cleanup)try{deps.reserve(request,attemptId)}catch{return{status:'unavailable',reason:'helper_failed',attemptId}}
  const result=await deps.invoke(cleanup?'cleanup-materialization':'materialize-fixture',{...request,schema:cleanup?'sdf.windows_materialization_cleanup.v1':'sdf.windows_materialization_request.v1',attemptId})
  if(result.status==='unavailable')return{...result,attemptId}
  try{
   const report=parseMaterializationReport(result.value)
   if(report.attemptId!==attemptId||(['workId','repositoryId','pinnedBaseSha','admissionHash','claimId','fence'] as const).some(k=>report.binding[k]!==request[k])||(cleanup?(report.status==='verified_for_fixture'||report.manifest!==null):report.status==='cleaned'))throw Error()
   return{status:'observed',report}
  }catch{return{status:'unavailable',reason:'invalid_report',attemptId}}
 }
 return{run:(input:unknown)=>call(input,false),cleanup:(input:unknown,attemptId:string)=>call(input,true,attemptId)}
}
const fixed=createSourceFixtureRunner({platform:process.platform,nextAttempt:randomUUID,reserve:reserveWindowsSourceAttempt,invoke:invokeWorkspaceHelper})
export const runWindowsSourceFixture=fixed.run
export const cleanupWindowsSourceFixture=fixed.cleanup
