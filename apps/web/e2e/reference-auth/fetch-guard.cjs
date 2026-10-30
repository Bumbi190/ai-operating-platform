// Test-process preload only; never imported by the production app.
function guardedFetch(transport,origins,onDenied=()=>{}){
 const allowed=new Set(origins)
 return async function(input,init){
  const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url)
  if(!allowed.has(u.origin)||u.username||u.password){
   onDenied(u.origin)
   throw Error('HTTP request outside owned fixture')
  }
  return transport(input,{...init,redirect:'error'})
 }
}
module.exports={guardedFetch}
if(process.env.ATLAS_REFERENCE_FETCH_ORIGINS){
 const {appendFileSync}=require('node:fs')
 const allowed=JSON.parse(process.env.ATLAS_REFERENCE_FETCH_ORIGINS)
 globalThis.fetch=guardedFetch(globalThis.fetch,allowed,origin=>{
  appendFileSync(process.env.ATLAS_REFERENCE_FETCH_DENIED,origin+'\n')
 })
}
