import {open,rename,unlink} from 'node:fs/promises';import {execFile} from 'node:child_process';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {canonicalJson} from '../../packages/local-text-contract/index.mjs';import {identityEnvironment} from './identity.mjs';
const helper=fileURLToPath(new URL('./scripts/journal.ps1',import.meta.url));
async function protect(action,bytes){
 if(process.platform!=='win32')throw Error('WINDOWS_JOURNAL_REQUIRED');
 return new Promise((resolve,reject)=>{const child=execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',helper,'-Action',action],{windowsHide:true,env:identityEnvironment(),timeout:10000,maxBuffer:262144},(error,stdout)=>{if(error)return reject(Error('LOCAL_JOURNAL_UNAVAILABLE'));try{const result=JSON.parse(stdout);if(typeof result.bytes!=='string')throw Error();resolve(Buffer.from(result.bytes,'base64'));}catch{reject(Error('LOCAL_JOURNAL_UNAVAILABLE'));}});child.stdin.on('error',()=>{});child.stdin.end(Buffer.from(bytes).toString('base64'));});
}
/** Cipher hooks are only for controlled tests; production uses Windows CurrentUser DPAPI.
 * No file name or cryptographic material is taken from a task. */
export function createJournal(file,{seal=b=>protect('Protect',b),unseal=b=>protect('Unprotect',b)}={}){
 async function read(){let handle;try{handle=await open(file,'r');const stat=await handle.stat();if(!stat.isFile()||stat.size<1||stat.size>262144)throw Error();const wrapper=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await handle.readFile()));if(wrapper.version!==1||wrapper.scope!=='WindowsCurrentUser'||typeof wrapper.ciphertext!=='string'||wrapper.ciphertext.length>240000)throw Error();return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await unseal(Buffer.from(wrapper.ciphertext,'base64'))));}catch(e){if(e.code==='ENOENT')return null;throw Error('LOCAL_JOURNAL_UNAVAILABLE');}finally{await handle?.close();}}
 async function write(value,{exclusive=false}={}){
  const raw=Buffer.from(canonicalJson(value));if(raw.byteLength>65536)throw Error('LOCAL_JOURNAL_TOO_LARGE');
  const bytes=Buffer.from(canonicalJson({version:1,scope:'WindowsCurrentUser',ciphertext:Buffer.from(await seal(raw)).toString('base64')}));let handle,tmp;
  try{if(exclusive){handle=await open(file,'wx',0o600);}else{tmp=file+'.'+randomUUID()+'.tmp';handle=await open(tmp,'wx',0o600);}await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;if(tmp){await rename(tmp,file);tmp=null;}}finally{await handle?.close();if(tmp)await unlink(tmp).catch(()=>{});}
 }
 return {read,write,clear:()=>unlink(file)};
}
