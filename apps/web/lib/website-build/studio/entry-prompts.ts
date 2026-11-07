import {DEALER_SHOWROOM_STARTER} from '../planning/dealer-showroom'

/** Studio suggestions only prefill the draft. The operator decides when to send it. */
export const STUDIO_ENTRY_PROMPTS = [
  {label:'Beskriv din hemsida', prompt:'Beskriv din hemsida'},
  {label:'Förbättra en befintlig sida', prompt:'Förbättra en befintlig sida'},
  {label:'Använd en referens', prompt:'Använd en referens'},
  {label:'Bilhandlarmall', prompt:`Planera en fiktiv bilhall med mallen ${DEALER_SHOWROOM_STARTER}. Fråga efter handlarens namn, färger och visningsbilar.`},
]
