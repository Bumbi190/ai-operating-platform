import {socialFixture} from './social-launch-fixture'
import type {SocialLaunchPageModel} from '../lib/social-launch/types'
import type {SocialConnectionCard,Provider} from '../lib/social-connections/types'
export function connectionFixture(mode='select',id?:string):SocialLaunchPageModel{
 const model=socialFixture(id),projectId=model.plan.project.id
 model.plan.currentRevision={id:'30000000-0000-4000-8000-000000000001',sequence:1,sha256:'a'.repeat(64),createdAt:'2026-10-16T00:00:00Z',choices:[{channel:'pinterest',purpose:'Familjeaktiviteter',format:'image',cadence:'weekly'}]}
 if(mode!=='unapproved')model.plan.decision={id:'40000000-0000-4000-8000-000000000001',revisionId:model.plan.currentRevision.id,sha256:'a'.repeat(64),decision:'approve',decidedAt:'2026-10-16T00:00:00Z'}
 model.connections=(['linkedin','pinterest','x'] as Provider[]).map(provider=>({provider,bindingId:null,destinationId:null,destinationLabel:null,canOperate:true,setup:{provider,configured:mode!=='missing',reason:provider==='x'?'cost_policy_required':mode==='missing'?'app_configuration_missing':'ready',consoleUrl:'https://developers.pinterest.com/apps/',callbackUrl:'https://app.omniraos.se/api/social-connections/'+provider+'/callback'},account:{readable:true,accountId:null,label:null,blocked:false,credentialStored:false,matchesBinding:false,identityVerified:false,health:'unknown',checkedAt:null,expiresAt:null}} satisfies SocialConnectionCard))
 if(mode==='select')model.connectionIntent={intentId:'50000000-0000-4000-8000-000000000001',projectId,provider:'pinterest',status:'awaiting_selection',bindingId:null,selectedKey:null,expiresAt:'2027-01-01T00:00:00Z',candidates:[{key:'board1',accountId:'account',accountLabel:'Familje-Stunden',destinationId:'board1',destinationLabel:'Aktiviteter'},{key:'board2',accountId:'account',accountLabel:'Familje-Stunden',destinationId:'board2',destinationLabel:'Recept'}]}
 return model
}
