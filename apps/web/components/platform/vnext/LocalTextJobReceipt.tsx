'use client'
import {useEffect,useState} from 'react'
import type {LocalTextReceiptLink,LocalTextReceiptView} from '@/lib/local-text/receipt'
import {subscribeLocalTextReceipt} from '@/lib/local-text/receipt-poll'
/** Persisted transcript is only a locator. Each mount reads current owned state. */
export function LocalTextJobReceipt({link}:{link:LocalTextReceiptLink}){
 const [view,setView]=useState<LocalTextReceiptView|null>(null),[unavailable,setUnavailable]=useState(false)
 useEffect(()=>{
  setView(null);setUnavailable(false)
  return subscribeLocalTextReceipt(link,{onValue:v=>{setView(v);if(v)setUnavailable(false)},onUnavailable:()=>setUnavailable(true)})
 },[link.id,link.projectId,link.conversationId])
 return <div role="status" data-local-text-job={link.id}>
  <p>{unavailable?'Status kan inte hämtas just nu. Ladda om för att försöka igen.':view?.label??'Hämtar textjobbets status…'}</p>
  {view&&<p>Granskning: {view.reviewStatus==='approved'?'godkänd':view.reviewStatus==='rejected'?'underkänd':view.reviewStatus==='unknown'?'kunde inte avgöras':'väntar'}. {view.cost.totalApiCostUsd!==null?`API-kostnad inklusive granskning: $${view.cost.totalApiCostUsd.toFixed(5)}.`:'API-kostnad ännu inte verifierad.'} Driftkostnad för datorn är okänd.</p>}
  {view?.result&&<><p>Granskat förslag</p><pre>{JSON.stringify(view.result,null,2)}</pre></>}
  {view?.state==='reconciling'&&<p>Ett tidigare försök måste stämmas av innan något nytt får starta.</p>}
  {view?.state==='needs_input'&&<a href="/approvals">Öppna Granskningar</a>}
 </div>
}
