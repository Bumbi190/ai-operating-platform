import type {ProspectCapture, ProspectImprovement} from './types'

/** Suggestions use measured observations only; fewer than three means human research is still needed. */
export function suggestProspectImprovements(capture: ProspectCapture): ProspectImprovement[] {
  const result: ProspectImprovement[]=[]
  const find=(viewport: string,kind: string)=>capture.observations.find(o=>o.viewport===viewport&&o.kind===kind)
  const add=(kind: string,observation: ReturnType<typeof find>,title: string,proposal: string,verification: string,heading: string,body: string)=>{
    if(observation)result.push({id:kind,title,observationIds:[observation.id],proposal,verification,concept:{heading,body}})
  }
  const overflow=find('mobile','overflow')
  if(overflow&&Number(overflow.value)>391)add('mobile-width',overflow,'Anpassa innehållet till mobilens bredd','Ta bort horisontell överbredd genom flexibla kolumner och bilder med begränsad bredd.','Öppna sidan vid 390 px och kontrollera att dokumentbredden är högst 391 px.','En tydlig väg till nästa bil','Utforska ett lättöverskådligt koncept för både mobil och dator.')
  const controls=find('mobile','small-controls')
  if(controls&&controls.value!=='[]')add('mobile-controls',controls,'Gör mobilens viktigaste knappar lättare att träffa','Ge huvudnavigation och primära knappar minst 44 px höga tryckytor och tydliga avstånd. Detta är ett användbarhetsförslag, inte ett påstående om en formell tillgänglighetsöverträdelse.','Mät knappytorna i mobilvyn och prova att navigera utan zoom.','Hitta rätt utan omvägar','Tydliga val hjälper besökaren vidare från första skärmen.')
  const h1=find('desktop','h1')
  if(h1){let headings:unknown;try{headings=JSON.parse(h1.value)}catch{}
    if(Array.isArray(headings)&&headings.length!==1)add('heading',h1,'Skapa en tydlig huvudrubrik','Använd en synlig h1 som namnger erbjudandet och företaget, med följande innehåll ordnat under h2.','Inspektera rubrikstrukturen: en synlig h1 och en logisk följd av avsnittsrubriker.','Bilhandlaren i din närhet','Företagets identitet och nästa steg får en tydlig plats högst upp.')
  }
  const description=find('desktop','description')
  if(description&&!description.value.trim())add('description',description,'Lägg till en beskrivande metabeskrivning','Skriv en företagsspecifik beskrivning av startsidans innehåll. Den observerade sidan saknar metabeskrivning; någon effekt på ranking eller försäljning är inte verifierad.','Kontrollera att head innehåller exakt en relevant meta name="description".','Lär känna företaget','Företagsnamn och ort gör introduktionen tydlig och specifik.')
  const alt=find('desktop','image-alt')
  if(alt&&Number(alt.value)>0)add('image-text',alt,'Beskriv informativa bilder med alternativtext','Gå igenom bilderna utan alt-attribut. Beskriv informativa bilder och använd tom alternativtext för rena dekorationer.','Granska varje bilds syfte och kontrollera dess alt-attribut i DOM.','Ett tillgängligare första möte','En begriplig struktur och beskrivna bilder hjälper fler besökare.')
  const actions=find('mobile','primary-actions')
  if(actions&&actions.value==='[]')add('first-action',actions,'Gör nästa steg synligt i mobilens första vy','Placera tydliga knappar för att utforska bilar och hitta företagsinformation i introduktionen.','Öppna startsidan vid 390 × 844 px och kontrollera att huvudvalen är synliga utan scroll.','Börja med det som är viktigt','Välj bilar eller företagsinformation direkt i introduktionen.')
  return result.slice(0,3)
}
