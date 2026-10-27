import Link from 'next/link'
import type {GrowthOverview,GrowthProject,GrowthPoint,GrowthState,SocialSeries} from '@/lib/overview/growth-types'
import {DiscussSuggestion} from './DiscussSuggestion'
import {OverviewLiveWork} from './OverviewLiveWork'
import styles from './growth.module.css'
const number=(n:number)=>new Intl.NumberFormat('sv-SE').format(n)
const when=(at:string|null)=>at?new Intl.DateTimeFormat('sv-SE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Stockholm'}).format(new Date(at)):'Ingen sparad observation'
const stateLabel:Record<GrowthState,string>={
  ready:'Mätdata finns',missing:'Inväntar anslutning',unavailable:'Underlag otillgängligt',
  partial:'Ofullständigt underlag',stale:'Äldre observation',waiting:'Inväntar mätdata'
}
function State({state,missingLabel}:{state:GrowthState;missingLabel?:string}){
  return <span className={styles.sourceState} data-state={state}>{state==='missing'&&missingLabel?missingLabel:stateLabel[state]}</span>
}
function Plot({points,label,id}:{points:GrowthPoint[];label:string;id:string}){
  if(!points.length)return null
  const left=Date.parse(points[0].date),right=Date.parse(points[points.length-1].date)
  const max=Math.max(...points.map(p=>p.value),1)
  const xy=points.map(p=>({x:right===left?280:12+(Date.parse(p.date)-left)/(right-left)*536,y:106-p.value/max*88}))
  const segments:number[][]=[]
  points.forEach((p,i)=>{
    if(!i||Date.parse(p.date)-Date.parse(points[i-1].date)>86_400_000)segments.push([])
    segments[segments.length-1].push(i)
  })
  const gradient='growth-'+id.replace(/[^a-z0-9-]/gi,'')
  return <figure className={styles.plot} data-growth-chart={id}>
    <svg viewBox="0 0 560 120" role="img" aria-label={label}>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#82e7cf" stopOpacity=".23"/><stop offset="1" stopColor="#82e7cf" stopOpacity="0"/></linearGradient></defs>
      {[18,62,106].map(y=><line key={y} x1="12" x2="548" y1={y} y2={y} stroke="#b1cde0" strokeOpacity=".1" strokeDasharray="3 6"/>)}
      {segments.filter(g=>g.length>1).map((g,k)=>{
        const d=g.map((i,j)=>(j?'L':'M')+xy[i].x+' '+xy[i].y).join(' ')
        return <g key={k}><path d={d+' L'+xy[g[g.length-1]].x+' 112 L'+xy[g[0]].x+' 112 Z'} fill={'url(#'+gradient+')'}/><path d={d} fill="none" stroke="#82e7cf" strokeWidth="2.5" strokeLinejoin="round"/></g>
      })}
      {xy.map((p,i)=><circle key={points[i].date} cx={p.x} cy={p.y} r="3" fill="#a0f3df"><title>{points[i].date+': '+number(points[i].value)}</title></circle>)}
    </svg>
    <figcaption><span>{points[0].date}</span><span>{points[points.length-1].date} · UTC</span></figcaption>
    <details className={styles.chartValues}><summary>Visa mätpunkter</summary><table><caption>{label}</caption><thead><tr><th>Datum (UTC)</th><th>Värde</th></tr></thead><tbody>{points.map(p=><tr key={p.date}><td>{p.date}</td><td>{number(p.value)}</td></tr>)}</tbody></table></details>
  </figure>
}
function Audience({series}:{series:SocialSeries}){
  return <article className={styles.audienceCard}>
    <div className={styles.channelHead}><span className={styles.channelIcon} aria-hidden="true">{series.platform==='youtube'?'▶':series.platform==='instagram'?'◎':'f'}</span><div><h3>{series.label}</h3><p>{series.projectName}</p></div><State state={series.state}/></div>
    <div className={styles.audienceMetric}><strong>{series.followers===null?'—':number(series.followers)}</strong><span>{series.platform==='youtube'?'prenumeranter':'följare'} vid senaste mätning</span></div>
    {series.delta!==null&&<p className={styles.delta} data-direction={series.delta<0?'down':'up'}>{series.delta>0?'+':''}{number(series.delta)} mellan {series.fromDate} och {series.toDate}</p>}
    <Plot points={series.points} label={'Följare per mättillfälle · '+series.projectName+' · '+series.label} id={series.projectId+'-'+series.platform}/>
    {series.lifetimeViews!==null&&<p className={styles.sourceNote}>{number(series.lifetimeViews)} kanalvisningar totalt · inte periodens visningar</p>}
    {series.reach!==null&&<p className={styles.sourceNote}>Räckvidd vid senaste mätning: {number(series.reach)}</p>}
    <p className={styles.sourceNote}>Observerad {when(series.observedAt)} · Stockholm</p>
  </article>
}
export function GrowthSections({growth,projects}:{growth:GrowthOverview;projects:GrowthProject[]}){
  const actual=growth.recommendations.filter(r=>r.kind==='analysis')
  const sourcesConfirmed=growth.coverage.projects===projects.length
  const proposalProjects=new Set(actual.map(r=>r.projectId)).size
  const latestAnalysis=actual.map(r=>r.observedAt).filter((at):at is string=>at!==null).sort().at(-1)
  const hasMetrics=growth.coverage.web>0||growth.coverage.social>0
  const headline=!sourcesConfirmed?'Underlaget kunde inte bekräftas just nu.':
    actual.length?actual.length+' förslag att diskutera.':
    hasMetrics?'Aktuella mätningar finns att följa. Välj nästa fråga för Atlas.':
    'Bättre beslut börjar med rätt underlag.'
  const audience=growth.social.filter(s=>s.state!=='missing')
  const web=growth.traffic.filter(t=>t.state!=='missing')
  return <div className={styles.sections}>
    <div className={styles.commandGrid}>
      <section className={styles.briefing} aria-labelledby="atlas-briefing-title">
        <p className={styles.eyebrow}><span aria-hidden="true">✦</span> ATLAS LÄGESBILD</p>
        <h2 id="atlas-briefing-title">Atlas lägesbild</h2>
        <p className={styles.briefLead}>{headline}</p>
        {sourcesConfirmed&&actual.length>0&&<p className={styles.sourceNote}>Sparade bedömningar från {proposalProjects} projekt · senast {when(latestAnalysis??null)} · Stockholm</p>}
        {!sourcesConfirmed&&<p className={styles.sourceNote}>Projektens underlag kunde inte bekräftas. Mättäckningen visas som okänd tills en ny avläsning lyckas.</p>}
        <div className={styles.coverage}>
          <div><strong>{projects.length}</strong><span>projekt i översikten</span></div>
          <div><strong>{sourcesConfirmed?growth.coverage.web:'—'}<small>/{projects.length}</small></strong><span>med aktuell webbtrafik</span></div>
          <div><strong>{sourcesConfirmed?growth.coverage.social:'—'}</strong><span>kanaler med färska följarsiffror</span></div>
        </div>
        <p className={styles.briefFoot}>Atlas skiljer observationer från förslag. Du väljer nästa steg.</p>
      </section>
      <OverviewLiveWork work={growth.work} projects={projects}/>
    </div>
    <section aria-labelledby="atlas-recommendations-title">
      <div className={styles.sectionHead}><div><p className={styles.eyebrow}>NÄSTA STEG</p><h2 id="atlas-recommendations-title">Atlas rekommenderar</h2><p>Förslag med aktuellt underlag för dina projekt.</p></div><span className={styles.count}>{actual.length} källgrundade förslag</span></div>
      {growth.recommendations.length?<div className={styles.recommendations}>{growth.recommendations.map((r,i)=><article className={styles.recommendation} key={r.id}>
        <div className={styles.recommendationTop}><span className={styles.ordinal}>{String(i+1).padStart(2,'0')}</span><Link href={r.projectHref}>{r.projectName}</Link><span className={styles.proposalKind}>{r.kind==='analysis'?'Atlas bedömning':'Underlag behövs'}</span></div>
        <h3>{r.title}</h3><p>{r.reason}</p>
        {r.kind==='analysis'&&<details className={styles.evidence}><summary>Varför föreslår Atlas detta?</summary>
          <p><strong>Om vi avstår:</strong> {r.counterfactual}</p><p><strong>Det som kan ändra bedömningen:</strong> {r.defeater}</p>
          <p>Bedömningens säkerhet: {r.confidence!==null?Math.round(r.confidence*100)+' %':'Okänd'} · ingen garanti för effekt.</p>
          <ul>{r.evidence.map((e,k)=><li key={k}>{e.label}<small>{when(e.observedAt)} · Stockholm</small></li>)}</ul>
        </details>}
        <DiscussSuggestion suggestion={r}/>
      </article>)}</div>:<div className={styles.empty}><strong>Inga nya källgrundade förslag ännu.</strong><p>Atlas visar förslag när det finns en aktuell, sparad analys att bygga dem på.</p></div>}
    </section>
    <section aria-labelledby="growth-title">
      <div className={styles.sectionHead}><div><p className={styles.eyebrow}>RESULTAT OCH RÖRELSE</p><h2 id="growth-title">Tillväxt</h2><p>Webbtrafik och social publik visas separat, per projekt och källa.</p></div><span className={styles.count}>{growth.period} dagar · UTC</span></div>
      <div className={styles.trafficGrid}>{web.length?web.map(t=><article className={styles.trafficCard} key={t.projectId}>
        <div className={styles.panelHeading}><h3>Webbtrafik · {t.projectName}</h3><State state={t.state}/></div>
        <div className={styles.trafficMetric}><strong>{t.totalPageviews===null?'—':number(t.totalPageviews)}</strong><span>sidvisningar under perioden</span><span className={styles.sourcePill}>PostHog</span></div>
        <Plot points={t.days} label={'Dagliga sidvisningar · '+t.projectName} id={t.projectId+'-web'}/>
        <p className={styles.sourceNote}>Hämtad {when(t.checkedAt)} · Stockholm. Dagens UTC-datum är ännu inte avslutat.</p>
      </article>):<article className={styles.empty}><State state="missing"/><h3>Webbtrafiken börjar här.</h3><p>Ingen ansluten trafikkälla har lämnat användbara observationer till den här översikten ännu.</p></article>}</div>
      <div className={styles.audienceHeading}><h3>Din sociala publik</h3><span>Följare per konto · personer summeras inte mellan kanaler</span></div>
      {audience.length?<div className={styles.audienceGrid}>{audience.map(s=><Audience key={s.projectId+'-'+s.platform} series={s}/>)}</div>:<div className={styles.empty}><strong>Inga sociala mätningar att visa ännu.</strong><p>Följarantal och historik visas när projektens verifierade konton har lämnat observationer.</p></div>}
    </section>
    <section aria-labelledby="competitor-title">
      <div className={styles.sectionHead}><div><p className={styles.eyebrow}>UTBLICK</p><h2 id="competitor-title">Konkurrenter</h2><p>Sparade källkontroller för Handlarbörsen. En ändrad sidtitel behöver granskas innan den blir en affärsslutsats.</p></div></div>
      {growth.competitors.length?<div className={styles.competitorGrid}>{growth.competitors.map(c=><article className={styles.competitor} key={c.sourceId}>
        <div className={styles.panelHeading}><h3>{c.name}</h3><span aria-hidden="true">↗</span></div>
        <State state={c.state} missingLabel="Ingen sparad kontroll"/><p>{c.detail}</p><small>{when(c.checkedAt)}{c.checkedAt?' · Stockholm':''}</small>
        <a href={c.url} target="_blank" rel="noreferrer">Öppna källan ↗</a>
      </article>)}</div>:<div className={styles.empty}>Inget verifierat konkurrentunderlag för projekten i den här översikten.</div>}
    </section>
  </div>
}
