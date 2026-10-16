import 'server-only'
import {connectionSetup} from './providers'
import type {Provider,SocialConnectionCard} from './types'
const text=(v:unknown)=>typeof v==='string'?v:null
/** Consumes the safe metadata RPC only. No credential or environment values leave this module. */
export function connectionCards(rows:unknown,operator:boolean):SocialConnectionCard[]{
 return (['linkedin','pinterest','x'] as Provider[]).map(provider=>{
  const row=Array.isArray(rows)?rows.find(r=>r?.provider===provider):null,h=row?.health
  const bindingId=text(row?.bindingId),accountId=text(row?.accountId)
  const identityVerified=!!bindingId&&!!accountId&&h?.identityVerified===true&&h.bindingId===bindingId&&h.accountId===accountId
  return {provider,bindingId,destinationId:text(row?.destinationId),destinationLabel:text(row?.destinationLabel),canOperate:operator,setup:connectionSetup(provider),
   account:{readable:!!row,accountId,label:text(row?.accountLabel),blocked:row?.blocked===true,credentialStored:row?.credentialStored===true,matchesBinding:row?.matchesBinding===true,
    identityVerified,health:identityVerified?text(h?.status)??'unknown':h?.status==='ok'?'unknown':text(h?.status)??'unknown',checkedAt:identityVerified?text(h?.checkedAt):null,expiresAt:text(row?.expiresAt)}}
 })
}
