'use client'
import {useEffect,useRef,useState,type FormEvent} from 'react'
import type {HostStatus} from '@/lib/sales/host-types'
import type {MailboxContext,MailboxStatus,SealedMailboxEnvelope} from '@/lib/sales/mailbox/types'
import {sealMailboxCredentials} from '@/lib/sales/mailbox/seal'
import styles from './SalesWorkspace.module.css'
type Packet={projectId:string;setupId:string;operation:'submit_sealed';envelope:SealedMailboxEnvelope}
export function StratoConnection({projectId}:{projectId:string}){
 const passwordRef=useRef<HTMLInputElement>(null),packetRef=useRef<Packet|null>(null),[hosts,setHosts]=useState<HostStatus[]>([]),[workerId,setWorkerId]=useState(''),[email,setEmail]=useState('info@handlarborsen.se'),[status,setStatus]=useState<MailboxStatus|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 useEffect(()=>{const controller=new AbortController();void fetch(`/api/sales?projectId=${projectId}&connection=1`,{cache:'no-store',signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();const v=await r.json(),authorized=(v.connections as HostStatus[]).filter(h=>h.managed&&h.connectionState!=='revoked');if(controller.signal.aborted)return;setHosts(authorized);const requested=new URL(window.location.href).searchParams.get('stratoWorker');setWorkerId(authorized.some(h=>h.workerId===requested)?requested!:authorized.length===1?authorized[0].workerId:'')}).catch(()=>{if(!controller.signal.aborted)setMessage('Atlas behöver kontrollera specialistens anslutning.')});return()=>{controller.abort();if(passwordRef.current)passwordRef.current.value='';packetRef.current=null}},[projectId])
 async function load(signal?:AbortSignal){if(!workerId)return;const r=await fetch(`/api/sales/mailbox?projectId=${projectId}&workerId=${workerId}`,{cache:'no-store',signal});if(!r.ok)throw Error();const value=await r.json() as MailboxStatus|null;setStatus(value);if(value&&['authenticated','needs_input','reconciling'].includes(value.status))packetRef.current=null}
 useEffect(()=>{const controller=new AbortController();if(!workerId)return;void load(controller.signal).catch(()=>{if(!controller.signal.aborted)setMessage('Postfackets status kunde inte hämtas.')});const timer=setInterval(()=>{void load(controller.signal).catch(()=>{if(!controller.signal.aborted)setMessage('Postfackets status kunde inte uppdateras.')})},5000);return()=>{controller.abort();clearInterval(timer);if(passwordRef.current)passwordRef.current.value='';packetRef.current=null}},[projectId,workerId])
 async function post(value:unknown){const r=await fetch('/api/sales/mailbox',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});if(!r.ok)throw Error();return r.json()}
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!workerId||busy)return;setBusy(true);setMessage('');let password=passwordRef.current?.value??'';if(passwordRef.current)passwordRef.current.value=''
  try{
   if(!packetRef.current){
    const setup=await post({operation:'begin_setup',projectId,workerId,email}) as {context:MailboxContext;publicJwk:JsonWebKey;alreadySubmitted:boolean}
    if(setup.context.projectId!==projectId||setup.context.workerId!==workerId||setup.context.email!==email.trim().toLowerCase())throw Error()
    if(setup.alreadySubmitted){password='';setMessage('Ett inloggningsprov väntar redan på specialisten.');await load();return}
    const envelope=await sealMailboxCredentials(setup.context,setup.publicJwk,password);password='';packetRef.current={operation:'submit_sealed',projectId,setupId:setup.context.setupId,envelope}
   }
   await post(packetRef.current);packetRef.current=null;setMessage('Anslutningsprovet är lämnat till specialisten.');await load()
  }catch{setMessage('Anslutningen kunde inte slutföras. Kontrollera status innan du provar igen.')}finally{password='';setBusy(false)}
 }
 const verified=status?.status==='authenticated'
 return <section id="strato-connection" className={`${styles.panel} ph-no-capture`} data-ph-no-capture data-private="true" data-hj-suppress data-dd-privacy="hidden">
  <h2>Anslut Strato</h2><p>Provar inloggningen – inga mejl skickas</p><p>Inkorgsinläsning är inte aktiverad.</p>
  {message&&<p role="status">{message}</p>}{verified&&<p><strong>Strato-inloggningen är verifierad.</strong></p>}{status?.status==='waiting_for_host'&&<p>Väntar på specialisten för inloggningsprovet.</p>}{status?.status==='probing'&&<p>Inloggningsprovet pågår.</p>}{status?.status==='needs_input'&&<p>Kontrollera postfacksadressen och lösenordet och anslut på nytt.</p>}{status?.status==='reconciling'&&<p>Det förra provet behöver stämmas av. Ingen ny inloggning görs automatiskt.</p>}
  {hosts.length===0?<p>Atlas behöver ansluta specialisten innan du kan logga in här.</p>:<form onSubmit={e=>void submit(e)} className={styles.form} autoComplete="off">
   {hosts.length>1&&<label>Ansluten specialist<select disabled={busy||!!packetRef.current} value={workerId} onChange={e=>{setWorkerId(e.target.value);setStatus(null)}} required><option value="">Välj anslutning</option>{hosts.map(h=><option key={h.workerId} value={h.workerId}>{h.workerId}</option>)}</select></label>}
   <label>Fullständig postfacksadress<input disabled={busy||!!packetRef.current} type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="off" data-private="true"/></label>
   <label>Postfackslösenord<input disabled={busy} ref={passwordRef} type="password" name="stratoPassword" autoComplete="off" required={!packetRef.current} data-private="true" className="ph-no-capture"/></label>
   <label className={styles.check}><input type="checkbox" required/>Jag bekräftar att detta är rätt postfack.</label><p>Lösenordet krypteras till din specialist. Skriv det aldrig i chatten.</p><button type="submit" disabled={busy||!workerId||status?.status==='probing'}>{busy?'Ansluter…':'Anslut Strato'}</button>
  </form>}
 </section>
}
