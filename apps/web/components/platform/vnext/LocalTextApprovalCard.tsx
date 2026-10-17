'use client'
import {useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import type {readLocalTextReview,readLocalTextIncident} from '@/lib/local-text/incidents'
type Review=NonNullable<Awaited<ReturnType<typeof readLocalTextReview>>>
type Incident=NonNullable<Awaited<ReturnType<typeof readLocalTextIncident>>>
/** No automatic content evaluator: opening a local review never spends money.
 * Raw source/result lives only in this expiring owner-bound response/state. */
export function LocalTextApprovalCard({approvalId,kind,status}:{approvalId:string;kind:string;status:string}){
 const [review,setReview]=useState<Review|null>(null),[incident,setIncident]=useState<Incident|null>(null),[notice,setNotice]=useState('Hämtar granskningen…'),[saving,setSaving]=useState(false)
 const router=useRouter()
 useEffect(()=>{
  const controller=new AbortController();let active=true,timer:ReturnType<typeof setTimeout>|undefined,pollTimer:ReturnType<typeof setTimeout>|undefined
  setReview(null);setIncident(null);setNotice('Hämtar granskningen…')
  async function load(){
   try{
    const response=await fetch(`/api/approvals/${approvalId}`,{cache:'no-store',credentials:'same-origin',signal:controller.signal})
    if(!response.ok)throw Error('unavailable')
    const body=await response.json();if(!active)return
    if(kind==='local_text_review'){
     const payload:Review|null=body.localTextReview
     if(!payload||payload.approvalId!==approvalId||!Number.isSafeInteger(payload.version)||payload.version<1||!Number.isFinite(Date.parse(payload.expiresAt))||Date.parse(payload.expiresAt)<=Date.now())throw Error('expired')
     setReview(payload);setNotice('Jämför källtexten med förslaget. Ditt beslut gäller bara textförslaget.')
     if(timer)clearTimeout(timer)
     pollTimer=setTimeout(()=>void load(),3000)
     timer=setTimeout(()=>{if(active){setReview(null);setNotice('Textens lagringstid har löpt ut. Ett nytt jobb kräver en ny begäran.')}},Math.max(0,Date.parse(payload.expiresAt)-Date.now()))
    }else{
     const payload:Incident|null=body.localTextIncident
     if(!payload||payload.approvalId!==approvalId)throw Error('unavailable')
     setIncident(payload);setNotice(payload.kind==='quality'?'Den lokala modellen är pausad efter återkommande kvalitetsfel. Ny kvalificering krävs.':payload.kind==='reconcile'?'Ett tidigare försök har osäkert utfall och måste stämmas av innan något nytt får starta.':'Textjobbet behöver åtgärdas. Inget nytt modellförsök är godkänt.')
    }
   }catch{if(active){setReview(null);setIncident(null);setNotice('Granskningen är inte tillgänglig eller texten har löpt ut. Ladda om för att kontrollera läget.')}}
  }
  void load()
  return()=>{active=false;controller.abort();if(timer)clearTimeout(timer);if(pollTimer)clearTimeout(pollTimer)}
 },[approvalId,kind])
 async function decide(action:'approved'|'rejected'){
  const payload=review??incident;if(!payload||saving)return
  if(review&&Date.parse(review.expiresAt)<=Date.now()){setReview(null);setNotice('Textens lagringstid har löpt ut.');return}
  setSaving(true)
  try{
   const response=await fetch(`/api/approvals/${approvalId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action,expectedVersion:payload.version})})
   if(!response.ok)throw Error('refused')
   setReview(null);setIncident(null);setNotice(kind==='local_text_review'?(action==='approved'?'Förslaget är godkänt och kan visas i Atlas.':'Förslaget är avvisat. Inget nytt betalt försök startas.'):'Markerat som läst. Inga jobb eller modeller har återstartats.');router.refresh()
  }catch{setReview(null);setIncident(null);setNotice('Beslutet kunde inte bekräftas. Ladda om och kontrollera aktuell status innan du försöker igen.')}finally{setSaving(false)}
 }
 return <section aria-label="Lokal AI-granskning">
  <h3>{kind==='local_text_review'?'Granska lokalt textförslag':'Lokal AI behöver åtgärd'}</h3><p role="status">{notice}</p>
  {review&&<><h4>Källtext</h4><pre style={{whiteSpace:'pre-wrap'}}>{review.task.text}</pre><h4>Förslag</h4><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(review.result,null,2)}</pre><p>Godkänn bara om innehållet stöds av källtexten. Beslutet ger ingen rätt till utskick, publicering eller betalning.</p><button disabled={saving} onClick={()=>void decide('approved')}>Godkänn textförslaget</button> <button disabled={saving} onClick={()=>void decide('rejected')}>Avvisa förslaget</button></>}
  {incident&&!incident.acknowledged&&['pending','needs_input','revised'].includes(status)&&<button disabled={saving} onClick={()=>void decide('approved')}>Markera som läst</button>}
 </section>
}
