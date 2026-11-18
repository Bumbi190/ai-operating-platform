import {SalesError} from './types'
type ContactTerms={offerKind?:unknown;pilotMonths?:unknown}
type OfferTerms={offerKind?:unknown;freeMonths?:unknown}
export function offerKind(value:{offerKind?:unknown}):'pilot'|'general_service'|null{
 return value.offerKind===undefined||value.offerKind==='pilot'?'pilot':value.offerKind==='general_service'?'general_service':null
}
function validTerms(value:{offerKind?:unknown},months:unknown):boolean{
 const kind=offerKind(value)
 return kind==='general_service'?months===null:kind==='pilot'&&typeof months==='number'&&[2,6,12].includes(months)
}
export function offersMatch(contact:ContactTerms,offer:OfferTerms):boolean{
 return validTerms(contact,contact.pilotMonths)&&validTerms(offer,offer.freeMonths)&&offerKind(contact)===offerKind(offer)&&contact.pilotMonths===offer.freeMonths
}
export function offerLabel(value:OfferTerms):string{
 return validTerms(value,value.freeMonths)?offerKind(value)==='general_service'?'Tjänsteerbjudande':`${value.freeMonths} månader gratis`:'Erbjudande behöver kontrolleras'
}
export function parseOfferTerms(value:Record<string,unknown>,monthField:'pilotMonths'|'freeMonths'):Record<string,unknown>{
 if(!validTerms(value,value[monthField]))throw new SalesError('INVALID_BODY')
 return {...(value.offerKind===undefined?{}:{offerKind:value.offerKind}),[monthField]:value[monthField]}
}
