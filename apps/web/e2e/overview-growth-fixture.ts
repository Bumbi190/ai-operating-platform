import type {OverviewModel} from '../lib/overview/types'
import type {GrowthOverview,GrowthProject,SocialSeries} from '../lib/overview/growth-types'
export function growthFixture(model:OverviewModel):OverviewModel{
  const now='2026-10-16T12:00:00Z',period=model.period
  const projects=[
    {id:'10000000-0000-4000-8000-000000000001',name:'Familje-Stunden',slug:'test-project',color:'#9bd4ce'},
    {id:'10000000-0000-4000-8000-000000000002',name:'Handlarbörsen',slug:'handlarborsen',color:'#a2bcf0'},
    {id:'10000000-0000-4000-8000-000000000003',name:'The Prompt',slug:'ai-media-automation',color:'#d9b98a'}
  ].map(p=>({...model.projects.rows[0],...p,href:'/projects/'+p.slug}))
  const days=Array.from({length:period},(_,i)=>new Date(Date.UTC(2026,9,17-period+i)).toISOString().slice(0,10))
  const recommendations=projects.map((p,i)=>({
    id:'proposal-'+i,projectId:p.id,projectName:p.name,projectHref:p.href,kind:'analysis' as const,
    title:['Undersök vilka aktiviteter som driver följartillväxt.','Följ vägen från besök till registrering.','Jämför formaten bakom veckans visningar.'][i],
    reason:['Följarobservationerna visar en ökning. Jämför innehållet innan ni väljer nästa test.','Trafik finns. Nästa analys kan visa hur besökarna tar sig vidare.','Jämför publiceringar med likvärdiga mätfönster.'][i],
    counterfactual:'Utan jämförelse saknas underlag för nästa innehållstest.',
    defeater:'Saknade eller ändrade mätkällor skulle ändra bedömningen.',confidence:.8,
    observedAt:now,evidence:[{label:'Sparad observation för '+p.name,observedAt:now}]
  }))
  const social:SocialSeries[]=[
    {projectId:projects[0].id,projectName:projects[0].name,platform:'instagram',label:'Instagram',state:'ready',followers:402,reach:1230,lifetimeViews:null,observedAt:now,delta:62,fromDate:days[0],toDate:days[days.length-1],points:days.map((date,i)=>({date,value:340+Math.round(i*62/(period-1))}))},
    {projectId:projects[2].id,projectName:projects[2].name,platform:'youtube',label:'YouTube',state:'ready',followers:156,reach:null,lifetimeViews:10400,observedAt:now,delta:31,fromDate:days[0],toDate:days[days.length-1],points:days.map((date,i)=>({date,value:125+Math.round(i*31/(period-1))}))}
  ]
  const jobStatus=(window as any).fixtureJobStatus??'queued'
  const growth:GrowthOverview={evaluatedAt:now,period,social,
    traffic:[{projectId:projects[1].id,projectName:projects[1].name,state:'ready',days:days.map((date,i)=>({date,value:[28,49,31,68,72,60,80][i%7]})),totalPageviews:days.reduce((n,_,i)=>n+[28,49,31,68,72,60,80][i%7],0),checkedAt:now,timezone:'UTC',period}],
    briefs:projects.map(p=>({projectId:p.id,state:'ready',situation:'Här finns tre nästa steg att diskutera utifrån projektens sparade underlag.',producedAt:now})),
    recommendations,competitors:[{projectId:projects[1].id,sourceId:'autoproff',name:'AutoProff',url:'https://www.autoproff.se/b2b-marketplace',state:'ready',checkedAt:now,changed:true,detail:'Ändrad sidtitel – granska källan innan du drar slutsatser.'},{projectId:projects[1].id,sourceId:'bca',name:'BCA Sverige',url:'https://www.bca.com/sv/se/Professional-Buyer/',state:'ready',checkedAt:now,changed:false,detail:'Sparad kontroll av sidtitel.'},{projectId:projects[1].id,sourceId:'auto1',name:'AUTO1.com',url:'https://www.auto1.com/sv/home',state:'missing',checkedAt:null,changed:false,detail:'Inget verifierat konkurrentunderlag att visa ännu.'}],
    work:{state:'complete',rows:new URLSearchParams(location.search).has('fixture-work-empty')&&!(window as any).fixtureJobVisible?[]:[{id:'job-one',projectId:projects[0].id,projectName:projects[0].name,href:projects[0].href,title:'Webbplatsbygge',status:jobStatus,statusLabel:jobStatus==='done'?'Klart':jobStatus==='running'?'Arbetar':'I kö',createdAt:now,active:jobStatus!=='done'}]},
    coverage:{projects:3,web:1,social:2,analyses:3}}
  return {...model,generatedAt:now,projects:{state:'complete',rows:projects},growth}
}
