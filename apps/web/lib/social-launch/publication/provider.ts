import 'server-only'
export type ManualCredential={channel:'facebook'|'instagram';accountId:string;token:string;apiBase:string}
export class ManualProviderError extends Error{
 constructor(public code:'provider_denied'|'provider_unavailable'|'invalid_response',public outcome:'rejected'|'unknown'='unknown'){super(code)}
}
export class MetaManualProvider{
 constructor(private fetcher:(url:string,init:RequestInit)=>Promise<Response>=fetch,private options:{signal?:AbortSignal}={}){}
 withSignal(signal:AbortSignal){return new MetaManualProvider(this.fetcher,{signal:this.options.signal?AbortSignal.any([this.options.signal,signal]):signal})}
 private base(c:ManualCredential){
  try{const u=new URL(c.apiBase);if(u.protocol!=='https:'||!['graph.facebook.com','graph.instagram.com'].includes(u.hostname)||u.port||u.username||u.password||u.search||u.hash||!/^\/v[0-9]{1,2}[.][0-9]+$/.test(u.pathname)||!(/^[0-9]{1,80}$/).test(c.accountId)||!c.token||c.token.length>16384||/[\u0000-\u0020\u007f]/.test(c.token))throw Error();if(c.channel==='facebook'&&u.hostname!=='graph.facebook.com')throw Error();return u.origin+u.pathname}catch{throw new ManualProviderError('invalid_response')}
 }
 private async json(c:ManualCredential,path:string,body?:URLSearchParams,timeoutMs=8000):Promise<Record<string,unknown>>{
  const url=this.base(c)+'/'+path
  try{
   const response=await this.fetcher(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+c.token,...(body?{'content-type':'application/x-www-form-urlencoded'}:{})},body,redirect:'error',cache:'no-store',signal:this.options.signal?AbortSignal.any([this.options.signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs)})
   const reader=response.body?.getReader();if(!reader)throw new ManualProviderError('invalid_response')
   let size=0;const chunks:Uint8Array[]=[]
   try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new ManualProviderError('invalid_response')}chunks.push(value)}}finally{reader.releaseLock()}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
   let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw new ManualProviderError('invalid_response')}
   if(!value||typeof value!=='object'||Array.isArray(value))throw new ManualProviderError('invalid_response')
   const data=value as Record<string,unknown>,error=data.error
   if(!response.ok||error){
    if([400,401,403].includes(response.status)&&error&&typeof error==='object'&&Number.isSafeInteger((error as {code?:unknown}).code))throw new ManualProviderError('provider_denied','rejected')
    throw new ManualProviderError('provider_unavailable')
   }
   return data
  }catch(e){if(e instanceof ManualProviderError)throw e;throw new ManualProviderError('provider_unavailable')}
 }
 private id(v:unknown,composite=false){if(typeof v!=='string'||!(composite?/^[0-9]{1,80}(_[0-9]{1,80})?$/:/^[0-9]{1,80}$/).test(v))throw new ManualProviderError('invalid_response');return v}
 private imageUrl(v:string){try{const u=new URL(v);if(u.origin!=='https://app.omniraos.se'||u.pathname!=='/api/social-publication-media'||u.username||u.password||u.hash)throw Error();return v}catch{throw new ManualProviderError('invalid_response')}}
 async facebook(c:ManualCredential,p:{text:string;linkUrl:string|null;imageUrl:string|null}):Promise<{providerId:string;permalink:string}>{
  if(c.channel!=='facebook')throw new ManualProviderError('invalid_response')
  const body=new URLSearchParams({message:p.text,published:'true'})
  if(p.imageUrl)body.set('url',this.imageUrl(p.imageUrl));else if(p.linkUrl)body.set('link',p.linkUrl)
  const result=await this.json(c,c.accountId+(p.imageUrl?'/photos':'/feed'),body,30000),providerId=this.id(result.post_id??result.id,true)
  return {providerId,permalink:'https://www.facebook.com/'+providerId}
 }
 async createImage(c:ManualCredential,url:string,caption:string):Promise<string>{
  if(c.channel!=='instagram')throw new ManualProviderError('invalid_response')
  return this.id((await this.json(c,c.accountId+'/media',new URLSearchParams({image_url:this.imageUrl(url),caption}))).id)
 }
 async status(c:ManualCredential,id:string):Promise<'FINISHED'|'IN_PROGRESS'|'PUBLISHED'|'ERROR'|'EXPIRED'>{
  const value=(await this.json(c,this.id(id)+'?fields=status_code')).status_code
  if(!['FINISHED','IN_PROGRESS','PUBLISHED','ERROR','EXPIRED'].includes(value as string))throw new ManualProviderError('invalid_response')
  return value as 'FINISHED'|'IN_PROGRESS'|'PUBLISHED'|'ERROR'|'EXPIRED'
 }
 async publish(c:ManualCredential,id:string):Promise<string>{return this.id((await this.json(c,c.accountId+'/media_publish',new URLSearchParams({creation_id:this.id(id)}))).id)}
 async permalink(c:ManualCredential,id:string):Promise<string|null>{
  try{const value=(await this.json(c,this.id(id)+'?fields=permalink')).permalink;if(typeof value!=='string')return null;const u=new URL(value);return u.origin==='https://www.instagram.com'&&!u.username&&!u.password&&/^\/(p|reel)\/[^/]+\/?$/.test(u.pathname)?u.toString():null}catch{return null}
 }
}
