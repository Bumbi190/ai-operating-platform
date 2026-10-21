import type {SocialContentInput} from './types'
import type {SocialLaunchChoice} from '../types'

/**
 * Editorial starter drafts grounded in Familje-Stunden's locally reviewed
 * November forest/Pling artwork. NOT approved content or public media.
 * Deliberately pinned to the exact owner-approved manual channel plan seen
 * on 2026-10-20; changes require a new review instead of silent fallback.
 */
export const FAMILY_NOVEMBER_PROJECT='77cda551-57c9-4dc0-b019-1bb6438777f7'
export const FAMILY_NOVEMBER_PLAN_REVISION='e745041f-ad3a-493f-bd3b-025525d561b2'

export type FamilyNovemberSuggestion={
  id:'facebook'|'instagram'
  label:string
  draft:SocialContentInput
}

export function familyNovemberSuggestions(input:{
  projectId:string
  projectSlug:string
  projectName:string
  planApproved:boolean
  planRevisionId:string|null
  plannedChannels:readonly SocialLaunchChoice[]
}):FamilyNovemberSuggestion[]{
  if(input.projectId!==FAMILY_NOVEMBER_PROJECT||
    input.projectSlug!=='familje-stunden'||
    input.projectName!=='Familje-Stunden'||
    !input.planApproved||
    input.planRevisionId!==FAMILY_NOVEMBER_PLAN_REVISION||
    input.plannedChannels.length!==2)return []

  const selected=new Map(input.plannedChannels.map(c=>[c.channel,c]))
  if(selected.size!==2||
    selected.get('facebook')?.format!=='text'||
    selected.get('facebook')?.cadence!=='manual'||
    selected.get('instagram')?.format!=='image'||
    selected.get('instagram')?.cadence!=='manual'||
    input.plannedChannels.some(c=>!['facebook','instagram'].includes(c.channel)||
      !c.purpose?.trim()))return []

  return [
    {id:'facebook',label:'Hämta novembertext för Facebook',
      draft:{
        channel:'facebook',format:'text',
        title:'November med Nova och Pling – en smygtitt',
        text:'I november väntar nya magiska stunder med Nova och Pling. Vi förbereder Löv- och Skuggmånaden med skogsäventyr och aktiviteter att uppleva tillsammans. Här är en liten smygtitt på det som kommer.',
        linkUrl:null,mediaIds:[],mediaBrief:'',scheduledAt:null,
      },
    },
    {id:'instagram',label:'Hämta novemberbildförslag för Instagram',
      draft:{
        channel:'instagram',format:'image',
        title:'En smygtitt på november',
        text:'En liten smygtitt på november med Nova och Pling. Vi förbereder Löv- och Skuggmånadens magiska skog och familjeaktiviteter. Vad längtar ni efter att upptäcka tillsammans?',
        linkUrl:null,mediaIds:[],
        mediaBrief:'Välj en redan granskad novemberillustration från Familje-Stunden. Färdig bild måste granskas, registreras och kopplas med ett korrekt projektbundet media-ID före innehållsgodkännande.',
        scheduledAt:null,
      },
    },
  ]
}
