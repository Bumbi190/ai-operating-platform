import {beforeAll,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {initializeConnectionDb} from './test-db'
import {testSql,TEST_PRINCIPAL} from '../website-build/test-db'
import {proposeSocialLaunchPlan,decideSocialLaunchPlan} from '../social-launch/store'
import {beginConnection,consumeConnection,stageConnection,commitConnection,readConnectionMetadata} from './store'
import {readActiveBinding} from '../media/social-bindings'
import {verifyNewBindingHealth} from './credentials'
const provider=vi.hoisted(()=>({attest:vi.fn(async()=>({key:'123',accountId:'123',accountLabel:'Aktuellt sidnamn',destinationId:null,destinationLabel:null}))}))
vi.mock('./providers',async importOriginal=>({...await importOriginal<typeof import('./providers')>(),providerConfig:()=>({clientId:'fixture',clientSecret:'private-fixture'}),attestDestination:provider.attest}))
let db:ReturnType<typeof initializeConnectionDb>
beforeAll(()=>{db=initializeConnectionDb()},15000)
async function bound(){
 const projectId=randomUUID(),p={...TEST_PRINCIPAL,allowedProjectIds:[projectId]},id=String(Date.now())+String(Math.floor(Math.random()*100000))
 testSql("insert into projects(id,owner_id,name,slug) values('"+projectId+"','"+p.userId+"','Handlarbörsen','health-"+projectId+"');")
 const plan=await proposeSocialLaunchPlan(db,p,{projectId,expectedRevisionId:null,idempotencyKey:randomUUID(),choices:[{channel:'linkedin',purpose:'B2B',format:'link',cadence:'weekly'}]})
 await decideSocialLaunchPlan(db,p,{projectId,revisionId:plan.currentRevision!.id,sha256:plan.currentRevision!.sha256,decision:'approve',idempotencyKey:randomUUID()})
 const stateHash=randomUUID().replaceAll('-','').repeat(2),intent=await beginConnection(db,p,{projectId,provider:'linkedin',planRevisionId:plan.currentRevision!.id,expectedBindingId:null,stateHash,verifier:'v'.repeat(43)})
 await consumeConnection(db,p,{provider:'linkedin',stateHash});await stageConnection(db,p,{intentId:intent.intentId,grant:{accessToken:'private-health-access',refreshToken:null,scopes:['r_organization_admin','w_organization_social'],expiresAt:new Date(Date.now()+30*86400000).toISOString(),refreshExpiresAt:null,candidates:[{key:id,accountId:id,accountLabel:'Sidnamn',destinationId:null,destinationLabel:null}]}})
 const result=await commitConnection(db,p,{projectId,intentId:intent.intentId,candidateKey:id}),read=await readActiveBinding(projectId,'linkedin',db)
 if(!read.ok||!read.binding)throw Error('No fixture binding')
 return {p,projectId,binding:read.binding,id}
}
it('verifies the exact stored grant and uses provider-attested current name',async()=>{
 const f=await bound();provider.attest.mockResolvedValueOnce({key:f.id,accountId:f.id,accountLabel:'Aktuellt sidnamn',destinationId:null,destinationLabel:null})
 const result=await verifyNewBindingHealth(f.binding,db)
 expect(result.identityVerified).toBe(true);expect(result.verifiedAccountId).toBe(f.id);expect(result.accountLabel).toBe('Aktuellt sidnamn')
 const safe=await readConnectionMetadata(db,f.p,f.projectId);expect(JSON.stringify(safe)).not.toContain('private-health-access')
})
it('does not probe expired or mismatched canonical credentials',async()=>{
 const f=await bound();provider.attest.mockClear()
 testSql("update platform_tokens set expires_at=now()-interval '1 second' where project_id='"+f.projectId+"';")
 expect((await verifyNewBindingHealth(f.binding,db)).status).toBe('expired');expect(provider.attest).not.toHaveBeenCalled()
 testSql("update platform_tokens set expires_at=now()+interval '1 hour',account_id='other-account' where project_id='"+f.projectId+"';")
 expect((await verifyNewBindingHealth(f.binding,db)).identityVerified).toBe(false);expect(provider.attest).not.toHaveBeenCalled()
})
it('denies X health before database or provider work',async()=>{
 provider.attest.mockClear()
 const broken={from:()=>{throw Error('Database must not be touched')}} as unknown as typeof db
 expect((await verifyNewBindingHealth({platform:'x'} as any,broken)).identityVerified).toBe(false);expect(provider.attest).not.toHaveBeenCalled()
})
