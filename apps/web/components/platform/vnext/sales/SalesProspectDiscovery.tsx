'use client'
import {useEffect,useState,type FormEvent} from 'react'
import {DISCOVERY_CITIES,DISCOVERY_CATEGORIES,type DiscoveryReport,type DiscoveryCandidate,type DiscoveryStatus} from '@/lib/sales/discovery/types'
import {publicWebsite} from '@/lib/sales/discovery/validate'
import styles from './SalesWorkspace.module.css'

const labels:Record<DiscoveryStatus,string>={needs_review:'Behöver granskas',rejected:'Avvisad',excluded:'Exkluderad',suppressed:'Spärrad',duplicate:'Dubblett',promoted:'Överförd till kontakter'}
const reasons:Record<string,string>={existing_account:'Befintligt konto',pilot_contact:'Känd pilotkontakt',declined:'Tidigare avböjt',already_contacted:'Tidigare kontakt',suppressed:'Kontaktspärr',excluded:'Exkluderad',existing_contact:'Finns redan bland projektets kontakter',duplicate_candidate:'Redan hittat i ett tidigare uppslag'}
function errorText(code:unknown):string{
 if(code==='DISCOVERY_RATE_LIMITED')return 'Sökningen är tillfälligt begränsad. Vänta innan du försöker igen. Pilotläget tillåter högst 25 sökningar under 24 timmar, gemensamt för projekten.'
 if(code==='DISCOVERY_SOURCE_NOT_CONFIGURED')return 'Sökkällan är inte konfigurerad. Pilotsökningen behöver en godkänd datakälla.'
 if(code==='DISCOVERY_STORE_UNAVAILABLE')return 'Det gick inte att bekräfta att resultatet sparades. Uppdatera sökresultatet innan du gör en ny sökning.'
 if(code==='DISCOVERY_PROVIDER_TIMEOUT')return 'Källan svarade inte i tid. Prova en mindre radie eller försök senare.'
 if(code==='DISCOVERY_RESPONSE_TOO_LARGE')return 'Svaret från källan var för stort. Välj en mindre radie och försök igen.'
 if(code==='DISCOVERY_PROVIDER_UNAVAILABLE')return 'Källan kunde inte lämna ett fullständigt svar. Försök igen senare.'
 if(code==='REVISION_CONFLICT')return 'Underlaget har ändrats. Granska den uppdaterade versionen innan du fortsätter.'
 if(code==='DISCOVERY_REVIEW_BLOCKED')return 'Företaget kan inte läggas till som en ny kontakt. Kontrollera dess spärrar och befintliga historik.'
 return 'Åtgärden kunde inte genomföras. Kontrollera underlaget och försök igen.'
}
async function responseJson(response:Response){const body=await response.json().catch(()=>({}));if(!response.ok)throw Error(errorText(body.code));return body}
function sourceUrl(candidate:DiscoveryCandidate):string|null{return /^(node|way|relation)\/[1-9][0-9]{0,15}$/.test(candidate.sourceId)?`https://www.openstreetmap.org/${candidate.sourceId}`:null}

export function SalesProspectDiscovery({projectId,onSaved,defaultOfferKind}:{projectId:string;onSaved:()=>Promise<void>;defaultOfferKind?:'pilot'|'general_service'}){
 const [report,setReport]=useState<DiscoveryReport|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[selectedId,setSelectedId]=useState<string|null>(null),[offerKind,setOfferKind]=useState(defaultOfferKind??''),[expiredBatchId,setExpiredBatchId]=useState<string|null>(null)
 const current=report?.projectId===projectId?report:null,selected=current?.candidates.find(c=>c.id===selectedId&&c.status==='needs_review'),batchId=current?.batch?.id??null
 async function load(id:string|null=null){const q=new URLSearchParams({projectId});if(id)q.set('batchId',id);const value=await responseJson(await fetch(`/api/sales/discovery?${q}`,{cache:'no-store'}));setReport(value as DiscoveryReport)}
 useEffect(()=>{
  const controller=new AbortController();setSelectedId(null);setMessage('')
  fetch(`/api/sales/discovery?${new URLSearchParams({projectId})}`,{cache:'no-store',signal:controller.signal}).then(responseJson).then(value=>{if(!controller.signal.aborted)setReport(value as DiscoveryReport)}).catch(e=>{if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:errorText(null))})
  return()=>controller.abort()
 },[projectId])
 useEffect(()=>{
  const batch=current?.batch
  if(!batch||batch.state!=='pending')return
  const age=Date.now()-new Date(batch.createdAt).getTime()
  const delay=Number.isFinite(age)?Math.max(0,Math.min(60000,60000-age)):0
  const timer=setTimeout(()=>setExpiredBatchId(batch.id),delay)
  return()=>clearTimeout(timer)
 },[current?.batch?.id,current?.batch?.createdAt,current?.batch?.state])
 const pendingStale=current?.batch?.state==='pending'&&(expiredBatchId===current.batch.id||Date.now()-new Date(current.batch.createdAt).getTime()>=60000)
 async function mutate(input:Record<string,unknown>){return responseJson(await fetch('/api/sales/discovery',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId,...input})}))}
 async function run(work:()=>Promise<void>){setBusy(true);setMessage('');try{await work()}catch(e){setMessage(e instanceof Error?e.message:errorText(null));try{await load(batchId)}catch{}}finally{setBusy(false)}}
 function discover(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);void run(async()=>{
  const value=await mutate({operation:'discover',idempotencyKey:crypto.randomUUID(),query:{city:f.get('city'),category:f.get('category'),radiusKm:Number(f.get('radiusKm')),limit:Number(f.get('limit'))}})
  setReport(value as DiscoveryReport);setSelectedId(null);setMessage(value.batch?.state==='pending'?'Sökningen är registrerad. Uppdatera för att se resultatet.':'Sökningen är sparad. Granska uppgifterna innan ett företag läggs till som kontakt.')
 })}
 function promote(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!selected)return;const candidate=selected,f=new FormData(e.currentTarget);void run(async()=>{
  await mutate({operation:'promote',candidateId:candidate.id,expectedVersion:candidate.version,companyName:f.get('companyName'),branchName:f.get('branchName'),email:f.get('email'),websiteUrl:f.get('websiteUrl')||null,reviewNote:f.get('reviewNote'),businessConfirmed:f.get('businessConfirmed')==='on',emailConfirmed:f.get('emailConfirmed')==='on',offerKind:f.get('offerKind'),pilotMonths:f.get('offerKind')==='pilot'?Number(f.get('pilotMonths')):null})
  setSelectedId(null);await load(batchId);await onSaved();setMessage('Kontakten är sparad med okänd kontakthistorik. Granska historik och kontaktintervall i nästa steg innan ett utkast kan förberedas.')
 })}
 function review(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!selected)return;const candidate=selected,f=new FormData(e.currentTarget);void run(async()=>{
  await mutate({operation:'review',candidateId:candidate.id,expectedVersion:candidate.version,decision:f.get('decision'),note:f.get('note')});setSelectedId(null);await load(batchId);setMessage('Beslutet är sparat och följer med vid framtida sökningar.')
 })}
 return <details className={styles.disclosure}>
  <summary><h2>Hitta företag</h2><span>Högst 25 uppslag per sökning</span></summary>
  <div className={styles.disclosureBody}>
   <p>Sök efter företag i OpenStreetMap. Välj bransch och område för varje sökning. Offentliga uppgifter behöver granskas innan de blir kontakter.</p>
   <form className={styles.form} onSubmit={discover}>
    <label>Ort<select name="city" required defaultValue="" disabled={busy}><option value="" disabled>Välj ort</option>{Object.entries(DISCOVERY_CITIES).map(([id,city])=><option key={id} value={id}>{city.label}</option>)}</select></label>
    <label>Bransch<select name="category" required defaultValue="" disabled={busy}><option value="" disabled>Välj bransch</option>{Object.entries(DISCOVERY_CATEGORIES).map(([id,category])=><option key={id} value={id}>{category.label}</option>)}</select></label>
    <label>Radie från ortens centrum (km)<input name="radiusKm" type="number" required min={1} max={25} step={1} defaultValue={5} disabled={busy}/></label>
    <label>Högsta antal uppslag<select name="limit" defaultValue="20" disabled={busy}>{[5,10,20,25].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
    <button type="submit" disabled={busy}>{busy?'Arbetar…':'Hämta företag'}</button>
   </form>
   {message&&<p className={styles.message} role="status">{message}</p>}
   <p className={styles.notice}>Kontakthistorik och befintliga konton är inte fullständigt kontrollerade. Inga uppslag godkänns automatiskt för kontakt. En överförd kontakt behöver separat historik- och tidsgranskning.</p>
   <p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap-bidragsgivare</a>. Uppgifterna kan saknas eller vara inaktuella.</p>
   {current&&<>
    {!!current.batches.length&&<label className={styles.form}>Sparad sökning<select aria-label="Sparad sökning" value={batchId??''} disabled={busy} onChange={e=>{const id=e.target.value;setSelectedId(null);void run(()=>load(id))}}>{current.batches.map(b=><option key={b.id} value={b.id}>{DISCOVERY_CITIES[b.query.city].label} · {DISCOVERY_CATEGORIES[b.query.category].label} · {new Date(b.createdAt).toLocaleString('sv-SE')}</option>)}</select></label>}
    <button type="button" disabled={busy} onClick={()=>void run(()=>load(batchId))}>Uppdatera sökresultat</button>
    {current.batch?.state==='pending'&&<p role="status">{pendingStale?'Sökningen saknar ett sparat slutresultat. Uppdatera för att kontrollera läget eller gör en ny sökning.':'Sökningen är registrerad utan sparat slutresultat. Uppdatera om en stund.'}</p>}
    {current.batch?.state==='failed'&&<p role="alert">{errorText(current.batch.errorCode)}</p>}
    {!current.batch&&<p className={styles.empty}>Inga sökningar är sparade ännu.</p>}
    {current.batch?.state==='completed'&&!current.candidates.length&&<p className={styles.empty}>Inga företag hittades med de valda inställningarna. Det betyder inte att området saknar företag.</p>}
    <ul className={styles.contacts}>{current.candidates.map(candidate=>{
     const source=sourceUrl(candidate),website=publicWebsite(candidate.websiteUrl)
     return <li key={candidate.id}><div><strong>{candidate.name}</strong><small>{labels[candidate.status]} · Uppgift hämtad {new Date(candidate.firstSeenAt).toLocaleDateString('sv-SE')}</small><p>{candidate.email?`Offentlig, ännu ej verifierad mejladress: ${candidate.email}`:'Ingen offentlig mejladress i uppslaget.'}</p><p>{source&&<a href={source} target="_blank" rel="noopener noreferrer">Visa källa i OpenStreetMap</a>}{website&&<> · <a href={website} target="_blank" rel="noopener noreferrer">Besök angiven webbplats</a></>}</p>{!!candidate.exclusions.length&&<p>{candidate.exclusions.map(reason=>reasons[reason]??'Behöver separat granskning').join(' · ')}</p>}{candidate.reviewNote&&<p>Granskningsanteckning: {candidate.reviewNote}</p>}</div>{candidate.status==='needs_review'&&<button type="button" disabled={busy} onClick={()=>{setSelectedId(candidate.id);setOfferKind(defaultOfferKind??'')}}>Granska företag</button>}</li>
    })}</ul>
   </>}
   {selected&&<section aria-label="Granska hittat företag">
    <h3>Granska {selected.name}</h3><p>Kontrollera företagets identitet och att mottagaren är rätt företagskontakt. Historiken förblir okänd efter att kontakten sparats.</p>
    <form key={`${selected.id}:${selected.version}`} className={styles.form} onSubmit={promote}>
     <label>Verifierat företagsnamn<input name="companyName" required maxLength={200} defaultValue={selected.name}/></label>
     <label>Filial<input name="branchName" maxLength={200} defaultValue=""/></label>
     <label>Verifierad mejladress<input name="email" type="email" required maxLength={254} defaultValue={selected.email??''}/></label>
     <label>Verifierad webbplats (https, om känd)<input name="websiteUrl" type="url" maxLength={2048} placeholder="https://" defaultValue={selected.websiteUrl?.startsWith('https://')?selected.websiteUrl:''}/></label>
     <label>Erbjudandetyp<select name="offerKind" required value={offerKind} onChange={e=>setOfferKind(e.target.value)}><option value="" disabled>Välj typ</option><option value="general_service">Tjänsteerbjudande</option><option value="pilot">Pilot</option></select></label>
     {offerKind==='pilot'&&<label>Verifierad pilotnivå<select name="pilotMonths" required defaultValue=""><option value="" disabled>Välj nivå</option>{[2,6,12].map(n=><option key={n} value={n}>{n} månader</option>)}</select></label>}
     <label>Underlag för företags- och adresskontroll<textarea name="reviewNote" required maxLength={500}/></label>
     <label className={styles.check}><input name="businessConfirmed" type="checkbox" required/>Jag har verifierat företaget och den valda erbjudandetypen eller pilotnivån.</label>
     <label className={styles.check}><input name="emailConfirmed" type="checkbox" required/>Jag har verifierat att mejladressen är rätt mottagare för företaget. En offentlig adress räcker inte som bekräftelse.</label>
     <button type="submit" disabled={busy}>Spara verifierad kontakt för historikgranskning</button>
    </form>
    <details><summary>Avvisa, exkludera eller spärra uppslaget</summary><form className={styles.form} onSubmit={review}>
     <label>Beslut<select name="decision" defaultValue="rejected"><option value="rejected">Avvisa uppslaget</option><option value="excluded">Exkludera företaget</option><option value="suppressed">Spärra kontakt</option></select></label>
     <label>Orsak<textarea name="note" required maxLength={500}/></label><button type="submit" disabled={busy}>Spara granskningsbeslut</button>
    </form></details>
    <button type="button" disabled={busy} onClick={()=>setSelectedId(null)}>Stäng granskningen</button>
   </section>}
  </div>
 </details>
}
