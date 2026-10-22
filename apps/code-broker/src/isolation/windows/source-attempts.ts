import {constants,closeSync,existsSync,fsyncSync,lstatSync,mkdirSync,openSync,realpathSync,writeFileSync} from 'node:fs'
import {dirname,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {isWorkspaceUuid,parseWindowsWorkspaceRequest} from './workspace-contracts.js'
const ROOT=fileURLToPath(new URL('../../../.native/windows-workspace/attempts',import.meta.url))
function checkDirectory(path:string){
 for(let current=path;;){const s=lstatSync(current);if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(current).toLowerCase()!==current.toLowerCase())throw Error('unsafe attempt storage');const parent=dirname(current);if(parent===current)break;current=parent}
}
/** Fixed infrastructure reservation, flushed before helper launch; no caller path. */
export function reserveWindowsSourceAttempt(input:unknown,attemptId:string):void{
 const request=parseWindowsWorkspaceRequest(input);if(!isWorkspaceUuid(attemptId,true))throw Error('invalid attempt')
 checkDirectory(dirname(ROOT));if(!existsSync(ROOT))try{mkdirSync(ROOT,{recursive:false,mode:0o700})}catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e}checkDirectory(ROOT)
 const payload={...request,schema:'sdf.windows_materialization_reservation.v1',attemptId},text=JSON.stringify(payload)
 if(Buffer.byteLength(text,'utf8')>4096)throw Error('attempt bound')
 const file=openSync(join(ROOT,attemptId+'.reserved.json'),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600)
 try{writeFileSync(file,text,'utf8');fsyncSync(file)}finally{closeSync(file)}
}
