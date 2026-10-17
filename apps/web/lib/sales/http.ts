import {SalesError} from './types'
export const salesHeaders={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
export function failure(e:unknown){const err=e instanceof SalesError?e:new SalesError('UNAVAILABLE',503);return Response.json({code:err.code},{status:err.status,headers:salesHeaders})}
export async function readBody(r:Request):Promise<unknown>{
 const reader=r.body?.getReader();if(!reader)throw new SalesError('INVALID_BODY')
 let length=0;const chunks:Uint8Array[]=[]
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>65536){await reader.cancel();throw new SalesError('INVALID_BODY')}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw new SalesError('INVALID_BODY')}
}
