import {describe,it,expect,vi} from 'vitest'
import * as React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {OverviewDashboard} from '@/components/platform/overview/OverviewDashboard'
import {overviewFixture} from '../../e2e/atlas-overview-messenger-model'
import {deriveGrowthOverview} from '@/lib/overview/growth'
import {HANDLARBORSEN_PROJECT_ID as HB} from '@/lib/atlas/collectors/handlarborsen-marketplace'
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:()=>{},push:()=>{}})}))
;(globalThis as any).React=React
const now=new Date('2026-10-16T12:00:00Z')
function model(empty=false){
 const m:any=overviewFixture()
 m.projects.rows=[{...m.projects.rows[0],id:HB,name:'Handlarbörsen',slug:'handlarborsen',href:'/projects/handlarborsen'}]
 m.growth=deriveGrowthOverview({projects:m.projects.rows,now,period:7,
  social:{state:'complete',rows:[]},traffic:{},competitors:{status:'disabled'},
  work:{state:'complete',rows:empty?[]:[{id:'job-1',project_id:HB,status:'queued',kind:'website_build',created_at:'2026-10-16T10:00:00Z'}]},
  briefs:empty?{}:{[HB]:{status:'ok',brief:{id:'brief-1',kind:'executive_brief',projectId:HB,producedAt:'2026-10-16T09:00:00Z',supersededBy:null,
   body:{scope:'project',projectId:HB,situation:'Undersök nästa steg med befintliga observationer.',recommendations:[{summary:'Granska vägen från besök till registrering.',
    counterfactual:'Utan analys vet vi inte var besökare stannar.',defeater:'Saknad registreringsmätning kräver ett annat första steg.',confidence:.8,
    evidence:[{sourceId:'signal-1',sourceKind:'signal',label:'Verifierad trafikobservation',producedAt:'2026-10-16T08:00:00Z'}]}]}}} as any}})
 return m
}
const render=(m=model())=>renderToStaticMarkup(React.createElement(OverviewDashboard,{model:m}))
describe('growth overview presentation',()=>{
 it('gives Atlas priorities and growth a clear place above operational costs',()=>{
  const html=render()
  for(const label of ['Atlas lägesbild','Atlas rekommenderar','Tillväxt','Konkurrenter','Atlas arbete'])expect(html).toContain(label)
  expect(html.indexOf('Atlas rekommenderar')).toBeLessThan(html.indexOf('AI-kostnad under perioden'))
 })
 it('makes the evidence and the conditions behind a proposal inspectable',()=>{
  const html=render()
  for(const value of ['Granska vägen från besök till registrering.','Verifierad trafikobservation','Utan analys vet vi inte var besökare stannar.','Saknad registreringsmätning kräver ett annat första steg.'])expect(html).toContain(value)
  expect(html).toContain('Diskutera med Atlas')
 })
 it('does not fill missing traffic or followers with fabricated growth numbers',()=>{
  const html=render(model(true))
  expect(html).toContain('Inväntar anslutning')
  expect(html).not.toContain('data-growth-chart=')
  expect(html).toContain('Säkra mätunderlaget')
 })
 it('shows a queued job as queued and keeps operational detail available',()=>{
  const html=render()
  expect(html).toContain('I kö');expect(html).toContain('Webbplatsbygge')
  expect(html).toContain('Drift och AI-kostnad')
  expect((html.match(/data-overview-chart=/g)??[]).length).toBe(2)
 })
})

describe('portfolio briefing with real source shapes',()=>{
 it('summarizes the portfolio without promoting one project situation to a global conclusion',()=>{
  const m=model()
  m.growth.briefs[0].situation='No material change in this project across the window.'
  const hero=render(m).split('aria-labelledby="atlas-briefing-title"')[1].split('</section>')[0]
  expect(hero).toContain('1 förslag att diskutera.')
  expect(hero).not.toContain('No material change')
  expect(hero).toContain('1 projekt')
 })
 it('shows unavailable source coverage as unknown rather than zero confirmed traffic',()=>{
  const m=model(true)
  m.growth.coverage.projects=0
  const hero=render(m).split('aria-labelledby="atlas-briefing-title"')[1].split('</section>')[0]
  expect(hero).toContain('Underlaget kunde inte bekräftas just nu.')
  expect(hero).toContain('—')
  expect(hero).not.toContain('<strong>0<small>')
 })
})
