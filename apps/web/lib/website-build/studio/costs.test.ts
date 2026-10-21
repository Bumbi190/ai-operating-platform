import {beforeEach,describe,it,expect,vi} from 'vitest'
import {studioApi} from './api'
const PROJECT='10000000-0000-4000-8000-000000000001',OTHER='10000000-0000-4000-8000-000000000002',OWNER='20000000-0000-4000-8000-000000000001'
const state=vi.hoisted(()=>({signedIn:true,adminReads:0,db:null as any,paused:false,headroomError:false,stopError:false,rows:[] as any[],calls:[] as any[]}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>state.signedIn?{ok:true,userId:OWNER,allowedProjectIds:[PROJECT,OTHER]}:{ok:false,response:Response.json({error:'Unauthorized'},{status:401})}}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{state.adminReads++;return state.db}}))
vi.mock('@/lib/os/chat',()=>({loadChatConversation:async()=>null}))
function query(result:()=>any){const filters:Record<string,unknown>={};const q:any={select:()=>q,eq:(key:string,value:unknown)=>{filters[key]=value;return q},maybeSingle:async()=>result().data?.find((row:any)=>Object.entries(filters).every(([key,value])=>row[key]===value))?{data:result().data.find((row:any)=>Object.entries(filters).every(([key,value])=>row[key]===value)),error:null}:{data:null,error:result().error},then:(resolve:any,reject:any)=>Promise.resolve(result()).then(resolve,reject)};return q}
beforeEach(()=>{
 state.signedIn=true;state.adminReads=0;state.paused=false;state.headroomError=false;state.stopError=false;state.calls=[]
 state.rows=[{project_id:PROJECT,scope:'project_monthly',limit_sek:'100',spent_sek:'7.7880',held_sek:'5',remaining_sek:'87.2120'},{project_id:OTHER,scope:'project_monthly',limit_sek:'999',spent_sek:'888',held_sek:'0',remaining_sek:'111'},{project_id:PROJECT,scope:'global_monthly',limit_sek:'9999',spent_sek:'8888',held_sek:'0',remaining_sek:'1111'}]
 state.db={from:(table:string)=>{state.calls.push({table});return query(()=>({data:[{id:PROJECT,owner_id:OWNER,execution_paused:state.paused}],error:null}))},rpc:(name:string,args:any)=>{
  state.calls.push({name,args})
  if(name==='budget_headroom')return query(()=>({data:state.rows,error:state.headroomError?{message:'private-fixture-error'}:null}))
  if(name==='stop_set_project_execution'){if(state.stopError)return Promise.resolve({data:null,error:{message:'private-stop-error'}});const previous=state.paused;state.paused=args.p_paused;return Promise.resolve({data:[{changed:!previous,previous_paused:previous,new_paused:state.paused,event_id:previous?null:'event-1'}],error:null})}
  throw Error('Unexpected privileged call: '+name)
 }}
})
const get=(query='?projectId='+PROJECT)=>new Request('http://localhost/api/website-build/studio/costs'+query)
const stop=(body:any={projectId:PROJECT},origin='http://localhost')=>new Request('http://localhost/api/website-build/studio/costs',{method:'POST',headers:{host:'localhost',origin,'content-type':'application/json'},body:JSON.stringify(body)})
describe('studio project costs and immediate stop',()=>{
 it('returns the selected project month including held spend without leaking global or other project totals',async()=>{
  const response=await studioApi('costs' as any,get());expect(response.status).toBe(200)
  const body=await response.json();expect(body).toMatchObject({projectId:PROJECT,paused:false,monthly:{spentSek:7.788,heldSek:5,limitSek:100,remainingSek:87.212}})
  expect(JSON.stringify(body)).not.toContain('888');expect(response.headers.get('cache-control')).toBe('private, no-store');expect(Date.parse(body.observedAt)).toBeGreaterThan(0)
 })
 it('authenticates before any privileged read or stop',async()=>{
  state.signedIn=false
  for(const [action,request] of [['costs',get()],['stop',stop()]] as const){const response=await studioApi(action as any,request);expect(response.status).toBe(401);expect(response.headers.get('cache-control')).toBe('private, no-store')}
  expect(state.adminReads).toBe(0)
 })
 it('requires real ownership even for an allow-listed project',async()=>{
  for(const [action,request] of [['costs',get('?projectId='+OTHER)],['stop',stop({projectId:OTHER})]] as const)expect((await studioApi(action as any,request)).status).toBe(404)
  expect(state.calls.some(c=>c.name)).toBe(false)
 })
 it('pauses only the selected project with a server-derived actor and makes repeated stops harmless',async()=>{
  expect((await studioApi('stop' as any,stop())).status).toBe(200)
  expect(state.paused).toBe(true)
  const repeated=await studioApi('stop' as any,stop());expect(repeated.status).toBe(200);expect(await repeated.json()).toMatchObject({projectId:PROJECT,paused:true})
  expect(state.calls.filter(c=>c.name).every(c=>c.name==='stop_set_project_execution'&&c.args.p_project_id===PROJECT&&c.args.p_paused===true&&c.args.p_actor==='user:'+OWNER)).toBe(true)
 })
 it('refuses cross-origin and injected resume or actor fields before mutating',async()=>{
  expect((await studioApi('stop' as any,stop(undefined,'https://evil.example'))).status).toBe(403)
  for(const extra of [{paused:false},{actor:'admin'},{ownerId:OWNER}])expect((await studioApi('stop' as any,stop({projectId:PROJECT,...extra}))).status).toBe(400)
  expect(state.paused).toBe(false);expect(state.calls.some(c=>c.name)).toBe(false)
 })
 it('reports unreadable costs and failed stop without pretending zero spend or a successful pause',async()=>{
  state.headroomError=true;const unreadable=await studioApi('costs' as any,get());expect(unreadable.status).toBe(503);expect(await unreadable.text()).not.toContain('private-fixture-error')
  state.stopError=true;const failed=await studioApi('stop' as any,stop());expect(failed.status).toBe(503);expect(await failed.text()).not.toContain('private-stop-error');expect(state.paused).toBe(false)
 })
 it('does not invent zero cost when the project has no monthly budget',async()=>{
  state.rows=[];const response=await studioApi('costs' as any,get());expect(response.status).toBe(200);expect((await response.json()).monthly).toBeNull()
 })
 it('rejects duplicate and malformed project selections',async()=>{
  for(const query of ['?projectId='+PROJECT+'&projectId='+OTHER,'?projectId=bad','?projectId='+PROJECT+'&ownerId='+OWNER])expect((await studioApi('costs' as any,get(query))).status).toBe(400)
 })
})

it('reports the active economy model on the protected cost snapshot',async()=>{
 process.env.ATLAS_MODEL_PROFILE='openai_economy'
 try{
  const response=await studioApi('costs' as any,get())
  expect((await response.json()).modelPolicy).toEqual({profile:'openai_economy',chatModel:'gpt-5.4-mini',buildModel:'gpt-5.4-mini',localAvailable:false})
 }finally{delete process.env.ATLAS_MODEL_PROFILE}
})
