'use client'
import {useEffect,useRef,useState} from 'react'
import type {InboxMessage} from '@/lib/sales/inbox/types'
import type {SalesContact,SalesOfferRevision} from '@/lib/sales/types'
import styles from './SalesWorkspace.module.css'
export function SalesReplyRequest({projectId,message,contacts,offers,mailboxEmail}:{projectId:string;message:InboxMessage;contacts:SalesContact[];offers:SalesOfferRevision[];mailboxEmail:string}){
 const [offerId,setOfferId]=useState(''),[consent,setConsent]=useState(false),[status,setStatus]=useState('');const requestKey=useRef<string|null>(null)
 const contact=contacts.find(c=>c.id===message.contactId),offer=offers.find(o=>o.id===offerId)
 const eligible=message.contactState==='linked'&&contact?.confirmed&&!contact.excluded&&!contact.suppressed&&['contacted','not_contacted'].includes(contact.history)&&contact.email.toLowerCase()===message.header?.from.toLowerCase()
 const choices=offers.filter(o=>o.confirmed&&o.senderEmail.toLowerCase()===mailboxEmail.toLowerCase()&&o.freeMonths===contact?.pilotMonths)
 useEffect(()=>{setConsent(false);setStatus('');requestKey.current=null},[projectId,message.id,message.version,contact?.version,offerId])
 if(!message.textSelected||message.textState!=='complete'||message.text===null)return <p>Välj och läs hela mejltexten innan ett svarsförslag kan förberedas.</p>
 if(!eligible)return <p>Koppla en bekräftad kontakt och rätt filial, med känd historik och utan spärr, innan ett svarsförslag kan förberedas.</p>
 async function copy(){
  if(!consent||!contact||!offer||!choices.some(o=>o.id===offer.id))return
  requestKey.current??=crypto.randomUUID()
  const input={projectId,messageId:message.id,messageVersion:message.version,contactId:contact.id,contactVersion:contact.version,offerRevisionId:offer.id,idempotencyKey:requestKey.current}
  try{await navigator.clipboard.writeText('Förbered ett svenskt svarsförslag för granskning, inget utskick. Använd prepare_sales_reply med detta uttryckligen valda sparade underlag: '+JSON.stringify(input));setStatus('Svarsuppdraget är kopierat. Klistra in det i projektets samtal med Atlas.')}catch{setStatus('Uppdraget kunde inte kopieras. Försök igen.')}
 }
 return <section className={styles.form} aria-label="Valt svarsunderlag"><h4>Lämna valt underlag till Claude</h4><p>{contact!.companyName} · {contact!.branchName||'Huvudkontor'} · {contact!.email}</p><p>Endast detta valda mejl, kontaktuppgifterna och erbjudandet används. Ett svarsförslag visas för din granskning. Inga mejl skickas.</p><label>Erbjudande för svaret<select value={offerId} onChange={e=>setOfferId(e.target.value)}><option value="">Välj bekräftad erbjudandeversion</option>{choices.map(o=><option key={o.id} value={o.id}>{o.freeMonths} månader · {o.offerText}</option>)}</select></label>{!choices.length&&<p>Spara ett bekräftat erbjudande med rätt pilotnivå och postfackets avsändare först.</p>}{offer&&choices.some(o=>o.id===offer.id)&&<p>{offer.offerText}<br/>Från {offer.senderEmail} till {contact!.email}</p>}<p>Arbetet använder ditt anslutna Claude-abonnemang. Exakt kostnad kan inte fastställas här; högst tio modellförsök tillåts per uppdrag.</p><label className={styles.check}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Jag vill förbereda ett svar med detta valda underlag.</label><button disabled={!consent||!choices.some(o=>o.id===offerId)} onClick={()=>void copy()}>Kopiera svarsuppdrag till Atlas</button>{status&&<p role="status">{status}</p>}</section>
}
