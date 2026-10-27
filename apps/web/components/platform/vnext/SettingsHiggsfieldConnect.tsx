'use client'
import React,{useEffect,useMemo,useState,useSyncExternalStore} from 'react'
import {createHiggsfieldPanelController} from './higgsfield-panel-state'
import styles from './SettingsSurface.module.css'
const LABELS={disconnected:'Inte ansluten',connected:'Ansluten',reconnect_required:'Anslut igen',unavailable:'Tillfälligt otillgänglig'}
const INSPECTION_HINTS:Record<string,string>={
 unsupported_server_schema:'Higgsfields modell- eller verktygsformat matchar inte Omniras läsning.',
 invalid_response:'Higgsfield returnerade inget giltigt saldo eller pris.',
 provider_unavailable:'Higgsfield svarade inte som förväntat.',
 busy:'En annan läsning pågår.',
 storage_unavailable:'Omnira kunde inte kontrollera anslutningens lagring.',
 connection_changed:'Anslutningen ändrades under kontrollen.',
 not_configured:'Higgsfield är inte färdigkonfigurerat i Omnira.',
 disabled:'Higgsfield-läsningen är avstängd.',
}

export function SettingsHiggsfieldConnect({projectId,canManage}:{projectId:string;canManage:boolean}) {
 const controller=useMemo(()=>createHiggsfieldPanelController(projectId,canManage),[projectId,canManage])
 const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot)
 const [outcome,setOutcome]=useState<string|null>(null)
 const [budget,setBudget]=useState<{day:string;reservedSek:number;remainingSek:number}|null>(null)
 const [budgetUnavailable,setBudgetUnavailable]=useState(false)
 useEffect(()=>{
  if(!canManage){setBudget(null);return}
  let active=true
  const controller=new AbortController()
  setBudget(null);setBudgetUnavailable(false)
  void fetch('/api/media/higgsfield/budget?project_id='+encodeURIComponent(projectId),{
   cache:'no-store',signal:controller.signal,
  }).then(async response=>{
   if(!response.ok)throw Error()
   const raw:unknown=await response.json()
   if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error()
   const data=raw as Record<string,unknown>
   if(data.budgetSek!==5||typeof data.day!=='string'||
     !/^\d{4}-\d{2}-\d{2}$/.test(data.day)||
     typeof data.reservedSek!=='number'||!Number.isFinite(data.reservedSek)||
     typeof data.remainingSek!=='number'||!Number.isFinite(data.remainingSek)||
     data.reservedSek<0||data.remainingSek<0||data.reservedSek>5||data.remainingSek>5)throw Error()
   if(active)setBudget({day:data.day,reservedSek:data.reservedSek,remainingSek:data.remainingSek})
  }).catch(()=>{if(active)setBudgetUnavailable(true)})
  return ()=>{active=false;controller.abort()}
 },[canManage,projectId])
 useEffect(()=>{
  void controller.load()
  const q=new URLSearchParams(window.location.search)
  if(q.get('project_id')!==projectId)return
  if(q.get('higgsfield')==='connected')setOutcome('Higgsfield är anslutet.')
  else if(q.has('higgsfield'))setOutcome('Anslutningen slutfördes inte. Försök igen.')
 },[controller,projectId])
 const credits=(n:number|null)=>n===null?'Okänt':String(n)
 return <section className={styles.verify} aria-label="Higgsfield" data-higgsfield-project={projectId}>
  <h4>Higgsfield</h4>
  <p>Anslutningen kan bara läsa saldo och pris. Videogenerering är inte aktiverad.</p>
  <p>Föreslagen global Higgsfield-budget: <strong>5 kr per svensk dag</strong>, delad mellan The Prompt och Familje-Stunden. Omräkningen räknar försiktigt 1 kr per kredit. Detta är en användningsgräns, inte Higgsfields faktiska faktura eller abonnemangskostnad.</p>
  {canManage?(budget?<p>Reserverat {budget.reservedSek.toFixed(2)} kr av 5,00 kr den {budget.day}; återstår {budget.remainingSek.toFixed(2)} kr. Betalda videoklipp är fortfarande avstängda.</p>:
    <p>{budgetUnavailable?'Budgeten kan inte kontrolleras ännu. Ingen betald generation tillåts.':'Läser dagens budget…'}</p>):null}
  {!canManage?<p>En projektoperatör kan hantera anslutningen.</p>:<>
   <p role="status" aria-live="polite">{state.working?'Arbetar…':LABELS[state.status]}</p>
   {outcome?<p>{outcome}</p>:null}
   {state.inspectionUnavailable?<p role="alert">
    Saldo och testpris kunde inte läsas just nu. {state.inspectionIssue?INSPECTION_HINTS[state.inspectionIssue.code]??'Läsningen misslyckades.':''} Försök igen.
    {state.inspectionIssue?<small style={{display:'block',marginTop:4}}>
     Felsökningskod: {state.inspectionIssue.code}{state.inspectionIssue.stage?'/'+state.inspectionIssue.stage:''}
    </small>:null}
   </p>:null}
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    <button type="button" className={styles.secondary} disabled={state.working} onClick={()=>void controller.act('connect')}>{state.status==='connected'?'Anslut igen':'Anslut Higgsfield'}</button>
    <button type="button" className={styles.secondary} disabled={state.working||state.status!=='connected'} onClick={()=>void controller.act('inspect')}>Läs saldo och testpris</button>
    <button type="button" className={styles.secondary} disabled={state.working||state.status==='disconnected'} onClick={()=>void controller.act('disconnect')}>Koppla från</button>
   </div>
   <p>Saldo: {credits(state.creditBalance)} krediter. Testpris, 4 sekunder: {credits(state.quoteCredits)} krediter.</p>
   {state.observedAt?<p>Kontrollerat {new Date(state.observedAt).toLocaleString('sv-SE',{timeZone:'Europe/Stockholm'})}</p>:null}
  </>}
 </section>
}
