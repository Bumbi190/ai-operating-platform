import 'server-only'
import type {SocialLaunchView,SocialLaunchPageModel,SocialLaunchAccount} from './types'
import {loadSettings,type SettingsChannel,type SettingsModel} from '@/lib/os/settings'
import {SOCIAL_LAUNCH_CHANNELS,describeSocialLaunchReadiness} from './catalog'
function account(c:SettingsChannel|undefined):SocialLaunchAccount{
 const bound=c?.account.state==='bound'?c.account.bound:null
 return {readable:!!c&&c.account.state!=='unreadable'&&c.credential.state!=='unreadable'&&c.health.readable,accountId:bound?.externalAccountId??null,label:bound?.label??null,blocked:bound?.blocked??false,credentialStored:c?.credential.state==='stored'||c?.credential.state==='environment_transitional',matchesBinding:c?.credential.matchesBinding===true,identityVerified:c?.health.identityVerified===true,health:c?.health.status??'unknown',checkedAt:c?.health.checkedAt??null,expiresAt:c?.health.expiresAt??c?.credential.expiresAt??null}
}
export function assembleSocialLaunchPage(plan:SocialLaunchView,settings:SettingsModel|null,now:string):SocialLaunchPageModel{
 const project=settings?.projects.state==='ok'?settings.projects.items.find(p=>p.id===plan.project.id):undefined
 return {plan,channels:SOCIAL_LAUNCH_CHANNELS.map(c=>({...describeSocialLaunchReadiness({channel:c.id,selected:!!plan.currentRevision?.choices.some(choice=>choice.channel===c.id),account:account(project?.channels.find(channel=>channel.id===c.id)),now}),setupHref:'/settings#settings-project-'+plan.project.id}))}
}
export async function loadSocialLaunchPage(plan:SocialLaunchView):Promise<SocialLaunchPageModel>{
 let settings:SettingsModel|null=null
 try{settings=await loadSettings()}catch{/* Metadata failure remains unreadable; no provider fallback. */}
 return assembleSocialLaunchPage(plan,settings,new Date().toISOString())
}
