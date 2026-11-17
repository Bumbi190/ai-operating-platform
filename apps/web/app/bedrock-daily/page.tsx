'use client'

import { useState } from 'react'

type Candidate = {
  slot:'social_expansion'|'independent_news'
  title:string
  sourceUrl:string
  sourceName:string|null
  socialReceiptVerified:boolean
  suggestedTier:'deep'|'standard'
  needs:string[]
  canWrite:false
  canPublish:false
}
type Role = {role:string;purpose:string;state:string;canInvokeModel:false;canPublish:false}
type Plan = {
  ok:boolean;reason?:string;projectName?:string;generatedAt?:string
  counts?:{usableNews:number;socialWithReceipt:number;candidatesChosen:number}
  candidates?:Candidate[];roles?:Role[]
  publicationDecision?:'NO_GO';modelInvoked?:boolean;spent?:boolean;published?:boolean
}

const roleNames:Record<string,string>={
  news_scout:'Nyhetsbevakare',
  corroboration_researcher:'Källgranskare',
  longform_writer:'Långartikelskribent',
  independent_fact_checker:'Faktakontroll',
  publication_controller:'Publiceringsansvarig',
}
const textMuted={color:'#a9c4de',fontSize:13} as const
const statusLabel=(c:Candidate)=>
  c.slot==='social_expansion'?'Fördjupning av publicerad social nyhet':'Ny fristående AI-nyhet'

export default function DailyEditorialPreview(){
  const [busy,setBusy]=useState(false)
  const [result,setResult]=useState<Plan|null>(null)
  async function inspect(){
    setBusy(true);setResult(null)
    try{
      const response=await fetch('/api/article/daily/preview',{
        method:'POST',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:'{}',
      })
      setResult((await response.json()) as Plan)
    }catch{setResult({ok:false,reason:'network_unavailable'})}
    finally{setBusy(false)}
  }

  return(
    <main style={{maxWidth:850,margin:'6vh auto',padding:28,
      fontFamily:'system-ui, sans-serif',color:'#eaf5ff',
      background:'#101f38',borderRadius:16}}>
      <p style={{color:'#74d3f3',fontSize:12,letterSpacing:2}}>
        THE PROMPT · AWS REDAKTIONSPILOT
      </p>
      <h1 style={{fontSize:27,marginBottom:10}}>Daglig redaktionsplan</h1>
      <p>Förhandsgranska vilka nyheter The Prompt skulle välja till
        theprompt.nu, utan att skapa artiklar eller göra betalda AI-anrop.</p>
      <p style={{color:'#a9e9aa',fontWeight:700}}>
        Den här sidan är helt skrivskyddad. Inget publiceras.
      </p>
      <button type="button" onClick={inspect} disabled={busy}
        style={{background:'#75d7f3',color:'#0c2139',padding:'13px 19px',
          borderRadius:9,border:'none',fontWeight:700,
          cursor:busy?'wait':'pointer'}}>
        {busy?'Läser The Prompt…':'Visa dagens redaktionsplan'}
      </button>

      {result&&<section aria-live="polite" role="status" style={{marginTop:24}}>
        {!result.ok?(
          <p style={{color:'#ffb9ad'}}>
            Planen kunde inte visas: {result.reason==='operator_or_project_denied'
              ?'Du måste vara inloggad som Omniras operatör och äga The Prompt.'
              :result.reason??'okänt fel'}
          </p>
        ):(
          <>
            <p style={textMuted}>Projekt: <strong>{result.projectName}</strong>.
              Förberett: {result.generatedAt
                ?new Date(result.generatedAt).toLocaleString('sv-SE')
                :'okänd tidpunkt'}.</p>
            <p>Urvalet innehåller <strong>{result.counts?.candidatesChosen??0}</strong>
              {' '}av maximalt 2 kandidater. Automatisk publicering: <strong>AVSTÄNGD</strong>.</p>
            {(result.candidates??[]).length===0&&(
              <p>Inga tillräckligt aktuella och säkert identifierade kandidater.
                Systemet hittar inte på någon artikel för att fylla kvoten.</p>
            )}
            {(result.candidates??[]).map((c,i)=>(
              <section key={c.sourceUrl} style={{border:'1px solid #355677',
                borderRadius:12,padding:18,marginTop:15}}>
                <p style={{color:'#85dff7',fontSize:12,letterSpacing:1}}>
                  ARTIKEL {i+1} · {statusLabel(c)}
                </p>
                <h2 style={{fontSize:19,margin:'8px 0'}}>{c.title}</h2>
                <p style={textMuted}>Föreslagen längd: {c.suggestedTier==='deep'
                  ?'Fördjupning (900–1300 ord)':'Nyhetsanalys (450–750 ord)'}</p>
                <p><a style={{color:'#8adffd'}} href={c.sourceUrl}
                  target="_blank" rel="noopener noreferrer">
                  Öppna ursprungskällan{c.sourceName?' – '+c.sourceName:''}
                </a></p>
                <p style={{color:'#ffd8a2',fontSize:13}}>
                  Väntar på källäsning, oberoende bekräftelse, faktakontroll,
                  budget/STOP och redaktionellt godkännande.</p>
                <p style={textMuted}>
                  Socialt publiceringskvitto: {c.socialReceiptVerified?'Ja':'Inte relevant för den här nyheten'}.
                  Oberoende faktaverifiering: Nej.
                </p>
              </section>
            ))}
            <section style={{marginTop:24,borderTop:'1px solid #355677',paddingTop:20}}>
              <h2 style={{fontSize:20}}>Agenternas arbetsordning</h2>
              {(result.roles??[]).map((r,i)=>(
                <p key={r.role} style={{marginBottom:10}}>
                  <strong>{i+1}. {roleNames[r.role]??r.role}</strong>
                  <span style={{color:'#abbfd4'}}> – väntar på säker release</span>
                </p>
              ))}
            </section>
            <p style={{fontWeight:700,color:'#ffce9a'}}>
              Publiceringsbeslut: NO-GO. Inga Bedrock-körningar,
              budgetreservationer eller webbplatsändringar har gjorts.
            </p>
          </>
        )}
      </section>}
      <p style={{...textMuted,marginTop:25}}>
        Testgrenen är isolerad från produktion. Manuell faktagranskning och
        produktionsbehörigheter krävs innan daglig live-publicering.
      </p>
    </main>
  )
}
