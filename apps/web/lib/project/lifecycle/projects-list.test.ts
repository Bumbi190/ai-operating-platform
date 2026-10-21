import {beforeEach,describe,it,expect,vi} from 'vitest'
import {GET} from '@/app/api/projects/route'
const state=vi.hoisted(()=>({signedIn:true,rows:[] as any[],error:null as unknown,reads:0,selection:''}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.signedIn?{id:'owner'}:null}})},from:()=>{state.reads++;return {select:(s:string)=>{state.selection=s;return {order:async()=>({data:state.rows,error:state.error})}}}}})}))
beforeEach(()=>{state.signedIn=true;state.reads=0;state.error=null;state.selection='';state.rows=[{id:'a',name:'Aktivt',project_lifecycle:null},{id:'b',name:'Arkiv',project_lifecycle:{state:'archived'}},{id:'c',name:'Korg',project_lifecycle:[{state:'trashed'}]}]})
describe('ordinary project inventory lifecycle',()=>{
 it('defaults to active projects and preserves the existing response shape',async()=>{
  const r=await GET(new Request('http://localhost/api/projects'));expect(r.status).toBe(200);expect(await r.json()).toEqual([{id:'a',name:'Aktivt'}]);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(state.selection).toContain('project_lifecycle(state)')
 })
 it.each(['archived','trashed'])('offers explicit %s recovery inventory',async include=>{
  const r=await GET(new Request('http://localhost/api/projects?include='+include));expect(r.status).toBe(200);expect((await r.json()).map((p:any)=>p.id)).toEqual([include==='archived'?'b':'c'])
 })
 it('authenticates and rejects invalid list filters before reading projects',async()=>{
  state.signedIn=false;expect((await GET(new Request('http://localhost/api/projects'))).status).toBe(401);expect(state.reads).toBe(0)
  state.signedIn=true;expect((await GET(new Request('http://localhost/api/projects?include=everything'))).status).toBe(400);expect(state.reads).toBe(0)
 })
 it('reports unreadable lifecycle data instead of silently showing archived projects',async()=>{
  state.rows=[{id:'a',project_lifecycle:{state:'unexpected'}}]
  expect((await GET(new Request('http://localhost/api/projects'))).status).toBe(503)
 })
})
