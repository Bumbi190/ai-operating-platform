import 'server-only'
import {SalesError,type SalesPrincipal} from './types'
import {scoped,type SalesDb} from './store'

// This is a sales-only detail read. Generic get_records remains a short list preview.
export async function readSalesProjectNote(db:SalesDb,p:SalesPrincipal,projectId:string,noteKey:unknown){
 scoped(p,projectId)
 if(typeof noteKey!=='string'||noteKey.length>200||!(/^[a-z0-9_-]+\.sales\.[a-z0-9_.-]+$/).test(noteKey)||(/[\u0000-\u001f\u007f]/).test(noteKey)){
  throw new SalesError('INVALID_BODY')
 }
 const {data,error}=await db.from('memories').select('id,key,value,source,updated_at')
  .eq('project_id',projectId).eq('key',noteKey).maybeSingle()
 if(error)throw new SalesError('UNAVAILABLE',503)
 if(!data)throw new SalesError('NOT_FOUND',404)
 if(data.key!==noteKey||typeof data.value!=='string'||Buffer.byteLength(data.value,'utf8')>65536){
  throw new SalesError('UNAVAILABLE',503)
 }
 return {
  projectId,
  note:{id:data.id,key:data.key,value:data.value,source:data.source,updatedAt:data.updated_at},
  sourceType:'saved_project_note',
  contentTruncated:false,
  inboxRead:false,
  customerSendingEnabled:false,
 }
}

export async function readSalesProjectNoteIndex(db:SalesDb,p:SalesPrincipal,projectId:string){
 scoped(p,projectId)
 const unavailable={state:'unavailable' as const,notes:[],hasMore:null}
 try{
  const {data,error}=await db.from('memories').select('key,updated_at').eq('project_id',projectId)
   .like('key','%.sales.%').order('updated_at',{ascending:false}).limit(26)
  if(error||!Array.isArray(data)||data.some(row=>typeof row.key!=='string'||row.key.length>200||!(/^[a-z0-9_-]+\.sales\.[a-z0-9_.-]+$/).test(row.key)||(/[\u0000-\u001f\u007f]/).test(row.key)||typeof row.updated_at!=='string'))return unavailable
  return {state:'ok' as const,notes:data.slice(0,25).map(row=>({key:row.key,updatedAt:row.updated_at})),hasMore:data.length>25}
 }catch{return unavailable}
}
