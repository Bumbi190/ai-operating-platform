import 'server-only'
import {scoped,salesRpc,type SalesDb} from '../store'
import type {SalesPrincipal} from '../types'
import {parseHistoryRevision,parseTimingRead,parseTimingRules} from './validate'
import type {HistoryRevision,TimingReport,TimingRulesRevision} from './types'
export async function readContactTiming(db:SalesDb,p:SalesPrincipal,v:unknown):Promise<TimingReport>{const input=parseTimingRead(v);scoped(p,input.projectId);return salesRpc(db,'sales_timing_read',{p_principal:p,p_input:input})}
export async function saveContactHistory(db:SalesDb,p:SalesPrincipal,v:unknown):Promise<HistoryRevision>{const input=parseHistoryRevision(v);scoped(p,input.projectId);return salesRpc(db,'sales_timing_save_history',{p_principal:p,p_input:input})}
export async function saveTimingRules(db:SalesDb,p:SalesPrincipal,v:unknown):Promise<TimingRulesRevision>{const input=parseTimingRules(v);scoped(p,input.projectId);return salesRpc(db,'sales_timing_save_rules',{p_principal:p,p_input:input})}
