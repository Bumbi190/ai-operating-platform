import {describe,it,expect,vi} from 'vitest'
import {SALES_TOOLS,handleSalesTool} from '@/lib/sales/atlas-tools'
const projectId='10000000-0000-4000-8000-000000000001',workerId='60000000-0000-4000-8000-000000000001',conversation='50000000-0000-4000-8000-000000000001',p={userId:'20000000-0000-4000-8000-000000000001',allowedProjectIds:[projectId]}
const status={workerId,managed:true,generation:1,desiredState:'paused',connectionState:'online',cliState:'blocked',lastSeenAt:null,workerExpiresAt:'2026-10-18T13:00:00Z',executionPaused:false,reconnectRequested:false}
function db(){return {rpc:vi.fn(async(name:string)=>({data:name==='sales_validate_conversation'?true:name==='sales_host_list_status'?[status]:status,error:null}))}}
describe('Atlas authorized host control',()=>{
 it('exposes status and bounded management without owner grant capability',()=>{const names=SALES_TOOLS.map(t=>t.name);expect(names).toContain('get_sales_connection_status');expect(names).toContain('manage_sales_connection');expect(names).not.toContain('authorize_managed_worker')})
 it('returns real paused/blocked status',async()=>expect(await handleSalesTool('get_sales_connection_status',{projectId},p,conversation,db() as never,()=>true)).toEqual({connections:[status],sendingEnabled:false}))
 it.each(['pause','resume','reconnect'])('allows only the preauthorized host action %s',async action=>expect(await handleSalesTool('manage_sales_connection',{projectId,workerId,action},p,conversation,db() as never,()=>true)).toEqual(status))
 it.each([{projectId,workerId,action:'shell'},{projectId,workerId,action:'resume',token:'secret'},{projectId,workerId,action:'resume',command:'whoami'}])('rejects arbitrary capability %j',async input=>{const d=db();expect(await handleSalesTool('manage_sales_connection',input,p,conversation,d as never,()=>true)).toMatchObject({code:'INVALID_BODY'});expect(d.rpc).not.toHaveBeenCalled()})
 it('requires bound conversation before host control',async()=>{const d=db();expect(await handleSalesTool('manage_sales_connection',{projectId,workerId,action:'pause'},p,null,d as never,()=>true)).toMatchObject({code:'NOT_FOUND'});expect(d.rpc).not.toHaveBeenCalled()})
 it('preserves feature-off gate',async()=>{const d=db();expect(await handleSalesTool('get_sales_connection_status',{projectId},p,conversation,d as never,()=>false)).toMatchObject({code:'NOT_FOUND'});expect(d.rpc).not.toHaveBeenCalled()})
 it('cannot create or revive an unapproved/revoked host',async()=>{const rpc=vi.fn().mockResolvedValueOnce({data:true,error:null}).mockResolvedValueOnce({data:null,error:{code:'P0002'}});expect(await handleSalesTool('manage_sales_connection',{projectId,workerId,action:'resume'},p,conversation,{rpc} as never,()=>true)).toMatchObject({code:'NOT_FOUND'})})
})
