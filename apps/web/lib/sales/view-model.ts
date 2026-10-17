import type {SalesContact} from './types'
const labels:Record<string,string>={queued:'Väntar på lokal worker',running:'Förbereder utkast',needs_input:'Behöver ditt underlag',awaiting_review:'Väntar på granskning',failed:'Misslyckades',reconciling:'Behöver stämmas av',cancelled:'Avbruten'}
export function salesStatusLabel(status:string):string{return labels[status]??'Okänd status'}
export function canPrepareContact(c:SalesContact):boolean{return c.confirmed===true&&!c.excluded&&!c.suppressed&&c.history==='not_contacted'}
