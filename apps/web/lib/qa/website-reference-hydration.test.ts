import {beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({owned:true,messageReads:0}))
const P='10000000-0000-4000-8000-000000000001',C='50000000-0000-4000-8000-000000000001',M='90000000-0000-4000-8000-000000000001'
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}}})}})}))
vi.mock('@/lib/atlas/isolation',()=>({getAllowedProjectIds:async()=>['10000000-0000-4000-8000-000000000001']}))
vi.mock('@/lib/website-build/planning/conversation-workspace',()=>({readConversationWorkspace:async()=>({state:'ok',plan:null,session:null,brief:null})}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{
 let columns:string[]=[]
 const filters:Record<string,unknown>={}
 const row={id:'90000000-0000-4000-8000-000000000001',role:'user',content:'Spara referenser',tool_data:null,created_at:'2026-10-30T08:00:00Z'}
 const q:any={
  select:(value:string)=>{columns=value.split(',').map(x=>x.trim());return q},
  eq:(key:string,value:unknown)=>{filters[key]=value;return q},order:()=>q,
  maybeSingle:async()=>({data:state.owned&&filters.user_id==='owner'?{id:filters.id,project_id:'10000000-0000-4000-8000-000000000001'}:null,error:null}),
  then:(resolve:any,reject:any)=>{state.messageReads++;expect(table).toBe('conversation_messages');expect(filters.conversation_id).toBe('50000000-0000-4000-8000-000000000001');return Promise.resolve({data:[Object.fromEntries(columns.filter(key=>key in row).map(key=>[key,row[key as keyof typeof row]]))],error:null}).then(resolve,reject)},
 };return q
}})}))
import {loadChatConversation} from '@/lib/os/chat'
beforeEach(()=>{state.owned=true;state.messageReads=0})
it('preserves the canonical message ID through the authenticated conversation projection',async()=>{
 const model=await loadChatConversation(C)
 expect(model).toMatchObject({id:C,projectId:P,operatorId:'owner',state:'ok',saved:[
  {id:M,role:'user',content:'Spara referenser',tool_data:null,created_at:'2026-10-30T08:00:00Z'},
 ]})
 expect(state.messageReads).toBe(1)
})
it('does not read any saved message identifiers before conversation ownership is proven',async()=>{
 state.owned=false
 expect(await loadChatConversation(C)).toBe('not_found')
 expect(state.messageReads).toBe(0)
})
