import 'server-only'
import {fields,salesId} from '../validate'
import {scoped,salesRpc,type SalesDb} from '../store'
import type {SalesPrincipal} from '../types'
import type {InboxConfig,InboxMessage,InboxPage} from './types'
import {parseInboxConfig,pageCursor} from './validate'
export async function configureInbox(db:SalesDb,p:SalesPrincipal,value:unknown):Promise<InboxConfig>{const input=parseInboxConfig(value);scoped(p,input.projectId);return salesRpc(db,'sales_inbox_configure_inbox',{p_principal:p,p_input:input})}
export async function readInbox(db:SalesDb,p:SalesPrincipal,value:unknown):Promise<InboxPage>{fields(value,['projectId','mailboxId','cursor']);const input={projectId:salesId(value.projectId),mailboxId:salesId(value.mailboxId),cursor:pageCursor(value.cursor)};scoped(p,input.projectId);return salesRpc(db,'sales_inbox_read_inbox',{p_principal:p,p_input:input})}
export async function readInboxMessage(db:SalesDb,p:SalesPrincipal,value:unknown):Promise<InboxMessage>{fields(value,['projectId','messageId']);const input={projectId:salesId(value.projectId),messageId:salesId(value.messageId)};scoped(p,input.projectId);return salesRpc(db,'sales_inbox_read_message',{p_principal:p,p_input:input})}
