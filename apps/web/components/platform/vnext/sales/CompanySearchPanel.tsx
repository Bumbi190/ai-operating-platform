'use client'

import React,{useRef,useState} from 'react'
import {MapPin,Search} from 'lucide-react'
import {DISCOVERY_CITIES,type DiscoveryCity} from '@/lib/sales/discovery/types'
import type {CompanyDirectory,CompanyRow} from '@/lib/sales/companies/types'
import type {CompanySearchQuery} from '@/lib/sales/companies/query'
import {SWEDISH_MUNICIPALITIES,municipalityByName} from '@/lib/sales/companies/municipalities'
import styles from './CompanyDirectory.module.css'

export function CompanySearchPanel({data,onResult,renderRows}:{data:CompanyDirectory;onResult:(value:CompanyDirectory)=>void;renderRows:(rows:CompanyRow[])=>React.ReactNode}){
 const [city,setCity]=useState<DiscoveryCity>('malmo'),[municipalityName,setMunicipalityName]=useState('Malmö'),[radius,setRadius]=useState(5),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[hasSearched,setHasSearched]=useState(false),[lastQuery,setLastQuery]=useState<CompanySearchQuery|null>(null)
 const pending=useRef(false),scb=data.searchProvider==='scb',fresh=data.rows.filter(r=>r.id.startsWith('public:')),meta=data.searchMeta,municipality=municipalityByName(municipalityName)
 async function search(query:CompanySearchQuery,offset=0){
  if(pending.current||!data.sourceConfigured)return
  pending.current=true;setBusy(true);setError(null)
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000)
  try{
   const response=await fetch('/api/sales/companies',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',signal:controller.signal,body:JSON.stringify({projectId:data.projectId,query,...(offset?{offset}:{})})})
   if(!response.ok)throw new Error('source_unavailable')
   const next=await response.json() as CompanyDirectory
   if(next.projectId!==data.projectId||next.readOnly!==true||!Array.isArray(next.rows)||!Array.isArray(next.sources))throw new Error('source_invalid')
   onResult(next);setLastQuery(query);setHasSearched(true)
  }catch{setError('Källan kunde inte läsas. Ingen automatisk omsökning görs; eventuell tidigare visning är äldre underlag.')}
  finally{clearTimeout(timer);pending.current=false;setBusy(false)}
 }
 return <section id="sok-bilhandlare" className={styles.publicSearch} aria-labelledby="public-heading">
  <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>SÖK NYA FÖRETAG · {scb?'SCB':'PUBLIK KÄLLA'}</p><h2 id="public-heading">Hitta bilhandlare</h2></div><MapPin size={22} aria-hidden="true" /></div>
  <p className={styles.note}>{scb?'Skriv eller välj bland Sveriges 290 kommuner. Sökningen hämtar registrerad bilhandel i kommunen. Fem registerträffar granskas per sida; använd Nästa för fler. SCB:s branschkod bevisar inte aktuell bilförsäljning.':'Ett begränsat uppslag i den konfigurerade kartkällan.'} Kontaktväg och mejlhistorik behöver granskas. Sökningen sparar inga kontakter.</p>
  <form className={styles.publicForm} onSubmit={e=>{e.preventDefault();if(scb){if(municipality)void search({municipalityCode:municipality.code,category:'car_dealer',limit:5})}else void search({city,category:'car_dealer',radiusKm:radius,limit:20})}}>
   {scb&&<label><span>Bransch</span><input value="Bilhandlare" readOnly /></label>}
   {scb?<label><span>Kommun</span><input aria-label="Kommun" aria-describedby="municipality-help" type="text" list="company-municipalities" maxLength={80} value={municipalityName} disabled={busy} onChange={e=>setMunicipalityName(e.target.value)} placeholder="Skriv t.ex. Hässleholm" autoComplete="off" required /><datalist id="company-municipalities">{[...SWEDISH_MUNICIPALITIES].sort((a,b)=>a.name.localeCompare(b.name,'sv-SE')).map(m=><option key={m.code} value={m.name} />)}</datalist></label>:<label><span>Ort för publik sökning</span><select aria-label="Ort för publik sökning" value={city} disabled={busy} onChange={e=>setCity(e.target.value as DiscoveryCity)}>{Object.entries(DISCOVERY_CITIES).map(([key,c])=><option key={key} value={key}>{c.label}</option>)}</select></label>}
   {!scb&&<label><span>Radie från ortens centrum (km)</span><input type="number" min={1} max={25} value={radius} disabled={busy} onChange={e=>setRadius(Number(e.target.value))} required /></label>}
   <button type="submit" disabled={busy||!data.sourceConfigured||(scb&&!municipality)}><Search size={16} aria-hidden="true" />{busy?'Läser källa…':scb?'Sök bilhandlare':'Sök i publik källa'}</button>
  </form>
  {scb&&<p id="municipality-help" className={styles.note}>{municipality?`${municipality.name} kommun är vald. Klicka Sök bilhandlare för nya registerträffar.`:'Skriv ett fullständigt kommunnamn och välj i listan, t.ex. Hässleholm eller Kristianstad.'}</p>}
  {!data.sourceConfigured&&<p className={styles.warning}>Sökkällan är inte tillgänglig i denna miljö. Det sparade underlaget kan fortfarande filtreras nedan.</p>}
  {error&&<p className={styles.warning} role="alert">{error}</p>}
  {hasSearched&&<div>
   <p className={styles.note} role="status">{fresh.length} källposter i denna omgång.{meta?` ${meta.matchedWorkplaces} registerträffar i hämtat underlag för ${meta.areaLabel}.`:''}</p>
   <p className={styles.note}>{meta?'SCB:s registrerade näringsgren är ett granskningsunderlag; detta är ingen komplett lista över alla bilhandlare.':'Urval ur kartkällan, inte alla bilhandlare.'}</p>
   {meta?.truncated&&<p className={styles.warning}>Registerhämtningen nådde sin gräns. Även antalet registerträffar kan vara ofullständigt.</p>}
   {!!meta?.skippedInPage&&<p className={styles.note}>{meta.skippedInPage} poster i omgången behöver ytterligare identitetsgranskning och visas inte.</p>}
   <div className={styles.cards}>{renderRows(fresh)}</div>
   {meta?.nextOffset!==null&&meta?.nextOffset!==undefined&&lastQuery&&<button type="button" disabled={busy} onClick={()=>void search(lastQuery,meta.nextOffset!)}>Nästa 5 registerträffar</button>}
  </div>}
 </section>
}
