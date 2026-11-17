'use client'
import { useState } from 'react'
import { OMNIRA_MODEL_CATALOG } from '@/lib/ai/model-control/catalog'

type AwsModel={modelId:string;modelName:string;providerName:string;outputModalities:string[];lifecycle:string}
type AwsProfile={profileId:string;profileName:string;type:string;status:string;destinations:string[]}
type Result={
  status:'blocked'|'catalog_listed';reason?:string;region?:string
  models?:AwsModel[];profiles?:AwsProfile[]
  canDispatch?:boolean;modelCallsMade?:boolean
}
const labels:Record<string,string>={
  read_only_catalog_disabled:'Katalogläsning är avstängd tills den separata läsrollen godkänts.',
  catalog_read_role_not_configured:'Den avgränsade AWS-läsrollen är ännu inte ansluten.',
  vercel_oidc_token_missing:'Vercels OIDC-token saknas i denna körning.',
  platform_operator_required:'Endast en verifierad Omnira-operatör får läsa katalogen.',
  catalog_sts_denied:'AWS tillät inte att Preview antog den nya läsrollen.',
  catalog_iam_read_permission_missing:'AWS-listbehörigheterna saknas för läsrollen.',
  catalog_api_unavailable:'AWS-katalogen kunde inte läsas fullständigt.',
  catalog_response_incomplete:'Katalogsvaret var ofullständigt och kan inte godkännas.',
}
const muted={fontSize:13,color:'#a9c4df'} as const
const panel={border:'1px solid #425d7b',borderRadius:10,padding:14,marginTop:14} as const

export default function ModelControlPreview(){
  const [busy,setBusy]=useState(false)
  const [result,setResult]=useState<Result|null>(null)
  const [search,setSearch]=useState('')
  async function inspect(){
    setBusy(true);setResult(null)
    try{
      const r=await fetch('/api/model-control/bedrock-catalog',{
        method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:'{}'
      })
      setResult((await r.json()) as Result)
    }catch{setResult({status:'blocked',reason:'catalog_api_unavailable'})}
    finally{setBusy(false)}
  }
  const f=search.trim().toLowerCase()
  const models=(result?.models??[]).filter(x=>
    (x.modelName+' '+x.modelId+' '+x.providerName).toLowerCase().includes(f))
  const profiles=(result?.profiles??[]).filter(x=>
    (x.profileName+' '+x.profileId+' '+x.destinations.join(' ')).toLowerCase().includes(f))

  return <main style={{maxWidth:920,margin:'5vh auto',padding:27,
    background:'#11213a',color:'#eaf5ff',fontFamily:'system-ui',borderRadius:16}}>
    <p style={{fontSize:12,letterSpacing:2,color:'#79d9fa'}}>OMNIRA · CENTRALT MODELLREGISTER</p>
    <h1 style={{fontSize:28}}>Dynamisk AWS-modellkatalog</h1>
    <p>Gemensam modellupptäckt för alla Omniras projekt. Här inventerar vi AWS Bedrocks
      modell-ID:n och inference profiles utan att köra en AI-modell.</p>
    <p style={{color:'#b0efa9',fontWeight:700}}>
      Endast Preview · Skrivskyddad · Inga nya API-nycklar
    </p>
    <section style={panel}>
      <h2 style={{fontSize:20,marginTop:0}}>Nuvarande modeller i Omniras register</h2>
      <p style={muted}>Detta är den lilla lokala startkatalogen – inte ett verifierat AWS-kontoutbud.</p>
      {OMNIRA_MODEL_CATALOG.map(model=><div key={model.key} style={{marginBottom:12}}>
        <strong>{model.displayName}</strong>
        <div style={muted}>{model.provider} · {model.availability}</div>
      </div>)}
    </section>
    <section style={panel}>
      <h2 style={{fontSize:20,marginTop:0}}>AWS-kontots katalog (us-east-1)</h2>
      <p style={muted}>Den här funktionen behöver en separat IAM-roll med enbart
        läsbehörighet. Roll och aktiveringsflagga saknas ännu.</p>
      <button onClick={inspect} disabled={busy} style={{
        background:'#7bdbfa',color:'#082239',padding:'12px 18px',
        borderRadius:9,fontWeight:700,border:'none',
      }}>{busy?'Kontrollerar…':'Kontrollera kataloganslutningen'}</button>
      {result&&<div role="status" aria-live="polite" style={{marginTop:20}}>
        {result.status==='blocked'?<p style={{color:'#ffcf98'}}>
          {labels[result.reason??'']??result.reason??'Läsningen stoppades.'}
          {' '}Ingen AI-modell har anropats.
        </p>:<>
          <p style={{color:'#acf1a7'}}>
            Lästa metadata för {result.region}: {result.models?.length??0} modeller och
            {' '}{result.profiles?.length??0} inference profiles.
          </p>
          <p style={muted}>Listningen bevisar inte kontoåtkomst, avtal,
            pris eller godkända destinationsregioner.</p>
          <label htmlFor="model-filter" style={{display:'block',margin:'12px 0 8px'}}>
            Sök modell, leverantör eller profil
          </label>
          <input id="model-filter" value={search} onChange={e=>setSearch(e.target.value)}
            style={{width:'100%',boxSizing:'border-box',padding:11,
              color:'#fff',background:'#192d4a',border:'1px solid #607b98',borderRadius:8}}/>
          <h3 style={{marginTop:18}}>Foundation models ({models.length})</h3>
          {models.map(m=><div key={m.modelId} style={panel}>
            <strong>{m.modelName||m.modelId}</strong>
            <p style={muted}>{m.providerName} · {m.modelId}</p>
            <p style={muted}>Output: {m.outputModalities.join(', ')} · {m.lifecycle}</p>
          </div>)}
          <h3 style={{marginTop:22}}>Inference profiles ({profiles.length})</h3>
          {profiles.map(p=><div key={p.profileId} style={panel}>
            <strong>{p.profileName||p.profileId}</strong>
            <p style={muted}>{p.profileId} · {p.type} · {p.status}</p>
            <p style={{...muted,color:'#ffd2a0'}}>
              Destinationsregioner (ej godkända): {p.destinations.join(', ')||'okända'}
            </p>
          </div>)}
        </>}
      </div>}
    </section>
    <p style={{...muted,marginTop:22}}>Katalogmedlemskap ger aldrig rätt
      att starta AI-anrop, reservera pengar eller publicera något.</p>
  </main>
}
