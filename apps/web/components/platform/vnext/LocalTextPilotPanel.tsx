'use client'
import {useEffect,useState} from 'react'
import {queueLocalTextPilot} from '@/lib/local-text/pilot-client'
import {LOCAL_TEXT_PILOT} from '@/lib/local-text/pilot-constants'
import {localTextReceiptLink,type LocalTextReceiptLink} from '@/lib/local-text/receipt'
import {LocalTextJobReceipt} from './LocalTextJobReceipt'
type Device={deviceId:string;projectId:string;status:string;version:number;fingerprint:string;enrolled?:boolean;lastHeartbeatAt?:string|null}
const field='w-full rounded border border-white/20 bg-transparent p-3'
const button='rounded border border-white/20 px-4 py-2 disabled:opacity-40'
export function LocalTextPilotPanel({projectId}:{projectId:string}){
 const [descriptor,setDescriptor]=useState(''),[device,setDevice]=useState<Device|null>(null),[fingerprint,setFingerprint]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[admitted,setAdmitted]=useState(false),[link,setLink]=useState<LocalTextReceiptLink|null>(null)
 useEffect(()=>{try{const saved=JSON.parse(sessionStorage.getItem('local-text-pilot:'+projectId)??'null');const restored=localTextReceiptLink(saved);if(restored&&restored.projectId===projectId&&Date.parse(saved.expiresAt)>Date.now())setLink(restored)}catch{}},[projectId])
 async function call(url:string,method='GET',body?:unknown){const r=await fetch(url,{method,cache:'no-store',headers:body?{'content-type':'application/json'}:undefined,...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();if(!r.ok)throw Error(value.error??'Åtgärden kunde inte genomföras.');return value}
 async function action(work:()=>Promise<void>){if(busy)return;setBusy(true);setMessage('Arbetar…');try{await work()}catch{setMessage('Åtgärden kunde inte verifieras. Kontrollera aktuell status innan du försöker igen.')}finally{setBusy(false)}}
 async function refresh(){if(!device)return;const r=await call('/api/local-text/devices/'+device.deviceId+'?projectId='+projectId);const next=r.devices.find((d:Device)=>d.deviceId===device.deviceId);if(!next)throw Error();setDevice(next);if(next.status!=='active')setAdmitted(false);setMessage('Serverstatus uppdaterad.')}
 return <div className="space-y-6">
  <section className="space-y-3"><h2 className="text-lg font-medium">1. Parkoppla stationären</h2><p>Klistra in serverns offentliga anslutningsunderlag. Underlaget får bara innehålla en offentlig nyckel.</p>
   <label className="block">Offentligt anslutningsunderlag<textarea className={field} rows={5} value={descriptor} onChange={e=>setDescriptor(e.target.value)} disabled={busy||!!device}/></label>
   <button className={button} disabled={busy||!!device||!descriptor} onClick={()=>action(async()=>{const d=JSON.parse(descriptor);if(!d||Object.keys(d).sort().join(',')!=='buildHash,deviceId,keyId,publicJwk'||!d.publicJwk||Object.keys(d.publicJwk).sort().join(',')!=='crv,kty,x,y'||d.publicJwk.kty!=='EC'||d.publicJwk.crv!=='P-256')throw Error();const existing=await call('/api/local-text/devices?projectId='+projectId);const found=existing.devices.find((v:Device)=>v.deviceId===d.deviceId);const r=found?{device:found}:await call('/api/local-text/devices','POST',{...d,projectId});setDevice(r.device);setMessage('Registrerad. Låt stationären bevisa att den äger nyckeln och uppdatera sedan status.');})}>Läs eller registrera server</button>
   {device&&<><p>Enhet: {device.deviceId}. Status: {device.status}. Nyckelbevis: {device.enrolled?'verifierat':'väntar'}.</p><p>Offentligt nyckelavtryck: <code className="break-all">{device.fingerprint}</code></p><button className={button} disabled={busy} onClick={()=>action(refresh)}>Uppdatera serverstatus</button>
   <label className="block">Nyckelavtryck från stationären<input className={field} value={fingerprint} onChange={e=>setFingerprint(e.target.value)} disabled={busy}/></label>
   <button className={button} disabled={busy||device.status!=='pending'||!device.enrolled||fingerprint!==device.fingerprint} onClick={()=>action(async()=>{const r=await call('/api/local-text/devices/'+device.deviceId,'PATCH',{projectId,action:'approve',expectedVersion:device.version,confirmFingerprint:fingerprint});setDevice(r.device);setMessage('Stationären är parkopplad.')} )}>Godkänn parkoppling</button></>}
  </section>
  <section className="space-y-3"><h2 className="text-lg font-medium">2. Tillåt bara detta prov</h2><blockquote>{LOCAL_TEXT_PILOT.task.text}</blockquote><p>Etiketter: support, annat. Endast klassificering, mänsklig granskning och högst 24 timmar. Molnkörning och betald granskning är inte aktiverade.</p>
   <button className={button} disabled={busy||device?.status!=='active'||admitted} onClick={()=>action(async()=>{if(!device)throw Error();await call('/api/local-text/devices/'+device.deviceId+'/admissions','POST',{projectId,action:'admit',evidenceHash:LOCAL_TEXT_PILOT.evidenceHash,approvedInputHashes:[LOCAL_TEXT_PILOT.inputHash],dataClass:'synthetic',expiresAt:new Date(Date.now()+24*3600000).toISOString(),jobCostCapUsd:0.25,dailyCostCapUsd:5,reviewMode:'human'});setAdmitted(true);setMessage('Det syntetiska provet är tillåtet i högst 24 timmar.')} )}>Tillåt syntetiskt prov</button>
  </section>
  <section className="space-y-3"><h2 className="text-lg font-medium">3. Kör och granska</h2><p>Starta den parkopplade stationärens worker innan provet köas. Resultatet väntar sedan i Granskningar.</p>
   <button className={button} disabled={busy||!admitted||!!link} onClick={()=>action(async()=>{const receipt=await queueLocalTextPilot(projectId,{store:sessionStorage,now:Date.now,randomUUID:()=>crypto.randomUUID(),createConversation:async()=>{const c=await call('/api/conversations','POST',{project_id:projectId,title:'Lokalt anslutningsprov'});return c.id},send:body=>call('/api/local-text/pilot','POST',body)});setLink(receipt);setMessage('Provet är köat. Inget betalt chattanrop har gjorts.')} )}>Kör anslutningsprov</button>
   {link&&<LocalTextJobReceipt link={link}/>}
   <a className="block underline" href="/approvals">Öppna Granskningar</a>
  </section>
  <p role="status">{message}</p>
  {device&&<button className={button} disabled={busy||device.status==='revoked'} onClick={()=>action(async()=>{const r=await call('/api/local-text/devices/'+device.deviceId,'PATCH',{projectId,action:'revoke',expectedVersion:device.version});setDevice(r.device);setAdmitted(false);setMessage('Enheten är återkallad. Osäkra försök måste fortfarande stämmas av.')} )}>Återkalla denna server</button>}
 </div>
}
