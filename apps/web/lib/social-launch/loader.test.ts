import {it,expect,vi} from 'vitest'
import {assembleSocialLaunchPage} from './loader'
import type {SettingsModel} from '@/lib/os/settings'
vi.mock('@/lib/os/settings',()=>({loadSettings:async()=>null}))
const plan={project:{id:'p1',name:'Family',slug:'family'},currentRevision:null,decision:null,workspaceUrl:'/projects/family/social'}
it('refuses unreadable or another project metadata as connection evidence',()=>{
 for(const settings of [null,{projects:{state:'error'}},{projects:{state:'ok',items:[{id:'other',channels:[]}]}}]){
  const m=assembleSocialLaunchPage(plan,settings as SettingsModel|null,'2026-10-16T00:00:00Z')
  expect(m.channels.find(c=>c.channel==='youtube')?.connection).toBe('unreadable')
 }
})
it('uses only matching project binding and health and keeps publication disabled',()=>{
 const channel={id:'instagram',account:{state:'bound',bound:{externalAccountId:'ig123',label:'Familjen',blocked:false}},credential:{state:'stored',matchesBinding:true,expiresAt:null},health:{readable:true,status:'ok',identityVerified:true,checkedAt:'2026-10-15T00:00:00Z',expiresAt:null}}
 const settings={projects:{state:'ok',items:[{id:'p1',channels:[channel]}]}} as unknown as SettingsModel
 const m=assembleSocialLaunchPage(plan,settings,'2026-10-16T00:00:00Z'),ig=m.channels.find(c=>c.channel==='instagram')!
 expect(ig.connection).toBe('verified');expect(ig.accountLabel).toBe('Familjen');expect(ig.publicationReady).toBe(false);expect(ig.setupHref).toBe('/settings#settings-project-p1')
 channel.health.readable=false;expect(assembleSocialLaunchPage(plan,settings,'2026-10-16T00:00:00Z').channels.find(c=>c.channel==='instagram')?.connection).toBe('unreadable')
})
