import 'server-only'
import {scoped,salesRpc,type SalesDb} from '../store'
import type {SalesPrincipal} from '../types'
import {parseConfirmSend,parseSendRead,parseSendCancel} from './validate'
import type {SendJobSummary} from './types'
export async function confirmReplySend(db:SalesDb,p:SalesPrincipal,v:unknown):Promise<SendJobSummary>{const input=parseConfirmSend(v);scoped(p,input.projectId);return salesRpc(db,'sales_send_confirm',{p_principal:p,p_input:input})}
export async function readReplySend(db:SalesDb,p:SalesPrincipal,v:unknown):Promise<SendJobSummary>{const input=parseSendRead(v);scoped(p,input.projectId);return salesRpc(db,'sales_send_read',{p_principal:p,p_input:input})}
export async function cancelReplySend(db:SalesDb,p:SalesPrincipal,v:unknown):Promise<SendJobSummary>{const input=parseSendCancel(v);scoped(p,input.projectId);return salesRpc(db,'sales_send_cancel',{p_principal:p,p_input:input})}
