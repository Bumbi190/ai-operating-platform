// Test-process preload only; never imported by the production app.
function guardedFetch(transport,origins,onDenied=()=>{}){
 const allowed=new Set(origins)
 return async function(input,init){
  const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url)
  if(!allowed.has(u.origin)||u.username||u.password){
   onDenied(u.origin);throw Error('HTTP request outside owned fixture')
  }
  return transport(input,{...init,redirect:'error'})
 }
}
function installSocketGuard(origins,onDenied=()=>{}){
 const {Socket}=require('node:net')
 const allowed=new Set(origins.map(origin=>new URL(origin).port))
 const connect=Socket.prototype.connect
 Socket.prototype.connect=function(...args){
  const values=Array.isArray(args[0])?args[0]:args,first=values[0]
  const options=first&&typeof first==='object'?first:{port:first,host:typeof values[1]==='string'?values[1]:'localhost'}
  const host=options.host||options.hostname||'localhost',port=String(options.port||'')
  // TCP only, before DNS or socket creation. Covers Node fetch/node-fetch/SDK,
  // Next EdgeRuntime fetch, HTTP(S), redirects and ws in this process and its preloaded workers.
  if(options.path||!['127.0.0.1','localhost','::1'].includes(host)||!allowed.has(port)){
   onDenied('socket:'+host+':'+port);throw Error('HTTP request outside owned fixture')
  }
  return connect.apply(this,args)
 }
 return ()=>{Socket.prototype.connect=connect}
}
module.exports={guardedFetch,installSocketGuard}
if(process.env.ATLAS_REFERENCE_FETCH_ORIGINS){
 const {appendFileSync}=require('node:fs')
 const allowed=JSON.parse(process.env.ATLAS_REFERENCE_FETCH_ORIGINS)
 const deny=origin=>appendFileSync(process.env.ATLAS_REFERENCE_FETCH_DENIED,origin+'\n')
 installSocketGuard(allowed,deny)
 globalThis.fetch=guardedFetch(globalThis.fetch,allowed,deny)
}
