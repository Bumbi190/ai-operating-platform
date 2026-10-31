'use client'
import {useState,type FormEvent} from 'react'
import Link from 'next/link'
import type {SalesWorkspace as Workspace,SalesContact} from '@/lib/sales/types'
import {canPrepareContact,salesStatusLabel} from '@/lib/sales/view-model'
import {offersMatch,offerLabel} from '@/lib/sales/offers'
import {StratoConnection} from './StratoConnection'
import {SalesConnection} from './SalesConnection'
import {SalesInbox} from './SalesInbox'
import {SalesEmailTemplates} from './SalesEmailTemplates'
import {SalesContactTiming} from './SalesContactTiming'
import {SalesProspectDiscovery} from './SalesProspectDiscovery'
import {SalesReplies} from './SalesReplies'
import {SalesFirstDraftReviews} from './SalesFirstDraftReviews'
import styles from './SalesWorkspace.module.css'
export function SalesWorkspace({initial,projectName}:{initial:Workspace;projectName:string}){
 const [model,setModel]=useState(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[selected,setSelected]=useState<string[]>([]),[offerId,setOfferId]=useState(initial.offers[0]?.id??''),[editing,setEditing]=useState<SalesContact|null>(null),[openReviewKey,setOpenReviewKey]=useState<string|null>(null)
 const [contactKind,setContactKind]=useState<'pilot'|'general_service'>('pilot'),[newOfferKind,setNewOfferKind]=useState<'pilot'|'general_service'>('pilot')
 const offer=model.offers.find(x=>x.id===offerId)
 const mismatch=selected.some(id=>{const contact=model.contacts.find(c=>c.id===id);return !contact||!offer||!offersMatch(contact,offer)})
 async function load(){const r=await fetch(`/api/sales?projectId=${model.projectId}`,{cache:'no-store'});if(!r.ok)throw Error('Underlaget kunde inte uppdateras.');setModel(await r.json())}
 async function mutate(value:Record<string,unknown>){
  const r=await fetch('/api/sales',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:model.projectId,...value})})
  if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.code==='REVISION_CONFLICT'?'Underlaget har ändrats. Uppdatera sidan och granska den nya versionen.':'Åtgärden kunde inte genomföras. Kontrollera underlaget och försök igen.')}
  return r.json()
 }
 async function action(work:()=>Promise<void>){setBusy(true);setMessage('');try{await work()}catch(e){setMessage(e instanceof Error?e.message:'Åtgärden kunde inte genomföras.')}finally{setBusy(false)}}
 function saveContact(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);void action(async()=>{await mutate({operation:'save_contact',id:editing?.id??crypto.randomUUID(),expectedVersion:editing?.version??0,companyName:f.get('companyName'),branchName:f.get('branchName'),email:f.get('email'),websiteUrl:f.get('websiteUrl')||null,history:f.get('history'),historySource:f.get('historySource'),offerKind:f.get('offerKind'),pilotMonths:f.get('offerKind')==='general_service'?null:Number(f.get('pilotMonths')),confirmed:f.get('confirmed')==='on',excluded:f.get('excluded')==='on',suppressed:f.get('suppressed')==='on'});setEditing(null);await load();setMessage('Kontakten är sparad. Tidigare utskick har inte antagits eller skapats.')})}
 function saveOffer(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);void action(async()=>{const id=crypto.randomUUID();await mutate({operation:'save_offer',id,senderEmail:f.get('senderEmail'),offerKind:f.get('offerKind'),freeMonths:f.get('offerKind')==='general_service'?null:Number(f.get('freeMonths')),offerText:f.get('offerText'),productFacts:String(f.get('productFacts')).split('\n').map(x=>x.trim()).filter(Boolean),confirmed:f.get('confirmed')==='on'});await load();setOfferId(id);setMessage('Erbjudandet är sparat som en ny version.')})}

 const request=offer&&selected.length?`Förbered ett svenskt första mejlutkast till ${model.contacts.filter(c=>selected.includes(c.id)).map(c=>`${c.companyName}, ${c.branchName||'huvudkontor'} (${c.email})`).join('; ')} för ${projectName}. Använd det sparade erbjudandet ”${offer.offerText}”, skapat ${new Date(offer.createdAt).toLocaleString('sv-SE')}. Läs aktuellt säljunderlag först och be om förtydligande om kontakten eller erbjudandet inte kan matchas exakt. Skicka inget.`:''
 return <main className={styles.page}>
  <header className={styles.header}><div><p className={styles.eyebrow}>{projectName} / Atlas</p><h1>Säljförberedelse</h1><p>Från verifierad kontakt till ett personligt mejlutkast.</p></div><button disabled={busy} onClick={()=>void action(load)}>Uppdatera</button></header>
  <div className={styles.notice}><strong>Kundutskick är inte aktiverade.</strong> Här förbereder och granskar du. Testsvar kräver ett separat sändningsbeslut vid den godkända mejltexten.</div>
  {message&&<p className={styles.message} role="status">{message}</p>}
  <p className={styles.empty}>Atlas sköter förberedelserna. Öppna bara den del du vill granska eller ändra.</p>
   <SalesEmailTemplates projectId={model.projectId} revisions={model.emailTemplates} onSaved={load}/>
   <SalesContactTiming projectId={model.projectId} contacts={model.contacts} initialTiming={model.timing} onSaved={load}/>
   <SalesProspectDiscovery projectId={model.projectId} onSaved={load} defaultOfferKind={offer?.offerKind}/>
   <details className={styles.disclosure}><summary><h2>Kontakter</h2><span>{model.contacts.length} sparade</span></summary><div className={styles.disclosureBody}><p>Välj högst fem företag med samma typ av erbjudande och bekräftade villkor. Kontrollera historiken innan ett nytt första mejl förbereds.</p>
    {model.contacts.length===0?<p className={styles.empty}>Inga kontakter är importerade. Lägg in bekräftat underlag för de första företagen.</p>:<ul className={styles.contacts}>{model.contacts.map(c=><li key={c.id}><label><input type="checkbox" checked={selected.includes(c.id)} disabled={!canPrepareContact(c,model.timing?.contacts.find(t=>t.contactId===c.id))||busy||(!selected.includes(c.id)&&selected.length>=5)} onChange={e=>setSelected(e.target.checked?[...selected,c.id]:selected.filter(id=>id!==c.id))}/><span><strong>{c.companyName}</strong> {c.branchName}<small>{c.email} · {c.offerKind==='general_service'?'Tjänsteerbjudande':`${c.pilotMonths} månaders pilot`}</small><small>{c.history==='not_contacted'?'Ingen tidigare kontakt bekräftad':c.history==='contacted'?'Tidigare kontakt registrerad':'Kontakthistorik behöver granskas'}{c.excluded?' · Exkluderad':''}{c.suppressed?' · Kontaktspärr':''}</small></span></label><button disabled={busy} onClick={()=>{setEditing(c);setContactKind(c.offerKind??'pilot')}}>Redigera</button></li>)}</ul>}
    <details open={!!editing}><summary>{editing?'Redigera kontakt':'Lägg till kontakt'}</summary><form key={editing?.id??'new'} onSubmit={saveContact} className={styles.form}>
     <label>Företag<input name="companyName" required maxLength={200} defaultValue={editing?.companyName}/></label><label>Filial<input name="branchName" maxLength={200} defaultValue={editing?.branchName}/></label><label>Mejladress<input name="email" type="email" required defaultValue={editing?.email}/></label><label>Bekräftad webbplats<input name="websiteUrl" type="url" placeholder="https://" defaultValue={editing?.websiteUrl??''}/></label>
     <label>Typ av erbjudande<select name="offerKind" value={contactKind} onChange={e=>setContactKind(e.target.value as 'pilot'|'general_service')}><option value="pilot">Pilot med gratismånader</option><option value="general_service">Tjänsteerbjudande utan gratismånader</option></select></label>{contactKind==='pilot'&&<label>Pilotnivå<select name="pilotMonths" required defaultValue={editing?.pilotMonths??''}><option value="" disabled>Välj bekräftad nivå</option>{[12,6,2].map(n=><option key={n} value={n}>{n} månader gratis</option>)}</select></label>}
     <label>Kontakthistorik<select name="history" defaultValue={editing?.history??'unknown'}><option value="unknown">Behöver kontrolleras</option><option value="not_contacted">Ingen tidigare kontakt</option><option value="contacted">Har redan kontaktats</option></select></label><label>Underlag för kontakthistorik och erbjudande<textarea name="historySource" required maxLength={2000} defaultValue={editing?.historySource}/></label>
     <label className={styles.check}><input name="confirmed" type="checkbox" required defaultChecked={editing?.confirmed}/>Jag har kontrollerat kontakt, historik och erbjudandetyp.</label><label className={styles.check}><input name="excluded" type="checkbox" defaultChecked={editing?.excluded}/>Exkludera från säljförberedelse</label><label className={styles.check}><input name="suppressed" type="checkbox" defaultChecked={editing?.suppressed}/>Spärra kontakt</label><button disabled={busy} type="submit">Spara kontakt</button>{editing&&<button type="button" onClick={()=>setEditing(null)}>Avbryt redigering</button>}
    </form></details>
   </div></details>
   <details className={styles.disclosure}><summary><h2>Erbjudande och Atlas-uppdrag</h2><span>{model.offers.length} versioner</span></summary><div className={styles.disclosureBody}><p>Atlas använder den sparade versionen. Ett nytt erbjudande ersätter inte tidigare granskningar.</p><label className={styles.form}>Välj erbjudande<select value={offerId} onChange={e=>setOfferId(e.target.value)}><option value="">Välj version</option>{model.offers.map(o=><option key={o.id} value={o.id}>{offerLabel(o)} · {o.offerText}</option>)}</select></label>{offer&&<p className={styles.offer}>{offer.offerText}<small>Avsändare: {offer.senderEmail}</small></p>}
    {mismatch&&<p role="alert">Välj ett erbjudande som matchar alla valda kontakters erbjudandetyp och bekräftade villkor.</p>}
    {request&&<div className={styles.request}><p>Ge Atlas detta uppdrag i projektets samtal:</p><blockquote>{request}</blockquote><button disabled={busy||mismatch} onClick={()=>void action(async()=>{await navigator.clipboard.writeText(request);setMessage('Uppdraget är kopierat. Klistra in det i samtalet med Atlas.')})}>Kopiera uppdrag till Atlas</button></div>}
    <details><summary>Spara nytt erbjudande</summary><form onSubmit={saveOffer} className={styles.form}><label>Avsändaradress<input name="senderEmail" type="email" required/></label><label>Typ av erbjudande<select name="offerKind" value={newOfferKind} onChange={e=>setNewOfferKind(e.target.value as 'pilot'|'general_service')}><option value="pilot">Pilot med gratismånader</option><option value="general_service">Tjänsteerbjudande utan gratismånader</option></select></label>{newOfferKind==='pilot'&&<label>Antal gratismånader<select name="freeMonths"><option value="12">12</option><option value="6">6</option><option value="2">2</option></select></label>}<label>Exakt erbjudande<textarea name="offerText" required maxLength={2000}/></label><label>Bekräftade produktfakta, en per rad<textarea name="productFacts" required placeholder="Endast projektets verifierade produkt- eller tjänstefakta"/></label><label className={styles.check}><input name="confirmed" type="checkbox" required/>Jag har verifierat innehållet.</label><button disabled={busy}>Spara erbjudandeversion</button></form></details>
    <div className={styles.worker}><SalesConnection projectId={model.projectId}/></div>
   </div></details>
  <details className={styles.disclosure}><summary><h2>Stratoanslutning</h2></summary><div className={styles.disclosureBody}><StratoConnection projectId={model.projectId}/></div></details>
  <details className={styles.disclosure}><summary><h2>Inkorg</h2></summary><div className={styles.disclosureBody}><SalesInbox projectId={model.projectId} contacts={model.contacts} offers={model.offers}/></div></details>
  <details className={styles.disclosure}><summary><h2>Svarsförslag att granska</h2></summary><div className={styles.disclosureBody}><SalesReplies projectId={model.projectId} openReviewKey={openReviewKey} onOpenReviewKeyChange={setOpenReviewKey}/></div></details>
  <details className={styles.disclosure}><summary><h2>Uppdrag</h2><span>{model.jobs.length} registrerade</span></summary><div className={styles.disclosureBody}>{!model.jobs.length?<p className={styles.empty}>Inga uppdrag har skapats.</p>:<ul className={styles.jobs}>{model.jobs.map(j=><li key={j.id}><span><strong>{salesStatusLabel(j.status)}</strong><small>{new Date(j.createdAt).toLocaleString('sv-SE')} · {j.attempts} modellförsök</small>{j.detail&&<small>{j.detail}</small>}</span>{['queued','running','reconciling'].includes(j.status)&&<button disabled={busy} onClick={()=>void action(async()=>{await mutate({operation:'cancel',jobId:j.id});await load()})}>Avbryt uppdrag</button>}</li>)}</ul>}</div></details>
  <details className={styles.disclosure}>
    <summary><h2>Mejlutkast att granska</h2><span>{model.drafts.length} aktuella versioner</span></summary>
    <div className={styles.disclosureBody}>
      <SalesFirstDraftReviews model={model} openReviewKey={openReviewKey}
        onOpenReviewKeyChange={setOpenReviewKey} onRefresh={load} />
    </div>
  </details>
 </main>
}
