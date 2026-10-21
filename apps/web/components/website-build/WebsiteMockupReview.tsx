'use client'
import {useEffect,useMemo,useRef,useState} from 'react'
import type {PlanView} from '@/lib/website-build/planning/types'
import type {WebsiteArtifact} from '@/lib/website-build/types'
import {renderPreviewDocument} from '@/lib/website-build/preview-runtime'
import styles from './WebsiteMockupReview.module.css'
export function WebsiteMockupReview({plan,onPlan,disabled=false,embedded=false,onClose}:{plan:PlanView;onPlan:(plan:PlanView)=>boolean;disabled?:boolean;embedded?:boolean;onClose?:()=>void}){
 const review=plan.designReview,options=review?.options??[]
 const [selectedId,setSelectedId]=useState<string|undefined>(review?.approved?.mockupId??options[0]?.id),[artifact,setArtifact]=useState<WebsiteArtifact|null>(null),[loading,setLoading]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState<string|null>(null)
 const intent=useRef<{mockupId:string;key:string}|null>(null)
 const selected=options.find(option=>option.id===selectedId)??options[0]
 useEffect(()=>{setSelectedId(plan.designReview?.approved?.mockupId??plan.designReview?.options[0]?.id);setError(null);intent.current=null},[plan.currentRevision.revisionId])
 useEffect(()=>{
  if(!selected)return
  const abort=new AbortController();let current=true
  setArtifact(null);setError(null);setLoading(true);intent.current=null
  const query=new URLSearchParams({projectId:plan.ref.projectId,revisionId:plan.currentRevision.revisionId,sha256:plan.currentRevision.sha256,mockupSha256:selected.sha256})
  void fetch('/api/website-build-plans/'+plan.ref.planId+'/mockups/'+selected.id+'?'+query,{cache:'no-store',signal:abort.signal}).then(async response=>{if(!response.ok)throw Error();const value=await response.json();if(value.format!=='static-website.v1'||!value.pages?.some((page:{key:string})=>page.key==='index'))throw Error();if(current)setArtifact(value)}).catch(()=>{if(current)setError('Designförslaget kunde inte läsas. Växla förslag eller ladda om för att försöka igen.')}).finally(()=>{if(current)setLoading(false)})
  return()=>{current=false;abort.abort()}
 },[plan.ref.projectId,plan.ref.planId,plan.currentRevision.revisionId,plan.currentRevision.sha256,selected?.id,selected?.sha256])
 const token=useMemo(()=>crypto.randomUUID(),[artifact?.sha256])
 const document=useMemo(()=>artifact?renderPreviewDocument(artifact,'index',token):'', [artifact,token])
 const approved=!!selected&&review?.approved?.mockupId===selected.id&&review.approved.sha256===selected.sha256
 const approve=async()=>{
  if(!selected||pending||disabled||!artifact)return
  if(intent.current?.mockupId!==selected.id)intent.current={mockupId:selected.id,key:crypto.randomUUID()}
  setPending(true);setError(null)
  try{
   const response=await fetch('/api/website-build-plans/'+plan.ref.planId+'/mockups/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:plan.ref.projectId,revisionId:plan.currentRevision.revisionId,sha256:plan.currentRevision.sha256,mockupId:selected.id,mockupSha256:selected.sha256,idempotencyKey:intent.current.key})})
   const value=await response.json()
   if(!response.ok)throw Error(['PLAN_STALE','MOCKUP_STALE'].includes(value.code)?'Planen eller designförslaget har ändrats. Ladda om och granska den aktuella versionen.':value.code==='MOCKUP_LOCKED'?'Designen används redan av den godkända planen. Ändra planen i chatten för en ny riktning.':'Godkännandet kunde inte bekräftas. Försök igen.')
   if(!onPlan(value))throw Error('Planen har ändrats. Ladda om och granska den aktuella versionen.')
  }catch(error){setError(error instanceof Error?error.message:'Godkännandet kunde inte bekräftas. Försök igen.')}finally{setPending(false)}
 }
 return <section className={styles.review} data-embedded={embedded} aria-label="Designförslag">
  <header className={styles.heading}><div><h2>Designförslag</h2><span>Planversion {plan.currentRevision.number}</span></div><button type="button" onClick={()=>void approve()} disabled={disabled||pending||approved||!!plan.approvedDecision||!artifact}>{pending?'Inväntar kvitto…':approved?'Mockup godkänd':'Godkänn mockup'}</button></header>
  <div className={styles.choices} aria-label="Välj designförslag">{options.map(option=><button type="button" key={option.id} aria-pressed={option.id===selected?.id} onClick={()=>setSelectedId(option.id)} disabled={pending}>{option.title}</button>)}</div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.canvas}>{artifact?<iframe title={'Designförslag: '+selected?.title} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={document}/>:<p role="status">{loading?'Läser designförslaget…':'Designförslagen förbereds. Ladda om om de inte visas.'}</p>}</div>
  <footer className={styles.footer}><div>{approved?<strong>Godkänd design: {selected?.title}</strong>:<span>Välj en layout för den sparade briefen.</span>}<small>Visuellt förslag · startsidans layout. Alla {plan.currentRevision.content.pages.length} planerade sidor ingår i bygget.</small></div>{onClose&&<button type="button" onClick={onClose}>Visa befintlig preview</button>}</footer>
 </section>
}
