'use client'

import React,{useMemo,useState} from 'react'
import {Building2,Search,ArrowUpRight,ShieldCheck,ChevronDown,MapPin,Mail} from 'lucide-react'
import {publicWebsite} from '@/lib/sales/discovery/validate'
import {filterCompanies} from '@/lib/sales/companies/filter'
import type {CompanyDirectory as Directory,CompanyRow} from '@/lib/sales/companies/types'
import styles from './CompanyDirectory.module.css'
import {CompanySearchPanel} from './CompanySearchPanel'
import {municipalityByName} from '@/lib/sales/companies/municipalities'

const sourceStates={ready:'Läst',disabled:'Inte aktiverad',unavailable:'Otillgänglig',incomplete:'Ofullständig',empty:'Tom'}
const statusText={contacted:'Tidigare kontakt',unknown:'Historik okänd',no_match:'Ingen träff i tillgängligt underlag'}
const outcomeText={accepted:'Accepterat av sändservern',delivery_unknown:'Sändning med okänd leverans',failed_before_send:'Stoppat före sändning',received:'Mottaget brev',bounced:'Studs',unsubscribed:'Avregistrering'}
function date(value:string|null){if(!value)return 'Ej verifierat i underlaget';const n=Date.parse(value);return Number.isFinite(n)?new Intl.DateTimeFormat('sv-SE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Stockholm'}).format(n):'Okänt datum'}
function External({url,children}:{url:string|null;children:React.ReactNode}){const safe=publicWebsite(url);return safe?<a href={safe} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={13} aria-hidden="true" /></a>:null}
function CompanyCard({row}:{row:CompanyRow}){
 const [expanded,setExpanded]=useState(false)
 return <article className={styles.card}>
  <div className={styles.cardTop}><span className={styles.companyIcon}><Building2 size={20} aria-hidden="true" /></span><div className={styles.identity}><h3>{row.name}</h3><p><MapPin size={12} aria-hidden="true" />{row.city||row.branch||(row.searchArea?'Sökområde: '+row.searchArea:'Ort saknas i underlaget')}{row.orgnr?` · ${row.orgnr}`:''}</p></div><span className={styles.status} data-tone={row.status==='contacted'?'cyan':'muted'}>{statusText[row.status]}</span></div>
  {row.workplaceRef&&<p className={styles.note}>Arbetsställe: {row.branch||'Namn saknas i källan'}</p>}
  {row.workplaceRef&&<p className={styles.note}>CFAR {row.workplaceRef}</p>}
  <div className={styles.badges}>{row.badges.map(b=><span key={b}>{b}</span>)}</div>
  {row.matches.length>0&&<p className={styles.warning}>{row.matches.join(' · ')}</p>}
  {row.dialogContext&&<p className={styles.warning}>{row.dialogContext}<small>Namnkopplat överlämningsunderlag; läs aktuell tråd före åtgärd.</small></p>}
  <div className={styles.cardBottom}><span>{row.sourceLabel}</span><div><External url={row.websiteUrl}>Webbplats</External><button type="button" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded} aria-controls={'detail-'+row.id} aria-label={`${expanded?'Dölj':'Visa'} historik för ${row.name}`}>Historik<ChevronDown size={14} aria-hidden="true" /></button></div></div>
  {expanded&&<section id={'detail-'+row.id} className={styles.detail} aria-label={'Historik för '+row.name}>
   <dl><div><dt>Mejladress</dt><dd>{row.email||'Ingen verifierad adress i denna källa'}</dd></div><div><dt>Filial</dt><dd>{row.branch||'Inte verifierad'}</dd></div>{row.workplaceRef&&<div><dt>Arbetsställe (CFAR)</dt><dd>{row.workplaceRef}</dd></div>}<div><dt>Senast skickat</dt><dd>{date(row.lastOutboundAt)}</dd></div><div><dt>Senast mottaget</dt><dd>{date(row.lastInboundAt)}</dd></div><div><dt>Erbjudande</dt><dd>{row.offerLabel||'Inte verifierat i denna post'}</dd></div><div><dt>Källpost läst</dt><dd>{date(row.sourceObservedAt)}</dd></div></dl>
   {row.earliestReviewAt&&<p className={styles.warning}>Tidigast ny granskning: {date(row.earliestReviewAt)}. Detta är ingen bokning eller tillåtelse att skicka.</p>}
   {row.reviewNote&&<p>{row.reviewNote}</p>}
   <ul className={styles.gaps}>{row.gaps.map((g,i)=><li key={i}>{g}</li>)}</ul>
   <p className={styles.note}>Öppning och klick är inte svar. Ett mottaget brev bevisar inte pilotintresse. Sändserverns acceptans bevisar inte slutleverans.</p>
   {row.events.length>0?<ol className={styles.events} aria-label="Observerade meddelanden">{row.events.map(e=><li key={e.id}><time dateTime={e.occurredAt}>{date(e.occurredAt)}</time><span>{e.outcomes.map(o=>outcomeText[o]).join(' · ')}</span></li>)}</ol>:<p>Inga meddelandehändelser har verifierats i den här postens aktuella revision.</p>}
   <External url={row.sourceUrl}>Öppna källan</External>
  </section>}
 </article>
}

export function CompanyDirectory({initial}:{initial:Directory}){
 const [data,setData]=useState(initial),[query,setQuery]=useState(''),[area,setArea]=useState(''),[status,setStatus]=useState('all')
 const project=data.project??{id:data.projectId,name:'Handlarbörsen',slug:'handlarborsen'}
 const projectOptions=data.projectOptions??[project]
 const projectBase='/projects/'+project.slug
 const hb=project.slug==='handlarborsen'
 const hasWebbuilder=projectOptions.some(p=>/^(web-?builder|web-?studio|omnira-web-?studio)$/i.test(p.slug))
 const typedMunicipality=municipalityByName(query)
 const saved=data.rows.filter(r=>!r.id.startsWith('public:'))
 const filtered=useMemo(()=>filterCompanies(saved,{query,area,status}),[data,query,area,status])
 return <main className={styles.page}>
  <nav className={styles.breadcrumb} aria-label="Brödsmulor"><a href={projectBase}>{project.name}</a><span>/</span><span>Företag</span></nav>
  <header className={styles.header}><div><p className={styles.eyebrow}>{project.name.toLocaleUpperCase('sv-SE')} · FÖRETAGSUNDERLAG</p><h1>Företag<span aria-hidden="true">.</span></h1><p>Hitta företag per bransch och kommun. Granska historiken för valt projekt.</p></div><span className={styles.readOnly}><ShieldCheck size={16} aria-hidden="true" />Skrivskyddad granskning</span></header>
  <section className={styles.projectContext} aria-label="Projektkontext"><label><span>Projekt för underlaget</span><select aria-label="Projekt för underlaget" value={data.projectId} onChange={e=>{const selected=projectOptions.find(p=>p.id===e.target.value);if(selected&&selected.id!==data.projectId)window.location.assign('/projects/'+selected.slug+'/companies')}}>{projectOptions.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><p className={styles.note}>Kontaktjournal och erbjudanden gäller bara {project.name}. Ett projektbyte öppnar det projektets egen vy. Historik och spärrar i andra projekt är ännu inte sammanställda här.</p>{!hasWebbuilder&&<p className={styles.note}>Webbuilder saknar ännu ett verifierat projekt i denna lista. Branschsökningen kan granskas här; leads förs inte över till ett annat projekt.</p>}</section>
  <div className={styles.metrics}><div><span>Poster i sparat underlag</span><strong>{saved.length}</strong><small>Kan innehålla flera källor för samma bolag</small></div><div><span>Unika mejladresser i journalen</span><strong>{data.uniqueRecipients??'—'}</strong><small>Delad adress bevisar inte samma bolag</small></div><div><span>Senast läst</span><strong className={styles.smallMetric}>{date(data.evaluatedAt)}</strong><small>Mejlkällornas egna kontrolldatum kan vara äldre</small></div></div>
  <details className={styles.sources}><summary>Datakällor och täckning <span>Historiken ger ingen automatisk kontaktbehörighet</span></summary><div className={styles.sourceGrid}>{data.sources.map(s=><article key={s.key}><strong>{s.label}<span data-state={s.state}>{sourceStates[s.state]}</span></strong><p>{s.note}</p>{s.observedAt&&<small>{date(s.observedAt)}</small>}</article>)}</div></details>
  {data.sources.some(s=>s.key==='contacts'&&s.state!=='ready')&&<p className={styles.warning} role="status">Källa otillgänglig. Kontaktjournalen kunde inte läsas komplett. Inga uteblivna träffar får tolkas som att kontakt saknas.</p>}
  <CompanySearchPanel data={data} onResult={setData} renderRows={rows=>rows.map(r=><CompanyCard key={r.id} row={r} />)} />
  <section className={styles.saved} aria-labelledby="saved-heading"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>KONTAKTJOURNAL & SPARAD RESEARCH</p><h2 id="saved-heading">Ditt företagsunderlag</h2></div><span>{filtered.length} av {saved.length} poster</span></div>
   <div className={styles.filters}><label><span>Filtrera sparade företag</span><div className={styles.inputIcon}><Search size={16} aria-hidden="true" /><input type="search" maxLength={100} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Företagsnamn, org.nr eller mejladress" /></div></label><label><span>Område i sparat underlag</span><input type="search" maxLength={80} value={area} onChange={e=>setArea(e.target.value)} placeholder="Ort eller verifierat filialnamn" /></label><label><span>Kontaktstatus</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Alla statusar</option><option value="contacted">Tidigare kontakt</option><option value="unknown">Historik okänd</option><option value="no_match">Ingen träff i granskat underlag</option><option value="blocked">Spärrad / exkluderad</option></select></label></div>
   <p className={styles.note}>Filtrerar företagsnamn och kontaktuppgifter i sparade poster. Använd sökningen ovan för att hitta nya företag. Saknad ort innebär okänt område. Flera källor kan beskriva samma företag; namn och domän slås inte ihop automatiskt.</p>
   {typedMunicipality&&<p className={styles.warning}><span>Detta är bara sparade poster, inte alla företag i {typedMunicipality.name}.</span> <a href="#sok-foretag">Sök fler i kommunen ovan</a></p>}
   <div className={styles.cards}>{filtered.map(r=><CompanyCard key={r.id} row={r} />)}</div>{!filtered.length&&<div className={styles.empty}><Building2 size={28} aria-hidden="true" /><h3>Inga företag matchar filtren.</h3><p>Här filtreras endast sparade namn och kontaktuppgifter.</p><a href="#sok-foretag">Sök nya företag ovan</a></div>}
  </section>
  <footer className={styles.footer}><Mail size={15} aria-hidden="true" /><p>Inga mejl skickas, schemaläggs eller godkänns här. Aktuella svar, spärrar, registreringar och den faktiska senaste tråden måste granskas före en kontaktåtgärd.</p>{hb&&<a href={projectBase+'/lead-finder'}>Öppna befintlig Lead Finder<ArrowUpRight size={13} aria-hidden="true" /></a>}</footer>
 </main>
}
