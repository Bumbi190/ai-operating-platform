const labels:Record<string,string>={RULE_REVIEW_REQUIRED:'Kontaktregel behöver granskas',HISTORY_REVIEW_REQUIRED:'Historik behöver stämmas av',CONTACT_UNCONFIRMED:'Kontakten är inte bekräftad',CONTACT_SUPPRESSED:'Kontaktspärr',CONTACT_EXCLUDED:'Exkluderad från piloten',RECIPIENT_STOPPED:'Mottagaren ska avvaktas',PROJECT_PAUSED:'Projektet är pausat',SOURCE_STALE:'Källorna behöver uppdateras',SOURCE_GAP:'Historiken har luckor',SOURCE_CHANGED:'Underlaget har ändrats',EVENT_CLASSIFICATION_REQUIRED:'Ett mejl behöver klassificeras',INVITATION_UNRESOLVED:'Tidigare inbjudan behöver granskas',DUPLICATE_UNRESOLVED:'Möjlig dubbelregistrering behöver granskas',SEND_PENDING:'En sändning behöver stämmas av',SEND_UNCERTAIN:'Tidigare sändning är osäker',REPLY_REVIEW_REQUIRED:'Ett svar behöver granskas',REMINDER_LIMIT:'Påminnelse redan skickad',WAIT_INTERVAL:'Väntetiden har inte passerat',NOT_INITIAL_CONTACT:'Tidigare kontakt registrerad'}
export function timingBlockerLabel(code:string):string{return labels[code]??'Underlaget behöver granskas'}
export function formatTimingInstant(value:string):string{
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return 'Okänt'
 const text=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(date)
 const zone=new Intl.DateTimeFormat('en',{timeZone:'Europe/Stockholm',timeZoneName:'longOffset'}).formatToParts(date).find(p=>p.type==='timeZoneName')?.value.replace('GMT','UTC')
 return text+' '+zone
}
