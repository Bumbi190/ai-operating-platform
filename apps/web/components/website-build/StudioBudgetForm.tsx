'use client'
import {useRef,useState,type FormEvent} from 'react'
import type {StudioProject} from '@/lib/website-build/studio/types'
export function StudioBudgetForm({project,onSaved}:{project:StudioProject;onSaved:()=>void}){
 const [value,setValue]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const intent=useRef<{payload:string;key:string}|null>(null)
 if(project.budget.state==='configured')return <p>Projektbudget: {project.budget.monthlySek} kr/månad.</p>
 if(project.budget.state==='unknown')return <p role="alert">Projektbudgeten kunde inte läsas. Uppdatera projektet innan arbetet fortsätter.</p>
 async function save(event:FormEvent){
  event.preventDefault();if(busy)return;setBusy(true);setError('')
  try{
   if(!value.trim())throw Error('Ange en månadsbudget.')
   const monthlySek=Number(value),payload=JSON.stringify({projectId:project.id,monthlySek,expectedMonthlySek:null})
   if(!Number.isFinite(monthlySek)||monthlySek<0||monthlySek>1000000)throw Error('Ange ett belopp mellan 0 och 1 000 000 kronor.')
   if(intent.current?.payload!==payload)intent.current={payload,key:crypto.randomUUID()}
   const r=await fetch('/api/website-build/studio/budget',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...JSON.parse(payload),idempotencyKey:intent.current.key})}),body=await r.json().catch(()=>null)
   if(!r.ok)throw Error(body?.error??'Budgeten kunde inte sparas. Uppdatera projektet och försök igen.')
   onSaved()
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <div><p>Välj projektets månadsbudget innan Atlas gör betalt arbete. Din idé ligger kvar i chatten.</p><form onSubmit={save}><label>Månadsbudget i kronor <input aria-label="Månadsbudget i kronor" type="number" inputMode="decimal" min="0" max="1000000" step="0.01" value={value} onChange={e=>setValue(e.target.value)} disabled={busy} required/></label><button type="submit" disabled={busy}>{busy?'Sparar…':'Spara budget'}</button></form>{error&&<p role="alert">{error}</p>}</div>
}
