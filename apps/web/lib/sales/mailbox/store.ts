import 'server-only'
import {salesRpc,scoped,type SalesDb} from '../store'
import {salesId} from '../validate'
import type {SalesPrincipal} from '../types'
import type {MailboxStatus} from './types'
import {publicStatus} from './validate'
export async function readMailboxStatus(db:SalesDb,p:SalesPrincipal,projectId:string,mailboxId:string):Promise<MailboxStatus>{scoped(p,projectId);salesId(mailboxId);return publicStatus(await salesRpc(db,'sales_mailbox_read_status',{p_principal:p,p_input:{projectId,mailboxId}}))}
