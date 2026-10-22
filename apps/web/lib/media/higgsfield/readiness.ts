import 'server-only'
import {requireHiggsfieldConfig,resolveHiggsfieldConfig} from './config'
import {createHiggsfieldStore,type HiggsfieldStore,type ConnectionRecord} from './store'
import {createHiggsfieldOAuthDriver,type HiggsfieldOAuthDriver,type OAuthPayload} from './oauth'
import {openHiggsfieldReadClient,inspectReadOnlyClient,type ReadOnlyMcpClient} from './client'
import {openProviderPayload,sealProviderPayload} from './crypto'
import {HiggsfieldError,type SafeConnectionStatus,type SafeInspection} from './types'

function safe(row:ConnectionRecord|null):SafeConnectionStatus {return {status:row?.status??'disconnected',identityVerified:row?.identity_verified===true,generationEnabled:false}}
function payload(row:ConnectionRecord):OAuthPayload {
 return openProviderPayload({projectId:row.project_id,recordKind:'connection',recordId:String(row.connection_version)},row.encrypted_payload) as OAuthPayload
}
export function createHiggsfieldReadiness(store:HiggsfieldStore=createHiggsfieldStore(),driver:HiggsfieldOAuthDriver=createHiggsfieldOAuthDriver(),open:(payload:OAuthPayload,deadline:number)=>Promise<ReadOnlyMcpClient>=openHiggsfieldReadClient) {
 return {
  async status(projectId:string):Promise<SafeConnectionStatus> {
   if(!resolveHiggsfieldConfig().ok)return {status:'unavailable',identityVerified:false,generationEnabled:false}
   try{return safe(await store.readConnection(projectId))}catch{return {status:'unavailable',identityVerified:false,generationEnabled:false}}
  },
  async inspect(projectId:string):Promise<SafeInspection> {
   requireHiggsfieldConfig()
   const deadline=Date.now()+20000
   let row=await store.readConnection(projectId)
   if(!row||row.status!=='connected')return {...safe(row),creditBalance:null,quoteCredits:null,observedAt:new Date().toISOString()}
   let current=payload(row),refreshed=false
   async function refresh() {
    if(!row)throw new HiggsfieldError('connection_changed')
    const version=row.connection_version,lease=await store.acquireRefreshLease(projectId,version)
    if(!lease)throw new HiggsfieldError('busy')
    let exchanged=false
    try {
     const renewed=await driver.refresh(current,deadline);exchanged=true
     await store.saveConnectionCAS({projectId,version,leaseId:lease,payload:sealProviderPayload({projectId,recordKind:'connection',recordId:String(version+1)},renewed),subject:row.subject,identityVerified:row.identity_verified})
     current=renewed;row={...row,connection_version:version+1};refreshed=true
    } catch(e) {
     // A rotated refresh token whose local write failed cannot be retried safely.
     if(!(e instanceof HiggsfieldError && e.code==='connection_changed'))await store.markReconnect(projectId,version).catch(()=>{})
     if(e instanceof HiggsfieldError && e.code==='connection_changed')throw e
     throw new HiggsfieldError(exchanged?'storage_unavailable':'reconnect_required')
    } finally {await store.releaseRefreshLease(projectId,lease).catch(()=>{})}
   }
   if(!current.expiresAt||current.expiresAt<=Date.now()+30000)await refresh()
   async function run() {
    const client=await open(current,deadline)
    try{return await inspectReadOnlyClient(client)}finally{await client.close().catch(()=>{})}
   }
   let result
   try {result=await run()} catch(e) {
    if(!(e instanceof HiggsfieldError && e.code==='reconnect_required')||refreshed)throw e
    await refresh();result=await run()
   }
   // Do not report a live connection after a concurrent disconnect.
   const final=await store.readConnection(projectId)
   if(final?.connection_version!==row.connection_version||final.status!=='connected')throw new HiggsfieldError('connection_changed')
   return {...safe(final),...result,observedAt:new Date().toISOString()}
  },
  async disconnect(projectId:string) {
   const row=await store.readConnection(projectId)
   let previous:OAuthPayload|null=null
   try{if(row?.encrypted_payload)previous=payload(row)}catch{}
   await store.disconnectConnection(projectId)
   if(previous)await driver.revoke(previous).catch(()=>{})
  }
 }
}
export const readHiggsfieldConnectionStatus=(projectId:string)=>createHiggsfieldReadiness().status(projectId)
export const inspectHiggsfield=(projectId:string)=>createHiggsfieldReadiness().inspect(projectId)
export const disconnectHiggsfield=(projectId:string)=>createHiggsfieldReadiness().disconnect(projectId)
