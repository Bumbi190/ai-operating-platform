import type {SalesContact} from './types'
const labels:Record<string,string>={queued:'Väntar på lokal worker',running:'Förbereder utkast',needs_input:'Behöver ditt underlag',awaiting_review:'Väntar på granskning',failed:'Misslyckades',reconciling:'Behöver stämmas av',cancelled:'Avbruten'}
export function salesStatusLabel(status:string):string{return labels[status]??'Okänd status'}
export function canPrepareContact(c:SalesContact):boolean{return c.confirmed===true&&!c.excluded&&!c.suppressed&&c.history==='not_contacted'}

export function salesConnectionLabel(s:import('./host-types').HostStatus):string {
 if(s.connectionState==='revoked')return 'Anslutningen är återkallad'
 if(s.connectionState==='offline')return 'Datorn är inte ansluten just nu'
 if(!s.managed)return 'Beständig anslutning behöver tillåtas'
 if(s.desiredState==='paused'||s.executionPaused)return 'Förberedelsen är pausad'
 if(s.cliState!=='ready')return 'Specialisten behöver ses över'
 return 'Redo att förbereda utkast'
}
