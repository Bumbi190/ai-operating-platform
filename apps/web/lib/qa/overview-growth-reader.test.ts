import {beforeEach,describe,it,expect,vi} from 'vitest'
import * as api from '@/lib/overview/view-model'
import {HANDLARBORSEN_PROJECT_ID as HB} from '@/lib/atlas/collectors/handlarborsen-marketplace'
const p={id:HB,owner_id:'owner',name:'Handlarbörsen',slug:'handlarborsen',color:'#67e8f9'}
const now=new Date('2026-10-16T12:00:00Z')
function db(tables:Record<string,any[]>,bad:string[]=[]){
 const queries:{table:string;ops:any[]}[]=[]
 return {queries,from(table:string){
  const ops:any[]=[];queries.push({table,ops})
  let rows=[...(tables[table]??[])],from=0,to=Infinity
  const q:any={select:(v:string)=>{ops.push(['select',v]);return q},
   eq:(k:string,v:any)=>{ops.push(['eq',k,v]);rows=rows.filter(r=>r[k]===v);return q},
   in:(k:string,v:any[])=>{ops.push(['in',k,v]);rows=rows.filter(r=>v.includes(r[k]));return q},
   gte:(...v:any[])=>{ops.push(['gte',...v]);return q},lte:(...v:any[])=>{ops.push(['lte',...v]);return q},
   order:(...v:any[])=>{ops.push(['order',...v]);return q},
   range:(a:number,b:number)=>{from=a;to=b;ops.push(['range',a,b]);return q},
   limit:(n:number)=>{to=n-1;return q},
   then:(yes:any,no:any)=>Promise.resolve(bad.includes(table)?{data:null,error:{message:'unavailable'}}:{data:rows.slice(from,to+1),error:null}).then(yes,no)}
  return q
 }}
}
function readers(){return {brief:vi.fn(async()=>({status:'not_produced',brief:null})),
 traffic:vi.fn(async()=>({status:'not_connected',days:[],checkedAt:null})),competitors:vi.fn(async()=>({status:'disabled'}))}}
async function load(input:any,io:any){
 const out=await (api as any).loadGrowthOverview?.(input,io)
 expect(out,'authorized growth loader must exist').toBeDefined();return out
}
describe('growth source authorization and read isolation',()=>{
 it('does no privileged source read without a principal',async()=>{
  const d=db({projects:[p]}),io=readers();const out=await load({db:d,userId:null,projects:[p],period:7,now},io)
  expect(d.queries).toEqual([]);expect(io.brief).not.toHaveBeenCalled();expect(out.coverage.projects).toBe(0)
 })
 it('rechecks actual ownership before using a supplied project or a cached source',async()=>{
  const d=db({projects:[{...p,owner_id:'other'}]}),io=readers()
  const out=await load({db:d,userId:'owner',projects:[p],period:7,now},io)
  expect(out.coverage.projects).toBe(0);expect(io.traffic).not.toHaveBeenCalled();expect(io.competitors).not.toHaveBeenCalled()
  expect(d.queries.every(x=>x.table==='projects')).toBe(true)
 })
 it('refuses an archived project instead of bringing it back through the growth reader',async()=>{
  const d=db({projects:[{...p,project_lifecycle:[{state:'archived'}]}]}),io=readers()
  const out=await load({db:d,userId:'owner',projects:[p],period:7,now},io)
  expect(out.coverage.projects).toBe(0);expect(io.brief).not.toHaveBeenCalled()
 })
 it('uses authoritative project names and project filters for every native source',async()=>{
  const d=db({projects:[p,{id:'foreign',owner_id:'other'}],account_snapshots:[{id:'a',project_id:HB,platform:'instagram',snapshot_date:'2026-10-16',captured_at:'2026-10-16T08:00:00Z',followers:10,reach:null,account_id:'ig-1'},{id:'f',project_id:'foreign',platform:'instagram',followers:999999}],runs:[]}),io=readers()
  const out=await load({db:d,userId:'owner',projects:[{...p,name:'UNTRUSTED_NAME'}],period:7,now},io)
  expect(out.social[0].projectName).toBe('Handlarbörsen');expect(JSON.stringify(out)).not.toMatch(/999999|UNTRUSTED_NAME/)
  for(const q of d.queries.filter(x=>x.table!=='projects'))expect(q.ops).toContainEqual(['in','project_id',[HB]])
  expect(io.brief).toHaveBeenCalledWith(expect.objectContaining({userId:'owner',projectId:HB,db:d}))
 })
 it('reads only safe account identity projections, never a whole raw provider payload',async()=>{
  const d=db({projects:[p]}),io=readers();await load({db:d,userId:'owner',projects:[p],period:7,now},io)
  const fields=d.queries.find(q=>q.table==='account_snapshots')!.ops.find(x=>x[0]==='select')[1]
  expect(fields).toContain('account_id:raw->>id');expect(fields).toContain('youtube_channel_id:raw->items->0->>id')
  expect(fields.split(',')).not.toContain('raw');expect(fields).not.toContain('*')
 })
 it('keeps a read failure visible instead of producing zero followers',async()=>{
  const d=db({projects:[p]},['account_snapshots']),io=readers()
  const out=await load({db:d,userId:'owner',projects:[p],period:7,now},io)
  expect(out.social[0]).toMatchObject({state:'unavailable',followers:null})
 })
 it('loads recent and still-active work without mistaking a queued job for completion',async()=>{
  const d=db({projects:[p],runs:[{id:'q',project_id:HB,status:'queued',kind:'website_build',created_at:'2026-10-16T10:00:00Z'}]}),io=readers()
  const out=await load({db:d,userId:'owner',projects:[p],period:7,now},io)
  expect(out.work.rows).toHaveLength(1);expect(out.work.rows[0]).toMatchObject({status:'queued',statusLabel:'I kö',active:true})
 })
 it('passes the selected period to the existing traffic reader and never calls it for an unsupported project',async()=>{
  const other={...p,id:'other',slug:'other',name:'Other'}
  const d=db({projects:[p,other]}),io=readers()
  await load({db:d,userId:'owner',projects:[p,other],period:30,now},io)
  expect(io.traffic).toHaveBeenCalledTimes(1)
  expect(io.traffic).toHaveBeenCalledWith(expect.objectContaining({id:HB}),expect.objectContaining({allowedProjectIds:expect.arrayContaining([HB])}),expect.objectContaining({period:30,now}))
  expect(io.brief).toHaveBeenCalledTimes(2)
 })
})
