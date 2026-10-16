'use client'
import {useEffect,useRef,useState} from 'react'
import type {ConnectionView,SocialConnectionCard} from '@/lib/social-connections/types'
import styles from './SocialLaunchPanel.module.css'

const names={linkedin:'LinkedIn',pinterest:'Pinterest',x:'X'}
export function SocialConnectionControls({projectId,revisionId,approved,card,intent,onConnected}:{projectId:string;revisionId:string|null;approved:boolean;card:SocialConnectionCard;intent?:ConnectionView|null;onConnected:()=>void}){
 const [view,setView]=useState(intent?.projectId===projectId&&intent.provider===card.provider?intent:null)
 const [selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const controller=useRef<AbortController|null>(null),live=useRef(true)
 useEffect(()=>{live.current=true;return()=>{live.current=false;controller.current?.abort()}},[])
 const name=names[card.provider],ready=approved&&!!revisionId&&card.canOperate&&card.account.readable&&card.setup.reason==='ready'
 const chosen=view?.candidates.find(c=>c.key===view.selectedKey)
 const label=chosen?chosen.accountLabel+(chosen.destinationLabel?' · '+chosen.destinationLabel:''):null
 async function request(commit:boolean){
  setBusy(true);setError('');const abort=new AbortController();controller.current=abort
  try{
   const response=await fetch(commit?'/api/social-connections':'/api/social-connections/'+card.provider+'/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(commit?{projectId,intentId:view!.intentId,candidateKey:selected}:{projectId,planRevisionId:revisionId,expectedBindingId:card.bindingId}),cache:'no-store',signal:abort.signal})
   const result=await response.json();if(!live.current)return
   if(!response.ok)throw Error(response.status===409?'Planen eller kontot har ändrats. Läs senaste versionen och anslut igen.':commit?'Kontovalet kunde inte sparas. Ditt val finns kvar.':'Anslutningen kunde inte startas. Kontrollera appinställningarna.')
   if(commit){
    if(result?.projectId!==projectId||result?.provider!==card.provider||result?.intentId!==view!.intentId||result?.status!=='connected'||result?.selectedKey!==selected)throw Error('Anslutningen kunde inte bekräftas. Läs senaste versionen.')
    setView(result);onConnected()
   }else{
    const url=new URL(result.authorizationUrl),expected=card.provider==='linkedin'?'https://www.linkedin.com':'https://www.pinterest.com'
    if(url.origin!==expected)throw Error('Inloggningslänken kunde inte verifieras.')
    window.location.assign(url.toString())
   }
  }catch(e){if(live.current&&!abort.signal.aborted)setError(e instanceof Error?e.message:'Anslutningen kunde inte sparas.')}
  finally{if(live.current)setBusy(false)}
 }
 return <div className={styles.connection} aria-label={'Anslutning för '+name} aria-busy={busy}>
  {view?.status==='connected'&&label?<p role="status">Anslutet: {label}</p>:view?.status==='awaiting_selection'?<>
   <fieldset disabled={busy||!ready}><legend>Välj {card.provider==='pinterest'?'konto och anslagstavla':'företagssida'} för projektet</legend>
    {view.candidates.map(candidate=><label className={styles.destination} key={candidate.key}><input type="radio" name={'destination-'+card.provider} checked={selected===candidate.key} onChange={()=>setSelected(candidate.key)}/>{candidate.accountLabel}{candidate.destinationLabel?' · '+candidate.destinationLabel:''}</label>)}
   </fieldset>
   <button disabled={busy||!ready||!selected} onClick={()=>void request(true)}>Anslut valt konto</button>
  </>:card.setup.reason==='ready'?<button disabled={busy||!ready} onClick={()=>void request(false)}>{card.bindingId?'Anslut på nytt till':'Anslut'} {name}</button>:null}
  {card.destinationLabel&&<p>Anslagstavla: {card.destinationLabel}</p>}
  {card.setup.reason==='cost_policy_required'?<p>X kräver en godkänd kostnadspolicy innan API-anrop kan aktiveras.</p>:<>
   {card.setup.reason==='app_configuration_missing'&&<p>Appkonfiguration saknas.</p>}
   {!approved&&<p>Godkänn den sparade kanalplanen med {name} innan du ansluter.</p>}
   {!card.canOperate&&<p>En behörig operatör behöver slutföra anslutningen.</p>}
   {!card.account.readable&&<p>Kontots status kunde inte läsas. Läs senaste versionen.</p>}
   <details><summary>Appinställningar för {name}</summary><p>Registrera appen och ge den nödvändiga behörigheter hos plattformen. Eventuell produktionsåtkomst behöver godkännas där.</p><p>Lägg serverinställningarna i deploymentens hemliga miljövariabler:</p><p><code>{card.provider.toUpperCase()}_CLIENT_ID och {card.provider.toUpperCase()}_CLIENT_SECRET</code></p><p>Registrerad callback:</p><p><code>{card.setup.callbackUrl}</code></p><a href={card.setup.consoleUrl} target="_blank" rel="noopener noreferrer">Öppna {name}s appinställningar</a><p>Klistra aldrig in hemligheter i Atlas-chatten.</p></details>
  </>}
  {error&&<p role="alert">{error}</p>}
  <p className={styles.note}>Anslutningen ger ingen publiceringsrätt.</p>
 </div>
}
