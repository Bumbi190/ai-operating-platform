import 'server-only'
import {salesRpc,scoped,type SalesDb} from '../store'
import {salesId} from '../validate'
import type {SalesPrincipal} from '../types'
import type {MailboxStatus} from './types'
import {publicStatus} from './validate'
export async function readMailboxStatus(db:SalesDb,p:SalesPrincipal,projectId:string,mailboxId:string):Promise<MailboxStatus>{scoped(p,projectId);salesId(mailboxId);return publicStatus(await salesRpc(db,'sales_mailbox_read_status',{p_principal:p,p_input:{projectId,mailboxId}}))}

export async function readMailboxReference(db:SalesDb,p:SalesPrincipal,projectId:string,workerId:string):Promise<MailboxStatus|null>{scoped(p,projectId);salesId(workerId);const r=await salesRpc<{connection:MailboxStatus|null}>(db,'sales_mailbox_reference',{p_principal:p,p_input:{projectId,workerId}});return r.connection?publicStatus(r.connection):null}
