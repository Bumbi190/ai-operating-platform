import {execFile} from 'node:child_process'
import {createHash} from 'node:crypto'
import {lstatSync,readFileSync,realpathSync} from 'node:fs'
import {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import type {TransportReason} from './workspace-contracts.js'
export type HelperMode='prepare'|'probe'|'cleanup-probe'|'materialize-fixture'|'cleanup-materialization'
type Decoded={status:'decoded';value:unknown}|{status:'unavailable';reason:TransportReason}
export const RUNTIME='C:\\Program Files\\dotnet\\dotnet.exe'
const RUNTIME_SHA256='7967467e8bad9c686de2ab2c1994112d5331a7c3d20f0b8a4fff7480221a1c37'
export const HELPER=fileURLToPath(new URL('../../../.native/windows-workspace/OmniraBrokerWorkspace.dll',import.meta.url))
/** Fixed helper environment: no caller PATH, profile, Docker or credential variables reach the native process. */
export const HELPER_ENV=Object.freeze({NODE_ENV:'production',SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',PATH:'C:\\Windows\\System32',DOTNET_MULTILEVEL_LOOKUP:'0',DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_NOLOGO:'1'})
/** Bounded syntax pass rejects duplicate decoded keys before JSON.parse can erase them. */
export function decodeWorkspaceHelperJson(text:string,maxBytes=262144):unknown{
 if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>maxBytes)throw Error('invalid native JSON')
 let at=0
 const bad=():never=>{throw Error('invalid native JSON')}
 const ws=()=>{while(at<text.length&&/[ \t\r\n]/.test(text[at]))at++}
 const string=():string=>{
  const start=at;if(text[at++]!=='"')bad()
  while(at<text.length){const c=text[at++];if(c==='"')return JSON.parse(text.slice(start,at));if(c==='\\'){if(at>=text.length)bad();at++}}
  return bad()
 }
 const value=(depth:number):void=>{
  if(depth>16)bad();ws();const c=text[at]
  if(c==='{'){
   at++;ws();const seen=new Set<string>();if(text[at]==='}'){at++;return}
   while(true){ws();const key=string();if(seen.has(key))bad();seen.add(key);ws();if(text[at++]!==':')bad();value(depth+1);ws();const next=text[at++];if(next==='}')return;if(next!==',')bad()}
  }else if(c==='['){
   at++;ws();if(text[at]===']'){at++;return}
   while(true){value(depth+1);ws();const next=text[at++];if(next===']')return;if(next!==',')bad()}
  }else if(c==='"'){string()}
  else{const match=/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(at));if(!match)bad();at+=match![0].length}
 }
 value(0);ws();if(at!==text.length)bad();return JSON.parse(text)
}
function checkFile(path:string):void{
 if(realpathSync(path).toLowerCase()!==path.toLowerCase()||!lstatSync(path).isFile()||lstatSync(path).size>16777216)throw Error()
 for(let current=path;;){if(lstatSync(current).isSymbolicLink())throw Error();const parent=dirname(current);if(parent===current||parent==='.')break;current=parent}
}
export function checkBootstrap(){
 for(const path of [RUNTIME,HELPER,HELPER.replace(/\.dll$/,'.deps.json'),HELPER.replace(/\.dll$/,'.runtimeconfig.json'),fileURLToPath(new URL('../../../.native/windows-workspace/OmniraBrokerHost.dll',import.meta.url))])checkFile(path)
 const bytes=readFileSync(RUNTIME);if(bytes.length>16777216||createHash('sha256').update(bytes).digest('hex')!==RUNTIME_SHA256)throw Error()
}
interface HelperDeps {platform:NodeJS.Platform;checkBootstrap:()=>void;launch:typeof execFile}
/** Internal construction seam; public facade always uses the fixed instance below. */
export function createWorkspaceInvoker(deps:HelperDeps):(mode:HelperMode,payload:unknown)=>Promise<Decoded>{
 return async(mode,payload)=>{
  if(deps.platform!=='win32')return{status:'unavailable',reason:'unsupported_platform'}
  if(!['prepare','probe','cleanup-probe','materialize-fixture','cleanup-materialization'].includes(mode))return{status:'unavailable',reason:'input_invalid'}
  let input:string
  try{input=JSON.stringify(payload);if(Buffer.byteLength(input,'utf8')>4096)throw Error()}catch{return{status:'unavailable',reason:'input_invalid'}}
  try{deps.checkBootstrap()}catch{return{status:'unavailable',reason:'helper_unavailable'}}
  return new Promise(resolve=>{
   const unavailable=(reason:TransportReason)=>resolve({status:'unavailable',reason})
   try{
    const child=deps.launch(RUNTIME,[HELPER,mode],{
     shell:false,windowsHide:true,encoding:'utf8',timeout:mode==='materialize-fixture'?185000:mode==='cleanup-materialization'?35000:mode==='prepare'?125000:mode==='probe'?35000:20000,maxBuffer:262144,
     env:{...HELPER_ENV},
    },(error,stdout,stderr)=>{
     if(error){const e=error as NodeJS.ErrnoException&{killed?:boolean};unavailable(e.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER'?'response_too_large':e.killed?'deadline_exceeded':e.code==='ENOENT'?'helper_unavailable':'helper_failed');return}
     if(Buffer.byteLength(stdout,'utf8')>262144||Buffer.byteLength(stderr,'utf8')>262144){unavailable('response_too_large');return}
     if(stderr.trim()!==''){unavailable('invalid_report');return}
     try{resolve({status:'decoded',value:decodeWorkspaceHelperJson(stdout)})}catch{unavailable('invalid_report')}
    })
    if(!child.stdin){unavailable('helper_failed');return}
    child.stdin.on('error',()=>unavailable('helper_failed'));child.stdin.end(input)
   }catch{unavailable('helper_failed')}
  })
 }
}
export const invokeWorkspaceHelper=createWorkspaceInvoker({platform:process.platform,checkBootstrap,launch:execFile})
