import {it,expect,vi,afterEach} from 'vitest'
import {connectionCards} from './readiness'
afterEach(()=>vi.unstubAllEnvs())
it('uses safe canonical metadata and exact health identity only',()=>{
 const row={provider:'pinterest',bindingId:'binding',accountId:'account',accountLabel:'Familj',blocked:false,credentialStored:true,matchesBinding:true,expiresAt:'2027-01-01T00:00:00Z',destinationId:'board',destinationLabel:'Aktiviteter',health:{status:'ok',identityVerified:true,bindingId:'binding',accountId:'account',checkedAt:'2026-10-16T00:00:00Z'}}
 const cards=connectionCards([row],true),p=cards.find(c=>c.provider==='pinterest')!
 expect(p.bindingId).toBe('binding');expect(p.account.identityVerified).toBe(true);expect(p.destinationLabel).toBe('Aktiviteter')
 expect(connectionCards([{...row,health:{...row.health,bindingId:'old'}}],true).find(c=>c.provider==='pinterest')!.account.identityVerified).toBe(false)
 expect(JSON.stringify(cards)).not.toMatch(/accessToken|clientSecret|verifier/)
})
it('keeps configuration, operator and X cost gates separate',()=>{
 vi.stubEnv('LINKEDIN_CLIENT_ID','fixture');vi.stubEnv('LINKEDIN_CLIENT_SECRET','private-fixture')
 const cards=connectionCards([],false)
 expect(cards).toHaveLength(3);expect(cards.find(c=>c.provider==='linkedin')!.setup.reason).toBe('ready')
 expect(cards.every(c=>!c.canOperate)).toBe(true);expect(cards.find(c=>c.provider==='x')!.setup.reason).toBe('cost_policy_required')
 expect(connectionCards(null,true).every(c=>!c.account.readable)).toBe(true)
})
