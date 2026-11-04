'use client'

import React,{useRef,useState} from 'react'
import {MapPin,Search} from 'lucide-react'
import {DISCOVERY_CITIES,type DiscoveryCity,type DiscoveryQuery} from '@/lib/sales/discovery/types'
import type {CompanyDirectory,CompanyRow} from '@/lib/sales/companies/types'
import styles from './CompanyDirectory.module.css'

export function CompanySearchPanel({data,onResult,renderRows}:{data:CompanyDirectory;onResult:(value:CompanyDirectory)=>void;renderRows:(rows:CompanyRow[])=>React.ReactNode}){
 const [city,setCity]=useState<DiscoveryCity>('malmo'),[radius,setRadius]=useState(5),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[hasSearched,setHasSearched]=useState(false),[lastQuery,setLastQuery]=useState<DiscoveryQuery|null>(null)
 const pending=useRef(false),scb=data.searchProvider==='scb',fresh=data.rows.filter(r=>r.id.startsWith('public:')),meta=data.searchMeta
 async function search(query:DiscoveryQuery,offset=0){
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
  <p className={styles.note}>{scb?'Sök registrerad bilhandel i vald kommun med den befintliga SCB-anslutningen. Fem arbetsställen granskas per omgång; du kan sedan gå vidare till nästa fem. SCB:s branschkod bevisar inte aktuell bilförsäljning.':'Ett begränsat uppslag i den konfigurerade kartkällan.'} Kontaktväg och mejlhistorik behöver granskas. Sökningen sparar inga kontakter.</p>
  <form className={styles.publicForm} onSubmit={e=>{e.preventDefault();void search({city,category:'car_dealer',radiusKm:scb?5:radius,limit:scb?5:20})}}>
   {scb&&<label><span>Bransch</span><input value="Bilhandlare" readOnly /></label>}
   <label><span>{scb?'Kommun':'Ort för publik sökning'}</span><select aria-label={scb?'Kommun':'Ort för publik sökning'} value={city} disabled={busy} onChange={e=>setCity(e.target.value as DiscoveryCity)}>{Object.entries(DISCOVERY_CITIES).map(([key,c])=><option key={key} value={key}>{c.label}</option>)}</select></label>
   {!scb&&<label><span>Radie från ortens centrum (km)</span><input type="number" min={1} max={25} value={radius} disabled={busy} onChange={e=>setRadius(Number(e.target.value))} required /></label>}
   <button type="submit" disabled={busy||!data.sourceConfigured}><Search size={16} aria-hidden="true" />{busy?'Läser källa…':scb?'Sök bilhandlare':'Sök i publik källa'}</button>
  </form>
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
