'use client'
import {useState} from 'react'
import {
  BEDROCK_INDICATIVE_REFERENCE_PRICES, estimateBedrockReferenceCost,
} from '@/lib/ai/model-control/bedrock-price-advisory'
import {RIKSBANK_USD_SEK_REFERENCE,reviewIllustrativeBedrockFx} from '@/lib/ai/model-control/bedrock-fx-advisory'

const muted={fontSize:13,color:'#a9c4df'} as const
const inputStyle={color:'#fff',background:'#192d4a',border:'1px solid #607b98',
  borderRadius:7,padding:'8px 10px',maxWidth:170,width:'100%'} as const

export function BedrockPriceAdvisoryPanel(){
  const [inputTokens,setInputTokens]=useState('10000')
  const [outputTokens,setOutputTokens]=useState('2000')
  const input=Number(inputTokens)
  const output=Number(outputTokens)
  const money=(n:number|null)=>n===null?'Kan inte beräknas'
    : n<0.01?'$'+n.toFixed(6):'$'+n.toFixed(4)
  return <section style={{border:'1px solid #425d7b',borderRadius:10,
    padding:16,marginTop:16}}>
    <h2 style={{fontSize:20,marginTop:0}}>Fas 4 · Referenspriser och bruttokostnad</h2>
    <p style={muted}>
      Skrivskyddad jämförelse av AWS:s offentliga AmazonBedrock-prislista,
      publicerad 11 november 2026. Standardnivå, text och direktkörning
      i us-east-1. Prislistans SKU anger modellfamilj – inte exakt Runtime-version.
      Detta är inte ett kontoverifierat fakturapris, en hård budgetgräns
      eller godkännande att anropa en modell.
    </p>
    <div style={{display:'flex',gap:16,flexWrap:'wrap',margin:'14px 0'}}>
      <label htmlFor="bedrock-cost-input" style={{display:'grid',gap:5}}>
        Inmatade token (exempelscenario)
        <input id="bedrock-cost-input" aria-label="Inmatade token"
          type="number" min="0" max="1000000" step="1"
          value={inputTokens} onChange={e=>setInputTokens(e.target.value)}
          style={inputStyle}/>
      </label>
      <label htmlFor="bedrock-cost-output" style={{display:'grid',gap:5}}>
        Utmatade token (exempelscenario)
        <input id="bedrock-cost-output" aria-label="Utmatade token"
          type="number" min="0" max="1000000" step="1"
          value={outputTokens} onChange={e=>setOutputTokens(e.target.value)}
          style={inputStyle}/>
      </label>
    </div>
    <p style={{...muted,color:'#ffd2a0'}}>
      Historiskt valutareferensexempel: 1 USD = 10,07354 SEK,
      Riksbankens notering 16 november 2026.
      Kolumnen +10% är en tänkt marginal i exemplet, inte en godkänd
      valutabuffert eller budgetpolicy. Växelkursen uppdateras inte
      automatiskt här och får inte användas för verkliga köp.
      <a href={RIKSBANK_USD_SEK_REFERENCE.sourceUrl}
        target="_blank" rel="noopener noreferrer" style={{color:'#8adefa'}}>
        {' '}Källa: Sveriges riksbank
      </a>
    </p>
    <div style={{overflowX:'auto'}}>
      <table style={{borderCollapse:'collapse',minWidth:645,width:'100%',
        fontSize:13,textAlign:'left'}}>
        <thead>
          <tr style={{borderBottom:'1px solid #567b9a'}}>
            <th style={{padding:'10px 6px'}}>Modell</th>
            <th style={{padding:'10px 6px'}}>USD/1M in</th>
            <th style={{padding:'10px 6px'}}>USD/1M ut</th>
            <th style={{padding:'10px 6px'}}>Indikativt brutto USD</th>
            <th style={{padding:'10px 6px'}}>SEK (historiskt)</th>
            <th style={{padding:'10px 6px'}}>SEK (+10% exempelmarginal)</th>
            <th style={{padding:'10px 6px'}}>Priskälla</th>
          </tr>
        </thead>
        <tbody>
          {BEDROCK_INDICATIVE_REFERENCE_PRICES.map(p=>{
            const q=estimateBedrockReferenceCost({
              modelId:p.modelId,sourceRegion:'us-east-1',
              invocationPath:'in_region',tier:'standard',modality:'text_only',
              inputTokens:inputTokens.trim()?input:Number.NaN,
              outputTokens:outputTokens.trim()?output:Number.NaN,
            })
            // This FX date and margin are fixed historical examples, never a
            // source for actual billing or canonical spend authorization.
            const fx=reviewIllustrativeBedrockFx({priceQuote:q,
              fx:RIKSBANK_USD_SEK_REFERENCE,asOfDate:'2026-11-17',
              exampleBufferPercent:10,
            })
            const sek=(v:number|null)=>v===null?'–':v.toFixed(4)+' kr'
            return <tr key={p.modelId} style={{borderBottom:'1px solid #314766'}}>
              <td style={{padding:'10px 6px'}}>
                <strong>{p.modelName}</strong>
                {p.lifecycleWarning==='legacy_do_not_adopt'&&
                  <div style={{color:'#ffd2a0'}}>Legacy – ej ny standardmodell</div>}
              </td>
              <td style={{padding:'10px 6px'}}>{p.inputUsdPerMillion}</td>
              <td style={{padding:'10px 6px'}}>{p.outputUsdPerMillion}</td>
              <td style={{padding:'10px 6px'}}>{money(q.grossUsd)}</td>
              <td style={{padding:'10px 6px'}}>{sek(fx.sekReferenceRoundedUp)}</td>
              <td style={{padding:'10px 6px'}}>{sek(fx.sekWithExampleBufferRoundedUp)}</td>
              <td style={{padding:'10px 6px'}}>
                <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer"
                  style={{color:'#8adefa',textDecoration:'underline'}}>
                  AWS giltig {p.priceEffectiveFrom.slice(0,10)}
                </a>
              </td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
    <p style={{...muted,marginTop:12}}>
      Prisposterna kommer från AWS:s offentliga regionfil (SKU-kod per input
      och output). Vid avvikelse gäller AWS tjänstens prissida.
      Profiler för geografisk/global routing, caching, multimodalitet, andra
      nivåer och regioner får inte prissättas med dessa rader.
      AWS Activate-krediter är inte avdragna. Omniras kanoniska
      kostnadsgrind och STOP måste godkänna varje framtida körning.
    </p>
    <p style={{fontSize:13,color:'#ffd2a0',fontWeight:650}}>
      Ingen modell får köras: canDispatch=false · hardCeilingVerified=false
      · budgetReserved=false.
    </p>
  </section>
}
