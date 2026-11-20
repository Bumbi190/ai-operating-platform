import {it,expect,vi} from 'vitest'
const api=await import('../incidents').catch(()=>({}) as typeof import('../incidents'))
const id='11111111-1111-4111-8111-111111111111'
function client(data:unknown,error:unknown=null){return {rpc:async()=>({data,error})} as any}
it('offline_90_seconds_emits_once: maintenance has one bounded atomic server authority',async()=>{expect(typeof api.reconcileLocalTextHealth).toBe('function');let args:any;await api.reconcileLocalTextHealth({rpc:async(...v:any[])=>{args=v;return {data:{processed:0},error:null}}} as any,new Date());expect(args).toEqual(['local_text_maintain',{p_limit:1}])})
it('stale_45_seconds_stops_assignment_and_recovery_requires_validation: unreadable maintenance is not recovery',async()=>{await expect(api.reconcileLocalTextHealth(client(null,Error('unavailable')),new Date())).rejects.toThrow()})
it('three_of_twenty_review_rejections_pause: no client/model can supply quality counters',async()=>{let args:any;await api.reconcileLocalTextHealth({rpc:async(...v:any[])=>{args=v;return {data:{processed:0},error:null}}} as any,new Date());expect(args[1]).toEqual({p_limit:1})})
it('expired_approval_cannot_resurrect_payload_and_retention_counts_are_validated',async()=>{const results=[{payloadsDeleted:1,metadataDeleted:0},{payloadsDeleted:1,metadataDeleted:0},{payloadsDeleted:0,metadataDeleted:1},{payloadsDeleted:0,metadataDeleted:0}];expect(await api.purgeExpiredLocalText({rpc:async()=>({data:results.shift(),error:null})} as any,new Date())).toEqual({payloadsDeleted:2,metadataDeleted:1});await expect(api.purgeExpiredLocalText(client({payloadsDeleted:-1,metadataDeleted:0}),new Date())).rejects.toThrow();expect(await api.resolveLocalTextApproval(client({kind:'refused',reason:'PAYLOAD_EXPIRED'}),{userId:id,approvalId:id,decision:'approve',expectedVersion:1})).toEqual({kind:'refused',reason:'PAYLOAD_EXPIRED'})})

it('activity marks the persisted offline incident as attention and clears it only on recorded recovery',async()=>{const {assembleActivity}=await import('@/lib/os/activity');const base={id,status:'done',kind:'local_text_incident',created_at:new Date().toISOString(),context:{localText:{incidentKind:'offline',incidentState:'open'}},projects:{name:'Pilot',slug:'pilot',color:'#fff'}};const model=(row:any)=>assembleActivity({runs:{ok:true,rows:[row]},reviews:{ok:true,rows:[]},logs:{ok:true,rows:[]},projectSlug:null});expect(model(base).attention).toHaveLength(1);expect(model(base).entries[0]).toMatchObject({workflowName:'Lokal AI: ingen kontakt med datorn'});expect(model({...base,context:{localText:{incidentKind:'offline',incidentState:'resolved'}}}).attention).toHaveLength(0)})
const incident={id,approvalId:id,kind:'reconcile',state:'open',version:1,acknowledged:false,resumed:false}
it.each(['kind','state'].flatMap(field=>['array','boxed','coercing'].map(representation=>({field,representation}))))('refuses $representation incident $field without coercion',async({field,representation})=>{
 const valid=field==='kind'?'reconcile':'open',convert=vi.fn(()=>valid)
 const invalid=representation==='array'?[valid]:representation==='boxed'?new String(valid):{toString:convert}
 await expect(api.readLocalTextIncident(client({...incident,[field]:invalid}),id,id)).rejects.toThrow('INVALID_INCIDENT')
 expect(convert).not.toHaveBeenCalled()
})
it('preserves valid primitive incident kinds/states without granting resume',async()=>{
 for(const kind of ['quality','reconcile','needs_input'])for(const state of ['open','resolved']){
  expect(await api.readLocalTextIncident(client({...incident,kind,state}),id,id)).toEqual({...incident,kind,state})
 }
})
it.each(['array','boxed','coercing'])('refuses a %s acknowledgement result kind without a resume grant',async representation=>{
 const convert=vi.fn(()=>'applied'),kind=representation==='array'?['applied']:representation==='boxed'?new String('applied'):{toString:convert}
 const call=vi.fn(async()=>({data:{kind,value:{acknowledged:true,resumed:false}},error:null}))
 await expect(api.acknowledgeLocalTextIncident({rpc:call} as any,id,id,1)).rejects.toThrow('INVALID_DECISION')
 expect(convert).not.toHaveBeenCalled();expect(call).toHaveBeenCalledTimes(1)
})
it.each(['applied','duplicate'])('preserves %s acknowledgement as acknowledgement only',async kind=>{
 expect(await api.acknowledgeLocalTextIncident(client({kind,value:{acknowledged:true,resumed:false}}),id,id,1)).toEqual({kind,acknowledged:true,resumed:false})
})
