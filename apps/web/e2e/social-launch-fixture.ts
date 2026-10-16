import {SOCIAL_LAUNCH_CHANNELS,describeSocialLaunchReadiness} from '../lib/social-launch/catalog'
import type {SocialLaunchPageModel} from '../lib/social-launch/types'
export function socialFixture(id='10000000-0000-4000-8000-000000000001'):SocialLaunchPageModel{
 return {plan:{project:{id,name:id.endsWith('1')?'Familje-Stunden':'Handlarbörsen',slug:'social-'+id},currentRevision:null,decision:null,workspaceUrl:'/projects/social-'+id+'/social'},channels:SOCIAL_LAUNCH_CHANNELS.map(c=>describeSocialLaunchReadiness({channel:c.id,selected:false,account:null,now:'2026-10-16T00:00:00Z'}))}
}
