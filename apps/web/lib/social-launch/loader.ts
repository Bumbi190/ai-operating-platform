import 'server-only'
import type {SocialLaunchView,SocialLaunchPageModel,SocialLaunchAccount} from './types'
import {loadSettings,type SettingsChannel,type SettingsModel} from '@/lib/os/settings'
import {createAdminClient} from '@/lib/supabase/admin'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {readConnectionMetadata,readConnection} from '@/lib/social-connections/store'
import {connectionCards} from '@/lib/social-connections/readiness'
import type {SocialLaunchPrincipal} from './types'
import {SOCIAL_LAUNCH_CHANNELS,describeSocialLaunchReadiness} from './catalog'
function account(c:SettingsChannel|undefined):SocialLaunchAccount{
 const bound=c?.account.state==='bound'?c.account.bound:null
 return {readable:!!c&&c.account.state!=='unreadable'&&c.credential.state!=='unreadable'&&c.health.readable,accountId:bound?.externalAccountId??null,label:bound?.label??null,blocked:bound?.blocked??false,credentialStored:c?.credential.state==='stored'||c?.credential.state==='environment_transitional',matchesBinding:c?.credential.matchesBinding===true,identityVerified:c?.health.identityVerified===true,health:c?.health.status??'unknown',checkedAt:c?.health.checkedAt??null,expiresAt:c?.health.expiresAt??c?.credential.expiresAt??null}
}
export function assembleSocialLaunchPage(plan:SocialLaunchView,settings:SettingsModel|null,now:string):SocialLaunchPageModel{
 const project=settings?.projects.state==='ok'?settings.projects.items.find(p=>p.id===plan.project.id):undefined
 return {plan,channels:SOCIAL_LAUNCH_CHANNELS.map(c=>({...describeSocialLaunchReadiness({channel:c.id,selected:!!plan.currentRevision?.choices.some(choice=>choice.channel===c.id),account:account(project?.channels.find(channel=>channel.id===c.id)),now}),setupHref:'/settings#settings-project-'+plan.project.id}))}
}
export async function loadSocialLaunchPage(plan:SocialLaunchView,context?:{principal:SocialLaunchPrincipal;db:ReturnType<typeof createAdminClient>;intentId?:string}):Promise<SocialLaunchPageModel>{
 let settings:SettingsModel|null=null
 try{settings=await loadSettings()}catch{/* Metadata failure remains unreadable; no provider fallback. */}
 const now=new Date().toISOString(),model=assembleSocialLaunchPage(plan,settings,now)
 if(!context)return model
 let metadata:unknown=null,operator=false
 try{const actor=await resolvePlatformOperator();operator=actor.ok&&actor.userId===context.principal.userId&&actor.actor==='user:'+context.principal.userId;metadata=await readConnectionMetadata(context.db,context.principal,plan.project.id)}catch{/* Fail closed without provider calls. */}
 model.connections=connectionCards(metadata,operator)
 model.channels=model.channels.map(c=>{const card=model.connections!.find(n=>n.provider===c.channel);return card?describeSocialLaunchReadiness({channel:c.channel,selected:c.selection==='planned',account:card.account,now}):c})
 if(context.intentId&&operator){try{model.connectionIntent=await readConnection(context.db,context.principal,{projectId:plan.project.id,intentId:context.intentId})}catch{model.connectionNotice='Kontovalet har gått ut eller ändrats. Starta anslutningen igen.'}}
 return model
}
