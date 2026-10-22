import {describe,it,expect} from 'vitest'
import * as api from '@/lib/overview/view-model'
import {HANDLARBORSEN_PROJECT_ID as HB} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import {evaluateCompetitorHistory} from '@/lib/atlas/project-analytics/handlarborsen-competitor-history-core'
const now=new Date('2026-10-16T12:00:00Z')
const P={id:'p1',name:'Alpha',slug:'alpha',href:'/projects/alpha',color:'#67e8f9'}
const row=(over:any={})=>({id:'s1',project_id:P.id,platform:'instagram',snapshot_date:'2026-10-16',captured_at:'2026-10-16T08:00:00Z',followers:120,reach:30,account_id:'ig-one',instagram_user_id:null,youtube_channel_id:null,...over})
const base=(over:any={})=>({projects:[P],period:7,now,social:{state:'complete',rows:[]},briefs:{},traffic:{},competitors:{status:'disabled'},work:{state:'complete',rows:[]},...over})
const derive=(input:any)=>{const out=(api as any).deriveGrowthOverview?.(input);expect(out,'growth model must exist').toBeDefined();return out}
function brief(projectId=P.id,over:any={}){
 return {status:'ok',brief:{id:'brief-one',kind:'executive_brief',projectId,supersededBy:null,producedAt:'2026-10-16T09:00:00Z',confidence:.8,
 body:{scope:'project',projectId,situation:'Ett kontrollerat läge.',recommendations:[{summary:'Undersök vilka inlägg som sammanföll med ökningen.',counterfactual:'Annars saknas underlag för nästa innehållstest.',defeater:'Ett kontobyte skulle ändra bedömningen.',confidence:.8,evidence:[{sourceId:'signal-1',sourceKind:'signal',label:'Följare vid mättillfällen',producedAt:'2026-10-16T08:00:00Z'}]}]},...over}}
}
describe('growth overview grounded in observed sources',()=>{
 it('keeps a measured zero and a real decrease instead of inventing growth',()=>{
  const out=derive(base({social:{state:'complete',rows:[row({id:'s0',snapshot_date:'2026-10-15',captured_at:'2026-10-15T08:00:00Z',followers:10}),row({followers:0})]}}))
  expect(out.social[0]).toMatchObject({followers:0,delta:-10,state:'ready',fromDate:'2026-10-15',toDate:'2026-10-16'})
  expect(out.social[0].points.map((x:any)=>x.value)).toEqual([10,0])
 })
 it('refuses a change calculation from a partial read',()=>{
  const out=derive(base({social:{state:'partial',rows:[row()]}}))
  expect(out.social[0]).toMatchObject({state:'partial',delta:null})
 })
 it('keeps missing days missing and does not connect them into a period delta',()=>{
  const out=derive(base({social:{state:'complete',rows:[row({id:'old',snapshot_date:'2026-10-14',captured_at:'2026-10-14T08:00:00Z',followers:100}),row()]}}))
  expect(out.social[0].points).toHaveLength(2);expect(out.social[0].delta).toBeNull()
 })
 it('does not compare two different accounts on the same platform',()=>{
  const out=derive(base({social:{state:'complete',rows:[row({id:'old',snapshot_date:'2026-10-15',captured_at:'2026-10-15T08:00:00Z',account_id:'old-account',followers:9999}),row()]}}))
  expect(out.social[0].delta).toBeNull();expect(out.social[0].points).toHaveLength(1)
 })
 it('shows a saved level without claiming a continuous account history when identity is absent',()=>{
  const out=derive(base({social:{state:'complete',rows:[row({account_id:null})]}}))
  expect(out.social[0].followers).toBe(120);expect(out.social[0].points).toEqual([]);expect(out.social[0].delta).toBeNull()
 })
 it('labels old data and does not present it as a fresh observation',()=>{
  const out=derive(base({social:{state:'complete',rows:[row({snapshot_date:'2026-10-14',captured_at:'2026-10-14T08:00:00Z'})]}}))
  expect(out.social[0].state).toBe('stale')
 })
 it('does not turn an unknown follower count into zero',()=>{
  const out=derive(base({social:{state:'complete',rows:[row({followers:null})]}}))
  expect(out.social[0].followers).toBeNull();expect(out.social[0].points).toEqual([])
 })
 it('rejects future measurements and invalid numbers',()=>{
  for(const over of [{captured_at:'2026-10-17T08:00:00Z'},{followers:-1},{followers:NaN}]){
   const out=derive(base({social:{state:'complete',rows:[row(over)]}}))
   expect(out.social[0].followers).toBeNull();expect(out.social[0].delta).toBeNull()
  }
 })
 it('never serializes another project or raw provider payload',()=>{
  const out=derive(base({social:{state:'complete',rows:[row({raw:{secret:'PROVIDER_SECRET'}}),row({id:'foreign',project_id:'foreign',followers:999999,raw:'FOREIGN_SECRET'})]},briefs:{foreign:brief('foreign',{body:{situation:'FOREIGN_SECRET'}})}}))
  expect(JSON.stringify(out)).not.toMatch(/PROVIDER_SECRET|FOREIGN_SECRET|999999/)
 })
 it('exposes a saved recommendation with its counterfactual, defeater and evidence',()=>{
  const out=derive(base({briefs:{p1:brief()}}))
  expect(out.recommendations[0]).toMatchObject({kind:'analysis',projectId:'p1',title:'Undersök vilka inlägg som sammanföll med ökningen.',counterfactual:'Annars saknas underlag för nästa innehållstest.',defeater:'Ett kontobyte skulle ändra bedömningen.'})
  expect(out.recommendations[0].evidence).toHaveLength(1)
 })
 it('does not turn stale, foreign or superseded briefs into fresh proposals',()=>{
  for(const b of [brief('foreign'),brief('p1',{supersededBy:'new'}),brief('p1',{producedAt:'2026-10-13T08:00:00Z'}),brief('p1',{producedAt:'2026-10-17T08:00:00Z'})]){
   const out=derive(base({briefs:{p1:b}}));expect(out.recommendations.filter((x:any)=>x.kind==='analysis')).toEqual([])
  }
 })
 it('refuses proposals without usable evidence',()=>{
  const b=brief();b.brief.body.recommendations[0].evidence=[]
  const out=derive(base({briefs:{p1:b}}));expect(out.recommendations.filter((x:any)=>x.kind==='analysis')).toEqual([])
 })
 it('limits the visible recommendations without pretending missing analyses exist',()=>{
  const b=brief();b.brief.body.recommendations=Array.from({length:6},(_,i)=>({...b.brief.body.recommendations[0],summary:'Förslag '+i}))
  const out=derive(base({briefs:{p1:b}}));expect(out.recommendations).toHaveLength(3)
 })
 it('keeps traffic separate from social lifetime views and from missing projects',()=>{
  const days=Array.from({length:7},(_,i)=>({date:'2026-10-'+String(10+i),pageviews:3}))
  const out=derive(base({projects:[P,{...P,id:'p2',slug:'beta',name:'Beta'}],traffic:{p1:{status:'available',days,totalPageviews:21,checkedAt:now.toISOString(),firstDate:days[0].date,lastDate:days[6].date}},social:{state:'complete',rows:[row({platform:'youtube',followers:20,reach:1000000,youtube_channel_id:'channel-one',account_id:null})]}}))
  expect(out.traffic[0]).toMatchObject({state:'ready',totalPageviews:21,timezone:'UTC'})
  expect(out.traffic[1].totalPageviews).toBeNull();expect(out.social[2].lifetimeViews).toBe(1000000)
 })
 it('distinguishes waiting for web events from measured zero traffic',()=>{
  const out=derive(base({traffic:{p1:{status:'waiting_for_events',days:[],checkedAt:now.toISOString()}}}))
  expect(out.traffic[0]).toMatchObject({state:'waiting',totalPageviews:null})
 })
 it('keeps queued and running work distinct from completed work and removes foreign rows',()=>{
  const out=derive(base({work:{state:'complete',rows:[{id:'q',project_id:'p1',status:'queued',kind:'website_build',created_at:'2026-10-16T10:00:00Z'},{id:'secret',project_id:'foreign',status:'done',kind:'SECRET',created_at:'2026-10-16T11:00:00Z'}]}}))
  expect(out.work.rows).toHaveLength(1);expect(out.work.rows[0]).toMatchObject({status:'queued',statusLabel:'I kö'});expect(JSON.stringify(out.work)).not.toContain('SECRET')
 })
 it('treats a changed competitor title as a prompt to inspect, never a product or pricing claim',()=>{
  const history=evaluateCompetitorHistory([{sourceId:'autoproff',checkedAt:'2026-10-15T08:00:00.000Z',status:'metadata_checked',title:'Första titeln'},{sourceId:'autoproff',checkedAt:'2026-10-16T08:00:00.000Z',status:'metadata_checked',title:'Andra titeln'}],now)
  const out=derive(base({projects:[{...P,id:HB,slug:'handlarborsen',name:'Handlarbörsen'}],competitors:{status:'ok',history}}))
  expect(out.competitors[0]).toMatchObject({sourceId:'autoproff',changed:true})
  expect(JSON.stringify(out.competitors)).toContain('sidtitel');expect(JSON.stringify(out.competitors)).not.toMatch(/prissänkning|lanserat/)
 })
})

describe('growth overview adverse source shapes',()=>{
 it('degrades an impossible calendar date without throwing',()=>{
  const out=derive(base({social:{state:'complete',rows:[row({snapshot_date:'2026-99-99'})]}}))
  expect(out.social[0].followers).toBeNull()
 })
 it('keeps an older active job visible ahead of recent completed jobs',()=>{
  const rows=Array.from({length:12},(_,i)=>({id:'done-'+i,project_id:'p1',status:'done',created_at:'2026-10-16T10:00:00Z'}))
  const out=derive(base({work:{state:'complete',rows:[...rows,{id:'still-active',project_id:'p1',status:'queued',created_at:'2026-09-01T10:00:00Z'}]}}))
  expect(out.work.rows[0].id).toBe('still-active')
 })
 it('does not certify a complete work read after rejecting an invalid owned row',()=>{
  const out=derive(base({work:{state:'complete',rows:[{id:'bad',project_id:'p1',status:'running',created_at:'invalid'}]}}))
  expect(out.work.state).toBe('partial')
 })
 it('requires observed evidence rather than configuration alone for a growth proposal',()=>{
  const b=brief();b.brief.body.recommendations[0].evidence[0].sourceKind='config'
  const out=derive(base({briefs:{p1:b}}));expect(out.recommendations.filter((r:any)=>r.kind==='analysis')).toEqual([])
 })
})

describe('failed collector snapshots',()=>{
 it('keeps all-null API-error snapshots waiting and retains the measurement next step',()=>{
  const out=derive(base({social:{state:'complete',rows:[row({followers:null,reach:null})]}}))
  expect(out.social[0]).toMatchObject({state:'waiting',followers:null,reach:null,delta:null})
  expect(out.coverage.social).toBe(0)
  expect(out.recommendations[0]).toMatchObject({kind:'measurement',projectId:P.id})
 })
 it('does not certify a malformed reach metric as ready',()=>{
  const out=derive(base({social:{state:'complete',rows:[row({followers:10,reach:-1})]}}))
  expect(out.social[0]).toMatchObject({state:'partial',followers:10,reach:null})
 })
 it('labels the actual durable website run kind',()=>{
  const out=derive(base({work:{state:'complete',rows:[{id:'run-one',project_id:'p1',status:'pending',kind:'website.static.build.v1',created_at:'2026-10-16T10:00:00Z'}]}}))
  expect(out.work.rows[0]).toMatchObject({title:'Webbplatsbygge',active:true,statusLabel:'Väntar'})
 })
})
