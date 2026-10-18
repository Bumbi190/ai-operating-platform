import {it,expect} from 'vitest'
import {confirmReplySend,readReplySend,cancelReplySend} from './store'
const projectId='8f673c09-1c8f-4d78-876e-4c14bf1c89b3',revisionId='91736c50-3db6-4d68-86f8-1660672fed0f'
const principal={userId:'d63a09fb-448e-41b8-9fb2-9a608f5f1800',allowedProjectIds:[projectId]}
const input={projectId,revisionId,expectedRevisionHash:'a'.repeat(64),expectedMailboxGeneration:6,idempotencyKey:'b1131538-9775-4f03-bede-9cb86d49f789'}
function fixture(){const calls:{name:string,args:unknown}[]=[];const receipt={id:revisionId,status:'queued'};return {calls,receipt,db:{rpc:async(name:string,args:unknown)=>{calls.push({name,args});return {data:receipt,error:null}}} as any}}
it('owner confirmation sends only parsed revision identity to the fixed RPC',async()=>{const f=fixture();expect(await confirmReplySend(f.db,principal,input)).toEqual(f.receipt);expect(f.calls).toEqual([{name:'sales_send_confirm',args:{p_principal:principal,p_input:input}}])})
it('foreign project never reaches the database',async()=>{const f=fixture();await expect(confirmReplySend(f.db,{...principal,allowedProjectIds:[]},input)).rejects.toThrow('NOT_FOUND');expect(f.calls).toEqual([])})
it('a model supplied address never reaches the database',async()=>{const f=fixture();await expect(confirmReplySend(f.db,principal,{...input,toEmail:'other@example.se'})).rejects.toThrow('INVALID_BODY');expect(f.calls).toEqual([])})
it('status read cannot authorize sending',async()=>{const f=fixture();const v={projectId,sendJobId:revisionId};await readReplySend(f.db,principal,v);expect(f.calls).toEqual([{name:'sales_send_read',args:{p_principal:principal,p_input:v}}])})
it('cancel calls only the revision-bound cancel RPC',async()=>{const f=fixture();const v={projectId,sendJobId:revisionId,expectedRevisionHash:input.expectedRevisionHash};await cancelReplySend(f.db,principal,v);expect(f.calls).toEqual([{name:'sales_send_cancel',args:{p_principal:principal,p_input:v}}])})
