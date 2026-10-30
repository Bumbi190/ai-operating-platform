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
