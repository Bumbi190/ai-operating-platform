/** Abort-aware promise waiting; late resolution cannot continue a stopped request. */
export function abortable<T>(promise:PromiseLike<T>,signal:AbortSignal):Promise<T>{
 return new Promise<T>((resolve,reject)=>{
  if(signal.aborted){Promise.resolve(promise).catch(()=>{});reject(Error('aborted'));return}
  const abort=()=>{signal.removeEventListener('abort',abort);reject(Error('aborted'))}
  signal.addEventListener('abort',abort,{once:true})
  Promise.resolve(promise).then(v=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(Error('aborted'));else resolve(v)},()=>{signal.removeEventListener('abort',abort);reject(Error('request failed'))})
 })
}
function strict(text:string):unknown{
 let at=0;const bad=():never=>{throw Error('invalid JSON')},ws=()=>{while(/[ \t\r\n]/.test(text[at]??'x'))at++}
 const string=():string=>{const start=at;if(text[at++]!=='"')return bad();while(at<text.length){const c=text[at++];if(c==='"')return JSON.parse(text.slice(start,at));if(c==='\\')at++}return bad()}
 function value(depth:number):void{
  if(depth>8)bad();ws()
  if(text[at]==='{'){at++;ws();const keys=new Set<string>();if(text[at]==='}'){at++;return}
   for(;;){ws();const key=string();if(keys.has(key))bad();keys.add(key);ws();if(text[at++]!==':')bad();value(depth+1);ws();const end=text[at++];if(end==='}')return;if(end!==',')bad()}
  }else if(text[at]==='['){at++;ws();if(text[at]===']'){at++;return}for(;;){value(depth+1);ws();const end=text[at++];if(end===']')return;if(end!==',')bad()}}
  else if(text[at]==='"')string()
  else{const match=/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(at));if(!match)bad();at+=match![0].length}
 }
 value(0);ws();if(at!==text.length)bad();return JSON.parse(text)
}
export async function readBoundedJsonResponse(response:Response,signal:AbortSignal):Promise<unknown>{
 if(signal.aborted)throw Error('aborted')
 const declared=response.headers.get('content-length');if(declared!==null&&Number(declared)>16384){void response.body?.cancel().catch(()=>{});throw Error('response bound')}
 const reader=response.body?.getReader();if(!reader)throw Error('response missing')
 const chunks:Uint8Array[]=[];let bytes=0
 try{
  for(;;){const next=await abortable(reader.read(),signal);if(next.done)break;bytes+=next.value.byteLength;if(bytes>16384)throw Error('response bound');chunks.push(next.value)}
  if(signal.aborted)throw Error('aborted')
  return strict(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))
 }catch{void reader.cancel().catch(()=>{});throw Error('invalid response')}
 finally{reader.releaseLock()}
}
