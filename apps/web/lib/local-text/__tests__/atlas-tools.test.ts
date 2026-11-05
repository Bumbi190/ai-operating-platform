import {it,expect,vi,beforeEach} from 'vitest'
import {JOB_STATES} from '@omnira/local-text-contract'
// Existing behavioral tests opt into a simulated post-incident-clearance gate;
// production hard-stop behavior is tested independently in activation-fence.test.ts.
vi.mock('../activation-fence',()=>({localTextDispatchEnabled:()=>process.env.ATLAS_LOCAL_TEXT_ENABLED==='true'}))
const f=vi.hoisted(()=>({queued:0,reads:0,receipt:null as any}))
vi.mock('../request',()=>({requestLocalTextJob:async()=>{f.queued++;return {kind:'applied',value:f.receipt}}}))
vi.mock('../store',()=>({readReceipt:async()=>{f.reads++;return f.receipt}}))
const api=await import('../atlas-tools').catch(()=>({}) as typeof import('../atlas-tools')),view=await import('../receipt').catch(()=>({}) as typeof import('../receipt'))
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',principal={userId:id,allowedProjectIds:[id]},task={kind:'classify',text:'Behöver hjälp',labels:['support','annat']}
const input={projectId:id,idempotencyKey:id,task}
const receipt={id,projectId:id,conversationId:id,state:'queued',reasonCode:null,result:null,reviewStatus:'pending',selectionId:id,expiresAt:'2099-01-01T00:00:00.000Z',updatedAt:'2026-10-17T00:00:00.000Z'}
beforeEach(()=>{f.queued=0;f.reads=0;f.receipt={...receipt};vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','true')})
it('text_tool_queues_without_waiting_for_model',async()=>{expect(typeof api.handleLocalTextTool).toBe('function');const out=await api.handleLocalTextTool('request_local_text_job',input,principal,id,{} as any,'text');expect(out).toMatchObject({type:'local_text_job',state:'queued',result:null,authority:'suggestion_only'});expect(f.queued).toBe(1)})
it('no_first_project_or_foreign_conversation',async()=>{for(const v of [{...input,projectId:other},{idempotencyKey:id,task},{...input,model:'anything'},{...input,dataClass:'synthetic'}])expect(await api.handleLocalTextTool('request_local_text_job',v,principal,id,{} as any,'text')).toHaveProperty('error');expect(await api.handleLocalTextTool('request_local_text_job',input,principal,null,{} as any,'text')).toHaveProperty('error');expect(f.queued).toBe(0);f.receipt={...receipt,conversationId:other};expect(await api.handleLocalTextTool('get_local_text_job',{jobId:id},principal,id,{} as any,'text')).toHaveProperty('error')})
it('voice_studio_hide_local_tools',async()=>{expect(api.availableLocalTextTools({inputSource:'voice',studio:true,fast:false,staticConversation:false})).toEqual([]);expect(api.availableLocalTextTools({inputSource:'text',studio:false,fast:true,staticConversation:false})).toEqual([]);expect(await api.handleLocalTextTool('request_local_text_job',input,principal,id,{} as any,'voice')).toHaveProperty('error');expect(f.queued).toBe(0)})
it('reload_uses_owned_receipt_and_metadata_link_without_raw_copies',async()=>{f.receipt={...receipt,state:'succeeded',reviewStatus:'approved',result:{label:'support'}};const out=await api.handleLocalTextTool('get_local_text_job',{jobId:id},principal,id,{} as any,'text');expect(out).toMatchObject({result:{label:'support'}});const saved=api.persistLocalTextToolData(input,out);expect(JSON.stringify(saved)).not.toContain(task.text);expect(saved.result).not.toHaveProperty('result');expect(view.localTextReceiptLink(saved.result)).toEqual({id,projectId:id,conversationId:id})})
it('unreviewed_result_hidden_and_expired_receipt_cannot_reappear',()=>{expect(view.projectLocalTextReceipt({...receipt,result:{label:'support'}} as any).result).toBeNull();expect(view.projectLocalTextReceipt({...receipt,state:'succeeded',reviewStatus:'approved',result:{label:'support'},expiresAt:'2000-01-01T00:00:00.000Z'} as any).result).toBeNull()})
it.each(['array','boxed','coercing'])('omits %s transcript state without converting it',representation=>{
 const convert=vi.fn(()=>'queued')
 const state=representation==='array'?['queued']:representation==='boxed'?new String('queued'):{toString:convert}
 const saved=api.persistLocalTextToolData(input,{type:'local_text_job',id,projectId:id,conversationId:id,state,result:{label:'support'}})
 expect(saved.result).toEqual({type:'local_text_job',id,projectId:id,conversationId:id})
 expect(convert).not.toHaveBeenCalled();expect(JSON.stringify(saved)).not.toContain(task.text)
})
it('preserves each primitive transcript state as link-only metadata',()=>{
 for(const state of JOB_STATES){
  const saved=api.persistLocalTextToolData(input,{type:'local_text_job',id,projectId:id,conversationId:id,state,result:{label:'support'}})
  expect(saved.result).toEqual({type:'local_text_job',id,projectId:id,conversationId:id,state})
  expect(saved.result).not.toHaveProperty('result')
 }
})
