'use client'
import type {SocialLaunchPageModel} from '@/lib/social-launch/types'
import styles from './SocialStartGuide.module.css'
export function SocialStartGuide({model,onPlan,onContent,onProfile}:{model:SocialLaunchPageModel;onPlan:()=>void;onContent:()=>void;onProfile:()=>void}){
 const r=model.plan.currentRevision,d=model.plan.decision
 const approved=!!r&&d?.decision==='approve'&&d.revisionId===r.id&&d.sha256===r.sha256
 const selected=model.channels.filter(c=>c.selection==='planned'),verified=selected.filter(c=>c.connection==='verified').length,unknown=selected.some(c=>c.connection==='unreadable')
 return <section className={styles.guide} aria-label="Kom igång med projektets sociala medier">
  <div className={styles.top}><div><span className={styles.eyebrow}>Från idé till första inlägget</span><h2>Börja här</h2><p>{approved?'Kanalplanen är godkänd. Nästa steg är att förbereda och granska första inlägget.':r?'Granska och godkänn kanalplanen för att kunna spara första inlägget.':'Välj vilka kanaler projektet ska använda och godkänn planen. Då låses innehållsutkasten upp.'}</p></div><button type="button" onClick={approved?onContent:onPlan}>{approved?'Förbered första inlägget':r?'Granska kanalplanen':'Välj kanaler'}</button></div>
  <ol className={styles.steps}>
   <li><span className={styles.number}>1</span><div><strong>Beskriv företaget</strong><p>Ge Atlas en gemensam grund: målgrupp, ton och material. Du kan fylla på senare.</p><button type="button" onClick={onProfile}>Öppna företagsunderlaget</button></div></li>
   <li><span className={styles.number}>2</span><div><strong>Välj och godkänn kanaler</strong><p>{approved?'Planen är godkänd':r?'Förslag väntar på ditt beslut':'Ingen sparad kanalplan ännu'}</p><button type="button" onClick={onPlan}>Visa kanalplanen</button></div></li>
   <li><span className={styles.number}>3</span><div><strong>Granska första inlägget</strong><p>Text, material och önskad tid samlas här. Konton kan anslutas senare.</p><button type="button" onClick={onContent}>Visa innehåll och kalender</button></div></li>
  </ol>
  <p className={styles.connection}>{unknown?'Någon kontostatus kunde inte läsas. Kontrollera den under Kanaler och konton.':selected.length?verified+' av '+selected.length+' planerade kanaler har verifierade konton.':'Konton väljs och ansluts separat när ni är redo.'} Ett valt kanalnamn betyder att det ingår i planen.</p>
 </section>
}
