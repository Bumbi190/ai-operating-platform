import {execFile} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {parseWorkerEnvelope,sha256,workerSigningPayload,isUuid} from '../../packages/local-text-contract/index.mjs';
const helper=fileURLToPath(new URL('./scripts/identity.ps1',import.meta.url));
const pattern=/^Omnira-Atlas-LocalText-(?:test-)?([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;
function keyId(name){const m=typeof name==='string'&&pattern.exec(name);if(!m||!isUuid(m[1]))throw Error('INVALID_IDENTITY_NAME');return m[1];}
function invoke(action,name,input){
 keyId(name);if(process.platform!=='win32')throw Error('WINDOWS_IDENTITY_REQUIRED');
 return new Promise((resolve,reject)=>{const child=execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',helper,'-Action',action,'-KeyName',name],{windowsHide:true,env:identityEnvironment(),timeout:10000,maxBuffer:16384},(error,stdout)=>{if(error)return reject(Error('LOCAL_IDENTITY_UNAVAILABLE'));try{resolve(JSON.parse(stdout.trim()));}catch{reject(Error('LOCAL_IDENTITY_UNAVAILABLE'));}});child.stdin.on('error',()=>{});child.stdin.end(input===undefined?'':JSON.stringify(input));});
}
export async function createIdentity(name){const id=keyId(name),r=await invoke('Generate',name);if(!r?.publicJwk||r.machineKey!==false||r.exportPolicy!=='None')throw Error('LOCAL_IDENTITY_UNPROTECTED');return {keyId:id,publicJwk:r.publicJwk};}
export async function inspectIdentity(name){return invoke('Inspect',name);}
export async function signEnvelope(input,body,name='Omnira-Atlas-LocalText-'+input.keyId){
 if(keyId(name)!==input.keyId||!(body instanceof Uint8Array)||body.byteLength>65536||input.bodySha256!==sha256(body))throw Error('INVALID_SIGNATURE_INPUT');
 const payload=workerSigningPayload(input);const r=await invoke('Sign',name,{payloadBase64:Buffer.from(payload).toString('base64')});return parseWorkerEnvelope({...input,signature:r.signature});
}
export async function deleteTestIdentity(name){keyId(name);if(!name.startsWith('Omnira-Atlas-LocalText-test-'))throw Error('TEST_IDENTITY_REQUIRED');return invoke('DeleteTest',name);}

export function identityEnvironment(source=process.env){const allowed=['SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA','ProgramFiles','CommonProgramFiles','SystemDrive'];const keys=Object.keys(source);return Object.fromEntries(allowed.flatMap(k=>{const actual=keys.find(x=>x.toLowerCase()===k.toLowerCase());return actual&&typeof source[actual]==='string'?[[k,source[actual]]]:[];}));}
