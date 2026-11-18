import 'server-only'
import type {HostPrincipal,HostStatus} from './host-types'
import type {SalesPrincipal} from './types'
import {SalesError} from './types'
import {salesId} from './validate'
import {salesRpc,scoped,type SalesDb} from './store'
export async function authenticateSalesHost(db:SalesDb,tokenHash:string):Promise<HostPrincipal>{
 const p=await salesRpc<HostPrincipal>(db,'sales_host_identity',{p_token_hash:tokenHash})
 if(!Number.isSafeInteger(p.generation)||p.generation<1)throw new SalesError('UNAVAILABLE',503)
 return {ownerId:salesId(p.ownerId),projectId:salesId(p.projectId),workerId:salesId(p.workerId),generation:p.generation}
}
export function publicHostStatus(v:HostStatus):HostStatus {
 return {workerId:salesId(v.workerId),managed:v.managed,generation:v.generation,desiredState:v.desiredState,connectionState:v.connectionState,cliState:v.cliState,lastSeenAt:v.lastSeenAt,workerExpiresAt:v.workerExpiresAt,executionPaused:v.executionPaused,reconnectRequested:v.reconnectRequested}
}
export async function readHostStatus(db:SalesDb,p:SalesPrincipal,projectId:string,workerId:string):Promise<HostStatus>{
 scoped(p,projectId);salesId(workerId)
 return publicHostStatus(await salesRpc(db,'sales_host_read_status',{p_principal:p,p_input:{projectId,workerId}}))
}
export async function manageHost(db:SalesDb,p:SalesPrincipal,projectId:string,workerId:string,action:'pause'|'resume'|'reconnect'):Promise<HostStatus>{
 scoped(p,projectId);salesId(workerId)
 return publicHostStatus(await salesRpc(db,'sales_host_set_desired',{p_principal:p,p_input:{projectId,workerId,action}}))
}

export async function listHostStatus(db:SalesDb,p:SalesPrincipal,projectId:string):Promise<HostStatus[]>{scoped(p,projectId);const rows=await salesRpc<HostStatus[]>(db,'sales_host_list_status',{p_principal:p,p_input:{projectId}});return rows.map(publicHostStatus)}
