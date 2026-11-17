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

// Test double for Next's optional online update status, never a network allowlist.
// A 503 makes Next report the actual installed version with staleness "unknown".
function withOfflineNextVersionCheck(transport,{installedVersion,lockedVersion,onCheck=()=>{}}){
 if(typeof installedVersion!=='string'||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(installedVersion)||installedVersion!==lockedVersion)
  throw Error('Installed Next version must match package-lock')
 return async function(input,init){
  // Only Next's exact, option-free GET is simulated. Requests, headers, bodies,
  // methods, query strings and other registry paths still reach the strict guard.
  if(input==='https://registry.npmjs.org/-/package/next/dist-tags'&&init===undefined){
   onCheck({installedVersion,lockedVersion,status:503,staleness:'unknown'})
   return new Response(null,{status:503,headers:{'cache-control':'no-store'}})
  }
  return transport(input,init)
 }
}
module.exports={guardedFetch,installSocketGuard,withOfflineNextVersionCheck}
if(process.env.ATLAS_REFERENCE_FETCH_ORIGINS){
 const {appendFileSync}=require('node:fs')
 const allowed=JSON.parse(process.env.ATLAS_REFERENCE_FETCH_ORIGINS)
 const deny=origin=>appendFileSync(process.env.ATLAS_REFERENCE_FETCH_DENIED,origin+'\n')
 installSocketGuard(allowed,deny)
 globalThis.fetch=guardedFetch(globalThis.fetch,allowed,deny)
 if(process.env.ATLAS_REFERENCE_NEXT_VERSION_METADATA){
  if(process.env.ATLAS_REFERENCE_TEST_MODE!=='isolated-local'||process.env.ATLAS_REFERENCE_NEXT_VERSION_METADATA!=='offline'||!process.env.ATLAS_REFERENCE_NEXT_VERSION_RECEIPT)
   throw Error('Explicit isolated-local offline version fixture required')
  const {readFileSync}=require('node:fs'),{resolve}=require('node:path')
  const root=resolve(__dirname,'../../../..')
  const installedVersion=require(require.resolve('next/package.json',{paths:[root]})).version
  const lockedVersion=JSON.parse(readFileSync(resolve(root,'package-lock.json'),'utf8')).packages['node_modules/next']?.version
  globalThis.fetch=withOfflineNextVersionCheck(globalThis.fetch,{installedVersion,lockedVersion,
   onCheck:receipt=>appendFileSync(process.env.ATLAS_REFERENCE_NEXT_VERSION_RECEIPT,JSON.stringify(receipt)+'\n')})
 }
}
