'use client'

import { useState } from 'react'
import { modelChoicesForRole, recommendedModelForRole, previewEditorialModelChoice, type EditorialTask } from '@/lib/article/daily/model-choice'

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
const EDITORIAL_ROLES: readonly EditorialTask[] = [
  'news_scout','corroboration_researcher','longform_writer',
  'independent_fact_checker','publication_controller',
]
const accessText = {
  preview_smoke_only: 'Endast testad i AWS Preview',
  existing_omnira_provider: 'Finns i Omniras befintliga leverantörskod',
  unverified: 'AWS-åtkomst och pris ännu inte verifierade',
} as const
const statusLabel=(c:Candidate)=>
  c.slot==='social_expansion'?'Fördjupning av publicerad social nyhet':'Ny fristående AI-nyhet'

export default function DailyEditorialPreview(){
  const [busy,setBusy]=useState(false)
  const [result,setResult]=useState<Plan|null>(null)
  const [modelChoices,setModelChoices]=useState<Record<EditorialTask,string|null>>({
    news_scout: recommendedModelForRole('news_scout'),
    corroboration_researcher: recommendedModelForRole('corroboration_researcher'),
    longform_writer: recommendedModelForRole('longform_writer'),
    independent_fact_checker: recommendedModelForRole('independent_fact_checker'),
    publication_controller: null,
  })
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
              <h2 style={{fontSize:20}}>Modellval per agent – förhandsplanering</h2>
              <p style={textMuted}>
                Välj kandidatmodell för varje redaktionell uppgift. Modellerna jämförs
                efter uppgift och preliminär kvalitetsnivå. Detta ändrar INTE
                vilka modeller Omnira kör och sparas inte i en produktionskonfiguration.
              </p>
              {EDITORIAL_ROLES.map((role,i)=>{
                const picked=previewEditorialModelChoice({
                  role,key:modelChoices[role],writerKey:modelChoices.longform_writer,
                })
                const labelId='editorial-role-'+role
                return (
                  <div key={role} style={{
                    border:'1px solid #355677',borderRadius:10,padding:14,marginTop:12,
                  }}>
                    <label htmlFor={role==='publication_controller'?undefined:labelId}
                      style={{fontWeight:700,display:'block',marginBottom:8}}>
                      {i+1}. {roleNames[role]}
                    </label>
                    {role==='publication_controller'?(
                      <p style={{...textMuted,margin:0}}>
                        Ingen modell väljs här. Publicering kräver separat
                        behörighet, STOP, budget och redaktionellt godkännande.
                      </p>
                    ):(
                      <>
                        <select id={labelId} aria-label={'Modell för '+roleNames[role]}
                          value={modelChoices[role]??''}
                          onChange={e=>setModelChoices(previous=>({
                            ...previous,[role]:e.target.value,
                          }))}
                          style={{width:'100%',padding:10,borderRadius:8,
                            background:'#182c49',color:'#eaf5ff',border:'1px solid #4a7691'}}>
                          {modelChoicesForRole(role).map(model=>(
                            <option key={model.key} value={model.key}>
                              {model.displayName} – {accessText[model.availability]}
                            </option>
                          ))}
                        </select>
                        <p style={{
                          color:picked.advisoryStatus==='blocked'?'#ffc6a8':'#b2cae2',
                          fontSize:13,marginTop:9,marginBottom:0,
                        }}>
                          {picked.advisoryStatus==='blocked'
                            ? 'Valet är blockerat: '+picked.reason
                            : 'Enbart kandidat: '+(picked.selectedModel
                              ?accessText[picked.selectedModel.availability]:'ej verifierad')}
                          {role==='independent_fact_checker'&&picked.independentFromWriter===true
                            ?' · Oberoende modellfamilj från skribenten':' '}
                        </p>
                      </>
                    )}
                  </div>
                )
              })}
              <p style={{...textMuted,marginTop:15}}>
                Du kan se fler tillgängliga modellfamiljer i
                {' '}<a href="https://docs.aws.amazon.com/bedrock/latest/userguide/model-cards.html"
                  target="_blank" rel="noopener noreferrer"
                  style={{color:'#84dcf7'}}>AWS Bedrocks modellkatalog</a>.
                Region, faktisk kontobehörighet, modellpris och kvalitet måste
                kontrolleras separat innan en ny modell får användas.
              </p>
              <p style={{color:'#ffce9a',fontSize:13,fontWeight:700}}>
                Inget modellval här ger rätt att anropa AWS, köpa en prenumeration,
                byta produktionsmodell eller publicera en artikel.
              </p>
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
