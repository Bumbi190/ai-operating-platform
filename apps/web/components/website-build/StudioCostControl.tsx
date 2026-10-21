'use client'
import {useEffect,useRef,useState} from 'react'
import {Pause} from 'lucide-react'
import type {StudioCostSnapshot} from '@/lib/website-build/studio/costs'
import styles from './AtlasBuilderStudio.module.css'

const sek=(value:number)=>new Intl.NumberFormat('sv-SE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)
export function StudioCostControl({projectId,projectSlug,paused,onPauseChange}:{projectId:string;projectSlug:string;paused:boolean;onPauseChange:(paused:boolean)=>void}){
 const [snapshot,setSnapshot]=useState<StudioCostSnapshot|null>(null),[stale,setStale]=useState(false)
 const [pending,setPending]=useState(false),[confirmed,setConfirmed]=useState(paused),[stopError,setStopError]=useState('')
 const generation=useRef(0),stopping=useRef(false),request=useRef<AbortController|null>(null),callback=useRef(onPauseChange)
 callback.current=onPauseChange
 useEffect(()=>{
  let closed=false,timer:ReturnType<typeof setTimeout>|undefined
  async function refresh(){
   if(closed||document.visibilityState==='hidden'||stopping.current||request.current)return
   const epoch=generation.current,abort=new AbortController();request.current=abort
   const timeout=setTimeout(()=>abort.abort(),10000)
   try{
    const response=await fetch('/api/website-build/studio/costs?projectId='+encodeURIComponent(projectId),{cache:'no-store',signal:abort.signal})
    if(!response.ok)throw Error('unavailable')
    const next:StudioCostSnapshot=await response.json()
    if(next.projectId!==projectId||typeof next.paused!=='boolean'||!Number.isFinite(Date.parse(next.observedAt)))throw Error('invalid snapshot')
    if(!closed&&generation.current===epoch){setSnapshot(next);setConfirmed(next.paused);setStale(false);if(next.paused)setStopError('');callback.current(next.paused)}
   }catch{if(!closed&&generation.current===epoch)setStale(true)}
   finally{clearTimeout(timeout);if(request.current===abort)request.current=null}
  }
  async function tick(){await refresh();if(!closed)timer=setTimeout(tick,5000)}
  const visible=()=>{if(document.visibilityState==='visible')void refresh()}
  void tick();document.addEventListener('visibilitychange',visible)
  return()=>{closed=true;generation.current++;clearTimeout(timer);request.current?.abort();request.current=null;document.removeEventListener('visibilitychange',visible)}
 },[projectId])
 async function stop(){
  if(stopping.current||paused||confirmed)return
  stopping.current=true;setPending(true);setStopError('')
  const epoch=++generation.current;request.current?.abort();request.current=null
  const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),10000)
  try{
   const response=await fetch('/api/website-build/studio/costs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId}),signal:abort.signal})
   const receipt=await response.json().catch(()=>null)
   if(!response.ok||receipt?.projectId!==projectId||receipt.paused!==true)throw Error('unconfirmed')
   if(generation.current===epoch){setConfirmed(true);callback.current(true)}
  }catch{if(generation.current===epoch)setStopError('Stoppet kunde inte bekräftas. Försök igen.')}
  finally{clearTimeout(timeout);if(generation.current===epoch){stopping.current=false;setPending(false)}}
 }
 const stopped=paused||confirmed,monthly=snapshot?.monthly
 return <section className={styles.costControl} aria-label="Projektets kostnad">
  <div className={styles.costFigure} aria-live="polite" title={snapshot?'Registrerat '+new Date(snapshot.observedAt).toLocaleTimeString('sv-SE')+'. Uppdateras var femte sekund.':''}>
   {monthly?<><strong>{sek(monthly.spentSek)} / {sek(monthly.limitSek)} kr</strong><span data-cost-detail>denna månad · chatt och bygge</span>{snapshot?.modelPolicy?.profile==='openai_economy'&&<span data-cost-detail>OpenAI-test · GPT-5.4 mini</span>}</>:snapshot?<span>Välj månadsbudget för kostnadsöversikt</span>:<span>{stale?'Kostnaden är inte tillgänglig':'Hämtar kostnad…'}</span>}
   {monthly&&monthly.heldSek>0&&<span title="Reserverat är en säkerhetsmarginal för pågående anrop, inte en redan debiterad kostnad.">Reserverat: {sek(monthly.heldSek)} kr</span>}
   {snapshot&&!snapshot.enforced&&<span>Budgeten övervakas utan hård spärr</span>}
  </div>
  {stale&&<span role="status">Kostnaden kunde inte uppdateras{snapshot?' · senaste värdet visas':''}.</span>}
  {stopped?<><strong role="status">Projektet är pausat</strong><a href={'/projects/'+encodeURIComponent(projectSlug)}>Öppna projektets kontroller</a></>:<button className={styles.costStop} type="button" onClick={()=>void stop()} disabled={pending}><Pause size={13} aria-hidden/>{pending?'Stoppar…':'Stoppa projektet'}</button>}
  <span className={styles.costNote}>Pågående AI-anrop kan fortfarande kosta.</span>
  {stopError&&<span role="alert">{stopError}</span>}
 </section>
}
