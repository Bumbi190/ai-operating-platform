'use client'

import React,{useEffect,useRef,useState} from 'react'
import {publicWebsite} from '@/lib/sales/discovery/validate'
import {COMPANY_WEBSITE_CONFIRMATION,type CompanyWebsiteResponse} from '@/lib/sales/companies/website-types'
import type {CompanyRow} from '@/lib/sales/companies/types'
import styles from './CompanyDirectory.module.css'

export function CompanyWebsitePanel({projectId,row,configured}:{projectId:string;row:CompanyRow;configured:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[result,setResult]=useState<CompanyWebsiteResponse|null>(null)
 const pending=useRef(false),active=useRef<AbortController|null>(null)
 useEffect(()=>()=>{active.current?.abort();active.current=null},[])
 const legalIdentity=!!row.orgnr&&/^\d{2}[2-9]\d{7}$/.test(row.orgnr)
 async function investigate(){
  if(pending.current||!configured||!legalIdentity)return
  pending.current=true;setBusy(true);setError(null);setResult(null)
  const controller=new AbortController();active.current=controller
  const timer=setTimeout(()=>controller.abort(),35000)
  try{
   const response=await fetch('/api/sales/companies/website',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',signal:controller.signal,body:JSON.stringify({projectId,orgnr:row.orgnr,workplaceRef:row.workplaceRef??null,confirmation:COMPANY_WEBSITE_CONFIRMATION})})
   if(!response.ok)throw Error('source_unavailable')
   const next=await response.json() as CompanyWebsiteResponse
   if(next.projectId!==projectId||next.orgnr!==row.orgnr||next.workplaceRef!==(row.workplaceRef??null)||next.outreachReady!==false||!['identity_match','no_match'].includes(next.state)||typeof next.checkedAt!=='string'||!Number.isFinite(Date.parse(next.checkedAt))||typeof next.legalName!=='string'||next.legalName.length>200||!Number.isInteger(next.providerCalls)||next.providerCalls<1||next.providerCalls>2)throw Error('source_invalid')
   if(next.state==='identity_match'&&(!publicWebsite(next.websiteUrl,true)||next.sourceUrl!==next.websiteUrl||typeof next.excerpt!=='string'||next.excerpt.length>160))throw Error('source_invalid')
   if(next.state==='no_match'&&(next.websiteUrl!==null||next.sourceUrl!==null||next.excerpt!==null))throw Error('source_invalid')
   if(!controller.signal.aborted)setResult(next)
  }catch{if(active.current===controller)setError('Webbplatsunderlaget kunde inte läsas. Ingen automatisk omsökning görs.')}
  finally{clearTimeout(timer);if(active.current===controller){pending.current=false;setBusy(false)}}
 }
 return <details className={styles.websiteEvidence}>
  <summary>Webbplatsunderlag</summary>
  <p className={styles.note}>Undersök ett företag i taget. En kontroll använder en grundsökning och högst en sidläsning via Tavily, vilket förbrukar sökkrediter.</p>
  {row.websiteUrl&&publicWebsite(row.websiteUrl,true)&&<p className={styles.note}>Sparad webbplatsuppgift: <a href={publicWebsite(row.websiteUrl,true)!} target="_blank" rel="noreferrer">Öppna sparad webbplats</a>. Uppgiften är inte nykontrollerad här.</p>}
  {!configured&&<p className={styles.note}>Webbresearch är inte aktiverad i denna miljö.</p>}
  {!legalIdentity&&<p className={styles.note}>Bolagsnummer saknas eller behöver verifieras innan webbplatsen kan undersökas.</p>}
  <button type="button" disabled={!configured||!legalIdentity||busy} onClick={()=>void investigate()}>{busy?'Undersöker webbplats…':'Undersök webbplats'}</button>
  {busy&&<p className={styles.note} role="status">Läser begränsat källunderlag för detta bolag…</p>}
  {error&&<p className={styles.warning} role="alert">{error}</p>}
  {result&&<div className={styles.websiteResult}>
   {result.state==='identity_match'?<><strong>Bolagsnamn och organisationsnummer hittade på sidan.</strong><p>{result.excerpt}</p><a href={publicWebsite(result.sourceUrl,true)!} target="_blank" rel="noreferrer">Källa till webbplatsuppgifter</a><p className={styles.note}>Detta bevisar inte webbplatsägande, filialkoppling, aktuell verksamhet eller rätt att kontakta företaget. Granska sidan och bolagsuppgifterna före nästa steg.</p></>:<p>Ingen webbplats kunde kopplas till bolaget i denna kontroll. Företaget kan ändå ha en webbplats.</p>}
   <p className={styles.note}>Kontrollerat {new Intl.DateTimeFormat('sv-SE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Stockholm'}).format(new Date(result.checkedAt))}. Underlaget sparas inte.</p>
  </div>}
 </details>
}
