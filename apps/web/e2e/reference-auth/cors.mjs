// Disposable gateway only: Storage delegates browser CORS to its API gateway.
export function fixtureStorageCors(allowedOrigin,requestOrigin){
 let u;try{u=new URL(allowedOrigin)}catch{throw Error('Expected owned loopback app origin')}
 if(u.protocol!=='http:'||!['localhost','127.0.0.1'].includes(u.hostname)||!u.port||Number(u.port)<1024||u.username||u.password||u.pathname!=='/'||u.search||u.hash||u.origin!==allowedOrigin)
  throw Error('Expected owned loopback app origin')
 if(requestOrigin!==allowedOrigin)return {}
 return {
  'access-control-allow-origin':allowedOrigin,
  'access-control-allow-methods':'GET,HEAD,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers':'authorization,apikey,content-type,x-client-info,x-upsert,cache-control',
  'access-control-expose-headers':'content-type,etag',
  vary:'Origin',
 }
}
