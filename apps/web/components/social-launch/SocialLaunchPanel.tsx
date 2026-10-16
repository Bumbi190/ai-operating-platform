'use client'
import {useState,useRef,useEffect} from 'react'
import {SOCIAL_LAUNCH_CHANNELS} from '@/lib/social-launch/catalog'
import type {SocialLaunchPageModel,SocialLaunchChoice,SocialLaunchChannelId,SocialLaunchReadiness} from '@/lib/social-launch/types'
import styles from './SocialLaunchPanel.module.css'
import {SocialConnectionControls} from './SocialConnectionControls'
const formats={text:'Text',image:'Bild',video:'Video',link:'Länk'}
const cadences={manual:'Vid behov',weekly:'En gång i veckan',twice_weekly:'Två gånger i veckan',daily:'Dagligen'}
const statuses:Record<SocialLaunchReadiness['connection'],string>={adapter_unavailable:'Kontokoppling saknas i Omnira',unreadable:'Kunde inte läsa anslutningen',needs_connection:'Behöver anslutas',needs_renewal:'Behöver förnyas',needs_verification:'Behöver verifieras',blocked:'Anslutningen är blockerad',verified:'Verifierat konto'}
export function SocialLaunchPanel({initial}:{initial:SocialLaunchPageModel}){
 return <ProjectPanel key={initial.plan.project.id} initial={initial}/>
}
function ProjectPanel({initial}:{initial:SocialLaunchPageModel}){
 const [model,setModel]=useState(initial),[choices,setChoices]=useState(initial.plan.currentRevision?.choices??[])
 const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[stale,setStale]=useState(false)
 const live=useRef(true),pending=useRef<{fingerprint:string;key:string}|null>(null),controller=useRef<AbortController|null>(null)
 useEffect(()=>{live.current=true;return()=>{live.current=false;controller.current?.abort()}},[])
 const projectId=initial.plan.project.id,revision=model.plan.currentRevision
 function change(channel:SocialLaunchChannelId,patch:Partial<SocialLaunchChoice>|null){
  setChoices(old=>patch===null?old.filter(c=>c.channel!==channel):old.some(c=>c.channel===channel)?old.map(c=>c.channel===channel?{...c,...patch}:c):[...old,{channel,purpose:'',format:SOCIAL_LAUNCH_CHANNELS.find(c=>c.id===channel)!.formats[0],cadence:'manual',...patch}])
  setDirty(true);setError('')
 }
 async function request(operation:'propose'|'decide'|'refresh',decision?:'approve'|'reject',metadataOnly=false){
  setBusy(true);setError('');const abort=new AbortController();controller.current=abort
  const payload=operation==='propose'?{operation,projectId,expectedRevisionId:revision?.id??null,choices}:{operation,projectId,revisionId:revision?.id,sha256:revision?.sha256,decision}
  const fingerprint=JSON.stringify(payload)
  if(operation!=='refresh'&&pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,key:crypto.randomUUID()}
  try{
   const response=await fetch(operation==='refresh'?'/api/social-launch?projectId='+encodeURIComponent(projectId):'/api/social-launch',{method:operation==='refresh'?'GET':'POST',headers:operation==='refresh'?undefined:{'content-type':'application/json'},body:operation==='refresh'?undefined:JSON.stringify({...payload,idempotencyKey:pending.current!.key}),cache:'no-store',signal:abort.signal})
   const result=await response.json()
   if(!live.current)return
   if(!response.ok){if(response.status===409){setStale(true);throw Error('Planen har ändrats. Läs senaste versionen innan du granskar igen. Ditt utkast finns kvar.')}throw Error(operation==='refresh'?'Planen kunde inte läsas.':'Ändringen kunde inte sparas. Ditt utkast finns kvar.')}
   if(result?.plan?.project?.id!==projectId)throw Error('Svaret gäller ett annat projekt. Ladda om sidan.')
   if(metadataOnly){setModel(old=>({...old,channels:result.channels,connections:result.connections}));return}
   setModel(result);setChoices(result.plan.currentRevision?.choices??[]);setDirty(false);setStale(false);pending.current=null
  }catch(e){if(live.current&&!abort.signal.aborted)setError(e instanceof Error?e.message:'Ändringen kunde inte sparas. Ditt utkast finns kvar.')}
  finally{if(live.current)setBusy(false)}
 }
 return <section className={styles.panel} aria-label="Projektets sociala medier" aria-busy={busy}>
  <header><h1>Sociala medier · {model.plan.project.name}</h1><p>Bestäm kanaler och innehåll med Atlas. Spara ett förslag och godkänn sedan exakt version.</p><p className={styles.note}>Kanalplanen ansluter inga konton och ger ingen publiceringsrätt. Inga betalda anrop görs här.</p></header>
  <div className={styles.review}>
   <strong>{dirty?'Osparade ändringar':model.plan.decision?.decision==='approve'?'Godkänd kanalplan':model.plan.decision?.decision==='reject'?'Avvisad kanalplan':revision?'Förslag att granska':'Ingen sparad kanalplan'}</strong>
   {revision&&<span>Version {revision.sequence}</span>}
   <div className={styles.actions}>
    <button disabled={busy||!dirty||stale} onClick={()=>void request('propose')}>Spara förslag</button>
    {revision&&!model.plan.decision&&<><button disabled={busy||dirty||stale} onClick={()=>void request('decide','approve')}>Godkänn version {revision.sequence}</button><button disabled={busy||dirty||stale} onClick={()=>void request('decide','reject')}>Avvisa version {revision.sequence}</button></>}
    <button disabled={busy} onClick={()=>{if(!dirty||window.confirm('Ersätt dina osparade val med senaste sparade versionen?'))void request('refresh')}}>Läs senaste versionen</button>
   </div>
   {error&&<p role="alert">{error}</p>}
   {dirty&&<p className={styles.note}>Spara dina ändringar innan du kan godkänna dem.</p>}
  </div>
  {model.connectionNotice&&<p role="alert">{model.connectionNotice}</p>}
  <div className={styles.grid}>
   {SOCIAL_LAUNCH_CHANNELS.map(channel=>{
    const choice=choices.find(c=>c.channel===channel.id),readiness=model.channels.find(c=>c.channel===channel.id)
    return <article className={styles.card} key={channel.id}>
     <h2>{channel.label}</h2>
     <fieldset disabled={busy}><label className={styles.select}><input type="checkbox" checked={!!choice} onChange={e=>change(channel.id,e.target.checked?{}:null)}/>Planera {channel.label}</label>
      {choice&&<div className={styles.fields}>
       <label>Syfte för {channel.label}<textarea aria-label={`Syfte för ${channel.label}`} value={choice.purpose} maxLength={500} onChange={e=>change(channel.id,{purpose:e.target.value})}/></label>
       <label>Format för {channel.label}<select value={choice.format} onChange={e=>change(channel.id,{format:e.target.value as SocialLaunchChoice['format']})}>{channel.formats.map(f=><option key={f} value={f}>{formats[f]}</option>)}</select></label>
       <label>Takt för {channel.label}<select value={choice.cadence} onChange={e=>change(channel.id,{cadence:e.target.value as SocialLaunchChoice['cadence']})}>{Object.entries(cadences).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      </div>}
     </fieldset>
     <p>{readiness?statuses[readiness.connection]:'Kunde inte läsa anslutningen'}</p>
     {readiness?.accountId&&<p>Konto: {readiness.accountLabel??'Namn ej verifierat'}</p>}
     {readiness?.connection==='verified'&&readiness.checkedAt&&<p className={styles.note}>Verifierat {new Date(readiness.checkedAt).toLocaleString('sv-SE')}</p>}
     <p className={styles.note}>{channel.note}</p>
     {model.connections?.find(c=>c.provider===channel.id)?<SocialConnectionControls projectId={projectId} revisionId={revision?.id??null} approved={!dirty&&!stale&&!!choice&&model.plan.decision?.decision==='approve'&&model.plan.decision.revisionId===revision?.id&&model.plan.decision.sha256===revision.sha256} card={model.connections.find(c=>c.provider===channel.id)!} intent={model.connectionIntent} onConnected={()=>void request('refresh',undefined,true)}/>:channel.connectionAdapter&&<a href={readiness?.setupHref??'/settings'}>Visa projektets anslutning</a>}
    </article>
   })}
  </div>
  {revision&&<details className={styles.evidence}><summary>Versionskvitto</summary><p>Version {revision.sequence} · {revision.id}</p><p>SHA256: {revision.sha256}</p>{model.plan.decision&&<p>Beslut: {model.plan.decision.decision==='approve'?'Godkänd':'Avvisad'} · {model.plan.decision.decidedAt}</p>}</details>}
 </section>
}
