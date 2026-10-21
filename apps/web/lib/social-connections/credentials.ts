import 'server-only'
import {createAdminClient} from '@/lib/supabase/admin'
import {readActiveBinding,type SocialAccountBinding} from '@/lib/media/social-bindings'
import {expiryHealthStatus,refusalHealthStatus,type CredentialHealthVerdict} from '@/lib/media/credential-health'
import type {CredentialRefusal} from '@/lib/media/social-credentials'
import {attestDestination,providerConfig,REQUIRED_SCOPES} from './providers'
import {ConnectionError,type Provider,type Candidate} from './types'

/** Resolve only the exact current binding's private grant. Never rotate credentials. */
export async function verifyNewBindingHealth(binding:SocialAccountBinding,client?:ReturnType<typeof createAdminClient>):Promise<CredentialHealthVerdict>{
 const refused=(refusal:CredentialRefusal):CredentialHealthVerdict=>({status:refusalHealthStatus(refusal),identityVerified:false,verifiedAccountId:null,accountLabel:null,expiresAt:null,daysLeft:null,refusal})
 if(binding.platform==='x'||!['linkedin','pinterest'].includes(binding.platform))return refused('provider_unavailable')
 const provider=binding.platform as Provider
 try{
  const db=client??createAdminClient()
  const current=await readActiveBinding(binding.projectId,binding.platform,db)
  if(!current.ok)return refused('binding_unreadable')
  if(!current.binding||current.binding.bindingId!==binding.bindingId)return refused('binding_missing')
  if(current.binding.blockedAt)return refused('binding_blocked')
  const {data:token,error}=await (db as any).from('platform_tokens').select('access_token,account_id,binding_id,expires_at,granted_scopes,destination_id,destination_label')
   .eq('project_id',binding.projectId).eq('platform',provider).eq('token_type','oauth_user').maybeSingle()
  if(error)return refused('credential_unreadable')
  if(!token)return refused('credential_missing')
  if(token.binding_id!==binding.bindingId||token.account_id!==binding.externalAccountId)return refused('account_mismatch')
  const expiresAt=new Date(token.expires_at)
  if(!Number.isFinite(expiresAt.getTime())||expiresAt.getTime()<=Date.now())return refused('credential_invalid')
  if(typeof token.access_token!=='string'||!token.access_token||!Array.isArray(token.granted_scopes)||!REQUIRED_SCOPES[provider].every(s=>token.granted_scopes.includes(s)))return refused('credential_invalid')
  const config=providerConfig(provider);if(!config)return refused('provider_unavailable')
  const candidate:Candidate={key:provider==='pinterest'?token.destination_id:binding.externalAccountId,accountId:binding.externalAccountId,accountLabel:binding.accountLabel??binding.externalAccountId,destinationId:token.destination_id,destinationLabel:token.destination_label}
  if(!candidate.key||provider==='pinterest'&&!candidate.destinationId)return refused('credential_invalid')
  const attested=await attestDestination(provider,config,token.access_token,candidate)
  const latest=await readActiveBinding(binding.projectId,binding.platform,db)
  if(!latest.ok||latest.binding?.bindingId!==binding.bindingId)return refused('binding_unreadable')
  if(latest.binding.blockedAt)return refused('binding_blocked')
  const daysLeft=Math.ceil((expiresAt.getTime()-Date.now())/86400000)
  return {status:expiryHealthStatus(daysLeft),identityVerified:true,verifiedAccountId:attested.accountId,accountLabel:attested.accountLabel,expiresAt,daysLeft,refusal:null}
 }catch(error){
  return refused(error instanceof ConnectionError&&error.code==='IDENTITY_UNVERIFIED'?'account_mismatch':error instanceof ConnectionError&&['PROVIDER_DENIED','SCOPE_MISSING'].includes(error.code)?'credential_invalid':'provider_unavailable')
 }
}
