'use client'

import React,{useMemo,useRef,useState} from 'react'
import {Building2,Search,ArrowUpRight,ShieldCheck,ChevronDown,MapPin,Mail} from 'lucide-react'
import {DISCOVERY_CITIES,type DiscoveryCity} from '@/lib/sales/discovery/types'
import {publicWebsite} from '@/lib/sales/discovery/validate'
import {filterCompanies} from '@/lib/sales/companies/filter'
import type {CompanyDirectory as Directory,CompanyRow} from '@/lib/sales/companies/types'
import styles from './CompanyDirectory.module.css'

const sourceStates={ready:'Läst',disabled:'Inte aktiverad',unavailable:'Otillgänglig',incomplete:'Ofullständig',empty:'Tom'}
const statusText={contacted:'Tidigare kontakt',unknown:'Historik okänd',no_match:'Ingen träff i tillgängligt underlag'}
const outcomeText={accepted:'Accepterat av sändservern',delivery_unknown:'Sändning med okänd leverans',failed_before_send:'Stoppat före sändning',received:'Mottaget brev',bounced:'Studs',unsubscribed:'Avregistrering'}
function date(value:string|null){if(!value)return 'Ej verifierat i underlaget';const n=Date.parse(value);return Number.isFinite(n)?new Intl.DateTimeFormat('sv-SE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Stockholm'}).format(n):'Okänt datum'}
function External({url,children}:{url:string|null;children:React.ReactNode}){const safe=publicWebsite(url);return safe?<a href={safe} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={13} aria-hidden="true" /></a>:null}
function CompanyCard({row}:{row:CompanyRow}){
 const [expanded,setExpanded]=useState(false)
 return <article className={styles.card}>
  <div className={styles.cardTop}><span className={styles.companyIcon}><Building2 size={20} aria-hidden="true" /></span><div className={styles.identity}><h3>{row.name}</h3><p><MapPin size={12} aria-hidden="true" />{row.city||row.branch||(row.searchArea?'Sökområde: '+row.searchArea:'Ort saknas i underlaget')}{row.orgnr?` · ${row.orgnr}`:''}</p></div><span className={styles.status} data-tone={row.status==='contacted'?'cyan':'muted'}>{statusText[row.status]}</span></div>
  <div className={styles.badges}>{row.badges.map(b=><span key={b}>{b}</span>)}</div>
  {row.matches.length>0&&<p className={styles.warning}>{row.matches.join(' · ')}</p>}
  {row.dialogContext&&<p className={styles.warning}>{row.dialogContext}<small>Namnkopplat överlämningsunderlag; läs aktuell tråd före åtgärd.</small></p>}
  <div className={styles.cardBottom}><span>{row.sourceLabel}</span><div><External url={row.websiteUrl}>Webbplats</External><button type="button" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded} aria-controls={'detail-'+row.id} aria-label={`${expanded?'Dölj':'Visa'} historik för ${row.name}`}>Historik<ChevronDown size={14} aria-hidden="true" /></button></div></div>
  {expanded&&<section id={'detail-'+row.id} className={styles.detail} aria-label={'Historik för '+row.name}>
   <dl><div><dt>Mejladress</dt><dd>{row.email||'Ingen verifierad adress i denna källa'}</dd></div><div><dt>Filial</dt><dd>{row.branch||'Inte verifierad'}</dd></div><div><dt>Senast skickat</dt><dd>{date(row.lastOutboundAt)}</dd></div><div><dt>Senast mottaget</dt><dd>{date(row.lastInboundAt)}</dd></div><div><dt>Erbjudande</dt><dd>{row.offerLabel||'Inte verifierat i denna post'}</dd></div><div><dt>Källpost läst</dt><dd>{date(row.sourceObservedAt)}</dd></div></dl>
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
 const [data,setData]=useState(initial),[query,setQuery]=useState(''),[area,setArea]=useState(''),[status,setStatus]=useState('all'),[city,setCity]=useState<DiscoveryCity>('malmo'),[radius,setRadius]=useState(5),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[hasSearched,setHasSearched]=useState(false)
 const requestPending=useRef(false)
 const saved=data.rows.filter(r=>!r.id.startsWith('public:')),fresh=data.rows.filter(r=>r.id.startsWith('public:'))
 const filtered=useMemo(()=>filterCompanies(saved,{query,area,status}),[data,query,area,status])
 async function search(event:React.FormEvent){
  event.preventDefault();if(requestPending.current||!data.sourceConfigured)return
  requestPending.current=true;setBusy(true);setError(null)
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000)
  try{
   const response=await fetch('/api/sales/companies',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',signal:controller.signal,body:JSON.stringify({projectId:data.projectId,query:{city,category:'car_dealer',radiusKm:radius,limit:20}})})
   if(!response.ok)throw new Error('source_unavailable')
   const next=await response.json() as Directory
   if(next.projectId!==data.projectId||next.readOnly!==true||!Array.isArray(next.rows)||!Array.isArray(next.sources))throw new Error('source_invalid')
   setData(next);setHasSearched(true)
  }catch{setError('Källan kunde inte läsas. Ingen automatisk omsökning görs; eventuell tidigare visning är äldre underlag.')}
  finally{clearTimeout(timer);requestPending.current=false;setBusy(false)}
 }
 return <main className={styles.page}>
  <nav className={styles.breadcrumb} aria-label="Brödsmulor"><a href="/projects/handlarborsen">Handlarbörsen</a><span>/</span><span>Företag</span></nav>
  <header className={styles.header}><div><p className={styles.eyebrow}>HANDLARBÖRSEN · FÖRETAGSUNDERLAG</p><h1>Företag<span aria-hidden="true">.</span></h1><p>Hitta rätt handlare. Se vad som redan har hänt.</p></div><span className={styles.readOnly}><ShieldCheck size={16} aria-hidden="true" />Skrivskyddad granskning</span></header>
  <div className={styles.metrics}><div><span>Poster i sparat underlag</span><strong>{saved.length}</strong><small>Kan innehålla flera källor för samma bolag</small></div><div><span>Unika mejladresser i journalen</span><strong>{data.uniqueRecipients??'—'}</strong><small>Delad adress bevisar inte samma bolag</small></div><div><span>Senast läst</span><strong className={styles.smallMetric}>{date(data.evaluatedAt)}</strong><small>Mejlkällornas egna kontrolldatum kan vara äldre</small></div></div>
  <details className={styles.sources}><summary>Datakällor och täckning <span>Historiken ger ingen automatisk kontaktbehörighet</span></summary><div className={styles.sourceGrid}>{data.sources.map(s=><article key={s.key}><strong>{s.label}<span data-state={s.state}>{sourceStates[s.state]}</span></strong><p>{s.note}</p>{s.observedAt&&<small>{date(s.observedAt)}</small>}</article>)}</div></details>
  {data.sources.some(s=>s.key==='contacts'&&s.state!=='ready')&&<p className={styles.warning} role="status">Källa otillgänglig. Kontaktjournalen kunde inte läsas komplett. Inga uteblivna träffar får tolkas som att kontakt saknas.</p>}
  <section className={styles.saved} aria-labelledby="saved-heading"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>KONTAKTJOURNAL & SPARAD RESEARCH</p><h2 id="saved-heading">Ditt företagsunderlag</h2></div><span>{filtered.length} av {saved.length} poster</span></div>
   <div className={styles.filters}><label><span>Sök i sparat underlag</span><div className={styles.inputIcon}><Search size={16} aria-hidden="true" /><input type="search" maxLength={100} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Företag, org.nr eller mejladress" /></div></label><label><span>Område i sparat underlag</span><input type="search" maxLength={80} value={area} onChange={e=>setArea(e.target.value)} placeholder="Ort eller verifierat filialnamn" /></label><label><span>Kontaktstatus</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Alla statusar</option><option value="contacted">Tidigare kontakt</option><option value="unknown">Historik okänd</option><option value="no_match">Ingen träff i granskat underlag</option><option value="blocked">Spärrad / exkluderad</option></select></label></div>
   <p className={styles.note}>Söker i sparade poster. Saknad ort innebär okänt område. Flera källor kan beskriva samma företag; namn och domän slås inte ihop automatiskt.</p>
   <div className={styles.cards}>{filtered.map(r=><CompanyCard key={r.id} row={r} />)}</div>{!filtered.length&&<div className={styles.empty}><Building2 size={28} aria-hidden="true" /><h3>Inga företag matchar filtren.</h3><p>Det säger inget om vilka handlare som finns eller tidigare har kontaktats utanför detta underlag.</p></div>}
  </section>
  <section className={styles.publicSearch} aria-labelledby="public-heading"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>UPPTÄCK FLER FÖRETAG</p><h2 id="public-heading">Sök bilhandlare per område</h2></div><MapPin size={22} aria-hidden="true" /></div><p className={styles.note}>Ett begränsat uppslag i den konfigurerade kartkällan. Bolag, filial, webbplats och historik behöver granskas. Sökningen sparar inga kontakter.</p>
   <form className={styles.publicForm} onSubmit={search}><label><span>Ort för publik sökning</span><select value={city} disabled={busy} onChange={e=>setCity(e.target.value as DiscoveryCity)}>{Object.entries(DISCOVERY_CITIES).map(([key,c])=><option key={key} value={key}>{c.label}</option>)}</select></label><label><span>Radie från ortens centrum (km)</span><input type="number" min={1} max={25} value={radius} disabled={busy} onChange={e=>setRadius(Number(e.target.value))} required /></label><button type="submit" disabled={busy||!data.sourceConfigured}><Search size={16} aria-hidden="true" />{busy?'Läser källa…':'Sök i publik källa'}</button></form>
   {!data.sourceConfigured&&<p className={styles.warning}>Publik sökkälla är inte konfigurerad för denna miljö. Det sparade underlaget kan fortfarande granskas.</p>}{error&&<p className={styles.warning} role="alert">{error}</p>}
   {hasSearched&&<><p className={styles.note} role="status">{fresh.length} källposter · sökningen klar {date(data.evaluatedAt)}.</p><p className={styles.note}>Urval ur kartkällan, inte alla bilhandlare.</p><p className={styles.note}>{fresh.length} källposter · högst 20 före källans dubblettfilter. Inga nya kontaktposter har sparats.</p><div className={styles.cards}>{fresh.map(r=><CompanyCard key={r.id} row={r} />)}</div></>}
  </section>
  <footer className={styles.footer}><Mail size={15} aria-hidden="true" /><p>Inga mejl skickas, schemaläggs eller godkänns här. Aktuella svar, spärrar, registreringar och den faktiska senaste tråden måste granskas före en kontaktåtgärd.</p><a href="/projects/handlarborsen/lead-finder">Öppna befintlig Lead Finder<ArrowUpRight size={13} aria-hidden="true" /></a></footer>
 </main>
}
