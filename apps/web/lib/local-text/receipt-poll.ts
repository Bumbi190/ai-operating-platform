import {localTextReceiptLink,localTextReceiptActive,type LocalTextReceiptLink,type LocalTextReceiptView} from './receipt'
/** Browser-only polling; history never supplies result authority. No overlapping
 * requests, bounded lifetime, no refresh after an ownership denial/unmount. */
export function subscribeLocalTextReceipt(link:LocalTextReceiptLink,options:{fetch?:typeof fetch;onValue:(v:LocalTextReceiptView|null)=>void;onUnavailable:()=>void}):()=>void{
 const fetcher=options.fetch??fetch,controller=new AbortController()
 let closed=false,timer:ReturnType<typeof setTimeout>|undefined,expiry:ReturnType<typeof setTimeout>|undefined,deadline=Date.now()+15*60000
 const clear=()=>{if(timer)clearTimeout(timer);if(expiry)clearTimeout(expiry)}
 const expired=()=>{clear();if(!closed){options.onValue(last?{...last,result:null,label:'Textens lagringstid har löpt ut',reasonCode:'PAYLOAD_EXPIRED'}:null)}}
 let last:LocalTextReceiptView|null=null
 async function poll(){
  if(closed)return
  if(Date.now()>=deadline){expired();return}
  let retry=true
  try{
   const response=await fetcher(`/api/local-text/jobs/${link.id}?projectId=${link.projectId}&conversationId=${link.conversationId}`,{cache:'no-store',credentials:'same-origin',signal:controller.signal})
   if(!response.ok){if(response.status<500)retry=false;throw Error('unavailable')}
   const next:LocalTextReceiptView=await response.json(),bound=localTextReceiptLink(next)
   retry=false
   if(!bound||bound.id!==link.id||bound.projectId!==link.projectId||bound.conversationId!==link.conversationId||!Number.isFinite(Date.parse(next.expiresAt))||!['queued','claimed','running','reviewing','escalation_pending','needs_input','succeeded','failed','cancelled','reconciling'].includes(next.state)||!['pending','approved','rejected','unknown'].includes(next.reviewStatus)||typeof next.label!=='string'||next.label.length>120)throw Error('scope')
   if(closed)return
   deadline=Math.min(deadline,Date.parse(next.expiresAt))
   last={...next,result:next.state==='succeeded'&&next.reviewStatus==='approved'&&Date.now()<deadline&&next.reasonCode!=='PAYLOAD_EXPIRED'?next.result:null}
   options.onValue(last)
   if(expiry)clearTimeout(expiry)
   if(deadline>Date.now())expiry=setTimeout(expired,deadline-Date.now())
   if(localTextReceiptActive(last))timer=setTimeout(poll,3000)
  }catch{
   if(closed)return
   options.onValue(null);options.onUnavailable()
   if(retry&&Date.now()+3000<deadline)timer=setTimeout(poll,3000)
  }
 }
 void poll()
 return()=>{closed=true;controller.abort();clear()}
}
