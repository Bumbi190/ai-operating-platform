import type {SocialLaunchChannelId,SocialLaunchChoice,SocialLaunchFormat,SocialLaunchReadiness,SocialLaunchReadinessInput} from './types'

export const SOCIAL_LAUNCH_CHANNELS:readonly {id:SocialLaunchChannelId;label:string;connectionAdapter:boolean;formats:readonly SocialLaunchFormat[];note:string}[]=[
 {id:'youtube',label:'YouTube',connectionAdapter:true,formats:['video'],note:'Koppla projektets kanal med Google. Anslutning ger ingen publiceringsrätt.'},
 {id:'facebook',label:'Facebook',connectionAdapter:true,formats:['text','image','video','link'],note:'Projektets egen Facebook-sida. Rätt sidbehörighet behöver verifieras.'},
 {id:'instagram',label:'Instagram',connectionAdapter:true,formats:['image','video'],note:'Ett professionellt konto med verifierade behörigheter behövs.'},
 {id:'linkedin',label:'LinkedIn',connectionAdapter:true,formats:['text','image','video','link'],note:'Främst Handlarbörsen och dess företagssida. Välj en verifierad administrerad sida efter godkänd kanalplan.'},
 {id:'x',label:'X',connectionAdapter:false,formats:['text','image','video','link'],note:'Kontokoppling, aktuellt API-pris och kostnadstak behöver verifieras före användning.'},
 {id:'pinterest',label:'Pinterest',connectionAdapter:true,formats:['image','video'],note:'Familje-Stunden är avsedd första koppling. Välj företagskonto och egen offentlig anslagstavla efter godkänd kanalplan.'},
]
export function parseSocialLaunchChoices(input:unknown):SocialLaunchChoice[]{
 if(!Array.isArray(input)||input.length>6)throw Error('INVALID_BODY')
 const seen=new Set<string>()
 const choices=input.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['channel','purpose','format','cadence'].includes(k)))throw Error('INVALID_BODY')
  const channel=SOCIAL_LAUNCH_CHANNELS.find(c=>c.id===value.channel)
  if(!channel||seen.has(channel.id)||typeof value.purpose!=='string'||!value.purpose.trim()||value.purpose.trim().length>500||/[\u0000-\u001f\u007f]/.test(value.purpose)||!channel.formats.includes(value.format)||!['manual','weekly','twice_weekly','daily'].includes(value.cadence))throw Error('INVALID_BODY')
  seen.add(channel.id)
  return {channel:channel.id,purpose:value.purpose.trim(),format:value.format,cadence:value.cadence} as SocialLaunchChoice
 })
 return choices.sort((a,b)=>SOCIAL_LAUNCH_CHANNELS.findIndex(c=>c.id===a.channel)-SOCIAL_LAUNCH_CHANNELS.findIndex(c=>c.id===b.channel))
}
export function describeSocialLaunchReadiness({channel,selected,account,now}:SocialLaunchReadinessInput):SocialLaunchReadiness{
 const entry=SOCIAL_LAUNCH_CHANNELS.find(c=>c.id===channel)!
 let connection:SocialLaunchReadiness['connection']='needs_connection'
 if(!entry.connectionAdapter)connection='adapter_unavailable'
 else if(account&&!account.readable)connection='unreadable'
 else if(account?.blocked)connection='blocked'
 else if(!account?.accountId||!account.credentialStored)connection='needs_connection'
 else if(account.health==='expired'||account.health==='warning'||account.expiresAt!==null&&(!Number.isFinite(Date.parse(account.expiresAt))||Date.parse(account.expiresAt)<=Date.parse(now)))connection='needs_renewal'
 else if(account.matchesBinding&&account.identityVerified&&account.health==='ok'&&account.checkedAt&&Number.isFinite(Date.parse(account.checkedAt)))connection='verified'
 else connection='needs_verification'
 return {channel,label:entry.label,selection:selected?'planned':'not_selected',connection,accountId:account?.readable?account.accountId:null,accountLabel:account?.readable?account.label:null,checkedAt:account?.readable?account.checkedAt:null,publicationReady:false,setupHref:'/settings',note:entry.note}
}
